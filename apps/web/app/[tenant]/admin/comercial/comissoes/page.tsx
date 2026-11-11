import { ComissoesPage } from '@/components/vendas-rede/gestao'

export default async function ComercialComissoesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  return <ComissoesPage escopo={{ kind: 'tenant', slug: tenant }} />
}
