import { redirect } from 'next/navigation'

/**
 * A antiga "Holding" deixou de ser uma tela à parte: receita, atraso e saúde
 * dos clubes estão no Início, e a lista de clubes está em Clubes. A rota
 * continua existindo só para os links e favoritos antigos não quebrarem.
 * O Histórico de alterações segue em `/admin/holding/auditoria`.
 */
export default function HoldingPage() {
  redirect('/admin')
}
