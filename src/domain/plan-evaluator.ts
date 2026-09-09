import { calculateExerciseFeatures, calculateMuscleFeatures } from './features'
import { recommendNext } from './progression'
import { buildTrace } from './rules'
import { classifyPreference } from './states'
import type { AvailableLoad, Exercise, PlanRecommendation, UserPreferences, Workout, WorkoutPlan } from './models'

export function evaluatePlan(plan: WorkoutPlan, exercises: Exercise[], history: Workout[], preferences: UserPreferences, asOf?: string, availableLoads?: AvailableLoad[]): PlanRecommendation[] {
  const recommendations: PlanRecommendation[] = []
  const planExercises = plan.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)).filter((exercise): exercise is Exercise => Boolean(exercise))

  for (const exercise of planExercises) {
    const features = calculateExerciseFeatures(exercise, history, asOf)
    const progression = recommendNext(exercise, history, availableLoads)
    const goalAligned = preferences.goals.length === 0 || exercise.goals.some((goal) => preferences.goals.includes(goal as UserPreferences['goals'][number]))
    const preferenceState = classifyPreference(exercise.id, preferences)
    if (features.sessionsPerformed > 0 && progression.action !== 'start-here') {
      const trace = buildTrace('double-progression')
      recommendations.push({ id: `progression-${plan.id}-${exercise.id}`, type: 'PROGRESSION', exerciseId: exercise.id, score: features.progressionState === 'progressing' ? 4 : 3, progression, reasons: [progression.reasons[0], progression.reasons[1]], trace })
    }
    if (features.sessionsPerformed >= 2 && goalAligned && preferenceState !== 'disliked' && ['progressing', 'stable'].includes(features.progressionState)) {
      const trace = buildTrace('keep-stable-exercise')
      recommendations.push({ id: `keep-${plan.id}-${exercise.id}`, type: 'KEEP', exerciseId: exercise.id, score: features.progressionState === 'progressing' ? 5 : 4, reasons: [trace.principleDescription, `Your recent performance is ${features.progressionState}.`], trace })
    }
    if (features.sessionsPerformed >= 3 && features.progressionState === 'stalled' && preferenceState !== 'disliked') {
      const alternative = exercises.find((candidate) => candidate.id !== exercise.id && !plan.exerciseIds.includes(candidate.id) && candidate.category === exercise.category && candidate.primaryMuscles.some((muscle) => exercise.primaryMuscles.includes(muscle)) && classifyPreference(candidate.id, preferences) !== 'disliked')
      if (alternative) {
        const trace = buildTrace('replace-on-stall')
        recommendations.push({ id: `replace-${plan.id}-${exercise.id}`, type: 'REPLACE', exerciseId: exercise.id, alternativeExerciseId: alternative.id, score: 4, reasons: [trace.principleDescription, `${alternative.name} trains a similar movement and muscle target.`], trace })
      }
    }
  }

  for (const priority of preferences.priorities) {
    const muscle = calculateMuscleFeatures(priority, exercises, history, asOf)
    const represented = planExercises.some((exercise) => exercise.primaryMuscles.some((item) => item.toLowerCase() === priority.toLowerCase()))
    const candidate = exercises.find((exercise) => !plan.exerciseIds.includes(exercise.id) && classifyPreference(exercise.id, preferences) !== 'disliked' && exercise.primaryMuscles.some((item) => item.toLowerCase() === priority.toLowerCase()) && (preferences.goals.length === 0 || exercise.goals.some((goal) => preferences.goals.includes(goal as UserPreferences['goals'][number]))))
    if (!represented && candidate && muscle.volumeState === 'low recent volume') {
      const trace = buildTrace('add-for-priority-volume')
      recommendations.push({ id: `add-${plan.id}-${candidate.id}`, type: 'ADD', exerciseId: candidate.id, score: muscle.rolling28DaySets === 0 ? 5 : 4, reasons: [`${priority} is one of your current priorities.`, trace.principleDescription], trace })
    }
  }
  return recommendations.sort((a, b) => b.score - a.score)
}