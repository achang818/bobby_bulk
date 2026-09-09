import { createPlannedExercise } from './workout-session'
import type { AvailableLoad, Exercise, LoggedSet, PlannedExercise, Recommendation, Workout } from './models'

export function recommendNext(exercise: Exercise, history: Workout[], availableLoads?: AvailableLoad[]): Recommendation
export function recommendNext(exercise: Exercise, plannedExercise: PlannedExercise, history: Workout[], availableLoads?: AvailableLoad[]): Recommendation
export function recommendNext(
  exercise: Exercise,
  plannedOrHistory: PlannedExercise | Workout[],
  historyOrLoads?: Workout[] | AvailableLoad[],
  maybeLoads?: AvailableLoad[],
): Recommendation {
  const plannedExercise = Array.isArray(plannedOrHistory) ? createPlannedExercise(exercise.id, 0, exercise) : plannedOrHistory
  const history = Array.isArray(plannedOrHistory) ? plannedOrHistory : historyOrLoads as Workout[]
  const availableLoads = Array.isArray(plannedOrHistory) ? historyOrLoads as AvailableLoad[] | undefined : maybeLoads
  const sets = history
    .flatMap((workout) => workout.sets)
    .filter((set) => set.exerciseId === exercise.id)
  const lastWorkoutSets = latestSets(sets, history, exercise.id)

  if (lastWorkoutSets.length === 0) {
    return {
      exercise,
      weight: 0,
      sets: plannedExercise.sets,
      repRange: plannedExercise.repRange,
      action: 'start-here',
      reasons: ['No personal history yet. Start with a manageable weight.'],
    }
  }

  const allAtTop = lastWorkoutSets.length >= plannedExercise.sets &&
    lastWorkoutSets.every((set) => set.reps >= plannedExercise.repRange.max)
  const weight = lastWorkoutSets[0].weight

  if (allAtTop) {
    return {
      exercise,
      weight: roundWeight(weight + weightIncrement(weight, exercise, availableLoads)),
      sets: plannedExercise.sets,
      repRange: plannedExercise.repRange,
      action: 'increase-weight',
      reasons: [
        `You reached ${plannedExercise.repRange.max} reps on every recent set.`,
        'Increase the load slightly and return to the lower end of the range.',
      ],
    }
  }

  return {
    exercise,
    weight,
    sets: plannedExercise.sets,
    repRange: plannedExercise.repRange,
    action: 'progress-reps',
    reasons: [
      `Aim for ${plannedExercise.sets} × ${plannedExercise.repRange.max} before increasing weight.`,
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

function weightIncrement(weight: number, exercise: Exercise, availableLoads?: AvailableLoad[]): number {
  const load = availableLoads?.find((item) => item.equipment === equipmentTagFor(exercise.equipment))
  if (load?.increments.length) {
    const next = load.increments.find((increment) => increment > weight)
    return next === undefined ? 0 : next - weight
  }
  if (weight <= 0) return 5
  return weight < 50 ? 2.5 : 5
}

function equipmentTagFor(equipment: string) {
  const normalized = equipment.toLowerCase()
  if (normalized.includes('dumbbell')) return 'dumbbells' as const
  if (normalized.includes('barbell')) return 'barbells' as const
  if (normalized.includes('cable')) return 'cables' as const
  if (normalized.includes('machine')) return 'machines' as const
  if (normalized.includes('kettlebell')) return 'kettlebells' as const
  if (normalized.includes('trap bar')) return 'trap-bar' as const
  if (normalized.includes('bodyweight')) return 'bodyweight' as const
  return 'other' as const
}

function roundWeight(weight: number): number {
  return Math.round(weight * 10) / 10
}
