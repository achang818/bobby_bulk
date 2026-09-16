import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { defaultPreferences } from '../domain/preferences'
import { generateRecommendedWorkout, skipRecommendedExercise, type RecommendedWorkoutInput } from '../domain/recommended-workout'
import { createWorkoutSession } from '../domain/workout-session'
import type { Exercise } from '../domain/models'

const curl = exercises.find((exercise) => exercise.id === 'dumbbell-curl')!
const alternative: Exercise = { ...curl, id: 'alternative', name: 'Alternative curl', repRange: { min: 10, max: 15 } }
const nextAlternative: Exercise = { ...alternative, id: 'next-alternative', name: 'Next curl' }
const input = (overrides: Partial<RecommendedWorkoutInput> = {}): RecommendedWorkoutInput => ({
  exercises: [curl, alternative, nextAlternative, ...exercises.filter((exercise) => !exercise.primaryMuscles.includes('Biceps'))],
  history: [], preferences: { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Biceps'], preferredExerciseIds: [curl.id] },
  todaysContext: { gymId: 'home', availableEquipment: ['dumbbells'], unavailableEquipment: [] }, asOf: '2026-09-16', ...overrides,
})

describe('unavailable exercises in the recommended preview', () => {
  it('replaces only the requested slot, preserves time/set budgets, and snapshots the revised workout', () => {
    const request = input({ todaysContext: { gymId: 'home', availableEquipment: ['dumbbells'], unavailableEquipment: [], availableMinutes: 30 } })
    const before = structuredClone(request)
    const original = generateRecommendedWorkout(request)
    expect(original.workout.exerciseIds).toContain(curl.id)
    const result = skipRecommendedExercise(request, original, curl.id)
    const slot = original.workout.plannedExercises!.find((item) => item.exerciseId === curl.id)!
    expect(result.recommendation.workout.plannedExercises!.find((item) => item.exerciseId === alternative.id)).toMatchObject({ sets: slot.sets, order: slot.order, repRange: alternative.repRange, loadRecommendation: { kind: 'choose-load' } })
    for (const item of original.workout.plannedExercises!.filter((item) => item !== slot)) expect(result.recommendation.workout.plannedExercises).toContainEqual(item)
    expect(result.message).toContain(`Switched ${curl.name} to ${alternative.name}`)
    expect(createWorkoutSession(result.recommendation.workout).plannedExercises).toEqual(result.recommendation.workout.plannedExercises)
    expect(request).toEqual(before)
    expect(original.workout.exerciseIds).toContain(curl.id)
  })

  it('does not recycle skipped or already selected exercises when skipping repeatedly', () => {
    const request = input()
    let current = generateRecommendedWorkout(request)
    const skipped: string[] = []
    for (const id of [curl.id, alternative.id, nextAlternative.id]) {
      skipped.push(id)
      const result = skipRecommendedExercise(request, current, id, skipped)
      current = result.recommendation
      for (const rejected of skipped) expect(current.workout.exerciseIds).not.toContain(rejected)
      expect(new Set(current.workout.exerciseIds).size).toBe(current.workout.exerciseIds.length)
      if (id === nextAlternative.id) expect(result.message).toContain('No suitable alternative')
    }
    expect(current.workout.exerciseIds.length).toBeGreaterThan(0)
  })

  it.each(['equipment', 'excluded', 'recovery', 'goal', 'duplicate'] as const)('rejects alternatives blocked by %s', (constraint) => {
    const blocked: Exercise = { ...alternative,
      ...(constraint === 'equipment' ? { equipment: 'Cable' } : {}),
      ...(constraint === 'recovery' ? { primaryMuscles: ['Biceps', 'Lats'] } : {}),
      ...(constraint === 'goal' ? { goals: [] } : {}),
    }
    const request = input({ exercises: [curl, blocked],
      ...(constraint === 'excluded' ? { preferences: { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Biceps'], preferredExerciseIds: [curl.id], excludedExerciseIds: [blocked.id] } } : {}),
      ...(constraint === 'recovery' ? { history: [{ id: 'recent', title: 'Pull', date: '2026-09-16', sets: [{ id: 's', exerciseId: 'lat-pulldown', setType: 'working', weight: 50, reps: 8 }] }], exercises: [curl, blocked, exercises.find((exercise) => exercise.id === 'lat-pulldown')!] } : {}),
    })
    const original = generateRecommendedWorkout(request)
    if (constraint === 'duplicate') {
      original.workout.exerciseIds.push(blocked.id)
      original.workout.plannedExercises!.push({ ...original.workout.plannedExercises![0], exerciseId: blocked.id, order: 1 })
    }
    const result = skipRecommendedExercise(request, original, curl.id)
    expect(result.message).toContain('No suitable alternative')
    expect(result.recommendation.workout.exerciseIds.filter((id) => id === blocked.id)).toHaveLength(constraint === 'duplicate' ? 1 : 0)
    expect(result.recommendation.workout.exerciseIds).not.toContain(curl.id)
    expect(result.recommendation.reasons.join(' ')).not.toContain(curl.name)
    expect(result.recommendation.sessionNote).toBeDefined()
  })

  it('uses the replacement history for its load instead of carrying over the rejected load', () => {
    const request = input({ history: [{ id: 'old', title: 'Curls', date: '2026-09-10', unit: 'kg', sets: Array.from({ length: 5 }, (_, i) => ({ id: String(i), exerciseId: alternative.id, setType: 'working', weight: 10, reps: 15 })) }] })
    const original = generateRecommendedWorkout(request)
    const result = skipRecommendedExercise(request, original, curl.id)
    const replacement = result.recommendation.workout.plannedExercises!.find((slot) => slot.exerciseId === alternative.id)!
    expect(replacement.loadRecommendation).toMatchObject({ kind: 'target', unit: 'lb' })
    if (replacement.loadRecommendation?.kind === 'target') expect(replacement.loadRecommendation.weight).toBeGreaterThan(22)
  })
})
