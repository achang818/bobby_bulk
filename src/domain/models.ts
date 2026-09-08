export type ExerciseType = 'compound' | 'isolation'

export interface Exercise {
  id: string
  name: string
  category: string
  equipment: string
  primaryMuscles: string[]
  goals: string[]
  type: ExerciseType
  repRange: { min: number; max: number }
  defaultSets: number
}

export interface LoggedSet {
  id: string
  exerciseId: string
  weight: number
  reps: number
  rir?: number
  setDurationSeconds?: number
  restDurationSeconds?: number
}

export interface Workout {
  id: string
  date: string
  title: string
  notes?: string
  sets: LoggedSet[]
}

export interface WorkoutTemplate {
  id: string
  name: string
  description: string
  focus: string
  exerciseIds: string[]
  saved?: boolean
}

export type WorkoutPlan = WorkoutTemplate

export interface Recommendation {
  exercise: Exercise
  weight: number
  sets: number
  repRange: { min: number; max: number }
  action: 'progress-reps' | 'increase-weight' | 'start-here'
  reasons: string[]
}
