import { FunilClube } from '@/components/admin/comercial/funil-clube'

export default async function ComercialFunilPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  return <FunilClube slug={tenant} />
}
