import { redirect } from 'next/navigation'
import { approvalsRedirectTarget } from '@/lib/approvals-redirect'

/**
 * Contas gerenciadas mudaram para Aprovações › Contas gerenciadas
 * (`/admin/compliance?tipo=contas-gerenciadas`). Links antigos (favoritos,
 * notificações gravadas antes da mudança) chegam aqui e seguem com os mesmos
 * parâmetros — `?clube=<orgId>` abre a gaveta do clube.
 */
export default async function ContasGerenciadasRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  redirect(approvalsRedirectTarget('/admin/financeiro/contas-gerenciadas', await searchParams))
}
