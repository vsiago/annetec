import {
  mapContract
} from "./chunk-P2WGSFUZ.js";
import {
  AppError,
  UPSTREAM_ID_BY_BENEFICIARY_KIND,
  beneficiaries,
  contracts,
  db,
  getDigitalSaudeClient,
  getIntegrationDefaults,
  logger
} from "./chunk-HNEZMN3V.js";

// src/modules/contracts/repository.ts
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
var contractsRepository = {
  async list(params) {
    const filters = [eq(contracts.organizationId, params.tenantId)];
    if (params.status) filters.push(eq(contracts.status, params.status));
    if (params.clientUserId) filters.push(eq(contracts.clientUserId, params.clientUserId));
    if (params.sellerUserId) filters.push(eq(contracts.sellerUserId, params.sellerUserId));
    if (params.search) {
      const term = `%${params.search}%`;
      const match = or(
        ilike(contracts.holderName, term),
        ilike(contracts.upstreamCodigo, term),
        ilike(contracts.proposalNumber, term),
        ilike(contracts.holderCpf, term)
      );
      if (match) filters.push(match);
    }
    const where = and(...filters);
    const [rows, [totals]] = await Promise.all([
      db.query.contracts.findMany({
        where,
        with: { beneficiaries: true },
        orderBy: desc(contracts.createdAt),
        limit: params.perPage,
        offset: (params.page - 1) * params.perPage
      }),
      db.select({ value: count() }).from(contracts).where(where)
    ]);
    return { rows, total: totals?.value ?? 0 };
  },
  findByCodigo(tenantId, upstreamCodigo) {
    return db.query.contracts.findFirst({
      where: and(eq(contracts.organizationId, tenantId), eq(contracts.upstreamCodigo, upstreamCodigo)),
      with: { beneficiaries: true }
    });
  },
  findByClientUser(tenantId, clientUserId) {
    return db.query.contracts.findMany({
      where: and(eq(contracts.organizationId, tenantId), eq(contracts.clientUserId, clientUserId)),
      with: { beneficiaries: true },
      orderBy: desc(contracts.createdAt)
    });
  },
  /**
   * Grava (ou atualiza) um contrato vindo do upstream junto com seus
   * beneficiários, em transação. Os beneficiários são regravados por completo:
   * o upstream é a fonte da verdade e um diff parcial deixaria dependente
   * removido no ERP vivo no espelho local.
   */
  async upsertFromUpstream(tenantId, mapped, links = {}) {
    return db.transaction(async (tx) => {
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
        outstandingBalance: mapped.outstandingBalance === null ? null : String(mapped.outstandingBalance),
        planCodigo: mapped.planCodigo,
        planName: mapped.planName,
        convenioCodigo: mapped.convenioCodigo,
        convenioName: mapped.convenioName,
        sellerUpstreamCodigo: mapped.sellerUpstreamCodigo,
        raw: mapped.raw,
        syncedAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date(),
        ...links.clientUserId !== void 0 ? { clientUserId: links.clientUserId } : {},
        ...links.sellerUserId !== void 0 ? { sellerUserId: links.sellerUserId } : {}
      };
      const [row] = await tx.insert(contracts).values(values).onConflictDoUpdate({
        target: [contracts.organizationId, contracts.upstreamCodigo],
        set: values
      }).returning();
      const contractId = row.id;
      await tx.delete(beneficiaries).where(eq(beneficiaries.contractId, contractId));
      if (mapped.beneficiaries.length > 0) {
        await tx.insert(beneficiaries).values(
          mapped.beneficiaries.map((b) => ({
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
            raw: b.raw
          }))
        );
      }
      return row;
    });
  }
};

// src/modules/contracts/service.ts
var contractsService = {
  /** Login do portal do associado: valida CPF + e-mail contra o ERP. */
  async findUpstreamByClientPortal(tenantId, input) {
    const client = await getDigitalSaudeClient(tenantId);
    const result = await client.call("contratoPorClientePortal", {
      cpf: input.cpf,
      email: input.email
    });
    return result.map(mapContract).filter((contract) => contract.upstreamCodigo !== "");
  },
  /** Busca por CPF do titular. Restrita a admin — o upstream a marca como URA. */
  async findUpstreamByCpf(tenantId, cpf) {
    const client = await getDigitalSaudeClient(tenantId);
    const result = await client.call("contratoPorCpfTitular", { cpf });
    return result.map(mapContract);
  },
  async syncContracts(tenantId, mapped, links = {}) {
    for (const contract of mapped) {
      await contractsRepository.upsertFromUpstream(tenantId, contract, links);
    }
    logger.info({ tenantId, count: mapped.length }, "Contratos sincronizados");
  },
  /**
   * Recarrega um contrato do ERP e regrava o espelho. Usado quando a tela
   * precisa de dado fresco (financeiro, carteirinha) e não do cache.
   */
  async refreshFromUpstream(tenantId, upstreamCodigo) {
    const client = await getDigitalSaudeClient(tenantId);
    const source = await client.one("contratoPorCodigo", { codigoContrato: upstreamCodigo });
    if (!source) throw AppError.notFound("Contrato");
    const mapped = mapContract(source);
    await contractsRepository.upsertFromUpstream(tenantId, mapped);
    const stored = await contractsRepository.findByCodigo(tenantId, upstreamCodigo);
    if (!stored) throw AppError.notFound("Contrato");
    return toDomain(stored);
  },
  async list(params) {
    const { rows, total } = await contractsRepository.list(params);
    return { items: rows.map(toDomain), total };
  },
  async getByCodigo(tenantId, upstreamCodigo) {
    const stored = await contractsRepository.findByCodigo(tenantId, upstreamCodigo);
    if (stored) return toDomain(stored);
    return this.refreshFromUpstream(tenantId, upstreamCodigo);
  },
  /**
   * Adesão. Monta o payload de `POST /contrato/` a partir do input de domínio,
   * completando grupo/filial/convênio com a configuração do inquilino.
   */
  async create(tenantId, input, actor = {}) {
    const [client, defaults] = await Promise.all([
      getDigitalSaudeClient(tenantId),
      getIntegrationDefaults(tenantId)
    ]);
    if (!defaults.grupoCodigo || !defaults.filialCodigo || !defaults.convenioCodigo) {
      throw AppError.businessRule(
        "Configure grupo, filial e conv\xEAnio padr\xE3o do inquilino antes de registrar ades\xF5es"
      );
    }
    const holderAddress = input.holder.address;
    const beneficiarioList = [
      {
        nome: input.holder.name,
        cpf: input.holder.cpf,
        dataNascimento: input.holder.birthDate,
        email: input.holder.email,
        nomeMae: input.holder.motherName,
        endereco: holderAddress.street,
        numero: holderAddress.number,
        complemento: holderAddress.complement,
        bairro: holderAddress.neighborhood,
        municipio: holderAddress.city,
        uf: holderAddress.state,
        cep: holderAddress.zipCode,
        dddCelular: input.holder.phone.slice(0, 2),
        celular: input.holder.phone.slice(2),
        tipoBeneficiario: { id: UPSTREAM_ID_BY_BENEFICIARY_KIND.titular },
        ...input.holder.genderId ? { sexo: { id: input.holder.genderId } } : {},
        ...input.holder.maritalStatusId ? { estatoCivil: { id: input.holder.maritalStatusId } } : {}
      },
      ...input.dependents.map((dependent) => ({
        nome: dependent.name,
        cpf: dependent.cpf,
        dataNascimento: dependent.birthDate,
        nomeMae: dependent.motherName,
        tipoBeneficiario: { id: UPSTREAM_ID_BY_BENEFICIARY_KIND[dependent.kind] },
        parentesco: { id: dependent.relationshipId },
        ...dependent.genderId ? { sexo: { id: dependent.genderId } } : {}
      }))
    ];
    const result = await client.call("contratoIncluir", {
      numeroProposta: input.proposalNumber,
      dataAssinatura: input.signedAt,
      diaVencimento: input.dueDay,
      observacao: input.notes,
      plano: { codigo: input.planCodigo },
      convenio: { codigo: defaults.convenioCodigo },
      produtor: { codigo: await resolveProdutorCodigo(tenantId, input.sellerId) },
      grupo: { codigo: defaults.grupoCodigo },
      filial: { codigo: defaults.filialCodigo },
      opcionalList: input.optionalCodes?.map((codigo) => ({ codigo })),
      beneficiarioList
    });
    const created = result[0];
    if (!created) {
      throw AppError.businessRule("A Digital Sa\xFAde n\xE3o retornou o contrato criado");
    }
    const mapped = mapContract(created);
    await contractsRepository.upsertFromUpstream(tenantId, mapped, {
      sellerUserId: actor.sellerUserId ?? input.sellerId ?? null
    });
    logger.info(
      { tenantId, contrato: mapped.upstreamCodigo, proposta: mapped.proposalNumber },
      "Ades\xE3o registrada na Digital Sa\xFAde"
    );
    const stored = await contractsRepository.findByCodigo(tenantId, mapped.upstreamCodigo);
    return stored ? toDomain(stored) : mappedToDomain(mapped);
  },
  /** Muda o status do contrato de PENDENTE para PRODUZIDO no ERP. */
  async markAsProduced(tenantId, upstreamCodigo) {
    const client = await getDigitalSaudeClient(tenantId);
    await client.call("contratoRetornarParaProduzido", { codigoContrato: upstreamCodigo });
    return this.refreshFromUpstream(tenantId, upstreamCodigo);
  },
  /** Dispara o e-mail da carteira provisória pelo próprio ERP. */
  async sendMembershipCardByEmail(tenantId, upstreamCodigo) {
    const client = await getDigitalSaudeClient(tenantId);
    return client.call("contratoEnviarCarteira", { codigoContrato: upstreamCodigo });
  },
  async attachDocument(tenantId, input) {
    const client = await getDigitalSaudeClient(tenantId);
    return client.call("anexoIncluir", {
      codigoContrato: input.contractUpstreamCodigo,
      nomeArquivo: input.fileName,
      linkAnexo: input.fileUrl
    });
  },
  async declarePathology(tenantId, input) {
    const client = await getDigitalSaudeClient(tenantId);
    return client.call("patologiaIncluir", {
      codigo: input.cid,
      nome: input.name,
      descricao: input.description,
      anoEvento: input.eventYear,
      numeroPergunta: input.questionNumber,
      beneficiario: { codigo: input.beneficiaryUpstreamCodigo }
    });
  },
  async registerPendency(tenantId, contractCodigo, pendencyCode) {
    const client = await getDigitalSaudeClient(tenantId);
    return client.call("pendenciaIncluir", {
      codigoPendencia: pendencyCode,
      contrato: { codigo: contractCodigo }
    });
  },
  /** Carteirinha digital do associado, montada a partir do espelho local. */
  async membershipCards(tenantId, clientUserId) {
    const rows = await contractsRepository.findByClientUser(tenantId, clientUserId);
    return rows.flatMap(
      (row) => row.beneficiaries.map((beneficiary) => ({
        contractId: row.id,
        beneficiaryId: beneficiary.id,
        holderName: beneficiary.name,
        // O ERP não expõe número de carteira separado do código do beneficiário.
        cardNumber: beneficiary.upstreamCodigo ?? row.upstreamCodigo,
        planName: row.planName,
        status: row.status,
        effectiveDate: beneficiary.effectiveDate,
        provisionalCardUrl: beneficiary.provisionalCardUrl
      }))
    );
  }
};
async function resolveProdutorCodigo(tenantId, sellerId) {
  const { sellersService } = await import("./service-VBAITRTV.js");
  const codigo = sellerId ? await sellersService.upstreamProdutorCodigo(tenantId, sellerId) : null;
  if (codigo) return codigo;
  throw AppError.businessRule(
    "Vendedor sem c\xF3digo de produtor vinculado na Digital Sa\xFAde. Vincule antes de registrar a ades\xE3o."
  );
}
function toDomain(row) {
  return {
    id: row.id,
    tenantId: row.organizationId,
    upstreamCodigo: row.upstreamCodigo,
    proposalNumber: row.proposalNumber,
    holderName: row.holderName,
    status: row.status,
    upstreamStatus: row.upstreamStatus,
    signedAt: row.signedAt,
    dueDay: row.dueDay,
    monthlyValue: row.monthlyValue === null ? null : Number(row.monthlyValue),
    outstandingBalance: row.outstandingBalance === null ? null : Number(row.outstandingBalance),
    planCodigo: row.planCodigo,
    planName: row.planName,
    convenioCodigo: row.convenioCodigo,
    convenioName: row.convenioName,
    sellerUpstreamCodigo: row.sellerUpstreamCodigo,
    clientUserId: row.clientUserId,
    sellerUserId: row.sellerUserId,
    syncedAt: row.syncedAt?.toISOString() ?? null,
    beneficiaries: row.beneficiaries.map((beneficiary) => ({
      id: beneficiary.id,
      contractId: beneficiary.contractId,
      upstreamCodigo: beneficiary.upstreamCodigo,
      kind: beneficiary.kind,
      name: beneficiary.name,
      cpf: beneficiary.cpf,
      birthDate: beneficiary.birthDate,
      motherName: beneficiary.motherName,
      relationship: beneficiary.relationship,
      gender: beneficiary.gender,
      email: beneficiary.email,
      phone: beneficiary.phone,
      address: null,
      monthlyFee: beneficiary.monthlyFee === null ? null : Number(beneficiary.monthlyFee),
      effectiveDate: beneficiary.effectiveDate,
      provisionalCardUrl: beneficiary.provisionalCardUrl,
      status: beneficiary.status
    }))
  };
}
function mappedToDomain(mapped) {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    tenantId: "00000000-0000-0000-0000-000000000000",
    upstreamCodigo: mapped.upstreamCodigo,
    proposalNumber: mapped.proposalNumber,
    holderName: mapped.holderName,
    status: mapped.status,
    upstreamStatus: mapped.upstreamStatus,
    signedAt: mapped.signedAt,
    dueDay: mapped.dueDay,
    monthlyValue: mapped.monthlyValue,
    outstandingBalance: mapped.outstandingBalance,
    planCodigo: mapped.planCodigo,
    planName: mapped.planName,
    convenioCodigo: mapped.convenioCodigo,
    convenioName: mapped.convenioName,
    sellerUpstreamCodigo: mapped.sellerUpstreamCodigo,
    clientUserId: null,
    sellerUserId: null,
    syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
    beneficiaries: []
  };
}

export {
  contractsService
};
