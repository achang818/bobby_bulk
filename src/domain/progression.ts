import { compareWorkoutChronology, createPlannedExercise } from './workout-session'
import { equipmentTagFor } from './equipment'
import { convertWeight } from './units'
import type { AvailableLoad, Exercise, LoggedSet, PlannedExercise, ProgressionRecommendation, WeightUnit, Workout } from './models'

export function recommendNext(exercise: Exercise, history: Workout[], availableLoads?: AvailableLoad[]): ProgressionRecommendation
export function recommendNext(exercise: Exercise, plannedExercise: PlannedExercise, history: Workout[], availableLoads?: AvailableLoad[], unit?: WeightUnit): ProgressionRecommendation
/** History and available weights must already share the supplied display unit. */
export function recommendNext(exercise: Exercise, plannedOrHistory: PlannedExercise | Workout[], historyOrLoads?: Workout[] | AvailableLoad[], maybeLoads?: AvailableLoad[], unit?: WeightUnit): ProgressionRecommendation {
  const planned = Array.isArray(plannedOrHistory) ? createPlannedExercise(exercise.id, 0, exercise) : plannedOrHistory
  const history = Array.isArray(plannedOrHistory) ? plannedOrHistory : historyOrLoads as Workout[]
  const availableLoads = Array.isArray(plannedOrHistory) ? historyOrLoads as AvailableLoad[] | undefined : maybeLoads
  return recommendFromWorkingSets(exercise, planned, latestSets(history, exercise.id), availableLoads, unit)
}

/** Progression consumes direct completed sets; prescription completion is separate evidence. */
export function recommendFromWorkingSets(exercise: Exercise, planned: PlannedExercise, sets: LoggedSet[], availableLoads?: AvailableLoad[], unit?: WeightUnit): ProgressionRecommendation {
  const workingSets = sets.filter((set) => set.setType === 'working' && Number.isFinite(set.weight) && set.weight >= 0 && Number.isFinite(set.reps) && set.reps > 0)

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
    if (atTop && !effort.nearFailure) {
      const nextWeight = roundWeight(bestSet.weight + weightIncrement(bestSet.weight, exercise, availableLoads, unit))
      if (nextWeight <= bestSet.weight) return recommendation(exercise, planned, bestSet.weight, 'progress-reps', effort.easy ? 'high' : 'medium', ['No heavier load is available here. Keep this load and focus on controlled reps.'])
      return recommendation(exercise, planned, nextWeight, 'increase-weight', effort.easy ? 'high' : 'medium', [
        `${formatSet(bestSet, unit)} is your heaviest working set within the ${planned.repRange.min}-${planned.repRange.max} rep range${effort.summary}.`,
        'Your previous working set reached the top of the rep range. Try this load next.',
      ])
    }

    return recommendation(exercise, planned, bestSet.weight, 'progress-reps', effort.nearFailure ? 'low' : effort.easy ? 'high' : 'medium', [
      `${formatSet(bestSet, unit)} is your heaviest working set within the ${planned.repRange.min}-${planned.repRange.max} rep range${effort.summary}.`,
      effort.nearFailure
        ? 'Keep this demonstrated load and improve reps before increasing it.'
        : completedPrescription ? 'Keep this load and build toward the top of the range.' : `This is useful performance evidence, although only ${workingSets.length}/${planned.sets} planned working sets were completed.`,
    ])
  }

  // No set reached the prescription range. A below-range set with meaningful
  // reserve is not evidence that the load must be reduced.
  return recommendation(exercise, planned, bestSet.weight, 'progress-reps', effort.nearFailure ? 'low' : effort.easy ? 'medium' : 'low', [
    `${formatSet(bestSet, unit)} was outside the ${planned.repRange.min}-${planned.repRange.max} rep range${effort.summary}.`,
    effort.nearFailure
      ? 'The low-rep, near-failure effort is evidence against increasing the load; keep it steady and rebuild reps.'
      : 'The available effort evidence does not suggest the load is too heavy. Keep it steady and build into the range.',
  ])
}

function recommendation(exercise: Exercise, planned: PlannedExercise, weight: number, action: ProgressionRecommendation['action'], confidence: NonNullable<ProgressionRecommendation['confidence']>, reasons: string[]): ProgressionRecommendation {
  return { exercise, weight, sets: planned.sets, repRange: planned.repRange, action, confidence, reasons }
}

function latestSets(history: Workout[], exerciseId: string): LoggedSet[] {
  const latest = [...history].sort((a, b) => compareWorkoutChronology(b, a)).find((workout) => workout.status !== 'in-progress' && workout.sets.some((set) => set.exerciseId === exerciseId && set.setType === 'working'))
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

function formatSet(set: LoggedSet, unit?: WeightUnit): string { return `${set.weight}${unit ? ` ${unit}` : ''} for ${set.reps}` }

function weightIncrement(weight: number, exercise: Exercise, availableLoads?: AvailableLoad[], unit?: WeightUnit): number {
  const load = availableLoads?.find((item) => item.equipment === equipmentTagFor(exercise))
  if (load) {
    const next = load.increments.filter((increment) => Number.isFinite(increment) && increment > weight).sort((a, b) => a - b)[0]
    return next === undefined ? 0 : next - weight
  }
  const weightLb = convertWeight(weight, unit ?? 'lb', 'lb')
  return convertWeight(weightLb <= 0 ? 5 : weightLb < 50 ? 2.5 : 5, 'lb', unit ?? 'lb')
}

function roundWeight(weight: number): number { return Math.round(weight * 10) / 10 }
