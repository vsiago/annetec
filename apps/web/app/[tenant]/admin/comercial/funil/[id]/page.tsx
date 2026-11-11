import { FunilClube } from '@/components/admin/comercial/funil-clube'

/** O mesmo Funil, já com o detalhe do lead aberto. */
export default async function ComercialLeadPage({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params
  return <FunilClube slug={tenant} leadIdInicial={id} />
}
