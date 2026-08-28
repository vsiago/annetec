// Shared helpers for the mock "service layer" (lib/actions/*.ts).
//
// These functions are shaped like Server Actions (async, typed input/output,
// { success, data, error } result) but run on the client and persist to
// localStorage via lib/storage/local-collection.ts, because Server Actions
// cannot access localStorage. When a real backend is ready, only the bodies
// of the functions in lib/actions/*.ts need to change — callers (contexts,
// components) keep the same signatures.

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export function delay(ms = 300) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function genId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}
