import { z } from 'zod'
import { cpf, dateOnly, email, telefone, uf, uuid } from '../common/primitives'
import { beneficiaryKind, contractStatus, tenantRole } from './enums'

/**
 * Bloco comercial do vendedor, anexado ao usuário quando `role: 'seller'`.
 *
 * Vem de `seller_profiles`, tabela Annetec — nada aqui é da Digital Saúde.
 * A única ponte com o ERP é `upstreamProdutorCodigo`, que já vive no próprio
 * `tenantUser`.
 */
export const tenantUserSellerProfile = z.object({
  region: z.string().nullable(),
  salesGoal: z.number().nonnegative(),
  commissionRate: z.number().min(0).max(1),
  /**
   * Somatório das vendas CONFIRMADAS do vendedor neste inquilino. É calculado
   * na consulta, não gravado: guardar o acumulado exigiria mantê-lo em dia a
   * cada venda cancelada ou corrigida, e ele silenciosamente divergiria.
   */
  totalSales: z.number().nonnegative(),
})
export type TenantUserSellerProfile = z.infer<typeof tenantUserSellerProfile>

/**
 * Bloco do associado, anexado quando `role: 'client'`.
 *
 * Divide-se em duas origens, e é por isso que quase tudo é anulável:
 *  - `cpf` é Annetec (`client_profiles`), preenchido no cadastro;
 *  - plano, situação, data de adesão e carteirinha vêm do CONTRATO, cuja
 *    fonte de verdade é a Digital Saúde. Associado cadastrado antes da adesão
 *    existir simplesmente não tem contrato, e todos esses campos vêm nulos.
 *
 * `city` fica de fora de propósito: o endereço do beneficiário só existe
 * dentro de `beneficiaries.raw`, sem coluna própria — expor daqui seria
 * prometer um campo que não dá para filtrar nem ordenar.
 */
export const tenantUserClientProfile = z.object({
  cpf: z.string().nullable(),
  /**
   * De onde vieram plano, situação e adesão abaixo:
   *  - `contrato`: do contrato espelhado da Digital Saúde, a fonte de verdade
   *    quando o inquilino opera integrado ao ERP;
   *  - `venda`: do registro comercial no CRM da Annetec, usado enquanto a
   *    adesão não virou contrato lá (ou quando o inquilino não usa o ERP);
   *  - `null`: associado cadastrado e ainda sem nenhuma adesão.
   *
   * O campo é explícito para a tela poder dizer o que está mostrando, em vez
   * de exibir um plano sem o leitor saber se aquilo já existe no ERP.
   */
  source: z.enum(['contrato', 'venda']).nullable(),
  primaryContractCodigo: z.string().nullable(),
  planName: z.string().nullable(),
  /**
   * Situação da adesão, já reduzida ao vocabulário da tela. O estado bruto do
   * ERP continua em `upstreamStatus` do contrato — nada se perde.
   */
  planStatus: z.enum(['active', 'pending', 'cancelled']).nullable(),
  /** Situação original do contrato no ERP; `null` quando a origem é `venda`. */
  contractStatus: contractStatus.nullable(),
  /** Data de adesão, ISO. */
  contractSignedAt: z.string().nullable(),
  /**
   * Número da carteirinha: o `codigo` do contrato na Digital Saúde, que é o
   * que o associado apresenta no parceiro e o que o ERP reconhece. Sem
   * contrato não há carteirinha — e inventar um número aqui criaria um
   * identificador que nenhum outro sistema aceita.
   */
  cardNumber: z.string().nullable(),
  monthlyValue: z.number().nullable(),
  /** Vendedor responsável pela adesão, quando ela nasceu no CRM. */
  sellerUserId: uuid.nullable(),
})
export type TenantUserClientProfile = z.infer<typeof tenantUserClientProfile>

/** Usuário de um inquilino (admin, vendedor ou cliente). */
export const tenantUser = z.object({
  id: uuid,
  tenantId: uuid,
  name: z.string().min(1),
  email,
  role: tenantRole,
  phone: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  /** Só populado para `role: 'seller'` — código do produtor vinculado na Digital Saúde. */
  upstreamProdutorCodigo: z.string().nullable().optional(),
  /**
   * Se a senha do produtor está guardada. `/recibo/procurarPorEmitido|Pago` do
   * ERP exige login e senha do produtor em query string, então sem ela a tela
   * de comissões só consegue mostrar erro. A senha em si nunca sai da API —
   * este booleano existe para a interface avisar antes de alguém clicar.
   */
  hasProdutorCredentials: z.boolean().optional(),
  /** Presente só para `role: 'seller'`; `null` nos demais papéis. */
  sellerProfile: tenantUserSellerProfile.nullable().optional(),
  /** Presente só para `role: 'client'`; `null` nos demais papéis. */
  clientProfile: tenantUserClientProfile.nullable().optional(),
})
export type TenantUser = z.infer<typeof tenantUser>

/**
 * `sellerProfile`/`clientProfile` ficam de fora: são LEITURA derivada de
 * outras tabelas (e, no caso do associado, do contrato na Digital Saúde).
 * Aceitá-los na criação sugeriria que dá para gravar plano e carteirinha por
 * aqui — dá não, isso nasce da adesão.
 */
export const createTenantUserInput = tenantUser
  .omit({
    id: true,
    tenantId: true,
    createdAt: true,
    avatarUrl: true,
    active: true,
    upstreamProdutorCodigo: true,
    sellerProfile: true,
    clientProfile: true,
  })
  .extend({
    password: z.string().min(8).optional(),
    active: z.boolean().default(true),
    /**
     * Só faz sentido com `role: 'client'` — é o CPF do associado, que vai
     * para `client_profiles`. Opcional porque o cadastro pode nascer antes do
     * documento (lead que virou associado, importação parcial); sem ele o
     * perfil do associado simplesmente não é criado ainda.
     */
    cpf: cpf.optional(),
  })
export type CreateTenantUserInput = z.infer<typeof createTenantUserInput>

export const updateTenantUserInput = createTenantUserInput.partial()
export type UpdateTenantUserInput = z.infer<typeof updateTenantUserInput>

/**
 * Redefinição de senha de um usuário de inquilino pela equipe Annetec.
 *
 * Sem senha atual de propósito: é um reset administrativo, não uma troca do
 * próprio dono da conta (essa é `POST /auth/password`). Omitir `password`
 * faz a API gerar uma provisória e devolvê-la uma única vez — o mesmo padrão
 * do wizard de criação de inquilino.
 */
export const resetTenantUserPasswordInput = z.object({
  password: z.string().min(8).optional(),
})
export type ResetTenantUserPasswordInput = z.infer<typeof resetTenantUserPasswordInput>

/** Perfil comercial de um usuário com papel `seller`. */
export const sellerProfile = z.object({
  userId: uuid,
  region: z.string().nullable(),
  salesGoal: z.number().nonnegative(),
  totalSales: z.number().nonnegative(),
  commissionRate: z.number().min(0).max(1),
  /** `codigo` do produtor correspondente na Digital Saúde. */
  upstreamProdutorCodigo: z.string().nullable(),
  /** Login do produtor no upstream, usado nos endpoints de recibo. */
  upstreamProdutorLogin: z.string().nullable(),
})
export type SellerProfile = z.infer<typeof sellerProfile>

export const address = z.object({
  street: z.string().nullable(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  neighborhood: z.string().nullable(),
  city: z.string().nullable(),
  state: uf.nullable(),
  zipCode: z.string().nullable(),
})
export type Address = z.infer<typeof address>

/**
 * Beneficiário normalizado a partir de `DsBeneficiario`. Um contrato tem um
 * beneficiário `titular` e zero ou mais `dependente`/`agregado`.
 */
export const beneficiary = z.object({
  id: uuid,
  contractId: uuid,
  upstreamCodigo: z.string().nullable(),
  kind: beneficiaryKind,
  name: z.string(),
  cpf: z.string().nullable(),
  birthDate: z.string().nullable(),
  motherName: z.string().nullable(),
  relationship: z.string().nullable(),
  gender: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: address.nullable(),
  monthlyFee: z.number().nullable(),
  effectiveDate: z.string().nullable(),
  /** `linkCarteiraProvisoria` do upstream. */
  provisionalCardUrl: z.string().nullable(),
  status: z.string().nullable(),
})
export type Beneficiary = z.infer<typeof beneficiary>

/** Contrato normalizado a partir de `DsContrato`. */
export const contract = z.object({
  id: uuid,
  tenantId: uuid,
  upstreamCodigo: z.string(),
  proposalNumber: z.string().nullable(),
  holderName: z.string().nullable(),
  status: contractStatus,
  /** `statusContrato.nome` original, preservado para auditoria. */
  upstreamStatus: z.string().nullable(),
  signedAt: z.string().nullable(),
  dueDay: z.number().int().min(1).max(31).nullable(),
  monthlyValue: z.number().nullable(),
  outstandingBalance: z.number().nullable(),
  planCodigo: z.string().nullable(),
  planName: z.string().nullable(),
  convenioCodigo: z.string().nullable(),
  convenioName: z.string().nullable(),
  sellerUpstreamCodigo: z.string().nullable(),
  /** Vinculos locais Annetec, usados nas regras de visibilidade. */
  clientUserId: uuid.nullable(),
  sellerUserId: uuid.nullable(),
  beneficiaries: z.array(beneficiary),
  syncedAt: z.string().datetime().nullable(),
})
export type Contract = z.infer<typeof contract>

/**
 * Entrada da adesão (POST /contrato/ no upstream). A API preenche
 * `grupo`/`filial`/`convenio` a partir da configuração do inquilino, por isso
 * eles não aparecem aqui.
 */
export const createContractInput = z.object({
  proposalNumber: z.string().min(1),
  signedAt: dateOnly,
  dueDay: z.number().int().min(1).max(31),
  planCodigo: z.string().min(1),
  /**
   * Convênio da adesão. Opcional porque um inquilino comum tem um único
   * convênio fixo (configurado em `tenant_integrations`); a Annetec operando
   * como operadora vende sob vários convênios ao mesmo tempo, então informa
   * aqui qual — sem isso, cai no padrão do inquilino.
   */
  convenioCodigo: z.string().min(1).optional(),
  sellerId: uuid.optional(),
  notes: z.string().optional(),
  optionalCodes: z.array(z.string()).optional(),
  holder: z.object({
    name: z.string().min(1),
    cpf,
    birthDate: dateOnly,
    email,
    phone: telefone,
    motherName: z.string().optional(),
    genderId: z.number().int().optional(),
    maritalStatusId: z.number().int().optional(),
    address: z.object({
      street: z.string().min(1),
      number: z.string().min(1),
      complement: z.string().optional(),
      neighborhood: z.string().min(1),
      city: z.string().min(1),
      state: uf,
      zipCode: z.string().min(8),
    }),
  }),
  dependents: z
    .array(
      z.object({
        name: z.string().min(1),
        cpf: cpf.optional(),
        birthDate: dateOnly,
        relationshipId: z.number().int(),
        kind: beneficiaryKind.default('dependente'),
        motherName: z.string().optional(),
        genderId: z.number().int().optional(),
      }),
    )
    .default([]),
})
export type CreateContractInput = z.infer<typeof createContractInput>

/** Carteirinha digital exibida ao associado. */
export const membershipCard = z.object({
  contractId: uuid,
  beneficiaryId: uuid,
  holderName: z.string(),
  cardNumber: z.string(),
  planName: z.string().nullable(),
  status: contractStatus,
  effectiveDate: z.string().nullable(),
  provisionalCardUrl: z.string().nullable(),
})
export type MembershipCard = z.infer<typeof membershipCard>

/** Declaração de saúde / patologia enviada ao upstream. */
export const declarePathologyInput = z.object({
  beneficiaryUpstreamCodigo: z.string().min(1),
  cid: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  eventYear: z.string().optional(),
  questionNumber: z.string().optional(),
})
export type DeclarePathologyInput = z.infer<typeof declarePathologyInput>

/** Anexo de documento a um contrato (POST /anexo/). */
export const attachDocumentInput = z.object({
  contractUpstreamCodigo: z.string().min(1),
  fileName: z.string().min(1),
  fileUrl: z.string().url(),
})
export type AttachDocumentInput = z.infer<typeof attachDocumentInput>
