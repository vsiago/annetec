import { RegrasPage } from '@/components/vendas-rede/gestao'

export default async function ComercialRegrasPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  return <RegrasPage escopo={{ kind: 'tenant', slug: tenant }} />
}
