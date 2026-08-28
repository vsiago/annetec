import {
  UPSTREAM_ID_BY_BENEFICIARY_KIND,
  type AttachDocumentInput,
  type Contract,
  type CreateContractInput,
  type DeclarePathologyInput,
  type MembershipCard,
} from '@annetec/contracts'
import { AppError } from '@/http/errors'
import { getDigitalSaudeClient, getIntegrationDefaults } from '@/integrations/digitalsaude/provider'
import { mapContract, type MappedContract } from '@/integrations/digitalsaude/mappers'
import { logger } from '@/lib/logger'
import { contractsRepository } from './repository'

/**
 * Regras de contrato/adesão.
 *
 * O ERP da Digital Saúde é a fonte da verdade; esta camada faz três coisas:
 *  1. lê do upstream e normaliza (mappers);
 *  2. espelha localmente para listagem, filtro e vínculo com usuários Annetec;
 *  3. aplica as regras de visibilidade — cliente só vê os próprios contratos,
 *     vendedor só vê os que produziu, admin vê todos do inquilino.
 */
export const contractsService = {
  /** Login do portal do associado: valida CPF + e-mail contra o ERP. */
  async findUpstreamByClientPortal(
    tenantId: string,
    input: { cpf: string; email: string },
  ): Promise<MappedContract[]> {
    const client = await getDigitalSaudeClient(tenantId)
    const result = await client.call('contratoPorClientePortal', {
      cpf: input.cpf,
      email: input.email,
    })
    return result.map(mapContract).filter(contract => contract.upstreamCodigo !== '')
  },

  /** Busca por CPF do titular. Restrita a admin — o upstream a marca como URA. */
  async findUpstreamByCpf(tenantId: string, cpf: string): Promise<MappedContract[]> {
    const client = await getDigitalSaudeClient(tenantId)
    const result = await client.call('contratoPorCpfTitular', { cpf })
    return result.map(mapContract)
  },

  async syncContracts(
    tenantId: string,
    mapped: MappedContract[],
    links: { clientUserId?: string | null; sellerUserId?: string | null } = {},
  ) {
    for (const contract of mapped) {
      await contractsRepository.upsertFromUpstream(tenantId, contract, links)
    }
    logger.info({ tenantId, count: mapped.length }, 'Contratos sincronizados')
  },

  /**
   * Recarrega um contrato do ERP e regrava o espelho. Usado quando a tela
   * precisa de dado fresco (financeiro, carteirinha) e não do cache.
   */
  async refreshFromUpstream(tenantId: string, upstreamCodigo: string): Promise<Contract> {
    const client = await getDigitalSaudeClient(tenantId)
    const source = await client.one('contratoPorCodigo', { codigoContrato: upstreamCodigo })
    if (!source) throw AppError.notFound('Contrato')

    const mapped = mapContract(source)
    await contractsRepository.upsertFromUpstream(tenantId, mapped)
    const stored = await contractsRepository.findByCodigo(tenantId, upstreamCodigo)
    if (!stored) throw AppError.notFound('Contrato')
    return toDomain(stored)
  },

  async list(params: {
    tenantId: string
    page: number
    perPage: number
    status?: string
    search?: string
    /** Preenchido pelo controller a partir do papel de quem chamou. */
    clientUserId?: string
    sellerUserId?: string
  }) {
    const { rows, total } = await contractsRepository.list(params)
    return { items: rows.map(toDomain), total }
  },

  async getByCodigo(tenantId: string, upstreamCodigo: string): Promise<Contract> {
    const stored = await contractsRepository.findByCodigo(tenantId, upstreamCodigo)
    if (stored) return toDomain(stored)
    // Ainda não espelhado: busca no ERP e grava.
    return this.refreshFromUpstream(tenantId, upstreamCodigo)
  },

  /**
   * Adesão. Monta o payload de `POST /contrato/` a partir do input de domínio,
   * completando grupo/filial com a configuração do inquilino e o convênio com
   * `input.convenioCodigo` (ou o padrão do inquilino, se o input não trouxer —
   * caso de quem só vende sob um convênio fixo).
   */
  async create(
    tenantId: string,
    input: CreateContractInput,
    actor: { sellerUserId?: string | null } = {},
  ): Promise<Contract> {
    const [client, defaults] = await Promise.all([
      getDigitalSaudeClient(tenantId),
      getIntegrationDefaults(tenantId),
    ])

    const convenioCodigo = input.convenioCodigo ?? defaults.convenioCodigo
    if (!defaults.grupoCodigo || !defaults.filialCodigo || !convenioCodigo) {
      throw AppError.businessRule(
        'Configure grupo e filial padrão do inquilino (e informe o convênio) antes de registrar adesões',
      )
    }

    const holderAddress = input.holder.address
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
        ...(input.holder.genderId ? { sexo: { id: input.holder.genderId } } : {}),
        ...(input.holder.maritalStatusId ? { estatoCivil: { id: input.holder.maritalStatusId } } : {}),
      },
      ...input.dependents.map(dependent => ({
        nome: dependent.name,
        cpf: dependent.cpf,
        dataNascimento: dependent.birthDate,
        nomeMae: dependent.motherName,
        tipoBeneficiario: { id: UPSTREAM_ID_BY_BENEFICIARY_KIND[dependent.kind] },
        parentesco: { id: dependent.relationshipId },
        ...(dependent.genderId ? { sexo: { id: dependent.genderId } } : {}),
      })),
    ]

    const result = await client.call('contratoIncluir', {
      numeroProposta: input.proposalNumber,
      dataAssinatura: input.signedAt,
      diaVencimento: input.dueDay,
      observacao: input.notes,
      plano: { codigo: input.planCodigo },
      convenio: { codigo: convenioCodigo },
      produtor: { codigo: await resolveProdutorCodigo(tenantId, input.sellerId) },
      grupo: { codigo: defaults.grupoCodigo },
      filial: { codigo: defaults.filialCodigo },
      opcionalList: input.optionalCodes?.map(codigo => ({ codigo })),
      beneficiarioList,
    })

    const created = result[0]
    if (!created) {
      throw AppError.businessRule('A Digital Saúde não retornou o contrato criado')
    }

    const mapped = mapContract(created)
    await contractsRepository.upsertFromUpstream(tenantId, mapped, {
      sellerUserId: actor.sellerUserId ?? input.sellerId ?? null,
    })
    logger.info(
      { tenantId, contrato: mapped.upstreamCodigo, proposta: mapped.proposalNumber },
      'Adesão registrada na Digital Saúde',
    )

    const stored = await contractsRepository.findByCodigo(tenantId, mapped.upstreamCodigo)
    return stored ? toDomain(stored) : mappedToDomain(mapped)
  },

  /** Muda o status do contrato de PENDENTE para PRODUZIDO no ERP. */
  async markAsProduced(tenantId: string, upstreamCodigo: string): Promise<Contract> {
    const client = await getDigitalSaudeClient(tenantId)
    await client.call('contratoRetornarParaProduzido', { codigoContrato: upstreamCodigo })
    return this.refreshFromUpstream(tenantId, upstreamCodigo)
  },

  /** Dispara o e-mail da carteira provisória pelo próprio ERP. */
  async sendMembershipCardByEmail(tenantId: string, upstreamCodigo: string): Promise<string> {
    const client = await getDigitalSaudeClient(tenantId)
    return client.call('contratoEnviarCarteira', { codigoContrato: upstreamCodigo })
  },

  async attachDocument(tenantId: string, input: AttachDocumentInput) {
    const client = await getDigitalSaudeClient(tenantId)
    return client.call('anexoIncluir', {
      codigoContrato: input.contractUpstreamCodigo,
      nomeArquivo: input.fileName,
      linkAnexo: input.fileUrl,
    })
  },

  async declarePathology(tenantId: string, input: DeclarePathologyInput) {
    const client = await getDigitalSaudeClient(tenantId)
    return client.call('patologiaIncluir', {
      codigo: input.cid,
      nome: input.name,
      descricao: input.description,
      anoEvento: input.eventYear,
      numeroPergunta: input.questionNumber,
      beneficiario: { codigo: input.beneficiaryUpstreamCodigo },
    })
  },

  async registerPendency(tenantId: string, contractCodigo: string, pendencyCode: string) {
    const client = await getDigitalSaudeClient(tenantId)
    return client.call('pendenciaIncluir', {
      codigoPendencia: pendencyCode,
      contrato: { codigo: contractCodigo },
    })
  },

  /** Carteirinha digital do associado, montada a partir do espelho local. */
  async membershipCards(tenantId: string, clientUserId: string): Promise<MembershipCard[]> {
    const rows = await contractsRepository.findByClientUser(tenantId, clientUserId)
    return rows.flatMap(row =>
      row.beneficiaries.map(beneficiary => ({
        contractId: row.id,
        beneficiaryId: beneficiary.id,
        holderName: beneficiary.name,
        // O ERP não expõe número de carteira separado do código do beneficiário.
        cardNumber: beneficiary.upstreamCodigo ?? row.upstreamCodigo,
        planName: row.planName,
        status: row.status,
        effectiveDate: beneficiary.effectiveDate,
        provisionalCardUrl: beneficiary.provisionalCardUrl,
      })),
    )
  },
}

/** Resolve o `codigo` do produtor no ERP a partir do vendedor Annetec. */
async function resolveProdutorCodigo(tenantId: string, sellerId?: string): Promise<string> {
  const { sellersService } = await import('@/modules/users/service')
  const codigo = sellerId ? await sellersService.upstreamProdutorCodigo(tenantId, sellerId) : null
  if (codigo) return codigo
  throw AppError.businessRule(
    'Vendedor sem código de produtor vinculado na Digital Saúde. Vincule antes de registrar a adesão.',
  )
}

type StoredContract = Awaited<ReturnType<typeof contractsRepository.findByCodigo>>

function toDomain(row: NonNullable<StoredContract>): Contract {
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
    beneficiaries: row.beneficiaries.map(beneficiary => ({
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
      status: beneficiary.status,
    })),
  }
}

/** Fallback quando o espelho ainda não foi lido de volta (corrida rara). */
function mappedToDomain(mapped: MappedContract): Contract {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    tenantId: '00000000-0000-0000-0000-000000000000',
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
    syncedAt: new Date().toISOString(),
    beneficiaries: [],
  }
}
