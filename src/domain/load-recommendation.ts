import { equipmentTagFor, exerciseEquipmentOptions } from './equipment'
import { recommendFromWorkingSets } from './progression'
import { availableLoadsInUnit } from './units'
import { deriveTrainingState, exerciseTrainingState } from './training-state'
import type { AvailableLoad, Exercise, ExerciseFeatures, ExerciseLoadRecommendation, PlannedExercise, WeightUnit, Workout } from './models'

/** Apply existing progression rules to the final generated prescription. */
export function recommendExerciseLoad(exercise: Exercise, planned: PlannedExercise, history: Workout[], availableLoads: AvailableLoad[] | undefined, unit: WeightUnit, asOf: string): ExerciseLoadRecommendation {
  const state = deriveTrainingState([exercise], history, asOf, unit)
  return recommendExerciseLoadFromState(exercise, planned, exerciseTrainingState(state, exercise.id), unit, availableLoads)
}

/** No raw history queries: use the latest direct working performance in the state. */
export function recommendExerciseLoadFromState(exercise: Exercise, planned: PlannedExercise, state: ExerciseFeatures, unit: WeightUnit, availableLoads?: AvailableLoad[]): ExerciseLoadRecommendation {
  const choose = (reason: string): ExerciseLoadRecommendation => ({ kind: 'choose-load', unit, reason })
  const equipment = equipmentTagFor(exercise)
  if (exerciseEquipmentOptions(exercise).length > 1) return choose('Choose a starting load for the equipment you are using. Past logs do not identify which equipment variant was used.')
  const latest = state.mostRecentPerformance
  const working = latest?.workingSets ?? []
  // Legacy logs may omit loadType even for catalog assistance/bodyweight movements.
  const needsSetup = equipment === 'bodyweight' || equipment === 'pull-up-bar' || /assisted|dip bars/i.test(`${exercise.name} ${exercise.equipment}`)
  if (needsSetup || working.some((set) => set.loadType && set.loadType !== 'external')) {
    return choose('Choose your bodyweight, added weight, or assistance setup; this history cannot establish an external load target.')
  }
  if (!latest || !working.length || working.some((set) => !Number.isFinite(set.weight) || set.weight < 0 || !Number.isFinite(set.reps) || set.reps <= 0)) {
    return choose('No usable working-set history yet. Choose a manageable starting load for the rep range.')
  }
  const loads = availableLoadsInUnit(availableLoads, unit)
  const result = recommendFromWorkingSets(exercise, planned, working.map((set) => ({ ...set, exerciseId: exercise.id })), loads, unit)
  if (result.action === 'start-here') return choose(result.reasons[0])
  const profile = loads?.find((load) => load.equipment === equipment)
  const weight = profile ? profile.increments.filter((load) => load <= result.weight).at(-1) : result.weight
  if (weight === undefined) return choose('No available weight fits the demonstrated load. Choose a manageable setup before logging.')
  const adjusted = weight !== result.weight
  return {
    kind: 'target', weight, unit,
    action: adjusted ? 'progress-reps' : result.action,
    confidence: adjusted ? 'low' : result.confidence ?? 'low',
    reason: adjusted ? 'Your previous load is unavailable here. Use this lighter available weight and build reps.' : result.reasons.at(-1)!,
  }
}
