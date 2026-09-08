import type { Workout, WorkoutTemplate } from './models'

const STORAGE_KEY = 'bobby-bulk-workouts'
const TEMPLATE_KEY = 'bobby-bulk-templates'
const PLAN_KEY = 'bobby-bulk-plans'

export function loadWorkouts(): Workout[] {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored ? (JSON.parse(stored) as Workout[]) : []
}

export function saveWorkout(workout: Workout, existingWorkouts = loadWorkouts()): Workout[] {
  const workouts = [workout, ...existingWorkouts]
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
