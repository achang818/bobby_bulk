import { equipmentTagFor, exerciseEquipmentOptions } from './equipment'
import { recommendNext } from './progression'
import { availableLoadsInUnit, displayWeight } from './units'
import { compareWorkoutChronology } from './workout-session'
import type { AvailableLoad, Exercise, ExerciseLoadRecommendation, PlannedExercise, WeightUnit, Workout } from './models'

/** Apply existing progression rules to the final generated prescription. */
export function recommendExerciseLoad(exercise: Exercise, planned: PlannedExercise, history: Workout[], availableLoads: AvailableLoad[] | undefined, unit: WeightUnit, asOf: string): ExerciseLoadRecommendation {
  const choose = (reason: string): ExerciseLoadRecommendation => ({ kind: 'choose-load', unit, reason })
  const equipment = equipmentTagFor(exercise)
  if (exerciseEquipmentOptions(exercise).length > 1) return choose('Choose a starting load for the equipment you are using. Past logs do not identify which equipment variant was used.')
  const latest = history.filter((workout) => workout.status !== 'in-progress' && workout.date <= asOf
    && workout.sets.some((set) => set.exerciseId === exercise.id && set.setType === 'working'))
    .sort((a, b) => compareWorkoutChronology(b, a))[0]
  const working = latest?.sets.filter((set) => set.exerciseId === exercise.id && set.setType === 'working') ?? []
  // Legacy logs may omit loadType even for catalog assistance/bodyweight movements.
  const needsSetup = equipment === 'bodyweight' || equipment === 'pull-up-bar' || /assisted|dip bars/i.test(`${exercise.name} ${exercise.equipment}`)
  if (needsSetup || working.some((set) => set.loadType && set.loadType !== 'external')) {
    return choose('Choose your bodyweight, added weight, or assistance setup; this history cannot establish an external load target.')
  }
  if (!latest || !working.length || working.some((set) => !Number.isFinite(set.weight) || set.weight < 0 || !Number.isFinite(set.reps) || set.reps <= 0)) {
    return choose('No usable working-set history yet. Choose a manageable starting load for the rep range.')
  }
  const loads = availableLoadsInUnit(availableLoads, unit)
  const normalized = { ...latest, unit, sets: working.map((set) => ({ ...set, weight: displayWeight(set.weight, latest.unit, unit) })) }
  const result = recommendNext(exercise, planned, [normalized], loads, unit)
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
