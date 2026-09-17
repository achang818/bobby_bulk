import { describe, expect, it, vi } from 'vitest'
import { exercises } from '../domain/exercises'
import { defaultPreferences } from '../domain/preferences'
import { generateRecommendationsWithTrace, resolveConcreteConflicts, type RecommendationInput, type CandidateSuppression, type RecommendationConflictContext } from '../domain/recommendations'
import { generateRecommendedWorkout } from '../domain/recommended-workout'
import { deriveTrainingState } from '../domain/training-state'
import * as features from '../domain/features'
import { evaluateSplit } from '../domain/split-evaluator'
import { buildTrace } from '../domain/rules'
import { createPlannedExercise, createWorkoutSessionForToday } from '../domain/workout-session'
import { estimateTypicalDuration } from '../domain/adaptation'
import type { ExerciseRecommendationCandidate, RecommendationCandidate, Workout, WorkoutTemplate } from '../domain/models'

const curl = exercises.find((exercise) => exercise.id === 'dumbbell-curl')!
const row = exercises.find((exercise) => exercise.id === 'cable-row')!
const asOf = '2026-09-16'
const plan = (ids = [curl.id]): WorkoutTemplate => ({ id: 'mine', name: 'My workout', focus: '', description: '', planningAuthority: 'user-plan', exerciseIds: ids,
  plannedExercises: ids.map((id, order) => ({ ...createPlannedExercise(id, order, exercises.find((exercise) => exercise.id === id)), sets: 3 })),
})
const session = (id: string, date: string, reps = curl.repRange.max, count = 1, exerciseId = curl.id): Workout => ({ id, date, title: 'Actual work', status: 'completed', unit: 'lb',
  sets: Array.from({ length: count }, (_, index) => ({ id: `${id}-${index}`, exerciseId, setType: 'working', weight: 20, reps })),
})
const progressing = () => [session('earlier', '2026-09-10', curl.repRange.min), session('latest', '2026-09-13')]
const input = (overrides: Partial<RecommendationInput> = {}): RecommendationInput => ({
  plan: plan(), exercises, history: progressing(), asOf,
  preferences: { ...defaultPreferences, priorities: ['Biceps'], goals: ['Build muscle'] },
  todaysContext: { gymId: 'gym', availableEquipment: ['dumbbells', 'barbells', 'cables', 'machines', 'benches', 'pull-up-bar'], unavailableEquipment: [] }, ...overrides,
})
const decision = (overrides: Partial<RecommendationInput> = {}) => generateRecommendationsWithTrace(input(overrides))
const conflictContext = (request: RecommendationInput): RecommendationConflictContext => ({ plan: request.plan, exercises: request.exercises,
  todaysContext: request.todaysContext, trainingState: decision(request).trainingState })
const candidate = (id: string, type: ExerciseRecommendationCandidate['type'], extra: Partial<ExerciseRecommendationCandidate> = {}): ExerciseRecommendationCandidate => ({ id, type, exerciseId: curl.id, score: 4, reasons: [id], trace: buildTrace('keep-stable-exercise'), ...extra })

describe('state-aware unified decision engine', () => {
  it.each([['yesterday', '2026-09-15', 1], ['high direct volume', '2026-09-13', 20]] as const)('defers optional priority ADD after %s training', (_, date, count) => {
    const result = decision({ plan: plan([]), history: [session('recent', date, 10, count)] })
    expect(result.recommendations.some((item) => item.type === 'ADD')).toBe(false)
    expect(result.suppressed).toContainEqual(expect.objectContaining({ code: 'recovery', reason: expect.stringContaining('recent direct work') }))
  })

  it('strengthens undertrained priority ADD and proposes a bounded MODIFY within an existing slot', () => {
    const unknown = decision({ plan: plan([]), history: [] }).recommendations.find((item) => item.type === 'ADD')!
    const known = decision({ plan: plan([]), history: [session('sparse', '2026-09-13', 10)] }).recommendations.find((item) => item.type === 'ADD')!
    expect(known.priority).toBeGreaterThan(unknown.priority)
    expect(known.reason).toContain('1 direct working sets')
    const baseline = plan(); baseline.plannedExercises![0].sets = 1
    const original = structuredClone(baseline)
    const result = decision({ plan: baseline, history: [session('sparse', '2026-09-13', 10)] })
    expect(result.recommendations).toContainEqual(expect.objectContaining({ type: 'MODIFY', change: { kind: 'modify', exerciseId: curl.id, changes: { sets: 2 } } }))
    expect(baseline).toEqual(original)
    expect(decision({ plan: baseline, history: [session('yesterday', '2026-09-15', 10)] }).recommendations.some((item) => item.type === 'MODIFY')).toBe(false)
  })

  it('preserves supported PROGRESSION when recovery and effort do not oppose it', () => {
    const result = decision()
    expect(result.recommendations).toContainEqual(expect.objectContaining({ type: 'PROGRESSION', change: { kind: 'progression', recommendedLoad: 22.5, repRange: curl.repRange } }))
    expect(result.recommendations).toContainEqual(expect.objectContaining({ type: 'KEEP', trace: expect.objectContaining({ ruleId: 'keep-stable-exercise' }) }))
  })

  it('honors near-failure working effort beyond the best set and explains conversion to KEEP', () => {
    const history = progressing()
    history[1].sets[0].rir = 3
    history[1].sets.push({ ...history[1].sets[0], id: 'hard', reps: curl.repRange.min, rir: 0 })
    const request = input({ history })
    const result = decision(request)
    expect(result.recommendations.some((item) => item.type === 'PROGRESSION')).toBe(false)
    expect(result.recommendations).toContainEqual(expect.objectContaining({ type: 'KEEP', reason: expect.stringContaining('near-failure'), trace: expect.objectContaining({ ruleId: 'keep-for-effort' }) }))
    expect(result.suppressed).toContainEqual(expect.objectContaining({ code: 'near-failure', winnerId: expect.stringContaining('state-keep') }))
    const generated = generateRecommendedWorkout({ ...request, exercises: [curl] })
    expect(generated.workout.plannedExercises![0].loadRecommendation).toMatchObject({ kind: 'target', weight: 20, action: 'progress-reps' })
  })

  it('ignores non-working effort and gives RIR precedence over RPE', () => {
    const history = progressing()
    history[1].sets[0] = { ...history[1].sets[0], rir: 3, rpe: 10 }
    history[1].sets.push({ ...history[1].sets[0], id: 'failure', setType: 'failure', rir: 0 })
    expect(decision({ history }).recommendations.some((item) => item.type === 'PROGRESSION')).toBe(true)
  })

  it('lets productive performance beat optional variation even if variation has a higher priority', () => {
    const keep = candidate('keep', 'KEEP')
    const variation = candidate('variation', 'REPLACE', { alternativeExerciseId: 'hammer-curl', score: 99, trace: buildTrace('replace-on-stall') })
    const suppressed: CandidateSuppression[] = []
    expect(resolveConcreteConflicts([variation, keep], conflictContext(input()), (item) => suppressed.push(item))).toEqual([keep])
    expect(suppressed).toEqual([expect.objectContaining({ candidateId: 'variation', code: 'productive-progression' })])
  })

  it('keeps hard equipment constraints above preference, productive history, and near-failure KEEP', () => {
    const request = input({ preferences: { ...input().preferences, preferredExerciseIds: [curl.id] }, todaysContext: { ...input().todaysContext, unavailableEquipment: ['dumbbells'] } })
    const result = decision(request)
    expect(result.recommendations.filter((item) => item.target.kind === 'exercise' && item.target.exerciseId === curl.id)).toEqual([expect.objectContaining({ type: 'REPLACE', trace: expect.objectContaining({ ruleId: 'adapt-unavailable-equipment' }) })])
    const equipment = result.candidates.find((item) => item.trace.ruleId === 'adapt-unavailable-equipment')!
    const suppressed: CandidateSuppression[] = []
    expect(resolveConcreteConflicts([candidate('preferred', 'KEEP', { score: 100 }), equipment], conflictContext(request), (item) => suppressed.push(item))).toEqual([equipment])
    expect(suppressed[0]).toMatchObject({ code: 'equipment', winnerId: equipment.id })
  })

  it('trims lower-value work before a recovered high-priority isolation slot', () => {
    const result = decision({ plan: plan([row.id, curl.id]), todaysContext: { ...input().todaysContext, availableMinutes: 19 } })
    const time = result.recommendations.filter((item) => item.trace.ruleId === 'adapt-available-time')
    expect(time).toEqual([expect.objectContaining({ type: 'MODIFY', target: { kind: 'exercise', exerciseId: row.id } })])
    const recovering = decision({ plan: plan([row.id, curl.id]), history: [session('yesterday', '2026-09-15')], todaysContext: { ...input().todaysContext, availableMinutes: 19 } })
    expect(recovering.recommendations.filter((item) => item.trace.ruleId === 'adapt-available-time')).toEqual([expect.objectContaining({ target: { kind: 'exercise', exerciseId: curl.id } })])
  })

  it('retains time reductions alongside equipment substitutions and respects the final time budget', () => {
    const baseline = plan([curl.id, row.id]); const original = structuredClone(baseline)
    const result = decision({ plan: baseline, todaysContext: { ...input().todaysContext, unavailableEquipment: ['dumbbells'], availableMinutes: 8 } })
    expect(result.recommendations.some((item) => item.type === 'REPLACE')).toBe(true)
    expect(result.recommendations.some((item) => item.type === 'MODIFY')).toBe(true)
    const session = createWorkoutSessionForToday(baseline, result.recommendations, exercises, 'lb')
    expect(estimateTypicalDuration({ ...baseline, plannedExercises: session.plannedExercises }, exercises)).toBeLessThanOrEqual(8)
    expect(baseline).toEqual(original)
  })

  it('removes a lower-ranked slot before reducing higher-value working sets', () => {
    const result = decision({ plan: plan([row.id, curl.id]), todaysContext: { ...input().todaysContext, availableMinutes: 11 } })
    const time = result.recommendations.filter((item) => item.trace.ruleId === 'adapt-available-time')
    expect(time).toEqual([expect.objectContaining({ type: 'REMOVE', target: { kind: 'exercise', exerciseId: row.id } })])
    const session = createWorkoutSessionForToday(plan([row.id, curl.id]), result.recommendations, exercises, 'lb')
    expect(session.plannedExercises).toEqual([expect.objectContaining({ exerciseId: curl.id, sets: 3 })])
  })

  it('accounts for recent actual work outside the split without adding it to planned frequency', () => {
    const workouts = [plan([]), { ...plan([]), id: 'second' }, { ...plan([]), id: 'third' }]
    const split = { id: 'split', name: 'Owned split', workoutIds: workouts.map((item) => item.id) }
    const without = decision({ history: [], split, splitWorkouts: workouts })
    expect(without.recommendations.some((item) => item.type === 'SPLIT')).toBe(true)
    const history = ['2026-09-09', '2026-09-11', '2026-09-13'].map((date) => session(date, date))
    const withActual = decision({ history, split, splitWorkouts: workouts })
    expect(withActual.recommendations.some((item) => item.type === 'SPLIT')).toBe(false)
    expect(withActual.suppressed).toContainEqual(expect.objectContaining({ code: 'recent-frequency' }))
    expect(withActual.candidates.find((item) => item.type === 'SPLIT')).toMatchObject({ plannedFrequency: 0, desiredFrequency: 3 })
    expect(evaluateSplit(split, workouts, exercises, input().preferences, withActual.trainingState).findings).toContainEqual(expect.objectContaining({ severity: 'info', title: 'Biceps has recent direct work' }))
  })

  it('derives exactly one shared snapshot at each composition boundary, or uses the supplied one', () => {
    const derive = vi.spyOn(features, 'calculateExerciseFeatures')
    try {
      const request = input()
      const result = decision(request)
      expect(derive).toHaveBeenCalledTimes(exercises.length)
      const state = result.trainingState
      derive.mockClear()
      expect(decision({ ...request, trainingState: state }).trainingState).toBe(state)
      const generated = generateRecommendedWorkout({ ...request, trainingState: state })
      expect(derive).not.toHaveBeenCalled()
      expect(generated).toEqual(generateRecommendedWorkout(request))
      expect(derive).toHaveBeenCalledTimes(exercises.length)
      expect(state).toEqual(deriveTrainingState(exercises, request.history, asOf, request.preferences.weightUnit, request.preferences.priorities))
      expect(() => decision({ ...request, asOf: '2026-09-17', trainingState: state })).toThrow('date/unit')
      expect(() => decision({ ...request, preferences: { ...request.preferences, weightUnit: 'kg' }, trainingState: state })).toThrow('date/unit')
    } finally { derive.mockRestore() }
  })

  it('resolves permutations identically and records every suppressed candidate', () => {
    const request = input({ plan: plan([curl.id, row.id]), todaysContext: { ...input().todaysContext, availableMinutes: 22 } })
    const candidates: RecommendationCandidate[] = [
      candidate('keep', 'KEEP'), candidate('duplicate', 'KEEP'),
      candidate('variation', 'REPLACE', { alternativeExerciseId: 'hammer-curl', trace: buildTrace('replace-on-stall') }),
      candidate('extra', 'ADD', { exerciseId: 'cable-crunch', score: 9, trace: buildTrace('add-for-priority-volume') }),
      candidate('more-sets', 'MODIFY', { modifiedSets: 4, trace: buildTrace('modify-for-priority-volume') }),
    ]
    const resolve = (items: RecommendationCandidate[]) => {
      const suppressed: CandidateSuppression[] = []
      return { candidates: resolveConcreteConflicts(items, conflictContext(request), (item) => suppressed.push(item)), suppressed }
    }
    const expected = resolve(candidates)
    expect(expected.suppressed.map((item) => item.code)).toEqual(expect.arrayContaining(['productive-progression', 'duplicate', 'time-limit']))
    expect(expected.candidates.length + expected.suppressed.length).toBe(candidates.length)
    for (let index = 0; index < candidates.length; index++) {
      const rotated = [...candidates.slice(index), ...candidates.slice(0, index)]
      expect(resolve(rotated)).toEqual(expected)
      expect(resolve(rotated.reverse())).toEqual(expected)
    }
  })

  it('changes decisions on completion, edits, and deletion only through rederived evidence', () => {
    const draft = { ...session('new', '2026-09-15'), status: 'in-progress' as const }
    const request = input({ plan: plan([]), history: [] })
    const original = decision(request)
    expect(decision({ ...request, history: [draft] }).recommendations).toEqual(original.recommendations)
    const completed = { ...draft, status: 'completed' as const }
    expect(decision({ ...request, history: [completed] }).recommendations).not.toEqual(original.recommendations)
    // Downstream consumers cannot peek at changed raw history behind a supplied state.
    expect(decision({ ...request, history: [completed], trainingState: original.trainingState }).recommendations).toEqual(original.recommendations)
    expect(decision({ ...request, history: [{ ...completed, sets: [] }] }).recommendations).toEqual(original.recommendations)
    expect(decision({ ...request, history: [] }).recommendations).toEqual(original.recommendations)
  })

  it('handles legacy, no-history, future sessions, and mixed units conservatively', () => {
    expect(decision({ history: [] }).recommendations.some((item) => item.type === 'PROGRESSION')).toBe(false)
    const legacy = { ...session('legacy', '2026-09-13', curl.repRange.min), status: undefined, unit: undefined }
    const result = decision({ history: [legacy] })
    expect(result.trainingState.exercises.find((item) => item.exerciseId === curl.id)?.mostRecentPerformance?.completion).toBe('unplanned')
    expect(result.recommendations).toEqual(decision({ history: [legacy, session('future', '2026-10-01', 12, 20)] }).recommendations)
    const metric = { ...legacy, unit: 'kg' as const, sets: legacy.sets.map((set) => ({ ...set, weight: 10 })) }
    expect(decision({ history: [metric] }).recommendations.find((item) => item.type === 'PROGRESSION')?.change).toMatchObject({ recommendedLoad: 22 })
  })
})
