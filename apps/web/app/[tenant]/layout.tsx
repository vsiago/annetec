import type { Metadata, Viewport } from 'next'
import { getTenantPublicAction } from '@/lib/actions/tenant-public-api'
import TenantLayoutClient from './tenant-layout-client'

/**
 * Casca server do inquilino. Existe só para sobrescrever a metadata global
 * (app/layout.tsx), que é da marca da plataforma: título, descrição,
 * Open Graph, autor e favicon. Depois de publicado, nada em `/[tenant]/*`
 * pode carregar essa marca — nem na aba, nem no preview de link.
 *
 * O resto (tema, sessão, dados) continua no layout client.
 */

/** Favicon de reserva para inquilino sem logo: neutro, sem marca nenhuma. */
const NEUTRAL_ICON = '/icon-neutral.svg'

type Params = Promise<{ tenant: string }>

/** Cor da barra do navegador no celular: a cor principal do clube. */
export async function generateViewport({ params }: { params: Params }): Promise<Viewport> {
  const { tenant: slug } = await params
  const result = await getTenantPublicAction(slug)
  return result.success ? { themeColor: result.data.branding.primaryColor } : {}
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenant: slug } = await params
  const result = await getTenantPublicAction(slug)

  if (!result.success) {
    // Inquilino inexistente ou API fora: metadata neutra. Ainda precisa
    // sobrescrever tudo o que a raiz define, senão a marca vaza por herança.
    return {
      title: 'Clube de benefícios',
      description: 'Portal de benefícios',
      authors: null,
      openGraph: { title: 'Clube de benefícios', images: [] },
      icons: { icon: NEUTRAL_ICON, apple: NEUTRAL_ICON },
    }
  }

  const tenant = result.data
  const branding = tenant.branding
  // Aba do navegador: favicon 48 px; sem ele, os ícones maiores; por último a logo.
  const favicon = branding?.faviconUrl ?? branding?.iconSmallUrl ?? branding?.iconUrl ?? branding?.logoUrl ?? NEUTRAL_ICON
  // iOS "adicionar à tela inicial": ícone 180 px OPACO (o transparente vira fundo preto).
  const appleIcon = branding?.appleTouchIconUrl ?? branding?.iconUrl ?? branding?.logoUrl ?? NEUTRAL_ICON
  const description = `Portal de benefícios ${tenant.name}`

  return {
    title: { default: tenant.name, template: `%s · ${tenant.name}` },
    description,
    authors: null,
    openGraph: {
      title: tenant.name,
      description,
      siteName: tenant.name,
      type: 'website',
      locale: 'pt_BR',
      // `images` explícito impede que o opengraph-image da raiz (logo da
      // plataforma) seja herdado no preview de link do inquilino.
      images: tenant.branding?.logoUrl ? [tenant.branding.logoUrl] : [],
    },
    icons: { icon: favicon, apple: appleIcon },
    // App instalável do clube (nome, cor e ícones da marca) — ver manifest.webmanifest/route.ts.
    manifest: `/${slug}/manifest.webmanifest`,
  }
}

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return <TenantLayoutClient>{children}</TenantLayoutClient>
}
