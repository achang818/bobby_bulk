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
  const sets = actualSets.map(toPerformedSet)
  const working = sets.filter((set) => set.setType === 'working')
  const inRange = planned ? working.filter((set) => set.reps >= planned.repRange.min && set.reps <= planned.repRange.max) : []
  const completion = completionFor(planned?.sets, working.length, inRange.length)
  const e1rm = working.flatMap((set) => set.estimatedOneRepMax === undefined ? [] : [set.estimatedOneRepMax])
  const bestWorkingSet = [...working].sort((a, b) => (b.estimatedOneRepMax ?? 0) - (a.estimatedOneRepMax ?? 0) || b.reps - a.reps || b.weight - a.weight)[0]
  return {
    exerciseId, sessionId: workout.id, date: workout.date,
    ...(planned ? { plannedSets: planned.sets, plannedRepRange: { ...planned.repRange }, plannedSetType: planned.setType } : {}),
    sets, workingSets: working,
    completedSets: actualSets.length, completedWorkingSets: working.length,
    totalReps: sum(actualSets.map((set) => set.reps)), totalWorkingReps: sum(working.map((set) => set.reps)),
    workingVolume: sum(working.map((set) => set.weight * set.reps)),
    ...(working.length ? { bestWorkingSet, heaviestWorkingWeight: Math.max(...working.map((set) => set.weight)) } : {}),
    ...(e1rm.length ? { bestEstimatedOneRepMax: Math.max(...e1rm), averageEstimatedOneRepMax: average(e1rm) } : {}),
    targetRangeWorkingSets: inRange.length,
    ...(planned ? { prescriptionAchieved: inRange.length >= planned.sets } : {}),
    ...(inRange.length ? { demonstratedWorkingLoad: Math.max(...inRange.map((set) => set.weight)) } : {}),
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
  const allPerformances = exercisePerformanceHistory(exercise.id, history).filter((item) => item.date <= asOf)
  const performances = allPerformances.filter((item) => item.completedWorkingSets > 0)
  const recent = performances.slice(-5)
  const workingSets = performances.flatMap((performance) => performance.workingSets.map((set) => ({ ...set, date: performance.date }))).slice(-12)
  const last = performances.at(-1)?.date
  const bestWeight = workingSets.length ? Math.max(...workingSets.map((set) => set.weight)) : undefined
  const bestWeightReps = bestWeight === undefined ? undefined : Math.max(...workingSets.filter((set) => set.weight === bestWeight).map((set) => set.reps))
  const e1rms = performances.flatMap((item) => item.bestEstimatedOneRepMax === undefined ? [] : [item.bestEstimatedOneRepMax])
  const completionRates = performances.flatMap((item) => item.completionRate === undefined ? [] : [item.completionRate])
  return {
    exerciseId: exercise.id, sessionsPerformed: performances.length, lastPerformedDate: last,
    daysSinceLastPerformed: last ? daysBetween(last, asOf) : undefined,
    recentPerformances: recent, mostRecentPerformance: performances.at(-1),
    ...(bestWeight === undefined ? {} : { bestWorkingWeight: bestWeight, bestRepsAtBestWeight: bestWeightReps }),
    ...(e1rms.length ? { bestEstimatedOneRepMax: Math.max(...e1rms) } : {}),
    recentWorkingVolume: sum(recent.map((item) => item.workingVolume)),
    ...(completionRates.length ? { averageCompletionRate: average(completionRates) } : {}),
    progressionState: classifyExerciseProgression(performances), recentWorkingSets: workingSets,
    historyConfidence: confidenceFor(performances.length),
  }
}

export function calculateMuscleFeatures(muscle: string, exercises: Exercise[], history: Workout[], asOf = latestDate(history)): MuscleFeatures {
  const normalized = muscle.toLowerCase()
  const ids = new Set(exercises.filter((exercise) => exercise.primaryMuscles.some((item) => item.toLowerCase() === normalized)).map((exercise) => exercise.id))
  const matching = (days: number) => sessionsWithinWindow(history, asOf, days).filter((workout) => workout.sets.some((set) => set.setType === 'working' && ids.has(set.exerciseId)))
  const count = (days: number) => setsWithinWindow(history, asOf, days, ids).length
  const allSessions = history.filter((workout) => workout.status !== 'in-progress' && workout.date <= asOf && workout.sets.some((set) => set.setType === 'working' && ids.has(set.exerciseId)))
  const dates = allSessions.map((workout) => workout.date).sort()
  const rolling7DaySets = count(7)
  const rolling14DaySets = count(14)
  const rolling28DaySets = count(28)
  return { muscle, recentSets: rolling28DaySets, rolling7DaySets, rolling14DaySets, rolling28DaySets, daysSinceTrained: dates.length ? daysBetween(dates.at(-1) as string, asOf) : undefined, frequency7Days: matching(7).length, frequency14Days: matching(14).length, frequency28Days: matching(28).length, volumeState: classifyMuscleVolume(rolling28DaySets), workloadTrend: workloadTrend(rolling7DaySets, countPreviousWeek(history, asOf, ids)), historyConfidence: confidenceFor(allSessions.length) }
}

export function comparePlannedVsActual(workout: Workout): PlannedVsActualExercise[] {
  const planned = workout.plannedExercises ?? []
  const plannedById = new Map(planned.map((item) => [item.exerciseId, item]))
  const exerciseIds = [...new Set([...planned.map((item) => item.exerciseId), ...workout.sets.map((set) => set.exerciseId)])]
  return exerciseIds.map((exerciseId) => {
    const plannedExercise = plannedById.get(exerciseId)
    const performance = calculateExercisePerformance(workout, exerciseId)
    const working = performance?.completedWorkingSets ?? 0
    const target = performance?.targetRangeWorkingSets ?? 0
    if (!plannedExercise) return { exerciseId, isAdHoc: true, completedWorkingSets: working, targetRangeWorkingSets: target, fullyCompleted: false, prescriptionAchieved: false, completion: performance?.completion ?? 'unplanned', ...(performance?.demonstratedWorkingLoad === undefined ? {} : { demonstratedWorkingLoad: performance.demonstratedWorkingLoad }) }
    if (!performance) return { exerciseId, isAdHoc: false, plannedSets: plannedExercise.sets, plannedRepRange: plannedExercise.repRange, plannedSetType: plannedExercise.setType, completedWorkingSets: 0, targetRangeWorkingSets: 0, fullyCompleted: false, prescriptionAchieved: false, completion: 'not started' }
    return { exerciseId, isAdHoc: false, plannedSets: plannedExercise.sets, plannedRepRange: plannedExercise.repRange, plannedSetType: plannedExercise.setType, completedWorkingSets: working, targetRangeWorkingSets: target, fullyCompleted: working >= plannedExercise.sets, prescriptionAchieved: performance.prescriptionAchieved ?? false, completion: performance.completion, ...(performance.demonstratedWorkingLoad === undefined ? {} : { demonstratedWorkingLoad: performance.demonstratedWorkingLoad }) }
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
function toPerformedSet(set: Workout['sets'][number]) {
  const estimatedOneRepMax = set.setType === 'working' ? estimateOneRepMax(set.weight, set.reps) : undefined
  return { id: set.id, setType: set.setType, weight: set.weight, reps: set.reps, ...(set.loadType === undefined ? {} : { loadType: set.loadType }), ...(set.rir === undefined ? {} : { rir: set.rir }), ...(set.rpe === undefined ? {} : { rpe: set.rpe }), ...(set.setDurationSeconds === undefined ? {} : { setDurationSeconds: set.setDurationSeconds }), ...(set.restDurationSeconds === undefined ? {} : { restDurationSeconds: set.restDurationSeconds }), ...(set.notes === undefined ? {} : { notes: set.notes }), ...(set.completedAt === undefined ? {} : { completedAt: set.completedAt }), ...(estimatedOneRepMax === undefined ? {} : { estimatedOneRepMax }) }
}
function countPreviousWeek(history: Workout[], asOf: string, ids: Set<string>): number { return history.filter((workout) => workout.status !== 'in-progress' && daysBetween(workout.date, asOf) > 7 && daysBetween(workout.date, asOf) <= 14).flatMap((workout) => workout.sets).filter((set) => set.setType === 'working' && ids.has(set.exerciseId)).length }
function workloadTrend(current: number, previous: number): WorkloadTrend { if (current === 0 && previous === 0) return 'insufficient history'; if (current > previous) return 'increasing'; if (current < previous) return 'decreasing'; return 'stable' }
function confidenceFor(sessions: number): HistoryConfidence { return sessions === 0 ? 'none' : sessions === 1 ? 'limited' : sessions < 4 ? 'moderate' : 'strong' }
function latestDate(history: Workout[]) { return history.filter((workout) => workout.status !== 'in-progress').map((workout) => workout.date).sort().at(-1) ?? new Date().toISOString().slice(0, 10) }
function daysBetween(start: string, end: string) { return Math.max(0, Math.floor((Date.parse(`${end}T12:00:00`) - Date.parse(`${start}T12:00:00`)) / DAY)) }
function average(values: number[]) { return values.length ? sum(values) / values.length : 0 }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0) }
