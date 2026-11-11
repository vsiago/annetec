import { describe, expect, it } from 'vitest'
import {
  LIMIARES_TEMPERATURA,
  avaliarTemperatura,
  compararNoQuadro,
  inicioDoMesSaoPaulo,
  sentimentoDoEvento,
  temperaturaDoLead,
  type EntradaTemperatura,
  type LeadParaOrdemQuadro,
} from '@/modules/vendas-rede/rules'

/**
 * Temperatura do lead (sentimento por regra, sem IA): cada ramo da regra, os limites exatos,
 * a ordem do quadro e o início do mês em Brasília.
 */

const AGORA = new Date('2026-11-11T15:00:00.000Z')
const DIA = 86_400_000
const diasAtras = (dias: number, base: Date = AGORA) => new Date(base.getTime() - dias * DIA)
const diasAdiante = (dias: number) => new Date(AGORA.getTime() + dias * DIA)

function entrada(extra: Partial<EntradaTemperatura> = {}): EntradaTemperatura {
  return { etapa: 'em_contato', ultimoContatoEm: diasAtras(2), ultimoSentimento: null, proximoPassoEm: null, agora: AGORA, ...extra }
}

describe('temperaturaDoLead: sem temperatura', () => {
  it('lead novo sem contato = null', () => {
    expect(temperaturaDoLead(entrada({ etapa: 'novo', ultimoContatoEm: null }))).toBeNull()
  })

  it('lead novo sem contato continua null mesmo com próximo passo atrasado', () => {
    expect(temperaturaDoLead(entrada({ etapa: 'novo', ultimoContatoEm: null, proximoPassoEm: diasAtras(30) }))).toBeNull()
  })

  it('fechados (ganho e perdido) = null, qualquer que seja o sentimento', () => {
    expect(temperaturaDoLead(entrada({ etapa: 'ganho', ultimoSentimento: 'positivo' }))).toBeNull()
    expect(temperaturaDoLead(entrada({ etapa: 'perdido', ultimoSentimento: 'negativo' }))).toBeNull()
  })
})

describe('temperaturaDoLead: fria', () => {
  it('último sentimento negativo = fria, mesmo com contato de hoje', () => {
    const r = avaliarTemperatura(entrada({ ultimoContatoEm: AGORA, ultimoSentimento: 'negativo' }))
    expect(r).toEqual({ nivel: 'fria', motivo: 'Reagiu sem interesse hoje' })
  })

  it('negativo vence negociação recente', () => {
    expect(temperaturaDoLead(entrada({ etapa: 'negociacao', ultimoContatoEm: diasAtras(1), ultimoSentimento: 'negativo' }))).toBe('fria')
  })

  it('sem contato há mais de 14 dias = fria; com exatamente 14 dias ainda não', () => {
    const fria = avaliarTemperatura(entrada({ ultimoContatoEm: diasAtras(15) }))
    expect(fria).toEqual({ nivel: 'fria', motivo: 'Sem contato há 15 dias' })
    expect(temperaturaDoLead(entrada({ ultimoContatoEm: diasAtras(LIMIARES_TEMPERATURA.friaSemContato) }))).toBe('morna')
  })

  it('interesse antigo (positivo há mais de 14 dias) também esfria', () => {
    expect(temperaturaDoLead(entrada({ ultimoContatoEm: diasAtras(20), ultimoSentimento: 'positivo' }))).toBe('fria')
  })

  it('próximo passo atrasado há mais de 7 dias = fria; com 7 dias ainda não', () => {
    const r = avaliarTemperatura(entrada({ proximoPassoEm: diasAtras(9) }))
    expect(r).toEqual({ nivel: 'fria', motivo: 'Próximo passo atrasado há 9 dias' })
    expect(temperaturaDoLead(entrada({ proximoPassoEm: diasAtras(LIMIARES_TEMPERATURA.friaPassoAtrasado) }))).toBe('morna')
  })

  it('próximo passo no futuro não esfria', () => {
    expect(temperaturaDoLead(entrada({ proximoPassoEm: diasAdiante(3) }))).toBe('morna')
  })

  it('passo atrasado esfria até lead com interesse recente (a data vencida pesa mais)', () => {
    expect(temperaturaDoLead(entrada({ ultimoContatoEm: diasAtras(2), ultimoSentimento: 'positivo', proximoPassoEm: diasAtras(10) }))).toBe('fria')
  })

  it('"1 dia" no singular', () => {
    expect(avaliarTemperatura(entrada({ ultimoContatoEm: diasAtras(1), ultimoSentimento: 'negativo' }))?.motivo).toBe('Reagiu sem interesse há 1 dia')
  })
})

describe('temperaturaDoLead: quente', () => {
  it('positivo há 7 dias ou menos = quente, com frase para o tooltip', () => {
    const r = avaliarTemperatura(entrada({ ultimoContatoEm: diasAtras(2), ultimoSentimento: 'positivo' }))
    expect(r).toEqual({ nivel: 'quente', motivo: 'Reagiu com interesse há 2 dias' })
  })

  it('positivo no limite de 7 dias ainda é quente; com 8 vira morna', () => {
    expect(temperaturaDoLead(entrada({ ultimoContatoEm: diasAtras(7), ultimoSentimento: 'positivo' }))).toBe('quente')
    const morna = avaliarTemperatura(entrada({ ultimoContatoEm: diasAtras(8), ultimoSentimento: 'positivo' }))
    expect(morna).toEqual({ nivel: 'morna', motivo: 'Mostrou interesse há 8 dias, sem novo contato' })
  })

  it('em negociação com contato há 3 dias ou menos = quente, mesmo sem sentimento', () => {
    const r = avaliarTemperatura(entrada({ etapa: 'negociacao', ultimoContatoEm: diasAtras(3) }))
    expect(r).toEqual({ nivel: 'quente', motivo: 'Em negociação, contato há 3 dias' })
    expect(avaliarTemperatura(entrada({ etapa: 'negociacao', ultimoContatoEm: AGORA }))?.motivo).toBe('Em negociação, contato hoje')
  })

  it('em negociação com contato há 4 dias = morna', () => {
    expect(temperaturaDoLead(entrada({ etapa: 'negociacao', ultimoContatoEm: diasAtras(4) }))).toBe('morna')
  })

  it('fora da negociação, contato recente sem sentimento não esquenta', () => {
    expect(temperaturaDoLead(entrada({ etapa: 'proposta', ultimoContatoEm: diasAtras(1) }))).toBe('morna')
  })
})

describe('temperaturaDoLead: morna', () => {
  it('reação neutra = morna', () => {
    expect(avaliarTemperatura(entrada({ ultimoContatoEm: diasAtras(3), ultimoSentimento: 'neutro' }))).toEqual({
      nivel: 'morna',
      motivo: 'Reagiu de forma neutra há 3 dias',
    })
  })

  it('contato recente sem sentimento informado = morna', () => {
    expect(avaliarTemperatura(entrada({ ultimoContatoEm: diasAtras(5) }))).toEqual({
      nivel: 'morna',
      motivo: 'Último contato há 5 dias, sem sinal claro de interesse',
    })
  })

  it('etapa avançada sem nenhum contato registrado = morna (não é novo)', () => {
    expect(avaliarTemperatura(entrada({ etapa: 'proposta', ultimoContatoEm: null }))).toEqual({
      nivel: 'morna',
      motivo: 'Ainda sem contato registrado',
    })
  })

  it('passo atrasado há poucos dias (7 ou menos) não esfria', () => {
    expect(temperaturaDoLead(entrada({ proximoPassoEm: diasAtras(3) }))).toBe('morna')
  })
})

describe('sentimentoDoEvento', () => {
  it('lê só valores válidos de dados.sentimento', () => {
    expect(sentimentoDoEvento({ sentimento: 'positivo' })).toBe('positivo')
    expect(sentimentoDoEvento({ sentimento: 'neutro' })).toBe('neutro')
    expect(sentimentoDoEvento({ sentimento: 'negativo' })).toBe('negativo')
    expect(sentimentoDoEvento({ sentimento: 'animado' })).toBeNull()
    expect(sentimentoDoEvento({ outro: 1 })).toBeNull()
    expect(sentimentoDoEvento(null)).toBeNull()
    expect(sentimentoDoEvento(undefined)).toBeNull()
  })
})

describe('compararNoQuadro', () => {
  const base = (extra: Partial<LeadParaOrdemQuadro> & { id: string }): LeadParaOrdemQuadro => ({
    atrasado: false,
    temperatura: null,
    etapaDesde: diasAtras(1),
    ...extra,
  })

  it('atrasados primeiro; depois quente, morna, fria e sem temperatura; depois o mais antigo na etapa', () => {
    const lista: LeadParaOrdemQuadro[] = [
      base({ id: 'sem' }),
      base({ id: 'fria', temperatura: 'fria' }),
      base({ id: 'morna-nova', temperatura: 'morna', etapaDesde: diasAtras(1) }),
      base({ id: 'morna-velha', temperatura: 'morna', etapaDesde: diasAtras(9) }),
      base({ id: 'quente', temperatura: 'quente' }),
      base({ id: 'atrasado-fria', atrasado: true, temperatura: 'fria' }),
      base({ id: 'atrasado-quente', atrasado: true, temperatura: 'quente' }),
    ]
    expect([...lista].sort(compararNoQuadro).map(l => l.id)).toEqual([
      'atrasado-quente',
      'atrasado-fria',
      'quente',
      'morna-velha',
      'morna-nova',
      'fria',
      'sem',
    ])
  })

  it('empate total desempata por id (ordem estável)', () => {
    const a = base({ id: 'a' })
    const b = base({ id: 'b' })
    expect([b, a].sort(compararNoQuadro).map(l => l.id)).toEqual(['a', 'b'])
  })
})

describe('inicioDoMesSaoPaulo', () => {
  it('é a meia-noite do dia 1º em Brasília (UTC-3)', () => {
    expect(inicioDoMesSaoPaulo(new Date('2026-11-11T15:00:00.000Z')).toISOString()).toBe('2026-11-01T03:00:00.000Z')
  })

  it('virada do mês: 1º de dezembro 01h em Brasília ainda é o mês novo; 30/11 22h não', () => {
    expect(inicioDoMesSaoPaulo(new Date('2026-12-01T04:00:00.000Z')).toISOString()).toBe('2026-12-01T03:00:00.000Z')
    expect(inicioDoMesSaoPaulo(new Date('2026-12-01T01:00:00.000Z')).toISOString()).toBe('2026-11-01T03:00:00.000Z')
  })
})
