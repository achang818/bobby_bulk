import { describe, expect, it } from 'vitest'
import { exercises } from '../domain/exercises'
import { defaultPreferences } from '../domain/preferences'
import { generateRecommendedWorkout } from '../domain/recommended-workout'
import { createWorkoutSession } from '../domain/workout-session'
import type { TodaysContext, UserPreferences, Workout, WorkoutTemplate } from '../domain/models'

const asOf = '2026-09-12'
const context = (overrides: Partial<TodaysContext> = {}): TodaysContext => ({ gymId: 'default-gym', unavailableEquipment: [], ...overrides })
const preferences = (overrides: Partial<UserPreferences> = {}): UserPreferences => ({ ...defaultPreferences, goals: ['Build muscle'], ...overrides })
const generated = (overrides: Partial<Parameters<typeof generateRecommendedWorkout>[0]> = {}) => generateRecommendedWorkout({ exercises, history: [], preferences: preferences(), todaysContext: context(), asOf, ...overrides })

const latsSession = (date = asOf): Workout => ({
  id: `lats-${date}`,
  date,
  title: 'Pull',
  status: 'completed',
  sets: [{ id: 'lat-set', exerciseId: 'lat-pulldown', setType: 'working', weight: 100, reps: 8 }],
})

const session = (id: string, date: string, exerciseId: string, reps = 8, workingSets = 1): Workout => ({
  id,
  date,
  title: 'Test',
  status: 'completed',
  sets: Array.from({ length: workingSets }, (_, index) => ({ id: `${id}-set-${index}`, exerciseId, setType: 'working' as const, weight: 100, reps })),
})

describe('Recommended Workout generation', () => {
  it('builds a complete session when abs is the only priority below its frequency guidance', () => {
    const history = ['2026-09-05', '2026-09-09'].flatMap((date) => [
      session(`abs-${date}`, date, 'crunch-machine', 10, 3),
      session(`chest-${date}`, date, 'incline-db-bench', 8, 3),
      session(`delts-${date}`, date, 'db-lateral-raise', 12, 3),
    ])
    history.push(session('lats', '2026-09-07', 'lat-pulldown', 8, 20),
      session('biceps', '2026-09-07', 'dumbbell-curl', 8, 3),
      session('rear-delts', '2026-09-07', exercises.find((exercise) => exercise.primaryMuscles.includes('Rear delts'))!.id),
      session('mid-back', '2026-09-07', 'cable-row', 8, 3))
    const input = { history, preferences: preferences({ goals: ['Aesthetic physique'], priorities: ['Abs', 'Upper chest', 'Side delts'] }) }
    const normal = generated(input)
    const selected = normal.workout.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)!)

    expect(normal.targetMuscles[0]).toBe('Abs')
    expect(normal.workout.plannedExercises!.length).toBeGreaterThanOrEqual(3)
    expect(selected.some((exercise) => exercise.primaryMuscles.includes('Abs'))).toBe(true)
    expect(selected.some((exercise) => !exercise.primaryMuscles.includes('Abs'))).toBe(true)
    expect(selected.some((exercise) => exercise.primaryMuscles.includes('Lats'))).toBe(false)
    expect(normal.sessionNote).toBeUndefined()
    expect(normal.reasons.some((reason) => reason.includes('beyond your priority muscles'))).toBe(true)
    const short = generated({ ...input, todaysContext: context({ availableMinutes: 10 }) })
    expect(short.workout.plannedExercises).toHaveLength(1)
    expect(short.targetMuscles).toEqual(['Abs'])
    expect(short.sessionNote).toContain('10-minute limit')
    expect(short.reasons.some((reason) => reason.includes('beyond your priority muscles'))).toBe(false)
    expect(short.workout.plannedExercises![0].loadRecommendation).toBeDefined()
    expect(createWorkoutSession(normal.workout).plannedExercises).toEqual(normal.workout.plannedExercises)
  })

  it('completes a session for a single partial priority without requiring a full muscle ranking', () => {
    const recommendation = generated({ preferences: preferences({ priorities: ['Abs'] }) })
    expect(recommendation.workout.exerciseIds.length).toBeGreaterThanOrEqual(3)
    expect(recommendation.targetMuscles[0]).toBe('Abs')
    expect(recommendation.targetMuscles.some((muscle) => muscle !== 'Abs')).toBe(true)
  })

  it('allows suitable met-frequency muscles with less emphasis instead of banning them', () => {
    const lats = exercises.find((exercise) => exercise.id === 'lat-pulldown')!
    const recommendation = generated({ exercises: [lats],
      preferences: preferences({ priorities: ['Lats'] }),
      history: [latsSession('2026-09-08'), latsSession('2026-09-09'), latsSession('2026-09-10')],
    })
    expect(recommendation.workout.exerciseIds).toEqual([lats.id])
    expect(recommendation.workout.plannedExercises![0].sets).toBeLessThanOrEqual(lats.defaultSets)
    expect(recommendation.reasons.some((reason) => reason.includes('met its recent frequency guidance'))).toBe(true)
  })

  it('does not pad limited choices with redundant variations or blame a generous time limit', () => {
    const crunch = exercises.find((exercise) => exercise.id === 'crunch-machine')!
    const recommendation = generated({ exercises: [crunch, { ...crunch, id: 'another-crunch', name: 'Another crunch' }],
      preferences: preferences({ priorities: ['Abs'] }), todaysContext: context({ availableMinutes: 60 }),
    })
    expect(recommendation.workout.exerciseIds).toHaveLength(1)
    expect(recommendation.sessionNote).toContain('Only 1 suitable movement')
    expect(recommendation.sessionNote).not.toContain('minute limit')
  })

  it.each(['2026-09-12', '2026-09-11'])('does not bypass recent work on %s when adding broader movements', (date) => {
    const lats = exercises.find((exercise) => exercise.id === 'lat-pulldown')!
    const recommendation = generated({ exercises: [lats], history: [latsSession(date)] })
    expect(recommendation.workout.exerciseIds).toEqual([])
    expect(recommendation.sessionNote).toContain('Only 0 suitable movements')
  })

  it('checks every primary muscle before adding a compound for broader coverage', () => {
    const mixed = { ...exercises[0], id: 'mixed-primary', primaryMuscles: ['Upper chest', 'Lats'] }
    const lats = exercises.find((exercise) => exercise.id === 'lat-pulldown')!
    const recommendation = generated({ exercises: [mixed, lats], history: [latsSession()], preferences: preferences({ priorities: ['Upper chest'] }) })
    expect(recommendation.workout.exerciseIds).toEqual([])
  })

  it('honors exclusions and equipment limits in broader selection, not just priority work', () => {
    const crunch = exercises.find((exercise) => exercise.id === 'crunch-machine')!
    const bench = exercises[0]
    const leg = exercises.find((exercise) => exercise.id === 'leg-press')!
    const recommendation = generated({ exercises: [crunch, bench, leg],
      preferences: preferences({ priorities: ['Abs'], excludedExerciseIds: [leg.id] }),
      todaysContext: context({ unavailableEquipment: ['dumbbells'] }),
    })
    expect(recommendation.workout.exerciseIds).toEqual([crunch.id])
    expect(recommendation.sessionNote).toBeDefined()
  })

  it('does not exceed a time budget too small for one working set and transition', () => {
    const recommendation = generated({ todaysContext: context({ availableMinutes: 3 }) })
    expect(recommendation.workout.exerciseIds).toEqual([])
    expect(recommendation.sessionNote).toContain('3-minute limit')
  })

  it('works without a user-created plan or split and returns an executable session', () => {
    const recommendation = generated()
    const session = createWorkoutSession(recommendation.workout)

    expect(recommendation.authority).toBe('recommended')
    expect(recommendation.workout.planningAuthority).toBe('recommended')
    expect(recommendation.workout.plannedExercises).not.toHaveLength(0)
    expect(session.planningAuthority).toBe('recommended')
    expect(session.plannedExercises).toEqual(recommendation.workout.plannedExercises)
    expect(session.plannedExercises?.every((exercise) => exercise.setType === 'working' && exercise.sets > 0)).toBe(true)
  })

  it('uses the highest explicit muscle priority before goal-derived defaults', () => {
    const recommendation = generated({ preferences: preferences({ goals: ['Aesthetic physique'], priorities: ['Abs'] }) })
    const selected = recommendation.workout.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)!)

    expect(recommendation.targetMuscles[0]).toBe('Abs')
    expect(selected.some((exercise) => exercise.primaryMuscles.includes('Abs'))).toBe(true)
  })

  it('uses goal-derived priorities when the user has not supplied a ranking', () => {
    const recommendation = generated({ preferences: preferences({ goals: ['Aesthetic physique'], priorities: [] }) })

    expect(recommendation.targetMuscles).toContain('Side delts')
  })

  it('does not target a muscle again when it has direct working work today', () => {
    const recommendation = generated({ history: [latsSession()], preferences: preferences({ priorities: ['Lats'] }) })

    expect(recommendation.targetMuscles).not.toContain('Lats')
    expect(recommendation.reasons.some((reason) => reason.includes('Lats is an explicit priority'))).toBe(false)
  })

  it('deprioritizes a high-priority muscle after it has met recent direct opportunities', () => {
    const latsHistory = [
      latsSession('2026-09-09'),
      latsSession('2026-09-10'),
      latsSession('2026-09-11'),
    ]
    const recommendation = generated({ history: latsHistory, preferences: preferences({ priorities: ['Lats', 'Upper chest'] }) })

    expect(recommendation.targetMuscles).not.toContain('Lats')
    expect(recommendation.targetMuscles).toContain('Upper chest')
  })

  it('changes emphasis for otherwise identical users with different direct-work history', () => {
    const preferenceInput = preferences({ priorities: ['Lats', 'Upper chest'] })
    const neglected = generated({ preferences: preferenceInput })
    const recentlyServed = generated({
      preferences: preferenceInput,
      history: [latsSession('2026-09-09'), latsSession('2026-09-10'), latsSession('2026-09-11')],
    })

    expect(neglected.targetMuscles).toContain('Lats')
    expect(recentlyServed.targetMuscles).not.toContain('Lats')
    expect(recentlyServed.targetMuscles).toContain('Upper chest')
  })

  it('keeps limited history conservative instead of treating one session as a complete weekly picture', () => {
    const recommendation = generated({ history: [latsSession('2026-09-10')], preferences: preferences({ priorities: ['Lats'] }) })

    expect(recommendation.targetMuscles).toContain('Lats')
    expect(recommendation.reasons.some((reason) => reason.includes('direct history is limited'))).toBe(true)
  })

  it('adds direct isolation when a compound leaves a lower-priority muscle with meaningful remaining need', () => {
    const recommendation = generated({ preferences: preferences({ priorities: ['Lats', 'Biceps', 'Abs'] }), todaysContext: context({ unavailableEquipment: ['pull-up-bar'] }) })
    const selected = recommendation.workout.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)!)

    expect(selected.some((exercise) => exercise.type === 'compound' && exercise.secondaryMuscles.includes('Biceps'))).toBe(true)
    expect(selected.some((exercise) => exercise.type === 'isolation' && exercise.primaryMuscles.includes('Biceps'))).toBe(true)
    expect(recommendation.reasons.some((reason) => reason.includes('supporting Biceps work'))).toBe(true)
  })

  it('can omit lower-priority isolation when supporting work and recent direct workload cover its remaining allocation', () => {
    const bicepsHistory = [session('curl-a', '2026-09-10', 'dumbbell-curl', 8, 6)]
    const recommendation = generated({ history: bicepsHistory, preferences: preferences({ priorities: ['Lats', 'Biceps'] }), todaysContext: context({ unavailableEquipment: ['pull-up-bar'] }) })
    const selected = recommendation.workout.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)!)

    expect(selected.some((exercise) => exercise.type === 'compound' && exercise.secondaryMuscles.includes('Biceps'))).toBe(true)
    expect(selected.some((exercise) => exercise.primaryMuscles.includes('Biceps'))).toBe(false)
    expect(recommendation.reasons.some((reason) => reason.includes('Biceps already has sufficient supporting work'))).toBe(true)
  })

  it('allows a top priority to receive complementary direct exercises without repeating the same role', () => {
    const recommendation = generated({ preferences: preferences({ priorities: ['Upper chest'] }) })
    const selected = recommendation.workout.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)!)
    const upperChest = selected.filter((exercise) => exercise.primaryMuscles.includes('Upper chest'))

    expect(upperChest).toHaveLength(2)
    expect(new Set(upperChest.map((exercise) => exercise.type)).size).toBeGreaterThan(1)
    expect(upperChest.map((exercise) => exercise.id)).not.toEqual(expect.arrayContaining(['incline-db-bench', 'incline-barbell-bench']))
  })

  it('uses short sessions for efficient compound coverage and adds a curl when additional time permits', () => {
    const input = { preferences: preferences({ priorities: ['Lats', 'Biceps'] }), todaysContext: context({ unavailableEquipment: ['pull-up-bar'] }) }
    const short = generated({ ...input, todaysContext: context({ unavailableEquipment: ['pull-up-bar'], availableMinutes: 10 }) })
    const longer = generated(input)
    const hasBicepsIsolation = (recommendation: ReturnType<typeof generateRecommendedWorkout>) => recommendation.workout.exerciseIds
      .map((id) => exercises.find((exercise) => exercise.id === id)!)
      .some((exercise) => exercise.type === 'isolation' && exercise.primaryMuscles.includes('Biceps'))

    expect(short.workout.plannedExercises).toHaveLength(1)
    expect(short.workout.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)!).some((exercise) => exercise.type === 'compound' && exercise.secondaryMuscles.includes('Biceps'))).toBe(true)
    expect(hasBicepsIsolation(short)).toBe(false)
    expect(hasBicepsIsolation(longer)).toBe(true)
  })

  it('favors a progressing exercise instead of rotating away from useful continuity', () => {
    const recommendation = generated({
      history: [session('row-a', '2026-09-04', 'cable-row', 8), session('row-b', '2026-09-08', 'cable-row', 9)],
      preferences: preferences({ priorities: ['Mid back'] }),
    })

    expect(recommendation.workout.exerciseIds).toContain('cable-row')
    expect(recommendation.reasons.some((reason) => reason.includes('Kept Seated Cable Row because its recent working-set performance is progressing.'))).toBe(true)
  })

  it('allocates more working sets to a justified highest-priority direct target', () => {
    const recommendation = generated({ preferences: preferences({ priorities: ['Lats'] }) })
    const planned = recommendation.workout.plannedExercises?.find((exercise) => exercises.find((item) => item.id === exercise.exerciseId)?.primaryMuscles.includes('Lats'))

    expect(planned?.sets).toBeGreaterThan(exercises.find((exercise) => exercise.id === planned?.exerciseId)!.defaultSets)
  })

  it('respects unavailable equipment and hard exercise exclusions', () => {
    const recommendation = generated({
      preferences: preferences({ priorities: ['Lats'], excludedExerciseIds: ['lat-pulldown'] }),
      todaysContext: context({ unavailableEquipment: ['cables'] }),
    })
    const selected = recommendation.workout.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)!)

    expect(recommendation.workout.exerciseIds).not.toContain('lat-pulldown')
    expect(selected.every((exercise) => exercise.equipment !== 'Cable machine')).toBe(true)
  })

  it('reduces the generated workout to the available time without rotating exercises', () => {
    const recommendation = generated({ todaysContext: context({ availableMinutes: 10 }) })
    const estimatedMinutes = (recommendation.workout.plannedExercises ?? []).reduce((total, exercise) => total + exercise.sets * 3 + 2, 0)

    expect(recommendation.workout.plannedExercises).toHaveLength(1)
    expect(estimatedMinutes).toBeLessThanOrEqual(10)
  })

  it('does not mutate a user-owned plan while generating a recommendation', () => {
    const userPlan: WorkoutTemplate = {
      id: 'user-plan', name: 'My Push', description: '', focus: 'Push', planningAuthority: 'user-plan', exerciseIds: ['barbell-bench-press'],
    }
    const original = structuredClone(userPlan)

    generated({ preferences: preferences({ priorities: ['Lats'] }) })

    expect(userPlan).toEqual(original)
  })

  it('is deterministic for identical inputs', () => {
    const input = { history: [latsSession('2026-09-09')], preferences: preferences({ priorities: ['Lats', 'Abs'] }), todaysContext: context({ availableMinutes: 24 }), asOf }

    expect(generated(input)).toEqual(generated(input))
  })
})
