import {
  ERROR_CODES,
  type CreateTenantUserInput,
  type TenantUser,
  type UpdateTenantUserInput,
} from '@annetec/contracts'
import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { clientProfiles, contracts, member, sales, sellerProfiles, user } from '@/db/schema'
import { AppError } from '@/http/errors'
import { auth } from '@/lib/auth'
import { decryptSecret, encryptSecret } from '@/lib/crypto'
import { getDigitalSaudeClient } from '@/integrations/digitalsaude/provider'

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
    search?: string
  }) {
    const filters: SQL[] = [eq(member.organizationId, params.tenantId)]
    if (params.role) filters.push(eq(member.role, params.role))
    if (params.search) {
      const term = `%${params.search}%`
      const match = or(ilike(user.name, term), ilike(user.email, term))
      if (match) filters.push(match)
    }
    const where = and(...filters)

    const vendido = totalVendidoPorVendedor(params.tenantId)
    const ultima = ultimaVendaPorCliente(params.tenantId)

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
      .where(and(eq(member.organizationId, tenantId), eq(member.userId, id)))
      .limit(1)

    return toDomain(row.member, row.user, {
      seller: extras?.seller ?? null,
      totalVendido: extras?.totalVendido ?? null,
      clientCpf: extras?.clientCpf ?? null,
      clientContractCodigo: extras?.clientContractCodigo ?? null,
      contrato: extras?.contrato ?? null,
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

  async create(tenantId: string, input: CreateTenantUserInput): Promise<TenantUser> {
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

    const authUser = await findOrCreateAuthUser(email, input.name, input.password)

    await auth.api.addMember({
      body: { userId: authUser.id, organizationId: tenantId, role: input.role },
    })

    if (input.role === 'seller') {
      await db
        .insert(sellerProfiles)
        .values({ userId: authUser.id, organizationId: tenantId })
        .onConflictDoNothing()
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

    if (input.phone) {
      await db.update(user).set({ phone: input.phone }).where(eq(user.id, authUser.id))
    }

    if (!input.active) {
      await db
        .update(member)
        .set({ active: false })
        .where(and(eq(member.organizationId, tenantId), eq(member.userId, authUser.id)))
    }

    return this.getById(tenantId, authUser.id)
  },

  async update(tenantId: string, id: string, input: UpdateTenantUserInput): Promise<TenantUser> {
    const row = await findMembership(tenantId, id)
    if (!row) throw AppError.notFound('Usuário')

    if (input.name !== undefined || input.email !== undefined || input.phone !== undefined) {
      await db
        .update(user)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.email !== undefined ? { email: input.email.toLowerCase() } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
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

    if (input.active !== undefined) {
      await db
        .update(member)
        .set({ active: input.active })
        .where(and(eq(member.organizationId, tenantId), eq(member.userId, id)))
    }

    if (input.password) {
      // Troca de senha por terceiro dentro do inquilino usa o fluxo de
      // "esqueci minha senha" (e-mail) — `admin.setUserPassword` é só para a
      // equipe Annetec (plataforma) resetar senha de qualquer conta.
      throw AppError.businessRule('Use o fluxo de redefinição de senha para alterar a senha de outro usuário')
    }

    return this.getById(tenantId, id)
  },

  /**
   * Remove o vínculo com o inquilino. A conta Better Auth em si não é
   * apagada — pode ter vínculo com outro inquilino, ou o histórico de vendas
   * e contratos aponta para o `userId` por chave estrangeira.
   */
  async deactivate(tenantId: string, id: string): Promise<TenantUser> {
    return this.update(tenantId, id, { active: false })
  },
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

/** Reaproveita a conta se o e-mail já existir; senão cria uma nova. */
async function findOrCreateAuthUser(email: string, name: string, password?: string) {
  const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1)
  if (existing) return existing

  const signUp = await auth.api.signUpEmail({
    body: { email, name, password: password ?? generateProvisionalPassword() },
  })
  return signUp.user
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

function generateProvisionalPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('')
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
    createdAt: memberRow.createdAt.toISOString(),
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
