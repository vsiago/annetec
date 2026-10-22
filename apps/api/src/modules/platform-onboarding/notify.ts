import { EMAIL_TEMPLATE_LABELS, type EmailTemplate } from '@annetec/contracts'
import { db } from '@/db/client'
import { sendEmail } from '@/lib/email'
import { logger } from '@/lib/logger'
import { onboardingTrackingUrl } from './access-key'
import { insertEvent, type ProposalRow } from './repository'

/**
 * E-mails da contratação para o candidato (dados comuns já preenchidos) +
 * evento interno `EMAIL_SENT`. Nunca lança: e-mail não derruba a operação.
 */
export async function notifyApplicant(
  proposal: Pick<ProposalRow, 'id' | 'code' | 'applicant' | 'legalName' | 'company'>,
  template: EmailTemplate,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    const result = await sendEmail({
      template,
      to: { email: proposal.applicant.email, name: proposal.applicant.name },
      data: {
        applicantName: proposal.applicant.name,
        code: proposal.code,
        legalName: proposal.legalName ?? proposal.company?.legalName ?? null,
        trackingUrl: onboardingTrackingUrl(proposal.id),
        ...extra,
      },
      proposalId: proposal.id,
      relatedType: 'proposal',
      relatedId: proposal.id,
    })
    await insertEvent(db, {
      proposalId: proposal.id,
      type: 'EMAIL_SENT',
      visibility: 'internal',
      message: `E-mail "${EMAIL_TEMPLATE_LABELS[template]}" para ${proposal.applicant.email} (${result.status})`,
      data: { template, emailId: result.id, status: result.status },
    })
  } catch (error) {
    logger.warn({ proposalId: proposal.id, template, err: error }, 'Falha ao registrar e-mail da proposta')
  }
}
