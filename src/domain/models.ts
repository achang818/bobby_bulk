export type ExerciseType = 'compound' | 'isolation'
export type MovementPattern = 'horizontal-pull' | 'vertical-pull' | 'horizontal-push' | 'vertical-push' | 'knee-dominant' | 'hip-hinge' | 'carry' | 'isolation' | 'other'
export type JointAction = 'elbow-flexion' | 'elbow-extension' | 'shoulder-flexion' | 'shoulder-extension' | 'shoulder-abduction' | 'shoulder-adduction' | 'shoulder-horizontal-adduction' | 'shoulder-horizontal-abduction' | 'hip-flexion' | 'hip-extension' | 'hip-abduction' | 'hip-adduction' | 'knee-flexion' | 'knee-extension' | 'ankle-plantarflexion' | 'ankle-dorsiflexion' | 'trunk-flexion' | 'trunk-extension' | 'trunk-rotation' | 'trunk-stability' | 'scapular-retraction' | 'scapular-elevation'

export interface Exercise {
  id: string
  name: string
  category: string
  equipment: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  goals: string[]
  type: ExerciseType
  movementPattern: MovementPattern
  primaryAction: JointAction
  repRange: { min: number; max: number }
  defaultSets: number
}

export type EquipmentTag = 'dumbbells' | 'barbells' | 'cables' | 'machines' | 'benches' | 'pull-up-bar' | 'kettlebells' | 'trap-bar' | 'bodyweight' | 'other'

export interface AvailableLoad {
  equipment: EquipmentTag
  increments: number[]
}

export interface Gym {
  id: string
  name: string
  equipment: EquipmentTag[]
  availableLoads?: AvailableLoad[]
}

export interface TodaysContext {
  gymId: string
  unavailableEquipment: EquipmentTag[]
  availableMinutes?: number
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
  unit?: WeightUnit
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

export type TrainingGoal = 'Build muscle' | 'Get stronger' | 'Improve athletic performance' | 'Improve a specific skill' | 'General fitness'
export type WeightUnit = 'kg' | 'lb'

export interface UserPreferences {
  weightUnit: WeightUnit
  goals: TrainingGoal[]
  priorities: string[]
  preferredExerciseIds: string[]
  dislikedExerciseIds: string[]
  availableEquipment: string[]
  defaultGymId?: string
}

export type ExerciseProgressState = 'progressing' | 'stable' | 'stalled' | 'regressing' | 'insufficient history'
export type MuscleVolumeState = 'low recent volume' | 'moderate recent volume' | 'high recent volume' | 'insufficient history'
export type PreferenceState = 'preferred' | 'neutral' | 'disliked' | 'unknown'

export interface ExerciseFeatures {
  exerciseId: string
  sessionsPerformed: number
  lastPerformedDate?: string
  daysSinceLastPerformed?: number
  recentPerformance: { date: string; averageReps: number; averageWeight: number }[]
  averageReps?: number
  averageWeight?: number
  estimatedOneRepMax?: number
  progressionState: ExerciseProgressState
}

export interface MuscleFeatures {
  muscle: string
  recentSets: number
  rolling7DaySets: number
  rolling14DaySets: number
  rolling28DaySets: number
  daysSinceTrained?: number
  frequency14Days: number
  frequency28Days: number
  volumeState: MuscleVolumeState
}

export type PlanRecommendationType = 'KEEP' | 'PROGRESSION' | 'ADD' | 'REPLACE' | 'REMOVE' | 'MODIFY'

export type EvidenceLevel = 'A' | 'B' | 'C' | 'D' | 'Personal'

export interface Source {
  name: string
  year?: number
  url?: string
}

export interface TrainingPrinciple {
  id: string
  topic: string
  description: string
  evidenceLevel: EvidenceLevel
  source: {
    name: string
    year: number
  }
}

export interface RecommendationTrace {
  ruleId: string
  principleId: string
  principleDescription: string
  evidenceLevel: EvidenceLevel
  source: Source
}

export interface PlanRecommendation {
  id: string
  type: PlanRecommendationType
  exerciseId: string
  alternativeExerciseId?: string
  score: number
  reasons: string[]
  progression?: Recommendation
  modifiedSets?: number
  trace: RecommendationTrace
}

export type RecommendationDecisionType = 'accepted' | 'rejected' | 'dismissed'

export interface RecommendationDecision {
  id: string
  recommendationId: string
  recommendationType: PlanRecommendationType
  exerciseId: string
  decision: RecommendationDecisionType
}

export interface Recommendation {
  exercise: Exercise
  weight: number
  sets: number
  repRange: { min: number; max: number }
  action: 'progress-reps' | 'increase-weight' | 'start-here'
  reasons: string[]
}
