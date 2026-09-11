import { describe, expect, it } from 'vitest'
import { resolveMusclePriorities } from '../domain/muscle-priorities'

describe('resolved muscle priorities', () => {
  it('preserves explicit ordered partial priorities without requiring a complete ranking', () => {
    const profile = resolveMusclePriorities({ goals: [], priorities: ['Abs', 'Upper chest', 'Lats', 'Side delts'] })
    expect(profile.orderedMuscles).toEqual(['Abs', 'Upper chest', 'Lats', 'Side delts'])
    expect(profile.rankOf('Quads')).toBeUndefined()
  })

  it('derives an aesthetic physique default profile and lets explicit priorities lead it', () => {
    const derived = resolveMusclePriorities({ goals: ['Aesthetic physique'], priorities: [] })
    expect(derived.orderedMuscles.slice(0, 4)).toEqual(['Side delts', 'Lats', 'Upper chest', 'Abs'])
    const overridden = resolveMusclePriorities({ goals: ['Aesthetic physique'], priorities: ['Abs', 'Upper chest', 'Lats'] })
    expect(overridden.orderedMuscles.slice(0, 6)).toEqual(['Abs', 'Upper chest', 'Lats', 'Side delts', 'Biceps', 'Rear delts'])
  })

  it('uses bounded frequency and volume guidance rather than requiring every priority three times weekly', () => {
    const profile = resolveMusclePriorities({ goals: [], priorities: ['Abs', 'Upper chest', 'Lats', 'Side delts'] })
    expect(profile.desiredFrequency('Abs', 4)).toBe(3)
    expect(profile.desiredFrequency('Side delts', 4)).toBe(2)
    expect(profile.desiredFrequency('Abs', 2)).toBe(2)
    expect(profile.volumeWeight('Abs')).toBeGreaterThan(profile.volumeWeight('Side delts'))
  })
})
