import { calculateExerciseFeatures, calculateMuscleFeatures } from './features'
import { analyzeWorkoutSession } from './workout-analysis'
import { compareWorkoutChronology } from './workout-session'
import { sameMuscle } from './muscle-priorities'
import { displayWeight } from './units'
import type { Exercise, ExerciseFeatures, MuscleFeatures, MuscleTrainingState, TrainingState, WeightUnit, Workout } from './models'

/**
 * Deterministic history boundary. Missing status/unit/prescription are supported
 * legacy history, not inferred completion of planned sets. Unknown exercise IDs
 * cannot establish muscle exposure. All external loads share one explicit unit.
 */
export function deriveTrainingState(exercises: Exercise[], history: Workout[], asOf: string, unit: WeightUnit = 'lb', additionalMuscles: string[] = []): TrainingState {
  const eligible = history.filter((workout) => (workout.status === undefined || workout.status === 'completed')
    && /^\d{4}-\d{2}-\d{2}$/.test(workout.date) && Number.isFinite(Date.parse(workout.date))
    && new Date(workout.date).toISOString().slice(0, 10) === workout.date && workout.date <= asOf)
    .map((workout) => ({ ...workout, sets: workout.sets.filter((set) => Number.isFinite(set.reps) && set.reps > 0 && Number.isFinite(set.weight) && set.weight >= 0) }))
  const completed = eligible.map((workout) => ({ ...workout, unit, sets: workout.sets.map((set) => ({ ...set, weight: displayWeight(set.weight, workout.unit, unit) })) }))
  const knownIds = new Set(exercises.map((exercise) => exercise.id))
  const muscles = [...exercises.flatMap((exercise) => exercise.primaryMuscles), ...additionalMuscles]
    .filter((muscle, index, all) => all.findIndex((other) => sameMuscle(muscle, other)) === index)
  return {
    asOf, unit,
    outcomes: eligible.filter((workout) => workout.prescriptionChanges?.length || workout.sets.some((set) => set.setType === 'working' && knownIds.has(set.exerciseId)))
      .sort(compareWorkoutChronology).map((workout) => analyzeWorkoutSession(workout, eligible, exercises)!),
    exercises: exercises.map((exercise) => calculateExerciseFeatures(exercise, completed, asOf)),
    muscles: muscles.map((muscle) => {
      const features = calculateMuscleFeatures(muscle, exercises, completed, asOf)
      const recovery: MuscleTrainingState['recovery'] = features.daysSinceTrained === undefined ? 'unknown'
        : features.daysSinceTrained <= 1 ? 'recently-trained'
          : features.volumeState === 'high recent volume' && features.frequency7Days > 0 ? 'high-recent-volume' : 'available'
      return { ...features, recovery }
    }),
  }
}

export function muscleTrainingState(state: TrainingState, muscle: string): MuscleTrainingState {
  const result = state.muscles.find((item) => sameMuscle(item.muscle, muscle))
  if (!result) throw new Error(`Training state is missing muscle: ${muscle}`)
  return result
}

export function exerciseTrainingState(state: TrainingState, exerciseId: string) {
  const result = state.exercises.find((item) => item.exerciseId === exerciseId)
  if (!result) throw new Error(`Training state is missing exercise: ${exerciseId}`)
  return result
}

export function isMuscleOpportunity(features: MuscleTrainingState) {
  return features.recovery === 'unknown' || features.recovery === 'available'
}

/** Shared boundary for callers supplying a precomputed snapshot. Never rederive it downstream. */
export function resolveTrainingState(exercises: Exercise[], history: Workout[], asOf: string, unit: WeightUnit, priorities: string[], supplied?: TrainingState): TrainingState {
  if (!supplied) return deriveTrainingState(exercises, history, asOf, unit, priorities)
  if (supplied.asOf !== asOf || supplied.unit !== unit) throw new Error('TrainingState date/unit must match the recommendation request.')
  for (const exercise of exercises) exerciseTrainingState(supplied, exercise.id)
  for (const muscle of [...exercises.flatMap((exercise) => exercise.primaryMuscles), ...priorities]) muscleTrainingState(supplied, muscle)
  return supplied
}

/** Latest direct working effort; RIR takes precedence over RPE on each set. */
export function hasNearFailureEvidence(features: ExerciseFeatures): boolean {
  return features.mostRecentPerformance?.workingSets.some((set) => set.rir !== undefined ? set.rir <= 1 : set.rpe !== undefined && set.rpe >= 9) ?? false
}

/** Opportunity ordering only, never an aggregate readiness/fatigue estimate. */
export function muscleOpportunityScore(features: MuscleFeatures, rank: number, explicit: boolean, desiredFrequency: number) {
  const unmet = Math.max(0, desiredFrequency - features.frequency7Days)
  const days = Math.min(features.daysSinceTrained ?? 7, 14)
  const volume = features.volumeState === 'low recent volume' ? 8 : features.volumeState === 'high recent volume' ? -12 : 0
  const supplied = desiredFrequency > 0 && features.frequency7Days >= desiredFrequency ? -40 : 0
  return (explicit ? 100 : 60) - rank * 5 + unmet * 12 + days + volume + supplied
}
