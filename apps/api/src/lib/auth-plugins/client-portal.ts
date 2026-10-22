import { ERROR_CODES, onlyDigits } from '@annetec/contracts'
import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/client'
import { clientProfiles, clubSubscriptions, member, organization, user } from '@/db/schema'
import { AppError } from '@/http/errors'
import { mapContract } from '@/integrations/digitalsaude/mappers'
import { getDigitalSaudeClient } from '@/integrations/digitalsaude/provider'
import { runInBackground } from '@/lib/background'
import { logger } from '@/lib/logger'
import { ACCESS_UNAVAILABLE_MESSAGE, admitLogin } from '@/modules/users/member-access'

/**
 * Plugin de sign-in do portal do associado: identifica a pessoa por
 * CPF + e-mail, validados contra `GET /contrato/procurarPorClientePortal` na
 * Digital Saúde — não por senha. Segue o mesmo padrão dos plugins nativos que
 * não usam e-mail/senha (`anonymous`, `phone-number`): monta a sessão direto
 * via `internalAdapter` + `setSessionCookie`, sem tocar no fluxo
 * `emailAndPassword`.
 *
 * No primeiro acesso, cria a conta e o vínculo (`member`, papel `client`) com
 * o inquilino. Em acessos seguintes, apenas confirma o vínculo e emite uma
 * nova sessão — não há senha para errar.
 *
 * Caminho LOCAL (Clube de Benefícios, antes da Digital Saúde): se o e-mail é
 * de um associado `client` do inquilino, o CPF do perfil confere (só dígitos)
 * e existe assinatura do clube para ele, a sessão sai direto — quem assinou
 * pelo checkout entra sem depender da integração.
 */

const NOT_FOUND_MESSAGE = 'Não encontramos assinatura ou contrato com este CPF e e-mail'

/**
 * Vínculo com o clube (`member-access.ts`) antes de abrir a sessão: bloqueado
 * → 403 com a mensagem genérica (`code` ACCESS_UNAVAILABLE, que o
 * `authService` traduz); associado excluído → o mesmo vínculo é reativado.
 */
async function admitPortalLogin(tenantId: string, userId: string) {
  try {
    await admitLogin(tenantId, userId, 'portal')
  } catch (error) {
    if (error instanceof AppError && error.code === ERROR_CODES.ACCESS_UNAVAILABLE) {
      throw new APIError('FORBIDDEN', { message: ACCESS_UNAVAILABLE_MESSAGE, code: ERROR_CODES.ACCESS_UNAVAILABLE })
    }
    throw error
  }
}

/** Associado do clube (assinatura local) com este e-mail + CPF no inquilino; `null` se não houver. */
async function findClubMember(tenantId: string, email: string, cpf: string): Promise<string | null> {
  const [found] = await db
    .select({ userId: user.id, cpf: clientProfiles.cpf })
    .from(user)
    .innerJoin(
      member,
      and(eq(member.userId, user.id), eq(member.organizationId, tenantId), eq(member.role, 'client')),
    )
    .innerJoin(
      clientProfiles,
      and(eq(clientProfiles.userId, user.id), eq(clientProfiles.organizationId, tenantId)),
    )
    .where(eq(user.email, email.toLowerCase()))
    .limit(1)
  if (!found || onlyDigits(found.cpf) !== onlyDigits(cpf)) return null

  const [subscription] = await db
    .select({ id: clubSubscriptions.id })
    .from(clubSubscriptions)
    .where(and(eq(clubSubscriptions.organizationId, tenantId), eq(clubSubscriptions.userId, found.userId)))
    .limit(1)
  return subscription ? found.userId : null
}
/**
 * CPF + e-mail são fatores fracos: o portal só abre sessão de ASSOCIADO.
 * Conta de plataforma (a sessão sairia com escopo de plataforma) ou da equipe
 * deste clube (admin/vendedor — a sessão sairia com esse papel) entra com
 * senha ou Google, nunca por aqui, mesmo que a Digital Saúde tenha um
 * contrato com este e-mail.
 */
async function isPortalEligible(account: { id: string; role?: string | null }, tenantId: string): Promise<boolean> {
  if (account.role === 'superadmin' || account.role === 'platform_admin') return false
  const [staff] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, account.id), eq(member.organizationId, tenantId), ne(member.role, 'client')))
    .limit(1)
  return !staff
}

export function clientPortal() {
  return {
    id: 'client-portal',
    endpoints: {
      signInClientPortal: createAuthEndpoint(
        '/sign-in/client-portal',
        {
          method: 'POST',
          body: z.object({
            tenantSlug: z.string().min(1),
            cpf: z.string().min(11),
            email: z.string().email(),
          }),
        },
        async ctx => {
          const { tenantSlug, cpf, email } = ctx.body

          const [tenant] = await db
            .select({ id: organization.id })
            .from(organization)
            .where(eq(organization.slug, tenantSlug.toLowerCase()))
            .limit(1)
          if (!tenant) throw new APIError('NOT_FOUND', { message: 'Inquilino não encontrado' })

          // 1) Clube de Benefícios: assinatura local.
          const clubUserId = await findClubMember(tenant.id, email, cpf)
          if (clubUserId) {
            const clubUser = await ctx.context.internalAdapter.findUserById(clubUserId)
            if (clubUser && !(await isPortalEligible(clubUser as { id: string; role?: string | null }, tenant.id))) {
              throw new APIError('UNAUTHORIZED', { message: NOT_FOUND_MESSAGE })
            }
            if (clubUser) {
              await admitPortalLogin(tenant.id, clubUser.id)
              const clubSession = await ctx.context.internalAdapter.createSession(clubUser.id, false, {
                activeOrganizationId: tenant.id,
              })
              if (!clubSession) {
                throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Falha ao criar sessão' })
              }
              await setSessionCookie(ctx, { session: clubSession, user: clubUser })
              return ctx.json({ token: clubSession.token, user: clubUser })
            }
          }

          // 2) Digital Saúde.
          let upstreamContracts
          try {
            const client = await getDigitalSaudeClient(tenant.id)
            upstreamContracts = await client.call('contratoPorClientePortal', { cpf, email })
          } catch (error) {
            if (error instanceof AppError && error.code === ERROR_CODES.INTEGRATION_NOT_CONFIGURED) {
              throw new APIError('UNAUTHORIZED', { message: NOT_FOUND_MESSAGE })
            }
            throw error
          }
          const contracts = upstreamContracts.map(mapContract).filter(c => c.upstreamCodigo !== '')

          if (contracts.length === 0) {
            throw new APIError('UNAUTHORIZED', { message: NOT_FOUND_MESSAGE })
          }

          const holderName = contracts[0]?.holderName ?? 'Associado'
          const normalizedEmail = email.toLowerCase()

          let authUser = (await ctx.context.internalAdapter.findUserByEmail(normalizedEmail))?.user

          if (authUser && !(await isPortalEligible(authUser as { id: string; role?: string | null }, tenant.id))) {
            logger.warn({ tenantId: tenant.id, userId: authUser.id }, 'Portal recusado: conta de plataforma ou equipe do clube')
            throw new APIError('UNAUTHORIZED', { message: NOT_FOUND_MESSAGE })
          }

          if (!authUser) {
            authUser = await ctx.context.internalAdapter.createUser(
              { email: normalizedEmail, name: holderName, emailVerified: true },
              { method: 'digitalsaude-portal' },
            )
            logger.info({ tenantId: tenant.id, userId: authUser.id }, 'Associado provisionado pelo portal')
          }

          const [existingMember] = await db
            .select({ id: member.id })
            .from(member)
            .where(and(eq(member.organizationId, tenant.id), eq(member.userId, authUser.id)))
            .limit(1)

          if (!existingMember) {
            await db.insert(member).values({
              id: crypto.randomUUID(),
              organizationId: tenant.id,
              userId: authUser.id,
              role: 'client',
            })
          } else {
            await admitPortalLogin(tenant.id, authUser.id)
          }

          await db
            .insert(clientProfiles)
            .values({
              userId: authUser.id,
              organizationId: tenant.id,
              cpf,
              primaryContractCodigo: contracts[0]?.upstreamCodigo ?? null,
            })
            .onConflictDoUpdate({
              target: [clientProfiles.userId, clientProfiles.organizationId],
              set: { cpf, primaryContractCodigo: contracts[0]?.upstreamCodigo ?? null },
            })

          const session = await ctx.context.internalAdapter.createSession(authUser.id, false, {
            activeOrganizationId: tenant.id,
          })
          if (!session) {
            throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Falha ao criar sessão' })
          }

          await setSessionCookie(ctx, { session, user: authUser })

          // Sincroniza o espelho local de contratos em segundo plano — o
          // login não deve esperar por isso.
          runInBackground(
            import('@/modules/contracts/service').then(({ contractsService }) =>
              contractsService.syncContracts(tenant.id, contracts, { clientUserId: authUser!.id }),
            ),
            error => logger.error({ err: error, tenantId: tenant.id }, 'Falha ao sincronizar contratos no login'),
          )

          return ctx.json({ token: session.token, user: authUser })
        },
      ),
    },
  }
}
