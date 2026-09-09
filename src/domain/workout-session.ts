import type { Exercise, LoggedSet, PlannedExercise, SetType, WorkoutSession, WorkoutTemplate } from './models'

const defaultRepRange = { min: 8, max: 12 }

export function planExerciseIds(plan: WorkoutTemplate): string[] {
  return plan.plannedExercises?.slice().sort((a, b) => a.order - b.order).map((exercise) => exercise.exerciseId) ?? plan.exerciseIds
}

export function createPlannedExercise(exerciseId: string, order: number, exercise?: Exercise): PlannedExercise {
  return {
    exerciseId,
    order,
    sets: exercise?.defaultSets ?? 3,
    repRange: exercise?.repRange ?? defaultRepRange,
    setType: 'working',
  }
}

export function normalizeWorkoutTemplate(value: unknown, exercises: Exercise[] = []): WorkoutTemplate {
  const raw = value as Partial<WorkoutTemplate> & { exerciseIds?: string[]; plannedExercises?: Partial<PlannedExercise>[] }
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  const plannedExercises = Array.isArray(raw.plannedExercises) && raw.plannedExercises.length > 0
    ? raw.plannedExercises.map((item, index) => ({
      ...createPlannedExercise(item.exerciseId ?? '', item.order ?? index, byId.get(item.exerciseId ?? '')),
      ...item,
      order: item.order ?? index,
      setType: item.setType ?? 'working',
      repRange: item.repRange ?? byId.get(item.exerciseId ?? '')?.repRange ?? defaultRepRange,
      sets: item.sets ?? byId.get(item.exerciseId ?? '')?.defaultSets ?? 3,
    })).filter((item) => item.exerciseId)
    : (raw.exerciseIds ?? []).map((id, index) => createPlannedExercise(id, index, byId.get(id)))
  return {
    id: raw.id ?? crypto.randomUUID(),
    name: raw.name ?? 'Untitled workout',
    description: raw.description ?? '',
    focus: raw.focus ?? '',
    plannedExercises,
    exerciseIds: plannedExercises.slice().sort((a, b) => a.order - b.order).map((item) => item.exerciseId),
    ...(raw.saved === undefined ? {} : { saved: raw.saved }),
  }
}

export function createWorkoutSession(workout: WorkoutTemplate, plannedExercises = workout.plannedExercises ?? []): WorkoutSession {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    workoutId: workout.id,
    date: now.slice(0, 10),
    title: workout.name,
    status: 'in-progress',
    startedAt: now,
    unit: undefined,
    plannedExercises: plannedExercises.map((exercise) => ({ ...exercise })),
    sets: [],
  }
}

export function completeWorkoutSession(session: WorkoutSession): WorkoutSession {
  return { ...session, status: 'completed', completedAt: new Date().toISOString() }
}

export function normalizeWorkoutSession(value: unknown): WorkoutSession {
  const raw = value as Partial<WorkoutSession> & { sets?: Partial<LoggedSet>[] }
  const date = raw.date ?? new Date().toISOString().slice(0, 10)
  return {
    id: raw.id ?? crypto.randomUUID(),
    workoutId: raw.workoutId ?? `legacy-${raw.id ?? 'workout'}`,
    date,
    title: raw.title ?? 'Workout',
    status: raw.status ?? 'completed',
    ...(raw.startedAt ? { startedAt: raw.startedAt } : {}),
    ...(raw.completedAt ? { completedAt: raw.completedAt } : raw.status === 'completed' || !raw.status ? { completedAt: `${date}T00:00:00.000Z` } : {}),
    ...(raw.notes ? { notes: raw.notes } : {}),
    ...(raw.unit ? { unit: raw.unit } : {}),
    plannedExercises: Array.isArray(raw.plannedExercises) ? raw.plannedExercises.map((exercise, index) => ({
      ...createPlannedExercise(exercise.exerciseId ?? '', exercise.order ?? index), ...exercise, order: exercise.order ?? index, setType: exercise.setType ?? 'working',
    })).filter((exercise) => exercise.exerciseId) : [],
    sets: (raw.sets ?? []).map((set) => normalizeLoggedSet(set)),
  }
}

function normalizeLoggedSet(set: Partial<LoggedSet>): LoggedSet {
  return {
    id: set.id ?? crypto.randomUUID(),
    exerciseId: set.exerciseId ?? '',
    setType: set.setType ?? 'working' as SetType,
    weight: set.weight ?? 0,
    reps: set.reps ?? 0,
    ...(set.rir === undefined ? {} : { rir: set.rir }),
    ...(set.rpe === undefined ? {} : { rpe: set.rpe }),
    ...(set.setDurationSeconds === undefined ? {} : { setDurationSeconds: set.setDurationSeconds }),
    ...(set.restDurationSeconds === undefined ? {} : { restDurationSeconds: set.restDurationSeconds }),
    ...(set.notes ? { notes: set.notes } : {}),
    ...(set.completedAt ? { completedAt: set.completedAt } : {}),
  }
}
