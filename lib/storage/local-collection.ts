// Generic localStorage-backed collection. This is the ONLY place that talks
// to `window.localStorage` directly — swapping the mock backend for a real
// API/DB later means reimplementing this file (and lib/actions/*), nothing
// above this layer (contexts, pages) needs to change.

// Bump this version whenever the seed data changes (e.g. new tenants added).
// When the stored version doesn't match, all collections are wiped so the
// fresh seed takes effect.
const SEED_VERSION = '5'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

function reviver(_key: string, value: unknown) {
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
    return new Date(value)
  }
  return value
}

function ensureSeedVersion() {
  if (typeof window === 'undefined') return
  const stored = window.localStorage.getItem('annetec:seed-version')
  if (stored !== SEED_VERSION) {
    // Wipe every annetec:* key so fresh seeds are written
    const keysToRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key?.startsWith('annetec:')) keysToRemove.push(key)
    }
    keysToRemove.forEach(k => window.localStorage.removeItem(k))
    window.localStorage.setItem('annetec:seed-version', SEED_VERSION)
  }
}

// Run once on module load (client-side only)
ensureSeedVersion()

export interface Collection<T extends { id: string }> {
  getAll(): T[]
  getById(id: string): T | undefined
  create(item: T): T
  update(id: string, patch: Partial<T>): T | undefined
  remove(id: string): boolean
}

export function createCollection<T extends { id: string }>(key: string, seed: T[]): Collection<T> {
  const storageKey = `annetec:${key}`

  function writeRaw(items: T[]) {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, JSON.stringify(items))
  }

  function readRaw(): T[] {
    if (typeof window === 'undefined') return seed
    const raw = window.localStorage.getItem(storageKey)
    if (raw === null) {
      writeRaw(seed)
      return seed
    }
    try {
      return JSON.parse(raw, reviver) as T[]
    } catch {
      return seed
    }
  }

  return {
    getAll() {
      return readRaw()
    },
    getById(id) {
      return readRaw().find(item => item.id === id)
    },
    create(item) {
      const items = readRaw()
      items.push(item)
      writeRaw(items)
      return item
    },
    update(id, patch) {
      const items = readRaw()
      const index = items.findIndex(item => item.id === id)
      if (index === -1) return undefined
      items[index] = { ...items[index], ...patch }
      writeRaw(items)
      return items[index]
    },
    remove(id) {
      const items = readRaw()
      const index = items.findIndex(item => item.id === id)
      if (index === -1) return false
      items.splice(index, 1)
      writeRaw(items)
      return true
    },
  }
}
