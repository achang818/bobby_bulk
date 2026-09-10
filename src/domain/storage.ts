import { exercises } from './exercises'
import { normalizeWorkoutSession, normalizeWorkoutTemplate } from './workout-session'
import type { Gym, PlanRecommendation, Program, RecommendationDecision, RecommendationDecisionType, Split, TodaysContext, UserPreferences, Workout, WorkoutSession, WorkoutTemplate } from './models'
import { defaultPreferences } from './preferences'

const STORAGE_KEY = 'bobby-bulk-workouts'
const WORKOUT_BACKUP_KEY = 'bobby-bulk-workouts-backup'
const TEMPLATE_KEY = 'bobby-bulk-templates'
const PLAN_KEY = 'bobby-bulk-plans'
const PREFERENCES_KEY = 'bobby-bulk-preferences'
const DECISIONS_KEY = 'bobby-bulk-recommendation-decisions'
const GYMS_KEY = 'bobby-bulk-gyms'
const TODAYS_CONTEXT_KEY = 'bobby-bulk-todays-context'
const SPLITS_KEY = 'bobby-bulk-splits'
const PROGRAMS_KEY = 'bobby-bulk-programs'
const ACTIVE_SESSION_KEY = 'bobby-bulk-active-session'

/** Keys mirrored to the local development JSON store. */
export const PERSISTED_STORAGE_KEYS = [
  STORAGE_KEY, WORKOUT_BACKUP_KEY, ACTIVE_SESSION_KEY, TEMPLATE_KEY, PLAN_KEY,
  PREFERENCES_KEY, DECISIONS_KEY, GYMS_KEY, TODAYS_CONTEXT_KEY, SPLITS_KEY, PROGRAMS_KEY,
] as const

export function loadWorkouts(): Workout[] {
  const primary = readWorkouts(localStorage.getItem(STORAGE_KEY))
  const backup = primary ?? readWorkouts(localStorage.getItem(WORKOUT_BACKUP_KEY))
  if (!backup) return []
  persistWorkouts(backup)
  return backup
}

/** Writes both the current history and a recovery copy for client-side storage failures. */
export function persistWorkouts(workouts: Workout[]): Workout[] {
  const serialized = JSON.stringify(workouts)
  localStorage.setItem(STORAGE_KEY, serialized)
  localStorage.setItem(WORKOUT_BACKUP_KEY, serialized)
  return workouts
}

export function mergeWorkoutSessions(workouts: Workout[]): Workout[] {
  const merged = new Map<string, Workout>()
  for (const workout of workouts) {
    const key = `${workout.date}|${workout.title.trim().toLowerCase()}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { ...workout, sets: [...workout.sets] })
      continue
    }
    merged.set(key, {
      ...existing,
      status: existing.status === 'completed' || workout.status === 'completed' ? 'completed' : existing.status ?? workout.status,
      completedAt: [existing.completedAt, workout.completedAt].filter(Boolean).sort().at(-1),
      plannedExercises: existing.plannedExercises?.length ? existing.plannedExercises : workout.plannedExercises,
      sets: [...existing.sets, ...workout.sets],
    })
  }
  return [...merged.values()]
}

export function saveWorkout(workout: Workout, existingWorkouts = loadWorkouts()): Workout[] {
  const workouts = [workout, ...existingWorkouts.filter((item) => item.id !== workout.id)]
  return persistWorkouts(workouts)
}

/** Active logger work is saved separately so a refresh never discards logged sets. */
export function loadActiveWorkoutSession(): WorkoutSession | null {
  const stored = localStorage.getItem(ACTIVE_SESSION_KEY)
  if (!stored) return null
  try {
    const session = normalizeWorkoutSession(JSON.parse(stored) as unknown)
    return session.status === 'completed' ? null : session
  } catch {
    localStorage.removeItem(ACTIVE_SESSION_KEY)
    return null
  }
}

export function saveActiveWorkoutSession(session: WorkoutSession): WorkoutSession {
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session))
  return session
}

export function clearActiveWorkoutSession() {
  localStorage.removeItem(ACTIVE_SESSION_KEY)
}

export function updateWorkout(workout: Workout, existingWorkouts = loadWorkouts()): Workout[] {
  const workouts = existingWorkouts.map((item) => item.id === workout.id ? workout : item)
  return persistWorkouts(workouts)
}

export function deleteWorkout(workoutId: string, existingWorkouts = loadWorkouts()): Workout[] {
  const workouts = existingWorkouts.filter((workout) => workout.id !== workoutId)
  return persistWorkouts(workouts)
}

export function loadSavedTemplates(): WorkoutTemplate[] {
  const stored = localStorage.getItem(TEMPLATE_KEY)
  if (!stored) return []
  const templates = (JSON.parse(stored) as unknown[]).map((template) => normalizeWorkoutTemplate(template, exercises))
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates))
  return templates
}

export function toggleSavedTemplate(template: WorkoutTemplate): WorkoutTemplate[] {
  const saved = loadSavedTemplates()
  const exists = saved.some((item) => item.id === template.id)
  const next = exists ? saved.filter((item) => item.id !== template.id) : [...saved, { ...template, saved: true }]
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next))
  return next
}

export function loadPlans(): WorkoutTemplate[] {
  const stored = localStorage.getItem(PLAN_KEY)
  if (!stored) return []
  const plans = (JSON.parse(stored) as unknown[]).map((plan) => normalizeWorkoutTemplate(plan, exercises))
  localStorage.setItem(PLAN_KEY, JSON.stringify(plans))
  return plans
}

export function savePlan(plan: WorkoutTemplate): WorkoutTemplate[] {
  const plans = [plan, ...loadPlans().filter((item) => item.id !== plan.id)]
  localStorage.setItem(PLAN_KEY, JSON.stringify(plans))
  return plans
}

export function deletePlan(planId: string): WorkoutTemplate[] {
  const plans = loadPlans().filter((plan) => plan.id !== planId)
  localStorage.setItem(PLAN_KEY, JSON.stringify(plans))
  return plans
}

export function loadSplits(): Split[] {
  const parsed = JSON.parse(localStorage.getItem(SPLITS_KEY) ?? '[]') as unknown
  return Array.isArray(parsed) ? parsed.filter(isSplit) : []
}

export function saveSplit(split: Split): Split[] {
  const splits = [split, ...loadSplits().filter((item) => item.id !== split.id)]
  localStorage.setItem(SPLITS_KEY, JSON.stringify(splits))
  return splits
}

export function deleteSplit(splitId: string): Split[] {
  const splits = loadSplits().filter((split) => split.id !== splitId)
  localStorage.setItem(SPLITS_KEY, JSON.stringify(splits))
  return splits
}

export function loadPrograms(): Program[] {
  const parsed = JSON.parse(localStorage.getItem(PROGRAMS_KEY) ?? '[]') as unknown
  return Array.isArray(parsed) ? parsed.filter(isProgram) : []
}

export function saveProgram(program: Program): Program[] {
  const programs = [program, ...loadPrograms().filter((item) => item.id !== program.id)]
  localStorage.setItem(PROGRAMS_KEY, JSON.stringify(programs))
  return programs
}

export function deleteProgram(programId: string): Program[] {
  const programs = loadPrograms().filter((program) => program.id !== programId)
  localStorage.setItem(PROGRAMS_KEY, JSON.stringify(programs))
  return programs
}

export function loadPreferences(): UserPreferences {
  const stored = localStorage.getItem(PREFERENCES_KEY)
  return stored ? { ...defaultPreferences, ...(JSON.parse(stored) as Partial<UserPreferences>) } : defaultPreferences
}

export function savePreferences(preferences: UserPreferences): UserPreferences {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
  return preferences
}

export function loadGyms(): Gym[] {
  const stored = localStorage.getItem(GYMS_KEY)
  return stored ? (JSON.parse(stored) as Gym[]) : []
}

export function saveGyms(gyms: Gym[]): Gym[] {
  localStorage.setItem(GYMS_KEY, JSON.stringify(gyms))
  return gyms
}

export function loadTodaysContext(defaultContext: TodaysContext): TodaysContext {
  const stored = localStorage.getItem(TODAYS_CONTEXT_KEY)
  return stored ? { ...defaultContext, ...(JSON.parse(stored) as Partial<TodaysContext>) } : defaultContext
}

export function saveTodaysContext(context: TodaysContext): TodaysContext {
  localStorage.setItem(TODAYS_CONTEXT_KEY, JSON.stringify(context))
  return context
}

export function saveRecommendationDecision(recommendation: PlanRecommendation, decision: RecommendationDecisionType): RecommendationDecision[] {
  const decisions = [...loadRecommendationDecisions(), {
    id: crypto.randomUUID(),
    recommendationId: recommendation.id,
    recommendationType: recommendation.type,
    exerciseId: recommendation.exerciseId,
    decision,
  }]
  localStorage.setItem(DECISIONS_KEY, JSON.stringify(decisions))
  return decisions
}

export function loadRecommendationDecisions(): RecommendationDecision[] {
  const parsed = JSON.parse(localStorage.getItem(DECISIONS_KEY) ?? '[]') as unknown
  return Array.isArray(parsed) ? parsed as RecommendationDecision[] : []
}

export function latestRecommendationDecision(recommendationId: string, decisions: RecommendationDecision[]): RecommendationDecisionType | undefined {
  return [...decisions].reverse().find((item) => item.recommendationId === recommendationId)?.decision
}

function isSplit(value: unknown): value is Split {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Split>
  return typeof candidate.id === 'string' && typeof candidate.name === 'string' && Array.isArray(candidate.workoutIds) && candidate.workoutIds.every((id) => typeof id === 'string')
}

function isProgram(value: unknown): value is Program {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Program>
  return typeof candidate.id === 'string' && typeof candidate.name === 'string' && typeof candidate.splitId === 'string'
}

function readWorkouts(serialized: string | null): Workout[] | null {
  if (!serialized) return null
  try {
    const parsed = JSON.parse(serialized) as unknown
    return Array.isArray(parsed) ? parsed.map(normalizeWorkoutSession) : null
  } catch {
    return null
  }
}
