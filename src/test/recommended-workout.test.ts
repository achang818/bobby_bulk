import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { defaultPreferences } from '../domain/preferences'
import { generateRecommendedWorkout } from '../domain/recommended-workout'
import { createWorkoutSession } from '../domain/workout-session'
import type { TodaysContext, UserPreferences, Workout, WorkoutTemplate } from '../domain/models'

const asOf = '2026-09-12'
const context = (overrides: Partial<TodaysContext> = {}): TodaysContext => ({ gymId: 'default-gym', unavailableEquipment: [], ...overrides })
const preferences = (overrides: Partial<UserPreferences> = {}): UserPreferences => ({ ...defaultPreferences, goals: ['Build muscle'], ...overrides })
const generated = (overrides: Partial<Parameters<typeof generateRecommendedWorkout>[0]> = {}) => generateRecommendedWorkout({ exercises, history: [], preferences: preferences(), todaysContext: context(), asOf, ...overrides })

const latsSession = (date = asOf): Workout => ({
  id: `lats-${date}`,
  date,
  title: 'Pull',
  status: 'completed',
  sets: [{ id: 'lat-set', exerciseId: 'lat-pulldown', setType: 'working', weight: 100, reps: 8 }],
})

describe('Recommended Workout generation', () => {
  it('works without a user-created plan or split and returns an executable session', () => {
    const recommendation = generated()
    const session = createWorkoutSession(recommendation.workout)

    expect(recommendation.authority).toBe('recommended')
    expect(recommendation.workout.planningAuthority).toBe('recommended')
    expect(recommendation.workout.plannedExercises).not.toHaveLength(0)
    expect(session.planningAuthority).toBe('recommended')
    expect(session.plannedExercises).toEqual(recommendation.workout.plannedExercises)
    expect(session.plannedExercises?.every((exercise) => exercise.setType === 'working' && exercise.sets > 0)).toBe(true)
  })

  it('uses the highest explicit muscle priority before goal-derived defaults', () => {
    const recommendation = generated({ preferences: preferences({ goals: ['Aesthetic physique'], priorities: ['Abs'] }) })
    const selected = recommendation.workout.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)!)

    expect(recommendation.targetMuscles[0]).toBe('Abs')
    expect(selected.some((exercise) => exercise.primaryMuscles.includes('Abs'))).toBe(true)
  })

  it('does not target a muscle again when it has direct working work today', () => {
    const recommendation = generated({ history: [latsSession()], preferences: preferences({ priorities: ['Lats'] }) })

    expect(recommendation.targetMuscles).not.toContain('Lats')
    expect(recommendation.reasons.some((reason) => reason.includes('Lats is an explicit priority'))).toBe(false)
  })

  it('respects unavailable equipment and hard exercise exclusions', () => {
    const recommendation = generated({
      preferences: preferences({ priorities: ['Lats'], excludedExerciseIds: ['lat-pulldown'] }),
      todaysContext: context({ unavailableEquipment: ['cables'] }),
    })
    const selected = recommendation.workout.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)!)

    expect(recommendation.workout.exerciseIds).not.toContain('lat-pulldown')
    expect(selected.every((exercise) => exercise.equipment !== 'Cable machine')).toBe(true)
  })

  it('reduces the generated workout to the available time without rotating exercises', () => {
    const recommendation = generated({ todaysContext: context({ availableMinutes: 10 }) })
    const estimatedMinutes = (recommendation.workout.plannedExercises ?? []).reduce((total, exercise) => total + exercise.sets * 3 + 2, 0)

    expect(recommendation.workout.plannedExercises).toHaveLength(1)
    expect(estimatedMinutes).toBeLessThanOrEqual(10)
  })

  it('does not mutate a user-owned plan while generating a recommendation', () => {
    const userPlan: WorkoutTemplate = {
      id: 'user-plan', name: 'My Push', description: '', focus: 'Push', planningAuthority: 'user-plan', exerciseIds: ['barbell-bench-press'],
    }
    const original = structuredClone(userPlan)

    generated({ preferences: preferences({ priorities: ['Lats'] }) })

    expect(userPlan).toEqual(original)
  })

  it('is deterministic for identical inputs', () => {
    const input = { history: [latsSession('2026-09-09')], preferences: preferences({ priorities: ['Lats', 'Abs'] }), todaysContext: context({ availableMinutes: 24 }), asOf }

    expect(generated(input)).toEqual(generated(input))
  })
})
