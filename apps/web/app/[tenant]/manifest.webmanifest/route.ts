import { getTenantPublicAction } from '@/lib/actions/tenant-public-api'

/**
 * Manifest do aplicativo instalável de cada clube: `/<slug>/manifest.webmanifest`.
 *
 * Nome, cor do tema e ícones vêm da marca do clube — quem "adiciona à tela
 * inicial" instala o app do CLUBE, nunca o da plataforma. O `scope` fica preso
 * ao endereço do clube para o app não "engolir" o resto do domínio. Referenciado
 * por `metadata.manifest` em `layout.tsx`.
 *
 * Sem cache de borda: o clube pode trocar logo/ícone/cores a qualquer momento e
 * o manifest tem que refletir na hora (a resposta é leve; o navegador revalida).
 */

/** Ícone de reserva do clube sem logo: neutro, sem marca nenhuma. */
const NEUTRAL_ICON = '/icon-neutral.svg'

export async function GET(_request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params
  const result = await getTenantPublicAction(slug)
  if (!result.success) {
    return new Response('Clube não encontrado.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  const { name } = result.data
  const branding = result.data.branding ?? {}
  const icons: { src: string; sizes: string; type?: string; purpose: string }[] = []
  if (branding.iconSmallUrl) icons.push({ src: branding.iconSmallUrl, sizes: '192x192', type: 'image/png', purpose: 'any' })
  if (branding.iconUrl) icons.push({ src: branding.iconUrl, sizes: '512x512', type: 'image/png', purpose: 'any' })
  if (icons.length === 0) icons.push({ src: NEUTRAL_ICON, sizes: 'any', type: 'image/svg+xml', purpose: 'any' })

  const manifest = {
    name,
    short_name: name.length > 12 ? name.slice(0, 12).trimEnd() : name,
    description: `Portal de benefícios ${name}`,
    id: `/${slug}`,
    start_url: `/${slug}`,
    scope: `/${slug}/`,
    display: 'standalone',
    lang: 'pt-BR',
    ...(branding.primaryColor ? { theme_color: branding.primaryColor } : {}),
    background_color: '#ffffff',
    icons,
  }

  return new Response(JSON.stringify(manifest), {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  })
}
