import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { calculateExerciseFeatures, calculateExercisePerformance, comparePlannedVsActual, exercisePerformanceHistory } from '../domain/features'
import { evaluatePlan } from '../domain/plan-evaluator'
import { defaultPreferences } from '../domain/preferences'
import type { Workout, WorkoutPlan } from '../domain/models'

const pulldown = exercises.find((exercise) => exercise.id === 'lat-pulldown')!
const plan: WorkoutPlan = { id: 'pull', name: 'Pull', description: '', focus: 'Back', exerciseIds: [pulldown.id], plannedExercises: [{ exerciseId: pulldown.id, order: 0, sets: 3, repRange: { min: 8, max: 12 }, setType: 'working' }] }

function workout(id: string, date: string, sets: Workout['sets'], planned = true): Workout {
  return { id, date, title: 'Pull', status: 'completed', ...(planned ? { plannedExercises: plan.plannedExercises } : {}), sets }
}
function working(id: string, weight: number, reps: number, extras = {}) { return { id, exerciseId: pulldown.id, setType: 'working' as const, weight, reps, ...extras } }

describe('historical exercise performance', () => {
  it('preserves the completed session prescription beside actual mixed-set performance', () => {
    const session = workout('mixed', '2026-09-08', [
      { id: 'warm', exerciseId: pulldown.id, setType: 'warm-up', weight: 80, reps: 12 },
      working('one', 160, 10, { rir: 2 }), working('two', 160, 9, { rpe: 8 }), working('three', 160, 8),
      { id: 'drop', exerciseId: pulldown.id, setType: 'drop', weight: 120, reps: 12 },
    ])
    const performance = calculateExercisePerformance(session, pulldown.id)!
    expect(performance).toMatchObject({ plannedSets: 3, plannedRepRange: { min: 8, max: 12 }, completedSets: 5, completedWorkingSets: 3, totalReps: 51, totalWorkingReps: 27, workingVolume: 4320, targetRangeWorkingSets: 3, completion: 'completed' })
    expect(performance.averageRir).toBe(2)
    expect(performance.averageRpe).toBe(8)
    expect(performance.estimatedOneRepMax).toBeGreaterThan(200)
  })

  it('classifies full, partial, and below-target prescriptions from working sets only', () => {
    const full = workout('full', '2026-09-01', [working('1', 160, 12), working('2', 160, 10), working('3', 160, 8)])
    const partial = workout('partial', '2026-09-02', [working('1', 160, 12), working('2', 160, 10)])
    const below = workout('below', '2026-09-03', [working('1', 160, 7), working('2', 160, 7), working('3', 160, 6)])
    expect(comparePlannedVsActual(full)[0]).toMatchObject({ completion: 'completed', prescriptionAchieved: true })
    expect(comparePlannedVsActual(partial)[0]).toMatchObject({ completion: 'partial', fullyCompleted: false })
    expect(comparePlannedVsActual(below)[0]).toMatchObject({ completion: 'below target', fullyCompleted: true, prescriptionAchieved: false })
  })

  it('keeps unplanned legacy sessions interpretable without inventing a prescription', () => {
    const legacy = workout('legacy', '2026-09-01', [working('1', 160, 8)], false)
    expect(exercisePerformanceHistory(pulldown.id, [legacy])[0]).toMatchObject({ completion: 'unplanned', completedWorkingSets: 1 })
    expect(exercisePerformanceHistory(pulldown.id, [legacy])[0].plannedSets).toBeUndefined()
  })
})

describe('exercise history features', () => {
  it('surfaces recent, best, and estimated-1RM working-set records while excluding warm-ups', () => {
    const history = [
      workout('a', '2026-09-01', [{ id: 'warm', exerciseId: pulldown.id, setType: 'warm-up', weight: 250, reps: 2 }, working('a', 160, 8)]),
      workout('b', '2026-09-05', [working('b', 170, 8)]),
    ]
    const features = calculateExerciseFeatures(pulldown, history, '2026-09-09')
    expect(features.mostRecentPerformance).toMatchObject({ date: '2026-09-05', heaviestWorkingWeight: 170 })
    expect(features.bestWorkingWeight).toBe(170)
    expect(features.bestRepsAtBestWeight).toBe(8)
    expect(features.bestEstimatedOneRepMax).toBeGreaterThan(200)
    expect(features.recentWorkingVolume).toBe(2640)
  })

  it('detects improvement and stable results, and needs two weaker sessions before calling a decline', () => {
    const improving = [workout('a', '2026-09-01', [working('a', 140, 8)]), workout('b', '2026-09-03', [working('b', 160, 8)])]
    const stable = [workout('a', '2026-09-01', [working('a', 160, 8)]), workout('b', '2026-09-03', [working('b', 160, 8)])]
    const oneBad = [workout('a', '2026-09-01', [working('a', 160, 10)]), workout('b', '2026-09-03', [working('b', 160, 10)]), workout('c', '2026-09-05', [working('c', 160, 6)])]
    const declining = [workout('a', '2026-09-01', [working('a', 160, 10)]), workout('b', '2026-09-03', [working('b', 160, 7)]), workout('c', '2026-09-05', [working('c', 160, 6)])]
    expect(calculateExerciseFeatures(pulldown, improving, '2026-09-09').progressionState).toBe('progressing')
    expect(calculateExerciseFeatures(pulldown, stable, '2026-09-09').progressionState).toBe('stable')
    expect(calculateExerciseFeatures(pulldown, oneBad, '2026-09-09').progressionState).not.toBe('declining')
    expect(calculateExerciseFeatures(pulldown, declining, '2026-09-09').progressionState).toBe('declining')
    expect(calculateExerciseFeatures(pulldown, [improving[0]], '2026-09-09').progressionState).toBe('insufficient history')
  })
})

describe('recommendation evidence', () => {
  it('carries the latest planned-versus-actual completion and effort into progression evidence', () => {
    const history = [workout('a', '2026-09-01', [working('1', 160, 12, { rir: 2 }), working('2', 160, 12, { rir: 2 }), working('3', 160, 12, { rir: 2 })])]
    const recommendation = evaluatePlan(plan, exercises, history, { ...defaultPreferences, goals: ['Build muscle'] }, '2026-09-09').find((item) => item.type === 'PROGRESSION')
    expect(recommendation?.reasons).toContain('Last prescription was completed: 3/3 working sets. Average RIR 2.')
    expect(recommendation?.progression?.reasons[0]).toContain('at 2 RIR')
  })
})
