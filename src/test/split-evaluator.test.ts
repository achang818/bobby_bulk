import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { evaluateSplit } from '../domain/split-evaluator'
import type { Split, WorkoutTemplate } from '../domain/models'

const make = (id: string, exerciseIds: string[]): WorkoutTemplate => ({ id, name: id, description: '', focus: '', exerciseIds, plannedExercises: exerciseIds.map((exerciseId, order) => ({ exerciseId, order, sets: 3, repRange: exercises.find((item) => item.id === exerciseId)!.repRange, setType: 'working' as const })) })
const split = (workoutIds: string[]): Split => ({ id: 'test-split', name: 'Test split', workoutIds })

describe('evaluateSplit', () => {
  it('summarizes direct muscle exposure without counting secondary muscles as volume', () => {
    const workouts = [make('upper-a', ['barbell-bench-press', 'lat-pulldown']), make('upper-b', ['dumbbell-bench-press', 'cable-row'])]
    const result = evaluateSplit(split(workouts.map((workout) => workout.id)), workouts, exercises)
    expect(result.workouts).toHaveLength(2)
    expect(result.muscleSummary.find((item) => item.muscle === 'Chest')).toMatchObject({ workoutCount: 2, plannedWorkingSets: 6 })
    expect(result.muscleSummary.find((item) => item.muscle === 'Biceps')).toBeUndefined()
  })

  it('keeps the assessment structured when the split is empty or references missing workouts', () => {
    const result = evaluateSplit(split(['missing']), [], exercises)
    expect(result.findings).toContainEqual(expect.objectContaining({ category: 'structure', severity: 'warning' }))
    expect(result.overallAssessment).toEqual({ distribution: 'insufficient information', recovery: 'insufficient information', redundancy: 'insufficient information', complementarity: 'insufficient information', goalAlignment: 'not assessed' })
  })

  it('does not treat workouts separated by a missing reference as consecutive recovery exposure', () => {
    const workouts = [make('pull-a', ['lat-pulldown']), make('pull-b', ['cable-row'])]
    const result = evaluateSplit(split(['pull-a', 'missing', 'pull-b']), workouts, exercises)
    expect(result.findings.some((item) => item.category === 'recovery')).toBe(false)
  })

  it('observes consecutive direct-muscle exposure with the affected workouts as evidence', () => {
    const workouts = [make('pull-a', ['lat-pulldown']), make('pull-b', ['cable-row'])]
    const result = evaluateSplit(split(workouts.map((workout) => workout.id)), workouts, exercises)
    const finding = result.findings.find((item) => item.category === 'recovery')
    expect(finding?.evidence).toEqual(['pull-a', 'pull-b'])
    expect(result.overallAssessment.recovery).toBe('potential overlap')
  })

  it('reports cross-workout repeated stimulus and substantially overlapping adjacent focus', () => {
    const workouts = [make('upper-a', ['barbell-bench-press', 'dumbbell-bench-press', 'lat-pulldown']), make('upper-b', ['machine-chest-press', 'cable-row', 'dumbbell-bench-press'])]
    const result = evaluateSplit(split(workouts.map((workout) => workout.id)), workouts, exercises)
    expect(result.findings.some((item) => item.category === 'redundancy')).toBe(true)
    expect(result.findings.some((item) => item.category === 'complementarity')).toBe(true)
    expect(result.overallAssessment.redundancy).toBe('repeated stimulus')
  })

  it('describes volume concentration and direct-priority gaps without inventing a target', () => {
    const workouts = [make('push', ['barbell-bench-press', 'dumbbell-bench-press', 'machine-chest-press', 'triceps-pushdown'])]
    const result = evaluateSplit(split(['push']), workouts, exercises, { goals: [], priorities: ['Lats'] })
    expect(result.findings.some((item) => item.category === 'distribution')).toBe(true)
    expect(result.findings.some((item) => item.category === 'goal-alignment' && item.title.includes('Lats'))).toBe(true)
    expect(result.overallAssessment.goalAlignment).toBe('limited')
  })

  it('flags a split that gives a lower priority more direct frequency than a high priority', () => {
    const workouts = [make('abs', ['cable-crunch']), make('delt-a', ['cable-lateral-raise']), make('delt-b', ['db-lateral-raise'])]
    const result = evaluateSplit(split(workouts.map((workout) => workout.id)), workouts, exercises, { goals: [], priorities: ['Abs', 'Side delts'] })
    expect(result.findings.some((item) => item.category === 'frequency' && item.title.includes('Abs'))).toBe(true)
    expect(result.findings.some((item) => item.title.includes('Abs receives less split emphasis than Side delts'))).toBe(true)
  })

  it('does not flag a split already aligned with practical priority frequency', () => {
    const workouts = [make('one', ['cable-crunch', 'cable-lateral-raise']), make('two', ['cable-crunch', 'db-lateral-raise']), make('three', ['cable-crunch'])]
    const result = evaluateSplit(split(workouts.map((workout) => workout.id)), workouts, exercises, { goals: [], priorities: ['Abs', 'Side delts'] })
    expect(result.findings.filter((item) => item.category === 'frequency' || item.category === 'goal-alignment')).toEqual([])
  })
})
