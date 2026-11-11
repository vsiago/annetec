import { redirect } from 'next/navigation'

/** Rota antiga: a tela agora é da Rede Comercial. */
export default async function Redirecionar({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  redirect(`/${tenant}/admin/comercial/funil`)
}
