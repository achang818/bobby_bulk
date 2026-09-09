import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { recommendNext } from '../domain/progression'
import type { PlannedExercise, Workout } from '../domain/models'

const bench = exercises[0]

describe('recommendNext', () => {
  it('starts safely when there is no history', () => {
    expect(recommendNext(bench, []).action).toBe('start-here')
  })

  it('holds weight and asks for more reps below the top of the range', () => {
    const workout: Workout = {
      id: 'w1', date: '2026-09-01', title: 'Upper', sets: [
        { id: '1', exerciseId: bench.id, setType: 'working', weight: 70, reps: 8 },
        { id: '2', exerciseId: bench.id, setType: 'working', weight: 70, reps: 8 },
        { id: '3', exerciseId: bench.id, setType: 'working', weight: 70, reps: 7 },
      ],
    }
    const recommendation = recommendNext(bench, [workout])
    expect(recommendation.weight).toBe(70)
    expect(recommendation.action).toBe('progress-reps')
  })

  it('increases weight after all prescribed sets reach the top', () => {
    const workout: Workout = {
      id: 'w1', date: '2026-09-01', title: 'Upper', sets: [
        { id: '1', exerciseId: bench.id, setType: 'working', weight: 70, reps: 10 },
        { id: '2', exerciseId: bench.id, setType: 'working', weight: 70, reps: 10 },
        { id: '3', exerciseId: bench.id, setType: 'working', weight: 70, reps: 10 },
      ],
    }
    expect(recommendNext(bench, [workout]).weight).toBe(75)
  })

  it('uses the gym load increments instead of inventing an unavailable load', () => {
    const workout: Workout = {
      id: 'w1', date: '2026-09-01', title: 'Upper', sets: [
        { id: '1', exerciseId: bench.id, setType: 'working', weight: 70, reps: 10 },
        { id: '2', exerciseId: bench.id, setType: 'working', weight: 70, reps: 10 },
        { id: '3', exerciseId: bench.id, setType: 'working', weight: 70, reps: 10 },
      ],
    }
    expect(recommendNext(bench, [workout], [{ equipment: 'dumbbells', increments: [65, 70] }]).weight).toBe(70)
  })

  it('ignores optional timing and RIR when they are missing', () => {
    const workout: Workout = {
      id: 'w1', date: '2026-09-01', title: 'Upper', sets: [
        { id: '1', exerciseId: bench.id, setType: 'working', weight: 70, reps: 8 },
      ],
    }
    expect(() => recommendNext(bench, [workout])).not.toThrow()
  })

  it('treats easy top-range working sets as high-confidence progression', () => {
    const recommendation = recommendNext(bench, [workoutWithSets([10, 10, 10], [3, 3, 2])])
    expect(recommendation.action).toBe('increase-weight')
    expect(recommendation.confidence).toBe('high')
    expect(recommendation.reasons[0]).toContain('2-3 reps in reserve')
  })

  it('is conservative when top-range sets were very close to failure', () => {
    const recommendation = recommendNext(bench, [workoutWithSets([10, 10, 10], [0, 0, 0])])
    expect(recommendation.action).toBe('progress-reps')
    expect(recommendation.confidence).toBe('low')
    expect(recommendation.reasons[0]).toContain('close to failure')
  })

  it('keeps rep-based progression when RIR is absent or only partly recorded', () => {
    expect(recommendNext(bench, [workoutWithSets([10, 10, 10])]).action).toBe('increase-weight')
    const partial = recommendNext(bench, [workoutWithSets([10, 10, 10], [3, undefined, 2])])
    expect(partial.action).toBe('increase-weight')
    expect(partial.confidence).toBe('high')
  })

  it('uses planned sets and working sets when assessing completion', () => {
    const planned: PlannedExercise = { exerciseId: bench.id, order: 0, sets: 4, repRange: { min: 6, max: 8 }, setType: 'working' }
    expect(recommendNext(bench, planned, [workoutWithSets([8, 8, 8, 7], undefined, 100)]).action).toBe('progress-reps')
    const threeWorkingWithWarmup: Workout = {
      ...workoutWithSets([8, 8, 8], undefined, 100),
      sets: [{ id: 'warmup', exerciseId: bench.id, setType: 'warm-up', weight: 45, reps: 10 }, ...workoutWithSets([8, 8, 8], undefined, 100).sets],
    }
    expect(recommendNext(bench, planned, [threeWorkingWithWarmup]).action).toBe('progress-reps')
  })

  it('uses RPE only as supporting effort evidence when RIR is absent', () => {
    const workout = workoutWithSets([10, 10, 10])
    workout.sets = workout.sets.map((set) => ({ ...set, rpe: 9 }))
    expect(recommendNext(bench, [workout]).action).toBe('progress-reps')
  })

  it('prefers recorded RIR over RPE on the same set', () => {
    const workout = workoutWithSets([10, 10, 10], [3, 3, 3])
    workout.sets = workout.sets.map((set) => ({ ...set, rpe: 9 }))
    expect(recommendNext(bench, [workout]).action).toBe('increase-weight')
  })
})

function workoutWithSets(reps: number[], rir?: (number | undefined)[], weight = 70): Workout {
  return {
    id: 'w1', date: '2026-09-01', title: 'Upper', sets: reps.map((setReps, index) => ({
      id: String(index), exerciseId: bench.id, setType: 'working', weight, reps: setReps,
      ...(rir?.[index] === undefined ? {} : { rir: rir[index] }),
    })),
  }
}
