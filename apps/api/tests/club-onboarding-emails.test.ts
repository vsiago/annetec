import { describe, expect, it, vi } from 'vitest'
import type { ClubSubscriptionStatus } from '@annetec/contracts'
import { webBaseUrl } from '@/config/env'
import { renderEmail, type ClubEmailTemplate } from '@/lib/email/templates'
import { clubAccessStatusOf, needsSubscription } from '@/modules/club-billing/access.service'
import {
  RECENT_CHECKOUT_GRACE_MS,
  deliverOnboardingEmail,
  nextOnboardingStep,
  onboardingStepFor,
  type OnboardingCandidate,
  type OnboardingDeps,
  type OnboardingStep,
  type OnboardingTarget,
} from '@/modules/club-billing/onboarding.service'

/**
 * Régua "assine seu plano" (associado sem assinatura viva): D0/D1/D3/D7 uma
 * vez cada, para assim que a assinatura fica ativa, carência para checkout
 * recém-iniciado e e-mail white label. Sem banco: a reserva do passo
 * (`claim`) é um Set em memória, com a mesma semântica do unique da tabela.
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR
const joinedAt = new Date('2026-10-01T12:00:00Z')
const at = (ms: number) => new Date(joinedAt.getTime() + ms)

const target: OnboardingTarget = {
  organizationId: 'org-1',
  userId: 'user-1',
  email: 'nova@exemplo.com',
  name: 'Nova Pessoa',
  accessStatus: 'none',
}

function fakeDeps(production = false) {
  const claimed = new Map<string, string>()
  const finished: { id: string; status: string; reason: string | null }[] = []
  const deps = {
    send: vi.fn<OnboardingDeps['send']>(async () => ({ id: 'email-1', status: 'simulated' })),
    loadClub: vi.fn<OnboardingDeps['loadClub']>(async () => ({
      name: 'MapCard2',
      slug: 'mapcard2',
      primaryColor: '#0ea5e9',
      logoUrl: null,
      plans: [
        { name: 'Essencial', priceMonthly: 29.9 },
        { name: 'Família', priceMonthly: 59.9 },
      ],
    })),
    claim: vi.fn<OnboardingDeps['claim']>(async (t, step) => {
      const key = `${t.organizationId}:${t.userId}:${step}`
      if (claimed.has(key)) return null
      claimed.set(key, `claim-${step}`)
      return `claim-${step}`
    }),
    finish: vi.fn<OnboardingDeps['finish']>(async (id, result) => {
      finished.push({ id, status: result.status, reason: result.reason })
    }),
    production,
  }
  return { deps, claimed, finished }
}

const FORBIDDEN = /annetec|asaas/i

describe('nextOnboardingStep (prazos da régua)', () => {
  it('D0 no cadastro, depois D1, D3 e D7 — cada um só quando o prazo chega', () => {
    expect(nextOnboardingStep(joinedAt, at(0), [])).toBe('d0')
    expect(nextOnboardingStep(joinedAt, at(23 * HOUR), ['d0'])).toBeNull()
    expect(nextOnboardingStep(joinedAt, at(DAY), ['d0'])).toBe('d1')
    expect(nextOnboardingStep(joinedAt, at(2 * DAY), ['d0', 'd1'])).toBeNull()
    expect(nextOnboardingStep(joinedAt, at(3 * DAY), ['d0', 'd1'])).toBe('d3')
    expect(nextOnboardingStep(joinedAt, at(7 * DAY), ['d0', 'd1', 'd3'])).toBe('d7')
    expect(nextOnboardingStep(joinedAt, at(8 * DAY), ['d0', 'd1', 'd3', 'd7'])).toBeNull()
  })

  it('nunca repete nem volta para um passo anterior; quem perdeu a janela recebe só o atual', () => {
    expect(nextOnboardingStep(joinedAt, at(DAY), ['d1'])).toBeNull()
    expect(nextOnboardingStep(joinedAt, at(4 * DAY), [])).toBe('d3')
    expect(nextOnboardingStep(joinedAt, at(4 * DAY), ['d3'])).toBeNull()
    expect(nextOnboardingStep(joinedAt, at(7 * DAY), ['d3'])).toBe('d7')
  })

  it('fora da janela (associado antigo) não entra na régua', () => {
    expect(nextOnboardingStep(joinedAt, at(11 * DAY), [])).toBeNull()
    expect(nextOnboardingStep(joinedAt, at(-HOUR), [])).toBeNull()
  })
})

describe('clubAccessStatusOf (quem precisa assinar)', () => {
  const of = (statuses: ClubSubscriptionStatus[], hasUpstreamContract = false) =>
    clubAccessStatusOf({ subscriptionStatuses: statuses, hasUpstreamContract })

  it('classifica cada situação', () => {
    expect(of([])).toBe('none')
    expect(of(['canceled'])).toBe('none')
    expect(of(['pending_payment'])).toBe('pending_payment')
    expect(of(['canceled', 'pending_payment'])).toBe('pending_payment')
    expect(of(['active'])).toBe('subscribed')
    expect(of(['past_due'])).toBe('subscribed')
    expect(of(['suspended', 'pending_payment'])).toBe('subscribed')
    expect(of([], true)).toBe('contract')
  })

  it('só "none" e "pending_payment" precisam assinar', () => {
    expect(needsSubscription('none')).toBe(true)
    expect(needsSubscription('pending_payment')).toBe(true)
    expect(needsSubscription('subscribed')).toBe(false)
    expect(needsSubscription('contract')).toBe(false)
  })
})

/**
 * Simula o timer da automação de 6 em 6 horas por 12 dias: a cada rodada a
 * elegibilidade é relida (como `listOnboardingCandidates`) e o passo decidido
 * por `onboardingStepFor`; o envio passa pela reserva de verdade.
 */
async function simulate(subscribeAt: number | null) {
  const { deps } = fakeDeps()
  const recorded: string[] = []
  const sent: { step: OnboardingStep; when: number; template: string }[] = []
  for (let elapsed = 0; elapsed <= 12 * DAY; elapsed += 6 * HOUR) {
    const statuses: ClubSubscriptionStatus[] = subscribeAt !== null && elapsed >= subscribeAt ? ['active'] : []
    const status = clubAccessStatusOf({ subscriptionStatuses: statuses, hasUpstreamContract: false })
    if (!needsSubscription(status)) continue
    const candidate: OnboardingCandidate = { target, joinedAt, recorded: [...recorded], lastSubscriptionAt: null }
    const step = onboardingStepFor(candidate, at(elapsed))
    if (!step) continue
    const outcome = await deliverOnboardingEmail(target, step, deps)
    if (outcome === 'sent') {
      recorded.push(step)
      sent.push({ step, when: elapsed, template: String(deps.send.mock.calls.at(-1)![0].template) })
    }
  }
  return { sent, deps }
}

describe('régua "assine seu plano" (envio)', () => {
  it('envia D0, D1, D3 e D7 uma vez cada — no máximo 4 e-mails', async () => {
    const { sent, deps } = await simulate(null)

    expect(sent.map(item => item.step)).toEqual(['d0', 'd1', 'd3', 'd7'])
    expect(sent.map(item => item.when)).toEqual([0, DAY, 3 * DAY, 7 * DAY])
    expect(sent.map(item => item.template)).toEqual([
      'club_subscribe_welcome',
      'club_subscribe_reminder',
      'club_subscribe_reminder',
      'club_subscribe_reminder',
    ])
    expect(deps.send).toHaveBeenCalledTimes(4)
  })

  it('para assim que a assinatura fica ativa', async () => {
    const { sent, deps } = await simulate(2 * DAY)

    expect(sent.map(item => item.step)).toEqual(['d0', 'd1'])
    expect(deps.send).toHaveBeenCalledTimes(2)
  })

  it('o mesmo passo nunca sai duas vezes (cadastro e timer concorrendo)', async () => {
    const { deps } = fakeDeps()

    expect(await deliverOnboardingEmail(target, 'd0', deps)).toBe('sent')
    expect(await deliverOnboardingEmail(target, 'd0', deps)).toBe('duplicate')
    expect(deps.send).toHaveBeenCalledTimes(1)
  })

  it('checkout iniciado há menos de 24 h espera: o pagamento pode estar a caminho', () => {
    const now = at(DAY + HOUR)
    const fresh: OnboardingCandidate = {
      target: { ...target, accessStatus: 'pending_payment' },
      joinedAt,
      recorded: [],
      lastSubscriptionAt: new Date(now.getTime() - RECENT_CHECKOUT_GRACE_MS + HOUR),
    }
    expect(onboardingStepFor(fresh, now)).toBeNull()
    expect(onboardingStepFor({ ...fresh, lastSubscriptionAt: new Date(now.getTime() - RECENT_CHECKOUT_GRACE_MS - HOUR) }, now)).toBe('d1')
  })

  it('em produção, e-mail só na caixa de saída conta como falha e fica registrado (sem reenvio)', async () => {
    const { deps, finished } = fakeDeps(true)

    expect(await deliverOnboardingEmail(target, 'd1', deps)).toBe('failed')
    expect(finished).toEqual([{ id: 'claim-d1', status: 'failed', reason: 'sem provedor de e-mail em produção' }])
    expect(await deliverOnboardingEmail(target, 'd1', deps)).toBe('duplicate')
  })

  it('e-mail de boas-vindas white label: marca do clube, planos e link para assinar', async () => {
    const { deps } = fakeDeps()
    await deliverOnboardingEmail(target, 'd0', deps)
    const input = deps.send.mock.calls[0]![0]

    expect(input).toMatchObject({
      to: { email: 'nova@exemplo.com', name: 'Nova Pessoa' },
      organizationId: 'org-1',
      relatedType: 'club_onboarding',
      relatedId: 'user-1',
    })
    expect(input.data).toMatchObject({
      clubName: 'MapCard2',
      step: 'd0',
      subscribeUrl: `${webBaseUrl}/mapcard2/cliente/assinar`,
      portalUrl: `${webBaseUrl}/mapcard2/cliente`,
    })

    const rendered = renderEmail(input.template as unknown as ClubEmailTemplate, input.data)
    expect(rendered.subject).toBe('Bem-vindo(a) ao MapCard2! Falta só escolher o seu plano')
    expect(rendered.text).toContain('Essencial: R$')
    expect(rendered.text).toContain('Escolher meu plano')
    expect(rendered.html).toContain(`${webBaseUrl}/mapcard2/cliente/assinar`)
    expect(rendered.html).toContain('#0ea5e9')
    for (const part of [rendered.subject, rendered.text, rendered.html]) {
      expect(part).not.toMatch(FORBIDDEN)
    }
    // Remetente com o NOME do clube (o endereço é o de EMAIL_FROM, como nos avisos de cobrança).
    expect(rendered.from?.split('<')[0]?.trim()).toBe('MapCard2')
  })

  it('assuntos dos lembretes e do pagamento pendente, sem marca da plataforma', () => {
    const base = { clubName: 'MapCard2', holderName: 'Nova', subscribeUrl: 'https://x.test/mapcard2/assinar', portalUrl: 'https://x.test/mapcard2/cliente' }
    const subject = (step: string, accessStatus = 'none') =>
      renderEmail('club_subscribe_reminder', { ...base, step, accessStatus }).subject

    expect(subject('d1')).toBe('MapCard2: falta pouco para liberar seus benefícios')
    expect(subject('d3')).toBe('MapCard2: seus benefícios estão esperando por você')
    expect(subject('d7')).toBe('MapCard2: último lembrete para liberar seus benefícios')
    expect(subject('d1', 'pending_payment')).toBe('MapCard2: seu pagamento ainda não foi confirmado')
    expect(subject('d7', 'pending_payment')).toBe('MapCard2: último lembrete para concluir sua assinatura')

    const pending = renderEmail('club_subscribe_reminder', { ...base, step: 'd3', accessStatus: 'pending_payment', planName: 'Família' })
    expect(pending.text).toContain('Concluir pagamento: https://x.test/mapcard2/cliente')
    expect(pending.text).toContain('plano Família')
    for (const step of ['d1', 'd3', 'd7']) {
      const rendered = renderEmail('club_subscribe_reminder', { ...base, step })
      expect(`${rendered.subject}${rendered.text}${rendered.html}`).not.toMatch(FORBIDDEN)
    }
  })
})
