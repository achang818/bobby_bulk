import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { defaultPreferences } from '../domain/preferences'
import { generateRecommendedWorkout } from '../domain/recommended-workout'
import { deriveTrainingState, exerciseTrainingState, muscleTrainingState } from '../domain/training-state'
import { completeWorkoutSession, createWorkoutSession } from '../domain/workout-session'
import { generateRecommendations } from '../domain/recommendations'
import type { Exercise, LoggedSet, Workout, WorkoutTemplate } from '../domain/models'

// Independent muscles make changes in allocation observable without catalogue overlap.
const muscles = ['Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Abs', 'Calves']
const catalog: Exercise[] = muscles.map((muscle, index) => ({ ...exercises.find((exercise) => exercise.id === 'dumbbell-curl')!,
  id: `movement-${index}`, name: `${muscle} movement`, primaryMuscles: [muscle], secondaryMuscles: [], defaultSets: 3, repRange: { min: 8, max: 12 },
}))
const preferences = { ...defaultPreferences, goals: ['Build muscle'] as const, priorities: muscles }
const context = { gymId: 'gym', availableEquipment: ['dumbbells'] as const, unavailableEquipment: [] }
function generate(history: Workout[] = [], asOf = '2026-09-16', availableMinutes?: number) {
  return generateRecommendedWorkout({ exercises: catalog, history, asOf, preferences: { ...preferences, goals: [...preferences.goals] }, todaysContext: { ...context, availableEquipment: [...context.availableEquipment], availableMinutes } })
}
function working(exerciseId: string, count = 1, weight = 20, reps = 12): LoggedSet[] {
  return Array.from({ length: count }, (_, index) => ({ id: `${exerciseId}-${index}`, exerciseId, setType: 'working', weight, reps }))
}
function finish(plan: WorkoutTemplate, date: string, performed: LoggedSet[]): Workout {
  return { ...completeWorkoutSession({ ...createWorkoutSession(plan, undefined, 'lb'), sets: performed }), id: date, date, startedAt: `${date}T10:00:00Z`, completedAt: `${date}T11:00:00Z` }
}

describe('closed-loop recommended workouts', () => {
  it('changes tomorrow after completion and returns recovered exercises with demonstrated loads later', () => {
    const today = generate()
    expect(today.workout.plannedExercises!.length).toBeGreaterThanOrEqual(3)
    const completed = finish(today.workout, '2026-09-16', today.workout.plannedExercises!.flatMap((slot) => working(slot.exerciseId, slot.sets)))
    const before = structuredClone(completed)
    const draft = { ...completed, status: 'in-progress' as const }
    expect(generate([draft], '2026-09-17')).toEqual(generate([], '2026-09-17'))
    const tomorrow = generate([completed], '2026-09-17')
    expect(tomorrow.workout.exerciseIds.length).toBeGreaterThan(0)
    for (const id of today.workout.exerciseIds) expect(tomorrow.workout.exerciseIds).not.toContain(id)
    const state = deriveTrainingState(catalog, [completed], '2026-09-17')
    for (const id of today.workout.exerciseIds) {
      const muscle = catalog.find((exercise) => exercise.id === id)!.primaryMuscles[0]
      expect(muscleTrainingState(state, muscle).recovery).toBe('recently-trained')
    }
    const later = generate([completed], '2026-09-19')
    const returning = later.workout.plannedExercises!.filter((slot) => today.workout.exerciseIds.includes(slot.exerciseId))
    expect(returning.length).toBeGreaterThan(0)
    expect(returning.every((slot) => slot.loadRecommendation?.kind === 'target' && slot.loadRecommendation.weight === 22.5)).toBe(true)
    expect(completed).toEqual(before)
  })

  it('raises an undertrained priority above a recently supplied higher priority', () => {
    expect(generate([], '2026-09-16', 10).targetMuscles).toEqual(['Biceps'])
    const plan = generate().workout
    const history = ['2026-09-10', '2026-09-13'].map((date) => finish(plan, date, working(catalog[0].id, 4)))
    // Biceps is recovered and still below its 3-session guidance; it is not vetoed.
    expect(muscleTrainingState(deriveTrainingState(catalog, history, '2026-09-16'), 'Biceps')).toMatchObject({ recovery: 'available', frequency7Days: 2 })
    expect(generate(history, '2026-09-16', 10).targetMuscles).toEqual(['Triceps'])
    const next = finish(generate(history).workout, '2026-09-16', working(catalog[1].id, 4))
    expect(generate([...history, next], '2026-09-17', 10).targetMuscles).not.toContain('Triceps')
  })

  it('counts only logged working sets, leaving skipped prescriptions available tomorrow', () => {
    const today = generate()
    const slot = today.workout.plannedExercises![0]
    const skipped = today.workout.plannedExercises![1]
    const partial = finish(today.workout, '2026-09-16', [
      ...working(slot.exerciseId),
      ...(['warm-up', 'drop', 'failure'] as const).map((setType) => ({ ...working(skipped.exerciseId)[0], id: setType, setType, weight: 999 })),
      { ...working(skipped.exerciseId)[0], id: 'zero-reps', reps: 0 },
    ])
    const state = deriveTrainingState(catalog, [partial], '2026-09-17')
    expect(exerciseTrainingState(state, slot.exerciseId).mostRecentPerformance).toMatchObject({ completedWorkingSets: 1, completion: 'partial' })
    expect(muscleTrainingState(state, catalog.find((exercise) => exercise.id === slot.exerciseId)!.primaryMuscles[0]).rolling7DaySets).toBe(1)
    expect(exerciseTrainingState(state, skipped.exerciseId).sessionsPerformed).toBe(0)
    const skippedMuscle = catalog.find((exercise) => exercise.id === skipped.exerciseId)!.primaryMuscles[0]
    expect(muscleTrainingState(state, skippedMuscle)).toMatchObject({ rolling7DaySets: 0, frequency7Days: 0, recovery: 'unknown' })
    const tomorrow = generate([partial], '2026-09-17')
    expect(tomorrow.workout.exerciseIds).toContain(skipped.exerciseId)
    expect(tomorrow.workout.exerciseIds).not.toContain(slot.exerciseId)
  })

  it('handles no history and legacy sessions without manufacturing prescriptions or completion', () => {
    const empty = deriveTrainingState(catalog, [], '2026-09-16')
    expect(empty.muscles.every((muscle) => muscle.recovery === 'unknown' && muscle.historyConfidence === 'none')).toBe(true)
    expect(generate().workout.plannedExercises!.every((slot) => slot.loadRecommendation?.kind === 'choose-load')).toBe(true)
    const legacy: Workout = { id: 'legacy', date: '2026-09-13', title: 'Old workout', sets: working(catalog[0].id) }
    const state = deriveTrainingState(catalog, [legacy], '2026-09-16')
    expect(exerciseTrainingState(state, catalog[0].id).mostRecentPerformance).toMatchObject({ completedWorkingSets: 1, completion: 'unplanned' })
    expect(exerciseTrainingState(state, catalog[0].id).mostRecentPerformance?.plannedSets).toBeUndefined()
    const next = generate([legacy]).workout.plannedExercises!.find((slot) => slot.exerciseId === catalog[0].id)!
    expect(next.loadRecommendation).toMatchObject({ kind: 'target', weight: 22.5 })
  })

  it('uses only direct exercise evidence for load and primary-muscle exposure', () => {
    const compound = { ...catalog[0], secondaryMuscles: ['Triceps'] }
    const record = finish(generate().workout, '2026-09-13', working(compound.id, 1, 40))
    const state = deriveTrainingState([compound, catalog[1]], [record], '2026-09-16')
    expect(muscleTrainingState(state, 'Triceps').rolling7DaySets).toBe(0)
    expect(exerciseTrainingState(state, catalog[1].id).mostRecentPerformance).toBeUndefined()
    expect(exerciseTrainingState(state, compound.id).mostRecentPerformance?.heaviestWorkingWeight).toBe(40)
  })

  it('is deterministic across history order, normalizes units, and excludes future and malformed evidence', () => {
    const older = finish(generate().workout, '2026-09-10', working(catalog[0].id, 1, 20, 8))
    const newer = { ...finish(generate().workout, '2026-09-13', working(catalog[0].id, 1, 10, 8)), unit: 'kg' as const }
    const ignored = [
      { ...older, id: 'future', date: '2026-09-20' }, { ...older, id: 'bad-date', date: 'invalid' },
      { ...older, id: 'invalid-calendar-date', date: '2026-02-30' },
      { ...older, id: 'draft', status: 'in-progress' as const },
      { ...older, id: 'invalid-set', sets: [{ ...working(catalog[0].id)[0], weight: NaN }] },
      { ...older, id: 'unknown', sets: working('removed-catalog-id') },
    ]
    const state = deriveTrainingState(catalog, [older, newer], '2026-09-16')
    const withIgnored = deriveTrainingState(catalog, [newer, ...ignored, older], '2026-09-16')
    expect(withIgnored.exercises).toEqual(state.exercises)
    expect(withIgnored.muscles).toEqual(state.muscles)
    // A saved prescription remains reviewable even when its sets cannot establish training evidence.
    expect(withIgnored.outcomes.find((item) => item.sessionId === 'invalid-set')?.workingSets).toBe(0)
    expect(exerciseTrainingState(state, catalog[0].id).mostRecentPerformance?.heaviestWorkingWeight).toBeCloseTo(22, 0)
    expect(generate([newer, older])).toEqual(generate([older, ...ignored, newer]))
    expect(muscleTrainingState(state, 'Biceps')).toMatchObject({ rolling7DaySets: 2, frequency7Days: 2, rolling14DaySets: 2, rolling28DaySets: 2 })
  })

  it('keeps user-owned plans unchanged while recomputing training opportunities', () => {
    const plan: WorkoutTemplate = { ...generate().workout, id: 'my-plan', planningAuthority: 'user-plan' }
    const original = structuredClone(plan)
    const completed = finish(plan, '2026-09-16', working(plan.exerciseIds[0]))
    generate([completed], '2026-09-17')
    generateRecommendations({ plan, exercises: catalog, history: [completed], preferences: { ...preferences, goals: [...preferences.goals] }, todaysContext: { ...context, availableEquipment: [...context.availableEquipment] }, authority: 'user-plan', asOf: '2026-09-17' })
    expect(plan).toEqual(original)
    expect(createWorkoutSession(plan).plannedExercises).toEqual(original.plannedExercises)
  })
})
