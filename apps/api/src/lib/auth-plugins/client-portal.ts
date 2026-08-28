import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/client'
import { clientProfiles, member, organization } from '@/db/schema'
import { mapContract } from '@/integrations/digitalsaude/mappers'
import { getDigitalSaudeClient } from '@/integrations/digitalsaude/provider'
import { runInBackground } from '@/lib/background'
import { logger } from '@/lib/logger'

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
 */
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

          const client = await getDigitalSaudeClient(tenant.id)
          const upstreamContracts = await client.call('contratoPorClientePortal', { cpf, email })
          const contracts = upstreamContracts.map(mapContract).filter(c => c.upstreamCodigo !== '')

          if (contracts.length === 0) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Não encontramos contrato com este CPF e e-mail',
            })
          }

          const holderName = contracts[0]?.holderName ?? 'Associado'
          const normalizedEmail = email.toLowerCase()

          let authUser = (await ctx.context.internalAdapter.findUserByEmail(normalizedEmail))?.user

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
