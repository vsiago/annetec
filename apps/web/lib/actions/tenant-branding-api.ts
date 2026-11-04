'use server'

import { revalidatePath } from 'next/cache'
import type { TenantBranding, UpdateTenantBrandColorsInput } from '@annetec/contracts'
import { apiFetch } from '@/lib/api/client'
import { run, type ActionResult } from './_api-result'

/**
 * Cores do clube, pelo admin do próprio clube — `PATCH /api/v1/t/:slug/marca`.
 * Só as cores: a API mescla e não toca em logo nem ícones. (Logo e ícone vão
 * por rotas de upload em `app/api/clube/…`, porque server action tem teto de
 * corpo de 1 MB.)
 */
export async function updateTenantBrandColorsAction(
  slug: string,
  input: UpdateTenantBrandColorsInput,
): Promise<ActionResult<{ branding: TenantBranding }>> {
  return run(async () => {
    const { data } = await apiFetch<{ branding: TenantBranding }>(`/api/v1/t/${encodeURIComponent(slug)}/marca`, {
      method: 'PATCH',
      body: input,
    })
    // Nada do clube fica em cache de dados, mas a metadata (theme_color do manifest) e o cache do roteador sim.
    revalidatePath(`/${slug}`, 'layout')
    return data
  })
}
