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
  it('keeps primary joint action separate from the broad movement pattern', () => {
    const fly = exercises.find((exercise) => exercise.id === 'low-to-high-cable-fly')!
    const press = exercises.find((exercise) => exercise.id === 'incline-db-bench')!

    expect(fly.movementPattern).toBe('horizontal-push')
    expect(fly.primaryAction).toBe('shoulder-horizontal-adduction')
    expect(fly.primaryMuscles).toEqual(['Upper chest'])
    expect(fly.secondaryMuscles).toEqual(['Front delts'])
    expect(press.primaryAction).toBe('shoulder-horizontal-adduction')
    expect(fly.type).toBe('isolation')
    expect(press.type).toBe('compound')
  })

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

  it('prefers the matching movement pattern among otherwise eligible substitutes', () => {
    const original = exercises.find((exercise) => exercise.id === 'cable-row')!
    const horizontalRow = exercises.find((exercise) => exercise.id === 'barbell-row')!
    const verticalPull = exercises.find((exercise) => exercise.id === 'pull-up')!

    const substitute = findContextualSubstitute(original, [original, verticalPull, horizontalRow], context(), defaultPreferences)

    expect(verticalPull.category).toBe(original.category)
    expect(verticalPull.primaryMuscles.some((muscle) => original.primaryMuscles.includes(muscle))).toBe(true)
    expect(substitute?.id).toBe(horizontalRow.id)
  })

  it('never chooses a disliked substitute', () => {
    const original = exercises.find((exercise) => exercise.id === 'cable-row')!
    const substitute = findContextualSubstitute(original, exercises, context(), { ...defaultPreferences, dislikedExerciseIds: ['barbell-row', 'chest-supported-row', 'single-arm-db-row'] })
    expect(substitute?.id).not.toBe('barbell-row')
    expect(substitute?.id).not.toBe('chest-supported-row')
    expect(substitute?.id).not.toBe('single-arm-db-row')
  })

  it('does not reuse one substitute for multiple unavailable pull exercises', () => {
    const pullPlan: WorkoutPlan = {
      id: 'pull', name: 'Pull', description: 'test', focus: 'Back',
      exerciseIds: ['cable-row', 'lat-pulldown'],
    }
    const replacements = adaptWorkout(pullPlan, exercises, context('default-gym', ['cables']), defaultPreferences)

    expect(new Set(replacements.map((recommendation) => recommendation.alternativeExerciseId)).size).toBe(replacements.length)
  })

  it('does not substitute an exercise that is already in the plan', () => {
    const pullPlan: WorkoutPlan = {
      id: 'pull-with-pullups', name: 'Pull', description: 'test', focus: 'Back',
      exerciseIds: ['pull-up', 'cable-row'],
    }
    const replacements = adaptWorkout(pullPlan, exercises, context('default-gym', ['cables']), defaultPreferences)

    expect(replacements.some((recommendation) => recommendation.alternativeExerciseId === 'pull-up')).toBe(false)
  })

  it('preserves horizontal and vertical pull intent when equipment is limited', () => {
    const pullPlan: WorkoutPlan = {
      id: 'limited-pull', name: 'Pull', description: 'test', focus: 'Back',
      exerciseIds: ['cable-row', 'lat-pulldown'],
    }
    const replacements = adaptWorkout(pullPlan, exercises, context('default-gym', ['cables']), defaultPreferences)

    for (const replacement of replacements) {
      const original = exercises.find((exercise) => exercise.id === replacement.exerciseId)!
      const alternative = exercises.find((exercise) => exercise.id === replacement.alternativeExerciseId)!
      expect(alternative.movementPattern).toBe(original.movementPattern)
    }
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

  it('supersedes a set reduction when the same exercise must be removed', () => {
    const recommendations = adaptWorkoutForTime(timePlan, exercises, 14)
    const modifiedIds = new Set(recommendations.filter((recommendation) => recommendation.type === 'MODIFY').map((recommendation) => recommendation.exerciseId))
    const removedIds = recommendations.filter((recommendation) => recommendation.type === 'REMOVE').map((recommendation) => recommendation.exerciseId)

    expect(removedIds).toContain('cable-lateral-raise')
    expect(removedIds.some((exerciseId) => modifiedIds.has(exerciseId))).toBe(false)
  })
})
