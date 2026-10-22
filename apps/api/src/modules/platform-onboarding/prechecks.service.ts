import { PRECHECK_LABELS } from '@annetec/contracts'
import { eq } from 'drizzle-orm'
import { isProduction } from '@/config/env'
import { db } from '@/db/client'
import { platformOnboardingPeople, platformOnboardingProposals } from '@/db/schema'
import { AppError } from '@/http/errors'
import { lookupCnpj } from '@/integrations/cnpj'
import { requirementRows } from './presenter'
import { runPrecheckRules, type PrecheckInput } from './prechecks.rules'
import {
  cnpjIsTenant,
  emailHasAccount,
  insertEvent,
  loadBundle,
  openProposalForCnpj,
  slugStatus,
  type Actor,
  type ProposalRow,
} from './repository'

/**
 * Executa as pré-checagens (ao enviar, ao reenviar, na aprovação com mais de
 * 24 h e pelo botão do console) e grava `prechecks`, `precheckSummary`,
 * `hasPep`, `people.qsaMatch` + evento interno — blueprint §0.6.
 */
export async function runPrechecks(
  proposalId: string,
  opts: { actor?: Actor | null; trigger: 'submit' | 'resubmit' | 'manual' | 'approve' },
): Promise<ProposalRow> {
  const bundle = await loadBundle(proposalId)
  if (!bundle) throw AppError.notFound('Proposta')
  const { proposal } = bundle
  const now = new Date()

  // Receita: consulta nova; se falhar, o retrato anterior (auditável) vale.
  const lookup = await lookupCnpj(proposal.cnpj, now)
  let receita: PrecheckInput['receita']
  if (lookup.found && lookup.result) receita = { status: 'found', data: lookup.result, fromSnapshot: false }
  else if (lookup.unavailable && proposal.receitaSnapshot) {
    receita = { status: 'found', data: proposal.receitaSnapshot, fromSnapshot: true }
  } else receita = { status: lookup.unavailable ? 'unavailable' : 'not_found' }

  const brand = proposal.brand
  const [isTenant, otherOpen, slug, adminTaken] = await Promise.all([
    cnpjIsTenant(proposal.cnpj),
    openProposalForCnpj(proposal.cnpj, proposal.id),
    brand ? slugStatus(brand.slug, proposal.id) : Promise.resolve(null),
    brand ? emailHasAccount(brand.admin.email) : Promise.resolve(false),
  ])

  const output = runPrecheckRules({
    now,
    // Consulta simulada em produção (retrato antigo) nunca passa sozinha.
    simulatedLookupOutcome: isProduction ? 'warn' : 'pass',
    cnpj: proposal.cnpj,
    contractorType: proposal.contractorType,
    legalForm: proposal.legalForm,
    receita,
    company: proposal.company,
    people: bundle.people.map(p => ({
      id: p.id,
      name: p.name,
      cpf: p.cpf,
      isLegalRepresentative: p.isLegalRepresentative,
      isPartner: p.isPartner,
      isBeneficialOwner: p.isBeneficialOwner,
      ownershipPercent: p.ownershipPercent === null ? null : Number(p.ownershipPercent),
      actsByPowerOfAttorney: p.actsByPowerOfAttorney,
      isPep: p.isPep,
      pepRole: p.pepRole,
    })),
    requirements: requirementRows(bundle),
    // O próprio inquilino desta proposta (já provisionada) não conta como duplicidade.
    uniqueness: { isTenant: isTenant && !proposal.organizationId, otherOpenProposalCode: otherOpen?.code ?? null },
    slug: brand && slug ? { value: brand.slug, status: slug } : null,
    adminEmail: brand ? { value: brand.admin.email, taken: adminTaken && !proposal.organizationId } : null,
  })

  const updated = await db.transaction(async tx => {
    const [row] = await tx
      .update(platformOnboardingProposals)
      .set({
        prechecks: output.results,
        precheckSummary: output.summary,
        precheckRanAt: now,
        hasPep: output.hasPep,
        ...(receita.status === 'found' && !receita.fromSnapshot
          ? { receitaSnapshot: receita.data, receitaCheckedAt: now }
          : {}),
        updatedAt: now,
      })
      .where(eq(platformOnboardingProposals.id, proposal.id))
      .returning()
    for (const [personId, match] of Object.entries(output.qsa)) {
      await tx
        .update(platformOnboardingPeople)
        .set({ qsaMatch: match, updatedAt: now })
        .where(eq(platformOnboardingPeople.id, personId))
    }
    const count = (outcome: string) => output.results.filter(r => r.outcome === outcome).length
    const fails = output.results.filter(r => r.outcome === 'fail').map(r => PRECHECK_LABELS[r.code])
    await insertEvent(tx, {
      proposalId: proposal.id,
      type: 'PRECHECKS_RAN',
      visibility: 'internal',
      message: `Pré-checagens (${opts.trigger}): ${count('pass')} ok, ${count('warn')} alerta(s), ${count('fail')} falha(s)${fails.length ? ` — ${fails.join(', ')}` : ''}.`,
      data: { summary: output.summary, trigger: opts.trigger },
      actor: opts.actor ?? null,
    })
    return row!
  })
  return updated
}
