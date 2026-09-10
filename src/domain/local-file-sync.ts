import { PERSISTED_STORAGE_KEYS } from './storage'

export type LocalFileData = Partial<Record<(typeof PERSISTED_STORAGE_KEYS)[number], string | null>>
export interface LocalFileSnapshot { version: number; data: LocalFileData }

const endpoint = '/api/bobby-data'

/** Captures all Bobby-owned browser values without coupling callers to storage keys. */
export function snapshotBrowserData(): LocalFileSnapshot {
  return {
    version: 1,
    data: Object.fromEntries(PERSISTED_STORAGE_KEYS.map((key) => [key, localStorage.getItem(key)])),
  }
}

/** Applies an initialized file snapshot exactly, including deletions. */
export function restoreBrowserData(snapshot: LocalFileSnapshot) {
  if (snapshot.version < 1) return false
  for (const key of PERSISTED_STORAGE_KEYS) {
    const value = snapshot.data[key]
    if (typeof value === 'string') localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  }
  return true
}

export async function loadLocalFileSnapshot(): Promise<LocalFileSnapshot> {
  const response = await fetch(endpoint)
  if (!response.ok) throw new Error(`Could not load local data (${response.status})`)
  return normalizeSnapshot(await response.json())
}

export async function saveLocalFileSnapshot(snapshot = snapshotBrowserData()) {
  const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot), keepalive: true })
  if (!response.ok) throw new Error(`Could not save local data (${response.status})`)
}

export function normalizeSnapshot(value: unknown): LocalFileSnapshot {
  if (!value || typeof value !== 'object') return { version: 0, data: {} }
  const candidate = value as Partial<LocalFileSnapshot>
  if (candidate.version !== 1 || !candidate.data || typeof candidate.data !== 'object') return { version: 0, data: {} }
  const data = Object.fromEntries(PERSISTED_STORAGE_KEYS.flatMap((key) => {
    const item = (candidate.data as Record<string, unknown>)[key]
    return typeof item === 'string' || item === null ? [[key, item]] : []
  })) as LocalFileData
  return { version: 1, data }
}
