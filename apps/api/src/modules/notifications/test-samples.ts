import type { NotificationAudience, SendTestNotificationInput } from '@annetec/contracts'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubCharges, clubSubscriptions, member, organization, user } from '@/db/schema'
import {
  clientSignupNotifications,
  clubPaymentNotifications,
  notify,
  paymentMethodLabel,
  type TenantRef,
} from '@/lib/notifications'

/**
 * "Enviar notificação de teste" (só fora de produção — `demoToolsAllowed`).
 *
 * Gera a MESMA notificação que o fluxo real geraria, com os mesmos textos,
 * marcada `payload.test`. Sempre que dá, aponta para uma cobrança/um
 * associado de verdade do clube, para o "Ver detalhes" abrir algo real;
 * sem nada no banco, usa dados de exemplo (o link cai no "não encontrado").
 * Grava SÓ no público da rota que pediu: o teste do clube não toca o sino da
 * Annetec e vice-versa.
 */

const SAMPLE_PEOPLE = ['Maria Lima', 'Iago Souza', 'Ana Beatriz Costa', 'João Pereira', 'Carla Mendes']
const SAMPLE_PLANS = ['Plano Plus', 'Plano Família', 'Plano Essencial']
const SAMPLE_AMOUNTS = [49.9, 79.7, 129.9, 39.9]

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!
}

async function tenantRef(organizationId: string | null): Promise<TenantRef | null> {
  const query = db.select({ id: organization.id, slug: organization.slug, name: organization.name }).from(organization)
  const [row] = organizationId
    ? await query.where(eq(organization.id, organizationId)).limit(1)
    : await query.orderBy(desc(organization.createdAt)).limit(1)
  return row ?? null
}

async function samplePayment(tenant: TenantRef) {
  const [row] = await db
    .select({
      chargeId: clubCharges.id,
      amount: clubCharges.amount,
      paidAmount: clubCharges.paidAmount,
      method: clubCharges.method,
      cardBrand: clubCharges.cardBrand,
      cardLast4: clubCharges.cardLast4,
      subscriptionId: clubSubscriptions.id,
      userId: clubSubscriptions.userId,
      holderName: clubSubscriptions.holderName,
      planName: clubSubscriptions.planName,
    })
    .from(clubCharges)
    .innerJoin(clubSubscriptions, eq(clubSubscriptions.id, clubCharges.subscriptionId))
    .where(and(eq(clubCharges.organizationId, tenant.id), eq(clubCharges.status, 'paid')))
    .orderBy(desc(clubCharges.paidAt))
    .limit(1)
  if (row) {
    return {
      chargeId: row.chargeId,
      subscriptionId: row.subscriptionId,
      userId: row.userId,
      personName: row.holderName,
      planName: row.planName,
      amount: Number(row.paidAmount ?? row.amount),
      methodLabel: paymentMethodLabel(row.method, row.cardBrand, row.cardLast4),
    }
  }
  return {
    chargeId: crypto.randomUUID(),
    subscriptionId: crypto.randomUUID(),
    userId: null,
    personName: pick(SAMPLE_PEOPLE),
    planName: pick(SAMPLE_PLANS),
    amount: pick(SAMPLE_AMOUNTS),
    methodLabel: pick(['Pix', 'Cartão Visa •••• 4242', 'Boleto']),
  }
}

async function sampleClient(tenant: TenantRef) {
  const [row] = await db
    .select({ userId: user.id, name: user.name })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, tenant.id), eq(member.role, 'client')))
    .orderBy(desc(member.createdAt))
    .limit(1)
  return row ? { userId: row.userId, personName: row.name } : { userId: crypto.randomUUID(), personName: pick(SAMPLE_PEOPLE) }
}

export async function sendTestNotification(
  audience: NotificationAudience,
  organizationId: string | null,
  input: SendTestNotificationInput,
): Promise<{ sent: number }> {
  const tenant = await tenantRef(organizationId)
  if (!tenant) return { sent: 0 }

  const rows =
    input.kind === 'payment'
      ? clubPaymentNotifications({ tenant, ...(await samplePayment(tenant)), firstPayment: Math.random() < 0.5, test: true })
      : clientSignupNotifications({ tenant, ...(await sampleClient(tenant)), via: pick(['checkout', 'google'] as const), planName: pick(SAMPLE_PLANS), test: true })

  return { sent: await notify(rows.filter(row => row.audience === audience)) }
}
