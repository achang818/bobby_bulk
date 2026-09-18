import type { PlannedExercise, Recommendation, RecommendationDecision, SessionPrescriptionChange, WeightUnit } from './models'

export function affectedExerciseIds(recommendation: Recommendation): string[] {
  if (recommendation.change.kind === 'replace') return [recommendation.change.fromExerciseId, recommendation.change.toExerciseId]
  if ('exerciseId' in recommendation.change) return [recommendation.change.exerciseId]
  return recommendation.target.kind === 'exercise' ? [recommendation.target.exerciseId] : []
}

export function captureRecommendationChange(recommendation: Recommendation, before: PlannedExercise[], after: PlannedExercise[], unit: WeightUnit, applied: boolean, decision?: RecommendationDecision): SessionPrescriptionChange {
  const ids = affectedExerciseIds(recommendation)
  const source = decision?.decision === 'rejected' ? 'rejected-recommendation'
    : decision?.decision === 'dismissed' ? 'dismissed-recommendation'
      : recommendation.trace.ruleId === 'adapt-unavailable-equipment' ? 'equipment'
    : recommendation.trace.ruleId === 'adapt-available-time' ? 'time'
      : decision?.decision === 'accepted' ? 'accepted-recommendation' : 'selected-recommendation'
  const original = before.filter((slot) => ids.includes(slot.exerciseId))
  const resulting = after.filter((slot) => ids.includes(slot.exerciseId))
  const material = original.length !== resulting.length || original.some((slot) => !resulting.some((next) => samePrescription(slot, next)))
  return structuredClone({ id: decision?.id ?? recommendation.id, source, recommendation, ...(decision ? { decision } : {}), unit,
    before: original, after: resulting, applied: applied && material && decision?.decision !== 'rejected' && decision?.decision !== 'dismissed', reason: recommendation.reason })
}

/** Ignores slot ordering, which can change when another movement is omitted. */
export function samePrescription(left: PlannedExercise, right: PlannedExercise) {
  return left.exerciseId === right.exerciseId && left.sets === right.sets && left.setType === right.setType
    && left.repRange.min === right.repRange.min && left.repRange.max === right.repRange.max
    && JSON.stringify(left.loadRecommendation) === JSON.stringify(right.loadRecommendation)
}

export function latestPlanDecisions(decisions: RecommendationDecision[], planId: string): RecommendationDecision[] {
  const latest = new Map<string, RecommendationDecision>()
  for (const decision of [...decisions].filter((item) => !item.planId || item.planId === planId)
    .sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? '') || a.id.localeCompare(b.id))) latest.set(decision.recommendationId, decision)
  return [...latest.values()]
}

/** A stable rule ID does not make a changed load or exercise proposal accepted. */
export function decisionForRecommendation(recommendation: Recommendation, decisions: RecommendationDecision[], planId: string, unit: WeightUnit): RecommendationDecision | undefined {
  const decision = latestPlanDecisions(decisions, planId).find((item) => item.recommendationId === recommendation.id)
  if (!decision?.recommendation || decision.recommendation.type !== recommendation.type) return undefined
  if (recommendation.type === 'PROGRESSION' && decision.unit && decision.unit !== unit) return undefined
  return JSON.stringify(decision.recommendation.change) === JSON.stringify(recommendation.change)
    && JSON.stringify(decision.recommendation.target) === JSON.stringify(recommendation.target) ? decision : undefined
}
