import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { defaultPreferences } from '../domain/preferences'
import { generateRecommendations } from '../domain/recommendations'
import type { Recommendation, TodaysContext, Workout, WorkoutPlan } from '../domain/models'

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

  it('is deterministic, ordered by priority, and emits the stable final schema', () => {
    const input = { plan: plan('ordered', ['incline-db-bench']), exercises, history: [session('a', '2026-09-01', 'incline-db-bench', 8), session('b', '2026-09-05', 'incline-db-bench', 9)], preferences: defaultPreferences, todaysContext: context({ unavailableEquipment: ['dumbbells'] }) }
    const first = generateRecommendations(input)
    const second = generateRecommendations(input)

    expect(first).toEqual(second)
    expect(first.map((item) => item.priority)).toEqual([...first.map((item) => item.priority)].sort((left, right) => right - left))
    expect(first[0]).toMatchObject({ id: expect.any(String), type: expect.any(String), priority: expect.any(Number), target: { kind: 'exercise', exerciseId: 'incline-db-bench' }, change: { kind: 'replace' }, reason: expect.any(String), trace: { ruleId: 'adapt-unavailable-equipment', principleId: expect.any(String) } })
    expect(first.every((item) => !('decision' in item))).toBe(true)
  })

  it('keeps decisions outside generated recommendations', () => {
    const decisions = [{ id: 'decision', recommendationId: 'old', recommendationType: 'ADD' as const, exerciseId: 'cable-crunch', decision: 'dismissed' as const, timestamp: '2026-09-09T00:00:00.000Z' }]
    const recommendations: Recommendation[] = generated(plan('empty', []), [], { decisions, preferences: { ...defaultPreferences, goals: ['Build muscle'], priorities: ['Abs'] } })

    expect(recommendations.every((item) => !('decision' in item))).toBe(true)
  })
})
