import { sameMuscle } from './muscle-priorities'
import type { Exercise } from './models'

/**
 * A deliberately modest coaching heuristic for work a compound contributes to
 * muscles listed as secondary. It is useful for relative session allocation,
 * not a claim that supporting work has a precise physiological equivalent.
 */
export const SECONDARY_SET_CONTRIBUTION = 0.5

export interface MuscleStimulus {
  muscle: string
  directSets: number
  secondarySets: number
  effectiveContribution: number
}

/** Accumulates selected-session stimulus without changing direct history. */
export function workoutMuscleStimulus(exercises: readonly { exercise: Exercise; sets: number }[]): MuscleStimulus[] {
  const stimulus: MuscleStimulus[] = []
  for (const { exercise, sets } of exercises) {
    for (const muscle of exercise.primaryMuscles) addStimulus(stimulus, muscle, sets, 0)
    for (const muscle of exercise.secondaryMuscles) addStimulus(stimulus, muscle, 0, sets)
  }
  return stimulus.map((item) => ({ ...item, effectiveContribution: item.directSets + item.secondarySets * SECONDARY_SET_CONTRIBUTION }))
}

export function stimulusForMuscle(stimulus: readonly MuscleStimulus[], muscle: string): MuscleStimulus {
  return stimulus.find((item) => sameMuscle(item.muscle, muscle))
    ?? { muscle, directSets: 0, secondarySets: 0, effectiveContribution: 0 }
}

function addStimulus(stimulus: MuscleStimulus[], muscle: string, directSets: number, secondarySets: number) {
  const existing = stimulus.find((item) => sameMuscle(item.muscle, muscle))
  if (existing) {
    existing.directSets += directSets
    existing.secondarySets += secondarySets
    return
  }
  stimulus.push({ muscle, directSets, secondarySets, effectiveContribution: 0 })
}
