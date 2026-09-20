import { currentCoachingDate } from './coaching-date'
import { deriveCoachingPreferences, behavioralBias, calibrateProgressionLoad, type CoachingPreferenceState } from './coaching-preferences'
import { MINUTES_PER_EXERCISE_TRANSITION, MINUTES_PER_WORKING_SET } from './adaptation'
import { isExerciseAvailable } from './equipment'
import { findExerciseCandidates } from './exercise-intelligence'
import { resolveTrainingState, muscleOpportunityScore, exerciseTrainingState, muscleTrainingState, isMuscleOpportunity } from './training-state'
import { hasHypertrophyGoal, resolveMusclePriorities, sameMuscle } from './muscle-priorities'
import { SECONDARY_SET_CONTRIBUTION, stimulusForMuscle, workoutMuscleStimulus } from './muscle-stimulus'
import { classifyPreference } from './states'
import { recommendExerciseLoadFromState } from './load-recommendation'
import { createPlannedExercise } from './workout-session'
import type { AvailableLoad, Exercise, ExerciseFeatures, MuscleFeatures, PlanningAuthority, SessionPrescriptionChange, TrainingState, TodaysContext, UserPreferences, Workout, WorkoutTemplate } from './models'

const PLANNING_HORIZON_OPPORTUNITIES = 3
// Product construction budgets, not universal exercise or volume requirements.
const DEFAULT_EXERCISE_BUDGET = 4
const SHORT_SESSION_THRESHOLD = 3

export interface RecommendedWorkoutInput {
  exercises: Exercise[]
  history: Workout[]
  preferences: UserPreferences
  todaysContext: TodaysContext
  availableLoads?: AvailableLoad[]
  asOf?: string
  decisions?: import('./models').RecommendationDecision[]
  trainingState?: TrainingState
}

export interface RecommendedWorkout {
  authority: Extract<PlanningAuthority, 'recommended'>
  workout: WorkoutTemplate
  targetMuscles: string[]
  reasons: string[]
  sessionNote?: string
  prescriptionChanges?: SessionPrescriptionChange[]
}

type MuscleTarget = {
  muscle: string
  rank: number
  opportunityRank?: number
  desiredFrequency: number
  volumeWeight: number
  features: MuscleFeatures
  reason: string
  score: number
  emphasis: boolean
}
type SelectedExercise = { exercise: Exercise; target: MuscleTarget; sets: number }

/**
 * Constructs an executable, temporary workout when Bobby—not a saved plan—has
 * planning authority. Allocation happens before exercise choice: goals and
 * priorities establish what matters, working-set history establishes what has
 * happened, and context establishes what can be done today.
 */
export function generateRecommendedWorkout(input: RecommendedWorkoutInput): RecommendedWorkout {
  return generateFromTrainingState(resolveTrainingInput(input))
}

type TrainingInput = Omit<RecommendedWorkoutInput, 'history' | 'asOf' | 'trainingState'> & { trainingState: TrainingState; coachingPreferences: CoachingPreferenceState }

function resolveTrainingInput(input: RecommendedWorkoutInput): TrainingInput {
  const { history, asOf = input.trainingState?.asOf ?? currentCoachingDate(), trainingState, ...context } = input
  const resolved = resolveTrainingState(input.exercises, history, asOf, input.preferences.weightUnit, resolveMusclePriorities(input.preferences).orderedMuscles, trainingState)
  return { ...context, trainingState: resolved, coachingPreferences: deriveCoachingPreferences(resolved, input.decisions) }
}

function generateFromTrainingState(input: TrainingInput): RecommendedWorkout {
  const targets = chooseMuscleTargets(input)
  const selected = selectExercises(targets, input, DEFAULT_EXERCISE_BUDGET)
  const plannedExercises = fitToTime(selected.slice(0, targetLimit(input.todaysContext.availableMinutes)), input.todaysContext.availableMinutes).map((planned) => ({
    ...planned,
    loadRecommendation: calibrateProgressionLoad(recommendExerciseLoadFromState(input.exercises.find((exercise) => exercise.id === planned.exerciseId)!, planned, exerciseTrainingState(input.trainingState, planned.exerciseId), input.trainingState.unit, input.availableLoads), planned, input.coachingPreferences),
  }))
  const includedExerciseIds = new Set(plannedExercises.map((planned) => planned.exerciseId))
  // Keep focus in allocation order, not accidental compound-first logger order.
  const finalSelection = selected.filter((item) => includedExerciseIds.has(item.exercise.id))
    .map((item) => ({ ...item, sets: plannedExercises.find((planned) => planned.exerciseId === item.exercise.id)!.sets }))
  const targetMuscles = unique(finalSelection
    .filter((item) => includedExerciseIds.has(item.exercise.id))
    .map((item) => item.target.muscle))
  const sessionNote = plannedExercises.length < SHORT_SESSION_THRESHOLD
    ? plannedExercises.length < selected.length && input.todaysContext.availableMinutes !== undefined
      ? `A shorter workout to fit your ${input.todaysContext.availableMinutes}-minute limit.`
      : `Only ${plannedExercises.length} suitable ${plannedExercises.length === 1 ? 'movement fits' : 'movements fit'} your recent training, equipment, goals, and exercise choices. Extra overlapping work has not been added just to fill the session.`
    : undefined
  const recoveryReasons = resolveMusclePriorities(input.preferences).orderedMuscles.filter((muscle) => !isMuscleOpportunity(muscleTrainingState(input.trainingState, muscle))).map((muscle) => `${muscle} isn't prioritized today because you trained it recently.`)
  const reasons = uniqueReasons([...recoveryReasons, ...selectionReasons(targets, finalSelection, input), ...finalSelection.flatMap(({ exercise }) => { const evidence = input.coachingPreferences.exercises.find((item) => item.exerciseId === exercise.id); return evidence && evidence.state !== 'neutral' ? [`${exercise.name}: ${evidence.reasons.join(' ')}`] : [] }), ...(sessionNote ? [sessionNote] : [])])
  const workout: WorkoutTemplate = {
    id: 'recommended-workout',
    name: 'Recommended workout',
    description: reasons.length ? reasons.join(' ') : 'A balanced workout generated from your available context.',
    focus: targetMuscles.join(' · ') || 'Balanced training',
    planningAuthority: 'recommended',
    plannedExercises,
    exerciseIds: plannedExercises.map((planned) => planned.exerciseId),
  }
  return { authority: 'recommended', workout, targetMuscles, reasons, ...(sessionNote ? { sessionNote } : {}) }
}

/** Replace one preview slot without editing preferences, saved plans, or other slots. */
export function skipRecommendedExercise(input: RecommendedWorkoutInput, current: RecommendedWorkout, exerciseId: string, skippedIds: readonly string[] = []): { recommendation: RecommendedWorkout; message: string } {
  return skipFromTrainingState(resolveTrainingInput(input), current, exerciseId, skippedIds)
}

function skipFromTrainingState(input: TrainingInput, current: RecommendedWorkout, exerciseId: string, skippedIds: readonly string[]): { recommendation: RecommendedWorkout; message: string } {
  const original = input.exercises.find((exercise) => exercise.id === exerciseId)
  const slots = current.workout.plannedExercises ?? []
  const slot = slots.find((item) => item.exerciseId === exerciseId)
  if (!original || !slot) return { recommendation: current, message: '' }
  const others = slots.filter((item) => item !== slot).map((item) => input.exercises.find((exercise) => exercise.id === item.exerciseId)!)
  const replacement = findExerciseCandidates({
    exercise: original, exercises: input.exercises, goals: input.preferences.goals,
    priorityMuscles: resolveMusclePriorities(input.preferences).orderedMuscles,
    preferences: input.preferences,
    coachingPreferences: input.coachingPreferences,
    constraints: { ...input.todaysContext, excludedExerciseIds: [...skippedIds, ...slots.map((item) => item.exerciseId)], requireSameCategory: true },
  }).find(({ exercise, roleMatch, compatibility }) => roleMatch === 'preserved' && compatibility !== 'weak'
    && matchesGoals(exercise, input.preferences)
    && exercise.primaryMuscles.every((muscle) => isMuscleOpportunity(muscleTrainingState(input.trainingState, muscle)))
    && !others.some((other) => other.type === exercise.type && other.movementPattern === exercise.movementPattern
      && other.primaryAction === exercise.primaryAction && other.primaryMuscles.some((muscle) => exercise.primaryMuscles.some((target) => sameMuscle(muscle, target)))))?.exercise
  const plannedExercises = slots.flatMap((item) => {
    if (item !== slot) return [item]
    if (!replacement) return []
    const next = { ...createPlannedExercise(replacement.id, item.order, replacement), sets: item.sets, setType: item.setType }
    return [{ ...next, loadRecommendation: calibrateProgressionLoad(recommendExerciseLoadFromState(replacement, next, exerciseTrainingState(input.trainingState, replacement.id), input.trainingState.unit), next, input.coachingPreferences) }]
  }).map((item, order) => item.order === order ? item : { ...item, order })
  const message = replacement ? `Switched ${original.name} to ${replacement.name} for this workout.`
    : `No suitable alternative to ${original.name} fits your current settings and recent training. Removed it from this workout.`
  const targetMuscles = unique(plannedExercises.flatMap((item) => input.exercises.find((exercise) => exercise.id === item.exerciseId)!.primaryMuscles))
  const sessionNote = plannedExercises.length < SHORT_SESSION_THRESHOLD ? `This workout now has ${plannedExercises.length} suitable ${plannedExercises.length === 1 ? 'exercise' : 'exercises'}. You can reset exercise choices or adjust your equipment and time settings.` : undefined
  // Rebuild explanations so removed movements and their original allocations are never described as present.
  const reasons = plannedExercises.map((item) => {
    const exercise = input.exercises.find((exercise) => exercise.id === item.exerciseId)!
    return `${exercise.name}: ${item.sets} working sets for ${exercise.primaryMuscles.join(', ')}.`
  })
  return { message, recommendation: { ...current, targetMuscles, reasons, sessionNote,
    prescriptionChanges: [...(current.prescriptionChanges ?? []).map((change) => change.after.some((item) => item.exerciseId === exerciseId) ? { ...change, applied: false } : change), structuredClone({ id: `generated-swap-${exerciseId}`, source: 'generated-substitution' as const,
      unit: input.trainingState.unit, before: [slot], after: replacement ? plannedExercises.filter((item) => item.exerciseId === replacement.id) : [], applied: true, reason: message })],
    workout: { ...current.workout, plannedExercises, exerciseIds: plannedExercises.map((item) => item.exerciseId), focus: targetMuscles.join(' · ') || 'No suitable exercises', description: reasons.join(' ') },
  } }
}

/** Chooses productive direct-muscle opportunities before choosing exercises. */
function chooseMuscleTargets(input: TrainingInput): MuscleTarget[] {
  const profile = resolveMusclePriorities(input.preferences)
  const prioritized = profile.orderedMuscles.flatMap((muscle, rank) => {
    const features = muscleTrainingState(input.trainingState, muscle)
    const desiredFrequency = profile.desiredFrequency(muscle, PLANNING_HORIZON_OPPORTUNITIES)
    if (!isMuscleOpportunity(features)) return []
    const explicit = profile.explicitMuscles.some((item) => sameMuscle(item, muscle))
    const source = explicit ? 'explicit priority' : 'goal-derived priority'
    return [{
      muscle,
      rank,
      desiredFrequency,
      volumeWeight: profile.volumeWeight(muscle),
      features,
      score: muscleOpportunityScore(features, rank, explicit, desiredFrequency),
      emphasis: features.frequency7Days < desiredFrequency,
      reason: allocationReason(muscle, source, desiredFrequency, features),
    }]
  })
  const broader = unique(input.exercises.filter((exercise) => isAvailable(exercise, input.todaysContext, input.preferences) && matchesGoals(exercise, input.preferences))
    .flatMap((exercise) => exercise.primaryMuscles))
    .filter((muscle) => !profile.orderedMuscles.some((priority) => sameMuscle(priority, muscle)))
    .flatMap((muscle): MuscleTarget[] => {
      const features = muscleTrainingState(input.trainingState, muscle)
      if (!isMuscleOpportunity(features)) return []
      return [{ muscle, rank: profile.orderedMuscles.length, desiredFrequency: 0, volumeWeight: 1, features,
        score: muscleOpportunityScore(features, 0, false, 0), emphasis: false,
        reason: `Added work for ${muscle} broadens the session beyond your priority muscles while respecting recent training.`,
      }]
    })
  return [...prioritized, ...broader].sort((left, right) => Number(right.emphasis) - Number(left.emphasis)
    || right.score - left.score || left.rank - right.rank || left.muscle.localeCompare(right.muscle)).map((target, opportunityRank) => ({ ...target, opportunityRank }))
}

function allocationReason(muscle: string, source: string, desiredFrequency: number, features: MuscleFeatures) {
  if (desiredFrequency > 0 && features.frequency7Days >= desiredFrequency) return `${muscle} has already had ${features.frequency7Days} sessions this week, so it gets less emphasis today.`
  if (features.historyConfidence === 'none') return `${muscle} supports your ${source === 'explicit priority' ? 'stated priorities' : 'goals'}. There is no completed training history for it yet.`
  return `${muscle} supports your ${source === 'explicit priority' ? 'stated priorities' : 'goals'} and has ${features.rolling7DaySets} working sets logged this week.${features.historyConfidence === 'limited' ? ' Your direct history is limited, so this is a starting point.' : ''}`
}

/**
 * Greedily adds the exercise with the most useful remaining priority coverage.
 * Historical features remain direct-only; this loop only credits supporting
 * overlap accumulated by exercises selected for today's workout.
 */
function selectExercises(targets: MuscleTarget[], input: TrainingInput, limit: number): SelectedExercise[] {
  const selectedIds = new Set<string>()
  const selected: SelectedExercise[] = []
  const emphasis = targets.filter((target) => target.emphasis)
  const coverage = targets.filter((target) => !target.emphasis)
  while (selected.length < limit) {
    const stimulus = workoutMuscleStimulus(selected)
    const choice = chooseNextExercise(emphasis, selected, selectedIds, stimulus, input)
      ?? chooseNextExercise(coverage, selected, selectedIds, stimulus, input)
    if (!choice) break
    const { exercise, target } = choice
    const sets = allocatedSets({ exercise, target })
    selectedIds.add(exercise.id)
    selected.push({ exercise, target, sets })
  }
  return selected
}

/** Explain only the movements and set counts that survive time adaptation. */
function selectionReasons(targets: MuscleTarget[], selected: SelectedExercise[], input: TrainingInput) {
  const reasons = selected.flatMap(({ exercise, target }, index) => {
    const earlier = selected.slice(0, index)
    const supportingCompound = earlier.find(({ exercise: other }) => other.type === 'compound' && other.secondaryMuscles.some((muscle) => sameMuscle(muscle, target.muscle)))
    return [target.reason, ...(supportingCompound && target.emphasis && !earlier.some((item) => item.exercise.primaryMuscles.some((muscle) => sameMuscle(muscle, target.muscle)))
      ? [`${supportingCompound.exercise.name} provides supporting ${target.muscle} work, but ${target.muscle} remains a high priority, so ${exercise.name} was added.`]
      : exerciseTrainingState(input.trainingState, exercise.id).progressionState === 'progressing'
        ? [`Kept ${exercise.name} because its recent working-set performance is progressing.`] : [])]
  })
  const finalStimulus = workoutMuscleStimulus(selected)
  for (const target of targets) {
    const current = stimulusForMuscle(finalStimulus, target.muscle)
    if (current.directSets === 0 && current.secondarySets > 0 && remainingNeed(target, current.effectiveContribution) < MINIMUM_USEFUL_REMAINING_STIMULUS) {
      reasons.push(`${target.muscle} already has sufficient supporting work for today's allocation, so Bobby did not add direct isolation work.`)
    }
  }
  return reasons
}

// Below this, another normal exercise default would only be token volume.
const MINIMUM_USEFUL_REMAINING_STIMULUS = 0.5

function chooseNextExercise(targets: MuscleTarget[], selected: SelectedExercise[], selectedIds: Set<string>, stimulus: ReturnType<typeof workoutMuscleStimulus>, input: TrainingInput) {
  const candidates = input.exercises
    .filter((exercise) => !selectedIds.has(exercise.id) && isAvailable(exercise, input.todaysContext, input.preferences) && matchesGoals(exercise, input.preferences)
      && exercise.primaryMuscles.every((muscle) => isMuscleOpportunity(muscleTrainingState(input.trainingState, muscle))))
    .flatMap((exercise) => targets
      .filter((target) => exercise.primaryMuscles.some((muscle) => sameMuscle(muscle, target.muscle))
        && remainingNeed(target, stimulusForMuscle(stimulus, target.muscle).effectiveContribution) >= MINIMUM_USEFUL_REMAINING_STIMULUS
        && !isRedundantForTarget(exercise, target, selected))
      .map((target) => ({ exercise, target })))
  if (!candidates.length) return undefined
  return candidates.sort((left, right) => exerciseUtility(right.exercise, right.target, targets, stimulus) - exerciseUtility(left.exercise, left.target, targets, stimulus)
    || exerciseSelectionOrder(left.exercise, right.exercise, input)
    || left.target.rank - right.target.rank)[0]
}

function exerciseUtility(exercise: Exercise, primaryTarget: MuscleTarget, targets: MuscleTarget[], stimulus: ReturnType<typeof workoutMuscleStimulus>) {
  const sets = allocatedSets({ exercise, target: primaryTarget })
  return targets.reduce((total, target) => {
    const direct = exercise.primaryMuscles.some((muscle) => sameMuscle(muscle, target.muscle)) ? sets : 0
    const supporting = exercise.secondaryMuscles.some((muscle) => sameMuscle(muscle, target.muscle)) ? sets * SECONDARY_SET_CONTRIBUTION : 0
    const useful = Math.min(remainingNeed(target, stimulusForMuscle(stimulus, target.muscle).effectiveContribution), direct + supporting)
    // Honor the history-aware opportunity order established before selection.
    // Supporting compound coverage can break ties between useful movements.
    return total + Math.max(0, useful) * (target.emphasis ? 1000 / (1 + (target.opportunityRank ?? target.rank)) : Math.max(1, target.score))
  }, 0)
}

function desiredSessionStimulus(target: MuscleTarget) {
  // This starts from catalog defaults and relative priority weighting rather
  // than a universal weekly volume prescription. Recent direct history only
  // scales today's remaining allocation; it is never recast as secondary work.
  const rankEmphasis = !target.emphasis ? 1 : target.rank === 0 ? 1.7 : target.rank < 3 ? 1.25 : 1
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

function exerciseSelectionOrder(left: Exercise, right: Exercise, input: TrainingInput) {
  const leftPreference = classifyPreference(left.id, input.preferences)
  const rightPreference = classifyPreference(right.id, input.preferences)
  const preference = preferenceRank(rightPreference) - preferenceRank(leftPreference)
  const leftFeatures = exerciseTrainingState(input.trainingState, left.id)
  const rightFeatures = exerciseTrainingState(input.trainingState, right.id)
  const progression = progressionRank(rightFeatures) - progressionRank(leftFeatures)
  if (progression) return progression
  if (preference) return preference
  const behavior = behavioralBias(right.id, input.coachingPreferences) - behavioralBias(left.id, input.coachingPreferences)
  if (behavior) return behavior
  // Useful history favors continuity. Recent use alone never creates a penalty.
  const history = rightFeatures.sessionsPerformed - leftFeatures.sessionsPerformed
  if (history) return history
  const compound = Number(right.type === 'compound') - Number(left.type === 'compound')
  return compound || left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
}

function progressionRank(features: ExerciseFeatures) {
  return features.progressionState === 'progressing' ? 3 : features.progressionState === 'stable' ? 2 : 0
}

function fitToTime(selected: SelectedExercise[], availableMinutes: number | undefined) {
  const planned = selected.slice()
    .sort((left, right) => Number(right.exercise.type === 'compound') - Number(left.exercise.type === 'compound') || left.target.rank - right.target.rank || left.exercise.name.localeCompare(right.exercise.name))
    .map((item, order) => ({
      ...createPlannedExercise(item.exercise.id, order, item.exercise),
      sets: item.sets,
      targetRank: item.target.emphasis ? (item.target.opportunityRank ?? item.target.rank) : Number.MAX_SAFE_INTEGER,
    }))
  if (availableMinutes === undefined) return planned.map(({ targetRank: _targetRank, ...exercise }) => exercise)
  let estimatedMinutes = estimateMinutes(planned)
  for (const item of [...planned].sort((left, right) => right.targetRank - left.targetRank || right.order - left.order)) {
    while (estimatedMinutes > availableMinutes && item.sets > 1) {
      item.sets -= 1
      estimatedMinutes -= MINUTES_PER_WORKING_SET
    }
  }
  while (estimatedMinutes > availableMinutes && planned.length > 0) {
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
  if (availableMinutes === undefined) return DEFAULT_EXERCISE_BUDGET
  return Math.max(1, Math.min(DEFAULT_EXERCISE_BUDGET, Math.floor((availableMinutes + 2) / 8)))
}

function estimateMinutes(planned: { sets: number }[]) { return planned.reduce((total, item) => total + item.sets * MINUTES_PER_WORKING_SET, 0) + planned.length * MINUTES_PER_EXERCISE_TRANSITION }
function isAvailable(exercise: Exercise, context: TodaysContext, preferences: UserPreferences) { return isExerciseAvailable(exercise, context) && classifyPreference(exercise.id, preferences) !== 'excluded' }
function matchesGoals(exercise: Exercise, preferences: UserPreferences) { return preferences.goals.length === 0 || exercise.goals.some((goal) => preferences.goals.includes(goal as UserPreferences['goals'][number])) || (hasHypertrophyGoal(preferences.goals) && exercise.goals.includes('Build muscle')) }
function preferenceRank(value: ReturnType<typeof classifyPreference>) { return value === 'preferred' ? 2 : value === 'neutral' ? 1 : value === 'recommend-less' ? 0 : -1 }
function unique(values: string[]) { return values.filter((value, index) => values.findIndex((candidate) => sameMuscle(candidate, value)) === index) }
function uniqueReasons(reasons: string[]) { return [...new Set(reasons)] }
