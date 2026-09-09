import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { evaluateWorkout } from '../domain/workout-evaluator'
import type { WorkoutTemplate } from '../domain/models'

const byId = (id: string) => exercises.find((exercise) => exercise.id === id)!
const plan = (ids: string[]): WorkoutTemplate => ({ id: 'test', name: 'Test', description: '', focus: '', exerciseIds: ids, plannedExercises: ids.map((id, order) => ({ exerciseId: id, order, sets: 3, repRange: byId(id).repRange, setType: 'working' as const })) })

describe('evaluateWorkout', () => {
  it('reports primary-muscle volume without turning secondary muscles into sets', () => {
    const result = evaluateWorkout(plan(['lat-pulldown']), exercises)
    expect(result.primaryMuscleSets.Lats).toBe(3)
    expect(result.primaryMuscleSets.Biceps).toBeUndefined()
    expect(result.secondaryMuscles).toContain('Biceps')
  })
  it('flags overlapping movement redundancy with structured evidence', () => {
    const result = evaluateWorkout(plan(['barbell-bench-press', 'dumbbell-bench-press', 'machine-chest-press']), exercises)
    const finding = result.findings.find((item) => item.category === 'redundancy')
    expect(finding).toMatchObject({ severity: 'warning' })
    expect(finding?.evidence.length).toBe(3)
  })
  it('flags isolation work before a compound unless grouped together', () => {
    const result = evaluateWorkout(plan(['cable-lateral-raise', 'barbell-bench-press']), exercises)
    expect(result.findings.some((item) => item.category === 'ordering')).toBe(true)
  })
  it('reports duration pressure and handles an empty workout', () => {
    expect(evaluateWorkout(plan(['barbell-bench-press', 'dumbbell-bench-press', 'machine-chest-press']), exercises, { availableMinutes: 10 }).findings.some((item) => item.category === 'duration' && item.severity === 'warning')).toBe(true)
    expect(evaluateWorkout(plan([]), exercises).findings.some((item) => item.title === 'No exercises planned')).toBe(true)
  })
})
