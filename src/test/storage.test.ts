import { describe, expect, it } from 'vitest'
import { mergeWorkoutSessions } from '../domain/storage'
import type { Workout } from '../domain/models'

const workout = (id: string, date: string, title: string, exerciseId: string): Workout => ({
  id, date, title, unit: 'lb', status: 'completed',
  sets: [{ id: `${id}-set`, exerciseId, setType: 'working', weight: 100, reps: 8 }],
})

describe('workout history normalization', () => {
  it('merges same-day sessions with the same workout title', () => {
    const merged = mergeWorkoutSessions([
      workout('push-main', '2026-08-14', 'Push', 'barbell-bench-press'),
      workout('push-calisthenics', '2026-08-14', 'Push', 'assisted-dips'),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].sets).toHaveLength(2)
  })

  it('keeps different dates or workout titles separate', () => {
    const merged = mergeWorkoutSessions([
      workout('push', '2026-08-14', 'Push', 'barbell-bench-press'),
      workout('pull', '2026-08-14', 'Pull', 'lat-pulldown'),
      workout('later-push', '2026-08-15', 'Push', 'barbell-bench-press'),
    ])
    expect(merged).toHaveLength(3)
  })
})