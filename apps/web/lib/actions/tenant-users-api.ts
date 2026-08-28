'use server'

import type { CreateTenantUserInput, TenantUser, UpdateTenantUserInput } from '@annetec/contracts'
import { ApiError, apiFetch, tenantPath } from '@/lib/api/client'
import type { User as LegacyUser } from '@/lib/types'

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
 * O modelo real ainda não tem os campos comerciais de `Seller`
 * (região/meta/comissão) nem os de `Client` (CPF/plano/carteirinha) — isso
 * vem do CRM e do contrato na Digital Saúde, ainda não migrados. Por isso o
 * mapeamento devolve sempre o formato base `User`: é estruturalmente válido
 * como `Seller`/`Client` (a união `TenantUser` de `lib/types.ts` aceita
 * qualquer um dos três), e as telas já tratam os campos extras como opcionais
 * quando ausentes.
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

function toLegacyUser(user: TenantUser): LegacyUser {
  return {
    id: user.id,
    tenantId: user.tenantId,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone ?? undefined,
    avatar: user.avatarUrl ?? undefined,
    createdAt: new Date(user.createdAt),
  }
}

export async function listTenantUsersAction(
  tenantSlug: string,
  params?: { role?: 'admin' | 'seller' | 'client'; q?: string },
): Promise<ActionResult<LegacyUser[]>> {
  return run(async () => {
    const { data } = await apiFetch<TenantUser[]>(tenantPath(tenantSlug, '/usuarios'), {
      query: { perPage: 200, role: params?.role, q: params?.q },
    })
    return data.map(toLegacyUser)
  })
}

export async function createTenantUserAction(
  tenantSlug: string,
  input: CreateTenantUserInput,
): Promise<ActionResult<LegacyUser>> {
  return run(async () => {
    const { data } = await apiFetch<TenantUser>(tenantPath(tenantSlug, '/usuarios'), {
      method: 'POST',
      body: input,
    })
    return toLegacyUser(data)
  })
}

export async function updateTenantUserAction(
  tenantSlug: string,
  id: string,
  patch: UpdateTenantUserInput,
): Promise<ActionResult<LegacyUser>> {
  return run(async () => {
    const { data } = await apiFetch<TenantUser>(tenantPath(tenantSlug, `/usuarios/${id}`), {
      method: 'PATCH',
      body: patch,
    })
    return toLegacyUser(data)
  })
}

/** Desativa o vínculo do usuário com o inquilino (a conta em si não é apagada). */
export async function deactivateTenantUserAction(tenantSlug: string, id: string): Promise<ActionResult<null>> {
  return run(async () => {
    await apiFetch(tenantPath(tenantSlug, `/usuarios/${id}`), { method: 'DELETE' })
    return null
  })
}

async function run<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { success: true, data: await operation() }
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        ...(error.issues ? { fieldErrors: error.toFieldErrors() } : {}),
      }
    }
    return { success: false, error: 'Não foi possível concluir a operação. Tente novamente.' }
  }
}
