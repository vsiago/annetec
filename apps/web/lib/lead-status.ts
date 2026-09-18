import type { LeadStatus } from './types'

/**
 * Rótulo e cor de cada etapa do funil, nos termos que a administradora usa
 * na tela — "Convertido", não "Fechado". Fica fora dos componentes porque a
 * lista de Leads, o painel do vendedor e os relatórios precisam pintar o
 * mesmo status da mesma cor.
 */
export const leadStatusMeta: Record<LeadStatus, { label: string; className: string }> = {
  new: { label: 'Novo', className: 'bg-sky-50 text-sky-700' },
  contacted: { label: 'Em contato', className: 'bg-amber-50 text-amber-700' },
  qualified: { label: 'Qualificado', className: 'bg-violet-50 text-violet-700' },
  proposal: { label: 'Proposta', className: 'bg-indigo-50 text-indigo-700' },
  negotiation: { label: 'Em negociação', className: 'bg-primary/10 text-primary' },
  closed: { label: 'Convertido', className: 'bg-emerald-50 text-emerald-700' },
  lost: { label: 'Desqualificado', className: 'bg-slate-100 text-slate-600' },
}

/** Etapas em que o lead segue vivo, mas ainda não virou contrato. */
export const FOLLOW_UP_STATUSES: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal']
