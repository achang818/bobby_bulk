import { createPlannedExercise } from './workout-session'
import type { AvailableLoad, Exercise, LoggedSet, PlannedExercise, Recommendation, Workout } from './models'

export function recommendNext(exercise: Exercise, history: Workout[], availableLoads?: AvailableLoad[]): Recommendation
export function recommendNext(exercise: Exercise, plannedExercise: PlannedExercise, history: Workout[], availableLoads?: AvailableLoad[]): Recommendation
export function recommendNext(exercise: Exercise, plannedOrHistory: PlannedExercise | Workout[], historyOrLoads?: Workout[] | AvailableLoad[], maybeLoads?: AvailableLoad[]): Recommendation {
  const planned = Array.isArray(plannedOrHistory) ? createPlannedExercise(exercise.id, 0, exercise) : plannedOrHistory
  const history = Array.isArray(plannedOrHistory) ? plannedOrHistory : historyOrLoads as Workout[]
  const availableLoads = Array.isArray(plannedOrHistory) ? historyOrLoads as AvailableLoad[] | undefined : maybeLoads
  const workingSets = latestSets(history, exercise.id).filter((set) => set.setType === 'working')

  if (workingSets.length === 0) {
    return recommendation(exercise, planned, 0, 'start-here', 'low', ['No working-set history yet. Start with a manageable weight.'])
  }

  const targetRangeSets = workingSets.filter((set) => set.reps >= planned.repRange.min && set.reps <= planned.repRange.max)
  // A target-range working set is direct evidence that this load is usable.
  // Prefer the heaviest such set instead of assuming the first logged set was
  // the user's working load.
  const bestSet = heaviest(targetRangeSets) ?? bestBelowRangeSet(workingSets)
  const completedPrescription = workingSets.length >= planned.sets
  const effort = effortEvidence(bestSet)

  if (targetRangeSets.length > 0) {
    const atTop = bestSet.reps === planned.repRange.max
    if (completedPrescription && atTop && !effort.nearFailure) {
      const nextWeight = roundWeight(bestSet.weight + weightIncrement(bestSet.weight, exercise, availableLoads))
      return recommendation(exercise, planned, nextWeight, 'increase-weight', effort.easy ? 'high' : 'medium', [
        `${formatSet(bestSet)} is your heaviest working set within the ${planned.repRange.min}-${planned.repRange.max} rep range${effort.summary}.`,
        completedPrescription ? 'It reached the top of the range, so increasing the load slightly is reasonable.' : 'That set demonstrates a viable working load; increase slightly only if you want to progress from that top-range effort.',
      ])
    }

    return recommendation(exercise, planned, bestSet.weight, 'progress-reps', effort.nearFailure ? 'low' : effort.easy ? 'high' : 'medium', [
      `${formatSet(bestSet)} is your heaviest working set within the ${planned.repRange.min}-${planned.repRange.max} rep range${effort.summary}.`,
      effort.nearFailure
        ? 'Keep this demonstrated load and improve reps before increasing it.'
        : completedPrescription ? 'Keep this load and build toward the top of the range.' : `This is useful performance evidence, although only ${workingSets.length}/${planned.sets} planned working sets were completed.`,
    ])
  }

  // No set reached the prescription range. A below-range set with meaningful
  // reserve is not evidence that the load must be reduced.
  return recommendation(exercise, planned, bestSet.weight, 'progress-reps', effort.nearFailure ? 'low' : effort.easy ? 'medium' : 'low', [
    `${formatSet(bestSet)} was below the ${planned.repRange.min}-${planned.repRange.max} rep range${effort.summary}.`,
    effort.nearFailure
      ? 'The low-rep, near-failure effort is evidence against increasing the load; keep it steady and rebuild reps.'
      : 'The available effort evidence does not suggest the load is too heavy. Keep it steady and build into the range.',
  ])
}

function recommendation(exercise: Exercise, planned: PlannedExercise, weight: number, action: Recommendation['action'], confidence: NonNullable<Recommendation['confidence']>, reasons: string[]): Recommendation {
  return { exercise, weight, sets: planned.sets, repRange: planned.repRange, action, confidence, reasons }
}

function latestSets(history: Workout[], exerciseId: string): LoggedSet[] {
  const latest = [...history].sort((a, b) => b.date.localeCompare(a.date)).find((workout) => workout.status !== 'in-progress' && workout.sets.some((set) => set.exerciseId === exerciseId))
  return latest?.sets.filter((set) => set.exerciseId === exerciseId) ?? []
}

function heaviest(sets: LoggedSet[]): LoggedSet | undefined { return sets.reduce<LoggedSet | undefined>((best, set) => !best || set.weight > best.weight ? set : best, undefined) }

function bestBelowRangeSet(sets: LoggedSet[]): LoggedSet {
  return [...sets].sort((a, b) => b.reps - a.reps || b.weight - a.weight)[0]
}

function effortEvidence(set: LoggedSet) {
  // RIR takes precedence. RPE is used only when RIR was not recorded.
  const rir = set.rir
  const rpe = rir === undefined ? set.rpe : undefined
  const nearFailure = rir !== undefined ? rir <= 1 : rpe !== undefined && rpe >= 9
  const easy = rir !== undefined ? rir >= 2 : rpe !== undefined && rpe <= 7
  const summary = rir !== undefined ? ` at ${rir} RIR` : rpe !== undefined ? ` at RPE ${rpe}` : ''
  return { nearFailure, easy, summary }
}

function formatSet(set: LoggedSet): string { return `${set.weight} for ${set.reps}` }

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
