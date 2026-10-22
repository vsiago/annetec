'use server'

import type { ListPlatformEmailsQuery, PlatformEmail, PlatformEmailListItem } from '@annetec/contracts'
import { apiFetch } from '@/lib/api/client'
import { pagedOf, type Paged } from '@/lib/adapters/platform-console'
import { run, type ActionResult } from './_api-result'

/**
 * Caixa de saída da plataforma — `/api/v1/platform/emails` (blueprint §0.3, Q1).
 * Todo e-mail transacional (contratação, boas-vindas, faturas, régua) é
 * gravado ali; no modo `outbox` (padrão da demonstração) é o único canal.
 */

const BASE = '/api/v1/platform/emails'

export async function listPlatformEmailsAction(
  query: Partial<ListPlatformEmailsQuery> = {},
): Promise<ActionResult<Paged<PlatformEmailListItem>>> {
  return run(async () => {
    const q = query.q?.trim().slice(0, 100)
    const { data, meta } = await apiFetch<PlatformEmailListItem[]>(BASE, {
      query: {
        page: query.page,
        perPage: query.perPage,
        sort: query.sort,
        q: q ? q : undefined,
        template: query.template,
        status: query.status,
        proposalId: query.proposalId,
        organizationId: query.organizationId,
      },
    })
    return pagedOf(data ?? [], meta, query.page, query.perPage)
  })
}

export async function getPlatformEmailAction(id: string): Promise<ActionResult<PlatformEmail>> {
  return run(async () => {
    const { data } = await apiFetch<PlatformEmail>(`${BASE}/${encodeURIComponent(id)}`)
    return data
  })
}
