import { redirect } from 'next/navigation'
import { approvalsRedirectTarget } from '@/lib/approvals-redirect'

/**
 * Descontos pedidos pelos vendedores mudaram para Aprovações › Descontos de
 * vendedores (`/admin/compliance?tipo=descontos`). Links antigos (favoritos,
 * notificações gravadas antes da mudança) chegam aqui e seguem com os mesmos
 * parâmetros — `?pedido=<id>` abre o pedido, `?proposta=<id>` o pedido
 * aguardando daquela proposta.
 */
export default async function DescontosRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  redirect(approvalsRedirectTarget('/admin/comercial/descontos', await searchParams))
}
