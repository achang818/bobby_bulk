import type { Workout } from './models'

export const sampleWorkouts: Workout[] = [
  {
    id: 'sample-1',
    date: '2026-09-06',
    title: 'Upper strength',
    sets: [
      { id: 's-1', exerciseId: 'incline-db-bench', weight: 70, reps: 10 },
      { id: 's-2', exerciseId: 'incline-db-bench', weight: 70, reps: 10 },
      { id: 's-3', exerciseId: 'incline-db-bench', weight: 70, reps: 10 },
      { id: 's-4', exerciseId: 'cable-row', weight: 90, reps: 10 },
      { id: 's-5', exerciseId: 'cable-row', weight: 90, reps: 9 },
      { id: 's-6', exerciseId: 'cable-row', weight: 90, reps: 9 },
    ],
  },
  {
    id: 'sample-2',
    date: '2026-09-03',
    title: 'Lower body',
    sets: [
      { id: 's-7', exerciseId: 'goblet-squat', weight: 60, reps: 12 },
      { id: 's-8', exerciseId: 'goblet-squat', weight: 60, reps: 11 },
      { id: 's-9', exerciseId: 'goblet-squat', weight: 60, reps: 10 },
    ],
  },
]
