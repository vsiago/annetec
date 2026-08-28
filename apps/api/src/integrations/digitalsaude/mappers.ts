import {
  BENEFICIARY_KIND_BY_UPSTREAM_ID,
  type BeneficiaryKind,
  type CommissionReceipt,
  type Convenio,
  type ContractStatus,
  type DsBeneficiario,
  type DsContrato,
  type DsConvenio,
  type DsDemonstrativoPagamento,
  type DsFatura,
  type DsPlano,
  type DsRecibo,
  type DsTabela,
  type HealthPlan,
  type Invoice,
  type InvoiceStatus,
  type PaymentStatement,
  type PriceTable,
  type ReceiptStatus,
  type RegistrationFeeKind,
} from '@annetec/contracts'

/**
 * Tradução Digital Saúde → domínio Annetec.
 *
 * Toda a "sujeira" do upstream (campos em português, `{ id, nome }` com texto
 * livre, números como string, `estatoCivil` escrito errado) morre aqui. Acima
 * desta camada só existe o vocabulário do domínio.
 *
 * Os status vêm como texto livre; normalizamos por palavra-chave e sempre
 * preservamos o original em `upstreamStatus` para não perder informação.
 */

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

const str = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

const normalize = (value: string | null | undefined) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

export function toContractStatus(nome: string | null | undefined): ContractStatus {
  const text = normalize(nome)
  if (!text) return 'desconhecido'
  if (text.includes('pendente')) return 'pendente'
  if (text.includes('produzido')) return 'produzido'
  if (text.includes('cancel')) return 'cancelado'
  if (text.includes('suspens') || text.includes('inadimpl')) return 'suspenso'
  if (text.includes('ativo') || text.includes('vigente') || text.includes('implantado')) return 'ativo'
  return 'desconhecido'
}

export function toInvoiceStatus(nome: string | null | undefined): InvoiceStatus {
  const text = normalize(nome)
  if (!text) return 'desconhecido'
  if (text.includes('pag') || text.includes('quitad') || text.includes('liquidad')) return 'paga'
  if (text.includes('vencid') || text.includes('atras')) return 'vencida'
  if (text.includes('cancel') || text.includes('baixad')) return 'cancelada'
  if (text.includes('abert') || text.includes('emitid') || text.includes('pendente')) return 'aberta'
  return 'desconhecido'
}

export function toReceiptStatus(nome: string | null | undefined): ReceiptStatus {
  const text = normalize(nome)
  if (!text) return 'desconhecido'
  if (text.includes('pag')) return 'pago'
  if (text.includes('cancel')) return 'cancelado'
  if (text.includes('emitid')) return 'emitido'
  return 'desconhecido'
}

export function toBeneficiaryKind(id: number | null | undefined): BeneficiaryKind {
  if (id === null || id === undefined) return 'dependente'
  return BENEFICIARY_KIND_BY_UPSTREAM_ID[id] ?? 'dependente'
}

export function toRegistrationFeeKind(id: number | null | undefined): RegistrationFeeKind | null {
  if (id === 1) return 'por_contrato'
  if (id === 2) return 'por_vida'
  return null
}

/** Junta `dddCelular` + `celular`, caindo para o telefone fixo. */
function joinPhone(ddd: unknown, number: unknown): string | null {
  const d = str(ddd)
  const n = str(number)
  if (!n) return null
  return d ? `${d}${n}` : n
}

export interface MappedBeneficiary {
  upstreamCodigo: string | null
  kind: BeneficiaryKind
  name: string
  cpf: string | null
  birthDate: string | null
  motherName: string | null
  relationship: string | null
  gender: string | null
  email: string | null
  phone: string | null
  monthlyFee: number | null
  effectiveDate: string | null
  provisionalCardUrl: string | null
  status: string | null
  raw: DsBeneficiario
}

export function mapBeneficiary(source: DsBeneficiario): MappedBeneficiary {
  return {
    upstreamCodigo: str(source.codigo),
    kind: toBeneficiaryKind(source.tipoBeneficiario?.id),
    name: str(source.nome) ?? 'Sem nome',
    cpf: str(source.cpf)?.replace(/\D/g, '') ?? null,
    birthDate: str(source.dataNascimento),
    motherName: str(source.nomeMae),
    relationship: str(source.parentesco?.nome),
    gender: str(source.sexo?.nome),
    email: str(source.email),
    phone: joinPhone(source.dddCelular, source.celular) ?? joinPhone(source.dddTelefone, source.telefone),
    monthlyFee: num(source.mensalidade),
    effectiveDate: str(source.dataVigencia),
    provisionalCardUrl: str(source.linkCarteiraProvisoria),
    status: str(source.statusBeneficiario?.nome),
    raw: source,
  }
}

export interface MappedContract {
  upstreamCodigo: string
  proposalNumber: string | null
  holderName: string | null
  holderCpf: string | null
  status: ContractStatus
  upstreamStatus: string | null
  signedAt: string | null
  dueDay: number | null
  monthlyValue: number | null
  outstandingBalance: number | null
  planCodigo: string | null
  planName: string | null
  convenioCodigo: string | null
  convenioName: string | null
  sellerUpstreamCodigo: string | null
  beneficiaries: MappedBeneficiary[]
  raw: DsContrato
}

export function mapContract(source: DsContrato): MappedContract {
  const beneficiaries = (source.beneficiarioList ?? []).map(mapBeneficiary)
  const holder = beneficiaries.find(b => b.kind === 'titular') ?? beneficiaries[0] ?? null

  return {
    upstreamCodigo: str(source.codigo) ?? '',
    proposalNumber: str(source.numeroProposta),
    holderName: str(source.nomeTitular) ?? holder?.name ?? null,
    holderCpf: holder?.cpf ?? str(source.cpfResponsavel)?.replace(/\D/g, '') ?? null,
    status: toContractStatus(source.statusContrato?.nome),
    upstreamStatus: str(source.statusContrato?.nome),
    signedAt: str(source.dataAssinatura),
    dueDay: source.diaVencimento ?? null,
    monthlyValue: num(source.valor),
    outstandingBalance: num(source.saldoDevedor),
    planCodigo: str(source.plano?.codigo),
    planName: str(source.plano?.nome),
    convenioCodigo: str(source.convenio?.codigo),
    convenioName: str(source.convenio?.nome),
    sellerUpstreamCodigo: str(source.produtor?.codigo),
    beneficiaries,
    raw: source,
  }
}

export function mapPlan(source: DsPlano): HealthPlan {
  return {
    codigo: str(source.codigo) ?? '',
    name: str(source.nome) ?? 'Sem nome',
    productCodigo: str(source.produto?.codigo),
    productName: str(source.produto?.nome),
    operatorName: str(source.produto?.operadora?.nome),
    operatorAns: str(source.produto?.operadora?.numeroAns),
    operatorLogoUrl: str(source.produto?.operadora?.linkLogo),
    accommodation: str(source.acomodacao?.nome),
  }
}

export function mapConvenio(source: DsConvenio): Convenio {
  return {
    codigo: str(source.codigo) ?? '',
    name: str(source.nome) ?? 'Sem nome',
    registrationFee: num(source.valorTaxaCadastro),
    registrationFeeKind: toRegistrationFeeKind(source.tipoTaxaCadastro?.id),
    productCodigo: str(source.produto?.codigo),
    branches: (source.filialList ?? []).map(branch => ({
      codigo: str(branch.codigo) ?? '',
      name: str(branch.nome) ?? '',
    })),
  }
}

export function mapPriceTable(source: DsTabela): PriceTable {
  return {
    codigo: str(source.codigo) ?? '',
    name: str(source.nome) ?? '',
    effectiveDate: str(source.dataVigencia),
    groupCodigo: str(source.grupo?.codigo),
    entries: (source.tabelaPrecoList ?? []).map(entry => ({
      id: entry.id ?? null,
      planCodigo: str(entry.plano?.codigo),
      planName: str(entry.plano?.nome),
      ageRangeName: str(entry.faixaEtaria?.nome),
      ageFrom: entry.faixaEtaria?.idadeInicial ?? null,
      ageTo: entry.faixaEtaria?.idadeFinal ?? null,
      chargeValue: num(entry.valorCobranca),
      netValue: num(entry.valorNet),
      effectiveDate: str(entry.dataVigencia),
    })),
  }
}

export function mapInvoice(source: DsFatura, contractCodigo?: string | null): Invoice {
  return {
    upstreamCodigo: str(source.codigo) ?? '',
    contractUpstreamCodigo: contractCodigo ?? null,
    number: source.numero ?? null,
    year: source.ano ?? null,
    month: source.mes ?? null,
    issuedAt: str(source.dataFatura),
    dueAt: str(source.dataVencimento),
    paidAt: str(source.dataPagamento),
    amount: num(source.valorCobranca),
    status: toInvoiceStatus(source.statusFatura?.nome),
    upstreamStatus: str(source.statusFatura?.nome),
    invoiceUrl: str(source.linkFatura),
    receiptUrl: str(source.linkReciboPagamento),
    barcodeLine: str(source.linhaDigitavel),
    beneficiaryName: str(source.beneficiario?.nome),
  }
}

export function mapPaymentStatement(source: DsDemonstrativoPagamento): PaymentStatement {
  return {
    upstreamCodigo: str(source.codigo) ?? '',
    calendarYear: num(source.anoCalendario),
    referenceYear: num(source.anoReferencia),
    cpf: str(source.cpf),
    amount: num(source.valor),
    documentUrl: str(source.linkDemonstrativo),
  }
}

export function mapCommissionReceipt(source: DsRecibo): CommissionReceipt {
  return {
    upstreamCodigo: str(source.codigo) ?? '',
    issuedAt: str(source.dataEmissao) ?? str(source.dataRecibo),
    paidAt: str(source.dataPagamento),
    cancelledAt: str(source.dataCancelamento),
    amount: num(source.valor),
    status: toReceiptStatus(source.statusRecibo?.nome),
    upstreamStatus: str(source.statusRecibo?.nome),
    invoiceNumber: str(source.numeroNotaFiscal),
    invoiceAmount: num(source.valorNotaFiscal),
    notes: str(source.observacao),
    documentUrl: str(source.arquivo),
    entries: (source.lancamentoList ?? []).map(entry => ({
      upstreamCodigo: str(entry.codigo),
      installment: entry.numeroParcela ?? null,
      postedAt: str(entry.dataLancamento),
      dueAt: str(entry.dataVencimento),
      description: str(entry.descricao),
      amount: num(entry.valorLancamento),
      installmentAmount: num(entry.valorParcela),
      holderName: str(entry.nomeTitular),
      kind: str(entry.statusFatura?.nome),
    })),
  }
}
