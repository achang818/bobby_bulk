import { calculateExerciseFeatures, calculateMuscleFeatures } from './features'
import { sameMuscle } from './muscle-priorities'
import { displayWeight } from './units'
import type { Exercise, MuscleTrainingState, TrainingState, WeightUnit, Workout } from './models'

/**
 * Deterministic history boundary. Missing status/unit/prescription are supported
 * legacy history, not inferred completion of planned sets. Unknown exercise IDs
 * cannot establish muscle exposure. All external loads share one explicit unit.
 */
export function deriveTrainingState(exercises: Exercise[], history: Workout[], asOf: string, unit: WeightUnit = 'lb', additionalMuscles: string[] = []): TrainingState {
  const completed = history.filter((workout) => (workout.status === undefined || workout.status === 'completed')
    && /^\d{4}-\d{2}-\d{2}$/.test(workout.date) && Number.isFinite(Date.parse(workout.date))
    && new Date(workout.date).toISOString().slice(0, 10) === workout.date && workout.date <= asOf)
    .map((workout) => ({ ...workout, unit, sets: workout.sets.filter((set) => Number.isFinite(set.reps) && set.reps > 0 && Number.isFinite(set.weight) && set.weight >= 0)
      .map((set) => ({ ...set, weight: displayWeight(set.weight, workout.unit, unit) })) }))
  const muscles = [...exercises.flatMap((exercise) => exercise.primaryMuscles), ...additionalMuscles]
    .filter((muscle, index, all) => all.findIndex((other) => sameMuscle(muscle, other)) === index)
  return {
    asOf, unit,
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
