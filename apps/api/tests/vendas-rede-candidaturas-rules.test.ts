import {
  CANDIDATURA_ATUACOES,
  CANDIDATURA_TERMOS,
  aprovarCandidaturaInput,
  iniciarCandidaturaInput,
  recusarCandidaturaInput,
} from '@annetec/contracts'
import { describe, expect, it } from 'vitest'
import { renderEmail } from '@/lib/email/templates'
import { acompanhamentoPath, acompanhamentoUrl, candidaturaAccessKey, isValidCandidaturaAccessKey } from '@/modules/vendas-rede/candidaturas-access-key'
import { documentosObrigatorios, papelDaAtuacao, pendencias, vinculoSugerido } from '@/modules/vendas-rede/candidaturas.rules'

const ID = '5f0f6c0e-7a5b-4a53-9c2e-1d0a4a8b9c11'
const endereco = { cep: '20000000', logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Rio de Janeiro', uf: 'RJ' }

describe('candidaturas: regras puras', () => {
  it('documentos obrigatórios por tipo de pessoa', () => {
    expect(documentosObrigatorios('pf')).toEqual(['documento_identidade', 'comprovante_endereco'])
    expect(documentosObrigatorios('pj')).toEqual(['documento_identidade', 'comprovante_endereco', 'cartao_cnpj'])
  })

  it('papelDaAtuacao cobre todas as atuações', () => {
    expect(CANDIDATURA_ATUACOES.map(papelDaAtuacao)).toEqual(['vendedor', 'vendedor', 'supervisor', 'gerente', 'gerente'])
  })

  it('pendências: pronta quando tudo está preenchido', () => {
    const docs = [{ kind: 'documento_identidade' as const, status: 'uploaded' }, { kind: 'comprovante_endereco' as const }]
    expect(pendencias({ candidatura: { tipoPessoa: 'pf', atuacao: 'vendedor_solo', endereco }, documentos: docs })).toEqual([])
  })

  it('pendências: lista endereço, documentos e dados da PJ; ignora documento substituído', () => {
    const faltas = pendencias({
      candidatura: { tipoPessoa: 'pj', atuacao: 'corretora', cnpj: '11222333000181', endereco: null },
      documentos: [
        { kind: 'documento_identidade', status: 'replaced' },
        { kind: 'comprovante_endereco', status: 'uploaded' },
      ],
    })
    expect(faltas).toContain('Informe a razão social')
    expect(faltas).toContain('Informe o nome fantasia')
    expect(faltas).toContain('Preencha o endereço completo')
    expect(faltas).toContain('Envie o documento: Documento de identidade (RG ou CNH)')
    expect(faltas).toContain('Envie o documento: Cartão CNPJ')
    expect(faltas.some(f => f.includes('Comprovante de endereço'))).toBe(false)
  })

  it('pendências: vendedor em equipe exige código resolvido', () => {
    const base = { tipoPessoa: 'pf' as const, atuacao: 'vendedor_equipe' as const, endereco }
    expect(pendencias({ candidatura: base, documentos: [] })).toContain('Informe o código de quem vai indicar você')
    expect(pendencias({ candidatura: { ...base, codigoIndicacao: 'ABCD23' }, documentos: [] })).toContain(
      'O código de indicação informado não foi encontrado',
    )
    expect(
      pendencias({ candidatura: { ...base, codigoIndicacao: 'ABCD23', indicadoPorAgenteId: 'x' }, documentos: [] }).some(f => f.includes('código')),
    ).toBe(false)
  })

  it('vínculo sugerido por papel do indicador', () => {
    expect(vinculoSugerido(null)).toEqual({ motivo: expect.any(String) })
    expect(vinculoSugerido({ nome: 'Fulano', papel: 'supervisor', corretoraId: 'c1', equipeSupervisionadaId: 'e1' })).toEqual({
      corretoraId: 'c1',
      equipeId: 'e1',
      motivo: 'Equipe de Fulano (supervisor)',
    })
    const vendedor = vinculoSugerido({ nome: 'Beltrano', papel: 'vendedor', corretoraId: 'c1', unidadeId: 'u1', equipeId: 'e2' })
    expect(vendedor).toMatchObject({ corretoraId: 'c1', unidadeId: 'u1', equipeId: 'e2' })
    expect(vinculoSugerido({ nome: 'Gera', papel: 'gerente', corretoraId: 'c9', equipeId: 'e9' })).toEqual({
      corretoraId: 'c9',
      motivo: 'Corretora de Gera (gerente)',
    })
    expect(vinculoSugerido({ nome: 'Adm', papel: 'master' })).not.toHaveProperty('equipeId')
  })
})

describe('candidaturas: chave de acompanhamento', () => {
  it('gera chave de 32 caracteres e valida em tempo constante', () => {
    const chave = candidaturaAccessKey(ID)
    expect(chave).toHaveLength(32)
    expect(isValidCandidaturaAccessKey(ID, chave)).toBe(true)
    expect(isValidCandidaturaAccessKey(ID, chave.slice(0, 31) + (chave.endsWith('a') ? 'b' : 'a'))).toBe(false)
    expect(isValidCandidaturaAccessKey(ID, 'curta')).toBe(false)
    expect(isValidCandidaturaAccessKey(ID, null)).toBe(false)
    expect(isValidCandidaturaAccessKey('outro-id', chave)).toBe(false)
  })

  it('caminhos por escopo', () => {
    const chave = candidaturaAccessKey(ID)
    expect(acompanhamentoPath({ scope: 'platform' }, ID, chave)).toBe(`/seja-parceiro/${ID}?chave=${chave}`)
    expect(acompanhamentoPath({ scope: 'tenant', tenantSlug: 'mepcard' }, ID)).toBe(`/mepcard/seja-parceiro/${ID}?chave=${chave}`)
    expect(acompanhamentoUrl({ scope: 'platform' }, ID)).toMatch(/^https?:\/\/.+\/seja-parceiro\//)
  })
})

describe('candidaturas: contratos e e-mails', () => {
  const base = { tipoPessoa: 'pf', atuacao: 'vendedor_solo', nome: 'Maria Souza', email: 'Maria@Ex.com', telefone: '(21) 99999-8888', cpf: '529.982.247-25' }

  it('iniciar: refines de corretora, PJ e vendedor em equipe', () => {
    expect(iniciarCandidaturaInput.safeParse(base).success).toBe(true)
    expect(iniciarCandidaturaInput.safeParse({ ...base, atuacao: 'corretora' }).success).toBe(false)
    expect(iniciarCandidaturaInput.safeParse({ ...base, tipoPessoa: 'pj' }).success).toBe(false)
    expect(iniciarCandidaturaInput.safeParse({ ...base, atuacao: 'vendedor_equipe' }).success).toBe(false)
    expect(iniciarCandidaturaInput.safeParse({ ...base, atuacao: 'vendedor_equipe', codigoIndicacao: 'ABCD23' }).success).toBe(true)
    expect(iniciarCandidaturaInput.safeParse({ ...base, website: 'spam' }).success).toBe(false)
  })

  it('aprovar e recusar', () => {
    expect(aprovarCandidaturaInput.parse({}).enviarConvite).toBe(true)
    expect(recusarCandidaturaInput.safeParse({ motivo: 'curto' }).success).toBe(false)
  })

  it('termos têm cabeçalho e 10 cláusulas', () => {
    expect(CANDIDATURA_TERMOS).toHaveLength(11)
  })

  it('templates renderizam as três variações', () => {
    const d = { clubName: 'Mepcard', nome: 'Maria Souza', acompanhamentoUrl: 'https://x.test/a' }
    expect(renderEmail('vendas_candidatura_recebida', d).subject).toBe('Recebemos sua candidatura')
    expect(renderEmail('vendas_candidatura_recebida', { ...d, variante: 'acesso' }).subject).toBe('Seu link de acompanhamento')
    const recusada = renderEmail('vendas_candidatura_recusada', { ...d, motivo: 'Documentos ilegíveis' })
    expect(recusada.subject).toBe('Sobre a sua candidatura')
    expect(recusada.text).toContain('Documentos ilegíveis')
  })
})
