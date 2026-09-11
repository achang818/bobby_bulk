import { calculateExerciseFeatures, calculateMuscleFeatures } from './features'
import { recommendNext } from './progression'
import { findExerciseReplacement, replacementReasonDescription } from './exercise-replacement'
import { buildTrace, compareRecommendations } from './rules'
import { classifyPreference, rejectedKeepCount } from './states'
import { hasHypertrophyGoal, resolveMusclePriorities } from './muscle-priorities'
import { plannedExercisesFor } from './workout-session'
import type { AvailableLoad, Exercise, PlanRecommendation, RecommendationDecision, UserPreferences, Workout, WorkoutPlan } from './models'

// A single workout plan has no weekly split/calendar context. Three is a
// conservative opportunity ceiling for detecting sparse recent exposure; the
// split evaluator replaces it with its actual number of workout opportunities.
export const PLAN_FREQUENCY_OPPORTUNITIES = 3

type PriorityAddReason = 'missing-slot' | 'low-volume' | 'low-frequency'

export function evaluatePlan(plan: WorkoutPlan, exercises: Exercise[], history: Workout[], preferences: UserPreferences, asOf?: string, availableLoads?: AvailableLoad[], decisions: RecommendationDecision[] = []): PlanRecommendation[] {
  const recommendations: PlanRecommendation[] = []
  const plannedExercises = plannedExercisesFor(plan, exercises)
  const planExerciseIds = new Set(plannedExercises.map((planned) => planned.exerciseId))
  const planExercises = plannedExercises.flatMap((planned) => {
    const exercise = exercises.find((item) => item.id === planned.exerciseId)
    return exercise ? [{ exercise, planned }] : []
  })
  const otherPlanMuscles = new Set(planExercises.flatMap(({ exercise }) => exercise.primaryMuscles.map((muscle) => muscle.toLowerCase())))
  const exerciseOrder = new Map(plannedExercises.map((planned, index) => [planned.exerciseId, index]))
  const priorityProfile = resolveMusclePriorities(preferences)
  // One candidate can directly train more than one priority muscle. The first
  // (therefore highest-ranked) applicable priority owns its single ADD decision.
  const priorityAddExerciseIds = new Set<string>()

  for (const { exercise, planned } of planExercises) {
    const features = calculateExerciseFeatures(exercise, history, asOf)
    const progression = recommendNext(exercise, planned, history, availableLoads)
    const goalAligned = preferences.goals.length === 0 || exercise.goals.some((goal) => preferences.goals.includes(goal as UserPreferences['goals'][number])) || (hasHypertrophyGoal(preferences.goals) && exercise.goals.includes('Build muscle'))
    const preferenceState = classifyPreference(exercise.id, preferences, decisions)
    if (features.sessionsPerformed > 0 && progression.action !== 'start-here') {
      const trace = buildTrace('double-progression')
      recommendations.push({ id: `progression-${plan.id}-${exercise.id}`, type: 'PROGRESSION', exerciseId: exercise.id, score: features.progressionState === 'progressing' ? 4 : 3, progression, reasons: [progression.reasons[0], historicalPerformanceEvidence(features), progression.reasons[1]], trace })
    }
    if (features.sessionsPerformed >= 2 && goalAligned && preferenceState !== 'excluded' && ['progressing', 'stable'].includes(features.progressionState)) {
      const trace = buildTrace('keep-stable-exercise')
      recommendations.push({ id: `keep-${plan.id}-${exercise.id}`, type: 'KEEP', exerciseId: exercise.id, score: features.progressionState === 'progressing' ? 5 : 4, reasons: [trace.principleDescription, `Your recent performance is ${features.progressionState}.`], trace })
    }
    const replacementReason = features.progressionState === 'stalled' ? 'stalled' : features.progressionState === 'regressing' ? 'regressing' : undefined
    if (features.sessionsPerformed >= 3 && replacementReason && preferenceState !== 'excluded' && rejectedKeepCount(exercise.id, decisions) < 2) {
      // The state establishes that replacement is warranted. Candidate
      // eligibility and ranking are shared with contextual substitutions.
      const replacement = findExerciseReplacement({
        originalExercise: exercise,
        reason: replacementReason,
        exercises,
        goals: preferences.goals,
        priorityMuscles: priorityProfile.orderedMuscles,
        constraints: { excludedExerciseIds: [...planExerciseIds], requireSameCategory: true },
        preferences,
        decisions,
      })
      const alternative = replacement.selectedCandidate
      if (alternative) {
        const specific = replacementReason === 'stalled' && isSpecificIsolationReplacement(alternative.exercise, exercise)
        const trace = buildTrace(replacementReason === 'regressing' ? 'replace-on-regression' : specific ? 'replace-on-stall-specific' : 'replace-on-stall')
        recommendations.push({ id: `replace-${plan.id}-${exercise.id}`, type: 'REPLACE', exerciseId: exercise.id, alternativeExerciseId: alternative.exercise.id, score: 4, reasons: [replacementReasonDescription(replacementReason), ...alternative.reasons.slice(0, 3)], trace })
      }
    }
  }

  for (const [priorityRank, priority] of priorityProfile.orderedMuscles.entries()) {
    const muscle = calculateMuscleFeatures(priority, exercises, history, asOf)
    const represented = planExercises.some(({ exercise }) => exercise.primaryMuscles.some((item) => item.toLowerCase() === priority.toLowerCase()))
    const normalizedPriority = priority.toLowerCase()
    const priorityCandidates = exercises.filter((exercise) => !planExerciseIds.has(exercise.id) && classifyPreference(exercise.id, preferences, decisions) !== 'excluded' && exercise.primaryMuscles.some((item) => item.toLowerCase() === normalizedPriority) && (preferences.goals.length === 0 || exercise.goals.some((goal) => preferences.goals.includes(goal as UserPreferences['goals'][number])) || (hasHypertrophyGoal(preferences.goals) && exercise.goals.includes('Build muscle'))))
    // Sparse plans have too little existing context to constrain a legitimate priority add.
    const shouldCheckCoherence = plannedExercises.length >= 2 && otherPlanMuscles.size > 0
    const coherentCandidates = shouldCheckCoherence
      // Secondary muscles can establish session fit, but never count as direct volume.
      ? priorityCandidates.filter((candidate) => [...candidate.primaryMuscles.filter((muscleName) => muscleName.toLowerCase() !== normalizedPriority), ...candidate.secondaryMuscles].some((muscleName) => otherPlanMuscles.has(muscleName.toLowerCase())))
      : priorityCandidates
    const candidate = coherentCandidates[0]
    const coherenceMattered = shouldCheckCoherence && coherentCandidates.length < priorityCandidates.length
    const desiredFrequency = priorityProfile.desiredFrequency(priority, PLAN_FREQUENCY_OPPORTUNITIES)
    const addReason = priorityAddReason(muscle, desiredFrequency)
    if (!represented && candidate && addReason && !priorityAddExerciseIds.has(candidate.id)) {
      // The trace taxonomy has no separate "missing slot" rule. Reusing the
      // volume-hypertrophy trace here is intentional: it supports establishing
      // direct work, while the explicit reason below makes clear this is not
      // inferred historical volume or performance evidence.
      const trace = buildTrace(addReason === 'low-frequency' ? 'add-for-priority-frequency' : 'add-for-priority-volume')
      recommendations.push({ id: `add-${plan.id}-${candidate.id}`, type: 'ADD', exerciseId: candidate.id, score: addReason === 'missing-slot' ? Math.max(4, 5 - Math.min(priorityRank, 2)) : Math.max(3, 5 - Math.min(priorityRank, 2)), reasons: [`${priority} is priority #${priorityRank + 1}.`, ...(addReason === 'missing-slot' ? ['No direct working-set history or planned slot exists for this priority yet.'] : []), trace.principleDescription, ...(addReason === 'low-frequency' ? [`Its recent frequency is below the ${desiredFrequency}-exposure priority target when practical.`] : []), ...(addReason === 'low-volume' && coherenceMattered ? ["This exercise fits your plan's existing muscle groups."] : [])], trace })
      priorityAddExerciseIds.add(candidate.id)
    }
  }
  return recommendations.sort((left, right) => compareRecommendations(left, right, exerciseOrder))
}

/**
 * Priority evidence has a deterministic order. A missing direct slot is not
 * measured low volume: the history model intentionally reports it as unknown.
 */
function priorityAddReason(muscle: ReturnType<typeof calculateMuscleFeatures>, desiredFrequency: number): PriorityAddReason | undefined {
  if (muscle.historyConfidence === 'none') return 'missing-slot'
  if (muscle.volumeState === 'low recent volume') return 'low-volume'
  if (muscle.frequency14Days > 0 && muscle.frequency14Days < desiredFrequency * 2) return 'low-frequency'
  return undefined
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

function isSpecificIsolationReplacement(candidate: Exercise, stalledExercise: Exercise): boolean {
  if (stalledExercise.type !== 'isolation' || candidate.type !== 'isolation') return false
  const stalledMuscles = new Set(stalledExercise.primaryMuscles)
  return stalledMuscles.size === candidate.primaryMuscles.length && candidate.primaryMuscles.every((muscle) => stalledMuscles.has(muscle))
}
