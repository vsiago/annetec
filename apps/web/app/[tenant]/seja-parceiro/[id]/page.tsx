import type { Metadata } from 'next'
import { TenantOnboardingPage } from '@/components/seja-parceiro/tenant-pages'

/** Página privada (link com chave): fora dos buscadores. */
export const metadata: Metadata = {
  title: 'Seja um parceiro comercial',
  robots: { index: false, follow: false },
}

export default async function TenantCandidaturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TenantOnboardingPage id={id} />
}
