import type { WorkoutTemplate } from './models'

export const workoutTemplates: WorkoutTemplate[] = [
  { id: 'upper-a', name: 'Upper A', description: 'A balanced push and pull session.', focus: 'Chest · Back · Shoulders', exerciseIds: ['barbell-bench-press', 'cable-row', 'dumbbell-shoulder-press', 'cable-lateral-raise', 'triceps-pushdown'] },
  { id: 'lower-a', name: 'Lower A', description: 'Build strength through your lower body.', focus: 'Quads · Glutes · Hamstrings', exerciseIds: ['barbell-back-squat', 'romanian-deadlift', 'leg-press', 'lying-leg-curl'] },
  { id: 'full-body', name: 'Full Body', description: 'The essential movements in one efficient session.', focus: 'Full body · 45 min', exerciseIds: ['goblet-squat', 'incline-db-bench', 'cable-row', 'dumbbell-curl'] },
]