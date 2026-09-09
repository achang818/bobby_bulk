import { describe, expect, it } from 'vitest'
import { calculateExerciseFeatures, calculateMuscleFeatures } from '../domain/features'
import { exercises } from '../domain/exercises'
import { evaluatePlan } from '../domain/plan-evaluator'
import { defaultPreferences } from '../domain/preferences'
import type { RecommendationDecision, UserPreferences, Workout, WorkoutPlan } from '../domain/models'

const bench = exercises.find((exercise) => exercise.id === 'incline-db-bench')!
const lateralRaise = exercises.find((exercise) => exercise.id === 'cable-lateral-raise')!
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
    expect(features.estimatedOneRepMax).toBeUndefined()
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
  it('does not invent add or replace recommendations without evidence', () => {
    const result = evaluatePlan(plan, exercises, [], prefs, '2026-09-09')
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

  it('does not add a push exercise to a pull-style plan for an unrelated priority', () => {
    const pullPlan: WorkoutPlan = { id: 'pull', name: 'Pull', description: 'test', focus: 'Back', exerciseIds: ['cable-row', 'face-pull'] }
    const history = [workout('a', '2026-09-01', bench.id, 8)]
    const result = evaluatePlan(pullPlan, exercises, history, { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Upper chest'] }, '2026-09-09')

    expect(result.filter((item) => item.type === 'ADD')).toEqual([])
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
