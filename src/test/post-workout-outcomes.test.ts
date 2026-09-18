import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exercises } from '../domain/exercises'
import { analyzeWorkoutSession } from '../domain/workout-analysis'
import { createWorkoutSession, createWorkoutSessionForToday, completeWorkoutSession, normalizeWorkoutSession, resolveWorkoutForToday, plannedExercisesFor } from '../domain/workout-session'
import { affectedExerciseIds, decisionForRecommendation } from '../domain/session-provenance'
import { applyAcceptedRecommendation } from '../domain/plan-actions'
import { buildTrace } from '../domain/rules'
import { deriveTrainingState } from '../domain/training-state'
import { defaultPreferences } from '../domain/preferences'
import { classifyPreference } from '../domain/states'
import { generateRecommendedWorkout, skipRecommendedExercise } from '../domain/recommended-workout'
import { loadActiveWorkoutSession, saveActiveWorkoutSession, saveRecommendationDecision, loadRecommendationDecisions, saveWorkout, updateWorkout, deleteWorkout } from '../domain/storage'
import type { LoggedSet, Recommendation, RecommendationDecision, WorkoutSession, WorkoutTemplate } from '../domain/models'

const id = 'lat-pulldown'
const plan = (): WorkoutTemplate => ({ id: 'owned', name: 'Pull', description: '', focus: 'Lats', planningAuthority: 'user-plan', exerciseIds: [id],
  plannedExercises: [{ exerciseId: id, order: 0, sets: 3, repRange: { min: 8, max: 12 }, setType: 'working', loadRecommendation: { kind: 'target', weight: 100, unit: 'lb', action: 'progress-reps', confidence: 'medium', reason: 'Recorded prescription' } }],
})
const sets = (reps = [10, 10, 10], weight = 100, exerciseId = id): LoggedSet[] => reps.map((rep, index) => ({ id: `${exerciseId}-${index}`, exerciseId, setType: 'working', weight, reps: rep }))
const completed = (session: WorkoutSession, actual = sets(), date = '2026-09-16'): WorkoutSession => ({ ...completeWorkoutSession(session), id: `session-${date}`, date, completedAt: `${date}T12:00:00Z`, sets: actual })
const ordinary = (reps = [10, 10, 10], date = '2026-09-16') => completed(createWorkoutSession(plan(), undefined, 'lb'), sets(reps), date)
const analyze = (session: WorkoutSession, history: WorkoutSession[] = []) => analyzeWorkoutSession(session, history, exercises)!
const progression = (): Recommendation => ({ id: 'progress-load', type: 'PROGRESSION', priority: 4, target: { kind: 'exercise', exerciseId: id }, change: { kind: 'progression', recommendedLoad: 105, repRange: { min: 8, max: 12 } }, reason: 'Try the demonstrated next load.', trace: buildTrace('double-progression') })
function decide(recommendation: Recommendation, decision: RecommendationDecision['decision'] = 'accepted', baseline = plan()): RecommendationDecision {
  const affected = affectedExerciseIds(recommendation)
  const before = plannedExercisesFor(baseline).filter((slot) => affected.includes(slot.exerciseId))
  const after = decision === 'accepted' ? plannedExercisesFor(resolveWorkoutForToday(baseline, [recommendation], exercises, 'lb')).filter((slot) => affected.includes(slot.exerciseId)) : before
  return { id: `decision-${recommendation.id}`, recommendationId: recommendation.id, recommendationType: recommendation.type, exerciseId: id, timestamp: '2026-09-16T10:00:00Z', decision, recommendation: structuredClone(recommendation), planId: baseline.id, unit: 'lb', prescriptionBefore: structuredClone(before), prescriptionAfter: structuredClone(after) }
}

beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
})

describe('structured post-workout outcomes', () => {
  it.each([[3, 'completed', 'achieved'], [2, 'partial', 'partial'], [0, 'skipped', 'not-attempted']] as const)('distinguishes %s of 3 prescribed sets', (count, status, targetStatus) => {
    const result = analyze(ordinary(Array(count).fill(10)))
    expect(result.exercises[0]).toMatchObject({ status, prescription: { sets: 3, repRange: { min: 8, max: 12 } }, targetRange: { status: targetStatus, completedSets: count } })
    expect(result.exercises[0].workingSets).toHaveLength(count)
    expect(classifyPreference(id, defaultPreferences)).toBe('neutral')
    if (count === 0) expect(result.exercises[0]).toMatchObject({ performance: 'not-performed', evidenceConfidence: 'none' })
  })

  it('preserves successful heavier loads and extra work without labeling them failed adherence', () => {
    const session = ordinary(); session.sets = sets([10, 10, 10, 10], 110)
    const result = analyze(session)
    expect(result.exercises[0]).toMatchObject({ status: 'completed', loadOutcome: 'higher', demonstratedWorkingLoad: 110, targetRange: { status: 'achieved' } })
    expect(result.exercises[0].prescription?.loadRecommendation).toMatchObject({ weight: 100 })
    expect(result.extraSets).toBe(1)
    expect(result.exercises[0].observations).toContain('1 more sets logged than prescribed.')
    const missed = analyze(ordinary([7, 7, 7])).exercises[0]
    expect(missed).toMatchObject({ status: 'completed', completion: 'below target', targetRange: { status: 'missed' } })
  })

  it('distinguishes extra exercises without fabricating an original prescription', () => {
    const session = ordinary(); session.sets.push(...sets([12], 20, 'dumbbell-curl'))
    const outcome = analyze(session).exercises.find((item) => item.exerciseId === 'dumbbell-curl')!
    expect(outcome).toMatchObject({ status: 'ad-hoc', targetRange: { status: 'unknown' }, loadOutcome: 'not-prescribed' })
    expect(outcome.prescription).toBeUndefined()
  })

  it('records time omissions separately from skipped exercises and preference', () => {
    const baseline = plan(); baseline.exerciseIds.push('dumbbell-curl'); baseline.plannedExercises!.push({ exerciseId: 'dumbbell-curl', order: 1, sets: 3, repRange: { min: 8, max: 12 }, setType: 'working' })
    const removal: Recommendation = { id: 'time-remove', type: 'REMOVE', priority: 6, target: { kind: 'exercise', exerciseId: id }, change: { kind: 'remove', exerciseId: id }, reason: 'Time limit', trace: buildTrace('adapt-available-time') }
    const session = completed(createWorkoutSessionForToday(baseline, [removal], exercises, 'lb', []), sets([10, 10, 10], 20, 'dumbbell-curl'))
    const result = analyze(session)
    expect(result.exercises.some((item) => item.exerciseId === id)).toBe(false)
    expect(result.recommendationOutcomes[0]).toMatchObject({ source: 'time', applied: true, status: 'contextually-omitted' })
    expect(result.recommendationOutcomes[0].reason).toContain('not a skipped prescription')
    expect(deriveTrainingState(exercises, [session], '2026-09-17').muscles.find((item) => item.muscle === 'Lats')?.rolling7DaySets).toBe(0)
    expect(classifyPreference(id, defaultPreferences)).toBe('neutral')
    expect(baseline.plannedExercises).toHaveLength(2)
  })

  it('keeps isolated weakness distinct from repeated comparable regression', () => {
    const first = ordinary([8, 8, 8], '2026-09-07')
    const productive = ordinary([12, 12, 12], '2026-09-10')
    const weak = ordinary([10, 10, 10], '2026-09-13')
    expect(analyze(weak, [first, productive]).exercises[0]).toMatchObject({ performance: 'isolated-underperformance', progressionState: 'stable' })
    const repeated = ordinary([8, 8, 8])
    expect(analyze(repeated, [first, productive, weak]).exercises[0]).toMatchObject({ performance: 'repeated-underperformance', progressionState: 'regressing' })
    expect(analyze(repeated, [weak, first, productive])).toEqual(analyze(repeated, [first, productive, weak]))
    expect(analyze(ordinary([10], '2026-09-14'), [weak]).exercises[0].performance).toBe('stable')
  })

  it.each([[10, 'demonstrated'], [5, 'not-supported']] as const)('links accepted progression to %s-rep execution', (reps, status) => {
    const recommendation = progression(); const decision = decide(recommendation)
    const session = completed(createWorkoutSessionForToday(plan(), [recommendation], exercises, 'lb', [decision]), sets([reps], 105))
    const result = analyze(session)
    expect(result.exercises[0].prescription?.loadRecommendation).toMatchObject({ weight: 105 })
    expect(result.recommendationOutcomes[0]).toMatchObject({ recommendationId: recommendation.id, decisionId: decision.id, source: 'accepted-recommendation', applied: true, status })
    expect(result.exercises[0].status).toBe('partial') // Load evidence never requires completing all sets.
    expect(deriveTrainingState(exercises, [session], '2026-09-17').outcomes[0].recommendationOutcomes).toEqual(result.recommendationOutcomes)
  })

  it('does not infer failed load ability when a different, lighter load was chosen', () => {
    const recommendation = progression()
    const session = completed(createWorkoutSessionForToday(plan(), [recommendation], exercises, 'lb', [decide(recommendation)]), sets([10, 10], 100))
    expect(analyze(session).recommendationOutcomes[0].status).toBe('different-execution')
  })

  it('does not apply rejected progression, but retains the decision and actual original execution', () => {
    const recommendation = progression(); const decision = decide(recommendation, 'rejected')
    const result = analyze(completed(createWorkoutSessionForToday(plan(), [recommendation], exercises, 'lb', [decision])))
    expect(result.exercises[0].prescription?.loadRecommendation).toMatchObject({ weight: 100 })
    expect(result.recommendationOutcomes[0]).toMatchObject({ source: 'rejected-recommendation', applied: false, status: 'not-applied', executedExerciseIds: [id] })
  })

  it('does not treat a prior acceptance as acceptance of a newly changed load proposal', () => {
    const old = progression(); const next = { ...progression(), change: { ...progression().change, kind: 'progression' as const, recommendedLoad: 115, repRange: { min: 8, max: 12 } } }
    const session = createWorkoutSessionForToday(plan(), [next], exercises, 'lb', [decide(old)])
    expect(session.plannedExercises![0].loadRecommendation).toMatchObject({ weight: 100 })
    expect(session.prescriptionChanges![0].applied).toBe(false)
    expect(decisionForRecommendation(next, [decide(old)], plan().id, 'lb')).toBeUndefined()
  })

  it('leaves incomplete legacy snapshots unknown instead of inventing prescription defaults', () => {
    const session = normalizeWorkoutSession({ id: 'legacy', date: '2026-09-16', title: 'Old workout', plannedExercises: [{ exerciseId: id }], sets: sets() })
    expect(analyze(session).exercises[0]).toMatchObject({ status: 'ad-hoc', completion: 'unplanned', targetRange: { status: 'unknown' } })
    expect(analyze(session).exercises[0].prescription).toBeUndefined()
  })

  it('links an accepted replacement even after acceptance has already updated the saved plan', () => {
    const replacement: Recommendation = { ...progression(), id: 'replace', type: 'REPLACE', change: { kind: 'replace', fromExerciseId: id, toExerciseId: 'cable-row' }, trace: buildTrace('replace-on-stall') }
    const decision = decide(replacement)
    const updated = applyAcceptedRecommendation(plan(), replacement, exercises)
    const session = completed(createWorkoutSessionForToday(updated, [], exercises, 'lb', [decision]), sets([10, 10, 10], 90, 'cable-row'))
    expect(analyze(session).recommendationOutcomes[0]).toMatchObject({ source: 'accepted-recommendation', applied: true, status: 'executed', executedExerciseIds: ['cable-row'] })
    expect(session.prescriptionChanges![0].before[0].exerciseId).toBe(id)
  })

  it('retains replacement attribution when a later time adaptation reduces its sets', () => {
    const replacement: Recommendation = { ...progression(), id: 'replace', type: 'REPLACE', change: { kind: 'replace', fromExerciseId: id, toExerciseId: 'cable-row' }, trace: buildTrace('replace-on-stall') }
    const decision = decide(replacement)
    const updated = applyAcceptedRecommendation(plan(), replacement, exercises)
    const trim: Recommendation = { ...progression(), id: 'time', type: 'MODIFY', target: { kind: 'exercise', exerciseId: 'cable-row' }, change: { kind: 'modify', exerciseId: 'cable-row', changes: { sets: 1 } }, trace: buildTrace('adapt-available-time') }
    const session = completed(createWorkoutSessionForToday(updated, [trim], exercises, 'lb', [decision]), sets([10], 90, 'cable-row'))
    expect(analyze(session).recommendationOutcomes).toContainEqual(expect.objectContaining({ recommendationId: replacement.id, applied: true, status: 'executed' }))
  })

  it('keeps rejection distinct from a mandatory equipment adaptation', () => {
    const replacement: Recommendation = { ...progression(), id: 'equipment', type: 'REPLACE', change: { kind: 'replace', fromExerciseId: id, toExerciseId: 'cable-row' }, trace: buildTrace('adapt-unavailable-equipment') }
    const decision = decide(replacement, 'rejected')
    const session = completed(createWorkoutSessionForToday(plan(), [replacement], exercises, 'lb', [decision]), sets([10, 10, 10], 90, 'cable-row'))
    const result = analyze(session).recommendationOutcomes
    expect(result).toContainEqual(expect.objectContaining({ source: 'equipment', applied: true, status: 'executed' }))
    expect(result).toContainEqual(expect.objectContaining({ decisionId: decision.id, source: 'rejected-recommendation', applied: false, status: 'not-applied' }))
  })

  it.each([true, false])('links accepted additional work, performed=%s', (performed) => {
    const addition: Recommendation = { ...progression(), id: 'add', type: 'ADD', target: { kind: 'exercise', exerciseId: 'dumbbell-curl' }, change: { kind: 'add', exerciseId: 'dumbbell-curl', sets: 2, repRange: { min: 8, max: 12 } }, trace: buildTrace('add-for-priority-volume') }
    const decision = decide(addition)
    const session = completed(createWorkoutSessionForToday(applyAcceptedRecommendation(plan(), addition), [], exercises, 'lb', [decision]), [...sets(), ...(performed ? sets([10, 10], 20, 'dumbbell-curl') : [])])
    expect(analyze(session).recommendationOutcomes[0]).toMatchObject({ applied: true, status: performed ? 'executed' : 'skipped' })
  })

  it('analyzes generated workouts and substitutions without fabricated recommendation decisions', () => {
    const request = { exercises, history: [], preferences: defaultPreferences, asOf: '2026-09-16', todaysContext: { gymId: 'gym', unavailableEquipment: [] } }
    const initial = generateRecommendedWorkout(request)
    const originalId = initial.workout.exerciseIds[0]
    const revised = skipRecommendedExercise(request, initial, originalId).recommendation
    const session = completed({ ...createWorkoutSession(revised.workout, undefined, 'lb'), prescriptionChanges: revised.prescriptionChanges }, revised.workout.plannedExercises!.flatMap((slot) => sets(Array(slot.sets).fill(slot.repRange.min), 20, slot.exerciseId)))
    expect(analyze(session)).toMatchObject({ planningAuthority: 'recommended', completion: 'complete' })
    expect(analyze(session).recommendationOutcomes[0]).toMatchObject({ source: 'generated-substitution', applied: true })
    expect(analyze(session).recommendationOutcomes[0].decisionId).toBeUndefined()
    expect(analyze(completed(createWorkoutSession(initial.workout), []))).toMatchObject({ recommendationOutcomes: [] })
  })

  it('never promotes warm-up, drop, or failure sets into normal load outcome evidence', () => {
    const recommendation = progression()
    const mixed = sets([12, 12, 12], 200).map((set, index) => ({ ...set, setType: (['warm-up', 'drop', 'failure'] as const)[index] }))
    const session = completed(createWorkoutSessionForToday(plan(), [recommendation], exercises, 'lb', [decide(recommendation)]), mixed)
    expect(analyze(session).exercises[0]).toMatchObject({ workingSets: [], performance: 'not-performed' })
    expect(analyze(session).exercises[0].demonstratedWorkingLoad).toBeUndefined()
    expect(analyze(session).recommendationOutcomes[0].status).toBe('skipped')
  })

  it('freezes provenance and prescriptions across reload and changes to plans, defaults, and decisions', () => {
    const baseline = plan(); const recommendation = progression(); const record = decide(recommendation)
    saveRecommendationDecision(recommendation, 'accepted', { planId: baseline.id, unit: 'lb', prescriptionBefore: record.prescriptionBefore, prescriptionAfter: record.prescriptionAfter })
    const session = createWorkoutSessionForToday(baseline, [recommendation], exercises, 'lb', loadRecommendationDecisions())
    const original = structuredClone(session)
    baseline.plannedExercises![0].repRange.min = 1
    record.prescriptionAfter![0].sets = 99
    recommendation.reason = 'Changed later'
    saveActiveWorkoutSession(session)
    expect(loadActiveWorkoutSession()).toEqual(original)
    const changedCatalog = exercises.map((exercise) => ({ ...exercise, defaultSets: 10, repRange: { min: 1, max: 3 } }))
    expect(analyzeWorkoutSession(completed(loadActiveWorkoutSession()!), [], changedCatalog)!.exercises[0].prescription).toEqual(original.plannedExercises![0])
  })

  it('rederives outcomes after edits and deletion without persisting a second set ledger', () => {
    const previous = ordinary([12, 12, 12], '2026-09-13'); const current = ordinary([10, 10, 10])
    let history = saveWorkout(current, [previous])
    expect(deriveTrainingState(exercises, history, '2026-09-17').outcomes.at(-1)!.exercises[0].performance).toBe('isolated-underperformance')
    history = updateWorkout({ ...current, sets: sets([12, 12, 12]) }, history)
    expect(deriveTrainingState(exercises, history, '2026-09-17').outcomes.at(-1)!.exercises[0].performance).toBe('stable')
    history = deleteWorkout(previous.id, history)
    expect(deriveTrainingState(exercises, history, '2026-09-17').outcomes.at(-1)!.exercises[0].performance).toBe('baseline')
    history = deleteWorkout(current.id, history)
    expect(deriveTrainingState(exercises, history, '2026-09-17').outcomes).toEqual([])
    expect(localStorage.getItem('bobby-bulk-workouts')).not.toContain('recommendationOutcomes')
  })
})
