import { z } from 'zod'
import { cep, cnpj, cpf, dateOnly, email, telefone, uf, uuid } from '../common/primitives'
import { KYB_ACCEPTED_MIME_TYPES, KYB_MAX_FILE_BYTES } from './platform-onboarding'
import { escopoVendas, type PapelComercial } from './vendas-rede'

/**
 * CANDIDATURAS DA REDE COMERCIAL ("Seja um parceiro comercial"): auto-cadastro
 * público (PF/PJ) que o master do escopo aprova ou recusa. Aprovar cria a
 * corretora (se for o caso) e o agente com conta e convite. Rascunho retomável
 * por link com chave HMAC. Especificação: `docs/rede-comercial.md`.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const CANDIDATURA_STATUS = ['rascunho', 'recebida', 'aprovada', 'recusada'] as const
export const candidaturaStatus = z.enum(CANDIDATURA_STATUS)
export type CandidaturaStatus = z.infer<typeof candidaturaStatus>

export const CANDIDATURA_STATUS_LABELS = {
  rascunho: 'Rascunho',
  recebida: 'Em análise',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
} as const satisfies Record<CandidaturaStatus, string>

export const CANDIDATURA_TIPOS_PESSOA = ['pf', 'pj'] as const
export const candidaturaTipoPessoa = z.enum(CANDIDATURA_TIPOS_PESSOA)
export type CandidaturaTipoPessoa = z.infer<typeof candidaturaTipoPessoa>

export const CANDIDATURA_TIPO_PESSOA_LABELS = {
  pf: 'Pessoa física',
  pj: 'Pessoa jurídica',
} as const satisfies Record<CandidaturaTipoPessoa, string>

export const CANDIDATURA_ATUACOES = ['vendedor_solo', 'vendedor_equipe', 'supervisor', 'gerente', 'corretora'] as const
export const candidaturaAtuacao = z.enum(CANDIDATURA_ATUACOES)
export type CandidaturaAtuacao = z.infer<typeof candidaturaAtuacao>

export const CANDIDATURA_ATUACAO_LABELS = {
  vendedor_solo: 'Vendedor independente',
  vendedor_equipe: 'Vendedor em uma equipe',
  supervisor: 'Supervisor de equipe',
  gerente: 'Gerente comercial',
  corretora: 'Corretora parceira',
} as const satisfies Record<CandidaturaAtuacao, string>

export const CANDIDATURA_ATUACAO_DESCRICOES = {
  vendedor_solo: 'Venda por conta própria, com seu link e seu código de indicação.',
  vendedor_equipe: 'Entre na equipe de um supervisor ou colega usando o código dele.',
  supervisor: 'Lidere uma equipe de vendedores e acompanhe os resultados dela.',
  gerente: 'Coordene corretoras, unidades e equipes da operação comercial.',
  corretora: 'Cadastre sua empresa como corretora parceira, com gerente, equipes e vendedores.',
} as const satisfies Record<CandidaturaAtuacao, string>

export const CANDIDATURA_DOCUMENTO_KINDS = [
  'documento_identidade',
  'comprovante_endereco',
  'cartao_cnpj',
  'contrato_social',
  'outro',
] as const
export const candidaturaDocumentoKind = z.enum(CANDIDATURA_DOCUMENTO_KINDS)
export type CandidaturaDocumentoKind = z.infer<typeof candidaturaDocumentoKind>

export const CANDIDATURA_DOCUMENTO_KIND_LABELS = {
  documento_identidade: 'Documento de identidade (RG ou CNH)',
  comprovante_endereco: 'Comprovante de endereço',
  cartao_cnpj: 'Cartão CNPJ',
  contrato_social: 'Contrato social',
  outro: 'Outro documento',
} as const satisfies Record<CandidaturaDocumentoKind, string>

export const CANDIDATURA_DOCUMENTOS_OBRIGATORIOS: Record<CandidaturaTipoPessoa, CandidaturaDocumentoKind[]> = {
  pf: ['documento_identidade', 'comprovante_endereco'],
  pj: ['documento_identidade', 'comprovante_endereco', 'cartao_cnpj'],
}

export const CANDIDATURA_MAX_DOCUMENTOS = 10
export const CANDIDATURA_MAX_FILE_BYTES = KYB_MAX_FILE_BYTES
export const CANDIDATURA_ACCEPTED_MIME_TYPES = KYB_ACCEPTED_MIME_TYPES

export const CANDIDATURA_PAPEIS_APROVACAO = ['vendedor', 'supervisor', 'gerente'] as const satisfies readonly PapelComercial[]

export const CANDIDATURA_TERMOS_VERSAO = '2026-11'

export const CANDIDATURA_TERMOS = [
  'TERMO DE PARCERIA COMERCIAL',
  '1. Objeto. Este termo regula a atuação do parceiro como intermediador na venda de planos, sem exclusividade, por conta e risco próprios.',
  '2. Natureza da relação. A parceria não gera vínculo empregatício, societário ou de representação. O parceiro define seus horários e meios de trabalho e responde por seus tributos e encargos.',
  '3. Comissão. A comissão segue as regras vigentes do escopo ao qual o parceiro se vincula, é calculada sobre os pagamentos efetivamente recebidos e pode ser revista com aviso prévio, sem efeito retroativo.',
  '4. Veracidade dos dados. O parceiro declara que os dados e documentos enviados são verdadeiros e atuais, e se compromete a atualizá-los quando mudarem.',
  '5. Conduta. É vedado prometer condições não autorizadas, prestar informações falsas sobre os planos ou usar práticas abusivas na abordagem de clientes.',
  '6. Sigilo e LGPD. Os dados de clientes e leads acessados na parceria são confidenciais e só podem ser tratados para a finalidade da venda, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).',
  '7. Aprovação. O envio da candidatura não garante a aprovação. A análise pode pedir informações adicionais e a decisão, aprovando ou recusando, é comunicada por e-mail.',
  '8. Descredenciamento. O descumprimento deste termo ou das regras comerciais autoriza o descredenciamento imediato e a retenção de comissões obtidas de forma irregular. Qualquer das partes pode encerrar a parceria por aviso.',
  '9. Dados do aceite. Ao aceitar, o parceiro autoriza o registro de data, hora, endereço IP e navegador como prova do consentimento.',
  '10. Foro. Fica eleito o foro da comarca da sede da contratante para dirimir questões deste termo.',
] as const

export type PapelDaAtuacao = Extract<PapelComercial, 'vendedor' | 'supervisor' | 'gerente'>

const PAPEL_POR_ATUACAO: Record<CandidaturaAtuacao, PapelDaAtuacao> = {
  vendedor_solo: 'vendedor',
  vendedor_equipe: 'vendedor',
  supervisor: 'supervisor',
  gerente: 'gerente',
  corretora: 'gerente',
}

export const papelDaAtuacao = (atuacao: CandidaturaAtuacao): PapelDaAtuacao => PAPEL_POR_ATUACAO[atuacao]

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const nomeCompleto = z
  .string()
  .trim()
  .min(3, 'Informe o nome completo')
  .max(120, 'Nome longo demais')
  .refine(v => v.split(/\s+/).length >= 2, 'Informe nome e sobrenome')

const vazioParaNulo = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)
const textoOpcional = (max: number) => z.preprocess(vazioParaNulo, z.string().trim().max(max).optional())

export const codigoIndicacaoCandidatura = z.string().trim().min(4, 'Código inválido').max(24, 'Código inválido')

export const iniciarCandidaturaInput = z
  .object({
    tipoPessoa: candidaturaTipoPessoa,
    atuacao: candidaturaAtuacao,
    nome: nomeCompleto,
    email,
    telefone,
    cpf,
    cnpj: z.preprocess(vazioParaNulo, cnpj.optional()),
    codigoIndicacao: z.preprocess(vazioParaNulo, codigoIndicacaoCandidatura.optional()),
    /** Honeypot: humano nunca preenche. */
    website: z.string().max(0).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.atuacao === 'corretora' && v.tipoPessoa !== 'pj') {
      ctx.addIssue({ code: 'custom', path: ['tipoPessoa'], message: 'Corretora parceira exige pessoa jurídica' })
    }
    if (v.tipoPessoa === 'pj' && !v.cnpj) {
      ctx.addIssue({ code: 'custom', path: ['cnpj'], message: 'Informe o CNPJ' })
    }
    if (v.atuacao === 'vendedor_equipe' && !v.codigoIndicacao) {
      ctx.addIssue({ code: 'custom', path: ['codigoIndicacao'], message: 'Informe o código de quem vai indicar você' })
    }
  })
export type IniciarCandidaturaInput = z.infer<typeof iniciarCandidaturaInput>

export const candidaturaEndereco = z.object({
  cep,
  logradouro: z.string().trim().min(1, 'Informe a rua').max(160),
  numero: z.string().trim().min(1, 'Informe o número').max(20),
  complemento: textoOpcional(80),
  bairro: z.string().trim().min(1, 'Informe o bairro').max(80),
  cidade: z.string().trim().min(1, 'Informe a cidade').max(80),
  uf,
})
export type CandidaturaEndereco = z.infer<typeof candidaturaEndereco>

const dataNascimentoValida = dateOnly.refine(valor => {
  const data = new Date(`${valor}T00:00:00Z`)
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) return false
  return data.getTime() <= Date.now() && data.getUTCFullYear() >= 1900
}, 'Data de nascimento inválida')

export const candidaturaDadosInput = z.object({
  atuacao: candidaturaAtuacao,
  codigoIndicacao: z.preprocess(vazioParaNulo, codigoIndicacaoCandidatura.optional()),
  dataNascimento: z.preprocess(vazioParaNulo, dataNascimentoValida.optional()),
  endereco: candidaturaEndereco,
  razaoSocial: textoOpcional(160),
  nomeFantasia: textoOpcional(160),
  experiencia: textoOpcional(1000),
  regiaoAtuacao: textoOpcional(120),
  comoConheceu: textoOpcional(120),
})
export type CandidaturaDadosInput = z.infer<typeof candidaturaDadosInput>

export const enviarCandidaturaInput = z.object({
  aceiteTermos: z.literal(true, { message: 'É preciso aceitar o termo de parceria' }),
  nomeAssinatura: nomeCompleto,
})
export type EnviarCandidaturaInput = z.infer<typeof enviarCandidaturaInput>

export const uploadCandidaturaDocumentoFields = z.object({ kind: candidaturaDocumentoKind })
export type UploadCandidaturaDocumentoFields = z.infer<typeof uploadCandidaturaDocumentoFields>

export const recuperarAcessoCandidaturaInput = z.object({ email })
export type RecuperarAcessoCandidaturaInput = z.infer<typeof recuperarAcessoCandidaturaInput>

export const aprovarCandidaturaInput = z.object({
  papel: z.enum(CANDIDATURA_PAPEIS_APROVACAO).optional(),
  corretoraId: uuid.optional(),
  unidadeId: uuid.optional(),
  equipeId: uuid.optional(),
  observacoes: textoOpcional(500),
  enviarConvite: z.boolean().default(true),
})
export type AprovarCandidaturaInput = z.infer<typeof aprovarCandidaturaInput>

export const recusarCandidaturaInput = z.object({
  motivo: z.string().trim().min(10, 'Explique o motivo (mínimo 10 caracteres)').max(1000),
})
export type RecusarCandidaturaInput = z.infer<typeof recusarCandidaturaInput>

export const CANDIDATURA_FILTROS_STATUS = ['recebida', 'aprovada', 'recusada', 'todas'] as const
export const listarCandidaturasQuery = z.object({
  status: z.enum(CANDIDATURA_FILTROS_STATUS).default('recebida'),
})
export type ListarCandidaturasQuery = z.infer<typeof listarCandidaturasQuery>

// ---------------------------------------------------------------------------
// Saídas
// ---------------------------------------------------------------------------

export interface CandidaturaIndicador {
  nome: string
  papel: PapelComercial
}

export interface CandidaturaDocumento {
  id: string
  kind: CandidaturaDocumentoKind
  fileName: string
  sizeBytes: number
  mimeType: string
  createdAt: string
}

export interface CandidaturaAceite {
  termosVersao: string
  nomeAssinatura: string
  aceitoEm: string
}

/** Visão do candidato (acessada pela chave). */
export interface CandidaturaPublica {
  id: string
  scope: z.infer<typeof escopoVendas>
  status: CandidaturaStatus
  tipoPessoa: CandidaturaTipoPessoa
  atuacao: CandidaturaAtuacao
  nome: string
  email: string
  telefone: string
  cpf: string
  cnpj: string | null
  razaoSocial: string | null
  nomeFantasia: string | null
  dataNascimento: string | null
  endereco: CandidaturaEndereco | null
  codigoIndicacao: string | null
  indicadoPor: CandidaturaIndicador | null
  experiencia: string | null
  regiaoAtuacao: string | null
  comoConheceu: string | null
  documentos: CandidaturaDocumento[]
  aceite: CandidaturaAceite | null
  /** O que falta para enviar (vazio = pronta). */
  pendencias: string[]
  enviadaEm: string | null
  decididaEm: string | null
  motivoRecusa: string | null
  /** Só quando aprovada. */
  loginPath: string | null
  createdAt: string
  updatedAt: string
}

/** Linha da lista do admin. */
export interface CandidaturaResumo {
  id: string
  status: CandidaturaStatus
  tipoPessoa: CandidaturaTipoPessoa
  atuacao: CandidaturaAtuacao
  nome: string
  email: string
  telefone: string
  cidade: string | null
  uf: string | null
  indicadoPor: CandidaturaIndicador | null
  enviadaEm: string | null
  decididaEm: string | null
  createdAt: string
}

export interface CandidaturaVinculoSugerido {
  papel: PapelComercial
  corretoraId?: string
  unidadeId?: string
  equipeId?: string
  motivo: string
}

export interface CandidaturaDetalhe extends CandidaturaPublica {
  origemIp: string | null
  origemUserAgent: string | null
  decididaPor: { id: string; nome: string } | null
  observacoesDecisao: string | null
  agenteId: string | null
  corretoraId: string | null
  vinculoSugerido: CandidaturaVinculoSugerido
}

export interface IniciarCandidaturaResult {
  id: string
  chave: string
  acompanhamentoPath: string
}
