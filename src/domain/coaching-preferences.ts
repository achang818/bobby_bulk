import type { Exercise, ExerciseLoadRecommendation, HistoryConfidence, PlannedExercise, Recommendation, RecommendationDecision, TodaysContext, TrainingState, UserPreferences } from './models'
import type { PostWorkoutAnalysis } from './workout-analysis'
import { classifyPreference } from './states'
import { convertWeight } from './units'

export type BehavioralPreference = 'neutral' | 'continuity-favored' | 'variation-tolerant' | 'recommend-less-evidence'
export interface PreferenceFact {
  kind: 'rejected-optional-replacement' | 'rejected-optional-removal' | 'accepted-continuity' | 'rejected-optional-add' | 'accepted-optional-replacement' | 'voluntary-skip' | 'productive-performance'
  sourceId: string
  date?: string
  strength: 'explicit-choice' | 'legacy' | 'supporting'
}
export interface ExercisePreferenceEvidence {
  exerciseId: string
  state: BehavioralPreference
  confidence: HistoryConfidence
  facts: PreferenceFact[]
  reasons: string[]
}
export interface RecommendationLearning {
  pathway: string
  exerciseId: string
  supportedSessionIds: string[]
  unsupportedSessionIds: string[]
  deferRepeat: boolean
  reason: string
}
export interface CoachingPreferenceState {
  asOf: string
  exercises: ExercisePreferenceEvidence[]
  recommendationLearning: RecommendationLearning[]
}

const age = (date: string, asOf: string) => (Date.parse(asOf.slice(0, 10)) - Date.parse(date.slice(0, 10))) / 86400000
export const isContextRecommendation = (rec: Recommendation) => ['adapt-unavailable-equipment', 'adapt-available-time'].includes(rec.trace.ruleId)

/** Rolling 90-day evidence; at most one choice per exercise/direction/day.
 * Two independent explicit choices establish a direction, four make it strong.
 * Undated legacy choices remain inspectable but never establish a direction.
 */
export function deriveCoachingPreferences(state: TrainingState, decisions: RecommendationDecision[] = []): CoachingPreferenceState {
  const facts = new Map<string, PreferenceFact[]>()
  const add = (id: string, fact: PreferenceFact) => {
    if (!state.exercises.some((exercise) => exercise.exerciseId === id)) return
    if (fact.date && !(age(fact.date, state.asOf) >= 0 && age(fact.date, state.asOf) <= 90)) return
    facts.set(id, [...(facts.get(id) ?? []), fact])
  }
  // Last response per proposal and day, with a deterministic tie-breaker.
  const choices = new Map<string, RecommendationDecision>()
  for (const decision of [...decisions].sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? '') || a.id.localeCompare(b.id) || JSON.stringify(a).localeCompare(JSON.stringify(b)))) {
    choices.set(`${decision.planId ?? ''}:${decision.recommendationId}:${decision.timestamp?.slice(0, 10) ?? 'legacy'}`, decision)
  }
  for (const decision of choices.values()) {
    const rec = decision.recommendation
    if (decision.decision === 'dismissed' || (rec && isContextRecommendation(rec))) continue
    let kind: PreferenceFact['kind'] | undefined
    if (decision.decision === 'rejected') {
      if (decision.recommendationType === 'REPLACE') kind = 'rejected-optional-replacement'
      if (decision.recommendationType === 'REMOVE') kind = 'rejected-optional-removal'
      if (decision.recommendationType === 'ADD') kind = 'rejected-optional-add'
    } else if (rec && decision.decision === 'accepted') {
      if (rec.type === 'KEEP') kind = 'accepted-continuity'
      if (rec.type === 'REPLACE') kind = 'accepted-optional-replacement'
    }
    if (kind) add(decision.exerciseId, { kind, sourceId: decision.id, date: decision.timestamp?.slice(0, 10), strength: rec && decision.timestamp ? 'explicit-choice' : 'legacy' })
  }
  for (const outcome of state.outcomes) {
    for (const exercise of outcome.exercises) {
      if (exercise.prescription?.setType !== 'working') continue
      if (exercise.status === 'skipped' && outcome.exerciseOmissions?.some((item) => item.exerciseId === exercise.exerciseId && item.reason === 'voluntary')
        && !outcome.prescriptionChanges?.some((change) => ['equipment', 'time', 'generated-substitution'].includes(change.source) && [...change.before, ...change.after].some((slot) => slot.exerciseId === exercise.exerciseId))) {
        add(exercise.exerciseId, { kind: 'voluntary-skip', sourceId: outcome.sessionId, date: outcome.date, strength: 'explicit-choice' })
      }
      if (exercise.workingSets.length > 0 && ['improved', 'stable'].includes(exercise.performance)) {
        add(exercise.exerciseId, { kind: 'productive-performance', sourceId: outcome.sessionId, date: outcome.date, strength: 'supporting' })
      }
    }
  }
  const exercises = [...state.exercises].sort((a, b) => a.exerciseId.localeCompare(b.exerciseId)).map(({ exerciseId }): ExercisePreferenceEvidence => {
    const evidence = (facts.get(exerciseId) ?? []).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.kind.localeCompare(b.kind) || a.sourceId.localeCompare(b.sourceId))
    const count = (kinds: PreferenceFact['kind'][]) => new Set(evidence.filter((fact) => fact.strength === 'explicit-choice' && kinds.includes(fact.kind)).map((fact) => fact.date)).size
    const continuity = count(['rejected-optional-replacement', 'rejected-optional-removal', 'accepted-continuity'])
    const avoidance = count(['rejected-optional-add', 'voluntary-skip'])
    const variation = count(['accepted-optional-replacement'])
    const directions = [continuity, avoidance, variation]
    const dominant = Math.max(...directions)
    const inferred = dominant >= 2 && directions.filter((value) => value === dominant).length === 1
    const behavioral: BehavioralPreference = !inferred ? 'neutral' : dominant === continuity ? 'continuity-favored' : dominant === avoidance ? 'recommend-less-evidence' : 'variation-tolerant'
    const confidence = inferred ? dominant >= 4 && directions.filter((value) => value > 0).length === 1 ? 'strong' : 'moderate' : evidence.some((fact) => fact.strength !== 'supporting') ? 'limited' : 'none'
    const reasons = [...new Set(evidence.map((fact) => fact.kind))].map((kind) => `${evidence.filter((fact) => fact.kind === kind).length} ${kind.replaceAll('-', ' ')} record(s).`)
    if (behavioral === 'neutral' && evidence.length) reasons.push('Insufficient or conflicting independent choices; no selection bias.')
    return { exerciseId, state: behavioral, confidence, facts: evidence, reasons }
  })
  return { asOf: state.asOf, exercises, recommendationLearning: deriveRecommendationLearning(state.outcomes, state.asOf) }
}

export function behavioralBias(id: string, coaching?: CoachingPreferenceState) {
  return behavioralStateBias(coaching?.exercises.find((item) => item.exerciseId === id)?.state)
}

export function behavioralStateBias(state?: BehavioralPreference) { return state === 'continuity-favored' ? 1 : state === 'recommend-less-evidence' ? -1 : 0 }

export function calibrateProgressionLoad(load: ExerciseLoadRecommendation, slot: PlannedExercise, coaching: CoachingPreferenceState): ExerciseLoadRecommendation {
  if (load.kind !== 'target') return load
  const pathway = `${slot.exerciseId}:${Math.round(convertWeight(load.weight, load.unit, 'lb') * 10) / 10}:${slot.repRange.min}:${slot.repRange.max}`
  const evidence = coaching.recommendationLearning.find((item) => item.pathway === pathway && item.deferRepeat)
  return evidence ? { kind: 'choose-load', unit: load.unit, reason: `${evidence.reason} Choose a manageable working load today.` } : load
}

export function compareCoachingPreference(left: string, right: string, preferences: UserPreferences, coaching?: CoachingPreferenceState) {
  const rank = (id: string) => { const value = classifyPreference(id, preferences); return value === 'preferred' ? 2 : value === 'neutral' ? 1 : value === 'recommend-less' ? 0 : -1 }
  return rank(right) - rank(left) || behavioralBias(right, coaching) - behavioralBias(left, coaching)
}

export function progressionPathway(rec: Recommendation, unit: 'lb' | 'kg') {
  if (rec.change.kind !== 'progression' || rec.change.recommendedLoad === undefined || rec.target.kind !== 'exercise') return undefined
  return `${rec.target.exerciseId}:${Math.round(convertWeight(rec.change.recommendedLoad, unit, 'lb') * 10) / 10}:${rec.change.repRange.min}:${rec.change.repRange.max}`
}

function deriveRecommendationLearning(outcomes: PostWorkoutAnalysis[], asOf: string): RecommendationLearning[] {
  const pathways = new Map<string, { exerciseId: string; events: { id: string; date: string; supported: boolean }[] }>()
  for (const outcome of [...outcomes].sort((a, b) => a.date.localeCompare(b.date) || (a.completedAt ?? '').localeCompare(b.completedAt ?? '') || a.sessionId.localeCompare(b.sessionId))) {
    if (!(age(outcome.date, asOf) >= 0 && age(outcome.date, asOf) <= 90)) continue
    for (const result of outcome.recommendationOutcomes) {
      const change = outcome.prescriptionChanges?.find((item) => item.id === result.changeId)
      if (!change?.recommendation || change.decision?.decision !== 'accepted' || !result.applied || !['demonstrated', 'not-supported'].includes(result.status)) continue
      const pathway = progressionPathway(change.recommendation, change.unit)
      if (!pathway || change.recommendation.target.kind !== 'exercise') continue
      const entry = pathways.get(pathway) ?? { exerciseId: change.recommendation.target.exerciseId, events: [] }
      if (!entry.events.some((event) => event.id === outcome.sessionId)) entry.events.push({ id: outcome.sessionId, date: outcome.date, supported: result.status === 'demonstrated' })
      pathways.set(pathway, entry)
    }
  }
  return [...pathways].sort(([a], [b]) => a.localeCompare(b)).map(([pathway, { exerciseId, events }]) => {
    const latest = events.slice(-2)
    const deferRepeat = latest.length === 2 && latest.every((event) => !event.supported) && new Set(latest.map((event) => event.date)).size === 2 && age(latest[1].date, asOf) <= 14
    return { pathway, exerciseId, supportedSessionIds: events.filter((event) => event.supported).map((event) => event.id), unsupportedSessionIds: events.filter((event) => !event.supported).map((event) => event.id), deferRepeat,
      reason: deferRepeat ? 'Two independent attempts did not support this load and rep target. Defer repeating this progression for now; this says nothing about exercise preference.' : 'Accepted progression outcomes are tracked separately from exercise preference.' }
  })
}

/** The proposal identity ignores display text, ordering priority, and generated ID. */
export function recommendationSignature(rec: Recommendation) {
  return JSON.stringify([rec.type, rec.target, rec.change, rec.trace.ruleId])
}

/** Snapshot the conditions that can materially reopen a recently declined choice. */
export function recommendationFeedbackContext(rec: Recommendation, state: TrainingState, preferences: UserPreferences, context: TodaysContext, catalog: Exercise[]) {
  const ids = rec.change.kind === 'replace' ? [rec.change.fromExerciseId, rec.change.toExerciseId] : rec.target.kind === 'exercise' ? [rec.target.exerciseId] : []
  return JSON.stringify({ goals: [...preferences.goals].sort(), priorities: preferences.priorities,
    preferences: [preferences.preferredExerciseIds, preferences.recommendLessExerciseIds, preferences.excludedExerciseIds, preferences.dislikedExerciseIds].map((list) => [...list].sort()),
    equipment: [[...(context.availableEquipment ?? [])].sort(), [...(context.unavailableEquipment ?? [])].sort()], minutes: context.availableMinutes, gym: context.gymId,
    catalog: [...catalog].sort((a, b) => a.id.localeCompare(b.id)).map((exercise) => [exercise.id, exercise.equipment, exercise.primaryMuscles, exercise.goals]),
    history: ids.map((id) => { const exercise = state.exercises.find((item) => item.exerciseId === id); const best = exercise?.mostRecentPerformance?.bestWorkingSet;
      return [id, exercise?.progressionState, Math.floor((exercise?.sessionsPerformed ?? 0) / 2), best ? [best.weight, best.reps, best.rir, best.rpe] : null] }), unit: state.unit })
}

export function recentlyDeclined(rec: Recommendation, decisions: RecommendationDecision[], planId: string, asOf: string) {
  if (isContextRecommendation(rec) || ['KEEP', 'PROGRESSION'].includes(rec.type)) return false
  const matches = decisions.filter((decision) => (!decision.planId || decision.planId === planId) && decision.timestamp && age(decision.timestamp, asOf) >= 0
    && (decision.recommendation ? recommendationSignature(decision.recommendation) === recommendationSignature(rec) : decision.recommendationId === rec.id))
    .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? '') || b.id.localeCompare(a.id))
  const latest = matches[0]
  if (!latest || latest.decision !== 'rejected') return false
  const previous = latest.recommendation?.feedbackContext
  return age(latest.timestamp!, asOf) < (previous ? 14 : 3) && (!previous || previous === rec.feedbackContext)
}
