'use server'

import type {
  CreateTenantUserInput,
  MemberAccessStatus,
  TenantUser,
  TenantUserPasswordResetResult,
  UpdateTenantUserInput,
} from '@annetec/contracts'
import { apiFetch, apiFetchAll, tenantPath } from '@/lib/api/client'
import { usuarioDaApi } from '@/lib/adapters/painel'
import type { Client, Seller, User as LegacyUser } from '@/lib/types'
import { run, type ActionResult } from './_api-result'

/**
 * Usuários (admin/vendedor/cliente) de UM inquilino — fala direto com
 * `/api/v1/t/:tenantSlug/usuarios`. Sem mock.
 *
 * O endpoint de usuários só autoriza o ADMIN do inquilino
 * (`requireTenantRole('admin')`). O vendedor/associado editando a própria
 * conta (`ProfileForm`) troca a senha por `lib/actions/account-api.ts`, que
 * fala com `/auth/password` e vale para qualquer papel.
 *
 * O perfil comercial vem junto desde que `GET /usuarios` passou a devolver
 * `sellerProfile` (região, meta e comissão, de `seller_profiles`) e
 * `clientProfile` (CPF, plano, situação e carteirinha). O plano do associado
 * sai do contrato espelhado da Digital Saúde quando ele existe e do registro
 * de venda do CRM quando não — `clientProfile.source` diz qual dos dois foi.
 */
type PainelUser = LegacyUser | Seller | Client

export async function listTenantUsersAction(
  tenantSlug: string,
  params?: { role?: 'admin' | 'seller' | 'client'; q?: string; accessStatus?: MemberAccessStatus },
): Promise<ActionResult<PainelUser[]>> {
  return run(async () => {
    // Sem `accessStatus` a API devolve todos os vínculos (ativos, removidos e
    // bloqueados) — as telas filtram em memória.
    const data = await apiFetchAll<TenantUser>(tenantPath(tenantSlug, '/usuarios'), {
      query: { role: params?.role, q: params?.q, accessStatus: params?.accessStatus },
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

/**
 * Exclui o vínculo da pessoa com o clube (a conta em si não é apagada).
 *
 * Associado: a API cancela a assinatura viva, marca o vínculo `removed` e
 * derruba as sessões — se ele voltar pelo site, o mesmo cadastro é reativado
 * e precisa assinar de novo. Equipe: o vínculo é desativado (também
 * `removed`). Devolve o usuário já com a situação nova; `null` só se a API
 * não mandar o corpo (versão anterior da rota).
 */
export async function deactivateTenantUserAction(
  tenantSlug: string,
  id: string,
): Promise<ActionResult<PainelUser | null>> {
  return run(async () => {
    const { data } = await apiFetch<TenantUser | null>(tenantPath(tenantSlug, `/usuarios/${id}`), {
      method: 'DELETE',
    })
    return data && typeof data === 'object' && 'id' in data ? usuarioDaApi(data) : null
  })
}

/**
 * Bloqueia o acesso: a pessoa não entra nem se cadastra de novo com este
 * e-mail neste clube. A API cancela a assinatura viva e derruba as sessões.
 */
export async function blockTenantUserAction(tenantSlug: string, id: string): Promise<ActionResult<PainelUser>> {
  return run(async () => {
    const { data } = await apiFetch<TenantUser>(tenantPath(tenantSlug, `/usuarios/${id}/bloquear`), {
      method: 'POST',
    })
    return usuarioDaApi(data)
  })
}

/**
 * Desfaz o bloqueio. Associado volta para `removed` (pode voltar pelo site e
 * assinar de novo); equipe volta para `active`.
 */
export async function unblockTenantUserAction(tenantSlug: string, id: string): Promise<ActionResult<PainelUser>> {
  return run(async () => {
    const { data } = await apiFetch<TenantUser>(tenantPath(tenantSlug, `/usuarios/${id}/desbloquear`), {
      method: 'POST',
    })
    return usuarioDaApi(data)
  })
}

/**
 * Redefine a senha de um usuário DESTE clube: a API gera uma provisória e a
 * envia por e-mail ao próprio usuário (marca do clube). A senha nunca volta
 * para a tela — a resposta diz só para qual e-mail foi.
 */
export async function resetTenantUserPasswordAction(
  tenantSlug: string,
  id: string,
): Promise<ActionResult<TenantUserPasswordResetResult>> {
  return run(async () => {
    const { data } = await apiFetch<TenantUserPasswordResetResult>(
      tenantPath(tenantSlug, `/usuarios/${id}/redefinir-senha`),
      { method: 'POST' },
    )
    return data
  })
}
