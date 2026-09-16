import type { Exercise, Gym, LoggedSet, Recommendation, PlannedExercise, SetType, TodaysContext, WeightUnit, WorkoutSession, WorkoutTemplate } from './models'
import { contextForGym } from './gyms'
import { displayWeight } from './units'

const defaultRepRange = { min: 8, max: 12 }

export function planExerciseIds(plan: WorkoutTemplate): string[] {
  return plannedExercisesFor(plan).map((exercise) => exercise.exerciseId)
}

/** The single boundary where legacy id-only plans become structured slots. */
export function plannedExercisesFor(plan: WorkoutTemplate, exercises: Exercise[] = []): PlannedExercise[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  return plan.plannedExercises?.slice().sort((a, b) => a.order - b.order)
    ?? plan.exerciseIds.map((id, order) => createPlannedExercise(id, order, byId.get(id)))
}

export function synchronizePlan(plan: WorkoutTemplate, exercises: Exercise[] = []): WorkoutTemplate {
  const plannedExercises = plannedExercisesFor(plan, exercises)
  return { ...plan, plannedExercises, exerciseIds: plannedExercises.map((exercise) => exercise.exerciseId) }
}

export function resolveWorkoutForToday(plan: WorkoutTemplate, recommendations: Recommendation[], exercises: Exercise[] = []): WorkoutTemplate {
  const resolved = plannedExercisesFor(plan, exercises)
    .flatMap((planned) => {
      const applicable = recommendations.filter((item) => item.target.kind === 'exercise' && item.target.exerciseId === planned.exerciseId)
      if (applicable.some((item) => item.change.kind === 'remove')) return []
      const resolved = applicable.reduce((current, recommendation) => {
        if (recommendation.change.kind === 'replace') return { ...current, exerciseId: recommendation.change.toExerciseId }
        if (recommendation.change.kind === 'modify') return { ...current, ...recommendation.change.changes }
        return current
      }, planned)
      return [{ ...resolved, repRange: { ...resolved.repRange } }]
    })
    .map((planned, order) => ({ ...planned, order }))
  return synchronizePlan({ ...plan, plannedExercises: resolved }, exercises)
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
  return synchronizePlan({
    id: raw.id ?? crypto.randomUUID(),
    name: raw.name ?? 'Untitled workout',
    description: raw.description ?? '',
    focus: raw.focus ?? '',
    plannedExercises,
    exerciseIds: plannedExercises.slice().sort((a, b) => a.order - b.order).map((item) => item.exerciseId),
    ...(raw.saved === undefined ? {} : { saved: raw.saved }),
    ...(raw.planningAuthority === undefined ? {} : { planningAuthority: raw.planningAuthority }),
  }, exercises)
}

export function createWorkoutSession(workout: WorkoutTemplate, plannedExercises = plannedExercisesFor(workout), unit?: WeightUnit): WorkoutSession {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    workoutId: workout.id,
    date: now.slice(0, 10),
    title: workout.name,
    status: 'in-progress',
    startedAt: now,
    unit,
    planningAuthority: workout.planningAuthority ?? 'user-plan',
    plannedExercises: plannedExercises.map((exercise) => ({ ...exercise, repRange: { ...exercise.repRange }, ...(exercise.loadRecommendation ? { loadRecommendation: { ...exercise.loadRecommendation } } : {}) })),
    sets: [],
  }
}

export function completeWorkoutSession(session: WorkoutSession): WorkoutSession {
  return { ...session, status: 'completed', completedAt: new Date().toISOString() }
}

export function captureSessionGym(session: WorkoutSession, gym: Gym, context: TodaysContext): WorkoutSession {
  return { ...session, gym: structuredClone(gym), context: structuredClone(contextForGym(context, gym)) }
}

/** Shared app boundary: resolve contextual changes, then capture that exact session. */
export function createWorkoutSessionForToday(plan: WorkoutTemplate, recommendations: Recommendation[], exercises: Exercise[], unit: WeightUnit): WorkoutSession {
  return createWorkoutSession(resolveWorkoutForToday(plan, recommendations, exercises), undefined, unit)
}

/** Logging can include extra movements while the starting prescription stays intact. */
export function sessionExercises(session: WorkoutSession): PlannedExercise[] {
  return [...(session.plannedExercises ?? []), ...(session.addedExercises ?? [])]
}

/** Actual session choices take precedence; an unknown target leaves the input empty. */
export function sessionLoadInput(session: WorkoutSession, exerciseId: string, unit: WeightUnit): string | undefined {
  const latest = session.sets.filter((set) => set.exerciseId === exerciseId).at(-1)
  if (latest) return String(displayWeight(latest.weight, session.unit, unit))
  const target = sessionExercises(session).find((exercise) => exercise.exerciseId === exerciseId)?.loadRecommendation
  if (!target) return undefined
  return target.kind === 'target' ? String(displayWeight(target.weight, target.unit, unit)) : ''
}

export function compareWorkoutChronology(left: WorkoutSession, right: WorkoutSession): number {
  return left.date.localeCompare(right.date)
    || (left.completedAt ?? left.startedAt ?? '').localeCompare(right.completedAt ?? right.startedAt ?? '')
    || left.id.localeCompare(right.id)
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
    ...(raw.gym ? { gym: structuredClone(raw.gym) } : {}),
    ...(raw.context ? { context: structuredClone(raw.context) } : {}),
    ...(Array.isArray(raw.adaptationNotes) ? { adaptationNotes: raw.adaptationNotes.filter((note) => typeof note === 'string') } : {}),
    planningAuthority: raw.planningAuthority ?? 'user-plan',
    plannedExercises: Array.isArray(raw.plannedExercises) ? raw.plannedExercises.map((exercise, index) => ({
      ...createPlannedExercise(exercise.exerciseId ?? '', exercise.order ?? index), ...exercise, order: exercise.order ?? index, setType: exercise.setType ?? 'working',
    })).filter((exercise) => exercise.exerciseId) : [],
    ...(Array.isArray(raw.addedExercises) ? { addedExercises: raw.addedExercises.map((exercise, index) => ({
      ...createPlannedExercise(exercise.exerciseId, exercise.order ?? index), ...exercise,
      repRange: { ...(exercise.repRange ?? defaultRepRange) },
    })).filter((exercise) => exercise.exerciseId) } : {}),
    sets: (raw.sets ?? []).map((set) => normalizeLoggedSet(set)),
  }
}

function normalizeLoggedSet(set: Partial<LoggedSet>): LoggedSet {
  return {
    id: set.id ?? crypto.randomUUID(),
    exerciseId: set.exerciseId ?? '',
    setType: set.setType ?? 'working' as SetType,
    weight: set.weight ?? 0,
    ...(set.loadType === undefined ? {} : { loadType: set.loadType }),
    reps: set.reps ?? 0,
    ...(set.rir === undefined ? {} : { rir: set.rir }),
    ...(set.rpe === undefined ? {} : { rpe: set.rpe }),
    ...(set.setDurationSeconds === undefined ? {} : { setDurationSeconds: set.setDurationSeconds }),
    ...(set.restDurationSeconds === undefined ? {} : { restDurationSeconds: set.restDurationSeconds }),
    ...(set.notes ? { notes: set.notes } : {}),
    ...(set.completedAt ? { completedAt: set.completedAt } : {}),
  }
}
