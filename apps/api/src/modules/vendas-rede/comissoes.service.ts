import type {
  EscopoVendas,
  ListComissoesQuery,
  PagarComissoesInput,
  StatusComissao,
  TotaisComissao,
  VendasComissao,
  VendasComissoesResposta,
} from '@annetec/contracts'
import { and, desc, eq, inArray, isNull, ne, or, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  auditLogs,
  clubCharges,
  clubSubscriptions,
  platformCharges,
  platformOnboardingProposals,
  vendasAgentes,
  vendasComissoes,
  vendasCorretoras,
  vendasEquipes,
  vendasLeadEventos,
  vendasLeads,
  type VendasAgenteRow,
  type VendasComissaoRow,
  type VendasLeadRow,
} from '@/db/schema'
import { AppError } from '@/http/errors'
import { logger } from '@/lib/logger'
import { commissionParts } from '@/modules/platform-sales/rules'
import { compradorEhOAgenteNoBanco } from './atribuicao'
import { getOrCreateConfig } from './config.service'
import { whereEscopo, type VendasCtx } from './context'
import { whereAgentesVisiveis } from './presenca.service'
import {
  arredondarCentavos,
  cadeiaDoAgente,
  comissoesDaCobranca,
  estornarComissao,
  mesReferenciaSaoPaulo,
  MOTIVO_AUTO_COMPRA,
  type Atribuicao,
  type ConfigComissao,
  type DadosDePessoa,
  type LinhaComissao,
  type OrigemCobranca,
  type OverridesComissao,
  type TipoComissao,
} from './rules'

/**
 * Comissões da Rede Comercial (`docs/rede-comercial.md` 4.2).
 *
 *  - geração: `registrarComissoesDaCobrancaPaga`, chamada DENTRO da transação que
 *    marca a cobrança como paga (platform: `platform-billing/events.service`;
 *    club: `club-billing/events.service`), num savepoint (`safely`) — falha aqui
 *    nunca desfaz o pagamento. Idempotente pelo índice único da tabela;
 *  - estorno/chargeback: `estornarComissoesDaCobranca` (`a_pagar → cancelada`,
 *    `paga → a_descontar`);
 *  - leitura por papel e repasse (`pagar`) / `cancelar` pelo master.
 *
 * A atribuição (cadeia do agente) é um snapshot gravado no lead na 1ª cobrança
 * paga: mudar equipe/corretora depois não altera comissões já geradas.
 */

/** `db`, transação ou savepoint. */
export type Executor = Pick<typeof db, 'select' | 'insert' | 'update'>

// ---------------------------------------------------------------------------
// Geração e estorno
// ---------------------------------------------------------------------------

/** Cobrança paga (linha de `platform_charges` ou `club_charges`). */
export interface CobrancaPaga {
  id: string
  /** platform: `activation|monthly|adjustment`; club: `cycle|one_off`. */
  kind: string
  proposalId?: string | null
  organizationId?: string | null
  subscriptionId?: string | null
  amount: string | number
  paidAmount: string | number | null
  paidAt: Date | null
  items?: { kind: string; amount: number; appliesTo?: 'setup_fee' | 'plan_fee' }[] | null
}

interface OrigemDaVenda {
  scope: EscopoVendas
  tenantId: string | null
  agenteId: string | null
  leadId: string | null
  /** Taxa de adesão da assinatura do clube (0 no platform: vem dos itens da fatura). */
  adesaoDoClube: number
  /** Quem comprou (titular da assinatura / contato da proposta): barreira contra auto-compra. */
  comprador: DadosDePessoa
}

const avulsaDe = (origem: OrigemCobranca, kind: string) => (origem === 'platform' ? kind === 'adjustment' : kind === 'one_off')

async function localizarOrigem(tx: Executor, origem: OrigemCobranca, cobranca: CobrancaPaga): Promise<OrigemDaVenda | null> {
  if (origem === 'platform') {
    if (!cobranca.proposalId) return null
    // FOR UPDATE: serializa as faturas da MESMA proposta pagas ao mesmo tempo
    // (webhook + sincronização): sem a trava, duas transações contariam as
    // mesmas "pagas antes" e gravariam o mesmo nº de parcela.
    const [proposta] = await tx
      .select({
        vendasAgenteId: platformOnboardingProposals.vendasAgenteId,
        vendasLeadId: platformOnboardingProposals.vendasLeadId,
        sellerUserId: platformOnboardingProposals.sellerUserId,
        applicant: platformOnboardingProposals.applicant,
      })
      .from(platformOnboardingProposals)
      .where(eq(platformOnboardingProposals.id, cobranca.proposalId))
      .limit(1)
      .for('update')
    if (!proposta) return null
    let agenteId = proposta.vendasAgenteId ?? null
    // Proposta ligada a um lead da rede usa SÓ o agente novo (reatribuir pode tê-lo zerado de propósito:
    // o vendedor antigo não volta pela porta dos fundos). O vendedor legado só vale para proposta sem lead.
    if (!agenteId && proposta.sellerUserId && !proposta.vendasLeadId) {
      const [legado] = await tx
        .select({ id: vendasAgentes.id })
        .from(vendasAgentes)
        .where(and(eq(vendasAgentes.userId, proposta.sellerUserId), eq(vendasAgentes.scope, 'platform'), isNull(vendasAgentes.tenantId)))
        .limit(1)
      agenteId = legado?.id ?? null
    }
    return {
      scope: 'platform',
      tenantId: null,
      agenteId,
      leadId: proposta.vendasLeadId ?? null,
      adesaoDoClube: 0,
      comprador: { email: proposta.applicant?.email ?? null, telefone: proposta.applicant?.phone ?? null },
    }
  }

  if (!cobranca.subscriptionId) return null
  const [assinatura] = await tx
    .select({
      organizationId: clubSubscriptions.organizationId,
      vendasAgenteId: clubSubscriptions.vendasAgenteId,
      vendasLeadId: clubSubscriptions.vendasLeadId,
      enrollmentFee: clubSubscriptions.enrollmentFee,
      holderCpf: clubSubscriptions.holderCpf,
      holderEmail: clubSubscriptions.holderEmail,
      holderPhone: clubSubscriptions.holderPhone,
    })
    .from(clubSubscriptions)
    .where(eq(clubSubscriptions.id, cobranca.subscriptionId))
    .limit(1)
    .for('update')
  if (!assinatura) return null
  if (cobranca.organizationId && assinatura.organizationId !== cobranca.organizationId) return null
  return {
    scope: 'tenant',
    tenantId: assinatura.organizationId,
    agenteId: assinatura.vendasAgenteId ?? null,
    leadId: assinatura.vendasLeadId ?? null,
    adesaoDoClube: Number(assinatura.enrollmentFee ?? 0),
    comprador: { cpf: assinatura.holderCpf ?? null, email: assinatura.holderEmail ?? null, telefone: assinatura.holderPhone ?? null },
  }
}

/**
 * Nº desta mensalidade paga: a ativação da plataforma é a 1ª; nas demais conta as
 * cobranças com mensalidade da MESMA proposta/assinatura já pagas antes desta
 * (pagamento > 0; estornada não conta).
 */
async function parcelaDaCobranca(tx: Executor, origem: OrigemCobranca, cobranca: CobrancaPaga): Promise<number> {
  if (origem === 'platform' && (cobranca.kind === 'activation' || !cobranca.proposalId)) return 1
  const paidAt = cobranca.paidAt ?? new Date()
  const anteriores: { id: string; paidAt: Date | null; paidAmount: string | null }[] =
    origem === 'platform'
      ? await tx
          .select({ id: platformCharges.id, paidAt: platformCharges.paidAt, paidAmount: platformCharges.paidAmount })
          .from(platformCharges)
          .where(
            and(
              eq(platformCharges.proposalId, cobranca.proposalId!),
              inArray(platformCharges.kind, ['activation', 'monthly']),
              eq(platformCharges.status, 'paid'),
            ),
          )
      : await tx
          .select({ id: clubCharges.id, paidAt: clubCharges.paidAt, paidAmount: clubCharges.paidAmount })
          .from(clubCharges)
          .where(and(eq(clubCharges.subscriptionId, cobranca.subscriptionId!), eq(clubCharges.kind, 'cycle'), eq(clubCharges.status, 'paid')))
  const antes = anteriores.filter(outra => {
    if (outra.id === cobranca.id || !(Number(outra.paidAmount ?? 0) > 0) || !outra.paidAt) return false
    const t = outra.paidAt.getTime()
    return t < paidAt.getTime() || (t === paidAt.getTime() && outra.id < cobranca.id)
  })
  return antes.length + 1
}

/**
 * A cobrança do clube carrega a adesão? A taxa só entra na 1ª cobrança criada da assinatura
 * (`checkout.service`: `firstChargeTotal`), seja qual for o status das outras. Não se infere pelo
 * ordinal das PAGAS: se a 1ª fatura (com adesão) foi estornada, a 2ª não herda a adesão.
 * No platform a adesão vem dos itens da fatura (`appliesTo: 'setup_fee'`), sem ordinal.
 */
async function clubeContemAdesao(tx: Executor, cobranca: CobrancaPaga): Promise<boolean> {
  const todas = await tx
    .select({ id: clubCharges.id, periodStart: clubCharges.periodStart, createdAt: clubCharges.createdAt })
    .from(clubCharges)
    .where(and(eq(clubCharges.subscriptionId, cobranca.subscriptionId!), eq(clubCharges.kind, 'cycle')))
  const chave = (c: { id: string; periodStart: string | null; createdAt: Date | null }) =>
    `${c.periodStart ?? ''}|${c.createdAt ? c.createdAt.toISOString() : ''}|${c.id}`
  const primeira = [...todas].sort((a, b) => (chave(a) < chave(b) ? -1 : chave(a) > chave(b) ? 1 : 0))[0]
  return primeira?.id === cobranca.id
}

/** Partes PAGAS da cobrança: adesão e mensalidade (pago a menor reparte na proporção; multa/juros não entra). */
function partesPagas(origem: OrigemCobranca, cobranca: CobrancaPaga, adesaoDoClube: number) {
  const amount = Number(cobranca.amount)
  const paidAmount = cobranca.paidAmount === null ? null : Number(cobranca.paidAmount)
  if (origem === 'platform') {
    return commissionParts({
      kind: cobranca.kind as 'activation' | 'monthly' | 'adjustment',
      amount,
      paidAmount,
      items: (cobranca.items ?? []).map(item => ({ kind: item.kind as never, amount: Number(item.amount), appliesTo: item.appliesTo })),
    })
  }
  if (!(amount > 0)) return { setupFee: 0, monthly: 0 }
  const setup = Math.min(amount, Math.max(0, adesaoDoClube))
  const paid = paidAmount === null ? amount : Math.max(0, paidAmount)
  const fator = Math.min(1, paid / amount)
  return { setupFee: arredondarCentavos(setup * fator), monthly: arredondarCentavos(Math.max(0, amount - setup) * fator) }
}

async function auditarSistema(
  tx: Executor,
  rows: { organizationId: string | null; action: string; resourceId: string; metadata: Record<string, unknown> }[],
) {
  if (rows.length === 0) return
  await tx.insert(auditLogs).values(
    rows.map(row => ({
      organizationId: row.organizationId,
      actorId: null,
      actorScope: null,
      action: row.action,
      resource: 'vendas_comissao',
      resourceId: row.resourceId,
      metadata: row.metadata,
    })),
  )
}

/** Lead que acaba de ter a 1ª cobrança paga vira `ganho` (se ainda não for). */
async function marcarLeadGanho(tx: Executor, lead: VendasLeadRow, origem: OrigemCobranca, cobrancaId: string, quando: Date): Promise<void> {
  if (lead.etapa === 'ganho') return
  const [atualizado] = await tx
    .update(vendasLeads)
    .set({ etapa: 'ganho', ganhoEm: quando, perdidoEm: null, motivoPerda: null, updatedAt: quando })
    .where(and(eq(vendasLeads.id, lead.id), ne(vendasLeads.etapa, 'ganho')))
    .returning({ id: vendasLeads.id })
  if (!atualizado) return
  await tx.insert(vendasLeadEventos).values({
    leadId: lead.id,
    tipo: 'conversao',
    texto: 'Primeiro pagamento confirmado',
    dados: { de: lead.etapa, para: 'ganho', origem, cobrancaId },
    em: quando,
  })
}

/**
 * Snapshot do lead se existir E for deste agente; senão a cadeia ATUAL do agente (e grava no lead).
 * Snapshot de outro agente é de uma atribuição antiga (o lead foi reatribuído): descarta e recalcula.
 */
async function atribuicaoDaVenda(tx: Executor, agente: VendasAgenteRow, lead: VendasLeadRow | null, venda: OrigemDaVenda): Promise<Atribuicao> {
  if (lead?.atribuicao && lead.atribuicao.agenteId === agente.id) return lead.atribuicao
  const [equipe] = agente.equipeId
    ? await tx
        .select({ id: vendasEquipes.id, supervisorAgenteId: vendasEquipes.supervisorAgenteId })
        .from(vendasEquipes)
        .where(eq(vendasEquipes.id, agente.equipeId))
        .limit(1)
    : []
  const [corretora] = agente.corretoraId
    ? await tx
        .select({ id: vendasCorretoras.id, gerenteAgenteId: vendasCorretoras.gerenteAgenteId })
        .from(vendasCorretoras)
        .where(eq(vendasCorretoras.id, agente.corretoraId))
        .limit(1)
    : []
  const atribuicao = cadeiaDoAgente(agente, equipe ?? null, corretora ?? null)
  if (lead) {
    await tx
      .update(vendasLeads)
      .set({ atribuicao, updatedAt: new Date() })
      .where(and(eq(vendasLeads.id, lead.id), whereEscopo(vendasLeads, venda)))
  }
  return atribuicao
}

/** Auto-compra: sem comissão; fica registrado na auditoria e na linha do tempo do lead. */
async function bloquearAutoCompra(
  tx: Executor,
  dados: {
    agente: VendasAgenteRow
    lead: VendasLeadRow | null
    origem: OrigemCobranca
    cobranca: CobrancaPaga
    venda: OrigemDaVenda
    quando: Date
  },
): Promise<void> {
  const { agente, lead, origem, cobranca, venda, quando } = dados
  await auditarSistema(tx, [
    {
      organizationId: venda.tenantId ?? cobranca.organizationId ?? null,
      action: 'vendas.comissao_bloqueada',
      resourceId: cobranca.id,
      metadata: { origem, cobrancaId: cobranca.id, agenteId: agente.id, motivoNaoComissionavel: MOTIVO_AUTO_COMPRA },
    },
  ])
  if (!lead) return
  await tx.insert(vendasLeadEventos).values({
    leadId: lead.id,
    tipo: 'sistema',
    texto: 'Comissão não gerada: o comprador é o próprio agente (auto-compra).',
    dados: { motivoNaoComissionavel: MOTIVO_AUTO_COMPRA, cobrancaId: cobranca.id, agenteId: agente.id },
    em: quando,
  })
}

/**
 * Cobrança que ACABOU de virar paga. Sem agente atribuído ou cobrança avulsa:
 * nenhuma comissão. A 1ª cobrança paga de uma conversão marca o lead como `ganho`.
 * Devolve quantos lançamentos entraram (idempotente: repetir devolve 0).
 */
export async function registrarComissoesDaCobrancaPaga(input: {
  origem: OrigemCobranca
  cobranca: CobrancaPaga
  agora?: Date
  tx?: Executor
}): Promise<number> {
  const { origem, cobranca } = input
  const tx = input.tx ?? db
  const agora = input.agora ?? new Date()
  if (avulsaDe(origem, cobranca.kind)) return 0

  const venda = await localizarOrigem(tx, origem, cobranca)
  if (!venda) return 0

  let lead: VendasLeadRow | null = null
  if (venda.leadId) {
    const [row] = await tx
      .select()
      .from(vendasLeads)
      .where(and(eq(vendasLeads.id, venda.leadId), whereEscopo(vendasLeads, venda)))
      .limit(1)
    lead = row ?? null
  }
  const pagoEm = cobranca.paidAt ?? agora
  if (lead) await marcarLeadGanho(tx, lead, origem, cobranca.id, pagoEm)

  if (!venda.agenteId) return 0
  const [agente] = await tx
    .select()
    .from(vendasAgentes)
    .where(and(eq(vendasAgentes.id, venda.agenteId), whereEscopo(vendasAgentes, venda)))
    .limit(1)
  if (!agente) return 0

  // Última barreira contra auto-compra: o comprador é o próprio agente (a atribuição já é barrada na entrada).
  if (await compradorEhOAgenteNoBanco(agente, venda.comprador, tx)) {
    await bloquearAutoCompra(tx, { agente, lead, origem, cobranca, venda, quando: pagoEm })
    return 0
  }

  const atribuicao = await atribuicaoDaVenda(tx, agente, lead, venda)
  // Tudo pelo `tx`: o `db` global aqui pediria uma 2ª conexão ao pool com esta transação ainda aberta.
  const configRow = await getOrCreateConfig(venda.scope, venda.tenantId, tx)
  const config: ConfigComissao = {
    escalaMensal: configRow.escalaMensal,
    percentualAdesao: Number(configRow.percentualAdesao),
    overrides: configRow.overrides,
    balcaoPercentual: configRow.balcaoPercentual ?? null,
  }
  let overridesCorretora: OverridesComissao | null = null
  if (atribuicao.corretoraId) {
    const [corretora] = await tx
      .select({ comissaoOverrides: vendasCorretoras.comissaoOverrides })
      .from(vendasCorretoras)
      .where(eq(vendasCorretoras.id, atribuicao.corretoraId))
      .limit(1)
    overridesCorretora = corretora?.comissaoOverrides ?? null
  }

  const parcela = await parcelaDaCobranca(tx, origem, cobranca)
  const adesaoNaCobranca = origem === 'club' && (await clubeContemAdesao(tx, cobranca)) ? venda.adesaoDoClube : 0
  const partes = partesPagas(origem, cobranca, adesaoNaCobranca)
  const linhas: { tipo: TipoComissao; parcela: number; linha: LinhaComissao }[] = []
  const tipos: [TipoComissao, number, number][] = [
    ['adesao', partes.setupFee, 1],
    ['mensalidade', partes.monthly, parcela],
  ]
  for (const [tipo, valorPago, nParcela] of tipos) {
    if (!(valorPago > 0)) continue
    const resultado = comissoesDaCobranca({
      config,
      overridesCorretora,
      atribuicao,
      agora: pagoEm,
      cobranca: { id: cobranca.id, origem, tipo, parcela: nParcela, valorPago, kind: cobranca.kind, avulsa: false },
    })
    for (const linha of resultado.linhas) linhas.push({ tipo, parcela: nParcela, linha })
  }
  if (linhas.length === 0) return 0

  const inseridas = await tx
    .insert(vendasComissoes)
    .values(
      linhas.map(({ tipo, parcela: nParcela, linha }) => ({
        scope: venda.scope,
        tenantId: venda.tenantId,
        leadId: lead?.id ?? venda.leadId,
        beneficiarioAgenteId: linha.beneficiarioAgenteId,
        beneficiarioCorretoraId: linha.beneficiarioCorretoraId,
        parte: linha.parte,
        tipo,
        parcela: nParcela,
        cobrancaOrigem: origem,
        cobrancaRef: cobranca.id,
        base: String(linha.base),
        percentual: String(linha.percentual),
        valor: String(linha.valor),
        status: 'a_pagar' as const,
        mesReferencia: linha.mesReferencia,
      })),
    )
    .onConflictDoNothing()
    .returning()

  await auditarSistema(
    tx,
    inseridas.map(row => ({
      organizationId: venda.tenantId ?? cobranca.organizationId ?? null,
      action: 'vendas.comissao_criada',
      resourceId: row.id,
      metadata: {
        origem,
        cobrancaId: cobranca.id,
        parte: row.parte,
        tipo: row.tipo,
        parcela: row.parcela,
        base: Number(row.base),
        percentual: Number(row.percentual),
        valor: Number(row.valor),
      },
    })),
  )
  return inseridas.length
}

/**
 * Cobrança estornada (ou com chargeback): `a_pagar|prevista → cancelada`,
 * `paga → a_descontar`. Devolve quantas linhas mudaram.
 */
export async function estornarComissoesDaCobranca(
  origem: OrigemCobranca,
  cobrancaId: string,
  motivo: string,
  agora: Date = new Date(),
  tx: Executor = db,
): Promise<number> {
  const linhas = await tx
    .select()
    .from(vendasComissoes)
    .where(and(eq(vendasComissoes.cobrancaOrigem, origem), eq(vendasComissoes.cobrancaRef, cobrancaId)))
  let mudaram = 0
  const auditorias: Parameters<typeof auditarSistema>[1] = []
  for (const linha of linhas) {
    const proximo = estornarComissao(linha.status)
    if (!proximo) continue
    const [atualizada] = await tx
      .update(vendasComissoes)
      .set({ status: proximo, observacao: motivo.slice(0, 500), updatedAt: agora })
      .where(and(eq(vendasComissoes.id, linha.id), eq(vendasComissoes.status, linha.status)))
      .returning({ id: vendasComissoes.id })
    if (!atualizada) continue
    mudaram += 1
    auditorias.push({
      organizationId: linha.tenantId ?? null,
      action: proximo === 'cancelada' ? 'vendas.comissao_cancelada' : 'vendas.comissao_a_descontar',
      resourceId: linha.id,
      metadata: { origem, cobrancaId, antes: linha.status, depois: proximo, motivo, valor: Number(linha.valor) },
    })
  }
  await auditarSistema(tx, auditorias)
  return mudaram
}

export { safely } from './savepoint'

// ---------------------------------------------------------------------------
// Leitura por papel
// ---------------------------------------------------------------------------

/** Ids dos agentes que o usuário enxerga (master: `null` = todos). */
export async function idsAgentesVisiveis(ctx: VendasCtx): Promise<string[] | null> {
  if (ctx.visibilidade.todos) return null
  const rows = await db.select({ id: vendasAgentes.id }).from(vendasAgentes).where(whereAgentesVisiveis(ctx))
  const ids = new Set(rows.map(row => row.id))
  if (ctx.visibilidade.agenteId) ids.add(ctx.visibilidade.agenteId)
  return [...ids]
}

/** `where` das comissões visíveis (escopo + beneficiários da hierarquia; gerente também vê a parte da corretora). */
export function whereComissoesVisiveis(ctx: VendasCtx, ids: string[] | null): SQL {
  const escopo = whereEscopo(vendasComissoes, ctx)
  if (ids === null) return escopo
  const partes: SQL[] = []
  if (ids.length > 0) partes.push(inArray(vendasComissoes.beneficiarioAgenteId, ids))
  if (ctx.visibilidade.corretoraId) partes.push(eq(vendasComissoes.beneficiarioCorretoraId, ctx.visibilidade.corretoraId))
  if (partes.length === 0) return and(escopo, eq(vendasComissoes.id, '00000000-0000-0000-0000-000000000000'))!
  return and(escopo, or(...partes))!
}

const ZERO: TotaisComissao = { prevista: 0, a_pagar: 0, paga: 0, cancelada: 0, a_descontar: 0 }

export function somarPorStatus(rows: { status: StatusComissao; valor: string | number }[]): TotaisComissao {
  const totais = { ...ZERO }
  for (const row of rows) totais[row.status] = arredondarCentavos(totais[row.status] + Number(row.valor))
  return totais
}

type LinhaJoin = {
  c: VendasComissaoRow
  leadNome: string | null
  agenteNome: string | null
  corretoraNome: string | null
}

function selecionar(where: SQL) {
  return db
    .select({
      c: vendasComissoes,
      leadNome: vendasLeads.nome,
      agenteNome: vendasAgentes.nome,
      corretoraNome: vendasCorretoras.nomeFantasia,
    })
    .from(vendasComissoes)
    .leftJoin(vendasLeads, eq(vendasLeads.id, vendasComissoes.leadId))
    .leftJoin(vendasAgentes, eq(vendasAgentes.id, vendasComissoes.beneficiarioAgenteId))
    .leftJoin(vendasCorretoras, eq(vendasCorretoras.id, vendasComissoes.beneficiarioCorretoraId))
    .where(where)
    .orderBy(desc(vendasComissoes.createdAt))
}

export function toVendasComissao(row: LinhaJoin): VendasComissao {
  const c = row.c
  return {
    id: c.id,
    scope: c.scope,
    tenantId: c.tenantId ?? null,
    leadId: c.leadId ?? null,
    leadNome: row.leadNome ?? null,
    beneficiarioAgenteId: c.beneficiarioAgenteId ?? null,
    beneficiarioCorretoraId: c.beneficiarioCorretoraId ?? null,
    beneficiarioNome: row.agenteNome ?? row.corretoraNome ?? null,
    parte: c.parte,
    tipo: c.tipo,
    parcela: c.parcela,
    cobrancaOrigem: c.cobrancaOrigem,
    cobrancaRef: c.cobrancaRef,
    base: Number(c.base),
    percentual: Number(c.percentual),
    valor: Number(c.valor),
    status: c.status,
    mesReferencia: c.mesReferencia,
    pagoEm: c.pagoEm ? c.pagoEm.toISOString() : null,
    pagamentoRef: c.pagamentoRef ?? null,
    observacao: c.observacao ?? null,
    createdAt: c.createdAt.toISOString(),
  }
}

/** Condição base da visão do usuário + filtros de mês e agente (sem status). */
async function condicaoDaConsulta(ctx: VendasCtx, filtros: { mes?: string; agente?: string }): Promise<SQL | null> {
  const ids = await idsAgentesVisiveis(ctx)
  const condicoes: SQL[] = [whereComissoesVisiveis(ctx, ids)]
  if (filtros.mes) condicoes.push(eq(vendasComissoes.mesReferencia, filtros.mes))
  if (filtros.agente) {
    if (ids !== null && !ids.includes(filtros.agente)) return null
    condicoes.push(eq(vendasComissoes.beneficiarioAgenteId, filtros.agente))
  }
  return and(...condicoes)!
}

/**
 * `GET /comissoes`: vendedor/balcão as suas; supervisor/gerente as suas + dos
 * visíveis; master tudo do escopo. `totais` somam por status respeitando mês e
 * agente (mas NÃO o filtro de status, para a tela mostrar todos os cartões).
 */
export async function listar(ctx: VendasCtx, query: ListComissoesQuery): Promise<VendasComissoesResposta> {
  const where = await condicaoDaConsulta(ctx, query)
  if (!where) return { items: [], totais: { ...ZERO }, total: 0, page: query.page, perPage: query.perPage }
  const rows = (await selecionar(where)) as LinhaJoin[]
  const totais = somarPorStatus(rows.map(row => ({ status: row.c.status, valor: row.c.valor })))
  const filtradas = query.status ? rows.filter(row => row.c.status === query.status) : rows
  const inicio = (query.page - 1) * query.perPage
  return {
    items: filtradas.slice(inicio, inicio + query.perPage).map(toVendasComissao),
    totais,
    total: filtradas.length,
    page: query.page,
    perPage: query.perPage,
  }
}

export interface ResumoBeneficiario {
  beneficiarioAgenteId: string | null
  beneficiarioCorretoraId: string | null
  nome: string
  totais: TotaisComissao
  /** a pagar + paga − a descontar. */
  liquido: number
}

export interface ResumoComissoes {
  mes: string
  beneficiarios: ResumoBeneficiario[]
  totais: TotaisComissao
}

/** `GET /comissoes/resumo?mes=`: prevista/a pagar/paga/a descontar por beneficiário (mês padrão = o atual). */
export async function resumo(ctx: VendasCtx, mes?: string, agora: Date = new Date()): Promise<ResumoComissoes> {
  const mesAlvo = mes ?? mesReferenciaSaoPaulo(agora)
  const where = await condicaoDaConsulta(ctx, { mes: mesAlvo })
  const rows = where ? ((await selecionar(where)) as LinhaJoin[]) : []
  const grupos = new Map<string, { agenteId: string | null; corretoraId: string | null; nome: string; rows: LinhaJoin[] }>()
  for (const row of rows) {
    const chave = row.c.beneficiarioAgenteId ?? (row.c.beneficiarioCorretoraId ? `corretora:${row.c.beneficiarioCorretoraId}` : 'sem-beneficiario')
    const grupo = grupos.get(chave) ?? {
      agenteId: row.c.beneficiarioAgenteId ?? null,
      corretoraId: row.c.beneficiarioCorretoraId ?? null,
      nome: row.agenteNome ?? row.corretoraNome ?? 'Sem beneficiário',
      rows: [],
    }
    grupo.rows.push(row)
    grupos.set(chave, grupo)
  }
  const beneficiarios = [...grupos.values()]
    .map(grupo => {
      const totais = somarPorStatus(grupo.rows.map(row => ({ status: row.c.status, valor: row.c.valor })))
      return {
        beneficiarioAgenteId: grupo.agenteId,
        beneficiarioCorretoraId: grupo.corretoraId,
        nome: grupo.nome,
        totais,
        liquido: arredondarCentavos(totais.a_pagar + totais.paga - totais.a_descontar),
      }
    })
    .sort((a, b) => b.liquido - a.liquido || a.nome.localeCompare(b.nome, 'pt-BR'))
  return { mes: mesAlvo, beneficiarios, totais: somarPorStatus(rows.map(row => ({ status: row.c.status, valor: row.c.valor }))) }
}

// ---------------------------------------------------------------------------
// Escrita (master)
// ---------------------------------------------------------------------------

function exigirMaster(ctx: VendasCtx): void {
  if (ctx.papel !== 'master') throw AppError.forbidden('Só o master da Rede Comercial pode alterar comissões.')
}

async function auditarEscrita(ctx: VendasCtx, action: string, resourceId: string | null, metadata: Record<string, unknown>): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      organizationId: ctx.tenantId,
      actorId: ctx.userId,
      actorScope: ctx.scope === 'platform' ? 'platform' : 'tenant',
      action,
      resource: 'vendas_comissao',
      resourceId,
      metadata: { scope: ctx.scope, ...metadata },
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error), action }, 'Falha ao gravar auditoria de comissão')
  }
}

async function buscarComissoes(ctx: VendasCtx, ids: string[]): Promise<VendasComissao[]> {
  if (ids.length === 0) return []
  const rows = (await selecionar(and(whereEscopo(vendasComissoes, ctx), inArray(vendasComissoes.id, ids))!)) as LinhaJoin[]
  return rows.map(toVendasComissao)
}

/** `POST /comissoes/pagar` (master): `a_pagar → paga`. Ids em outro status/escopo voltam em `ignoradas`. */
export async function pagar(
  ctx: VendasCtx,
  input: Pick<PagarComissoesInput, 'ids' | 'pagamentoRef' | 'pagoEm'>,
  agora: Date = new Date(),
): Promise<{ pagas: VendasComissao[]; ignoradas: string[] }> {
  exigirMaster(ctx)
  const ids = [...new Set(input.ids)]
  const pagoEm = input.pagoEm ? new Date(input.pagoEm) : agora
  const atualizadas = await db
    .update(vendasComissoes)
    .set({
      status: 'paga',
      pagoEm,
      pagoPorUserId: ctx.userId,
      pagamentoRef: input.pagamentoRef ?? null,
      updatedAt: agora,
    })
    .where(and(whereEscopo(vendasComissoes, ctx), inArray(vendasComissoes.id, ids), eq(vendasComissoes.status, 'a_pagar')))
    .returning({ id: vendasComissoes.id })
  const pagasIds = atualizadas.map(row => row.id)
  if (pagasIds.length === 0) {
    throw AppError.businessRule('Nenhuma das comissões está "a pagar" (já pagas, canceladas ou inexistentes).')
  }
  await auditarEscrita(ctx, 'vendas.comissoes_pagas', null, { ids: pagasIds, pagamentoRef: input.pagamentoRef ?? null, pagoEm: pagoEm.toISOString() })
  const conjunto = new Set(pagasIds)
  return { pagas: await buscarComissoes(ctx, pagasIds), ignoradas: ids.filter(id => !conjunto.has(id)) }
}

/**
 * `POST /comissoes/:id/cancelar` (master): `prevista|a_pagar → cancelada`;
 * `paga → a_descontar` (já repassada: vira desconto no próximo repasse).
 */
export async function cancelar(ctx: VendasCtx, id: string, motivo: string, agora: Date = new Date()): Promise<VendasComissao> {
  exigirMaster(ctx)
  const [atual] = await db
    .select()
    .from(vendasComissoes)
    .where(and(whereEscopo(vendasComissoes, ctx), eq(vendasComissoes.id, id)))
    .limit(1)
  if (!atual) throw AppError.notFound('Comissão')
  const proximo = estornarComissao(atual.status)
  if (!proximo) throw AppError.businessRule('Esta comissão já está cancelada ou marcada para desconto.')
  const [atualizada] = await db
    .update(vendasComissoes)
    .set({ status: proximo, observacao: motivo.slice(0, 500), updatedAt: agora })
    .where(and(eq(vendasComissoes.id, id), eq(vendasComissoes.status, atual.status)))
    .returning({ id: vendasComissoes.id })
  if (!atualizada) throw AppError.conflict('A comissão mudou de status enquanto você a cancelava. Atualize e tente de novo.')
  await auditarEscrita(ctx, proximo === 'cancelada' ? 'vendas.comissao_cancelada' : 'vendas.comissao_a_descontar', id, {
    antes: atual.status,
    depois: proximo,
    motivo,
    valor: Number(atual.valor),
  })
  const [resposta] = await buscarComissoes(ctx, [id])
  return resposta!
}
