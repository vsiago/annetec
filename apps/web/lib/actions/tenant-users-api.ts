'use server'

import type { CreateTenantUserInput, TenantUser, UpdateTenantUserInput } from '@annetec/contracts'
import { apiFetch, apiFetchAll, tenantPath } from '@/lib/api/client'
import { usuarioDaApi } from '@/lib/adapters/painel'
import type { Client, Seller, User as LegacyUser } from '@/lib/types'
import { run, type ActionResult } from './_api-result'

/**
 * Usuários (admin/vendedor/cliente) de UM inquilino — fala direto com
 * `/api/v1/t/:tenantSlug/usuarios`. Sem mock.
 *
 * Fica separado de `contexts/tenant-data-context.tsx` de propósito: aquele
 * contexto ainda serve dado mock para benefícios/parceiros/CRM/perfil próprio
 * (`ProfileForm`), e o endpoint real de usuários só autoriza o ADMIN do
 * inquilino (`requireTenantRole('admin')`) — trocar o contexto inteiro
 * quebraria as telas onde é o próprio vendedor/cliente editando os dados
 * dele. Só `/admin/usuarios` (tela exclusiva do admin) usa este arquivo.
 *
 * O perfil comercial vem junto desde que `GET /usuarios` passou a devolver
 * `sellerProfile` (região, meta e comissão, de `seller_profiles`) e
 * `clientProfile` (CPF, plano, situação e carteirinha). O plano do associado
 * sai do contrato espelhado da Digital Saúde quando ele existe e do registro
 * de venda do CRM quando não — `clientProfile.source` diz qual dos dois foi.
 */
type PainelUser = LegacyUser | Seller | Client

export type { ActionResult }

export async function listTenantUsersAction(
  tenantSlug: string,
  params?: { role?: 'admin' | 'seller' | 'client'; q?: string },
): Promise<ActionResult<PainelUser[]>> {
  return run(async () => {
    const data = await apiFetchAll<TenantUser>(tenantPath(tenantSlug, '/usuarios'), {
      query: { role: params?.role, q: params?.q },
    })
    return data.map(usuarioDaApi)
  })
}

export async function createTenantUserAction(
  tenantSlug: string,
  input: CreateTenantUserInput,
): Promise<ActionResult<PainelUser>> {
  return run(async () => {
    const { data } = await apiFetch<TenantUser>(tenantPath(tenantSlug, '/usuarios'), {
      method: 'POST',
      body: input,
    })
    return usuarioDaApi(data)
  })
}

export async function updateTenantUserAction(
  tenantSlug: string,
  id: string,
  patch: UpdateTenantUserInput,
): Promise<ActionResult<PainelUser>> {
  return run(async () => {
    const { data } = await apiFetch<TenantUser>(tenantPath(tenantSlug, `/usuarios/${id}`), {
      method: 'PATCH',
      body: patch,
    })
    return usuarioDaApi(data)
  })
}

/** Desativa o vínculo do usuário com o inquilino (a conta em si não é apagada). */
export async function deactivateTenantUserAction(tenantSlug: string, id: string): Promise<ActionResult<null>> {
  return run(async () => {
    await apiFetch(tenantPath(tenantSlug, `/usuarios/${id}`), { method: 'DELETE' })
    return null
  })
}
