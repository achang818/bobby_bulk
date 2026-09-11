import { describe, expect, it } from 'vitest'
import { calculateExerciseFeatures, calculateMuscleFeatures } from '../domain/features'
import { exercises } from '../domain/exercises'
import { evaluatePlan } from '../domain/plan-evaluator'
import { PLAN_FREQUENCY_OPPORTUNITIES } from '../domain/plan-evaluator'
import { defaultPreferences } from '../domain/preferences'
import type { RecommendationDecision, UserPreferences, Workout, WorkoutPlan } from '../domain/models'

const bench = exercises.find((exercise) => exercise.id === 'incline-db-bench')!
const lateralRaise = exercises.find((exercise) => exercise.id === 'cable-lateral-raise')!
const cableRow = exercises.find((exercise) => exercise.id === 'cable-row')!
const cableCrunch = exercises.find((exercise) => exercise.id === 'cable-crunch')!
const plan: WorkoutPlan = { id: 'upper', name: 'Upper', description: 'test', focus: 'Upper body', exerciseIds: [bench.id] }
const prefs: UserPreferences = { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Side delts'] }

function workout(id: string, date: string, exerciseId: string, reps: number): Workout {
  return { id, date, title: 'Upper', sets: [{ id: `${id}-set`, exerciseId, setType: 'working', weight: 70, reps }] }
}

describe('feature calculations', () => {
  it('returns empty, non-fabricated features without history', () => {
    const features = calculateExerciseFeatures(bench, [], '2026-09-09')
    expect(features.sessionsPerformed).toBe(0)
    expect(features.daysSinceLastPerformed).toBeUndefined()
    expect(features.bestEstimatedOneRepMax).toBeUndefined()
    expect(calculateMuscleFeatures('Upper chest', exercises, [], '2026-09-09').volumeState).toBe('insufficient history')
  })

  it('calculates rolling muscle volume and days since training', () => {
    const history = [workout('a', '2026-09-01', bench.id, 8), workout('b', '2026-09-07', bench.id, 9)]
    const features = calculateMuscleFeatures('Upper chest', exercises, history, '2026-09-09')
    expect(features.rolling7DaySets).toBe(1)
    expect(features.rolling14DaySets).toBe(2)
    expect(features.daysSinceTrained).toBe(2)
  })

  it('classifies high recent volume without inventing recovery precision', () => {
    const history = Array.from({ length: 19 }, (_, index) => workout(`${index}`, `2026-08-${String(index + 12).padStart(2, '0')}`, bench.id, 8))
    const features = calculateMuscleFeatures('Upper chest', exercises, history, '2026-09-09')
    expect(features.volumeState).toBe('high recent volume')
    expect(features.daysSinceTrained).toBe(10)
  })

  it('classifies a rising performance trend', () => {
    const history = [workout('a', '2026-08-20', bench.id, 6), workout('b', '2026-08-25', bench.id, 8)]
    expect(calculateExerciseFeatures(bench, history, '2026-09-09').progressionState).toBe('progressing')
  })
})

describe('plan evaluation', () => {
  it('does not invent add or replace recommendations for an unranked absent muscle', () => {
    const result = evaluatePlan(plan, exercises, [], { ...defaultPreferences, goals: ['Build muscle'], priorities: [] }, '2026-09-09')
    expect(result).toEqual([])
  })

  it('recommends progression and keep for an exercise with evidence', () => {
    const history = [workout('a', '2026-09-01', bench.id, 8), workout('b', '2026-09-05', bench.id, 9)]
    const result = evaluatePlan(plan, exercises, history, prefs, '2026-09-09')
    expect(result.find((item) => item.type === 'PROGRESSION')?.trace.ruleId).toBe('double-progression')
    expect(result.find((item) => item.type === 'KEEP')?.trace.ruleId).toBe('keep-stable-exercise')
  })

  it('recommends an add only for a stated priority with low volume', () => {
    const result = evaluatePlan(plan, exercises, [workout('a', '2026-09-01', bench.id, 8), workout('b', '2026-09-05', lateralRaise.id, 12)], prefs, '2026-09-09')
    const add = result.find((item) => item.type === 'ADD')
    expect([lateralRaise.id, 'dumbbell-shoulder-press']).toContain(add?.exerciseId)
    expect(add?.reasons.length).toBeGreaterThan(1)
    expect(add?.trace.ruleId).toBe('add-for-priority-volume')
  })

  it('uses the documented three-opportunity ceiling when a single plan has no split calendar', () => {
    expect(PLAN_FREQUENCY_OPPORTUNITIES).toBe(3)
  })

  it('scores a higher-ranked low-volume priority add above a lower-ranked one', () => {
    const sparsePlan: WorkoutPlan = { id: 'sparse-priority', name: 'Sparse', description: '', focus: '', exerciseIds: [cableRow.id] }
    const history = [workout('abs', '2026-09-01', cableCrunch.id, 12), workout('upper', '2026-09-02', bench.id, 8)]
    const recommendations = evaluatePlan(sparsePlan, exercises, history, { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Abs', 'Upper chest'] }, '2026-09-09')
    const absAdd = recommendations.find((item) => item.type === 'ADD' && item.exerciseId === cableCrunch.id)
    const upperChestAdd = recommendations.find((item) => item.type === 'ADD' && item.exerciseId === bench.id)
    expect(absAdd?.score).toBeGreaterThan(upperChestAdd?.score ?? 0)
  })

  it('does not duplicate an already represented high-priority muscle', () => {
    const represented: WorkoutPlan = { id: 'abs', name: 'Abs', description: '', focus: '', exerciseIds: [cableCrunch.id] }
    const preferences: UserPreferences = { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Abs'] }
    expect(evaluatePlan(represented, exercises, [workout('abs', '2026-09-01', cableCrunch.id, 12)], preferences, '2026-09-09').some((item) => item.type === 'ADD' && item.exerciseId === cableCrunch.id)).toBe(false)
  })

  it('fills a missing high-priority slot without fabricating history', () => {
    const sparse: WorkoutPlan = { id: 'row', name: 'Row', description: '', focus: '', exerciseIds: [cableRow.id] }
    const preferences: UserPreferences = { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Abs'] }
    const add = evaluatePlan(sparse, exercises, [], preferences, '2026-09-09').find((item) => item.type === 'ADD')
    expect(add).toMatchObject({ exerciseId: cableCrunch.id, trace: { ruleId: 'add-for-priority-volume' } })
    expect(add?.reasons).toContain('No direct working-set history or planned slot exists for this priority yet.')
  })

  it('does not add an unranked absent muscle with zero history', () => {
    const sparse: WorkoutPlan = { id: 'row', name: 'Row', description: '', focus: '', exerciseIds: [cableRow.id] }
    expect(evaluatePlan(sparse, exercises, [], { ...defaultPreferences, goals: ['Build muscle'], priorities: [] }, '2026-09-09').some((item) => item.type === 'ADD')).toBe(false)
  })

  it('recommends a priority add for adequate volume that is poorly distributed', () => {
    const history: Workout[] = [{
      id: 'a', date: '2026-09-01', title: 'Shoulders', sets: Array.from({ length: 6 }, (_, index) => ({ id: `set-${index}`, exerciseId: lateralRaise.id, setType: 'working', weight: 20, reps: 12 })),
    }]
    const result = evaluatePlan(plan, exercises, history, prefs, '2026-09-09')
    const add = result.find((item) => item.type === 'ADD')

    expect([lateralRaise.id, 'dumbbell-shoulder-press']).toContain(add?.exerciseId)
    expect(add?.trace.ruleId).toBe('add-for-priority-frequency')
    expect(add?.trace.principleId).toBe('frequency-distribution')
  })

  it('emits one deterministic ADD when low direct volume and frequency both apply', () => {
    const history = [workout('side-delts', '2026-09-01', lateralRaise.id, 12)]
    const result = evaluatePlan(plan, exercises, history, prefs, '2026-09-09')
    const adds = result.filter((item) => item.type === 'ADD')

    expect(adds).toHaveLength(1)
    expect([lateralRaise.id, 'dumbbell-shoulder-press']).toContain(adds[0]?.exerciseId)
    expect(adds[0]?.trace.ruleId).toBe('add-for-priority-volume')
  })

  it('never emits duplicate recommendation IDs when priority needs overlap', () => {
    const sparse: WorkoutPlan = { id: 'row', name: 'Row', description: '', focus: '', exerciseIds: [cableRow.id] }
    const result = evaluatePlan(sparse, exercises, [], { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Abs', 'Lats', 'Upper chest'] }, '2026-09-09')
    const ids = result.map((recommendation) => recommendation.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('does not add a priority exercise when direct volume and frequency are both adequate', () => {
    const sparse: WorkoutPlan = { id: 'row', name: 'Row', description: '', focus: '', exerciseIds: [cableRow.id] }
    const dates = ['2026-08-27', '2026-08-29', '2026-08-31', '2026-09-02', '2026-09-04', '2026-09-06']
    const history: Workout[] = dates.map((date, workoutIndex) => ({
      id: `abs-${workoutIndex}`,
      date,
      title: 'Abs',
      sets: Array.from({ length: 2 }, (_, setIndex) => ({ id: `abs-${workoutIndex}-${setIndex}`, exerciseId: cableCrunch.id, setType: 'working' as const, weight: 40, reps: 12 })),
    }))
    const result = evaluatePlan(sparse, exercises, history, { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Abs'] }, '2026-09-09')

    expect(result.some((item) => item.type === 'ADD' && item.exerciseId === cableCrunch.id)).toBe(false)
  })

  it('prioritizes a high-rank frequency deficiency over lower-rank low volume', () => {
    const sparse: WorkoutPlan = { id: 'row', name: 'Row', description: '', focus: '', exerciseIds: [cableRow.id] }
    const history: Workout[] = [{
      id: 'abs-volume', date: '2026-09-01', title: 'Abs',
      sets: Array.from({ length: 6 }, (_, index) => ({ id: `abs-${index}`, exerciseId: cableCrunch.id, setType: 'working' as const, weight: 40, reps: 12 })),
    }, workout('upper', '2026-09-02', bench.id, 8)]
    const recommendations = evaluatePlan(sparse, exercises, history, { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Abs', 'Upper chest'] }, '2026-09-09')
    const absAdd = recommendations.find((item) => item.type === 'ADD' && item.exerciseId === cableCrunch.id)
    const upperChestAdd = recommendations.find((item) => item.type === 'ADD' && item.exerciseId === bench.id)

    expect(absAdd?.trace.ruleId).toBe('add-for-priority-frequency')
    expect(absAdd?.score).toBeGreaterThan(upperChestAdd?.score ?? 0)
  })

  it('does not turn lower-priority extra work into an automatic remove', () => {
    const sparse: WorkoutPlan = { id: 'row', name: 'Row', description: '', focus: '', exerciseIds: [cableRow.id] }
    const history: Workout[] = [{
      id: 'side-delts', date: '2026-09-01', title: 'Shoulders',
      sets: Array.from({ length: 12 }, (_, index) => ({ id: `delt-${index}`, exerciseId: lateralRaise.id, setType: 'working' as const, weight: 20, reps: 12 })),
    }]
    const result = evaluatePlan(sparse, exercises, history, { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Abs', 'Side delts'] }, '2026-09-09')

    expect(result.some((item) => item.type === 'REMOVE')).toBe(false)
  })

  it('does not let plan coherence suppress an otherwise valid priority add', () => {
    const pullPlan: WorkoutPlan = { id: 'pull', name: 'Pull', description: 'test', focus: 'Back', exerciseIds: ['cable-row', 'face-pull'] }
    const history = [workout('a', '2026-09-01', bench.id, 8)]
    const result = evaluatePlan(pullPlan, exercises, history, { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Upper chest'] }, '2026-09-09')

    expect(result.find((item) => item.type === 'ADD')?.exerciseId).toBe(bench.id)
  })

  it('keeps remaining priority suggestions available while building an empty workout', () => {
    // These are two previously accepted, unrelated priority additions. A manual
    // empty workout should still offer direct lat work instead of treating those
    // first choices as a focused session that excludes it.
    const buildingWorkout: WorkoutPlan = { id: 'empty-workout', name: 'Empty workout', description: '', focus: 'Manual logging', exerciseIds: [cableCrunch.id, bench.id] }
    const result = evaluatePlan(buildingWorkout, exercises, [], { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Abs', 'Upper chest', 'Lats'] }, '2026-09-09')

    expect(result.some((item) => item.type === 'ADD' && exercises.find((exercise) => exercise.id === item.exerciseId)?.primaryMuscles.includes('Lats'))).toBe(true)
  })

  it('adds a coherent upper-chest exercise to a push-style plan', () => {
    const pushPlan: WorkoutPlan = { id: 'push', name: 'Push', description: 'test', focus: 'Chest', exerciseIds: ['barbell-bench-press', 'dumbbell-shoulder-press'] }
    const history = [workout('a', '2026-09-01', bench.id, 8)]
    const result = evaluatePlan(pushPlan, exercises, history, { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Upper chest'] }, '2026-09-09')
    const add = result.find((item) => item.type === 'ADD')

    expect(add?.exerciseId).toBe(bench.id)
  })

  it('allows a priority add for a single-exercise plan without coherence context', () => {
    const sparsePlan: WorkoutPlan = { id: 'sparse', name: 'Sparse', description: 'test', focus: 'Back', exerciseIds: ['cable-row'] }
    const history = [workout('a', '2026-09-01', bench.id, 8)]
    const result = evaluatePlan(sparsePlan, exercises, history, { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Upper chest'] }, '2026-09-09')

    expect(result.find((item) => item.type === 'ADD')?.exerciseId).toBe(bench.id)
  })

  it('does not recommend a disliked exercise', () => {
    const result = evaluatePlan(plan, exercises, [workout('a', '2026-09-01', bench.id, 8), workout('b', '2026-09-05', lateralRaise.id, 12)], { ...prefs, dislikedExerciseIds: [lateralRaise.id] }, '2026-09-09')
    expect(result.some((item) => item.exerciseId === lateralRaise.id)).toBe(false)
  })

  it('recommends a replacement only after repeated stalling', () => {
    const history = [workout('a', '2026-08-20', bench.id, 8), workout('b', '2026-08-25', bench.id, 8), workout('c', '2026-09-01', bench.id, 8)]
    const result = evaluatePlan(plan, exercises, history, { ...defaultPreferences, goals: ['Get stronger'] }, '2026-09-09')
    const replacement = result.find((item) => item.type === 'REPLACE')
    expect(replacement?.exerciseId).toBe(bench.id)
    expect(replacement?.alternativeExerciseId).toBeDefined()
    expect(replacement?.trace.ruleId).toBe('replace-on-stall')
  })

  it('backs off a replacement after two keep-plan decisions while an unopposed stall still recommends one', () => {
    const history = [workout('a', '2026-08-20', bench.id, 8), workout('b', '2026-08-25', bench.id, 8), workout('c', '2026-09-01', bench.id, 8)]
    const decisions: RecommendationDecision[] = [
      { id: '1', recommendationId: 'replace-upper-incline-db-bench', recommendationType: 'REPLACE', exerciseId: bench.id, decision: 'dismissed' },
      { id: '2', recommendationId: 'replace-upper-incline-db-bench', recommendationType: 'REPLACE', exerciseId: bench.id, decision: 'rejected' },
    ]

    expect(evaluatePlan(plan, exercises, history, { ...defaultPreferences, goals: ['Get stronger'] }, '2026-09-09').some((item) => item.type === 'REPLACE')).toBe(true)
    expect(evaluatePlan(plan, exercises, history, { ...defaultPreferences, goals: ['Get stronger'] }, '2026-09-09', undefined, decisions).some((item) => item.type === 'REPLACE')).toBe(false)
  })

  it('prefers a muscle-specific isolation replacement and traces that preference', () => {
    const stalledIsolation = { id: 'stalled-fly', name: 'Stalled Fly', category: 'Isolation', equipment: 'Cable', primaryMuscles: ['Chest', 'Triceps'], secondaryMuscles: [], goals: ['Build muscle'], type: 'isolation' as const, repRange: { min: 10, max: 15 }, defaultSets: 3, movementPattern: 'horizontal-push' as const, primaryAction: 'shoulder-horizontal-adduction' as const }
    const broadCandidate = { id: 'broad-press', name: 'Broad Press', category: 'Isolation', equipment: 'Machine', primaryMuscles: ['Chest'], secondaryMuscles: [], goals: ['Build muscle'], type: 'compound' as const, repRange: { min: 10, max: 15 }, defaultSets: 3, movementPattern: 'horizontal-push' as const, primaryAction: 'shoulder-horizontal-adduction' as const }
    const specificCandidate = { id: 'specific-fly', name: 'Specific Fly', category: 'Isolation', equipment: 'Machine', primaryMuscles: ['Chest', 'Triceps'], secondaryMuscles: [], goals: ['Build muscle'], type: 'isolation' as const, repRange: { min: 10, max: 15 }, defaultSets: 3, movementPattern: 'horizontal-push' as const, primaryAction: 'shoulder-horizontal-adduction' as const }
    const isolationPlan: WorkoutPlan = { id: 'isolation', name: 'Isolation', description: 'test', focus: 'Chest', exerciseIds: [stalledIsolation.id] }
    const history = [workout('a', '2026-08-20', stalledIsolation.id, 12), workout('b', '2026-08-25', stalledIsolation.id, 12), workout('c', '2026-09-01', stalledIsolation.id, 12)]

    const replacement = evaluatePlan(isolationPlan, [stalledIsolation, broadCandidate, specificCandidate], history, defaultPreferences, '2026-09-09').find((item) => item.type === 'REPLACE')
    expect(replacement?.alternativeExerciseId).toBe(specificCandidate.id)
    expect(replacement?.trace.ruleId).toBe('replace-on-stall-specific')
    expect(replacement?.trace.principleId).toBe('muscle-specific-loading')
  })

  it('uses the existing stall replacement trace when no specific isolation candidate exists', () => {
    const stalledIsolation = { id: 'stalled-fly', name: 'Stalled Fly', category: 'Isolation', equipment: 'Cable', primaryMuscles: ['Chest', 'Triceps'], secondaryMuscles: [], goals: ['Build muscle'], type: 'isolation' as const, repRange: { min: 10, max: 15 }, defaultSets: 3, movementPattern: 'horizontal-push' as const, primaryAction: 'shoulder-horizontal-adduction' as const }
    const broadCandidate = { id: 'broad-press', name: 'Broad Press', category: 'Isolation', equipment: 'Machine', primaryMuscles: ['Chest'], secondaryMuscles: [], goals: ['Build muscle'], type: 'compound' as const, repRange: { min: 10, max: 15 }, defaultSets: 3, movementPattern: 'horizontal-push' as const, primaryAction: 'shoulder-horizontal-adduction' as const }
    const isolationPlan: WorkoutPlan = { id: 'isolation', name: 'Isolation', description: 'test', focus: 'Chest', exerciseIds: [stalledIsolation.id] }
    const history = [workout('a', '2026-08-20', stalledIsolation.id, 12), workout('b', '2026-08-25', stalledIsolation.id, 12), workout('c', '2026-09-01', stalledIsolation.id, 12)]

    const replacement = evaluatePlan(isolationPlan, [stalledIsolation, broadCandidate], history, defaultPreferences, '2026-09-09').find((item) => item.type === 'REPLACE')
    expect(replacement?.alternativeExerciseId).toBe(broadCandidate.id)
    expect(replacement?.trace.ruleId).toBe('replace-on-stall')
  })
})
