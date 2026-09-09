import type { PlanRecommendation, WorkoutTemplate } from './models'

export function applyAcceptedRecommendation(plan: WorkoutTemplate, recommendation: PlanRecommendation): WorkoutTemplate {
  switch (recommendation.type) {
    case 'REPLACE':
      return recommendation.alternativeExerciseId
        ? { ...plan, exerciseIds: plan.exerciseIds.map((id) => id === recommendation.exerciseId ? recommendation.alternativeExerciseId as string : id) }
        : plan
    case 'ADD':
      return plan.exerciseIds.includes(recommendation.exerciseId)
        ? plan
        : { ...plan, exerciseIds: [...plan.exerciseIds, recommendation.exerciseId] }
    case 'REMOVE':
      return { ...plan, exerciseIds: plan.exerciseIds.filter((id) => id !== recommendation.exerciseId) }
    default:
      return plan
  }
}
