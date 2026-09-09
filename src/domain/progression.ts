import { createPlannedExercise } from './workout-session'
import type { AvailableLoad, Exercise, LoggedSet, PlannedExercise, Recommendation, Workout } from './models'

export function recommendNext(exercise: Exercise, history: Workout[], availableLoads?: AvailableLoad[]): Recommendation
export function recommendNext(exercise: Exercise, plannedExercise: PlannedExercise, history: Workout[], availableLoads?: AvailableLoad[]): Recommendation
export function recommendNext(exercise: Exercise, plannedOrHistory: PlannedExercise | Workout[], historyOrLoads?: Workout[] | AvailableLoad[], maybeLoads?: AvailableLoad[]): Recommendation {
  const plannedExercise = Array.isArray(plannedOrHistory) ? createPlannedExercise(exercise.id, 0, exercise) : plannedOrHistory
  const history = Array.isArray(plannedOrHistory) ? plannedOrHistory : historyOrLoads as Workout[]
  const availableLoads = Array.isArray(plannedOrHistory) ? historyOrLoads as AvailableLoad[] | undefined : maybeLoads
  const lastWorkoutSets = latestSets(history, exercise.id)
    .filter((set) => set.setType === 'working')
    // Extra sets do not prove the prescribed sets met their target.
    .slice(0, plannedExercise.sets)

  if (lastWorkoutSets.length === 0) {
    return { exercise, weight: 0, sets: plannedExercise.sets, repRange: plannedExercise.repRange, action: 'start-here', confidence: 'low', reasons: ['No personal history yet. Start with a manageable weight.'] }
  }

  const completedPlannedSets = lastWorkoutSets.length === plannedExercise.sets
  const allAtTop = completedPlannedSets && lastWorkoutSets.every((set) => set.reps >= plannedExercise.repRange.max)
  const weight = lastWorkoutSets[0].weight
  const effort = effortEvidence(lastWorkoutSets)

  if (allAtTop && !effort.nearFailure) {
    const hasRir = effort.rir.length > 0
    return {
      exercise, weight: roundWeight(weight + weightIncrement(weight, exercise, availableLoads)), sets: plannedExercise.sets, repRange: plannedExercise.repRange,
      action: 'increase-weight', confidence: hasRir && effort.rir.every((rir) => rir >= 2) ? 'high' : 'medium',
      reasons: [
        hasRir ? `You reached the top of the rep range on every working set while keeping ${formatRir(effort.rir)} reps in reserve.` : 'You reached the top of the rep range on every working set.',
        'Increase the load slightly and return to the lower end of the range.',
      ],
    }
  }

  if (allAtTop && effort.nearFailure) {
    return {
      exercise, weight, sets: plannedExercise.sets, repRange: plannedExercise.repRange, action: 'progress-reps', confidence: 'low',
      reasons: [
        `You reached the top of the rep range on every working set, but ${effort.description} indicate the sets were very close to failure.`,
        'Keep the current load and repeat the performance before increasing it.',
      ],
    }
  }

  return {
    exercise, weight, sets: plannedExercise.sets, repRange: plannedExercise.repRange, action: 'progress-reps', confidence: 'low',
    reasons: [
      completedPlannedSets ? `Aim for ${plannedExercise.sets} sets of ${plannedExercise.repRange.max} reps before increasing weight.` : `You completed ${lastWorkoutSets.length}/${plannedExercise.sets} planned working sets. Aim for all ${plannedExercise.sets} before increasing weight.`,
      'Keep the load steady and try to add a rep where you can.',
    ],
  }
}

function latestSets(history: Workout[], exerciseId: string): LoggedSet[] {
  const latestWorkout = [...history].sort((a, b) => b.date.localeCompare(a.date)).find((workout) => workout.status !== 'in-progress' && workout.sets.some((set) => set.exerciseId === exerciseId))
  return latestWorkout ? latestWorkout.sets.filter((set) => set.exerciseId === exerciseId) : []
}

function effortEvidence(sets: LoggedSet[]) {
  // RIR is primary. RPE supports only a set where RIR was omitted; no conversion is invented.
  const rir = sets.flatMap((set) => set.rir === undefined ? [] : [set.rir])
  const rpe = sets.flatMap((set) => set.rir === undefined && set.rpe !== undefined ? [set.rpe] : [])
  const rirNearFailure = rir.some((value) => value <= 1)
  return { rir, nearFailure: rirNearFailure || rpe.some((value) => value >= 9), description: rirNearFailure ? 'recorded RIR values' : 'recorded RPE values' }
}

function formatRir(rir: number[]): string {
  const low = Math.min(...rir)
  const high = Math.max(...rir)
  return low === high ? `about ${low}` : `about ${low}-${high}`
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

function roundWeight(weight: number): number { return Math.round(weight * 10) / 10 }
