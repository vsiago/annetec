import { redirect } from 'next/navigation'

/**
 * O detalhe de um clube na holding virou a tela do próprio clube
 * (`/admin/inquilinos/<id>`): `orgId` é o id da organização, o mesmo `id` do
 * clube usado lá. A rota fica só para os links antigos não quebrarem.
 */
export default async function HoldingTenantPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  redirect(`/admin/inquilinos/${encodeURIComponent(orgId)}`)
}
