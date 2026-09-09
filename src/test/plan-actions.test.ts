import { describe, expect, it } from 'vitest'
import { applyAcceptedRecommendation } from '../domain/plan-actions'
import type { PlanRecommendation, WorkoutTemplate } from '../domain/models'

const plan: WorkoutTemplate = { id: 'plan', name: 'Plan', description: 'test', focus: 'test', exerciseIds: ['a', 'b'] }
const recommendation = (type: PlanRecommendation['type'], exerciseId: string, alternativeExerciseId?: string): PlanRecommendation => ({
  id: `${type}-${exerciseId}`, type, exerciseId, alternativeExerciseId, score: 1, reasons: [], trace: { ruleId: 'test' as never, principleId: 'test', principleDescription: 'test', evidenceLevel: 'D', source: { name: 'test' } },
})

describe('applyAcceptedRecommendation', () => {
  it('replaces an exercise while preserving its position', () => {
    expect(applyAcceptedRecommendation(plan, recommendation('REPLACE', 'a', 'c')).exerciseIds).toEqual(['c', 'b'])
  })

  it('appends an add without duplicating an existing exercise', () => {
    expect(applyAcceptedRecommendation(plan, recommendation('ADD', 'c')).exerciseIds).toEqual(['a', 'b', 'c'])
    expect(applyAcceptedRecommendation(plan, recommendation('ADD', 'b')).exerciseIds).toEqual(['a', 'b'])
  })

  it('removes an exercise', () => {
    expect(applyAcceptedRecommendation(plan, recommendation('REMOVE', 'a')).exerciseIds).toEqual(['b'])
  })

  it.each(['PROGRESSION', 'KEEP', 'MODIFY'] as const)('does not mutate a plan for %s', (type) => {
    expect(applyAcceptedRecommendation(plan, recommendation(type, 'a')).exerciseIds).toEqual(['a', 'b'])
  })
})
