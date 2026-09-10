import { describe, expect, it } from 'vitest'
import { calculateExerciseFeatures, calculateMuscleFeatures, calculateTrainingState, comparePlannedVsActual, sessionsWithinWindow } from '../domain/features'
import { exercises } from '../domain/exercises'
import type { Workout } from '../domain/models'

const pulldown = exercises.find((exercise) => exercise.id === 'lat-pulldown')!
const row = exercises.find((exercise) => exercise.id === 'cable-row')!

function session(id: string, date: string, exerciseId = pulldown.id, weight = 160, reps = 8): Workout {
  return { id, date, title: 'Pull', sets: [{ id: `${id}-set`, exerciseId, setType: 'working', weight, reps }] }
}

describe('training state', () => {
  it('reports absent and limited exercise evidence without fabricating performance', () => {
    expect(calculateExerciseFeatures(pulldown, [], '2026-09-09')).toMatchObject({ sessionsPerformed: 0, historyConfidence: 'none', progressionState: 'insufficient history', recentWorkingSets: [] })
    expect(calculateExerciseFeatures(pulldown, [session('one', '2026-09-08')], '2026-09-09').historyConfidence).toBe('limited')
  })

  it('tracks working-set performance and a progressing trend', () => {
    const history = [session('a', '2026-08-25', pulldown.id, 140, 8), session('b', '2026-09-01', pulldown.id, 160, 10)]
    const state = calculateExerciseFeatures(pulldown, history, '2026-09-09')
    expect(state.progressionState).toBe('progressing')
    expect(state.bestWorkingWeight).toBe(160)
    expect(state.historyConfidence).toBe('moderate')
  })

  it('uses inclusive rolling-window boundaries and primary-muscle working sets', () => {
    const history = [session('seven', '2026-09-02'), session('outside', '2026-09-01'), session('fourteen', '2026-08-26', row.id)]
    expect(sessionsWithinWindow(history, '2026-09-09', 7)).toHaveLength(1)
    expect(sessionsWithinWindow(history, '2026-09-09', 14)).toHaveLength(3)
    const back = calculateMuscleFeatures('Lats', exercises, history, '2026-09-09')
    expect(back.rolling7DaySets).toBe(1)
    expect(back.rolling14DaySets).toBe(3)
    expect(back.frequency7Days).toBe(1)
    expect(back.daysSinceTrained).toBe(7)
  })

  it('excludes warm-ups, drops, and failures from primary exposure', () => {
    const history: Workout[] = [{ id: 'types', date: '2026-09-08', title: 'Pull', sets: [
      { id: 'warm', exerciseId: pulldown.id, setType: 'warm-up', weight: 100, reps: 12 },
      { id: 'work', exerciseId: pulldown.id, setType: 'working', weight: 160, reps: 8 },
      { id: 'drop', exerciseId: pulldown.id, setType: 'drop', weight: 120, reps: 12 },
      { id: 'fail', exerciseId: pulldown.id, setType: 'failure', weight: 180, reps: 4 },
    ] }]
    expect(calculateMuscleFeatures('Lats', exercises, history, '2026-09-09').rolling7DaySets).toBe(1)
  })

  it('compares the planned prescription with actual demonstrated working performance', () => {
    const workout: Workout = { id: 'planned', date: '2026-09-08', title: 'Pull', plannedExercises: [{ exerciseId: pulldown.id, order: 0, sets: 3, repRange: { min: 8, max: 12 }, setType: 'working' }], sets: [
      { id: '1', exerciseId: pulldown.id, setType: 'working', weight: 135, reps: 12 },
      { id: '2', exerciseId: pulldown.id, setType: 'working', weight: 160, reps: 8 },
      { id: '3', exerciseId: pulldown.id, setType: 'working', weight: 205, reps: 4 },
    ] }
    expect(comparePlannedVsActual(workout)[0]).toMatchObject({ plannedSets: 3, completedWorkingSets: 3, targetRangeWorkingSets: 2, fullyCompleted: true, demonstratedWorkingLoad: 160 })
  })

  it('builds one deterministic state tree for exercise and primary-muscle history', () => {
    const state = calculateTrainingState([pulldown, row], [session('a', '2026-09-08')], '2026-09-09')
    expect(state.asOf).toBe('2026-09-09')
    expect(state.exercises.find((item) => item.exerciseId === pulldown.id)?.sessionsPerformed).toBe(1)
    expect(state.muscles.find((item) => item.muscle === 'Lats')?.rolling7DaySets).toBe(1)
  })

  it('does not include future completed sessions in an as-of snapshot', () => {
    const history = [session('past', '2026-09-08'), session('future', '2026-09-12', pulldown.id, 200, 12)]
    const state = calculateTrainingState([pulldown], history, '2026-09-09')
    expect(state.exercises[0]).toMatchObject({ sessionsPerformed: 1, bestWorkingWeight: 160, lastPerformedDate: '2026-09-08' })
    expect(state.muscles.find((item) => item.muscle === 'Lats')?.daysSinceTrained).toBe(1)
  })
})
