import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '@/config/env'
import { mapBrasilApiCnpj, type BrasilApiCnpjBody } from '@/integrations/cnpj/brasilapi'
import { clearCnpjCache, lookupCnpj } from '@/integrations/cnpj'
import { syntheticCnpjLookup } from '@/integrations/cnpj/simulated'

/** Consulta de CNPJ: mapeador da BrasilAPI, CNPJs de demo sem rede, cache e falhas. */

const BODY: BrasilApiCnpjBody = {
  cnpj: '19131243000197',
  razao_social: 'OPEN KNOWLEDGE BRASIL',
  nome_fantasia: 'REDE PELO CONHECIMENTO LIVRE',
  codigo_natureza_juridica: 3999,
  natureza_juridica: 'Associação Privada',
  situacao_cadastral: 2,
  descricao_situacao_cadastral: 'ATIVA',
  data_situacao_cadastral: '2013-10-03',
  descricao_motivo_situacao_cadastral: 'SEM MOTIVO',
  data_inicio_atividade: '2013-10-03',
  porte: 'DEMAIS',
  capital_social: 0,
  cnae_fiscal: 9430800,
  cnae_fiscal_descricao: 'Atividades de associações de defesa de direitos sociais',
  cnaes_secundarios: [
    { codigo: 9493600, descricao: 'Atividades de organizações associativas ligadas à cultura e à arte' },
    { codigo: 0, descricao: '' },
  ],
  cep: 4547006,
  descricao_tipo_de_logradouro: 'ALAMEDA',
  logradouro: 'SANTOS',
  numero: '1978',
  complemento: 'ANDAR 7',
  bairro: 'CERQUEIRA CESAR',
  municipio: 'SAO PAULO',
  uf: 'SP',
  email: null,
  ddd_telefone_1: '11 2385-1939',
  qsa: [
    {
      nome_socio: 'NATALIA MAZOTTE CORTEZ',
      cnpj_cpf_do_socio: '***059967**',
      qualificacao_socio: 'Presidente',
      data_entrada_sociedade: '2019-02-14',
    },
  ],
}

describe('mapeador da BrasilAPI', () => {
  it('normaliza códigos, CEP numérico, telefone, CNAE zerado e motivo "SEM MOTIVO"', () => {
    const result = mapBrasilApiCnpj(BODY, '19131243000197')
    expect(result).toMatchObject({
      cnpj: '19131243000197',
      legalName: 'OPEN KNOWLEDGE BRASIL',
      legalNatureCode: '3999',
      registrationStatus: 'ATIVA',
      registrationStatusReason: null,
      openingDate: '2013-10-03',
      mainCnae: { code: '9430800' },
      phone: '1123851939',
      provider: 'brasilapi',
    })
    expect(result.secondaryCnaes).toEqual([
      { code: '9493600', description: 'Atividades de organizações associativas ligadas à cultura e à arte' },
    ])
    expect(result.address).toEqual({
      cep: '04547006',
      street: 'ALAMEDA SANTOS',
      number: '1978',
      complement: 'ANDAR 7',
      neighborhood: 'CERQUEIRA CESAR',
      city: 'SAO PAULO',
      state: 'SP',
    })
    expect(result.partners).toEqual([
      { name: 'NATALIA MAZOTTE CORTEZ', document: '***059967**', qualification: 'Presidente', entryDate: '2019-02-14' },
    ])
  })

  it('situação só pelo código numérico', () => {
    const result = mapBrasilApiCnpj({ ...BODY, descricao_situacao_cadastral: null, situacao_cadastral: 8 }, 'x')
    expect(result.registrationStatus).toBe('BAIXADA')
  })
})

describe('lookupCnpj', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    clearCnpjCache()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    env.CNPJ_LOOKUP_PROVIDER = 'brasilapi'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('CNPJ inválido nem consulta', async () => {
    const response = await lookupCnpj('11.222.333/0001-82')
    expect(response).toMatchObject({ found: false, unavailable: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('CNPJ de demonstração responde sem rede, em qualquer modo', async () => {
    const response = await lookupCnpj('11.222.333/0001-81')
    expect(response.found).toBe(true)
    expect(response.result?.legalName).toBe('ASSOCIACAO DOS SERVIDORES DO VALE')
    expect(response.result?.provider).toBe('simulated')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('BrasilAPI: sucesso vai para o cache (2ª consulta sem rede)', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(BODY), { status: 200 }))
    const first = await lookupCnpj('19131243000197')
    const second = await lookupCnpj('19131243000197')
    expect(first.result?.cached).toBe(false)
    expect(second.result?.cached).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://brasilapi.com.br/api/cnpj/v1/19131243000197')
  })

  it('404 = não encontrado; 5xx e timeout = indisponível (formulário segue manual)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 }))
    expect(await lookupCnpj('19131243000197')).toMatchObject({ found: false, unavailable: false })
    fetchMock.mockResolvedValueOnce(new Response('erro', { status: 502 }))
    expect(await lookupCnpj('19131243000197')).toMatchObject({ found: false, unavailable: true })
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))
    expect(await lookupCnpj('19131243000197')).toMatchObject({ found: false, unavailable: true, result: null })
  })

  it('modo simulated: cadastro sintético determinístico, sem rede', async () => {
    env.CNPJ_LOOKUP_PROVIDER = 'simulated'
    const a = await lookupCnpj('19131243000197')
    const b = await lookupCnpj('19131243000197')
    expect(a.found).toBe(true)
    expect(a.result?.registrationStatus).toBe('ATIVA')
    expect(a.result?.openingDate).toBe(b.result?.openingDate)
    expect(syntheticCnpjLookup('19131243000197').legalName).toMatch(/^EMPRESA SIMULADA/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
