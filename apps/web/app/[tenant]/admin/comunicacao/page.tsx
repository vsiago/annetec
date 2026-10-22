import { redirect } from 'next/navigation'

/**
 * A antiga tela de Comunicação (campanhas, disparos e réguas) era uma maquete
 * sem envio de verdade. O contato real com o associado acontece pelo
 * Atendimento, com thread de mensagens gravada na API — o endereço antigo leva
 * para lá.
 */
export default async function AdminComunicacaoRedirect({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  redirect(`/${encodeURIComponent(tenant)}/admin/atendimento`)
}
