'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { TenantBranding } from '@annetec/contracts'
import { BrandColorField, HEX_COLOR } from '@/components/branding/brand-colors-fields'
import { BrandImageUploader } from '@/components/branding/brand-image-uploader'
import { clubBrandUrl, deleteBrandFile, uploadBrandFile } from '@/components/branding/brand-upload'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTenant } from '@/contexts/tenant-context'
import { updateTenantBrandColorsAction } from '@/lib/actions/tenant-branding-api'
import { readableTextColor } from '@/lib/theme'

/**
 * "Identidade visual" do painel do clube: logo, ícone e cores, editáveis pelo
 * próprio administrador. Logo e ícone vão direto para a API ao serem
 * escolhidos (`/api/clube/<slug>/marca/…`); as cores só são gravadas em
 * "Salvar cores". Depois de qualquer mudança o clube é relido (menu, tema) e a
 * metadata do servidor (favicon, manifest) é renovada com `router.refresh()`.
 */
export function BrandIdentityCard() {
  const { tenant, refresh } = useTenant()
  const router = useRouter()
  const [branding, setBranding] = useState<TenantBranding | null>(tenant?.branding ?? null)
  const [primary, setPrimary] = useState(tenant?.branding.primaryColor ?? '')
  const [secondary, setSecondary] = useState(tenant?.branding.secondaryColor ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mudou o clube (releitura do contexto): acompanha, sem apagar cor digitada e ainda não salva.
  const savedPrimary = tenant?.branding.primaryColor
  const savedSecondary = tenant?.branding.secondaryColor
  useEffect(() => {
    if (tenant) setBranding(tenant.branding)
  }, [tenant])
  useEffect(() => {
    if (savedPrimary) setPrimary(savedPrimary)
    if (savedSecondary) setSecondary(savedSecondary)
  }, [savedPrimary, savedSecondary])

  if (!tenant || !branding) return null
  const slug = tenant.slug

  const dirty = primary !== branding.primaryColor || secondary !== branding.secondaryColor
  const valid = HEX_COLOR.test(primary) && HEX_COLOR.test(secondary)

  async function afterBrandingChange(next: TenantBranding) {
    // Cores digitadas e não salvas ficam: só logo/ícones vêm do que a API devolveu.
    setBranding(current => ({ ...next, primaryColor: current?.primaryColor ?? next.primaryColor, secondaryColor: current?.secondaryColor ?? next.secondaryColor }))
    await refresh()
    router.refresh()
  }

  async function saveColors() {
    if (!valid || !dirty || !tenant) return
    setError(null)
    setSaving(true)
    const result = await updateTenantBrandColorsAction(slug, { primaryColor: primary, secondaryColor: secondary })
    setSaving(false)
    if (!result.success) {
      setError(result.error)
      toast.error('Não foi possível salvar as cores', { description: result.error })
      return
    }
    setBranding(result.data.branding)
    toast.success('Cores salvas', { description: 'O site e os portais já usam as novas cores.' })
    await refresh()
    router.refresh()
  }

  const previewLogo = branding.logoLightUrl ?? branding.logoUrl
  const headerColor = HEX_COLOR.test(secondary) ? secondary : '#1e2a4a'
  const buttonColor = HEX_COLOR.test(primary) ? primary : '#e84364'

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Identidade visual</CardTitle>
        <p className="text-xs text-muted-foreground">
          Logo, ícone e cores aplicados no site do clube, nos portais, na carteirinha e no app instalado no celular.
        </p>
      </CardHeader>
      <CardContent className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-8">
          <BrandImageUploader
            kind="logo"
            branding={branding}
            primaryColor={primary}
            clubName={tenant.name}
            upload={(file, onProgress) => uploadBrandFile(clubBrandUrl(slug, 'logo'), file, onProgress)}
            remove={() => deleteBrandFile(clubBrandUrl(slug, 'logo'))}
            onBranding={next => void afterBrandingChange(next)}
            onUseColors={colors => {
              if (colors[0]) setPrimary(colors[0])
              if (colors[1]) setSecondary(colors[1])
            }}
          />
          <BrandImageUploader
            kind="icon"
            branding={branding}
            primaryColor={primary}
            clubName={tenant.name}
            upload={(file, onProgress) => uploadBrandFile(clubBrandUrl(slug, 'icon'), file, onProgress)}
            remove={() => deleteBrandFile(clubBrandUrl(slug, 'icon'))}
            onBranding={next => void afterBrandingChange(next)}
          />
        </div>

        <div className="space-y-4">
          <p className="text-sm font-medium text-foreground">Cores</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <BrandColorField label="Cor principal" value={primary} onChange={setPrimary} disabled={saving} />
            <BrandColorField label="Cor secundária" value={secondary} onChange={setSecondary} disabled={saving} />
          </div>
          <p className="text-xs text-muted-foreground">A principal vai nos botões e destaques; a secundária, no cabeçalho e nos títulos.</p>

          <div className="overflow-hidden rounded-xl border" aria-hidden>
            <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ background: headerColor }}>
              {previewLogo ? (
                <span className="flex h-8 items-center rounded-md bg-white/95 px-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewLogo} alt="" className="max-h-6 max-w-28 object-contain" />
                </span>
              ) : (
                <span className="truncate text-sm font-bold" style={{ color: readableTextColor(headerColor) }}>
                  {tenant.name}
                </span>
              )}
              <span
                className="rounded-md px-3 py-1.5 text-xs font-semibold"
                style={{ background: buttonColor, color: readableTextColor(buttonColor) }}
              >
                Entrar
              </span>
            </div>
            <div className="bg-muted/30 px-4 py-4">
              <p className="text-sm font-semibold" style={{ color: headerColor }}>
                Saúde e benefícios para quem faz parte
              </p>
              <span
                className="mt-2 inline-block rounded-md px-3 py-1.5 text-xs font-semibold"
                style={{ background: buttonColor, color: readableTextColor(buttonColor) }}
              >
                Assinar um plano
              </span>
            </div>
          </div>

          {error ? (
            <p className="text-[13px] text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="button" onClick={() => void saveColors()} disabled={!dirty || !valid || saving} className="gap-2">
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
            {saving ? 'Salvando…' : 'Salvar cores'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
