import type {
  Benefit as ApiBenefit,
  Lead as ApiLead,
  Partner as ApiPartner,
  Appointment as ApiAppointment,
  AppointmentMessage as ApiAppointmentMessage,
  ClubPlan as ApiClubPlan,
  Sale as ApiSale,
  SalesGoal as ApiSalesGoal,
  TenantUser as ApiTenantUser,
  CreateTenantUserInput,
  UpdateTenantUserInput,
} from '@annetec/contracts'
import type {
  Appointment,
  AppointmentMessage,
  Benefit,
  Client,
  ClientPlan,
  Interaction,
  Lead,
  Partner,
  Sale,
  SalesGoal,
  Seller,
  User,
} from '@/lib/types'

/**
 * Conversão entre o que a API devolve e o que as telas do painel consomem.
 *
 * Os dois lados divergem de propósito, não por desleixo:
 *  - a API é fiel ao banco, onde quase tudo é anulável e data é ISO string;
 *  - a tela precisa de valor presente e `Date`, senão cada componente teria
 *    que tratar `null` e parsear string por conta própria.
 *
 * Concentrar a tradução aqui é o que permite trocar o mock pela API sem
 * reescrever página nenhuma. Quando os tipos do painel forem aposentados em
 * favor dos contratos, este arquivo some.
 */

const AGORA = () => new Date()

export function leadDaApi(dto: ApiLead): Lead {
  return {
    id: dto.id,
    tenantId: dto.tenantId,
    name: dto.name,
    email: dto.email ?? '',
    phone: dto.phone ?? '',
    source: dto.source ?? '',
    status: dto.status,
    notes: dto.notes ?? '',
    value: dto.estimatedValue ?? 0,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
    sellerId: dto.sellerId ?? '',
    interactions: (dto.interactions ?? []).map(
      (item): Interaction => ({
        id: item.id,
        type: item.type,
        description: item.description,
        date: new Date(item.occurredAt),
      }),
    ),
  }
}

/**
 * `createLeadInput` exige as OITO chaves presentes — `.nullable()` aceita o
 * valor null mas nao torna a chave opcional. Por isso a criacao monta todas,
 * com null onde a tela nao tem valor, em vez de reaproveitar o patch parcial.
 *
 * `interest` nao entra: nao existe no contrato ainda.
 */
export function leadParaApiCriacao(lead: Partial<Lead>) {
  return {
    name: lead.name ?? '',
    email: lead.email || null,
    phone: lead.phone || null,
    source: lead.source || null,
    status: lead.status ?? 'new',
    notes: lead.notes || null,
    estimatedValue: lead.value ?? null,
    sellerId: lead.sellerId || null,
  }
}

/** Campos do lead que a API aceita gravar numa atualizacao parcial. */
export function leadParaApi(lead: Partial<Lead>) {
  return {
    ...(lead.name !== undefined ? { name: lead.name } : {}),
    ...(lead.email !== undefined ? { email: lead.email || null } : {}),
    ...(lead.phone !== undefined ? { phone: lead.phone || null } : {}),
    ...(lead.source !== undefined ? { source: lead.source || null } : {}),
    ...(lead.status !== undefined ? { status: lead.status } : {}),
    ...(lead.notes !== undefined ? { notes: lead.notes || null } : {}),
    ...(lead.value !== undefined ? { estimatedValue: lead.value } : {}),
    ...(lead.sellerId !== undefined ? { sellerId: lead.sellerId || null } : {}),
  }
}

export function vendaDaApi(dto: ApiSale): Sale {
  return {
    id: dto.id,
    tenantId: dto.tenantId,
    clientId: dto.clientUserId ?? '',
    clientName: dto.clientName,
    sellerId: dto.sellerId,
    sellerName: dto.sellerName,
    plan: dto.planName ?? '',
    value: dto.value,
    commission: dto.commission,
    date: new Date(dto.soldAt),
    status: dto.status,
  }
}

/**
 * `createSaleInput` exige as DEZ chaves presentes (`.nullable()` aceita null,
 * mas nao torna a chave opcional). `sellerId` e `clientName` sao os unicos
 * sem padrao razoavel: sem vendedor nao ha a quem creditar a comissao.
 *
 * `commission` NAO entra: o servidor a recalcula pela taxa vigente do
 * vendedor. Mandar um valor daqui seria comissao digitada a mao.
 */
export function vendaParaApiCriacao(venda: Partial<Sale>) {
  return {
    leadId: null,
    clientUserId: venda.clientId || null,
    clientName: venda.clientName ?? '',
    sellerId: venda.sellerId ?? '',
    planCodigo: null,
    planName: venda.plan || null,
    value: venda.value ?? 0,
    status: venda.status ?? 'pending',
    soldAt: (venda.date ? new Date(venda.date) : AGORA()).toISOString(),
    contractUpstreamCodigo: null,
  }
}

export function vendaParaApi(venda: Partial<Sale>) {
  return {
    ...(venda.clientName !== undefined ? { clientName: venda.clientName } : {}),
    ...(venda.plan !== undefined ? { planName: venda.plan || null } : {}),
    ...(venda.value !== undefined ? { value: venda.value } : {}),
    ...(venda.status !== undefined ? { status: venda.status } : {}),
    ...(venda.date !== undefined ? { soldAt: new Date(venda.date).toISOString() } : {}),
  }
}

export function parceiroDaApi(dto: ApiPartner): Partner {
  return {
    id: dto.id,
    tenantId: dto.tenantId,
    name: dto.name,
    tagline: dto.tagline ?? undefined,
    category: dto.category,
    discountPercent: dto.discountPercent,
    address: dto.address ?? '',
    // A tela guarda cidade e UF num campo so ("Cabo Frio - RJ"), entao os dois
    // sao recompostos aqui — e `cidadeSemUf`/`ufDaCidade` os separam na volta.
    city: dto.city ? (dto.state ? `${dto.city} - ${dto.state}` : dto.city) : undefined,
    phone: dto.phone ?? '',
    email: dto.email ?? undefined,
    website: dto.website ?? undefined,
    specialties: dto.specialties.length > 0 ? dto.specialties : undefined,
    since: dto.since ? new Date(dto.since) : undefined,
    status: dto.status,
  }
}

/** `Date` -> `yyyy-MM-dd`, que e o formato que o contrato aceita em `since`. */
function dataSimples(valor?: Date): string | null {
  if (!valor) return null
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/**
 * `createPartnerInput` exige as OITO chaves presentes: no zod `.nullable()`
 * aceita o valor null, mas nao torna a chave opcional. Por isso o corpo de
 * criacao monta todas, com null onde a tela nao tem valor.
 *
 * `state` nao existe no tipo do painel — a tela guarda "Cabo Frio - RJ" num
 * campo so. Extraimos a UF do sufixo; sem sufixo reconhecivel vai null.
 */
export function parceiroParaApiCriacao(parceiro: Partial<Partner>) {
  return {
    name: parceiro.name ?? '',
    tagline: parceiro.tagline || null,
    category: parceiro.category ?? 'other',
    discountPercent: parceiro.discountPercent ?? 0,
    address: parceiro.address || null,
    phone: parceiro.phone || null,
    email: parceiro.email || null,
    website: parceiro.website || null,
    city: cidadeSemUf(parceiro.city),
    state: ufDaCidade(parceiro.city),
    specialties: parceiro.specialties ?? [],
    since: dataSimples(parceiro.since),
    status: parceiro.status ?? 'active',
  }
}

/** Atualizacao aceita parcial: so o que mudou. */
export function parceiroParaApi(parceiro: Partial<Partner>) {
  return {
    ...(parceiro.name !== undefined ? { name: parceiro.name } : {}),
    ...(parceiro.tagline !== undefined ? { tagline: parceiro.tagline || null } : {}),
    ...(parceiro.category !== undefined ? { category: parceiro.category } : {}),
    ...(parceiro.discountPercent !== undefined
      ? { discountPercent: parceiro.discountPercent }
      : {}),
    ...(parceiro.address !== undefined ? { address: parceiro.address || null } : {}),
    ...(parceiro.city !== undefined
      ? { city: cidadeSemUf(parceiro.city), state: ufDaCidade(parceiro.city) }
      : {}),
    ...(parceiro.phone !== undefined ? { phone: parceiro.phone || null } : {}),
    ...(parceiro.email !== undefined ? { email: parceiro.email || null } : {}),
    ...(parceiro.website !== undefined ? { website: parceiro.website || null } : {}),
    ...(parceiro.specialties !== undefined ? { specialties: parceiro.specialties ?? [] } : {}),
    ...(parceiro.since !== undefined ? { since: dataSimples(parceiro.since) } : {}),
    ...(parceiro.status !== undefined ? { status: parceiro.status } : {}),
  }
}

/**
 * `as const` e nao `Set`: o contrato tipa `state` como a uniao das 27 UFs, e
 * so a tupla literal permite estreitar `string` ate ela. Com `Set<string>` o
 * `has()` nao estreita nada e o POST nao compila.
 */
const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const

type Uf = (typeof UFS)[number]

/** "Cabo Frio - RJ" -> "Cabo Frio". */
function cidadeSemUf(valor?: string): string | null {
  if (!valor) return null
  const partes = valor.split(' - ')
  return (partes.length > 1 ? partes.slice(0, -1).join(' - ') : valor).trim() || null
}

/** "Cabo Frio - RJ" -> "RJ"; sem sufixo de UF valido, null. */
function ufDaCidade(valor?: string): Uf | null {
  if (!valor) return null
  const sufixo = valor.split(' - ').pop()?.trim().toUpperCase()
  return UFS.find(uf => uf === sufixo) ?? null
}

export function beneficioDaApi(dto: ApiBenefit): Benefit {
  return {
    id: dto.id,
    tenantId: dto.tenantId,
    name: dto.name,
    description: dto.description ?? '',
    category: dto.category,
    discount: dto.discountPercent ?? undefined,
    provider: dto.provider ?? undefined,
    locations: dto.locations ?? undefined,
  }
}

/**
 * `createBenefitInput` exige as seis chaves. Atencao a duas: `description` e
 * `locations` sao NAO-nulos no contrato (string e array), entao vazio vira
 * `''` e `[]`, nunca null — mandar null faz o zod recusar o POST inteiro.
 */
export function beneficioParaApiCriacao(beneficio: Partial<Benefit>) {
  return {
    name: beneficio.name ?? '',
    description: beneficio.description ?? '',
    category: beneficio.category ?? 'health',
    discountPercent: beneficio.discount ?? null,
    provider: beneficio.provider || null,
    locations: beneficio.locations ?? [],
  }
}

export function beneficioParaApi(beneficio: Partial<Benefit>) {
  return {
    ...(beneficio.name !== undefined ? { name: beneficio.name } : {}),
    ...(beneficio.description !== undefined ? { description: beneficio.description ?? '' } : {}),
    ...(beneficio.category !== undefined ? { category: beneficio.category } : {}),
    ...(beneficio.discount !== undefined ? { discountPercent: beneficio.discount ?? null } : {}),
    ...(beneficio.provider !== undefined ? { provider: beneficio.provider || null } : {}),
    ...(beneficio.locations !== undefined ? { locations: beneficio.locations ?? [] } : {}),
  }
}

/**
 * Meta de venda. Aqui os dois lados ja coincidem campo a campo — a funcao
 * existe para manter a fronteira num lugar so, e para nao deixar a tela
 * consumindo o DTO cru e passar a depender dele sem perceber.
 *
 * `commissionRate` e fracao (0.12 = 12%) nos DOIS lados; as telas multiplicam
 * por 100 na hora de exibir. Nao converter aqui.
 */
export function metaDaApi(dto: ApiSalesGoal): SalesGoal {
  return {
    id: dto.id,
    tenantId: dto.tenantId,
    sellerId: dto.sellerId,
    month: dto.month,
    year: dto.year,
    target: dto.target,
    achieved: dto.achieved,
    commissionRate: dto.commissionRate,
  }
}

/**
 * `upsertSalesGoalInput` exige as cinco chaves e NAO aceita `achieved`: o
 * realizado e somado das vendas pelo servidor, nunca informado pela tela.
 */
export function metaParaApi(meta: Partial<SalesGoal>) {
  return {
    sellerId: meta.sellerId ?? '',
    month: meta.month ?? 1,
    year: meta.year ?? 0,
    target: meta.target ?? 0,
    commissionRate: meta.commissionRate ?? 0,
  }
}

/**
 * Usuario do inquilino. A API devolve um `TenantUser` com dois blocos
 * opcionais — `sellerProfile` e `clientProfile` — e o painel tem tres tipos
 * distintos (`User`, `Seller`, `Client`). A escolha e pelo papel.
 */
export function usuarioDaApi(dto: ApiTenantUser): User | Seller | Client {
  const base: User = {
    id: dto.id,
    tenantId: dto.tenantId,
    name: dto.name,
    email: dto.email,
    role: dto.role,
    phone: dto.phone ?? undefined,
    avatar: dto.avatarUrl ?? undefined,
    createdAt: new Date(dto.createdAt),
    active: dto.active,
    // API anterior ao `accessStatus`: só havia o booleano, e inativo era exclusão.
    accessStatus: dto.accessStatus ?? (dto.active ? 'active' : 'removed'),
    banned: dto.banned ?? false,
    lastLoginAt: dto.lastLoginAt ? new Date(dto.lastLoginAt) : undefined,
    lastLoginUserAgent: dto.lastLoginUserAgent ?? undefined,
  }

  if (dto.role === 'seller') {
    const perfil = dto.sellerProfile
    return {
      ...base,
      role: 'seller',
      region: perfil?.region ?? '',
      salesGoal: perfil?.salesGoal ?? 0,
      totalSales: perfil?.totalSales ?? 0,
      commissionRate: perfil?.commissionRate ?? 0,
    }
  }

  if (dto.role === 'client') {
    const perfil = dto.clientProfile
    return {
      ...base,
      role: 'client',
      cpf: perfil?.cpf ?? '',
      // `city` e `dependents` ainda nao tem origem na API: o endereco do
      // beneficiario so existe dentro de `beneficiaries.raw` e os dependentes
      // vivem no contrato. A ficha do beneficiario busca o contrato a parte;
      // aqui vai vazio em vez de um valor inventado.
      city: undefined,
      plan: perfil?.planName ?? '',
      planStatus: perfil?.planStatus ?? 'pending',
      contractDate: perfil?.contractSignedAt ? new Date(perfil.contractSignedAt) : base.createdAt,
      cardNumber: perfil?.cardNumber ?? '',
      dependents: [],
      sellerId: perfil?.sellerUserId ?? '',
    }
  }

  return base
}

/**
 * `createTenantUserInput` exige `name`, `email`, `role` e `phone` (anulavel,
 * mas chave obrigatoria). Os campos comerciais do painel — meta, comissao,
 * CPF, plano — NAO entram: eles sao leitura derivada de outras tabelas e do
 * contrato na Digital Saude, e mandar aqui seria descartado em silencio.
 */
export function usuarioParaApiCriacao(
  usuario: Partial<User> & { cpf?: string },
): CreateTenantUserInput {
  return {
    name: usuario.name ?? '',
    email: usuario.email ?? '',
    role: usuario.role ?? 'client',
    phone: usuario.phone || null,
    active: true,
    // Sem senha: a API gera a provisória e a envia por e-mail ao usuário.
    // CPF e o unico campo comercial que a criacao grava: ele vira o perfil do
    // associado e e por ele que o contrato da Digital Saude e reconciliado.
    ...(usuario.role === 'client' && usuario.cpf ? { cpf: usuario.cpf } : {}),
  }
}

/** Atualizacao parcial: so os campos que `PATCH /usuarios/:id` sabe gravar. */
export function usuarioParaApi(patch: Partial<User> & { cpf?: string }): UpdateTenantUserInput {
  return {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.email !== undefined ? { email: patch.email } : {}),
    ...(patch.role !== undefined ? { role: patch.role } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone || null } : {}),
    ...(patch.cpf ? { cpf: patch.cpf } : {}),
  }
}

/**
 * Campos que o painel manda em `updateUser` mas que `PATCH /usuarios/:id` nao
 * grava — todos comerciais do associado ou do vendedor.
 *
 * Existe para a tela poder AVISAR em vez de mostrar "salvo" sobre uma
 * alteracao que o servidor descartou. Plano, situacao e carteirinha nascem da
 * adesao (contrato na Digital Saude); meta e comissao ainda nao tem rota de
 * escrita propria.
 */
const CAMPOS_SEM_DESTINO = [
  'plan', 'planStatus', 'contractDate', 'cardNumber', 'dependents', 'city',
  'region', 'salesGoal', 'totalSales', 'commissionRate', 'sellerId',
] as const

export function camposSemDestino(patch: Record<string, unknown>): string[] {
  return CAMPOS_SEM_DESTINO.filter(campo => patch[campo] !== undefined)
}

/**
 * Plano do clube. O painel chama o tipo de `ClientPlan` (plano do cliente do
 * inquilino) e a API de `ClubPlan` — mesmo objeto, nomes herdados de lados
 * diferentes. Nenhum dos dois e o `HealthPlan` do catalogo da Digital Saude.
 */
export function planoDaApi(dto: ApiClubPlan): ClientPlan {
  return {
    id: dto.id,
    tenantId: dto.tenantId,
    name: dto.name,
    priceMonthly: dto.priceMonthly,
    description: dto.description,
    features: dto.features,
    highlight: dto.highlight,
    audience: dto.audience ?? undefined,
    // Ausente na resposta (API antiga) = inclusos / sem limite.
    priceDependentMonthly: dto.priceDependentMonthly ?? null,
    maxDependents: dto.maxDependents ?? null,
  }
}

/** `createClubPlanInput` exige as oito chaves; nenhuma tem valor implicito. */
export function planoParaApiCriacao(plano: Partial<ClientPlan>) {
  return {
    name: plano.name ?? '',
    description: plano.description ?? '',
    priceMonthly: plano.priceMonthly ?? 0,
    features: plano.features ?? [],
    audience: plano.audience || null,
    highlight: plano.highlight ?? false,
    // A amarracao com o produto do ERP e feita na tela de integracao, nao
    // aqui: o painel do inquilino nao tem de onde tirar o codigo.
    upstreamPlanCodigo: null,
    status: 'active' as const,
    priceDependentMonthly: plano.priceDependentMonthly ?? null,
    maxDependents: plano.maxDependents ?? null,
  }
}

export function planoParaApi(plano: Partial<ClientPlan>) {
  return {
    ...(plano.name !== undefined ? { name: plano.name } : {}),
    ...(plano.description !== undefined ? { description: plano.description ?? '' } : {}),
    ...(plano.priceMonthly !== undefined ? { priceMonthly: plano.priceMonthly } : {}),
    ...(plano.features !== undefined ? { features: plano.features ?? [] } : {}),
    ...(plano.audience !== undefined ? { audience: plano.audience || null } : {}),
    ...(plano.highlight !== undefined ? { highlight: plano.highlight } : {}),
    // `null` é valor de verdade aqui (limpa o campo); só `undefined` fica fora.
    ...(plano.priceDependentMonthly !== undefined
      ? { priceDependentMonthly: plano.priceDependentMonthly }
      : {}),
    ...(plano.maxDependents !== undefined ? { maxDependents: plano.maxDependents } : {}),
  }
}

/**
 * Chamado da mesa de atendimento. A API ja devolve o vocabulario final; aqui
 * so se trocam `null` por vazio e ISO por `Date`, como no resto do arquivo.
 */
export function atendimentoDaApi(dto: ApiAppointment): Appointment {
  return {
    id: dto.id,
    tenantId: dto.tenantId,
    clientId: dto.clientUserId ?? '',
    clientName: dto.clientName,
    subject: dto.subject,
    description: dto.description,
    channel: dto.channel,
    // `concluido` e o nome legado de `resolvido` no enum do banco; a tela
    // conhece so o novo, entao a traducao acontece aqui e nao em cada pagina.
    status: dto.status === 'concluido' ? 'resolvido' : dto.status,
    priority: dto.priority,
    assignedId: dto.assignedUserId ?? '',
    assignedName: dto.assignedName ?? '',
    protocol: dto.protocol ?? '',
    lastInteractionAt: new Date(dto.lastInteractionAt),
    createdAt: new Date(dto.createdAt),
    messages: (dto.messages ?? []).map(mensagemDaApi),
  }
}

export function mensagemDaApi(dto: ApiAppointmentMessage): AppointmentMessage {
  return {
    id: dto.id,
    kind: dto.kind,
    title: dto.title,
    body: dto.body,
    at: new Date(dto.createdAt),
    author: dto.authorName ?? undefined,
  }
}

/**
 * `createAppointmentInput` exige as sete chaves. `status` entra porque a mesa
 * pode abrir um chamado ja em atendimento (alguem ligou e foi atendido na
 * hora) — o padrao continua sendo a fila.
 */
export function atendimentoParaApiCriacao(atendimento: Partial<Appointment>) {
  return {
    clientUserId: atendimento.clientId || null,
    clientName: atendimento.clientName ?? '',
    subject: atendimento.subject ?? '',
    description: atendimento.description ?? '',
    channel: atendimento.channel ?? 'app',
    priority: atendimento.priority ?? 'normal',
    status: atendimento.status ?? 'aguardando',
    assignedUserId: atendimento.assignedId || null,
  }
}

/**
 * De quem e o chamado nao se corrige — para isso abre-se outro. O que muda e
 * o andamento: situacao, prioridade, assunto, descricao e responsavel.
 *
 * `assignedId` vazio vira `null` de proposito: e assim que o chamado volta
 * para a fila.
 */
export function atendimentoParaApi(patch: Partial<Appointment>) {
  return {
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.assignedId !== undefined ? { assignedUserId: patch.assignedId || null } : {}),
  }
}

/** Nova mensagem na thread; `title` e opcional na tela e vazio na API. */
export function mensagemParaApi(mensagem: Partial<AppointmentMessage>) {
  return {
    kind: mensagem.kind ?? 'saida',
    title: mensagem.title ?? '',
    body: mensagem.body ?? '',
  }
}

export { AGORA }
