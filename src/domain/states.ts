import type { ExercisePerformance, ExerciseProgressState, MuscleVolumeState, PreferenceState, RecommendationDecision, Workout } from './models'

export type RecentWorkloadLevel = 'Low' | 'Moderate' | 'High'

/**
 * A deliberately conservative comparison of recent, comparable working-set
 * sessions. Two sessions can demonstrate improvement, but a decline needs two
 * consecutive weaker sessions so one off day is not over-interpreted.
 */
export function classifyExerciseProgression(performance: ExercisePerformance[]): ExerciseProgressState {
  if (performance.length < 2) return 'insufficient history'
  const recent = performance.slice(-3)
  const first = recent[0]
  const last = recent.at(-1) ?? first
  if (meaningfullyBetter(last, first)) return 'progressing'
  if (recent.length >= 3 && meaningfullyWorse(recent[1], first) && meaningfullyWorse(last, first)) return 'regressing'
  if (recent.length >= 3 && recent.every((item) => !meaningfullyBetter(item, first) && !meaningfullyWorse(item, first))) return 'stalled'
  return 'stable'
}

function metric(performance: ExercisePerformance) {
  return performance.bestEstimatedOneRepMax
}
function meaningfullyBetter(current: ExercisePerformance, baseline: ExercisePerformance) {
  const currentMetric = metric(current)
  const baselineMetric = metric(baseline)
  if (currentMetric !== undefined && baselineMetric !== undefined && currentMetric >= baselineMetric * 1.03) return true
  if (current.prescriptionAchieved && baseline.prescriptionAchieved === false) return true
  const comparableLoad = current.bestWorkingSet && baseline.bestWorkingSet && Math.abs(current.bestWorkingSet.weight - baseline.bestWorkingSet.weight) <= Math.max(1, baseline.bestWorkingSet.weight * .025)
  return comparableLoad && (current.bestWorkingSet?.reps ?? 0) - (baseline.bestWorkingSet?.reps ?? 0) >= .75
}
function meaningfullyWorse(current: ExercisePerformance, baseline: ExercisePerformance) {
  const currentMetric = metric(current)
  const baselineMetric = metric(baseline)
  if (currentMetric !== undefined && baselineMetric !== undefined && currentMetric <= baselineMetric * .95) return true
  const comparableLoad = current.bestWorkingSet && baseline.bestWorkingSet && Math.abs(current.bestWorkingSet.weight - baseline.bestWorkingSet.weight) <= Math.max(1, baseline.bestWorkingSet.weight * .025)
  return comparableLoad && (baseline.bestWorkingSet?.reps ?? 0) - (current.bestWorkingSet?.reps ?? 0) >= 1.5
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
