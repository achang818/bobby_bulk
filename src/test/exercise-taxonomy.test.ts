import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { evaluatePlan } from '../domain/plan-evaluator'
import { defaultPreferences } from '../domain/preferences'
import type { Workout, WorkoutPlan } from '../domain/models'

const exercise = (id: string) => exercises.find((item) => item.id === id)!

describe('exercise taxonomy', () => {
  it('keeps broad movement patterns separate from anatomical actions', () => {
    expect(exercise('barbell-bench-press')).toMatchObject({ movementPattern: 'horizontal-push', primaryAction: 'shoulder-horizontal-adduction' })
    expect(exercise('lat-pulldown')).toMatchObject({ movementPattern: 'vertical-pull', primaryAction: 'shoulder-adduction' })
    expect(exercise('barbell-back-squat')).toMatchObject({ movementPattern: 'knee-dominant', primaryAction: 'knee-extension' })
    expect(exercise('romanian-deadlift')).toMatchObject({ movementPattern: 'hip-hinge', primaryAction: 'hip-extension' })
    expect(exercise('dumbbell-curl')).toMatchObject({ movementPattern: 'isolation', primaryAction: 'elbow-flexion' })
  })

  it('distinguishes spinal flexion from broader trunk and hip-flexion movements', () => {
    expect(exercise('cable-crunch')).toMatchObject({ movementPattern: 'isolation', primaryAction: 'spinal-flexion' })
    expect(exercise('crunch-machine')).toMatchObject({ movementPattern: 'isolation', primaryAction: 'spinal-flexion' })
    expect(exercise('sit-up')).toMatchObject({ movementPattern: 'trunk-flexion', primaryAction: 'hip-flexion', secondaryMuscles: ['Hip flexors'] })
    expect(exercise('hanging-leg-raise')).toMatchObject({ primaryAction: 'hip-flexion', secondaryMuscles: ['Hip flexors'] })
  })

  it('keeps direct targets separate from supporting muscles', () => {
    const pulldown = exercise('lat-pulldown')
    expect(pulldown.primaryMuscles).toContain('Lats')
    expect(pulldown.primaryMuscles).not.toContain('Biceps')
    expect(pulldown.secondaryMuscles).toContain('Biceps')
  })

  it('uses isolation as a deliberate broad-pattern fallback, not an equivalence claim', () => {
    const actions = ['dumbbell-curl', 'cable-lateral-raise', 'leg-extension'].map((id) => exercise(id).primaryAction)
    expect(['dumbbell-curl', 'cable-lateral-raise', 'leg-extension'].every((id) => exercise(id).movementPattern === 'isolation')).toBe(true)
    expect(new Set(actions).size).toBe(3)
  })

  it('does not treat a matching primary action alone as a stalled-exercise replacement', () => {
    const closeGripBench = exercise('close-grip-bench')
    const tricepsMachine = exercise('machine-triceps-press')
    const plan: WorkoutPlan = { id: 'close-grip', name: 'Close grip', description: '', focus: '', exerciseIds: [closeGripBench.id] }
    const history: Workout[] = ['2026-08-20', '2026-08-25', '2026-09-01'].map((date, index) => ({
      id: `close-grip-${index}`,
      date,
      title: 'Press',
      sets: [{ id: `set-${index}`, exerciseId: closeGripBench.id, setType: 'working', weight: 80, reps: 8 }],
    }))

    expect(closeGripBench.primaryAction).toBe(tricepsMachine.primaryAction)
    expect(closeGripBench.category).not.toBe(tricepsMachine.category)
    expect(evaluatePlan(plan, [closeGripBench, tricepsMachine], history, defaultPreferences, '2026-09-09').some((item) => item.type === 'REPLACE')).toBe(false)
  })

  it('requires direct primary-muscle overlap for a stalled-exercise replacement', () => {
    const closeGripBench = exercise('close-grip-bench')
    const chestPress = exercise('machine-chest-press')
    const plan: WorkoutPlan = { id: 'close-grip', name: 'Close grip', description: '', focus: '', exerciseIds: [closeGripBench.id] }
    const history: Workout[] = ['2026-08-20', '2026-08-25', '2026-09-01'].map((date, index) => ({
      id: `close-grip-${index}`,
      date,
      title: 'Press',
      sets: [{ id: `set-${index}`, exerciseId: closeGripBench.id, setType: 'working', weight: 80, reps: 8 }],
    }))

    expect(closeGripBench.category).toBe(chestPress.category)
    expect(closeGripBench.primaryMuscles).not.toEqual(expect.arrayContaining(chestPress.primaryMuscles))
    expect(evaluatePlan(plan, [closeGripBench, chestPress], history, defaultPreferences, '2026-09-09').some((item) => item.type === 'REPLACE')).toBe(false)
  })

  it('does not use secondary-muscle overlap as direct replacement evidence', () => {
    const pulldown = exercise('lat-pulldown')
    const bicepsPullFixture = {
      ...exercise('dumbbell-curl'),
      id: 'biceps-pull-fixture',
      category: pulldown.category,
      primaryMuscles: ['Biceps'],
      secondaryMuscles: ['Lats'],
    }
    const plan: WorkoutPlan = { id: 'pulldown', name: 'Pulldown', description: '', focus: '', exerciseIds: [pulldown.id] }
    const history: Workout[] = ['2026-08-20', '2026-08-25', '2026-09-01'].map((date, index) => ({
      id: `pulldown-${index}`,
      date,
      title: 'Pull',
      sets: [{ id: `set-${index}`, exerciseId: pulldown.id, setType: 'working', weight: 60, reps: 8 }],
    }))

    expect(pulldown.secondaryMuscles).toContain('Biceps')
    expect(bicepsPullFixture.secondaryMuscles).toContain('Lats')
    expect(evaluatePlan(plan, [pulldown, bicepsPullFixture], history, defaultPreferences, '2026-09-09').some((item) => item.type === 'REPLACE')).toBe(false)
  })
})
