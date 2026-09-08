import type { Exercise } from './models'

export const exercises: Exercise[] = [
  {
    id: 'incline-db-bench',
    name: 'Incline Dumbbell Bench Press',
    category: 'Press',
    equipment: 'Dumbbells',
    primaryMuscles: ['Upper chest', 'Front delts', 'Triceps'],
    goals: ['Build muscle', 'Get stronger'],
    type: 'compound',
    repRange: { min: 6, max: 10 },
    defaultSets: 3,
  },
  {
    id: 'goblet-squat',
    name: 'Goblet Squat',
    category: 'Squat',
    equipment: 'Dumbbell or kettlebell',
    primaryMuscles: ['Quads', 'Glutes'],
    goals: ['Build muscle', 'General fitness'],
    type: 'compound',
    repRange: { min: 8, max: 12 },
    defaultSets: 3,
  },
  {
    id: 'cable-row',
    name: 'Seated Cable Row',
    category: 'Pull',
    equipment: 'Cable machine',
    primaryMuscles: ['Mid back', 'Lats', 'Biceps'],
    goals: ['Build muscle', 'Get stronger'],
    type: 'compound',
    repRange: { min: 8, max: 12 },
    defaultSets: 3,
  },
  {
    id: 'cable-lateral-raise',
    name: 'Cable Lateral Raise',
    category: 'Shoulder',
    equipment: 'Cable machine',
    primaryMuscles: ['Side delts'],
    goals: ['Build muscle'],
    type: 'isolation',
    repRange: { min: 10, max: 15 },
    defaultSets: 3,
  },
  {
    id: 'barbell-back-squat', name: 'Barbell Back Squat', category: 'Squat', equipment: 'Barbell',
    primaryMuscles: ['Quads', 'Glutes', 'Adductors'], goals: ['Build muscle', 'Get stronger'], type: 'compound', repRange: { min: 5, max: 8 }, defaultSets: 3,
  },
  {
    id: 'barbell-deadlift', name: 'Barbell Deadlift', category: 'Hinge', equipment: 'Barbell',
    primaryMuscles: ['Glutes', 'Hamstrings', 'Back'], goals: ['Get stronger', 'Improve athletic performance'], type: 'compound', repRange: { min: 3, max: 6 }, defaultSets: 3,
  },
  {
    id: 'barbell-bench-press', name: 'Barbell Bench Press', category: 'Press', equipment: 'Barbell',
    primaryMuscles: ['Chest', 'Front delts', 'Triceps'], goals: ['Build muscle', 'Get stronger'], type: 'compound', repRange: { min: 5, max: 8 }, defaultSets: 3,
  },
  {
    id: 'pull-up', name: 'Pull-up', category: 'Pull', equipment: 'Pull-up bar',
    primaryMuscles: ['Lats', 'Mid back', 'Biceps'], goals: ['Build muscle', 'Get stronger', 'General fitness'], type: 'compound', repRange: { min: 5, max: 10 }, defaultSets: 3,
  },
  {
    id: 'dumbbell-shoulder-press', name: 'Dumbbell Shoulder Press', category: 'Press', equipment: 'Dumbbells',
    primaryMuscles: ['Front delts', 'Side delts', 'Triceps'], goals: ['Build muscle', 'Get stronger'], type: 'compound', repRange: { min: 6, max: 10 }, defaultSets: 3,
  },
  {
    id: 'romanian-deadlift', name: 'Romanian Deadlift', category: 'Hinge', equipment: 'Barbell or dumbbells',
    primaryMuscles: ['Hamstrings', 'Glutes', 'Back'], goals: ['Build muscle', 'Get stronger'], type: 'compound', repRange: { min: 8, max: 12 }, defaultSets: 3,
  },
  {
    id: 'leg-press', name: 'Leg Press', category: 'Squat', equipment: 'Machine',
    primaryMuscles: ['Quads', 'Glutes'], goals: ['Build muscle', 'General fitness'], type: 'compound', repRange: { min: 8, max: 12 }, defaultSets: 3,
  },
  {
    id: 'lying-leg-curl', name: 'Lying Leg Curl', category: 'Isolation', equipment: 'Machine',
    primaryMuscles: ['Hamstrings'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 10, max: 15 }, defaultSets: 3,
  },
  {
    id: 'triceps-pushdown', name: 'Cable Triceps Pushdown', category: 'Arms', equipment: 'Cable machine',
    primaryMuscles: ['Triceps'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 10, max: 15 }, defaultSets: 3,
  },
  {
    id: 'dumbbell-curl', name: 'Dumbbell Curl', category: 'Arms', equipment: 'Dumbbells',
    primaryMuscles: ['Biceps'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 8, max: 12 }, defaultSets: 3,
  },
  {
    id: 'face-pull', name: 'Face Pull', category: 'Shoulder', equipment: 'Cable machine',
    primaryMuscles: ['Rear delts', 'Upper back'], goals: ['Build muscle', 'General fitness'], type: 'isolation', repRange: { min: 12, max: 20 }, defaultSets: 3,
  },
  {
    id: 'push-up', name: 'Push-up', category: 'Press', equipment: 'Bodyweight',
    primaryMuscles: ['Chest', 'Front delts', 'Triceps'], goals: ['Build muscle', 'General fitness'], type: 'compound', repRange: { min: 8, max: 20 }, defaultSets: 3,
  },
]
