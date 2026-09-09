import { buildTrace } from './rules'
import { classifyPreference } from './states'
import type { EquipmentTag, Exercise, PlanRecommendation, TodaysContext, UserPreferences, WorkoutPlan } from './models'

// The limit protects a familiar workout from unnecessary churn; it is contextual, not universal.
export const MAX_CONTEXTUAL_SUBSTITUTIONS = 2
export const MINUTES_PER_WORKING_SET = 3
export const MINUTES_PER_EXERCISE_TRANSITION = 2

export function equipmentTagFor(exercise: Exercise): EquipmentTag {
  const normalized = exercise.equipment.toLowerCase()
  if (normalized.includes('dumbbell')) return 'dumbbells'
  if (normalized.includes('barbell')) return 'barbells'
  if (normalized.includes('cable')) return 'cables'
  if (normalized.includes('machine')) return 'machines'
  if (normalized.includes('bench')) return 'benches'
  if (normalized.includes('pull-up') || normalized.includes('pull up')) return 'pull-up-bar'
  if (normalized.includes('kettlebell')) return 'kettlebells'
  if (normalized.includes('trap bar')) return 'trap-bar'
  if (normalized.includes('bodyweight')) return 'bodyweight'
  return 'other'
}

export function findContextualSubstitute(exercise: Exercise, exercises: Exercise[], todaysContext: TodaysContext, preferences: UserPreferences): Exercise | undefined {
  if (!todaysContext.unavailableEquipment.includes(equipmentTagFor(exercise))) return undefined
  return exercises
    .filter((candidate) => candidate.id !== exercise.id)
    .filter((candidate) => !todaysContext.unavailableEquipment.includes(equipmentTagFor(candidate)))
    .filter((candidate) => candidate.category === exercise.category)
    .filter((candidate) => candidate.primaryMuscles.some((muscle) => exercise.primaryMuscles.includes(muscle)))
    .filter((candidate) => classifyPreference(candidate.id, preferences) !== 'disliked')
    .sort((a, b) => Number(classifyPreference(b.id, preferences) === 'preferred') - Number(classifyPreference(a.id, preferences) === 'preferred'))[0]
}

export function adaptWorkout(plan: WorkoutPlan, exercises: Exercise[], todaysContext: TodaysContext, preferences: UserPreferences, defaultGymId = preferences.defaultGymId): PlanRecommendation[] {
  const traveling = defaultGymId !== undefined && todaysContext.gymId !== defaultGymId
  const limit = traveling ? Number.POSITIVE_INFINITY : MAX_CONTEXTUAL_SUBSTITUTIONS
  let substitutions = 0
  const trace = buildTrace('adapt-unavailable-equipment')
  return plan.exerciseIds.flatMap((exerciseId) => {
    if (substitutions >= limit) return []
    const exercise = exercises.find((item) => item.id === exerciseId)
    if (!exercise) return []
    const alternative = findContextualSubstitute(exercise, exercises, todaysContext, preferences)
    if (!alternative) return []
    substitutions += 1
    return [{
      id: `context-${plan.id}-${exercise.id}`,
      type: 'REPLACE',
      exerciseId: exercise.id,
      alternativeExerciseId: alternative.id,
      score: 6,
      reasons: [`${equipmentLabel(equipmentTagFor(exercise))} unavailable today`, `${alternative.name} preserves the planned category and a primary muscle target.`],
      trace,
    }]
  })
}

export function estimateTypicalDuration(plan: WorkoutPlan, exercises: Exercise[]): number {
  const planExercises = plan.exerciseIds
    .map((id) => exercises.find((exercise) => exercise.id === id))
    .filter((exercise): exercise is Exercise => Boolean(exercise))
  return planExercises.reduce((minutes, exercise) => minutes + exercise.defaultSets * MINUTES_PER_WORKING_SET, 0) + planExercises.length * MINUTES_PER_EXERCISE_TRANSITION
}

export function adaptWorkoutForTime(plan: WorkoutPlan, exercises: Exercise[], availableMinutes: number | undefined, goalCriticalExerciseIds: string[] = []): PlanRecommendation[] {
  if (availableMinutes === undefined) return []
  const typicalDuration = estimateTypicalDuration(plan, exercises)
  if (availableMinutes >= typicalDuration) return []

  const goalCritical = new Set(goalCriticalExerciseIds)
  const planExercises = plan.exerciseIds
    .map((id) => exercises.find((exercise) => exercise.id === id))
    .filter((exercise): exercise is Exercise => Boolean(exercise))
  const trace = buildTrace('adapt-available-time')
  const orderedExercises = [...planExercises].sort((a, b) => protectionScore(a, goalCritical) - protectionScore(b, goalCritical))
  const modifications = new Map<string, PlanRecommendation>()
  const removals: PlanRecommendation[] = []
  let minutesToSave = typicalDuration - availableMinutes

  for (const exercise of orderedExercises) {
    if (minutesToSave <= 0) break
    const reducibleSets = Math.max(0, exercise.defaultSets - 1)
    if (reducibleSets === 0) continue
    const setsToRemove = Math.min(reducibleSets, Math.ceil(minutesToSave / MINUTES_PER_WORKING_SET))
    const remainingSets = exercise.defaultSets - setsToRemove
    modifications.set(exercise.id, {
      id: `time-modify-${plan.id}-${exercise.id}`,
      type: 'MODIFY',
      exerciseId: exercise.id,
      modifiedSets: remainingSets,
      score: 5,
      reasons: [`Reduce ${exercise.name} from ${exercise.defaultSets} sets to ${remainingSets} to fit today's ${availableMinutes}-minute limit.`, 'Lower-priority work is trimmed before an exercise is removed.'],
      trace,
    })
    minutesToSave -= setsToRemove * MINUTES_PER_WORKING_SET
  }

  if (minutesToSave > 0) {
    for (const exercise of orderedExercises) {
      if (minutesToSave <= 0) break
      const remainingSets = modifications.get(exercise.id)?.modifiedSets ?? exercise.defaultSets
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

function equipmentLabel(tag: EquipmentTag) { return tag === 'cables' ? 'Cable machine' : tag.replace('-', ' ') }
