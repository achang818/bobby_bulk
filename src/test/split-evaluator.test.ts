import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { evaluateSplit, splitAlignmentCandidates } from '../domain/split-evaluator'
import type { Split, UserPreferences, WorkoutTemplate } from '../domain/models'

const make = (id: string, exerciseIds: string[]): WorkoutTemplate => ({ id, name: id, description: '', focus: '', exerciseIds, plannedExercises: exerciseIds.map((exerciseId, order) => ({ exerciseId, order, sets: 3, repRange: exercises.find((item) => item.id === exerciseId)!.repRange, setType: 'working' as const })) })
const makeWithSets = (id: string, entries: { exerciseId: string; sets: number }[]): WorkoutTemplate => ({ id, name: id, description: '', focus: '', exerciseIds: entries.map((entry) => entry.exerciseId), plannedExercises: entries.map((entry, order) => ({ ...entry, order, repRange: exercises.find((item) => item.id === entry.exerciseId)!.repRange, setType: 'working' as const })) })
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

  it('does not count secondary involvement as direct priority split work', () => {
    const workouts = [make('pull', ['lat-pulldown'])]
    const result = evaluateSplit(split(['pull']), workouts, exercises, { goals: [], priorities: ['Biceps'] })
    const missing = result.findings.find((item) => item.title.includes('Biceps has no direct split work'))
    expect(missing).toMatchObject({ severity: 'warning' })
  })

  it('distinguishes six direct sets in one exposure from six sets across three exposures', () => {
    const concentrated = [
      makeWithSets('abs-heavy', [{ exerciseId: 'cable-crunch', sets: 6 }]),
      make('pull', ['lat-pulldown']),
      make('push', ['barbell-bench-press']),
    ]
    const distributed = [
      makeWithSets('abs-one', [{ exerciseId: 'cable-crunch', sets: 2 }]),
      makeWithSets('abs-two', [{ exerciseId: 'cable-crunch', sets: 2 }]),
      makeWithSets('abs-three', [{ exerciseId: 'cable-crunch', sets: 2 }]),
    ]
    const preferences = { goals: [], priorities: ['Abs'] }
    const concentratedResult = evaluateSplit(split(concentrated.map((workout) => workout.id)), concentrated, exercises, preferences)
    const distributedResult = evaluateSplit(split(distributed.map((workout) => workout.id)), distributed, exercises, preferences)

    expect(concentratedResult.muscleSummary.find((item) => item.muscle === 'Abs')).toMatchObject({ plannedWorkingSets: 6, workoutCount: 1 })
    expect(distributedResult.muscleSummary.find((item) => item.muscle === 'Abs')).toMatchObject({ plannedWorkingSets: 6, workoutCount: 3 })
    expect(concentratedResult.findings.some((item) => item.category === 'frequency' && item.title.includes('Abs'))).toBe(true)
    expect(distributedResult.findings.some((item) => item.category === 'frequency' && item.title.includes('Abs'))).toBe(false)
  })

  it('bounds desired priority frequency by the split opportunities that actually exist', () => {
    const workouts = [make('abs', ['cable-crunch'])]
    const result = evaluateSplit(split(['abs']), workouts, exercises, { goals: [], priorities: ['Abs'] })

    expect(result.findings.some((item) => item.category === 'frequency' && item.title.includes('Abs'))).toBe(false)
  })

  it('also bounds desired frequency by an explicitly intended weekly split frequency', () => {
    const workouts = [make('delt', ['cable-lateral-raise']), make('pull', ['lat-pulldown']), make('push', ['barbell-bench-press'])]
    const weeklyTwoDaySplit: Split = { ...split(workouts.map((workout) => workout.id)), intendedFrequency: 2 }
    const result = evaluateSplit(weeklyTwoDaySplit, workouts, exercises, { goals: [], priorities: ['Side delts'] })

    expect(result.priorityOpportunities[0]).toMatchObject({ desiredFrequency: 2, plannedFrequency: 1, status: 'under-served' })
  })

  it('identifies a hierarchy inversion without escalating a small emphasis difference to a warning', () => {
    const inverted = [
      make('one', ['cable-lateral-raise', 'lat-pulldown', 'incline-db-bench']),
      make('two', ['cable-row', 'incline-db-bench']),
      make('three', ['lat-pulldown', 'incline-db-bench']),
    ]
    const inversion = evaluateSplit(split(inverted.map((workout) => workout.id)), inverted, exercises, { goals: [], priorities: ['Side delts', 'Lats', 'Upper chest'] })
    expect(inversion.findings.some((item) => item.category === 'frequency' && item.title.includes('Side delts'))).toBe(true)
    expect(inversion.findings.some((item) => item.title.includes('Side delts receives less split emphasis than Lats'))).toBe(true)

    const smallDifference = [
      makeWithSets('one', [{ exerciseId: 'cable-crunch', sets: 3 }, { exerciseId: 'cable-lateral-raise', sets: 4 }]),
      makeWithSets('two', [{ exerciseId: 'cable-crunch', sets: 3 }, { exerciseId: 'db-lateral-raise', sets: 3 }]),
      makeWithSets('three', [{ exerciseId: 'cable-crunch', sets: 3 }, { exerciseId: 'cable-lateral-raise', sets: 4 }]),
    ]
    const result = evaluateSplit(split(smallDifference.map((workout) => workout.id)), smallDifference, exercises, { goals: [], priorities: ['Abs', 'Side delts'] })
    const emphasis = result.findings.find((item) => item.title.includes('Abs receives less split emphasis than Side delts'))
    expect(emphasis).toMatchObject({ severity: 'info' })
    expect(result.findings.some((item) => item.title.includes('Abs receives less split emphasis than Side delts') && item.severity === 'warning')).toBe(false)
  })

  it('keeps a split that adequately supports its highest explicit priority', () => {
    const workouts = [make('abs-a', ['cable-crunch']), make('abs-b', ['cable-crunch']), make('abs-c', ['cable-crunch'])]
    const preferences = { goals: [], priorities: ['Abs'] }
    const result = evaluateSplit(split(workouts.map((workout) => workout.id)), workouts, exercises, preferences)

    expect(result.priorityOpportunities).toContainEqual(expect.objectContaining({ muscle: 'Abs', source: 'explicit', desiredFrequency: 3, plannedFrequency: 3, status: 'adequate' }))
    expect(splitAlignmentCandidates(split(workouts.map((workout) => workout.id)), workouts, exercises, preferences)).toEqual([])
  })

  it('recommends an advisory split adjustment for a materially under-served priority', () => {
    const workouts = [make('delt', ['cable-lateral-raise']), make('pull', ['lat-pulldown']), make('push', ['barbell-bench-press'])]
    const preferences = { goals: [], priorities: ['Side delts'] }
    const candidates = splitAlignmentCandidates(split(workouts.map((workout) => workout.id)), workouts, exercises, preferences)

    expect(candidates).toContainEqual(expect.objectContaining({ type: 'SPLIT', muscle: 'Side delts', desiredFrequency: 3, plannedFrequency: 1, issue: 'under-frequency' }))
  })

  it('evaluates multiple priorities independently and lets explicit priorities lead goal defaults', () => {
    const workouts = [make('abs', ['cable-crunch']), make('pull', ['lat-pulldown']), make('push', ['barbell-bench-press'])]
    const preferences: Pick<UserPreferences, 'goals' | 'priorities'> = { goals: ['Aesthetic physique'], priorities: ['Abs', 'Upper chest'] }
    const result = evaluateSplit(split(workouts.map((workout) => workout.id)), workouts, exercises, preferences)
    const candidates = splitAlignmentCandidates(split(workouts.map((workout) => workout.id)), workouts, exercises, preferences)

    expect(result.priorityOpportunities.slice(0, 2).map((item) => [item.muscle, item.source])).toEqual([['Abs', 'explicit'], ['Upper chest', 'explicit']])
    expect(candidates.filter((candidate) => candidate.type === 'SPLIT').map((candidate) => candidate.muscle)).toEqual(expect.arrayContaining(['Abs', 'Upper chest']))
  })

  it('uses goal-derived priorities when explicit priorities are absent', () => {
    const workouts = [make('pull', ['lat-pulldown']), make('push', ['barbell-bench-press'])]
    const preferences: Pick<UserPreferences, 'goals' | 'priorities'> = { goals: ['Aesthetic physique'], priorities: [] }
    const result = evaluateSplit(split(workouts.map((workout) => workout.id)), workouts, exercises, preferences)

    expect(result.priorityOpportunities[0]).toMatchObject({ muscle: 'Side delts', source: 'goal-derived', status: 'under-served' })
  })

  it('distinguishes concentrated adequate opportunities from a distributed split', () => {
    const concentrated = [make('delt-a', ['cable-lateral-raise']), make('delt-b', ['db-lateral-raise']), make('pull', ['lat-pulldown']), make('push', ['barbell-bench-press'])]
    const result = evaluateSplit(split(concentrated.map((workout) => workout.id)), concentrated, exercises, { goals: [], priorities: ['Side delts'] })
    const candidate = splitAlignmentCandidates(split(concentrated.map((workout) => workout.id)), concentrated, exercises, { goals: [], priorities: ['Side delts'] }).find((item) => item.type === 'SPLIT')

    expect(result.priorityOpportunities[0]).toMatchObject({ plannedFrequency: 2, distribution: 'concentrated', status: 'adequate' })
    expect(candidate).toMatchObject({ issue: 'concentrated-opportunities' })
  })

  it('is deterministic for identical split and priority inputs', () => {
    const workouts = [make('delt', ['cable-lateral-raise']), make('pull', ['lat-pulldown']), make('push', ['barbell-bench-press'])]
    const input = split(workouts.map((workout) => workout.id))
    const preferences = { goals: [], priorities: ['Side delts'] }

    expect(splitAlignmentCandidates(input, workouts, exercises, preferences)).toEqual(splitAlignmentCandidates(input, workouts, exercises, preferences))
  })
})
