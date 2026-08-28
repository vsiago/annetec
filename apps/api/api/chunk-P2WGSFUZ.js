import {
  BENEFICIARY_KIND_BY_UPSTREAM_ID
} from "./chunk-HNEZMN3V.js";

// src/integrations/digitalsaude/mappers.ts
var num = (value) => {
  if (value === null || value === void 0 || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};
var str = (value) => {
  if (value === null || value === void 0) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
};
var normalize = (value) => (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
function toContractStatus(nome) {
  const text = normalize(nome);
  if (!text) return "desconhecido";
  if (text.includes("pendente")) return "pendente";
  if (text.includes("produzido")) return "produzido";
  if (text.includes("cancel")) return "cancelado";
  if (text.includes("suspens") || text.includes("inadimpl")) return "suspenso";
  if (text.includes("ativo") || text.includes("vigente") || text.includes("implantado")) return "ativo";
  return "desconhecido";
}
function toInvoiceStatus(nome) {
  const text = normalize(nome);
  if (!text) return "desconhecido";
  if (text.includes("pag") || text.includes("quitad") || text.includes("liquidad")) return "paga";
  if (text.includes("vencid") || text.includes("atras")) return "vencida";
  if (text.includes("cancel") || text.includes("baixad")) return "cancelada";
  if (text.includes("abert") || text.includes("emitid") || text.includes("pendente")) return "aberta";
  return "desconhecido";
}
function toReceiptStatus(nome) {
  const text = normalize(nome);
  if (!text) return "desconhecido";
  if (text.includes("pag")) return "pago";
  if (text.includes("cancel")) return "cancelado";
  if (text.includes("emitid")) return "emitido";
  return "desconhecido";
}
function toBeneficiaryKind(id) {
  if (id === null || id === void 0) return "dependente";
  return BENEFICIARY_KIND_BY_UPSTREAM_ID[id] ?? "dependente";
}
function toRegistrationFeeKind(id) {
  if (id === 1) return "por_contrato";
  if (id === 2) return "por_vida";
  return null;
}
function joinPhone(ddd, number) {
  const d = str(ddd);
  const n = str(number);
  if (!n) return null;
  return d ? `${d}${n}` : n;
}
function mapBeneficiary(source) {
  return {
    upstreamCodigo: str(source.codigo),
    kind: toBeneficiaryKind(source.tipoBeneficiario?.id),
    name: str(source.nome) ?? "Sem nome",
    cpf: str(source.cpf)?.replace(/\D/g, "") ?? null,
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
    raw: source
  };
}
function mapContract(source) {
  const beneficiaries = (source.beneficiarioList ?? []).map(mapBeneficiary);
  const holder = beneficiaries.find((b) => b.kind === "titular") ?? beneficiaries[0] ?? null;
  return {
    upstreamCodigo: str(source.codigo) ?? "",
    proposalNumber: str(source.numeroProposta),
    holderName: str(source.nomeTitular) ?? holder?.name ?? null,
    holderCpf: holder?.cpf ?? str(source.cpfResponsavel)?.replace(/\D/g, "") ?? null,
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
    raw: source
  };
}
function mapPlan(source) {
  return {
    codigo: str(source.codigo) ?? "",
    name: str(source.nome) ?? "Sem nome",
    productCodigo: str(source.produto?.codigo),
    productName: str(source.produto?.nome),
    operatorName: str(source.produto?.operadora?.nome),
    operatorAns: str(source.produto?.operadora?.numeroAns),
    operatorLogoUrl: str(source.produto?.operadora?.linkLogo),
    accommodation: str(source.acomodacao?.nome)
  };
}
function mapConvenio(source) {
  return {
    codigo: str(source.codigo) ?? "",
    name: str(source.nome) ?? "Sem nome",
    registrationFee: num(source.valorTaxaCadastro),
    registrationFeeKind: toRegistrationFeeKind(source.tipoTaxaCadastro?.id),
    productCodigo: str(source.produto?.codigo),
    branches: (source.filialList ?? []).map((branch) => ({
      codigo: str(branch.codigo) ?? "",
      name: str(branch.nome) ?? ""
    }))
  };
}
function mapPriceTable(source) {
  return {
    codigo: str(source.codigo) ?? "",
    name: str(source.nome) ?? "",
    effectiveDate: str(source.dataVigencia),
    groupCodigo: str(source.grupo?.codigo),
    entries: (source.tabelaPrecoList ?? []).map((entry) => ({
      id: entry.id ?? null,
      planCodigo: str(entry.plano?.codigo),
      planName: str(entry.plano?.nome),
      ageRangeName: str(entry.faixaEtaria?.nome),
      ageFrom: entry.faixaEtaria?.idadeInicial ?? null,
      ageTo: entry.faixaEtaria?.idadeFinal ?? null,
      chargeValue: num(entry.valorCobranca),
      netValue: num(entry.valorNet),
      effectiveDate: str(entry.dataVigencia)
    }))
  };
}
function mapInvoice(source, contractCodigo) {
  return {
    upstreamCodigo: str(source.codigo) ?? "",
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
    beneficiaryName: str(source.beneficiario?.nome)
  };
}
function mapPaymentStatement(source) {
  return {
    upstreamCodigo: str(source.codigo) ?? "",
    calendarYear: num(source.anoCalendario),
    referenceYear: num(source.anoReferencia),
    cpf: str(source.cpf),
    amount: num(source.valor),
    documentUrl: str(source.linkDemonstrativo)
  };
}
function mapCommissionReceipt(source) {
  return {
    upstreamCodigo: str(source.codigo) ?? "",
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
    entries: (source.lancamentoList ?? []).map((entry) => ({
      upstreamCodigo: str(entry.codigo),
      installment: entry.numeroParcela ?? null,
      postedAt: str(entry.dataLancamento),
      dueAt: str(entry.dataVencimento),
      description: str(entry.descricao),
      amount: num(entry.valorLancamento),
      installmentAmount: num(entry.valorParcela),
      holderName: str(entry.nomeTitular),
      kind: str(entry.statusFatura?.nome)
    }))
  };
}

export {
  mapContract,
  mapPlan,
  mapConvenio,
  mapPriceTable,
  mapInvoice,
  mapPaymentStatement,
  mapCommissionReceipt
};
