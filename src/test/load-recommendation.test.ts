import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exercises } from '../domain/exercises'
import { recommendExerciseLoad } from '../domain/load-recommendation'
import { defaultPreferences } from '../domain/preferences'
import { generateRecommendedWorkout } from '../domain/recommended-workout'
import { loadActiveWorkoutSession, loadWorkouts, saveActiveWorkoutSession, saveWorkout } from '../domain/storage'
import { analyzeWorkoutSession } from '../domain/workout-analysis'
import { completeWorkoutSession, createPlannedExercise, createWorkoutSession, sessionLoadInput } from '../domain/workout-session'
import { convertWeight, displayWeight } from '../domain/units'
import type { AvailableLoad, LoggedSet, WeightUnit, Workout } from '../domain/models'

const bench = exercises[0]
const planned = createPlannedExercise(bench.id, 0, bench)
const asOf = '2026-09-14'
const loads: AvailableLoad[] = [{ equipment: 'dumbbells', unit: 'lb', increments: [75, 60, 70, 65] }]
const history = (weight = 65, reps = 10, count = 3): Workout => ({
  id: 'previous', date: '2026-09-07', title: 'Upper', status: 'completed', unit: 'lb',
  sets: Array.from({ length: count }, (_, index) => ({ id: String(index), exerciseId: bench.id, setType: 'working', weight, reps })),
})
const recommend = (workouts = [history()], available: AvailableLoad[] | undefined = loads, unit: WeightUnit = 'lb') => recommendExerciseLoad(bench, planned, workouts, available, unit, asOf)

describe('generated exercise load targets', () => {
  it('uses the next actual gym weight, even when its list is unsorted', () => {
    expect(recommend()).toMatchObject({ kind: 'target', weight: 70, unit: 'lb', action: 'increase-weight' })
    expect(loads[0].increments).toEqual([75, 60, 70, 65])
  })

  it('holds demonstrated weight below the rep ceiling or with incomplete sets', () => {
    expect(recommend([history(65, 8)])).toMatchObject({ weight: 65, action: 'progress-reps' })
    expect(recommend([history(65, 10, 2)])).toMatchObject({ weight: 65, action: 'progress-reps' })
  })

  it('keeps the existing RIR priority over RPE and avoids increases near failure', () => {
    const nearFailure = history()
    nearFailure.sets = nearFailure.sets.map((set) => ({ ...set, rir: 0 }))
    expect(recommend([nearFailure])).toMatchObject({ weight: 65, action: 'progress-reps', confidence: 'low' })
    nearFailure.sets = nearFailure.sets.map((set) => ({ ...set, rir: 3, rpe: 9 }))
    expect(recommend([nearFailure])).toMatchObject({ weight: 70, action: 'increase-weight', confidence: 'high' })
  })

  it('truthfully holds at the equipment ceiling', () => {
    expect(recommend([history(75)])).toMatchObject({ weight: 75, action: 'progress-reps', reason: expect.stringContaining('No heavier load') })
  })

  it('uses a lighter available weight when the demonstrated hold weight is unavailable', () => {
    expect(recommend([history(67.5, 8)])).toMatchObject({ weight: 65, action: 'progress-reps', confidence: 'low', reason: expect.stringContaining('lighter available') })
    expect(recommend([history(50, 8)])).toMatchObject({ kind: 'choose-load', reason: expect.stringContaining('No available weight') })
  })

  it('treats empty or invalid equipment lists as unavailable, not permission to invent a load', () => {
    expect(recommend([history()], [{ equipment: 'dumbbells', increments: [] }]).kind).toBe('choose-load')
    expect(recommend([history()], [{ equipment: 'dumbbells', increments: [NaN, -1, Infinity] }]).kind).toBe('choose-load')
  })

  it('converts raw history and gym profiles without changing the physical target', () => {
    const kgHistory = { ...history(), unit: 'kg' as const, sets: history().sets.map((set) => ({ ...set, weight: convertWeight(65, 'lb', 'kg') })) }
    expect(recommend([kgHistory])).toMatchObject({ weight: 70, unit: 'lb' })
    expect(recommend([history(), kgHistory], loads, 'kg')).toMatchObject({ weight: 31.8, unit: 'kg' })
    const kgLoads: AvailableLoad[] = [{ equipment: 'dumbbells', unit: 'kg', increments: [30, 32, 34] }]
    expect(recommend([{ ...history(30, 10), unit: 'kg' }], kgLoads, 'kg')).toMatchObject({ weight: 32, unit: 'kg' })
    expect(recommend([{ ...history(30, 10), unit: 'kg' }], kgLoads, 'lb')).toMatchObject({ weight: 70.5, unit: 'lb' })
  })

  it('keeps legacy gym lists in pounds when the display unit changes', () => {
    expect(recommend([history()], [{ equipment: 'dumbbells', increments: [65, 70] }], 'kg')).toMatchObject({ weight: 31.8, unit: 'kg' })
  })

  it('keeps the fallback increment physically consistent across units without a gym list', () => {
    const pounds = recommendExerciseLoad(bench, planned, [history()], undefined, 'lb', asOf)
    const kilos = recommendExerciseLoad(bench, planned, [history()], undefined, 'kg', asOf)
    expect(pounds).toMatchObject({ weight: 70 })
    expect(kilos).toMatchObject({ weight: 31.8 })
  })

  it('leaves a starting weight unknown without usable history', () => {
    const target = recommend([])
    expect(target).toMatchObject({ kind: 'choose-load' })
    expect(target).not.toHaveProperty('weight')
    expect(recommend([history(NaN)]).kind).toBe('choose-load')
  })

  it.each(['bodyweight', 'weighted-bodyweight', 'assisted'] as const)('does not reuse %s as an external weight', (loadType) => {
    const workout = history()
    workout.sets = workout.sets.map((set) => ({ ...set, loadType }))
    expect(recommend([workout])).toMatchObject({ kind: 'choose-load' })
  })

  it('uses the latest working session by timestamp and ignores warmups, drafts, and future sessions', () => {
    const earlier = { ...history(60), id: 'earlier', completedAt: '2026-09-07T08:00:00Z' }
    const later = { ...history(65), id: 'later', completedAt: '2026-09-07T18:00:00Z' }
    const warmup = { ...history(100), id: 'warmup', date: '2026-09-12', sets: history(100).sets.map((set): LoggedSet => ({ ...set, setType: 'warm-up' })) }
    const draft = { ...history(100), status: 'in-progress' as const, date: '2026-09-13' }
    const future = { ...history(100), date: '2026-09-15' }
    expect(recommend([earlier, later, warmup, draft, future])).toMatchObject({ weight: 70 })
  })

  it.each(['assisted-pull-up-machine', 'assisted-dips', 'dips'])('does not interpret legacy %s logs as ordinary external weights', (exerciseId) => {
    const exercise = exercises.find((item) => item.id === exerciseId)!
    const previous = history(65, exercise.repRange.max)
    previous.sets = previous.sets.map((set) => ({ ...set, exerciseId }))
    expect(recommendExerciseLoad(exercise, createPlannedExercise(exerciseId, 0, exercise), [previous], undefined, 'lb', asOf).kind).toBe('choose-load')
  })
})

const generated = (workouts: Workout[] = [history(65, 10, 4)], availableMinutes?: number) => generateRecommendedWorkout({
  exercises: [bench], history: workouts, availableLoads: loads, asOf,
  preferences: { ...defaultPreferences, priorities: ['Upper chest'] },
  todaysContext: { gymId: 'test-gym', unavailableEquipment: [], availableMinutes },
}).workout

describe('load prescription lifecycle', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    })
  })

  it('evaluates the final time-adjusted set count', () => {
    const normal = generated([history(65, 10, 2)])
    const short = generated([history(65, 10, 2)], 10)
    expect(normal.plannedExercises?.[0]).toMatchObject({ sets: 4, loadRecommendation: { weight: 65 } })
    expect(short.plannedExercises?.[0]).toMatchObject({ sets: 2, loadRecommendation: { weight: 70 } })
  })

  it('preserves the preview target through starting, reload, completion, and edited history review', () => {
    const preview = generated()
    const session = createWorkoutSession(preview, undefined, 'lb')
    expect(session.planningAuthority).toBe('recommended')
    expect(sessionLoadInput(session, bench.id, 'lb')).toBe('70')
    const target = preview.plannedExercises![0].loadRecommendation!
    expect(session.plannedExercises![0].loadRecommendation).not.toBe(target)
    target.reason = 'Changed preview'
    saveActiveWorkoutSession(session)
    const resumed = loadActiveWorkoutSession()!
    expect(sessionLoadInput(resumed, bench.id, 'lb')).toBe('70')
    expect(sessionLoadInput(resumed, bench.id, 'kg')).toBe(String(displayWeight(70, 'lb', 'kg')))
    // A user chooses a different actual load. It survives resume without rewriting the target.
    resumed.sets = history(60, 8, 1).sets
    saveActiveWorkoutSession(resumed)
    expect(sessionLoadInput(loadActiveWorkoutSession()!, bench.id, 'lb')).toBe('60')
    const completed = completeWorkoutSession(resumed)
    saveWorkout(completed, [])
    const saved = loadWorkouts()[0]
    expect(saved.plannedExercises![0].loadRecommendation).toMatchObject({ weight: 70, unit: 'lb', reason: expect.not.stringContaining('Changed preview') })
    saved.sets[0].weight = 55
    const review = analyzeWorkoutSession(saved, [history(), saved], [bench])!
    expect(review.exercises[0].loadRecommendation).toMatchObject({ weight: 70 })
    expect(saved.sets[0].weight).toBe(55)
  })

  it('keeps unknown targets empty across reload while allowing an explicitly logged zero', () => {
    const session = createWorkoutSession(generated([]), undefined, 'lb')
    saveActiveWorkoutSession(session)
    const resumed = loadActiveWorkoutSession()!
    expect(sessionLoadInput(resumed, bench.id, 'lb')).toBe('')
    resumed.sets = history(0, 8, 1).sets
    expect(sessionLoadInput(resumed, bench.id, 'lb')).toBe('0')
  })

  it('does not add generated targets to user-owned plan sessions', () => {
    const plan = { id: 'mine', name: 'My plan', focus: '', description: '', exerciseIds: [bench.id], plannedExercises: [planned] }
    const session = createWorkoutSession(plan, undefined, 'lb')
    expect(session.planningAuthority).toBe('user-plan')
    expect(sessionLoadInput(session, bench.id, 'lb')).toBeUndefined()
    expect(plan.plannedExercises[0]).not.toHaveProperty('loadRecommendation')
  })
})
