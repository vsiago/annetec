import { isValidCnpj, telefone } from '@annetec/contracts'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { crmService } from '@/modules/crm/service'
import { findPublicClubPlan, type PublicClubPlan } from './public-club-plans'

/**
 * Captura de lead da vitrine pública — `POST /t/:slug/public/leads`.
 *
 * Existe porque `POST /crm/leads` exige sessão de admin ou vendedor: o
 * formulário de `/[tenant]/cadastro` chamava aquela rota e, para o visitante
 * anônimo — justamente quem preenche —, recebia 401 enquanto a tela mostrava
 * "enviado". O corpo aqui é mais estreito que o do CRM: o visitante não
 * escolhe etapa do funil, vendedor nem valor; isso é decisão da equipe.
 *
 * Anti-spam em duas camadas baratas: teto de tamanho em cada campo (e no
 * corpo inteiro, no controller) e um honeypot — `website` fica escondido na
 * tela, então só robô o preenche. Nesse caso a resposta é a mesma do sucesso
 * e nada é gravado: devolver erro ensinaria o robô a desviar.
 */

export const LEAD_ORIGINS = ['cadastro', 'empresas', 'contato'] as const
export type LeadOrigin = (typeof LEAD_ORIGINS)[number]

/**
 * Vira a coluna "Origem" do CRM. O filtro daquela tela é montado a partir dos
 * valores gravados, então cada porta de entrada da vitrine aparece separada.
 */
const ORIGEM_NO_CRM: Record<LeadOrigin, string> = {
  cadastro: 'Site · Cadastro',
  empresas: 'Site · Empresas',
  contato: 'Site · Contato',
}

/**
 * Campo opcional do formulário chega como `''` quando a pessoa não preenche.
 * Tratar como ausente aqui — e não com `.or(z.literal(''))` — mantém a
 * mensagem do campo ("E-mail inválido") em vez do "Invalid input" genérico
 * que o zod dá quando todas as opções de uma união falham.
 */
const vazioComoAusente = (valor: unknown) =>
  typeof valor === 'string' && valor.trim() === '' ? undefined : valor

const opcional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(vazioComoAusente, schema.optional())

const textoOpcional = (max: number) => opcional(z.string().trim().max(max, `Use até ${max} caracteres`))

export const publicLeadInput = z
  .object({
    name: z.string().trim().min(2, 'Informe seu nome').max(120, 'Nome longo demais'),
    email: opcional(z.string().trim().toLowerCase().max(160, 'E-mail longo demais').email('E-mail inválido')),
    phone: z.string().max(30, 'Telefone inválido').pipe(telefone),
    origin: z.enum(LEAD_ORIGINS).default('cadastro'),
    subject: textoOpcional(120),
    message: textoOpcional(2000),
    planId: opcional(z.string().uuid('Plano inválido')),
    company: z
      .object({
        name: z.string().trim().min(2, 'Informe o nome da empresa').max(160, 'Nome longo demais'),
        document: opcional(z.string().trim().max(20).refine(isValidCnpj, 'CNPJ inválido')),
        employees: textoOpcional(40),
        role: textoOpcional(80),
      })
      .optional(),
    /** Honeypot: campo invisível para gente, irresistível para robô. */
    website: z.string().max(500).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.origin === 'empresas' && !input.company) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['company', 'name'],
        message: 'Informe o nome da empresa',
      })
    }
  })

export type PublicLeadInput = z.infer<typeof publicLeadInput>

/** Teto do corpo da requisição — um cadastro real não chega perto disso. */
export const PUBLIC_LEAD_BODY_MAX = 16 * 1024

/**
 * Grava o lead no funil do inquilino. Devolve `leadId: null` quando o
 * honeypot barrou a requisição — o controller responde igual nos dois casos.
 */
export async function capturePublicLead(
  tenantId: string,
  input: PublicLeadInput,
): Promise<{ leadId: string | null }> {
  if (input.website && input.website.trim() !== '') {
    logger.warn({ tenantId, origin: input.origin }, 'Lead da vitrine descartado pelo honeypot')
    return { leadId: null }
  }

  // Plano desconhecido, inativo ou de outro inquilino é ignorado em vez de
  // recusar o cadastro: perder o contato por causa de um link velho não vale.
  const plano = input.planId ? await findPublicClubPlan(tenantId, input.planId) : null

  const lead = await crmService.createLead(tenantId, {
    name: input.name,
    email: input.email ? input.email : null,
    phone: telefoneFormatado(input.phone),
    source: ORIGEM_NO_CRM[input.origin],
    status: 'new',
    notes: montarObservacoes(input, plano) || null,
    estimatedValue: plano ? plano.priceMonthly : null,
    sellerId: null,
  })

  logger.info({ tenantId, leadId: lead.id, origin: input.origin }, 'Lead capturado pela vitrine')
  return { leadId: lead.id }
}

/**
 * O que a pessoa contou vira texto nas observações do lead, uma informação
 * por linha — é o que o vendedor lê antes de ligar.
 */
function montarObservacoes(input: PublicLeadInput, plano: PublicClubPlan | null): string {
  const linhas: string[] = []
  if (input.subject) linhas.push(`Assunto: ${input.subject}`)
  if (plano) linhas.push(`Plano de interesse: ${plano.name} (${reais(plano.priceMonthly)}/mês)`)
  if (input.company) {
    linhas.push(`Empresa: ${input.company.name}`)
    if (input.company.document) linhas.push(`CNPJ: ${cnpjFormatado(input.company.document)}`)
    if (input.company.employees) linhas.push(`Colaboradores: ${input.company.employees}`)
    if (input.company.role) linhas.push(`Cargo do contato: ${input.company.role}`)
  }
  if (input.message) linhas.push(`Mensagem: ${input.message}`)
  return linhas.join('\n')
}

function reais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Mesmo formato que o painel grava ("(22) 99987-6543"), para a lista não misturar estilos. */
function telefoneFormatado(digitos: string): string {
  if (digitos.length === 11) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`
  if (digitos.length === 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`
  return digitos
}

function cnpjFormatado(valor: string): string {
  const d = valor.replace(/\D/g, '')
  if (d.length !== 14) return valor
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}
