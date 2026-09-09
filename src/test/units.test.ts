import { describe, expect, it } from 'vitest'
import { effectiveLoad } from '../domain/units'
import type { LoggedSet } from '../domain/models'

const set = (loadType: LoggedSet['loadType'], weight: number): LoggedSet => ({
  id: 'set', exerciseId: 'pull-up', setType: 'working', loadType, weight, reps: 5,
})

describe('calisthenics load calculations', () => {
  it('uses zero for bodyweight movements until bodyweight is configured', () => {
    expect(effectiveLoad(set('bodyweight', 0))).toBe(0)
  })

  it('uses bodyweight for bodyweight, added weight for weighted, and subtraction for assisted', () => {
    expect(effectiveLoad(set('bodyweight', 0), 170)).toBe(170)
    expect(effectiveLoad(set('weighted-bodyweight', 45), 170)).toBe(215)
    expect(effectiveLoad(set('assisted', 50), 170)).toBe(120)
  })
})