import { redirect } from 'next/navigation'

/** Rota antiga: o lead abre no Funil da Rede Comercial. */
export default async function Redirecionar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/admin/comercial/funil/${encodeURIComponent(id)}`)
}
