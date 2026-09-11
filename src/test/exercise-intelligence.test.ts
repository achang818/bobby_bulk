import { describe, expect, it } from 'vitest'
import { describeExerciseSimilarity, evaluateExerciseCandidate, findExerciseCandidates } from '../domain/exercise-intelligence'
import { exercises } from '../domain/exercises'
import { defaultPreferences } from '../domain/preferences'
import type { Exercise } from '../domain/models'

const exercise = (id: string) => exercises.find((item) => item.id === id)!
const copy = (base: Exercise, id: string, name: string, changes: Partial<Exercise> = {}): Exercise => ({ ...base, id, name, ...changes })

describe('exercise intelligence similarity', () => {
  it('describes the same exercise without treating identity as a replacement decision', () => {
    const bench = exercise('barbell-bench-press')
    const similarity = describeExerciseSimilarity(bench, bench)

    expect(similarity).toMatchObject({ sameExercise: true, movementPatternMatch: true, primaryActionMatch: true, typeMatch: true })
    expect(similarity.directPrimaryMuscleOverlap).toEqual(bench.primaryMuscles)
  })

  it('recognizes a highly similar compound alternative across the full structural dimensions', () => {
    const candidate = evaluateExerciseCandidate({ exercise: exercise('barbell-bench-press') }, exercise('machine-chest-press'))

    expect(candidate).toMatchObject({ compatibility: 'strong', muscleMatch: 'direct', roleMatch: 'preserved', movementMatch: true })
    expect(candidate.reasons).toContain('Preserves the planned movement pattern.')
  })

  it('keeps same-muscle exercises with a different movement as weak similarity', () => {
    const candidate = evaluateExerciseCandidate({ exercise: exercise('lat-pulldown') }, exercise('cable-row'))

    expect(candidate.similarity.directPrimaryMuscleOverlap).toContain('Lats')
    expect(candidate).toMatchObject({ compatibility: 'weak', movementMatch: false })
  })

  it('does not make matching movement pattern enough when direct targets differ', () => {
    const candidate = evaluateExerciseCandidate({ exercise: exercise('barbell-bench-press') }, exercise('close-grip-bench'))

    expect(candidate.similarity.movementPatternMatch).toBe(true)
    expect(candidate).toMatchObject({ muscleMatch: 'supporting-only', eligibility: 'missing-direct-primary-target', compatibility: 'weak' })
  })

  it('marks a compound-to-isolation change as reasonable rather than equivalent', () => {
    const candidate = evaluateExerciseCandidate({ exercise: exercise('barbell-bench-press') }, exercise('cable-fly'))

    expect(candidate).toMatchObject({ compatibility: 'reasonable', roleMatch: 'changed', muscleMatch: 'direct' })
  })
})

describe('exercise intelligence candidate selection', () => {
  it('ranks a strong replacement over a poor same-muscle replacement', () => {
    const original = exercise('lat-pulldown')
    const strong = exercise('pull-up')
    const poor = exercise('cable-row')
    const candidates = findExerciseCandidates({ exercise: original, exercises: [original, poor, strong], constraints: { requireSameCategory: true } })

    expect(candidates.map((candidate) => candidate.exercise.id)).toEqual([strong.id, poor.id])
    expect(candidates.map((candidate) => candidate.compatibility)).toEqual(['strong', 'weak'])
  })

  it('keeps an acceptable but role-changing alternative distinct from a strong replacement', () => {
    const candidate = evaluateExerciseCandidate({ exercise: exercise('lat-pulldown') }, exercise('straight-arm-pulldown'))

    expect(candidate).toMatchObject({ eligibility: 'eligible', compatibility: 'reasonable', roleMatch: 'changed' })
  })

  it('removes equipment-incompatible candidates before ranking', () => {
    const original = exercise('lat-pulldown')
    const pullUp = exercise('pull-up')
    const evaluated = evaluateExerciseCandidate({ exercise: original, constraints: { unavailableEquipment: ['pull-up-bar'] } }, pullUp)
    const candidates = findExerciseCandidates({ exercise: original, exercises: [original, pullUp], constraints: { unavailableEquipment: ['pull-up-bar'] } })

    expect(evaluated).toMatchObject({ eligibility: 'unavailable-equipment', equipmentMatch: false })
    expect(candidates).toEqual([])
  })

  it('applies excluded exercises as a hard constraint', () => {
    const original = exercise('lat-pulldown')
    const pullUp = exercise('pull-up')
    const candidates = findExerciseCandidates({
      exercise: original,
      exercises: [original, pullUp],
      preferences: { ...defaultPreferences, excludedExerciseIds: [pullUp.id] },
    })

    expect(candidates).toEqual([])
  })

  it('uses preferred and recommend-less feedback as opposite soft ranking adjustments', () => {
    const original = exercise('barbell-bench-press')
    const neutral = copy(original, 'neutral-press-fixture', 'Neutral Press Fixture', { equipment: 'Machine' })
    const preferred = copy(original, 'preferred-press-fixture', 'Preferred Press Fixture', { equipment: 'Machine' })
    const lessPreferred = copy(original, 'less-press-fixture', 'Less Press Fixture', { equipment: 'Machine' })

    const preferredOrder = findExerciseCandidates({
      exercise: original,
      exercises: [original, neutral, preferred],
      preferences: { ...defaultPreferences, preferredExerciseIds: [preferred.id] },
    })
    const lessPreferredOrder = findExerciseCandidates({
      exercise: original,
      exercises: [original, neutral, lessPreferred],
      preferences: { ...defaultPreferences, recommendLessExerciseIds: [lessPreferred.id] },
    })

    expect(preferredOrder.map((candidate) => candidate.exercise.id)).toEqual([preferred.id, neutral.id])
    expect(lessPreferredOrder.map((candidate) => candidate.exercise.id)).toEqual([neutral.id, lessPreferred.id])
  })

  it('lets preserved direct work for a priority muscle outrank a superficially stronger match', () => {
    const base = exercise('lat-pulldown')
    const original = copy(base, 'priority-source', 'Priority Source', { primaryMuscles: ['Lats', 'Biceps'] })
    const priorityDirect = copy(base, 'priority-direct', 'Priority Direct', { primaryMuscles: ['Lats'], primaryAction: 'shoulder-extension' })
    const superficial = copy(base, 'superficial-biceps', 'Superficial Biceps', { primaryMuscles: ['Biceps'] })
    const candidates = findExerciseCandidates({ exercise: original, exercises: [original, superficial, priorityDirect], priorityMuscles: ['Lats'] })

    expect(candidates.map((candidate) => candidate.exercise.id)).toEqual([priorityDirect.id, superficial.id])
    expect(candidates[0]?.priorityMuscleRank).toBe(0)
  })

  it('preserves a primary compound role ahead of an otherwise similar isolation option', () => {
    const original = exercise('barbell-bench-press')
    const compound = copy(original, 'compound-fixture', 'Compound Fixture', { equipment: 'Machine' })
    const isolation = copy(original, 'isolation-fixture', 'Isolation Fixture', { equipment: 'Cable', type: 'isolation' })
    const candidates = findExerciseCandidates({ exercise: original, exercises: [original, isolation, compound], role: 'primary-compound' })

    expect(candidates.map((candidate) => candidate.exercise.id)).toEqual([compound.id, isolation.id])
    expect(candidates[1]?.roleMatch).toBe('changed')
  })

  it('uses active goals as an explainable ranking dimension and remains deterministic', () => {
    const original = exercise('barbell-bench-press')
    const aligned = copy(original, 'goal-aligned', 'Goal Aligned', { goals: ['Build muscle'] })
    const unaligned = copy(original, 'goal-unaligned', 'Goal Unaligned', { goals: ['General fitness'] })
    const request = { exercise: original, exercises: [original, unaligned, aligned], goals: ['Build muscle'] as const }

    const first = findExerciseCandidates(request)
    const second = findExerciseCandidates(request)

    expect(first.map((candidate) => candidate.exercise.id)).toEqual([aligned.id, unaligned.id])
    expect(first[0]?.reasons).toContain('Supports the active goal context.')
    expect(second.map((candidate) => candidate.exercise.id)).toEqual(first.map((candidate) => candidate.exercise.id))
  })
})
