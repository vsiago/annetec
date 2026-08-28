import { z } from 'zod'
import {
  dsAnexo, dsAtendimento, dsBeneficiario, dsCarencia, dsContrato, dsConvenio,
  dsDemonstrativoPagamento, dsFatura, dsNotificacao, dsPatologia, dsPlano,
  dsProdutor, dsRecibo, dsTabela,
} from './models'

/**
 * Um registro por operação do Swagger 2.0 da Digital Saúde. Cada entrada
 * amarra método + caminho + schema de entrada + schema de saída, de modo que o
 * cliente HTTP (apps/api/src/integrations/digitalsaude/client.ts) seja gerado
 * a partir daqui e não de strings soltas.
 *
 * Observação importante sobre o upstream: TODAS as respostas de sucesso são
 * arrays, inclusive as buscas por chave única (`/contrato/{codigoContrato}`
 * devolve um array de um elemento). Os endpoints de envio de e-mail devolvem
 * uma string simples.
 */

const codigoContratoQuery = z.object({ codigoContrato: z.string().min(1) })

export const digitalSaudeEndpoints = {
  // ---------------------------------------------------------------- anexo
  anexoIncluir: {
    method: 'POST',
    path: '/anexo/',
    body: z.object({
      codigoContrato: z.string().min(1),
      nomeArquivo: z.string().optional(),
      arquivo: z.string().optional(),
      linkAnexo: z.string().url(),
    }),
    response: z.array(dsAnexo),
  },

  // ---------------------------------------------------------- atendimento
  atendimentoPorContrato: {
    method: 'GET',
    path: '/atendimento/procurarPorContrato',
    query: z.object({
      codigoContrato: z.string().min(1),
      codigoTipoAtendimento: z.string().min(1),
    }),
    response: z.array(dsAtendimento),
  },
  atendimentoPorProtocolo: {
    method: 'GET',
    path: '/atendimento/{protocolo}',
    params: z.object({ protocolo: z.string().min(1) }),
    response: z.array(dsAtendimento),
  },

  // ------------------------------------------------------------- carencia
  carenciaPorConvenio: {
    method: 'GET',
    path: '/carencia/procurarPorConvenio',
    query: z.object({ codigoConvenio: z.string().min(1) }),
    response: z.array(dsCarencia),
  },
  carenciaPorCodigo: {
    method: 'GET',
    path: '/carencia/{codigoCarencia}',
    params: z.object({ codigoCarencia: z.string().min(1) }),
    response: z.array(dsCarencia),
  },

  // --------------------------------------------------------------- tabela
  tabelaPorConvenio: {
    method: 'GET',
    path: '/tabela/procurarPorConvenio',
    query: z.object({ codigoConvenio: z.string().min(1) }),
    response: z.array(dsTabela),
  },
  tabelaPorCodigo: {
    method: 'GET',
    path: '/tabela/{codigoTabela}',
    params: z.object({ codigoTabela: z.string().min(1) }),
    response: z.array(dsTabela),
  },

  // ------------------------------------------------------------- contrato
  /** Projetado para URA/central telefônica — nao usar em app de cliente. */
  contratoPorCpfTitular: {
    method: 'GET',
    path: '/contrato/procurarPorCpfTitular',
    query: z.object({ cpf: z.string().min(11) }),
    response: z.array(dsContrato),
  },
  /** Busca por CPF + e-mail: par de credenciais usado no login do cliente. */
  contratoPorClientePortal: {
    method: 'GET',
    path: '/contrato/procurarPorClientePortal',
    query: z.object({ cpf: z.string().min(11), email: z.string().email() }),
    response: z.array(dsContrato),
  },
  contratoPorCodigo: {
    method: 'GET',
    path: '/contrato/{codigoContrato}',
    params: codigoContratoQuery,
    response: z.array(dsContrato),
  },
  contratoEnviarCarteira: {
    method: 'GET',
    path: '/contrato/enviarCarteiraPorContrato',
    query: codigoContratoQuery,
    response: z.string(),
  },
  contratoRetornarParaProduzido: {
    method: 'GET',
    path: '/contrato/retornarContratoParaProduzido',
    query: codigoContratoQuery,
    response: z.string(),
  },
  contratoIncluir: {
    method: 'POST',
    path: '/contrato/',
    body: z.object({
      numeroProposta: z.string().min(1),
      dataAssinatura: z.string().min(1),
      diaVencimento: z.number().int().min(1).max(31),
      cpfResponsavel: z.string().optional(),
      nomeResponsavel: z.string().optional(),
      observacao: z.string().optional(),
      plano: z.object({ codigo: z.string().min(1) }),
      convenio: z.object({ codigo: z.string().min(1) }),
      produtor: z.object({ codigo: z.string().min(1) }),
      supervisor: z.object({ codigo: z.string() }).optional(),
      corretora: z.object({ codigo: z.string() }).optional(),
      angariador: z.object({ codigo: z.string() }).optional(),
      grupo: z.object({ codigo: z.string().min(1) }),
      filial: z.object({ codigo: z.string().min(1) }),
      opcionalList: z.array(z.object({ codigo: z.string() })).optional(),
      beneficiarioList: z.array(dsBeneficiario.partial()).min(1),
    }),
    response: z.array(dsContrato),
  },

  // -------------------------------------------------------------- calculo
  /** Simulação de preços por região: base do fluxo de cotação do vendedor. */
  calculoSimular: {
    method: 'POST',
    path: '/calculo/',
    body: z.object({
      nome: z.string().min(1),
      uf: z.string().length(2),
      calculoVidaList: z
        .array(
          z.object({
            idade: z.number().int().min(0).max(120),
            parentesco: z.object({ id: z.number().int() }),
          }),
        )
        .min(1),
    }),
    response: z.array(dsPlano),
  },

  // ------------------------------------------------------------- convenio
  convenioPorCodigo: {
    method: 'GET',
    path: '/convenio/{codigoConvenio}',
    params: z.object({ codigoConvenio: z.string().min(1) }),
    response: z.array(dsConvenio),
  },
  convenioListar: {
    method: 'GET',
    path: '/convenio/',
    response: z.array(dsConvenio),
  },

  // ------------------------------------------- demonstrativo de pagamento
  demonstrativoPorCodigo: {
    method: 'GET',
    path: '/demonstrativoPagamento/{codigoDemonstrativoPagamento}',
    params: z.object({ codigoDemonstrativoPagamento: z.string().min(1) }),
    response: z.array(dsDemonstrativoPagamento),
  },
  demonstrativoPorContrato: {
    method: 'GET',
    path: '/demonstrativoPagamento/procurarPorContrato',
    query: codigoContratoQuery,
    response: z.array(dsDemonstrativoPagamento),
  },

  // --------------------------------------------------------------- fatura
  faturaEnviarVencidaPorContrato: {
    method: 'GET',
    path: '/fatura/enviarFaturaVencidaPorContrato',
    query: codigoContratoQuery,
    response: z.string(),
  },
  faturaPorContrato: {
    method: 'GET',
    path: '/fatura/procurarPorContrato',
    query: z.object({
      codigoContrato: z.string().min(1),
      idStatusFatura: z.coerce.number().int(),
    }),
    response: z.array(dsFatura),
  },
  faturaVencidas: {
    method: 'GET',
    path: '/fatura/procurarPorVencida',
    response: z.array(dsFatura),
  },
  faturaPorCodigo: {
    method: 'GET',
    path: '/fatura/{codigoFatura}',
    params: z.object({ codigoFatura: z.string().min(1) }),
    response: z.array(dsFatura),
  },

  // ---------------------------------------------------------------- plano
  planoPorProduto: {
    method: 'GET',
    path: '/plano/procurarPorProduto',
    query: z.object({ codigoProduto: z.string().min(1) }),
    response: z.array(dsPlano),
  },
  planoPorCodigo: {
    method: 'GET',
    path: '/plano/{codigoPlano}',
    params: z.object({ codigoPlano: z.string().min(1) }),
    response: z.array(dsPlano),
  },

  // ------------------------------------------------------------ patologia
  patologiaIncluir: {
    method: 'POST',
    path: '/patologia/',
    body: z.object({
      codigo: z.string().optional(),
      nome: z.string().min(1),
      descricao: z.string().optional(),
      anoEvento: z.string().optional(),
      numeroPergunta: z.string().optional(),
      beneficiario: z.object({ codigo: z.string().min(1) }),
    }),
    response: z.array(dsPatologia),
  },

  // ------------------------------------------------------------ pendencia
  pendenciaIncluir: {
    method: 'POST',
    path: '/pendencia/',
    body: z.object({
      id: z.string().optional(),
      codigoPendencia: z.string().min(1),
      contrato: z.object({ codigo: z.string().min(1) }),
    }),
    response: z.array(dsContrato),
  },

  // ------------------------------------------------------------- produtor
  produtorPorDocumento: {
    method: 'GET',
    path: '/produtor/procurarPorNumeroDocumento',
    query: z.object({ numeroDocumento: z.string().min(11) }),
    response: z.array(dsProdutor),
  },
  produtorPorLogin: {
    method: 'GET',
    path: '/produtor/procurarPorLogin',
    query: z.object({ loginProdutor: z.string().min(1) }),
    response: z.array(dsProdutor),
  },
  produtorPorCodigo: {
    method: 'GET',
    path: '/produtor/{codigoProdutor}',
    params: z.object({ codigoProdutor: z.string().min(1) }),
    response: z.array(dsProdutor),
  },
  produtorIncluir: {
    method: 'POST',
    path: '/produtor/',
    body: z.object({
      nome: z.string().min(1),
      numeroDocumento: z.string().optional(),
      endereco: z.string().optional(),
      numero: z.string().optional(),
      complemento: z.string().optional(),
      bairro: z.string().optional(),
      municipio: z.string().optional(),
      uf: z.string().length(2).optional(),
      cep: z.string().optional(),
      dddTelefone: z.string().optional(),
      telefone: z.string().optional(),
      dddCelular: z.string().optional(),
      celular: z.string().optional(),
      email: z.string().email(),
      dataNascimento: z.string().optional(),
      produtor: z.object({ codigo: z.string() }).optional(),
      grupoProdutor: z.object({ codigo: z.string().min(1) }),
      sexo: z.object({ id: z.number().int() }).optional(),
    }),
    response: z.array(dsProdutor),
  },

  // ----------------------------------------------------------- notificacao
  notificacaoIncluir: {
    method: 'POST',
    path: '/notificacao/',
    body: z.object({
      assunto: z.string().min(1),
      mensagem: z.string().min(1),
      usuario: z.object({ codigo: z.string().min(1) }),
    }),
    response: z.array(dsNotificacao),
  },

  // --------------------------------------------------------------- recibo
  reciboPorCodigo: {
    method: 'GET',
    path: '/recibo/{codigoRecibo}',
    params: z.object({ codigoRecibo: z.string().min(1) }),
    response: z.array(dsRecibo),
  },
  /**
   * Atenção: o upstream exige login+senha do produtor em QUERY STRING. A API
   * Annetec nunca expõe estes dois endpoints diretamente — as credenciais são
   * lidas do vínculo do vendedor no banco pelo serviço de comissões.
   */
  reciboEmitidos: {
    method: 'GET',
    path: '/recibo/procurarPorEmitido',
    query: z.object({ login: z.string().min(1), senha: z.string().min(1) }),
    response: z.array(dsRecibo),
    sensitive: true,
  },
  reciboPagos: {
    method: 'GET',
    path: '/recibo/procurarPorPago',
    query: z.object({ login: z.string().min(1), senha: z.string().min(1) }),
    response: z.array(dsRecibo),
    sensitive: true,
  },
} as const

export type DigitalSaudeEndpointName = keyof typeof digitalSaudeEndpoints
export type DigitalSaudeEndpoint = (typeof digitalSaudeEndpoints)[DigitalSaudeEndpointName]
