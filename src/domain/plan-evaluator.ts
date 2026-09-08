import { calculateExerciseFeatures, calculateMuscleFeatures } from './features'
import { recommendNext } from './progression'
import type { Exercise, PlanRecommendation, UserPreferences, Workout, WorkoutPlan } from './models'

export function evaluatePlan(plan: WorkoutPlan, exercises: Exercise[], history: Workout[], preferences: UserPreferences, asOf?: string): PlanRecommendation[] {
  const recommendations: PlanRecommendation[] = []
  const planExercises = plan.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)).filter((exercise): exercise is Exercise => Boolean(exercise))

  for (const exercise of planExercises) {
    const features = calculateExerciseFeatures(exercise, history, asOf)
    const progression = recommendNext(exercise, history)
    const goalAligned = preferences.goals.length === 0 || exercise.goals.some((goal) => preferences.goals.includes(goal as UserPreferences['goals'][number]))
    const disliked = preferences.dislikedExerciseIds.includes(exercise.id)
    if (features.sessionsPerformed > 0 && progression.action !== 'start-here') {
      recommendations.push({ id: `progression-${plan.id}-${exercise.id}`, type: 'PROGRESSION', exerciseId: exercise.id, score: features.progressionState === 'progressing' ? 4 : 3, progression, reasons: [progression.reasons[0], progression.reasons[1]] })
    }
    if (features.sessionsPerformed >= 2 && goalAligned && !disliked && ['progressing', 'stable'].includes(features.progressionState)) {
      recommendations.push({ id: `keep-${plan.id}-${exercise.id}`, type: 'KEEP', exerciseId: exercise.id, score: features.progressionState === 'progressing' ? 5 : 4, reasons: [preferences.goals.length ? 'This exercise fits one of your stated goals.' : 'There is personal history to evaluate this exercise.', `Your recent performance is ${features.progressionState}.`, 'No preference or evidence-based issue currently requires a change.'] })
    }
    if (features.sessionsPerformed >= 3 && features.progressionState === 'stalled' && !disliked) {
      const alternative = exercises.find((candidate) => candidate.id !== exercise.id && !plan.exerciseIds.includes(candidate.id) && candidate.category === exercise.category && candidate.primaryMuscles.some((muscle) => exercise.primaryMuscles.includes(muscle)) && !preferences.dislikedExerciseIds.includes(candidate.id))
      if (alternative) recommendations.push({ id: `replace-${plan.id}-${exercise.id}`, type: 'REPLACE', exerciseId: exercise.id, alternativeExerciseId: alternative.id, score: 4, reasons: ['This exercise has shown a stable performance pattern across multiple sessions.', `${alternative.name} trains a similar movement and muscle target.`, 'The alternative is available in the exercise database and is not marked disliked.'] })
    }
  }

  for (const priority of preferences.priorities) {
    const muscle = calculateMuscleFeatures(priority, exercises, history, asOf)
    const represented = planExercises.some((exercise) => exercise.primaryMuscles.some((item) => item.toLowerCase() === priority.toLowerCase()))
    const candidate = exercises.find((exercise) => !plan.exerciseIds.includes(exercise.id) && !preferences.dislikedExerciseIds.includes(exercise.id) && exercise.primaryMuscles.some((item) => item.toLowerCase() === priority.toLowerCase()) && (preferences.goals.length === 0 || exercise.goals.some((goal) => preferences.goals.includes(goal as UserPreferences['goals'][number]))))
    if (!represented && candidate && muscle.volumeState === 'low recent volume') {
      recommendations.push({ id: `add-${plan.id}-${candidate.id}`, type: 'ADD', exerciseId: candidate.id, score: muscle.rolling28DaySets === 0 ? 5 : 4, reasons: [`${priority} is one of your current priorities.`, `Recent direct ${priority.toLowerCase()} volume is ${muscle.volumeState}.`, `${candidate.name} matches that muscle focus and is not marked disliked.`] })
    }
  }
  return recommendations.sort((a, b) => b.score - a.score)
}