import { BRAND_LOGO_MAX_BYTES, updateTenantBrandColorsInput } from '@annetec/contracts'
import { Hono, type Context } from 'hono'
import { requireAuth, requireTenantRole } from '@/http/middleware/auth'
import { resolveTenant, tenantOf } from '@/http/middleware/tenant'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { readMultipart, uploadBodyLimit } from '@/modules/platform-onboarding/http'
import {
  assertBrandUpload,
  removeOrganizationIcon,
  removeOrganizationLogo,
  storeOrganizationIcon,
  storeOrganizationLogo,
  updateOrganizationBrandColors,
} from './service'

/**
 * Marca do clube (logo, ícones, cores). Duas portas para o mesmo serviço:
 *  - `tenantBrandingController`: autoatendimento do admin do clube, montado
 *    em `/api/v1/t/:tenantSlug/marca`;
 *  - `brandHandlers`: superadmin da plataforma, plugados em
 *    `/api/v1/platform/tenants/:id/(logo|icone)` (ver modules/tenants).
 */

/** ~20 envios por hora por clube (logo e ícone dividem o balde). */
export const brandUploadLimit = (organizationIdOf: (c: Context<AppEnv>) => string | null) =>
  rateLimit({ key: 'marca:upload', limit: 20, windowMs: 60 * 60 * 1000, keyOf: organizationIdOf })

async function receiveImage(c: Context<AppEnv>) {
  const { file } = await readMultipart(c)
  const bytes = new Uint8Array(await file.arrayBuffer())
  return { bytes, mime: assertBrandUpload(bytes).mime }
}

const userIdOf = (c: Context<AppEnv>) => c.get('auth')!.user.id

/** Handlers compartilhados; `organizationId` vem do slug (clube) ou do `:id` (plataforma). */
export function brandHandlers(organizationIdOf: (c: Context<AppEnv>) => string) {
  const audit = (c: Context<AppEnv>, action: string, metadata?: Record<string, unknown>) =>
    recordAudit(c, { action, resource: 'tenant', resourceId: organizationIdOf(c), organizationId: organizationIdOf(c), metadata })

  return {
    async uploadLogo(c: Context<AppEnv>) {
      const organizationId = organizationIdOf(c)
      const { bytes, mime } = await receiveImage(c)
      const result = await storeOrganizationLogo({ organizationId, bytes, mime, uploadedBy: userIdOf(c) })
      await audit(c, 'tenant.logo_uploaded', { mime, bytes: bytes.length, largura: result.width, altura: result.height })
      return ok(c, result)
    },
    async uploadIcon(c: Context<AppEnv>) {
      const organizationId = organizationIdOf(c)
      const { bytes, mime } = await receiveImage(c)
      const result = await storeOrganizationIcon({ organizationId, bytes, mime, uploadedBy: userIdOf(c) })
      await audit(c, 'tenant.icon_uploaded', { mime, bytes: bytes.length, largura: result.width, altura: result.height })
      return ok(c, result)
    },
    async deleteLogo(c: Context<AppEnv>) {
      const branding = await removeOrganizationLogo(organizationIdOf(c))
      await audit(c, 'tenant.logo_removed')
      return ok(c, { branding })
    },
    async deleteIcon(c: Context<AppEnv>) {
      const branding = await removeOrganizationIcon({ organizationId: organizationIdOf(c), uploadedBy: userIdOf(c) })
      await audit(c, 'tenant.icon_removed')
      return ok(c, { branding })
    },
  }
}

const tenantHandlers = brandHandlers(c => tenantOf(c).id)
const tenantLimit = brandUploadLimit(c => c.get('tenant')?.id ?? null)

export const tenantBrandingController = new Hono<AppEnv>()
  .use('*', resolveTenant, requireAuth, requireTenantRole('admin'))

  .post('/logo', tenantLimit, uploadBodyLimit(BRAND_LOGO_MAX_BYTES), c => tenantHandlers.uploadLogo(c))
  .delete('/logo', c => tenantHandlers.deleteLogo(c))
  .post('/icone', tenantLimit, uploadBodyLimit(BRAND_LOGO_MAX_BYTES), c => tenantHandlers.uploadIcon(c))
  .delete('/icone', c => tenantHandlers.deleteIcon(c))

  /** Só as cores (merge): o logo e os ícones não são tocados. */
  .patch('/', json(updateTenantBrandColorsInput), async c => {
    const id = tenantOf(c).id
    const branding = await updateOrganizationBrandColors(id, c.req.valid('json'))
    await recordAudit(c, {
      action: 'tenant.brand_colors_updated',
      resource: 'tenant',
      resourceId: id,
      organizationId: id,
      metadata: { primaryColor: branding.primaryColor, secondaryColor: branding.secondaryColor },
    })
    return ok(c, { branding })
  })
