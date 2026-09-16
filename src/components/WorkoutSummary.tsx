import { useEffect, useRef } from 'react'
import { LoadTarget } from './LoadTarget'
import type { WorkoutAnalysis, SessionExerciseAssessment } from '../domain/workout-analysis'

const completionLabels = { completed: 'Rep target met', partial: 'Partially logged', 'below target': 'Outside rep target', 'not started': 'Not logged', unplanned: 'Additional movement' }

export function WorkoutSummary({ analysis, justCompleted = false }: { analysis: WorkoutAnalysis; justCompleted?: boolean }) {
    const heading = useRef<HTMLHeadingElement>(null)
    useEffect(() => { if (justCompleted) heading.current?.focus() }, [analysis.sessionId, justCompleted])
    const highlights = analysis.exercises.filter((exercise) => exercise.signal === 'progress' || exercise.signal === 'watch').slice(0, 3)
    const outsideTargets = analysis.exercises.filter((exercise) => exercise.completion === 'below target').length
    return <section className="workout-summary" aria-labelledby="workout-summary-title">
        <div className="section-heading"><div><p className="eyebrow">{analysis.planningAuthority === 'recommended' ? 'Recommended Workout' : 'My Plans'}</p><h2 id="workout-summary-title" ref={heading} tabIndex={-1}>{justCompleted ? 'Workout saved. Here’s how it went.' : 'Session review'}</h2></div><span className="summary-check" aria-hidden="true">✓</span></div>
        <div className="summary-metrics"><span><strong>{analysis.workingSets}</strong> working {analysis.workingSets === 1 ? 'set' : 'sets'} logged</span><span>{analysis.completion === 'unplanned' ? 'No saved prescription to compare' : <><strong>{analysis.completedPlannedSets} / {analysis.plannedSets}</strong> prescribed sets logged</>}</span>{analysis.extraSets > 0 && analysis.completion !== 'unplanned' && <span>{analysis.extraSets} other {analysis.extraSets === 1 ? 'set' : 'sets'} logged</span>}</div>
        {analysis.completion === 'partial' && <p className="summary-note">Some prescribed sets weren’t logged. Missing sets alone don’t establish a performance decline.</p>}
        {outsideTargets > 0 && <p className="summary-note">{outsideTargets} {outsideTargets === 1 ? 'exercise has' : 'exercises have'} enough sets logged but not enough sets within the prescribed rep range.</p>}
        {highlights.length > 0 ? <div className="summary-highlights">{highlights.map((exercise) => <div className={`summary-finding ${exercise.signal}`} key={exercise.exerciseId}><strong>{exercise.name}</strong><p>{exercise.message}</p></div>)}</div> : <p className="summary-note">{analysis.exercises.some((exercise) => exercise.signal === 'baseline') ? 'You’ve added a new working-set baseline for future comparisons.' : 'Your session is recorded. Open the exercise details to review completion and comparable performance.'}</p>}
        <details className="summary-details"><summary>Exercise details ({analysis.exercises.length})</summary>{analysis.exercises.map((exercise) => <ExerciseResult key={exercise.exerciseId} exercise={exercise} />)}</details>
        <div className="summary-next"><strong>For your next session</strong><p>{analysis.nextSession}</p></div>
    </section>
}

function ExerciseResult({ exercise }: { exercise: SessionExerciseAssessment }) {
    return <div className="summary-exercise"><strong>{exercise.name}</strong><span>{exercise.plannedSets === undefined ? `${exercise.completedSets} working sets logged` : `${exercise.completedSets} / ${exercise.plannedSets} sets logged`} · {completionLabels[exercise.completion]}</span><LoadTarget recommendation={exercise.loadRecommendation} /><p>{exercise.message}</p>{exercise.comparison && <small>{exercise.comparison.comparableSets} comparable working-set pairs{exercise.previousSessionId ? ' from the previous session' : ''}. {exercise.comparison.reasons.join(' ')}</small>}</div>
}
