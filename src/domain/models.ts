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
  setType: SetType
  weight: number
  loadType?: 'external' | 'bodyweight' | 'weighted-bodyweight' | 'assisted'
  reps: number
  rir?: number
  rpe?: number
  setDurationSeconds?: number
  restDurationSeconds?: number
  notes?: string
  completedAt?: string
}

export type SetType = 'warm-up' | 'working' | 'drop' | 'failure'

export interface PlannedExercise {
  exerciseId: string
  order: number
  sets: number
  repRange: { min: number; max: number }
  setType: SetType
  groupId?: string
  notes?: string
}

export interface WorkoutSession {
  id: string
  /** Always populated for new sessions; optional only while legacy history is normalized. */
  workoutId?: string
  date: string
  title: string
  status?: 'in-progress' | 'completed'
  startedAt?: string
  completedAt?: string
  notes?: string
  unit?: WeightUnit
  /** Snapshot of the plan when the session began; legacy history has none. */
  plannedExercises?: PlannedExercise[]
  sets: LoggedSet[]
}

// Existing progression and recommendation functions use this alias while they
// consume completed WorkoutSession records as history.
export type Workout = WorkoutSession

export interface WorkoutTemplate {
  id: string
  name: string
  description: string
  focus: string
  /** Canonical plan representation. Legacy `exerciseIds` are normalized on load. */
  plannedExercises?: PlannedExercise[]
  /** Transitional projection for existing recommendation code and persisted plans. */
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
  bodyweightLb?: number
}

export type ExerciseProgressState = 'progressing' | 'stable' | 'stalled' | 'regressing' | 'insufficient history'
export type MuscleVolumeState = 'low recent volume' | 'moderate recent volume' | 'high recent volume' | 'insufficient history'
export type PreferenceState = 'preferred' | 'neutral' | 'disliked' | 'unknown'
export type HistoryConfidence = 'none' | 'limited' | 'moderate' | 'strong'
export type WorkloadTrend = 'increasing' | 'stable' | 'decreasing' | 'insufficient history'

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
  recentWorkingSets: { date: string; weight: number; reps: number }[]
  recentBestWorkingLoad?: number
  historyConfidence: HistoryConfidence
}

export interface MuscleFeatures {
  muscle: string
  recentSets: number
  rolling7DaySets: number
  rolling14DaySets: number
  rolling28DaySets: number
  daysSinceTrained?: number
  frequency7Days: number
  frequency14Days: number
  frequency28Days: number
  volumeState: MuscleVolumeState
  workloadTrend: WorkloadTrend
  historyConfidence: HistoryConfidence
}

export interface PlannedVsActualExercise {
  exerciseId: string
  plannedSets: number
  plannedRepRange: { min: number; max: number }
  completedWorkingSets: number
  targetRangeWorkingSets: number
  fullyCompleted: boolean
  demonstratedWorkingLoad?: number
}

export interface TrainingState {
  asOf: string
  exercises: ExerciseFeatures[]
  muscles: MuscleFeatures[]
}

export type WorkoutFindingCategory = 'muscle-coverage' | 'volume' | 'redundancy' | 'movement-pattern' | 'ordering' | 'duration' | 'goal-alignment'
export type WorkoutFindingSeverity = 'info' | 'warning' | 'critical'
export interface WorkoutFinding { category: WorkoutFindingCategory; severity: WorkoutFindingSeverity; title: string; description: string; evidence: string[] }
export interface WorkoutEvaluation { plannedSets: number; estimatedMinutes: number; primaryMuscleSets: Record<string, number>; secondaryMuscles: string[]; movementPatterns: MovementPattern[]; findings: WorkoutFinding[] }
export interface Split { id: string; name: string; workoutIds: string[]; intendedFrequency?: number; notes?: string }
export interface Program { id: string; name: string; splitId: string; goalIds?: string[]; notes?: string }
export interface SplitFinding { category: 'frequency' | 'volume' | 'recovery' | 'redundancy' | 'distribution' | 'complementarity' | 'goal-alignment' | 'structure'; severity: 'info' | 'warning'; title: string; description: string; evidence: string[] }
export interface SplitMuscleSummary { muscle: string; workoutCount: number; plannedWorkingSets: number }
export interface SplitAssessment {
  distribution: 'balanced' | 'concentrated' | 'insufficient information'
  recovery: 'spaced' | 'potential overlap' | 'insufficient information'
  redundancy: 'varied' | 'repeated stimulus' | 'insufficient information'
  complementarity: 'complementary' | 'substantially overlapping' | 'insufficient information'
  goalAlignment: 'aligned' | 'limited' | 'not assessed'
}
export interface SplitEvaluation { splitId: string; workouts: WorkoutEvaluation[]; muscleSummary: SplitMuscleSummary[]; findings: SplitFinding[]; overallAssessment: SplitAssessment }

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
  /** A small, explainable summary of prescription completion and effort evidence. */
  confidence?: 'high' | 'medium' | 'low'
  reasons: string[]
}
