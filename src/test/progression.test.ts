import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { recommendNext } from '../domain/progression'
import type { Workout } from '../domain/models'

const bench = exercises[0]

describe('recommendNext', () => {
  it('starts safely when there is no history', () => {
    expect(recommendNext(bench, []).action).toBe('start-here')
  })

  it('holds weight and asks for more reps below the top of the range', () => {
    const workout: Workout = {
      id: 'w1', date: '2026-09-01', title: 'Upper', sets: [
        { id: '1', exerciseId: bench.id, weight: 70, reps: 8 },
        { id: '2', exerciseId: bench.id, weight: 70, reps: 8 },
        { id: '3', exerciseId: bench.id, weight: 70, reps: 7 },
      ],
    }
    const recommendation = recommendNext(bench, [workout])
    expect(recommendation.weight).toBe(70)
    expect(recommendation.action).toBe('progress-reps')
  })

  it('increases weight after all prescribed sets reach the top', () => {
    const workout: Workout = {
      id: 'w1', date: '2026-09-01', title: 'Upper', sets: [
        { id: '1', exerciseId: bench.id, weight: 70, reps: 10 },
        { id: '2', exerciseId: bench.id, weight: 70, reps: 10 },
        { id: '3', exerciseId: bench.id, weight: 70, reps: 10 },
      ],
    }
    expect(recommendNext(bench, [workout]).weight).toBe(75)
  })

  it('ignores optional timing and RIR when they are missing', () => {
    const workout: Workout = {
      id: 'w1', date: '2026-09-01', title: 'Upper', sets: [
        { id: '1', exerciseId: bench.id, weight: 70, reps: 8 },
      ],
    }
    expect(() => recommendNext(bench, [workout])).not.toThrow()
  })
})
