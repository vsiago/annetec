import { redirect } from 'next/navigation'

/**
 * A antiga tela de Cobrança era uma maquete de boletos "gerados em lote".
 * A cobrança agora é automática e mora em Faturamento — o endereço antigo
 * continua funcionando para links salvos e favoritos.
 */
export default async function AdminCobrancaRedirect({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  redirect(`/${encodeURIComponent(tenant)}/admin/faturamento`)
}
