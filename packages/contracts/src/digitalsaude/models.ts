import { z } from 'zod'

/**
 * Espelho fiel dos `definitions` do Swagger 2.0 da Digital Saúde
 * (https://digitalsaude.com.br/api/digitalsaude_2.0.0.yaml, basePath /api/v2/).
 *
 * Regra de ouro desta camada: NÃO inventar nem renomear campos. Os nomes ficam
 * em português, exatamente como o upstream devolve. A tradução para o domínio
 * Annetec acontece nos mappers da API (apps/api/src/integrations/digitalsaude/mappers.ts).
 *
 * Todos os campos de resposta são `nullish()` porque a API upstream é um
 * sistema Java que omite (ou envia null) campos não preenchidos, e um schema
 * rígido derrubaria integrações por um campo opcional ausente.
 */

const s = () => z.string().nullish()
const n = () => z.number().nullish()
const i = () => z.number().int().nullish()

/** Par `{ id, nome }` usado por todas as tabelas de domínio da Digital Saúde. */
export const dsIdNome = z.object({ id: i(), nome: s() })
export type DsIdNome = z.infer<typeof dsIdNome>

/** Par `{ codigo, nome }` usado pelas entidades cadastrais. */
export const dsCodigoNome = z.object({ codigo: s(), nome: s() })
export type DsCodigoNome = z.infer<typeof dsCodigoNome>

export const dsAcomodacao = dsIdNome
export const dsEstadoCivil = dsIdNome
export const dsParentesco = dsIdNome
export const dsSexo = dsIdNome
export const dsStatusBeneficiario = dsIdNome
export const dsStatusContrato = dsIdNome
export const dsStatusFatura = dsIdNome
export const dsStatusRecibo = dsIdNome
export const dsTipoLancamento = dsIdNome

/** `1 - Titular / 2 - Dependente / 3 - Agregado` (documentado no Swagger). */
export const dsTipoBeneficiario = dsIdNome
/** `1 - Valor por Contrato / 2 - Valor por Vida`. */
export const dsTipoTaxaCadastro = dsIdNome

export const dsFilial = dsCodigoNome
export const dsGrupo = dsCodigoNome
export const dsOpcional = dsCodigoNome
export const dsUsuario = dsCodigoNome
export const dsCarencia = dsCodigoNome

export const dsAnexo = z.object({
  codigo: s(),
  arquivo: s(),
  data: s(),
  linkAnexo: s(),
})
export type DsAnexo = z.infer<typeof dsAnexo>

export const dsAtendimento = z.object({
  protocolo: s(),
  solicitante: s(),
})
export type DsAtendimento = z.infer<typeof dsAtendimento>

export const dsOperadora = z.object({
  id: i(),
  nome: s(),
  numeroAns: s(),
  linkLogo: s(),
  site: s(),
})
export type DsOperadora = z.infer<typeof dsOperadora>

export const dsProduto = z.object({
  codigo: s(),
  nome: s(),
  operadora: dsOperadora.nullish(),
  anexoList: z.array(dsAnexo).nullish(),
  opcionalList: z.array(dsOpcional).nullish(),
})
export type DsProduto = z.infer<typeof dsProduto>

export const dsPlano = z.object({
  codigo: s(),
  nome: s(),
  produto: dsProduto.nullish(),
  acomodacao: dsAcomodacao.nullish(),
})
export type DsPlano = z.infer<typeof dsPlano>

export const dsProdutor = z.object({
  codigo: s(),
  nome: s(),
  numeroDocumento: s(),
})
export type DsProdutor = z.infer<typeof dsProdutor>

export const dsConvenio = z.object({
  codigo: s(),
  nome: s(),
  valorTaxaCadastro: n(),
  tipoTaxaCadastro: dsTipoTaxaCadastro.nullish(),
  produto: dsProduto.nullish(),
  filialList: z.array(dsFilial).nullish(),
})
export type DsConvenio = z.infer<typeof dsConvenio>

export const dsBeneficiario = z.object({
  codigo: s(),
  nome: s(),
  dataNascimento: s(),
  marcaOptica: s(),
  linkCarteiraProvisoria: s(),
  rg: s(),
  orgaoEmissor: s(),
  cpf: s(),
  /** Declaração de Nascido Vivo */
  dnv: s(),
  /** Cartão Nacional de Saúde */
  cns: s(),
  pis: s(),
  nomeMae: s(),
  endereco: s(),
  numero: s(),
  complemento: s(),
  bairro: s(),
  municipio: s(),
  uf: s(),
  cep: s(),
  dddTelefone: s(),
  telefone: s(),
  dddCelular: s(),
  celular: s(),
  email: s(),
  emailSecundario: s(),
  altura: n(),
  peso: n(),
  /** Índice de Massa Corporal */
  imc: n(),
  dataVigencia: s(),
  mensalidade: n(),
  carencia: dsCarencia.nullish(),
  /** `estatoCivil` (sic) — grafia do upstream, mantida de propósito. */
  estatoCivil: dsEstadoCivil.nullish(),
  tipoBeneficiario: dsTipoBeneficiario.nullish(),
  sexo: dsSexo.nullish(),
  parentesco: dsParentesco.nullish(),
  statusBeneficiario: dsStatusBeneficiario.nullish(),
})
export type DsBeneficiario = z.infer<typeof dsBeneficiario>

export const dsContrato = z.object({
  codigo: s(),
  nomeTitular: s(),
  numeroProposta: s(),
  dataInclusao: s(),
  dataAssinatura: s(),
  diaVencimento: i(),
  cpfResponsavel: s(),
  nomeResponsavel: s(),
  saldoDevedor: n(),
  observacao: s(),
  valor: n(),
  plano: dsPlano.nullish(),
  statusContrato: dsStatusContrato.nullish(),
  convenio: dsConvenio.nullish(),
  produtor: dsProdutor.nullish(),
  grupo: dsGrupo.nullish(),
  filial: dsFilial.nullish(),
  beneficiarioList: z.array(dsBeneficiario).nullish(),
  anexoList: z.array(dsAnexo).nullish(),
  opcionalList: z.array(dsOpcional).nullish(),
})
export type DsContrato = z.infer<typeof dsContrato>

export const dsDemonstrativoPagamento = z.object({
  codigo: s(),
  anoCalendario: n(),
  anoReferencia: n(),
  cpf: s(),
  valor: n(),
  linkDemonstrativo: s(),
})
export type DsDemonstrativoPagamento = z.infer<typeof dsDemonstrativoPagamento>

export const dsFatura = z.object({
  codigo: s(),
  dataFatura: s(),
  dataVencimento: s(),
  numero: i(),
  ano: i(),
  mes: i(),
  valorCobranca: n(),
  linkFatura: s(),
  linkReciboPagamento: s(),
  linhaDigitavel: s(),
  dataPagamento: s(),
  registrado: i(),
  beneficiario: dsBeneficiario.nullish(),
  statusFatura: dsStatusFatura.nullish(),
})
export type DsFatura = z.infer<typeof dsFatura>

export const dsFaixaEtaria = z.object({
  id: i(),
  nome: s(),
  idadeInicial: i(),
  idadeFinal: i(),
})
export type DsFaixaEtaria = z.infer<typeof dsFaixaEtaria>

export const dsLancamento = z.object({
  codigo: s(),
  numeroParcela: i(),
  dataLancamento: s(),
  dataVencimento: s(),
  descricao: s(),
  valorLancamento: n(),
  valorParcela: n(),
  nomeTitular: s(),
  /** No Swagger este campo se chama `statusFatura` mas carrega TipoLancamento. */
  statusFatura: dsTipoLancamento.nullish(),
})
export type DsLancamento = z.infer<typeof dsLancamento>

export const dsRecibo = z.object({
  codigo: s(),
  dataRecibo: s(),
  dataEmissao: s(),
  dataPagamento: s(),
  dataCancelamento: s(),
  valor: n(),
  arquivo: s(),
  dataNotaFiscal: s(),
  numeroNotaFiscal: s(),
  valorNotaFiscal: n(),
  observacao: s(),
  produtor: dsProdutor.nullish(),
  statusRecibo: dsStatusRecibo.nullish(),
  anexoList: z.array(dsAnexo).nullish(),
  lancamentoList: z.array(dsLancamento).nullish(),
})
export type DsRecibo = z.infer<typeof dsRecibo>

export const dsTabelaPreco = z.object({
  id: i(),
  valorCobranca: n(),
  valorNet: n(),
  dataVigencia: s(),
  plano: dsPlano.nullish(),
  faixaEtaria: dsFaixaEtaria.nullish(),
})
export type DsTabelaPreco = z.infer<typeof dsTabelaPreco>

export const dsTabela = z.object({
  codigo: s(),
  nome: s(),
  dataVigencia: s(),
  grupo: dsGrupo.nullish(),
  tabelaPrecoList: z.array(dsTabelaPreco).nullish(),
})
export type DsTabela = z.infer<typeof dsTabela>

export const dsNotificacao = z.object({
  codigo: s(),
  assunto: s(),
  mensagem: s(),
  usuario: dsUsuario.nullish(),
})
export type DsNotificacao = z.infer<typeof dsNotificacao>

export const dsPatologia = z.object({
  id: n(),
  codigo: s(),
  nome: s(),
  descricao: s(),
  anoEvento: s(),
  numeroPergunta: s(),
  beneficiario: dsBeneficiario.nullish(),
})
export type DsPatologia = z.infer<typeof dsPatologia>

export type DsCarencia = z.infer<typeof dsCarencia>
export type DsFilial = z.infer<typeof dsFilial>
export type DsGrupo = z.infer<typeof dsGrupo>
export type DsOpcional = z.infer<typeof dsOpcional>
export type DsUsuario = z.infer<typeof dsUsuario>
