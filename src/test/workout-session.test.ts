import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { adaptWorkoutForTime, estimateTypicalDuration } from '../domain/adaptation'
import { applyAcceptedRecommendation } from '../domain/plan-actions'
import { recommendNext } from '../domain/progression'
import { completeWorkoutSession, createPlannedExercise, createWorkoutSession, normalizeWorkoutSession, normalizeWorkoutTemplate, planExerciseIds, resolveWorkoutForToday } from '../domain/workout-session'

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
    expect(plan.plannedExercises?.[1]).toMatchObject({ exerciseId: row.id, sets: 4, setType: 'working', groupId: 'superset-a' })
    expect(plan.plannedExercises?.[0].repRange).toEqual(bench.repRange)
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

  it('uses an explicit planned prescription instead of exercise defaults', () => {
    const bench = exercises.find((exercise) => exercise.id === 'barbell-bench-press')!
    const planned = { ...createPlannedExercise(bench.id, 0, bench), sets: 4, repRange: { min: 6, max: 8 } }
    const history = [{ id: 'session', date: '2026-09-01', title: 'Push', sets: Array.from({ length: 4 }, (_, index) => ({ id: `set-${index}`, exerciseId: bench.id, setType: 'working' as const, weight: 100, reps: 8 })) }]
    const recommendation = recommendNext(bench, planned, history)

    expect(recommendation.sets).toBe(4)
    expect(recommendation.repRange).toEqual({ min: 6, max: 8 })
    expect(recommendation.action).toBe('increase-weight')
  })

  it('uses planned sets for time adaptation and snapshots the resolved prescription in a session', () => {
    const bench = exercises.find((exercise) => exercise.id === 'barbell-bench-press')!
    const lateralRaise = exercises.find((exercise) => exercise.id === 'cable-lateral-raise')!
    const plan = normalizeWorkoutTemplate({ id: 'timed', name: 'Timed', description: '', focus: 'Upper', plannedExercises: [
      { ...createPlannedExercise(bench.id, 0, bench), sets: 4 },
      { ...createPlannedExercise(lateralRaise.id, 1, lateralRaise), sets: 2 },
    ] }, exercises)
    expect(estimateTypicalDuration(plan, exercises)).toBe(22)
    const modifications = adaptWorkoutForTime(plan, exercises, 16).map((candidate) => ({
      id: candidate.id, type: candidate.type, priority: candidate.score, target: { kind: 'exercise' as const, exerciseId: candidate.exerciseId },
      change: { kind: 'modify' as const, exerciseId: candidate.exerciseId, changes: { sets: candidate.modifiedSets } }, reason: candidate.reasons[0]!, trace: candidate.trace,
    }))
    const resolved = resolveWorkoutForToday(plan, modifications, exercises)
    const session = createWorkoutSession(resolved)

    expect(session.plannedExercises).toEqual(resolved.plannedExercises)
  })

  it('applies modify, replace, add, and remove to structured slots and keeps the ID projection synchronized', () => {
    const plan = normalizeWorkoutTemplate({ id: 'actions', name: 'Actions', description: '', focus: '', exerciseIds: ['a', 'b'] })
    const trace = { ruleId: 'test', principleId: 'test', principleDescription: 'test', evidenceLevel: 'C' as const, source: { name: 'test' } }
    const modify = applyAcceptedRecommendation(plan, { id: 'modify', type: 'MODIFY', priority: 1, target: { kind: 'exercise', exerciseId: 'a' }, change: { kind: 'modify', exerciseId: 'a', changes: { sets: 2 } }, reason: 'test', trace })
    const replace = applyAcceptedRecommendation(modify, { id: 'replace', type: 'REPLACE', priority: 1, target: { kind: 'exercise', exerciseId: 'a' }, change: { kind: 'replace', fromExerciseId: 'a', toExerciseId: 'c' }, reason: 'test', trace })
    const added = applyAcceptedRecommendation(replace, { id: 'add', type: 'ADD', priority: 1, target: { kind: 'exercise', exerciseId: 'd' }, change: { kind: 'add', exerciseId: 'd', sets: 3, repRange: { min: 8, max: 12 } }, reason: 'test', trace })
    const removed = applyAcceptedRecommendation(added, { id: 'remove', type: 'REMOVE', priority: 1, target: { kind: 'exercise', exerciseId: 'b' }, change: { kind: 'remove', exerciseId: 'b' }, reason: 'test', trace })

    expect(removed.plannedExercises?.[0]).toMatchObject({ exerciseId: 'c', sets: 2, order: 0 })
    expect(removed.exerciseIds).toEqual(planExerciseIds(removed))
  })
})
