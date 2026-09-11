import type { Recommendation, WorkoutTemplate } from './models'
import { createPlannedExercise, normalizeWorkoutTemplate, planExerciseIds, synchronizePlan } from './workout-session'

export function applyAcceptedRecommendation(plan: WorkoutTemplate, recommendation: Recommendation): WorkoutTemplate {
  const normalizedPlan = normalizeWorkoutTemplate(plan)
  switch (recommendation.type) {
    case 'REPLACE':
      if (recommendation.change.kind !== 'replace') return normalizedPlan
      { const change = recommendation.change
        return synchronizePlan({ ...normalizedPlan, plannedExercises: normalizedPlan.plannedExercises!.map((exercise) => exercise.exerciseId === change.fromExerciseId ? { ...exercise, exerciseId: change.toExerciseId } : exercise) }) }
    case 'ADD':
      if (recommendation.change.kind !== 'add') return normalizedPlan
      { const change = recommendation.change
      return planExerciseIds(normalizedPlan).includes(change.exerciseId)
        ? normalizedPlan
        : synchronizePlan({ ...normalizedPlan, plannedExercises: [...normalizedPlan.plannedExercises!, createPlannedExercise(change.exerciseId, normalizedPlan.plannedExercises!.length)] }) }
    case 'REMOVE':
      if (recommendation.change.kind !== 'remove') return normalizedPlan
      { const change = recommendation.change
        return synchronizePlan({ ...normalizedPlan, plannedExercises: normalizedPlan.plannedExercises!.filter((exercise) => exercise.exerciseId !== change.exerciseId).map((exercise, order) => ({ ...exercise, order })) }) }
    case 'MODIFY':
      if (recommendation.change.kind !== 'modify' || recommendation.change.changes.sets === undefined) return normalizedPlan
      { const change = recommendation.change
        return synchronizePlan({ ...normalizedPlan, plannedExercises: normalizedPlan.plannedExercises!.map((exercise) => exercise.exerciseId === change.exerciseId ? { ...exercise, sets: change.changes.sets! } : exercise) }) }
    default:
      return normalizedPlan
  }
}
