import { ERROR_CODES, type CreateTenantUserInput, type EmailStatus, type EmailTemplate, type EscopoVendas } from '@annetec/contracts'
import { hashPassword } from 'better-auth/crypto'
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { env, webBaseUrl } from '@/config/env'
import { db } from '@/db/client'
import { account, member, session, user } from '@/db/schema'
import { AppError } from '@/http/errors'
import { sendEmail } from '@/lib/email'
import { parseAddress } from '@/lib/email/providers'
import { logger } from '@/lib/logger'
import { platformUsersService } from '@/modules/platform-users/service'
import { generateProvisionalPassword, resetTenantUserPassword, sendStaffInvite } from '@/modules/users/access.service'
import { usersService } from '@/modules/users/service'

/**
 * Conta de acesso e convite dos agentes da Rede Comercial.
 *
 * O papel de AUTENTICAÇÃO não muda com o papel comercial:
 *  - platform: a conta é `user.role = 'platform_seller'` (mesmo caminho de
 *    `platformUsersService.create`, que também cria o perfil legado de
 *    vendedor — mantém `/contratar?ref=` e as rotas antigas funcionando);
 *  - tenant: `member.role = 'seller'` (mesmo caminho de `usersService.create`,
 *    o que o painel do clube usa para cadastrar vendedores).
 *
 * A senha provisória nasce AQUI, no servidor, e só existe no e-mail enviado à
 * própria pessoa: nunca volta na resposta da API nem entra na auditoria.
 */

export interface UsuarioProvisionado {
  userId: string
  email: string
  nome: string
  /** `false` = a conta já existia e foi reaproveitada (a pessoa usa a senha que já tem). */
  contaNova: boolean
  /** Só em conta nova; vai direto para `enviarConvite`. */
  senhaProvisoria: string | null
}

export interface ResultadoConvite {
  enviado: boolean
  /** Situação do envio; `nao_enviado` quando o cadastro pediu para não convidar. */
  status: EmailStatus | 'nao_enviado'
}

export interface ProvisionarUsuarioInput {
  scope: EscopoVendas
  tenantId: string | null
  nome: string
  email: string
  telefone?: string | null
  /** Código de indicação do agente (platform: vira o código do perfil legado do vendedor). */
  codigoIndicacao: string
  criadoPorUserId: string | null
}

const EMAIL_EXISTENTE = 'Este e-mail já tem conta'

/** Cria (ou reaproveita) a conta de acesso do agente. NÃO cria `vendas_agentes`. */
export async function provisionarUsuario(input: ProvisionarUsuarioInput): Promise<UsuarioProvisionado> {
  const email = input.email.trim().toLowerCase()
  const [existente] = await db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  if (input.scope === 'platform') {
    if (existente) {
      if (existente.role !== 'platform_seller') {
        throw new AppError(ERROR_CODES.ALREADY_EXISTS, `${EMAIL_EXISTENTE} e ela não é de vendedor ANNETEC. Use outro e-mail.`)
      }
      return { userId: existente.id, email, nome: existente.name, contaNova: false, senhaProvisoria: null }
    }
    const senha = generateProvisionalPassword()
    const conta = await platformUsersService.create(
      { name: input.nome, email, phone: input.telefone ?? undefined, password: senha, role: 'platform_seller' },
      { referralCode: input.codigoIndicacao.toLowerCase(), createdByUserId: input.criadoPorUserId, semAgenteComercial: true },
    )
    return { userId: conta.id, email, nome: conta.name, contaNova: true, senhaProvisoria: senha }
  }

  const tenantId = input.tenantId
  if (!tenantId) throw new Error('provisionarUsuario: escopo tenant sem tenantId')

  if (existente) {
    const [vinculo] = await db
      .select({ id: member.id, role: member.role, accessStatus: member.accessStatus })
      .from(member)
      .where(and(eq(member.organizationId, tenantId), eq(member.userId, existente.id)))
      .limit(1)
    if (vinculo) {
      if (vinculo.role !== 'seller') {
        throw new AppError(ERROR_CODES.ALREADY_EXISTS, `${EMAIL_EXISTENTE} neste clube com outro perfil (administrador ou associado). Use outro e-mail.`)
      }
      if (vinculo.accessStatus !== 'active') {
        await db.update(member).set({ accessStatus: 'active', accessChangedAt: new Date() }).where(eq(member.id, vinculo.id))
      }
      return { userId: existente.id, email, nome: existente.name, contaNova: false, senhaProvisoria: null }
    }
  }

  // Sem vínculo aqui: `usersService.create` reaproveita a conta (e aplica as regras de conta
  // compartilhada/equipe da plataforma) ou cria uma nova com senha provisória.
  const { tenantUser, provisionalPassword } = await usersService.create(tenantId, {
    name: input.nome,
    email,
    phone: input.telefone ?? undefined,
    role: 'seller',
    active: true,
  } as CreateTenantUserInput, { semAgenteComercial: true })
  return {
    userId: tenantUser.id,
    email,
    nome: tenantUser.name,
    contaNova: provisionalPassword !== null,
    senhaProvisoria: provisionalPassword,
  }
}

/** E-mail de acesso do vendedor ANNETEC (mesmo layout do convite de equipe de clube, com a marca da plataforma). */
function emailPlataforma(
  template: 'club_staff_invite' | 'club_staff_password_reset',
  params: { userId: string; email: string; nome: string; senha: string | null },
) {
  return {
    template: template as unknown as EmailTemplate,
    to: { email: params.email, name: params.nome },
    data: {
      clubName: 'ANNETEC',
      brandColor: null,
      logoUrl: null,
      senderEmail: parseAddress(env.EMAIL_FROM).email,
      holderName: params.nome,
      roleLabel: 'Vendedor',
      loginUrl: `${webBaseUrl}/login`,
      loginEmail: params.email,
      password: params.senha,
    },
    secrets: params.senha ? [params.senha] : [],
    organizationId: null,
    relatedType: 'platform_user',
    relatedId: params.userId,
  }
}

/** Convite do agente recém-cadastrado. Nunca lança (falha de envio vira `failed`). */
export async function enviarConvite(params: {
  scope: EscopoVendas
  tenantId: string | null
  userId: string
  email: string
  nome: string
  senhaProvisoria: string | null
}): Promise<ResultadoConvite> {
  try {
    if (params.scope === 'platform') {
      const enviado = await sendEmail(
        emailPlataforma('club_staff_invite', { userId: params.userId, email: params.email, nome: params.nome, senha: params.senhaProvisoria }),
      )
      return { enviado: enviado.status !== 'failed', status: enviado.status }
    }
    if (!params.tenantId) throw new Error('enviarConvite: escopo tenant sem tenantId')
    const enviado = await sendStaffInvite({
      tenantId: params.tenantId,
      userId: params.userId,
      email: params.email,
      name: params.nome,
      role: 'seller',
      password: params.senhaProvisoria,
    })
    return { enviado: enviado.status !== 'failed', status: enviado.status }
  } catch (error) {
    logger.error({ err: error, userId: params.userId }, 'Falha ao enviar o convite do agente')
    return { enviado: false, status: 'failed' }
  }
}

async function definirSenha(userId: string, senha: string): Promise<void> {
  const hash = await hashPassword(senha)
  const atualizadas = await db
    .update(account)
    .set({ password: hash, updatedAt: new Date() })
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    .returning({ id: account.id })
  if (atualizadas.length === 0) {
    await db.insert(account).values({
      id: randomUUID(),
      userId,
      accountId: userId,
      providerId: 'credential',
      issuer: 'local:credential',
      password: hash,
    })
  }
}

/**
 * Reenvia o acesso: gera uma senha provisória nova (a anterior deixa de valer e
 * as sessões abertas caem) e a manda por e-mail. No clube, conta compartilhada
 * com outro vínculo não tem a senha mexida pelo clube: recebe só o lembrete de acesso.
 */
export async function reenviarConvite(params: {
  scope: EscopoVendas
  tenantId: string | null
  userId: string
  actorUserId: string | null
}): Promise<ResultadoConvite> {
  const [conta] = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.id, params.userId))
    .limit(1)
  if (!conta) throw AppError.notFound('Conta do agente')

  if (params.scope === 'platform') {
    if (conta.role !== 'platform_seller') throw AppError.forbidden('Esta conta não é de vendedor ANNETEC')
    const senha = generateProvisionalPassword()
    await definirSenha(conta.id, senha)
    if (params.actorUserId !== conta.id) await db.delete(session).where(eq(session.userId, conta.id))
    const enviado = await sendEmail(
      emailPlataforma('club_staff_password_reset', { userId: conta.id, email: conta.email, nome: conta.name, senha }),
    )
    return { enviado: enviado.status !== 'failed', status: enviado.status }
  }

  if (!params.tenantId) throw new Error('reenviarConvite: escopo tenant sem tenantId')
  try {
    const resultado = await resetTenantUserPassword(params.tenantId, conta.id, params.actorUserId)
    return { enviado: resultado.emailStatus !== 'failed', status: resultado.emailStatus }
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== ERROR_CODES.FORBIDDEN) throw error
    return enviarConvite({
      scope: 'tenant',
      tenantId: params.tenantId,
      userId: conta.id,
      email: conta.email,
      nome: conta.name,
      senhaProvisoria: null,
    })
  }
}
