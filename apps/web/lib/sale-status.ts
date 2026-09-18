import type { Sale } from './types'

/**
 * Rótulo e cor de cada situação da venda, nos termos da tela. Compartilhado
 * entre o painel e a lista de Vendas para o mesmo status nunca aparecer com
 * duas cores diferentes.
 */
export const saleStatusMeta: Record<Sale['status'], { label: string; className: string }> = {
  confirmed: { label: 'Finalizada', className: 'bg-emerald-50 text-emerald-700' },
  pending: { label: 'Em andamento', className: 'bg-amber-50 text-amber-700' },
  cancelled: { label: 'Cancelada', className: 'bg-red-50 text-red-600' },
}
