import {
  createClubPlanInput,
  ERROR_CODES,
  ONBOARDING_STATUS_LABELS,
  type CreateTenantInput,
  type OnboardingBrandInput,
  type PlatformEventSource,
  type ProvisioningResult,
  type TenantBranding,
} from '@annetec/contracts'
import { hashPassword } from 'better-auth/crypto'
import { randomUUID } from 'node:crypto'
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { montarRegulamento, PLANOS_COMPLETOS } from '@/db/planos-completos'
import {
  account,
  auditLogs,
  clubBillingSettings,
  clubPlans,
  member,
  organization,
  platformEmailOutbox,
  platformFiles,
  platformOnboardingProposals,
  tenantProfiles,
  user,
} from '@/db/schema'
import { AppError } from '@/http/errors'
import { auth } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { logger } from '@/lib/logger'
import { publicFileUrl } from '@/lib/storage/files'
import { DEFAULT_BILLING_SETTINGS } from '@/modules/club-billing/settings.service'
import { clubPlanColumns } from '@/modules/network/controller'
import { cancelActivationCharge, createPlatformSubscription } from '@/modules/platform-billing/activation'
import { tenantsService } from '@/modules/tenants/service'
import { loginUrl, publicDiscount, siteUrlOf } from './presenter'
import { getProposal, insertEvent, transitionProposal, type Actor, type ProposalRow } from './repository'
import { PAYABLE_STATUSES, WAIVABLE_STATUSES } from './rules'

/**
 * Provisionamento do inquilino a partir da proposta paga (ou com ativação
 * isenta) — blueprint da plataforma §0.6. Cada passo é idempotente e o
 * `organizationId` é gravado LOGO após a criação, então uma retentativa
 * (`POST /provisionar`) retoma de onde parou sem duplicar nada:
 *
 *  1. organização + admin (`tenantsService.create`), com recuperação de
 *     criação parcial (org sem perfil, conta do admin órfã);
 *  2. `billing_settings` padrão do clube (`on conflict do nothing`);
 *  3. os 3 planos completos (`on conflict` por nome);
 *  4. assinatura de plataforma (Q2, idempotente por org);
 *  5. arquivos da proposta → `organizationId`;
 *  6. e-mail `tenant_welcome` (1×; sem a senha em mãos, gera outra);
 *  7. `active` + evento `PROVISIONED` + auditoria `tenant.provisioned`.
 */

/** Trava por processo: duas chamadas simultâneas para a mesma proposta não correm juntas. */
const running = new Set<string>()

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 500)
}

function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('')
}

async function actorFor(userId: string | null | undefined): Promise<Actor | null> {
  if (!userId) return null
  const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1)
  return { userId, name: row?.name ?? 'Equipe ANNETEC' }
}

// ---------------------------------------------------------------------------
// Pagamento confirmado → provisionamento
// ---------------------------------------------------------------------------

/**
 * Chamado pela cobrança da plataforma (Q2) quando a ativação é paga.
 * Idempotente: só quem vence a transição `approved|awaiting_payment →
 * provisioning` provisiona. Nunca lança (o webhook responde 200).
 */
export async function onActivationPaid(proposalId: string, ctx: { source: PlatformEventSource }): Promise<void> {
  try {
    const now = new Date()
    const row = await transitionProposal(db, proposalId, PAYABLE_STATUSES, {
      status: 'provisioning',
      paidAt: now,
      lastActivityAt: now,
    })
    if (!row) {
      const current = await getProposal(proposalId)
      if (current && (current.status === 'canceled' || current.status === 'rejected')) {
        await insertEvent(db, {
          proposalId,
          type: 'PAYMENT_CONFIRMED',
          visibility: 'internal',
          message: `Pagamento da ativação recebido com a proposta "${ONBOARDING_STATUS_LABELS[current.status]}": avaliar estorno.`,
          data: { source: ctx.source },
        })
      }
      return
    }
    await insertEvent(db, {
      proposalId,
      type: 'PAYMENT_CONFIRMED',
      visibility: 'public',
      message: 'Pagamento da ativação confirmado. Estamos criando o seu clube.',
      data: { source: ctx.source },
    })
    await provisionTenantFromProposal(proposalId)
  } catch (error) {
    logger.error({ proposalId, err: error }, 'Provisionamento automático falhou (retentativa manual no console)')
  }
}

export async function provisionTenantFromProposal(
  proposalId: string,
  opts?: { actorUserId?: string | null; waiveActivation?: boolean; reason?: string },
): Promise<ProvisioningResult> {
  if (running.has(proposalId)) throw AppError.conflict('O provisionamento desta proposta já está em andamento.')
  running.add(proposalId)
  try {
    return await provision(proposalId, opts ?? {})
  } finally {
    running.delete(proposalId)
  }
}

async function provision(
  proposalId: string,
  opts: { actorUserId?: string | null; waiveActivation?: boolean; reason?: string },
): Promise<ProvisioningResult> {
  let proposal = await getProposal(proposalId)
  if (!proposal) throw AppError.notFound('Proposta')
  const actor = await actorFor(opts.actorUserId)
  let waiverNote = ''

  if (opts.waiveActivation && WAIVABLE_STATUSES.includes(proposal.status)) {
    if (!opts.reason) throw AppError.validation([{ path: 'reason', message: 'Justifique a isenção da ativação' }])
    try {
      await cancelActivationCharge(proposalId, `Ativação isenta: ${opts.reason}`)
    } catch (error) {
      logger.warn({ proposalId, err: error }, 'Cobrança de ativação não cancelada na isenção')
    }
    const note = `Ativação isenta: ${opts.reason}`
    const row = await transitionProposal(db, proposalId, WAIVABLE_STATUSES, {
      status: 'provisioning',
      activationWaived: true,
      overrideReason: proposal.overrideReason ? `${proposal.overrideReason}\n${note}` : note,
      lastActivityAt: new Date(),
    })
    if (!row) throw AppError.conflict('A proposta mudou de estado. Recarregue e tente de novo.')
    proposal = row
    waiverNote = ` (${note})`
  }

  if (proposal.status === 'active' && proposal.organizationId) return resultOf(proposal)
  if (proposal.status !== 'provisioning') {
    throw AppError.businessRule(
      `Só é possível provisionar proposta paga ou com ativação isenta (status atual: "${ONBOARDING_STATUS_LABELS[proposal.status]}").`,
    )
  }
  const brand = proposal.brand
  const company = proposal.company
  if (!brand || !company || !proposal.planId || !proposal.paymentMethod) {
    throw AppError.businessRule('A proposta está incompleta (marca, dados cadastrais, plano ou pagamento).')
  }

  await db
    .update(platformOnboardingProposals)
    .set({ provisioningAttempts: sql`${platformOnboardingProposals.provisioningAttempts} + 1`, updatedAt: new Date() })
    .where(eq(platformOnboardingProposals.id, proposalId))
  await insertEvent(db, {
    proposalId,
    type: 'PROVISIONING_STARTED',
    visibility: 'internal',
    message: `Provisionamento iniciado${waiverNote}.`,
    actor,
  })

  try {
    // 1. Organização + admin (grava organizationId já)
    const { organizationId, ownerPassword } = await ensureOrganization(proposal, brand)
    if (proposal.organizationId !== organizationId) {
      await db
        .update(platformOnboardingProposals)
        .set({ organizationId, updatedAt: new Date() })
        .where(eq(platformOnboardingProposals.id, proposalId))
    }

    // 2. Régua de cobrança do clube (padrões)
    await db.insert(clubBillingSettings).values({ organizationId, gateway: null }).onConflictDoNothing()

    // 3. Planos completos do clube
    const clubPlansCreated = await ensureClubPlans(organizationId, brand.clubName)

    // 4. Assinatura de plataforma (Q2, idempotente por org; vincula a ativação)
    const contacts = company.contacts
    const { subscriptionId } = await createPlatformSubscription({
      organizationId,
      proposalId,
      planId: proposal.planId,
      paymentMethod: proposal.paymentMethod,
      billing: {
        name: company.legalName,
        document: proposal.cnpj,
        email: contacts?.financial?.email ?? company.email,
        phone: contacts?.financial?.phone ?? company.phone,
      },
      startDate: todaySP(),
      activationWaived: proposal.activationWaived,
      discount: publicDiscount(proposal.discount),
    })

    // 5. Arquivos da proposta passam a ser do inquilino
    await db
      .update(platformFiles)
      .set({ organizationId })
      .where(and(eq(platformFiles.ownerType, 'proposal'), eq(platformFiles.ownerId, proposalId)))

    // 6. Boas-vindas (1×)
    await ensureWelcomeEmail(proposal, brand, organizationId, ownerPassword)

    // 7. No ar
    const now = new Date()
    const row = await transitionProposal(db, proposalId, ['provisioning'], {
      status: 'active',
      organizationId,
      provisionedAt: now,
      provisioningError: null,
      lastActivityAt: now,
    })
    if (row) {
      await insertEvent(db, {
        proposalId,
        type: 'PROVISIONED',
        visibility: 'public',
        message: `Clube no ar em ${siteUrlOf(brand.slug)}. O acesso do painel foi enviado para ${brand.admin.email}.`,
        data: { organizationId, subscriptionId, clubPlans: clubPlansCreated },
        actor,
      })
      await db
        .insert(auditLogs)
        .values({
          organizationId,
          actorId: actor?.userId ?? null,
          actorScope: 'platform',
          action: 'tenant.provisioned',
          resource: 'tenant',
          resourceId: organizationId,
          metadata: {
            proposalId,
            code: proposal.code,
            slug: brand.slug,
            planId: proposal.planId,
            subscriptionId,
            activationWaived: proposal.activationWaived,
          },
        })
        .catch(error => logger.error({ err: error, proposalId }, 'Falha ao gravar auditoria do provisionamento'))
    }
    return {
      organizationId,
      slug: brand.slug,
      siteUrl: siteUrlOf(brand.slug),
      adminEmail: brand.admin.email,
      clubPlansCreated,
      subscriptionId,
    }
  } catch (error) {
    const message = errorMessage(error)
    await db
      .update(platformOnboardingProposals)
      .set({ provisioningError: message, updatedAt: new Date() })
      .where(eq(platformOnboardingProposals.id, proposalId))
      .catch(() => {})
    await insertEvent(db, {
      proposalId,
      type: 'PROVISIONING_FAILED',
      visibility: 'internal',
      message: `Falha no provisionamento: ${message}`,
      actor,
    }).catch(() => {})
    if (error instanceof AppError) throw error
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, `Falha no provisionamento: ${message}`, { cause: error })
  }
}

/** Resultado de uma proposta já ativa (reprocessar não cria nada). */
async function resultOf(proposal: ProposalRow): Promise<ProvisioningResult> {
  const organizationId = proposal.organizationId!
  const [[org], [plans], subscription] = await Promise.all([
    db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, organizationId)).limit(1),
    db.select({ value: count() }).from(clubPlans).where(eq(clubPlans.organizationId, organizationId)),
    createPlatformSubscription({
      organizationId,
      proposalId: proposal.id,
      planId: proposal.planId!,
      paymentMethod: proposal.paymentMethod!,
      billing: {
        name: proposal.company?.legalName ?? proposal.legalName ?? '',
        document: proposal.cnpj,
        email: proposal.company?.contacts?.financial?.email ?? proposal.company?.email ?? proposal.applicant.email,
        phone: proposal.company?.phone ?? null,
      },
      startDate: todaySP(),
      activationWaived: proposal.activationWaived,
      discount: publicDiscount(proposal.discount),
    }),
  ])
  const slug = org?.slug ?? proposal.brand?.slug ?? ''
  return {
    organizationId,
    slug,
    siteUrl: siteUrlOf(slug),
    adminEmail: proposal.brand?.admin.email ?? '',
    clubPlansCreated: plans?.value ?? 0,
    subscriptionId: subscription.subscriptionId,
  }
}

function todaySP(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)
}

function brandingOf(brand: OnboardingBrandInput): TenantBranding {
  return {
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
    ...(brand.logoFileId ? { logoUrl: publicFileUrl(brand.logoFileId) } : {}),
  }
}

// ---------------------------------------------------------------------------
// Passo 1 — organização + admin, com recuperação de criação parcial
// ---------------------------------------------------------------------------

async function ensureTenantProfile(organizationId: string, proposal: ProposalRow, brand: OnboardingBrandInput) {
  const company = proposal.company!
  await db
    .insert(tenantProfiles)
    .values({
      organizationId,
      legalName: company.legalName,
      document: proposal.cnpj,
      email: company.email,
      phone: company.phone,
      address: company.address,
      branding: brandingOf(brand),
      planId: proposal.planId,
      status: 'active',
    })
    .onConflictDoNothing()
}

async function isAdminMember(organizationId: string, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, organizationId), sql`lower(${user.email}) = ${email}`))
    .limit(1)
  return Boolean(row)
}

async function ensureOrganization(
  proposal: ProposalRow,
  brand: OnboardingBrandInput,
): Promise<{ organizationId: string; ownerPassword: string | null }> {
  const adminEmail = brand.admin.email.trim().toLowerCase()

  // (a) Já criada e gravada numa tentativa anterior.
  if (proposal.organizationId) {
    const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, proposal.organizationId)).limit(1)
    if (org) {
      await ensureTenantProfile(org.id, proposal, brand)
      return { organizationId: org.id, ownerPassword: null }
    }
  }

  // (b) Criada, mas a tentativa caiu antes de gravar o organizationId.
  const [bySlug] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, brand.slug)).limit(1)
  if (bySlug) {
    const [profile] = await db
      .select({ document: tenantProfiles.document })
      .from(tenantProfiles)
      .where(eq(tenantProfiles.organizationId, bySlug.id))
      .limit(1)
    const ours = profile ? profile.document === proposal.cnpj : await isAdminMember(bySlug.id, adminEmail)
    if (!ours) throw AppError.businessRule(`O endereço "${brand.slug}" já é de outro inquilino.`)
    await ensureTenantProfile(bySlug.id, proposal, brand)
    return { organizationId: bySlug.id, ownerPassword: null }
  }

  // (c) Conta do admin criada numa tentativa que caiu antes da organização.
  const [existingUser] = await db
    .select({ id: user.id, createdAt: user.createdAt })
    .from(user)
    .where(sql`lower(${user.email}) = ${adminEmail}`)
    .limit(1)
  if (existingUser) {
    const [memberships] = await db.select({ value: count() }).from(member).where(eq(member.userId, existingUser.id))
    const since = proposal.paidAt ?? proposal.approvedAt ?? proposal.updatedAt
    const orphanFromThisProposal = (memberships?.value ?? 0) === 0 && existingUser.createdAt.getTime() >= since.getTime() - 60_000
    if (!orphanFromThisProposal) {
      throw AppError.businessRule(
        `O e-mail ${adminEmail} já tem conta na plataforma. Indique outro administrador (fale com o suporte) e reprocesse.`,
      )
    }
    const org = await auth.api.createOrganization({
      body: { name: brand.clubName, slug: brand.slug, userId: existingUser.id },
    })
    if (!org) throw AppError.businessRule('Não foi possível criar a organização do inquilino')
    await ensureTenantProfile(org.id, proposal, brand)
    return { organizationId: org.id, ownerPassword: null }
  }

  // (d) Caminho normal.
  const company = proposal.company!
  const input: CreateTenantInput = {
    slug: brand.slug,
    name: brand.clubName,
    legalName: company.legalName,
    document: proposal.cnpj,
    email: company.email,
    phone: company.phone,
    address: company.address,
    branding: brandingOf(brand),
    planId: proposal.planId!,
    status: 'active',
    ownerName: brand.admin.name,
    ownerEmail: adminEmail,
  }
  const { tenant, ownerPassword } = await tenantsService.create(input)
  return { organizationId: tenant.id, ownerPassword }
}

// ---------------------------------------------------------------------------
// Passo 3 — planos do clube
// ---------------------------------------------------------------------------

/**
 * Os 3 planos-modelo (29,90/49,90/79,90) nascem INATIVOS (rascunho): o admin
 * revisa preços e coberturas e ativa em Planos. Inativo não aparece na vitrine
 * (`public-club-plans`) nem aceita checkout.
 */
async function ensureClubPlans(organizationId: string, clubName: string): Promise<number> {
  const inputs = PLANOS_COMPLETOS.map(seed =>
    createClubPlanInput.parse({ ...seed, terms: montarRegulamento(seed, clubName, DEFAULT_BILLING_SETTINGS) }),
  )
  for (const input of inputs) {
    await db
      .insert(clubPlans)
      .values({ organizationId, name: input.name, ...clubPlanColumns(input), status: 'inactive' })
      .onConflictDoNothing()
  }
  const [row] = await db
    .select({ value: count() })
    .from(clubPlans)
    .where(and(eq(clubPlans.organizationId, organizationId), inArray(clubPlans.name, inputs.map(i => i.name))))
  return row?.value ?? 0
}

// ---------------------------------------------------------------------------
// Passo 6 — boas-vindas
// ---------------------------------------------------------------------------

/** Nova senha provisória para o admin (a da 1ª tentativa se perdeu). */
async function resetAdminPassword(organizationId: string, email: string): Promise<string> {
  const [admin] = await db
    .select({ id: user.id })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, organizationId), sql`lower(${user.email}) = ${email}`))
    .limit(1)
  if (!admin) throw AppError.businessRule('Administrador do inquilino não encontrado para enviar o acesso.')
  const password = generatePassword()
  const hash = await hashPassword(password)
  const updated = await db
    .update(account)
    .set({ password: hash, updatedAt: new Date() })
    .where(and(eq(account.userId, admin.id), eq(account.providerId, 'credential')))
    .returning({ id: account.id })
  if (updated.length === 0) {
    await db.insert(account).values({
      id: randomUUID(),
      userId: admin.id,
      accountId: admin.id,
      providerId: 'credential',
      issuer: 'local:credential',
      password: hash,
    })
  }
  return password
}

async function ensureWelcomeEmail(
  proposal: ProposalRow,
  brand: OnboardingBrandInput,
  organizationId: string,
  ownerPassword: string | null,
): Promise<void> {
  const [sent] = await db
    .select({ id: platformEmailOutbox.id })
    .from(platformEmailOutbox)
    .where(
      and(
        eq(platformEmailOutbox.proposalId, proposal.id),
        eq(platformEmailOutbox.template, 'tenant_welcome'),
        inArray(platformEmailOutbox.status, ['simulated', 'queued', 'sent']),
      ),
    )
    .limit(1)
  if (sent) return
  const adminEmail = brand.admin.email.trim().toLowerCase()
  const password = ownerPassword ?? (await resetAdminPassword(organizationId, adminEmail))
  const result = await sendEmail({
    template: 'tenant_welcome',
    to: { email: adminEmail, name: brand.admin.name },
    data: {
      adminName: brand.admin.name,
      clubName: brand.clubName,
      siteUrl: siteUrlOf(brand.slug),
      loginUrl: loginUrl(),
      adminEmail,
      password,
    },
    secrets: [password],
    organizationId,
    proposalId: proposal.id,
    relatedType: 'proposal',
    relatedId: proposal.id,
  })
  await insertEvent(db, {
    proposalId: proposal.id,
    type: 'EMAIL_SENT',
    visibility: 'internal',
    message: `E-mail "Boas-vindas e acesso ao painel" para ${adminEmail} (${result.status})`,
    data: { template: 'tenant_welcome', emailId: result.id, status: result.status },
  })
  if (result.status === 'failed') {
    throw AppError.businessRule('O e-mail de boas-vindas não pôde ser registrado: reprocesse o provisionamento.')
  }
}
