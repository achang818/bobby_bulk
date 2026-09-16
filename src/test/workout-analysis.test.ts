import { describe, expect, it } from 'vitest'
import { analyzeWorkoutSession } from '../domain/workout-analysis'
import { exercises } from '../domain/exercises'
import { defaultPreferences } from '../domain/preferences'
import { generateRecommendations } from '../domain/recommendations'
import { generateRecommendedWorkout } from '../domain/recommended-workout'
import { calculateExerciseFeatures } from '../domain/features'
import { convertWeight } from '../domain/units'
import type { LoggedSet, WorkoutSession, WorkoutTemplate } from '../domain/models'

const exercise = exercises.find((item) => item.id === 'lat-pulldown')!
const plan: WorkoutTemplate = { id: 'pull', name: 'Pull', description: '', focus: 'Lats', exerciseIds: [exercise.id], plannedExercises: [{ exerciseId: exercise.id, order: 0, sets: 3, repRange: { min: 8, max: 12 }, setType: 'working' }] }
function session(id: string, date: string, reps: number[], overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id, date, title: 'Pull', unit: 'lb', status: 'completed', planningAuthority: 'user-plan',
    completedAt: `${date}T12:00:00.000Z`, plannedExercises: structuredClone(plan.plannedExercises),
    sets: reps.map((count, index) => ({ id: `${id}-${index}`, exerciseId: exercise.id, setType: 'working', weight: 100, reps: count })),
    ...overrides,
  }
}
function analyze(current: WorkoutSession, history: WorkoutSession[] = []) { return analyzeWorkoutSession(current, history, exercises)! }
const context = { gymId: 'gym', unavailableEquipment: [] }

describe('post-workout analysis', () => {
  it('keeps completion separate from rep achievement and actual extras', () => {
    const current = session('current', '2026-09-13', [7, 7, 7, 6])
    const result = analyze(current)
    expect(result).toMatchObject({ completion: 'complete', plannedSets: 3, completedPlannedSets: 3, loggedSets: 4, workingSets: 4, extraSets: 1 })
    expect(result.exercises[0]).toMatchObject({ completedSets: 4, completion: 'below target', signal: 'baseline' })
  })

  it('does not use additional movements or warm-ups to fill missing prescribed working sets', () => {
    const current = session('partial', '2026-09-13', [10])
    current.sets.push({ id: 'warm', exerciseId: exercise.id, setType: 'warm-up', weight: 50, reps: 10 }, { id: 'extra', exerciseId: 'cable-row', setType: 'working', weight: 100, reps: 10 })
    const result = analyze(current)
    expect(result).toMatchObject({ completion: 'partial', completedPlannedSets: 1, plannedSets: 3, workingSets: 2, extraSets: 2 })
    expect(result.exercises.find((item) => item.exerciseId === 'cable-row')).toMatchObject({ completion: 'unplanned' })
    expect(result.exercises.find((item) => item.exerciseId === 'cable-row')).not.toHaveProperty('plannedSets')
  })

  it('counts prescribed warm-ups by their own type without treating them as progression', () => {
    const current = session('warm', '2026-09-13', [10, 10, 10])
    current.plannedExercises![0].setType = 'warm-up'
    current.sets = current.sets.map((set) => ({ ...set, setType: 'warm-up' }))
    expect(analyze(current)).toMatchObject({ completion: 'complete', workingSets: 0, completedPlannedSets: 3, exercises: [{ completion: 'completed', signal: 'no-working-sets' }] })
  })

  it('does not invent a prescription for legacy or ad-hoc work', () => {
    const result = analyze(session('legacy', '2026-09-13', [10], { plannedExercises: undefined, planningAuthority: undefined }))
    expect(result).toMatchObject({ completion: 'unplanned', plannedSets: 0, planningAuthority: 'user-plan' })
    expect(result.exercises[0]).toMatchObject({ completion: 'unplanned', signal: 'baseline' })
  })

  it('records improvement with the existing real-set comparison evidence', () => {
    const before = session('before', '2026-09-10', [8, 8, 8])
    const current = session('current', '2026-09-13', [10, 10, 10])
    const result = analyze(current, [before])
    expect(result.exercises[0]).toMatchObject({ signal: 'progress', progressionState: 'progressing', previousSessionId: before.id, comparison: { direction: 'improved', comparableSets: 3, improvedSets: 3 } })
    expect(result.exercises[0].comparison?.matchedSets?.every((pair) => current.sets.some((set) => set.id === pair.currentSetId))).toBe(true)
  })

  it('watches one weak session without turning it into a regression-based replacement', () => {
    const history = [session('one', '2026-09-07', [12, 12, 12]), session('two', '2026-09-10', [12, 12, 12])]
    const current = session('three', '2026-09-13', [9, 9, 9])
    const result = analyze(current, history)
    expect(result.exercises[0]).toMatchObject({ signal: 'watch', progressionState: 'stable' })
    expect(result.nextSession).toContain('single weaker session')
    expect(result.nextSession).toContain('saved plan changes only when you accept')
    const recommendations = generateRecommendations({ plan, exercises, preferences: defaultPreferences, history: [...history, current], todaysContext: context, authority: 'user-plan' })
    expect(recommendations.some((item) => item.type === 'REPLACE' && item.target.kind === 'exercise' && item.target.exerciseId === exercise.id)).toBe(false)
    expect(recommendations.some((item) => item.type === 'KEEP' && item.target.kind === 'exercise' && item.target.exerciseId === exercise.id)).toBe(true)
  })

  it('uses the same repeated-decline state as the next recommendation evaluation', () => {
    const history = [session('one', '2026-09-07', [12, 12, 12]), session('two', '2026-09-10', [10, 10, 10])]
    const current = session('three', '2026-09-13', [8, 8, 8])
    const result = analyze(current, history)
    expect(result.exercises[0]).toMatchObject({ signal: 'watch', progressionState: 'regressing' })
    expect(calculateExerciseFeatures(exercise, [...history, current]).progressionState).toBe(result.exercises[0].progressionState)
    expect(result.exercises[0].message).toContain('Two consecutive')
  })

  it('does not report deliberately fewer prescribed sets as worse performance', () => {
    const before = session('before', '2026-09-10', [10, 10, 10])
    const current = session('current', '2026-09-13', [10, 10])
    current.plannedExercises![0].sets = 2
    const result = analyze(current, [before])
    expect(result).toMatchObject({ completion: 'complete', plannedSets: 2, completedPlannedSets: 2 })
    expect(result.exercises[0]).toMatchObject({ completion: 'completed', signal: 'steady', comparison: { direction: 'unchanged' } })
  })

  it('keeps missing sets separate from a decline in demonstrated performance', () => {
    const history = [session('before', '2026-09-07', [10, 10, 10]), session('partial', '2026-09-10', [10, 10])]
    const current = session('current', '2026-09-13', [10])
    const result = analyze(current, history)
    expect(result.completion).toBe('partial')
    expect(result.exercises[0]).toMatchObject({ signal: 'steady', comparison: { direction: 'unchanged' } })
    expect(calculateExerciseFeatures(exercise, [...history, current]).progressionState).not.toBe('regressing')
  })

  it('compares equivalent mixed-unit sessions consistently', () => {
    const before = session('before', '2026-09-10', [10, 10, 10])
    const current = session('current', '2026-09-13', [10, 10, 10], { unit: 'kg' })
    current.sets = current.sets.map((set) => ({ ...set, weight: convertWeight(100, 'lb', 'kg') }))
    expect(analyze(current, [before]).exercises[0]).toMatchObject({ signal: 'steady', comparison: { direction: 'unchanged' } })
  })

  it('does not mistake more assistance for strength progress without a historical bodyweight baseline', () => {
    const before = session('before', '2026-09-10', [10, 10, 10])
    const current = session('current', '2026-09-13', [10, 10, 10])
    before.sets = before.sets.map((set) => ({ ...set, loadType: 'assisted', weight: 40 }))
    current.sets = current.sets.map((set) => ({ ...set, loadType: 'assisted', weight: 50 }))
    expect(analyze(current, [before]).exercises[0]).toMatchObject({ signal: 'inconclusive', progressionState: 'insufficient history' })
  })

  it('treats a changed rep range as inconclusive rather than decline', () => {
    const before = session('before', '2026-09-10', [12, 12, 12])
    const current = session('current', '2026-09-13', [6, 6, 6])
    current.plannedExercises![0].repRange = { min: 4, max: 6 }
    expect(analyze(current, [before]).exercises[0]).toMatchObject({ signal: 'inconclusive', comparison: { direction: 'inconclusive' } })
  })

  it('uses chronological same-day evidence and excludes later, unfinished, and duplicate current records', () => {
    const morning = session('z-morning', '2026-09-13', [8, 8, 8], { completedAt: '2026-09-13T08:00:00.000Z' })
    const current = session('a-noon', '2026-09-13', [10, 10, 10])
    const future = session('future', '2026-09-14', [20, 20, 20])
    const evening = session('evening', '2026-09-13', [20, 20, 20], { completedAt: '2026-09-13T18:00:00.000Z' })
    const unknown = session('unknown', '2026-09-13', [20, 20, 20], { completedAt: undefined })
    const unfinished = session('unfinished', '2026-09-12', [20, 20, 20], { status: 'in-progress' })
    expect(analyze(current, [future, evening, current, unknown, morning, unfinished]).exercises[0]).toMatchObject({ signal: 'progress', previousSessionId: morning.id })
    expect(calculateExerciseFeatures(exercise, [current, morning]).mostRecentPerformance?.sessionId).toBe(current.id)
  })

  it('recomputes from corrected history without mutating or persisting an assessment', () => {
    const before = session('before', '2026-09-10', [8, 8, 8])
    const current = session('current', '2026-09-13', [10, 10, 10])
    const snapshot = JSON.stringify([before, current])
    expect(analyze(current, [before])).toEqual(analyze(current, [before]))
    expect(JSON.stringify([before, current])).toBe(snapshot)
    const corrected = { ...current, sets: current.sets.map((set) => ({ ...set, reps: 7 })) }
    expect(analyze(corrected, [before]).exercises[0].signal).toBe('watch')
  })

  it('skips unfinished sessions and does not call an unlogged exercise a decline', () => {
    expect(analyzeWorkoutSession(session('active', '2026-09-13', [10], { status: 'in-progress' }), [], exercises)).toBeUndefined()
    expect(analyze(session('missing', '2026-09-13', [])).exercises[0]).toMatchObject({ completion: 'not started', signal: 'no-working-sets' })
  })

  it('feeds generated-session working sets back into the next muscle-opportunity selection', () => {
    const preferences = { ...defaultPreferences, goals: ['Build muscle' as const], priorities: ['Biceps'] }
    const input = { exercises, preferences, history: [] as WorkoutSession[], todaysContext: context, asOf: '2026-09-13' }
    const generated = generateRecommendedWorkout(input)
    expect(generated.targetMuscles.map((muscle) => muscle.toLowerCase())).toContain('biceps')
    const planned = generated.workout.plannedExercises!
    const actual: LoggedSet[] = planned.flatMap((item) => Array.from({ length: item.sets }, (_, index) => ({ id: `${item.exerciseId}-${index}`, exerciseId: item.exerciseId, setType: item.setType, weight: 30, reps: item.repRange.min })))
    const completed = session('generated', '2026-09-13', [], { planningAuthority: 'recommended', plannedExercises: planned, sets: actual })
    expect(analyze(completed)).toMatchObject({ planningAuthority: 'recommended', completion: 'complete' })
    expect(analyze(completed).nextSession).toContain('construct your next workout')
    const next = generateRecommendedWorkout({ ...input, history: [completed] })
    expect(next.targetMuscles.map((muscle) => muscle.toLowerCase())).not.toContain('biceps')
  })
})
