import { MINUTES_PER_EXERCISE_TRANSITION, MINUTES_PER_WORKING_SET } from './adaptation'
import { equipmentTagFor } from './equipment'
import { calculateExerciseFeatures, calculateMuscleFeatures } from './features'
import { hasHypertrophyGoal, resolveMusclePriorities, sameMuscle } from './muscle-priorities'
import { classifyPreference } from './states'
import { createPlannedExercise } from './workout-session'
import type { AvailableLoad, Exercise, PlanningAuthority, TodaysContext, UserPreferences, Workout, WorkoutTemplate } from './models'

const PLANNING_HORIZON_OPPORTUNITIES = 3
const FALLBACK_PATTERNS = ['horizontal-push', 'horizontal-pull', 'knee-dominant'] as const

export interface RecommendedWorkoutInput {
  exercises: Exercise[]
  history: Workout[]
  preferences: UserPreferences
  todaysContext: TodaysContext
  availableLoads?: AvailableLoad[]
  asOf?: string
}

export interface RecommendedWorkout {
  authority: Extract<PlanningAuthority, 'recommended'>
  workout: WorkoutTemplate
  targetMuscles: string[]
  reasons: string[]
}

type MuscleTarget = { muscle: string; rank: number; reason: string }
type SelectedExercise = { exercise: Exercise; target: MuscleTarget }

/**
 * Constructs an executable, temporary workout when Bobby—not a saved plan—has
 * planning authority. It deliberately returns a normal WorkoutTemplate so the
 * existing logger, set semantics, and session persistence can execute it.
 */
export function generateRecommendedWorkout(input: RecommendedWorkoutInput): RecommendedWorkout {
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10)
  const targets = chooseMuscleTargets(input, asOf)
  const selected = selectExercises(targets, input, asOf)
  const plannedExercises = fitToTime(selected, input.todaysContext.availableMinutes)
  const includedExerciseIds = new Set(plannedExercises.map((planned) => planned.exerciseId))
  // Keep focus in priority order, rather than accidental compound-first logger
  // order, and omit a target that time fitting had to remove.
  const targetMuscles = unique(selected.filter((item) => includedExerciseIds.has(item.exercise.id)).map((item) => item.target.muscle))
  const reasons = targets.map((target) => target.reason)
  const workout: WorkoutTemplate = {
    id: 'recommended-workout',
    name: 'Recommended workout',
    description: reasons.length ? reasons.join(' ') : 'A balanced workout generated from your available context.',
    focus: targetMuscles.join(' · ') || 'Balanced training',
    planningAuthority: 'recommended',
    plannedExercises,
    exerciseIds: plannedExercises.map((planned) => planned.exerciseId),
  }
  return { authority: 'recommended', workout, targetMuscles, reasons }
}

function chooseMuscleTargets(input: RecommendedWorkoutInput, asOf: string): MuscleTarget[] {
  const profile = resolveMusclePriorities(input.preferences)
  const limit = targetLimit(input.todaysContext.availableMinutes)
  const prioritized = profile.orderedMuscles.flatMap((muscle, rank) => {
    const features = calculateMuscleFeatures(muscle, input.exercises, input.history, asOf)
    const desired = profile.desiredFrequency(muscle, PLANNING_HORIZON_OPPORTUNITIES)
    // Same-day direct work is a concrete, low-friction recovery guard. It does
    // not invent a physiological recovery score or forbid future sessions.
    if (features.daysSinceTrained === 0 || features.frequency7Days >= desired) return []
    const source = profile.explicitMuscles.some((item) => sameMuscle(item, muscle)) ? 'explicit priority' : 'goal-derived priority'
    const opportunity = features.frequency7Days
    return [{ muscle, rank, reason: `${muscle} is a ${source} and has ${opportunity} direct ${opportunity === 1 ? 'opportunity' : 'opportunities'} in the recent week.` }]
  })
  if (prioritized.length) return prioritized.slice(0, limit)
  return fallbackTargets(input, asOf, limit)
}

function fallbackTargets(input: RecommendedWorkoutInput, asOf: string, limit: number): MuscleTarget[] {
  const goalCompatible = input.exercises.filter((exercise) => exercise.type === 'compound' && matchesGoals(exercise, input.preferences))
  const targets = FALLBACK_PATTERNS.flatMap((pattern) => {
    const exercise = goalCompatible.find((candidate) => candidate.movementPattern === pattern && isAvailable(candidate, input.todaysContext, input.preferences))
    if (!exercise) return []
    const muscle = exercise.primaryMuscles[0]
    const features = calculateMuscleFeatures(muscle, input.exercises, input.history, asOf)
    return features.daysSinceTrained === 0 ? [] : [{ muscle, rank: Number.MAX_SAFE_INTEGER, reason: `${muscle} has no unresolved explicit priority, so Bobby selected a balanced available compound pattern.` }]
  })
  return uniqueTargets(targets).slice(0, limit)
}

function selectExercises(targets: MuscleTarget[], input: RecommendedWorkoutInput, asOf: string): SelectedExercise[] {
  const selectedIds = new Set<string>()
  return targets.flatMap((target) => {
    const candidates = input.exercises
      .filter((exercise) => !selectedIds.has(exercise.id) && exercise.primaryMuscles.some((muscle) => sameMuscle(muscle, target.muscle)) && isAvailable(exercise, input.todaysContext, input.preferences) && matchesGoals(exercise, input.preferences))
      .sort((left, right) => exerciseSelectionOrder(left, right, input, asOf))
    const exercise = candidates[0]
    if (!exercise) return []
    selectedIds.add(exercise.id)
    return [{ exercise, target }]
  })
}

function exerciseSelectionOrder(left: Exercise, right: Exercise, input: RecommendedWorkoutInput, asOf: string) {
  const leftPreference = classifyPreference(left.id, input.preferences)
  const rightPreference = classifyPreference(right.id, input.preferences)
  const preference = preferenceRank(rightPreference) - preferenceRank(leftPreference)
  if (preference) return preference
  // Reusing an exercise with useful personal history avoids arbitrary rotation.
  const history = calculateExerciseFeatures(right, input.history, asOf).sessionsPerformed - calculateExerciseFeatures(left, input.history, asOf).sessionsPerformed
  if (history) return history
  const compound = Number(right.type === 'compound') - Number(left.type === 'compound')
  return compound || left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
}

function fitToTime(selected: SelectedExercise[], availableMinutes: number | undefined) {
  const planned = selected.slice()
    .sort((left, right) => Number(right.exercise.type === 'compound') - Number(left.exercise.type === 'compound') || left.target.rank - right.target.rank || left.exercise.name.localeCompare(right.exercise.name))
    .map((item, order) => ({ ...createPlannedExercise(item.exercise.id, order, item.exercise), targetRank: item.target.rank }))
  if (availableMinutes === undefined) return planned.map(({ targetRank: _targetRank, ...exercise }) => exercise)
  let estimatedMinutes = estimateMinutes(planned)
  // Trim lower-priority work first, preserving at least one working set on a
  // selected movement. This makes the generated workout executable without
  // treating time pressure as a reason to rotate exercises.
  for (const item of [...planned].sort((left, right) => right.targetRank - left.targetRank || Number(left.setType === 'working') - Number(right.setType === 'working') || right.order - left.order)) {
    while (estimatedMinutes > availableMinutes && item.sets > 1) {
      item.sets -= 1
      estimatedMinutes -= MINUTES_PER_WORKING_SET
    }
  }
  while (estimatedMinutes > availableMinutes && planned.length > 1) {
    const removeIndex = [...planned].sort((left, right) => right.targetRank - left.targetRank || right.order - left.order)[0].order
    const [removed] = planned.splice(removeIndex, 1)
    estimatedMinutes -= removed.sets * MINUTES_PER_WORKING_SET + MINUTES_PER_EXERCISE_TRANSITION
    planned.forEach((item, order) => { item.order = order })
  }
  return planned.map(({ targetRank: _targetRank, ...exercise }) => exercise)
}

function targetLimit(availableMinutes: number | undefined) {
  if (availableMinutes === undefined) return 3
  return Math.max(1, Math.min(3, Math.floor((availableMinutes + 2) / 8)))
}

function estimateMinutes(planned: { sets: number }[]) { return planned.reduce((total, item) => total + item.sets * MINUTES_PER_WORKING_SET, 0) + planned.length * MINUTES_PER_EXERCISE_TRANSITION }
function isAvailable(exercise: Exercise, context: TodaysContext, preferences: UserPreferences) { return !context.unavailableEquipment.includes(equipmentTagFor(exercise)) && classifyPreference(exercise.id, preferences) !== 'excluded' }
function matchesGoals(exercise: Exercise, preferences: UserPreferences) { return preferences.goals.length === 0 || exercise.goals.some((goal) => preferences.goals.includes(goal as UserPreferences['goals'][number])) || (hasHypertrophyGoal(preferences.goals) && exercise.goals.includes('Build muscle')) }
function preferenceRank(value: ReturnType<typeof classifyPreference>) { return value === 'preferred' ? 2 : value === 'neutral' ? 1 : value === 'recommend-less' ? 0 : -1 }
function unique(values: string[]) { return values.filter((value, index) => values.findIndex((candidate) => sameMuscle(candidate, value)) === index) }
function uniqueTargets(targets: MuscleTarget[]) { return targets.filter((target, index) => targets.findIndex((candidate) => sameMuscle(candidate.muscle, target.muscle)) === index) }
