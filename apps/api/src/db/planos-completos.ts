import {
  CLUB_PAYMENT_METHOD_LABELS,
  CLUB_PLAN_LEGAL_NOTICE,
  describeDependentRules,
  describeDependentsPolicy,
  describeEnrollmentFee,
  describeLoyalty,
  effectivePaymentMethods,
  type ClubPaymentMethod,
  type ClubPlanCoverage,
  type CreateClubPlanInput,
} from '@annetec/contracts'
import type { ResolvedBillingSettings } from '@/modules/club-billing/settings.service'

/**
 * Os 3 planos completos do clube (Essencial, Plus, Família) — conteúdo do
 * blueprint de planos (§Planos) — e o regulamento (`terms`) montado a partir
 * deles. Puro (sem banco): o seed `demo:planos` grava; os testes validam.
 */

// ---------------------------------------------------------------------------
// Conteúdo
// ---------------------------------------------------------------------------

const ADJUSTMENT_POLICY =
  'Reajuste anual na data de aniversário da adesão, pelo IPCA acumulado dos 12 meses anteriores (IBGE), ' +
  'com aviso prévio de 30 dias. Não há reajuste por mudança de idade.'

const TEXT = {
  tele: 'Clínico geral por vídeo, 24 horas, com receita e atestado digitais.',
  cons: 'Clínico geral e especialidades básicas na rede credenciada, com agendamento pela central.',
  exam: 'Desconto sobre a tabela dos laboratórios e clínicas parceiros.',
  farm: 'Medicamentos de marca e genéricos na rede de farmácias parceiras, com a carteirinha digital.',
  odtr: 'Desconto em tratamentos na rede odontológica parceira.',
  vant: 'Descontos em lojas, cursos, lazer e restaurantes parceiros.',
  espe: 'Dermatologia, pediatria, ginecologia, cardiologia e outras especialidades por vídeo.',
  odpr: 'Limpeza, aplicação de flúor e avaliação com dentista parceiro.',
  psic: 'Sessões por vídeo com psicólogos parceiros.',
  resi: 'Chaveiro, encanador e eletricista em emergências na residência do titular (mão de obra; material por conta do associado).',
}

const TELEMEDICINA = 'Parceiro de telemedicina'
const FARMACIAS = 'Rede de farmácias parceiras'
const ODONTO = 'Rede odontológica parceira'

function coverage(
  id: string,
  fields: Pick<ClubPlanCoverage, 'category' | 'title' | 'kind' | 'waitingDays' | 'channel'> & Partial<ClubPlanCoverage>,
): ClubPlanCoverage {
  return {
    id,
    description: null,
    value: null,
    limitQuantity: null,
    limitPeriod: null,
    provider: null,
    ...fields,
  }
}

const tele = () =>
  coverage('tele', { category: 'telemedicine', title: 'Telemedicina 24h', kind: 'included', waitingDays: 0, channel: 'online', provider: TELEMEDICINA, description: TEXT.tele })
const cons = (copay: number, waitingDays: number) =>
  coverage('cons', { category: 'consultations', title: 'Consultas presenciais', kind: 'copay', value: copay, waitingDays, channel: 'in_person', description: TEXT.cons })
const exam = (percent: number, waitingDays: number) =>
  coverage('exam', { category: 'exams', title: 'Exames laboratoriais e de imagem', kind: 'discount_percent', value: percent, waitingDays, channel: 'in_person', description: TEXT.exam })
const farm = () =>
  coverage('farm', { category: 'pharmacy', title: 'Desconto em farmácias', kind: 'discount_percent', value: 35, waitingDays: 0, channel: 'in_person', provider: FARMACIAS, description: TEXT.farm })
const odtr = (percent: number, waitingDays: number) =>
  coverage('odtr', { category: 'dental', title: 'Tratamentos odontológicos', kind: 'discount_percent', value: percent, waitingDays, channel: 'in_person', provider: ODONTO, description: TEXT.odtr })
const vant = () =>
  coverage('vant', { category: 'discounts', title: 'Clube de vantagens', kind: 'included', waitingDays: 0, channel: 'both', description: TEXT.vant })
const espe = (copay: number) =>
  coverage('espe', { category: 'telemedicine', title: 'Especialistas online', kind: 'copay', value: copay, waitingDays: 15, channel: 'online', provider: TELEMEDICINA, description: TEXT.espe })
const odpr = () =>
  coverage('odpr', { category: 'dental', title: 'Odontologia preventiva', kind: 'usage_limit', limitQuantity: 2, limitPeriod: 'year', waitingDays: 60, channel: 'in_person', provider: ODONTO, description: TEXT.odpr })
const psic = (copay: number) =>
  coverage('psic', { category: 'mental_health', title: 'Psicologia online', kind: 'copay', value: copay, limitQuantity: 4, limitPeriod: 'month', waitingDays: 30, channel: 'online', provider: 'Parceiro de saúde mental', description: TEXT.psic })
const resi = (perYear: number) =>
  coverage('resi', { category: 'assistance', title: 'Assistência residencial 24h', kind: 'usage_limit', limitQuantity: perYear, limitPeriod: 'year', waitingDays: 30, channel: 'in_person', provider: 'Parceiro de assistência 24h', description: TEXT.resi })

export type PlanSeed = Omit<CreateClubPlanInput, 'terms'>

const COMMON = {
  holderMinAge: 18,
  adjustmentPolicy: ADJUSTMENT_POLICY,
  // Modelos nascem em rascunho: o admin revisa preço/cobertura e ativa
  // conscientemente (plano inativo não aparece na vitrine nem no checkout).
  // O seed de demonstração `demo:planos` grava `active` explicitamente.
  status: 'inactive',
  upstreamPlanCodigo: null,
} as const

export const PLANOS_COMPLETOS: PlanSeed[] = [
  {
    ...COMMON,
    name: 'Essencial',
    sortOrder: 1,
    highlight: false,
    badge: null,
    audience: 'Individual',
    tagline: 'Telemedicina 24h e descontos para cuidar de você sem pesar no bolso.',
    description:
      'O primeiro passo para cuidar da saúde: médico por vídeo a qualquer hora, consultas e exames com preço de parceiro ' +
      'e desconto em farmácias. Sem taxa de adesão e sem fidelidade.',
    priceMonthly: 29.9,
    includedDependents: 0,
    priceDependentMonthly: 14.9,
    maxDependents: 2,
    enrollmentFee: null,
    enrollmentFeeWaived: false,
    holderMaxAge: null,
    dependentRules: [
      { relationship: 'conjuge', maxAge: null },
      { relationship: 'filho', maxAge: 21 },
      { relationship: 'enteado', maxAge: 21 },
    ],
    paymentMethods: ['pix', 'credit_card'],
    loyaltyMonths: 0,
    features: [
      'Telemedicina 24h ilimitada',
      'Consultas presenciais por R$ 59,90',
      '30% de desconto em exames',
      'Até 35% de desconto em farmácias',
      'Clube de vantagens',
    ],
    coverages: [tele(), cons(59.9, 30), exam(30, 30), farm(), odtr(20, 30), vant()],
    cancellationPolicy:
      'Cancele quando quiser pela área do associado ou pelo atendimento, sem multa. O acesso segue até o fim do período ' +
      'já pago; mensalidade paga não é devolvida. Contratou pela internet? Pode desistir em até 7 dias da adesão e ' +
      'receber tudo de volta (art. 49 do CDC).',
  },
  {
    ...COMMON,
    name: 'Plus',
    sortOrder: 2,
    highlight: true,
    badge: 'Mais escolhido',
    audience: 'Casal ou família pequena',
    tagline: 'Você e mais uma pessoa com consultas, exames e dentista por preço de parceiro.',
    description:
      'O mais escolhido: telemedicina com especialistas, consultas com coparticipação menor, odontologia preventiva, ' +
      'psicologia online e assistência residencial. Um dependente já incluso na mensalidade.',
    priceMonthly: 49.9,
    includedDependents: 1,
    priceDependentMonthly: 19.9,
    maxDependents: 3,
    enrollmentFee: 29.9,
    enrollmentFeeWaived: true,
    holderMaxAge: null,
    dependentRules: [
      { relationship: 'conjuge', maxAge: null },
      { relationship: 'filho', maxAge: 24 },
      { relationship: 'enteado', maxAge: 24 },
    ],
    paymentMethods: null,
    loyaltyMonths: 6,
    features: [
      '1 dependente incluso',
      'Telemedicina 24h + especialistas online',
      'Consultas presenciais por R$ 39,90',
      '40% de desconto em exames',
      'Limpeza e avaliação odontológica',
      'Assistência residencial 24h',
    ],
    coverages: [tele(), espe(39.9), cons(39.9, 15), exam(40, 15), farm(), odpr(), odtr(30, 60), psic(49.9), resi(2), vant()],
    cancellationPolicy:
      'Cancele quando quiser pela área do associado ou pelo atendimento. A adesão isenta tem como contrapartida a ' +
      'permanência mínima de 6 meses: cancelando antes, é cobrada a taxa de adesão de R$ 29,90, uma única vez. O acesso ' +
      'segue até o fim do período já pago. Desistência em até 7 dias da contratação online: devolução integral (art. 49 do CDC).',
  },
  {
    ...COMMON,
    name: 'Família',
    sortOrder: 3,
    highlight: false,
    badge: 'Melhor para famílias',
    audience: 'Famílias',
    tagline: 'Até 5 dependentes na mesma mensalidade, com assistência funeral familiar.',
    description:
      'Para a família toda: os benefícios do Plus para até cinco dependentes sem custo extra, nutricionista online, ' +
      'check-up anual e assistência funeral familiar prestada por parceiro.',
    priceMonthly: 79.9,
    includedDependents: 5,
    priceDependentMonthly: 0,
    maxDependents: 5,
    enrollmentFee: 49.9,
    enrollmentFeeWaived: false,
    holderMaxAge: 70,
    dependentRules: [
      { relationship: 'conjuge', maxAge: null },
      { relationship: 'filho', maxAge: 24 },
      { relationship: 'enteado', maxAge: 24 },
      { relationship: 'pai_mae', maxAge: 80 },
    ],
    paymentMethods: null,
    loyaltyMonths: 12,
    features: [
      'Até 5 dependentes inclusos',
      'Telemedicina 24h para toda a família',
      'Consultas presenciais por R$ 39,90',
      'Check-up anual',
      'Nutricionista e psicologia online',
      'Assistência funeral familiar',
    ],
    coverages: [
      { ...tele(), description: 'Clínico geral e pediatra por vídeo, 24 horas, para titular e dependentes.' },
      espe(29.9),
      cons(39.9, 15),
      exam(40, 15),
      coverage('chk', {
        category: 'exams',
        title: 'Check-up anual',
        kind: 'usage_limit',
        limitQuantity: 1,
        limitPeriod: 'year',
        waitingDays: 90,
        channel: 'in_person',
        provider: 'Laboratório parceiro',
        description: 'Hemograma, glicemia, colesterol e urina tipo 1, uma vez por ano para cada pessoa inscrita.',
      }),
      farm(),
      odpr(),
      odtr(30, 60),
      psic(39.9),
      coverage('nutr', {
        category: 'wellness',
        title: 'Nutricionista online',
        kind: 'usage_limit',
        limitQuantity: 2,
        limitPeriod: 'year',
        waitingDays: 30,
        channel: 'online',
        provider: TELEMEDICINA,
        description: 'Consulta por vídeo com nutricionista e plano alimentar.',
      }),
      resi(3),
      coverage('fune', {
        category: 'assistance',
        title: 'Assistência funeral familiar',
        kind: 'included',
        waitingDays: 90,
        channel: 'in_person',
        provider: 'Parceiro de assistência funeral',
        description:
          'Organização do funeral e traslado para titular e dependentes inscritos, prestados por parceiro conforme o ' +
          'regulamento. Morte acidental sem carência.',
      }),
      vant(),
    ],
    cancellationPolicy:
      'Cancele quando quiser pela área do associado ou pelo atendimento. Fidelidade de 12 meses: cancelando antes, é ' +
      'cobrada multa de 10% sobre as mensalidades que faltam para completar o período. O acesso segue até o fim do ' +
      'período já pago. Desistência em até 7 dias da contratação online: devolução integral, inclusive da adesão (art. 49 do CDC).',
  },
]

// ---------------------------------------------------------------------------
// Regulamento (`terms`)
// ---------------------------------------------------------------------------

function joinPt(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

function stripDot(text: string): string {
  return text.trim().replace(/\.$/, '')
}

export function montarRegulamento(
  plan: PlanSeed,
  orgName: string,
  settings: Pick<ResolvedBillingSettings, 'enabledMethods' | 'suspendAfterDays' | 'cancelAfterDays'>,
): string {
  const withWaiting = (plan.coverages ?? []).filter(c => c.waitingDays > 0)
  const waiting =
    withWaiting.length === 0
      ? '3. Carências. Nenhuma: todas as coberturas podem ser usadas logo após a ativação.'
      : [
          '3. Carências, contadas da ativação:',
          ...withWaiting.map(c => `   - ${c.title}: ${c.waitingDays} dias`),
          '   As demais coberturas podem ser usadas logo após a ativação.',
        ].join('\n')
  const methods: ClubPaymentMethod[] = effectivePaymentMethods(plan, settings.enabledMethods)

  return [
    `REGULAMENTO DO PLANO ${plan.name.toUpperCase()} — ${orgName}`,
    '',
    `1. O que é. Clube de benefícios por assinatura mensal que dá acesso a telemedicina, descontos, coparticipações e assistências prestados por parceiros. ${CLUB_PLAN_LEGAL_NOTICE}`,
    `2. Adesão e vigência. A assinatura começa na confirmação do 1º pagamento, quando são emitidas as carteirinhas digitais, e renova todo mês. ${describeEnrollmentFee(plan)}.`,
    waiting,
    `4. Dependentes. ${describeDependentsPolicy(plan)}. Parentescos aceitos: ${describeDependentRules(plan)}. A idade é verificada na adesão.`,
    `5. Pagamento. Formas aceitas: ${joinPt(methods.map(m => CLUB_PAYMENT_METHOD_LABELS[m]))}. A mensalidade vence todo mês no dia da contratação (até o dia 28). Em atraso, os benefícios seguem por ${settings.suspendAfterDays} dias; depois a assinatura é suspensa e, após ${settings.cancelAfterDays} dias, cancelada.`,
    '6. Uso. Agendamento pela central ou pelos canais indicados, com a carteirinha digital. Coparticipações e valores com desconto são pagos direto ao parceiro. A rede parceira pode mudar, mantendo benefícios equivalentes.',
    `7. Cancelamento e fidelidade. ${describeLoyalty(plan.loyaltyMonths)}. ${stripDot(plan.cancellationPolicy ?? '')}.`,
    `8. Reajuste. ${stripDot(plan.adjustmentPolicy ?? '')}.`,
    '9. Dados pessoais. Tratados conforme a LGPD, só para prestar os benefícios e cobrar a assinatura.',
  ].join('\n')
}
