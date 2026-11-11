import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Painel/BI da Rede Comercial (`painel.service`) com o banco FALSO em memória:
 *
 *  - `hoje` por papel: contadores, "Sua vez agora" ordenada (passo atrasado →
 *    novos sem contato → proposta aguardando), pool só para papéis acima do
 *    vendedor, equipe online restrita à hierarquia, meta × realizado;
 *  - `resultados`: KPIs, série diária, funil, origens, comissões e ranking por
 *    agrupamento, sempre limitados ao que o papel enxerga.
 */

const memory = vi.hoisted(() => ({ instance: null as null | Record<string, any> }))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { createMemoryDb } = await import('./helpers/memory-db')
  const instance = createMemoryDb({
    tables: [
      schema.vendasConfig,
      schema.vendasCorretoras,
      schema.vendasUnidades,
      schema.vendasEquipes,
      schema.vendasAgentes,
      schema.vendasLeads,
      schema.vendasLeadEventos,
      schema.vendasComissoes,
    ],
  })
  memory.instance = instance as unknown as Record<string, any>
  return { db: instance.db }
})

const schema = await import('@/db/schema')
const { visibilidade } = await import('@/modules/vendas-rede/rules')
const painel = await import('@/modules/vendas-rede/painel.service')

const mem = () => memory.instance as unknown as ReturnType<typeof import('./helpers/memory-db').createMemoryDb>
const insert = (table: object, values: Record<string, unknown>) => mem().insertRow(table, values) as Record<string, any>
const rows = (table: object) => mem().rows(table)

// Terça, 10/11/2026, 12:00 em São Paulo.
const AGORA = new Date('2026-11-10T15:00:00Z')
const min = (n: number) => new Date(AGORA.getTime() - n * 60_000)
const em = (iso: string) => new Date(`${iso}T15:00:00Z`)

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ID = {
  c1: u(1),
  c2: u(2),
  e1: u(11),
  e2: u(12),
  gerente: u(21),
  supervisor: u(22),
  vendedor: u(23),
  vendedor2: u(24),
  solo: u(25),
  outraCorretora: u(26),
}

function agente(id: string, papel: string, nome: string, extra: Record<string, unknown> = {}) {
  return insert(schema.vendasAgentes, {
    id,
    scope: 'platform',
    tenantId: null,
    userId: `user-${id.slice(-2)}`,
    papel,
    nome,
    codigoIndicacao: `COD${id.slice(-4)}`,
    ativo: true,
    ...extra,
  })
}

let seq = 100
function lead(values: Record<string, unknown>) {
  return insert(schema.vendasLeads, { id: u(++seq), scope: 'platform', tenantId: null, tipo: 'empresa', origem: 'outro', etapa: 'novo', createdAt: min(10), updatedAt: min(10), ...values })
}
function evento(leadId: string, tipo: string, quando: Date, dados: Record<string, unknown> | null = null) {
  return insert(schema.vendasLeadEventos, { leadId, tipo, em: quando, dados })
}
function comissao(values: Record<string, unknown>) {
  return insert(schema.vendasComissoes, {
    scope: 'platform',
    tenantId: null,
    tipo: 'mensalidade',
    parcela: 1,
    cobrancaOrigem: 'platform',
    cobrancaRef: `ch-${++seq}`,
    percentual: '100',
    mesReferencia: '2026-11',
    ...values,
  })
}

const L: Record<string, Record<string, any>> = {}

function seed() {
  insert(schema.vendasCorretoras, { id: ID.c1, scope: 'platform', tenantId: null, nomeFantasia: 'Corretora Um', gerenteAgenteId: ID.gerente })
  insert(schema.vendasCorretoras, { id: ID.c2, scope: 'platform', tenantId: null, nomeFantasia: 'Corretora Dois' })
  insert(schema.vendasEquipes, { id: ID.e1, scope: 'platform', tenantId: null, corretoraId: ID.c1, nome: 'Equipe 1', supervisorAgenteId: ID.supervisor })
  insert(schema.vendasEquipes, { id: ID.e2, scope: 'platform', tenantId: null, corretoraId: ID.c1, nome: 'Equipe 2' })
  agente(ID.gerente, 'gerente', 'Gerson Gerente', { corretoraId: ID.c1, ultimaPresencaEm: min(30) })
  agente(ID.supervisor, 'supervisor', 'Sara Supervisora', { corretoraId: ID.c1, equipeId: ID.e1, ultimaPresencaEm: min(10) })
  agente(ID.vendedor, 'vendedor', 'Vera Vendedora', { corretoraId: ID.c1, equipeId: ID.e1, ultimaPresencaEm: min(1) })
  agente(ID.vendedor2, 'vendedor', 'Vitor Vendedor', { corretoraId: ID.c1, equipeId: ID.e2, ultimaPresencaEm: min(2) })
  agente(ID.solo, 'vendedor', 'Zeca Solo', { ultimaPresencaEm: min(1) })
  agente(ID.outraCorretora, 'vendedor', 'Wilson Outra', { corretoraId: ID.c2, ultimaPresencaEm: min(1) })

  // Vera (vendedor da equipe 1)
  L.novo = lead({ nome: 'Novo sem contato', agenteId: ID.vendedor, etapa: 'novo', createdAt: em('2026-11-09') })
  L.atrasado = lead({ nome: 'Passo atrasado', agenteId: ID.vendedor, etapa: 'em_contato', createdAt: em('2026-11-05'), ultimoContatoEm: em('2026-11-06'), proximoPasso: 'Ligar de volta', proximoPassoEm: min(60) })
  L.proposta = lead({ nome: 'Proposta enviada', agenteId: ID.vendedor, etapa: 'proposta', createdAt: em('2026-11-02'), ultimoContatoEm: em('2026-11-04') })
  L.ganho = lead({ nome: 'Fechado no mês', agenteId: ID.vendedor, etapa: 'ganho', createdAt: em('2026-10-20'), ganhoEm: em('2026-11-03'), valorEstimado: '1000' })
  L.perdido = lead({ nome: 'Perdido', agenteId: ID.vendedor, etapa: 'perdido', createdAt: em('2026-11-04'), perdidoEm: em('2026-11-05') })
  // Pool
  L.pool1 = lead({ nome: 'Pool parado', agenteId: null, origem: 'site', poolDesde: min(30), createdAt: min(30) })
  L.pool2 = lead({ nome: 'Pool recente', agenteId: null, origem: 'site', poolDesde: min(5), createdAt: min(5) })
  // Outros agentes
  L.v2 = lead({ nome: 'Lead do Vitor', agenteId: ID.vendedor2, etapa: 'novo', createdAt: em('2026-11-08') })
  L.solo = lead({ nome: 'Lead do Zeca', agenteId: ID.solo, etapa: 'em_contato', createdAt: em('2026-11-07'), ultimoContatoEm: em('2026-11-08') })
  L.outra = lead({ nome: 'Lead de outra corretora', agenteId: ID.outraCorretora, etapa: 'ganho', createdAt: em('2026-11-06'), ganhoEm: em('2026-11-06'), valorEstimado: '700' })

  evento(L.atrasado.id, 'ligacao', em('2026-11-06'))
  evento(L.proposta.id, 'whatsapp', em('2026-11-04'))
  evento(L.proposta.id, 'etapa', em('2026-11-04'), { de: 'em_contato', para: 'proposta' })
  evento(L.solo.id, 'ligacao', em('2026-11-08'))
  evento(L.ganho.id, 'etapa', em('2026-10-25'), { de: 'em_contato', para: 'proposta' })
  // Esta semana (7 dias até agora): 1 reunião da Vera.
  evento(L.atrasado.id, 'reuniao', min(60 * 24 * 2))

  comissao({ leadId: L.ganho.id, beneficiarioAgenteId: ID.vendedor, parte: 'vendedor', base: '1500', valor: '1500', status: 'a_pagar', createdAt: em('2026-11-03') })
  comissao({ leadId: L.ganho.id, beneficiarioAgenteId: ID.supervisor, parte: 'supervisor', base: '1500', valor: '150', percentual: '10', status: 'a_pagar', createdAt: em('2026-11-03') })
  comissao({ leadId: L.solo.id, beneficiarioAgenteId: ID.solo, parte: 'vendedor', base: '300', valor: '300', status: 'paga', createdAt: em('2026-11-03') })
  comissao({ leadId: L.solo.id, beneficiarioAgenteId: ID.solo, parte: 'vendedor', base: '99', valor: '99', status: 'prevista', mesReferencia: '2026-10', createdAt: em('2026-10-20') })
}

type Papel = 'master' | 'gerente' | 'supervisor' | 'vendedor'
function ctxDe(papel: Papel, agenteId: string | null) {
  const row = agenteId ? (rows(schema.vendasAgentes) as Record<string, any>[]).find(a => a.id === agenteId) : null
  return {
    scope: 'platform' as const,
    tenantId: null,
    tenantSlug: null,
    userId: `user-${papel}`,
    userName: 'Equipe ANNETEC',
    agente: row ?? null,
    papel,
    masterImplicito: !row,
    podeEscrever: true,
    visibilidade: visibilidade({
      papel,
      agenteId,
      corretoraId: row?.corretoraId ?? null,
      equipeIds: papel === 'supervisor' ? [ID.e1] : undefined,
    }),
  } as never
}

beforeEach(() => {
  mem().reset()
  seq = 100
  seed()
})

describe('GET /painel/hoje', () => {
  it('vendedor: contadores, meta e "Sua vez" ordenada (passo atrasado → novo sem contato → proposta) sem o pool', async () => {
    const hoje = await painel.hoje(ctxDe('vendedor', ID.vendedor), AGORA)
    expect(hoje.saudacao).toBe('Boa tarde, Vera')
    expect(hoje.agente).toEqual({ id: ID.vendedor, nome: 'Vera Vendedora', papel: 'vendedor', online: true })
    expect(hoje.contadores).toEqual({ pool: 2, minhaVez: 2, emAndamento: 2, proximosPassosAtrasados: 1, poolParadoMais15min: 1 })
    expect(hoje.suaVez.map(item => [item.lead.nome, item.acao])).toEqual([
      ['Passo atrasado', 'enviar_proposta'],
      ['Novo sem contato', 'ligar'],
      ['Proposta enviada', 'registrar'],
    ])
    expect(hoje.suaVez[0]!.lead.proximoPassoInfo).toMatchObject({ quem: 'voce', texto: 'Ligar de volta', atrasado: true })
    expect(hoje.suaVez[0]!.motivo).toBe('Próximo passo atrasado: Ligar de volta')
    expect(hoje.suaVez[0]!.lead.agenteNome).toBe('Vera Vendedora')
    expect(hoje.meta).toEqual({ metaMensal: 10, realizado: 1 })
    expect(hoje.equipeOnline).toEqual([])
    expect(hoje.semana.reunioes).toEqual({ atual: 1, anterior: 0 })
    expect(hoje.semana.contatos.atual).toBe(3) // ligação, WhatsApp e a reunião dos últimos 7 dias
    expect(hoje.funil.contagem).toMatchObject({ novo: 1, em_contato: 1, proposta: 1, ganho: 1, perdido: 1 })
  })

  it('supervisor: "Sua vez" = os dele + o pool (não os leads da equipe); equipe online só da equipe', async () => {
    const hoje = await painel.hoje(ctxDe('supervisor', ID.supervisor), AGORA)
    expect(hoje.agente.online).toBe(false) // última presença há 10 min (janela de 3)
    expect(hoje.suaVez.map(item => item.lead.nome)).toEqual(['Pool parado', 'Pool recente'])
    expect(hoje.suaVez.find(item => item.lead.nome === 'Pool parado')).toMatchObject({ acao: 'atender', motivo: 'Disponível: ninguém atendeu ainda' })
    expect(hoje.suaVez.some(item => item.lead.nome === 'Lead do Vitor')).toBe(false)
    expect(hoje.equipeOnline).toEqual([{ id: ID.vendedor, nome: 'Vera Vendedora', papel: 'vendedor' }])
    expect(hoje.contadores.minhaVez).toBe(0) // nenhum lead próprio
    expect(hoje.contadores.proximosPassosAtrasados).toBe(1)
  })

  it('gerente: equipe online da corretora toda (e só dela); master implícito vê todo o escopo', async () => {
    const gerente = await painel.hoje(ctxDe('gerente', ID.gerente), AGORA)
    expect(gerente.equipeOnline.map(a => a.nome)).toEqual(['Vera Vendedora', 'Vitor Vendedor'])
    expect(gerente.suaVez.map(item => item.lead.nome)).toEqual(['Pool parado', 'Pool recente'])

    const master = await painel.hoje(ctxDe('master', null), AGORA)
    expect(master.agente).toMatchObject({ id: null, nome: 'Equipe ANNETEC', papel: 'master', online: true })
    expect(master.meta).toEqual({ metaMensal: null, realizado: 2 })
    expect(master.equipeOnline.map(a => a.nome)).toEqual(['Vera Vendedora', 'Vitor Vendedor', 'Wilson Outra', 'Zeca Solo'])
    expect(master.funil.contagem.ganho).toBe(2)
  })
})

describe('GET /painel/resultados', () => {
  it('master (mês): KPIs, valor real da assinatura, comissões, funil, origens e série diária', async () => {
    const r = await painel.resultados(ctxDe('master', null), { periodo: 'mes', agrupar: 'agente' }, AGORA)
    expect(r.periodo).toBe('mes')
    expect(r.kpis).toEqual({
      leads: 9,
      contatos: 4,
      propostas: 1,
      ganhos: 2,
      taxaConversao: 22.2,
      // 1.500 (base real da 1ª mensalidade paga, no lugar dos 1.000 estimados) + 700 estimados.
      valorGanho: 2200,
      comissaoPrevista: 0,
      comissaoAPagar: 1650,
      comissaoPaga: 300,
    })
    expect(r.funil).toEqual([
      { etapa: 'novo', total: 4 },
      { etapa: 'em_contato', total: 2 },
      { etapa: 'proposta', total: 1 },
      { etapa: 'negociacao', total: 0 },
      { etapa: 'ganho', total: 1 },
      { etapa: 'perdido', total: 1 },
    ])
    expect(r.origens).toEqual([
      { origem: 'outro', total: 7 },
      { origem: 'site', total: 2 },
    ])
    expect(r.serieDiaria).toHaveLength(10)
    expect(r.serieDiaria[0]).toEqual({ dia: '2026-11-01', leads: 0, ganhos: 0 })
    expect(r.serieDiaria.find(d => d.dia === '2026-11-03')).toEqual({ dia: '2026-11-03', leads: 0, ganhos: 1 })
    expect(r.serieDiaria.find(d => d.dia === '2026-11-06')).toEqual({ dia: '2026-11-06', leads: 1, ganhos: 1 })
    expect(r.serieDiaria.at(-1)).toEqual({ dia: '2026-11-10', leads: 2, ganhos: 0 })
    expect(r.ranking.slice(0, 2).map(x => [x.nome, x.leads, x.ganhos, x.valor])).toEqual([
      ['Vera Vendedora', 4, 1, 1500],
      ['Wilson Outra', 1, 1, 700],
    ])
  })

  it('períodos: 30d (corridos), mês e trimestre', async () => {
    const trinta = await painel.resultados(ctxDe('master', null), { periodo: '30d', agrupar: 'agente' }, AGORA)
    expect(trinta.serieDiaria).toHaveLength(30)
    expect(trinta.serieDiaria[0]!.dia).toBe('2026-10-12')
    expect(trinta.kpis.leads).toBe(10) // inclui o lead criado em 20/10
    expect(trinta.kpis.propostas).toBe(2)
    expect(trinta.kpis.comissaoPrevista).toBe(99)

    const trimestre = await painel.resultados(ctxDe('master', null), { periodo: 'trimestre', agrupar: 'agente' }, AGORA)
    expect(trimestre.serieDiaria[0]!.dia).toBe('2026-10-01')
    expect(trimestre.serieDiaria).toHaveLength(41)
  })

  it('vendedor: só ele, sem pool e só as próprias comissões, mesmo pedindo outro agrupamento', async () => {
    const r = await painel.resultados(ctxDe('vendedor', ID.vendedor), { periodo: 'mes', agrupar: 'corretora' }, AGORA)
    expect(r.agrupar).toBe('agente')
    expect(r.ranking).toEqual([{ chave: ID.vendedor, nome: 'Vera Vendedora', leads: 4, ganhos: 1, valor: 1500 }])
    expect(r.kpis).toMatchObject({ leads: 4, ganhos: 1, comissaoAPagar: 1500, comissaoPaga: 0, valorGanho: 1500 })
    expect(r.origens).toEqual([{ origem: 'outro', total: 4 }])
  })

  it('supervisor: só os vendedores da equipe (e ele), mesmo pedindo equipe/corretora', async () => {
    const r = await painel.resultados(ctxDe('supervisor', ID.supervisor), { periodo: 'mes', agrupar: 'equipe' }, AGORA)
    expect(r.agrupar).toBe('agente')
    expect(r.ranking.map(x => x.nome).sort()).toEqual(['Sara Supervisora', 'Vera Vendedora'])
    expect(r.kpis.leads).toBe(4)
    // A comissão da própria supervisora entra nas dela (a de Vera também: equipe).
    expect(r.kpis.comissaoAPagar).toBe(1650)
  })

  it('gerente: agrupa por equipe e por corretora só dentro da própria corretora', async () => {
    const porEquipe = await painel.resultados(ctxDe('gerente', ID.gerente), { periodo: 'mes', agrupar: 'equipe' }, AGORA)
    expect(porEquipe.agrupar).toBe('equipe')
    expect(porEquipe.ranking.map(x => [x.nome, x.leads, x.ganhos])).toEqual([
      ['Equipe 1', 4, 1],
      ['Equipe 2', 1, 0],
    ])
    const porCorretora = await painel.resultados(ctxDe('gerente', ID.gerente), { periodo: 'mes', agrupar: 'corretora' }, AGORA)
    expect(porCorretora.ranking).toEqual([{ chave: ID.c1, nome: 'Corretora Um', leads: 5, ganhos: 1, valor: 1500 }])
    expect(porCorretora.kpis.leads).toBe(5) // sem o solo, sem a outra corretora e sem o pool
  })

  it('master: corretoras + solos (grupo "sem corretora") e equipes + sem equipe', async () => {
    const porCorretora = await painel.resultados(ctxDe('master', null), { periodo: 'mes', agrupar: 'corretora' }, AGORA)
    expect(porCorretora.ranking.map(x => [x.nome, x.leads, x.ganhos])).toEqual([
      ['Corretora Um', 5, 1],
      ['Corretora Dois', 1, 1],
      ['Sem corretora (solo)', 1, 0],
    ])
    const porEquipe = await painel.resultados(ctxDe('master', null), { periodo: 'mes', agrupar: 'equipe' }, AGORA)
    expect(porEquipe.ranking.map(x => [x.nome, x.leads])).toEqual(
      expect.arrayContaining([
        ['Equipe 1', 4],
        ['Equipe 2', 1],
        ['Sem equipe (solo)', 2],
      ]),
    )
  })
})
