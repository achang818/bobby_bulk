import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Plugin } from 'vite'

const dataFile = resolve(import.meta.dirname, 'data', 'bobby-bulk.json')
const emptySnapshot = { version: 0, data: {} }

function localDataFile(): Plugin {
  return {
    name: 'bobby-local-data-file',
    configureServer(server) {
      server.middlewares.use('/api/bobby-data', (request, response, next) => {
        if (request.method === 'GET') {
          response.setHeader('Content-Type', 'application/json')
          response.end(readSnapshot())
          return
        }
        if (request.method !== 'PUT') return next()
        let body = ''
        request.on('data', (chunk) => { body += chunk })
        request.on('end', () => {
          try {
            const snapshot = JSON.parse(body) as unknown
            if (!isSnapshot(snapshot)) throw new Error('Invalid Bobby data')
            mkdirSync(dirname(dataFile), { recursive: true })
            const temporary = `${dataFile}.tmp`
            // Browser storage values are JSON strings; keep their file form as
            // nested JSON so the local data file remains practical to inspect/edit.
            writeFileSync(temporary, JSON.stringify(toReadableSnapshot(snapshot), null, 2))
            renameSync(temporary, dataFile)
            response.statusCode = 204
            response.end()
          } catch {
            response.statusCode = 400
            response.end('Invalid Bobby data')
          }
        })
      })
    },
  }
}

function readSnapshot() {
  try {
    const value = JSON.parse(readFileSync(dataFile, 'utf8')) as unknown
    return JSON.stringify(toBrowserSnapshot(value))
  } catch {
    return JSON.stringify(emptySnapshot)
  }
}

function isSnapshot(value: unknown): value is { version: 1; data: Record<string, string | null> } {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { version?: unknown; data?: unknown }
  return candidate.version === 1 && !!candidate.data && typeof candidate.data === 'object' && Object.values(candidate.data).every((item) => typeof item === 'string' || item === null)
}

function toReadableSnapshot(snapshot: { version: 1; data: Record<string, string | null> }) {
  return {
    version: snapshot.version,
    data: Object.fromEntries(Object.entries(snapshot.data).map(([key, value]) => [key, parseStoredValue(value)])),
  }
}

function toBrowserSnapshot(value: unknown): { version: number; data: Record<string, string | null> } {
  if (!value || typeof value !== 'object') return emptySnapshot
  const candidate = value as { version?: unknown; data?: unknown }
  if (candidate.version !== 1 || !candidate.data || typeof candidate.data !== 'object') return emptySnapshot
  const data: Record<string, string | null> = {}
  for (const [key, item] of Object.entries(candidate.data as Record<string, unknown>)) {
    if (item === null) data[key] = null
    else if (typeof item === 'string') data[key] = item
    else if (typeof item === 'object') data[key] = JSON.stringify(item)
  }
  return { version: 1, data }
}

function parseStoredValue(value: string | null): unknown {
  if (value === null) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localDataFile()],
  server: {
    port: 5173,
    strictPort: true,
  },
})
