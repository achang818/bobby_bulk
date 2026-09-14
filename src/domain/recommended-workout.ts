import { MINUTES_PER_EXERCISE_TRANSITION, MINUTES_PER_WORKING_SET } from './adaptation'
import { equipmentTagFor } from './equipment'
import { calculateExerciseFeatures, calculateMuscleFeatures } from './features'
import { hasHypertrophyGoal, resolveMusclePriorities, sameMuscle } from './muscle-priorities'
import { SECONDARY_SET_CONTRIBUTION, stimulusForMuscle, workoutMuscleStimulus } from './muscle-stimulus'
import { classifyPreference } from './states'
import { createPlannedExercise } from './workout-session'
import type { AvailableLoad, Exercise, ExerciseFeatures, MuscleFeatures, PlanningAuthority, TodaysContext, UserPreferences, Workout, WorkoutTemplate } from './models'

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

type MuscleTarget = {
  muscle: string
  rank: number
  desiredFrequency: number
  volumeWeight: number
  features: MuscleFeatures
  reason: string
  score: number
}
type SelectedExercise = { exercise: Exercise; target: MuscleTarget; sets: number; reason?: string }
type SelectionResult = { selected: SelectedExercise[]; reasons: string[] }

/**
 * Constructs an executable, temporary workout when Bobby—not a saved plan—has
 * planning authority. Allocation happens before exercise choice: goals and
 * priorities establish what matters, working-set history establishes what has
 * happened, and context establishes what can be done today.
 */
export function generateRecommendedWorkout(input: RecommendedWorkoutInput): RecommendedWorkout {
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10)
  const targets = chooseMuscleTargets(input, asOf)
  const selection = selectExercises(targets, input, asOf, targetLimit(input.todaysContext.availableMinutes))
  const plannedExercises = fitToTime(selection.selected, input.todaysContext.availableMinutes)
  const includedExerciseIds = new Set(plannedExercises.map((planned) => planned.exerciseId))
  // Keep focus in allocation order, not accidental compound-first logger order.
  const targetMuscles = unique(selection.selected
    .filter((item) => includedExerciseIds.has(item.exercise.id))
    .map((item) => item.target.muscle))
  const targetReasons = selection.selected
    .filter((item) => includedExerciseIds.has(item.exercise.id))
    .flatMap((item) => [item.target.reason, ...(item.reason ? [item.reason] : [])])
  const reasons = uniqueReasons([...targetReasons, ...selection.reasons])
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

/** Chooses productive direct-muscle opportunities before choosing exercises. */
function chooseMuscleTargets(input: RecommendedWorkoutInput, asOf: string): MuscleTarget[] {
  const profile = resolveMusclePriorities(input.preferences)
  const prioritized = profile.orderedMuscles.flatMap((muscle, rank) => {
    const features = calculateMuscleFeatures(muscle, input.exercises, input.history, asOf)
    const desiredFrequency = profile.desiredFrequency(muscle, PLANNING_HORIZON_OPPORTUNITIES)
    if (!isMuscleOpportunity(features, desiredFrequency)) return []
    const explicit = profile.explicitMuscles.some((item) => sameMuscle(item, muscle))
    const source = explicit ? 'explicit priority' : 'goal-derived priority'
    return [{
      muscle,
      rank,
      desiredFrequency,
      volumeWeight: profile.volumeWeight(muscle),
      features,
      score: allocationScore(rank, explicit, desiredFrequency, features),
      reason: allocationReason(muscle, source, desiredFrequency, features),
    }]
  })
  if (prioritized.length) return prioritized
    .sort((left, right) => right.score - left.score || left.rank - right.rank || left.muscle.localeCompare(right.muscle))
  return fallbackTargets(input, asOf, targetLimit(input.todaysContext.availableMinutes))
}

function isMuscleOpportunity(features: MuscleFeatures, desiredFrequency: number) {
  // Direct work recorded today is the clearest recovery guard. For older data,
  // use the existing frequency and workload state rather than inventing one.
  if (features.daysSinceTrained === 0) return false
  if (desiredFrequency > 0 && features.frequency7Days >= desiredFrequency) return false
  return !(features.volumeState === 'high recent volume' && features.frequency7Days > 0)
}

function allocationScore(rank: number, explicit: boolean, desiredFrequency: number, features: MuscleFeatures) {
  const unmetOpportunities = Math.max(0, desiredFrequency - features.frequency7Days)
  const daysSinceTrained = Math.min(features.daysSinceTrained ?? 7, 14)
  const workloadAdjustment = features.volumeState === 'low recent volume' ? 8 : features.volumeState === 'moderate recent volume' ? 0 : -12
  // Explicit ordering is dominant, but unmet exposure and time since direct
  // work can surface a lower-ranked muscle with a clearer opportunity.
  return (explicit ? 100 : 60) - rank * 5 + unmetOpportunities * 12 + daysSinceTrained + workloadAdjustment
}

function allocationReason(muscle: string, source: string, desiredFrequency: number, features: MuscleFeatures) {
  const opportunities = `${features.frequency7Days}/${desiredFrequency || 0} direct opportunities in the recent week`
  if (features.historyConfidence === 'none') return `${muscle} is a ${source}; there is no direct working-set history yet, so Bobby is using the priority and exercise metadata conservatively.`
  if (features.historyConfidence === 'limited') return `${muscle} is a ${source} with ${opportunities}; the direct history is limited, so Bobby is not over-reading a single session.`
  if (features.volumeState === 'low recent volume') return `${muscle} is a ${source} with low recent direct working-set exposure (${opportunities}).`
  return `${muscle} is a ${source} with ${opportunities}.`
}

function fallbackTargets(input: RecommendedWorkoutInput, asOf: string, limit: number): MuscleTarget[] {
  const goalCompatible = input.exercises.filter((exercise) => exercise.type === 'compound' && matchesGoals(exercise, input.preferences))
  const targets = FALLBACK_PATTERNS.flatMap((pattern, rank) => {
    const candidates = goalCompatible
      .filter((candidate) => candidate.movementPattern === pattern && isAvailable(candidate, input.todaysContext, input.preferences))
      .sort((left, right) => exerciseSelectionOrder(left, right, input, asOf))
    const exercise = candidates[0]
    if (!exercise) return []
    const muscle = exercise.primaryMuscles[0]
    const features = calculateMuscleFeatures(muscle, input.exercises, input.history, asOf)
    // With no priority signal, avoid repeating a direct muscle trained in the
    // last day when another balanced pattern remains available.
    if (features.daysSinceTrained === 0 || (features.daysSinceTrained === 1 && features.frequency7Days > 0)) return []
    return [{
      muscle,
      rank: Number.MAX_SAFE_INTEGER - rank,
      desiredFrequency: 0,
      volumeWeight: 1,
      features,
      score: allocationScore(rank, false, 0, features),
      reason: `${muscle} has no unresolved priority signal, so Bobby selected an available balanced compound pattern with no very recent direct work.`,
    }]
  })
  return uniqueTargets(targets).sort((left, right) => right.score - left.score || left.rank - right.rank).slice(0, limit)
}

/**
 * Greedily adds the exercise with the most useful remaining priority coverage.
 * Historical features remain direct-only; this loop only credits supporting
 * overlap accumulated by exercises selected for today's workout.
 */
function selectExercises(targets: MuscleTarget[], input: RecommendedWorkoutInput, asOf: string, limit: number): SelectionResult {
  const selectedIds = new Set<string>()
  const selected: SelectedExercise[] = []
  const reasons: string[] = []
  while (selected.length < limit) {
    const stimulus = workoutMuscleStimulus(selected)
    const choice = chooseNextExercise(targets, selected, selectedIds, stimulus, input, asOf)
    if (!choice) break
    const { exercise, target } = choice
    const sets = allocatedSets({ exercise, target })
    const supportingCompound = selected.find(({ exercise: selectedExercise }) => selectedExercise.type === 'compound' && selectedExercise.secondaryMuscles.some((muscle) => sameMuscle(muscle, target.muscle)))
    const features = calculateExerciseFeatures(exercise, input.history, asOf)
    selectedIds.add(exercise.id)
    selected.push({
      exercise, target, sets,
      ...(supportingCompound && !selected.some((item) => item.exercise.primaryMuscles.some((muscle) => sameMuscle(muscle, target.muscle)))
        ? { reason: `${supportingCompound.exercise.name} provides supporting ${target.muscle} work, but ${target.muscle} remains a high priority, so ${exercise.name} was added.` }
        : features.progressionState === 'progressing'
          ? { reason: `Kept ${exercise.name} because its recent working-set performance is progressing.` }
          : {}),
    })
  }
  const finalStimulus = workoutMuscleStimulus(selected)
  for (const target of targets) {
    const current = stimulusForMuscle(finalStimulus, target.muscle)
    if (current.directSets === 0 && current.secondarySets > 0 && remainingNeed(target, current.effectiveContribution) < MINIMUM_USEFUL_REMAINING_STIMULUS) {
      reasons.push(`${target.muscle} already has sufficient supporting work for today's allocation, so Bobby did not add direct isolation work.`)
    }
  }
  return { selected, reasons }
}

// Below this, another normal exercise default would only be token volume.
const MINIMUM_USEFUL_REMAINING_STIMULUS = 0.5

function chooseNextExercise(targets: MuscleTarget[], selected: SelectedExercise[], selectedIds: Set<string>, stimulus: ReturnType<typeof workoutMuscleStimulus>, input: RecommendedWorkoutInput, asOf: string) {
  const candidates = input.exercises
    .filter((exercise) => !selectedIds.has(exercise.id) && isAvailable(exercise, input.todaysContext, input.preferences) && matchesGoals(exercise, input.preferences))
    .flatMap((exercise) => targets
      .filter((target) => exercise.primaryMuscles.some((muscle) => sameMuscle(muscle, target.muscle))
        && remainingNeed(target, stimulusForMuscle(stimulus, target.muscle).effectiveContribution) >= MINIMUM_USEFUL_REMAINING_STIMULUS
        && !isRedundantForTarget(exercise, target, selected))
      .map((target) => ({ exercise, target })))
  if (!candidates.length) return undefined
  return candidates.sort((left, right) => exerciseUtility(right.exercise, right.target, targets, stimulus) - exerciseUtility(left.exercise, left.target, targets, stimulus)
    || exerciseSelectionOrder(left.exercise, right.exercise, input, asOf)
    || left.target.rank - right.target.rank)[0]
}

function exerciseUtility(exercise: Exercise, primaryTarget: MuscleTarget, targets: MuscleTarget[], stimulus: ReturnType<typeof workoutMuscleStimulus>) {
  const sets = allocatedSets({ exercise, target: primaryTarget })
  return targets.reduce((total, target) => {
    const direct = exercise.primaryMuscles.some((muscle) => sameMuscle(muscle, target.muscle)) ? sets : 0
    const supporting = exercise.secondaryMuscles.some((muscle) => sameMuscle(muscle, target.muscle)) ? sets * SECONDARY_SET_CONTRIBUTION : 0
    const useful = Math.min(remainingNeed(target, stimulusForMuscle(stimulus, target.muscle).effectiveContribution), direct + supporting)
    // Priority ordering stays dominant; broad compound coverage breaks ties
    // between otherwise useful choices rather than displacing the top target.
    return total + Math.max(0, useful) * (1000 / (1 + Math.min(target.rank, 20)))
  }, 0)
}

function desiredSessionStimulus(target: MuscleTarget) {
  // This starts from catalog defaults and relative priority weighting rather
  // than a universal weekly volume prescription. Recent direct history only
  // scales today's remaining allocation; it is never recast as secondary work.
  const rankEmphasis = target.rank === 0 ? 1.7 : target.rank < 3 ? 1.25 : 1
  const recentDirectAdjustment = target.features.volumeState === 'moderate recent volume' ? 0.65 : 1
  return 3 * target.volumeWeight * rankEmphasis * recentDirectAdjustment
}

function remainingNeed(target: MuscleTarget, contributedStimulus: number) {
  return Math.max(0, desiredSessionStimulus(target) - contributedStimulus)
}

function isRedundantForTarget(candidate: Exercise, target: MuscleTarget, selected: SelectedExercise[]) {
  return selected.some(({ exercise }) => exercise.primaryMuscles.some((muscle) => sameMuscle(muscle, target.muscle))
    && exercise.type === candidate.type
    && exercise.movementPattern === candidate.movementPattern
    && exercise.primaryAction === candidate.primaryAction)
}

function exerciseSelectionOrder(left: Exercise, right: Exercise, input: RecommendedWorkoutInput, asOf: string) {
  const leftPreference = classifyPreference(left.id, input.preferences)
  const rightPreference = classifyPreference(right.id, input.preferences)
  const preference = preferenceRank(rightPreference) - preferenceRank(leftPreference)
  if (preference) return preference
  const leftFeatures = calculateExerciseFeatures(left, input.history, asOf)
  const rightFeatures = calculateExerciseFeatures(right, input.history, asOf)
  const progression = progressionRank(rightFeatures) - progressionRank(leftFeatures)
  if (progression) return progression
  // Useful history favors continuity. Recent use alone never creates a penalty.
  const history = rightFeatures.sessionsPerformed - leftFeatures.sessionsPerformed
  if (history) return history
  const compound = Number(right.type === 'compound') - Number(left.type === 'compound')
  return compound || left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
}

function progressionRank(features: ExerciseFeatures) {
  return features.progressionState === 'progressing' ? 3 : features.progressionState === 'stable' ? 2 : features.progressionState === 'insufficient history' ? 1 : 0
}

function fitToTime(selected: SelectedExercise[], availableMinutes: number | undefined) {
  const planned = selected.slice()
    .sort((left, right) => Number(right.exercise.type === 'compound') - Number(left.exercise.type === 'compound') || left.target.rank - right.target.rank || left.exercise.name.localeCompare(right.exercise.name))
    .map((item, order) => ({
      ...createPlannedExercise(item.exercise.id, order, item.exercise),
      sets: item.sets,
      targetRank: item.target.rank,
    }))
  if (availableMinutes === undefined) return planned.map(({ targetRank: _targetRank, ...exercise }) => exercise)
  let estimatedMinutes = estimateMinutes(planned)
  for (const item of [...planned].sort((left, right) => right.targetRank - left.targetRank || right.order - left.order)) {
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

function allocatedSets({ exercise, target }: Pick<SelectedExercise, 'exercise' | 'target'>) {
  const weightedDefault = Math.round(exercise.defaultSets * target.volumeWeight)
  if (target.features.volumeState === 'high recent volume') return Math.max(1, Math.min(exercise.defaultSets, weightedDefault - 1))
  if (target.desiredFrequency > 0 && target.features.frequency7Days >= target.desiredFrequency) return Math.max(1, Math.min(exercise.defaultSets, weightedDefault))
  return Math.max(1, weightedDefault)
}

function targetLimit(availableMinutes: number | undefined) {
  if (availableMinutes === undefined) return 4
  return Math.max(1, Math.min(4, Math.floor((availableMinutes + 2) / 8)))
}

function estimateMinutes(planned: { sets: number }[]) { return planned.reduce((total, item) => total + item.sets * MINUTES_PER_WORKING_SET, 0) + planned.length * MINUTES_PER_EXERCISE_TRANSITION }
function isAvailable(exercise: Exercise, context: TodaysContext, preferences: UserPreferences) { return !context.unavailableEquipment.includes(equipmentTagFor(exercise)) && classifyPreference(exercise.id, preferences) !== 'excluded' }
function matchesGoals(exercise: Exercise, preferences: UserPreferences) { return preferences.goals.length === 0 || exercise.goals.some((goal) => preferences.goals.includes(goal as UserPreferences['goals'][number])) || (hasHypertrophyGoal(preferences.goals) && exercise.goals.includes('Build muscle')) }
function preferenceRank(value: ReturnType<typeof classifyPreference>) { return value === 'preferred' ? 2 : value === 'neutral' ? 1 : value === 'recommend-less' ? 0 : -1 }
function unique(values: string[]) { return values.filter((value, index) => values.findIndex((candidate) => sameMuscle(candidate, value)) === index) }
function uniqueTargets(targets: MuscleTarget[]) { return targets.filter((target, index) => targets.findIndex((candidate) => sameMuscle(candidate.muscle, target.muscle)) === index) }
function uniqueReasons(reasons: string[]) { return [...new Set(reasons)] }
