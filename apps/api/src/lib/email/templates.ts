import { EMAIL_TEMPLATE_LABELS, formatBRL, type EmailTemplate } from '@annetec/contracts'

/**
 * Os 16 e-mails transacionais da plataforma, em pt-BR (blueprint da
 * plataforma §0.7). Puro: `data` chega solto (`Record<string, unknown>`) e
 * cada campo ausente vira um texto neutro — renderizar NUNCA lança.
 *
 * Dados esperados:
 *  - contratação: `{ applicantName, code, trackingUrl, legalName?, message?, items?, reason?, payUrl?, amount?, dueDate? }`;
 *  - boas-vindas: `{ adminName, clubName, siteUrl, loginUrl, adminEmail, password }` (senha em `secrets`);
 *  - cobrança da plataforma: `{ tenantName, description, amount, dueDate, payUrl, daysLate?, restrictsOn?, suspendsOn?, reason? }`.
 *
 * Mais os e-mails do CLUBE (white label, sem marca da plataforma) — ao
 * associado e à equipe do clube — ver `CLUB_EMAIL_TEMPLATES` no fim do arquivo.
 */

export interface RenderedEmail {
  subject: string
  text: string
  html: string
  /**
   * Remetente próprio — só nos e-mails do clube ao associado (`"<Clube> <endereço>"`).
   * `sendEmail` resolve o remetente com `resolveEmailFrom` (`lib/email/index.ts`):
   * este campo tem prioridade sobre `fromName` e sobre `EMAIL_FROM`. Ausente nos
   * e-mails da plataforma.
   */
  from?: string
}

interface Block {
  subject: string
  greeting?: string
  paragraphs: string[]
  /** Linhas "rótulo: valor" em destaque. */
  facts?: [string, string][]
  list?: string[]
  action?: { label: string; url: string }
  after?: string[]
  /** Rodapé próprio (só e-mails do clube que não são sobre a assinatura). */
  footer?: string
}

const FOOTER = 'ANNETEC — plataforma de clubes de benefícios. E-mail automático: não responda a esta mensagem.'

function str(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  return text === '' ? fallback : text
}

function firstName(value: unknown): string {
  return str(value).split(/\s+/)[0] ?? ''
}

function money(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const number = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  return Number.isFinite(number) ? formatBRL(number) : str(value)
}

/** `yyyy-MM-dd` → `dd/mm/aaaa`; instante ISO → data em São Paulo. */
export function dateBR(value: unknown): string {
  const text = str(value)
  if (!text) return ''
  const onlyDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (onlyDate) return `${onlyDate[3]}/${onlyDate[2]}/${onlyDate[1]}`
  const instant = new Date(text)
  if (Number.isNaN(instant.getTime())) return text
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(instant)
}

function items(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(item => (typeof item === 'string' ? item : str((item as { note?: unknown })?.note))).filter(Boolean)
}

function hello(name: unknown): string {
  const first = firstName(name)
  return first ? `Olá, ${first}!` : 'Olá!'
}

function build(template: EmailTemplate, d: Record<string, unknown>): Block {
  const code = str(d.code, 'da sua proposta')
  const tracking = str(d.trackingUrl)
  const trackingAction = tracking ? { label: 'Abrir a proposta', url: tracking } : undefined
  const tenant = str(d.tenantName, 'seu clube')
  const payUrl = str(d.payUrl)
  const payAction = payUrl ? { label: 'Ver e pagar a fatura', url: payUrl } : undefined
  const invoiceFacts = (): [string, string][] =>
    [
      ['Descrição', str(d.description)],
      ['Valor', money(d.amount)],
      ['Vencimento', dateBR(d.dueDate)],
    ].filter((pair): pair is [string, string] => pair[1] !== '')

  switch (template) {
    case 'onboarding_started':
      // Link montado por um vendedor ANNETEC: convite com o plano e o preço combinados.
      if (str(d.sellerName)) {
        return {
          subject: `Sua contratação da plataforma ANNETEC — protocolo ${code}`,
          greeting: hello(d.applicantName),
          paragraphs: [
            `${str(d.sellerName)}, da ANNETEC, preparou a sua contratação da plataforma${str(d.legalName) ? ` para ${str(d.legalName)}` : ''}. Protocolo: ${code}.`,
            'Continue pelo link abaixo: complete os dados, envie os documentos e aceite o contrato. Ele é a sua chave de acesso à proposta: guarde este e-mail e não compartilhe o link.',
          ],
          facts: (
            [
              ['Plano', str(d.planName)],
              ['Mensalidade', money(d.monthlyAmount)],
              ['Adesão', money(d.setupFee)],
              ['Condição especial', str(d.discountSummary)],
            ] as [string, string][]
          ).filter(pair => pair[1] !== ''),
          action: tracking ? { label: 'Continuar a contratação', url: tracking } : undefined,
          after: ['Dúvidas? Fale direto com quem te atendeu.'],
        }
      }
      return {
        subject: `Contratação ANNETEC iniciada — protocolo ${code}`,
        greeting: hello(d.applicantName),
        paragraphs: [
          `Recebemos o início da contratação da plataforma ANNETEC${str(d.legalName) ? ` para ${str(d.legalName)}` : ''}. Protocolo: ${code}.`,
          'Continue o preenchimento pelo link abaixo. Ele é a sua chave de acesso à proposta: guarde este e-mail e não compartilhe o link.',
        ],
        action: tracking ? { label: 'Continuar a contratação', url: tracking } : undefined,
        after: ['Etapas: plano, dados cadastrais, representantes, documentos, marca, contrato e pagamento. Dá para parar e voltar quando quiser.'],
      }
    case 'onboarding_access_recovered':
      return {
        subject: `Seu link de acompanhamento — protocolo ${code}`,
        greeting: hello(d.applicantName),
        paragraphs: [
          `Você pediu o link de acompanhamento da proposta ${code}. Use o botão abaixo para continuar de onde parou.`,
          'Se não foi você, ignore este e-mail: sem o link ninguém acessa a proposta.',
        ],
        action: trackingAction,
      }
    case 'onboarding_submitted':
      return {
        subject: `Proposta ${code} recebida para análise`,
        greeting: hello(d.applicantName),
        paragraphs: [
          `Recebemos a proposta ${code}${str(d.legalName) ? ` de ${str(d.legalName)}` : ''}. A análise cadastral começa em até 1 dia útil.`,
          'Se precisarmos de algum ajuste, avisamos por e-mail e a pendência aparece na página da proposta.',
        ],
        action: trackingAction ? { label: 'Acompanhar a análise', url: tracking } : undefined,
      }
    case 'onboarding_pending_info':
      return {
        subject: `Pendência na proposta ${code}`,
        greeting: hello(d.applicantName),
        paragraphs: [
          `Nossa equipe de compliance precisa de alguns ajustes na proposta ${code}.`,
          ...(str(d.message) ? [str(d.message)] : []),
        ],
        list: items(d.items),
        action: tracking ? { label: 'Corrigir e reenviar', url: tracking } : undefined,
        after: ['Depois de corrigir, reenvie a proposta pela mesma página.'],
      }
    case 'onboarding_approved':
      return {
        subject: `Proposta ${code} aprovada — pague a ativação`,
        greeting: hello(d.applicantName),
        paragraphs: [
          `Boa notícia: a proposta ${code}${str(d.legalName) ? ` de ${str(d.legalName)}` : ''} foi aprovada.`,
          'Para colocar o clube no ar, pague a cobrança de ativação (adesão + 1ª mensalidade). Assim que o pagamento for confirmado, o clube é criado automaticamente e o acesso do painel chega por e-mail.',
        ],
        facts: [
          ['Valor', money(d.amount)],
          ['Vencimento', dateBR(d.dueDate)],
        ].filter((pair): pair is [string, string] => pair[1] !== ''),
        action: payUrl ? { label: 'Pagar a ativação', url: payUrl } : trackingAction,
      }
    case 'onboarding_rejected':
      return {
        subject: `Proposta ${code} não aprovada`,
        greeting: hello(d.applicantName),
        paragraphs: [
          `Depois da análise cadastral, não foi possível aprovar a proposta ${code}.`,
          ...(str(d.reason) ? [`Motivo: ${str(d.reason)}`] : []),
          'Nenhum valor foi cobrado. Se quiser, responda pelos nossos canais comerciais para entender os próximos passos.',
        ],
        action: trackingAction,
      }
    case 'onboarding_canceled':
      return {
        subject: `Proposta ${code} cancelada`,
        greeting: hello(d.applicantName),
        paragraphs: [
          `A proposta ${code} foi cancelada.`,
          ...(str(d.reason) ? [`Motivo: ${str(d.reason)}`] : []),
          'Para contratar depois, basta iniciar uma nova proposta no site.',
        ],
      }
    case 'tenant_welcome':
      return {
        subject: `${str(d.clubName, 'Seu clube')} está no ar`,
        greeting: hello(d.adminName),
        paragraphs: [
          `O ${str(d.clubName, 'seu clube')} já está no ar${str(d.siteUrl) ? ` em ${str(d.siteUrl)}` : ''}.`,
          'Deixamos 3 planos-modelo em rascunho (inativos): revise preços e coberturas em Planos e ative os que for vender — só planos ativos aparecem na vitrine.',
          'Use o acesso abaixo para entrar no painel de gestão (aba Inquilino na tela de login). A senha é provisória: troque no primeiro acesso.',
        ],
        facts: [
          ['Painel', str(d.loginUrl)],
          ['E-mail', str(d.adminEmail)],
          ['Senha provisória', str(d.password)],
        ].filter((pair): pair is [string, string] => pair[1] !== ''),
        action: str(d.loginUrl) ? { label: 'Entrar no painel', url: str(d.loginUrl) } : undefined,
        after: ['No painel, a página "Minha assinatura ANNETEC" mostra o plano, o uso de vidas e as faturas.'],
      }
    case 'platform_invoice_created':
      return {
        subject: `Fatura ANNETEC ${money(d.amount)} — vence em ${dateBR(d.dueDate)}`.replace(/\s+—\s+vence em $/, ''),
        greeting: `Olá, equipe ${tenant}!`,
        paragraphs: ['A fatura da plataforma ANNETEC do próximo ciclo foi emitida.'],
        facts: invoiceFacts(),
        action: payAction,
      }
    case 'platform_invoice_reminder':
      return {
        subject: `Lembrete: fatura ANNETEC vence em ${dateBR(d.dueDate)}`,
        greeting: `Olá, equipe ${tenant}!`,
        paragraphs: ['Lembrete: a fatura da plataforma ANNETEC vence em breve. Se já pagou, desconsidere.'],
        facts: invoiceFacts(),
        action: payAction,
      }
    case 'platform_invoice_overdue':
      return {
        subject: `Fatura ANNETEC vencida — ${tenant}`,
        greeting: `Olá, equipe ${tenant}!`,
        paragraphs: [
          `A fatura da plataforma ANNETEC está vencida${str(d.daysLate) ? ` há ${str(d.daysLate)} dia(s)` : ''}.`,
          str(d.restrictsOn)
            ? `Sem o pagamento, o painel da equipe passa a somente leitura em ${dateBR(d.restrictsOn)}. Associados, carteirinhas e cobranças dos associados não são afetados.`
            : 'Regularize para evitar restrições no painel da equipe. Associados, carteirinhas e cobranças dos associados não são afetados.',
        ],
        facts: invoiceFacts(),
        action: payAction,
      }
    case 'platform_invoice_paid':
      return {
        subject: `Pagamento confirmado — ${str(d.description, 'fatura ANNETEC')}`,
        greeting: `Olá, equipe ${tenant}!`,
        paragraphs: ['Recebemos o pagamento da fatura da plataforma ANNETEC. Obrigado!'],
        facts: invoiceFacts().filter(([label]) => label !== 'Vencimento'),
        action: payUrl ? { label: 'Ver o comprovante', url: payUrl } : undefined,
      }
    case 'platform_access_restricted':
      return {
        subject: `Painel do ${tenant} em somente leitura`,
        greeting: `Olá, equipe ${tenant}!`,
        paragraphs: [
          `Por atraso no pagamento${str(d.daysLate) ? ` (${str(d.daysLate)} dia(s))` : ''}, o painel da equipe passou a SOMENTE LEITURA: dá para consultar, mas não alterar.`,
          str(d.suspendsOn)
            ? `Se o pagamento não for feito, o painel será bloqueado em ${dateBR(d.suspendsOn)}.`
            : 'Regularize para liberar o painel na hora.',
          'Seus associados não são afetados: vitrine, portal, carteirinhas e cobranças seguem funcionando.',
        ],
        facts: invoiceFacts(),
        action: payAction,
      }
    case 'platform_access_suspended':
      return {
        subject: `Painel do ${tenant} suspenso`,
        greeting: `Olá, equipe ${tenant}!`,
        paragraphs: [
          'Por atraso no pagamento, o painel da equipe foi BLOQUEADO. Só a página "Minha assinatura ANNETEC" continua acessível, para regularizar.',
          'Seus associados não são afetados: vitrine, portal, carteirinhas e cobranças seguem funcionando.',
        ],
        facts: invoiceFacts(),
        action: payAction,
      }
    case 'platform_access_reactivated':
      return {
        subject: `Painel do ${tenant} reativado`,
        greeting: `Olá, equipe ${tenant}!`,
        paragraphs: ['Pagamento confirmado: o painel da equipe voltou ao acesso completo. Obrigado!'],
        facts: invoiceFacts().filter(([label]) => label !== 'Vencimento'),
      }
    case 'platform_subscription_canceled':
      return {
        subject: `Assinatura ANNETEC cancelada — ${tenant}`,
        greeting: `Olá, equipe ${tenant}!`,
        paragraphs: [
          'A assinatura da plataforma ANNETEC foi cancelada.',
          ...(str(d.reason) ? [`Motivo: ${str(d.reason)}`] : []),
          'Os dados ficam disponíveis para exportação por 90 dias. Para reativar, fale com a nossa equipe.',
        ],
        facts: invoiceFacts(),
        action: payAction,
      }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeUrl(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null
}

function toText(block: Block, footer: string = FOOTER): string {
  const lines: string[] = []
  if (block.greeting) lines.push(block.greeting, '')
  for (const paragraph of block.paragraphs) lines.push(paragraph, '')
  if (block.facts?.length) {
    for (const [label, value] of block.facts) lines.push(`${label}: ${value}`)
    lines.push('')
  }
  if (block.list?.length) {
    for (const item of block.list) lines.push(`- ${item}`)
    lines.push('')
  }
  if (block.action) lines.push(`${block.action.label}: ${block.action.url}`, '')
  for (const paragraph of block.after ?? []) lines.push(paragraph, '')
  lines.push('--', footer)
  return lines.join('\n')
}

function toHtml(block: Block): string {
  const p = (text: string) => `<p style="margin:0 0 14px;line-height:1.5">${escapeHtml(text)}</p>`
  const parts: string[] = []
  if (block.greeting) parts.push(p(block.greeting))
  parts.push(...block.paragraphs.map(p))
  if (block.facts?.length) {
    const rows = block.facts
      .map(
        ([label, value]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#555">${escapeHtml(label)}</td><td style="padding:4px 0;font-weight:600">${escapeHtml(value)}</td></tr>`,
      )
      .join('')
    parts.push(`<table role="presentation" style="margin:0 0 14px;border-collapse:collapse">${rows}</table>`)
  }
  if (block.list?.length) {
    parts.push(`<ul style="margin:0 0 14px;padding-left:20px">${block.list.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`)
  }
  const url = block.action ? safeUrl(block.action.url) : null
  if (block.action && url) {
    parts.push(
      `<p style="margin:18px 0"><a href="${escapeHtml(url)}" style="background:#0f766e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(block.action.label)}</a></p>`,
      `<p style="margin:0 0 14px;font-size:12px;color:#666">Se o botão não abrir, copie o endereço: ${escapeHtml(url)}</p>`,
    )
  }
  parts.push(...(block.after ?? []).map(p))
  return [
    '<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933">',
    '<div style="max-width:560px;margin:0 auto;padding:24px">',
    '<div style="font-size:18px;font-weight:700;color:#0f766e;margin-bottom:16px">ANNETEC</div>',
    `<div style="background:#fff;border-radius:8px;padding:24px">${parts.join('')}</div>`,
    `<p style="font-size:12px;color:#777;margin-top:16px">${escapeHtml(FOOTER)}</p>`,
    '</div></body></html>',
  ].join('')
}

export function renderEmail(template: EmailTemplate | ClubEmailTemplate, data: Record<string, unknown>): RenderedEmail {
  if (isClubEmailTemplate(template)) return renderClubEmail(template, data ?? {})
  const block = build(template, data ?? {})
  const subject = block.subject.trim() || EMAIL_TEMPLATE_LABELS[template]
  return { subject, text: toText(block), html: toHtml(block) }
}

// ---------------------------------------------------------------------------
// E-mails do CLUBE ao associado — white label
// ---------------------------------------------------------------------------

/**
 * Comunicação de cobrança do clube com o associado. O inquilino é white label:
 * estes e-mails saem com o nome, a cor e o logo do clube e NUNCA citam a
 * plataforma nem o gateway (o cliente no Asaas fica com `notificationDisabled`,
 * então é a plataforma quem avisa — com a marca do inquilino).
 *
 * Ficam fora do `EMAIL_TEMPLATES` de contracts (catálogo dos e-mails da
 * plataforma); a coluna `platform_email_outbox.template` é texto, então a
 * chave é gravada como está.
 *
 * Dados: `{ clubName, brandColor?, logoUrl?, senderEmail?, holderName, planName?,
 * description, amount, dueDate, portalUrl, pixPayload?, boletoLine?, daysLate?,
 * cardDeclined?, chargeKind? ('cycle'|'one_off'), advance?, periodStart?, method?, payUrl?,
 * paidAt?, paidAmount?, cardLabel? }`. O link de pagamento é SEMPRE o portal do
 * clube (`payUrl` abre a fatura: `/{slug}/cliente/faturas?cobranca=<id>`) — a
 * `invoice_url`/`boleto_url` do gateway tem a marca do gateway.
 *
 * Régua "assine seu plano" (`club_subscribe_*`, associado sem assinatura viva):
 * `{ clubName, brandColor?, logoUrl?, senderEmail?, holderName, step ('d0'|'d1'|'d3'|'d7'),
 * accessStatus ('none'|'pending_payment'), planName?, plans?: { name, priceMonthly }[],
 * subscribeUrl, portalUrl }`.
 *
 * Acesso da equipe do clube (`club_staff_*`, admin/vendedor cadastrado pelo
 * admin do inquilino): `{ clubName, brandColor?, logoUrl?, senderEmail?,
 * holderName, roleLabel, loginUrl, loginEmail, password? }`. A senha
 * provisória vai em `secrets` (nunca em claro na caixa de saída); sem ela, o
 * convite pede para entrar com a senha que a pessoa já usa (conta reaproveitada).
 */
export const CLUB_EMAIL_TEMPLATES = [
  'club_charge_reminder',
  'club_charge_created',
  'club_payment_confirmed',
  'club_charge_overdue',
  'club_subscription_suspended',
  'club_subscribe_welcome',
  'club_subscribe_reminder',
  'club_staff_invite',
  'club_staff_password_reset',
] as const
export type ClubEmailTemplate = (typeof CLUB_EMAIL_TEMPLATES)[number]

export const CLUB_EMAIL_TEMPLATE_LABELS: Record<ClubEmailTemplate, string> = {
  club_charge_reminder: 'Clube: lembrete de vencimento ao associado',
  club_charge_created: 'Clube: nova cobrança gerada pelo clube (avulsa ou mensalidade adiantada)',
  club_payment_confirmed: 'Clube: comprovante de pagamento (cobrado no cartão salvo)',
  club_charge_overdue: 'Clube: mensalidade vencida (associado)',
  club_subscription_suspended: 'Clube: assinatura suspensa (associado)',
  club_subscribe_welcome: 'Clube: boas-vindas e convite para assinar (associado sem plano)',
  club_subscribe_reminder: 'Clube: lembrete para assinar um plano (associado sem plano)',
  club_staff_invite: 'Clube: convite de acesso (usuário cadastrado pelo admin)',
  club_staff_password_reset: 'Clube: senha redefinida pelo administrador',
}

export function isClubEmailTemplate(template: string): template is ClubEmailTemplate {
  return (CLUB_EMAIL_TEMPLATES as readonly string[]).includes(template)
}

const CLUB_DEFAULT_COLOR = '#334155'

function brandColor(value: unknown): string {
  const color = str(value)
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : CLUB_DEFAULT_COLOR
}

function buildClub(template: ClubEmailTemplate, d: Record<string, unknown>): Block {
  const club = str(d.clubName, 'seu clube')
  const plan = str(d.planName)
  const planText = plan ? ` do plano ${plan}` : ''
  const due = dateBR(d.dueDate)
  const amount = money(d.amount)
  const portal = str(d.portalUrl)
  const facts = [
    ['Descrição', str(d.description)],
    ['Valor', amount],
    ['Vencimento', due],
    ['Linha digitável do boleto', str(d.boletoLine)],
  ].filter((pair): pair is [string, string] => pair[1] !== '')
  const pix = str(d.pixPayload)
  const after = [...(pix ? [`Pix copia e cola: ${pix}`] : []), `Dúvidas? Fale com o ${club} pelo portal do associado.`]
  const oneOff = str(d.chargeKind) === 'one_off'
  const description = str(d.description)
  const payUrl = str(d.payUrl) || portal

  switch (template) {
    case 'club_charge_created':
      return buildChargeCreated(club, d, { amount, due, planText, oneOff, description, payUrl, facts, after })
    case 'club_payment_confirmed': {
      const paid = money(d.paidAmount) || amount
      const card = str(d.cardLabel)
      return {
        subject: `${club}: pagamento de ${paid || 'sua cobrança'} confirmado`,
        greeting: hello(d.holderName),
        paragraphs: [
          `Recebemos o seu pagamento de ${paid}${card ? `, cobrado no ${card}` : ''}. Obrigado!`,
          oneOff
            ? `Referente a: ${description || 'cobrança avulsa'}.`
            : `Referente à mensalidade${str(d.periodStart) ? ` de ${monthName(d.periodStart)}` : ''}${planText}.`,
        ],
        facts: [
          ['Descrição', description],
          ['Valor pago', paid],
          ['Pago em', dateBR(d.paidAt)],
          ['Forma de pagamento', card],
        ].filter((pair): pair is [string, string] => pair[1] !== ''),
        action: portal ? { label: 'Ver minhas faturas', url: portal } : undefined,
        after: [`Guarde este e-mail como comprovante. Dúvidas? Fale com o ${club} pelo portal do associado.`],
      }
    }
    case 'club_charge_reminder':
      if (oneOff) {
        return {
          subject: `${club}: sua cobrança${amount ? ` de ${amount}` : ''}${due ? ` vence em ${due}` : ' vence em breve'}`,
          greeting: hello(d.holderName),
          paragraphs: [
            `Este é um lembrete do ${club}: a cobrança${description ? ` "${description}"` : ''}${due ? ` vence em ${due}` : ' vence em breve'}.`,
            'Se você já pagou, desconsidere este e-mail.',
          ],
          facts,
          action: payUrl ? { label: str(d.method) === 'credit_card' ? 'Pagar com cartão' : 'Ver cobrança e pagar', url: payUrl } : undefined,
          after,
        }
      }
      return {
        subject: `${club}: sua mensalidade${amount ? ` de ${amount}` : ''}${due ? ` vence em ${due}` : ' vence em breve'}`,
        greeting: hello(d.holderName),
        paragraphs: [
          `Este é um lembrete do ${club}: a mensalidade${planText}${due ? ` vence em ${due}` : ' vence em breve'}.`,
          'Se você já pagou, desconsidere este e-mail.',
        ],
        facts,
        action: portal ? { label: 'Ver fatura e pagar', url: portal } : undefined,
        after,
      }
    case 'club_charge_overdue':
      return {
        subject: `${club}: mensalidade${due ? ` vencida em ${due}` : ' vencida'}`,
        greeting: hello(d.holderName),
        paragraphs: [
          d.cardDeclined
            ? `Não conseguimos cobrar a mensalidade${planText} no seu cartão${due ? ` (vencimento em ${due})` : ''}.`
            : `A mensalidade${planText}${due ? ` venceu em ${due}` : ' venceu'} e ainda não identificamos o pagamento.`,
          'Regularize para manter seus benefícios e carteirinhas ativos. Se você já pagou, desconsidere este e-mail.',
        ],
        facts,
        action: portal ? { label: 'Regularizar pagamento', url: portal } : undefined,
        after,
      }
    case 'club_subscribe_welcome':
    case 'club_subscribe_reminder':
      return buildSubscribeNudge(template, club, d)
    case 'club_staff_invite':
    case 'club_staff_password_reset':
      return buildStaffAccess(template, club, d)
    case 'club_subscription_suspended':
      return {
        subject: `${club}: sua assinatura foi suspensa`,
        greeting: hello(d.holderName),
        paragraphs: [
          `Por falta de pagamento${str(d.daysLate) ? ` (mensalidade vencida há ${str(d.daysLate)} dias)` : ''}, sua assinatura${planText} no ${club} foi suspensa e as carteirinhas estão bloqueadas.`,
          'Assim que o pagamento for confirmado, a assinatura e as carteirinhas são reativadas automaticamente.',
        ],
        facts,
        action: portal ? { label: 'Regularizar pagamento', url: portal } : undefined,
        after,
      }
  }
}

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

/** `2026-11-10` → "novembro de 2026". */
export function monthName(value: unknown): string {
  const match = /^(\d{4})-(\d{2})/.exec(str(value))
  if (!match) return ''
  const name = MONTH_NAMES[Number(match[2]) - 1]
  return name ? `${name} de ${match[1]}` : ''
}

/**
 * Cobrança gerada pelo admin: avulsa ("nova cobrança de R$ X") ou mensalidade
 * adiantada ("sua mensalidade de {mês} já está disponível"). Pix vai com o
 * copia e cola, boleto com a linha digitável e cartão com o botão "Pagar com
 * cartão" (abre a fatura no portal).
 */
function buildChargeCreated(
  club: string,
  d: Record<string, unknown>,
  c: {
    amount: string
    due: string
    planText: string
    oneOff: boolean
    description: string
    payUrl: string
    facts: [string, string][]
    after: string[]
  },
): Block {
  const method = str(d.method)
  const month = monthName(d.periodStart)
  const how =
    method === 'pix'
      ? 'Pague com o Pix copia e cola abaixo ou pela área do associado.'
      : method === 'boleto'
        ? 'Pague com a linha digitável do boleto abaixo ou pela área do associado.'
        : 'Pague com cartão de crédito pelo botão abaixo, na área do associado.'
  const action = c.payUrl
    ? { label: method === 'credit_card' ? 'Pagar com cartão' : 'Ver cobrança e pagar', url: c.payUrl }
    : undefined
  if (c.oneOff) {
    return {
      subject: `${club}: nova cobrança${c.amount ? ` de ${c.amount}` : ''}`,
      greeting: hello(d.holderName),
      paragraphs: [
        `O ${club} gerou uma nova cobrança para você${c.description ? `: ${c.description}` : ''}${c.due ? `, com vencimento em ${c.due}` : ''}.`,
        how,
      ],
      facts: c.facts,
      action,
      after: c.after,
    }
  }
  return {
    subject: `${club}: sua mensalidade${month ? ` de ${month}` : ''} já está disponível`,
    greeting: hello(d.holderName),
    paragraphs: [
      `A mensalidade${month ? ` de ${month}` : ''}${c.planText} já está disponível para pagamento${c.due ? `, com vencimento em ${c.due}` : ''}.`,
      `${how} O dia de vencimento do seu plano não muda.`,
    ],
    facts: c.facts,
    action,
    after: c.after,
  }
}

/** Até 4 planos ativos do clube, como "Plano Essencial: R$ 29,90/mês". */
function planLines(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, 4)
    .map(item => {
      const plan = (item ?? {}) as { name?: unknown; priceMonthly?: unknown }
      const name = str(plan.name)
      const price = money(plan.priceMonthly)
      return name && price ? `${name}: ${price}/mês` : ''
    })
    .filter(Boolean)
}

const SUBSCRIBE_REASONS =
  'Assinando, você libera a carteirinha digital para você e seus dependentes, os benefícios e descontos da rede de parceiros do clube e as faturas e pagamentos na área do associado.'

/**
 * Boas-vindas (D0) e lembretes (D1, D3, D7) para quem tem conta no clube e
 * ainda não assinou — ou começou o checkout e não pagou (`pending_payment`).
 */
function buildSubscribeNudge(template: ClubEmailTemplate, club: string, d: Record<string, unknown>): Block {
  const step = str(d.step, template === 'club_subscribe_welcome' ? 'd0' : 'd1')
  const subscribeUrl = str(d.subscribeUrl)
  const portal = str(d.portalUrl)
  const plans = planLines(d.plans)
  const plansIntro = plans.length > 0 ? ['Planos disponíveis:'] : []
  const after = [`Dúvidas? Fale com o ${club} pela área do associado.`]

  if (str(d.accessStatus) === 'pending_payment') {
    const plan = str(d.planName)
    return {
      subject:
        step === 'd7'
          ? `${club}: último lembrete para concluir sua assinatura`
          : `${club}: seu pagamento ainda não foi confirmado`,
      greeting: hello(d.holderName),
      paragraphs: [
        `Você começou a sua assinatura${plan ? ` do plano ${plan}` : ''} no ${club}, mas ainda não identificamos o pagamento da adesão.`,
        'Assim que o pagamento for confirmado, a carteirinha e os benefícios do clube são liberados automaticamente. Se você já pagou, desconsidere este e-mail.',
      ],
      action: portal ? { label: 'Concluir pagamento', url: portal } : subscribeUrl ? { label: 'Escolher meu plano', url: subscribeUrl } : undefined,
      after,
    }
  }

  if (template === 'club_subscribe_welcome' && d.returning === true) {
    // Associado que tinha sido excluído e voltou pelo site (nova rodada da régua).
    return {
      subject: `Que bom te ver de volta ao ${club}! Falta só escolher o seu plano`,
      greeting: hello(d.holderName),
      paragraphs: [
        `Que bom te ver de volta ao ${club}! Seu cadastro foi reativado.`,
        'Para voltar a usar os benefícios do clube, falta só escolher um plano — e incluir sua família, se quiser.',
        SUBSCRIBE_REASONS,
        ...plansIntro,
      ],
      list: plans,
      action: subscribeUrl ? { label: 'Escolher meu plano', url: subscribeUrl } : undefined,
      after,
    }
  }

  if (template === 'club_subscribe_welcome') {
    return {
      subject: `Bem-vindo(a) ao ${club}! Falta só escolher o seu plano`,
      greeting: hello(d.holderName),
      paragraphs: [
        `Que bom ter você no ${club}! Sua conta já está criada.`,
        'Para começar a usar os benefícios do clube, falta só um passo: escolher o plano ideal para você — e para a sua família, se quiser incluir dependentes.',
        SUBSCRIBE_REASONS,
        ...plansIntro,
      ],
      list: plans,
      action: subscribeUrl ? { label: 'Escolher meu plano', url: subscribeUrl } : undefined,
      after: [
        ...(portal ? [`Prefere ver com calma? Os planos também ficam na sua área do associado: ${portal}`] : []),
        ...after,
      ],
    }
  }

  const copy: Record<string, { subject: string; paragraph: string }> = {
    d1: {
      subject: `${club}: falta pouco para liberar seus benefícios`,
      paragraph: `Você criou sua conta no ${club}, mas ainda não escolheu um plano. Leva só alguns minutos, e os benefícios são liberados assim que o pagamento é confirmado.`,
    },
    d3: {
      subject: `${club}: seus benefícios estão esperando por você`,
      paragraph: `Sua conta no ${club} está pronta — só falta a assinatura para liberar a carteirinha digital e os benefícios do clube.`,
    },
    d7: {
      subject: `${club}: último lembrete para liberar seus benefícios`,
      paragraph: `Este é o nosso último lembrete: sua conta no ${club} continua sem um plano. Assine quando quiser para começar a usar os benefícios.`,
    },
  }
  const chosen = copy[step] ?? copy.d1!
  return {
    subject: chosen.subject,
    greeting: hello(d.holderName),
    paragraphs: [chosen.paragraph, SUBSCRIBE_REASONS, ...plansIntro],
    list: plans,
    action: subscribeUrl ? { label: 'Escolher meu plano', url: subscribeUrl } : undefined,
    after,
  }
}

/**
 * Acesso da equipe do clube (admin/vendedor): convite na criação e senha
 * redefinida pelo admin. A senha provisória só aparece aqui — a tela de quem
 * cadastrou nunca a vê.
 */
function buildStaffAccess(template: ClubEmailTemplate, club: string, d: Record<string, unknown>): Block {
  const loginUrl = str(d.loginUrl)
  const password = str(d.password)
  const role = str(d.roleLabel)
  const facts = [
    ['E-mail de acesso', str(d.loginEmail)],
    ['Senha provisória', password],
  ].filter((pair): pair is [string, string] => pair[1] !== '')
  const footer = `${club} — e-mail automático sobre o seu acesso. Não responda a esta mensagem.`
  const changeHint = 'Por segurança, troque a senha provisória no seu perfil logo no primeiro acesso.'

  if (template === 'club_staff_password_reset') {
    return {
      subject: `${club}: sua senha de acesso foi redefinida`,
      greeting: hello(d.holderName),
      paragraphs: [
        `A administração do ${club} redefiniu a senha do seu acesso. A senha anterior deixou de valer.`,
        changeHint,
      ],
      facts,
      action: loginUrl ? { label: 'Entrar', url: loginUrl } : undefined,
      after: [`Se você não pediu esta redefinição, fale com a administração do ${club}.`],
      footer,
    }
  }

  return {
    subject: `${club}: seu acesso foi criado`,
    greeting: hello(d.holderName),
    paragraphs: [
      `Você foi cadastrado(a) no ${club}${role ? ` com o perfil ${role}` : ''}.`,
      password
        ? `Use os dados abaixo para entrar. ${changeHint}`
        : 'Entre com este e-mail e a senha que você já usa. Se não lembrar, peça à administração do clube para redefini-la.',
    ],
    facts,
    action: loginUrl ? { label: 'Acessar', url: loginUrl } : undefined,
    after: [`Se você não esperava este convite, ignore este e-mail ou avise a administração do ${club}.`],
    footer,
  }
}

function clubFooter(club: string): string {
  return `${club} — e-mail automático sobre a sua assinatura. Não responda a esta mensagem.`
}

function clubHtml(block: Block, d: Record<string, unknown>): string {
  const club = str(d.clubName, 'Seu clube')
  const color = brandColor(d.brandColor)
  const logo = safeUrl(str(d.logoUrl))
  const p = (text: string) => `<p style="margin:0 0 14px;line-height:1.5;word-break:break-word">${escapeHtml(text)}</p>`
  const parts: string[] = []
  if (block.greeting) parts.push(p(block.greeting))
  parts.push(...block.paragraphs.map(p))
  if (block.list?.length) {
    parts.push(`<ul style="margin:0 0 14px;padding-left:20px;line-height:1.5">${block.list.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`)
  }
  if (block.facts?.length) {
    const rows = block.facts
      .map(
        ([label, value]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0;font-weight:600;word-break:break-all">${escapeHtml(value)}</td></tr>`,
      )
      .join('')
    parts.push(`<table role="presentation" style="margin:0 0 14px;border-collapse:collapse">${rows}</table>`)
  }
  const url = block.action ? safeUrl(block.action.url) : null
  if (block.action && url) {
    parts.push(
      `<p style="margin:18px 0"><a href="${escapeHtml(url)}" style="background:${color};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(block.action.label)}</a></p>`,
      `<p style="margin:0 0 14px;font-size:12px;color:#666">Se o botão não abrir, copie o endereço: ${escapeHtml(url)}</p>`,
    )
  }
  parts.push(...(block.after ?? []).map(p))
  const header = logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(club)}" style="max-height:48px;max-width:200px">` : escapeHtml(club)
  return [
    '<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933">',
    '<div style="max-width:560px;margin:0 auto;padding:24px">',
    `<div style="font-size:18px;font-weight:700;color:${color};margin-bottom:16px">${header}</div>`,
    `<div style="background:#fff;border-radius:8px;padding:24px;border-top:4px solid ${color}">${parts.join('')}</div>`,
    `<p style="font-size:12px;color:#777;margin-top:16px">${escapeHtml(block.footer ?? clubFooter(club))}</p>`,
    '</div></body></html>',
  ].join('')
}

function renderClubEmail(template: ClubEmailTemplate, d: Record<string, unknown>): RenderedEmail {
  const club = str(d.clubName, 'Seu clube')
  const block = buildClub(template, d)
  const subject = block.subject.trim() || CLUB_EMAIL_TEMPLATE_LABELS[template]
  const senderEmail = str(d.senderEmail)
  const from = senderEmail ? `${club.replace(/[<>"\r\n]/g, '')} <${senderEmail}>` : undefined
  return {
    subject,
    text: toText(block, block.footer ?? clubFooter(club)),
    html: clubHtml(block, d),
    ...(from ? { from } : {}),
  }
}
