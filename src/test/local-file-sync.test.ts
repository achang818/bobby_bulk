import { describe, expect, it } from 'vitest'
import { normalizeSnapshot } from '../domain/local-file-sync'

describe('local JSON snapshot validation', () => {
  it('accepts only the initialized data format and only Bobby-owned values', () => {
    const snapshot = normalizeSnapshot({ version: 1, data: { 'bobby-bulk-workouts': '[{"id":"workout"}]', unrelated: 'ignore me' } })
    expect(snapshot).toEqual({ version: 1, data: { 'bobby-bulk-workouts': '[{"id":"workout"}]' } })
  })

  it('does not allow malformed data to replace browser storage', () => {
    expect(normalizeSnapshot({ version: 1, data: { 'bobby-bulk-workouts': 42 } })).toEqual({ version: 1, data: {} })
    expect(normalizeSnapshot({ version: 2, data: {} })).toEqual({ version: 0, data: {} })
  })
})
