import type { ExerciseRecommendationCandidate, Recommendation, RecommendationTrace } from './models'
import { findPrinciple } from './knowledge-base'

export const decisionRules = {
  'double-progression': 'progressive-overload',
  'keep-stable-exercise': 'consistent-execution',
  'replace-on-stall': 'plateau-variation',
  'replace-on-stall-specific': 'muscle-specific-loading',
  'replace-on-regression': 'personal-history',
  'add-for-priority-volume': 'volume-hypertrophy',
  'add-for-priority-frequency': 'frequency-distribution',
  'adapt-unavailable-equipment': 'equipment-constraint',
  'adapt-available-time': 'time-constraint',
  'adjust-split-for-priority': 'split-equivalence',
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

/** Recommendation-type priority only; never an exercise-quality score. */
export function compareRecommendations(left: ExerciseRecommendationCandidate, right: ExerciseRecommendationCandidate, exerciseOrder: ReadonlyMap<string, number> = new Map()) {
  const priority = right.score - left.score
  if (priority) return priority
  const leftOrder = exerciseOrder.get(left.exerciseId) ?? Number.MAX_SAFE_INTEGER
  const rightOrder = exerciseOrder.get(right.exerciseId) ?? Number.MAX_SAFE_INTEGER
  return leftOrder - rightOrder || left.id.localeCompare(right.id)
}

/** Final-output ordering: priority, plan order where applicable, then stable ID. */
export function compareFinalRecommendations(left: Recommendation, right: Recommendation, exerciseOrder: ReadonlyMap<string, number> = new Map()) {
  const priority = right.priority - left.priority
  if (priority) return priority
  const leftOrder = left.target.kind === 'exercise' ? exerciseOrder.get(left.target.exerciseId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
  const rightOrder = right.target.kind === 'exercise' ? exerciseOrder.get(right.target.exerciseId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
  return leftOrder - rightOrder || left.id.localeCompare(right.id)
}
