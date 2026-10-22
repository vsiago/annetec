import {
  contractDocumentText,
  DEMO_PEOPLE,
  onboardingBrandInput,
  onboardingCompanyInput,
  onboardingPersonInput,
  PLATFORM_DPA,
  PLATFORM_TERMS,
  recommendPlatformPlan,
  type ClubPaymentMethod,
  type ContractAcceptance,
  type ContractorType,
  type KybDocumentKind,
  type LegalForm,
  type OnboardingEventType,
  type PersonPosition,
  type RequestOnboardingInfoInput,
} from '@annetec/contracts'
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { db, sql } from './client'
import {
  platformEmailOutbox,
  platformFiles,
  platformOnboardingDocuments,
  platformOnboardingEvents,
  platformOnboardingPeople,
  platformOnboardingProposals,
  user,
} from './schema'
import { demoCnpjLookup } from '@/integrations/cnpj/simulated'
import { storageFor } from '@/lib/storage/drivers'
import { discardFile, storeFile, type PlatformFileRow } from '@/lib/storage/files'
import { listPublicPlanOffers } from '@/modules/platform-onboarding/plans'
import { runPrechecks } from '@/modules/platform-onboarding/prechecks.service'
import { openProposalForCnpj, slugStatus } from '@/modules/platform-onboarding/repository'
import { generateProposalCode, slugCandidates } from '@/modules/platform-onboarding/rules'

// Trava de produção: seeds/scripts de demonstração gravam contas com senha
// trivial e dados fictícios. Em produção só rodam com liberação explícita.
// (Avaliado depois dos imports — `./client` só conecta na primeira query.)
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IN_PRODUCTION !== '1') {
  console.error(
    `[seed-plataforma-propostas] Abortado: NODE_ENV=production. Este script não roda em produção.\n` +
      'Se for mesmo intencional, rode de novo com ALLOW_SEED_IN_PRODUCTION=1.',
  )
  process.exit(1)
}

/**
 * `pnpm --filter @annetec/api demo:propostas [--limpar]`
 *
 * 5 propostas de DEMONSTRAÇÃO (`source: 'seed'`) para a fila de compliance —
 * blueprint da plataforma §0.9. Usa os CNPJs fictícios de `SIMULATED_CNPJ_DATA`
 * e as pessoas de `DEMO_PEOPLE`; os documentos são PDFs mínimos gerados em
 * memória e gravados pelo Storage configurado. NÃO envia e-mail, NÃO cria
 * inquilino e nunca toca `mepcard`/`annetec` (só tabelas `platform_onboarding_*`
 * e `platform_files`).
 *
 *  - SINDCOM NITERÓI — `submitted`, pré-checagens todas ok (documentos já aprovados);
 *  - VIDA MAIS — `in_review`, sócia PEP (alerta e diligência reforçada);
 *  - ESPERANÇA SOLIDÁRIA — `pending_info`, ata de eleição recusada/pedida;
 *  - CLUBE ANTIGO — `submitted` há 60 h (SLA estourado), CNPJ BAIXADO (falha);
 *  - BOAS NOVAS — `draft`, aberta há 60 dias (alerta de empresa nova).
 *
 * ASSERV (11.222.333/0001-81) fica LIVRE para a demonstração ao vivo.
 *
 * Idempotente: CNPJ que já tem proposta aberta (de qualquer origem) é pulado.
 * `--limpar` apaga só as propostas `source: 'seed'` destes CNPJs que não
 * viraram inquilino (com pessoas, documentos, eventos, e-mails e arquivos).
 */

const HOUR = 3_600_000

interface DemoPerson {
  demoIndex: number
  position: PersonPosition
  birthDate: string
  email: string
  phone: string
  isLegalRepresentative: boolean
  isPartner: boolean
  isBeneficialOwner: boolean
  ownershipPercent: number | null
}

interface DemoDocument {
  kind: KybDocumentKind
  /** Índice em `people` (documento pessoal). */
  person?: number
  status: 'uploaded' | 'approved' | 'rejected'
  note?: string
}

interface Scenario {
  label: string
  cnpj: string
  contractorType: ContractorType
  legalForm: LegalForm
  status: 'draft' | 'submitted' | 'in_review' | 'pending_info'
  lives: number
  paymentMethod: ClubPaymentMethod | null
  slug: string
  clubName: string
  colors: [string, string]
  adminEmail: string
  createdHoursAgo: number
  submittedHoursAgo: number | null
  people: DemoPerson[]
  documents: DemoDocument[]
  accepted: boolean
  pending?: RequestOnboardingInfoInput
}

const SCENARIOS: Scenario[] = [
  {
    label: 'SINDCOM NITERÓI',
    cnpj: '33445566000186',
    contractorType: 'entidade',
    legalForm: 'sindicato',
    status: 'submitted',
    lives: 2500,
    paymentMethod: 'boleto',
    slug: 'sindcom-niteroi',
    clubName: 'Clube SINDCOM',
    colors: ['#1d4ed8', '#f59e0b'],
    adminEmail: 'painel@sindcomniteroi.org.br',
    createdHoursAgo: 30,
    submittedHoursAgo: 6,
    people: [
      {
        demoIndex: 0,
        position: 'presidente',
        birthDate: '1968-05-14',
        email: 'jose.ferreira@sindcomniteroi.org.br',
        phone: '21991234501',
        isLegalRepresentative: true,
        isPartner: false,
        isBeneficialOwner: false,
        ownershipPercent: null,
      },
    ],
    documents: [
      { kind: 'estatuto_social', status: 'approved' },
      { kind: 'ata_eleicao', status: 'approved' },
      { kind: 'registro_sindical', status: 'approved' },
      { kind: 'comprovante_endereco', status: 'approved' },
      { kind: 'documento_identidade', person: 0, status: 'approved' },
    ],
    accepted: true,
  },
  {
    label: 'VIDA MAIS',
    cnpj: '45678901000175',
    contractorType: 'empresa',
    legalForm: 'ltda',
    status: 'in_review',
    lives: 800,
    paymentMethod: 'pix',
    slug: 'vida-mais',
    clubName: 'Vida Mais Benefícios',
    colors: ['#059669', '#0f172a'],
    adminEmail: 'painel@vidamais.com.br',
    createdHoursAgo: 72,
    submittedHoursAgo: 30,
    people: [
      {
        demoIndex: 0,
        position: 'socio_administrador',
        birthDate: '1972-09-03',
        email: 'carlos.nunes@vidamais.com.br',
        phone: '11991234502',
        isLegalRepresentative: true,
        isPartner: true,
        isBeneficialOwner: true,
        ownershipPercent: 60,
      },
      {
        demoIndex: 1,
        position: 'socio',
        birthDate: '1976-02-21',
        email: 'patricia.nunes@vidamais.com.br',
        phone: '11991234503',
        isLegalRepresentative: false,
        isPartner: true,
        isBeneficialOwner: true,
        ownershipPercent: 40,
      },
    ],
    documents: [
      { kind: 'contrato_social', status: 'approved' },
      { kind: 'comprovante_endereco', status: 'uploaded' },
      { kind: 'documento_identidade', person: 0, status: 'uploaded' },
    ],
    accepted: true,
  },
  {
    label: 'ESPERANÇA SOLIDÁRIA',
    cnpj: '22334455000186',
    contractorType: 'organizacao',
    legalForm: 'ong_oscip',
    status: 'pending_info',
    lives: 400,
    paymentMethod: 'pix',
    slug: 'esperanca-solidaria',
    clubName: 'Clube Esperança',
    colors: ['#7c3aed', '#facc15'],
    adminEmail: 'painel@esperancasolidaria.org.br',
    createdHoursAgo: 120,
    submittedHoursAgo: 70,
    people: [
      {
        demoIndex: 0,
        position: 'presidente',
        birthDate: '1980-11-30',
        email: 'ana.reis@esperancasolidaria.org.br',
        phone: '31991234504',
        isLegalRepresentative: true,
        isPartner: false,
        isBeneficialOwner: false,
        ownershipPercent: null,
      },
    ],
    documents: [
      { kind: 'estatuto_social', status: 'approved' },
      { kind: 'ata_eleicao', status: 'rejected', note: 'A ata enviada não tem o registro do cartório.' },
      { kind: 'comprovante_endereco', status: 'approved' },
      { kind: 'documento_identidade', person: 0, status: 'approved' },
    ],
    accepted: true,
    pending: {
      message: 'Precisamos da ata de eleição da diretoria vigente com o registro do cartório.',
      items: [
        {
          section: 'documents',
          documentKind: 'ata_eleicao',
          note: 'Envie a ata registrada em cartório (a enviada está sem o carimbo do registro).',
        },
      ],
    },
  },
  {
    label: 'CLUBE ANTIGO',
    cnpj: '77889900000166',
    contractorType: 'empresa',
    legalForm: 'ltda',
    status: 'submitted',
    lives: 300,
    paymentMethod: 'boleto',
    slug: 'clube-antigo',
    clubName: 'Clube Antigo de Vantagens',
    colors: ['#b91c1c', '#111827'],
    adminEmail: 'painel@clubeantigo.com.br',
    createdHoursAgo: 96,
    submittedHoursAgo: 60,
    people: [
      {
        demoIndex: 0,
        position: 'socio_administrador',
        birthDate: '1965-07-08',
        email: 'roberto.melo@clubeantigo.com.br',
        phone: '21991234505',
        isLegalRepresentative: true,
        isPartner: true,
        isBeneficialOwner: true,
        ownershipPercent: 100,
      },
    ],
    documents: [
      { kind: 'contrato_social', status: 'uploaded' },
      { kind: 'comprovante_endereco', status: 'uploaded' },
      { kind: 'documento_identidade', person: 0, status: 'uploaded' },
    ],
    accepted: true,
  },
  {
    label: 'BOAS NOVAS',
    cnpj: '66554433000105',
    contractorType: 'organizacao',
    legalForm: 'instituicao_religiosa',
    status: 'draft',
    lives: 150,
    paymentMethod: null,
    slug: 'boas-novas',
    clubName: 'Clube Boas Novas',
    colors: ['#0e7490', '#f97316'],
    adminEmail: 'painel@boasnovas.org',
    createdHoursAgo: 24,
    submittedHoursAgo: null,
    people: [
      {
        demoIndex: 0,
        position: 'presidente',
        birthDate: '1985-03-17',
        email: 'lucas.silva@boasnovas.org',
        phone: '41991234506',
        isLegalRepresentative: true,
        isPartner: false,
        isBeneficialOwner: false,
        ownershipPercent: null,
      },
    ],
    documents: [{ kind: 'estatuto_social', status: 'uploaded' }],
    accepted: false,
  },
]

// ---------------------------------------------------------------------------
// PDF mínimo (válido, 1 página) gerado em memória
// ---------------------------------------------------------------------------

function demoPdf(title: string, subtitle: string): Uint8Array {
  const ascii = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\x20-\x7e]/g, '?')
      .replace(/([()\\])/g, '\\$1')
  const content = [
    'BT /F1 16 Tf 56 780 Td',
    `(${ascii(title)}) Tj`,
    '0 -24 Td /F1 11 Tf',
    `(${ascii(subtitle)}) Tj`,
    '0 -18 Td',
    '(DOCUMENTO FICTICIO - DEMONSTRACAO ANNETEC - SEM VALOR LEGAL) Tj',
    'ET',
  ].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Uint8Array(Buffer.from(pdf, 'latin1'))
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

const DEMO_CNPJS = SCENARIOS.map(s => s.cnpj)
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
const hoursAgo = (now: Date, hours: number) => new Date(now.getTime() - hours * HOUR)

async function freeSlug(wanted: string): Promise<string> {
  if ((await slugStatus(wanted)) === 'free') return wanted
  for (const candidate of slugCandidates(`${wanted}-demo`)) {
    if ((await slugStatus(candidate)) === 'free') return candidate
  }
  return `${wanted}-${randomBytes(2).toString('hex')}`
}

async function clean() {
  const seeded = await db
    .select({ id: platformOnboardingProposals.id, organizationId: platformOnboardingProposals.organizationId, code: platformOnboardingProposals.code })
    .from(platformOnboardingProposals)
    .where(and(eq(platformOnboardingProposals.source, 'seed'), inArray(platformOnboardingProposals.cnpj, DEMO_CNPJS)))
  const removable = seeded.filter(p => !p.organizationId)
  for (const kept of seeded.filter(p => p.organizationId)) {
    console.log(`Mantida (já virou inquilino): ${kept.code}`)
  }
  if (removable.length === 0) {
    console.log('Nenhuma proposta de demonstração para apagar.')
    return
  }
  const ids = removable.map(p => p.id)
  const files = await db
    .select()
    .from(platformFiles)
    .where(and(eq(platformFiles.ownerType, 'proposal'), inArray(platformFiles.ownerId, ids)))
  await db.transaction(async tx => {
    await tx.delete(platformEmailOutbox).where(inArray(platformEmailOutbox.proposalId, ids))
    // Pessoas, documentos e eventos saem em cascata.
    await tx.delete(platformOnboardingProposals).where(inArray(platformOnboardingProposals.id, ids))
    if (files.length) await tx.delete(platformFiles).where(inArray(platformFiles.id, files.map(f => f.id)))
  })
  for (const file of files) {
    await storageFor(file.driver)
      .remove(file.storageKey)
      .catch(() => {})
  }
  console.log(`Apagadas ${removable.length} proposta(s) de demonstração e ${files.length} arquivo(s).`)
}

async function seedScenario(scenario: Scenario, now: Date, planId: string | null, analyst: { id: string; name: string } | null) {
  const open = await openProposalForCnpj(scenario.cnpj)
  if (open) return { label: scenario.label, code: open.code, status: open.status, action: 'pulada (já existe proposta aberta)' }

  const receita = demoCnpjLookup(scenario.cnpj, now)
  if (!receita) throw new Error(`CNPJ ${scenario.cnpj} fora de SIMULATED_CNPJ_DATA`)
  const demoPeople = DEMO_PEOPLE[scenario.cnpj] ?? []
  const people = scenario.people.map(p => {
    const demo = demoPeople[p.demoIndex]
    if (!demo) throw new Error(`Pessoa ${p.demoIndex} ausente em DEMO_PEOPLE[${scenario.cnpj}]`)
    return onboardingPersonInput.parse({
      name: demo.name,
      cpf: demo.cpf,
      birthDate: p.birthDate,
      email: p.email,
      phone: p.phone,
      position: p.position,
      isLegalRepresentative: p.isLegalRepresentative,
      isPartner: p.isPartner,
      isBeneficialOwner: p.isBeneficialOwner,
      ownershipPercent: p.ownershipPercent,
      actsByPowerOfAttorney: false,
      isPep: demo.isPep ?? false,
      pepRole: demo.pepRole,
      pepRelationship: demo.isPep ? 'titular' : undefined,
    })
  })
  const representative = people[0]!
  const contact = (role: string) => ({ name: representative.name, email: representative.email!, phone: representative.phone!, role })
  const company = onboardingCompanyInput.parse({
    legalName: receita.legalName,
    tradeName: receita.tradeName ?? undefined,
    legalNatureCode: receita.legalNatureCode ?? undefined,
    legalNatureName: receita.legalNatureName ?? undefined,
    mainCnae: receita.mainCnae ?? undefined,
    secondaryCnaes: receita.secondaryCnaes,
    openingDate: receita.openingDate ?? undefined,
    email: receita.email ?? representative.email,
    phone: receita.phone ?? representative.phone,
    address: {
      cep: receita.address.cep ?? '20040020',
      street: receita.address.street ?? 'Rua da Demonstração',
      number: receita.address.number ?? 'S/N',
      neighborhood: receita.address.neighborhood ?? 'Centro',
      city: receita.address.city ?? 'Rio de Janeiro',
      state: receita.address.state ?? 'RJ',
    },
    contacts: { commercial: contact('Comercial'), financial: contact('Financeiro'), technical: contact('Técnico') },
  })
  const slug = await freeSlug(scenario.slug)
  const brand = onboardingBrandInput.parse({
    slug,
    clubName: scenario.clubName,
    primaryColor: scenario.colors[0],
    secondaryColor: scenario.colors[1],
    admin: { name: representative.name, email: scenario.adminEmail, phone: representative.phone },
  })

  const createdAt = hoursAgo(now, scenario.createdHoursAgo)
  const submittedAt = scenario.submittedHoursAgo === null ? null : hoursAgo(now, scenario.submittedHoursAgo)
  const assigned = scenario.status === 'in_review' || scenario.status === 'pending_info' ? analyst : null
  const stored: PlatformFileRow[] = []
  let proposalId: string | null = null

  try {
    const [proposal] = await db
      .insert(platformOnboardingProposals)
      .values({
        code: generateProposalCode(createdAt, size => randomBytes(size)),
        status: scenario.status,
        contractorType: scenario.contractorType,
        legalForm: scenario.legalForm,
        cnpj: scenario.cnpj,
        legalName: company.legalName,
        tradeName: company.tradeName ?? null,
        planId,
        expectedLives: scenario.lives,
        paymentMethod: scenario.paymentMethod,
        applicant: { name: representative.name, email: representative.email!, phone: representative.phone! },
        company,
        receitaSnapshot: { ...receita, cached: false, fetchedAt: createdAt.toISOString() },
        receitaCheckedAt: createdAt,
        brand,
        slug,
        assignedToUserId: assigned?.id ?? null,
        assignedToName: assigned?.name ?? null,
        assignedAt: assigned && submittedAt ? new Date(submittedAt.getTime() + HOUR) : null,
        pendingRequest: scenario.pending
          ? {
              ...scenario.pending,
              requestedAt: hoursAgo(now, 48).toISOString(),
              requestedBy: assigned?.name ?? 'Equipe de compliance',
              resolvedAt: null,
            }
          : null,
        submittedAt,
        firstSubmittedAt: submittedAt,
        lastActivityAt: submittedAt ?? createdAt,
        source: 'seed',
        applicantIp: null,
        applicantUserAgent: 'seed demo:propostas',
        createdAt,
        updatedAt: submittedAt ?? createdAt,
      })
      .returning()
    proposalId = proposal!.id

    const personRows = await db
      .insert(platformOnboardingPeople)
      .values(
        people.map((p, index) => ({
          proposalId: proposal!.id,
          name: p.name,
          cpf: p.cpf,
          birthDate: p.birthDate,
          email: p.email ?? null,
          phone: p.phone ?? null,
          position: p.position,
          positionOther: null,
          isLegalRepresentative: p.isLegalRepresentative,
          isPartner: p.isPartner,
          isBeneficialOwner: p.isBeneficialOwner,
          ownershipPercent: p.ownershipPercent === null || p.ownershipPercent === undefined ? null : String(p.ownershipPercent),
          actsByPowerOfAttorney: false,
          isPep: p.isPep,
          pepRole: p.pepRole ?? null,
          pepRelationship: p.pepRelationship ?? null,
          sortOrder: index,
          createdAt,
        })),
      )
      .returning()

    const events: { type: OnboardingEventType; visibility: 'public' | 'internal'; message: string; at: Date; actor?: { id: string; name: string } | null }[] = [
      { type: 'PROPOSAL_CREATED', visibility: 'public', message: `Proposta iniciada — protocolo ${proposal!.code}.`, at: createdAt },
    ]

    for (const [index, doc] of scenario.documents.entries()) {
      const person = doc.person !== undefined ? personRows[doc.person] : undefined
      const uploadedAt = new Date(createdAt.getTime() + (index + 1) * 10 * 60_000)
      const file = await storeFile({
        bytes: demoPdf(`${doc.kind.replace(/_/g, ' ').toUpperCase()}${person ? ` - ${person.name}` : ''}`, `${company.legalName} - CNPJ ${scenario.cnpj}`),
        fileName: `${doc.kind}${person ? `-${person.name.split(' ')[0]!.toLowerCase()}` : ''}.pdf`,
        mimeType: 'application/pdf',
        ext: 'pdf',
        purpose: 'kyb_document',
        visibility: 'private',
        ownerType: 'proposal',
        ownerId: proposal!.id,
        uploadedBy: 'seed',
        keyPrefix: `kyb/${proposal!.id}`,
      })
      stored.push(file)
      const reviewed = doc.status !== 'uploaded'
      await db.insert(platformOnboardingDocuments).values({
        proposalId: proposal!.id,
        personId: person?.id ?? null,
        kind: doc.kind,
        fileId: file.id,
        status: doc.status,
        reviewNote: doc.note ?? null,
        reviewedByUserId: reviewed ? (analyst?.id ?? null) : null,
        reviewedByName: reviewed ? (analyst?.name ?? 'Equipe de compliance') : null,
        reviewedAt: reviewed ? (submittedAt ? new Date(submittedAt.getTime() + 2 * HOUR) : now) : null,
        createdAt: uploadedAt,
        updatedAt: uploadedAt,
      })
      events.push({ type: 'DOCUMENT_UPLOADED', visibility: 'public', message: `Documento enviado: ${doc.kind}.`, at: uploadedAt })
    }

    if (scenario.accepted) {
      const acceptedAt = submittedAt ? new Date(submittedAt.getTime() - 10 * 60_000) : createdAt
      const acceptance: ContractAcceptance = {
        termsVersion: PLATFORM_TERMS.version,
        dpaVersion: PLATFORM_DPA.version,
        termsHash: sha256(contractDocumentText(PLATFORM_TERMS)),
        dpaHash: sha256(contractDocumentText(PLATFORM_DPA)),
        signerPersonId: personRows[0]!.id,
        signerName: personRows[0]!.name,
        signerCpf: personRows[0]!.cpf,
        signerEmail: personRows[0]!.email,
        acceptedAt: acceptedAt.toISOString(),
        ip: null,
        userAgent: 'seed demo:propostas',
      }
      await db
        .update(platformOnboardingProposals)
        .set({ contractAcceptance: acceptance, acceptedAt })
        .where(eq(platformOnboardingProposals.id, proposal!.id))
      events.push({ type: 'CONTRACT_ACCEPTED', visibility: 'public', message: `Contrato aceito por ${personRows[0]!.name}.`, at: acceptedAt })
    }
    if (submittedAt) events.push({ type: 'SUBMITTED', visibility: 'public', message: 'Proposta enviada para análise.', at: submittedAt })
    if (assigned && submittedAt) {
      events.push({ type: 'CLAIMED', visibility: 'public', message: 'Análise cadastral iniciada.', at: new Date(submittedAt.getTime() + HOUR), actor: assigned })
    }
    if (scenario.pending) {
      events.push({ type: 'INFO_REQUESTED', visibility: 'public', message: `Pendência solicitada: ${scenario.pending.message}`, at: hoursAgo(now, 48), actor: assigned })
    }
    await db.insert(platformOnboardingEvents).values(
      events.map(e => ({
        proposalId: proposal!.id,
        type: e.type,
        visibility: e.visibility,
        message: e.message,
        data: { seed: true },
        actorUserId: e.actor?.id ?? null,
        actorName: e.actor?.name ?? null,
        createdAt: e.at,
      })),
    )

    // Pré-checagens reais (Receita simulada, sem rede e sem e-mail).
    const checked = await runPrechecks(proposal!.id, { trigger: 'manual' })
    return { label: scenario.label, code: proposal!.code, status: scenario.status, action: `criada (pré-checagens: ${checked.precheckSummary})` }
  } catch (error) {
    if (proposalId) await db.delete(platformOnboardingProposals).where(eq(platformOnboardingProposals.id, proposalId)).catch(() => {})
    for (const file of stored) await discardFile(file).catch(() => {})
    throw error
  }
}

async function main() {
  if (process.argv.includes('--limpar')) {
    await clean()
    return
  }
  const now = new Date()
  const offers = await listPublicPlanOffers()
  const [analyst] = await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.role, 'superadmin')).limit(1)
  const report = []
  for (const scenario of SCENARIOS) {
    const planId = recommendPlatformPlan(offers, scenario.lives)
    report.push(await seedScenario(scenario, now, planId, analyst ?? null))
  }
  console.log('\nPropostas de demonstração (fila de compliance):')
  console.table(report)
  if (offers.length === 0) console.log('Aviso: nenhum plano ANNETEC visível — propostas criadas sem plano.')
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await sql.end()
  })
