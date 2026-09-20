import { describe, expect, it } from 'vitest'
import { deriveCoachingPreferences, compareCoachingPreference, calibrateProgressionLoad } from '../domain/coaching-preferences'
import { deriveTrainingState } from '../domain/training-state'
import { generateRecommendationsWithTrace } from '../domain/recommendations'
import { generateRecommendedWorkout } from '../domain/recommended-workout'
import { findExerciseCandidates } from '../domain/exercise-intelligence'
import { adaptWorkout } from '../domain/adaptation'
import { createWorkoutSessionForToday, normalizeWorkoutSession } from '../domain/workout-session'
import { defaultPreferences } from '../domain/preferences'
import { classifyPreference } from '../domain/states'
import { exercises } from '../domain/exercises'
import { buildTrace } from '../domain/rules'
import type { Exercise, Recommendation, RecommendationDecision, Workout, WorkoutPlan, UserPreferences } from '../domain/models'

const a: Exercise = { ...exercises.find((item) => item.id === 'lat-pulldown')!, id: 'a', name: 'A movement', equipment: 'Cable', repRange: { min: 8, max: 12 } }
const b: Exercise = { ...a, id: 'b', name: 'B movement', equipment: 'Machine' }
const c: Exercise = { ...b, id: 'c', name: 'C movement' }
const catalog = [a, b, c]
const asOf = '2026-09-19'
const prefs: UserPreferences = { ...defaultPreferences, priorities: ['Lats'] }
const plan: WorkoutPlan = { id: 'plan', name: 'Pull', description: '', focus: '', exerciseIds: ['a'], plannedExercises: [{ exerciseId: 'a', sets: 3, order: 0, setType: 'working', repRange: { min: 8, max: 12 } }] }
const replacement = (id = 'a', to = 'b'): Recommendation => ({ id: `replace-${id}-${to}`, type: 'REPLACE', priority: 4, target: { kind: 'exercise', exerciseId: id }, change: { kind: 'replace', fromExerciseId: id, toExerciseId: to }, reason: 'Optional variation', trace: buildTrace('replace-on-stall') })
const decision = (day: number, rec = replacement(), choice: RecommendationDecision['decision'] = 'rejected'): RecommendationDecision => ({ id: `decision-${day}-${rec.id}`, timestamp: `2026-09-${day}T12:00:00Z`, planId: 'plan', recommendationId: rec.id, recommendationType: rec.type, exerciseId: rec.target.kind === 'exercise' ? rec.target.exerciseId : '', recommendation: rec, decision: choice, unit: 'lb' })
const history = (day: number, reps = 10, id = 'a', weight = 100): Workout => ({ id: `workout-${day}`, date: `2026-09-${day}`, status: 'completed', unit: 'lb', title: 'Pull', plannedExercises: [{ ...plan.plannedExercises![0], exerciseId: id }], sets: [{ id: `set-${day}`, exerciseId: id, setType: 'working', weight, reps }] })
const state = (workouts: Workout[] = [], date = asOf) => deriveTrainingState(catalog, workouts, date)
const coaching = (decisions: RecommendationDecision[] = [], workouts: Workout[] = []) => deriveCoachingPreferences(state(workouts), decisions)
const evidence = (decisions: RecommendationDecision[] = [], workouts: Workout[] = [], id = 'a') => coaching(decisions, workouts).exercises.find((item) => item.exerciseId === id)!
const skipped = (day: number, reason?: 'voluntary' | 'time' | 'equipment'): Workout => ({ ...history(day), sets: [], ...(reason ? { exerciseOmissions: [{ exerciseId: 'a', reason }] } : {}) })
const stalled = [history(10), history(13), history(16)]
const pipeline = (decisions: RecommendationDecision[] = [], workouts = stalled, preferences = prefs, date = asOf) => generateRecommendationsWithTrace({ plan, exercises: catalog, history: workouts, preferences, todaysContext: { gymId: 'test', unavailableEquipment: [] }, decisions, asOf: date })

 describe('conservative behavioral evidence', () => {
  it('one rejection remains neutral with limited evidence', () => {
    expect(evidence([decision(17)])).toMatchObject({ state: 'neutral', confidence: 'limited' })
  })
  it('two independent optional replacement rejections favor continuity without explicit preference mutation', () => {
    const choices = [decision(16), decision(18)]
    expect(evidence(choices)).toMatchObject({ state: 'continuity-favored', confidence: 'moderate' })
    expect(evidence(choices).facts.map((item) => item.sourceId)).toEqual(choices.map((item) => item.id))
    expect(classifyPreference('a', prefs, choices)).toBe('neutral')
  })
  it('equipment-required rejection or acceptance creates no preference evidence', () => {
    const rec = { ...replacement(), trace: buildTrace('adapt-unavailable-equipment') }
    expect(evidence([decision(16, rec), decision(18, rec, 'accepted')]).facts).toEqual([])
  })
  it('time omissions never count as avoidance', () => {
    expect(evidence([], [skipped(16, 'time'), skipped(18, 'time')]).state).toBe('neutral')
  })
  it('one deliberate skip remains neutral', () => {
    expect(evidence([], [skipped(18, 'voluntary')])).toMatchObject({ state: 'neutral', confidence: 'limited' })
  })
  it('two explicitly voluntary skipped prescriptions establish reversible avoidance evidence', () => {
    expect(evidence([], [skipped(16, 'voluntary'), skipped(18, 'voluntary')])).toMatchObject({ state: 'recommend-less-evidence', confidence: 'moderate' })
  })
  it('unknown partial workouts never establish voluntary avoidance', () => {
    expect(evidence([], [skipped(16), skipped(18), history(19)]).state).toBe('neutral')
  })
  it('progressive execution is supporting evidence only', () => {
    expect(evidence([], [history(12, 8), history(15, 10), history(18, 12)])).toMatchObject({ state: 'neutral', confidence: 'none' })
    expect(evidence([], [history(12, 8), history(15, 10)]).facts[0].kind).toBe('productive-performance')
  })
  it('failed progression and special sets never imply dislike', () => {
    const workouts = [history(12, 12), history(15, 9), history(18, 5)]
    expect(evidence([], workouts).state).toBe('neutral')
    expect(evidence([], workouts.map((workout) => ({ ...workout, sets: workout.sets.map((set) => ({ ...set, setType: 'failure' as const })) }))).facts).toEqual([])
  })
  it('explicit preferred outranks contradictory behavioral evidence', () => {
    const learned = coaching([], [skipped(16, 'voluntary'), skipped(18, 'voluntary')])
    const explicit = { ...prefs, preferredExerciseIds: ['a'] }
    expect(compareCoachingPreference('a', 'b', explicit, learned)).toBeLessThan(0)
    expect(classifyPreference('a', explicit)).toBe('preferred')
  })
  it('explicit excluded is never selected despite continuity evidence', () => {
    const result = generateRecommendedWorkout({ exercises: catalog, history: [], preferences: { ...prefs, excludedExerciseIds: ['a'] }, todaysContext: { gymId: 'test', unavailableEquipment: [] }, decisions: [decision(16), decision(18)], asOf })
    expect(result.workout.exerciseIds).not.toContain('a')
  })
  it('continuity breaks otherwise equivalent generated and optional variation choices', () => {
    const decisions = [decision(16, replacement('b', 'c')), decision(18, replacement('b', 'c'))]
    const input = { exercises: catalog, history: [], preferences: prefs, todaysContext: { gymId: 'test', unavailableEquipment: [] }, asOf }
    expect(generateRecommendedWorkout(input).workout.exerciseIds[0]).toBe('a')
    expect(generateRecommendedWorkout({ ...input, decisions }).workout.exerciseIds[0]).toBe('b')
    const ranked = findExerciseCandidates({ exercise: a, exercises: [a, { ...b, name: 'Z movement' }, c], role: 'optional-variation', preferences: prefs, coachingPreferences: coaching(decisions) })
    expect(ranked[0].exercise.id).toBe('b')
    expect(ranked[0].behavioralEvidence?.state).toBe('continuity-favored')
  })
  it('equipment constraints override continuity while ranking multiple valid substitutes', () => {
    const choices = [decision(16), decision(18), decision(16, replacement('c', 'b')), decision(18, replacement('c', 'b'))]
    const adapted = adaptWorkout(plan, catalog, { gymId: 'test', availableEquipment: ['machines'], unavailableEquipment: [] }, prefs, undefined, coaching(choices))
    expect(adapted[0]).toMatchObject({ type: 'REPLACE', exerciseId: 'a', alternativeExerciseId: 'c' })
  })
  it('recent identical rejection is suppressed but expires', () => {
    const rec = pipeline().recommendations.find((item) => item.type === 'REPLACE')!
    expect(rec).toBeDefined()
    const declined = decision(18, rec)
    expect(pipeline([declined]).recommendations.some((item) => item.type === 'REPLACE')).toBe(false)
    expect(pipeline([declined]).suppressed.some((item) => item.code === 'recently-declined')).toBe(true)
    expect(pipeline([declined], stalled, prefs, '2026-10-03').recommendations.some((item) => item.type === 'REPLACE')).toBe(true)
  })
  it('material new regression, goals, availability or explicit preference reopens a rejection', () => {
    const rec = pipeline().recommendations.find((item) => item.type === 'REPLACE')!
    const declined = decision(18, rec)
    expect(pipeline([declined], [...stalled, history(17, 8), history(18, 6)], prefs, '2026-09-20').recommendations.some((item) => item.type === 'REPLACE')).toBe(true)
    expect(pipeline([declined], stalled, { ...prefs, goals: ['Get stronger'] }).recommendations.some((item) => item.type === 'REPLACE')).toBe(true)
    expect(pipeline([declined], stalled, { ...prefs, preferredExerciseIds: ['b'] }).recommendations.some((item) => item.type === 'REPLACE')).toBe(true)
    const changed = generateRecommendationsWithTrace({ plan, exercises: [...catalog, { ...c, id: 'd' }], history: stalled, preferences: prefs, todaysContext: { gymId: 'test', unavailableEquipment: [] }, asOf, decisions: [declined] })
    expect(changed.recommendations.some((item) => item.type === 'REPLACE')).toBe(true)
  })
  it('legacy provenance stays weak and undated rejections cannot suppress forever', () => {
    const legacy = [decision(16), decision(18)].map((item) => ({ ...item, recommendation: undefined, timestamp: undefined }))
    expect(evidence(legacy)).toMatchObject({ state: 'neutral', confidence: 'limited' })
    expect(pipeline(legacy).recommendations.some((item) => item.type === 'REPLACE')).toBe(true)
  })
  it('history, decision, duplicate and catalog ordering do not change the evidence', () => {
    const choices = [decision(16), decision(18)]
    expect(coaching(choices, stalled)).toEqual(coaching([...choices].reverse(), [...stalled].reverse()))
    expect(coaching(choices)).toEqual(coaching([...choices, ...choices]))
    expect(coaching(choices)).toEqual(deriveCoachingPreferences(deriveTrainingState([...catalog].reverse(), [], asOf), choices))
  })
  it('repeated same-day clicks and dismissals do not manufacture independent evidence', () => {
    expect(evidence([decision(18), { ...decision(18), id: 'other' }]).state).toBe('neutral')
    expect(evidence([decision(16, replacement(), 'dismissed'), decision(18, replacement(), 'dismissed')]).facts).toEqual([])
  })
  it('repeated rejected adds influence priority ADD ranking without excluding the movement', () => {
    const rec: Recommendation = { ...replacement(), type: 'ADD', change: { kind: 'add', exerciseId: 'a', sets: 3, repRange: a.repRange } }
    const choices = [decision(16, rec), decision(18, rec)]
    expect(evidence(choices).state).toBe('recommend-less-evidence')
    const empty = { ...plan, exerciseIds: [], plannedExercises: [] }
    const result = generateRecommendationsWithTrace({ plan: empty, exercises: catalog, history: [], preferences: prefs, todaysContext: { gymId: 'test', unavailableEquipment: [] }, asOf, decisions: choices })
    expect(result.recommendations.find((item) => item.type === 'ADD')?.target).toEqual({ kind: 'exercise', exerciseId: 'b' })
  })
  it('accepted replacement means variation tolerance, not dislike or a new favorite', () => {
    const choices = [decision(16, replacement(), 'accepted'), decision(18, replacement(), 'accepted')]
    expect(evidence(choices).state).toBe('variation-tolerant')
    expect(evidence(choices, [], 'b').state).toBe('neutral')
  })
  it('conflicting independent choices stay neutral and old evidence expires', () => {
    const choices = [decision(12), decision(14), decision(16, replacement(), 'accepted'), decision(18, replacement(), 'accepted')]
    expect(evidence(choices).state).toBe('neutral')
    expect(deriveCoachingPreferences(state([], '2027-01-01'), choices).exercises[0].state).toBe('neutral')
  })
  it('context and generated substitutions cannot become avoidance via omission metadata', () => {
    const workouts = [skipped(16, 'voluntary'), skipped(18, 'voluntary')].map((workout) => ({ ...workout, prescriptionChanges: [{ id: workout.id, source: 'generated-substitution' as const, before: plan.plannedExercises!, after: plan.plannedExercises!, unit: 'lb' as const, applied: false, reason: 'Superseded preview' }] }))
    expect(evidence([], workouts).facts).toEqual([])
  })
  it('accepted optional KEEP and rejected optional REMOVE support continuity, not favorites', () => {
    const keep: Recommendation = { ...replacement(), type: 'KEEP', change: { kind: 'keep' } }
    const remove: Recommendation = { ...replacement(), type: 'REMOVE', change: { kind: 'remove', exerciseId: 'a' } }
    const choices = [decision(16, keep, 'accepted'), decision(18, remove)]
    expect(evidence(choices).state).toBe('continuity-favored')
    expect(classifyPreference('a', prefs, choices)).toBe('neutral')
  })
  it('recorded skip reasons survive reload, but logging actual work invalidates avoidance', () => {
    const workouts = [skipped(16, 'voluntary'), skipped(18, 'voluntary')].map((item) => normalizeWorkoutSession(JSON.parse(JSON.stringify(item))))
    expect(evidence([], workouts).state).toBe('recommend-less-evidence')
    workouts[1].sets = history(18).sets
    expect(evidence([], workouts).state).toBe('neutral')
    expect(evidence([], workouts.slice(1)).state).toBe('neutral')
  })
})

describe('recommendation outcome learning stays separate', () => {
  const rec: Recommendation = { ...replacement(), id: 'progress', type: 'PROGRESSION', change: { kind: 'progression', recommendedLoad: 105, repRange: { min: 8, max: 12 } }, trace: buildTrace('double-progression') }
  const attempt = (day: number, reps: number): Workout => ({ ...createWorkoutSessionForToday(plan, [rec], catalog, 'lb', [decision(day, rec, 'accepted')]), ...history(day, reps, 'a', 105), prescriptionChanges: createWorkoutSessionForToday(plan, [rec], catalog, 'lb', [decision(day, rec, 'accepted')]).prescriptionChanges })
  it('one unsupported attempt lowers no preference and does not defer the pathway', () => {
    const learned = coaching([], [attempt(16, 5)])
    expect(learned.recommendationLearning[0].deferRepeat).toBe(false)
    expect(learned.exercises[0].state).toBe('neutral')
  })
  it('two unsupported independent attempts defer that exact pathway, separately from preference', () => {
    const learned = coaching([], [attempt(16, 5), attempt(18, 5)])
    expect(learned.recommendationLearning[0]).toMatchObject({ deferRepeat: true, unsupportedSessionIds: ['workout-16', 'workout-18'] })
    expect(learned.exercises[0].state).toBe('neutral')
    expect(calibrateProgressionLoad({ kind: 'target', weight: 105, unit: 'lb', action: 'increase-weight', confidence: 'medium', reason: '' }, plan.plannedExercises![0], learned).kind).toBe('choose-load')
  })
  it('future plan suggestions and generated prescriptions both respond to unsupported attempts', () => {
    const workouts = [attempt(14, 5), attempt(16, 5)]
    const result = pipeline([], workouts)
    expect(result.recommendations.some((item) => item.type === 'PROGRESSION')).toBe(false)
    expect(result.recommendations.filter((item) => item.type === 'KEEP')).toHaveLength(1)
    expect(result.suppressed.some((item) => item.code === 'unsupported-progression')).toBe(true)
    const generated = generateRecommendedWorkout({ exercises: [a], history: workouts, preferences: prefs, todaysContext: { gymId: 'test', unavailableEquipment: [] }, asOf })
    expect(generated.workout.plannedExercises![0].loadRecommendation).toMatchObject({ kind: 'choose-load' })
    expect(generated.workout.plannedExercises![0].loadRecommendation?.reason).toContain('Two independent attempts')
  })
  it('different chosen loads and unattempted targets do not establish unsupported attempts', () => {
    const workouts = [attempt(14, 5), attempt(16, 5)].map((workout) => ({ ...workout, sets: workout.sets.map((set) => ({ ...set, weight: 100 })) }))
    expect(coaching([], workouts).recommendationLearning).toEqual([])
    expect(coaching([], workouts.map((workout) => ({ ...workout, sets: [] }))).recommendationLearning).toEqual([])
  })
  it('later successful execution resets deferral and does not create a favorite', () => {
    const learned = coaching([], [attempt(14, 5), attempt(16, 5), attempt(18, 10)])
    expect(learned.recommendationLearning[0]).toMatchObject({ deferRepeat: false, supportedSessionIds: ['workout-18'] })
    expect(learned.exercises[0].state).toBe('neutral')
  })
  it('outcome edits and deletions recompute the pathway, with no stored verdict', () => {
    const first = attempt(16, 5); const second = attempt(18, 5)
    expect(coaching([], [first, second]).recommendationLearning[0].deferRepeat).toBe(true)
    second.sets[0].reps = 10
    expect(coaching([], [first, second]).recommendationLearning[0].deferRepeat).toBe(false)
    expect(coaching([], [first]).recommendationLearning[0].deferRepeat).toBe(false)
  })
})
