import { calculateExercisePerformance, comparePlannedVsActual, exercisePerformanceHistory } from './features'
import { classifyExerciseProgression, compareExercisePerformance } from './states'
import type { PerformanceComparison } from './states'
import { convertWeight } from './units'
import { compareWorkoutChronology } from './workout-session'
import type { Exercise, ExerciseLoadRecommendation, ExerciseProgressState, LoggedSet, PlannedExercise, PlanningAuthority, PrescriptionCompletion, SessionPrescriptionChange, WeightUnit, WorkoutSession } from './models'

export interface SessionExerciseAssessment {
  exerciseId: string
  name: string
  plannedSets?: number
  completedSets: number
  completion: PrescriptionCompletion
  signal: 'progress' | 'watch' | 'steady' | 'baseline' | 'inconclusive' | 'no-working-sets'
  message: string
  progressionState: ExerciseProgressState
  comparison?: PerformanceComparison
  previousSessionId?: string
  loadRecommendation?: ExerciseLoadRecommendation
}

export interface ExerciseOutcome extends SessionExerciseAssessment {
  prescription?: PlannedExercise
  unit: WeightUnit
  workingSets: LoggedSet[]
  status: 'completed' | 'partial' | 'skipped' | 'ad-hoc'
  targetRange: { status: 'achieved' | 'missed' | 'partial' | 'not-attempted' | 'unknown'; completedSets: number }
  loadOutcome: 'not-prescribed' | 'not-attempted' | 'matched' | 'higher' | 'lower' | 'mixed' | 'incomparable'
  demonstratedWorkingLoad?: number
  performance: 'improved' | 'stable' | 'isolated-underperformance' | 'repeated-underperformance' | 'inconclusive' | 'baseline' | 'not-performed'
  evidenceConfidence: 'none' | 'limited' | 'moderate'
  observations: string[]
}

export interface RecommendationOutcome {
  changeId: string
  recommendationId?: string
  decisionId?: string
  source: SessionPrescriptionChange['source']
  applied: boolean
  status: 'demonstrated' | 'not-supported' | 'different-execution' | 'executed' | 'partial' | 'skipped' | 'contextually-omitted' | 'not-applied'
  exerciseIds: string[]
  executedExerciseIds: string[]
  reason: string
}

export interface PostWorkoutAnalysis {
  prescriptionChanges?: SessionPrescriptionChange[]
  exerciseOmissions?: WorkoutSession['exerciseOmissions']
  sessionId: string
  date: string
  completedAt?: string
  planningAuthority: PlanningAuthority
  loggedSets: number
  workingSets: number
  plannedSets: number
  completedPlannedSets: number
  extraSets: number
  completion: 'complete' | 'partial' | 'unplanned'
  exercises: ExerciseOutcome[]
  recommendationOutcomes: RecommendationOutcome[]
  findings: string[]
  nextSession: string
}

export type WorkoutAnalysis = PostWorkoutAnalysis

/**
 * Derived from the saved prescription and real sets, so edits to history are
 * reflected immediately. It neither mutates plans nor persists stale verdicts.
 * Trend decisions use the same conservative comparison as future coaching.
 */
export function analyzeWorkoutSession(session: WorkoutSession, history: WorkoutSession[], catalog: Exercise[]): WorkoutAnalysis | undefined {
  if (session.status === 'in-progress') return undefined
  session = { ...session, sets: session.sets.filter(validSet) }
  const prior = history.filter((item) => isEarlierSession(item, session)).sort(compareWorkoutChronology)
  // Compare like units even when the user's display preference has changed.
  // Unitless legacy records use pounds, matching TrainingState.
  const normalized = [...prior, session].map((item) => ({
    ...item, unit: 'lb' as const,
    sets: item.sets.filter(validSet).map((set) => ({ ...set, weight: convertWeight(set.weight, item.unit ?? 'lb', 'lb') })),
  }))
  const current = normalized.at(-1)!
  const comparisons = comparePlannedVsActual(current)
  let plannedSets = 0
  let completedPlannedSets = 0
  const exercises = comparisons.map((planned): SessionExerciseAssessment => {
    const prescription = session.plannedExercises?.find((item) => item.exerciseId === planned.exerciseId)
    const matchingSets = session.sets.filter((set) => set.exerciseId === planned.exerciseId && set.setType === (prescription?.setType ?? 'working'))
    let completion = prescription && matchingSets.length === 0 ? 'not started' as const : planned.completion
    // Warm-up/drop/failure prescriptions count toward their own completion,
    // never as ordinary working-set evidence for progression.
    if (prescription && prescription.setType !== 'working') {
      const inRange = matchingSets.filter((set) => set.reps >= prescription.repRange.min && set.reps <= prescription.repRange.max).length
      completion = matchingSets.length === 0 ? 'not started' : matchingSets.length < prescription.sets ? 'partial' : inRange >= prescription.sets ? 'completed' : 'below target'
    }
    if (prescription) {
      plannedSets += prescription.sets
      completedPlannedSets += Math.min(prescription.sets, matchingSets.length)
    }
    const performance = calculateExercisePerformance(current, planned.exerciseId)
    const performances = exercisePerformanceHistory(planned.exerciseId, normalized).filter((item) => item.completedWorkingSets > 0)
    const previous = performances.filter((item) => item.sessionId !== session.id).at(-1)
    const progressionState = classifyExerciseProgression(performances)
    const base = {
      exerciseId: planned.exerciseId,
      name: catalog.find((exercise) => exercise.id === planned.exerciseId)?.name ?? planned.exerciseId,
      ...(prescription ? { plannedSets: prescription.sets, loadRecommendation: prescription.loadRecommendation } : {}),
      completedSets: matchingSets.length,
      completion, progressionState,
    }
    if (!performance?.completedWorkingSets) return { ...base, signal: 'no-working-sets', message: 'No ordinary working sets to compare. This is not a performance decline.' }
    if (!previous) return { ...base, signal: 'baseline', message: 'Working sets recorded as a baseline for your next session.' }
    if ([...previous.workingSets, ...performance.workingSets].some((set) => set.loadType && set.loadType !== 'external')) {
      return { ...base, progressionState: 'insufficient history', signal: 'inconclusive', message: 'Bodyweight and assistance are recorded, but load-based comparison needs historical bodyweight information that these sessions do not contain.' }
    }
    const comparison = compareExercisePerformance(previous, performance)
    const evidence = { ...base, comparison, previousSessionId: previous.sessionId }
    if (comparison.direction === 'improved') return { ...evidence, signal: 'progress', message: 'Improved on the previous session with comparable working-set evidence.' }
    if (comparison.direction === 'worse') return {
      ...evidence, signal: 'watch',
      message: progressionState === 'regressing'
        ? 'Two consecutive comparable results declined. Bobby will consider this trend when reviewing exercise fit.'
        : 'Below your previous comparable result. One weaker session is not a regression trend; keep monitoring.',
    }
    if (comparison.direction === 'unchanged') return { ...evidence, signal: 'steady', message: 'Comparable working-set performance held steady.' }
    return { ...evidence, signal: 'inconclusive', message: comparison.reasons[0] ?? 'Not enough comparable evidence to call this progress or regression.' }
  }).map((outcome) => describeExecution(outcome, session))
  const planningAuthority = session.planningAuthority ?? 'user-plan'
  const workingSets = session.sets.filter((set) => set.setType === 'working').length
  const trendNote = exercises.some((item) => item.signal === 'watch' && item.progressionState !== 'regressing')
    ? 'A single weaker session will not trigger a regression-based exercise replacement. '
    : ''
  return {
    prescriptionChanges: structuredClone(session.prescriptionChanges ?? []), exerciseOmissions: structuredClone(session.exerciseOmissions ?? []),
    sessionId: session.id, date: session.date, ...(session.completedAt ? { completedAt: session.completedAt } : {}), planningAuthority, loggedSets: session.sets.length, workingSets,
    plannedSets, completedPlannedSets,
    extraSets: session.sets.length - completedPlannedSets,
    completion: plannedSets === 0 ? 'unplanned' : completedPlannedSets >= plannedSets ? 'complete' : 'partial',
    exercises,
    recommendationOutcomes: (session.prescriptionChanges ?? []).map((change) => analyzeRecommendationOutcome(change, session)),
    findings: exercises.flatMap((outcome) => outcome.observations.map((observation) => `${outcome.name}: ${observation}`)),
    nextSession: trendNote + (planningAuthority === 'recommended'
      ? 'Your completed working sets and performance update the history Bobby uses to construct your next workout.'
      : 'Your completed working sets and performance inform future suggestions. Your saved plan changes only when you accept a change.'),
  }
}

function validSet(set: LoggedSet) { return Number.isFinite(set.weight) && set.weight >= 0 && Number.isFinite(set.reps) && set.reps > 0 }

function describeExecution(outcome: SessionExerciseAssessment, session: WorkoutSession): ExerciseOutcome {
  const prescription = session.plannedExercises?.find((slot) => slot.exerciseId === outcome.exerciseId)
  const workingSets = session.sets.filter((set) => set.exerciseId === outcome.exerciseId && set.setType === 'working')
  const unit = session.unit ?? 'lb'
  const status = !prescription ? 'ad-hoc' : outcome.completedSets === 0 ? 'skipped' : outcome.completedSets < prescription.sets ? 'partial' : 'completed'
  const inRange = prescription?.setType === 'working' ? workingSets.filter((set) => set.reps >= prescription.repRange.min && set.reps <= prescription.repRange.max) : []
  const targetStatus = !prescription || prescription.setType !== 'working' ? 'unknown' : !workingSets.length ? 'not-attempted'
    : inRange.length >= prescription.sets ? 'achieved' : inRange.length === workingSets.length ? 'partial' : 'missed'
  const target = prescription?.loadRecommendation
  const external = workingSets.every((set) => !set.loadType || set.loadType === 'external')
  const expected = target?.kind === 'target' ? convertWeight(target.weight, target.unit, unit) : undefined
  const difference = expected === undefined ? [] : workingSets.map((set) => Math.abs(set.weight - expected) <= .11 ? 0 : set.weight > expected ? 1 : -1)
  const loadOutcome = expected === undefined ? 'not-prescribed' : !workingSets.length ? 'not-attempted' : !external ? 'incomparable'
    : difference.every((value) => value === 0) ? 'matched' : difference.every((value) => value === 1) ? 'higher' : difference.every((value) => value === -1) ? 'lower' : 'mixed'
  const performance = outcome.signal === 'progress' ? 'improved' : outcome.signal === 'steady' ? 'stable'
    : outcome.signal === 'watch' ? outcome.progressionState === 'regressing' ? 'repeated-underperformance' : 'isolated-underperformance'
      : outcome.signal === 'no-working-sets' ? 'not-performed' : outcome.signal
  const observations: string[] = []
  if (status === 'skipped') observations.push(session.exerciseOmissions?.find((item) => item.exerciseId === outcome.exerciseId)?.reason === 'voluntary' ? 'You recorded a voluntary skip. One choice does not establish an exercise preference.' : 'No prescribed sets logged. Missing work alone does not imply dislike or a performance decline.')
  if (status === 'partial') observations.push('Some prescribed sets were logged; missing work is not counted as completed volume.')
  if (status === 'ad-hoc') observations.push('Additional exercise performed without an original session prescription.')
  if (prescription && outcome.completedSets > prescription.sets) observations.push(`${outcome.completedSets - prescription.sets} more sets logged than prescribed.`)
  if (targetStatus === 'achieved') observations.push('The prescribed working-set rep target was achieved.')
  if (targetStatus === 'missed') observations.push('Some working sets fell outside the prescribed rep range.')
  if (['higher', 'lower', 'mixed'].includes(loadOutcome)) observations.push(`Actual working loads were ${loadOutcome} relative to the prescribed load. This is an execution observation, not a preference judgment.`)
  return { ...outcome, ...(prescription ? { prescription: structuredClone(prescription) } : {}), unit, workingSets: structuredClone(workingSets), status,
    targetRange: { status: targetStatus, completedSets: inRange.length }, loadOutcome,
    ...(external && inRange.length ? { demonstratedWorkingLoad: Math.max(...inRange.map((set) => set.weight)) } : {}), performance,
    evidenceConfidence: !workingSets.length ? 'none' : outcome.comparison && outcome.comparison.comparableSets >= 2 ? 'moderate' : 'limited', observations }
}

function analyzeRecommendationOutcome(change: SessionPrescriptionChange, session: WorkoutSession): RecommendationOutcome {
  const exerciseIds = [...new Set([...change.before, ...change.after].map((slot) => slot.exerciseId))]
  const actual = session.sets.filter((set) => set.setType === 'working' && exerciseIds.includes(set.exerciseId))
  const base = { changeId: change.id, ...(change.recommendation ? { recommendationId: change.recommendation.id } : {}), ...(change.decision ? { decisionId: change.decision.id } : {}),
    source: change.source, applied: change.applied, exerciseIds, executedExerciseIds: [...new Set(actual.map((set) => set.exerciseId))] }
  if (!change.applied) return { ...base, status: 'not-applied', reason: change.decision?.decision === 'rejected' || change.decision?.decision === 'dismissed'
    ? `Recommendation ${change.decision.decision}; it did not change this prescription. Actual work remains separate from that decision.` : 'This earlier proposal does not match the session prescription and is not credited with its execution.' }
  if (!change.after.length) return { ...base, status: actual.length ? 'different-execution' : ['time', 'equipment', 'generated-substitution'].includes(change.source) ? 'contextually-omitted' : 'executed',
    reason: actual.length ? 'The omitted exercise was logged anyway.' : 'The exercise was intentionally omitted from this session prescription. This is not a skipped prescription or negative preference evidence.' }
  const progression = change.recommendation?.change.kind === 'progression' ? change.recommendation.change : undefined
  if (progression && progression.recommendedLoad !== undefined) {
    const target = convertWeight(progression.recommendedLoad, change.unit, session.unit ?? 'lb')
    const attempts = actual.filter((set) => (!set.loadType || set.loadType === 'external') && set.weight >= target - .11)
    const achieved = attempts.some((set) => set.reps >= progression.repRange.min && set.reps <= progression.repRange.max)
    return { ...base, status: achieved ? 'demonstrated' : attempts.length ? 'not-supported' : actual.length ? 'different-execution' : 'skipped',
      reason: achieved ? 'The prescribed load or a heavier load was demonstrated within the target rep range by an ordinary working set.'
        : attempts.length ? 'Working sets attempted the prescribed load but did not demonstrate its target rep range. One result alone does not establish regression.'
          : actual.length ? 'A different load or setup was used; the prescribed increase was not tested.' : 'No ordinary working sets were logged for the accepted progression. This does not establish dislike or inability.' }
  }
  const executed = change.after.map((slot) => ({ slot, count: actual.filter((set) => set.exerciseId === slot.exerciseId).length }))
  const any = executed.some((item) => item.count > 0)
  const complete = executed.every((item) => item.count >= item.slot.sets)
  return { ...base, status: complete ? 'executed' : any ? 'partial' : 'skipped', reason: complete ? 'The resulting exercise prescription was logged.'
    : any ? 'Some of the resulting working sets were logged.' : 'The resulting exercise was not logged. No preference or cause is inferred.' }
}

function isEarlierSession(candidate: WorkoutSession, session: WorkoutSession): boolean {
  if (candidate.id === session.id || candidate.status === 'in-progress') return false
  if (candidate.date !== session.date) return candidate.date < session.date
  // Same-day records without timestamps do not establish which came first.
  const before = candidate.completedAt ?? candidate.startedAt
  const after = session.completedAt ?? session.startedAt
  return Boolean(before && after && before < after)
}
