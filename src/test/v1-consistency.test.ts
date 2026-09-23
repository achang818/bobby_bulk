import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exercises } from '../domain/exercises'
import { defaultPreferences } from '../domain/preferences'
import { deriveTrainingState, exerciseTrainingState, muscleTrainingState, isMuscleOpportunity } from '../domain/training-state'
import { classifyRecentWorkload } from '../domain/states'
import { generateRecommendedWorkout } from '../domain/recommended-workout'
import { generateRecommendationsWithTrace } from '../domain/recommendations'
import { deriveCoachingPreferences, progressionPathway } from '../domain/coaching-preferences'
import { analyzeWorkoutSession } from '../domain/workout-analysis'
import { normalizeWorkoutSession, createWorkoutSession, createWorkoutSessionForToday } from '../domain/workout-session'
import { decisionForRecommendation } from '../domain/session-provenance'
import { currentCoachingDate } from '../domain/coaching-date'
import { convertWeight } from '../domain/units'
import { savePlan, deletePlan, savePreferences, saveActiveWorkoutSession, loadActiveWorkoutSession, saveWorkout, updateWorkout, deleteWorkout, loadWorkouts, saveRecommendationDecision, loadRecommendationDecisions } from '../domain/storage'
import type { Recommendation, UserPreferences, Workout, WorkoutPlan } from '../domain/models'

const asOf = '2026-09-19'
const bench = exercises.find((item) => item.id === 'incline-db-bench')!
const prefs: UserPreferences = { ...defaultPreferences, priorities: ['Upper chest'] }
const context = { gymId: 'default-gym', unavailableEquipment: [] }
const plan: WorkoutPlan = { id: 'v1-plan', name: 'Push', description: '', focus: '', exerciseIds: [bench.id], plannedExercises: [{ exerciseId: bench.id, order: 0, sets: 3, setType: 'working', repRange: { min: 8, max: 12 } }] }
const workout = (date = asOf, weight = 50, reps = 10): Workout => ({ id: date, date, completedAt: `${date}T12:00:00Z`, title: 'Push', status: 'completed', unit: 'lb', plannedExercises: structuredClone(plan.plannedExercises), sets: [{ id: 'set', exerciseId: bench.id, setType: 'working', weight, reps }] })
const state = (history: Workout[] = [], unit: 'lb' | 'kg' = 'lb') => deriveTrainingState(exercises, history, asOf, unit)
const recommend = (history: Workout[], unit: 'lb' | 'kg' = 'lb') => generateRecommendedWorkout({ exercises, history, preferences: { ...prefs, weightUnit: unit }, todaysContext: context, asOf })

beforeEach(() => { const values = new Map<string, string>(); vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }) })

describe('v1 date, exposure and unit invariants', () => {
  it('uses the boundary calendar date instead of latest history as today', () => {
    expect(currentCoachingDate(new Date(2026, 8, 19, 23, 59))).toBe(asOf)
    const old = { ...workout('2026-09-10'), sets: Array.from({ length: 30 }, (_, index) => ({ ...workout().sets[0], id: String(index) })) }
    expect(classifyRecentWorkload([old], old.date)).toBe('Elevated')
    expect(classifyRecentWorkload([old], asOf)).toBe('Low')
    expect(state([old]).workload).toBe('Low')
  })
  it('ignores future, draft, invalid and special sets in current workload', () => {
    const records = [workout('2026-09-20'), { ...workout(), status: 'in-progress' as const }, { ...workout(), sets: [{ ...workout().sets[0], reps: 0 }] }, { ...workout(), sets: [{ ...workout().sets[0], setType: 'warm-up' as const }] }]
    expect(classifyRecentWorkload(records, asOf)).toBe('Low')
    expect(state(records).workload).toBe('Low')
  })
  it.each(exercises.map((exercise) => [exercise.id, exercise] as const))('%s updates every primary muscle and no secondary-only direct volume', (_id, exercise) => {
    const actual = { ...workout(), plannedExercises: [], sets: [{ ...workout().sets[0], exerciseId: exercise.id }] }
    const result = state([actual])
    for (const muscle of exercise.primaryMuscles) {
      const exposure = muscleTrainingState(result, muscle)
      expect(exposure).toMatchObject({ rolling7DaySets: 1, daysSinceTrained: 0, recovery: 'recently-trained' })
      expect(isMuscleOpportunity(exposure)).toBe(false)
    }
    for (const muscle of exercise.secondaryMuscles.filter((muscle) => !exercise.primaryMuscles.includes(muscle))) {
      const exposure = result.muscles.find((item) => item.muscle === muscle)
      if (exposure) expect(exposure.rolling7DaySets).toBe(0)
    }
  })
  it('completing Upper chest work removes direct Upper chest opportunities today and tomorrow', () => {
    for (const date of [asOf, '2026-09-18']) {
      const result = recommend([workout(date)])
      expect(result.workout.exerciseIds.some((id) => exercises.find((exercise) => exercise.id === id)!.primaryMuscles.includes('Upper chest'))).toBe(false)
      expect(result.reasons.some((reason) => reason.includes("Upper chest isn't prioritized today"))).toBe(true)
    }
  })
  it('classifies mixed effort and load evidence identically in both display units and History', () => {
    const records = [workout('2026-09-10', 20), workout('2026-09-14', 24)]
    records[0].sets[0].rir = 4; records[1].sets[0].rir = 1
    const pounds = state(records); const metric = state(records, 'kg')
    expect(exerciseTrainingState(pounds, bench.id).progressionState).toBe(exerciseTrainingState(metric, bench.id).progressionState)
    expect(pounds.outcomes).toEqual(metric.outcomes)
    expect(pounds.outcomes.at(-1)!.exercises[0].progressionState).toBe(exerciseTrainingState(metric, bench.id).progressionState)
    expect(recommend(records).workout.exerciseIds).toEqual(recommend(records, 'kg').workout.exerciseIds)
  })
  it('unit switching preserves an accepted target and its outcome pathway', () => {
    const rec = generateRecommendationsWithTrace({ plan, exercises, history: [workout('2026-09-15', 50, 12)], preferences: prefs, todaysContext: context, asOf }).recommendations.find((item) => item.type === 'PROGRESSION')!
    const choices = saveRecommendationDecision(rec, 'accepted', { planId: plan.id, unit: 'lb' })
    const metric: Recommendation = { ...rec, change: { kind: 'progression', recommendedLoad: Math.round(convertWeight(rec.change.kind === 'progression' ? rec.change.recommendedLoad! : 0, 'lb', 'kg') * 10) / 10, repRange: plan.plannedExercises![0].repRange } }
    expect(decisionForRecommendation(metric, choices, plan.id, 'kg')?.decision).toBe('accepted')
    expect(progressionPathway(metric, 'kg')).toBe(progressionPathway(rec, 'lb'))
    expect(createWorkoutSessionForToday(plan, [metric], exercises, 'kg', choices).plannedExercises![0].loadRecommendation?.kind).toBe('target')
  })
  it('changing display units does not reopen a rejected optional replacement', () => {
    const records = ['2026-09-10', '2026-09-13', '2026-09-16'].map((date) => workout(date))
    const input = { plan, exercises, history: records, preferences: prefs, todaysContext: context, asOf }
    const rec = generateRecommendationsWithTrace(input).recommendations.find((item) => item.type === 'REPLACE')!
    expect(rec).toBeDefined()
    const choices = saveRecommendationDecision(rec, 'rejected', { planId: plan.id, unit: 'lb', coachingDate: asOf }).map((item) => ({ ...item, timestamp: '2026-09-18T12:00:00Z' }))
    const result = generateRecommendationsWithTrace({ ...input, preferences: { ...prefs, weightUnit: 'kg' }, decisions: choices })
    expect(result.suppressed.some((item) => item.code === 'recently-declined')).toBe(true)
    for (const suppressed of result.suppressed) expect(result.recommendations.some((item) => item.id === suppressed.candidateId)).toBe(false)
  })
  it('evening UTC timestamps use the captured coaching day for rejection cooldown and evidence', () => {
    const records = ['2026-09-10', '2026-09-13', '2026-09-16'].map((date) => workout(date))
    const input = { plan, exercises, history: records, preferences: prefs, todaysContext: context, asOf }
    const rec = generateRecommendationsWithTrace(input).recommendations.find((item) => item.type === 'REPLACE')!
    const choices = saveRecommendationDecision(rec, 'rejected', { planId: plan.id, unit: 'lb', coachingDate: asOf }).map((item) => ({ ...item, timestamp: '2026-09-20T04:00:00Z' }))
    const result = generateRecommendationsWithTrace({ ...input, decisions: choices })
    expect(result.suppressed.some((item) => item.code === 'recently-declined')).toBe(true)
    expect(result.coachingPreferences.exercises.find((item) => item.exerciseId === bench.id)?.confidence).toBe('limited')
  })
  it('bodyweight setup uncertainty is shared by state and historical interpretation', () => {
    const records = [workout('2026-09-10'), workout('2026-09-14', 55)].map((item) => ({ ...item, sets: item.sets.map((set) => ({ ...set, loadType: 'assisted' as const })) }))
    expect(exerciseTrainingState(state(records), bench.id).progressionState).toBe('insufficient history')
    expect(state(records).outcomes.at(-1)!.exercises[0].progressionState).toBe('insufficient history')
  })
})

describe('v1 persistence and rederivation', () => {
  it('refresh preserves authority and prescription through plan, preference, context changes and plan deletion', () => {
    savePlan(structuredClone(plan)); const active = createWorkoutSession(plan, undefined, 'lb')
    active.context = context; saveActiveWorkoutSession(active)
    savePlan({ ...plan, plannedExercises: [{ ...plan.plannedExercises![0], sets: 1, repRange: { min: 3, max: 5 } }] })
    savePreferences({ ...prefs, weightUnit: 'kg', goals: ['Get stronger'], excludedExerciseIds: [bench.id] })
    localStorage.setItem('bobby-bulk-todays-context', JSON.stringify({ ...context, gymId: 'travel', availableMinutes: 30 }))
    deletePlan(plan.id)
    expect(loadActiveWorkoutSession()).toMatchObject({ plannedExercises: active.plannedExercises, unit: 'lb', planningAuthority: 'user-plan', context })
  })
  it('saving, editing and deleting history updates exposure, review, behavior and next session', () => {
    const skip = (date: string): Workout => ({ ...workout(date), sets: [], exerciseOmissions: [{ exerciseId: bench.id, reason: 'voluntary' }] })
    saveWorkout(skip('2026-09-15')); saveWorkout(skip(asOf))
    expect(deriveCoachingPreferences(state(loadWorkouts())).exercises.find((item) => item.exerciseId === bench.id)?.state).toBe('recommend-less-evidence')
    updateWorkout(workout())
    const updated = state(loadWorkouts())
    expect(muscleTrainingState(updated, 'Upper chest').recovery).toBe('recently-trained')
    expect(updated.outcomes.find((item) => item.sessionId === asOf)?.workingSets).toBe(1)
    expect(deriveCoachingPreferences(updated).exercises.find((item) => item.exerciseId === bench.id)?.state).toBe('neutral')
    const afterTraining = recommend(loadWorkouts())
    deleteWorkout(asOf)
    expect(muscleTrainingState(state(loadWorkouts()), 'Upper chest').recovery).toBe('unknown')
    expect(recommend(loadWorkouts()).workout.exerciseIds).not.toEqual(afterTraining.workout.exerciseIds)
  })
  it('retains zero-working-set session reviews without fabricating training', () => {
    const saved = { ...workout(), sets: [] }
    expect(state([saved]).outcomes[0].exercises[0].status).toBe('skipped')
    expect(muscleTrainingState(state([saved]), 'Upper chest').recovery).toBe('unknown')
    expect(analyzeWorkoutSession(saved, [], exercises, '2026-09-18')).toBeUndefined()
  })
  it('legacy normalization does not invent dates or same-day completion order', () => {
    expect(normalizeWorkoutSession({ id: 'legacy', sets: [] }).date).toBe('')
    expect(normalizeWorkoutSession({ ...workout(), completedAt: undefined }).completedAt).toBeUndefined()
    localStorage.setItem('bobby-bulk-recommendation-decisions', JSON.stringify([null, { id: 'old', recommendationId: 'old', exerciseId: bench.id, recommendationType: 'REPLACE', decision: 'rejected' }]))
    expect(loadRecommendationDecisions()).toHaveLength(1)
    expect(() => deriveCoachingPreferences(state(), loadRecommendationDecisions())).not.toThrow()
  })
  it('input history and catalog ordering preserve coaching meaning', () => {
    const records = [workout('2026-09-10', 50, 8), workout('2026-09-15', 55, 8)]
    const normal = state(records)
    const reversed = deriveTrainingState([...exercises].reverse(), [...records].reverse(), asOf)
    expect(reversed.outcomes).toEqual(normal.outcomes)
    expect(reversed.workload).toBe(normal.workload)
    for (const item of normal.exercises) expect(exerciseTrainingState(reversed, item.exerciseId)).toEqual(item)
    expect(recommend(records)).toEqual(recommend([...records].reverse()))
  })
})
