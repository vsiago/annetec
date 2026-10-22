import { redirect } from 'next/navigation'

/**
 * "Clínicas e Elegibilidade" era uma maquete com clínicas inventadas e
 * duplicava a Rede de Parceiros, que já lista a rede credenciada real do clube
 * (clínicas inclusive, na categoria "Clínica"). O endereço antigo continua
 * funcionando para links salvos e favoritos.
 */
export default async function AdminClinicasRedirect({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  redirect(`/${encodeURIComponent(tenant)}/admin/parceiros`)
}
