import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { calculateExerciseFeatures, calculateExercisePerformance, comparePlannedVsActual, exercisePerformanceHistory } from '../domain/features'
import { evaluatePlan } from '../domain/plan-evaluator'
import { defaultPreferences } from '../domain/preferences'
import { compareExercisePerformance } from '../domain/states'
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
    expect(performance.workingSets.map((set) => set.rir)).toEqual([2, undefined, undefined])
    expect(performance.workingSets.map((set) => set.rpe)).toEqual([undefined, 8, undefined])
    expect(performance.sets.map((set) => set.setType)).toEqual(['warm-up', 'working', 'working', 'working', 'drop'])
    expect(performance.workingSets).toHaveLength(3)
    expect(performance.bestEstimatedOneRepMax).toBeGreaterThan(200)
    expect(performance.averageEstimatedOneRepMax).toBeGreaterThan(200)
  })

  it('classifies full, partial, and below-target prescriptions from working sets only', () => {
    const full = workout('full', '2026-09-01', [working('1', 160, 12), working('2', 160, 10), working('3', 160, 8)])
    const partial = workout('partial', '2026-09-02', [working('1', 160, 12), working('2', 160, 10)])
    const below = workout('below', '2026-09-03', [working('1', 160, 7), working('2', 160, 7), working('3', 160, 6)])
    expect(comparePlannedVsActual(full)[0]).toMatchObject({ completion: 'completed', prescriptionAchieved: true })
    expect(comparePlannedVsActual(partial)[0]).toMatchObject({ completion: 'partial', fullyCompleted: false })
    expect(comparePlannedVsActual(below)[0]).toMatchObject({ completion: 'below target', fullyCompleted: true, prescriptionAchieved: false })
  })

  it('keeps extra, missing, and ad-hoc exercise evidence explicit', () => {
    const extra = workout('extra', '2026-09-04', [working('1', 160, 12), working('2', 160, 12), working('3', 160, 12), working('4', 160, 10), { id: 'ad-hoc', exerciseId: 'cable-row', setType: 'working', weight: 90, reps: 10 }])
    const extraPerformance = calculateExercisePerformance(extra, pulldown.id)!
    const comparison = comparePlannedVsActual(extra)
    expect(extraPerformance).toMatchObject({ completedWorkingSets: 4, completionRate: 1, demonstratedWorkingLoad: 160, prescriptionAchieved: true })
    expect(comparison.find((item) => item.exerciseId === 'cable-row')).toMatchObject({ isAdHoc: true, completion: 'unplanned', completedWorkingSets: 1 })
    const missing = comparePlannedVsActual({ ...extra, id: 'missing', sets: [] })
    expect(missing.find((item) => item.exerciseId === pulldown.id)).toMatchObject({ isAdHoc: false, completion: 'not started', completedWorkingSets: 0 })
  })

  it('keeps unplanned legacy sessions interpretable without inventing a prescription', () => {
    const legacy = workout('legacy', '2026-09-01', [working('1', 160, 8)], false)
    expect(exercisePerformanceHistory(pulldown.id, [legacy])[0]).toMatchObject({ completion: 'unplanned', completedWorkingSets: 1 })
    expect(exercisePerformanceHistory(pulldown.id, [legacy])[0].plannedSets).toBeUndefined()
  })

  it('never turns mixed working sets into average weight or rep performance', () => {
    const session = workout('mixed-loads', '2026-09-09', [working('one', 100, 4), working('two', 155, 8, { rir: 3 }), working('three', 155, 8, { rir: 2 })])
    const performance = calculateExercisePerformance(session, pulldown.id)!
    const features = calculateExerciseFeatures(pulldown, [session], '2026-09-09')
    expect(performance.workingSets).toMatchObject([{ weight: 100, reps: 4 }, { weight: 155, reps: 8, rir: 3 }, { weight: 155, reps: 8, rir: 2 }])
    expect(performance.bestWorkingSet).toMatchObject({ weight: 155, reps: 8, rir: 3 })
    expect(performance.workingVolume).toBe(2880)
    expect('averageWorkingWeight' in performance).toBe(false)
    expect('averageWorkingReps' in performance).toBe(false)
    expect('averageRir' in performance).toBe(false)
    expect('averageRpe' in performance).toBe(false)
    expect(features.recentPerformances[0].workingSets).toHaveLength(3)
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
    const stalled = [workout('a', '2026-09-01', [working('a', 160, 8)]), workout('b', '2026-09-03', [working('b', 160, 8)]), workout('c', '2026-09-05', [working('c', 160, 8)])]
    const oneBad = [workout('a', '2026-09-01', [working('a', 160, 10)]), workout('b', '2026-09-03', [working('b', 160, 10)]), workout('c', '2026-09-05', [working('c', 160, 6)])]
    const declining = [workout('a', '2026-09-01', [working('a', 160, 10)]), workout('b', '2026-09-03', [working('b', 160, 7)]), workout('c', '2026-09-05', [working('c', 160, 6)])]
    expect(calculateExerciseFeatures(pulldown, improving, '2026-09-09').progressionState).toBe('progressing')
    expect(calculateExerciseFeatures(pulldown, stable, '2026-09-09').progressionState).toBe('stable')
    expect(calculateExerciseFeatures(pulldown, stalled, '2026-09-09').progressionState).toBe('stalled')
    expect(calculateExerciseFeatures(pulldown, oneBad, '2026-09-09').progressionState).not.toBe('regressing')
    expect(calculateExerciseFeatures(pulldown, declining, '2026-09-09').progressionState).toBe('regressing')
    expect(calculateExerciseFeatures(pulldown, [improving[0]], '2026-09-09').progressionState).toBe('insufficient history')
  })
})

describe('set-level performance comparison', () => {
  function performance(id: string, date: string, sets: Workout['sets'], plannedExercises = plan.plannedExercises) {
    return calculateExercisePerformance({ id, date, title: 'Pull', status: 'completed', plannedExercises, sets }, pulldown.id)!
  }

  it('uses more reps at the same load and the same reps at a higher load as direct progression evidence', () => {
    const baseline = performance('a', '2026-09-01', [working('a', 100, 8)])
    expect(compareExercisePerformance(baseline, performance('b', '2026-09-03', [working('b', 100, 10)])).direction).toBe('improved')
    expect(compareExercisePerformance(baseline, performance('c', '2026-09-05', [working('c', 105, 8)])).direction).toBe('improved')
  })

  it('uses all ordinary working sets instead of a single best set', () => {
    const previous = performance('a', '2026-09-01', [working('a1', 100, 8), working('a2', 100, 8), working('a3', 95, 9)])
    const current = performance('b', '2026-09-03', [working('b1', 100, 9), working('b2', 100, 9), working('b3', 100, 8)])
    expect(compareExercisePerformance(previous, current)).toMatchObject({ direction: 'improved', comparableSets: 2, improvedSets: 2 })
  })

  it('matches real sets by comparable evidence instead of their sorted positions', () => {
    const previous = performance('a', '2026-09-01', [working('a1', 100, 8), working('a2', 95, 10), working('a3', 95, 9)])
    const current = performance('b', '2026-09-03', [working('b1', 100, 9), working('b2', 100, 8), working('b3', 90, 12)])
    const comparison = compareExercisePerformance(previous, current)
    expect(comparison.matchedSets).toEqual([
      { previousSetId: 'a1', currentSetId: 'b1', direction: 'improved' },
      { previousSetId: 'a3', currentSetId: 'b2', direction: 'inconclusive' },
      { previousSetId: 'a2', currentSetId: 'b3', direction: 'inconclusive' },
    ])
    expect(comparison.direction).toBe('improved')
  })

  it('reserves an exact-load counterpart before using overlapping comparable-load ranges', () => {
    const previous = performance('a', '2026-09-01', [working('a100', 100, 8), working('a140', 140, 8)], [])
    const current = performance('b', '2026-09-03', [working('b115', 115, 8), working('b140', 140, 8)], [])
    expect(compareExercisePerformance(previous, current).matchedSets).toEqual([
      { previousSetId: 'a140', currentSetId: 'b140', direction: 'unchanged' },
      { previousSetId: 'a100', currentSetId: 'b115', direction: 'improved' },
    ])
  })

  it('matches three loads and duplicate loads without reusing any historical set', () => {
    const previous = performance('a', '2026-09-01', [working('a100', 100, 8), working('a110-low', 110, 8), working('a110-high', 110, 9)], [])
    const current = performance('b', '2026-09-03', [working('b102', 102.5, 8), working('b110', 110, 9), working('b118', 118, 8)], [])
    const matched = compareExercisePerformance(previous, current).matchedSets ?? []
    expect(matched.map((item) => item.previousSetId)).toEqual(['a110-high', 'a100', 'a110-low'])
    expect(new Set(matched.map((item) => item.previousSetId)).size).toBe(3)
  })

  it('recognizes more target-range sets after an unchanged matched set as progression', () => {
    const previous = performance('a', '2026-09-01', [working('a', 100, 8)])
    const current = performance('b', '2026-09-03', [working('b1', 100, 8), working('b2', 100, 8), working('b3', 100, 8)])
    expect(compareExercisePerformance(previous, current).direction).toBe('improved')
  })

  it('recognizes a 1-to-3 set prescription increase when the user completes the added target-range work', () => {
    const oneSetPlan = [{ exerciseId: pulldown.id, order: 0, sets: 1, repRange: { min: 8, max: 12 }, setType: 'working' as const }]
    const threeSetPlan = [{ exerciseId: pulldown.id, order: 0, sets: 3, repRange: { min: 8, max: 12 }, setType: 'working' as const }]
    const previous = performance('a', '2026-09-01', [working('a', 100, 8)], oneSetPlan)
    const current = performance('b', '2026-09-03', [working('b1', 100, 8), working('b2', 100, 8), working('b3', 100, 8)], threeSetPlan)
    expect(compareExercisePerformance(previous, current)).toMatchObject({ direction: 'improved', unchangedSets: 1 })
  })

  it('does not let extra prescribed sets override a clearly weaker matched set', () => {
    const widerRangePlan = [{ exerciseId: pulldown.id, order: 0, sets: 3, repRange: { min: 5, max: 10 }, setType: 'working' as const }]
    const previous = performance('a', '2026-09-01', [working('a', 100, 8)], widerRangePlan)
    const current = performance('b', '2026-09-03', [working('b1', 100, 6), working('b2', 100, 6), working('b3', 100, 6)], widerRangePlan)
    expect(compareExercisePerformance(previous, current)).toMatchObject({ direction: 'worse', worsenedSets: 1 })
  })

  it('leaves sets with no reasonable historical counterpart unmatched', () => {
    const previous = performance('a', '2026-09-01', [working('a', 100, 8)], [])
    const current = performance('b', '2026-09-03', [working('b', 130, 8)], [])
    expect(compareExercisePerformance(previous, current)).toMatchObject({ direction: 'inconclusive', comparableSets: 0 })
  })

  it('keeps mixed direct set evidence inconclusive', () => {
    const previous = performance('a', '2026-09-01', [working('a1', 100, 10), working('a2', 100, 6)])
    const current = performance('b', '2026-09-03', [working('b1', 100, 9), working('b2', 100, 8)])
    expect(compareExercisePerformance(previous, current).direction).toBe('inconclusive')
  })

  it('recognizes additional target-range work when the planned set count increases', () => {
    const fourSetPlan = [{ exerciseId: pulldown.id, order: 0, sets: 4, repRange: { min: 8, max: 12 }, setType: 'working' as const }]
    const previous = performance('a', '2026-09-01', [working('a', 100, 8)])
    const current = performance('b', '2026-09-03', [working('b1', 100, 8), working('b2', 100, 8), working('b3', 100, 8), working('b4', 100, 8)], fourSetPlan)
    expect(compareExercisePerformance(previous, current).direction).toBe('improved')
  })

  it('does not call a much heavier, low-rep effort automatic progression', () => {
    const previous = performance('a', '2026-09-01', [working('a', 100, 8, { rir: 2 })], [])
    const current = performance('b', '2026-09-03', [working('b', 110, 3, { rir: 0 })], [])
    expect(compareExercisePerformance(previous, current).direction).toBe('inconclusive')
  })

  it('excludes warm-up, drop, and failure sets from the normal comparison', () => {
    const previous = performance('a', '2026-09-01', [
      { id: 'warm-a', exerciseId: pulldown.id, setType: 'warm-up', weight: 60, reps: 10 },
      working('a', 100, 8),
      { id: 'drop-a', exerciseId: pulldown.id, setType: 'drop', weight: 70, reps: 20 },
      { id: 'failure-a', exerciseId: pulldown.id, setType: 'failure', weight: 110, reps: 2 },
    ])
    const current = performance('b', '2026-09-03', [
      { id: 'warm-b', exerciseId: pulldown.id, setType: 'warm-up', weight: 200, reps: 2 },
      working('b', 100, 8),
      { id: 'drop-b', exerciseId: pulldown.id, setType: 'drop', weight: 30, reps: 40 },
      { id: 'failure-b', exerciseId: pulldown.id, setType: 'failure', weight: 200, reps: 1 },
    ])
    expect(compareExercisePerformance(previous, current)).toMatchObject({ direction: 'unchanged', comparableSets: 1 })
  })

  it('gives RIR precedence over RPE when effort makes a heavier set ambiguous', () => {
    const previous = performance('a', '2026-09-01', [working('a', 100, 8, { rir: 2, rpe: 10 })])
    const current = performance('b', '2026-09-03', [working('b', 105, 8, { rir: 0, rpe: 6 })])
    expect(compareExercisePerformance(previous, current).direction).toBe('inconclusive')
  })

  it('handles RPE-only and mixed effort evidence without inventing an RIR value', () => {
    const rpeOnlyPrevious = performance('a', '2026-09-01', [working('a', 100, 8, { rpe: 7 })], [])
    const rpeOnlyCurrent = performance('b', '2026-09-03', [working('b', 105, 8, { rpe: 7 })], [])
    const mixedCurrent = performance('c', '2026-09-05', [working('c', 105, 8, { rpe: 9 })], [])
    const rirPrevious = performance('d', '2026-09-07', [working('d', 100, 8, { rir: 2 })], [])
    expect(compareExercisePerformance(rpeOnlyPrevious, rpeOnlyCurrent).direction).toBe('improved')
    expect(compareExercisePerformance(rirPrevious, mixedCurrent).direction).toBe('inconclusive')
  })

  it('does not compare different rep prescriptions as if they were the same block', () => {
    const strengthPlan = [{ exerciseId: pulldown.id, order: 0, sets: 3, repRange: { min: 5, max: 8 }, setType: 'working' as const }]
    const previous = performance('a', '2026-09-01', [working('a', 100, 8)])
    const current = performance('b', '2026-09-03', [working('b', 110, 6)], strengthPlan)
    expect(compareExercisePerformance(previous, current).direction).toBe('inconclusive')
  })
})

describe('recommendation evidence', () => {
  it('carries the latest planned-versus-actual completion and effort into progression evidence', () => {
    const history = [workout('a', '2026-09-01', [working('1', 160, 12, { rir: 2 }), working('2', 160, 12, { rir: 2 }), working('3', 160, 12, { rir: 2 })])]
    const recommendation = evaluatePlan(plan, exercises, history, { ...defaultPreferences, goals: ['Build muscle'] }, '2026-09-09').find((item) => item.type === 'PROGRESSION')
    expect(recommendation?.reasons).toContain('Last prescription was completed: 3/3 working sets. Best working set recorded at 2 RIR.')
    expect(recommendation?.progression?.reasons[0]).toContain('at 2 RIR')
  })
})
