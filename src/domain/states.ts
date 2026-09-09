import type { ExerciseProgressState, MuscleVolumeState, PreferenceState, RecommendationDecision, Workout } from './models'

export type FatigueLevel = 'Low' | 'Moderate' | 'High'

export function classifyExerciseProgression(performance: { averageReps: number }[]): ExerciseProgressState {
  if (performance.length < 2) return 'insufficient history'
  const recent = performance.slice(-3)
  const first = recent[0].averageReps
  const last = recent.at(-1)?.averageReps ?? first
  if (last - first >= 0.75) return 'progressing'
  if (first - last >= 1.5) return 'regressing'
  if (recent.length >= 3 && recent.every((item) => Math.abs(item.averageReps - first) < 0.75)) return 'stalled'
  return 'stable'
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

export function classifyFatigue(recentSessions: Workout[], asOf = latestDate(recentSessions)): FatigueLevel {
  const recentSets = recentSessions.filter((session) => daysBetween(session.date, asOf) <= 7 && daysBetween(session.date, asOf) >= 0).reduce((total, session) => total + session.sets.length, 0)
  const typicalWeeklySets = recentSessions.filter((session) => daysBetween(session.date, asOf) <= 28 && daysBetween(session.date, asOf) >= 0).reduce((total, session) => total + session.sets.length, 0) / 4
  if (typicalWeeklySets === 0 || recentSets <= typicalWeeklySets * 1.15) return 'Low'
  if (recentSets <= typicalWeeklySets * 1.5) return 'Moderate'
  return 'High'
}

function latestDate(history: Workout[]) { return history.map((workout) => workout.date).sort().at(-1) ?? new Date().toISOString().slice(0, 10) }
function daysBetween(start: string, end: string) { return Math.max(0, Math.floor((Date.parse(`${end}T12:00:00`) - Date.parse(`${start}T12:00:00`)) / (24 * 60 * 60 * 1000))) }
