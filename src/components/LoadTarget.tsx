import type { ExerciseLoadRecommendation } from '../domain/models'

export function LoadTarget({ recommendation }: { recommendation?: ExerciseLoadRecommendation }) {
    if (!recommendation) return null
    return <div className="load-target">
        <strong>{recommendation.kind === 'target' ? `Target: ${recommendation.weight} ${recommendation.unit}` : 'Choose a starting load'}</strong>
        <span>{recommendation.reason}</span>
    </div>
}
