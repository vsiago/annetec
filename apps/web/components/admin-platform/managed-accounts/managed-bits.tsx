import type { ManagedAccountGeneralStatus, ManagedAccountRequestStatus, ManagedAutoDebitStatus } from '@annetec/contracts'
import { StatusPill, type StatusPillTone } from '@/components/admin-platform/ui/status-pill'

export const REQUEST_TONE: Record<ManagedAccountRequestStatus, StatusPillTone> = {
  pendente: 'warning',
  aprovando: 'info',
  aprovado: 'success',
  recusado: 'danger',
  falhou: 'danger',
}

export const GENERAL_TONE: Record<ManagedAccountGeneralStatus, StatusPillTone> = {
  aprovada: 'success',
  em_analise: 'info',
  pendente: 'warning',
  recusada: 'danger',
  desconhecida: 'neutral',
}

export const DEBIT_TONE: Record<ManagedAutoDebitStatus, StatusPillTone> = {
  concluida: 'success',
  em_andamento: 'info',
  falhou: 'danger',
}

export function Pill({ tone, children }: { tone: StatusPillTone; children: string }) {
  return <StatusPill tone={tone}>{children}</StatusPill>
}
