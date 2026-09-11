import { calculateExerciseFeatures, calculateMuscleFeatures } from './features'
import { recommendNext } from './progression'
import { buildTrace } from './rules'
import { classifyPreference, rejectedKeepCount } from './states'
import { hasHypertrophyGoal, resolveMusclePriorities } from './muscle-priorities'
import { plannedExercisesFor } from './workout-session'
import type { AvailableLoad, Exercise, PlanRecommendation, RecommendationDecision, UserPreferences, Workout, WorkoutPlan } from './models'

export function evaluatePlan(plan: WorkoutPlan, exercises: Exercise[], history: Workout[], preferences: UserPreferences, asOf?: string, availableLoads?: AvailableLoad[], decisions: RecommendationDecision[] = []): PlanRecommendation[] {
  const recommendations: PlanRecommendation[] = []
  const plannedExercises = plannedExercisesFor(plan, exercises)
  const planExerciseIds = new Set(plannedExercises.map((planned) => planned.exerciseId))
  const planExercises = plannedExercises.flatMap((planned) => {
    const exercise = exercises.find((item) => item.id === planned.exerciseId)
    return exercise ? [{ exercise, planned }] : []
  })
  const otherPlanMuscles = new Set(planExercises.flatMap(({ exercise }) => exercise.primaryMuscles.map((muscle) => muscle.toLowerCase())))
  const priorityProfile = resolveMusclePriorities(preferences)

  for (const { exercise, planned } of planExercises) {
    const features = calculateExerciseFeatures(exercise, history, asOf)
    const progression = recommendNext(exercise, planned, history, availableLoads)
    const goalAligned = preferences.goals.length === 0 || exercise.goals.some((goal) => preferences.goals.includes(goal as UserPreferences['goals'][number])) || (hasHypertrophyGoal(preferences.goals) && exercise.goals.includes('Build muscle'))
    const preferenceState = classifyPreference(exercise.id, preferences, decisions)
    if (features.sessionsPerformed > 0 && progression.action !== 'start-here') {
      const trace = buildTrace('double-progression')
      recommendations.push({ id: `progression-${plan.id}-${exercise.id}`, type: 'PROGRESSION', exerciseId: exercise.id, score: features.progressionState === 'progressing' ? 4 : 3, progression, reasons: [progression.reasons[0], historicalPerformanceEvidence(features), progression.reasons[1]], trace })
    }
    if (features.sessionsPerformed >= 2 && goalAligned && preferenceState !== 'disliked' && ['progressing', 'stable'].includes(features.progressionState)) {
      const trace = buildTrace('keep-stable-exercise')
      recommendations.push({ id: `keep-${plan.id}-${exercise.id}`, type: 'KEEP', exerciseId: exercise.id, score: features.progressionState === 'progressing' ? 5 : 4, reasons: [trace.principleDescription, `Your recent performance is ${features.progressionState}.`], trace })
    }
    if (features.sessionsPerformed >= 3 && features.progressionState === 'stalled' && preferenceState !== 'disliked' && rejectedKeepCount(exercise.id, decisions) < 2) {
      const alternatives = exercises
        .filter((candidate) => candidate.id !== exercise.id && !planExerciseIds.has(candidate.id) && candidate.category === exercise.category && candidate.primaryMuscles.some((muscle) => exercise.primaryMuscles.includes(muscle)) && classifyPreference(candidate.id, preferences, decisions) !== 'disliked')
        .sort((a, b) => specificityScore(b, exercise) - specificityScore(a, exercise))
      const alternative = alternatives[0]
      if (alternative) {
        const specific = specificityScore(alternative, exercise) > 0
        const trace = buildTrace(specific ? 'replace-on-stall-specific' : 'replace-on-stall')
        recommendations.push({ id: `replace-${plan.id}-${exercise.id}`, type: 'REPLACE', exerciseId: exercise.id, alternativeExerciseId: alternative.id, score: 4, reasons: [trace.principleDescription, `${alternative.name} trains a similar movement and muscle target.`], trace })
      }
    }
  }

  for (const [priorityRank, priority] of priorityProfile.orderedMuscles.entries()) {
    const muscle = calculateMuscleFeatures(priority, exercises, history, asOf)
    const represented = planExercises.some(({ exercise }) => exercise.primaryMuscles.some((item) => item.toLowerCase() === priority.toLowerCase()))
    const normalizedPriority = priority.toLowerCase()
    const priorityCandidates = exercises.filter((exercise) => !planExerciseIds.has(exercise.id) && classifyPreference(exercise.id, preferences, decisions) !== 'disliked' && exercise.primaryMuscles.some((item) => item.toLowerCase() === normalizedPriority) && (preferences.goals.length === 0 || exercise.goals.some((goal) => preferences.goals.includes(goal as UserPreferences['goals'][number])) || (hasHypertrophyGoal(preferences.goals) && exercise.goals.includes('Build muscle'))))
    // Sparse plans have too little existing context to constrain a legitimate priority add.
    const shouldCheckCoherence = plannedExercises.length >= 2 && otherPlanMuscles.size > 0
    const coherentCandidates = shouldCheckCoherence
      // Secondary muscles can establish session fit, but never count as direct volume.
      ? priorityCandidates.filter((candidate) => [...candidate.primaryMuscles.filter((muscleName) => muscleName.toLowerCase() !== normalizedPriority), ...candidate.secondaryMuscles].some((muscleName) => otherPlanMuscles.has(muscleName.toLowerCase())))
      : priorityCandidates
    const candidate = coherentCandidates[0]
    const coherenceMattered = shouldCheckCoherence && coherentCandidates.length < priorityCandidates.length
    const lowVolume = muscle.volumeState === 'low recent volume'
    const desiredFrequency = priorityProfile.desiredFrequency(priority, 3)
    const lowFrequency = muscle.frequency14Days > 0 && muscle.frequency14Days < desiredFrequency * 2
    if (!represented && candidate && (lowVolume || lowFrequency)) {
      const trace = buildTrace(lowVolume ? 'add-for-priority-volume' : 'add-for-priority-frequency')
      recommendations.push({ id: `add-${plan.id}-${candidate.id}`, type: 'ADD', exerciseId: candidate.id, score: muscle.rolling28DaySets === 0 ? 5 : Math.max(3, 5 - Math.min(priorityRank, 2)), reasons: [`${priority} is priority #${priorityRank + 1}.`, trace.principleDescription, ...(lowFrequency ? [`Its recent frequency is below the ${desiredFrequency}-exposure priority target when practical.`] : []), ...(lowVolume && coherenceMattered ? ["This exercise fits your plan's existing muscle groups."] : [])], trace })
    }
  }
  return recommendations.sort((a, b) => b.score - a.score)
}

function historicalPerformanceEvidence(features: ReturnType<typeof calculateExerciseFeatures>): string {
  const latest = features.mostRecentPerformance
  if (!latest) return 'No completed working-set performance is available yet.'
  const completion = latest.plannedSets === undefined
    ? 'This session had no saved prescription snapshot.'
    : `Last prescription was ${latest.completion}: ${latest.completedWorkingSets}/${latest.plannedSets} working sets.`
  const effort = latest.bestWorkingSet?.rir === undefined ? latest.bestWorkingSet?.rpe === undefined ? '' : ` Best working set recorded at RPE ${round(latest.bestWorkingSet.rpe)}.` : ` Best working set recorded at ${round(latest.bestWorkingSet.rir)} RIR.`
  return `${completion}${effort}`
}

function round(value: number) { return Math.round(value * 10) / 10 }

function specificityScore(candidate: Exercise, stalledExercise: Exercise): number {
  if (stalledExercise.type !== 'isolation' || candidate.type !== 'isolation') return 0
  const stalledMuscles = new Set(stalledExercise.primaryMuscles)
  return stalledMuscles.size === candidate.primaryMuscles.length && candidate.primaryMuscles.every((muscle) => stalledMuscles.has(muscle)) ? 1 : 0
}
