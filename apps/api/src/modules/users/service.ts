import {
  ERROR_CODES,
  type CreateTenantUserInput,
  type MemberAccessStatus,
  type TenantUser,
  type UpdateTenantUserInput,
} from '@annetec/contracts'
import { and, count, desc, eq, ilike, isNull, ne, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { activityEvents, clientProfiles, contracts, member, sales, sellerProfiles, session, user } from '@/db/schema'
import { AppError } from '@/http/errors'
import { auth } from '@/lib/auth'
import { decryptSecret, encryptSecret } from '@/lib/crypto'
import { getDigitalSaudeClient } from '@/integrations/digitalsaude/provider'
import { garantirAgenteSolo } from '@/modules/vendas-rede/agente-solo'
import { generateProvisionalPassword } from './access.service'
import {
  cutMemberAccess,
  MEMBER_BLOCKED_REASON,
  MEMBER_REMOVED_REASON,
  memberAccessDb,
  type CutAccessResult,
  type MemberAccessDeps,
} from './member-access'
import {
  assertKeepsResponsible,
  assertTenantOwnsIdentity,
  changedIdentityFields,
  membershipRulesDb,
  revokeClubSessions,
  SHARED_ACCOUNT_STAFF_MESSAGE,
  tenantOwnsIdentity,
  type MembershipRulesDeps,
  type MembershipTarget,
} from './membership-rules'

/**
 * CRUD de usuários dentro de um inquilino.
 *
 * A pessoa (`user`) e o vínculo (`member.role`) são do Better Auth; só o
 * criamos por `auth.api.signUpEmail` (sem exigir chamador com papel de
 * plataforma — diferente de `tenantsService.create`, aqui quem chama é o
 * ADMIN DO PRÓPRIO INQUILINO, que não tem papel de plataforma nenhum) seguido
 * de `auth.api.addMember`. Se o e-mail já existe (a pessoa já tem conta em
 * outro inquilino, ou já era vendedora e virou também cliente), reaproveita a
 * conta e só cria o vínculo novo.
 */
export const usersService = {
  async list(params: {
    tenantId: string
    page: number
    perPage: number
    role?: 'admin' | 'seller' | 'client'
    accessStatus?: MemberAccessStatus
    search?: string
  }) {
    const filters: SQL[] = [eq(member.organizationId, params.tenantId)]
    if (params.role) filters.push(eq(member.role, params.role))
    if (params.accessStatus) filters.push(eq(member.accessStatus, params.accessStatus))
    if (params.search) {
      const term = `%${params.search}%`
      const match = or(ilike(user.name, term), ilike(user.email, term))
      if (match) filters.push(match)
    }
    const where = and(...filters)

    const vendido = totalVendidoPorVendedor(params.tenantId)
    const ultima = ultimaVendaPorCliente(params.tenantId)
    const login = ultimoLoginPorUsuario(params.tenantId)
    const sessao = ultimaSessaoPorUsuario(params.tenantId)

    const [rows, [totals]] = await Promise.all([
      db
        .select({
          member,
          user,
          seller: sellerProfiles,
          clientCpf: clientProfiles.cpf,
          clientContractCodigo: clientProfiles.primaryContractCodigo,
          contrato: contracts,
          totalVendido: vendido.total,
          ultimaVendaPlano: ultima.planName,
          ultimaVendaStatus: ultima.status,
          ultimaVendaValor: ultima.value,
          ultimaVendaEm: ultima.soldAt,
          ultimaVendaVendedor: ultima.sellerId,
          loginEm: login.at,
          loginUserAgent: login.userAgent,
          sessaoEm: sessao.at,
          sessaoUserAgent: sessao.userAgent,
        })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .leftJoin(
          sellerProfiles,
          and(eq(sellerProfiles.userId, member.userId), eq(sellerProfiles.organizationId, member.organizationId)),
        )
        .leftJoin(vendido, eq(vendido.sellerId, member.userId))
        .leftJoin(
          clientProfiles,
          and(eq(clientProfiles.userId, member.userId), eq(clientProfiles.organizationId, member.organizationId)),
        )
        .leftJoin(
          contracts,
          and(
            eq(contracts.organizationId, member.organizationId),
            eq(contracts.upstreamCodigo, clientProfiles.primaryContractCodigo),
          ),
        )
        .leftJoin(ultima, eq(ultima.clientUserId, member.userId))
        .leftJoin(login, eq(login.userId, member.userId))
        .leftJoin(sessao, eq(sessao.userId, member.userId))
        .where(where)
        .orderBy(desc(member.createdAt))
        .limit(params.perPage)
        .offset((params.page - 1) * params.perPage),
      db.select({ value: count() }).from(member).innerJoin(user, eq(user.id, member.userId)).where(where),
    ])

    return {
      items: rows.map(row =>
        toDomain(row.member, row.user, {
          seller: row.seller,
          totalVendido: row.totalVendido,
          clientCpf: row.clientCpf,
          clientContractCodigo: row.clientContractCodigo,
          contrato: row.contrato,
          ultimoAcesso: ultimoAcesso(row),
          ultimaVenda: row.ultimaVendaEm
            ? {
                planName: row.ultimaVendaPlano,
                status: row.ultimaVendaStatus,
                value: row.ultimaVendaValor,
                soldAt: row.ultimaVendaEm,
                sellerId: row.ultimaVendaVendedor,
              }
            : null,
        }),
      ),
      total: totals?.value ?? 0,
    }
  },

  async getById(tenantId: string, id: string): Promise<TenantUser> {
    const row = await findMembership(tenantId, id)
    if (!row) throw AppError.notFound('Usuário')

    const vendido = totalVendidoPorVendedor(tenantId)
    const ultima = ultimaVendaPorCliente(tenantId)
    const login = ultimoLoginPorUsuario(tenantId)
    const sessao = ultimaSessaoPorUsuario(tenantId)

    const [extras] = await db
      .select({
        seller: sellerProfiles,
        clientCpf: clientProfiles.cpf,
        clientContractCodigo: clientProfiles.primaryContractCodigo,
        contrato: contracts,
        totalVendido: vendido.total,
        ultimaVendaPlano: ultima.planName,
        ultimaVendaStatus: ultima.status,
        ultimaVendaValor: ultima.value,
        ultimaVendaEm: ultima.soldAt,
        ultimaVendaVendedor: ultima.sellerId,
        loginEm: login.at,
        loginUserAgent: login.userAgent,
        sessaoEm: sessao.at,
        sessaoUserAgent: sessao.userAgent,
      })
      .from(member)
      .leftJoin(
        sellerProfiles,
        and(eq(sellerProfiles.userId, member.userId), eq(sellerProfiles.organizationId, member.organizationId)),
      )
      .leftJoin(vendido, eq(vendido.sellerId, member.userId))
      .leftJoin(
        clientProfiles,
        and(eq(clientProfiles.userId, member.userId), eq(clientProfiles.organizationId, member.organizationId)),
      )
      .leftJoin(
        contracts,
        and(
          eq(contracts.organizationId, member.organizationId),
          eq(contracts.upstreamCodigo, clientProfiles.primaryContractCodigo),
        ),
      )
      .leftJoin(ultima, eq(ultima.clientUserId, member.userId))
      .leftJoin(login, eq(login.userId, member.userId))
      .leftJoin(sessao, eq(sessao.userId, member.userId))
      .where(and(eq(member.organizationId, tenantId), eq(member.userId, id)))
      .limit(1)

    return toDomain(row.member, row.user, {
      seller: extras?.seller ?? null,
      totalVendido: extras?.totalVendido ?? null,
      clientCpf: extras?.clientCpf ?? null,
      clientContractCodigo: extras?.clientContractCodigo ?? null,
      contrato: extras?.contrato ?? null,
      ultimoAcesso: extras ? ultimoAcesso(extras) : null,
      ultimaVenda: extras?.ultimaVendaEm
        ? {
            planName: extras.ultimaVendaPlano,
            status: extras.ultimaVendaStatus,
            value: extras.ultimaVendaValor,
            soldAt: extras.ultimaVendaEm,
            sellerId: extras.ultimaVendaVendedor,
          }
        : null,
    })
  },

  /**
   * Cria (ou reaproveita) a conta e o vínculo. A senha NUNCA vem de quem
   * cadastra: conta nova nasce com senha provisória gerada aqui, devolvida só
   * para o controller mandar por e-mail ao próprio usuário (convite com a
   * marca do clube) — `provisionalPassword: null` quando a conta já existia.
   */
  async create(
    tenantId: string,
    input: CreateTenantUserInput,
    opcoes: { criadoPorUserId?: string | null; semAgenteComercial?: boolean } = {},
  ): Promise<{ tenantUser: TenantUser; provisionalPassword: string | null }> {
    const email = input.email.toLowerCase()

    const [existingMembership] = await db
      .select({ userId: member.userId })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, tenantId), eq(user.email, email)))
      .limit(1)
    if (existingMembership) {
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'Já existe um usuário com este e-mail neste inquilino')
    }

    const { user: authUser, password: provisionalPassword } = await findOrCreateAuthUser(email, input.name, input.role)

    await auth.api.addMember({
      body: { userId: authUser.id, organizationId: tenantId, role: input.role },
    })

    if (input.role === 'seller') {
      await db
        .insert(sellerProfiles)
        .values({ userId: authUser.id, organizationId: tenantId })
        .onConflictDoNothing()
      // Sem perfil na Rede Comercial o vendedor entra e vê "acesso não liberado": nasce como
      // vendedor solo ativo (a Rede ajusta equipe e unidade). O cadastro pela Rede cria o dele.
      if (!opcoes.semAgenteComercial) {
        await garantirAgenteSolo({
          scope: 'tenant',
          tenantId,
          userId: authUser.id,
          nome: authUser.name || input.name,
          telefone: input.phone ?? null,
          criadoPorUserId: opcoes.criadoPorUserId ?? null,
        })
      }
    }

    // O perfil do associado só nasce com CPF porque a coluna é obrigatória —
    // é por ele que o contrato da Digital Saúde é reconciliado depois. Sem
    // CPF o cadastro existe como conta e ganha o perfil na primeira edição.
    if (input.role === 'client' && input.cpf) {
      await db
        .insert(clientProfiles)
        .values({ userId: authUser.id, organizationId: tenantId, cpf: input.cpf })
        .onConflictDoNothing()
    }

    // Telefone é da CONTA (global): só grava em conta nova — a que já existia
    // é de alguém que também está em outro lugar, e o clube não a reescreve.
    if (input.phone && provisionalPassword !== null) {
      await db.update(user).set({ phone: input.phone }).where(eq(user.id, authUser.id))
    }

    if (!input.active) {
      await db
        .update(member)
        .set({ accessStatus: 'removed', accessChangedAt: new Date() })
        .where(and(eq(member.organizationId, tenantId), eq(member.userId, authUser.id)))
    }

    return { tenantUser: await this.getById(tenantId, authUser.id), provisionalPassword }
  },

  async update(
    tenantId: string,
    id: string,
    input: UpdateTenantUserInput,
    actorUserId?: string | null,
    rules: MembershipRulesDeps = membershipRulesDb,
  ): Promise<TenantUser> {
    const row = await findMembership(tenantId, id)
    if (!row) throw AppError.notFound('Usuário')

    // Desativar ou rebaixar quem é responsável: o clube não pode ficar sem
    // nenhum admin ativo — nem quando é o próprio admin saindo.
    const deixaDeResponder =
      input.active === false || (input.role !== undefined && input.role !== 'admin')
    if (deixaDeResponder) {
      await assertKeepsResponsible(
        rules,
        tenantId,
        {
          userId: id,
          email: row.user.email,
          name: row.user.name,
          platformRole: row.user.role ?? 'user',
          tenantRole: row.member.role as MembershipTarget['tenantRole'],
          active: row.member.active,
        },
        actorUserId,
      )
    }

    // Nome/e-mail/telefone são da conta (global): só mexe quem a conta é SÓ
    // deste clube. A tela reenvia o formulário inteiro, então só conta o que
    // muda de fato.
    const identidade = changedIdentityFields(
      { name: row.user.name, email: row.user.email, phone: row.user.phone ?? null },
      input,
    )
    const alvo = { userId: id, platformRole: row.user.role ?? 'user' }
    if (identidade.length > 0) await assertTenantOwnsIdentity(rules, tenantId, alvo)

    // Associado virando equipe: mesma regra do cadastro — papel de equipe só
    // em conta que é só deste clube.
    const viraEquipe = input.role !== undefined && input.role !== 'client' && row.member.role === 'client'
    if (viraEquipe && !(await tenantOwnsIdentity(rules, tenantId, alvo))) {
      throw AppError.businessRule(SHARED_ACCOUNT_STAFF_MESSAGE)
    }

    if (identidade.length > 0) {
      const novoEmail = identidade.includes('email') ? input.email!.trim().toLowerCase() : null
      if (novoEmail) {
        const [emUso] = await db
          .select({ id: user.id })
          .from(user)
          .where(and(eq(user.email, novoEmail), ne(user.id, id)))
          .limit(1)
        if (emUso) throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'Já existe uma conta com este e-mail')
      }
      await db
        .update(user)
        .set({
          ...(identidade.includes('name') ? { name: input.name } : {}),
          // E-mail novo ainda não foi provado por ninguém: volta a "não
          // verificado" (é o que o vínculo com o Google confere).
          ...(novoEmail ? { email: novoEmail, emailVerified: false } : {}),
          ...(identidade.includes('phone') ? { phone: input.phone } : {}),
          updatedAt: new Date(),
        })
        .where(eq(user.id, id))
    }

    if (input.role !== undefined && input.role !== row.member.role) {
      // Atualização direta: é só o valor do papel, sem efeito colateral que o
      // endpoint `auth.api.updateMemberRole` resolveria por nós, e evita
      // depender de `ac`/`roles` customizados só para autorizar esta troca —
      // a autorização (só admin do inquilino chega aqui) já é feita pelo
      // middleware `requireTenantRole('admin')` da rota.
      await db
        .update(member)
        .set({ role: input.role })
        .where(and(eq(member.organizationId, tenantId), eq(member.userId, id)))
      if (input.role === 'seller') {
        await db.insert(sellerProfiles).values({ userId: id, organizationId: tenantId }).onConflictDoNothing()
        await garantirAgenteSolo({
          scope: 'tenant',
          tenantId,
          userId: id,
          nome: input.name ?? row.user.name,
          telefone: row.user.phone ?? null,
          criadoPorUserId: actorUserId ?? null,
        })
      }
    }

    if (input.cpf !== undefined && input.cpf !== null) {
      await db
        .insert(clientProfiles)
        .values({ userId: id, organizationId: tenantId, cpf: input.cpf })
        .onConflictDoUpdate({
          target: [clientProfiles.userId, clientProfiles.organizationId],
          set: { cpf: input.cpf },
        })
    }

    if (input.active === false && row.member.active && row.member.role === 'client') {
      // Desativar associado é excluí-lo: mesma regra do DELETE (cancela a
      // assinatura viva, marca `removed`, derruba as sessões).
      await cutMemberAccess(
        tenantId,
        { userId: id, platformRole: row.user.role ?? 'user' },
        'removed',
        { actorUserId: actorUserId ?? null, reason: MEMBER_REMOVED_REASON },
        { ...memberAccessDb, ...pickRules(rules) },
      )
    } else if (input.active !== undefined && input.active !== row.member.active) {
      await db
        .update(member)
        .set({ accessStatus: input.active ? 'active' : 'removed', accessChangedAt: new Date() })
        .where(and(eq(member.organizationId, tenantId), eq(member.userId, id)))
      // Desativado agora: o acesso cai na hora, não quando a sessão expirar.
      if (!input.active) {
        await revokeClubSessions(rules, tenantId, { userId: id, platformRole: row.user.role ?? 'user' })
      }
    }

    // Senha não se altera por aqui (o campo nem existe no contrato): o admin
    // usa `POST /usuarios/:id/redefinir-senha`, que gera uma provisória e a
    // envia por e-mail ao próprio usuário.

    return this.getById(tenantId, id)
  },

  /**
   * "Excluir" (`DELETE /usuarios/:id`). Nada é apagado — a conta pode ter
   * vínculo com outro inquilino, e vendas, contratos e assinaturas apontam
   * para o `userId` —, o vínculo vira `removed`:
   *  - associado: cancela a(s) assinatura(s) viva(s) no clube (cobranças
   *    abertas no gateway e cartão salvo), marca `removed` e derruba as
   *    sessões. Se ele voltar pelo site, o MESMO cadastro é reativado e ele
   *    precisa assinar de novo (`member-access.ts`);
   *  - admin/vendedor: regra de sempre — recusa (422) tirar o último
   *    responsável ativo, inclusive a si mesmo; marca `removed` e derruba as
   *    sessões.
   * Repetir num vínculo já removido é seguro (cancela o que ainda estiver
   * vivo). Excluir alguém bloqueado mantém o bloqueio.
   */
  async remove(
    tenantId: string,
    id: string,
    actorUserId?: string | null,
    deps: MemberAccessDeps & MembershipRulesDeps = { ...membershipRulesDb, ...memberAccessDb },
  ): Promise<{ tenantUser: TenantUser; result: CutAccessResult }> {
    const row = await findMembership(tenantId, id)
    if (!row) throw AppError.notFound('Usuário')
    await assertKeepsResponsible(deps, tenantId, targetOf(row), actorUserId)
    const result = await cutMemberAccess(
      tenantId,
      { userId: id, platformRole: row.user.role ?? 'user' },
      row.member.accessStatus === 'blocked' ? 'blocked' : 'removed',
      { actorUserId: actorUserId ?? null, reason: MEMBER_REMOVED_REASON },
      deps,
    )
    return { tenantUser: await this.getById(tenantId, id), result }
  },

  /**
   * Bloqueia o acesso: como excluir (assinatura viva cancelada, sessões
   * derrubadas), mas a pessoa não volta pelo site — nenhum login nem
   * recadastro com este e-mail neste clube até o desbloqueio.
   */
  async block(
    tenantId: string,
    id: string,
    actorUserId?: string | null,
    deps: MemberAccessDeps & MembershipRulesDeps = { ...membershipRulesDb, ...memberAccessDb },
  ): Promise<{ tenantUser: TenantUser; result: CutAccessResult }> {
    const row = await findMembership(tenantId, id)
    if (!row) throw AppError.notFound('Usuário')
    if (actorUserId && actorUserId === id) throw AppError.businessRule('Você não pode bloquear o próprio acesso')
    await assertKeepsResponsible(deps, tenantId, targetOf(row), actorUserId)
    const result = await cutMemberAccess(
      tenantId,
      { userId: id, platformRole: row.user.role ?? 'user' },
      'blocked',
      { actorUserId: actorUserId ?? null, reason: MEMBER_BLOCKED_REASON },
      deps,
    )
    return { tenantUser: await this.getById(tenantId, id), result }
  },

  /**
   * Desfaz o bloqueio. Associado volta para `removed` (pode voltar pelo
   * site e assinar de novo — a assinatura foi cancelada no bloqueio);
   * admin/vendedor volta para `active` (só o admin desbloqueia equipe).
   */
  async unblock(
    tenantId: string,
    id: string,
    deps: Pick<MemberAccessDeps, 'setStatus'> = memberAccessDb,
  ): Promise<{ tenantUser: TenantUser; status: MemberAccessStatus }> {
    const row = await findMembership(tenantId, id)
    if (!row) throw AppError.notFound('Usuário')
    if (row.member.accessStatus !== 'blocked') throw AppError.businessRule('Este acesso não está bloqueado')
    const status = row.member.role === 'client' ? 'removed' : 'active'
    await deps.setStatus(tenantId, id, status, new Date())
    return { tenantUser: await this.getById(tenantId, id), status }
  },
}

function targetOf(row: { member: MemberRow; user: UserRow }): MembershipTarget {
  return {
    userId: row.user.id,
    email: row.user.email,
    name: row.user.name,
    platformRole: row.user.role ?? 'user',
    tenantRole: row.member.role as MembershipTarget['tenantRole'],
    active: row.member.active,
  }
}

function pickRules(rules: MembershipRulesDeps): Pick<MemberAccessDeps, 'countOtherMemberships' | 'revokeSessions'> {
  return { countOtherMemberships: rules.countOtherMemberships, revokeSessions: rules.revokeSessions }
}

/** Vínculo entre vendedor Annetec e `Produtor` da Digital Saúde. */
export const sellersService = {
  async upstreamProdutorCodigo(tenantId: string, sellerId: string): Promise<string | null> {
    const [row] = await db
      .select({ codigo: sellerProfiles.upstreamProdutorCodigo })
      .from(sellerProfiles)
      .where(and(eq(sellerProfiles.userId, sellerId), eq(sellerProfiles.organizationId, tenantId)))
      .limit(1)
    return row?.codigo ?? null
  },

  async upstreamProdutorCredentials(tenantId: string, sellerId: string) {
    const [row] = await db
      .select({
        login: sellerProfiles.upstreamProdutorLogin,
        password: sellerProfiles.upstreamProdutorPasswordEncrypted,
      })
      .from(sellerProfiles)
      .where(and(eq(sellerProfiles.userId, sellerId), eq(sellerProfiles.organizationId, tenantId)))
      .limit(1)

    if (!row?.login || !row.password) return null
    return { login: row.login, password: decryptSecret(row.password) }
  },

  /**
   * Vincula o vendedor a um produtor existente no ERP, conferindo o código
   * antes de gravar — assim um código digitado errado falha na configuração e
   * não na hora de fechar uma venda.
   */
  async linkProdutor(
    tenantId: string,
    sellerId: string,
    input: { codigo: string; login?: string; password?: string },
  ) {
    const client = await getDigitalSaudeClient(tenantId)
    const produtor = await client.one('produtorPorCodigo', { codigoProdutor: input.codigo })
    if (!produtor) throw AppError.notFound('Produtor na Digital Saúde')

    await db
      .insert(sellerProfiles)
      .values({
        userId: sellerId,
        organizationId: tenantId,
        upstreamProdutorCodigo: input.codigo,
        upstreamProdutorLogin: input.login ?? null,
        upstreamProdutorPasswordEncrypted: input.password ? encryptSecret(input.password) : null,
      })
      .onConflictDoUpdate({
        target: [sellerProfiles.userId, sellerProfiles.organizationId],
        set: {
          upstreamProdutorCodigo: input.codigo,
          ...(input.login !== undefined ? { upstreamProdutorLogin: input.login } : {}),
          ...(input.password !== undefined
            ? { upstreamProdutorPasswordEncrypted: encryptSecret(input.password) }
            : {}),
        },
      })

    return { codigo: input.codigo, nome: produtor.nome ?? null }
  },

  /** Cria o produtor no ERP e já vincula ao vendedor. */
  async createProdutor(
    tenantId: string,
    sellerId: string,
    input: { nome: string; email: string; numeroDocumento?: string; grupoProdutorCodigo: string },
  ) {
    const client = await getDigitalSaudeClient(tenantId)
    const result = await client.call('produtorIncluir', {
      nome: input.nome,
      email: input.email,
      numeroDocumento: input.numeroDocumento,
      grupoProdutor: { codigo: input.grupoProdutorCodigo },
    })

    const codigo = result[0]?.codigo
    if (!codigo) throw AppError.businessRule('A Digital Saúde não retornou o código do produtor')

    await this.linkProdutor(tenantId, sellerId, { codigo })
    return { codigo, nome: result[0]?.nome ?? input.nome }
  },
}

/**
 * Reaproveita a conta se o e-mail já existir (a pessoa continua com a senha
 * que já tem: `password: null`); senão cria uma nova com senha provisória
 * gerada aqui. Conta da equipe da plataforma nunca vira membro de clube por
 * esta rota — misturaria o escopo de plataforma com o do inquilino.
 *
 * Conta que já existe e tem vínculo com OUTRO clube só entra aqui como
 * associado (a mesma pessoa pode ser associada de dois clubes). Papel de
 * equipe nunca: o admin deste clube ganharia poder sobre uma conta que não é
 * dele — e ela passaria a abrir no painel deste clube.
 */
async function findOrCreateAuthUser(email: string, name: string, role: 'admin' | 'seller' | 'client') {
  const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1)
  if (existing) {
    if (existing.role !== 'user') {
      throw AppError.forbidden('Este e-mail pertence a uma conta da equipe da plataforma e não pode ser cadastrado no clube')
    }
    if (role !== 'client') {
      // `create` já recusou vínculo com ESTE clube: qualquer um aqui é de outro.
      const [outro] = await db.select({ id: member.id }).from(member).where(eq(member.userId, existing.id)).limit(1)
      if (outro) throw AppError.businessRule(SHARED_ACCOUNT_STAFF_MESSAGE)
    }
    return { user: existing, password: null }
  }

  const password = generateProvisionalPassword()
  const signUp = await auth.api.signUpEmail({ body: { email, name, password } })
  return { user: signUp.user, password }
}

function findMembership(tenantId: string, userId: string) {
  return db
    .select({ member, user })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, tenantId), eq(member.userId, userId)))
    .limit(1)
    .then(rows => rows[0])
}

/**
 * Login mais recente da pessoa NESTE inquilino, pela trilha de atividade
 * (`activity_events`, ação `login`) — que, ao contrário de `session`, não é
 * apagada quando a sessão expira.
 */
export function ultimoLoginPorUsuario(tenantId: string) {
  return db
    .selectDistinctOn([activityEvents.actorUserId], {
      userId: activityEvents.actorUserId,
      at: activityEvents.createdAt,
      userAgent: activityEvents.userAgent,
    })
    .from(activityEvents)
    .where(and(eq(activityEvents.tenantId, tenantId), eq(activityEvents.action, 'login')))
    .orderBy(activityEvents.actorUserId, desc(activityEvents.createdAt))
    .as('ultimo_login_por_usuario')
}

/**
 * Sessão mais recente da pessoa neste inquilino — cobre os logins que não
 * passam pela trilha (portal do associado por CPF, Google). Impersonação da
 * equipe Annetec não conta como acesso da pessoa.
 */
export function ultimaSessaoPorUsuario(tenantId: string) {
  return db
    .selectDistinctOn([session.userId], {
      userId: session.userId,
      at: session.createdAt,
      userAgent: session.userAgent,
    })
    .from(session)
    .where(and(eq(session.activeOrganizationId, tenantId), isNull(session.impersonatedBy)))
    .orderBy(session.userId, desc(session.createdAt))
    .as('ultima_sessao_por_usuario')
}

/** O mais recente entre login registrado e sessão aberta; `null` se nenhum. */
export function ultimoAcesso(row: {
  loginEm: Date | null
  loginUserAgent: string | null
  sessaoEm: Date | null
  sessaoUserAgent: string | null
}): { at: Date; userAgent: string | null } | null {
  const login = row.loginEm ? { at: row.loginEm, userAgent: row.loginUserAgent } : null
  const sessao = row.sessaoEm ? { at: row.sessaoEm, userAgent: row.sessaoUserAgent } : null
  if (!login) return sessao
  if (!sessao) return login
  return sessao.at > login.at ? sessao : login
}

type MemberRow = typeof member.$inferSelect
type UserRow = typeof user.$inferSelect
type SellerRow = typeof sellerProfiles.$inferSelect
type ContractRow = typeof contracts.$inferSelect

/**
 * Total vendido por vendedor no inquilino, como subconsulta agrupada para
 * juntar na listagem.
 *
 * Só conta venda CONFIRMADA: pendente ainda pode não fechar e cancelada não
 * fechou — somá-las inflaria o desempenho do vendedor e, pior, a comissão
 * exibida ao lado. E é calculado a cada leitura em vez de guardado numa
 * coluna justamente porque uma venda pode ser cancelada ou corrigida depois;
 * um acumulado gravado envelheceria em silêncio.
 */
function totalVendidoPorVendedor(tenantId: string) {
  return db
    .select({
      sellerId: sales.sellerId,
      total: sql<string>`sum(${sales.value})`.as('total_vendido'),
    })
    .from(sales)
    .where(and(eq(sales.organizationId, tenantId), eq(sales.status, 'confirmed')))
    .groupBy(sales.sellerId)
    .as('total_vendido_por_vendedor')
}

/**
 * Venda mais recente de cada associado. `selectDistinctOn` + `order by` traz
 * exatamente uma linha por cliente, o que importa aqui: um `leftJoin` que
 * devolvesse duas vendas duplicaria a PESSOA na listagem de usuários.
 *
 * Serve de origem alternativa do plano quando não existe contrato espelhado —
 * ver `source` em `tenantUserClientProfile`.
 */
function ultimaVendaPorCliente(tenantId: string) {
  return db
    .selectDistinctOn([sales.clientUserId], {
      clientUserId: sales.clientUserId,
      planName: sales.planName,
      status: sales.status,
      value: sales.value,
      soldAt: sales.soldAt,
      sellerId: sales.sellerId,
    })
    .from(sales)
    .where(eq(sales.organizationId, tenantId))
    .orderBy(sales.clientUserId, desc(sales.soldAt))
    .as('ultima_venda_por_cliente')
}

interface Extras {
  seller: SellerRow | null
  totalVendido: string | null
  clientCpf: string | null
  clientContractCodigo: string | null
  contrato: ContractRow | null
  ultimoAcesso: { at: Date; userAgent: string | null } | null
  ultimaVenda: {
    planName: string | null
    status: 'pending' | 'confirmed' | 'cancelled' | null
    value: string | null
    soldAt: Date
    sellerId: string | null
  } | null
}

function toDomain(memberRow: MemberRow, userRow: UserRow, extras: Extras): TenantUser {
  const role = memberRow.role as TenantUser['role']
  return {
    id: userRow.id,
    tenantId: memberRow.organizationId,
    name: userRow.name,
    email: userRow.email,
    role,
    phone: userRow.phone ?? null,
    avatarUrl: userRow.image,
    active: memberRow.active,
    accessStatus: memberRow.accessStatus,
    createdAt: memberRow.createdAt.toISOString(),
    lastLoginAt: extras.ultimoAcesso?.at.toISOString() ?? null,
    lastLoginUserAgent: extras.ultimoAcesso?.userAgent ?? null,
    banned: Boolean(userRow.banned),
    upstreamProdutorCodigo: extras.seller?.upstreamProdutorCodigo ?? null,
    // A senha cifrada nunca sai daqui — só se ela existe.
    hasProdutorCredentials: Boolean(extras.seller?.upstreamProdutorPasswordEncrypted),
    sellerProfile: role === 'seller' ? perfilVendedor(extras) : null,
    clientProfile: role === 'client' ? perfilAssociado(extras) : null,
  }
}

function perfilVendedor(extras: Extras): TenantUser['sellerProfile'] {
  return {
    region: extras.seller?.region ?? null,
    salesGoal: Number(extras.seller?.salesGoal ?? 0),
    commissionRate: Number(extras.seller?.commissionRate ?? 0),
    totalSales: Number(extras.totalVendido ?? 0),
  }
}

/**
 * Contrato ganha do registro de venda quando existe: ele é o espelho da
 * Digital Saúde, e é lá que o plano do associado de fato vive. A venda entra
 * como origem secundária para o inquilino que ainda não integrou o ERP — sem
 * ela, a carteira inteira apareceria sem plano na tela.
 */
function perfilAssociado(extras: Extras): TenantUser['clientProfile'] {
  const base = { cpf: extras.clientCpf ?? null }
  const contrato = extras.contrato

  if (contrato) {
    return {
      ...base,
      source: 'contrato',
      primaryContractCodigo: extras.clientContractCodigo ?? contrato.upstreamCodigo,
      planName: contrato.planName,
      planStatus: situacaoDoContrato(contrato.status),
      contractStatus: contrato.status,
      contractSignedAt: contrato.signedAt,
      cardNumber: contrato.upstreamCodigo,
      monthlyValue: contrato.monthlyValue === null ? null : Number(contrato.monthlyValue),
      sellerUserId: contrato.sellerUserId ?? extras.ultimaVenda?.sellerId ?? null,
    }
  }

  const venda = extras.ultimaVenda
  if (venda) {
    return {
      ...base,
      source: 'venda',
      primaryContractCodigo: extras.clientContractCodigo ?? null,
      planName: venda.planName,
      planStatus: venda.status === 'confirmed' ? 'active' : venda.status,
      contractStatus: null,
      contractSignedAt: venda.soldAt.toISOString(),
      // Sem contrato não há carteirinha: o número é emitido pela Digital
      // Saúde, e um gerado aqui não seria reconhecido em parceiro nenhum.
      cardNumber: null,
      monthlyValue: venda.value === null ? null : Number(venda.value),
      sellerUserId: venda.sellerId,
    }
  }

  return {
    ...base,
    source: null,
    primaryContractCodigo: extras.clientContractCodigo ?? null,
    planName: null,
    planStatus: null,
    contractStatus: null,
    contractSignedAt: null,
    cardNumber: null,
    monthlyValue: null,
    sellerUserId: null,
  }
}

/** Reduz o vocabulário do ERP aos três estados que a tela mostra. */
function situacaoDoContrato(status: ContractRow['status']): 'active' | 'pending' | 'cancelled' {
  switch (status) {
    case 'ativo':
      return 'active'
    case 'cancelado':
    case 'suspenso':
      return 'cancelled'
    default:
      return 'pending'
  }
}
