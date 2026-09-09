import type { Exercise, ExerciseFeatures, MuscleFeatures, Workout, WorkoutPlan } from './models'
import { classifyExerciseProgression, classifyMuscleVolume } from './states'
import { planExerciseIds, plannedExercisesFor } from './workout-session'

const DAY = 24 * 60 * 60 * 1000

export function calculateExerciseFeatures(exercise: Exercise, history: Workout[], asOf = latestDate(history)): ExerciseFeatures {
  const sessions = history
    .filter((workout) => workout.sets.some((set) => set.exerciseId === exercise.id && set.setType === 'working'))
    .sort((a, b) => a.date.localeCompare(b.date))
  const recentPerformance = sessions.map((workout) => {
    const sets = workout.sets.filter((set) => set.exerciseId === exercise.id && set.setType === 'working')
    return { date: workout.date, averageReps: average(sets.map((set) => set.reps)), averageWeight: average(sets.map((set) => set.weight)) }
  })
  const last = sessions.at(-1)?.date
  const averageReps = average(recentPerformance.slice(-3).map((item) => item.averageReps))
  const averageWeight = average(recentPerformance.slice(-3).map((item) => item.averageWeight))
  return {
    exerciseId: exercise.id, sessionsPerformed: sessions.length, lastPerformedDate: last,
    daysSinceLastPerformed: last ? daysBetween(last, asOf) : undefined, recentPerformance,
    averageReps: sessions.length ? averageReps : undefined, averageWeight: sessions.length ? averageWeight : undefined,
    estimatedOneRepMax: averageWeight && averageReps ? Math.round((averageWeight * (1 + averageReps / 30)) * 10) / 10 : undefined,
    progressionState: classifyExerciseProgression(recentPerformance),
  }
}

export function calculateMuscleFeatures(muscle: string, exercises: Exercise[], history: Workout[], asOf = latestDate(history)): MuscleFeatures {
  const normalized = muscle.toLowerCase()
  const matchingIds = new Set(exercises.filter((exercise) => exercise.primaryMuscles.some((item) => item.toLowerCase() === normalized)).map((exercise) => exercise.id))
  const matchingWorkouts = history.filter((workout) => workout.sets.some((set) => matchingIds.has(set.exerciseId)))
  const countSets = (days: number) => history.filter((workout) => daysBetween(workout.date, asOf) <= days && daysBetween(workout.date, asOf) >= 0).flatMap((workout) => workout.sets).filter((set) => matchingIds.has(set.exerciseId)).length
  const dates = matchingWorkouts.map((workout) => workout.date).sort()
  const dates28 = matchingWorkouts.filter((workout) => daysBetween(workout.date, asOf) <= 28 && daysBetween(workout.date, asOf) >= 0).map((workout) => workout.date)
  const dates14 = matchingWorkouts.filter((workout) => daysBetween(workout.date, asOf) <= 14 && daysBetween(workout.date, asOf) >= 0).map((workout) => workout.date)
  const recentSets = countSets(28)
  return { muscle, recentSets, rolling7DaySets: countSets(7), rolling14DaySets: countSets(14), rolling28DaySets: recentSets, daysSinceTrained: dates.length ? daysBetween(dates.at(-1) as string, asOf) : undefined, frequency14Days: new Set(dates14).size, frequency28Days: new Set(dates28).size, volumeState: classifyMuscleVolume(recentSets) }
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

function latestDate(history: Workout[]) { return history.map((workout) => workout.date).sort().at(-1) ?? new Date().toISOString().slice(0, 10) }
function daysBetween(start: string, end: string) { return Math.max(0, Math.floor((Date.parse(`${end}T12:00:00`) - Date.parse(`${start}T12:00:00`)) / DAY)) }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0 }
