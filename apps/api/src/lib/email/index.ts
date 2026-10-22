import type { EmailProvider, EmailStatus, EmailTemplate } from '@annetec/contracts'
import { eq } from 'drizzle-orm'
import { env, isProduction } from '@/config/env'
import { db } from '@/db/client'
import { platformEmailOutbox } from '@/db/schema'
import { logger } from '@/lib/logger'
import { parseAddress, sendViaResend, sendViaSendGrid } from './providers'
import { maskSecrets, sealSecrets } from './secrets'
import { renderEmail } from './templates'

/**
 * E-mail transacional da plataforma (blueprint da plataforma §0.7/§0.10).
 *
 * TODO envio nasce em `platform_email_outbox`. Com `EMAIL_PROVIDER=outbox`
 * (padrão, demo) ele só fica gravado com status `simulated` e aparece no
 * console (`/admin/emails`). Com Resend/SendGrid é gravado `queued`, enviado
 * por `fetch` e atualizado para `sent`/`failed`. Fora de produção, provedor
 * sem chave cai no `outbox` (aviso 1×); em PRODUÇÃO não há rebaixamento
 * silencioso — `outbox` ou provedor sem chave é erro (o boot já recusa; aqui
 * o envio vira `failed` com log de erro).
 *
 * `secrets` (senha provisória): nunca ficam em claro no banco — ver `secrets.ts`.
 */
export interface SendEmailInput {
  template: EmailTemplate
  to: { email: string; name?: string | null }
  data: Record<string, unknown>
  organizationId?: string | null
  proposalId?: string | null
  relatedType?: string
  relatedId?: string
  secrets?: string[]
  /**
   * Nome de exibição do remetente (white label): vira `"<fromName>" <endereço
   * de EMAIL_FROM>` — o ENDEREÇO continua sendo o de `EMAIL_FROM`.
   */
  fromName?: string
}

/** Endereço (sem nome) de `EMAIL_FROM`. */
export function emailFromAddress(): string {
  return parseAddress(env.EMAIL_FROM).email
}

/**
 * Remetente efetivo, em ordem:
 *  1. `from` devolvido pelo render (e-mails do clube ao associado já vêm com
 *     `"<Clube>" <endereço>` — ver `RenderedEmail.from` em `templates.ts`);
 *  2. `fromName` do chamador + endereço de `EMAIL_FROM`;
 *  3. `EMAIL_FROM` como está.
 */
export function resolveEmailFrom(renderedFrom: string | undefined, fromName: string | undefined): string {
  if (renderedFrom?.trim()) return renderedFrom.trim()
  const name = fromName?.replace(/[<>"\r\n]/g, '').trim()
  if (name) return `"${name}" <${emailFromAddress()}>`
  return env.EMAIL_FROM
}

let warnedMissingKey = false

/**
 * Provedor efetivo: `EMAIL_PROVIDER`, ou `outbox` se faltar a chave (só fora
 * de produção — em produção lança em vez de rebaixar).
 */
export function effectiveEmailProvider(): { provider: EmailProvider; apiKey: string | null } {
  const wanted = env.EMAIL_PROVIDER
  if (wanted === 'resend' && env.RESEND_API_KEY) return { provider: 'resend', apiKey: env.RESEND_API_KEY }
  if (wanted === 'sendgrid' && env.SENDGRID_API_KEY) return { provider: 'sendgrid', apiKey: env.SENDGRID_API_KEY }
  if (isProduction) {
    throw new Error(
      wanted === 'outbox'
        ? 'EMAIL_PROVIDER=outbox não é permitido em produção'
        : `EMAIL_PROVIDER=${wanted} sem chave em produção`,
    )
  }
  if (wanted !== 'outbox' && !warnedMissingKey) {
    warnedMissingKey = true
    logger.warn({ emailProvider: wanted }, `EMAIL_PROVIDER=${wanted} sem chave: e-mails ficam só na caixa de saída`)
  }
  return { provider: 'outbox', apiKey: null }
}

function shortError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 300)
}

/** Grava na caixa de saída e envia (se houver provedor). NUNCA lança. */
export async function sendEmail(input: SendEmailInput): Promise<{ id: string | null; status: EmailStatus }> {
  try {
    const toEmail = input.to.email.trim().toLowerCase()
    const secrets = (input.secrets ?? []).filter(Boolean)
    const rendered = renderEmail(input.template, input.data)
    const { provider, apiKey } = effectiveEmailProvider()
    const store = (body: string) => (provider === 'outbox' ? sealSecrets(body, secrets) : maskSecrets(body, secrets))
    const now = new Date()

    const [row] = await db
      .insert(platformEmailOutbox)
      .values({
        template: input.template,
        toEmail,
        toName: input.to.name?.trim() || null,
        subject: maskSecrets(rendered.subject, secrets),
        bodyText: store(rendered.text),
        bodyHtml: store(rendered.html),
        provider,
        status: provider === 'outbox' ? 'simulated' : 'queued',
        organizationId: input.organizationId ?? null,
        proposalId: input.proposalId ?? null,
        relatedType: input.relatedType ?? null,
        relatedId: input.relatedId ?? null,
        sentAt: provider === 'outbox' ? now : null,
      })
      .returning({ id: platformEmailOutbox.id })
    const id = row?.id ?? null

    if (provider === 'outbox' || !apiKey || !id) {
      logger.info({ emailId: id, template: input.template, provider }, 'E-mail gravado na caixa de saída')
      return { id, status: provider === 'outbox' ? 'simulated' : 'failed' }
    }

    // `from` explícito: o do render (clube) vence; senão `fromName` + endereço
    // de EMAIL_FROM; senão EMAIL_FROM. Montado DEPOIS do spread de propósito
    // (antes, `{ from: EMAIL_FROM, ...rendered }` dependia da ordem do spread).
    const outgoing = {
      ...rendered,
      from: resolveEmailFrom(rendered.from, input.fromName),
      to: { email: toEmail, name: input.to.name },
    }
    try {
      const messageId = provider === 'resend' ? await sendViaResend(apiKey, outgoing) : await sendViaSendGrid(apiKey, outgoing)
      await db
        .update(platformEmailOutbox)
        .set({ status: 'sent', providerMessageId: messageId, sentAt: new Date() })
        .where(eq(platformEmailOutbox.id, id))
      logger.info({ emailId: id, template: input.template, provider }, 'E-mail enviado')
      return { id, status: 'sent' }
    } catch (error) {
      const message = shortError(error)
      await db
        .update(platformEmailOutbox)
        .set({ status: 'failed', error: message })
        .where(eq(platformEmailOutbox.id, id))
        .catch(() => {})
      logger.warn({ emailId: id, template: input.template, provider, error: message }, 'Falha no envio de e-mail')
      return { id, status: 'failed' }
    }
  } catch (error) {
    logger.error({ template: input.template, err: error }, 'Falha ao gravar e-mail na caixa de saída')
    return { id: null, status: 'failed' }
  }
}
