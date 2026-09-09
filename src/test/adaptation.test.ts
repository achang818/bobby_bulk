import { describe, expect, it } from 'vitest'
import { adaptWorkout, findContextualSubstitute } from '../domain/adaptation'
import { exercises } from '../domain/exercises'
import { defaultPreferences } from '../domain/preferences'
import type { TodaysContext, WorkoutPlan } from '../domain/models'

const plan: WorkoutPlan = {
  id: 'upper', name: 'Upper', description: 'test', focus: 'Upper body',
  exerciseIds: ['cable-row', 'cable-lateral-raise', 'triceps-pushdown'],
}

const context = (gymId = 'default-gym', unavailableEquipment: TodaysContext['unavailableEquipment'] = ['cables']): TodaysContext => ({ gymId, unavailableEquipment })

describe('context adaptation', () => {
  it('does not substitute equipment that is available', () => {
    expect(adaptWorkout(plan, exercises, context('default-gym', []), defaultPreferences)).toEqual([])
  })

  it('caps substitutions at the default gym', () => {
    expect(adaptWorkout(plan, exercises, context(), defaultPreferences)).toHaveLength(2)
  })

  it('lifts the cap when the user is traveling', () => {
    expect(adaptWorkout(plan, exercises, context('travel-gym'), defaultPreferences)).toHaveLength(3)
  })

  it('preserves a primary muscle group in the substitute', () => {
    const original = exercises.find((exercise) => exercise.id === 'cable-row')!
    const substitute = findContextualSubstitute(original, exercises, context(), defaultPreferences)
    expect(substitute?.primaryMuscles.some((muscle) => original.primaryMuscles.includes(muscle))).toBe(true)
  })

  it('never chooses a disliked substitute', () => {
    const original = exercises.find((exercise) => exercise.id === 'cable-row')!
    const substitute = findContextualSubstitute(original, exercises, context(), { ...defaultPreferences, dislikedExerciseIds: ['barbell-row', 'chest-supported-row', 'single-arm-db-row'] })
    expect(substitute?.id).not.toBe('barbell-row')
    expect(substitute?.id).not.toBe('chest-supported-row')
    expect(substitute?.id).not.toBe('single-arm-db-row')
  })
})