import type { ExerciseProgressState, MuscleVolumeState, PreferenceState } from './models'

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

export function classifyPreference(exerciseId: string, preferences: { preferredExerciseIds: string[]; dislikedExerciseIds: string[] }): PreferenceState {
  if (preferences.preferredExerciseIds.includes(exerciseId)) return 'preferred'
  if (preferences.dislikedExerciseIds.includes(exerciseId)) return 'disliked'
  return 'neutral'
}