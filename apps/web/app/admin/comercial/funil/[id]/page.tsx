import { FunilConsole } from '@/components/admin-platform/comercial/funil-console'

/** O mesmo Funil, já com o detalhe do lead aberto. */
export default async function ComercialLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <FunilConsole leadIdInicial={id} />
}
