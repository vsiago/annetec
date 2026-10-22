import {
  effectivePlatformAccess,
  formatDateBR,
  type PlatformAccessLevel,
  type PlatformSubscriptionStatus,
} from '@annetec/contracts'
import { eq } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { db } from '@/db/client'
import { organization, platformSubscriptions } from '@/db/schema'
import { AppError } from '@/http/errors'
import type { AppEnv } from '@/http/types'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { toDateSP } from '@/modules/club-billing/dates'

/**
 * Guard de restrição da plataforma (blueprint da plataforma §0.8), registrado
 * em `routes.ts` para `/api/v1/t/:tenantSlug/*`.
 *
 * Só bloqueia ADMIN e VENDEDOR de inquilino GERENCIADO (com linha em
 * `platform_subscriptions`) cujo acesso efetivo não é `full`:
 *  - `/public/*`, `/cliente/*` e `/assinatura-annetec/*` passam sempre
 *    (vitrine, checkout do clube, portal do associado, carteirinhas no portal
 *    e a própria tela de regularização);
 *  - sem sessão, sessão da plataforma ou papel `client` → passa (quem decide
 *    autenticação é a rota; o associado NUNCA é afetado);
 *  - `read_only` libera GET/HEAD/OPTIONS; `blocked` bloqueia o resto do painel.
 *
 * Falha ao ler o acesso (banco fora, migration ainda não aplicada) → PASSA:
 * a restrição é cobrança, nunca pode derrubar a operação do inquilino.
 */

const CACHE_TTL_MS = 30_000
const PASS_SEGMENTS = new Set(['public', 'cliente', 'assinatura-annetec'])
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export interface PlatformAccessSnapshot {
  organizationId: string | null
  managed: boolean
  status: PlatformSubscriptionStatus | null
  accessOverride: PlatformAccessLevel | null
  accessOverrideUntil: Date | null
  accessOverrideAt: Date | null
  restrictedAt: Date | null
  suspendedAt: Date | null
  canceledAt: Date | null
}

const UNMANAGED: PlatformAccessSnapshot = {
  organizationId: null,
  managed: false,
  status: null,
  accessOverride: null,
  accessOverrideUntil: null,
  accessOverrideAt: null,
  restrictedAt: null,
  suspendedAt: null,
  canceledAt: null,
}

const cache = new Map<string, { snapshot: PlatformAccessSnapshot; expiresAt: number }>()
let lastFailureLogAt = 0

/** Limpa o cache do guard (tudo, ou só o inquilino por slug OU id). */
export function invalidatePlatformAccessCache(slugOrOrgId?: string | null): void {
  if (!slugOrOrgId) {
    cache.clear()
    return
  }
  const key = slugOrOrgId.toLowerCase()
  for (const [slug, entry] of cache) {
    if (slug === key || entry.snapshot.organizationId === slugOrOrgId) cache.delete(slug)
  }
}

async function loadSnapshot(slug: string): Promise<PlatformAccessSnapshot> {
  const [row] = await db
    .select({
      organizationId: organization.id,
      subscriptionId: platformSubscriptions.id,
      status: platformSubscriptions.status,
      accessOverride: platformSubscriptions.accessOverride,
      accessOverrideUntil: platformSubscriptions.accessOverrideUntil,
      accessOverrideAt: platformSubscriptions.accessOverrideAt,
      restrictedAt: platformSubscriptions.restrictedAt,
      suspendedAt: platformSubscriptions.suspendedAt,
      canceledAt: platformSubscriptions.canceledAt,
    })
    .from(organization)
    .leftJoin(platformSubscriptions, eq(platformSubscriptions.organizationId, organization.id))
    .where(eq(organization.slug, slug))
    .limit(1)
  if (!row) return UNMANAGED
  if (!row.subscriptionId || !row.status) return { ...UNMANAGED, organizationId: row.organizationId }
  return {
    organizationId: row.organizationId,
    managed: true,
    status: row.status,
    accessOverride: row.accessOverride ?? null,
    accessOverrideUntil: row.accessOverrideUntil ?? null,
    accessOverrideAt: row.accessOverrideAt ?? null,
    restrictedAt: row.restrictedAt ?? null,
    suspendedAt: row.suspendedAt ?? null,
    canceledAt: row.canceledAt ?? null,
  }
}

/** Acesso do inquilino pelo slug, com cache de 30 s. Nunca lança. */
export async function platformAccessForSlug(rawSlug: string, now = Date.now()): Promise<PlatformAccessSnapshot> {
  const slug = rawSlug.toLowerCase()
  const cached = cache.get(slug)
  if (cached && cached.expiresAt > now) return cached.snapshot
  let snapshot: PlatformAccessSnapshot
  try {
    snapshot = await loadSnapshot(slug)
  } catch (error) {
    if (now - lastFailureLogAt > 10 * 60_000) {
      lastFailureLogAt = now
      logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        'Guard da plataforma: acesso ilegível — liberando (fail-open)',
      )
    }
    snapshot = UNMANAGED
  }
  cache.set(slug, { snapshot, expiresAt: now + CACHE_TTL_MS })
  return snapshot
}

/** Nível efetivo agora (override com `until` vencido volta à régua). */
export function snapshotLevel(snapshot: PlatformAccessSnapshot, now: Date = new Date()) {
  if (!snapshot.managed || !snapshot.status) return { level: 'full' as PlatformAccessLevel, source: 'billing' as const }
  return effectivePlatformAccess(
    { status: snapshot.status, accessOverride: snapshot.accessOverride, accessOverrideUntil: snapshot.accessOverrideUntil },
    now,
  )
}

function dateLabel(value: Date | null): string | null {
  return value ? formatDateBR(toDateSP(value)) : null
}

/** Frase do 403 (com data e o caminho para regularizar). */
export function platformBlockMessage(snapshot: PlatformAccessSnapshot, level: PlatformAccessLevel, source: 'billing' | 'override'): string {
  const where = 'Regularize em "Assinatura da plataforma" no menu do painel.'
  if (source === 'override') {
    const since = dateLabel(snapshot.accessOverrideAt)
    const until = dateLabel(snapshot.accessOverrideUntil)
    const period = `${since ? ` desde ${since}` : ''}${until ? ` até ${until}` : ''}`
    return level === 'read_only'
      ? `Painel em modo somente leitura por decisão da operadora${period}. Consultas continuam liberadas; alterações não. Veja "Assinatura da plataforma".`
      : `Painel bloqueado por decisão da operadora${period}. Veja "Assinatura da plataforma" ou fale com a operadora.`
  }
  if (level === 'read_only') {
    const since = dateLabel(snapshot.restrictedAt)
    return `Painel em modo somente leitura${since ? ` desde ${since}` : ''}: há fatura da plataforma vencida em aberto. Consultas continuam liberadas; alterações não. ${where}`
  }
  if (snapshot.status === 'canceled') {
    const since = dateLabel(snapshot.canceledAt)
    return `Assinatura da plataforma cancelada${since ? ` em ${since}` : ''}: painel bloqueado. Veja "Assinatura da plataforma" ou fale com a operadora para reativar.`
  }
  const since = dateLabel(snapshot.suspendedAt)
  return `Painel bloqueado${since ? ` desde ${since}` : ''} por falta de pagamento da assinatura da plataforma. ${where}`
}

/** 1º segmento depois de `/api/v1/t/:slug/`. */
export function tenantSubPath(path: string): string {
  const parts = path.split('/')
  // ['', 'api', 'v1', 't', '<slug>', '<segmento>', ...]
  return (parts[5] ?? '').toLowerCase()
}

export const platformAccessGuard = createMiddleware<AppEnv>(async (c, next) => {
  const slug = c.req.param('tenantSlug')
  if (!slug || PASS_SEGMENTS.has(tenantSubPath(c.req.path))) return next()

  const snapshot = await platformAccessForSlug(slug)
  if (!snapshot.managed) return next()
  const { level, source } = snapshotLevel(snapshot)
  if (level === 'full') return next()

  // Caminho raro (inquilino restrito/bloqueado): só aqui lê a sessão.
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null
  try {
    session = await auth.api.getSession({ headers: c.req.raw.headers })
  } catch {
    session = null
  }
  if (!session) return next()
  if (session.membership.scope === 'platform') return next()
  const role = session.membership.tenantRole
  if (role !== 'admin' && role !== 'seller') return next()
  if (level === 'read_only' && READ_METHODS.has(c.req.method.toUpperCase())) return next()

  throw AppError.forbidden(platformBlockMessage(snapshot, level, source))
})
