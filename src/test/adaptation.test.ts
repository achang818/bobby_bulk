import { describe, expect, it } from 'vitest'
import { adaptWorkout, adaptWorkoutForTime, findContextualSubstitute } from '../domain/adaptation'
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

describe('time adaptation', () => {
  const timePlan: WorkoutPlan = {
    id: 'time-test', name: 'Time test', description: 'test', focus: 'Full body',
    exerciseIds: ['barbell-bench-press', 'cable-lateral-raise', 'triceps-pushdown'],
  }

  it('makes no changes when time is sufficient', () => {
    expect(adaptWorkoutForTime(timePlan, exercises, 60)).toEqual([])
  })

  it('returns no changes when available time is undefined', () => {
    expect(adaptWorkoutForTime(timePlan, exercises, undefined)).toEqual([])
  })

  it('reduces sets before removing an exercise', () => {
    const recommendations = adaptWorkoutForTime(timePlan, exercises, 20)
    expect(recommendations[0]?.type).toBe('MODIFY')
    expect(recommendations.some((recommendation) => recommendation.type === 'REMOVE')).toBe(false)
  })

  it('preserves compounds over isolation when removal is forced', () => {
    const recommendations = adaptWorkoutForTime(timePlan, exercises, 14)
    const removedIds = recommendations.filter((recommendation) => recommendation.type === 'REMOVE').map((recommendation) => recommendation.exerciseId)
    expect(removedIds).toContain('cable-lateral-raise')
    expect(removedIds).not.toContain('barbell-bench-press')
  })
})