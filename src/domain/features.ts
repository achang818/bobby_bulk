import type { Exercise, ExerciseFeatures, ExercisePerformance, HistoryConfidence, MuscleFeatures, PlannedVsActualExercise, PrescriptionCompletion, TrainingState, Workout, WorkoutPlan, WorkloadTrend } from './models'
import { classifyExerciseProgression, classifyMuscleVolume } from './states'
import { planExerciseIds, plannedExercisesFor } from './workout-session'

const DAY = 24 * 60 * 60 * 1000
export const TRAINING_WINDOWS = [7, 14, 28] as const

export function sessionsWithinWindow(history: Workout[], asOf: string, days: number): Workout[] {
  return history.filter((workout) => workout.status !== 'in-progress' && daysBetween(workout.date, asOf) <= days && daysBetween(workout.date, asOf) >= 0)
}

export function setsWithinWindow(history: Workout[], asOf: string, days: number, exerciseIds?: Set<string>) {
  return sessionsWithinWindow(history, asOf, days).flatMap((workout) => workout.sets.filter((set) => set.setType === 'working' && (!exerciseIds || exerciseIds.has(set.exerciseId))))
}

/** A durable account of one exercise inside one completed session. */
export function calculateExercisePerformance(workout: Workout, exerciseId: string): ExercisePerformance | undefined {
  if (workout.status === 'in-progress') return undefined
  const actualSets = workout.sets.filter((set) => set.exerciseId === exerciseId)
  if (!actualSets.length) return undefined
  // Do not use current defaults here: only the session's planned snapshot is historical prescription evidence.
  const planned = workout.plannedExercises?.find((item) => item.exerciseId === exerciseId)
  const working = actualSets.filter((set) => set.setType === 'working')
  const inRange = planned ? working.filter((set) => set.reps >= planned.repRange.min && set.reps <= planned.repRange.max) : []
  const completion = completionFor(planned?.sets, working.length, inRange.length)
  const e1rm = working.map((set) => estimateOneRepMax(set.weight, set.reps)).filter((value): value is number => value !== undefined)
  const rir = working.flatMap((set) => set.rir === undefined ? [] : [set.rir])
  const rpe = working.flatMap((set) => set.rpe === undefined ? [] : [set.rpe])
  return {
    exerciseId, sessionId: workout.id, date: workout.date,
    ...(planned ? { plannedSets: planned.sets, plannedRepRange: { ...planned.repRange }, plannedSetType: planned.setType } : {}),
    completedSets: actualSets.length, completedWorkingSets: working.length,
    totalReps: sum(actualSets.map((set) => set.reps)), totalWorkingReps: sum(working.map((set) => set.reps)),
    workingVolume: sum(working.map((set) => set.weight * set.reps)),
    ...(working.length ? { averageWorkingReps: average(working.map((set) => set.reps)), averageWorkingWeight: average(working.map((set) => set.weight)), heaviestWorkingWeight: Math.max(...working.map((set) => set.weight)) } : {}),
    ...(e1rm.length ? { estimatedOneRepMax: Math.max(...e1rm) } : {}),
    ...(rir.length ? { averageRir: average(rir) } : {}), ...(rpe.length ? { averageRpe: average(rpe) } : {}),
    targetRangeWorkingSets: inRange.length,
    ...(planned ? { completionRate: Math.min(1, working.length / planned.sets) } : {}),
    completion,
  }
}

export function exercisePerformanceHistory(exerciseId: string, history: Workout[]): ExercisePerformance[] {
  return history.flatMap((workout) => {
    const performance = calculateExercisePerformance(workout, exerciseId)
    return performance ? [performance] : []
  }).sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId))
}

export function calculateExerciseFeatures(exercise: Exercise, history: Workout[], asOf = latestDate(history)): ExerciseFeatures {
  const allPerformances = exercisePerformanceHistory(exercise.id, history)
  const performances = allPerformances.filter((item) => item.completedWorkingSets > 0)
  const recentPerformance = performances.map((item) => ({ date: item.date, averageReps: item.averageWorkingReps ?? 0, averageWeight: item.averageWorkingWeight ?? 0, ...(item.estimatedOneRepMax === undefined ? {} : { estimatedOneRepMax: item.estimatedOneRepMax }) }))
  const recent = performances.slice(-3)
  const workingSets = history.filter((workout) => workout.status !== 'in-progress').flatMap((workout) => workout.sets.filter((set) => set.exerciseId === exercise.id && set.setType === 'working').map((set) => ({ date: workout.date, weight: set.weight, reps: set.reps }))).sort((a, b) => a.date.localeCompare(b.date)).slice(-9)
  const last = performances.at(-1)?.date
  const bestWeight = workingSets.length ? Math.max(...workingSets.map((set) => set.weight)) : undefined
  const bestWeightReps = bestWeight === undefined ? undefined : Math.max(...workingSets.filter((set) => set.weight === bestWeight).map((set) => set.reps))
  const e1rms = performances.flatMap((item) => item.estimatedOneRepMax === undefined ? [] : [item.estimatedOneRepMax])
  const completionRates = performances.flatMap((item) => item.completionRate === undefined ? [] : [item.completionRate])
  return {
    exerciseId: exercise.id, sessionsPerformed: performances.length, lastPerformedDate: last,
    daysSinceLastPerformed: last ? daysBetween(last, asOf) : undefined, recentPerformance,
    recentPerformances: recent, mostRecentPerformance: performances.at(-1),
    ...(performances.length ? { averageReps: average(recent.map((item) => item.averageWorkingReps ?? 0)), averageWeight: average(recent.map((item) => item.averageWorkingWeight ?? 0)), estimatedOneRepMax: recent.at(-1)?.estimatedOneRepMax } : {}),
    ...(bestWeight === undefined ? {} : { bestWorkingWeight: bestWeight, bestRepsAtBestWeight: bestWeightReps, recentBestWorkingLoad: Math.max(...workingSets.slice(-3).map((set) => set.weight)) }),
    ...(e1rms.length ? { bestEstimatedOneRepMax: Math.max(...e1rms) } : {}),
    recentWorkingVolume: sum(recent.map((item) => item.workingVolume)),
    ...(completionRates.length ? { averageCompletionRate: average(completionRates) } : {}),
    progressionState: classifyExerciseProgression(recentPerformance), recentWorkingSets: workingSets,
    historyConfidence: confidenceFor(performances.length),
  }
}

export function calculateMuscleFeatures(muscle: string, exercises: Exercise[], history: Workout[], asOf = latestDate(history)): MuscleFeatures {
  const normalized = muscle.toLowerCase()
  const ids = new Set(exercises.filter((exercise) => exercise.primaryMuscles.some((item) => item.toLowerCase() === normalized)).map((exercise) => exercise.id))
  const matching = (days: number) => sessionsWithinWindow(history, asOf, days).filter((workout) => workout.sets.some((set) => set.setType === 'working' && ids.has(set.exerciseId)))
  const count = (days: number) => setsWithinWindow(history, asOf, days, ids).length
  const allSessions = history.filter((workout) => workout.status !== 'in-progress' && workout.sets.some((set) => set.setType === 'working' && ids.has(set.exerciseId)))
  const dates = allSessions.map((workout) => workout.date).sort()
  const rolling7DaySets = count(7)
  const rolling14DaySets = count(14)
  const rolling28DaySets = count(28)
  return { muscle, recentSets: rolling28DaySets, rolling7DaySets, rolling14DaySets, rolling28DaySets, daysSinceTrained: dates.length ? daysBetween(dates.at(-1) as string, asOf) : undefined, frequency7Days: matching(7).length, frequency14Days: matching(14).length, frequency28Days: matching(28).length, volumeState: classifyMuscleVolume(rolling28DaySets), workloadTrend: workloadTrend(rolling7DaySets, countPreviousWeek(history, asOf, ids)), historyConfidence: confidenceFor(allSessions.length) }
}

export function comparePlannedVsActual(workout: Workout): PlannedVsActualExercise[] {
  return (workout.plannedExercises ?? []).map((planned) => {
    const performance = calculateExercisePerformance(workout, planned.exerciseId)
    const working = performance?.completedWorkingSets ?? 0
    const target = performance?.targetRangeWorkingSets ?? 0
    const demonstrated = workout.sets.filter((set) => set.exerciseId === planned.exerciseId && set.setType === 'working' && set.reps >= planned.repRange.min && set.reps <= planned.repRange.max).map((set) => set.weight)
    return { exerciseId: planned.exerciseId, plannedSets: planned.sets, plannedRepRange: planned.repRange, completedWorkingSets: working, targetRangeWorkingSets: target, fullyCompleted: working >= planned.sets, prescriptionAchieved: target >= planned.sets, completion: performance?.completion ?? 'partial', ...(demonstrated.length ? { demonstratedWorkingLoad: Math.max(...demonstrated) } : {}) }
  })
}

export function calculateTrainingState(exercises: Exercise[], history: Workout[], asOf = latestDate(history)): TrainingState {
  const muscles = [...new Set(exercises.flatMap((exercise) => exercise.primaryMuscles))]
  return { asOf, exercises: exercises.map((exercise) => calculateExerciseFeatures(exercise, history, asOf)), muscles: muscles.map((muscle) => calculateMuscleFeatures(muscle, exercises, history, asOf)) }
}

export function calculatePlanFeatures(plan: WorkoutPlan, exercises: Exercise[], history: Workout[], asOf?: string) {
  const plannedExercises = plannedExercisesFor(plan, exercises)
  const ids = planExerciseIds(plan)
  const planExercises = plannedExercises.flatMap((planned) => { const exercise = exercises.find((item) => item.id === planned.exerciseId); return exercise ? [{ exercise, planned }] : [] })
  const muscles = [...new Set(planExercises.flatMap(({ exercise }) => exercise.primaryMuscles))]
  return { planId: plan.id, exerciseIds: ids, plannedExercises, muscles, approximateSets: plannedExercises.reduce((sum, planned) => sum + planned.sets, 0), exerciseFeatures: planExercises.map(({ exercise }) => calculateExerciseFeatures(exercise, history, asOf)), overlappingExercises: ids.filter((id, index) => ids.indexOf(id) !== index) }
}

function completionFor(plannedSets: number | undefined, completed: number, inRange: number): PrescriptionCompletion {
  if (plannedSets === undefined) return 'unplanned'
  if (completed < plannedSets) return 'partial'
  return inRange >= plannedSets ? 'completed' : 'below target'
}
export function estimateOneRepMax(weight: number, reps: number): number | undefined { return weight > 0 && reps > 0 ? Math.round(weight * (1 + reps / 30) * 10) / 10 : undefined }
function countPreviousWeek(history: Workout[], asOf: string, ids: Set<string>): number { return history.filter((workout) => workout.status !== 'in-progress' && daysBetween(workout.date, asOf) > 7 && daysBetween(workout.date, asOf) <= 14).flatMap((workout) => workout.sets).filter((set) => set.setType === 'working' && ids.has(set.exerciseId)).length }
function workloadTrend(current: number, previous: number): WorkloadTrend { if (current === 0 && previous === 0) return 'insufficient history'; if (current > previous) return 'increasing'; if (current < previous) return 'decreasing'; return 'stable' }
function confidenceFor(sessions: number): HistoryConfidence { return sessions === 0 ? 'none' : sessions === 1 ? 'limited' : sessions < 4 ? 'moderate' : 'strong' }
function latestDate(history: Workout[]) { return history.filter((workout) => workout.status !== 'in-progress').map((workout) => workout.date).sort().at(-1) ?? new Date().toISOString().slice(0, 10) }
function daysBetween(start: string, end: string) { return Math.max(0, Math.floor((Date.parse(`${end}T12:00:00`) - Date.parse(`${start}T12:00:00`)) / DAY)) }
function average(values: number[]) { return values.length ? sum(values) / values.length : 0 }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0) }
