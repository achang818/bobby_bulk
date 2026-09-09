import { exercises } from './exercises'
import { normalizeWorkoutSession, normalizeWorkoutTemplate } from './workout-session'
import type { Gym, PlanRecommendation, RecommendationDecision, RecommendationDecisionType, TodaysContext, UserPreferences, Workout, WorkoutTemplate } from './models'
import { defaultPreferences } from './preferences'

const STORAGE_KEY = 'bobby-bulk-workouts'
const TEMPLATE_KEY = 'bobby-bulk-templates'
const PLAN_KEY = 'bobby-bulk-plans'
const PREFERENCES_KEY = 'bobby-bulk-preferences'
const DECISIONS_KEY = 'bobby-bulk-recommendation-decisions'
const GYMS_KEY = 'bobby-bulk-gyms'
const TODAYS_CONTEXT_KEY = 'bobby-bulk-todays-context'

export function loadWorkouts(): Workout[] {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return []
  const workouts = (JSON.parse(stored) as unknown[]).map(normalizeWorkoutSession)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts))
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
  const workouts = [workout, ...existingWorkouts]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts))
  return workouts
}

export function updateWorkout(workout: Workout, existingWorkouts = loadWorkouts()): Workout[] {
  const workouts = existingWorkouts.map((item) => item.id === workout.id ? workout : item)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts))
  return workouts
}

export function deleteWorkout(workoutId: string, existingWorkouts = loadWorkouts()): Workout[] {
  const workouts = existingWorkouts.filter((workout) => workout.id !== workoutId)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts))
  return workouts
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
