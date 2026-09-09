import type { TrainingPrinciple } from './models'

/**
 * Evidence levels:
 *
 * A — Strong population-level evidence
 *     Supported by high-quality systematic reviews, meta-analyses,
 *     or major professional position stands.
 *
 * B — Moderate population-level evidence
 *     Reasonably consistent evidence, but with meaningful limitations.
 *
 * C — Limited or mixed evidence
 *     Evidence exists but is inconsistent, indirect, or relatively weak.
 *
 * D — Practical / expert heuristic
 *     Useful coaching principle without strong direct evidence.
 *
 * Personal — User-specific evidence
 *     Learned from the user's own repeated training history.
 *
 * IMPORTANT:
 * These principles describe what the evidence suggests.
 * They are not themselves the exact algorithms Bobby uses.
 *
 * Decision rules should operationalize these principles separately.
 */

export const trainingPrinciples: TrainingPrinciple[] = [
  // ===========================================================================
  // PROGRESSION
  // ===========================================================================

  {
    id: 'progressive-overload',
    topic: 'Progressive overload',
    description:
      'Continued improvement generally requires progressively challenging the muscles through increases in resistance, repetitions, training volume, or other relevant training demands over time.',
    evidenceLevel: 'A',
    source: {
      name: 'ACSM Resistance Training Position Stand',
      year: 2026,
    },
  },

  {
    id: 'rep-range-progression',
    topic: 'Progression within a rep range',
    description:
      'Using a target repetition range and progressing repetitions before increasing resistance is a practical method for applying progressive overload. This is an implementation strategy rather than a universal requirement of resistance training.',
    evidenceLevel: 'B',
    source: {
      name: 'ACSM Resistance Training Position Stand',
      year: 2026,
    },
  },

  {
    id: 'load-goal-specificity',
    topic: 'Load selection for strength and hypertrophy',
    description:
      'A broad range of resistance-training loads can produce muscle hypertrophy, while heavier loads generally provide an advantage when the primary objective is maximizing strength.',
    evidenceLevel: 'A',
    source: {
      name: 'ACSM Resistance Training Position Stand',
      year: 2026,
    },
  },

  // ===========================================================================
  // VOLUME
  // ===========================================================================

  {
    id: 'volume-hypertrophy',
    topic: 'Training volume for hypertrophy',
    description:
      'Higher weekly resistance-training volume generally supports greater muscle hypertrophy, although the relationship is not unlimited and there is no single universally optimal volume for every individual.',
    evidenceLevel: 'A',
    source: {
      name: 'ACSM Resistance Training Position Stand',
      year: 2026,
    },
  },

  {
    id: 'volume-individualization',
    topic: 'Individualizing training volume',
    description:
      'Training volume should be adjusted according to the individual response, goals, recovery, and progression rather than treating a single weekly set target as universally optimal.',
    evidenceLevel: 'B',
    source: {
      name: 'ACSM Resistance Training Position Stand',
      year: 2026,
    },
  },

  {
    id: 'priority-muscle-volume',
    topic: 'Volume for a priority muscle',
    description:
      'When hypertrophy of a muscle is a stated priority and its recent training volume is relatively low, increasing productive training volume can be considered when recovery and performance permit.',
    evidenceLevel: 'A',
    source: {
      name: 'ACSM Resistance Training Position Stand',
      year: 2026,
    },
  },

  // ===========================================================================
  // FREQUENCY / SPLITS
  // ===========================================================================

  {
    id: 'frequency-distribution',
    topic: 'Training frequency and volume distribution',
    description:
      'Training frequency can be used to distribute weekly training volume and manage session demands. When total training volume is comparable, frequency alone does not appear to be a major determinant of hypertrophy.',
    evidenceLevel: 'A',
    source: {
      name: 'ACSM Resistance Training Position Stand',
      year: 2026,
    },
  },

  {
    id: 'split-equivalence',
    topic: 'Training split selection',
    description:
      'Different resistance-training splits can produce similar strength and hypertrophy outcomes when training volume is appropriately matched. Split selection should therefore consider volume distribution, frequency, recovery, schedule, and user preference.',
    evidenceLevel: 'A',
    source: {
      name: 'Efficacy of Split Versus Full-Body Resistance Training',
      year: 2024,
    },
  },

  // ===========================================================================
  // FAILURE / EFFORT
  // ===========================================================================

  {
    id: 'proximity-to-failure',
    topic: 'Proximity to muscular failure',
    description:
      'Training to momentary muscular failure is not consistently necessary for strength or hypertrophy. Sets performed sufficiently close to failure can be effective while potentially producing less unnecessary fatigue.',
    evidenceLevel: 'A',
    source: {
      name: 'Resistance Training Proximity-to-Failure Systematic Review and Meta-analysis',
      year: 2022,
    },
  },

  {
    id: 'failure-fatigue-tradeoff',
    topic: 'Failure and fatigue',
    description:
      'Repeatedly training sets to failure can increase acute fatigue and may reduce performance on subsequent work. Failure should therefore be treated as a training option rather than a universal requirement.',
    evidenceLevel: 'B',
    source: {
      name: 'Resistance Training Proximity-to-Failure Systematic Review and Meta-analysis',
      year: 2022,
    },
  },

  // ===========================================================================
  // RANGE OF MOTION / EXECUTION
  // ===========================================================================

  {
    id: 'range-of-motion',
    topic: 'Range of motion',
    description:
      'Using a complete, controlled range of motion is generally beneficial for resistance-training adaptations, although the most appropriate range can vary according to the exercise, muscle, individual anatomy, and training objective.',
    evidenceLevel: 'B',
    source: {
      name: 'Effects of Range of Motion on Resistance Training Adaptations',
      year: 2021,
    },
  },

  {
    id: 'consistent-execution',
    topic: 'Maintaining a working exercise',
    description:
      'An exercise that is aligned with the user\'s goals and producing stable or improving performance does not inherently need to be replaced simply because it has been used for a long period of time.',
    evidenceLevel: 'B',
    source: {
      name: 'ACSM Resistance Training Position Stand',
      year: 2026,
    },
  },

  // ===========================================================================
  // EXERCISE VARIATION
  // ===========================================================================

  {
    id: 'systematic-variation',
    topic: 'Exercise variation',
    description:
      'Exercise variation can be useful when applied systematically, but frequent or random exercise changes are not inherently beneficial and may interfere with consistent progression and skill development.',
    evidenceLevel: 'B',
    source: {
      name: 'Does Varying Resistance Exercises Promote Superior Muscle Hypertrophy and Strength Gains? A Systematic Review',
      year: 2022,
    },
  },

  {
    id: 'plateau-variation',
    topic: 'Exercise variation on plateau',
    description:
      'When performance on an exercise repeatedly stalls despite consistent execution, adequate effort, and reasonable recovery, changing to a similar exercise can be considered as one possible strategy for addressing the plateau.',
    evidenceLevel: 'D',
    source: {
      name: 'Practical coaching heuristic',
      year: 2026,
    },
  },

  {
    id: 'no-time-based-rotation',
    topic: 'Avoiding arbitrary exercise rotation',
    description:
      'The passage of time alone is not sufficient evidence that an exercise should be replaced. A working exercise should generally remain in the program unless performance, goals, fatigue, exercise fit, preference, or another meaningful factor provides a reason to change it.',
    evidenceLevel: 'B',
    source: {
      name: 'Systematic exercise variation evidence and ACSM Resistance Training Position Stand',
      year: 2026,
    },
  },

  {
    id: 'exercise-priority-order',
    topic: 'Exercise order',
    description:
      'Exercises performed earlier in a workout tend to receive greater strength-performance benefits. Exercises corresponding to the user\'s highest-priority strength objective should therefore generally be placed earlier in the session.',
    evidenceLevel: 'B',
    source: {
      name: 'Exercise Order Systematic Review and Meta-analysis',
      year: 2021,
    },
  },

  {
    id: 'hypertrophy-order-flexibility',
    topic: 'Exercise order for hypertrophy',
    description:
      'Exercise order appears to have less consistent effects on hypertrophy than on strength, allowing workout order to be chosen according to priorities, performance, convenience, and fatigue management.',
    evidenceLevel: 'B',
    source: {
      name: 'Exercise Order Systematic Review and Meta-analysis',
      year: 2021,
    },
  },

  // ===========================================================================
  // REST / RECOVERY
  // ===========================================================================

  {
    id: 'rest-interval',
    topic: 'Rest intervals',
    description:
      'Rest intervals should generally be long enough to maintain productive performance across sets. Longer rest periods can be particularly useful when maintaining strength and repetition performance is important.',
    evidenceLevel: 'B',
    source: {
      name: 'Effects of Rest Interval Duration in Resistance Training',
      year: 2018,
    },
  },

  {
    id: 'recovery-context',
    topic: 'Recovery and training frequency',
    description:
      'Training frequency and workload should be considered alongside recovery capacity, training status, exercise selection, overall physical stress, psychological stress, and the individual\'s schedule.',
    evidenceLevel: 'B',
    source: {
      name: 'NSCA Training Frequency and Recovery Guidance',
      year: 2026,
    },
  },

  // ===========================================================================
  // PERFORMANCE INTERPRETATION
  // ===========================================================================

  {
    id: 'performance-anomaly',
    topic: 'Interpreting unusual performance',
    description:
      'A single substantially atypical performance result should be interpreted cautiously rather than treated as evidence of a persistent change in strength, exercise suitability, or program effectiveness.',
    evidenceLevel: 'C',
    source: {
      name: 'Practical performance-monitoring principle',
      year: 2026,
    },
  },

  {
    id: 'performance-trend-over-single-session',
    topic: 'Performance trends',
    description:
      'Training decisions should generally rely more heavily on repeated performance trends across comparable sessions than on a single unusually good or bad workout.',
    evidenceLevel: 'B',
    source: {
      name: 'Practical performance-monitoring principle',
      year: 2026,
    },
  },

  {
    id: 'training-break',
    topic: 'Performance after a training break',
    description:
      'Performance following a period of training cessation may differ from the user\'s established baseline. The length of the break should therefore be considered when interpreting an apparent regression.',
    evidenceLevel: 'B',
    source: {
      name: 'Effect of Training Cessation on Muscular Performance: Meta-analysis',
      year: 2013,
    },
  },

  // ===========================================================================
  // EQUIPMENT / EXERCISE SUBSTITUTION
  // ===========================================================================

  {
    id: 'equipment-constraint',
    topic: 'Adapting to unavailable equipment',
    description:
      'When planned equipment is unavailable, the preferred substitute should preserve the important training objective, movement characteristics, and primary muscle targets as closely as practical.',
    evidenceLevel: 'D',
    source: {
      name: 'Practical coaching heuristic',
      year: 2026,
    },
  },

  {
    id: 'exercise-substitution',
    topic: 'Exercise substitution',
    description:
      'An exercise replacement does not need to be mechanically identical to the original exercise. The replacement should instead be evaluated according to the user\'s goal, primary muscles, movement pattern, equipment constraints, and ability to perform it effectively.',
    evidenceLevel: 'D',
    source: {
      name: 'Practical coaching heuristic',
      year: 2026,
    },
  },

  // ===========================================================================
  // GOAL PRIORITIZATION
  // ===========================================================================

  {
    id: 'goal-specific-training',
    topic: 'Goal-specific training',
    description:
      'Training recommendations should reflect the user\'s stated training priorities. Strength, hypertrophy, general fitness, and athletic-performance goals can overlap but may require different emphases in exercise selection, loading, volume, and progression.',
    evidenceLevel: 'A',
    source: {
      name: 'ACSM Resistance Training Position Stand',
      year: 2026,
    },
  },

  {
    id: 'priority-muscle-exercise-order',
    topic: 'Prioritizing a target muscle',
    description:
      'When a specific muscle is a stated priority, exercises that meaningfully train that muscle can receive greater emphasis through exercise selection, workout order, or appropriate training volume.',
    evidenceLevel: 'B',
    source: {
      name: 'ACSM Resistance Training Position Stand',
      year: 2026,
    },
  },

  // ===========================================================================
  // BENCHMARKS / TESTING
  // ===========================================================================

  {
    id: 'strength-specificity',
    topic: 'Strength testing and specificity',
    description:
      'Strength improvements are specific to the movement, exercise, loading conditions, and skill involved. Strength benchmarks should therefore use consistent exercises and execution when the goal is to compare performance over time.',
    evidenceLevel: 'A',
    source: {
      name: 'ACSM Resistance Training Position Stand',
      year: 2026,
    },
  },

  {
    id: 'benchmark-fatigue',
    topic: 'Strength testing and fatigue',
    description:
      'A strength benchmark should be interpreted in the context of the user\'s recent training and current readiness. A test performed under substantially different fatigue conditions may not provide a clean comparison with previous benchmarks.',
    evidenceLevel: 'B',
    source: {
      name: 'Practical strength-monitoring principle',
      year: 2026,
    },
  },

  // ===========================================================================
  // PERSONALIZATION
  // ===========================================================================

  {
    id: 'personal-history',
    topic: 'Personal training history',
    description:
      'Repeated observations from an individual\'s own training history can provide useful evidence about how that individual responds to particular exercises, volumes, rep ranges, and training structures.',
    evidenceLevel: 'Personal',
    source: {
      name: 'Bobby personal-history evidence',
      year: 2026,
    },
  },

  {
    id: 'personal-history-over-generic-assumption',
    topic: 'Personal evidence versus population averages',
    description:
      'When high-quality personal training data consistently contradicts a weak or generic population-level assumption, Bobby should consider the user\'s observed response while retaining appropriate uncertainty about causation.',
    evidenceLevel: 'Personal',
    source: {
      name: 'Bobby personal-history evidence',
      year: 2026,
    },
  },
]

/**
 * Find a training principle by ID.
 */
export function findPrinciple(id: string): TrainingPrinciple {
  const principle = trainingPrinciples.find((item) => item.id === id)

  if (!principle) {
    throw new Error(`Unknown training principle: ${id}`)
  }

  return principle
}

/**
 * Return all principles associated with a particular evidence level.
 */
export function getPrinciplesByEvidenceLevel(
  evidenceLevel: TrainingPrinciple['evidenceLevel'],
): TrainingPrinciple[] {
  return trainingPrinciples.filter(
    (principle) => principle.evidenceLevel === evidenceLevel,
  )
}

/**
 * Return all principles associated with a particular topic.
 *
 * This is intentionally a simple search for now. A future knowledge-base
 * implementation could add explicit tags/categories to TrainingPrinciple.
 */
export function getPrinciplesByTopic(topic: string): TrainingPrinciple[] {
  const normalizedTopic = topic.toLowerCase()

  return trainingPrinciples.filter((principle) =>
    principle.topic.toLowerCase().includes(normalizedTopic),
  )
}