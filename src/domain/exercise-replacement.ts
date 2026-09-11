import { evaluateExerciseCandidates, rankExerciseCandidates } from './exercise-intelligence'
import type { ExerciseReplacementReason, ExerciseReplacementRequest, ExerciseReplacementResult } from './models'

/**
 * Shared bridge from a rule that warrants change to the structural candidate
 * pipeline. It neither decides that a replacement is warranted nor assigns a
 * recommendation-type priority score.
 */
export function findExerciseReplacement(request: ExerciseReplacementRequest): ExerciseReplacementResult {
  const consideredCandidates = evaluateExerciseCandidates({
    exercise: request.originalExercise,
    exercises: request.exercises,
    role: request.role,
    goals: request.goals,
    priorityMuscles: request.priorityMuscles,
    constraints: request.constraints,
    preferences: request.preferences,
    decisions: request.decisions,
  })
  const rankedCandidates = rankExerciseCandidates(consideredCandidates)
  return {
    reason: request.reason,
    consideredCandidates,
    rankedCandidates,
    ...(rankedCandidates[0] ? { selectedCandidate: rankedCandidates[0] } : {}),
  }
}

/** Human-readable cause supplied by the firing rule, separate from candidate reasons. */
export function replacementReasonDescription(reason: ExerciseReplacementReason) {
  switch (reason) {
    case 'equipment-unavailable': return 'The planned equipment is unavailable today.'
    case 'stalled': return 'Recent comparable working-set performance has repeatedly stalled.'
    case 'regressing': return 'Recent comparable working-set performance has repeatedly regressed.'
  }
}
