import { redirect } from 'next/navigation'

/** Rota antiga do vendedor: a área agora é a Rede Comercial em `/<clube>/vendas`. */
export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  redirect(`/${tenant}/vendas/carteira`)
}
