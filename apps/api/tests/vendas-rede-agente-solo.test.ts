import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Vendedor criado pela tela de Usuários (clube: `seller`; plataforma: `platform_seller`)
 * nasce com perfil na Rede Comercial (vendedor solo ativo, com código de indicação).
 * Sem a linha em `vendas_agentes` ele entrava e via "acesso não liberado".
 *
 * Banco em memória e Better Auth falso (só grava `user` e `member`, como o real).
 */

const memory = vi.hoisted(() => ({ db: null as unknown as Record<string, unknown>, contador: 0 }))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { createMemoryDb } = await import('./helpers/memory-db')
  const instance = createMemoryDb({
    tables: [
      schema.user,
      schema.member,
      schema.sellerProfiles,
      schema.clientProfiles,
      schema.platformSellers,
      schema.vendasAgentes,
      schema.session,
    ],
    uniques: [
      { table: schema.vendasAgentes, keys: ['codigoIndicacao'] },
      { table: schema.vendasAgentes, keys: ['userId', 'scope'] },
      { table: schema.user, keys: ['email'] },
    ],
  })
  memory.db = instance as unknown as Record<string, unknown>
  return { db: instance.db, sql: { end: async () => {} }, schema }
})

vi.mock('@/lib/auth', async () => {
  const schema = await import('@/db/schema')
  const mem = () => memory.db as unknown as import('./helpers/memory-db').MemoryDb
  return {
    auth: {
      api: {
        signUpEmail: async ({ body }: { body: { email: string; name: string } }) => {
          memory.contador += 1
          const row = mem().insertRow(schema.user, { id: `u-${memory.contador}`, name: body.name, email: body.email, role: 'user' })
          return { user: row }
        },
        addMember: async ({ body }: { body: { userId: string; organizationId: string; role: string } }) => {
          memory.contador += 1
          mem().insertRow(schema.member, { id: `m-${memory.contador}`, organizationId: body.organizationId, userId: body.userId, role: body.role, accessStatus: 'active' })
        },
        createUser: async ({ body }: { body: { email: string; name: string; role: string; data?: { phone?: string } } }) => {
          memory.contador += 1
          const row = mem().insertRow(schema.user, { id: `p-${memory.contador}`, name: body.name, email: body.email, role: body.role, phone: body.data?.phone ?? null })
          return { user: row }
        },
      },
    },
  }
})

vi.mock('@/modules/club-billing/access.service', () => ({ loadClubAccess: vi.fn() }))

const schema = await import('@/db/schema')
const { usersService } = await import('@/modules/users/service')
const { platformUsersService } = await import('@/modules/platform-users/service')
const { garantirAgenteSolo } = await import('@/modules/vendas-rede/agente-solo')

type Memory = import('./helpers/memory-db').MemoryDb
const mem = () => memory.db as unknown as Memory
const agentes = () => mem().rows(schema.vendasAgentes) as Record<string, any>[]

const ORG = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  mem().reset()
  memory.contador = 0
  // A leitura de volta (`getById`) monta joins que o banco em memória não executa: o teste olha só as escritas.
  vi.spyOn(usersService, 'getById').mockImplementation(async (_tenantId: string, id: string) => ({ id }) as never)
})

describe('vendedor criado por Usuários ganha perfil na Rede Comercial', () => {
  it('clube: seller vira vendedor solo ativo, com código, no escopo do clube', async () => {
    const { tenantUser } = await usersService.create(
      ORG,
      { name: 'Maria Vendedora', email: 'maria@clube.test', phone: '21999990000', role: 'seller', active: true } as never,
      { criadoPorUserId: 'admin-1' },
    )
    expect(agentes()).toHaveLength(1)
    expect(agentes()[0]!).toMatchObject({
      scope: 'tenant',
      tenantId: ORG,
      userId: tenantUser.id,
      papel: 'vendedor',
      ativo: true,
      corretoraId: null,
      unidadeId: null,
      equipeId: null,
      nome: 'Maria Vendedora',
      telefone: '21999990000',
      criadoPorUserId: 'admin-1',
    })
    expect(agentes()[0]!.codigoIndicacao).toMatch(/^[A-Z0-9]{6,8}$/)
  })

  it('clube: admin e associado não ganham perfil de vendas', async () => {
    await usersService.create(ORG, { name: 'Ana Admin', email: 'ana@clube.test', role: 'admin', active: true } as never)
    await usersService.create(ORG, { name: 'Caio Cliente', email: 'caio@clube.test', role: 'client', active: true } as never)
    expect(agentes()).toHaveLength(0)
  })

  it('clube: o cadastro pela Rede (semAgenteComercial) não duplica o perfil', async () => {
    await usersService.create(ORG, { name: 'Rede Vendedor', email: 'rede@clube.test', role: 'seller', active: true } as never, { semAgenteComercial: true })
    expect(agentes()).toHaveLength(0)
  })

  it('plataforma: platform_seller vira vendedor solo ativo, com o mesmo código do cadastro antigo', async () => {
    const criado = await platformUsersService.create(
      { name: 'João da Silva', email: 'joao@annetec.test', password: 'Senha-Forte-123', role: 'platform_seller', phone: '11988887777' } as never,
      { createdByUserId: 'super-1' },
    )
    expect(agentes()).toHaveLength(1)
    const [perfil] = mem().rows(schema.platformSellers) as Record<string, any>[]
    expect(agentes()[0]!).toMatchObject({ scope: 'platform', tenantId: null, userId: criado.id, papel: 'vendedor', ativo: true, nome: 'João da Silva', telefone: '11988887777' })
    expect(agentes()[0]!.codigoIndicacao).toBe(String(perfil!.referralCode).toUpperCase())
  })

  it('plataforma: superadmin não ganha perfil; semAgenteComercial pula', async () => {
    await platformUsersService.create({ name: 'Super', email: 'super@annetec.test', password: 'Senha-Forte-123', role: 'superadmin' } as never)
    await platformUsersService.create(
      { name: 'Vendedor da Rede', email: 'rede@annetec.test', password: 'Senha-Forte-123', role: 'platform_seller' } as never,
      { referralCode: 'abc2345', semAgenteComercial: true },
    )
    expect(agentes()).toHaveLength(0)
  })
})

describe('garantirAgenteSolo', () => {
  it('é idempotente e nunca altera um perfil existente', async () => {
    mem().insertRow(schema.user, { id: 'u-x', name: 'X', email: 'x@x.test', role: 'user' })
    const primeiro = await garantirAgenteSolo({ scope: 'tenant', tenantId: ORG, userId: 'u-x', nome: 'X' })
    agentes()[0]!.ativo = false
    const segundo = await garantirAgenteSolo({ scope: 'tenant', tenantId: ORG, userId: 'u-x', nome: 'Outro nome' })
    expect(segundo.id).toBe(primeiro.id)
    expect(agentes()).toHaveLength(1)
    expect(agentes()[0]!).toMatchObject({ ativo: false, nome: 'X' })
  })

  it('código preferido ocupado cai para um código novo', async () => {
    mem().insertRow(schema.user, { id: 'u-a', name: 'A', email: 'a@x.test', role: 'user' })
    mem().insertRow(schema.user, { id: 'u-b', name: 'B', email: 'b@x.test', role: 'user' })
    const a = await garantirAgenteSolo({ scope: 'platform', tenantId: null, userId: 'u-a', nome: 'A', codigoPreferido: 'joao-silva' })
    const b = await garantirAgenteSolo({ scope: 'platform', tenantId: null, userId: 'u-b', nome: 'B', codigoPreferido: 'joao-silva' })
    expect(a.codigoIndicacao).toBe('JOAO-SILVA')
    expect(b.codigoIndicacao).not.toBe('JOAO-SILVA')
  })
})
