import { redirect } from 'next/navigation'

/**
 * A antiga tela Financeiro montava receita, despesas e DRE a partir de
 * proporções fixas (despesa = 18% da receita, inadimplência = 11,4%...). Não
 * há lançamento de despesa no sistema; o que existe de real — cobranças,
 * recebimentos, inadimplência e previsão — está em Faturamento.
 */
export default async function AdminFinanceiroRedirect({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  redirect(`/${encodeURIComponent(tenant)}/admin/faturamento`)
}
