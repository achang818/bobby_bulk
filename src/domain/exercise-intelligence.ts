import { equipmentTagFor } from './equipment'
import { sameMuscle } from './muscle-priorities'
import { classifyPreference } from './states'
import type { Exercise, ExerciseCandidate, ExerciseCandidateRequest, ExerciseCompatibility, ExerciseRole, ExerciseSimilarity, TrainingGoal } from './models'

/**
 * Describes structural similarity only. It deliberately makes no claim that
 * the two exercises are interchangeable.
 */
export function describeExerciseSimilarity(exercise: Exercise, candidate: Exercise, goalContext: readonly TrainingGoal[] = []): ExerciseSimilarity {
  const directPrimaryMuscleOverlap = overlap(exercise.primaryMuscles, candidate.primaryMuscles)
  const supportingMuscleOverlap = unique([
    ...overlap(exercise.primaryMuscles, candidate.secondaryMuscles),
    ...overlap(exercise.secondaryMuscles, candidate.primaryMuscles),
  ])
  const relevantGoals = goalContext.length ? goalContext : exercise.goals as TrainingGoal[]
  return {
    sameExercise: exercise.id === candidate.id,
    directPrimaryMuscleOverlap,
    supportingMuscleOverlap,
    movementPatternMatch: exercise.movementPattern === candidate.movementPattern,
    primaryActionMatch: exercise.primaryAction === candidate.primaryAction,
    typeMatch: exercise.type === candidate.type,
    categoryMatch: exercise.category === candidate.category,
    goalOverlap: overlap(relevantGoals, candidate.goals) as TrainingGoal[],
  }
}

/** Default role when a caller does not have a richer workout-level role yet. */
export function inferExerciseRole(exercise: Exercise): ExerciseRole {
  return exercise.type === 'compound' ? 'primary-compound' : 'isolation'
}

/**
 * Evaluates a candidate before ranking. Hard eligibility is intentionally
 * separate from structural similarity and soft preference adjustments.
 */
export function evaluateExerciseCandidate(request: Omit<ExerciseCandidateRequest, 'exercises'>, candidate: Exercise): ExerciseCandidate {
  const role = request.role ?? inferExerciseRole(request.exercise)
  const similarity = describeExerciseSimilarity(request.exercise, candidate, request.goals)
  const preference = classifyPreference(candidate.id, {
    preferredExerciseIds: request.preferences?.preferredExerciseIds ?? [],
    recommendLessExerciseIds: request.preferences?.recommendLessExerciseIds ?? [],
    excludedExerciseIds: request.preferences?.excludedExerciseIds ?? [],
    dislikedExerciseIds: request.preferences?.dislikedExerciseIds ?? [],
  }, request.decisions)
  const equipmentMatch = !request.constraints?.unavailableEquipment?.includes(equipmentTagFor(candidate))
  const explicitlyExcluded = request.constraints?.excludedExerciseIds?.includes(candidate.id) ?? false
  const roleMatch = preservesRole(request.exercise, candidate, role) ? 'preserved' : 'changed'
  const muscleMatch = similarity.directPrimaryMuscleOverlap.length ? 'direct' : similarity.supportingMuscleOverlap.length ? 'supporting-only' : 'none'
  const compatibility = compatibilityFor(similarity)
  const priorityMuscleRank = priorityRank(similarity.directPrimaryMuscleOverlap, request.priorityMuscles)
  const goalMatch = similarity.goalOverlap.length > 0
  const eligibility = preference === 'excluded' || explicitlyExcluded
    ? 'excluded'
    : !equipmentMatch
      ? 'unavailable-equipment'
      : request.constraints?.requireSameCategory && !similarity.categoryMatch
        ? 'category-mismatch'
        : muscleMatch !== 'direct'
          ? 'missing-direct-primary-target'
          : 'eligible'

  return {
    exercise: candidate,
    similarity,
    compatibility,
    eligibility,
    roleMatch,
    muscleMatch,
    movementMatch: similarity.movementPatternMatch,
    equipmentMatch,
    goalMatch,
    ...(priorityMuscleRank === undefined ? {} : { priorityMuscleRank }),
    preference,
    preferenceAdjustment: preference === 'preferred' ? 'boost' : preference === 'recommend-less' ? 'penalty' : preference === 'excluded' ? 'excluded' : 'none',
    reasons: candidateReasons(similarity, roleMatch, preference, goalMatch),
  }
}

/** Returns only hard-eligible candidates, ranked by visible structural dimensions. */
export function findExerciseCandidates(request: ExerciseCandidateRequest): ExerciseCandidate[] {
  return rankExerciseCandidates(evaluateExerciseCandidates(request))
}

/** Evaluates every non-identical candidate so an interface can explain exclusions. */
export function evaluateExerciseCandidates(request: ExerciseCandidateRequest): ExerciseCandidate[] {
  const evaluationRequest = { ...request }
  return request.exercises
    .filter((candidate) => candidate.id !== request.exercise.id)
    .map((candidate) => evaluateExerciseCandidate(evaluationRequest, candidate))
}

/** Ranks only candidates that have passed the hard eligibility rules. */
export function rankExerciseCandidates(candidates: ExerciseCandidate[]): ExerciseCandidate[] {
  return candidates
    .filter((candidate) => candidate.eligibility === 'eligible')
    .sort(compareCandidates)
}

function compatibilityFor(similarity: ExerciseSimilarity): ExerciseCompatibility {
  if (!similarity.directPrimaryMuscleOverlap.length) return 'weak'
  if (similarity.movementPatternMatch && similarity.primaryActionMatch && similarity.typeMatch) return 'strong'
  if (similarity.movementPatternMatch || similarity.primaryActionMatch) return 'reasonable'
  return 'weak'
}

function preservesRole(original: Exercise, candidate: Exercise, role: ExerciseRole) {
  if (role === 'optional-variation') return true
  if (role === 'primary-compound' || role === 'secondary-compound') return candidate.type === 'compound'
  if (role === 'isolation' || role === 'accessory') return candidate.type === 'isolation'
  return candidate.type === original.type
}

function priorityRank(directOverlap: string[], priorities: string[] | undefined) {
  const rank = priorities?.findIndex((priority) => directOverlap.some((muscle) => sameMuscle(muscle, priority))) ?? -1
  return rank < 0 ? undefined : rank
}

function candidateReasons(similarity: ExerciseSimilarity, roleMatch: ExerciseCandidate['roleMatch'], preference: ExerciseCandidate['preference'], goalMatch: boolean) {
  const reasons: string[] = []
  if (similarity.directPrimaryMuscleOverlap.length) reasons.push(`Direct ${similarity.directPrimaryMuscleOverlap.join(', ')} target preserved.`)
  else if (similarity.supportingMuscleOverlap.length) reasons.push(`Only supporting ${similarity.supportingMuscleOverlap.join(', ')} involvement overlaps; no direct target is preserved.`)
  if (similarity.movementPatternMatch) reasons.push('Preserves the planned movement pattern.')
  if (similarity.primaryActionMatch) reasons.push('Preserves the primary joint action.')
  if (roleMatch === 'preserved') reasons.push('Preserves the requested workout role.')
  else reasons.push('Changes the requested workout role.')
  if (goalMatch) reasons.push('Supports the active goal context.')
  if (preference === 'preferred') reasons.push('Preferred by you.')
  if (preference === 'recommend-less') reasons.push('Recommend-less preference lowers its rank.')
  return reasons
}

/** Lexicographic comparison keeps each decision dimension inspectable. */
function compareCandidates(left: ExerciseCandidate, right: ExerciseCandidate) {
  return compareBoolean(right.roleMatch === 'preserved', left.roleMatch === 'preserved')
    || comparePriority(left.priorityMuscleRank, right.priorityMuscleRank)
    || compatibilityRank(right.compatibility) - compatibilityRank(left.compatibility)
    || right.similarity.directPrimaryMuscleOverlap.length - left.similarity.directPrimaryMuscleOverlap.length
    || compareBoolean(right.goalMatch, left.goalMatch)
    || preferenceRank(right.preference) - preferenceRank(left.preference)
    || left.exercise.name.localeCompare(right.exercise.name)
    || left.exercise.id.localeCompare(right.exercise.id)
}

function compareBoolean(left: boolean, right: boolean) { return Number(left) - Number(right) }
function comparePriority(left: number | undefined, right: number | undefined) {
  if (left === undefined && right === undefined) return 0
  if (left === undefined) return 1
  if (right === undefined) return -1
  return left - right
}
function compatibilityRank(value: ExerciseCompatibility) { return value === 'strong' ? 3 : value === 'reasonable' ? 2 : 1 }
function preferenceRank(value: ExerciseCandidate['preference']) { return value === 'preferred' ? 2 : value === 'neutral' ? 1 : value === 'recommend-less' ? 0 : -1 }
function overlap(left: readonly string[], right: readonly string[]) { return left.filter((item) => right.some((candidate) => sameMuscle(item, candidate))) }
function unique(values: string[]) { return values.filter((value, index) => values.findIndex((item) => sameMuscle(item, value)) === index) }
