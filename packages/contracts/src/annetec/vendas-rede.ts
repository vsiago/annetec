import { z } from 'zod'
import { paginationQuery } from '../common/pagination'
import { cnpj, cpf, dateOnly, email, numeroDocumento, telefone, uf, uuid } from '../common/primitives'

/**
 * REDE COMERCIAL (`vendas-rede`): força de vendas hierárquica (master, gerente,
 * supervisor, vendedor, balcão), corretoras parceiras, unidades, equipes, pool
 * de leads, comissão em cadeia e atendimento de balcão. Vale para o escopo
 * `platform` (ANNETEC vende planos da plataforma) e para o escopo `tenant`
 * (clube vende planos de associado) — o mesmo conjunto de rotas e schemas.
 *
 * Rotas: `/api/v1/vendas/*` (platform), `/api/v1/t/:tenantSlug/vendas/*`
 * (tenant) e `/api/v1/public/vendas/*` (entrada pública). Especificação:
 * `docs/rede-comercial.md`.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const ESCOPOS_VENDAS = ['platform', 'tenant'] as const
export const escopoVendas = z.enum(ESCOPOS_VENDAS)
export type EscopoVendas = z.infer<typeof escopoVendas>

export const PAPEIS_COMERCIAIS = ['master', 'gerente', 'supervisor', 'vendedor', 'balcao'] as const
export const papelComercial = z.enum(PAPEIS_COMERCIAIS)
export type PapelComercial = z.infer<typeof papelComercial>

export const PAPEL_COMERCIAL_LABELS: Record<PapelComercial, string> = {
  master: 'Administrador',
  gerente: 'Gerente',
  supervisor: 'Supervisor',
  vendedor: 'Vendedor',
  balcao: 'Balcão',
}

export const ETAPAS_LEAD = ['novo', 'em_contato', 'proposta', 'negociacao', 'ganho', 'perdido'] as const
export const etapaLead = z.enum(ETAPAS_LEAD)
export type EtapaLead = z.infer<typeof etapaLead>

export const ETAPA_LEAD_LABELS: Record<EtapaLead, string> = {
  novo: 'Novo',
  em_contato: 'Em contato',
  proposta: 'Proposta',
  negociacao: 'Negociação',
  ganho: 'Venda fechada',
  perdido: 'Perdido',
}

export const ORIGENS_LEAD = [
  'site',
  'indicacao',
  'balcao',
  'prospeccao',
  'evento',
  'redes_sociais',
  'importacao',
  'link',
  'outro',
] as const
export const origemLead = z.enum(ORIGENS_LEAD)
export type OrigemLead = z.infer<typeof origemLead>

export const ORIGEM_LEAD_LABELS: Record<OrigemLead, string> = {
  site: 'Site',
  indicacao: 'Indicação',
  balcao: 'Balcão',
  prospeccao: 'Prospecção',
  evento: 'Evento',
  redes_sociais: 'Redes sociais',
  importacao: 'Importação',
  link: 'Link de indicação',
  outro: 'Outro',
}

export const TIPOS_LEAD = ['pessoa', 'empresa'] as const
export const tipoLead = z.enum(TIPOS_LEAD)
export type TipoLead = z.infer<typeof tipoLead>

export const TIPOS_UNIDADE = ['corretora', 'clinica', 'ambulatorio', 'hospital', 'loja', 'outro'] as const
export const tipoUnidade = z.enum(TIPOS_UNIDADE)
export type TipoUnidade = z.infer<typeof tipoUnidade>

export const TIPO_UNIDADE_LABELS: Record<TipoUnidade, string> = {
  corretora: 'Corretora',
  clinica: 'Clínica',
  ambulatorio: 'Ambulatório',
  hospital: 'Hospital',
  loja: 'Loja',
  outro: 'Outro',
}

export const TIPOS_EVENTO_LEAD = [
  'criado',
  'reivindicado',
  'atribuido',
  'devolvido_pool',
  'etapa',
  'ligacao',
  'whatsapp',
  'email',
  'reuniao',
  'visita',
  'nota',
  'atendimento_balcao',
  'proximo_passo',
  'conversao',
  'sistema',
] as const
export const tipoEventoLead = z.enum(TIPOS_EVENTO_LEAD)
export type TipoEventoLead = z.infer<typeof tipoEventoLead>

export const TIPO_EVENTO_LEAD_LABELS: Record<TipoEventoLead, string> = {
  criado: 'Lead criado',
  reivindicado: 'Lead atendido',
  atribuido: 'Lead atribuído',
  devolvido_pool: 'Lead liberado',
  etapa: 'Mudança de etapa',
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  reuniao: 'Reunião',
  visita: 'Visita',
  nota: 'Anotação',
  atendimento_balcao: 'Atendimento no balcão',
  proximo_passo: 'Próximo passo',
  conversao: 'Conversão',
  sistema: 'Sistema',
}

/** Eventos de contato: atualizam `ultimoContatoEm` do lead. */
export const EVENTOS_DE_CONTATO = [
  'ligacao',
  'whatsapp',
  'email',
  'reuniao',
  'visita',
  'atendimento_balcao',
] as const satisfies readonly TipoEventoLead[]
/** Eventos que o agente registra à mão (`POST /leads/:id/eventos`). */
export const EVENTOS_MANUAIS = ['ligacao', 'whatsapp', 'email', 'reuniao', 'visita', 'nota'] as const satisfies readonly TipoEventoLead[]

export const PARTES_COMISSAO = ['vendedor', 'supervisor', 'gerente', 'corretora'] as const
export const parteComissao = z.enum(PARTES_COMISSAO)
export type ParteComissao = z.infer<typeof parteComissao>

export const PARTE_COMISSAO_LABELS: Record<ParteComissao, string> = {
  vendedor: 'Vendedor',
  supervisor: 'Supervisor',
  gerente: 'Gerente',
  corretora: 'Corretora',
}

export const TIPOS_COMISSAO = ['mensalidade', 'adesao'] as const
export const tipoComissao = z.enum(TIPOS_COMISSAO)
export type TipoComissao = z.infer<typeof tipoComissao>

export const STATUS_COMISSAO = ['prevista', 'a_pagar', 'paga', 'cancelada', 'a_descontar'] as const
export const statusComissao = z.enum(STATUS_COMISSAO)
export type StatusComissao = z.infer<typeof statusComissao>

export const STATUS_COMISSAO_LABELS: Record<StatusComissao, string> = {
  prevista: 'Prevista',
  a_pagar: 'A pagar',
  paga: 'Paga',
  cancelada: 'Cancelada',
  a_descontar: 'A descontar',
}

export const RESULTADOS_BALCAO = ['assinou', 'vai_pensar', 'recusou', 'ja_associado', 'so_informacao'] as const
export const resultadoBalcao = z.enum(RESULTADOS_BALCAO)
export type ResultadoBalcao = z.infer<typeof resultadoBalcao>

export const RESULTADO_BALCAO_LABELS: Record<ResultadoBalcao, string> = {
  assinou: 'Assinou',
  vai_pensar: 'Vai pensar',
  recusou: 'Não quis',
  ja_associado: 'Já é associado',
  so_informacao: 'Só informação',
}

export const DISTRIBUICOES_LEADS = ['pool', 'automatica'] as const
export const distribuicaoLeads = z.enum(DISTRIBUICOES_LEADS)
export type DistribuicaoLeads = z.infer<typeof distribuicaoLeads>

export const STATUS_REDE = ['ativa', 'inativa'] as const
export const statusRede = z.enum(STATUS_REDE)
export type StatusRede = z.infer<typeof statusRede>

export const ESTACOES_LEAD = ['pool', 'novos', 'andamento', 'fechados'] as const
export const estacaoLead = z.enum(ESTACOES_LEAD)
export type EstacaoLead = z.infer<typeof estacaoLead>

export const ESTACAO_LEAD_LABELS: Record<EstacaoLead, string> = {
  pool: 'Disponíveis',
  novos: 'Novos',
  andamento: 'Em andamento',
  fechados: 'Encerrados',
}

/** Como a pessoa reagiu no contato (pergunta opcional em "Registrar contato"). Guardado em `dados.sentimento` do evento. */
export const SENTIMENTOS_CONTATO = ['positivo', 'neutro', 'negativo'] as const
export const sentimentoContato = z.enum(SENTIMENTOS_CONTATO)
export type SentimentoContato = z.infer<typeof sentimentoContato>

export const SENTIMENTO_CONTATO_LABELS: Record<SentimentoContato, string> = {
  positivo: 'Interessada',
  neutro: 'Neutra',
  negativo: 'Sem interesse',
}

/** Temperatura do lead, calculada por regra (sem IA) a partir do último contato e do próximo passo. */
export const TEMPERATURAS_LEAD = ['quente', 'morna', 'fria'] as const
export const temperaturaLead = z.enum(TEMPERATURAS_LEAD)
export type TemperaturaLead = z.infer<typeof temperaturaLead>

export const TEMPERATURA_LEAD_LABELS: Record<TemperaturaLead, string> = {
  quente: 'Quente',
  morna: 'Morna',
  fria: 'Fria',
}

export const CANAIS_MENSAGEM = ['whatsapp', 'email'] as const
export const canalMensagem = z.enum(CANAIS_MENSAGEM)
export type CanalMensagem = z.infer<typeof canalMensagem>

// ---------------------------------------------------------------------------
// Blocos reutilizáveis
// ---------------------------------------------------------------------------

const vazioParaNulo = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

const textoOpcional = (max: number) => z.preprocess(vazioParaNulo, z.string().trim().max(max).nullable().optional())
const emailOpcional = z.preprocess(vazioParaNulo, email.nullable().optional())
const telefoneOpcional = z.preprocess(vazioParaNulo, telefone.nullable().optional())
const documentoOpcional = z.preprocess(vazioParaNulo, numeroDocumento.nullable().optional())
const ufOpcional = z.preprocess(vazioParaNulo, uf.nullable().optional())

export const enderecoVendas = z.object({
  cep: z.preprocess(v => (typeof v === 'string' ? v.replace(/\D/g, '') : v), z.string().max(8).optional()),
  logradouro: z.string().trim().max(160).optional(),
  numero: z.string().trim().max(20).optional(),
  complemento: z.string().trim().max(80).optional(),
  bairro: z.string().trim().max(80).optional(),
  cidade: z.string().trim().max(80).optional(),
  uf: ufOpcional,
})
export type EnderecoVendas = z.infer<typeof enderecoVendas>

/** Dados para repasse (Pix ou conta bancária). */
export const repasseVendas = z
  .object({
    tipo: z.enum(['pix', 'conta']),
    chavePix: z.string().trim().max(140).optional(),
    banco: z.string().trim().max(80).optional(),
    agencia: z.string().trim().max(20).optional(),
    conta: z.string().trim().max(30).optional(),
    titular: z.string().trim().max(120).optional(),
    documento: z.string().trim().max(20).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === 'pix' && !v.chavePix) {
      ctx.addIssue({ code: 'custom', path: ['chavePix'], message: 'Informe a chave Pix' })
    }
    if (v.tipo === 'conta') {
      for (const campo of ['banco', 'agencia', 'conta'] as const) {
        if (!v[campo]) ctx.addIssue({ code: 'custom', path: [campo], message: 'Campo obrigatório para conta bancária' })
      }
    }
  })
export type RepasseVendas = z.infer<typeof repasseVendas>

export const overridesComissao = z.object({
  supervisor: z.number().min(0).max(100),
  gerente: z.number().min(0).max(100),
  corretora: z.number().min(0).max(100),
})
export type OverridesComissao = z.infer<typeof overridesComissao>

export const escalaMensal = z.array(z.number().int().min(0).max(100)).min(1).max(12)

export const modeloMensagem = z.object({
  id: z.string().trim().min(1).max(60),
  titulo: z.string().trim().min(1).max(80),
  canal: canalMensagem,
  /** Aceita `{{nome}}`, `{{plano}}`, `{{vendedor}}`, `{{link}}`. */
  texto: z.string().trim().min(1).max(2000),
})
export type ModeloMensagem = z.infer<typeof modeloMensagem>

export const MODELO_MENSAGEM_PLACEHOLDERS = ['nome', 'plano', 'vendedor', 'link'] as const

/** Snapshot da cadeia do agente no momento da conversão (base da comissão). */
export const atribuicaoLead = z.object({
  agenteId: uuid,
  papel: papelComercial,
  equipeId: uuid.nullable(),
  supervisorAgenteId: uuid.nullable(),
  unidadeId: uuid.nullable(),
  corretoraId: uuid.nullable(),
  gerenteAgenteId: uuid.nullable(),
})
export type AtribuicaoLead = z.infer<typeof atribuicaoLead>

export const conversaoLead = z.object({
  tipo: z.enum(['proposta', 'assinatura']),
  id: z.string(),
  status: z.string(),
  atualizadoEm: z.string(),
})
export type ConversaoLead = z.infer<typeof conversaoLead>

export const vendasIdParam = z.object({ id: uuid })
export type VendasIdParam = z.infer<typeof vendasIdParam>

// ---------------------------------------------------------------------------
// Rede: corretoras, unidades, equipes
// ---------------------------------------------------------------------------

export const createCorretoraInput = z.object({
  nomeFantasia: z.string().trim().min(2).max(120),
  razaoSocial: z.string().trim().min(2).max(160),
  cnpj,
  email: emailOpcional,
  telefone: telefoneOpcional,
  endereco: enderecoVendas.nullable().optional(),
  comissaoOverrides: overridesComissao.nullable().optional(),
  observacoes: textoOpcional(1000),
})
export type CreateCorretoraInput = z.infer<typeof createCorretoraInput>

export const updateCorretoraInput = createCorretoraInput.partial().extend({
  status: statusRede.optional(),
})
export type UpdateCorretoraInput = z.infer<typeof updateCorretoraInput>

export const listCorretorasQuery = paginationQuery.extend({ status: statusRede.optional() })
export type ListCorretorasQuery = z.infer<typeof listCorretorasQuery>

export const createUnidadeInput = z.object({
  corretoraId: uuid.nullable().optional(),
  nome: z.string().trim().min(2).max(120),
  tipo: tipoUnidade.default('outro'),
  endereco: enderecoVendas.nullable().optional(),
  telefone: telefoneOpcional,
  responsavelAgenteId: uuid.nullable().optional(),
})
export type CreateUnidadeInput = z.infer<typeof createUnidadeInput>

export const updateUnidadeInput = createUnidadeInput.partial().extend({ status: statusRede.optional() })
export type UpdateUnidadeInput = z.infer<typeof updateUnidadeInput>

export const listUnidadesQuery = paginationQuery.extend({
  corretoraId: uuid.optional(),
  status: statusRede.optional(),
})
export type ListUnidadesQuery = z.infer<typeof listUnidadesQuery>

export const createEquipeInput = z.object({
  corretoraId: uuid.nullable().optional(),
  unidadeId: uuid.nullable().optional(),
  nome: z.string().trim().min(2).max(120),
  supervisorAgenteId: uuid.nullable().optional(),
})
export type CreateEquipeInput = z.infer<typeof createEquipeInput>

export const updateEquipeInput = createEquipeInput.partial().extend({ status: statusRede.optional() })
export type UpdateEquipeInput = z.infer<typeof updateEquipeInput>

export const listEquipesQuery = paginationQuery.extend({
  corretoraId: uuid.optional(),
  unidadeId: uuid.optional(),
  status: statusRede.optional(),
})
export type ListEquipesQuery = z.infer<typeof listEquipesQuery>

// ---------------------------------------------------------------------------
// Agentes
// ---------------------------------------------------------------------------

/** Cadastro completo da pessoa (agente e gerente da corretora). */
const cadastroAgenteFields = {
  nome: z.string().trim().min(2).max(120),
  email,
  cpf,
  telefone,
  dataNascimento: dateOnly.nullable().optional(),
  endereco: enderecoVendas.nullable().optional(),
  repasse: repasseVendas.nullable().optional(),
  observacoes: textoOpcional(1000),
  metaMensal: z.number().int().min(0).max(100_000).nullable().optional(),
}

/** `POST /rede/agentes`. Cria usuário + `vendas_agentes` e envia o convite. */
export const createAgenteInput = z.object({
  ...cadastroAgenteFields,
  papel: papelComercial,
  corretoraId: uuid.nullable().optional(),
  unidadeId: uuid.nullable().optional(),
  equipeId: uuid.nullable().optional(),
  /** Padrão: envia o convite por e-mail. */
  enviarConvite: z.boolean().default(true),
})
export type CreateAgenteInput = z.infer<typeof createAgenteInput>

/** `POST /rede/corretoras/:id/gerente`: o gerente da corretora (papel e corretora são fixos). */
export const createGerenteInput = z.object({
  ...cadastroAgenteFields,
  enviarConvite: z.boolean().default(true),
})
export type CreateGerenteInput = z.infer<typeof createGerenteInput>

/** `PATCH /rede/agentes/:id` (o e-mail da conta não muda por aqui). */
export const updateAgenteInput = z
  .object({
    ...cadastroAgenteFields,
    papel: papelComercial,
    corretoraId: uuid.nullable(),
    unidadeId: uuid.nullable(),
    equipeId: uuid.nullable(),
  })
  .omit({ email: true })
  .partial()
export type UpdateAgenteInput = z.infer<typeof updateAgenteInput>

const booleanQuery = z.enum(['true', 'false']).transform(v => v === 'true')

export const listAgentesQuery = paginationQuery.extend({
  /** Alias de `q` (o front envia os dois). */
  busca: z.string().trim().min(1).optional(),
  papel: papelComercial.optional(),
  corretoraId: uuid.optional(),
  unidadeId: uuid.optional(),
  equipeId: uuid.optional(),
  ativo: booleanQuery.optional(),
  online: booleanQuery.optional(),
})
export type ListAgentesQuery = z.infer<typeof listAgentesQuery>

export const desempenhoAgenteQuery = z.object({
  periodo: z.enum(['30d', 'mes', 'trimestre']).default('30d'),
})
export type DesempenhoAgenteQuery = z.infer<typeof desempenhoAgenteQuery>

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

const leadFields = {
  tipo: tipoLead.default('pessoa'),
  nome: z.string().trim().min(2).max(160),
  documento: documentoOpcional,
  email: emailOpcional,
  telefone: telefoneOpcional,
  cidade: textoOpcional(80),
  uf: ufOpcional,
  origem: origemLead.default('prospeccao'),
  origemDetalhe: textoOpcional(120),
  interessePlanoId: z.string().trim().min(1).max(100).nullable().optional(),
  valorEstimado: z.number().min(0).max(100_000_000).nullable().optional(),
  vidasEstimadas: z.number().int().min(0).max(10_000_000).nullable().optional(),
  observacoes: textoOpcional(2000),
  dados: z.record(z.unknown()).optional(),
}

/** `POST /leads` (manual). Dono = quem cria, ou `agenteId` (master/gerente/supervisor). */
export const createVendasLeadInput = z.object({
  ...leadFields,
  agenteId: uuid.nullable().optional(),
  proximoPasso: textoOpcional(300),
  proximoPassoEm: z.string().datetime().nullable().optional(),
})
export type CreateVendasLeadInput = z.infer<typeof createVendasLeadInput>

/** `PATCH /leads/:id` — cadastro do lead; etapa e dono têm rotas próprias. */
export const updateVendasLeadInput = z.object(leadFields).partial()
export type UpdateVendasLeadInput = z.infer<typeof updateVendasLeadInput>

export const listLeadsQuery = paginationQuery.extend({
  estacao: estacaoLead.optional(),
  etapa: etapaLead.optional(),
  agente: uuid.optional(),
  origem: origemLead.optional(),
  busca: z.string().trim().min(1).max(100).optional(),
})
export type ListLeadsQuery = z.infer<typeof listLeadsQuery>

/** Etapas abertas do quadro do Funil, na ordem das colunas. */
export const ETAPAS_QUADRO = ['novo', 'em_contato', 'proposta', 'negociacao'] as const
export type EtapaQuadro = (typeof ETAPAS_QUADRO)[number]

/** `GET /leads/quadro` — mesmos filtros do Funil; `limite` = cards por coluna (padrão 40). */
export const quadroLeadsQuery = z.object({
  agente: uuid.optional(),
  origem: origemLead.optional(),
  temperatura: temperaturaLead.optional(),
  busca: z.string().trim().min(1).max(100).optional(),
  atrasados: booleanQuery.optional(),
  limite: z.coerce.number().int().min(1).max(200).default(40),
})
export type QuadroLeadsQuery = z.infer<typeof quadroLeadsQuery>

/** `POST /leads/:id/etapa`. `perdido` exige motivo; `ganho` manual exige `confirmar`. */
export const mudarEtapaLeadInput = z
  .object({
    etapa: etapaLead,
    motivoPerda: textoOpcional(500),
    confirmar: z.boolean().optional(),
  })
  .refine(v => v.etapa !== 'perdido' || Boolean(v.motivoPerda), {
    message: 'Informe o motivo da perda',
    path: ['motivoPerda'],
  })
export type MudarEtapaLeadInput = z.infer<typeof mudarEtapaLeadInput>

/** `POST /leads/:id/eventos`. */
export const createEventoLeadInput = z.object({
  tipo: z.enum(EVENTOS_MANUAIS),
  texto: z.string().trim().min(2).max(4000),
  dados: z.record(z.unknown()).nullable().optional(),
  /** Como a pessoa reagiu (opcional; só vale para contatos, não para `nota`). Grava em `dados.sentimento`. */
  sentimento: sentimentoContato.optional(),
})
export type CreateEventoLeadInput = z.infer<typeof createEventoLeadInput>

/** `POST /leads/:id/proximo-passo`. */
export const proximoPassoInput = z.object({
  texto: z.string().trim().min(2).max(300),
  em: z.string().datetime(),
})
export type ProximoPassoInput = z.infer<typeof proximoPassoInput>

/** `POST /leads/:id/reatribuir`. `null` = liberar o lead (volta para Disponíveis). */
export const reatribuirLeadInput = z.object({ agenteId: uuid.nullable() })
export type ReatribuirLeadInput = z.infer<typeof reatribuirLeadInput>

/** `GET /leads/:id/mensagem?modelo=`. */
export const mensagemLeadQuery = z.object({ modelo: z.string().trim().min(1).max(60) })
export type MensagemLeadQuery = z.infer<typeof mensagemLeadQuery>

export const mensagemLeadResponse = z.object({
  modeloId: z.string(),
  canal: canalMensagem,
  texto: z.string(),
  linkWhatsapp: z.string().nullable(),
})
export type MensagemLeadResponse = z.infer<typeof mensagemLeadResponse>

/** `POST /leads/:id/link-adesao` (tenant). */
export const linkAdesaoInput = z.object({ planoId: uuid })
export type LinkAdesaoInput = z.infer<typeof linkAdesaoInput>

/** `POST /leads/:id/assinar` (tenant; balcão/vendedor presencial). */
export const assinarLeadInput = z.object({
  planoId: uuid,
  metodoPagamento: z.enum(['pix', 'boleto', 'credit_card']).default('pix'),
  diaVencimento: z.number().int().min(1).max(28).optional(),
})
export type AssinarLeadInput = z.infer<typeof assinarLeadInput>

/** `POST /leads/:id/proposta` (platform). */
export const propostaLeadInput = z.object({
  planoId: z.string().trim().min(1).max(100),
  enviarEmail: z.boolean().default(false),
})
export type PropostaLeadInput = z.infer<typeof propostaLeadInput>

export const carteiraQuery = paginationQuery.extend({
  situacao: z.enum(['ativa', 'atrasada', 'cancelada', 'pendente']).optional(),
})
export type CarteiraQuery = z.infer<typeof carteiraQuery>

// ---------------------------------------------------------------------------
// Comissões
// ---------------------------------------------------------------------------

const mesReferencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês no formato yyyy-MM')

export const listComissoesQuery = paginationQuery.extend({
  mes: mesReferencia.optional(),
  status: statusComissao.optional(),
  agente: uuid.optional(),
})
export type ListComissoesQuery = z.infer<typeof listComissoesQuery>

export const resumoComissoesQuery = z.object({ mes: mesReferencia.optional() })
export type ResumoComissoesQuery = z.infer<typeof resumoComissoesQuery>

/** `POST /comissoes/pagar` (master): `a_pagar → paga`. */
export const pagarComissoesInput = z.object({
  ids: z.array(uuid).min(1).max(500),
  pagamentoRef: textoOpcional(120),
  pagoEm: z.string().datetime().optional(),
})
export type PagarComissoesInput = z.infer<typeof pagarComissoesInput>

/** `POST /comissoes/:id/cancelar` (master). */
export const cancelarComissaoInput = z.object({ motivo: z.string().trim().min(3).max(500) })
export type CancelarComissaoInput = z.infer<typeof cancelarComissaoInput>

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** `PUT /config` (master): substitui a regra do escopo inteira. */
export const updateConfigInput = z.object({
  escalaMensal,
  percentualAdesao: z.number().min(0).max(100),
  overrides: overridesComissao,
  balcaoPercentual: escalaMensal.nullable(),
  distribuicao: distribuicaoLeads,
  poolRetornoHoras: z.number().int().min(1).max(24 * 30),
  presencaMinutos: z.number().int().min(1).max(60),
  balcaoDescontoPadrao: z.number().int().min(0).max(100),
  metaMensalPadrao: z.number().int().min(0).max(100_000),
  modelosMensagem: z.array(modeloMensagem).max(30),
})
export type UpdateConfigInput = z.infer<typeof updateConfigInput>

export const DEFAULT_MODELOS_MENSAGEM: ModeloMensagem[] = [
  {
    id: 'primeiro-contato',
    titulo: 'Primeiro contato',
    canal: 'whatsapp',
    texto: 'Olá, {{nome}}! Aqui é {{vendedor}}. Vi seu interesse e queria apresentar o plano {{plano}} para você. Posso te ligar agora?',
  },
  {
    id: 'envio-link',
    titulo: 'Envio do link',
    canal: 'whatsapp',
    texto: 'Oi, {{nome}}! Segue o link para você conhecer o plano {{plano}} e aderir:\n{{link}}\nQualquer dúvida, fico por aqui. {{vendedor}}',
  },
  {
    id: 'retomar',
    titulo: 'Retomar conversa',
    canal: 'whatsapp',
    texto: 'Oi, {{nome}}, tudo bem? Passando para saber se ficou alguma dúvida sobre o plano {{plano}}. {{vendedor}}',
  },
  {
    id: 'proposta-email',
    titulo: 'Proposta por e-mail',
    canal: 'email',
    texto: 'Olá, {{nome}}. Segue o link da proposta do plano {{plano}}:\n{{link}}\nAtenciosamente, {{vendedor}}',
  },
]

export const DEFAULT_VENDAS_CONFIG = {
  escalaMensal: [100, 50, 25],
  percentualAdesaoPlatform: 50,
  percentualAdesaoTenant: 0,
  overrides: { supervisor: 10, gerente: 5, corretora: 5 },
  balcaoPercentual: null,
  distribuicao: 'pool',
  poolRetornoHoras: 48,
  presencaMinutos: 3,
  balcaoDescontoPadrao: 30,
  metaMensalPadrao: 10,
} as const

// ---------------------------------------------------------------------------
// Balcão
// ---------------------------------------------------------------------------

/** `POST /balcao/simular`. */
export const simularBalcaoInput = z.object({
  valorTabela: z.number().positive().max(1_000_000),
  planoId: uuid.optional(),
})
export type SimularBalcaoInput = z.infer<typeof simularBalcaoInput>

export const simulacaoBalcao = z.object({
  planoId: uuid,
  planoNome: z.string(),
  descontoPercentual: z.number(),
  precoMensal: z.number(),
  adesao: z.number(),
  valorComPlano: z.number(),
  economiaNaConsulta: z.number(),
  economiaAnual12: z.number(),
  consultasParaCompensar: z.number().nullable(),
})
export type SimulacaoBalcao = z.infer<typeof simulacaoBalcao>

export const pessoaBalcaoQuery = z
  .object({
    documento: z.string().trim().min(1).max(20).optional(),
    telefone: z.string().trim().min(1).max(20).optional(),
  })
  .refine(v => Boolean(v.documento || v.telefone), { message: 'Informe CPF ou celular', path: ['documento'] })
export type PessoaBalcaoQuery = z.infer<typeof pessoaBalcaoQuery>

/** `POST /balcao/atendimentos`. */
export const atendimentoBalcaoInput = z.object({
  nome: z.string().trim().min(2).max(160),
  documento: documentoOpcional,
  telefone: telefoneOpcional,
  servico: z.string().trim().min(2).max(160),
  valorTabela: z.number().min(0).max(1_000_000),
  planoId: uuid.nullable().optional(),
  resultado: resultadoBalcao,
  observacoes: textoOpcional(1000),
  email: emailOpcional,
  dataNascimento: z.preprocess(vazioParaNulo, dateOnly.nullable().optional()),
  /** Só vale para `resultado = assinou` (padrão: `pix`). Cartão exige o link de adesão. */
  formaPagamento: z.enum(['pix', 'boleto']).optional(),
})
export type AtendimentoBalcaoInput = z.infer<typeof atendimentoBalcaoInput>

export const listAtendimentosBalcaoQuery = paginationQuery.extend({
  dia: dateOnly.optional(),
  resultado: resultadoBalcao.optional(),
  /** Só o master: filtra por atendente. */
  agente: uuid.optional(),
})
export type ListAtendimentosBalcaoQuery = z.infer<typeof listAtendimentosBalcaoQuery>

// ---------------------------------------------------------------------------
// Público (sem login)
// ---------------------------------------------------------------------------

/** `POST /api/v1/public/vendas/leads` — site ANNETEC (platform). `website` é o honeypot. */
export const leadPublicoInput = z.object({
  nome: z.string().trim().min(2).max(160),
  email,
  telefone,
  documento: documentoOpcional,
  empresa: textoOpcional(160),
  cidade: textoOpcional(80),
  uf: ufOpcional,
  origemDetalhe: z.string().trim().min(1).max(60),
  mensagem: textoOpcional(2000),
  website: z.string().max(200).optional(),
})
export type LeadPublicoInput = z.infer<typeof leadPublicoInput>

export const refPublicaResponse = z.object({ nomeVendedor: z.string() })
export type RefPublicaResponse = z.infer<typeof refPublicaResponse>

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export const PERIODOS_RESULTADOS = ['30d', 'mes', 'trimestre'] as const
export const AGRUPAMENTOS_RESULTADOS = ['agente', 'equipe', 'unidade', 'corretora'] as const

/** `GET /painel/resultados`. */
export const resultadosQuery = z.object({
  periodo: z.enum(PERIODOS_RESULTADOS).default('30d'),
  agrupar: z.enum(AGRUPAMENTOS_RESULTADOS).default('agente'),
})
export type ResultadosQuery = z.infer<typeof resultadosQuery>

// ---------------------------------------------------------------------------
// Respostas
// ---------------------------------------------------------------------------

const iso = z.string()

export const vendasAgente = z.object({
  id: uuid,
  scope: escopoVendas,
  tenantId: z.string().nullable(),
  userId: z.string(),
  papel: papelComercial,
  corretoraId: uuid.nullable(),
  unidadeId: uuid.nullable(),
  equipeId: uuid.nullable(),
  codigoIndicacao: z.string(),
  ativo: z.boolean(),
  metaMensal: z.number().nullable(),
  nome: z.string(),
  email: z.string().nullable(),
  cpf: z.string().nullable(),
  telefone: z.string().nullable(),
  dataNascimento: z.string().nullable(),
  endereco: enderecoVendas.nullable(),
  repasse: z.record(z.unknown()).nullable(),
  observacoes: z.string().nullable(),
  ultimaPresencaEm: iso.nullable(),
  online: z.boolean(),
  createdAt: iso,
  updatedAt: iso,
})
export type VendasAgente = z.infer<typeof vendasAgente>

export const vendasCorretora = z.object({
  id: uuid,
  nomeFantasia: z.string(),
  razaoSocial: z.string(),
  cnpj: z.string(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
  endereco: enderecoVendas.nullable(),
  gerenteAgenteId: uuid.nullable(),
  status: statusRede,
  comissaoOverrides: overridesComissao.nullable(),
  observacoes: z.string().nullable(),
  createdAt: iso,
  updatedAt: iso,
})
export type VendasCorretora = z.infer<typeof vendasCorretora>

export const vendasUnidade = z.object({
  id: uuid,
  corretoraId: uuid.nullable(),
  nome: z.string(),
  tipo: tipoUnidade,
  endereco: enderecoVendas.nullable(),
  telefone: z.string().nullable(),
  responsavelAgenteId: uuid.nullable(),
  status: statusRede,
})
export type VendasUnidade = z.infer<typeof vendasUnidade>

export const vendasEquipe = z.object({
  id: uuid,
  corretoraId: uuid.nullable(),
  unidadeId: uuid.nullable(),
  nome: z.string(),
  supervisorAgenteId: uuid.nullable(),
  status: statusRede,
})
export type VendasEquipe = z.infer<typeof vendasEquipe>

export const vendasLeadEvento = z.object({
  id: uuid,
  leadId: uuid,
  tipo: tipoEventoLead,
  texto: z.string().nullable(),
  dados: z.record(z.unknown()).nullable(),
  porUserId: z.string().nullable(),
  porAgenteId: uuid.nullable(),
  porNome: z.string().nullable(),
  em: iso,
})
export type VendasLeadEvento = z.infer<typeof vendasLeadEvento>

export const JORNADA_PASSOS = ['captado', 'atribuido', 'contato', 'oferta', 'negociacao', 'fechado'] as const
export const jornadaEstado = z.enum(['feito', 'agora', 'falta', 'pulado'])
export type JornadaEstado = z.infer<typeof jornadaEstado>

export const jornadaLead = z.array(z.object({ passo: z.enum(JORNADA_PASSOS), estado: jornadaEstado }))
export type JornadaLead = z.infer<typeof jornadaLead>

export const proximoPassoDoLead = z.object({
  quem: z.enum(['voce', 'cliente', 'sistema']),
  texto: z.string(),
  atrasado: z.boolean(),
})
export type ProximoPassoDoLead = z.infer<typeof proximoPassoDoLead>

export const vendasLead = z.object({
  id: uuid,
  scope: escopoVendas,
  tenantId: z.string().nullable(),
  tipo: tipoLead,
  nome: z.string(),
  documento: z.string().nullable(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  origem: origemLead,
  origemDetalhe: z.string().nullable(),
  etapa: etapaLead,
  agenteId: uuid.nullable(),
  agenteNome: z.string().nullable(),
  reivindicadoEm: iso.nullable(),
  poolDesde: iso.nullable(),
  proximoPasso: z.string().nullable(),
  proximoPassoEm: iso.nullable(),
  ultimoContatoEm: iso.nullable(),
  interessePlanoId: z.string().nullable(),
  interessePlanoNome: z.string().nullable(),
  valorEstimado: z.number().nullable(),
  vidasEstimadas: z.number().nullable(),
  atribuicao: atribuicaoLead.nullable(),
  conversao: conversaoLead.nullable(),
  ganhoEm: iso.nullable(),
  perdidoEm: iso.nullable(),
  motivoPerda: z.string().nullable(),
  observacoes: z.string().nullable(),
  dados: z.record(z.unknown()),
  createdAt: iso,
  updatedAt: iso,
  /** Temperatura por regra (`null` = lead novo sem contato ou encerrado). */
  temperatura: temperaturaLead.nullable().optional(),
  /** Frase que explica a temperatura ("Reagiu com interesse há 2 dias"). */
  temperaturaMotivo: z.string().nullable().optional(),
  /** Sentimento registrado no último contato. */
  ultimoSentimento: sentimentoContato.nullable().optional(),
  /** Desde quando está na etapa atual (último evento de etapa; senão, quando foi atribuído/criado). */
  etapaDesde: iso.nullable().optional(),
  /** Só no detalhe (`GET /leads/:id`). */
  eventos: z.array(vendasLeadEvento).optional(),
  jornada: jornadaLead.optional(),
  proximoPassoInfo: proximoPassoDoLead.optional(),
})
export type VendasLead = z.infer<typeof vendasLead>

const colunaQuadro = z.object({
  etapa: z.enum(ETAPAS_QUADRO),
  /** Leads da etapa (todos os visíveis, não só os cards devolvidos). */
  total: z.number().int(),
  /** Soma do valor estimado da etapa. */
  valor: z.number(),
  /** Quantos têm próximo passo vencido. */
  atrasados: z.number().int(),
  /** Até `limite` cards: atrasados primeiro, depois quente, morna, fria e os mais antigos na etapa. */
  itens: z.array(vendasLead),
})

/** `GET /leads/quadro` — o Funil em quadro numa única chamada. */
export const quadroLeadsResposta = z.object({
  etapas: z.array(colunaQuadro),
  /** Leads sem responsável (os mais antigos primeiro). */
  disponiveis: z.object({ total: z.number().int(), itens: z.array(vendasLead) }),
  /** Ganhos e perdidos do mês corrente (fuso de Brasília). */
  fechados: z.object({
    ganhos: z.object({ total: z.number().int(), valor: z.number() }),
    perdidos: z.object({ total: z.number().int(), valor: z.number() }),
    itens: z.array(vendasLead),
  }),
  resumo: z.object({
    emAndamento: z.number().int(),
    valorNegociacao: z.number(),
    valorAberto: z.number(),
    atrasados: z.number().int(),
  }),
  geradoEm: iso,
})
export type QuadroLeadsResposta = z.infer<typeof quadroLeadsResposta>
export type ColunaQuadro = z.infer<typeof colunaQuadro>

export const vendasComissao = z.object({
  id: uuid,
  scope: escopoVendas,
  tenantId: z.string().nullable(),
  leadId: uuid.nullable(),
  leadNome: z.string().nullable(),
  beneficiarioAgenteId: uuid.nullable(),
  beneficiarioCorretoraId: uuid.nullable(),
  beneficiarioNome: z.string().nullable(),
  parte: parteComissao,
  tipo: tipoComissao,
  parcela: z.number().int(),
  cobrancaOrigem: z.enum(['platform', 'club']),
  cobrancaRef: z.string(),
  base: z.number(),
  percentual: z.number(),
  valor: z.number(),
  status: statusComissao,
  mesReferencia: z.string(),
  pagoEm: iso.nullable(),
  pagamentoRef: z.string().nullable(),
  observacao: z.string().nullable(),
  createdAt: iso,
})
export type VendasComissao = z.infer<typeof vendasComissao>

export const totaisComissao = z.object({
  prevista: z.number(),
  a_pagar: z.number(),
  paga: z.number(),
  cancelada: z.number(),
  a_descontar: z.number(),
})
export type TotaisComissao = z.infer<typeof totaisComissao>

export const vendasComissoesResposta = z.object({
  items: z.array(vendasComissao),
  totais: totaisComissao,
  total: z.number().int(),
  page: z.number().int(),
  perPage: z.number().int(),
})
export type VendasComissoesResposta = z.infer<typeof vendasComissoesResposta>

export const vendasConfig = updateConfigInput.extend({
  id: uuid,
  scope: escopoVendas,
  tenantId: z.string().nullable(),
  updatedAt: iso,
  updatedByUserId: z.string().nullable(),
})
export type VendasConfig = z.infer<typeof vendasConfig>

/** Parte da config que qualquer agente lê (`GET /config`, `GET /eu`). */
export const vendasConfigPublica = z.object({
  presencaMinutos: z.number().int(),
  distribuicao: distribuicaoLeads,
  poolRetornoHoras: z.number().int(),
  balcaoDescontoPadrao: z.number().int(),
  metaMensalPadrao: z.number().int(),
  modelosMensagem: z.array(modeloMensagem),
})
export type VendasConfigPublica = z.infer<typeof vendasConfigPublica>

/** Resposta de `GET /config`: master recebe a regra completa; os demais, só a parte pública. */
export const vendasConfigResposta = z.object({
  publica: vendasConfigPublica,
  completa: vendasConfig.nullable(),
})
export type VendasConfigResposta = z.infer<typeof vendasConfigResposta>

export const vendasEu = z.object({
  scope: escopoVendas,
  tenantId: z.string().nullable(),
  userId: z.string(),
  papel: papelComercial,
  masterImplicito: z.boolean(),
  /** `false` = agente inativo: lê e não escreve. */
  podeEscrever: z.boolean(),
  agente: vendasAgente.nullable(),
  config: vendasConfigPublica,
  contadores: z.object({
    pool: z.number().int(),
    minhaVez: z.number().int(),
    emAndamento: z.number().int(),
  }),
})
export type VendasEu = z.infer<typeof vendasEu>

export const vendasPresencaOnline = z.object({
  agentes: z.array(
    z.object({
      id: uuid,
      nome: z.string(),
      papel: papelComercial,
      ultimaPresencaEm: iso.nullable(),
    }),
  ),
})
export type VendasPresencaOnline = z.infer<typeof vendasPresencaOnline>

export const vendasArvoreAgente = z.object({
  id: uuid,
  nome: z.string(),
  papel: papelComercial,
  ativo: z.boolean(),
  online: z.boolean(),
  equipeId: uuid.nullable(),
  unidadeId: uuid.nullable(),
  corretoraId: uuid.nullable(),
})
export type VendasArvoreAgente = z.infer<typeof vendasArvoreAgente>

export const vendasArvoreEquipe = vendasEquipe.extend({ agentes: z.array(vendasArvoreAgente) })
export type VendasArvoreEquipe = z.infer<typeof vendasArvoreEquipe>

export const vendasArvoreUnidade = vendasUnidade.extend({
  equipes: z.array(vendasArvoreEquipe),
  agentes: z.array(vendasArvoreAgente),
})
export type VendasArvoreUnidade = z.infer<typeof vendasArvoreUnidade>

export const vendasArvoreCorretora = vendasCorretora.extend({
  gerente: vendasArvoreAgente.nullable(),
  unidades: z.array(vendasArvoreUnidade),
  equipes: z.array(vendasArvoreEquipe),
  agentes: z.array(vendasArvoreAgente),
})
export type VendasArvoreCorretora = z.infer<typeof vendasArvoreCorretora>

export const vendasArvoreRede = z.object({
  corretoras: z.array(vendasArvoreCorretora),
  /** Unidades próprias do escopo (sem corretora). */
  unidadesProprias: z.array(vendasArvoreUnidade),
  /** Vendedores solo (sem equipe e sem corretora). */
  solos: z.array(vendasArvoreAgente),
})
export type VendasArvoreRede = z.infer<typeof vendasArvoreRede>

export const vendasLinhaDaVez = z.object({
  lead: vendasLead,
  acao: z.enum(['atender', 'ligar', 'registrar', 'enviar_proposta']),
  motivo: z.string(),
})
export type VendasLinhaDaVez = z.infer<typeof vendasLinhaDaVez>

const comparativo = z.object({ atual: z.number(), anterior: z.number() })

export const vendasPainelHoje = z.object({
  saudacao: z.string(),
  agente: z.object({ id: uuid.nullable(), nome: z.string(), papel: papelComercial, online: z.boolean() }),
  contadores: z.object({
    pool: z.number().int(),
    minhaVez: z.number().int(),
    emAndamento: z.number().int(),
    proximosPassosAtrasados: z.number().int(),
    poolParadoMais15min: z.number().int(),
  }),
  suaVez: z.array(vendasLinhaDaVez),
  semana: z.object({
    contatos: comparativo,
    respostas: comparativo,
    reunioes: comparativo,
    vendas: comparativo,
  }),
  funil: z.object({
    contagem: z.record(z.number()),
    taxaConversao: z.number(),
    valorEmNegociacao: z.number(),
  }),
  meta: z.object({ metaMensal: z.number().nullable(), realizado: z.number() }),
  equipeOnline: z.array(z.object({ id: uuid, nome: z.string(), papel: papelComercial })),
})
export type VendasPainelHoje = z.infer<typeof vendasPainelHoje>

export const vendasPainelResultados = z.object({
  periodo: z.enum(PERIODOS_RESULTADOS),
  agrupar: z.enum(AGRUPAMENTOS_RESULTADOS),
  kpis: z.object({
    leads: z.number(),
    contatos: z.number(),
    propostas: z.number(),
    ganhos: z.number(),
    taxaConversao: z.number(),
    valorGanho: z.number(),
    comissaoPrevista: z.number(),
    comissaoAPagar: z.number(),
    comissaoPaga: z.number(),
  }),
  serieDiaria: z.array(z.object({ dia: z.string(), leads: z.number(), ganhos: z.number() })),
  funil: z.array(z.object({ etapa: etapaLead, total: z.number() })),
  ranking: z.array(
    z.object({
      chave: z.string(),
      nome: z.string(),
      leads: z.number(),
      ganhos: z.number(),
      valor: z.number(),
    }),
  ),
  origens: z.array(z.object({ origem: origemLead, total: z.number() })),
})
export type VendasPainelResultados = z.infer<typeof vendasPainelResultados>

export const vendasAtendimentoBalcao = z.object({
  id: uuid,
  agenteId: uuid,
  agenteNome: z.string().nullable(),
  unidadeId: uuid.nullable(),
  leadId: uuid.nullable(),
  nome: z.string(),
  documento: z.string().nullable(),
  telefone: z.string().nullable(),
  servico: z.string(),
  valorTabela: z.number(),
  descontoPercentual: z.number(),
  valorComPlano: z.number(),
  planoId: z.string().nullable(),
  resultado: resultadoBalcao,
  resultadoLabel: z.string(),
  observacoes: z.string().nullable(),
  assinaturaId: z.string().nullable(),
  createdAt: iso,
})
export type VendasAtendimentoBalcao = z.infer<typeof vendasAtendimentoBalcao>

export const vendasBalcaoHoje = z.object({
  dia: z.string(),
  agente: z
    .object({
      id: uuid,
      nome: z.string(),
      unidade: z.object({ id: uuid, nome: z.string(), tipo: z.string() }).nullable(),
    })
    .nullable(),
  atendimentos: z.array(vendasAtendimentoBalcao),
  totais: z.object({
    atendimentos: z.number().int(),
    ofertas: z.number().int(),
    adesoes: z.number().int(),
    vaiPensar: z.number().int(),
    /** Média de `valorTabela − valorComPlano` das ofertas (mesmo valor de `ticketMedioEconomia`). */
    economiaMedia: z.number(),
    ticketMedioEconomia: z.number(),
  }),
  /** Meta mensal do agente / 22 dias úteis; `null` sem meta. */
  metaDia: z.number().nullable(),
})
export type VendasBalcaoHoje = z.infer<typeof vendasBalcaoHoje>

export const vendasPlanoBalcao = z.object({
  id: uuid,
  nome: z.string(),
  precoMensal: z.number(),
  adesao: z.number(),
  descontoPercentual: z.number(),
  destaque: z.boolean(),
  resumo: z.array(z.string()),
  vendavel: z.boolean(),
})
export type VendasPlanoBalcao = z.infer<typeof vendasPlanoBalcao>

/**
 * Resposta MÍNIMA de `GET /balcao/pessoa` (o atendente de uma clínica parceira não pode virar oráculo de
 * dados do clube):
 *  - associado: só `{ planoNome, status }`; `nome` apenas quando a busca foi pelo CPF do próprio titular
 *    (nunca telefone ou e-mail);
 *  - `lead`: o lead completo só quando é do próprio atendente (ou do master, que vê todo o funil);
 *  - `leadAberto`: aviso de que existe lead aberto (`proprio: false` = de outro atendente, sem nome,
 *    observações, atribuição ou conversão).
 */
export const vendasPessoaBalcao = z.object({
  jaAssociado: z.boolean(),
  assinatura: z.object({ planoNome: z.string(), status: z.string() }).nullable().optional(),
  lead: vendasLead.nullable().optional(),
  leadAberto: z.object({ existe: z.literal(true), etapa: etapaLead, proprio: z.boolean() }).nullable().optional(),
  nome: z.string().nullable().optional(),
})
export type VendasPessoaBalcao = z.infer<typeof vendasPessoaBalcao>
