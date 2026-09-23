import { deriveTrainingState } from '../domain/training-state'
import { describe, expect, it } from 'vitest'
import { addSessionExercise, switchSessionExercise, validSessionDate } from '../domain/session-editing'
import { createWorkoutSession, normalizeWorkoutSession, sessionExercises } from '../domain/workout-session'
import { exercises } from '../domain/exercises'
import { analyzeWorkoutSession } from '../domain/workout-analysis'

const original = exercises.find((exercise) => exercise.id === 'lat-pulldown')!
const replacement = exercises.find((exercise) => exercise.id === 'cable-row')!
const empty = () => createWorkoutSession({ id: 'empty-workout', name: 'Empty workout', description: '', focus: '', plannedExercises: [], exerciseIds: [] }, [], 'lb')

describe('explicit session editing', () => {
  it('starts and reloads truly empty, then adds exactly the selected exercise', () => {
    const session = normalizeWorkoutSession(JSON.parse(JSON.stringify(empty())))
    expect(sessionExercises(session)).toEqual([])
    expect(session.sets).toEqual([])
    const added = addSessionExercise(session, original)
    expect(sessionExercises(added).map((slot) => slot.exerciseId)).toEqual([original.id])
    expect(addSessionExercise(added, original)).toBe(added)
    expect(added.plannedExercises).toEqual([])
  })
  it('switches remaining work without changing starting targets or already logged sets', () => {
    const session = addSessionExercise(empty(), original)
    session.sets = [{ id: 'set', exerciseId: original.id, setType: 'working', reps: 10, weight: 50 }]
    const snapshot = structuredClone(session)
    const switched = switchSessionExercise(session, original.id, replacement)
    expect(session).toEqual(snapshot)
    expect(switched.sets).toEqual(session.sets)
    expect(sessionExercises(switched)).toMatchObject([{ exerciseId: replacement.id, sets: original.defaultSets - 1 }])
    expect(switched.plannedExercises).toEqual(session.plannedExercises)
    expect(switched.prescriptionChanges?.[0].source).toBe('user-substitution')
    expect(sessionExercises(normalizeWorkoutSession(JSON.parse(JSON.stringify(switched))))).toEqual(sessionExercises(switched))
  })
  it('gives a replacement its own load guidance, preserving it across reload', () => {
    const session = addSessionExercise(empty(), original)
    const history = [{ ...session, id: 'prior', date: '2026-09-18', status: 'completed' as const, sets: [{ id: 'row-set', exerciseId: replacement.id, setType: 'working' as const, weight: 80, reps: replacement.repRange.min }] }]
    const trainingState = deriveTrainingState(exercises, history, '2026-09-20', 'lb')
    const changed = switchSessionExercise(session, original.id, replacement, trainingState)
    expect(sessionExercises(changed)[0].loadRecommendation).toMatchObject({ kind: 'target', weight: 80, unit: 'lb' })
    expect(sessionExercises(normalizeWorkoutSession(JSON.parse(JSON.stringify(changed))))[0].loadRecommendation).toEqual(sessionExercises(changed)[0].loadRecommendation)
    const unknown = switchSessionExercise(session, original.id, replacement)
    expect(sessionExercises(unknown)[0].loadRecommendation).toMatchObject({ kind: 'choose-load', unit: 'lb' })
  })
  it('supports switching back without duplicate slots', () => {
    const first = addSessionExercise(empty(), original)
    const switched = switchSessionExercise(first, original.id, replacement)
    const back = switchSessionExercise(switched, replacement.id, original)
    expect(sessionExercises(back).map((slot) => slot.exerciseId)).toEqual([original.id])
    expect(sessionExercises(addSessionExercise(switched, original))).toHaveLength(1)
  })
  it('preserves switch provenance and reports actual completion', () => {
    const session = switchSessionExercise(addSessionExercise(empty(), original), original.id, replacement)
    session.status = 'completed'; session.date = '2026-09-19'
    session.sets = Array.from({ length: original.defaultSets }, (_, index) => ({ id: String(index), exerciseId: replacement.id, setType: 'working', weight: 50, reps: 10 }))
    expect(analyzeWorkoutSession(session, [], exercises)?.recommendationOutcomes[0].status).toBe('executed')
  })
  it('accepts real historical dates and rejects blank, invalid and future dates', () => {
    expect(validSessionDate('2026-09-19', '2026-09-20')).toBe(true)
    expect(validSessionDate('2024-02-29', '2026-09-20')).toBe(true)
    for (const value of ['', '2026-02-30', '2026-09-21', 'nonsense']) expect(validSessionDate(value, '2026-09-20')).toBe(false)
  })
})
