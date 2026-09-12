import { evaluateWorkout } from './workout-evaluator'
import { plannedExercisesFor } from './workout-session'
import { resolveMusclePriorities } from './muscle-priorities'
import { buildTrace } from './rules'
import type { Exercise, RecommendationCandidate, Split, SplitAssessment, SplitEvaluation, SplitFinding, SplitPriorityOpportunity, UserPreferences, WorkoutEvaluation, WorkoutTemplate } from './models'

type EvaluatedWorkout = { workout: WorkoutTemplate; evaluation: WorkoutEvaluation; splitIndex: number }
type MuscleAllocation = { workoutCount: number; plannedWorkingSets: number; indexes: number[]; workoutNames: string[] }

/** Evaluates structure without assuming an ideal split or weekly schedule. */
export function evaluateSplit(split: Split, workouts: WorkoutTemplate[], exercises: Exercise[], preferences?: Pick<UserPreferences, 'goals' | 'priorities'>): SplitEvaluation {
  const entries: EvaluatedWorkout[] = []
  const missing: string[] = []
  split.workoutIds.forEach((id, splitIndex) => {
    const workout = workouts.find((candidate) => candidate.id === id)
    if (!workout) missing.push(id)
    else entries.push({ workout, splitIndex, evaluation: evaluateWorkout(workout, exercises, undefined, preferences) })
  })
  const muscles = new Map<string, MuscleAllocation>()
  for (const entry of entries) for (const [muscle, sets] of Object.entries(entry.evaluation.primaryMuscleSets)) {
    const prior = muscles.get(muscle) ?? { workoutCount: 0, plannedWorkingSets: 0, indexes: [], workoutNames: [] }
    muscles.set(muscle, { workoutCount: prior.workoutCount + 1, plannedWorkingSets: prior.plannedWorkingSets + sets, indexes: [...prior.indexes, entry.splitIndex], workoutNames: [...prior.workoutNames, entry.workout.name] })
  }
  const muscleSummary = [...muscles.entries()].map(([muscle, value]) => ({ muscle, workoutCount: value.workoutCount, plannedWorkingSets: value.plannedWorkingSets })).sort((a, b) => b.plannedWorkingSets - a.plannedWorkingSets || a.muscle.localeCompare(b.muscle))
  const findings: SplitFinding[] = []
  if (missing.length) findings.push(finding('structure', 'warning', 'Missing workout references', 'One or more workouts referenced by this split could not be found. The remaining assessment uses the workouts that are available.', missing))
  if (!entries.length) return { splitId: split.id, workouts: [], muscleSummary: [], priorityOpportunities: [], findings, overallAssessment: insufficientAssessment(preferences) }
  const availableWorkoutOpportunities = Math.min(entries.length, split.intendedFrequency ?? entries.length)
  const priorityOpportunities = priorityOpportunitiesFor(entries, muscles, preferences, availableWorkoutOpportunities)
  findings.push(...recoveryFindings(muscles), ...distributionFindings(muscleSummary), ...redundancyFindings(entries, exercises), ...complementarityFindings(entries), ...priorityFindings(priorityOpportunities, muscleSummary, preferences))
  return { splitId: split.id, workouts: entries.map((entry) => entry.evaluation), muscleSummary, priorityOpportunities, findings, overallAssessment: assessmentFor(entries, muscleSummary, findings, preferences) }
}

function recoveryFindings(muscles: Map<string, MuscleAllocation>): SplitFinding[] {
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

function priorityFindings(opportunities: SplitPriorityOpportunity[], summary: SplitEvaluation['muscleSummary'], preferences?: Pick<UserPreferences, 'goals' | 'priorities'>): SplitFinding[] {
  if (!opportunities.length) return []
  const findings: SplitFinding[] = []
  for (const item of opportunities) {
    if (item.plannedFrequency === 0) {
      findings.push(finding('goal-alignment', item.rank < 3 ? 'warning' : 'info', `${item.muscle} has no direct split work`, `No workout in this split has direct planned work for priority #${item.rank + 1} ${item.muscle}. Secondary involvement is not counted as direct volume.`, []))
      continue
    }
    if (item.status === 'under-served') findings.push(finding('frequency', item.rank < 3 ? 'warning' : 'info', `${item.muscle} is materially underexposed for its priority`, `Priority #${item.rank + 1} ${item.muscle} has ${item.plannedFrequency} direct exposure${item.plannedFrequency === 1 ? '' : 's'} across this split; ${item.desiredFrequency} is the bounded practical target.`, [`${item.plannedWorkingSets} direct planned sets`, ...item.workoutNames]))
    if (item.status === 'adequate' && item.distribution === 'concentrated') findings.push(finding('priority-distribution', 'info', `${item.muscle} opportunities are concentrated`, `${item.muscle} reaches its practical direct-exposure target, but those opportunities are concentrated in adjacent split entries rather than spread through the cycle.`, item.workoutNames))
  }
  const profile = resolveMusclePriorities(preferences)
  const prioritySummary = opportunities.map((item) => ({ ...item, summary: summary.find((summaryItem) => summaryItem.muscle.toLowerCase() === item.muscle.toLowerCase()) }))
  for (let rank = 0; rank < prioritySummary.length - 1; rank += 1) {
    const higher = prioritySummary[rank]
    const lower = prioritySummary.slice(rank + 1).find((item) => item.summary && higher.summary && (item.summary.workoutCount > higher.summary.workoutCount || item.summary.plannedWorkingSets * profile.volumeWeight(item.muscle) > higher.summary.plannedWorkingSets * profile.volumeWeight(higher.muscle)))
    if (higher.summary && lower?.summary) findings.push(finding('goal-alignment', 'info', `${higher.muscle} receives less split emphasis than ${lower.muscle}`, `${higher.muscle} is priority #${higher.rank + 1}, but ${lower.muscle} has more direct frequency or volume. Consider redistributing existing split work before adding unlimited sets.`, [`${higher.muscle}: ${higher.summary.workoutCount} exposures / ${higher.summary.plannedWorkingSets} sets`, `${lower.muscle}: ${lower.summary.workoutCount} exposures / ${lower.summary.plannedWorkingSets} sets`]))
  }
  return findings
}

function priorityOpportunitiesFor(entries: EvaluatedWorkout[], muscles: Map<string, MuscleAllocation>, preferences: Pick<UserPreferences, 'goals' | 'priorities'> | undefined, availableWorkoutOpportunities: number): SplitPriorityOpportunity[] {
  const profile = resolveMusclePriorities(preferences)
  return profile.orderedMuscles.map((muscle, rank) => {
    const allocation = [...muscles.entries()].find(([candidate]) => candidate.toLowerCase() === muscle.toLowerCase())?.[1]
    const plannedFrequency = allocation?.workoutCount ?? 0
    const desiredFrequency = profile.desiredFrequency(muscle, availableWorkoutOpportunities)
    const distribution = distributionFor(allocation?.indexes ?? [], entries.length)
    // Targets are guidance. We surface a structural concern only when there is
    // no direct work or at least half of the practical opportunity target is missing.
    const underServed = desiredFrequency > 0 && (plannedFrequency === 0 || plannedFrequency * 2 <= desiredFrequency)
    return {
      muscle,
      rank,
      source: profile.explicitMuscles.some((item) => item.toLowerCase() === muscle.toLowerCase()) ? 'explicit' : 'goal-derived',
      desiredFrequency,
      plannedFrequency,
      plannedWorkingSets: allocation?.plannedWorkingSets ?? 0,
      distribution,
      status: desiredFrequency === 0 ? 'insufficient-information' : underServed ? 'under-served' : 'adequate',
      workoutNames: allocation?.workoutNames ?? [],
    }
  })
}

function distributionFor(indexes: number[], splitLength: number): SplitPriorityOpportunity['distribution'] {
  if (indexes.length < 2 || splitLength <= indexes.length) return 'not-applicable'
  const sorted = [...indexes].sort((left, right) => left - right)
  const gaps = sorted.map((index, position) => position === sorted.length - 1 ? splitLength - index + sorted[0] : sorted[position + 1] - index)
  return Math.max(...gaps) > Math.ceil(splitLength / sorted.length) ? 'concentrated' : 'distributed'
}

/** Produces advisory structural candidates; applying one never mutates a split. */
export function splitAlignmentCandidates(split: Split, workouts: WorkoutTemplate[], exercises: Exercise[], preferences?: Pick<UserPreferences, 'goals' | 'priorities'>): RecommendationCandidate[] {
  const evaluation = evaluateSplit(split, workouts, exercises, preferences)
  const trace = buildTrace('adjust-split-for-priority')
  return evaluation.priorityOpportunities.flatMap((opportunity) => {
    const issue = opportunity.status === 'under-served' ? 'under-frequency' : opportunity.distribution === 'concentrated' ? 'concentrated-opportunities' : undefined
    if (!issue) return []
    const id = `split-${split.id}-${opportunity.muscle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${issue}`
    const reason = issue === 'under-frequency'
      ? `${opportunity.muscle} is priority #${opportunity.rank + 1}, but this split provides ${opportunity.plannedFrequency} direct ${opportunity.plannedFrequency === 1 ? 'opportunity' : 'opportunities'} versus a bounded target of ${opportunity.desiredFrequency}.`
      : `${opportunity.muscle} reaches its direct-opportunity target, but its planned opportunities are concentrated instead of distributed through this split.`
    return [{ id, type: 'SPLIT' as const, splitId: split.id, muscle: opportunity.muscle, score: Math.max(3, 5 - Math.min(opportunity.rank, 2)), desiredFrequency: opportunity.desiredFrequency, plannedFrequency: opportunity.plannedFrequency, distribution: opportunity.distribution, issue, reasons: [reason, 'This is advisory: Bobby will not rewrite your split.'], trace }]
  })
}

function assessmentFor(entries: EvaluatedWorkout[], summary: SplitEvaluation['muscleSummary'], findings: SplitFinding[], preferences?: Pick<UserPreferences, 'goals' | 'priorities'>): SplitAssessment {
  const total = summary.reduce((sum, item) => sum + item.plannedWorkingSets, 0)
  const dominant = summary[0]
  return {
    distribution: summary.length < 2 ? 'insufficient information' : dominant && dominant.plannedWorkingSets / total >= .45 ? 'concentrated' : 'balanced',
    recovery: findings.some((item) => item.category === 'recovery') ? 'potential overlap' : entries.length > 1 ? 'spaced' : 'insufficient information',
    redundancy: findings.some((item) => item.category === 'redundancy') ? 'repeated stimulus' : entries.length > 1 ? 'varied' : 'insufficient information',
    complementarity: findings.some((item) => item.category === 'complementarity') ? 'substantially overlapping' : entries.length > 1 ? 'complementary' : 'insufficient information',
    goalAlignment: resolveMusclePriorities(preferences).orderedMuscles.length ? findings.some((item) => item.category === 'goal-alignment' || item.category === 'frequency') ? 'limited' : 'aligned' : 'not assessed',
  }
}

function insufficientAssessment(preferences?: Pick<UserPreferences, 'goals' | 'priorities'>): SplitAssessment { return { distribution: 'insufficient information', recovery: 'insufficient information', redundancy: 'insufficient information', complementarity: 'insufficient information', goalAlignment: resolveMusclePriorities(preferences).orderedMuscles.length ? 'limited' : 'not assessed' } }
function finding(category: SplitFinding['category'], severity: SplitFinding['severity'], title: string, description: string, evidence: string[]): SplitFinding { return { category, severity, title, description, evidence } }
