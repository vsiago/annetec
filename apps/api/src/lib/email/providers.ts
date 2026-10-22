/**
 * Envio real por `fetch` (sem SDK): Resend e SendGrid. Nunca loga corpo,
 * destinatário nem chave. Devolve o id da mensagem no provedor ou lança com
 * uma frase curta (o chamador grava em `platform_email_outbox.error`).
 */

export interface OutgoingEmail {
  from: string
  to: { email: string; name?: string | null }
  subject: string
  text: string
  html: string
}

/** `"ANNETEC <nao-responda@annetec.com.br>"` → `{ name, email }`. */
export function parseAddress(value: string): { email: string; name: string | null } {
  const match = /^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/.exec(value)
  if (match) return { name: match[1]?.replace(/^"|"$/g, '') || null, email: match[2]!.trim() }
  return { name: null, email: value.trim() }
}

function recipient(to: OutgoingEmail['to']): string {
  return to.name ? `${to.name.replace(/[<>"]/g, '')} <${to.email}>` : to.email
}

export async function sendViaResend(apiKey: string, email: OutgoingEmail): Promise<string | null> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: email.from,
      to: [recipient(email.to)],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Resend recusou o envio (HTTP ${response.status})`)
  const body = (await response.json().catch(() => null)) as { id?: string } | null
  return body?.id ?? null
}

export async function sendViaSendGrid(apiKey: string, email: OutgoingEmail): Promise<string | null> {
  const from = parseAddress(email.from)
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: email.to.email, ...(email.to.name ? { name: email.to.name } : {}) }] }],
      from: { email: from.email, ...(from.name ? { name: from.name } : {}) },
      subject: email.subject,
      content: [
        { type: 'text/plain', value: email.text },
        { type: 'text/html', value: email.html },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`SendGrid recusou o envio (HTTP ${response.status})`)
  return response.headers.get('x-message-id')
}
