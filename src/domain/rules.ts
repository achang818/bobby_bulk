import type { RecommendationTrace } from './models'
import { findPrinciple } from './knowledge-base'

export const decisionRules = {
  'double-progression': 'progressive-overload',
  'keep-stable-exercise': 'consistent-execution',
  'replace-on-stall': 'plateau-variation',
  'replace-on-stall-specific': 'muscle-specific-loading',
  'add-for-priority-volume': 'volume-hypertrophy',
  'add-for-priority-frequency': 'frequency-distribution',
  'adapt-unavailable-equipment': 'equipment-constraint',
  'adapt-available-time': 'time-constraint',
} as const

export type DecisionRuleId = keyof typeof decisionRules

export function buildTrace(ruleId: DecisionRuleId): RecommendationTrace {
  const principle = findPrinciple(decisionRules[ruleId])
  return {
    ruleId,
    principleId: principle.id,
    principleDescription: principle.description,
    evidenceLevel: principle.evidenceLevel,
    source: principle.source,
  }
}
