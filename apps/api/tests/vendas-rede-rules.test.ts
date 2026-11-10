import { describe, expect, it } from 'vitest'
import {
  arredondarCentavos,
  cadeiaDoAgente,
  comissoesDaCobranca,
  deveVoltarAoPool,
  escolherAgenteAutomatico,
  estaOnline,
  estornarComissao,
  gerarCodigoIndicacao,
  jornadaDoLead,
  mesReferenciaSaoPaulo,
  numerosDaSemana,
  podeEditarLead,
  podeReatribuir,
  podeVerLead,
  proximoPassoDoLead,
  rankingDeAgentes,
  resumirFunil,
  simularEconomiaBalcao,
  transicaoPermitida,
  visibilidade,
  type Atribuicao,
  type ConfigComissao,
  type ContextoVisibilidade,
  type EtapaLead,
  type EventoLeadRegra,
  type StatusComissao,
} from '@/modules/vendas-rede/rules'

/**
 * Regras puras da Rede Comercial: código, presença, visibilidade, transições,
 * distribuição, pool, comissão (escala/adesão/overrides/solo/balcão/corretora),
 * estorno, simulador do balcão, jornada, próximo passo e números do painel.
 */

const AGORA = new Date('2026-06-15T15:00:00.000Z')
const minutosAtras = (m: number) => new Date(AGORA.getTime() - m * 60_000)
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000)
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 86_400_000)

const CONFIG: ConfigComissao = {
  escalaMensal: [100, 50, 25],
  percentualAdesao: 50,
  overrides: { supervisor: 10, gerente: 5, corretora: 5 },
  balcaoPercentual: null,
}

const CADEIA_COMPLETA: Atribuicao = {
  agenteId: 'ag-vend',
  papel: 'vendedor',
  equipeId: 'eq-1',
  supervisorAgenteId: 'ag-sup',
  unidadeId: 'un-1',
  corretoraId: 'cor-1',
  gerenteAgenteId: 'ag-ger',
}

const SOLO: Atribuicao = {
  agenteId: 'ag-solo',
  papel: 'vendedor',
  equipeId: null,
  supervisorAgenteId: null,
  unidadeId: null,
  corretoraId: null,
  gerenteAgenteId: null,
}

const cobranca = (parcela: number, valorPago = 100, tipo: 'mensalidade' | 'adesao' = 'mensalidade') => ({
  id: 'ch-1',
  origem: 'platform' as 'platform' | 'club',
  tipo,
  parcela,
  valorPago,
})

describe('gerarCodigoIndicacao', () => {
  it('gera 7 caracteres do alfabeto sem ambíguos', () => {
    for (let i = 0; i < 200; i++) {
      expect(gerarCodigoIndicacao()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/)
    }
  })

  it('é determinístico com rand injetado e cobre os extremos do alfabeto', () => {
    expect(gerarCodigoIndicacao(() => 0)).toBe('AAAAAAA')
    expect(gerarCodigoIndicacao(() => 0.999999)).toBe('9999999')
    expect(gerarCodigoIndicacao(() => 1)).toBe('9999999') // clamp defensivo
    expect(gerarCodigoIndicacao(() => -1)).toBe('AAAAAAA')
    const seq = [0, 1 / 32, 2 / 32, 3 / 32, 4 / 32, 5 / 32, 6 / 32]
    let i = 0
    expect(gerarCodigoIndicacao(() => seq[i++] as number + 0.001)).toBe('ABCDEFG')
  })

  it('nunca usa 0, 1, I nem O', () => {
    const codigo = Array.from({ length: 500 }, () => gerarCodigoIndicacao()).join('')
    expect(codigo).not.toMatch(/[01IO]/)
  })
})

describe('estaOnline', () => {
  it('sem presença registrada é offline', () => {
    expect(estaOnline(null, AGORA, 3)).toBe(false)
    expect(estaOnline(undefined, AGORA, 3)).toBe(false)
  })

  it('dentro da janela é online, no limite exato ainda é, depois não', () => {
    expect(estaOnline(minutosAtras(1), AGORA, 3)).toBe(true)
    expect(estaOnline(minutosAtras(3), AGORA, 3)).toBe(true)
    expect(estaOnline(new Date(minutosAtras(3).getTime() - 1), AGORA, 3)).toBe(false)
  })

  it('presença no futuro (relógio adiantado) conta como online', () => {
    expect(estaOnline(new Date(AGORA.getTime() + 30_000), AGORA, 3)).toBe(true)
  })

  it('janela 0 só aceita presença exatamente agora', () => {
    expect(estaOnline(AGORA, AGORA, 0)).toBe(true)
    expect(estaOnline(minutosAtras(1), AGORA, 0)).toBe(false)
  })
})

describe('visibilidade', () => {
  it('master vê tudo (explícito ou implícito)', () => {
    expect(visibilidade({ papel: 'master', agenteId: null })).toEqual({ todos: true, agenteId: null })
    expect(visibilidade({ papel: 'master', agenteId: 'm1' })).toEqual({ todos: true, agenteId: 'm1' })
  })

  it('gerente vê a corretora', () => {
    expect(visibilidade({ papel: 'gerente', agenteId: 'g1', corretoraId: 'c1' })).toEqual({
      todos: false,
      agenteId: 'g1',
      corretoraId: 'c1',
    })
  })

  it('gerente sem corretora cai para só ele mesmo', () => {
    expect(visibilidade({ papel: 'gerente', agenteId: 'g1' })).toEqual({ todos: false, agenteId: 'g1' })
  })

  it('supervisor vê as equipes que supervisiona (cópia da lista) e lista vazia quando não há', () => {
    const equipeIds = ['e1', 'e2']
    const v = visibilidade({ papel: 'supervisor', agenteId: 's1', equipeIds })
    expect(v).toEqual({ todos: false, agenteId: 's1', equipeIds: ['e1', 'e2'] })
    expect(v.equipeIds).not.toBe(equipeIds)
    expect(visibilidade({ papel: 'supervisor', agenteId: 's1' }).equipeIds).toEqual([])
  })

  it('vendedor e balcão veem só a si mesmos', () => {
    expect(visibilidade({ papel: 'vendedor', agenteId: 'v1', corretoraId: 'c1' })).toEqual({ todos: false, agenteId: 'v1' })
    expect(visibilidade({ papel: 'balcao', agenteId: 'b1' })).toEqual({ todos: false, agenteId: 'b1' })
  })
})

describe('podeVerLead', () => {
  const master: ContextoVisibilidade = { papel: 'master', agenteId: null }
  const gerente: ContextoVisibilidade = { papel: 'gerente', agenteId: 'g1', corretoraId: 'c1' }
  const supervisor: ContextoVisibilidade = { papel: 'supervisor', agenteId: 's1', equipeIds: ['e1'] }
  const vendedor: ContextoVisibilidade = { papel: 'vendedor', agenteId: 'v1', corretoraId: 'c1' }
  const balcao: ContextoVisibilidade = { papel: 'balcao', agenteId: 'b1' }

  it('pool: visível a todos, exceto balcão', () => {
    const lead = { agenteId: null }
    expect(podeVerLead(master, lead)).toBe(true)
    expect(podeVerLead(gerente, lead)).toBe(true)
    expect(podeVerLead(supervisor, lead)).toBe(true)
    expect(podeVerLead(vendedor, lead)).toBe(true)
    expect(podeVerLead(balcao, lead)).toBe(false)
  })

  it('master vê lead de qualquer dono', () => {
    expect(podeVerLead(master, { agenteId: 'x', donoCorretoraId: 'outra' })).toBe(true)
  })

  it('vendedor vê só o próprio lead', () => {
    expect(podeVerLead(vendedor, { agenteId: 'v1' })).toBe(true)
    expect(podeVerLead(vendedor, { agenteId: 'v2', donoCorretoraId: 'c1' })).toBe(false)
  })

  it('balcão vê só o próprio lead', () => {
    expect(podeVerLead(balcao, { agenteId: 'b1' })).toBe(true)
    expect(podeVerLead(balcao, { agenteId: 'b2' })).toBe(false)
  })

  it('gerente vê leads da sua corretora, não de outra', () => {
    expect(podeVerLead(gerente, { agenteId: 'v9', donoCorretoraId: 'c1' })).toBe(true)
    expect(podeVerLead(gerente, { agenteId: 'v9', donoCorretoraId: 'c2' })).toBe(false)
    expect(podeVerLead(gerente, { agenteId: 'v9', donoCorretoraId: null })).toBe(false)
    expect(podeVerLead(gerente, { agenteId: 'g1' })).toBe(true)
  })

  it('supervisor vê leads da sua equipe, não de outra, e os próprios', () => {
    expect(podeVerLead(supervisor, { agenteId: 'v9', donoEquipeId: 'e1' })).toBe(true)
    expect(podeVerLead(supervisor, { agenteId: 'v9', donoEquipeId: 'e2' })).toBe(false)
    expect(podeVerLead(supervisor, { agenteId: 'v9', donoEquipeId: null })).toBe(false)
    expect(podeVerLead(supervisor, { agenteId: 's1' })).toBe(true)
  })

  it('master implícito (agenteId null) com lead de dono alheio continua vendo', () => {
    expect(podeVerLead({ papel: 'master', agenteId: null }, { agenteId: 'v1' })).toBe(true)
  })
})

describe('podeEditarLead', () => {
  const cadeia = { supervisorAgenteId: 's1', gerenteAgenteId: 'g1' }
  const lead = { agenteId: 'v1', donoCorretoraId: 'c1', donoEquipeId: 'e1' }

  it('master edita qualquer lead, inclusive do pool', () => {
    expect(podeEditarLead({ papel: 'master', agenteId: null }, lead, cadeia)).toBe(true)
    expect(podeEditarLead({ papel: 'master', agenteId: null }, { agenteId: null })).toBe(true)
  })

  it('dono edita o próprio lead, sem precisar da cadeia', () => {
    expect(podeEditarLead({ papel: 'vendedor', agenteId: 'v1' }, lead)).toBe(true)
  })

  it('supervisor da cadeia edita; supervisor de outra equipe não vê nem edita', () => {
    const sup = { papel: 'supervisor' as const, agenteId: 's1', equipeIds: ['e1'] }
    expect(podeEditarLead(sup, lead, cadeia)).toBe(true)
    expect(podeEditarLead(sup, lead, null)).toBe(false)
    expect(podeEditarLead(sup, lead)).toBe(false)
    expect(podeEditarLead({ ...sup, agenteId: 's2', equipeIds: ['e2'] }, lead, cadeia)).toBe(false)
  })

  it('supervisor da equipe mas não o da cadeia (cadeia aponta outro) não edita', () => {
    const sup = { papel: 'supervisor' as const, agenteId: 's9', equipeIds: ['e1'] }
    expect(podeEditarLead(sup, lead, cadeia)).toBe(false)
  })

  it('gerente da cadeia edita; de outra corretora não', () => {
    const ger = { papel: 'gerente' as const, agenteId: 'g1', corretoraId: 'c1' }
    expect(podeEditarLead(ger, lead, cadeia)).toBe(true)
    expect(podeEditarLead({ ...ger, agenteId: 'g2', corretoraId: 'c2' }, lead, cadeia)).toBe(false)
    expect(podeEditarLead({ ...ger, agenteId: 'g9' }, lead, cadeia)).toBe(false)
  })

  it('vendedor/balcão não editam lead de colega', () => {
    expect(podeEditarLead({ papel: 'vendedor', agenteId: 'v2' }, lead, cadeia)).toBe(false)
    expect(podeEditarLead({ papel: 'balcao', agenteId: 'b1' }, lead, cadeia)).toBe(false)
  })

  it('lead no pool não é editável por quem não é master (precisa reivindicar)', () => {
    expect(podeEditarLead({ papel: 'vendedor', agenteId: 'v1' }, { agenteId: null })).toBe(false)
    expect(podeEditarLead({ papel: 'gerente', agenteId: 'g1', corretoraId: 'c1' }, { agenteId: null })).toBe(false)
  })

  it('contexto sem agente (não master) não edita lead com dono', () => {
    expect(podeEditarLead({ papel: 'vendedor', agenteId: null }, lead, cadeia)).toBe(false)
  })
})

describe('podeReatribuir', () => {
  const a = (id: string, corretoraId: string | null, equipeId: string | null) => ({ id, corretoraId, equipeId })

  it('master reatribui para qualquer agente e devolve ao pool', () => {
    const ctx: ContextoVisibilidade = { papel: 'master', agenteId: null }
    expect(podeReatribuir(ctx, a('x', 'c9', 'e9'), a('y', null, null))).toBe(true)
    expect(podeReatribuir(ctx, a('x', null, null), null)).toBe(true)
    expect(podeReatribuir(ctx, null, null)).toBe(true)
  })

  it('gerente só dentro da corretora', () => {
    const ctx: ContextoVisibilidade = { papel: 'gerente', agenteId: 'g', corretoraId: 'c1' }
    expect(podeReatribuir(ctx, a('x', 'c1', 'e1'), a('y', 'c1', 'e2'))).toBe(true)
    expect(podeReatribuir(ctx, a('x', 'c1', null), a('y', 'c2', null))).toBe(false)
    expect(podeReatribuir(ctx, a('x', 'c2', null), a('y', 'c1', null))).toBe(false)
  })

  it('gerente: do pool para agente da corretora e de agente da corretora ao pool', () => {
    const ctx: ContextoVisibilidade = { papel: 'gerente', agenteId: 'g', corretoraId: 'c1' }
    expect(podeReatribuir(ctx, null, a('y', 'c1', null))).toBe(true)
    expect(podeReatribuir(ctx, a('x', 'c1', null), null)).toBe(true)
    expect(podeReatribuir(ctx, null, null)).toBe(false)
  })

  it('gerente sem corretora não reatribui', () => {
    expect(podeReatribuir({ papel: 'gerente', agenteId: 'g' }, a('x', null, null), a('y', null, null))).toBe(false)
  })

  it('supervisor só dentro das suas equipes', () => {
    const ctx: ContextoVisibilidade = { papel: 'supervisor', agenteId: 's', equipeIds: ['e1'] }
    expect(podeReatribuir(ctx, a('x', null, 'e1'), a('y', null, 'e1'))).toBe(true)
    expect(podeReatribuir(ctx, a('x', null, 'e1'), a('y', null, 'e2'))).toBe(false)
    expect(podeReatribuir(ctx, a('x', null, 'e2'), a('y', null, 'e1'))).toBe(false)
    expect(podeReatribuir(ctx, a('x', null, null), a('y', null, 'e1'))).toBe(false)
    expect(podeReatribuir(ctx, null, a('y', null, 'e1'))).toBe(true)
  })

  it('supervisor sem equipes não reatribui', () => {
    expect(podeReatribuir({ papel: 'supervisor', agenteId: 's' }, a('x', null, 'e1'), a('y', null, 'e1'))).toBe(false)
  })

  it('vendedor e balcão nunca reatribuem', () => {
    expect(podeReatribuir({ papel: 'vendedor', agenteId: 'v' }, a('x', null, null), a('y', null, null))).toBe(false)
    expect(podeReatribuir({ papel: 'balcao', agenteId: 'b' }, null, a('y', null, null))).toBe(false)
  })
})

describe('transicaoPermitida', () => {
  const todas: EtapaLead[] = ['novo', 'em_contato', 'proposta', 'negociacao', 'ganho', 'perdido']

  it('segue exatamente a tabela da especificação', () => {
    const esperado: Record<EtapaLead, EtapaLead[]> = {
      novo: ['em_contato', 'perdido'],
      em_contato: ['novo', 'proposta', 'negociacao', 'perdido'],
      proposta: ['em_contato', 'negociacao', 'ganho', 'perdido'],
      negociacao: ['proposta', 'ganho', 'perdido'],
      perdido: ['novo'],
      ganho: [],
    }
    for (const de of todas) {
      const permitidas = todas.filter(para => transicaoPermitida(de, para)).sort()
      expect(permitidas).toEqual([...esperado[de]].sort())
    }
  })

  it('mesma etapa nunca é transição', () => {
    for (const e of todas) {
      expect(transicaoPermitida(e, e)).toBe(false)
      expect(transicaoPermitida(e, e, 'master')).toBe(false)
    }
  })

  it('ganho é final: só o master reabre, para qualquer etapa', () => {
    for (const para of todas.filter(e => e !== 'ganho')) {
      expect(transicaoPermitida('ganho', para)).toBe(false)
      expect(transicaoPermitida('ganho', para, 'vendedor')).toBe(false)
      expect(transicaoPermitida('ganho', para, 'gerente')).toBe(false)
      expect(transicaoPermitida('ganho', para, 'master')).toBe(true)
    }
  })

  it('papel não altera as demais transições', () => {
    expect(transicaoPermitida('novo', 'ganho', 'master')).toBe(false)
    expect(transicaoPermitida('novo', 'em_contato', 'vendedor')).toBe(true)
    expect(transicaoPermitida('perdido', 'novo', 'balcao')).toBe(true)
  })
})

describe('escolherAgenteAutomatico', () => {
  const lead = { uf: 'SP', ramo: 'saude' }

  it('sem candidatos ou ninguém online → null (pool)', () => {
    expect(escolherAgenteAutomatico(lead, [])).toBeNull()
    expect(escolherAgenteAutomatico(lead, [{ id: 'a', online: false, cargaSemana: 0 }])).toBeNull()
  })

  it('escolhe o online de menor carga, ignorando offline com carga menor', () => {
    expect(
      escolherAgenteAutomatico(lead, [
        { id: 'a', online: false, cargaSemana: 0 },
        { id: 'b', online: true, cargaSemana: 5 },
        { id: 'c', online: true, cargaSemana: 2 },
      ]),
    ).toBe('c')
  })

  it('desempata por id crescente e não muta a entrada', () => {
    const candidatos = [
      { id: 'z', online: true, cargaSemana: 1 },
      { id: 'b', online: true, cargaSemana: 1 },
      { id: 'm', online: true, cargaSemana: 1 },
    ]
    expect(escolherAgenteAutomatico(lead, candidatos)).toBe('b')
    expect(candidatos.map(c => c.id)).toEqual(['z', 'b', 'm'])
  })

  it('carga 0 vence carga positiva', () => {
    expect(
      escolherAgenteAutomatico({}, [
        { id: 'a', online: true, cargaSemana: 1 },
        { id: 'b', online: true, cargaSemana: 0 },
      ]),
    ).toBe('b')
  })

  it('filtro vazio ou ausente aceita tudo, inclusive lead sem uf/ramo', () => {
    expect(escolherAgenteAutomatico({}, [{ id: 'a', online: true, cargaSemana: 0, ufs: [], ramos: null }])).toBe('a')
    expect(escolherAgenteAutomatico(lead, [{ id: 'a', online: true, cargaSemana: 0, ufs: [], ramos: [] }])).toBe('a')
  })

  it('filtro preenchido exige coincidência (case-insensitive)', () => {
    const candidatos = [
      { id: 'a', online: true, cargaSemana: 0, ufs: ['RJ'] },
      { id: 'b', online: true, cargaSemana: 9, ufs: ['sp', 'MG'] },
    ]
    expect(escolherAgenteAutomatico(lead, candidatos)).toBe('b')
    expect(escolherAgenteAutomatico({ uf: 'BA' }, candidatos)).toBeNull()
  })

  it('valor desconhecido (null/vazio) só passa por filtro vazio', () => {
    const candidatos = [
      { id: 'a', online: true, cargaSemana: 0, ufs: ['SP'] },
      { id: 'b', online: true, cargaSemana: 3 },
    ]
    expect(escolherAgenteAutomatico({ uf: null }, candidatos)).toBe('b')
    expect(escolherAgenteAutomatico({ uf: '  ' }, candidatos)).toBe('b')
    expect(escolherAgenteAutomatico({ uf: 'SP' }, candidatos)).toBe('a')
  })

  it('filtro de ramo funciona independente do de uf', () => {
    const candidatos = [
      { id: 'a', online: true, cargaSemana: 0, ramos: ['educacao'] },
      { id: 'b', online: true, cargaSemana: 1, ramos: ['saude'], ufs: ['SP'] },
    ]
    expect(escolherAgenteAutomatico(lead, candidatos)).toBe('b')
    expect(escolherAgenteAutomatico({ uf: 'SP', ramo: 'outro' }, candidatos)).toBeNull()
  })
})

describe('deveVoltarAoPool', () => {
  const config = { poolRetornoHoras: 48 }
  const base = { agenteId: 'v1', etapa: 'novo' as EtapaLead, reivindicadoEm: horasAtras(49), ultimoContatoEm: null }

  it('volta quando passou do prazo, está em novo e sem contato', () => {
    expect(deveVoltarAoPool(base, config, AGORA)).toBe(true)
  })

  it('no limite exato (reivindicado + prazo == agora) ainda não volta; 1 ms depois volta', () => {
    expect(deveVoltarAoPool({ ...base, reivindicadoEm: horasAtras(48) }, config, AGORA)).toBe(false)
    expect(deveVoltarAoPool({ ...base, reivindicadoEm: new Date(horasAtras(48).getTime() - 1) }, config, AGORA)).toBe(true)
  })

  it('não volta sem dono, fora da etapa novo ou sem data de reivindicação', () => {
    expect(deveVoltarAoPool({ ...base, agenteId: null }, config, AGORA)).toBe(false)
    expect(deveVoltarAoPool({ ...base, etapa: 'em_contato' }, config, AGORA)).toBe(false)
    expect(deveVoltarAoPool({ ...base, reivindicadoEm: null }, config, AGORA)).toBe(false)
  })

  it('contato depois da reivindicação segura o lead; contato anterior a ela não', () => {
    expect(deveVoltarAoPool({ ...base, ultimoContatoEm: horasAtras(10) }, config, AGORA)).toBe(false)
    expect(deveVoltarAoPool({ ...base, ultimoContatoEm: base.reivindicadoEm }, config, AGORA)).toBe(false)
    expect(deveVoltarAoPool({ ...base, ultimoContatoEm: horasAtras(60) }, config, AGORA)).toBe(true)
  })

  it('respeita o prazo configurado, inclusive 0 horas', () => {
    expect(deveVoltarAoPool({ ...base, reivindicadoEm: horasAtras(5) }, { poolRetornoHoras: 4 }, AGORA)).toBe(true)
    expect(deveVoltarAoPool({ ...base, reivindicadoEm: horasAtras(5) }, { poolRetornoHoras: 6 }, AGORA)).toBe(false)
    expect(deveVoltarAoPool({ ...base, reivindicadoEm: minutosAtras(1) }, { poolRetornoHoras: 0 }, AGORA)).toBe(true)
  })
})

describe('cadeiaDoAgente', () => {
  it('monta o snapshot completo (vendedor com equipe e corretora)', () => {
    const cadeia = cadeiaDoAgente(
      { id: 'v1', papel: 'vendedor', equipeId: 'e1', unidadeId: 'u1', corretoraId: 'c1' },
      { id: 'e1', supervisorAgenteId: 's1' },
      { id: 'c1', gerenteAgenteId: 'g1' },
    )
    expect(cadeia).toEqual({
      agenteId: 'v1',
      papel: 'vendedor',
      equipeId: 'e1',
      supervisorAgenteId: 's1',
      unidadeId: 'u1',
      corretoraId: 'c1',
      gerenteAgenteId: 'g1',
    })
  })

  it('solo: tudo nulo', () => {
    expect(cadeiaDoAgente({ id: 's', papel: 'vendedor' })).toEqual({
      agenteId: 's',
      papel: 'vendedor',
      equipeId: null,
      supervisorAgenteId: null,
      unidadeId: null,
      corretoraId: null,
      gerenteAgenteId: null,
    })
  })

  it('usa os ids do agente quando equipe/corretora não vêm carregadas', () => {
    const cadeia = cadeiaDoAgente({ id: 'v', papel: 'balcao', equipeId: 'e', corretoraId: 'c', unidadeId: 'u' })
    expect(cadeia).toMatchObject({ equipeId: 'e', corretoraId: 'c', unidadeId: 'u', supervisorAgenteId: null, gerenteAgenteId: null })
  })

  it('equipe/corretora sem supervisor/gerente definidos ficam nulos', () => {
    const cadeia = cadeiaDoAgente({ id: 'v', papel: 'vendedor' }, { id: 'e', supervisorAgenteId: null }, { id: 'c' })
    expect(cadeia).toMatchObject({ equipeId: 'e', corretoraId: 'c', supervisorAgenteId: null, gerenteAgenteId: null })
  })

  it('supervisor/gerente que vendem não pagam override a si mesmos', () => {
    const sup = cadeiaDoAgente({ id: 's1', papel: 'supervisor' }, { id: 'e1', supervisorAgenteId: 's1' }, { id: 'c1', gerenteAgenteId: 'g1' })
    expect(sup.supervisorAgenteId).toBeNull()
    expect(sup.gerenteAgenteId).toBe('g1')
    const ger = cadeiaDoAgente({ id: 'g1', papel: 'gerente' }, null, { id: 'c1', gerenteAgenteId: 'g1' })
    expect(ger.gerenteAgenteId).toBeNull()
    expect(ger.corretoraId).toBe('c1')
  })
})

describe('mesReferenciaSaoPaulo', () => {
  it('usa o mês de America/Sao_Paulo (UTC-3) na virada do mês', () => {
    expect(mesReferenciaSaoPaulo(new Date('2026-03-01T02:59:59Z'))).toBe('2026-02')
    expect(mesReferenciaSaoPaulo(new Date('2026-03-01T03:00:00Z'))).toBe('2026-03')
  })

  it('virada de ano', () => {
    expect(mesReferenciaSaoPaulo(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12')
    expect(mesReferenciaSaoPaulo(new Date('2027-01-01T03:00:00Z'))).toBe('2027-01')
  })
})

describe('arredondarCentavos', () => {
  it('arredonda a centavos com 0,005 subindo e corrige o erro binário', () => {
    expect(arredondarCentavos(0.005)).toBe(0.01)
    expect(arredondarCentavos(1.005)).toBe(1.01)
    expect(arredondarCentavos(2.5)).toBe(2.5)
    expect(arredondarCentavos(0.004)).toBe(0)
  })
})

describe('comissoesDaCobranca', () => {
  const gerar = (over: Partial<Parameters<typeof comissoesDaCobranca>[0]> & { cobranca: ReturnType<typeof cobranca> }) =>
    comissoesDaCobranca({ config: CONFIG, atribuicao: CADEIA_COMPLETA, agora: AGORA, ...over })

  const resumo = (r: ReturnType<typeof comissoesDaCobranca>) =>
    r.linhas.map(l => [l.parte, l.percentual, l.base, l.valor] as const)

  it('1ª parcela, cadeia completa: vendedor 100% e overrides sobre a comissão do vendedor', () => {
    const r = gerar({ cobranca: cobranca(1, 100) })
    expect(r.motivoNaoComissionavel).toBeNull()
    expect(resumo(r)).toEqual([
      ['vendedor', 100, 100, 100],
      ['supervisor', 10, 100, 10],
      ['gerente', 5, 100, 5],
      ['corretora', 5, 100, 5],
    ])
    expect(r.linhas.every(l => l.mesReferencia === '2026-06')).toBe(true)
  })

  it('beneficiários corretos: supervisor/gerente = agentes; corretora = empresa', () => {
    const r = gerar({ cobranca: cobranca(1) })
    const por = Object.fromEntries(r.linhas.map(l => [l.parte, l]))
    expect(por.vendedor).toMatchObject({ beneficiarioAgenteId: 'ag-vend', beneficiarioCorretoraId: null })
    expect(por.supervisor).toMatchObject({ beneficiarioAgenteId: 'ag-sup', beneficiarioCorretoraId: null })
    expect(por.gerente).toMatchObject({ beneficiarioAgenteId: 'ag-ger', beneficiarioCorretoraId: null })
    expect(por.corretora).toMatchObject({ beneficiarioAgenteId: null, beneficiarioCorretoraId: 'cor-1' })
  })

  it('2ª parcela: overrides incidem sobre os 50% do vendedor, não sobre o valor pago', () => {
    expect(resumo(gerar({ cobranca: cobranca(2, 100) }))).toEqual([
      ['vendedor', 50, 100, 50],
      ['supervisor', 10, 50, 5],
      ['gerente', 5, 50, 2.5],
      ['corretora', 5, 50, 2.5],
    ])
  })

  it('3ª parcela (25%) com valor quebrado arredonda a centavos', () => {
    const r = gerar({ cobranca: cobranca(3, 697) })
    expect(r.linhas[0]).toMatchObject({ parte: 'vendedor', valor: 174.25, base: 697 })
    expect(r.linhas[1]).toMatchObject({ parte: 'supervisor', valor: 17.43 }) // 17,425 → 17,43
    expect(r.linhas[2]).toMatchObject({ parte: 'gerente', valor: 8.71 }) // 8,7125
  })

  it('parcela 4 com escala de 3: nenhuma linha (nem vendedor nem overrides) e sem motivo de natureza', () => {
    const r = gerar({ cobranca: cobranca(4, 100) })
    expect(r.linhas).toEqual([])
    expect(r.motivoNaoComissionavel).toBeNull()
  })

  it('parcela 0, negativa ou fracionada não gera', () => {
    expect(gerar({ cobranca: cobranca(0) }).linhas).toEqual([])
    expect(gerar({ cobranca: cobranca(-1) }).linhas).toEqual([])
    expect(gerar({ cobranca: cobranca(1.5) }).linhas).toEqual([])
  })

  it('escala com parcela em 0% não gera linhas', () => {
    const r = gerar({ config: { ...CONFIG, escalaMensal: [100, 0, 25] }, cobranca: cobranca(2) })
    expect(r.linhas).toEqual([])
  })

  it('adesão usa percentualAdesao, ignora a escala e mantém overrides sobre a comissão', () => {
    expect(resumo(gerar({ cobranca: cobranca(1, 990, 'adesao') }))).toEqual([
      ['vendedor', 50, 990, 495],
      ['supervisor', 10, 495, 49.5],
      ['gerente', 5, 495, 24.75],
      ['corretora', 5, 495, 24.75],
    ])
    // adesão da parcela 7 ainda comissiona (não depende da escala)
    expect(gerar({ cobranca: cobranca(7, 100, 'adesao') }).linhas[0]).toMatchObject({ valor: 50 })
  })

  it('adesão com percentualAdesao 0 (tenant padrão) não gera nada', () => {
    const r = gerar({ config: { ...CONFIG, percentualAdesao: 0 }, cobranca: cobranca(1, 100, 'adesao') })
    expect(r.linhas).toEqual([])
  })

  it('solo: só a linha do vendedor, mesmo com overrides configurados', () => {
    const r = gerar({ atribuicao: SOLO, cobranca: cobranca(1, 200) })
    expect(resumo(r)).toEqual([['vendedor', 100, 200, 200]])
  })

  it('só supervisor na cadeia (sem gerente/corretora): vendedor + supervisor', () => {
    const r = gerar({
      atribuicao: { ...SOLO, equipeId: 'e1', supervisorAgenteId: 'ag-sup' },
      cobranca: cobranca(1, 100),
    })
    expect(r.linhas.map(l => l.parte)).toEqual(['vendedor', 'supervisor'])
  })

  it('corretora sem gerente (gerente nulo): corretora recebe, gerente não', () => {
    const r = gerar({ atribuicao: { ...CADEIA_COMPLETA, gerenteAgenteId: null }, cobranca: cobranca(1) })
    expect(r.linhas.map(l => l.parte)).toEqual(['vendedor', 'supervisor', 'corretora'])
  })

  it('corretora com overrides próprios sobrescreve os da config (chave a chave)', () => {
    const r = gerar({ overridesCorretora: { supervisor: 20, gerente: 0 }, cobranca: cobranca(1, 100) })
    // supervisor 20%, gerente 0% (não gera), corretora cai na config (5%)
    expect(resumo(r)).toEqual([
      ['vendedor', 100, 100, 100],
      ['supervisor', 20, 100, 20],
      ['corretora', 5, 100, 5],
    ])
  })

  it('overridesCorretora nulo/vazio mantém os da config', () => {
    expect(gerar({ overridesCorretora: null, cobranca: cobranca(1) }).linhas).toHaveLength(4)
    expect(gerar({ overridesCorretora: {}, cobranca: cobranca(1) }).linhas).toHaveLength(4)
  })

  it('overrides ausentes na config e na corretora não geram linhas', () => {
    const r = gerar({ config: { ...CONFIG, overrides: {} }, cobranca: cobranca(1) })
    expect(r.linhas.map(l => l.parte)).toEqual(['vendedor'])
  })

  it('balcão usa a escala própria quando existe', () => {
    const balcao: Atribuicao = { ...SOLO, agenteId: 'ag-bal', papel: 'balcao' }
    const config = { ...CONFIG, balcaoPercentual: [80, 40] }
    expect(gerar({ config, atribuicao: balcao, cobranca: cobranca(1, 100) }).linhas[0]).toMatchObject({ percentual: 80, valor: 80 })
    expect(gerar({ config, atribuicao: balcao, cobranca: cobranca(2, 100) }).linhas[0]).toMatchObject({ percentual: 40, valor: 40 })
    // além da escala PRÓPRIA do balcão: não cai na escala geral
    expect(gerar({ config, atribuicao: balcao, cobranca: cobranca(3, 100) }).linhas).toEqual([])
  })

  it('balcão sem escala própria (null ou vazia) usa a escala geral; vendedor ignora a do balcão', () => {
    const balcao: Atribuicao = { ...SOLO, papel: 'balcao' }
    expect(gerar({ atribuicao: balcao, cobranca: cobranca(3, 100) }).linhas[0]).toMatchObject({ percentual: 25 })
    expect(gerar({ config: { ...CONFIG, balcaoPercentual: [] }, atribuicao: balcao, cobranca: cobranca(1) }).linhas[0]).toMatchObject({
      percentual: 100,
    })
    expect(gerar({ config: { ...CONFIG, balcaoPercentual: [10] }, cobranca: cobranca(1) }).linhas[0]).toMatchObject({ percentual: 100 })
  })

  it('balcão: adesão continua usando percentualAdesao', () => {
    const balcao: Atribuicao = { ...SOLO, papel: 'balcao' }
    const config = { ...CONFIG, balcaoPercentual: [80] }
    expect(gerar({ config, atribuicao: balcao, cobranca: cobranca(1, 100, 'adesao') }).linhas[0]).toMatchObject({ percentual: 50, valor: 50 })
  })

  it('arredondamento 0,005 sobe para 0,01', () => {
    const r = gerar({ config: { ...CONFIG, escalaMensal: [10], overrides: {} }, atribuicao: SOLO, cobranca: cobranca(1, 0.05) })
    expect(r.linhas[0]).toMatchObject({ valor: 0.01, base: 0.05 })
  })

  it('override que arredonda a 0 não gera linha (nunca valor 0)', () => {
    const r = gerar({
      config: { ...CONFIG, escalaMensal: [100] },
      cobranca: cobranca(1, 0.01),
    })
    // vendedor 0,01; 10% = 0,001 → 0; 5% → 0
    expect(r.linhas.map(l => l.parte)).toEqual(['vendedor'])
    expect(r.linhas.every(l => l.valor > 0)).toBe(true)
  })

  it('valor pago 0 ou negativo: nenhuma linha e motivo explícito', () => {
    for (const valorPago of [0, -10]) {
      const r = gerar({ cobranca: cobranca(1, valorPago) })
      expect(r.linhas).toEqual([])
      expect(r.motivoNaoComissionavel).toMatch(/zerado/)
    }
    expect(gerar({ cobranca: cobranca(1, Number.NaN) }).linhas).toEqual([])
  })

  it('fatura avulsa (adjustment ou flag) não comissiona, com motivo', () => {
    const base = cobranca(1, 100)
    const a = gerar({ cobranca: { ...base, kind: 'adjustment' } })
    expect(a.linhas).toEqual([])
    expect(a.motivoNaoComissionavel).toMatch(/avulsa/i)
    expect(gerar({ cobranca: { ...base, avulsa: true } }).motivoNaoComissionavel).toMatch(/avulsa/i)
    // outros kinds comissionam normalmente
    expect(gerar({ cobranca: { ...base, kind: 'monthly' } }).linhas).toHaveLength(4)
  })

  it('mesReferencia respeita America/Sao_Paulo na virada do mês', () => {
    const r = gerar({ cobranca: cobranca(1), agora: new Date('2026-07-01T01:00:00Z') })
    expect(r.linhas[0]?.mesReferencia).toBe('2026-06')
    const r2 = gerar({ cobranca: cobranca(1), agora: new Date('2026-07-01T03:00:00Z') })
    expect(r2.linhas[0]?.mesReferencia).toBe('2026-07')
  })

  it('é idêntico para tenant (club) e plataforma — a origem não altera valores', () => {
    const plat = gerar({ cobranca: { ...cobranca(2, 49.9), origem: 'platform' } })
    const club = gerar({ cobranca: { ...cobranca(2, 49.9), origem: 'club' } })
    expect(club).toEqual(plat)
  })
})

describe('estornarComissao', () => {
  it('prevista e a_pagar viram cancelada; paga vira a_descontar', () => {
    expect(estornarComissao('prevista')).toBe('cancelada')
    expect(estornarComissao('a_pagar')).toBe('cancelada')
    expect(estornarComissao('paga')).toBe('a_descontar')
  })

  it('cancelada e a_descontar não mudam (null)', () => {
    const jaEstornadas: StatusComissao[] = ['cancelada', 'a_descontar']
    for (const s of jaEstornadas) expect(estornarComissao(s)).toBeNull()
  })
})

describe('simularEconomiaBalcao', () => {
  it('30% sobre R$ 200: paga 140, economiza 60 por consulta e 720 em 12', () => {
    expect(simularEconomiaBalcao({ valorTabela: 200, descontoPercentual: 30, precoMensal: 49.9, adesao: 0 })).toEqual({
      valorComPlano: 140,
      economiaNaConsulta: 60,
      economiaAnual12: 720,
      consultasParaCompensar: 1,
    })
  })

  it('consultas para compensar considera mensalidade + adesão, arredondando para cima', () => {
    const r = simularEconomiaBalcao({ valorTabela: 200, descontoPercentual: 30, precoMensal: 49.9, adesao: 70 })
    expect(r.consultasParaCompensar).toBe(2) // 119,90 / 60 = 1,998
    expect(simularEconomiaBalcao({ valorTabela: 200, descontoPercentual: 30, precoMensal: 60, adesao: 60 }).consultasParaCompensar).toBe(2) // exato
    expect(simularEconomiaBalcao({ valorTabela: 200, descontoPercentual: 30, precoMensal: 60, adesao: 60.01 }).consultasParaCompensar).toBe(3)
  })

  it('sem economia (desconto 0, valor 0 ou plano grátis sem desconto) → null', () => {
    expect(simularEconomiaBalcao({ valorTabela: 200, descontoPercentual: 0, precoMensal: 50, adesao: 0 })).toEqual({
      valorComPlano: 200,
      economiaNaConsulta: 0,
      economiaAnual12: 0,
      consultasParaCompensar: null,
    })
    expect(simularEconomiaBalcao({ valorTabela: 0, descontoPercentual: 30, precoMensal: 50, adesao: 0 }).consultasParaCompensar).toBeNull()
  })

  it('desconto 100% zera o valor com plano', () => {
    const r = simularEconomiaBalcao({ valorTabela: 80, descontoPercentual: 100, precoMensal: 40, adesao: 0 })
    expect(r).toMatchObject({ valorComPlano: 0, economiaNaConsulta: 80, economiaAnual12: 960, consultasParaCompensar: 1 })
  })

  it('custo inicial zero compensa com 0 consultas', () => {
    expect(simularEconomiaBalcao({ valorTabela: 100, descontoPercentual: 10, precoMensal: 0, adesao: 0 }).consultasParaCompensar).toBe(0)
  })

  it('arredonda centavos (valor quebrado)', () => {
    const r = simularEconomiaBalcao({ valorTabela: 99.99, descontoPercentual: 33, precoMensal: 30, adesao: 0 })
    expect(r.valorComPlano).toBe(66.99)
    expect(r.economiaNaConsulta).toBe(33)
    expect(r.economiaAnual12).toBe(396)
  })
})

describe('jornadaDoLead', () => {
  const lead = (over: Partial<Parameters<typeof jornadaDoLead>[0]> = {}) => ({
    etapa: 'novo' as EtapaLead,
    agenteId: null,
    ultimoContatoEm: null,
    ...over,
  })
  const estados = (passos: ReturnType<typeof jornadaDoLead>) => passos.map(p => p.estado)

  it('sempre devolve os 6 passos na ordem da spec', () => {
    expect(jornadaDoLead(lead(), []).map(p => p.id)).toEqual([
      'captado',
      'atribuido',
      'contato',
      'oferta',
      'negociacao',
      'fechado',
    ])
  })

  it('lead novo no pool: captado feito, atribuído é o "agora", resto falta', () => {
    expect(estados(jornadaDoLead(lead(), []))).toEqual(['feito', 'agora', 'falta', 'falta', 'falta', 'falta'])
  })

  it('reivindicado em novo: o "agora" é o contato', () => {
    expect(estados(jornadaDoLead(lead({ agenteId: 'v1' }), []))).toEqual(['feito', 'feito', 'agora', 'falta', 'falta', 'falta'])
  })

  it('contato registrado (campo ou evento) em etapa novo marca contato como feito', () => {
    expect(estados(jornadaDoLead(lead({ agenteId: 'v1', ultimoContatoEm: AGORA }), []))).toEqual([
      'feito', 'feito', 'feito', 'agora', 'falta', 'falta',
    ])
    expect(estados(jornadaDoLead(lead({ agenteId: 'v1' }), [{ tipo: 'whatsapp' }]))).toEqual([
      'feito', 'feito', 'feito', 'agora', 'falta', 'falta',
    ])
    // nota não é contato
    expect(estados(jornadaDoLead(lead({ agenteId: 'v1' }), [{ tipo: 'nota' }]))[2]).toBe('agora')
  })

  it('em_contato → oferta é o agora', () => {
    expect(estados(jornadaDoLead(lead({ etapa: 'em_contato', agenteId: 'v1' }), []))).toEqual([
      'feito', 'feito', 'feito', 'agora', 'falta', 'falta',
    ])
  })

  it('proposta → oferta feita, negociação agora', () => {
    expect(estados(jornadaDoLead(lead({ etapa: 'proposta', agenteId: 'v1' }), []))).toEqual([
      'feito', 'feito', 'feito', 'feito', 'agora', 'falta',
    ])
  })

  it('negociação → fechado é o agora', () => {
    expect(estados(jornadaDoLead(lead({ etapa: 'negociacao', agenteId: 'v1' }), []))).toEqual([
      'feito', 'feito', 'feito', 'feito', 'feito', 'agora',
    ])
  })

  it('retrocesso de etapa não desfaz o que o histórico mostra (evento etapa → proposta)', () => {
    const j = jornadaDoLead(lead({ etapa: 'em_contato', agenteId: 'v1' }), [{ tipo: 'etapa', dados: { para: 'proposta' } }])
    expect(estados(j)).toEqual(['feito', 'feito', 'feito', 'feito', 'agora', 'falta'])
  })

  it('evento etapa com dados inválidos é ignorado', () => {
    const j = jornadaDoLead(lead({ agenteId: 'v1' }), [
      { tipo: 'etapa', dados: { para: 'inexistente' } },
      { tipo: 'etapa', dados: null },
      { tipo: 'etapa', dados: { para: 3 } },
    ])
    expect(estados(j)).toEqual(['feito', 'feito', 'agora', 'falta', 'falta', 'falta'])
  })

  it('ganho: fechado feito com resultado ganho; passos sem evidência viram pulado (ex.: balcão sem dono)', () => {
    const j = jornadaDoLead(lead({ etapa: 'ganho', agenteId: 'b1' }), [])
    expect(estados(j)).toEqual(['feito', 'feito', 'feito', 'feito', 'feito', 'feito'])
    expect(j[5]).toMatchObject({ id: 'fechado', resultado: 'ganho' })
    const semDono = jornadaDoLead(lead({ etapa: 'ganho' }), [])
    expect(semDono[1]?.estado).toBe('pulado')
  })

  it('perdido: fechado feito com resultado perdido e nenhum agora/falta', () => {
    const j = jornadaDoLead(lead({ etapa: 'perdido', agenteId: 'v1', ultimoContatoEm: AGORA }), [])
    expect(estados(j)).toEqual(['feito', 'feito', 'feito', 'pulado', 'pulado', 'feito'])
    expect(j[5]).toMatchObject({ estado: 'feito', resultado: 'perdido' })
  })

  it('perdido após negociação: usa o histórico de etapas', () => {
    const j = jornadaDoLead(lead({ etapa: 'perdido', agenteId: 'v1' }), [
      { tipo: 'ligacao' },
      { tipo: 'etapa', dados: { para: 'negociacao' } },
    ])
    expect(estados(j)).toEqual(['feito', 'feito', 'feito', 'feito', 'feito', 'feito'])
  })

  it('perdido ainda no pool (sem dono nem contato): só captado e fechado', () => {
    const j = jornadaDoLead(lead({ etapa: 'perdido' }), [])
    expect(estados(j)).toEqual(['feito', 'pulado', 'pulado', 'pulado', 'pulado', 'feito'])
  })

  it('passos que não são fechado não carregam resultado', () => {
    expect(jornadaDoLead(lead({ etapa: 'ganho', agenteId: 'v' }), []).filter(p => p.resultado)).toHaveLength(1)
    expect(jornadaDoLead(lead(), []).some(p => 'resultado' in p)).toBe(false)
  })
})

describe('proximoPassoDoLead', () => {
  const lead = (over: Partial<Parameters<typeof proximoPassoDoLead>[0]> = {}) => ({
    etapa: 'em_contato' as EtapaLead,
    agenteId: 'v1',
    ultimoContatoEm: horasAtras(1) as Date | null,
    proximoPasso: null as string | null,
    proximoPassoEm: null as Date | null,
    ...over,
  })

  it('sem dono: atender este lead (voce)', () => {
    expect(proximoPassoDoLead(lead({ agenteId: null, etapa: 'novo', ultimoContatoEm: null }), AGORA)).toEqual({
      quem: 'voce',
      texto: 'Atender este lead',
      atrasado: false,
    })
  })

  it('dono sem contato: primeiro contato', () => {
    expect(proximoPassoDoLead(lead({ etapa: 'novo', ultimoContatoEm: null }), AGORA)).toEqual({
      quem: 'voce',
      texto: 'Fazer o primeiro contato',
      atrasado: false,
    })
  })

  it('próximo passo agendado no futuro: texto dele, não atrasado', () => {
    const r = proximoPassoDoLead(lead({ proximoPasso: 'Ligar para fechar', proximoPassoEm: new Date(AGORA.getTime() + 1000) }), AGORA)
    expect(r).toEqual({ quem: 'voce', texto: 'Ligar para fechar', atrasado: false })
  })

  it('atrasado só quando proximoPassoEm < agora (igual a agora não é atraso)', () => {
    expect(proximoPassoDoLead(lead({ proximoPasso: 'x', proximoPassoEm: new Date(AGORA.getTime() - 1) }), AGORA).atrasado).toBe(true)
    expect(proximoPassoDoLead(lead({ proximoPasso: 'x', proximoPassoEm: AGORA }), AGORA).atrasado).toBe(false)
  })

  it('próximo passo agendado vence "primeiro contato" (ex.: balcão "vai pensar") e usa texto padrão sem descrição', () => {
    const r = proximoPassoDoLead(lead({ ultimoContatoEm: null, proximoPassoEm: diasAtras(-2) }), AGORA)
    expect(r).toEqual({ quem: 'voce', texto: 'Retomar o contato', atrasado: false })
    expect(proximoPassoDoLead(lead({ proximoPasso: '   ', proximoPassoEm: diasAtras(1) }), AGORA)).toEqual({
      quem: 'voce',
      texto: 'Retomar o contato',
      atrasado: true,
    })
  })

  it('texto sem data: aparece, nunca atrasado', () => {
    expect(proximoPassoDoLead(lead({ proximoPasso: 'Mandar tabela' }), AGORA)).toEqual({
      quem: 'voce',
      texto: 'Mandar tabela',
      atrasado: false,
    })
  })

  it('proposta sem próximo passo: aguardando o cliente', () => {
    expect(proximoPassoDoLead(lead({ etapa: 'proposta' }), AGORA)).toEqual({
      quem: 'cliente',
      texto: 'Aguardando resposta à proposta',
      atrasado: false,
    })
  })

  it('proposta com próximo passo agendado: o passo agendado vale', () => {
    const r = proximoPassoDoLead(lead({ etapa: 'proposta', proximoPasso: 'Cobrar retorno', proximoPassoEm: diasAtras(1) }), AGORA)
    expect(r).toMatchObject({ quem: 'voce', texto: 'Cobrar retorno', atrasado: true })
  })

  it('em andamento sem nada agendado: definir o próximo passo', () => {
    expect(proximoPassoDoLead(lead({ etapa: 'negociacao' }), AGORA)).toEqual({
      quem: 'voce',
      texto: 'Definir o próximo passo',
      atrasado: false,
    })
  })

  it('ganho e perdido: encerrado (sistema), mesmo no pool ou com passo vencido', () => {
    for (const etapa of ['ganho', 'perdido'] as const) {
      expect(proximoPassoDoLead(lead({ etapa, agenteId: null, proximoPassoEm: diasAtras(3) }), AGORA)).toEqual({
        quem: 'sistema',
        texto: 'Encerrado',
        atrasado: false,
      })
    }
  })
})

describe('numerosDaSemana', () => {
  const ev = (tipo: EventoLeadRegra['tipo'], em: Date, dados?: Record<string, unknown>): EventoLeadRegra => ({
    tipo,
    em,
    dados: dados ?? null,
  })

  it('sem dados: tudo zero e variação 0', () => {
    const z = { atual: 0, anterior: 0, variacao: 0 }
    expect(numerosDaSemana([], [], AGORA)).toEqual({ contatos: z, reunioes: z, propostas: z, vendas: z })
  })

  it('conta contatos, reuniões, propostas e vendas nas duas janelas', () => {
    const eventos = [
      ev('ligacao', diasAtras(1)),
      ev('whatsapp', diasAtras(2)),
      ev('email', diasAtras(3)),
      ev('reuniao', diasAtras(4)),
      ev('visita', diasAtras(5)),
      ev('atendimento_balcao', diasAtras(6)),
      ev('nota', diasAtras(1)), // não é contato
      ev('etapa', diasAtras(2), { para: 'proposta' }),
      ev('etapa', diasAtras(2), { para: 'negociacao' }), // não é proposta
      ev('ligacao', diasAtras(8)),
      ev('reuniao', diasAtras(9)),
      ev('reuniao', diasAtras(10)),
      ev('etapa', diasAtras(12), { para: 'proposta' }),
      ev('ligacao', diasAtras(20)), // fora das duas janelas
    ]
    const leads = [{ ganhoEm: diasAtras(1) }, { ganhoEm: diasAtras(2) }, { ganhoEm: diasAtras(9) }, { ganhoEm: null }, {}]
    const r = numerosDaSemana(eventos, leads, AGORA)
    expect(r.contatos).toEqual({ atual: 6, anterior: 3, variacao: 100 })
    expect(r.reunioes).toEqual({ atual: 1, anterior: 2, variacao: -50 })
    expect(r.propostas).toEqual({ atual: 1, anterior: 1, variacao: 0 })
    expect(r.vendas).toEqual({ atual: 2, anterior: 1, variacao: 100 })
  })

  it('limites: agora entra na atual; agora−7d é da anterior; agora−14d fica fora; futuro fora', () => {
    const eventos = [
      ev('ligacao', AGORA),
      ev('ligacao', diasAtras(7)),
      ev('ligacao', diasAtras(14)),
      ev('ligacao', new Date(AGORA.getTime() + 1)),
      ev('ligacao', new Date(diasAtras(7).getTime() + 1)),
      ev('ligacao', new Date(diasAtras(14).getTime() + 1)),
    ]
    const r = numerosDaSemana(eventos, [], AGORA)
    expect(r.contatos.atual).toBe(2) // AGORA e agora−7d+1ms
    expect(r.contatos.anterior).toBe(2) // agora−7d e agora−14d+1ms
  })

  it('variação: anterior 0 com atual > 0 = 100; queda total = −100; arredonda a 1 casa', () => {
    const r1 = numerosDaSemana([ev('ligacao', diasAtras(1))], [], AGORA)
    expect(r1.contatos).toEqual({ atual: 1, anterior: 0, variacao: 100 })
    const r2 = numerosDaSemana([ev('ligacao', diasAtras(8))], [], AGORA)
    expect(r2.contatos).toEqual({ atual: 0, anterior: 1, variacao: -100 })
    const tres = [ev('ligacao', diasAtras(1)), ev('ligacao', diasAtras(8)), ev('ligacao', diasAtras(9)), ev('ligacao', diasAtras(10))]
    expect(numerosDaSemana(tres, [], AGORA).contatos).toEqual({ atual: 1, anterior: 3, variacao: -66.7 })
  })
})

describe('resumirFunil', () => {
  it('lista vazia: tudo zero', () => {
    expect(resumirFunil([])).toEqual({
      porEtapa: { novo: 0, em_contato: 0, proposta: 0, negociacao: 0, ganho: 0, perdido: 0 },
      total: 0,
      ganhos: 0,
      perdidos: 0,
      taxaConversao: 0,
      valorEmNegociacao: 0,
    })
  })

  it('conta por etapa, calcula conversão e soma só o valor em negociação', () => {
    const r = resumirFunil([
      { etapa: 'novo' },
      { etapa: 'novo', valorEstimado: 999 },
      { etapa: 'em_contato' },
      { etapa: 'proposta', valorEstimado: 500 },
      { etapa: 'negociacao', valorEstimado: 1000.5 },
      { etapa: 'negociacao', valorEstimado: 200.25 },
      { etapa: 'negociacao', valorEstimado: null },
      { etapa: 'negociacao' },
      { etapa: 'ganho', valorEstimado: 300 },
      { etapa: 'perdido' },
    ])
    expect(r.porEtapa).toEqual({ novo: 2, em_contato: 1, proposta: 1, negociacao: 4, ganho: 1, perdido: 1 })
    expect(r.total).toBe(10)
    expect(r.ganhos).toBe(1)
    expect(r.perdidos).toBe(1)
    expect(r.taxaConversao).toBe(10)
    expect(r.valorEmNegociacao).toBe(1200.75)
  })

  it('taxa de conversão arredonda a 1 casa', () => {
    const r = resumirFunil([{ etapa: 'ganho' }, { etapa: 'novo' }, { etapa: 'novo' }])
    expect(r.taxaConversao).toBe(33.3)
    expect(resumirFunil([{ etapa: 'ganho' }]).taxaConversao).toBe(100)
  })
})

describe('rankingDeAgentes', () => {
  const agentes = [
    { id: 'a', nome: 'Ana' },
    { id: 'b', nome: 'Bruno' },
    { id: 'c', nome: 'Carla' },
    { id: 'd', nome: 'Davi' },
  ]

  it('sem agentes: lista vazia', () => {
    expect(rankingDeAgentes([], [], [])).toEqual([])
  })

  it('inclui agentes sem atividade com zeros e posições sequenciais', () => {
    const r = rankingDeAgentes([], [], agentes)
    expect(r.map(l => [l.posicao, l.nome, l.fechamentos, l.valor, l.comissao])).toEqual([
      [1, 'Ana', 0, 0, 0],
      [2, 'Bruno', 0, 0, 0],
      [3, 'Carla', 0, 0, 0],
      [4, 'Davi', 0, 0, 0],
    ])
  })

  it('ordena por fechamentos, depois por valor, depois por nome', () => {
    const leads = [
      { agenteId: 'a', etapa: 'ganho' as const, valorEstimado: 100 },
      { agenteId: 'b', etapa: 'ganho' as const, valorEstimado: 300 },
      { agenteId: 'b', etapa: 'ganho' as const, valorEstimado: 50 },
      { agenteId: 'c', etapa: 'ganho' as const, valorEstimado: 500 },
      { agenteId: 'd', etapa: 'ganho' as const, valorEstimado: 100 },
    ]
    const r = rankingDeAgentes(leads, [], agentes)
    expect(r.map(l => l.agenteId)).toEqual(['b', 'c', 'a', 'd']) // b:2; c:500; a e d empatam → nome
    expect(r[0]).toMatchObject({ posicao: 1, fechamentos: 2, valor: 350 })
  })

  it('só leads ganhos contam; valor nulo vale 0; lead sem dono é ignorado', () => {
    const leads = [
      { agenteId: 'a', etapa: 'ganho' as const, valorEstimado: null },
      { agenteId: 'a', etapa: 'ganho' as const },
      { agenteId: 'a', etapa: 'negociacao' as const, valorEstimado: 999 },
      { agenteId: 'a', etapa: 'perdido' as const, valorEstimado: 999 },
      { agenteId: null, etapa: 'ganho' as const, valorEstimado: 999 },
      { agenteId: 'zzz', etapa: 'ganho' as const, valorEstimado: 999 },
    ]
    const r = rankingDeAgentes(leads, [], [{ id: 'a', nome: 'Ana' }])
    expect(r).toEqual([{ posicao: 1, agenteId: 'a', nome: 'Ana', fechamentos: 2, valor: 0, comissao: 0 }])
  })

  it('comissão soma as não canceladas do beneficiário e arredonda', () => {
    const comissoes = [
      { beneficiarioAgenteId: 'a', valor: 10.1, status: 'paga' as const },
      { beneficiarioAgenteId: 'a', valor: 20.2, status: 'a_pagar' as const },
      { beneficiarioAgenteId: 'a', valor: 5, status: 'prevista' as const },
      { beneficiarioAgenteId: 'a', valor: 5, status: 'a_descontar' as const },
      { beneficiarioAgenteId: 'a', valor: 99, status: 'cancelada' as const },
      { beneficiarioAgenteId: 'b', valor: 1, status: 'paga' as const },
      { beneficiarioAgenteId: null, valor: 1000, status: 'paga' as const },
    ]
    const r = rankingDeAgentes([], comissoes, [{ id: 'a', nome: 'Ana' }, { id: 'b', nome: 'Bruno' }])
    expect(r.find(l => l.agenteId === 'a')?.comissao).toBe(40.3)
    expect(r.find(l => l.agenteId === 'b')?.comissao).toBe(1)
  })

  it('empate total desempata por id e não muta as entradas', () => {
    const entrada = [
      { id: 'y', nome: 'Igual' },
      { id: 'x', nome: 'Igual' },
    ]
    const r = rankingDeAgentes([], [], entrada)
    expect(r.map(l => l.agenteId)).toEqual(['x', 'y'])
    expect(entrada.map(a => a.id)).toEqual(['y', 'x'])
  })
})
