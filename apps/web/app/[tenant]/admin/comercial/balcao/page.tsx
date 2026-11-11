import { BalcaoClube } from '@/components/admin/comercial/balcao-clube'

export default async function ComercialBalcaoPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  return <BalcaoClube slug={tenant} />
}
