/**
 * Cache em memória da holding (blueprint da plataforma §0.1-9): 60 s por
 * (rota, parâmetros). `?fresh=1` ignora e regrava; ações de ciclo de vida e
 * mudanças de estado da cobrança da plataforma invalidam tudo.
 */

export const HOLDING_CACHE_TTL_MS = 60_000

const store = new Map<string, { value: unknown; expiresAt: number }>()
const inFlight = new Map<string, Promise<unknown>>()

export function holdingCacheKey(route: string, params: Record<string, unknown> = {}): string {
  const entries = Object.entries(params)
    .filter(([key, value]) => value !== undefined && key !== 'fresh')
    .sort(([a], [b]) => a.localeCompare(b))
  return `${route}?${entries.map(([key, value]) => `${key}=${String(value)}`).join('&')}`
}

/**
 * Devolve do cache (quando vale) ou calcula. `cached` diz de onde veio.
 * Chamadas simultâneas da mesma chave compartilham o cálculo.
 */
export async function withHoldingCache<T>(
  key: string,
  fresh: boolean,
  compute: () => Promise<T>,
  now = Date.now(),
): Promise<{ value: T; cached: boolean }> {
  if (!fresh) {
    const hit = store.get(key)
    if (hit && hit.expiresAt > now) return { value: hit.value as T, cached: true }
    const pending = inFlight.get(key)
    if (pending) return { value: (await pending) as T, cached: false }
  }
  const promise = compute()
  inFlight.set(key, promise)
  try {
    const value = await promise
    store.set(key, { value, expiresAt: Date.now() + HOLDING_CACHE_TTL_MS })
    return { value, cached: false }
  } finally {
    if (inFlight.get(key) === promise) inFlight.delete(key)
  }
}

export function invalidateHoldingCache(): void {
  store.clear()
}
