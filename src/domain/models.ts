export type ExerciseType = 'compound' | 'isolation'
/** Broad structural movement category, used to preserve exercise intent. */
export type MovementPattern = 'horizontal-pull' | 'vertical-pull' | 'horizontal-push' | 'vertical-push' | 'knee-dominant' | 'hip-hinge' | 'carry' | 'trunk-flexion' | 'isolation' | 'other'
/** Specific primary anatomical or joint action; this is not a movement-pattern label. */
export type JointAction = 'elbow-flexion' | 'elbow-extension' | 'shoulder-flexion' | 'shoulder-extension' | 'shoulder-abduction' | 'shoulder-adduction' | 'shoulder-horizontal-adduction' | 'shoulder-horizontal-abduction' | 'hip-flexion' | 'hip-extension' | 'hip-abduction' | 'hip-adduction' | 'knee-flexion' | 'knee-extension' | 'ankle-plantarflexion' | 'ankle-dorsiflexion' | 'spinal-flexion' | 'trunk-extension' | 'trunk-rotation' | 'trunk-stability' | 'scapular-retraction' | 'scapular-elevation'

export interface Exercise {
  id: string
  name: string
  /** Catalog/UI grouping, not a biomechanical movement classification. */
  category: string
  equipment: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  goals: string[]
  /** Whether the exercise is treated as compound or isolation for plan structure. */
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

export type TrainingGoal = 'Build muscle' | 'Get stronger' | 'Improve athletic performance' | 'Improve a specific skill' | 'General fitness' | 'Aesthetic physique'
export type WeightUnit = 'kg' | 'lb'

export interface UserPreferences {
  weightUnit: WeightUnit
  goals: TrainingGoal[]
  priorities: string[]
  preferredExerciseIds: string[]
  /** Soft negative feedback: the exercise remains selectable, but ranks lower. */
  recommendLessExerciseIds: string[]
  /** Hard selection constraint for normal exercise recommendations. */
  excludedExerciseIds: string[]
  /** @deprecated Legacy persisted exclusions. New callers should use `excludedExerciseIds`. */
  dislikedExerciseIds: string[]
  availableEquipment: string[]
  defaultGymId?: string
  bodyweightLb?: number
}

export type ExerciseProgressState = 'progressing' | 'stable' | 'stalled' | 'regressing' | 'insufficient history'
export type MuscleVolumeState = 'low recent volume' | 'moderate recent volume' | 'high recent volume' | 'insufficient history'
export type PreferenceState = 'preferred' | 'neutral' | 'recommend-less' | 'excluded' | 'unknown'
export type HistoryConfidence = 'none' | 'limited' | 'moderate' | 'strong'
export type WorkloadTrend = 'increasing' | 'stable' | 'decreasing' | 'insufficient history'

/** The intended role to preserve when considering a replacement in one workout. */
export type ExerciseRole = 'primary-compound' | 'secondary-compound' | 'isolation' | 'accessory' | 'goal-critical' | 'optional-variation'
export type ExerciseCompatibility = 'strong' | 'reasonable' | 'weak'
export type ExerciseCandidateEligibility = 'eligible' | 'excluded' | 'unavailable-equipment' | 'category-mismatch' | 'missing-direct-primary-target'
/** The rule that established a replacement is warranted. */
export type ExerciseReplacementReason = 'equipment-unavailable' | 'stalled' | 'regressing'

/** Structural comparison only; it does not decide whether a replacement is allowed. */
export interface ExerciseSimilarity {
  sameExercise: boolean
  directPrimaryMuscleOverlap: string[]
  supportingMuscleOverlap: string[]
  movementPatternMatch: boolean
  primaryActionMatch: boolean
  typeMatch: boolean
  categoryMatch: boolean
  goalOverlap: TrainingGoal[]
}

/** Explainable result for one possible exercise candidate. */
export interface ExerciseCandidate {
  exercise: Exercise
  similarity: ExerciseSimilarity
  compatibility: ExerciseCompatibility
  eligibility: ExerciseCandidateEligibility
  roleMatch: 'preserved' | 'changed'
  muscleMatch: 'direct' | 'supporting-only' | 'none'
  movementMatch: boolean
  equipmentMatch: boolean
  goalMatch: boolean
  priorityMuscleRank?: number
  preference: PreferenceState
  preferenceAdjustment: 'boost' | 'none' | 'penalty' | 'excluded'
  reasons: string[]
}

export interface ExerciseCandidateConstraints {
  unavailableEquipment?: EquipmentTag[]
  excludedExerciseIds?: readonly string[]
  requireSameCategory?: boolean
}

/** Context for deterministic candidate generation and ranking, not a recommendation itself. */
export interface ExerciseCandidateRequest {
  exercise: Exercise
  exercises: Exercise[]
  role?: ExerciseRole
  goals?: readonly TrainingGoal[]
  priorityMuscles?: string[]
  constraints?: ExerciseCandidateConstraints
  preferences?: Pick<UserPreferences, 'preferredExerciseIds' | 'recommendLessExerciseIds' | 'excludedExerciseIds' | 'dislikedExerciseIds'>
  decisions?: RecommendationDecision[]
}

/** Shared replacement request. The caller establishes whether replacement is warranted first. */
export interface ExerciseReplacementRequest {
  originalExercise: Exercise
  reason: ExerciseReplacementReason
  exercises: Exercise[]
  role?: ExerciseRole
  goals?: readonly TrainingGoal[]
  priorityMuscles?: string[]
  constraints?: ExerciseCandidateConstraints
  preferences?: ExerciseCandidateRequest['preferences']
  decisions?: RecommendationDecision[]
}

/** Candidate evidence is retained so callers can explain both eligibility and selection. */
export interface ExerciseReplacementResult {
  reason: ExerciseReplacementReason
  consideredCandidates: ExerciseCandidate[]
  rankedCandidates: ExerciseCandidate[]
  selectedCandidate?: ExerciseCandidate
}

export type PrescriptionCompletion = 'completed' | 'partial' | 'below target' | 'not started' | 'unplanned'
export interface PerformedSet {
  id: string
  setType: SetType
  weight: number
  loadType?: LoggedSet['loadType']
  reps: number
  rir?: number
  rpe?: number
  setDurationSeconds?: number
  restDurationSeconds?: number
  notes?: string
  completedAt?: string
  estimatedOneRepMax?: number
}
export interface ExercisePerformance {
  exerciseId: string
  sessionId: string
  date: string
  /** The session snapshot, never a reconstruction from current exercise defaults. */
  plannedSets?: number
  plannedRepRange?: { min: number; max: number }
  plannedSetType?: SetType
  /** Every recorded set remains available; only workingSets drive normal progression evidence. */
  sets: PerformedSet[]
  workingSets: PerformedSet[]
  completedSets: number
  completedWorkingSets: number
  totalReps: number
  totalWorkingReps: number
  workingVolume: number
  bestWorkingSet?: PerformedSet
  heaviestWorkingWeight?: number
  bestEstimatedOneRepMax?: number
  averageEstimatedOneRepMax?: number
  targetRangeWorkingSets: number
  prescriptionAchieved?: boolean
  demonstratedWorkingLoad?: number
  completionRate?: number
  completion: PrescriptionCompletion
}

export interface ExerciseFeatures {
  exerciseId: string
  sessionsPerformed: number
  lastPerformedDate?: string
  daysSinceLastPerformed?: number
  recentPerformances: ExercisePerformance[]
  mostRecentPerformance?: ExercisePerformance
  bestWorkingWeight?: number
  bestRepsAtBestWeight?: number
  bestEstimatedOneRepMax?: number
  recentWorkingVolume: number
  averageCompletionRate?: number
  progressionState: ExerciseProgressState
  recentWorkingSets: (PerformedSet & { date: string })[]
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
  plannedSets?: number
  plannedRepRange?: { min: number; max: number }
  plannedSetType?: SetType
  isAdHoc: boolean
  completedWorkingSets: number
  targetRangeWorkingSets: number
  fullyCompleted: boolean
  prescriptionAchieved: boolean
  completion: PrescriptionCompletion
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

/**
 * Intermediate output from one decision rule. Only `recommendations.ts`
 * converts these into the stable, user-facing `Recommendation` contract.
 */
export interface RecommendationCandidate {
  id: string
  type: PlanRecommendationType
  exerciseId: string
  alternativeExerciseId?: string
  score: number
  reasons: string[]
  progression?: ProgressionRecommendation
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
  /** Present on newly recorded decisions; omitted only by legacy local data. */
  timestamp?: string
}

export type RecommendationTarget =
  | { kind: 'exercise'; exerciseId: string; plannedExerciseId?: string }
  | { kind: 'workout'; workoutId: string }
  | { kind: 'muscle'; muscle: string }

export type RecommendationChange =
  | { kind: 'keep' }
  | { kind: 'progression'; currentLoad?: number; recommendedLoad?: number; repRange: { min: number; max: number } }
  | { kind: 'add'; exerciseId: string; sets: number; repRange: { min: number; max: number } }
  | { kind: 'replace'; fromExerciseId: string; toExerciseId: string }
  | { kind: 'remove'; exerciseId: string }
  | { kind: 'modify'; exerciseId: string; changes: { sets?: number; repRange?: { min: number; max: number } } }

/** Final deterministic output of Bobby's recommendation pipeline. */
export interface Recommendation {
  id: string
  type: PlanRecommendationType
  /** Ordering priority only; it is not a quality, utility, or probability score. */
  priority: number
  target: RecommendationTarget
  change: RecommendationChange
  reason: string
  trace: RecommendationTrace
}

/** Progression-rule evidence before it is composed into a final Recommendation. */
export interface ProgressionRecommendation {
  exercise: Exercise
  weight: number
  sets: number
  repRange: { min: number; max: number }
  action: 'progress-reps' | 'increase-weight' | 'start-here'
  /** A small, explainable summary of prescription completion and effort evidence. */
  confidence?: 'high' | 'medium' | 'low'
  reasons: string[]
}
