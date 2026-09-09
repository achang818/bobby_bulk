import { estimateTypicalDuration } from './adaptation'
import { plannedExercisesFor } from './workout-session'
import type { Exercise, TodaysContext, UserPreferences, WorkoutEvaluation, WorkoutFinding, WorkoutTemplate } from './models'

export function evaluateWorkout(workout: WorkoutTemplate, exercises: Exercise[], context?: Pick<TodaysContext, 'availableMinutes'>, preferences?: Pick<UserPreferences, 'goals'>): WorkoutEvaluation {
  const planned = plannedExercisesFor(workout, exercises)
  const slots = planned.flatMap((item) => {
    const exercise = exercises.find((candidate) => candidate.id === item.exerciseId)
    return exercise ? [{ exercise, planned: item }] : []
  })
  const primaryMuscleSets: Record<string, number> = {}
  const secondary = new Set<string>()
  for (const { exercise, planned: item } of slots) {
    if (item.setType !== 'working') continue
    for (const muscle of exercise.primaryMuscles) primaryMuscleSets[muscle] = (primaryMuscleSets[muscle] ?? 0) + item.sets
    exercise.secondaryMuscles.forEach((muscle) => secondary.add(muscle))
  }
  const estimatedMinutes = estimateTypicalDuration(workout, exercises)
  const findings: WorkoutFinding[] = []
  if (slots.length === 0) findings.push(finding('muscle-coverage', 'info', 'No exercises planned', 'Add exercises before Bobby can evaluate workout structure.', []))
  if (context?.availableMinutes && estimatedMinutes > context.availableMinutes) findings.push(finding('duration', 'warning', 'May exceed available time', `Estimated at ${estimatedMinutes} minutes for ${context.availableMinutes} available minutes.`, [`Estimated duration: ${estimatedMinutes} min`, `Available time: ${context.availableMinutes} min`]))
  else findings.push(finding('duration', 'info', 'Fits estimated time', `Estimated duration is ${estimatedMinutes} minutes.`, [`Estimated duration: ${estimatedMinutes} min`]))
  for (const [pattern, items] of grouped(slots, ({ exercise }) => exercise.movementPattern)) {
    if (items.length >= 3) findings.push(finding('redundancy', 'warning', `High ${pattern} redundancy`, `${items.length} exercises share the ${pattern} movement pattern.`, items.map(({ exercise }) => exercise.name)))
  }
  const ordered = slots.filter(({ planned: item }) => item.setType === 'working')
  for (let index = 0; index < ordered.length; index++) {
    const current = ordered[index]
    if (current.exercise.type !== 'compound') continue
    const earlierIsolation = ordered.slice(0, index).filter(({ exercise, planned: item }) => exercise.type === 'isolation' && (!item.groupId || !current.planned.groupId || item.groupId !== current.planned.groupId))
    if (earlierIsolation.length) findings.push(finding('ordering', 'warning', `${current.exercise.name} follows isolation work`, 'A compound movement is scheduled after isolation work that may reduce its performance.', earlierIsolation.map(({ exercise }) => exercise.name).concat(current.exercise.name)))
  }
  if (preferences?.goals.includes('Build muscle') && planned.reduce((sum, item) => sum + item.sets, 0) === 0) findings.push(finding('goal-alignment', 'warning', 'No planned working volume', 'A hypertrophy goal needs planned working sets to evaluate.', []))
  return { plannedSets: planned.filter((item) => item.setType === 'working').reduce((sum, item) => sum + item.sets, 0), estimatedMinutes, primaryMuscleSets, secondaryMuscles: [...secondary], movementPatterns: [...new Set(slots.map(({ exercise }) => exercise.movementPattern))], findings }
}

function grouped<T>(items: T[], key: (item: T) => string): Map<string, T[]> { return items.reduce((groups, item) => { const value = key(item); groups.set(value, [...(groups.get(value) ?? []), item]); return groups }, new Map<string, T[]>()) }
function finding(category: WorkoutFinding['category'], severity: WorkoutFinding['severity'], title: string, description: string, evidence: string[]): WorkoutFinding { return { category, severity, title, description, evidence } }
