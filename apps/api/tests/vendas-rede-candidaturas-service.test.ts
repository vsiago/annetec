import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLUBE_A, CLUBE_B, ID, semearRede, uid } from './helpers/vendas-world'

/**
 * Candidaturas da Rede Comercial (serviço) com banco EM MEMÓRIA: início de rascunho
 * (indicador do mesmo escopo, honeypot, dedupe de e-mail em análise), bloqueio de
 * edição fora do rascunho, envio (pendências, assinatura, aceite, notificação e
 * e-mail), aprovação (criação de agente/corretora, reversão em erro) e recusa,
 * além do isolamento entre escopos na gestão.
 */

const memory = vi.hoisted(() => ({ db: null as null | Record<string, unknown> }))
const fakes = vi.hoisted(() => ({
  sendEmail: vi.fn(async (_input: Record<string, any>) => ({ id: 'email-1', status: 'simulated' as const })),
  notify: vi.fn(async (_input: unknown) => 1),
  criarAgente: vi.fn(),
  criarCorretora: vi.fn(),
  criarGerenteDaCorretora: vi.fn(),
  removerCorretora: vi.fn(async (..._args: unknown[]) => ({})),
}))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { createMemoryDb } = await import('./helpers/memory-db')
  const instance = createMemoryDb({
    tables: [
      schema.user,
      schema.vendasCorretoras,
      schema.vendasEquipes,
      schema.vendasAgentes,
      schema.platformFiles,
      schema.vendasCandidaturas,
      schema.vendasCandidaturaDocumentos,
    ],
    uniques: [
      {
        table: schema.vendasCandidaturas,
        keys: ['scope', 'tenantId', 'email'],
        where: row => row.status === 'recebida',
      },
    ],
  })
  memory.db = instance as unknown as Record<string, unknown>
  return { db: instance.db, sql: { end: async () => {} }, schema }
})
vi.mock('@/lib/email', () => ({ sendEmail: (input: Record<string, any>) => fakes.sendEmail(input) }))
vi.mock('@/lib/notifications', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/notifications')>()),
  notify: (input: unknown) => fakes.notify(input),
}))
vi.mock('@/modules/users/access.service', () => ({
  loadClubBrand: vi.fn(async () => ({ name: 'Clube A', slug: 'clube-a', primaryColor: '#123456', logoUrl: null })),
}))
vi.mock('@/modules/vendas-rede/rede.service', () => ({
  criarAgente: (...args: unknown[]) => fakes.criarAgente(...args),
  criarCorretora: (...args: unknown[]) => fakes.criarCorretora(...args),
  criarGerenteDaCorretora: (...args: unknown[]) => fakes.criarGerenteDaCorretora(...args),
  removerCorretora: (...args: unknown[]) => fakes.removerCorretora(...args),
}))

const schema = await import('@/db/schema')
const service = await import('@/modules/vendas-rede/candidaturas.service')
const { isValidCandidaturaAccessKey } = await import('@/modules/vendas-rede/candidaturas-access-key')

type Memory = import('./helpers/memory-db').MemoryDb
const mem = () => memory.db as unknown as Memory

const PLATAFORMA: import('@/modules/vendas-rede/candidaturas.service').EscopoCandidatura = { scope: 'platform', tenantId: null, tenantSlug: null }
const TENANT_A: import('@/modules/vendas-rede/candidaturas.service').EscopoCandidatura = { scope: 'tenant', tenantId: CLUBE_A.id, tenantSlug: CLUBE_A.slug }
const TENANT_B: import('@/modules/vendas-rede/candidaturas.service').EscopoCandidatura = { scope: 'tenant', tenantId: CLUBE_B.id, tenantSlug: CLUBE_B.slug }

const META = { ip: '203.0.113.7', userAgent: 'vitest' }
const ENDERECO = { cep: '20000000', logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Rio de Janeiro', uf: 'RJ' as const }

function ctxMaster(escopo: typeof PLATAFORMA) {
  return {
    scope: escopo.scope,
    tenantId: escopo.tenantId,
    tenantSlug: escopo.tenantSlug,
    userId: 'u-master',
    userName: 'Master',
    agente: null,
    papel: 'master' as const,
    masterImplicito: true,
    podeEscrever: true,
    visibilidade: { tudo: true },
  } as unknown as import('@/modules/vendas-rede/context').VendasCtx
}

const entrada = (extra: Record<string, unknown> = {}) => ({
  tipoPessoa: 'pf' as const,
  atuacao: 'vendedor_solo' as const,
  nome: 'Maria da Silva',
  email: 'maria@exemplo.com',
  telefone: '11988887777',
  cpf: '52998224725',
  ...extra,
})

function semearCandidatura(extra: Record<string, unknown> = {}, escopo: typeof PLATAFORMA = PLATAFORMA) {
  return mem().insertRow(schema.vendasCandidaturas, {
    id: uid(9000 + mem().rows(schema.vendasCandidaturas).length + 1),
    scope: escopo.scope,
    tenantId: escopo.tenantId,
    status: 'rascunho',
    tipoPessoa: 'pf',
    atuacao: 'vendedor_solo',
    nome: 'Maria da Silva',
    email: `pessoa${mem().rows(schema.vendasCandidaturas).length}@exemplo.com`,
    telefone: '11988887777',
    cpf: '52998224725',
    endereco: ENDERECO,
    ...extra,
  }) as { id: string; status: string; [k: string]: any }
}

function semearDocumentos(candidaturaId: string, kinds: string[]) {
  for (const kind of kinds) {
    const fileId = uid(8000 + mem().rows(schema.platformFiles).length + 1)
    mem().insertRow(schema.platformFiles, { id: fileId, fileName: `${kind}.pdf`, mimeType: 'application/pdf', sizeBytes: 1234 })
    mem().insertRow(schema.vendasCandidaturaDocumentos, { candidaturaId, kind, fileId })
  }
}

const candidatura = (id: string) => mem().rows(schema.vendasCandidaturas).find(row => row.id === id) as Record<string, any>
const rascunhoPronto = (extra: Record<string, unknown> = {}, escopo: typeof PLATAFORMA = PLATAFORMA) => {
  const row = semearCandidatura(extra, escopo)
  semearDocumentos(row.id, ['documento_identidade', 'comprovante_endereco'])
  return row
}

beforeEach(() => {
  mem().reset()
  semearRede(mem(), schema)
  vi.clearAllMocks()
  fakes.criarAgente.mockResolvedValue({
    agente: { id: uid(7001) },
    convite: { enviado: true, status: 'simulated', contaNova: true },
  })
  fakes.criarCorretora.mockResolvedValue({ id: uid(7100) })
  fakes.criarGerenteDaCorretora.mockResolvedValue({
    agente: { id: uid(7002) },
    convite: { enviado: true, status: 'simulated', contaNova: true },
  })
})

describe('iniciar', () => {
  it('grava o rascunho, devolve chave válida e resolve o indicador do mesmo escopo', async () => {
    const resultado = await service.iniciarCandidatura(PLATAFORMA, entrada({ atuacao: 'vendedor_equipe', codigoIndicacao: 'sup0001' }), META)
    expect(isValidCandidaturaAccessKey(resultado.id, resultado.chave)).toBe(true)
    expect(resultado.acompanhamentoPath).toBe(`/seja-parceiro/${resultado.id}?chave=${resultado.chave}`)
    const row = candidatura(resultado.id)
    expect(row).toMatchObject({
      status: 'rascunho',
      scope: 'platform',
      tenantId: null,
      email: 'maria@exemplo.com',
      indicadoPorAgenteId: ID.supervisor1,
      codigoIndicacao: 'SUP0001',
      origemIp: '203.0.113.7',
    })
    const publica = await service.obterCandidaturaPublica(PLATAFORMA, resultado.id)
    expect(publica.indicadoPor).toEqual({ nome: 'Supervisor Um', papel: 'supervisor' })
    expect(publica.pendencias).toContain('Preencha o endereço completo')
  })

  it('no clube, o caminho de acompanhamento leva o slug', async () => {
    const resultado = await service.iniciarCandidatura(TENANT_A, entrada(), META)
    expect(resultado.acompanhamentoPath).toBe(`/clube-a/seja-parceiro/${resultado.id}?chave=${resultado.chave}`)
    expect(candidatura(resultado.id)).toMatchObject({ scope: 'tenant', tenantId: CLUBE_A.id })
  })

  it('recusa código de outro clube e de outro escopo (erro no campo codigoIndicacao)', async () => {
    const dadosEquipe = { atuacao: 'vendedor_equipe' as const }
    // Vendedor do clube B no clube A.
    await expect(service.iniciarCandidatura(TENANT_A, entrada({ ...dadosEquipe, codigoIndicacao: 'CLB0001' }), META)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      issues: [{ path: 'codigoIndicacao' }],
    })
    // Código da plataforma no clube A, e código do clube A na plataforma.
    await expect(service.iniciarCandidatura(TENANT_A, entrada({ ...dadosEquipe, codigoIndicacao: 'SUP0001' }), META)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(service.iniciarCandidatura(PLATAFORMA, entrada({ ...dadosEquipe, codigoIndicacao: 'CLA0001' }), META)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(mem().rows(schema.vendasCandidaturas)).toHaveLength(0)
    // Do próprio clube passa.
    const ok = await service.iniciarCandidatura(TENANT_A, entrada({ ...dadosEquipe, codigoIndicacao: 'CLA0001' }), META)
    expect(candidatura(ok.id).indicadoPorAgenteId).toBe(ID.vendedorA)
  })

  it('honeypot preenchido responde como sucesso e não grava nada', async () => {
    const resultado = await service.iniciarCandidatura(PLATAFORMA, entrada({ website: 'http://spam.test' }), META)
    expect(resultado.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(resultado.chave).toMatch(/^[0-9a-f]{32}$/)
    expect(mem().rows(schema.vendasCandidaturas)).toHaveLength(0)
  })

  it('e-mail com candidatura em análise no escopo = 409; em outro escopo pode', async () => {
    semearCandidatura({ status: 'recebida', email: 'maria@exemplo.com' })
    await expect(service.iniciarCandidatura(PLATAFORMA, entrada({ email: 'MARIA@exemplo.com' }), META)).rejects.toMatchObject({
      code: 'ALREADY_EXISTS',
      message: expect.stringMatching(/em análise/),
    })
    await expect(service.iniciarCandidatura(TENANT_A, entrada(), META)).resolves.toBeTruthy()
  })
})

describe('rascunho', () => {
  it('salvarDados atualiza endereço e dados extras; fora do rascunho = 409', async () => {
    const row = semearCandidatura({ endereco: null })
    const publica = await service.salvarDadosCandidatura(PLATAFORMA, row.id, {
      atuacao: 'supervisor',
      endereco: ENDERECO,
      dataNascimento: '1990-05-10',
      experiencia: 'Cinco anos em vendas',
    })
    expect(publica).toMatchObject({ atuacao: 'supervisor', dataNascimento: '1990-05-10', experiencia: 'Cinco anos em vendas' })
    expect(publica.endereco?.cidade).toBe('Rio de Janeiro')

    const enviada = semearCandidatura({ status: 'recebida' })
    await expect(service.salvarDadosCandidatura(PLATAFORMA, enviada.id, { atuacao: 'supervisor', endereco: ENDERECO })).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('PJ exige razão social e nome fantasia; corretora exige PJ', async () => {
    const pj = semearCandidatura({ tipoPessoa: 'pj', cnpj: '11222333000181', atuacao: 'corretora' })
    await expect(service.salvarDadosCandidatura(PLATAFORMA, pj.id, { atuacao: 'corretora', endereco: ENDERECO })).rejects.toMatchObject({
      issues: [{ path: 'razaoSocial' }],
    })
    const pf = semearCandidatura({ email: 'pf@exemplo.com' })
    await expect(service.salvarDadosCandidatura(PLATAFORMA, pf.id, { atuacao: 'corretora', endereco: ENDERECO })).rejects.toMatchObject({
      issues: [{ path: 'atuacao' }],
    })
  })

  it('candidatura de outro escopo é 404', async () => {
    const row = semearCandidatura({}, TENANT_A)
    await expect(service.obterCandidaturaPublica(PLATAFORMA, row.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(service.obterCandidaturaPublica(TENANT_B, row.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(service.obterCandidaturaPublica(TENANT_A, row.id)).resolves.toMatchObject({ id: row.id })
  })

  it('recuperar acesso manda o link só se existir rascunho ou análise com o e-mail', async () => {
    semearCandidatura({ email: 'achou@exemplo.com' })
    await service.recuperarAcessoCandidatura(PLATAFORMA, 'ninguem@exemplo.com')
    expect(fakes.sendEmail).not.toHaveBeenCalled()
    await service.recuperarAcessoCandidatura(PLATAFORMA, 'ACHOU@exemplo.com')
    expect(fakes.sendEmail).toHaveBeenCalledTimes(1)
    const enviado = fakes.sendEmail.mock.calls[0]![0]
    expect(enviado.template).toBe('vendas_candidatura_recebida')
    expect(enviado.data).toMatchObject({ clubName: 'ANNETEC', variante: 'acesso' })
    expect(enviado.data.acompanhamentoUrl).toMatch(/\/seja-parceiro\/.+\?chave=/)
  })
})

describe('enviar', () => {
  it('com pendências = 422 listando o que falta', async () => {
    const row = semearCandidatura()
    await expect(service.enviarCandidatura(PLATAFORMA, row.id, { aceiteTermos: true, nomeAssinatura: 'Maria da Silva' }, META)).rejects.toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
      message: expect.stringMatching(/documento/i),
    })
    expect(candidatura(row.id).status).toBe('rascunho')
    expect(fakes.notify).not.toHaveBeenCalled()
  })

  it('assinatura diferente do nome é recusada; ignora caixa, acento e espaços duplos', async () => {
    const row = rascunhoPronto({ nome: 'José  da Silva' })
    await expect(service.enviarCandidatura(PLATAFORMA, row.id, { aceiteTermos: true, nomeAssinatura: 'Outra Pessoa' }, META)).rejects.toMatchObject({
      issues: [{ path: 'nomeAssinatura' }],
    })
    const publica = await service.enviarCandidatura(PLATAFORMA, row.id, { aceiteTermos: true, nomeAssinatura: 'jose da silva' }, META)
    expect(publica.status).toBe('recebida')
  })

  it('grava o aceite, muda o status, notifica a plataforma e escreve ao candidato', async () => {
    const row = rascunhoPronto({ atuacao: 'supervisor' })
    const publica = await service.enviarCandidatura(PLATAFORMA, row.id, { aceiteTermos: true, nomeAssinatura: 'Maria da Silva' }, META)
    expect(publica).toMatchObject({ status: 'recebida', pendencias: [], aceite: { termosVersao: '2026-11', nomeAssinatura: 'Maria da Silva' } })
    const salvo = candidatura(row.id)
    expect(salvo.status).toBe('recebida')
    expect(salvo.enviadaEm).toBeInstanceOf(Date)
    expect(salvo.aceite).toMatchObject({ ip: '203.0.113.7', userAgent: 'vitest' })
    expect(salvo.aceite.termosHash).toMatch(/^[0-9a-f]{64}$/)

    expect(fakes.notify).toHaveBeenCalledTimes(1)
    expect(fakes.notify.mock.calls[0]![0]).toMatchObject({
      audience: 'platform',
      kind: 'vendas_candidatura_recebida',
      organizationId: null,
      title: 'Nova candidatura: Maria da Silva',
      body: 'Supervisor de equipe · Pessoa física',
      link: `/admin/comercial/candidaturas?id=${row.id}`,
      dedupeKey: `candidatura:${row.id}:recebida`,
    })
    expect(fakes.sendEmail).toHaveBeenCalledTimes(1)
    expect(fakes.sendEmail.mock.calls[0]![0]).toMatchObject({
      template: 'vendas_candidatura_recebida',
      to: { email: salvo.email },
      data: { clubName: 'ANNETEC', variante: 'recebida' },
    })
  })

  it('no clube, a notificação vai ao admin do clube com o link do clube e o e-mail leva a marca', async () => {
    const row = rascunhoPronto({}, TENANT_A)
    await service.enviarCandidatura(TENANT_A, row.id, { aceiteTermos: true, nomeAssinatura: 'Maria da Silva' }, META)
    expect(fakes.notify.mock.calls[0]![0]).toMatchObject({
      audience: 'tenant',
      organizationId: CLUBE_A.id,
      link: `/clube-a/admin/comercial/candidaturas?id=${row.id}`,
    })
    expect(fakes.sendEmail.mock.calls[0]![0]).toMatchObject({
      organizationId: CLUBE_A.id,
      data: { clubName: 'Clube A', brandColor: '#123456' },
    })
    expect(fakes.sendEmail.mock.calls[0]![0].data.acompanhamentoUrl).toContain('/clube-a/seja-parceiro/')
  })

  it('falha no e-mail não derruba o envio', async () => {
    fakes.sendEmail.mockRejectedValueOnce(new Error('smtp fora'))
    const row = rascunhoPronto()
    await expect(service.enviarCandidatura(PLATAFORMA, row.id, { aceiteTermos: true, nomeAssinatura: 'Maria da Silva' }, META)).resolves.toMatchObject({ status: 'recebida' })
  })

  it('já enviada = 409; outra em análise com o mesmo e-mail = 409', async () => {
    const enviada = semearCandidatura({ status: 'recebida' })
    await expect(service.enviarCandidatura(PLATAFORMA, enviada.id, { aceiteTermos: true, nomeAssinatura: 'Maria da Silva' }, META)).rejects.toMatchObject({ code: 'CONFLICT' })
    semearCandidatura({ status: 'recebida', email: 'dup@exemplo.com' })
    const outra = rascunhoPronto({ email: 'dup@exemplo.com' })
    await expect(service.enviarCandidatura(PLATAFORMA, outra.id, { aceiteTermos: true, nomeAssinatura: 'Maria da Silva' }, META)).rejects.toMatchObject({ code: 'ALREADY_EXISTS' })
  })
})

describe('aprovar', () => {
  it('vendedor em equipe: cria o agente sem reaplicar o vínculo sugerido, que segue no detalhe, e grava agenteId', async () => {
    const row = semearCandidatura({ status: 'recebida', atuacao: 'vendedor_equipe', codigoIndicacao: 'SUP0001', indicadoPorAgenteId: ID.supervisor1 })
    const resultado = await service.aprovarCandidatura(ctxMaster(PLATAFORMA), row.id, { enviarConvite: true })

    expect(fakes.criarAgente).toHaveBeenCalledTimes(1)
    expect(fakes.criarAgente.mock.calls[0]![1]).toMatchObject({
      papel: 'vendedor',
      nome: 'Maria da Silva',
      cpf: '52998224725',
      // O servidor não reaplica o vínculo sugerido: só vale o que o master enviou (ausente = null).
      corretoraId: null,
      unidadeId: null,
      equipeId: null,
      enviarConvite: true,
      observacoes: `Candidatura ${row.id}`,
    })
    expect(candidatura(row.id)).toMatchObject({ status: 'aprovada', agenteId: uid(7001), decididaPorUserId: 'u-master' })
    expect(resultado.convite).toEqual({ enviado: true, status: 'simulated', contaNova: true })
    expect(resultado.candidatura).toMatchObject({ status: 'aprovada', agenteId: uid(7001), loginPath: '/login' })
    expect(resultado.candidatura.vinculoSugerido).toMatchObject({ equipeId: ID.equipe1, corretoraId: ID.corretora1 })
  })

  it('o que o master escolhe (papel e vínculo) vale mais que a sugestão; observações entram no agente', async () => {
    const row = semearCandidatura({ status: 'recebida', atuacao: 'supervisor' })
    await service.aprovarCandidatura(ctxMaster(PLATAFORMA), row.id, { papel: 'gerente', corretoraId: ID.corretora2, enviarConvite: false, observacoes: 'Indicado pelo diretor' })
    expect(fakes.criarAgente.mock.calls[0]![1]).toMatchObject({
      papel: 'gerente',
      corretoraId: ID.corretora2,
      enviarConvite: false,
      observacoes: `Candidatura ${row.id} — Indicado pelo diretor`,
    })
    expect(candidatura(row.id).observacoesDecisao).toBe('Indicado pelo diretor')
  })

  it('se criar o agente falha, volta para "recebida" e relança o erro', async () => {
    fakes.criarAgente.mockRejectedValueOnce(Object.assign(new Error('Este e-mail já pertence a um agente da rede'), { code: 'ALREADY_EXISTS' }))
    const row = semearCandidatura({ status: 'recebida' })
    await expect(service.aprovarCandidatura(ctxMaster(PLATAFORMA), row.id, { enviarConvite: true })).rejects.toMatchObject({ code: 'ALREADY_EXISTS' })
    expect(candidatura(row.id)).toMatchObject({ status: 'recebida', decididaEm: null, decididaPorUserId: null, agenteId: null })
    // E dá para tentar de novo.
    await expect(service.aprovarCandidatura(ctxMaster(PLATAFORMA), row.id, { enviarConvite: true })).resolves.toBeTruthy()
    expect(candidatura(row.id).status).toBe('aprovada')
  })

  it('corretora: cria a corretora e o gerente dela, e grava os dois ids', async () => {
    const row = semearCandidatura({
      status: 'recebida',
      tipoPessoa: 'pj',
      atuacao: 'corretora',
      cnpj: '11222333000181',
      razaoSocial: 'Alfa Seguros LTDA',
      nomeFantasia: 'Alfa Corretora',
    })
    const resultado = await service.aprovarCandidatura(ctxMaster(PLATAFORMA), row.id, { enviarConvite: true })
    expect(fakes.criarCorretora.mock.calls[0]![1]).toMatchObject({
      nomeFantasia: 'Alfa Corretora',
      razaoSocial: 'Alfa Seguros LTDA',
      cnpj: '11222333000181',
      email: row.email,
    })
    expect(fakes.criarGerenteDaCorretora).toHaveBeenCalledWith(expect.anything(), uid(7100), expect.objectContaining({ nome: 'Maria da Silva', cpf: '52998224725' }))
    expect(fakes.criarAgente).not.toHaveBeenCalled()
    expect(candidatura(row.id)).toMatchObject({ status: 'aprovada', agenteId: uid(7002), corretoraId: uid(7100) })
    expect(resultado.candidatura.corretoraId).toBe(uid(7100))
  })

  it('corretora: se o gerente falha, a corretora recém-criada é removida e a candidatura volta', async () => {
    fakes.criarGerenteDaCorretora.mockRejectedValueOnce(new Error('falhou'))
    const row = semearCandidatura({ status: 'recebida', tipoPessoa: 'pj', atuacao: 'corretora', cnpj: '11222333000181', razaoSocial: 'Alfa LTDA', nomeFantasia: 'Alfa' })
    await expect(service.aprovarCandidatura(ctxMaster(PLATAFORMA), row.id, { enviarConvite: true })).rejects.toThrow('falhou')
    expect(fakes.removerCorretora).toHaveBeenCalledWith(expect.anything(), uid(7100))
    expect(candidatura(row.id).status).toBe('recebida')
  })

  it('já decidida = 409; rascunho e candidatura de outro escopo = 404', async () => {
    const aprovada = semearCandidatura({ status: 'aprovada' })
    await expect(service.aprovarCandidatura(ctxMaster(PLATAFORMA), aprovada.id, { enviarConvite: true })).rejects.toMatchObject({ code: 'ALREADY_EXISTS' })
    const rascunho = semearCandidatura()
    await expect(service.aprovarCandidatura(ctxMaster(PLATAFORMA), rascunho.id, { enviarConvite: true })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const deB = semearCandidatura({ status: 'recebida' }, TENANT_B)
    await expect(service.aprovarCandidatura(ctxMaster(TENANT_A), deB.id, { enviarConvite: true })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(fakes.criarAgente).not.toHaveBeenCalled()
  })

  it('no clube, o loginPath leva o slug', async () => {
    const row = semearCandidatura({ status: 'recebida' }, TENANT_A)
    const resultado = await service.aprovarCandidatura(ctxMaster(TENANT_A), row.id, { enviarConvite: true })
    expect(resultado.candidatura.loginPath).toBe('/clube-a/login')
  })
})

describe('aprovar: vínculo e agente órfão', () => {
  it('usa exatamente o vínculo do input, mesmo com indicador que sugeriria outro', async () => {
    const row = semearCandidatura({ status: 'recebida', atuacao: 'vendedor_equipe', codigoIndicacao: 'SUP0001', indicadoPorAgenteId: ID.supervisor1 })
    await service.aprovarCandidatura(ctxMaster(PLATAFORMA), row.id, { enviarConvite: true, equipeId: ID.equipe2 })
    expect(fakes.criarAgente.mock.calls[0]![1]).toMatchObject({ corretoraId: null, unidadeId: null, equipeId: ID.equipe2 })
  })

  it('vendedor_solo que veio com código: fica sem indicador e sem vínculo', async () => {
    const resposta = await service.iniciarCandidatura(PLATAFORMA, entrada({ atuacao: 'vendedor_solo', codigoIndicacao: 'SUP0001' }), META)
    expect(candidatura(resposta.id)).toMatchObject({ codigoIndicacao: null, indicadoPorAgenteId: null })
    const row = semearCandidatura({ status: 'recebida', atuacao: 'vendedor_solo', codigoIndicacao: 'SUP0001', indicadoPorAgenteId: ID.supervisor1 })
    const resultado = await service.aprovarCandidatura(ctxMaster(PLATAFORMA), row.id, { enviarConvite: true })
    expect(fakes.criarAgente.mock.calls[0]![1]).toMatchObject({ corretoraId: null, unidadeId: null, equipeId: null })
    expect(resultado.candidatura).toMatchObject({ status: 'aprovada', indicadoPor: { nome: 'Supervisor Um' } })
  })

  it('falha ao gravar agenteId depois de criar o agente: não reverte o status e não lança', async () => {
    const row = semearCandidatura({ status: 'recebida' })
    const memDb = (mem() as unknown as { db: Record<string, (...a: unknown[]) => unknown> }).db
    const original = memDb.update!.bind(memDb)
    let chamadas = 0
    const spy = vi.spyOn(memDb, 'update').mockImplementation(((tabela: unknown) => {
      chamadas++
      // 1ª chamada = trava recebida→aprovada; 2ª = gravar o vínculo.
      if (chamadas === 2) throw new Error('banco caiu')
      return original(tabela)
    }) as never)
    const resultado = await service.aprovarCandidatura(ctxMaster(PLATAFORMA), row.id, { enviarConvite: true })
    spy.mockRestore()
    expect(fakes.criarAgente).toHaveBeenCalledTimes(1)
    expect(resultado.agenteId).toBe(uid(7001))
    expect(candidatura(row.id).status).toBe('aprovada')
  })
})

describe('código de indicação só vale para vendedor em equipe', () => {
  it('salvarDados com outra atuação limpa código e indicador', async () => {
    const row = semearCandidatura({ atuacao: 'vendedor_equipe', codigoIndicacao: 'SUP0001', indicadoPorAgenteId: ID.supervisor1 })
    await service.salvarDadosCandidatura(PLATAFORMA, row.id, { atuacao: 'supervisor', codigoIndicacao: 'SUP0001', endereco: ENDERECO })
    expect(candidatura(row.id)).toMatchObject({ codigoIndicacao: null, indicadoPorAgenteId: null })
  })
})

describe('recusar', () => {
  it('exige motivo, grava e avisa o candidato com o motivo', async () => {
    const row = semearCandidatura({ status: 'recebida' })
    await expect(service.recusarCandidatura(ctxMaster(PLATAFORMA), row.id, { motivo: 'curto' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(candidatura(row.id).status).toBe('recebida')

    const detalhe = await service.recusarCandidatura(ctxMaster(PLATAFORMA), row.id, { motivo: 'Documentos ilegíveis e dados inconsistentes' })
    expect(detalhe).toMatchObject({ status: 'recusada', motivoRecusa: 'Documentos ilegíveis e dados inconsistentes' })
    expect(fakes.sendEmail).toHaveBeenCalledTimes(1)
    expect(fakes.sendEmail.mock.calls[0]![0]).toMatchObject({
      template: 'vendas_candidatura_recusada',
      data: { motivo: 'Documentos ilegíveis e dados inconsistentes', clubName: 'ANNETEC' },
    })
    await expect(service.recusarCandidatura(ctxMaster(PLATAFORMA), row.id, { motivo: 'Outro motivo qualquer aqui' })).rejects.toMatchObject({ code: 'ALREADY_EXISTS' })
  })
})

describe('gestão: listagem, detalhe e isolamento', () => {
  it('lista só o escopo, por status, sem rascunhos, com contagem de pendentes', async () => {
    semearCandidatura({ status: 'recebida', nome: 'Plataforma Um', enviadaEm: new Date('2026-11-01') })
    semearCandidatura({ status: 'recebida', nome: 'Plataforma Dois', enviadaEm: new Date('2026-11-05'), indicadoPorAgenteId: ID.vendedor1 })
    semearCandidatura({ status: 'aprovada', nome: 'Plataforma Aprovada' })
    semearCandidatura({ status: 'rascunho', nome: 'Rascunho' })
    semearCandidatura({ status: 'recebida', nome: 'Clube A Um' }, TENANT_A)
    semearCandidatura({ status: 'recebida', nome: 'Clube B Um' }, TENANT_B)

    const padrao = await service.listarCandidaturas(ctxMaster(PLATAFORMA), { status: 'recebida' })
    expect(padrao.itens.map(i => i.nome)).toEqual(['Plataforma Dois', 'Plataforma Um'])
    expect(padrao.pendentes).toBe(2)
    expect(padrao.itens[0]!.indicadoPor).toEqual({ nome: 'Vendedor Um', papel: 'vendedor' })
    expect(padrao.itens[0]).toMatchObject({ cidade: 'Rio de Janeiro', uf: 'RJ' as const })

    const todas = await service.listarCandidaturas(ctxMaster(PLATAFORMA), { status: 'todas' })
    expect(todas.itens.map(i => i.nome).sort()).toEqual(['Plataforma Aprovada', 'Plataforma Dois', 'Plataforma Um'])

    const clubeA = await service.listarCandidaturas(ctxMaster(TENANT_A), { status: 'todas' })
    expect(clubeA.itens.map(i => i.nome)).toEqual(['Clube A Um'])
    expect(await service.contarPendentes(ctxMaster(TENANT_B))).toBe(1)
  })

  it('detalhe de outro escopo ou de rascunho = 404; detalhe traz auditoria e vínculo sugerido', async () => {
    const deB = semearCandidatura({ status: 'recebida' }, TENANT_B)
    const rascunho = semearCandidatura()
    await expect(service.detalharCandidatura(ctxMaster(TENANT_A), deB.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(service.detalharCandidatura(ctxMaster(PLATAFORMA), rascunho.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(service.arquivoDoDocumentoDaGestao(ctxMaster(PLATAFORMA), rascunho.id, uid(1))).rejects.toMatchObject({ code: 'NOT_FOUND' })

    const supervisionada = semearCandidatura({
      status: 'recebida',
      origemIp: '198.51.100.1',
      indicadoPorAgenteId: ID.supervisor1,
      decididaPorUserId: 'u-supervisor1',
    })
    const detalhe = await service.detalharCandidatura(ctxMaster(PLATAFORMA), supervisionada.id)
    expect(detalhe).toMatchObject({
      origemIp: '198.51.100.1',
      decididaPor: { id: 'u-supervisor1', nome: 'Supervisor Um' },
      vinculoSugerido: { papel: 'vendedor', equipeId: ID.equipe1, corretoraId: ID.corretora1 },
    })
  })
})
