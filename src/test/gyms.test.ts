import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exercises } from '../domain/exercises'
import { availableExerciseEquipment, exerciseEquipmentOptions, isExerciseAvailable } from '../domain/equipment'
import { contextForGym, defaultGym, normalizeGyms } from '../domain/gyms'
import { defaultPreferences } from '../domain/preferences'
import { generateRecommendedWorkout } from '../domain/recommended-workout'
import { generateRecommendations } from '../domain/recommendations'
import { captureSessionGym, createWorkoutSession, createWorkoutSessionForToday, sessionLoadInput } from '../domain/workout-session'
import { loadActiveWorkoutSession, loadGyms, saveActiveWorkoutSession, saveGyms } from '../domain/storage'
import type { Gym, TodaysContext, Workout, WorkoutTemplate } from '../domain/models'

const home: Gym = { id: 'home', name: 'Home', equipment: ['dumbbells'] }
const context = (gym: Gym = home, outages: TodaysContext['unavailableEquipment'] = []) => contextForGym({ gymId: gym.id, unavailableEquipment: outages }, gym)
const find = (id: string) => exercises.find((exercise) => exercise.id === id)!
const asOf = '2026-09-16'
const generate = (gym = home, history: Workout[] = []) => generateRecommendedWorkout({ exercises, history, preferences: { ...defaultPreferences, priorities: ['Biceps'] }, todaysContext: context(gym), asOf })
const plan: WorkoutTemplate = { id: 'pull', name: 'Pull', description: '', focus: 'Pull', exerciseIds: ['cable-row', 'cable-lateral-raise', 'triceps-pushdown'] }

describe('gym equipment eligibility', () => {
  it('does not suggest unavailable machines, cables, barbells, or bench setups at home', () => {
    const result = generate()
    expect(result.workout.exerciseIds.length).toBeGreaterThanOrEqual(3)
    for (const id of ['cable-row', 'lat-pulldown', 'incline-db-bench', 'barbell-back-squat', 'bulgarian-split-squat']) expect(result.workout.exerciseIds).not.toContain(id)
    for (const id of result.workout.exerciseIds) {
      const exercise = find(id)
      expect(exerciseEquipmentOptions(exercise).some((option) => option.every((tag) => ['dumbbells', 'bodyweight'].includes(tag)))).toBe(true)
      expect(/bench|incline|chest.supported/i.test(exercise.name)).toBe(false)
    }
  })

  it.each(['incline-db-bench', 'bulgarian-split-squat', 'chest-supported-row'])('requires bench support for %s and respects temporary bench outages', (id) => {
    const bench = find(id)
    expect(isExerciseAvailable(bench, context())).toBe(false)
    const equipped = { ...home, equipment: ['dumbbells', 'benches'] as Gym['equipment'] }
    expect(isExerciseAvailable(bench, context(equipped))).toBe(true)
    expect(isExerciseAvailable(bench, context(equipped, ['benches']))).toBe(false)
  })

  it('supports any complete equipment alternative without assuming unknown accessories', () => {
    const alternative = { ...find('dumbbell-curl'), equipment: 'Barbell or dumbbells' }
    expect(availableExerciseEquipment(alternative, context())).toBe('dumbbells')
    expect(availableExerciseEquipment(alternative, { availableEquipment: ['barbells'], unavailableEquipment: ['dumbbells'] })).toBe('barbells')
    expect(isExerciseAvailable(alternative, context(home, ['dumbbells']))).toBe(false)
    expect(isExerciseAvailable(find('dips'), context())).toBe(false)
  })

  it('does not mistake a self-contained machine press for a separate bench requirement', () => {
    const machine = { ...find('incline-db-bench'), equipment: 'Machine' }
    expect(isExerciseAvailable(machine, { availableEquipment: ['machines'] })).toBe(true)
  })

  it('allows bodyweight work at a gym with no equipment, unless unavailable today', () => {
    expect(isExerciseAvailable(find('push-up'), { availableEquipment: [] })).toBe(true)
    expect(isExerciseAvailable(find('push-up'), { availableEquipment: [], unavailableEquipment: ['bodyweight'] })).toBe(false)
    expect(generate({ id: 'none', name: 'No equipment', equipment: [] }).workout.exerciseIds.length).toBeGreaterThan(0)
  })

  it('keeps outages separate from the inventory and resets them when selecting another gym', () => {
    const original = structuredClone(home)
    expect(context(home, ['dumbbells']).availableEquipment).toEqual(['dumbbells'])
    expect(contextForGym(context(home, ['dumbbells']), defaultGym).unavailableEquipment).toEqual([])
    expect(contextForGym(context(home, ['dumbbells']), { ...home, equipment: [] }).unavailableEquipment).toEqual([])
    expect(home).toEqual(original)
  })
})

describe('gym-aware user-plan coaching', () => {
  it('adapts every unavailable slot even at the default gym and preserves the saved plan', () => {
    const before = structuredClone(plan)
    const gym = { ...home, id: 'default-gym' }
    const recommendations = generateRecommendations({ plan, exercises, history: [], preferences: defaultPreferences, todaysContext: context(gym), asOf })
    const adaptations = recommendations.filter((item) => item.trace.ruleId === 'adapt-unavailable-equipment')
    expect(adaptations).toHaveLength(3)
    const session = createWorkoutSessionForToday(plan, adaptations, exercises, 'lb')
    expect(session.plannedExercises?.every((slot) => isExerciseAvailable(find(slot.exerciseId), context(gym)))).toBe(true)
    expect(new Set(session.plannedExercises?.map((slot) => slot.exerciseId)).size).toBe(session.plannedExercises?.length)
    expect(plan).toEqual(before)
  })

  it('explains a session-only omission when there is no suitable substitute', () => {
    const original = find('cable-row')
    const single = { ...plan, exerciseIds: [original.id] }
    const recommendations = generateRecommendations({ plan: single, exercises: [original], history: [], preferences: defaultPreferences, todaysContext: context(), asOf })
    expect(recommendations).toHaveLength(1)
    expect(recommendations[0]).toMatchObject({ type: 'REMOVE', reason: expect.stringContaining('No suitable replacement') })
    expect(createWorkoutSessionForToday(single, recommendations, [original], 'lb').plannedExercises).toEqual([])
    expect(single.exerciseIds).toEqual([original.id])
  })

  it('uses available alternatives for priority additions rather than suggesting a machine', () => {
    const recommendations = generateRecommendations({ plan: { ...plan, exerciseIds: [] }, exercises, history: [], preferences: { ...defaultPreferences, priorities: ['Lats', 'Upper chest', 'Biceps'] }, todaysContext: context(), asOf })
    const additions = recommendations.filter((item) => item.change.kind === 'add')
    expect(additions.length).toBeGreaterThan(0)
    for (const item of additions) if (item.change.kind === 'add') expect(isExerciseAvailable(find(item.change.exerciseId), context())).toBe(true)
  })
})

describe('profile validation without weight inventories', () => {
  it('discards legacy weight lists while preserving valid gym equipment', () => {
    expect(normalizeGyms(null)).toEqual([])
    expect(normalizeGyms([null, {}, { ...home, name: ' ' }])).toEqual([])
    expect(normalizeGyms([{ ...home, availableLoads: [{ equipment: 'dumbbells', increments: [10, 15] }] }])).toEqual([home])
  })

  it('suggests loads from history without legacy gym caps', () => {
    const curl = find('dumbbell-curl')
    const history: Workout[] = [{ id: 'old', title: 'Curls', date: '2026-09-10', unit: 'lb', sets: Array.from({ length: 5 }, (_, i) => ({ id: String(i), exerciseId: curl.id, setType: 'working', weight: 20, reps: curl.repRange.max })) }]
    const gym = normalizeGyms([{ ...home, availableLoads: [{ equipment: 'dumbbells', increments: [10, 15] }] }])[0]
    expect(generate(gym, history).workout.plannedExercises!.find((slot) => slot.exerciseId === curl.id)!.loadRecommendation).toMatchObject({ kind: 'target', weight: 22.5, unit: 'lb' })
  })
})

describe('gym and active-session persistence', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  })

  it('round-trips new profiles and edited equipment', () => {
    saveGyms([home, defaultGym])
    expect(loadGyms()[0]).toEqual(home)
    const edited: Gym = { ...home, name: 'Home studio', equipment: ['dumbbells', 'benches'] }
    saveGyms([edited, defaultGym])
    expect(loadGyms()[0]).toEqual(edited)
    localStorage.setItem('bobby-bulk-gyms', 'broken JSON')
    expect(loadGyms()).toEqual([])
  })

  it('freezes equipment, outages, and prescriptions independently of later gym edits', () => {
    const gym = structuredClone(home)
    const generated = generate(gym).workout
    const session = captureSessionGym(createWorkoutSession(generated, undefined, 'lb'), gym, context(gym))
    session.adaptationNotes = ['A session-only adjustment.']
    const before = structuredClone(session)
    gym.name = 'Changed'
    gym.equipment = ['machines']
    saveGyms([gym])
    saveActiveWorkoutSession(session)
    expect(loadActiveWorkoutSession()).toEqual(before)
    expect(sessionLoadInput(loadActiveWorkoutSession()!, session.plannedExercises![0].exerciseId, 'lb')).toBe('')
  })
})
