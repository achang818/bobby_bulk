import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { stimulusForMuscle, workoutMuscleStimulus } from '../domain/muscle-stimulus'

describe('workout muscle stimulus', () => {
  it('credits direct work more strongly than secondary involvement', () => {
    const pulldown = exercises.find((exercise) => exercise.id === 'lat-pulldown')!
    const curl = exercises.find((exercise) => exercise.id === 'dumbbell-curl')!
    const stimulus = workoutMuscleStimulus([{ exercise: pulldown, sets: 3 }, { exercise: curl, sets: 3 }])

    expect(stimulusForMuscle(stimulus, 'Biceps')).toMatchObject({ directSets: 3, secondarySets: 3, effectiveContribution: 4.5 })
    expect(stimulusForMuscle(stimulus, 'Lats').effectiveContribution).toBe(3)
  })

  it('accumulates supporting contributions from multiple selected compounds', () => {
    const pulldown = exercises.find((exercise) => exercise.id === 'lat-pulldown')!
    const pullup = exercises.find((exercise) => exercise.id === 'assisted-pull-up-machine')!
    const stimulus = workoutMuscleStimulus([{ exercise: pulldown, sets: 2 }, { exercise: pullup, sets: 2 }])

    expect(stimulusForMuscle(stimulus, 'Biceps')).toMatchObject({ directSets: 0, secondarySets: 4, effectiveContribution: 2 })
  })
})
