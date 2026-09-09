import type { TrainingPrinciple } from './models'

export const trainingPrinciples: TrainingPrinciple[] = [
  {
    id: 'progressive-overload',
    topic: 'Progressive overload',
    description: 'Once all prescribed sets reach the top of the target rep range, increasing resistance drives continued strength and hypertrophy gains.',
    evidenceLevel: 'A',
    source: { name: 'ACSM Resistance Training Position Stand', year: 2026 },
  },
  {
    id: 'consistent-execution',
    topic: 'Maintaining a working exercise',
    description: 'An exercise with progressing or stable performance, aligned with stated goals, does not need to change.',
    evidenceLevel: 'B',
    source: { name: 'ACSM Resistance Training Position Stand', year: 2026 },
  },
  {
    id: 'plateau-variation',
    topic: 'Exercise variation on plateau',
    description: 'When performance on an exercise stalls across multiple sessions despite consistent effort, switching to a similar exercise targeting the same muscles can resume progress.',
    evidenceLevel: 'D',
    source: { name: 'Practical coaching heuristic', year: 2026 },
  },
  {
    id: 'volume-hypertrophy',
    topic: 'Training volume for a priority muscle',
    description: 'A muscle group with low recent training volume relative to a stated priority benefits from added direct work.',
    evidenceLevel: 'A',
    source: { name: 'ACSM Resistance Training Position Stand', year: 2026 },
  },
  {
    id: 'equipment-constraint',
    topic: 'Adapting to unavailable equipment',
    description: 'When equipment is unavailable, preserve the planned movement category and primary muscle targets with the closest practical substitute.',
    evidenceLevel: 'C',
    source: { name: 'Practical coaching heuristic', year: 2026 },
  },
]

export function findPrinciple(id: string): TrainingPrinciple {
  const principle = trainingPrinciples.find((item) => item.id === id)
  if (!principle) throw new Error(`Unknown training principle: ${id}`)
  return principle
}