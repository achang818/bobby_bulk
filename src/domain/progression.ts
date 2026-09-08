import type { Exercise, LoggedSet, Recommendation, Workout } from './models'

export function recommendNext(
  exercise: Exercise,
  history: Workout[],
): Recommendation {
  const sets = history
    .flatMap((workout) => workout.sets)
    .filter((set) => set.exerciseId === exercise.id)
  const lastWorkoutSets = latestSets(sets, history, exercise.id)

  if (lastWorkoutSets.length === 0) {
    return {
      exercise,
      weight: 0,
      sets: exercise.defaultSets,
      repRange: exercise.repRange,
      action: 'start-here',
      reasons: ['No personal history yet. Start with a manageable weight.'],
    }
  }

  const allAtTop = lastWorkoutSets.length >= exercise.defaultSets &&
    lastWorkoutSets.every((set) => set.reps >= exercise.repRange.max)
  const weight = lastWorkoutSets[0].weight

  if (allAtTop) {
    return {
      exercise,
      weight: roundWeight(weight + weightIncrement(weight)),
      sets: exercise.defaultSets,
      repRange: exercise.repRange,
      action: 'increase-weight',
      reasons: [
        `You reached ${exercise.repRange.max} reps on every recent set.`,
        'Increase the load slightly and return to the lower end of the range.',
      ],
    }
  }

  return {
    exercise,
    weight,
    sets: exercise.defaultSets,
    repRange: exercise.repRange,
    action: 'progress-reps',
    reasons: [
      `You have not reached ${exercise.defaultSets} × ${exercise.repRange.max} yet.`,
      'Keep the load steady and try to add a rep where you can.',
    ],
  }
}

function latestSets(
  sets: LoggedSet[],
  history: Workout[],
  exerciseId: string,
): LoggedSet[] {
  const latestWorkout = [...history]
    .sort((a, b) => b.date.localeCompare(a.date))
    .find((workout) => workout.sets.some((set) => set.exerciseId === exerciseId))
  return latestWorkout ? latestWorkout.sets.filter((set) => set.exerciseId === exerciseId) : sets
}

function weightIncrement(weight: number): number {
  if (weight <= 0) return 5
  return weight < 50 ? 2.5 : 5
}

function roundWeight(weight: number): number {
  return Math.round(weight * 10) / 10
}
