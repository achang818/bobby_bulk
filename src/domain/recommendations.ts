import { currentCoachingDate } from './coaching-date'
import { deriveCoachingPreferences, recentlyDeclined, recommendationFeedbackContext, progressionPathway } from './coaching-preferences'
import { adaptWorkout, adaptWorkoutForTime, MINUTES_PER_WORKING_SET, MINUTES_PER_EXERCISE_TRANSITION } from './adaptation'
import { resolveMusclePriorities } from './muscle-priorities'
import { evaluatePlanFromState } from './plan-evaluator'
import { splitAlignmentCandidates } from './split-evaluator'
import { buildTrace, compareFinalRecommendations } from './rules'
import { planExerciseIds, plannedExercisesFor } from './workout-session'
import { exerciseTrainingState, muscleTrainingState, isMuscleOpportunity, hasNearFailureEvidence, resolveTrainingState } from './training-state'
import { isExerciseAvailable } from './equipment'
import type { TrainingState, AvailableLoad, Exercise, ExerciseRecommendationCandidate, RecommendationCandidate, Recommendation, RecommendationChange, RecommendationDecision, TodaysContext, UserPreferences, Workout, WorkoutPlan, Split, WorkoutTemplate, PlanningAuthority } from './models'

export interface RecommendationInput {
  plan: WorkoutPlan
  exercises: Exercise[]
  history: Workout[]
  preferences: UserPreferences
  todaysContext: TodaysContext
  availableLoads?: AvailableLoad[]
  asOf?: string
  trainingState?: TrainingState
  decisions?: RecommendationDecision[]
  split?: Split
  splitWorkouts?: WorkoutTemplate[]
  authority?: PlanningAuthority
}

/**
 * The only composition boundary for today's final recommendations. Individual
 * rule modules remain candidate producers; this module resolves concrete
 * contradictions and applies one deterministic final ordering.
 */
export function generateRecommendations(input: RecommendationInput): Recommendation[] {
  return generateRecommendationsWithTrace(input).recommendations
}

export interface CandidateSuppression {
  candidateId: string
  code: 'required-removal' | 'equipment' | 'recovery' | 'near-failure' | 'productive-progression' | 'time-limit' | 'recent-frequency' | 'incompatible-action' | 'duplicate' | 'recently-declined' | 'unsupported-progression'
  reason: string
  winnerId?: string
}

export interface RecommendationConflictContext {
  plan: WorkoutPlan
  exercises: Exercise[]
  trainingState: TrainingState
  todaysContext: TodaysContext
}

/** Same pipeline as generateRecommendations, with inspectable state and decisions. */
export function generateRecommendationsWithTrace(input: RecommendationInput) {
  const { plan, exercises, history, preferences, todaysContext, availableLoads, decisions = [] } = input
  const asOf = input.asOf ?? input.trainingState?.asOf ?? currentCoachingDate()
  const priorityProfile = resolveMusclePriorities(preferences)
  const trainingState = resolveTrainingState(exercises, history, asOf, preferences.weightUnit, priorityProfile.orderedMuscles, input.trainingState)
  const coachingPreferences = deriveCoachingPreferences(trainingState, decisions)
  const planned = plannedExercisesFor(plan, exercises)
  const goalCriticalExerciseIds = planned
    .filter(({ exerciseId }) => exercises.find((exercise) => exercise.id === exerciseId)?.primaryMuscles.some((muscle) => priorityProfile.rankOf(muscle) !== undefined))
    .map(({ exerciseId }) => exerciseId)
  const userOwnsPlan = (input.authority ?? plan.planningAuthority ?? 'user-plan') === 'user-plan'
  const equipment = adaptWorkout(plan, exercises, todaysContext, preferences, preferences.defaultGymId, coachingPreferences)
  const omitted = new Set(equipment.filter((candidate) => candidate.type === 'REMOVE').map((candidate) => candidate.exerciseId))
  const timePlan = { ...plan, plannedExercises: planned.filter((slot) => !omitted.has(slot.exerciseId)) }
  const candidates: RecommendationCandidate[] = [
    ...(userOwnsPlan ? evaluatePlanFromState(plan, exercises, trainingState, preferences, availableLoads, decisions, todaysContext) : []),
    ...equipment,
    ...adaptWorkoutForTime(timePlan, exercises, todaysContext.availableMinutes, goalCriticalExerciseIds, trainingState, preferences),
    ...(userOwnsPlan && input.split && input.splitWorkouts ? splitAlignmentCandidates(input.split, input.splitWorkouts, exercises, preferences, trainingState) : []),
  ]
  const suppressed: CandidateSuppression[] = []
  const finalCandidates = resolveConcreteConflicts(candidates, { plan, exercises, trainingState, todaysContext }, (item) => suppressed.push(item))
  const exerciseOrder = new Map(planExerciseIds(plan).map((exerciseId, index) => [exerciseId, index]))
  const recommendations = finalCandidates
    .map((candidate) => toRecommendation(candidate, exercises))
    .filter((recommendation): recommendation is Recommendation => recommendation !== undefined)
    .map((recommendation) => ({ ...recommendation, feedbackContext: recommendationFeedbackContext(recommendation, trainingState, preferences, todaysContext, exercises) }))
    .filter((recommendation) => {
      if (recentlyDeclined(recommendation, decisions, plan.id, asOf)) {
        suppressed.push({ candidateId: recommendation.id, code: 'recently-declined', reason: 'This optional proposal was recently rejected and no material evidence has changed.' }); return false
      }
      return true
    })
    .map((recommendation): Recommendation => {
      const pathway = progressionPathway(recommendation, trainingState.unit)
      const learning = coachingPreferences.recommendationLearning.find((item) => item.pathway === pathway && item.deferRepeat)
      if (!learning) return recommendation
      suppressed.push({ candidateId: recommendation.id, code: 'unsupported-progression', reason: learning.reason })
      return { ...recommendation, id: `outcome-keep-${recommendation.id}`, type: 'KEEP', change: { kind: 'keep' }, reason: learning.reason, trace: buildTrace('keep-stable-exercise') }
    })
    .filter((recommendation, _index, all) => recommendation.type !== 'KEEP' || recommendation.id.startsWith('outcome-keep-') || !all.some((other) => other.id.startsWith('outcome-keep-') && JSON.stringify(other.target) === JSON.stringify(recommendation.target)))
    .sort((left, right) => compareFinalRecommendations(left, right, exerciseOrder))
  return { trainingState, coachingPreferences, candidates, suppressed, recommendations }
}

/** Structural and semantic precedence, independent of producer insertion order. */
export function resolveConcreteConflicts(candidates: RecommendationCandidate[], context?: RecommendationConflictContext, report: (suppression: CandidateSuppression) => void = () => {}): RecommendationCandidate[] {
  const ordered = [...candidates].sort(compareCandidates)
  const exerciseCandidates = ordered.filter(isExerciseCandidate)
  const removals = exerciseCandidates.filter((candidate) => candidate.type === 'REMOVE')
  const equipment = exerciseCandidates.filter((candidate) => candidate.trace.ruleId === 'adapt-unavailable-equipment' && candidate.type === 'REPLACE')
  const suppress = (candidate: RecommendationCandidate, code: CandidateSuppression['code'], reason: string, winnerId?: string) => report({ candidateId: candidate.id, code, reason, ...(winnerId ? { winnerId } : {}) })
  const pool: RecommendationCandidate[] = []
  for (const candidate of ordered) {
    if (!isExerciseCandidate(candidate)) {
      if (context && candidate.issue === 'under-frequency') {
        const muscle = muscleTrainingState(context.trainingState, candidate.muscle)
        if (!isMuscleOpportunity(muscle) || muscle.frequency7Days >= candidate.desiredFrequency) {
          suppress(candidate, 'recent-frequency', `${candidate.muscle} has ${muscle.frequency7Days} actual recent direct sessions and recovery state ${muscle.recovery}; defer optional frequency expansion.`)
          continue
        }
      }
      pool.push(candidate); continue
    }
    const removal = removals.find((item) => item.exerciseId === candidate.exerciseId)
    if (removal && candidate.type !== 'REMOVE') {
      suppress(candidate, 'required-removal', 'Removal supersedes other actions on the same exercise.', removal.id); continue
    }
    const contextual = equipment.find((item) => item.exerciseId === candidate.exerciseId)
    if (contextual && candidate !== contextual && candidate.type !== 'REMOVE'
      && !(candidate.type === 'MODIFY' && candidate.trace.ruleId === 'adapt-available-time')) {
      suppress(candidate, 'equipment', 'Unavailable equipment takes precedence over preference and historical performance.', contextual.id); continue
    }
    if (context) {
      const exercise = context.exercises.find((item) => item.id === candidate.exerciseId)
      const state = exercise ? exerciseTrainingState(context.trainingState, exercise.id) : undefined
      const blocked = exercise?.primaryMuscles.map((muscle) => muscleTrainingState(context.trainingState, muscle)).find((muscle) => !isMuscleOpportunity(muscle))
      const baseline = plannedExercisesFor(context.plan, context.exercises).find((slot) => slot.exerciseId === candidate.exerciseId)
      const expanding = candidate.type === 'ADD' || (candidate.type === 'MODIFY' && candidate.modifiedSets !== undefined && candidate.modifiedSets > (baseline?.sets ?? 0))
      if (expanding && exercise && !isExerciseAvailable(exercise, context.todaysContext)) {
        suppress(candidate, 'equipment', 'Optional work cannot use unavailable equipment.'); continue
      }
      if (expanding && blocked) {
        suppress(candidate, 'recovery', `${blocked.muscle} is ${blocked.recovery}; recent direct work takes precedence over optional priority volume.`); continue
      }
      if (candidate.type === 'PROGRESSION' && state && (blocked || hasNearFailureEvidence(state))) {
        const code = blocked ? 'recovery' : 'near-failure'
        const reason = blocked ? `${blocked.muscle} is ${blocked.recovery}. Keep the saved baseline; defer progression today.`
          : 'The latest valid working performance includes near-failure effort. Keep the demonstrated load before attempting progression.'
        const keep = { ...candidate, id: `state-keep-${candidate.id}`, type: 'KEEP' as const, progression: undefined, reasons: [reason], trace: buildTrace(blocked ? 'keep-for-recovery' : 'keep-for-effort') }
        suppress(candidate, code, reason, keep.id); pool.push(keep); continue
      }
      if (candidate.type === 'REPLACE' && candidate.trace.ruleId !== 'adapt-unavailable-equipment') {
        if (state?.progressionState === 'progressing') {
          suppress(candidate, 'productive-progression', 'Productive direct working performance takes precedence over optional variation.'); continue
        }
        const replacement = context.exercises.find((item) => item.id === candidate.alternativeExerciseId)
        if (blocked || replacement?.primaryMuscles.some((muscle) => !isMuscleOpportunity(muscleTrainingState(context.trainingState, muscle)))) {
          suppress(candidate, 'recovery', 'Defer optional variation while its direct muscle targets are recovering.'); continue
        }
      }
    }
    pool.push(candidate)
  }
  const seen = new Map<string, RecommendationCandidate>()
  const replacements = new Map<string, ExerciseRecommendationCandidate>()
  const modifications = new Map<string, ExerciseRecommendationCandidate>()
  // Hard time reductions win over optional set increases, regardless of score.
  const sorted = pool.sort((left, right) => Number(right.trace.ruleId === 'adapt-available-time') - Number(left.trace.ruleId === 'adapt-available-time') || compareCandidates(left, right))
  const resolved: RecommendationCandidate[] = []
  for (const candidate of sorted) {
    const key = candidateActionKey(candidate)
    const duplicate = seen.get(key)
    if (duplicate) { suppress(candidate, 'duplicate', 'Identical action already represented by the canonical candidate.', duplicate.id); continue }
    if (isExerciseCandidate(candidate) && candidate.type === 'REPLACE') {
      const winner = replacements.get(candidate.exerciseId)
      if (winner) { suppress(candidate, 'incompatible-action', 'Only one replacement can occupy this exercise slot.', winner.id); continue }
      replacements.set(candidate.exerciseId, candidate)
    }
    if (isExerciseCandidate(candidate) && candidate.type === 'MODIFY') {
      const winner = modifications.get(candidate.exerciseId)
      if (winner) { suppress(candidate, winner.trace.ruleId === 'adapt-available-time' ? 'time-limit' : 'incompatible-action', 'Only one set prescription can apply to the same slot.', winner.id); continue }
      modifications.set(candidate.exerciseId, candidate)
    }
    seen.set(key, candidate); resolved.push(candidate)
  }
  const structural = resolved.filter((candidate) => {
    if (!isExerciseCandidate(candidate)) return true
    const replacement = replacements.get(candidate.exerciseId)
    if (replacement && ['KEEP', 'PROGRESSION'].includes(candidate.type)) {
      suppress(candidate, 'incompatible-action', 'An exercise being replaced cannot also be kept or progressed.', replacement.id); return false
    }
    const usesSameSlot = candidate.type === 'ADD' ? [...replacements.values()].find((item) => item.alternativeExerciseId === candidate.exerciseId) : undefined
    if (usesSameSlot) { suppress(candidate, 'incompatible-action', 'The movement is already provided by a substitution.', usesSameSlot.id); return false }
    return true
  }).sort(compareCandidates)
  if (!context || context.todaysContext.availableMinutes === undefined) return structural
  const slots = plannedExercisesFor(context.plan, context.exercises)
  const removed = new Set(structural.filter(isExerciseCandidate).filter((item) => item.type === 'REMOVE').map((item) => item.exerciseId))
  let duration = slots.filter((slot) => !removed.has(slot.exerciseId)).reduce((total, slot) => {
    const change = modifications.get(slot.exerciseId)
    return total + Math.min(slot.sets, change?.modifiedSets ?? slot.sets) * MINUTES_PER_WORKING_SET + MINUTES_PER_EXERCISE_TRANSITION
  }, 0)
  return structural.filter((candidate) => {
    if (!isExerciseCandidate(candidate)) return true
    const exercise = context.exercises.find((item) => item.id === candidate.exerciseId)
    const baseline = slots.find((slot) => slot.exerciseId === candidate.exerciseId)
    const extra = candidate.type === 'ADD' && exercise ? exercise.defaultSets * MINUTES_PER_WORKING_SET + MINUTES_PER_EXERCISE_TRANSITION
      : candidate.type === 'MODIFY' ? Math.max(0, (candidate.modifiedSets ?? 0) - (baseline?.sets ?? 0)) * MINUTES_PER_WORKING_SET : 0
    if (extra > 0 && duration + extra > context.todaysContext.availableMinutes!) {
      suppress(candidate, 'time-limit', 'Optional work would exceed the hard time limit after required adaptations.'); return false
    }
    duration += extra
    return true
  })
}

function compareCandidates(left: RecommendationCandidate, right: RecommendationCandidate) {
  return Number(right.trace.ruleId.startsWith('keep-for-')) - Number(left.trace.ruleId.startsWith('keep-for-')) || right.score - left.score || left.id.localeCompare(right.id) || candidateActionKey(left).localeCompare(candidateActionKey(right))
    || candidateEvidenceKey(left).localeCompare(candidateEvidenceKey(right))
}

function candidateEvidenceKey(candidate: RecommendationCandidate) {
  const progression = isExerciseCandidate(candidate) ? candidate.progression : undefined
  return JSON.stringify([candidate.reasons, candidate.trace.ruleId, candidate.trace.principleId, candidate.trace.principleDescription, candidate.trace.evidenceLevel, candidate.trace.source,
    progression?.action, progression?.sets, progression?.confidence, progression?.reasons])
}

function candidateActionKey(candidate: RecommendationCandidate): string {
  if (!isExerciseCandidate(candidate)) return `SPLIT:${candidate.splitId}:${candidate.muscle}:${candidate.desiredFrequency}:${candidate.plannedFrequency}:${candidate.issue}`
  switch (candidate.type) {
    case 'KEEP': return `KEEP:${candidate.exerciseId}`
    case 'PROGRESSION': return `PROGRESSION:${candidate.exerciseId}:${candidate.progression?.weight ?? ''}:${candidate.progression?.repRange.min ?? ''}:${candidate.progression?.repRange.max ?? ''}`
    case 'ADD': return `ADD:${candidate.exerciseId}`
    case 'REPLACE': return `REPLACE:${candidate.exerciseId}:${candidate.alternativeExerciseId ?? ''}`
    case 'REMOVE': return `REMOVE:${candidate.exerciseId}`
    case 'MODIFY': return `MODIFY:${candidate.exerciseId}:${candidate.modifiedSets ?? ''}`
  }
}

function toRecommendation(candidate: RecommendationCandidate, exercises: Exercise[]): Recommendation | undefined {
  if (!isExerciseCandidate(candidate)) {
    return { id: candidate.id, type: candidate.type, priority: candidate.score, target: { kind: 'split', splitId: candidate.splitId }, change: { kind: 'split-adjustment', muscle: candidate.muscle, desiredFrequency: candidate.desiredFrequency, plannedFrequency: candidate.plannedFrequency, issue: candidate.issue }, reason: candidate.reasons[0] ?? candidate.trace.principleDescription, trace: candidate.trace }
  }
  const exercise = exercises.find((item) => item.id === candidate.exerciseId)
  if (!exercise) return undefined
  const change = changeFor(candidate, exercise)
  if (!change) return undefined
  return {
    id: candidate.id,
    type: candidate.type,
    priority: candidate.score,
    target: { kind: 'exercise', exerciseId: candidate.exerciseId },
    change,
    reason: candidate.reasons[0] ?? candidate.trace.principleDescription,
    trace: candidate.trace,
  }
}

function changeFor(candidate: RecommendationCandidate, exercise: Exercise): RecommendationChange | undefined {
  if (!isExerciseCandidate(candidate)) return undefined
  switch (candidate.type) {
    case 'KEEP': return { kind: 'keep' }
    case 'PROGRESSION': return candidate.progression ? { kind: 'progression', recommendedLoad: candidate.progression.weight, repRange: candidate.progression.repRange } : undefined
    case 'ADD': return { kind: 'add', exerciseId: candidate.exerciseId, sets: exercise.defaultSets, repRange: exercise.repRange }
    case 'REPLACE': return candidate.alternativeExerciseId ? { kind: 'replace', fromExerciseId: candidate.exerciseId, toExerciseId: candidate.alternativeExerciseId } : undefined
    case 'REMOVE': return { kind: 'remove', exerciseId: candidate.exerciseId }
    case 'MODIFY': return candidate.modifiedSets === undefined ? undefined : { kind: 'modify', exerciseId: candidate.exerciseId, changes: { sets: candidate.modifiedSets } }
  }
}

function isExerciseCandidate(candidate: RecommendationCandidate): candidate is ExerciseRecommendationCandidate {
  return candidate.type !== 'SPLIT'
}

export function recommendationExerciseId(recommendation: Recommendation): string | undefined {
  if (recommendation.target.kind === 'exercise') return recommendation.target.exerciseId
  if (recommendation.change.kind === 'add') return recommendation.change.exerciseId
  return undefined
}
