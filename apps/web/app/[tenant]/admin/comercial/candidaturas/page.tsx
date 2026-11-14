import { CandidaturasPage } from '@/components/vendas-rede/gestao'

export default async function ComercialCandidaturasPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  return <CandidaturasPage escopo={{ kind: 'tenant', slug: tenant }} />
}
