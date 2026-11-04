import { ERROR_CODES, type LogoUploadResult, type TenantBranding } from '@annetec/contracts'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { tenantProfiles } from '@/db/schema'
import { AppError } from '@/http/errors'
import {
  BrandImageError,
  deriveIconsFromLogo,
  processIcon,
  processLogo,
  type IconVariants,
} from '@/lib/branding/logo-pipeline'
import { logger } from '@/lib/logger'
import {
  checkUpload,
  discardFile,
  findFile,
  publicFileUrl,
  readFileContent,
  storeFile,
  type PlatformFileRow,
} from '@/lib/storage'

/**
 * Marca do clube (logo, ícones e cores) em `tenant_profiles.branding`.
 *
 * Regras:
 *  - os envios fazem MERGE no branding — nunca mexem nas cores;
 *  - os arquivos anteriores NÃO são apagados (e-mails já enviados apontam
 *    para as URLs antigas; as URLs são imutáveis e baseadas em UUID);
 *  - logo: sempre refaz `logoUrl`/`logoLightUrl`; refaz os ícones a partir do
 *    logo SÓ quando `iconSource !== 'upload'`;
 *  - ícone enviado: troca os 4 ícones e marca `iconSource: 'upload'`.
 */

export interface BrandActor {
  /** `user.id` ou um rótulo de sistema (`provisioning`). */
  uploadedBy: string
}

type BrandingUrlKey = 'logoUrl' | 'logoLightUrl' | 'iconUrl' | 'iconSmallUrl' | 'appleTouchIconUrl' | 'faviconUrl'
const ICON_KEYS = ['iconUrl', 'iconSmallUrl', 'appleTouchIconUrl', 'faviconUrl'] as const

/** Erro de imagem → 422 no mesmo formato dos demais uploads. */
function imageError(message: string): AppError {
  return new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, message, { issues: [{ path: 'file', message }] })
}

/** Tamanho (413) e tipo real pelos magic bytes (422) do envio. */
export function assertBrandUpload(bytes: Uint8Array): { mime: string } {
  const check = checkUpload('brand_logo', bytes)
  if (check.ok) return { mime: check.type.mime }
  if (check.reason === 'too_large') {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, check.message, {
      status: 413,
      issues: [{ path: 'file', message: check.message }],
    })
  }
  throw imageError(check.message)
}

/** Roda a função de imagem convertendo `BrandImageError` em 422. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof BrandImageError) throw imageError(error.message)
    throw error
  }
}

async function loadBranding(organizationId: string): Promise<TenantBranding> {
  const [row] = await db
    .select({ branding: tenantProfiles.branding })
    .from(tenantProfiles)
    .where(eq(tenantProfiles.organizationId, organizationId))
    .limit(1)
  if (!row) throw AppError.notFound('Inquilino')
  return row.branding
}

async function saveBranding(organizationId: string, branding: TenantBranding): Promise<TenantBranding> {
  await db.update(tenantProfiles).set({ branding, updatedAt: new Date() }).where(eq(tenantProfiles.organizationId, organizationId))
  return branding
}

/** Guarda as variantes; se alguma falhar, descarta as já gravadas (melhor esforço). */
async function storeVariants(
  organizationId: string,
  uploadedBy: string,
  variants: Partial<Record<BrandingUrlKey, { bytes: Uint8Array; fileName: string }>>,
): Promise<Partial<Record<BrandingUrlKey, string>>> {
  const urls: Partial<Record<BrandingUrlKey, string>> = {}
  const stored: PlatformFileRow[] = []
  try {
    for (const [key, variant] of Object.entries(variants) as [BrandingUrlKey, { bytes: Uint8Array; fileName: string }][]) {
      const file = await storeFile({
        bytes: variant.bytes,
        fileName: variant.fileName,
        mimeType: 'image/png',
        ext: 'png',
        purpose: 'brand_logo',
        visibility: 'public',
        ownerType: 'organization',
        ownerId: organizationId,
        organizationId,
        uploadedBy,
        keyPrefix: `logos/${organizationId}`,
      })
      stored.push(file)
      urls[key] = publicFileUrl(file.id)
    }
  } catch (error) {
    await Promise.all(stored.map(file => discardFile(file).catch(() => {})))
    throw error
  }
  return urls
}

function iconFiles(icons: IconVariants) {
  return {
    iconUrl: { bytes: icons.icon, fileName: 'icone-512.png' },
    iconSmallUrl: { bytes: icons.iconSmall, fileName: 'icone-192.png' },
    appleTouchIconUrl: { bytes: icons.appleTouchIcon, fileName: 'icone-apple-180.png' },
    faviconUrl: { bytes: icons.favicon, fileName: 'favicon-48.png' },
  } satisfies Partial<Record<BrandingUrlKey, { bytes: Uint8Array; fileName: string }>>
}

function without(branding: TenantBranding, keys: readonly (keyof TenantBranding)[]): TenantBranding {
  const copy = { ...branding }
  for (const key of keys) delete copy[key]
  return copy
}

export interface StoreLogoInput extends BrandActor {
  organizationId: string
  bytes: Uint8Array
  mime: string
}

/** Logo enviado → variantes adaptadas + merge no branding. */
export async function storeOrganizationLogo(input: StoreLogoInput): Promise<LogoUploadResult> {
  const { organizationId, uploadedBy } = input
  const processed = await guarded(() => processLogo(input.bytes, input.mime))
  const old = await loadBranding(organizationId)
  const { variants, meta } = processed
  const regenerateIcons = old.iconSource !== 'upload'

  const urls = await storeVariants(organizationId, uploadedBy, {
    logoUrl: { bytes: variants.logo, fileName: 'logo.png' },
    ...(variants.logoLight ? { logoLightUrl: { bytes: variants.logoLight, fileName: 'logo-claro.png' } } : {}),
    ...(regenerateIcons ? iconFiles(variants) : {}),
  })

  let branding: TenantBranding = { ...without(old, ['logoLightUrl']), ...urls }
  if (regenerateIcons) branding.iconSource = 'auto'
  branding = await saveBranding(organizationId, branding)
  return {
    branding,
    suggestedColors: meta.suggestedColors,
    warnings: meta.warnings,
    width: meta.width,
    height: meta.height,
    hasTransparency: meta.hasTransparency,
  }
}

/** Símbolo enviado à parte → 4 ícones + `iconSource: 'upload'`. O logo não é tocado. */
export async function storeOrganizationIcon(input: StoreLogoInput): Promise<LogoUploadResult> {
  const { organizationId, uploadedBy } = input
  const { variants, meta } = await guarded(() => processIcon(input.bytes, input.mime))
  const old = await loadBranding(organizationId)
  const urls = await storeVariants(organizationId, uploadedBy, iconFiles(variants))
  const branding = await saveBranding(organizationId, { ...old, ...urls, iconSource: 'upload' })
  return {
    branding,
    suggestedColors: [],
    warnings: meta.warnings,
    width: meta.width,
    height: meta.height,
    hasTransparency: meta.hasTransparency,
  }
}

/** Remove o logo; sem ícone enviado, os ícones (derivados dele) saem junto. */
export async function removeOrganizationLogo(organizationId: string): Promise<TenantBranding> {
  const old = await loadBranding(organizationId)
  const derived = old.iconSource !== 'upload'
  return saveBranding(
    organizationId,
    without(old, derived ? ['logoUrl', 'logoLightUrl', ...ICON_KEYS, 'iconSource'] : ['logoUrl', 'logoLightUrl']),
  )
}

/** `.../arquivos/<uuid>` → id do arquivo. */
function fileIdOf(url: string | undefined): string | null {
  return url?.match(/\/api\/v1\/public\/arquivos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i)?.[1] ?? null
}

/**
 * Volta os ícones ao automático: regenera a partir do logo atual (o arquivo
 * `logo` já processado do próprio clube). Sem logo, remove os ícones.
 */
export async function removeOrganizationIcon(input: BrandActor & { organizationId: string }): Promise<TenantBranding> {
  const { organizationId, uploadedBy } = input
  const old = await loadBranding(organizationId)
  const fileId = fileIdOf(old.logoUrl)
  const logoFile = fileId ? await findFile(fileId) : null
  const usable =
    logoFile && !logoFile.deletedAt && logoFile.purpose === 'brand_logo' && logoFile.organizationId === organizationId
  if (!usable) return saveBranding(organizationId, without(old, [...ICON_KEYS, 'iconSource']))

  let icons: IconVariants
  try {
    icons = await deriveIconsFromLogo(await readFileContent(logoFile))
  } catch (error) {
    logger.warn({ err: error, organizationId }, 'Não foi possível regenerar os ícones a partir do logo')
    throw imageError('Não foi possível gerar os ícones a partir do logo atual. Envie o logo novamente.')
  }
  const urls = await storeVariants(organizationId, uploadedBy, iconFiles(icons))
  return saveBranding(organizationId, { ...old, ...urls, iconSource: 'auto' })
}

/** Só as cores (merge): logo e ícones ficam como estão. */
export async function updateOrganizationBrandColors(
  organizationId: string,
  colors: { primaryColor: string; secondaryColor: string },
): Promise<TenantBranding> {
  const old = await loadBranding(organizationId)
  return saveBranding(organizationId, { ...old, primaryColor: colors.primaryColor, secondaryColor: colors.secondaryColor })
}
