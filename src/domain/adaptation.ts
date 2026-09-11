import { buildTrace } from './rules'
import { equipmentTagFor } from './equipment'
import { findExerciseReplacement, replacementReasonDescription } from './exercise-replacement'
import { resolveMusclePriorities } from './muscle-priorities'
import { planExerciseIds, plannedExercisesFor } from './workout-session'
import type { Exercise, ExerciseCandidate, PlanRecommendation, TodaysContext, UserPreferences, WorkoutPlan } from './models'

// The limit protects a familiar workout from unnecessary churn; it is contextual, not universal.
export const MAX_CONTEXTUAL_SUBSTITUTIONS = 2
export const MINUTES_PER_WORKING_SET = 3
export const MINUTES_PER_EXERCISE_TRANSITION = 2

export function findContextualSubstitute(exercise: Exercise, exercises: Exercise[], todaysContext: TodaysContext, preferences: UserPreferences, excludedExerciseIds: Set<string> = new Set()): Exercise | undefined {
  return findContextualCandidates(exercise, exercises, todaysContext, preferences, excludedExerciseIds)[0]?.exercise
}

/** Context-specific adapter over the reusable exercise-intelligence pipeline. */
export function findContextualCandidates(exercise: Exercise, exercises: Exercise[], todaysContext: TodaysContext, preferences: UserPreferences, excludedExerciseIds: Set<string> = new Set()): ExerciseCandidate[] {
  if (!todaysContext.unavailableEquipment.includes(equipmentTagFor(exercise))) return []
  return findExerciseReplacement({
    originalExercise: exercise,
    reason: 'equipment-unavailable',
    exercises,
    goals: preferences.goals,
    priorityMuscles: resolveMusclePriorities(preferences).orderedMuscles,
    constraints: {
      unavailableEquipment: todaysContext.unavailableEquipment,
      excludedExerciseIds: [...excludedExerciseIds],
      requireSameCategory: true,
    },
    preferences,
  }).rankedCandidates
}

export function adaptWorkout(plan: WorkoutPlan, exercises: Exercise[], todaysContext: TodaysContext, preferences: UserPreferences, defaultGymId = preferences.defaultGymId): PlanRecommendation[] {
  const traveling = defaultGymId !== undefined && todaysContext.gymId !== defaultGymId
  const limit = traveling ? Number.POSITIVE_INFINITY : MAX_CONTEXTUAL_SUBSTITUTIONS
  let substitutions = 0
  const trace = buildTrace('adapt-unavailable-equipment')
  // Preserve distinct movement slots: do not substitute in an exercise already planned today.
  const plannedExercises = plannedExercisesFor(plan, exercises)
  const selectedSubstituteIds = new Set<string>(planExerciseIds(plan))
  return plannedExercises.flatMap((planned) => {
    const exerciseId = planned.exerciseId
    if (substitutions >= limit) return []
    const exercise = exercises.find((item) => item.id === exerciseId)
    if (!exercise) return []
    const alternative = findContextualCandidates(exercise, exercises, todaysContext, preferences, selectedSubstituteIds)[0]
    if (!alternative) return []
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

export function adaptWorkoutForTime(plan: WorkoutPlan, exercises: Exercise[], availableMinutes: number | undefined, goalCriticalExerciseIds: string[] = []): PlanRecommendation[] {
  if (availableMinutes === undefined) return []
  const typicalDuration = estimateTypicalDuration(plan, exercises)
  if (availableMinutes >= typicalDuration) return []

  const goalCritical = new Set(goalCriticalExerciseIds)
  const planExercises = plannedExercisesFor(plan, exercises).flatMap((planned) => {
    const exercise = exercises.find((item) => item.id === planned.exerciseId)
    return exercise ? [{ exercise, planned }] : []
  })
  const trace = buildTrace('adapt-available-time')
  const orderedExercises = [...planExercises].sort((a, b) => protectionScore(a.exercise, goalCritical) - protectionScore(b.exercise, goalCritical))
  const modifications = new Map<string, PlanRecommendation>()
  const removals: PlanRecommendation[] = []
  let minutesToSave = typicalDuration - availableMinutes

  for (const { exercise, planned } of orderedExercises) {
    if (minutesToSave <= 0) break
    const reducibleSets = Math.max(0, planned.sets - 1)
    if (reducibleSets === 0) continue
    const setsToRemove = Math.min(reducibleSets, Math.ceil(minutesToSave / MINUTES_PER_WORKING_SET))
    const remainingSets = planned.sets - setsToRemove
    modifications.set(exercise.id, {
      id: `time-modify-${plan.id}-${exercise.id}`,
      type: 'MODIFY',
      exerciseId: exercise.id,
      modifiedSets: remainingSets,
      score: 5,
      reasons: [`Reduce ${exercise.name} from ${planned.sets} sets to ${remainingSets} to fit today's ${availableMinutes}-minute limit.`, 'Lower-priority work is trimmed before an exercise is removed.'],
      trace,
    })
    minutesToSave -= setsToRemove * MINUTES_PER_WORKING_SET
  }

  if (minutesToSave > 0) {
    for (const { exercise, planned } of orderedExercises) {
      if (minutesToSave <= 0) break
      const remainingSets = modifications.get(exercise.id)?.modifiedSets ?? planned.sets
      // A full removal supersedes a prior set reduction for the same exercise.
      modifications.delete(exercise.id)
      removals.push({
        id: `time-remove-${plan.id}-${exercise.id}`,
        type: 'REMOVE',
        exerciseId: exercise.id,
        score: 4,
        reasons: [`Remove ${exercise.name} as a last resort to fit today's ${availableMinutes}-minute limit.`, exercise.type === 'isolation' ? 'Isolation work is prioritized for removal before compound work.' : 'Compound work is retained until lower-priority options are exhausted.'],
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
