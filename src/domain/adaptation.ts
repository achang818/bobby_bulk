import { buildTrace } from './rules'
import { classifyPreference } from './states'
import type { EquipmentTag, Exercise, PlanRecommendation, TodaysContext, UserPreferences, WorkoutPlan } from './models'

// The limit protects a familiar workout from unnecessary churn; it is contextual, not universal.
export const MAX_CONTEXTUAL_SUBSTITUTIONS = 2

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

function equipmentLabel(tag: EquipmentTag) { return tag === 'cables' ? 'Cable machine' : tag.replace('-', ' ') }