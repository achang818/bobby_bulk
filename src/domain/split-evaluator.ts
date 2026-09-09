import { evaluateWorkout } from './workout-evaluator'
import { plannedExercisesFor } from './workout-session'
import type { Exercise, Split, SplitAssessment, SplitEvaluation, SplitFinding, UserPreferences, WorkoutEvaluation, WorkoutTemplate } from './models'

type EvaluatedWorkout = { workout: WorkoutTemplate; evaluation: WorkoutEvaluation; splitIndex: number }

/** Evaluates structure without assuming an ideal split or weekly schedule. */
export function evaluateSplit(split: Split, workouts: WorkoutTemplate[], exercises: Exercise[], preferences?: Pick<UserPreferences, 'goals' | 'priorities'>): SplitEvaluation {
  const entries: EvaluatedWorkout[] = []
  const missing: string[] = []
  split.workoutIds.forEach((id, splitIndex) => {
    const workout = workouts.find((candidate) => candidate.id === id)
    if (!workout) missing.push(id)
    else entries.push({ workout, splitIndex, evaluation: evaluateWorkout(workout, exercises, undefined, preferences) })
  })
  const muscles = new Map<string, { workoutCount: number; plannedWorkingSets: number; indexes: number[]; workoutNames: string[] }>()
  for (const entry of entries) for (const [muscle, sets] of Object.entries(entry.evaluation.primaryMuscleSets)) {
    const prior = muscles.get(muscle) ?? { workoutCount: 0, plannedWorkingSets: 0, indexes: [], workoutNames: [] }
    muscles.set(muscle, { workoutCount: prior.workoutCount + 1, plannedWorkingSets: prior.plannedWorkingSets + sets, indexes: [...prior.indexes, entry.splitIndex], workoutNames: [...prior.workoutNames, entry.workout.name] })
  }
  const muscleSummary = [...muscles.entries()].map(([muscle, value]) => ({ muscle, workoutCount: value.workoutCount, plannedWorkingSets: value.plannedWorkingSets })).sort((a, b) => b.plannedWorkingSets - a.plannedWorkingSets || a.muscle.localeCompare(b.muscle))
  const findings: SplitFinding[] = []
  if (missing.length) findings.push(finding('structure', 'warning', 'Missing workout references', 'One or more workouts referenced by this split could not be found. The remaining assessment uses the workouts that are available.', missing))
  if (!entries.length) return { splitId: split.id, workouts: [], muscleSummary: [], findings, overallAssessment: insufficientAssessment(preferences) }
  findings.push(...recoveryFindings(muscles), ...distributionFindings(muscleSummary), ...redundancyFindings(entries, exercises), ...complementarityFindings(entries), ...priorityFindings(muscleSummary, preferences))
  return { splitId: split.id, workouts: entries.map((entry) => entry.evaluation), muscleSummary, findings, overallAssessment: assessmentFor(entries, muscleSummary, findings, preferences) }
}

function recoveryFindings(muscles: Map<string, { plannedWorkingSets: number; indexes: number[]; workoutNames: string[] }>): SplitFinding[] {
  const findings: SplitFinding[] = []
  for (const [muscle, value] of muscles) {
    const adjacent = value.indexes.findIndex((item, position) => position > 0 && item - value.indexes[position - 1] === 1)
    if (adjacent > 0) findings.push(finding('recovery', 'info', `Potential recovery overlap for ${muscle}`, `${muscle} receives ${value.plannedWorkingSets} direct planned sets across consecutive split entries. Recovery needs depend on when you perform them.`, [value.workoutNames[adjacent - 1], value.workoutNames[adjacent]]))
  }
  return findings
}

function distributionFindings(summary: SplitEvaluation['muscleSummary']): SplitFinding[] {
  if (!summary.length) return []
  const total = summary.reduce((sum, item) => sum + item.plannedWorkingSets, 0)
  const dominant = summary[0]
  const findings: SplitFinding[] = []
  if (summary.length > 1 && dominant.plannedWorkingSets / total >= .45) findings.push(finding('distribution', 'info', `${dominant.muscle}-emphasized split`, `${dominant.muscle} receives ${dominant.plannedWorkingSets}/${total} direct planned sets across this split.`, [`${dominant.workoutCount} workout${dominant.workoutCount === 1 ? '' : 's'}`]))
  for (const item of summary.slice(1)) if (dominant.plannedWorkingSets >= item.plannedWorkingSets * 2) findings.push(finding('distribution', 'info', `${item.muscle} has relatively low direct volume`, `${item.muscle} receives ${item.plannedWorkingSets} direct sets compared with ${dominant.plannedWorkingSets} for ${dominant.muscle}. This is descriptive, not a target-volume judgment.`, []))
  return findings
}

function redundancyFindings(entries: EvaluatedWorkout[], exercises: Exercise[]): SplitFinding[] {
  const byRole = new Map<string, { workout: string; exercise: string }[]>()
  for (const { workout } of entries) for (const planned of plannedExercisesFor(workout, exercises)) {
    if (planned.setType !== 'working') continue
    const exercise = exercises.find((candidate) => candidate.id === planned.exerciseId)
    if (!exercise) continue
    const key = `${exercise.primaryAction}|${[...exercise.primaryMuscles].sort().join('|')}`
    byRole.set(key, [...(byRole.get(key) ?? []), { workout: workout.name, exercise: exercise.name }])
  }
  const findings: SplitFinding[] = []
  for (const items of byRole.values()) {
    const workoutNames = [...new Set(items.map((item) => item.workout))]
    if (workoutNames.length >= 2 && items.length >= 3) findings.push(finding('redundancy', 'info', 'Repeated stimulus across workouts', `${items.length} planned exercises in ${workoutNames.length} workouts share the same primary action and direct-muscle role. This may be intentional specialization.`, items.map((item) => `${item.workout}: ${item.exercise}`)))
  }
  return findings
}

function complementarityFindings(entries: EvaluatedWorkout[]): SplitFinding[] {
  const findings: SplitFinding[] = []
  for (let index = 1; index < entries.length; index++) {
    const previous = entries[index - 1]
    const current = entries[index]
    if (current.splitIndex - previous.splitIndex !== 1) continue
    const earlier = new Set(Object.keys(previous.evaluation.primaryMuscleSets))
    const currentMuscles = Object.keys(current.evaluation.primaryMuscleSets)
    const shared = currentMuscles.filter((muscle) => earlier.has(muscle))
    const combined = new Set([...earlier, ...currentMuscles]).size
    if (shared.length >= 2 && shared.length / combined >= .6) findings.push(finding('complementarity', 'info', 'Adjacent workouts have substantially overlapping focus', `${previous.workout.name} and ${current.workout.name} share ${shared.join(' and ')} as most of their direct muscle coverage.`, [previous.workout.name, current.workout.name]))
  }
  return findings
}

function priorityFindings(summary: SplitEvaluation['muscleSummary'], preferences?: Pick<UserPreferences, 'goals' | 'priorities'>): SplitFinding[] {
  if (!preferences?.priorities.length) return []
  return preferences.priorities.filter((priority) => !summary.some((item) => item.muscle.toLowerCase() === priority.toLowerCase())).map((priority) => finding('goal-alignment', 'info', `${priority} has no direct split work`, `No workout in this split has direct planned work for your ${priority} priority. Secondary involvement is not counted as direct volume.`, []))
}

function assessmentFor(entries: EvaluatedWorkout[], summary: SplitEvaluation['muscleSummary'], findings: SplitFinding[], preferences?: Pick<UserPreferences, 'goals' | 'priorities'>): SplitAssessment {
  const total = summary.reduce((sum, item) => sum + item.plannedWorkingSets, 0)
  const dominant = summary[0]
  return {
    distribution: summary.length < 2 ? 'insufficient information' : dominant && dominant.plannedWorkingSets / total >= .45 ? 'concentrated' : 'balanced',
    recovery: findings.some((item) => item.category === 'recovery') ? 'potential overlap' : entries.length > 1 ? 'spaced' : 'insufficient information',
    redundancy: findings.some((item) => item.category === 'redundancy') ? 'repeated stimulus' : entries.length > 1 ? 'varied' : 'insufficient information',
    complementarity: findings.some((item) => item.category === 'complementarity') ? 'substantially overlapping' : entries.length > 1 ? 'complementary' : 'insufficient information',
    goalAlignment: preferences?.priorities.length ? findings.some((item) => item.category === 'goal-alignment') ? 'limited' : 'aligned' : 'not assessed',
  }
}

function insufficientAssessment(preferences?: Pick<UserPreferences, 'goals' | 'priorities'>): SplitAssessment { return { distribution: 'insufficient information', recovery: 'insufficient information', redundancy: 'insufficient information', complementarity: 'insufficient information', goalAlignment: preferences?.priorities.length ? 'limited' : 'not assessed' } }
function finding(category: SplitFinding['category'], severity: SplitFinding['severity'], title: string, description: string, evidence: string[]): SplitFinding { return { category, severity, title, description, evidence } }
