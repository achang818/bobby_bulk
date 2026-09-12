import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { defaultPreferences } from '../domain/preferences'
import { generateRecommendations, recommendationExerciseId, resolveConcreteConflicts } from '../domain/recommendations'
import type { Recommendation, RecommendationCandidate, TodaysContext, Workout, WorkoutPlan } from '../domain/models'

const context = (overrides: Partial<TodaysContext> = {}): TodaysContext => ({ gymId: 'default-gym', unavailableEquipment: [], ...overrides })
const plan = (id: string, exerciseIds: string[]): WorkoutPlan => ({ id, name: id, description: '', focus: '', exerciseIds })
const session = (id: string, date: string, exerciseId: string, reps: number): Workout => ({ id, date, title: 'Test', sets: [{ id: `${id}-set`, exerciseId, setType: 'working', weight: 100, reps }] })
const generated = (workoutPlan: WorkoutPlan, history: Workout[] = [], overrides: Partial<Parameters<typeof generateRecommendations>[0]> = {}) => generateRecommendations({ plan: workoutPlan, exercises, history, preferences: defaultPreferences, todaysContext: context(), ...overrides })

describe('final recommendation pipeline', () => {
  it('composes progression and keep candidates without changing their rule traces', () => {
    const bench = exercises.find((exercise) => exercise.id === 'incline-db-bench')!
    const recommendations = generated(plan('upper', [bench.id]), [session('a', '2026-09-01', bench.id, 8), session('b', '2026-09-05', bench.id, 9)])

    expect(recommendations.some((item) => item.type === 'PROGRESSION' && item.trace.ruleId === 'double-progression')).toBe(true)
    expect(recommendations.some((item) => item.type === 'KEEP' && item.trace.ruleId === 'keep-stable-exercise')).toBe(true)
    expect(recommendations.find((item) => item.type === 'PROGRESSION')).toMatchObject({ target: { kind: 'exercise', exerciseId: bench.id }, change: { kind: 'progression', repRange: bench.repRange }, trace: { ruleId: 'double-progression' } })
  })

  it('keeps multiple valid priority additions instead of gating them by session coherence or count', () => {
    const recommendations = generated(plan('empty-workout', []), [], { preferences: { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Abs', 'Upper chest', 'Lats'] } })
    const additions = recommendations.filter((item) => item.type === 'ADD')

    expect(additions).toHaveLength(3)
    expect(new Set(additions.map((item) => item.change.kind === 'add' ? item.change.exerciseId : '')).size).toBe(3)
  })

  it('uses the equipment replacement as the concrete winner over keep and progression for an unavailable exercise', () => {
    const bench = exercises.find((exercise) => exercise.id === 'incline-db-bench')!
    const recommendations = generated(plan('upper', [bench.id]), [session('a', '2026-09-01', bench.id, 8), session('b', '2026-09-05', bench.id, 9)], { todaysContext: context({ unavailableEquipment: ['dumbbells'] }) })
    const targeted = recommendations.filter((item) => item.target.kind === 'exercise' && item.target.exerciseId === bench.id)

    expect(targeted).toHaveLength(1)
    expect(targeted[0]).toMatchObject({ type: 'REPLACE', priority: 6, change: { kind: 'replace', fromExerciseId: bench.id }, trace: { ruleId: 'adapt-unavailable-equipment' } })
  })

  it('uses the time rule for time pressure without generic recommendation suppression', () => {
    const recommendations = generated(plan('short-on-time', ['barbell-bench-press', 'cable-lateral-raise', 'triceps-pushdown']), [], { todaysContext: context({ availableMinutes: 14 }) })

    expect(recommendations.some((item) => item.type === 'MODIFY' && item.trace.ruleId === 'adapt-available-time')).toBe(true)
    expect(recommendations.some((item) => item.type === 'REMOVE' && item.trace.ruleId === 'adapt-available-time')).toBe(true)
  })

  it('lets REMOVE win over progression and keep for the exact same exercise', () => {
    const bench = exercises.find((exercise) => exercise.id === 'incline-db-bench')!
    const recommendations = generated(plan('too-short', [bench.id]), [session('a', '2026-09-01', bench.id, 8), session('b', '2026-09-05', bench.id, 9)], { todaysContext: context({ availableMinutes: 1 }) })
    const targeted = recommendations.filter((item) => item.target.kind === 'exercise' && item.target.exerciseId === bench.id)

    expect(targeted).toEqual([expect.objectContaining({ type: 'REMOVE', change: { kind: 'remove', exerciseId: bench.id } })])
  })

  it('deduplicates only identical actions, retaining the first deterministic candidate', () => {
    const trace = { ruleId: 'test' as never, principleId: 'test', principleDescription: 'test', evidenceLevel: 'D' as const, source: { name: 'test' } }
    const candidates: RecommendationCandidate[] = [
      { id: 'first', type: 'REPLACE', exerciseId: 'bench', alternativeExerciseId: 'machine-press', score: 6, reasons: ['first'], trace },
      { id: 'duplicate', type: 'REPLACE', exerciseId: 'bench', alternativeExerciseId: 'machine-press', score: 6, reasons: ['duplicate'], trace },
      { id: 'different', type: 'REPLACE', exerciseId: 'bench', alternativeExerciseId: 'dumbbell-press', score: 6, reasons: ['different'], trace },
    ]

    expect(resolveConcreteConflicts(candidates).map((candidate) => candidate.id)).toEqual(['first', 'different'])
  })

  it('is deterministic, ordered by priority, and emits the stable final schema', () => {
    const input = { plan: plan('ordered', ['incline-db-bench']), exercises, history: [session('a', '2026-09-01', 'incline-db-bench', 8), session('b', '2026-09-05', 'incline-db-bench', 9)], preferences: defaultPreferences, todaysContext: context({ unavailableEquipment: ['dumbbells'] }) }
    const first = generateRecommendations(input)
    const second = generateRecommendations(input)

    expect(first).toEqual(second)
    expect(first.map((item) => item.priority)).toEqual([...first.map((item) => item.priority)].sort((left, right) => right - left))
    expect(first[0]).toMatchObject({ id: expect.any(String), type: expect.any(String), priority: expect.any(Number), target: { kind: 'exercise', exerciseId: 'incline-db-bench' }, change: { kind: 'replace' }, reason: expect.any(String), trace: { ruleId: 'adapt-unavailable-equipment', principleId: expect.any(String) } })
    expect(first.every((item) => !('decision' in item))).toBe(true)
  })

  it('uses plan order as the deterministic tie-breaker for equal priorities', () => {
    const first = exercises.find((exercise) => exercise.id === 'cable-row')!
    const second = exercises.find((exercise) => exercise.id === 'incline-db-bench')!
    const history = [
      session('first-a', '2026-09-01', first.id, 8), session('first-b', '2026-09-05', first.id, 9),
      session('second-a', '2026-09-01', second.id, 8), session('second-b', '2026-09-05', second.id, 9),
    ]
    const tied = generated(plan('tied-keeps', [first.id, second.id]), history).filter((item) => item.type === 'KEEP' && item.priority === 5)

    expect(tied.length).toBeGreaterThan(1)
    expect(tied.map(recommendationExerciseId)).toEqual([first.id, second.id])
  })

  it('keeps decisions outside generated recommendations', () => {
    const decisions = [{ id: 'decision', recommendationId: 'old', recommendationType: 'ADD' as const, exerciseId: 'cable-crunch', decision: 'dismissed' as const, timestamp: '2026-09-09T00:00:00.000Z' }]
    const recommendations: Recommendation[] = generated(plan('empty', []), [], { decisions, preferences: { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Abs'] } })

    expect(recommendations.every((item) => !('decision' in item))).toBe(true)
  })

  it('composes advisory split alignment through the same final recommendation pipeline', () => {
    const workouts = [plan('delt', ['cable-lateral-raise']), plan('pull', ['lat-pulldown']), plan('push', ['barbell-bench-press'])]
    const split = { id: 'priority-split', name: 'Priority split', workoutIds: workouts.map((workout) => workout.id) }
    const recommendations = generated(workouts[0], [], { split, splitWorkouts: workouts, preferences: { ...defaultPreferences, goals: [], priorities: ['Side delts'] } })
    const adjustment = recommendations.find((item) => item.type === 'SPLIT')

    expect(adjustment).toMatchObject({ target: { kind: 'split', splitId: split.id }, change: { kind: 'split-adjustment', muscle: 'Side delts', issue: 'under-frequency' }, trace: { ruleId: 'adjust-split-for-priority' } })
  })
})
