import {
  CANDIDATURA_ATUACAO_LABELS,
  CANDIDATURA_DOCUMENTO_KIND_LABELS,
  CANDIDATURA_MAX_DOCUMENTOS,
  CANDIDATURA_TERMOS,
  CANDIDATURA_TERMOS_VERSAO,
  CANDIDATURA_TIPO_PESSOA_LABELS,
  ERROR_CODES,
  type AprovarCandidaturaInput,
  type CandidaturaAtuacao,
  type CandidaturaDetalhe,
  type CandidaturaDocumento,
  type CandidaturaEndereco,
  type CandidaturaIndicador,
  type CandidaturaPublica,
  type CandidaturaResumo,
  type CandidaturaStatus,
  type CandidaturaVinculoSugerido,
  type CreateAgenteInput,
  type EmailTemplate,
  type EnviarCandidaturaInput,
  type EscopoVendas,
  type IniciarCandidaturaInput,
  type IniciarCandidaturaResult,
  type ListarCandidaturasQuery,
  type PapelComercial,
  type RecusarCandidaturaInput,
  type UploadCandidaturaDocumentoFields,
} from '@annetec/contracts'
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { env } from '@/config/env'
import { db } from '@/db/client'
import {
  platformFiles,
  user,
  vendasAgentes,
  vendasCandidaturaDocumentos,
  vendasCandidaturas,
  vendasEquipes,
  type VendasAgenteRow,
} from '@/db/schema'
import { AppError } from '@/http/errors'
import { sendEmail } from '@/lib/email'
import { parseAddress } from '@/lib/email/providers'
import { logger } from '@/lib/logger'
import { notify, vendasCandidaturaRecebidaNotification } from '@/lib/notifications'
import { checkUpload, discardFile, findFile, sanitizeFileName, storeFile, type PlatformFileRow } from '@/lib/storage'
import { loadClubBrand } from '@/modules/users/access.service'
import { buscarAgentePorCodigo } from './atribuicao'
import { acompanhamentoPath, acompanhamentoUrl, candidaturaAccessKey } from './candidaturas-access-key'
import { papelDaAtuacao, pendencias, vinculoSugerido, type IndicadorParaVinculo } from './candidaturas.rules'
import { whereEscopo, type VendasCtx } from './context'
import { criarAgente, criarCorretora, criarGerenteDaCorretora, removerCorretora } from './rede.service'

/**
 * Candidaturas da Rede Comercial ("Seja um parceiro comercial"): rascunho
 * público retomável por chave, envio com aceite, e decisão do master do escopo.
 * Toda consulta é presa ao escopo (`scope` + `tenant_id`): id de outro clube ou
 * da plataforma é 404. Ver `docs/rede-comercial.md`.
 */

export interface EscopoCandidatura {
  scope: EscopoVendas
  /** `organization.id` no escopo tenant; `null` no platform. */
  tenantId: string | null
  tenantSlug: string | null
}

export interface MetaRequisicao {
  ip: string | null
  userAgent: string | null
}

type CandidaturaRow = typeof vendasCandidaturas.$inferSelect

const jaExiste = (mensagem: string) => new AppError(ERROR_CODES.ALREADY_EXISTS, mensagem)
const campo = (path: string, message: string, status?: number) =>
  new AppError(ERROR_CODES.VALIDATION_ERROR, message, { issues: [{ path, message }], ...(status ? { status } : {}) })

function violouUnicidade(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null
  return e?.code === '23505' || e?.cause?.code === '23505'
}

function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const whereEscopoCandidatura = (escopo: EscopoCandidatura) => whereEscopo(vendasCandidaturas, escopo)

const MSG_EMAIL_EM_ANALISE = 'Já existe uma candidatura em análise para este e-mail. Use a recuperação de acesso.'

// ---------------------------------------------------------------------------
// Leitura e mapeamento
// ---------------------------------------------------------------------------

async function acharCandidatura(escopo: EscopoCandidatura, id: string): Promise<CandidaturaRow> {
  const [row] = await db
    .select()
    .from(vendasCandidaturas)
    .where(and(eq(vendasCandidaturas.id, id), whereEscopoCandidatura(escopo)))
    .limit(1)
  if (!row) throw AppError.notFound('Candidatura')
  return row
}

interface DocumentoComArquivo {
  doc: typeof vendasCandidaturaDocumentos.$inferSelect
  file: PlatformFileRow
}

async function documentosAtivos(candidaturaId: string): Promise<DocumentoComArquivo[]> {
  const rows = await db
    .select({ doc: vendasCandidaturaDocumentos, file: platformFiles })
    .from(vendasCandidaturaDocumentos)
    .innerJoin(platformFiles, eq(platformFiles.id, vendasCandidaturaDocumentos.fileId))
    .where(and(eq(vendasCandidaturaDocumentos.candidaturaId, candidaturaId), eq(vendasCandidaturaDocumentos.status, 'uploaded')))
    .orderBy(asc(vendasCandidaturaDocumentos.createdAt))
  return rows as DocumentoComArquivo[]
}

interface IndicadorResolvido {
  agente: VendasAgenteRow
  equipeSupervisionadaId: string | null
}

async function resolverIndicador(agenteId: string | null): Promise<IndicadorResolvido | null> {
  if (!agenteId) return null
  const [agente] = await db.select().from(vendasAgentes).where(eq(vendasAgentes.id, agenteId)).limit(1)
  if (!agente) return null
  const [equipe] = await db
    .select({ id: vendasEquipes.id })
    .from(vendasEquipes)
    .where(eq(vendasEquipes.supervisorAgenteId, agente.id))
    .limit(1)
  return { agente, equipeSupervisionadaId: equipe?.id ?? null }
}

const paraIndicador = (indicador: IndicadorResolvido | null): CandidaturaIndicador | null =>
  indicador ? { nome: indicador.agente.nome, papel: indicador.agente.papel } : null

const iso = (data: Date | null | undefined) => (data ? data.toISOString() : null)

function paraDocumento({ doc, file }: DocumentoComArquivo): CandidaturaDocumento {
  return {
    id: doc.id,
    kind: doc.kind,
    fileName: file.fileName,
    sizeBytes: file.sizeBytes,
    mimeType: file.mimeType,
    createdAt: doc.createdAt.toISOString(),
  }
}

export function loginPathDoEscopo(escopo: Pick<EscopoCandidatura, 'scope' | 'tenantSlug'>): string {
  return escopo.scope === 'tenant' && escopo.tenantSlug ? `/${escopo.tenantSlug}/login` : '/login'
}

function pendenciasDe(row: CandidaturaRow, documentos: DocumentoComArquivo[]): string[] {
  return pendencias({
    candidatura: row,
    documentos: documentos.map(d => ({ kind: d.doc.kind, status: d.doc.status })),
  })
}

function mapearPublica(
  escopo: EscopoCandidatura,
  row: CandidaturaRow,
  documentos: DocumentoComArquivo[],
  indicador: IndicadorResolvido | null,
): CandidaturaPublica {
  return {
    id: row.id,
    scope: row.scope,
    status: row.status,
    tipoPessoa: row.tipoPessoa,
    atuacao: row.atuacao,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    cpf: row.cpf,
    cnpj: row.cnpj,
    razaoSocial: row.razaoSocial,
    nomeFantasia: row.nomeFantasia,
    dataNascimento: row.dataNascimento,
    endereco: row.endereco,
    codigoIndicacao: row.codigoIndicacao,
    indicadoPor: paraIndicador(indicador),
    experiencia: row.dados?.experiencia ?? null,
    regiaoAtuacao: row.dados?.regiaoAtuacao ?? null,
    comoConheceu: row.dados?.comoConheceu ?? null,
    documentos: documentos.map(paraDocumento),
    aceite: row.aceite
      ? { termosVersao: row.aceite.termosVersao, nomeAssinatura: row.aceite.nomeAssinatura, aceitoEm: row.aceite.aceitoEm }
      : null,
    pendencias: row.status === 'rascunho' ? pendenciasDe(row, documentos) : [],
    enviadaEm: iso(row.enviadaEm),
    decididaEm: iso(row.decididaEm),
    motivoRecusa: row.motivoRecusa,
    loginPath: row.status === 'aprovada' ? loginPathDoEscopo(escopo) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function sugerir(row: CandidaturaRow, indicador: IndicadorResolvido | null): CandidaturaVinculoSugerido {
  const entrada: IndicadorParaVinculo | null = indicador
    ? {
        nome: indicador.agente.nome,
        papel: indicador.agente.papel,
        corretoraId: indicador.agente.corretoraId,
        unidadeId: indicador.agente.unidadeId,
        equipeId: indicador.agente.equipeId,
        equipeSupervisionadaId: indicador.equipeSupervisionadaId,
      }
    : null
  return { papel: papelDaAtuacao(row.atuacao), ...vinculoSugerido(entrada) }
}

async function carregarPublica(escopo: EscopoCandidatura, row: CandidaturaRow): Promise<CandidaturaPublica> {
  const [documentos, indicador] = await Promise.all([documentosAtivos(row.id), resolverIndicador(row.indicadoPorAgenteId)])
  return mapearPublica(escopo, row, documentos, indicador)
}

async function carregarDetalhe(escopo: EscopoCandidatura, row: CandidaturaRow): Promise<CandidaturaDetalhe> {
  const [documentos, indicador] = await Promise.all([documentosAtivos(row.id), resolverIndicador(row.indicadoPorAgenteId)])
  let decididaPor: { id: string; nome: string } | null = null
  if (row.decididaPorUserId) {
    const [conta] = await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, row.decididaPorUserId)).limit(1)
    if (conta) decididaPor = { id: conta.id, nome: conta.name }
  }
  return {
    ...mapearPublica(escopo, row, documentos, indicador),
    origemIp: row.origemIp,
    origemUserAgent: row.origemUserAgent,
    decididaPor,
    observacoesDecisao: row.observacoesDecisao,
    agenteId: row.agenteId,
    corretoraId: row.corretoraId,
    vinculoSugerido: sugerir(row, indicador),
  }
}

// ---------------------------------------------------------------------------
// E-mail (marca por escopo, como o convite do agente) e notificação
// ---------------------------------------------------------------------------

async function enviarEmailCandidatura(
  escopo: EscopoCandidatura,
  template: 'vendas_candidatura_recebida' | 'vendas_candidatura_recusada',
  row: Pick<CandidaturaRow, 'id' | 'nome' | 'email'>,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    const senderEmail = parseAddress(env.EMAIL_FROM).email
    let marca: { clubName: string; brandColor: string | null; logoUrl: string | null }
    let slug = escopo.tenantSlug
    if (escopo.scope === 'tenant' && escopo.tenantId) {
      const clube = await loadClubBrand(escopo.tenantId)
      slug = clube?.slug ?? slug
      marca = { clubName: clube?.name ?? 'Seu clube', brandColor: clube?.primaryColor ?? null, logoUrl: clube?.logoUrl ?? null }
    } else {
      marca = { clubName: 'ANNETEC', brandColor: null, logoUrl: null }
    }
    await sendEmail({
      template: template as unknown as EmailTemplate,
      to: { email: row.email, name: row.nome },
      data: {
        ...marca,
        senderEmail,
        nome: row.nome,
        acompanhamentoUrl: acompanhamentoUrl({ scope: escopo.scope, tenantSlug: slug }, row.id),
        ...extra,
      },
      organizationId: escopo.tenantId,
      relatedType: 'vendas_candidatura',
      relatedId: row.id,
    })
  } catch (error) {
    logger.error({ err: error, candidaturaId: row.id, template }, 'Falha ao enviar o e-mail da candidatura (operação segue)')
  }
}

// ---------------------------------------------------------------------------
// Público: iniciar, recuperar acesso, ler, salvar dados
// ---------------------------------------------------------------------------

async function indicadorPorCodigo(escopo: EscopoCandidatura, codigo: string): Promise<VendasAgenteRow> {
  const agente = await buscarAgentePorCodigo(codigo, { scope: escopo.scope, tenantId: escopo.tenantId })
  if (!agente) throw campo('codigoIndicacao', 'Código de indicação não encontrado')
  return agente
}

async function existeRecebidaComEmail(escopo: EscopoCandidatura, email: string, ignorarId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: vendasCandidaturas.id })
    .from(vendasCandidaturas)
    .where(
      and(
        whereEscopoCandidatura(escopo),
        eq(vendasCandidaturas.email, email),
        eq(vendasCandidaturas.status, 'recebida'),
        ignorarId ? ne(vendasCandidaturas.id, ignorarId) : undefined,
      ),
    )
    .limit(1)
  return rows.length > 0
}

/** Resposta do honeypot: igual à de sucesso, sem gravar nada. */
export function respostaFalsaDeCandidatura(escopo: Pick<EscopoCandidatura, 'scope' | 'tenantSlug'>): IniciarCandidaturaResult {
  const id = randomUUID()
  const chave = randomBytes(16).toString('hex')
  return { id, chave, acompanhamentoPath: acompanhamentoPath(escopo, id, chave) }
}

export async function iniciarCandidatura(
  escopo: EscopoCandidatura,
  input: IniciarCandidaturaInput,
  meta: MetaRequisicao,
): Promise<IniciarCandidaturaResult> {
  if (input.website) return respostaFalsaDeCandidatura(escopo)

  const email = input.email.trim().toLowerCase()
  if (await existeRecebidaComEmail(escopo, email)) throw jaExiste(MSG_EMAIL_EM_ANALISE)

  // Código de indicação só vale para vendedor em equipe; nas demais atuações é ignorado.
  const indicador = input.codigoIndicacao && input.atuacao === 'vendedor_equipe' ? await indicadorPorCodigo(escopo, input.codigoIndicacao) : null

  const [row] = await db
    .insert(vendasCandidaturas)
    .values({
      scope: escopo.scope,
      tenantId: escopo.tenantId,
      status: 'rascunho',
      tipoPessoa: input.tipoPessoa,
      atuacao: input.atuacao,
      nome: input.nome.trim(),
      email,
      telefone: input.telefone,
      cpf: input.cpf,
      cnpj: input.tipoPessoa === 'pj' ? (input.cnpj ?? null) : null,
      codigoIndicacao: indicador ? indicador.codigoIndicacao : null,
      indicadoPorAgenteId: indicador?.id ?? null,
      origemIp: meta.ip,
      origemUserAgent: meta.userAgent ? meta.userAgent.slice(0, 300) : null,
    })
    .returning()
  if (!row) throw new Error('Falha ao criar a candidatura')
  return { id: row.id, chave: candidaturaAccessKey(row.id), acompanhamentoPath: acompanhamentoPath(escopo, row.id) }
}

/** Reenvia o link por e-mail se houver rascunho/candidatura em análise; quem chama responde sempre igual. */
export async function recuperarAcessoCandidatura(escopo: EscopoCandidatura, emailBruto: string): Promise<void> {
  const email = emailBruto.trim().toLowerCase()
  const [row] = await db
    .select()
    .from(vendasCandidaturas)
    .where(
      and(
        whereEscopoCandidatura(escopo),
        eq(vendasCandidaturas.email, email),
        inArray(vendasCandidaturas.status, ['rascunho', 'recebida']),
      ),
    )
    .orderBy(desc(vendasCandidaturas.createdAt))
    .limit(1)
  if (!row) return
  // Sem await: o tempo da resposta não pode revelar se o e-mail existe.
  void enviarEmailCandidatura(escopo, 'vendas_candidatura_recebida', row, { variante: 'acesso' }).catch(error => {
    logger.error({ err: error, candidaturaId: row.id }, 'Falha ao enviar o link de recuperação da candidatura')
  })
}

export async function obterCandidaturaPublica(escopo: EscopoCandidatura, id: string): Promise<CandidaturaPublica> {
  return carregarPublica(escopo, await acharCandidatura(escopo, id))
}

function exigirRascunho(row: CandidaturaRow) {
  if (row.status !== 'rascunho') throw AppError.conflict('Esta candidatura já foi enviada e não pode mais ser alterada.')
}

export async function salvarDadosCandidatura(
  escopo: EscopoCandidatura,
  id: string,
  input: {
    atuacao: CandidaturaAtuacao
    codigoIndicacao?: string | null
    dataNascimento?: string | null
    endereco: CandidaturaEndereco
    razaoSocial?: string | null
    nomeFantasia?: string | null
    experiencia?: string | null
    regiaoAtuacao?: string | null
    comoConheceu?: string | null
  },
): Promise<CandidaturaPublica> {
  const row = await acharCandidatura(escopo, id)
  exigirRascunho(row)

  if (input.atuacao === 'corretora' && row.tipoPessoa !== 'pj') throw campo('atuacao', 'Corretora parceira exige pessoa jurídica')
  if (row.tipoPessoa === 'pj') {
    if (!input.razaoSocial) throw campo('razaoSocial', 'Informe a razão social')
    if (!input.nomeFantasia) throw campo('nomeFantasia', 'Informe o nome fantasia')
  }

  let codigoIndicacao = row.codigoIndicacao
  let indicadoPorAgenteId = row.indicadoPorAgenteId
  if (input.atuacao !== 'vendedor_equipe') {
    codigoIndicacao = null
    indicadoPorAgenteId = null
  } else if (input.codigoIndicacao) {
    const indicador = await indicadorPorCodigo(escopo, input.codigoIndicacao)
    codigoIndicacao = indicador.codigoIndicacao
    indicadoPorAgenteId = indicador.id
  }
  if (input.atuacao === 'vendedor_equipe' && !codigoIndicacao) {
    throw campo('codigoIndicacao', 'Informe o código de quem vai indicar você')
  }

  const dados = Object.fromEntries(
    Object.entries({ experiencia: input.experiencia, regiaoAtuacao: input.regiaoAtuacao, comoConheceu: input.comoConheceu }).filter(
      ([, valor]) => valor !== undefined && valor !== null && valor !== '',
    ),
  )

  const [atualizada] = await db
    .update(vendasCandidaturas)
    .set({
      atuacao: input.atuacao,
      codigoIndicacao,
      indicadoPorAgenteId,
      dataNascimento: input.dataNascimento ?? null,
      endereco: input.endereco,
      razaoSocial: row.tipoPessoa === 'pj' ? (input.razaoSocial ?? null) : null,
      nomeFantasia: row.tipoPessoa === 'pj' ? (input.nomeFantasia ?? null) : null,
      dados,
      updatedAt: new Date(),
    })
    .where(and(eq(vendasCandidaturas.id, id), whereEscopoCandidatura(escopo), eq(vendasCandidaturas.status, 'rascunho')))
    .returning()
  if (!atualizada) throw AppError.conflict('Esta candidatura já foi enviada e não pode mais ser alterada.')
  return carregarPublica(escopo, atualizada)
}

// ---------------------------------------------------------------------------
// Público: documentos
// ---------------------------------------------------------------------------

export async function uploadDocumentoCandidatura(
  escopo: EscopoCandidatura,
  id: string,
  file: File,
  fields: UploadCandidaturaDocumentoFields,
): Promise<CandidaturaPublica> {
  const row = await acharCandidatura(escopo, id)
  exigirRascunho(row)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const check = checkUpload('kyb_document', bytes)
  if (!check.ok) {
    if (check.reason === 'too_large') throw campo('file', check.message, 413)
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, check.message, { issues: [{ path: 'file', message: check.message }] })
  }

  const ativos = await documentosAtivos(id)
  // Mesmo tipo (exceto "outro") será substituído: não conta para o limite.
  const substituidos = fields.kind === 'outro' ? [] : ativos.filter(a => a.doc.kind === fields.kind)
  if (ativos.length - substituidos.length >= CANDIDATURA_MAX_DOCUMENTOS) {
    throw AppError.businessRule(`Limite de ${CANDIDATURA_MAX_DOCUMENTOS} documentos por candidatura atingido: remova algum antes.`)
  }

  const stored = await storeFile({
    bytes,
    fileName: sanitizeFileName(file.name, check.type.ext, CANDIDATURA_DOCUMENTO_KIND_LABELS[fields.kind]),
    mimeType: check.type.mime,
    ext: check.type.ext,
    purpose: 'candidatura_document',
    visibility: 'private',
    ownerType: 'candidatura',
    ownerId: id,
    uploadedBy: 'applicant',
    keyPrefix: `candidaturas/${id}/`,
    organizationId: escopo.tenantId,
  })

  let novo: typeof vendasCandidaturaDocumentos.$inferSelect | undefined
  try {
    ;[novo] = await db.insert(vendasCandidaturaDocumentos).values({ candidaturaId: id, kind: fields.kind, fileId: stored.id }).returning()
    if (!novo) throw new Error('Falha ao registrar o documento')
  } catch (error) {
    try {
      await discardFile(stored)
    } catch (descarte) {
      logger.error({ err: descarte, fileId: stored.id }, 'Falha ao descartar o arquivo órfão do documento da candidatura')
    }
    throw error
  }
  // Mesmo tipo já enviado → o anterior vira `replaced` e o arquivo antigo é descartado. "Outro" aceita vários.
  if (fields.kind !== 'outro') {
    await db
      .update(vendasCandidaturaDocumentos)
      .set({ status: 'replaced', replacedAt: new Date() })
      .where(
        and(
          eq(vendasCandidaturaDocumentos.candidaturaId, id),
          eq(vendasCandidaturaDocumentos.kind, fields.kind),
          eq(vendasCandidaturaDocumentos.status, 'uploaded'),
          ne(vendasCandidaturaDocumentos.id, novo.id),
        ),
      )
    for (const antigo of substituidos) {
      try {
        await discardFile(antigo.file)
      } catch (error) {
        logger.error({ err: error, fileId: antigo.file.id }, 'Falha ao descartar o arquivo substituído (operação segue)')
      }
    }
  }
  await db.update(vendasCandidaturas).set({ updatedAt: new Date() }).where(eq(vendasCandidaturas.id, id))
  return carregarPublica(escopo, row)
}

export async function removerDocumentoCandidatura(escopo: EscopoCandidatura, id: string, docId: string): Promise<CandidaturaPublica> {
  const row = await acharCandidatura(escopo, id)
  exigirRascunho(row)
  const [doc] = await db
    .select()
    .from(vendasCandidaturaDocumentos)
    .where(and(eq(vendasCandidaturaDocumentos.id, docId), eq(vendasCandidaturaDocumentos.candidaturaId, id)))
    .limit(1)
  if (!doc) throw AppError.notFound('Documento')
  const arquivo = await findFile(doc.fileId)
  await db.delete(vendasCandidaturaDocumentos).where(eq(vendasCandidaturaDocumentos.id, doc.id))
  if (arquivo) await discardFile(arquivo)
  return carregarPublica(escopo, row)
}

/** Arquivo do documento (candidato pela chave ou gestão do escopo). */
export async function arquivoDoDocumento(escopo: EscopoCandidatura, id: string, docId: string, opcoes: { incluirRascunho?: boolean } = {}): Promise<PlatformFileRow> {
  const row = await acharCandidatura(escopo, id)
  if (row.status === 'rascunho' && opcoes.incluirRascunho === false) throw AppError.notFound('Candidatura')
  const [doc] = await db
    .select()
    .from(vendasCandidaturaDocumentos)
    .where(and(eq(vendasCandidaturaDocumentos.id, docId), eq(vendasCandidaturaDocumentos.candidaturaId, id)))
    .limit(1)
  const arquivo = doc ? await findFile(doc.fileId) : null
  if (!doc || !arquivo || arquivo.deletedAt) throw AppError.notFound('Documento')
  return arquivo
}

// ---------------------------------------------------------------------------
// Público: enviar
// ---------------------------------------------------------------------------

export async function enviarCandidatura(
  escopo: EscopoCandidatura,
  id: string,
  input: EnviarCandidaturaInput,
  meta: MetaRequisicao,
  agora: Date = new Date(),
): Promise<CandidaturaPublica> {
  const row = await acharCandidatura(escopo, id)
  exigirRascunho(row)

  const documentos = await documentosAtivos(id)
  const faltas = pendenciasDe(row, documentos)
  if (faltas.length > 0) {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, `Faltam informações para enviar: ${faltas.join('; ')}.`, {
      issues: faltas.map(message => ({ path: 'pendencias', message })),
    })
  }
  if (normalizar(input.nomeAssinatura) !== normalizar(row.nome)) {
    throw campo('nomeAssinatura', 'A assinatura deve ser o seu nome completo, igual ao informado na candidatura')
  }
  if (await existeRecebidaComEmail(escopo, row.email, row.id)) throw jaExiste(MSG_EMAIL_EM_ANALISE)

  let enviada: CandidaturaRow | undefined
  try {
    ;[enviada] = await db
      .update(vendasCandidaturas)
      .set({
        status: 'recebida',
        enviadaEm: agora,
        aceite: {
          termosVersao: CANDIDATURA_TERMOS_VERSAO,
          termosHash: createHash('sha256').update(CANDIDATURA_TERMOS.join('\n')).digest('hex'),
          nomeAssinatura: input.nomeAssinatura.trim(),
          aceitoEm: agora.toISOString(),
          ip: meta.ip,
          userAgent: meta.userAgent ? meta.userAgent.slice(0, 300) : null,
        },
        updatedAt: agora,
      })
      .where(and(eq(vendasCandidaturas.id, id), whereEscopoCandidatura(escopo), eq(vendasCandidaturas.status, 'rascunho')))
      .returning()
  } catch (error) {
    if (violouUnicidade(error)) throw jaExiste(MSG_EMAIL_EM_ANALISE)
    throw error
  }
  if (!enviada) throw AppError.conflict('Esta candidatura já foi enviada.')

  // Depois do commit; nada daqui derruba a requisição.
  const tenant = escopo.scope === 'tenant' && escopo.tenantId ? { id: escopo.tenantId, slug: escopo.tenantSlug ?? '', name: '' } : null
  await notify(
    vendasCandidaturaRecebidaNotification({
      tenant,
      candidaturaId: enviada.id,
      nome: enviada.nome,
      detalhe: `${CANDIDATURA_ATUACAO_LABELS[enviada.atuacao]} · ${CANDIDATURA_TIPO_PESSOA_LABELS[enviada.tipoPessoa]}`,
    }),
  )
  await enviarEmailCandidatura(escopo, 'vendas_candidatura_recebida', enviada, { variante: 'recebida' })
  return carregarPublica(escopo, enviada)
}

/** `GET /codigo/:codigo`: quem é o dono do código no escopo (404 se não há agente ativo). */
export async function consultarCodigoIndicacao(escopo: EscopoCandidatura, codigo: string): Promise<{ nome: string; papel: PapelComercial }> {
  const agente = await buscarAgentePorCodigo(codigo, { scope: escopo.scope, tenantId: escopo.tenantId })
  if (!agente) throw new AppError(ERROR_CODES.VENDAS_CODIGO_INVALIDO, 'Código de indicação não encontrado')
  return { nome: agente.nome, papel: agente.papel }
}

// ---------------------------------------------------------------------------
// Gestão (master do escopo)
// ---------------------------------------------------------------------------

const escopoDoCtx = (ctx: VendasCtx): EscopoCandidatura => ({ scope: ctx.scope, tenantId: ctx.tenantId, tenantSlug: ctx.tenantSlug })

/** Candidatura do escopo fora de rascunho (rascunho não aparece para o admin). */
async function acharDecidivel(ctx: VendasCtx, id: string): Promise<CandidaturaRow> {
  const row = await acharCandidatura(escopoDoCtx(ctx), id)
  if (row.status === 'rascunho') throw AppError.notFound('Candidatura')
  return row
}

export async function contarPendentes(ctx: VendasCtx): Promise<number> {
  const rows = await db
    .select({ id: vendasCandidaturas.id })
    .from(vendasCandidaturas)
    .where(and(whereEscopo(vendasCandidaturas, ctx), eq(vendasCandidaturas.status, 'recebida')))
  return rows.length
}

export async function listarCandidaturas(
  ctx: VendasCtx,
  filtro: ListarCandidaturasQuery,
): Promise<{ itens: CandidaturaResumo[]; pendentes: number }> {
  const status: CandidaturaStatus[] = filtro.status === 'todas' ? ['recebida', 'aprovada', 'recusada'] : [filtro.status]
  const rows = await db
    .select()
    .from(vendasCandidaturas)
    .where(and(whereEscopo(vendasCandidaturas, ctx), inArray(vendasCandidaturas.status, status)))
    .orderBy(desc(vendasCandidaturas.enviadaEm), desc(vendasCandidaturas.createdAt))

  const indicadores = new Map<string, CandidaturaIndicador | null>()
  const ids = [...new Set(rows.map(r => r.indicadoPorAgenteId).filter((v): v is string => Boolean(v)))]
  if (ids.length > 0) {
    const agentes = await db.select().from(vendasAgentes).where(inArray(vendasAgentes.id, ids))
    for (const a of agentes) indicadores.set(a.id, { nome: a.nome, papel: a.papel })
  }

  const itens: CandidaturaResumo[] = rows.map(row => ({
    id: row.id,
    status: row.status,
    tipoPessoa: row.tipoPessoa,
    atuacao: row.atuacao,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    cidade: row.endereco?.cidade ?? null,
    uf: row.endereco?.uf ?? null,
    indicadoPor: row.indicadoPorAgenteId ? (indicadores.get(row.indicadoPorAgenteId) ?? null) : null,
    enviadaEm: iso(row.enviadaEm),
    decididaEm: iso(row.decididaEm),
    createdAt: row.createdAt.toISOString(),
  }))
  return { itens, pendentes: await contarPendentes(ctx) }
}

export async function detalharCandidatura(ctx: VendasCtx, id: string): Promise<CandidaturaDetalhe> {
  return carregarDetalhe(escopoDoCtx(ctx), await acharDecidivel(ctx, id))
}

export async function arquivoDoDocumentoDaGestao(ctx: VendasCtx, id: string, docId: string): Promise<PlatformFileRow> {
  await acharDecidivel(ctx, id)
  return arquivoDoDocumento(escopoDoCtx(ctx), id, docId)
}

type ConviteAprovacao = Awaited<ReturnType<typeof criarAgente>>['convite']

export interface CandidaturaAprovada {
  candidatura: CandidaturaDetalhe
  /** Mesmo formato que `POST /rede/agentes` devolve. */
  convite: ConviteAprovacao
  agenteId: string
  corretoraId: string | null
}

export async function aprovarCandidatura(ctx: VendasCtx, id: string, input: AprovarCandidaturaInput): Promise<CandidaturaAprovada> {
  const escopo = escopoDoCtx(ctx)
  const inicial = await acharDecidivel(ctx, id)
  const indicador = await resolverIndicador(inicial.indicadoPorAgenteId)

  // (1) Trava: só uma aprovação/recusa vence.
  const [row] = await db
    .update(vendasCandidaturas)
    .set({ status: 'aprovada', decididaEm: new Date(), decididaPorUserId: ctx.userId, updatedAt: new Date() })
    .where(and(eq(vendasCandidaturas.id, id), whereEscopo(vendasCandidaturas, ctx), eq(vendasCandidaturas.status, 'recebida')))
    .returning()
  if (!row) throw jaExiste('Esta candidatura já foi decidida.')

  // (2) Criação. Papel e vínculo: exatamente o que o master informou (ausente = null);
  // o vínculo sugerido só pré-preenche a tela. Em erro, desfaz tudo e relança.
  let corretoraCriadaId: string | null = null
  let agenteId: string
  let convite: ConviteAprovacao
  try {
    const papel = input.papel ?? papelDaAtuacao(row.atuacao)
    const observacoes = [`Candidatura ${row.id}`, input.observacoes].filter(Boolean).join(' — ')
    const cadastro = {
      nome: row.nome,
      email: row.email,
      cpf: row.cpf,
      telefone: row.telefone,
      dataNascimento: row.dataNascimento,
      endereco: row.endereco,
      observacoes,
      enviarConvite: input.enviarConvite,
    }

    if (row.atuacao === 'corretora') {
      const corretora = await criarCorretora(ctx, {
        nomeFantasia: row.nomeFantasia ?? row.razaoSocial ?? row.nome,
        razaoSocial: row.razaoSocial ?? row.nomeFantasia ?? row.nome,
        cnpj: row.cnpj ?? '',
        email: row.email,
        telefone: row.telefone,
        endereco: row.endereco,
      })
      corretoraCriadaId = corretora.id
      const gerente = await criarGerenteDaCorretora(ctx, corretora.id, cadastro)
      agenteId = gerente.agente.id
      convite = gerente.convite
    } else {
      const entrada: CreateAgenteInput = {
        ...cadastro,
        papel,
        corretoraId: input.corretoraId ?? null,
        unidadeId: input.unidadeId ?? null,
        equipeId: input.equipeId ?? null,
      }
      const criado = await criarAgente(ctx, entrada)
      agenteId = criado.agente.id
      convite = criado.convite
    }
  } catch (error) {
    // Volta a "em análise" para o master corrigir e tentar de novo.
    try {
      await db
        .update(vendasCandidaturas)
        .set({ status: 'recebida', decididaEm: null, decididaPorUserId: null, updatedAt: new Date() })
        .where(and(eq(vendasCandidaturas.id, id), eq(vendasCandidaturas.status, 'aprovada')))
      if (corretoraCriadaId) await removerCorretora(ctx, corretoraCriadaId)
    } catch (reversao) {
      logger.error({ err: reversao, candidaturaId: id }, 'Falha ao reverter a aprovação da candidatura')
    }
    throw error
  }

  // (3) Liga a candidatura ao que foi criado. O agente já existe: nunca reverter nem relançar aqui.
  let final: CandidaturaRow | undefined
  try {
    ;[final] = await db
      .update(vendasCandidaturas)
      .set({ agenteId, corretoraId: corretoraCriadaId, observacoesDecisao: input.observacoes ?? null, updatedAt: new Date() })
      .where(eq(vendasCandidaturas.id, id))
      .returning()
  } catch (error) {
    logger.error({ err: error, candidaturaId: id, agenteId }, 'Agente criado, mas falhou ao gravar o vínculo na candidatura aprovada')
  }

  // (4) A auditoria é gravada pelo controller depois deste retorno.
  // (5) Resposta, fora de qualquer try de reversão.
  return {
    candidatura: await carregarDetalhe(escopo, final ?? row),
    convite,
    agenteId,
    corretoraId: corretoraCriadaId,
  }
}

export async function recusarCandidatura(ctx: VendasCtx, id: string, input: RecusarCandidaturaInput): Promise<CandidaturaDetalhe> {
  const motivo = input.motivo.trim()
  if (motivo.length < 10) throw campo('motivo', 'Explique o motivo (mínimo 10 caracteres)')
  await acharDecidivel(ctx, id)

  const [row] = await db
    .update(vendasCandidaturas)
    .set({ status: 'recusada', motivoRecusa: motivo, decididaEm: new Date(), decididaPorUserId: ctx.userId, updatedAt: new Date() })
    .where(and(eq(vendasCandidaturas.id, id), whereEscopo(vendasCandidaturas, ctx), eq(vendasCandidaturas.status, 'recebida')))
    .returning()
  if (!row) throw jaExiste('Esta candidatura já foi decidida.')

  await enviarEmailCandidatura(escopoDoCtx(ctx), 'vendas_candidatura_recusada', row, { motivo })
  return carregarDetalhe(escopoDoCtx(ctx), row)
}

