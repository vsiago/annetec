import { EquipePage } from '@/components/vendas-rede/gestao'

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  return <EquipePage escopo={{ kind: 'tenant', slug: tenant }} />
}
