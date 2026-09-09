import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { completeWorkoutSession, createPlannedExercise, createWorkoutSession, normalizeWorkoutSession, normalizeWorkoutTemplate, planExerciseIds } from '../domain/workout-session'

describe('planned workouts and sessions', () => {
  it('preserves planned exercise order, set details, and grouping', () => {
    const bench = exercises.find((exercise) => exercise.id === 'barbell-bench-press')!
    const row = exercises.find((exercise) => exercise.id === 'cable-row')!
    const plan = normalizeWorkoutTemplate({
      id: 'upper', name: 'Upper', description: 'test', focus: 'Upper',
      plannedExercises: [
        { ...createPlannedExercise(row.id, 1, row), sets: 4, setType: 'working', groupId: 'superset-a' },
        { ...createPlannedExercise(bench.id, 0, bench), sets: 2, setType: 'warm-up', groupId: 'superset-a' },
      ],
    }, exercises)

    expect(planExerciseIds(plan)).toEqual([bench.id, row.id])
    expect(plan.plannedExercises?.[0]).toMatchObject({ exerciseId: row.id, sets: 4, setType: 'working', groupId: 'superset-a' })
    expect(plan.plannedExercises?.[1].repRange).toEqual(bench.repRange)
  })

  it('creates a session from a plan and preserves actual set details separately', () => {
    const bench = exercises.find((exercise) => exercise.id === 'barbell-bench-press')!
    const plan = normalizeWorkoutTemplate({ id: 'push', name: 'Push', description: 'test', focus: 'Push', exerciseIds: [bench.id] }, exercises)
    const started = createWorkoutSession(plan)
    const completed = completeWorkoutSession({
      ...started,
      notes: 'Felt good',
      sets: [{ id: 'set-1', exerciseId: bench.id, setType: 'working', weight: 95, reps: 8, rir: 1, rpe: 9, setDurationSeconds: 28, restDurationSeconds: 120, notes: 'Last rep slowed' }],
    })

    expect(completed.workoutId).toBe(plan.id)
    expect(completed.status).toBe('completed')
    expect(completed.plannedExercises?.[0].sets).toBe(bench.defaultSets)
    expect(completed.sets[0]).toMatchObject({ weight: 95, reps: 8, rir: 1, rpe: 9, setDurationSeconds: 28, restDurationSeconds: 120, notes: 'Last rep slowed' })
  })

  it('normalizes legacy plans and logged workouts without losing history', () => {
    const plan = normalizeWorkoutTemplate({ id: 'legacy-plan', name: 'Legacy', description: '', focus: 'Upper', exerciseIds: ['barbell-bench-press', 'cable-row'] }, exercises)
    const session = normalizeWorkoutSession({ id: 'legacy-session', date: '2026-09-01', title: 'Legacy', sets: [{ id: 'legacy-set', exerciseId: 'barbell-bench-press', weight: 95, reps: 8 }] })

    expect(plan.plannedExercises).toHaveLength(2)
    expect(plan.exerciseIds).toEqual(['barbell-bench-press', 'cable-row'])
    expect(session.workoutId).toBe('legacy-legacy-session')
    expect(session.status).toBe('completed')
    expect(session.sets[0]).toMatchObject({ setType: 'working', weight: 95, reps: 8 })
  })
})
