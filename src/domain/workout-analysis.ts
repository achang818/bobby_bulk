import { calculateExercisePerformance, comparePlannedVsActual, exercisePerformanceHistory } from './features'
import { classifyExerciseProgression, compareExercisePerformance } from './states'
import type { PerformanceComparison } from './states'
import { convertWeight } from './units'
import { compareWorkoutChronology } from './workout-session'
import type { Exercise, ExerciseLoadRecommendation, ExerciseProgressState, PlanningAuthority, PrescriptionCompletion, WorkoutSession } from './models'

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

export interface WorkoutAnalysis {
  sessionId: string
  planningAuthority: PlanningAuthority
  loggedSets: number
  workingSets: number
  plannedSets: number
  completedPlannedSets: number
  extraSets: number
  completion: 'complete' | 'partial' | 'unplanned'
  exercises: SessionExerciseAssessment[]
  nextSession: string
}

/**
 * Derived from the saved prescription and real sets, so edits to history are
 * reflected immediately. It neither mutates plans nor persists stale verdicts.
 * Trend decisions use the same conservative comparison as future coaching.
 */
export function analyzeWorkoutSession(session: WorkoutSession, history: WorkoutSession[], catalog: Exercise[]): WorkoutAnalysis | undefined {
  if (session.status === 'in-progress') return undefined
  const prior = history.filter((item) => isEarlierSession(item, session)).sort(compareWorkoutChronology)
  // Compare like units even when the user's display preference has changed.
  // Legacy records without a unit follow the session's unit, as in the logger.
  const normalized = [...prior, session].map((item) => ({
    ...item, unit: 'lb' as const,
    sets: item.sets.map((set) => ({ ...set, weight: convertWeight(set.weight, item.unit ?? session.unit ?? 'lb', 'lb') })),
  }))
  const current = normalized.at(-1)!
  const comparisons = comparePlannedVsActual(current)
  let plannedSets = 0
  let completedPlannedSets = 0
  const exercises = comparisons.map((planned): SessionExerciseAssessment => {
    const prescription = session.plannedExercises?.find((item) => item.exerciseId === planned.exerciseId)
    const matchingSets = session.sets.filter((set) => set.exerciseId === planned.exerciseId && set.setType === (prescription?.setType ?? 'working'))
    let completion = planned.completion
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
  })
  const planningAuthority = session.planningAuthority ?? 'user-plan'
  const workingSets = session.sets.filter((set) => set.setType === 'working').length
  const trendNote = exercises.some((item) => item.signal === 'watch' && item.progressionState !== 'regressing')
    ? 'A single weaker session will not trigger a regression-based exercise replacement. '
    : ''
  return {
    sessionId: session.id, planningAuthority, loggedSets: session.sets.length, workingSets,
    plannedSets, completedPlannedSets,
    extraSets: session.sets.length - completedPlannedSets,
    completion: plannedSets === 0 ? 'unplanned' : completedPlannedSets >= plannedSets ? 'complete' : 'partial',
    exercises,
    nextSession: trendNote + (planningAuthority === 'recommended'
      ? 'Your completed working sets and performance update the history Bobby uses to construct your next workout.'
      : 'Your completed working sets and performance inform future suggestions. Your saved plan changes only when you accept a change.'),
  }
}

function isEarlierSession(candidate: WorkoutSession, session: WorkoutSession): boolean {
  if (candidate.id === session.id || candidate.status === 'in-progress') return false
  if (candidate.date !== session.date) return candidate.date < session.date
  // Same-day records without timestamps do not establish which came first.
  const before = candidate.completedAt ?? candidate.startedAt
  const after = session.completedAt ?? session.startedAt
  return Boolean(before && after && before < after)
}
