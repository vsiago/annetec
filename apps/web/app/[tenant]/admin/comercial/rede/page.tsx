import { RedePage } from '@/components/vendas-rede/gestao'

export default async function ComercialRedePage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  return <RedePage escopo={{ kind: 'tenant', slug: tenant }} />
}
