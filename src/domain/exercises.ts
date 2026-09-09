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
    id: 'dumbbell-bench-press', name: 'Dumbbell Bench Press', category: 'Press', equipment: 'Dumbbells',
    primaryMuscles: ['Chest', 'Front delts', 'Triceps'], goals: ['Build muscle', 'Get stronger'], type: 'compound', repRange: { min: 6, max: 10 }, defaultSets: 3,
  },
  {
    id: 'low-to-high-cable-fly', name: 'Low-to-High Cable Fly', category: 'Press', equipment: 'Cable machine',
    primaryMuscles: ['Upper chest'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 10, max: 15 }, defaultSets: 3,
  },
  {
    id: 'dumbbell-front-raise', name: 'Dumbbell Front Raise', category: 'Shoulder', equipment: 'Dumbbells',
    primaryMuscles: ['Front delts'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 10, max: 15 }, defaultSets: 3,
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
  // Append these to the `exercises` array in src/domain/exercises.ts

    {
    id: 'dumbbell-lunge', name: 'Dumbbell Lunge', category: 'Squat', equipment: 'Dumbbells',
    primaryMuscles: ['Quads', 'Glutes'], goals: ['Build muscle', 'General fitness'], type: 'compound', repRange: { min: 8, max: 12 }, defaultSets: 3,
    },
    {
    id: 'bulgarian-split-squat', name: 'Bulgarian Split Squat', category: 'Squat', equipment: 'Dumbbells or barbell',
    primaryMuscles: ['Quads', 'Glutes'], goals: ['Build muscle', 'Get stronger'], type: 'compound', repRange: { min: 8, max: 12 }, defaultSets: 3,
    },
    {
    id: 'front-squat', name: 'Barbell Front Squat', category: 'Squat', equipment: 'Barbell',
    primaryMuscles: ['Quads', 'Glutes'], goals: ['Get stronger', 'Improve athletic performance'], type: 'compound', repRange: { min: 5, max: 8 }, defaultSets: 3,
    },
    {
    id: 'hack-squat', name: 'Hack Squat', category: 'Squat', equipment: 'Machine',
    primaryMuscles: ['Quads', 'Glutes'], goals: ['Build muscle'], type: 'compound', repRange: { min: 8, max: 12 }, defaultSets: 3,
    },
    {
    id: 'leg-extension', name: 'Leg Extension', category: 'Isolation', equipment: 'Machine',
    primaryMuscles: ['Quads'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 10, max: 15 }, defaultSets: 3,
    },
    {
    id: 'seated-leg-curl', name: 'Seated Leg Curl', category: 'Isolation', equipment: 'Machine',
    primaryMuscles: ['Hamstrings'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 10, max: 15 }, defaultSets: 3,
    },
    {
    id: 'hip-thrust', name: 'Barbell Hip Thrust', category: 'Hinge', equipment: 'Barbell',
    primaryMuscles: ['Glutes', 'Hamstrings'], goals: ['Build muscle', 'Get stronger'], type: 'compound', repRange: { min: 6, max: 10 }, defaultSets: 3,
    },
    {
    id: 'cable-pull-through', name: 'Cable Pull-Through', category: 'Hinge', equipment: 'Cable machine',
    primaryMuscles: ['Glutes', 'Hamstrings'], goals: ['Build muscle', 'General fitness'], type: 'compound', repRange: { min: 10, max: 15 }, defaultSets: 3,
    },
    {
    id: 'standing-calf-raise', name: 'Standing Calf Raise', category: 'Isolation', equipment: 'Machine',
    primaryMuscles: ['Calves'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 10, max: 15 }, defaultSets: 4,
    },
    {
    id: 'seated-calf-raise', name: 'Seated Calf Raise', category: 'Isolation', equipment: 'Machine',
    primaryMuscles: ['Calves'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 12, max: 20 }, defaultSets: 3,
    },
    {
    id: 'sumo-deadlift', name: 'Sumo Deadlift', category: 'Hinge', equipment: 'Barbell',
    primaryMuscles: ['Glutes', 'Hamstrings', 'Back'], goals: ['Get stronger'], type: 'compound', repRange: { min: 3, max: 6 }, defaultSets: 3,
    },
    {
    id: 'trap-bar-deadlift', name: 'Trap Bar Deadlift', category: 'Hinge', equipment: 'Trap bar',
    primaryMuscles: ['Glutes', 'Hamstrings', 'Quads'], goals: ['Get stronger', 'Improve athletic performance'], type: 'compound', repRange: { min: 5, max: 8 }, defaultSets: 3,
    },
    {
    id: 'incline-barbell-bench', name: 'Incline Barbell Bench Press', category: 'Press', equipment: 'Barbell',
    primaryMuscles: ['Upper chest', 'Front delts', 'Triceps'], goals: ['Build muscle', 'Get stronger'], type: 'compound', repRange: { min: 6, max: 10 }, defaultSets: 3,
    },
    {
    id: 'decline-bench-press', name: 'Decline Bench Press', category: 'Press', equipment: 'Barbell',
    primaryMuscles: ['Chest', 'Triceps'], goals: ['Build muscle', 'Get stronger'], type: 'compound', repRange: { min: 6, max: 10 }, defaultSets: 3,
    },
    {
    id: 'machine-chest-press', name: 'Machine Chest Press', category: 'Press', equipment: 'Machine',
    primaryMuscles: ['Chest', 'Triceps'], goals: ['Build muscle', 'General fitness'], type: 'compound', repRange: { min: 8, max: 12 }, defaultSets: 3,
    },
    {
    id: 'cable-fly', name: 'Cable Fly', category: 'Isolation', equipment: 'Cable machine',
    primaryMuscles: ['Chest'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 10, max: 15 }, defaultSets: 3,
    },
    {
    id: 'pec-deck', name: 'Pec Deck', category: 'Isolation', equipment: 'Machine',
    primaryMuscles: ['Chest'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 10, max: 15 }, defaultSets: 3,
    },
    {
    id: 'dumbbell-fly', name: 'Dumbbell Fly', category: 'Isolation', equipment: 'Dumbbells',
    primaryMuscles: ['Chest'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 10, max: 15 }, defaultSets: 3,
    },
    {
    id: 'lat-pulldown', name: 'Lat Pulldown', category: 'Pull', equipment: 'Cable machine',
    primaryMuscles: ['Lats', 'Mid back', 'Biceps'], goals: ['Build muscle', 'General fitness'], type: 'compound', repRange: { min: 8, max: 12 }, defaultSets: 3,
    },
    {
    id: 'barbell-row', name: 'Barbell Row', category: 'Pull', equipment: 'Barbell',
    primaryMuscles: ['Mid back', 'Lats', 'Biceps'], goals: ['Build muscle', 'Get stronger'], type: 'compound', repRange: { min: 6, max: 10 }, defaultSets: 3,
    },
    {
    id: 'chest-supported-row', name: 'Chest-Supported Row', category: 'Pull', equipment: 'Machine or dumbbells',
    primaryMuscles: ['Mid back', 'Lats'], goals: ['Build muscle'], type: 'compound', repRange: { min: 8, max: 12 }, defaultSets: 3,
    },
    {
    id: 'single-arm-db-row', name: 'Single-Arm Dumbbell Row', category: 'Pull', equipment: 'Dumbbells',
    primaryMuscles: ['Lats', 'Mid back', 'Biceps'], goals: ['Build muscle', 'Get stronger'], type: 'compound', repRange: { min: 8, max: 12 }, defaultSets: 3,
    },
    {
    id: 'straight-arm-pulldown', name: 'Straight-Arm Pulldown', category: 'Isolation', equipment: 'Cable machine',
    primaryMuscles: ['Lats'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 10, max: 15 }, defaultSets: 3,
    },
    {
    id: 'chin-up', name: 'Chin-up', category: 'Pull', equipment: 'Pull-up bar',
    primaryMuscles: ['Lats', 'Biceps', 'Mid back'], goals: ['Build muscle', 'Get stronger'], type: 'compound', repRange: { min: 5, max: 10 }, defaultSets: 3,
    },
    {
    id: 'lat-pulldown-machine', name: 'Assisted Pull-up Machine', category: 'Pull', equipment: 'Machine',
    primaryMuscles: ['Lats', 'Mid back', 'Biceps'], goals: ['Build muscle', 'General fitness'], type: 'compound', repRange: { min: 8, max: 12 }, defaultSets: 3,
    },
    {
    id: 'arnold-press', name: 'Arnold Press', category: 'Press', equipment: 'Dumbbells',
    primaryMuscles: ['Front delts', 'Side delts', 'Triceps'], goals: ['Build muscle'], type: 'compound', repRange: { min: 8, max: 12 }, defaultSets: 3,
    },
    {
    id: 'machine-shoulder-press', name: 'Machine Shoulder Press', category: 'Press', equipment: 'Machine',
    primaryMuscles: ['Front delts', 'Side delts', 'Triceps'], goals: ['Build muscle', 'General fitness'], type: 'compound', repRange: { min: 8, max: 12 }, defaultSets: 3,
    },
    {
    id: 'db-lateral-raise', name: 'Dumbbell Lateral Raise', category: 'Shoulder', equipment: 'Dumbbells',
    primaryMuscles: ['Side delts'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 12, max: 20 }, defaultSets: 3,
    },
    {
    id: 'rear-delt-fly', name: 'Rear Delt Fly', category: 'Shoulder', equipment: 'Dumbbells or cable',
    primaryMuscles: ['Rear delts'], goals: ['Build muscle', 'General fitness'], type: 'isolation', repRange: { min: 12, max: 20 }, defaultSets: 3,
    },
    {
    id: 'upright-row', name: 'Cable Upright Row', category: 'Shoulder', equipment: 'Cable machine',
    primaryMuscles: ['Side delts', 'Traps'], goals: ['Build muscle'], type: 'compound', repRange: { min: 10, max: 15 }, defaultSets: 3,
    },
    {
    id: 'barbell-shrug', name: 'Barbell Shrug', category: 'Isolation', equipment: 'Barbell',
    primaryMuscles: ['Traps'], goals: ['Build muscle', 'Get stronger'], type: 'isolation', repRange: { min: 8, max: 12 }, defaultSets: 3,
    },
    {
    id: 'ez-bar-curl', name: 'EZ-Bar Curl', category: 'Arms', equipment: 'EZ bar',
    primaryMuscles: ['Biceps'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 8, max: 12 }, defaultSets: 3,
    },
    {
    id: 'hammer-curl', name: 'Hammer Curl', category: 'Arms', equipment: 'Dumbbells',
    primaryMuscles: ['Biceps', 'Forearms'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 8, max: 12 }, defaultSets: 3,
    },
    {
    id: 'preacher-curl', name: 'Preacher Curl', category: 'Arms', equipment: 'Machine or EZ bar',
    primaryMuscles: ['Biceps'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 8, max: 12 }, defaultSets: 3,
    },
    {
    id: 'cable-curl', name: 'Cable Curl', category: 'Arms', equipment: 'Cable machine',
    primaryMuscles: ['Biceps'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 10, max: 15 }, defaultSets: 3,
    },
    {
    id: 'overhead-triceps-extension', name: 'Overhead Triceps Extension', category: 'Arms', equipment: 'Dumbbell or cable',
    primaryMuscles: ['Triceps'], goals: ['Build muscle'], type: 'isolation', repRange: { min: 8, max: 12 }, defaultSets: 3,
    },
    {
    id: 'skull-crusher', name: 'Skull Crusher', category: 'Arms', equipment: 'Barbell or EZ bar',
    primaryMuscles: ['Triceps'], goals: ['Build muscle', 'Get stronger'], type: 'isolation', repRange: { min: 8, max: 12 }, defaultSets: 3,
    },
    {
    id: 'close-grip-bench', name: 'Close-Grip Bench Press', category: 'Press', equipment: 'Barbell',
    primaryMuscles: ['Triceps', 'Chest'], goals: ['Build muscle', 'Get stronger'], type: 'compound', repRange: { min: 6, max: 10 }, defaultSets: 3,
    },
    {
    id: 'dips', name: 'Dips', category: 'Press', equipment: 'Dip bars',
    primaryMuscles: ['Chest', 'Triceps', 'Front delts'], goals: ['Build muscle', 'Get stronger'], type: 'compound', repRange: { min: 6, max: 12 }, defaultSets: 3,
    },
    {
    id: 'plank', name: 'Plank', category: 'Isolation', equipment: 'Bodyweight',
    primaryMuscles: ['Abs'], goals: ['General fitness'], type: 'isolation', repRange: { min: 1, max: 1 }, defaultSets: 3,
    },
    {
    id: 'cable-crunch', name: 'Cable Crunch', category: 'Isolation', equipment: 'Cable machine',
    primaryMuscles: ['Abs'], goals: ['Build muscle', 'General fitness'], type: 'isolation', repRange: { min: 10, max: 15 }, defaultSets: 3,
    },
    {
    id: 'hanging-leg-raise', name: 'Hanging Leg Raise', category: 'Isolation', equipment: 'Pull-up bar',
    primaryMuscles: ['Abs'], goals: ['Build muscle', 'Improve athletic performance'], type: 'isolation', repRange: { min: 8, max: 15 }, defaultSets: 3,
    },
    {
    id: 'ab-wheel-rollout', name: 'Ab Wheel Rollout', category: 'Isolation', equipment: 'Ab wheel',
    primaryMuscles: ['Abs'], goals: ['Build muscle', 'Improve athletic performance'], type: 'isolation', repRange: { min: 8, max: 15 }, defaultSets: 3,
    },
    {
    id: 'farmers-carry', name: "Farmer's Carry", category: 'Hinge', equipment: 'Dumbbells or kettlebells',
    primaryMuscles: ['Forearms', 'Traps', 'Abs'], goals: ['Improve athletic performance', 'General fitness'], type: 'compound', repRange: { min: 1, max: 1 }, defaultSets: 3,
    },
    {
    id: 'kettlebell-swing', name: 'Kettlebell Swing', category: 'Hinge', equipment: 'Kettlebell',
    primaryMuscles: ['Glutes', 'Hamstrings'], goals: ['Improve athletic performance', 'General fitness'], type: 'compound', repRange: { min: 12, max: 20 }, defaultSets: 3,
    },
    {
    id: 'box-jump', name: 'Box Jump', category: 'Squat', equipment: 'Plyo box',
    primaryMuscles: ['Quads', 'Glutes'], goals: ['Improve athletic performance'], type: 'compound', repRange: { min: 5, max: 8 }, defaultSets: 3,
    },
]
