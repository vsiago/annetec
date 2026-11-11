import { ResultadosPage } from '@/components/vendas-rede/gestao'

export default async function ComercialResultadosPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  return <ResultadosPage escopo={{ kind: 'tenant', slug: tenant }} />
}
