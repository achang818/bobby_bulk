import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { evaluateSplit } from '../domain/split-evaluator'
import type { Split, WorkoutTemplate } from '../domain/models'
const make = (id: string, exerciseIds: string[]): WorkoutTemplate => ({ id, name: id, description: '', focus: '', exerciseIds, plannedExercises: exerciseIds.map((exerciseId, order) => ({ exerciseId, order, sets: 3, repRange: exercises.find((item) => item.id === exerciseId)!.repRange, setType: 'working' as const })) })
describe('evaluateSplit', () => {
  it('summarizes planned direct muscle exposure and reuses workout evaluations', () => { const workouts = [make('upper-a', ['barbell-bench-press', 'lat-pulldown']), make('upper-b', ['dumbbell-bench-press', 'cable-row'])]; const split: Split = { id: 'upper', name: 'Upper', workoutIds: workouts.map((workout) => workout.id) }; const result = evaluateSplit(split, workouts, exercises); expect(result.workouts).toHaveLength(2); expect(result.muscleSummary.find((item) => item.muscle === 'Chest')?.workoutCount).toBe(2) })
  it('handles empty and missing workout references', () => { expect(evaluateSplit({ id: 'empty', name: 'Empty', workoutIds: ['missing'] }, [], exercises).overallAssessment).toBe('insufficient information') })
  it('observes consecutive direct-muscle exposure and missing priorities', () => { const workouts = [make('a', ['lat-pulldown']), make('b', ['cable-row'])]; const result = evaluateSplit({ id: 'pull', name: 'Pull', workoutIds: ['a', 'b'] }, workouts, exercises, { goals: [], priorities: ['Chest'] }); expect(result.findings.some((item) => item.category === 'recovery')).toBe(true); expect(result.findings.some((item) => item.category === 'goal-alignment')).toBe(true) })
})
