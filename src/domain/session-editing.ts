import { recommendExerciseLoadFromState } from './load-recommendation'
import { exerciseTrainingState } from './training-state'
import { calibrateProgressionLoad, deriveCoachingPreferences } from './coaching-preferences'
import type { Exercise, WorkoutSession, TrainingState, RecommendationDecision, PlannedExercise } from './models'
import { createPlannedExercise, sessionExercises } from './workout-session'

export function addSessionExercise(session: WorkoutSession, exercise: Exercise): WorkoutSession {
  if ([...(session.plannedExercises ?? []), ...(session.addedExercises ?? []), ...sessionExercises(session)].some((slot) => slot.exerciseId === exercise.id)) return session
  return { ...session, addedExercises: [...(session.addedExercises ?? []), createPlannedExercise(exercise.id, sessionExercises(session).length, exercise)] }
}

export function switchSessionExercise(session: WorkoutSession, fromId: string, exercise: Exercise, trainingState?: TrainingState, decisions: RecommendationDecision[] = []): WorkoutSession {
  const slots = sessionExercises(session)
  const before = slots.find((slot) => slot.exerciseId === fromId)
  if (!before || slots.some((slot) => slot.exerciseId === exercise.id)) return session
  const completed = session.sets.filter((set) => set.exerciseId === fromId && set.setType === 'working').length
  const after: PlannedExercise = { ...createPlannedExercise(exercise.id, before.order, exercise), sets: Math.max(1, before.sets - completed) }
  after.loadRecommendation = trainingState && trainingState.unit === (session.unit ?? 'lb')
    ? calibrateProgressionLoad(recommendExerciseLoadFromState(exercise, after, exerciseTrainingState(trainingState, exercise.id), trainingState.unit), after, deriveCoachingPreferences(trainingState, decisions))
    : { kind: 'choose-load', unit: session.unit ?? 'lb', reason: 'Choose a manageable starting load for this replacement and its rep range.' }
  return { ...session, exerciseSwaps: [...(session.exerciseSwaps ?? []), { fromExerciseId: fromId, to: after }],
    prescriptionChanges: [...(session.prescriptionChanges ?? []), { id: `${session.id}:switch:${session.exerciseSwaps?.length ?? 0}`, source: 'user-substitution', unit: session.unit ?? 'lb', before: [structuredClone(before)], after: [after], applied: true, reason: 'You switched this movement during the workout. Previously logged sets stay with their original exercise.' }] }
}

export function validSessionDate(date: string, today: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date && date <= today
}
