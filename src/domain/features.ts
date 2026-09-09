import type { Exercise, ExerciseFeatures, HistoryConfidence, MuscleFeatures, PlannedVsActualExercise, TrainingState, Workout, WorkoutPlan, WorkloadTrend } from './models'
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

export function calculateExerciseFeatures(exercise: Exercise, history: Workout[], asOf = latestDate(history)): ExerciseFeatures {
  const sessions = history.filter((workout) => workout.status !== 'in-progress' && workout.sets.some((set) => set.exerciseId === exercise.id && set.setType === 'working')).sort((a, b) => a.date.localeCompare(b.date))
  const recentPerformance = sessions.map((workout) => {
    const sets = workout.sets.filter((set) => set.exerciseId === exercise.id && set.setType === 'working')
    return { date: workout.date, averageReps: average(sets.map((set) => set.reps)), averageWeight: average(sets.map((set) => set.weight)) }
  })
  const recentWorkingSets = sessions.slice(-3).flatMap((workout) => workout.sets.filter((set) => set.exerciseId === exercise.id && set.setType === 'working').map((set) => ({ date: workout.date, weight: set.weight, reps: set.reps })))
  const last = sessions.at(-1)?.date
  const averageReps = average(recentPerformance.slice(-3).map((item) => item.averageReps))
  const averageWeight = average(recentPerformance.slice(-3).map((item) => item.averageWeight))
  return {
    exerciseId: exercise.id, sessionsPerformed: sessions.length, lastPerformedDate: last,
    daysSinceLastPerformed: last ? daysBetween(last, asOf) : undefined, recentPerformance,
    averageReps: sessions.length ? averageReps : undefined, averageWeight: sessions.length ? averageWeight : undefined,
    estimatedOneRepMax: averageWeight && averageReps ? Math.round((averageWeight * (1 + averageReps / 30)) * 10) / 10 : undefined,
    progressionState: classifyExerciseProgression(recentPerformance), recentWorkingSets,
    recentBestWorkingLoad: recentWorkingSets.length ? Math.max(...recentWorkingSets.map((set) => set.weight)) : undefined,
    historyConfidence: confidenceFor(sessions.length),
  }
}

export function calculateMuscleFeatures(muscle: string, exercises: Exercise[], history: Workout[], asOf = latestDate(history)): MuscleFeatures {
  const normalized = muscle.toLowerCase()
  // Primary-muscle working sets are the authoritative exposure baseline.
  const ids = new Set(exercises.filter((exercise) => exercise.primaryMuscles.some((item) => item.toLowerCase() === normalized)).map((exercise) => exercise.id))
  const matching = (days: number) => sessionsWithinWindow(history, asOf, days).filter((workout) => workout.sets.some((set) => set.setType === 'working' && ids.has(set.exerciseId)))
  const count = (days: number) => setsWithinWindow(history, asOf, days, ids).length
  const allSessions = history.filter((workout) => workout.status !== 'in-progress' && workout.sets.some((set) => set.setType === 'working' && ids.has(set.exerciseId)))
  const dates = allSessions.map((workout) => workout.date).sort()
  const rolling7DaySets = count(7)
  const rolling14DaySets = count(14)
  const rolling28DaySets = count(28)
  return {
    muscle, recentSets: rolling28DaySets, rolling7DaySets, rolling14DaySets, rolling28DaySets,
    daysSinceTrained: dates.length ? daysBetween(dates.at(-1) as string, asOf) : undefined,
    frequency7Days: matching(7).length, frequency14Days: matching(14).length, frequency28Days: matching(28).length,
    volumeState: classifyMuscleVolume(rolling28DaySets), workloadTrend: workloadTrend(rolling7DaySets, countPreviousWeek(history, asOf, ids)), historyConfidence: confidenceFor(allSessions.length),
  }
}

export function comparePlannedVsActual(workout: Workout): PlannedVsActualExercise[] {
  return (workout.plannedExercises ?? []).map((planned) => {
    const working = workout.sets.filter((set) => set.exerciseId === planned.exerciseId && set.setType === 'working')
    const targetRange = working.filter((set) => set.reps >= planned.repRange.min && set.reps <= planned.repRange.max)
    return {
      exerciseId: planned.exerciseId, plannedSets: planned.sets, plannedRepRange: planned.repRange,
      completedWorkingSets: working.length, targetRangeWorkingSets: targetRange.length, fullyCompleted: working.length >= planned.sets,
      demonstratedWorkingLoad: targetRange.length ? Math.max(...targetRange.map((set) => set.weight)) : undefined,
    }
  })
}

export function calculateTrainingState(exercises: Exercise[], history: Workout[], asOf = latestDate(history)): TrainingState {
  const muscles = [...new Set(exercises.flatMap((exercise) => exercise.primaryMuscles))]
  return { asOf, exercises: exercises.map((exercise) => calculateExerciseFeatures(exercise, history, asOf)), muscles: muscles.map((muscle) => calculateMuscleFeatures(muscle, exercises, history, asOf)) }
}

export function calculatePlanFeatures(plan: WorkoutPlan, exercises: Exercise[], history: Workout[], asOf?: string) {
  const plannedExercises = plannedExercisesFor(plan, exercises)
  const ids = planExerciseIds(plan)
  const planExercises = plannedExercises.flatMap((planned) => {
    const exercise = exercises.find((item) => item.id === planned.exerciseId)
    return exercise ? [{ exercise, planned }] : []
  })
  const muscles = [...new Set(planExercises.flatMap(({ exercise }) => exercise.primaryMuscles))]
  return { planId: plan.id, exerciseIds: ids, plannedExercises, muscles, approximateSets: plannedExercises.reduce((sum, planned) => sum + planned.sets, 0), exerciseFeatures: planExercises.map(({ exercise }) => calculateExerciseFeatures(exercise, history, asOf)), overlappingExercises: ids.filter((id, index) => ids.indexOf(id) !== index) }
}

function countPreviousWeek(history: Workout[], asOf: string, ids: Set<string>): number {
  return history.filter((workout) => workout.status !== 'in-progress' && daysBetween(workout.date, asOf) > 7 && daysBetween(workout.date, asOf) <= 14).flatMap((workout) => workout.sets).filter((set) => set.setType === 'working' && ids.has(set.exerciseId)).length
}
function workloadTrend(current: number, previous: number): WorkloadTrend {
  if (current === 0 && previous === 0) return 'insufficient history'
  if (current > previous) return 'increasing'
  if (current < previous) return 'decreasing'
  return 'stable'
}
function confidenceFor(sessions: number): HistoryConfidence { return sessions === 0 ? 'none' : sessions === 1 ? 'limited' : sessions < 4 ? 'moderate' : 'strong' }
function latestDate(history: Workout[]) { return history.filter((workout) => workout.status !== 'in-progress').map((workout) => workout.date).sort().at(-1) ?? new Date().toISOString().slice(0, 10) }
function daysBetween(start: string, end: string) { return Math.max(0, Math.floor((Date.parse(`${end}T12:00:00`) - Date.parse(`${start}T12:00:00`)) / DAY)) }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0 }
