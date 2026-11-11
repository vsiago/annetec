import { redirect } from 'next/navigation'

/** Rota antiga: a tela agora é da Rede Comercial. */
export default function Redirecionar() {
  redirect('/admin/comercial/comissoes')
}
