import { describe, expect, it } from 'vitest'
import { findExerciseReplacement } from '../domain/exercise-replacement'
import { exercises } from '../domain/exercises'
import { evaluatePlan } from '../domain/plan-evaluator'
import { defaultPreferences } from '../domain/preferences'
import { compareRecommendations } from '../domain/rules'
import type { Exercise, PlanRecommendation, Workout, WorkoutPlan } from '../domain/models'

const catalog = (id: string) => exercises.find((item) => item.id === id)!
const copy = (base: Exercise, id: string, name: string, changes: Partial<Exercise> = {}): Exercise => ({ ...base, id, name, ...changes })
const planFor = (exerciseId: string): WorkoutPlan => ({ id: `plan-${exerciseId}`, name: 'Test', description: '', focus: '', exerciseIds: [exerciseId] })
const session = (id: string, date: string, exerciseId: string, reps: number): Workout => ({ id, date, title: 'Test', sets: [{ id: `${id}-set`, exerciseId, setType: 'working', weight: 100, reps }] })

describe('shared exercise replacement engine', () => {
  it('retains ineligible evidence while selecting only eligible candidates', () => {
    const original = catalog('barbell-bench-press')
    const valid = copy(original, 'valid-press', 'Valid Press', { equipment: 'Machine' })
    const unavailable = copy(original, 'unavailable-press', 'Unavailable Press', { equipment: 'Cable' })
    const result = findExerciseReplacement({
      originalExercise: original,
      reason: 'equipment-unavailable',
      exercises: [original, unavailable, valid],
      constraints: { unavailableEquipment: ['cables'], requireSameCategory: true },
    })

    expect(result.consideredCandidates.find((candidate) => candidate.exercise.id === unavailable.id)?.eligibility).toBe('unavailable-equipment')
    expect(result.rankedCandidates.map((candidate) => candidate.exercise.id)).toEqual([valid.id])
    expect(result.selectedCandidate?.exercise.id).toBe(valid.id)
  })

  it('uses the same compound-preserving ranking for stalled replacement as the shared engine', () => {
    const original = copy(catalog('barbell-bench-press'), 'stalled-source', 'Stalled Source')
    const compound = copy(original, 'compound-alternative', 'Compound Alternative', { equipment: 'Machine' })
    const isolation = copy(original, 'isolation-alternative', 'Isolation Alternative', { equipment: 'Cable', type: 'isolation' })
    const plan = planFor(original.id)
    const history = [session('a', '2026-08-20', original.id, 8), session('b', '2026-08-25', original.id, 8), session('c', '2026-09-01', original.id, 8)]
    const shared = findExerciseReplacement({
      originalExercise: original,
      reason: 'stalled',
      exercises: [original, isolation, compound],
      constraints: { excludedExerciseIds: [original.id], requireSameCategory: true },
      preferences: defaultPreferences,
    })
    const recommendation = evaluatePlan(plan, [original, isolation, compound], history, defaultPreferences, '2026-09-09').find((item) => item.type === 'REPLACE')

    expect(shared.selectedCandidate?.exercise.id).toBe(compound.id)
    expect(recommendation?.alternativeExerciseId).toBe(shared.selectedCandidate?.exercise.id)
    expect(recommendation?.reasons).toContain('Recent comparable working-set performance has repeatedly stalled.')
  })

  it('permits a replacement after repeated regression, but not for stable or progressing performance', () => {
    const original = copy(catalog('barbell-bench-press'), 'regressing-source', 'Regressing Source')
    const alternative = copy(original, 'regression-alternative', 'Regression Alternative', { equipment: 'Machine' })
    const plan = planFor(original.id)
    const regression = [session('a', '2026-08-20', original.id, 10), session('b', '2026-08-25', original.id, 7), session('c', '2026-09-01', original.id, 6)]
    const stable = [session('a', '2026-08-20', original.id, 8), session('b', '2026-08-25', original.id, 8)]
    const progressing = [session('a', '2026-08-20', original.id, 8), session('b', '2026-08-25', original.id, 9)]

    const regressionReplacement = evaluatePlan(plan, [original, alternative], regression, defaultPreferences, '2026-09-09').find((item) => item.type === 'REPLACE')
    expect(regressionReplacement).toMatchObject({ alternativeExerciseId: alternative.id, trace: { ruleId: 'replace-on-regression' } })
    expect(regressionReplacement?.reasons).toContain('Recent comparable working-set performance has repeatedly regressed.')
    expect(evaluatePlan(plan, [original, alternative], stable, defaultPreferences, '2026-09-09').some((item) => item.type === 'REPLACE')).toBe(false)
    expect(evaluatePlan(plan, [original, alternative], progressing, defaultPreferences, '2026-09-09').some((item) => item.type === 'REPLACE')).toBe(false)
  })
})

describe('recommendation ordering', () => {
  const trace = { ruleId: 'test' as never, principleId: 'test', principleDescription: 'test', evidenceLevel: 'D' as const, source: { name: 'test' } }
  const recommendation = (id: string, exerciseId: string, score: number): PlanRecommendation => ({ id, type: 'KEEP', exerciseId, score, reasons: [], trace })

  it('orders recommendation priority before explicit workout order and IDs', () => {
    const low = recommendation('low', 'second', 3)
    const first = recommendation('z-first', 'first', 4)
    const second = recommendation('a-second', 'second', 4)
    const unorderedA = recommendation('a-unordered', 'outside-a', 4)
    const unorderedB = recommendation('b-unordered', 'outside-b', 4)
    const ordered = [low, second, unorderedB, unorderedA, first].sort((left, right) => compareRecommendations(left, right, new Map([['first', 0], ['second', 1]])))

    expect(ordered.map((item) => item.id)).toEqual(['z-first', 'a-second', 'a-unordered', 'b-unordered', 'low'])
  })
})
