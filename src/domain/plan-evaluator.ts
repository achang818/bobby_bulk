import { calculateExerciseFeatures, calculateMuscleFeatures } from './features'
import { recommendNext } from './progression'
import { buildTrace } from './rules'
import { classifyPreference } from './states'
import type { AvailableLoad, Exercise, PlanRecommendation, UserPreferences, Workout, WorkoutPlan } from './models'

export function evaluatePlan(plan: WorkoutPlan, exercises: Exercise[], history: Workout[], preferences: UserPreferences, asOf?: string, availableLoads?: AvailableLoad[]): PlanRecommendation[] {
  const recommendations: PlanRecommendation[] = []
  const planExercises = plan.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)).filter((exercise): exercise is Exercise => Boolean(exercise))
  const otherPlanMuscles = new Set(planExercises.flatMap((exercise) => exercise.primaryMuscles.map((muscle) => muscle.toLowerCase())))

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
      const alternatives = exercises
        .filter((candidate) => candidate.id !== exercise.id && !plan.exerciseIds.includes(candidate.id) && candidate.category === exercise.category && candidate.primaryMuscles.some((muscle) => exercise.primaryMuscles.includes(muscle)) && classifyPreference(candidate.id, preferences) !== 'disliked')
        .sort((a, b) => specificityScore(b, exercise) - specificityScore(a, exercise))
      const alternative = alternatives[0]
      if (alternative) {
        const specific = specificityScore(alternative, exercise) > 0
        const trace = buildTrace(specific ? 'replace-on-stall-specific' : 'replace-on-stall')
        recommendations.push({ id: `replace-${plan.id}-${exercise.id}`, type: 'REPLACE', exerciseId: exercise.id, alternativeExerciseId: alternative.id, score: 4, reasons: [trace.principleDescription, `${alternative.name} trains a similar movement and muscle target.`], trace })
      }
    }
  }

  for (const priority of preferences.priorities) {
    const muscle = calculateMuscleFeatures(priority, exercises, history, asOf)
    const represented = planExercises.some((exercise) => exercise.primaryMuscles.some((item) => item.toLowerCase() === priority.toLowerCase()))
    const normalizedPriority = priority.toLowerCase()
    const priorityCandidates = exercises.filter((exercise) => !plan.exerciseIds.includes(exercise.id) && classifyPreference(exercise.id, preferences) !== 'disliked' && exercise.primaryMuscles.some((item) => item.toLowerCase() === normalizedPriority) && (preferences.goals.length === 0 || exercise.goals.some((goal) => preferences.goals.includes(goal as UserPreferences['goals'][number]))))
    // Sparse plans have too little existing context to constrain a legitimate priority add.
    const shouldCheckCoherence = planExercises.length >= 2 && otherPlanMuscles.size > 0
    const coherentCandidates = shouldCheckCoherence
      ? priorityCandidates.filter((candidate) => candidate.primaryMuscles.some((muscleName) => muscleName.toLowerCase() !== normalizedPriority && otherPlanMuscles.has(muscleName.toLowerCase())))
      : priorityCandidates
    const candidate = coherentCandidates[0]
    const coherenceMattered = shouldCheckCoherence && coherentCandidates.length < priorityCandidates.length
    const lowVolume = muscle.volumeState === 'low recent volume'
    const lowFrequency = muscle.frequency14Days === 1
    if (!represented && candidate && (lowVolume || lowFrequency)) {
      const trace = buildTrace(lowVolume ? 'add-for-priority-volume' : 'add-for-priority-frequency')
      recommendations.push({ id: `add-${plan.id}-${candidate.id}`, type: 'ADD', exerciseId: candidate.id, score: muscle.rolling28DaySets === 0 ? 5 : 4, reasons: [`${priority} is one of your current priorities.`, trace.principleDescription, ...(lowVolume && coherenceMattered ? ["This exercise fits your plan's existing muscle groups."] : [])], trace })
    }
  }
  return recommendations.sort((a, b) => b.score - a.score)
}

function specificityScore(candidate: Exercise, stalledExercise: Exercise): number {
  if (stalledExercise.type !== 'isolation' || candidate.type !== 'isolation') return 0
  const stalledMuscles = new Set(stalledExercise.primaryMuscles)
  return stalledMuscles.size === candidate.primaryMuscles.length && candidate.primaryMuscles.every((muscle) => stalledMuscles.has(muscle)) ? 1 : 0
}
