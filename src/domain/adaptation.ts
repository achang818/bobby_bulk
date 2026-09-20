import type { CoachingPreferenceState } from './coaching-preferences'
import { buildTrace } from './rules'
import { isExerciseAvailable } from './equipment'
import { findExerciseReplacement, replacementReasonDescription } from './exercise-replacement'
import { resolveMusclePriorities } from './muscle-priorities'
import { planExerciseIds, plannedExercisesFor } from './workout-session'
import { muscleTrainingState, isMuscleOpportunity, muscleOpportunityScore } from './training-state'
import type { Exercise, ExerciseCandidate, ExerciseRecommendationCandidate, TrainingState, TodaysContext, UserPreferences, WorkoutPlan } from './models'

// The limit protects a familiar workout from unnecessary churn; it is contextual, not universal.
export const MAX_CONTEXTUAL_SUBSTITUTIONS = 2
export const MINUTES_PER_WORKING_SET = 3
export const MINUTES_PER_EXERCISE_TRANSITION = 2

export function findContextualSubstitute(exercise: Exercise, exercises: Exercise[], todaysContext: TodaysContext, preferences: UserPreferences, excludedExerciseIds: Set<string> = new Set()): Exercise | undefined {
  return findContextualCandidates(exercise, exercises, todaysContext, preferences, excludedExerciseIds)[0]?.exercise
}

/** Context-specific adapter over the reusable exercise-intelligence pipeline. */
export function findContextualCandidates(exercise: Exercise, exercises: Exercise[], todaysContext: TodaysContext, preferences: UserPreferences, excludedExerciseIds: Set<string> = new Set(), coachingPreferences?: CoachingPreferenceState): ExerciseCandidate[] {
  if (isExerciseAvailable(exercise, todaysContext)) return []
  return findExerciseReplacement({
    originalExercise: exercise,
    reason: 'equipment-unavailable',
    exercises,
    goals: preferences.goals,
    priorityMuscles: resolveMusclePriorities(preferences).orderedMuscles,
    constraints: {
      availableEquipment: todaysContext.availableEquipment,
      unavailableEquipment: todaysContext.unavailableEquipment,
      excludedExerciseIds: [...excludedExerciseIds],
      requireSameCategory: true,
    },
    preferences,
    coachingPreferences,
  }).rankedCandidates
}

export function adaptWorkout(plan: WorkoutPlan, exercises: Exercise[], todaysContext: TodaysContext, preferences: UserPreferences, defaultGymId = preferences.defaultGymId, coachingPreferences?: CoachingPreferenceState): ExerciseRecommendationCandidate[] {
  const traveling = defaultGymId !== undefined && todaysContext.gymId !== defaultGymId
  const limit = traveling || todaysContext.availableEquipment !== undefined ? Number.POSITIVE_INFINITY : MAX_CONTEXTUAL_SUBSTITUTIONS
  let substitutions = 0
  const trace = buildTrace('adapt-unavailable-equipment')
  // Preserve distinct movement slots: do not substitute in an exercise already planned today.
  const plannedExercises = plannedExercisesFor(plan, exercises)
  const selectedSubstituteIds = new Set<string>(planExerciseIds(plan))
  return plannedExercises.flatMap((planned): ExerciseRecommendationCandidate[] => {
    const exerciseId = planned.exerciseId
    if (substitutions >= limit) return []
    const exercise = exercises.find((item) => item.id === exerciseId)
    if (!exercise || isExerciseAvailable(exercise, todaysContext)) return []
    const alternative = findContextualCandidates(exercise, exercises, todaysContext, preferences, selectedSubstituteIds, coachingPreferences)[0]
    if (!alternative) return todaysContext.availableEquipment === undefined ? [] : [{
      id: `context-remove-${plan.id}-${exercise.id}`, type: 'REMOVE', exerciseId: exercise.id,
      score: 6, reasons: [`${exercise.name} needs equipment unavailable at this gym today. No suitable replacement is available, so omit it for this session. Your saved plan stays unchanged.`], trace,
    }]
    substitutions += 1
    selectedSubstituteIds.add(alternative.exercise.id)
    return [{
      id: `context-${plan.id}-${exercise.id}`,
      type: 'REPLACE',
      exerciseId: exercise.id,
      alternativeExerciseId: alternative.exercise.id,
      score: 6,
      reasons: [replacementReasonDescription('equipment-unavailable'), ...alternative.reasons.slice(0, 3)],
      trace,
    }]
  })
}

export function estimateTypicalDuration(plan: WorkoutPlan, exercises: Exercise[]): number {
  const planExercises = plannedExercisesFor(plan, exercises)
  return planExercises.reduce((minutes, planned) => minutes + planned.sets * MINUTES_PER_WORKING_SET, 0) + planExercises.length * MINUTES_PER_EXERCISE_TRANSITION
}

export function adaptWorkoutForTime(plan: WorkoutPlan, exercises: Exercise[], availableMinutes: number | undefined, goalCriticalExerciseIds: string[] = [], state?: TrainingState, preferences?: UserPreferences): ExerciseRecommendationCandidate[] {
  if (availableMinutes === undefined) return []
  const typicalDuration = estimateTypicalDuration(plan, exercises)
  if (availableMinutes >= typicalDuration) return []

  const goalCritical = new Set(goalCriticalExerciseIds)
  const planExercises = plannedExercisesFor(plan, exercises).flatMap((planned) => {
    const exercise = exercises.find((item) => item.id === planned.exerciseId)
    return exercise ? [{ exercise, planned }] : []
  })
  const trace = buildTrace('adapt-available-time')
  const profile = resolveMusclePriorities(preferences)
  const protection = (exercise: Exercise) => {
    if (!state) return protectionScore(exercise, goalCritical)
    const muscles = exercise.primaryMuscles.map((muscle) => muscleTrainingState(state, muscle))
    if (muscles.some((muscle) => !isMuscleOpportunity(muscle))) return -1
    return Math.max(0, ...muscles.map((muscle) => {
      const rank = profile.rankOf(muscle.muscle)
      return rank === undefined ? 0 : muscleOpportunityScore(muscle, rank, profile.explicitMuscles.includes(muscle.muscle), profile.desiredFrequency(muscle.muscle, 3))
    }))
  }
  const orderedExercises = [...planExercises].sort((a, b) => protection(a.exercise) - protection(b.exercise)
    || Number(a.exercise.type === 'compound') - Number(b.exercise.type === 'compound') || a.planned.order - b.planned.order || a.exercise.id.localeCompare(b.exercise.id))
  const modifications = new Map<string, ExerciseRecommendationCandidate>()
  const removals: ExerciseRecommendationCandidate[] = []
  let minutesToSave = typicalDuration - availableMinutes

  for (const { exercise, planned } of orderedExercises) {
    if (minutesToSave <= 0) break
    const reducibleSets = Math.max(0, planned.sets - 1)
    const setsToRemove = Math.min(reducibleSets, Math.ceil(minutesToSave / MINUTES_PER_WORKING_SET))
    const remainingSets = planned.sets - setsToRemove
    if (setsToRemove > 0) modifications.set(exercise.id, {
      id: `time-modify-${plan.id}-${exercise.id}`,
      type: 'MODIFY',
      exerciseId: exercise.id,
      modifiedSets: remainingSets,
      score: 5,
      reasons: [`Reduce ${exercise.name} from ${planned.sets} sets to ${remainingSets} to fit today's ${availableMinutes}-minute limit.`, 'Lower-priority work is trimmed before an exercise is removed.'],
      trace,
    })
    minutesToSave -= setsToRemove * MINUTES_PER_WORKING_SET
    // Exhaust a lower-value opportunity before taking sets from a higher one.
    // Equal-value slots retain the existing reduce-before-remove behavior.
    if (state && minutesToSave > 0 && orderedExercises.some((item) => protection(item.exercise) > protection(exercise))) {
      modifications.delete(exercise.id)
      removals.push({ id: `time-remove-${plan.id}-${exercise.id}`, type: 'REMOVE', exerciseId: exercise.id, score: 4,
        reasons: [`Remove ${exercise.name} to fit today's ${availableMinutes}-minute limit while preserving higher-ranked muscle opportunities.`], trace })
      minutesToSave -= remainingSets * MINUTES_PER_WORKING_SET + MINUTES_PER_EXERCISE_TRANSITION
    }
  }

  if (minutesToSave > 0) {
    for (const { exercise, planned } of orderedExercises) {
      if (minutesToSave <= 0) break
      if (removals.some((item) => item.exerciseId === exercise.id)) continue
      const remainingSets = modifications.get(exercise.id)?.modifiedSets ?? planned.sets
      // A full removal supersedes a prior set reduction for the same exercise.
      modifications.delete(exercise.id)
      removals.push({
        id: `time-remove-${plan.id}-${exercise.id}`,
        type: 'REMOVE',
        exerciseId: exercise.id,
        score: 4,
        reasons: [`Remove ${exercise.name} as a last resort to fit today's ${availableMinutes}-minute limit.`, state ? 'Recent direct training and ordered muscle opportunities determine which work is trimmed first.' : 'Lower-priority work is trimmed first.'],
        trace,
      })
      minutesToSave -= remainingSets * MINUTES_PER_WORKING_SET + MINUTES_PER_EXERCISE_TRANSITION
    }
  }

  return [...modifications.values(), ...removals]
}

function protectionScore(exercise: Exercise, goalCritical: Set<string>) {
  return (goalCritical.has(exercise.id) ? 2 : 0) + (exercise.type === 'compound' ? 1 : 0)
}
