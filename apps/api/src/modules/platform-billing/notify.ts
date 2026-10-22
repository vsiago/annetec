import type { EmailTemplate } from '@annetec/contracts'
import { logger } from '@/lib/logger'

/**
 * E-mails da cobrança da plataforma. Tudo passa pelo `sendEmail` do Q1
 * (`lib/email`, grava na caixa de saída), carregado com `await import()` para
 * não criar ciclo de import. Nunca lança: e-mail que falha só vai para o log.
 */

export interface PlatformEmail {
  template: EmailTemplate
  to: { email: string; name?: string | null }
  data: BillingEmailData | Record<string, unknown>
  organizationId?: string | null
  proposalId?: string | null
  relatedType?: string
  relatedId?: string
}

/** Dados dos templates de cobrança (blueprint §0.10). */
export interface BillingEmailData {
  tenantName: string
  description: string
  /** Reais (número). */
  amount: number
  /** `yyyy-MM-dd`. */
  dueDate: string
  payUrl: string
  daysLate?: number
  restrictsOn?: string | null
  suspendsOn?: string | null
  reason?: string | null
  [key: string]: unknown
}

export async function sendPlatformEmail(email: PlatformEmail): Promise<void> {
  if (!email.to.email) return
  try {
    const { sendEmail } = await import('@/lib/email')
    await sendEmail({
      template: email.template,
      to: { email: email.to.email, name: email.to.name ?? null },
      data: email.data as Record<string, unknown>,
      organizationId: email.organizationId ?? null,
      proposalId: email.proposalId ?? null,
      relatedType: email.relatedType,
      relatedId: email.relatedId,
    })
  } catch (error) {
    logger.warn(
      { template: email.template, err: error instanceof Error ? error.message : String(error) },
      'Falha ao enviar e-mail da cobrança da plataforma',
    )
  }
}

/** Dispara vários e-mails em sequência (fora de transação). */
export async function sendPlatformEmails(emails: PlatformEmail[]): Promise<void> {
  for (const email of emails) await sendPlatformEmail(email)
}
