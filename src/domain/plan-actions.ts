import type { PlanRecommendation, WorkoutTemplate } from './models'
import { createPlannedExercise, normalizeWorkoutTemplate, planExerciseIds } from './workout-session'

export function applyAcceptedRecommendation(plan: WorkoutTemplate, recommendation: PlanRecommendation): WorkoutTemplate {
  const normalizedPlan = normalizeWorkoutTemplate(plan)
  switch (recommendation.type) {
    case 'REPLACE':
      return recommendation.alternativeExerciseId
        ? synchronizePlan({ ...normalizedPlan, plannedExercises: normalizedPlan.plannedExercises!.map((exercise) => exercise.exerciseId === recommendation.exerciseId ? { ...exercise, exerciseId: recommendation.alternativeExerciseId as string } : exercise) })
        : normalizedPlan
    case 'ADD':
      return planExerciseIds(normalizedPlan).includes(recommendation.exerciseId)
        ? normalizedPlan
        : synchronizePlan({ ...normalizedPlan, plannedExercises: [...normalizedPlan.plannedExercises!, createPlannedExercise(recommendation.exerciseId, normalizedPlan.plannedExercises!.length)] })
    case 'REMOVE':
      return synchronizePlan({ ...normalizedPlan, plannedExercises: normalizedPlan.plannedExercises!.filter((exercise) => exercise.exerciseId !== recommendation.exerciseId).map((exercise, order) => ({ ...exercise, order })) })
    default:
      return normalizedPlan
  }
}

function synchronizePlan(plan: WorkoutTemplate): WorkoutTemplate {
  return { ...plan, exerciseIds: planExerciseIds(plan) }
}
