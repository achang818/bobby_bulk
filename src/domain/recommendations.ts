import { adaptWorkout, adaptWorkoutForTime } from './adaptation'
import { resolveMusclePriorities } from './muscle-priorities'
import { evaluatePlan } from './plan-evaluator'
import { compareFinalRecommendations } from './rules'
import { planExerciseIds, plannedExercisesFor } from './workout-session'
import type { AvailableLoad, Exercise, RecommendationCandidate, Recommendation, RecommendationChange, RecommendationDecision, TodaysContext, UserPreferences, Workout, WorkoutPlan } from './models'

export interface RecommendationInput {
  plan: WorkoutPlan
  exercises: Exercise[]
  history: Workout[]
  preferences: UserPreferences
  todaysContext: TodaysContext
  availableLoads?: AvailableLoad[]
  asOf?: string
  decisions?: RecommendationDecision[]
}

/**
 * The only composition boundary for today's final recommendations. Individual
 * rule modules remain candidate producers; this module resolves concrete
 * contradictions and applies one deterministic final ordering.
 */
export function generateRecommendations(input: RecommendationInput): Recommendation[] {
  const { plan, exercises, history, preferences, todaysContext, availableLoads, asOf, decisions = [] } = input
  const planned = plannedExercisesFor(plan, exercises)
  const priorityProfile = resolveMusclePriorities(preferences)
  const goalCriticalExerciseIds = planned
    .filter(({ exerciseId }) => exercises.find((exercise) => exercise.id === exerciseId)?.primaryMuscles.some((muscle) => priorityProfile.rankOf(muscle) !== undefined))
    .map(({ exerciseId }) => exerciseId)
  const candidates = [
    ...evaluatePlan(plan, exercises, history, preferences, asOf, availableLoads, decisions),
    ...adaptWorkout(plan, exercises, todaysContext, preferences),
    ...adaptWorkoutForTime(plan, exercises, todaysContext.availableMinutes, goalCriticalExerciseIds),
  ]
  const finalCandidates = resolveConcreteConflicts(candidates)
  const exerciseOrder = new Map(planExerciseIds(plan).map((exerciseId, index) => [exerciseId, index]))
  return finalCandidates
    .map((candidate) => toRecommendation(candidate, exercises))
    .filter((recommendation): recommendation is Recommendation => recommendation !== undefined)
    .sort((left, right) => compareFinalRecommendations(left, right, exerciseOrder))
}

/**
 * Only explicit contradictions are resolved here. Multiple additions, keeps,
 * or progression suggestions remain valid and are never capped by type.
 */
export function resolveConcreteConflicts(candidates: RecommendationCandidate[]): RecommendationCandidate[] {
  const removedExerciseIds = new Set(candidates.filter((candidate) => candidate.type === 'REMOVE').map((candidate) => candidate.exerciseId))
  const contextualReplacementByExercise = new Map(candidates
    .filter((candidate) => candidate.type === 'REPLACE' && candidate.trace.ruleId === 'adapt-unavailable-equipment')
    .map((candidate) => [candidate.exerciseId, candidate]))
  const seen = new Set<string>()

  return candidates.filter((candidate) => {
    // Removing an exercise is incompatible with every other change to that
    // same exercise; the time rule has already established removal is needed.
    if (removedExerciseIds.has(candidate.exerciseId) && candidate.type !== 'REMOVE') return false
    // An unavailable movement cannot also be kept, progressed, or replaced by
    // a historical-variation rule. The context replacement is the hard winner.
    const contextual = contextualReplacementByExercise.get(candidate.exerciseId)
    if (contextual && candidate !== contextual) return false
    // Candidate rules can overlap; collapse only identical final actions.
    const key = candidate.type === 'ADD' ? `ADD:${candidate.exerciseId}` : candidate.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function toRecommendation(candidate: RecommendationCandidate, exercises: Exercise[]): Recommendation | undefined {
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
  switch (candidate.type) {
    case 'KEEP': return { kind: 'keep' }
    case 'PROGRESSION': return candidate.progression ? { kind: 'progression', recommendedLoad: candidate.progression.weight, repRange: candidate.progression.repRange } : undefined
    case 'ADD': return { kind: 'add', exerciseId: candidate.exerciseId, sets: exercise.defaultSets, repRange: exercise.repRange }
    case 'REPLACE': return candidate.alternativeExerciseId ? { kind: 'replace', fromExerciseId: candidate.exerciseId, toExerciseId: candidate.alternativeExerciseId } : undefined
    case 'REMOVE': return { kind: 'remove', exerciseId: candidate.exerciseId }
    case 'MODIFY': return candidate.modifiedSets === undefined ? undefined : { kind: 'modify', exerciseId: candidate.exerciseId, changes: { sets: candidate.modifiedSets } }
  }
}

export function recommendationExerciseId(recommendation: Recommendation): string | undefined {
  if (recommendation.target.kind === 'exercise') return recommendation.target.exerciseId
  if (recommendation.change.kind === 'add') return recommendation.change.exerciseId
  return undefined
}
