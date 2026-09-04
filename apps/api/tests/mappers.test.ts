import { describe, expect, it } from 'vitest'
import {
  mapBeneficiary,
  mapContract,
  mapInvoice,
  mapCommissionReceipt,
  mapPlan,
  mapPriceTable,
  toBeneficiaryKind,
  toContractStatus,
  toInvoiceStatus,
  toRegistrationFeeKind,
} from '@/integrations/digitalsaude/mappers'

/**
 * Os mappers são a fronteira mais frágil do sistema: qualquer campo que a
 * Digital Saúde mude de nome ou passe a mandar nulo aparece aqui primeiro.
 */
describe('normalização de status', () => {
  it('reconhece as variações de status de contrato do ERP', () => {
    expect(toContractStatus('PRODUZIDO')).toBe('produzido')
    expect(toContractStatus('Pendente')).toBe('pendente')
    expect(toContractStatus('CANCELADO PELO CLIENTE')).toBe('cancelado')
    expect(toContractStatus('Suspenso por Inadimplência')).toBe('suspenso')
    expect(toContractStatus('ATIVO')).toBe('ativo')
  })

  it('trata acento e caixa sem depender da grafia exata', () => {
    expect(toContractStatus('inadimplência')).toBe('suspenso')
    expect(toInvoiceStatus('LIQUIDADA')).toBe('paga')
    expect(toInvoiceStatus('Em Atraso')).toBe('vencida')
  })

  it('devolve "desconhecido" em vez de estourar quando o status é novo', () => {
    expect(toContractStatus('STATUS QUE NAO EXISTE')).toBe('desconhecido')
    expect(toContractStatus(null)).toBe('desconhecido')
    expect(toInvoiceStatus(undefined)).toBe('desconhecido')
  })
})

describe('tabelas de domínio documentadas no Swagger', () => {
  it('mapeia tipoBeneficiario 1/2/3', () => {
    expect(toBeneficiaryKind(1)).toBe('titular')
    expect(toBeneficiaryKind(2)).toBe('dependente')
    expect(toBeneficiaryKind(3)).toBe('agregado')
    // Id fora da tabela cai em dependente, o caso mais conservador.
    expect(toBeneficiaryKind(99)).toBe('dependente')
    expect(toBeneficiaryKind(null)).toBe('dependente')
  })

  it('mapeia tipoTaxaCadastro 1/2', () => {
    expect(toRegistrationFeeKind(1)).toBe('por_contrato')
    expect(toRegistrationFeeKind(2)).toBe('por_vida')
    expect(toRegistrationFeeKind(null)).toBeNull()
  })
})

describe('mapContract', () => {
  const contrato = {
    codigo: '12345',
    nomeTitular: 'Ana Souza',
    numeroProposta: 'P-987',
    // Upstream manda DD/MM/YYYY, nunca ISO — ver teste de conversão abaixo.
    dataAssinatura: '15/01/2026',
    diaVencimento: 10,
    valor: 189.9,
    saldoDevedor: 0,
    statusContrato: { id: 2, nome: 'PRODUZIDO' },
    plano: { codigo: 'PL1', nome: 'Plano Ouro' },
    convenio: { codigo: 'CV1', nome: 'Convênio Padrão' },
    produtor: { codigo: 'PR9', nome: 'Maria Vendedora' },
    beneficiarioList: [
      {
        codigo: 'B1',
        nome: 'Ana Souza',
        cpf: '529.982.247-25',
        tipoBeneficiario: { id: 1, nome: 'Titular' },
        dddCelular: '21',
        celular: '999998888',
        mensalidade: 129.9,
        linkCarteiraProvisoria: 'https://exemplo/carteira.pdf',
        dataNascimento: '24/08/1999',
        dataVigencia: '10/11/2025',
      },
      {
        codigo: 'B2',
        nome: 'Pedro Souza',
        tipoBeneficiario: { id: 2, nome: 'Dependente' },
        parentesco: { id: 3, nome: 'Filho' },
      },
    ],
  }

  it('extrai titular, CPF sem máscara e telefone com DDD', () => {
    const result = mapContract(contrato)

    expect(result.upstreamCodigo).toBe('12345')
    expect(result.status).toBe('produzido')
    expect(result.upstreamStatus).toBe('PRODUZIDO')
    expect(result.holderCpf).toBe('52998224725')
    expect(result.beneficiaries).toHaveLength(2)

    const holder = result.beneficiaries[0]!
    expect(holder.kind).toBe('titular')
    expect(holder.phone).toBe('21999998888')
    expect(holder.monthlyFee).toBe(129.9)
  })

  it('sobrevive a um contrato praticamente vazio', () => {
    const result = mapContract({ codigo: '1' })
    expect(result.upstreamCodigo).toBe('1')
    expect(result.beneficiaries).toEqual([])
    expect(result.holderName).toBeNull()
    expect(result.status).toBe('desconhecido')
  })

  /**
   * Bug real encontrado em produção: essas datas viram colunas `date` do
   * Postgres. Sem converter DD/MM/YYYY → ISO, dia > 12 derruba o insert (mês
   * inválido) e dia/mês ambos ≤ 12 INVERTEM em silêncio — sem erro nenhum.
   * `24/08/1999` (dia 24, só existe como DD/MM) prova a primeira metade;
   * `10/11/2025` prova que não vira `2025-10-11` por engano.
   */
  it('converte datas DD/MM/YYYY do upstream para ISO antes de persistir', () => {
    const result = mapContract(contrato)
    expect(result.signedAt).toBe('2026-01-15')

    const holder = result.beneficiaries[0]!
    expect(holder.birthDate).toBe('1999-08-24')
    expect(holder.effectiveDate).toBe('2025-11-10')
  })
})

describe('mapInvoice', () => {
  it('normaliza a fatura e carrega o contrato de origem', () => {
    const invoice = mapInvoice(
      {
        codigo: 'F1',
        dataVencimento: '2026-03-10',
        valorCobranca: 189.9,
        linhaDigitavel: '00190000090123456789012345678901234567890123',
        statusFatura: { id: 1, nome: 'Em Aberto' },
      },
      'C1',
    )

    expect(invoice.status).toBe('aberta')
    expect(invoice.amount).toBe(189.9)
    expect(invoice.contractUpstreamCodigo).toBe('C1')
    expect(invoice.barcodeLine).toHaveLength(44)
  })
})

describe('mapCommissionReceipt', () => {
  it('achata a lista de lançamentos do recibo', () => {
    const receipt = mapCommissionReceipt({
      codigo: 'R1',
      dataEmissao: '2026-02-01',
      valor: 450,
      statusRecibo: { id: 1, nome: 'EMITIDO' },
      lancamentoList: [
        {
          codigo: 'L1',
          numeroParcela: 1,
          valorParcela: 450,
          nomeTitular: 'Ana Souza',
          statusFatura: { id: 1, nome: 'Comissão' },
        },
      ],
    })

    expect(receipt.status).toBe('emitido')
    expect(receipt.entries).toHaveLength(1)
    expect(receipt.entries[0]!.installmentAmount).toBe(450)
    expect(receipt.entries[0]!.kind).toBe('Comissão')
  })
})

/**
 * Regressões do drift entre o Swagger publicado e o servidor de produção
 * (apuradas por `scripts/diag-schema-drift.ts` em 04/09/2026).
 */
describe('divergências Swagger x produção', () => {
  it('lê preço de tabelaPrecoApiList quando tabelaPrecoList vem vazia', () => {
    const tabela = mapPriceTable({
      codigo: 'T1',
      nome: 'TABELA IDEAL PME 2',
      dataVigencia: '01/06/2025',
      grupo: null,
      tabelaPrecoList: [],
      grupoApi: { codigo: 'G1', nome: 'IDEAL PME 2' },
      tabelaPrecoApiList: [
        {
          valorCobranca: 85.79,
          valorNet: 80.93,
          faixaEtariaApi: { nome: '00 a 18 Anos', idadeInicial: 0, idadeFinal: 18 },
          planoApi: { codigo: 'P1', nome: 'IDEAL PME 2' },
        },
      ],
    } as never)

    expect(tabela.entries).toHaveLength(1)
    expect(tabela.entries[0]!.chargeValue).toBe(85.79)
    expect(tabela.entries[0]!.ageRangeName).toBe('00 a 18 Anos')
    // Grupo também só existe na variante nova.
    expect(tabela.groupCodigo).toBe('G1')
  })

  it('prefere a lista documentada quando ela vier preenchida', () => {
    const tabela = mapPriceTable({
      codigo: 'T1',
      nome: 'T',
      dataVigencia: null,
      grupo: { codigo: 'GLEGADO', nome: 'x' },
      tabelaPrecoList: [
        {
          id: 9,
          valorCobranca: 10,
          valorNet: 9,
          dataVigencia: '01/01/2026',
          plano: { codigo: 'PL', nome: 'Plano' },
          faixaEtaria: { id: 1, nome: '0 a 18', idadeInicial: 0, idadeFinal: 18 },
        },
      ],
      tabelaPrecoApiList: [{ valorCobranca: 99, valorNet: 90 }],
    } as never)

    expect(tabela.entries[0]!.chargeValue).toBe(10)
    expect(tabela.groupCodigo).toBe('GLEGADO')
  })

  it('lê estadoCivil (servidor) e não só estatoCivil (grafia do Swagger)', () => {
    const comGrafiaCerta = mapBeneficiary({
      nome: 'Fulana',
      estadoCivil: { id: 4, nome: 'Solteiro' },
    } as never)
    expect(comGrafiaCerta.maritalStatus).toBe('Solteiro')

    const comGrafiaDoSwagger = mapBeneficiary({
      nome: 'Fulana',
      estatoCivil: { id: 2, nome: 'Casado' },
    } as never)
    expect(comGrafiaDoSwagger.maritalStatus).toBe('Casado')
  })

  it('extrai a cadeia comercial do contrato, não só o produtor da ponta', () => {
    const contrato = mapContract({
      codigo: 'C1',
      nomeTitular: 'Titular',
      produtor: { codigo: 'PR1', nome: 'Produtor' },
      corretora: { codigo: 'CO1', nome: 'VEXCOR' },
      supervisor: { codigo: 'SU1', nome: 'Supervisor' },
      gerente: { codigo: 'GE1', nome: 'Gerente' },
      grupo: { codigo: 'GR1', nome: 'ANNETEC' },
      filial: { codigo: 'FI1', nome: 'MATRIZ' },
      beneficiarioList: [],
    } as never)

    expect(contrato.sellerUpstreamCodigo).toBe('PR1')
    expect(contrato.brokerName).toBe('VEXCOR')
    expect(contrato.supervisorUpstreamCodigo).toBe('SU1')
    expect(contrato.managerUpstreamCodigo).toBe('GE1')
    expect(contrato.groupName).toBe('ANNETEC')
    expect(contrato.branchCodigo).toBe('FI1')
  })

  it('traz registro ANS, abrangência e status do plano', () => {
    const plano = mapPlan({
      codigo: 'P1',
      nome: 'IDEAL PME 2',
      registroAns: '498477243',
      abrangencia: { id: 4, nome: 'Grupo de Municípios' },
      statusPlanoApi: { id: 1, nome: 'Aberto' },
      acomodacaoApi: { id: 3, nome: 'Ambulatorial' },
      produto: { codigo: 'PD1', nome: 'Produto', linkRedeCredenciada: 'https://exemplo/rede' },
    } as never)

    expect(plano.ansRegistration).toBe('498477243')
    expect(plano.coverage).toBe('Grupo de Municípios')
    expect(plano.status).toBe('Aberto')
    // `acomodacao` (Swagger) ausente, `acomodacaoApi` (servidor) presente.
    expect(plano.accommodation).toBe('Ambulatorial')
    expect(plano.networkUrl).toBe('https://exemplo/rede')
  })

  it('expõe o CPF do titular na fatura — é a ponte para achar o contrato', () => {
    const fatura = mapInvoice({
      codigo: 'F1',
      beneficiario: { nome: 'Titular', cpf: '123.456.789-00' },
    } as never)

    expect(fatura.beneficiaryCpf).toBe('12345678900')
  })
})
