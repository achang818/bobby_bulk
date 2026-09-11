import type { TrainingGoal, UserPreferences } from './models'

/** Default emphasis only; users can supply a shorter, ordered partial ranking. */
export const goalMusclePriorities: Partial<Record<TrainingGoal, string[]>> = {
  'Aesthetic physique': ['Side delts', 'Lats', 'Upper chest', 'Abs', 'Biceps', 'Rear delts', 'Mid back'],
}

export interface ResolvedMusclePriorities {
  /** Explicit priorities first, followed by non-duplicated goal defaults. */
  orderedMuscles: string[]
  explicitMuscles: string[]
  goalDerivedMuscles: string[]
  rankOf: (muscle: string) => number | undefined
  /** A practical exposure target, bounded by the actual split opportunities. */
  desiredFrequency: (muscle: string, availableWorkoutOpportunities: number) => number
  /** Relative allocation guidance, not an independent volume prescription. */
  volumeWeight: (muscle: string) => number
}

/**
 * Resolves every goal and priority consumer through one ordered partial
 * ranking. Unspecified muscles deliberately remain unranked rather than being
 * forced into an artificial complete list.
 */
export function resolveMusclePriorities(preferences?: Pick<UserPreferences, 'goals' | 'priorities'>): ResolvedMusclePriorities {
  const explicitMuscles = uniqueMuscles(preferences?.priorities ?? [])
  const goalDerivedMuscles = uniqueMuscles((preferences?.goals ?? []).flatMap((goal) => goalMusclePriorities[goal] ?? [])).filter((muscle) => !includesMuscle(explicitMuscles, muscle))
  const orderedMuscles = [...explicitMuscles, ...goalDerivedMuscles]
  const rankOf = (muscle: string) => orderedMuscles.findIndex((item) => sameMuscle(item, muscle))
  return {
    orderedMuscles,
    explicitMuscles,
    goalDerivedMuscles,
    rankOf: (muscle) => {
      const rank = rankOf(muscle)
      return rank < 0 ? undefined : rank
    },
    desiredFrequency: (muscle, availableWorkoutOpportunities) => {
      const rank = rankOf(muscle)
      if (rank < 0 || availableWorkoutOpportunities <= 0) return 0
      // This is a bounded opportunity target, not a rule that every priority
      // must be trained three times weekly.
      const preferred = rank === 0 ? 3 : rank < 4 ? 2 : 1
      return Math.min(preferred, availableWorkoutOpportunities)
    },
    volumeWeight: (muscle) => {
      const rank = rankOf(muscle)
      if (rank < 0) return 1
      return rank === 0 ? 1.35 : rank < 3 ? 1.2 : 1.1
    },
  }
}

export function sameMuscle(left: string, right: string) { return normalize(left) === normalize(right) }
export function hasHypertrophyGoal(goals: TrainingGoal[]) { return goals.includes('Build muscle') || goals.includes('Aesthetic physique') }
function includesMuscle(muscles: string[], muscle: string) { return muscles.some((item) => sameMuscle(item, muscle)) }
function uniqueMuscles(muscles: string[]) { return muscles.reduce<string[]>((result, muscle) => muscle.trim() && !includesMuscle(result, muscle) ? [...result, muscle.trim()] : result, []) }
function normalize(muscle: string) { return muscle.trim().toLowerCase() }
