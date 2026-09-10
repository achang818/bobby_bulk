import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearActiveWorkoutSession, deleteProgram, deleteSplit, loadActiveWorkoutSession, loadPrograms, loadSplits, loadWorkouts, mergeWorkoutSessions, persistWorkouts, saveActiveWorkoutSession, saveProgram, saveSplit, saveWorkout } from '../domain/storage'
import type { Program, Split, Workout, WorkoutSession } from '../domain/models'

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

const storage = new Map<string, string>()
beforeEach(() => {
  storage.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  })
})

describe('program and split storage', () => {
  it('round-trips valid program/split records and can delete them', () => {
    localStorage.clear()
    const split: Split = { id: 'split-1', name: 'Upper / lower', workoutIds: ['upper', 'lower'] }
    const program: Program = { id: 'program-1', name: 'Strength block', splitId: split.id }
    expect(saveSplit(split)).toEqual([split])
    expect(saveProgram(program)).toEqual([program])
    expect(loadSplits()).toEqual([split])
    expect(loadPrograms()).toEqual([program])
    expect(deleteSplit(split.id)).toEqual([])
    expect(deleteProgram(program.id)).toEqual([])
  })

  it('ignores malformed persisted program/split data', () => {
    localStorage.setItem('bobby-bulk-splits', JSON.stringify([{ id: 'bad', name: 'Bad', workoutIds: [7] }]))
    localStorage.setItem('bobby-bulk-programs', JSON.stringify([{ id: 'bad', name: 'Bad' }]))
    expect(loadSplits()).toEqual([])
    expect(loadPrograms()).toEqual([])
  })
})

describe('workout persistence', () => {
  it('reloads completed workouts and never duplicates a saved session', () => {
    const completed = workout('completed', '2026-09-10', 'Pull', 'lat-pulldown')
    saveWorkout(completed, [])
    saveWorkout(completed)
    expect(loadWorkouts()).toHaveLength(1)
    expect(loadWorkouts()[0]).toMatchObject({ id: 'completed', status: 'completed', sets: completed.sets })
  })

  it('recovers completed history from its backup when the primary value is malformed', () => {
    const completed = workout('backup', '2026-09-10', 'Pull', 'lat-pulldown')
    persistWorkouts([completed])
    localStorage.setItem('bobby-bulk-workouts', '{not valid json')
    expect(loadWorkouts()).toMatchObject([{ id: 'backup', sets: completed.sets }])
    expect(localStorage.getItem('bobby-bulk-workouts')).toContain('backup')
  })

  it('restores in-progress logger sets after a restart and clears them only when finished', () => {
    const active: WorkoutSession = { id: 'active', workoutId: 'pull', date: '2026-09-10', title: 'Pull', status: 'in-progress', plannedExercises: [{ exerciseId: 'lat-pulldown', order: 0, sets: 3, repRange: { min: 8, max: 12 }, setType: 'working' }], sets: [{ id: 'set', exerciseId: 'lat-pulldown', setType: 'working', weight: 160, reps: 8 }] }
    saveActiveWorkoutSession(active)
    expect(loadActiveWorkoutSession()).toMatchObject(active)
    clearActiveWorkoutSession()
    expect(loadActiveWorkoutSession()).toBeNull()
  })
})
