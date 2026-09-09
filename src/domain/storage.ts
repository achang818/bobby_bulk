import type { UserPreferences, Workout, WorkoutTemplate } from './models'
import { defaultPreferences } from './preferences'

const STORAGE_KEY = 'bobby-bulk-workouts'
const TEMPLATE_KEY = 'bobby-bulk-templates'
const PLAN_KEY = 'bobby-bulk-plans'
const PREFERENCES_KEY = 'bobby-bulk-preferences'
const DECISIONS_KEY = 'bobby-bulk-recommendation-decisions'

export function loadWorkouts(): Workout[] {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored ? (JSON.parse(stored) as Workout[]) : []
}

export function saveWorkout(workout: Workout, existingWorkouts = loadWorkouts()): Workout[] {
  const workouts = [workout, ...existingWorkouts]
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
  return stored ? (JSON.parse(stored) as WorkoutTemplate[]) : []
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
  return stored ? (JSON.parse(stored) as WorkoutTemplate[]) : []
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

export function saveRecommendationDecision(recommendationId: string, decision: 'accepted' | 'rejected' | 'dismissed'): Record<string, string> {
  const decisions = JSON.parse(localStorage.getItem(DECISIONS_KEY) ?? '{}') as Record<string, string>
  decisions[recommendationId] = decision
  localStorage.setItem(DECISIONS_KEY, JSON.stringify(decisions))
  return decisions
}
