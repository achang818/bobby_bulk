import { useEffect, useRef, useState } from 'react'
import type { Exercise, ExerciseCandidate } from '../domain/models'

export function ExercisePicker({ mode, choices, alternatives, onPick, onClose }: { mode: 'add' | 'switch'; choices: Exercise[]; alternatives: ExerciseCandidate[]; onPick: (exercise: Exercise) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (mode === 'switch') heading.current?.focus() }, [mode])
  const results = choices.filter((exercise) => `${exercise.name} ${exercise.primaryMuscles.join(' ')} ${exercise.equipment}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 12)
  return <section className="logger-picker" aria-label={mode === 'add' ? 'Add exercise' : 'Switch exercise'}>
    <div className="section-heading"><h3 ref={heading} tabIndex={-1}>{mode === 'add' ? 'Add an exercise' : 'Switch exercise'}</h3><button type="button" className="text-button" onClick={onClose}>Close</button></div>
    {mode === 'switch' && <><p className="brief-note">Choose an alternative. Sets already logged stay with the original movement.</p><h4>Suggested alternatives</h4>{alternatives.length ? <div className="exercise-options">{alternatives.map(({ exercise }) => <button type="button" key={exercise.id} onClick={() => onPick(exercise)}><strong>{exercise.name}</strong><small>{exercise.equipment} &middot; {exercise.primaryMuscles.join(', ')}</small><span aria-hidden="true">&rarr;</span></button>)}</div> : <p className="brief-note">No close alternatives fit your equipment. You can still choose a movement below.</p>}</>}
    <label>Find an exercise<input autoFocus={mode === 'add'} type="search" placeholder="Search name, muscle or equipment" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    {(mode === 'add' || query.trim()) && <div className="exercise-options search-options">{results.map((exercise) => <button type="button" key={exercise.id} onClick={() => onPick(exercise)}><strong>{exercise.name}</strong><small>{exercise.equipment}</small><span aria-hidden="true">+</span></button>)}</div>}
    {!results.length && <p className="empty-state">No matching exercises. Try another search.</p>}
  </section>
}
