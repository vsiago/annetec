import { redirect } from 'next/navigation'

/** Rota antiga: as comissões ficam na Rede Comercial. */
export default function Redirecionar() {
  redirect('/admin/comercial/comissoes')
}
