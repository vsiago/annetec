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
 *
 * Toda entidade usa `.passthrough()`. O Swagger publicado está DEFASADO em
 * relação ao servidor: a sonda de 04/09/2026 encontrou 64 campos que o
 * ambiente de produção devolve e o Swagger não declara. Sem `passthrough` o
 * Zod apagava esses campos em silêncio — inclusive dentro de `contracts.raw`,
 * que guarda a saída JÁ VALIDADA e portanto nunca foi realmente "a resposta
 * original". Com passthrough, campo novo do upstream sobrevive até alguém
 * decidir mapeá-lo, em vez de sumir sem erro.
 */

const s = () => z.string().nullish()
const n = () => z.number().nullish()
const i = () => z.number().int().nullish()

/** Par `{ id, nome }` usado por todas as tabelas de domínio da Digital Saúde. */
export const dsIdNome = z.object({ id: i(), nome: s() }).passthrough()
export type DsIdNome = z.infer<typeof dsIdNome>

/** Par `{ codigo, nome }` usado pelas entidades cadastrais. */
export const dsCodigoNome = z.object({ codigo: s(), nome: s() }).passthrough()
export type DsCodigoNome = z.infer<typeof dsCodigoNome>

/**
 * Sufixo `Api` do upstream: para várias entidades o servidor devolve DUAS
 * versões do mesmo dado — a antiga (`grupo`, `tabelaPrecoList`, `acomodacao`)
 * e a nova (`grupoApi`, `tabelaPrecoApiList`, `acomodacaoApi`). Em produção a
 * antiga vem VAZIA e a nova vem preenchida; o Swagger só documenta a antiga.
 * Declaramos as duas e os mappers preferem a que tiver conteúdo.
 */
export const dsGrupoApi = z
  .object({ codigo: s(), nome: s(), subEstipulanteApi: z.unknown().nullish() })
  .passthrough()
export type DsGrupoApi = z.infer<typeof dsGrupoApi>

/** Estipulante do convênio — a entidade contratante do plano coletivo. */
export const dsEstipulante = z
  .object({ codigo: s(), nome: s(), linkLogo: s(), numeroDocumento: s() })
  .passthrough()
export type DsEstipulante = z.infer<typeof dsEstipulante>

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

export const dsAnexo = z
  .object({
    codigo: s(),
    arquivo: s(),
    data: s(),
    linkAnexo: s(),
  })
  .passthrough()
export type DsAnexo = z.infer<typeof dsAnexo>

export const dsAtendimento = z
  .object({
    protocolo: s(),
    solicitante: s(),
  })
  .passthrough()
export type DsAtendimento = z.infer<typeof dsAtendimento>

export const dsOperadora = z
  .object({
    id: i(),
    nome: s(),
    numeroAns: s(),
    linkLogo: s(),
    site: s(),
  })
  .passthrough()
export type DsOperadora = z.infer<typeof dsOperadora>

export const dsProduto = z
  .object({
    codigo: s(),
    nome: s(),
    operadora: dsOperadora.nullish(),
    anexoList: z.array(dsAnexo).nullish(),
    opcionalList: z.array(dsOpcional).nullish(),
    /** Ausentes do Swagger; é daqui que sai o link da rede credenciada real. */
    linkManualUsuario: s(),
    linkRedeCredenciada: s(),
  })
  .passthrough()
export type DsProduto = z.infer<typeof dsProduto>

export const dsPlano = z
  .object({
    codigo: s(),
    nome: s(),
    produto: dsProduto.nullish(),
    acomodacao: dsAcomodacao.nullish(),
    /** Ausentes do Swagger. `registroAns` é dado regulatório obrigatório. */
    acomodacaoApi: dsAcomodacao.nullish(),
    abrangencia: dsIdNome.nullish(),
    statusPlanoApi: dsIdNome.nullish(),
    registroAns: s(),
    valorTotal: n(),
  })
  .passthrough()
export type DsPlano = z.infer<typeof dsPlano>

/** Referência enxuta, usada onde um produtor aponta para outro (hierarquia). */
export const dsProdutorRef = z
  .object({ codigo: s(), nome: s(), numeroDocumento: s() })
  .passthrough()
export type DsProdutorRef = z.infer<typeof dsProdutorRef>

/**
 * O Swagger declara três campos; o servidor devolve o cadastro inteiro —
 * inclusive `grupoProdutor`, que é obrigatório em `POST /produtor/` e que até
 * agora era digitado à mão em cada cadastro de vendedor, e os dados de
 * pagamento de comissão (`chavePix`, `contaBancaria`).
 */
export const dsProdutor = dsProdutorRef
  .extend({
    id: i(),
    login: s(),
    email: s(),
    grupoProdutor: dsCodigoNome.nullish(),
    filial: dsFilial.nullish(),
    produtor: dsProdutorRef.nullish(),
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
    dataNascimento: s(),
    dataInclusao: s(),
    sexo: dsSexo.nullish(),
    canal: i(),
    corretor: i(),
    chavePix: s(),
    tipoPix: z.unknown().nullish(),
    contaBancaria: z.unknown().nullish(),
  })
  .passthrough()
export type DsProdutor = z.infer<typeof dsProdutor>

export const dsConvenio = z
  .object({
    codigo: s(),
    nome: s(),
    valorTaxaCadastro: n(),
    tipoTaxaCadastro: dsTipoTaxaCadastro.nullish(),
    produto: dsProduto.nullish(),
    filialList: z.array(dsFilial).nullish(),
    /** Ausentes do Swagger. */
    tipoTaxaCadastroApi: dsTipoTaxaCadastro.nullish(),
    estipulante: dsEstipulante.nullish(),
    dataProximoReajuste: s(),
    diaVigencia: i(),
    ocultarStatusContratoPortal: i(),
  })
  .passthrough()
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
  /**
   * `estatoCivil` (sic) é a grafia do SWAGGER. O servidor de produção devolve
   * `estadoCivil`, correto — confirmado em 04/09/2026 batendo no upstream.
   * As duas ficam declaradas porque a documentação e o servidor discordam, e
   * o mapper lê a que vier preenchida; até aqui só a grafia errada era lida,
   * então estado civil chegava sempre nulo na Annetec.
   */
  estatoCivil: dsEstadoCivil.nullish(),
  estadoCivil: dsEstadoCivil.nullish(),
  tipoBeneficiario: dsTipoBeneficiario.nullish(),
  sexo: dsSexo.nullish(),
  parentesco: dsParentesco.nullish(),
  statusBeneficiario: dsStatusBeneficiario.nullish(),
  /** Ausentes do Swagger. */
  id: i(),
  codigoContrato: s(),
  declaracaoSaudeList: z.array(z.unknown()).nullish(),
  etiquetaList: z.array(z.unknown()).nullish(),
  marcaOpticaOpcional: s(),
  /** Portabilidade: operadora e datas de origem do beneficiário. */
  nomeOperadoraOrigem: s(),
  dataInicioOrigem: s(),
  dataPagamentoOrigem: s(),
}).passthrough()
export type DsBeneficiario = z.infer<typeof dsBeneficiario>

export const dsContrato = z
  .object({
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
    /**
     * Ausentes do Swagger. A cadeia comercial completa (corretora, supervisor,
     * gerente, angariador) é o que define para quem a comissão é rateada — sem
     * ela a Annetec só enxergava o produtor da ponta.
     */
    corretora: dsProdutor.nullish(),
    supervisor: dsProdutor.nullish(),
    gerente: dsProdutor.nullish(),
    angariador: dsProdutor.nullish(),
    pendenciaList: z.array(z.unknown()).nullish(),
    id: i(),
    matricula: s(),
    dataExclusao: s(),
    origemVenda: z.unknown().nullish(),
    entidade: z.unknown().nullish(),
    ajuste: n(),
    formaAjuste: z.unknown().nullish(),
    prazoAjuste: n(),
    valorAdicional: n(),
  })
  .passthrough()
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

export const dsFatura = z
  .object({
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
    /** Ausentes do Swagger. `pixList` é o meio de pagamento do associado. */
    dataVencimentoCobranca: s(),
    pixList: z.array(z.unknown()).nullish(),
  })
  .passthrough()
export type DsFatura = z.infer<typeof dsFatura>

export const dsFaixaEtaria = z
  .object({
    id: i(),
    nome: s(),
    idadeInicial: i(),
    idadeFinal: i(),
  })
  .passthrough()
export type DsFaixaEtaria = z.infer<typeof dsFaixaEtaria>

/** Variante nova: mesma faixa, sem `id`. É a que vem preenchida em produção. */
export const dsFaixaEtariaApi = z
  .object({ nome: s(), idadeInicial: i(), idadeFinal: i() })
  .passthrough()
export type DsFaixaEtariaApi = z.infer<typeof dsFaixaEtariaApi>

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

export const dsTabelaPreco = z
  .object({
    id: i(),
    valorCobranca: n(),
    valorNet: n(),
    dataVigencia: s(),
    plano: dsPlano.nullish(),
    faixaEtaria: dsFaixaEtaria.nullish(),
  })
  .passthrough()
export type DsTabelaPreco = z.infer<typeof dsTabelaPreco>

/** Variante nova da faixa de preço: sem `id`, plano e faixa com sufixo `Api`. */
export const dsTabelaPrecoApi = z
  .object({
    valorCobranca: n(),
    valorNet: n(),
    planoApi: dsPlano.nullish(),
    faixaEtariaApi: dsFaixaEtariaApi.nullish(),
  })
  .passthrough()
export type DsTabelaPrecoApi = z.infer<typeof dsTabelaPrecoApi>

/**
 * Atenção ao par `tabelaPrecoList` / `tabelaPrecoApiList`: em produção o
 * primeiro (o único documentado) vem SEMPRE vazio e o segundo traz as 10
 * faixas etárias com preço. Enquanto só o primeiro era lido, toda tabela de
 * preço da Annetec chegava sem nenhuma faixa. Mesma história para
 * `grupo` (ausente) x `grupoApi` (preenchido).
 */
export const dsTabela = z
  .object({
    codigo: s(),
    nome: s(),
    dataVigencia: s(),
    grupo: dsGrupo.nullish(),
    tabelaPrecoList: z.array(dsTabelaPreco).nullish(),
    grupoApi: dsGrupoApi.nullish(),
    tabelaPrecoApiList: z.array(dsTabelaPrecoApi).nullish(),
  })
  .passthrough()
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
