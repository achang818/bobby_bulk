import { describe, expect, it } from 'vitest'
import { applyAcceptedRecommendation } from '../domain/plan-actions'
import type { Recommendation, WorkoutTemplate } from '../domain/models'

const plan: WorkoutTemplate = { id: 'plan', name: 'Plan', description: 'test', focus: 'test', exerciseIds: ['a', 'b'] }
const recommendation = (type: Recommendation['type'], exerciseId: string, alternativeExerciseId?: string): Recommendation => ({
  id: `${type}-${exerciseId}`,
  type,
  priority: 1,
  target: { kind: 'exercise', exerciseId },
  change: type === 'REPLACE' ? { kind: 'replace', fromExerciseId: exerciseId, toExerciseId: alternativeExerciseId! }
    : type === 'ADD' ? { kind: 'add', exerciseId, sets: 3, repRange: { min: 8, max: 12 } }
      : type === 'REMOVE' ? { kind: 'remove', exerciseId }
        : type === 'MODIFY' ? { kind: 'modify', exerciseId, changes: { sets: 2 } }
          : type === 'PROGRESSION' ? { kind: 'progression', repRange: { min: 8, max: 12 } }
            : { kind: 'keep' },
  reason: 'test',
  trace: { ruleId: 'test' as never, principleId: 'test', principleDescription: 'test', evidenceLevel: 'D', source: { name: 'test' } },
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

  it('records split feedback without silently mutating the plan', () => {
    const splitRecommendation: Recommendation = {
      id: 'split-priority', type: 'SPLIT', priority: 5, target: { kind: 'split', splitId: 'split' },
      change: { kind: 'split-adjustment', muscle: 'Side delts', desiredFrequency: 3, plannedFrequency: 1, issue: 'under-frequency' },
      reason: 'test', trace: { ruleId: 'adjust-split-for-priority' as never, principleId: 'split-equivalence', principleDescription: 'test', evidenceLevel: 'A', source: { name: 'test' } },
    }

    expect(applyAcceptedRecommendation(plan, splitRecommendation).exerciseIds).toEqual(plan.exerciseIds)
  })

  it.each(['PROGRESSION', 'KEEP'] as const)('does not mutate a plan for %s', (type) => {
    expect(applyAcceptedRecommendation(plan, recommendation(type, 'a')).exerciseIds).toEqual(['a', 'b'])
  })
})
