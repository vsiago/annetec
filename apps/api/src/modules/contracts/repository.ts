import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { beneficiaries, contracts } from '@/db/schema'
import type { MappedContract } from '@/integrations/digitalsaude/mappers'

/** Persistência do espelho local de contratos e beneficiários. */
export const contractsRepository = {
  async list(params: {
    tenantId: string
    page: number
    perPage: number
    status?: string
    search?: string
    clientUserId?: string
    sellerUserId?: string
  }) {
    const filters: SQL[] = [eq(contracts.organizationId, params.tenantId)]
    if (params.status) filters.push(eq(contracts.status, params.status as 'ativo'))
    if (params.clientUserId) filters.push(eq(contracts.clientUserId, params.clientUserId))
    if (params.sellerUserId) filters.push(eq(contracts.sellerUserId, params.sellerUserId))
    if (params.search) {
      const term = `%${params.search}%`
      const match = or(
        ilike(contracts.holderName, term),
        ilike(contracts.upstreamCodigo, term),
        ilike(contracts.proposalNumber, term),
        ilike(contracts.holderCpf, term),
      )
      if (match) filters.push(match)
    }
    const where = and(...filters)

    const [rows, [totals]] = await Promise.all([
      db.query.contracts.findMany({
        where,
        with: { beneficiaries: true },
        orderBy: desc(contracts.createdAt),
        limit: params.perPage,
        offset: (params.page - 1) * params.perPage,
      }),
      db.select({ value: count() }).from(contracts).where(where),
    ])

    return { rows, total: totals?.value ?? 0 }
  },

  findByCodigo(tenantId: string, upstreamCodigo: string) {
    return db.query.contracts.findFirst({
      where: and(eq(contracts.organizationId, tenantId), eq(contracts.upstreamCodigo, upstreamCodigo)),
      with: { beneficiaries: true },
    })
  },

  findByClientUser(tenantId: string, clientUserId: string) {
    return db.query.contracts.findMany({
      where: and(eq(contracts.organizationId, tenantId), eq(contracts.clientUserId, clientUserId)),
      with: { beneficiaries: true },
      orderBy: desc(contracts.createdAt),
    })
  },

  /**
   * Grava (ou atualiza) um contrato vindo do upstream junto com seus
   * beneficiários, em transação. Os beneficiários são regravados por completo:
   * o upstream é a fonte da verdade e um diff parcial deixaria dependente
   * removido no ERP vivo no espelho local.
   */
  async upsertFromUpstream(
    tenantId: string,
    mapped: MappedContract,
    links: { clientUserId?: string | null; sellerUserId?: string | null } = {},
  ) {
    return db.transaction(async tx => {
      const values = {
        organizationId: tenantId,
        upstreamCodigo: mapped.upstreamCodigo,
        proposalNumber: mapped.proposalNumber,
        holderName: mapped.holderName,
        holderCpf: mapped.holderCpf,
        status: mapped.status,
        upstreamStatus: mapped.upstreamStatus,
        signedAt: mapped.signedAt,
        dueDay: mapped.dueDay,
        monthlyValue: mapped.monthlyValue === null ? null : String(mapped.monthlyValue),
        outstandingBalance:
          mapped.outstandingBalance === null ? null : String(mapped.outstandingBalance),
        planCodigo: mapped.planCodigo,
        planName: mapped.planName,
        convenioCodigo: mapped.convenioCodigo,
        convenioName: mapped.convenioName,
        sellerUpstreamCodigo: mapped.sellerUpstreamCodigo,
        raw: mapped.raw,
        syncedAt: new Date(),
        updatedAt: new Date(),
        ...(links.clientUserId !== undefined ? { clientUserId: links.clientUserId } : {}),
        ...(links.sellerUserId !== undefined ? { sellerUserId: links.sellerUserId } : {}),
      }

      const [row] = await tx
        .insert(contracts)
        .values(values)
        .onConflictDoUpdate({
          target: [contracts.organizationId, contracts.upstreamCodigo],
          set: values,
        })
        .returning()

      const contractId = row!.id
      await tx.delete(beneficiaries).where(eq(beneficiaries.contractId, contractId))

      if (mapped.beneficiaries.length > 0) {
        await tx.insert(beneficiaries).values(
          mapped.beneficiaries.map(b => ({
            contractId,
            upstreamCodigo: b.upstreamCodigo,
            kind: b.kind,
            name: b.name,
            cpf: b.cpf,
            birthDate: b.birthDate,
            motherName: b.motherName,
            relationship: b.relationship,
            gender: b.gender,
            email: b.email,
            phone: b.phone,
            monthlyFee: b.monthlyFee === null ? null : String(b.monthlyFee),
            effectiveDate: b.effectiveDate,
            provisionalCardUrl: b.provisionalCardUrl,
            status: b.status,
            raw: b.raw,
          })),
        )
      }

      return row!
    })
  },
}
