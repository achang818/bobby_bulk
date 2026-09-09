import { evaluateWorkout } from './workout-evaluator'
import type { Exercise, Split, SplitEvaluation, SplitFinding, UserPreferences, WorkoutTemplate } from './models'

export function evaluateSplit(split: Split, workouts: WorkoutTemplate[], exercises: Exercise[], preferences?: Pick<UserPreferences, 'goals' | 'priorities'>): SplitEvaluation {
  const ordered = split.workoutIds.flatMap((id) => workouts.find((workout) => workout.id === id) ?? [])
  const evaluations = ordered.map((workout) => evaluateWorkout(workout, exercises, undefined, preferences))
  const muscles = new Map<string, { workoutCount: number; plannedWorkingSets: number; indexes: number[] }>()
  evaluations.forEach((evaluation, index) => Object.entries(evaluation.primaryMuscleSets).forEach(([muscle, sets]) => { const prior = muscles.get(muscle) ?? { workoutCount: 0, plannedWorkingSets: 0, indexes: [] }; muscles.set(muscle, { workoutCount: prior.workoutCount + 1, plannedWorkingSets: prior.plannedWorkingSets + sets, indexes: [...prior.indexes, index] }) }))
  const summary = [...muscles].map(([muscle, value]) => ({ muscle, workoutCount: value.workoutCount, plannedWorkingSets: value.plannedWorkingSets }))
  const findings: SplitFinding[] = []
  for (const [muscle, value] of muscles) if (value.indexes.some((index, i) => i > 0 && index - value.indexes[i - 1] === 1)) findings.push(finding('recovery', 'info', `Potential recovery overlap for ${muscle}`, `${muscle} receives direct work in consecutive workouts.`, value.indexes.map((index) => ordered[index].name)))
  const total = summary.reduce((sum, item) => sum + item.plannedWorkingSets, 0)
  const dominant = summary.sort((a, b) => b.plannedWorkingSets - a.plannedWorkingSets)[0]
  if (dominant && dominant.plannedWorkingSets / total >= .45) findings.push(finding('distribution', 'info', `${dominant.muscle}-emphasized split`, `${dominant.muscle} receives ${dominant.plannedWorkingSets}/${total} direct planned sets.`, [`${dominant.workoutCount} workouts`]))
  if (preferences?.priorities?.length) for (const priority of preferences.priorities) if (!summary.some((item) => item.muscle.toLowerCase() === priority.toLowerCase())) findings.push(finding('goal-alignment', 'info', `${priority} has no direct split work`, `No workout in this split has direct planned work for your ${priority} priority.`, []))
  return { splitId: split.id, workouts: evaluations, muscleSummary: summary, findings, overallAssessment: findings.some((item) => item.category === 'recovery') ? 'potential recovery overlap' : dominant ? 'some concentration' : 'insufficient information' }
}
function finding(category: SplitFinding['category'], severity: SplitFinding['severity'], title: string, description: string, evidence: string[]): SplitFinding { return { category, severity, title, description, evidence } }
