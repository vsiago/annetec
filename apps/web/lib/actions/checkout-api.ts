'use server'

import type {
  AuthSession,
  CheckoutBoletoView,
  CheckoutContext,
  CheckoutInput,
  CheckoutResult,
  CheckoutStatus,
  RetryPaymentInput,
} from '@annetec/contracts'
import { revalidatePath } from 'next/cache'
import { clientIpHeaders } from '@/lib/api/client-ip'
import { api, tenantPath } from '@/lib/api/client'
import { getImpersonatorSession, getSessionUser, saveSession } from '@/lib/api/session'
import type { CheckoutSubmitResult } from '@/lib/adapters/checkout'
import type { ActionResult } from './_api-result'
import { run } from './_api-result'

/**
 * Checkout público do Clube (`/{slug}/assinar`) — rotas `…/public/checkout`
 * da API, SEM sessão (`token: null`; a exceção é o envio de um associado
 * logado, ver `submitCheckoutAction`) e com o IP do navegador repassado
 * (`clientIpHeaders`, para o rate limit e o `remoteIp` do Asaas). As rotas de uma assinatura
 * exigem `?chave=` (HMAC do id devolvido no checkout).
 *
 * Dados de cartão atravessam estas funções só de passagem (browser → API):
 * nada aqui loga corpo de requisição, e o `run()` só registra o erro — nunca
 * o payload.
 */

const checkoutPath = (slug: string) => tenantPath(slug, '/public/checkout')

const subscriptionPath = (slug: string, subscriptionId: string, suffix = '') =>
  `${checkoutPath(slug)}/${encodeURIComponent(subscriptionId)}${suffix}`

export async function getCheckoutContextAction(slug: string): Promise<ActionResult<CheckoutContext>> {
  return run(async () =>
    api<CheckoutContext>(`${checkoutPath(slug)}/contexto`, { token: null, headers: await clientIpHeaders() }),
  )
}

/**
 * Cria a assinatura e a 1ª cobrança.
 *
 * Associado já logado NESTE clube (sessão `client`, sem impersonação): a
 * chamada leva o token dele e a API cria a assinatura na conta da sessão (o
 * e-mail do titular precisa ser o dela — senão 422). Qualquer outro caso vai
 * sem sessão (`token: null`), como sempre.
 *
 * Se a conta nasceu agora (`session`), a sessão do associado é aberta NESTE
 * navegador — a menos que já exista aqui uma sessão de equipe (plataforma,
 * admin, vendedor ou impersonação), que não pode ser sobrescrita por uma
 * compra feita na vitrine. O token nunca volta ao browser: a tela recebe só
 * `signedIn`.
 */
export async function submitCheckoutAction(
  slug: string,
  input: CheckoutInput,
): Promise<ActionResult<CheckoutSubmitResult>> {
  return run(async () => {
    const [current, impersonator] = await Promise.all([getSessionUser(), getImpersonatorSession()])
    const asMember =
      impersonator === null &&
      current?.scope === 'tenant' &&
      current.tenantRole === 'client' &&
      current.tenantSlug === slug
    const result = await api<CheckoutResult>(checkoutPath(slug), {
      method: 'POST',
      body: input,
      // `undefined` = token do cookie de sessão; `null` = sem sessão.
      token: asMember ? undefined : null,
      headers: await clientIpHeaders(),
    })
    const signedIn = asMember || (result.session ? await adoptMemberSession(result.session) : false)
    const { session: _token, ...rest } = result
    return { ...rest, session: null, signedIn }
  })
}

async function adoptMemberSession(session: AuthSession): Promise<boolean> {
  const [current, impersonator] = await Promise.all([getSessionUser(), getImpersonatorSession()])
  const staffSession =
    impersonator !== null ||
    current?.scope === 'platform' ||
    current?.tenantRole === 'admin' ||
    current?.tenantRole === 'seller'
  if (staffSession) return false

  await saveSession(session.token, session.user)
  revalidatePath('/', 'layout')
  return true
}

/** Consulta em polling — a API sincroniza a cobrança com o gateway antes de responder. */
export async function getCheckoutStatusAction(
  slug: string,
  subscriptionId: string,
  chave: string,
): Promise<ActionResult<CheckoutStatus>> {
  return run(async () =>
    api<CheckoutStatus>(subscriptionPath(slug, subscriptionId), { token: null, headers: await clientIpHeaders(), query: { chave } }),
  )
}

/** Outro cartão ou troca de método (só enquanto `pending_payment`). */
export async function retryCheckoutPaymentAction(
  slug: string,
  subscriptionId: string,
  chave: string,
  input: RetryPaymentInput,
): Promise<ActionResult<CheckoutStatus>> {
  return run(async () =>
    api<CheckoutStatus>(subscriptionPath(slug, subscriptionId, '/pagamento'), {
      method: 'POST',
      body: input,
      token: null,
      headers: await clientIpHeaders(),
      query: { chave },
    }),
  )
}

/** "Simular pagamento" — só existe no modo demonstração (`canSimulatePayment`). */
export async function simulateCheckoutPaymentAction(
  slug: string,
  subscriptionId: string,
  chave: string,
): Promise<ActionResult<CheckoutStatus>> {
  return run(async () =>
    api<CheckoutStatus>(subscriptionPath(slug, subscriptionId, '/simular-pagamento'), {
      method: 'POST',
      token: null,
      headers: await clientIpHeaders(),
      query: { chave },
    }),
  )
}

/** Dados da página imprimível do boleto. */
export async function getCheckoutBoletoAction(
  slug: string,
  subscriptionId: string,
  chargeId: string,
  chave: string,
): Promise<ActionResult<CheckoutBoletoView>> {
  return run(async () =>
    api<CheckoutBoletoView>(
      subscriptionPath(slug, subscriptionId, `/cobrancas/${encodeURIComponent(chargeId)}`),
      { token: null, headers: await clientIpHeaders(), query: { chave } },
    ),
  )
}
