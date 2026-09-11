import type { ExercisePerformance, ExerciseProgressState, MuscleVolumeState, PerformedSet, PreferenceState, RecommendationDecision, Workout } from './models'

export type RecentWorkloadLevel = 'Low' | 'Moderate' | 'High'

export type PerformanceComparisonDirection = 'improved' | 'worse' | 'unchanged' | 'inconclusive'

export interface PerformanceComparison {
  direction: PerformanceComparisonDirection
  comparableSets: number
  improvedSets: number
  worsenedSets: number
  unchangedSets: number
  /** The real set IDs used as direct evidence; no synthetic sets are created. */
  matchedSets?: { previousSetId: string; currentSetId: string; direction: PerformanceComparisonDirection }[]
  reasons: string[]
}

interface WorkingSetMatch {
  previous: PerformedSet
  current: PerformedSet
}

/**
 * Compare completed exercise sessions from their individual working sets.
 *
 * Loads within 3% (with a 2.5-unit floor) are treated as the same load. This
 * makes ordinary plate/increment changes comparable (for example 100 and
 * 102.5) without pretending that materially different loads are identical.
 * Higher load is only positive direct evidence when reps are maintained, and
 * an effort jump (RIR first, then RPE) can make that evidence inconclusive.
 */
export function compareExercisePerformance(previous: ExercisePerformance, current: ExercisePerformance): PerformanceComparison {
  if (hasIncompatibleRepPrescription(previous, current)) {
    return emptyComparison('The prescribed rep range changed, so the sessions are not directly comparable.')
  }

  const previousSets = workingSetsForComparison(previous)
  const currentSets = workingSetsForComparison(current)
  if (previousSets.length === 0 || currentSets.length === 0) return emptyComparison('Both sessions need at least one ordinary working set.')

  let improvedSets = 0
  let worsenedSets = 0
  let unchangedSets = 0
  let comparableSets = 0
  const matchedSets: NonNullable<PerformanceComparison['matchedSets']> = []

  for (const match of matchWorkingSets(previousSets, currentSets, previous.plannedRepRange)) {
    const result = compareWorkingSet(match.previous, match.current)
    matchedSets.push({ previousSetId: match.previous.id, currentSetId: match.current.id, direction: result })
    if (result === 'inconclusive') continue
    comparableSets += 1
    if (result === 'improved') improvedSets += 1
    else if (result === 'worse') worsenedSets += 1
    else unchangedSets += 1
  }

  const reasons: string[] = []
  const prescription = comparePrescription(previous, current)
  if (prescription === 'improved') reasons.push('More of the compatible prescription was completed in the target range.')
  if (prescription === 'worse') reasons.push('Less of the compatible prescription was completed in the target range.')

  // Direct set evidence takes precedence. A single contradictory set is not
  // erased by e1RM or completion, while a clear majority across a session is.
  if (improvedSets > worsenedSets && improvedSets > 0) {
    return { direction: 'improved', comparableSets, improvedSets, worsenedSets, unchangedSets, matchedSets, reasons: ['More comparable working sets improved.', ...reasons] }
  }
  if (worsenedSets > improvedSets && worsenedSets > 0) {
    return { direction: 'worse', comparableSets, improvedSets, worsenedSets, unchangedSets, matchedSets, reasons: ['More comparable working sets were weaker.', ...reasons] }
  }
  if (improvedSets > 0 && worsenedSets > 0) {
    return { direction: 'inconclusive', comparableSets, improvedSets, worsenedSets, unchangedSets, matchedSets, reasons: ['Comparable working sets gave mixed signals; no derived metric will override them.', ...reasons] }
  }
  // Unchanged matched sets establish the load/rep baseline. More target-range
  // work can still be real progress after that baseline is held, while clear
  // declines and mixed direct evidence have already returned above.
  if (prescription === 'improved' || prescription === 'worse') {
    return { direction: prescription, comparableSets, improvedSets, worsenedSets, unchangedSets, matchedSets, reasons }
  }
  if (comparableSets > 0) {
    // e1RM is only a tiebreaker after direct set evidence is neutral.
    const supportingDirection = e1rmSupport(previous, current)
    if (supportingDirection !== 'unchanged') reasons.push('Estimated 1RM was used only as supporting evidence after the set comparison.')
    return { direction: supportingDirection, comparableSets, improvedSets, worsenedSets, unchangedSets, matchedSets, reasons }
  }
  return emptyComparison('The working sets use meaningfully different loads or effort, so there is not enough comparable evidence.')
}

/**
 * A deliberately conservative recent-history classification. Improvement can
 * be shown by a clear comparable session; regression requires two consecutive
 * weaker comparisons so an isolated bad workout remains stable.
 */
export function classifyExerciseProgression(performance: ExercisePerformance[]): ExerciseProgressState {
  if (performance.length < 2) return 'insufficient history'
  const recent = performance.slice(-3)
  const comparisons = recent.slice(1).map((item, index) => compareExercisePerformance(recent[index], item))
  const latest = comparisons.at(-1)
  if (latest?.direction === 'improved') return 'progressing'
  if (comparisons.length === 2 && comparisons.every((comparison) => comparison.direction === 'worse')) return 'regressing'
  if (comparisons.length === 2 && comparisons.every((comparison) => comparison.direction === 'unchanged')) return 'stalled'
  if (comparisons.some((comparison) => comparison.direction === 'improved') && !comparisons.some((comparison) => comparison.direction === 'worse')) return 'progressing'
  if (comparisons.some((comparison) => comparison.direction !== 'inconclusive')) return 'stable'
  return 'insufficient history'
}

function emptyComparison(reason: string): PerformanceComparison {
  return { direction: 'inconclusive', comparableSets: 0, improvedSets: 0, worsenedSets: 0, unchangedSets: 0, reasons: [reason] }
}

function workingSetsForComparison(performance: ExercisePerformance): PerformedSet[] {
  // `workingSets` is normally already filtered by features.ts. Filter again so
  // hand-built/legacy performance objects cannot accidentally promote warm-up,
  // drop, or failure sets into normal progression evidence.
  return performance.workingSets.filter((set) => set.setType === 'working')
}

/**
 * Match actual working sets once each; no aggregate or synthetic set is ever
 * produced. For each current set, an approximately equal load wins first,
 * then target-range compatibility, nearest rep count, similar recorded effort,
 * and finally a stable ID tie-breaker. Very different loads remain unmatched.
 */
function matchWorkingSets(previousSets: PerformedSet[], currentSets: PerformedSet[], repRange?: { min: number; max: number }): WorkingSetMatch[] {
  const unusedPrevious = new Set(previousSets.map((set) => set.id))
  const unmatchedCurrent = new Set(currentSets.map((set) => set.id))
  const matches: WorkingSetMatch[] = []
  const orderedCurrent = [...currentSets].sort((left, right) => right.weight - left.weight || right.reps - left.reps || left.id.localeCompare(right.id))

  // Preserve the strongest semantic relationship before considering wider
  // comparable-load candidates. Without this pass, a nearby heavier set could
  // consume the historical counterpart of a later exact-load set.
  for (const current of orderedCurrent) {
    const candidates = previousSets.filter((previous) => unusedPrevious.has(previous.id) && approximatelySameLoad(previous.weight, current.weight))
    const previous = bestMatch(candidates, current, repRange)
    if (!previous) continue
    unusedPrevious.delete(previous.id)
    unmatchedCurrent.delete(current.id)
    matches.push({ previous, current })
  }

  for (const current of orderedCurrent.filter((set) => unmatchedCurrent.has(set.id))) {
    const candidates = previousSets.filter((previous) => unusedPrevious.has(previous.id) && reasonablyComparableLoad(previous.weight, current.weight))
    const previous = bestMatch(candidates, current, repRange)
    if (!previous) continue
    unusedPrevious.delete(previous.id)
    matches.push({ previous, current })
  }
  return matches
}

function bestMatch(candidates: PerformedSet[], current: PerformedSet, repRange?: { min: number; max: number }) {
  return candidates.sort((left, right) => matchPriority(left, current, repRange) - matchPriority(right, current, repRange) || left.id.localeCompare(right.id))[0]
}

function matchPriority(previous: PerformedSet, current: PerformedSet, repRange?: { min: number; max: number }) {
  const sameLoadPriority = approximatelySameLoad(previous.weight, current.weight) ? 0 : 1
  const sameTargetStatusPriority = repRange === undefined || isInTargetRange(previous, repRange) === isInTargetRange(current, repRange) ? 0 : 1
  const repDifference = Math.abs(previous.reps - current.reps)
  const effortDifference = comparableEffortDifference(previous, current)
  const loadDifference = Math.abs(previous.weight - current.weight)
  // Each field has a smaller range than the preceding multiplier, preserving
  // the stated priority while keeping the greedy match deterministic.
  return sameLoadPriority * 1_000_000 + sameTargetStatusPriority * 100_000 + repDifference * 1_000 + effortDifference * 10 + loadDifference
}

function reasonablyComparableLoad(left: number, right: number) {
  // This wider matching boundary is not the "same load" tolerance. It merely
  // keeps normal load progressions (such as 140 to 160) eligible for a direct
  // comparison, while leaving radically different loads unmatched.
  return Math.abs(left - right) <= Math.max(5, Math.min(left, right) * 0.15)
}

function isInTargetRange(set: PerformedSet, repRange: { min: number; max: number }) {
  return set.reps >= repRange.min && set.reps <= repRange.max
}

function comparableEffortDifference(previous: PerformedSet, current: PerformedSet) {
  if (previous.rir !== undefined && current.rir !== undefined) return Math.abs(previous.rir - current.rir)
  if (previous.rir === undefined && current.rir === undefined && previous.rpe !== undefined && current.rpe !== undefined) return Math.abs(previous.rpe - current.rpe)
  return 9
}

function compareWorkingSet(previous: PerformedSet, current: PerformedSet): PerformanceComparisonDirection {
  const sameLoad = approximatelySameLoad(previous.weight, current.weight)
  const moreDemandingEffort = effortWasSubstantiallyHarder(previous, current)

  if (sameLoad) {
    if (current.reps >= previous.reps + 1) return 'improved'
    if (previous.reps >= current.reps + 1 && !effortWasSubstantiallyEasier(previous, current)) return 'worse'
    return 'unchanged'
  }

  // A real load increase counts only if the rep performance was maintained
  // without a large jump in effort. A heavier low-rep grinder is deliberately
  // left inconclusive rather than being called automatic progress.
  if (current.weight > previous.weight && current.reps >= previous.reps && !moreDemandingEffort) return 'improved'
  if (current.weight < previous.weight && current.reps <= previous.reps && !effortWasSubstantiallyEasier(previous, current)) return 'worse'
  return 'inconclusive'
}

function approximatelySameLoad(left: number, right: number) {
  return Math.abs(left - right) <= Math.max(2.5, Math.min(left, right) * 0.03)
}

function effortWasSubstantiallyHarder(previous: PerformedSet, current: PerformedSet) {
  if (previous.rir !== undefined && current.rir !== undefined) return current.rir <= previous.rir - 2
  if (previous.rir === undefined && current.rir === undefined && previous.rpe !== undefined && current.rpe !== undefined) return current.rpe >= previous.rpe + 2
  // Do not convert RIR to RPE. A recorded near-failure set can still make a
  // heavier comparison ambiguous when the earlier recorded effort was not.
  if (hasEffortEvidence(previous) && hasEffortEvidence(current)) return isNearFailure(current) && !isNearFailure(previous)
  return false
}

function effortWasSubstantiallyEasier(previous: PerformedSet, current: PerformedSet) {
  if (previous.rir !== undefined && current.rir !== undefined) return current.rir >= previous.rir + 2
  if (previous.rir === undefined && current.rir === undefined && previous.rpe !== undefined && current.rpe !== undefined) return current.rpe <= previous.rpe - 2
  return false
}

function hasEffortEvidence(set: PerformedSet) { return set.rir !== undefined || set.rpe !== undefined }
function isNearFailure(set: PerformedSet) { return set.rir !== undefined ? set.rir <= 1 : set.rpe !== undefined && set.rpe >= 9 }

function hasIncompatibleRepPrescription(previous: ExercisePerformance, current: ExercisePerformance) {
  const before = previous.plannedRepRange
  const after = current.plannedRepRange
  return before !== undefined && after !== undefined && (before.min !== after.min || before.max !== after.max)
}

function comparePrescription(previous: ExercisePerformance, current: ExercisePerformance): Extract<PerformanceComparisonDirection, 'improved' | 'worse'> | 'unchanged' {
  // Rep range must remain compatible. A larger prescription can reveal a
  // meaningful increase in completed target-range work; a smaller prescription
  // does not by itself establish a decline.
  if (hasIncompatibleRepPrescription(previous, current) || previous.plannedSets === undefined || current.plannedSets === undefined) return 'unchanged'
  if (current.plannedSets >= previous.plannedSets && (current.targetRangeWorkingSets > previous.targetRangeWorkingSets || (current.prescriptionAchieved && previous.prescriptionAchieved === false))) return 'improved'
  if (current.plannedSets <= previous.plannedSets && (current.targetRangeWorkingSets < previous.targetRangeWorkingSets || (previous.prescriptionAchieved && current.prescriptionAchieved === false))) return 'worse'
  return 'unchanged'
}

function e1rmSupport(previous: ExercisePerformance, current: ExercisePerformance): PerformanceComparisonDirection {
  if (previous.bestEstimatedOneRepMax === undefined || current.bestEstimatedOneRepMax === undefined) return 'unchanged'
  if (current.bestEstimatedOneRepMax >= previous.bestEstimatedOneRepMax * 1.03) return 'improved'
  if (current.bestEstimatedOneRepMax <= previous.bestEstimatedOneRepMax * 0.95) return 'worse'
  return 'unchanged'
}

export function classifyMuscleVolume(recentSets: number): MuscleVolumeState {
  if (recentSets === 0) return 'insufficient history'
  if (recentSets < 6) return 'low recent volume'
  if (recentSets > 18) return 'high recent volume'
  return 'moderate recent volume'
}

export function rejectedKeepCount(exerciseId: string, decisions: RecommendationDecision[] = []): number {
  return decisions.filter((item) => item.exerciseId === exerciseId && ['REPLACE', 'REMOVE'].includes(item.recommendationType) && ['rejected', 'dismissed'].includes(item.decision)).length
}

export function classifyPreference(exerciseId: string, preferences: { preferredExerciseIds: string[]; dislikedExerciseIds: string[] }, decisions: RecommendationDecision[] = []): PreferenceState {
  if (preferences.preferredExerciseIds.includes(exerciseId)) return 'preferred'
  if (preferences.dislikedExerciseIds.includes(exerciseId)) return 'disliked'
  if (rejectedKeepCount(exerciseId, decisions) >= 2) return 'preferred'
  return 'neutral'
}

export function classifyRecentWorkload(recentSessions: Workout[], asOf = latestDate(recentSessions)): RecentWorkloadLevel {
  const recentSets = recentSessions.filter((session) => daysBetween(session.date, asOf) <= 7 && daysBetween(session.date, asOf) >= 0).reduce((total, session) => total + session.sets.length, 0)
  const typicalWeeklySets = recentSessions.filter((session) => daysBetween(session.date, asOf) <= 28 && daysBetween(session.date, asOf) >= 0).reduce((total, session) => total + session.sets.length, 0) / 4
  if (typicalWeeklySets === 0 || recentSets <= typicalWeeklySets * 1.15) return 'Low'
  if (recentSets <= typicalWeeklySets * 1.5) return 'Moderate'
  return 'High'
}

/** @deprecated Use classifyRecentWorkload; this is a workload signal, not fatigue. */
export const classifyFatigue = classifyRecentWorkload

function latestDate(history: Workout[]) { return history.map((workout) => workout.date).sort().at(-1) ?? new Date().toISOString().slice(0, 10) }
function daysBetween(start: string, end: string) { return Math.max(0, Math.floor((Date.parse(`${end}T12:00:00`) - Date.parse(`${start}T12:00:00`)) / (24 * 60 * 60 * 1000))) }
