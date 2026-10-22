/**
 * Regra ÚNICA do "modo demonstração" na web: vem sempre de um DTO da API
 * (gateway do clube/fatura, sandbox, simular pagamento, ferramentas de demo
 * da plataforma) — nunca do ambiente do build do Next. Fora dela,
 * nenhum atalho de teste, cartão de teste ou texto "demonstração" aparece.
 */
export interface DemoModeContext {
  gateway?: string | null
  sandbox?: boolean | null
  canSimulatePayment?: boolean | null
  demoToolsEnabled?: boolean | null
}

export function isDemoMode(ctx: DemoModeContext | null | undefined): boolean {
  if (!ctx) return false
  return ctx.gateway === 'simulated' || ctx.sandbox === true || ctx.canSimulatePayment === true || ctx.demoToolsEnabled === true
}
