/**
 * Deixa o clube (padrão: `mepcard`) pronto para vender: planos, benefícios,
 * rede credenciada (Rio e Niterói) e equipe comercial (vendas-rede).
 *
 *   pnpm --filter @annetec/api exec tsx scripts/seed-mepcard-rio.ts [slug] --dry-run
 *   pnpm --filter @annetec/api exec tsx scripts/seed-mepcard-rio.ts [slug] --confirmar
 *
 * - Idempotente: procura por nome/e-mail antes de criar; rodar de novo não duplica.
 * - Uma transação só. `--dry-run` executa tudo e desfaz (rollback) no fim.
 * - Não chama Asaas, não envia e-mail, não cria lead, assinatura nem cobrança.
 * - Contas: e-mails `@example.com`, SEM senha (sem linha em `account`).
 * - Nomes de estabelecimentos e pessoas são FICTÍCIOS.
 */
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db, sql } from '@/db/client'
import {
  benefits,
  clubPlans,
  member,
  organization,
  partners,
  sellerProfiles,
  user,
  vendasAgentes,
  vendasEquipes,
  vendasUnidades,
} from '@/db/schema'
import { gerarCodigoIndicacao } from '@/modules/vendas-rede/rules'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const confirmar = args.includes('--confirmar')
const slug = args.find(a => !a.startsWith('--')) ?? 'mepcard'

if (!dryRun && !confirmar) {
  console.error('Uso: seed-mepcard-rio.ts [slug] --dry-run | --confirmar\nSem --confirmar (ou --dry-run) nada é gravado. Abortado.')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Conteúdo
// ---------------------------------------------------------------------------

const PLANOS = [
  {
    name: 'Mepcard Essencial',
    tagline: 'Saúde acessível para você, todo mês',
    description: 'Telemedicina 24h, descontos em consultas, exames e farmácias da rede credenciada.',
    priceMonthly: '39.90',
    enrollmentFee: '49.90',
    enrollmentFeeWaived: false,
    maxDependents: 0,
    includedDependents: 0,
    priceDependentMonthly: null,
    audience: 'Individual',
    highlight: false,
    badge: null,
    balcao: 25,
    holderMinAge: null,
    features: ['Telemedicina 24h', 'Até 40% em consultas', 'Até 50% em exames', 'Desconto em farmácias'],
  },
  {
    name: 'Mepcard Família',
    tagline: 'Titular + 3 dependentes na mesma mensalidade',
    description: 'Cuidado para toda a família, com dependentes inclusos e a rede credenciada completa.',
    priceMonthly: '69.90',
    enrollmentFee: '59.90',
    enrollmentFeeWaived: false,
    maxDependents: 4,
    includedDependents: 3,
    priceDependentMonthly: '14.90',
    audience: 'Famílias',
    highlight: true,
    badge: 'Mais escolhido',
    balcao: 30,
    holderMinAge: null,
    features: ['Titular + 3 dependentes', 'Telemedicina 24h para todos', 'Odontologia com desconto', 'Assistência funeral familiar'],
  },
  {
    name: 'Mepcard Sênior',
    tagline: 'Para quem tem 60 anos ou mais',
    description: 'Atenção especial à saúde na melhor idade, sem taxa de adesão.',
    priceMonthly: '59.90',
    enrollmentFee: '0',
    enrollmentFeeWaived: true,
    maxDependents: 0,
    includedDependents: 0,
    priceDependentMonthly: null,
    audience: 'Sênior (60+)',
    highlight: false,
    badge: null,
    balcao: 30,
    holderMinAge: 60,
    features: ['Telemedicina 24h', 'Orientação nutricional', 'Fisioterapia com desconto', 'Exames de rotina com desconto'],
  },
  {
    name: 'Mepcard Empresarial',
    tagline: 'Benefício de saúde para a sua equipe',
    description: 'Para MEIs e pequenas empresas que querem cuidar de quem trabalha com elas.',
    priceMonthly: '34.90',
    enrollmentFee: '29.90',
    enrollmentFeeWaived: false,
    maxDependents: 3,
    includedDependents: 0,
    priceDependentMonthly: '19.90',
    audience: 'Empresas e MEI',
    highlight: false,
    badge: null,
    balcao: 35,
    holderMinAge: null,
    features: ['Telemedicina 24h', 'Consultas e exames com desconto', 'Dependentes opcionais', 'Atendimento prioritário'],
  },
]

const BENEFICIOS = [
  { name: 'Telemedicina 24h', category: 'health', description: 'Consulta por vídeo com clínico geral a qualquer hora, sem custo extra.', provider: null, desconto: null },
  { name: 'Desconto em consultas', category: 'health', description: 'Até 40% em consultas de diversas especialidades na rede credenciada.', provider: null, desconto: 40 },
  { name: 'Desconto em exames', category: 'health', description: 'Até 50% em exames laboratoriais e de imagem nos laboratórios da rede.', provider: null, desconto: 50 },
  { name: 'Desconto em farmácias', category: 'pharmacy', description: 'Até 30% em medicamentos e 15% em perfumaria nas farmácias parceiras.', provider: null, desconto: 30 },
  { name: 'Odontologia com desconto', category: 'dental', description: 'Avaliação, limpeza e tratamentos com até 35% de desconto.', provider: null, desconto: 35 },
  { name: 'Ótica e oftalmologia', category: 'discount', description: 'Consulta oftalmológica com desconto e até 25% em armações e lentes.', provider: null, desconto: 25 },
  { name: 'Assistência funeral', category: 'funeral', description: 'Assistência funeral para o titular e a família, com atendimento 24 horas.', provider: 'Assistência Mepcard', desconto: null },
  { name: 'Orientação nutricional', category: 'health', description: 'Teleorientação com nutricionista e plano alimentar básico.', provider: null, desconto: null },
  { name: 'Academias e bem-estar', category: 'discount', description: 'Até 20% nas mensalidades de academias, pilates e estúdios parceiros.', provider: null, desconto: 20 },
  { name: 'Clube pet', category: 'discount', description: 'Descontos em consultas veterinárias, banho e tosa e pet shops parceiros.', provider: null, desconto: 15 },
  { name: 'Cursos e capacitação', category: 'discount', description: 'Até 30% em cursos livres, idiomas e capacitação profissional.', provider: null, desconto: 30 },
] as const

// CEP aproximado do bairro (faixa), sem pretensão de ser o CEP exato da porta.
const REDE = [
  { name: 'Clínica Bem Viver Tijuca', category: 'health', desconto: 35, tagline: 'Clínica geral e especialidades', esp: ['Clínica Geral', 'Cardiologia', 'Dermatologia'], rua: 'Rua Conde de Bonfim, 420', bairro: 'Tijuca', cidade: 'Rio de Janeiro', cep: '20520-054' },
  { name: 'Laboratório Vital Méier', category: 'health', desconto: 40, tagline: 'Resultados online em 24h', esp: ['Análises Clínicas', 'Imagem'], rua: 'Rua Dias da Cruz, 215', bairro: 'Méier', cidade: 'Rio de Janeiro', cep: '20720-011' },
  { name: 'Odonto Sorriso Copacabana', category: 'dental', desconto: 35, tagline: 'Avaliação sem custo', esp: ['Odontologia Geral', 'Ortodontia', 'Implantes'], rua: 'Rua Barata Ribeiro, 370', bairro: 'Copacabana', cidade: 'Rio de Janeiro', cep: '22040-002' },
  { name: 'Farmácia Saúde Viva Madureira', category: 'pharmacy', desconto: 25, tagline: 'Medicamentos com desconto', esp: ['Medicamentos', 'Perfumaria'], rua: 'Estrada do Portela, 280', bairro: 'Madureira', cidade: 'Rio de Janeiro', cep: '21351-050' },
  { name: 'Ótica Visão Clara Botafogo', category: 'other', desconto: 25, tagline: 'Exame de vista e armações', esp: ['Ótica', 'Oftalmologia'], rua: 'Rua Voluntários da Pátria, 190', bairro: 'Botafogo', cidade: 'Rio de Janeiro', cep: '22270-000' },
  { name: 'Fisio Movimento Barra', category: 'wellness', desconto: 30, tagline: 'Reabilitação e RPG', esp: ['Fisioterapia', 'RPG', 'Pilates'], rua: 'Av. das Américas, 3500', bairro: 'Barra da Tijuca', cidade: 'Rio de Janeiro', cep: '22640-102' },
  { name: 'Clínica Cuidar Campo Grande', category: 'health', desconto: 35, tagline: 'Atenção à saúde na Zona Oeste', esp: ['Clínica Geral', 'Pediatria', 'Ginecologia'], rua: 'Rua Coronel Agostinho, 120', bairro: 'Campo Grande', cidade: 'Rio de Janeiro', cep: '23052-010' },
  { name: 'Academia Corpo em Forma Recreio', category: 'wellness', desconto: 20, tagline: 'Sem taxa de matrícula', esp: ['Musculação', 'Funcional', 'Dança'], rua: 'Av. Gilka Machado, 450', bairro: 'Recreio dos Bandeirantes', cidade: 'Rio de Janeiro', cep: '22795-081' },
  { name: 'Clínica Vida e Saúde Icaraí', category: 'health', desconto: 35, tagline: 'Consultas em até 48h', esp: ['Clínica Geral', 'Ortopedia', 'Cardiologia'], rua: 'Rua Moreira César, 300', bairro: 'Icaraí', cidade: 'Niterói', cep: '24230-060' },
  { name: 'Laboratório Exata Niterói', category: 'health', desconto: 40, tagline: 'Coleta domiciliar sob agendamento', esp: ['Análises Clínicas'], rua: 'Rua Miguel de Frias, 90', bairro: 'Icaraí', cidade: 'Niterói', cep: '24220-001' },
  { name: 'Odonto Prime Icaraí', category: 'dental', desconto: 30, tagline: 'Urgência odontológica', esp: ['Odontologia Geral', 'Endodontia'], rua: 'Av. Roberto Silveira, 160', bairro: 'Icaraí', cidade: 'Niterói', cep: '24230-150' },
  { name: 'Farmácia Bom Remédio Tijuca', category: 'pharmacy', desconto: 25, tagline: 'Desconto em medicamentos', esp: ['Medicamentos', 'Genéricos'], rua: 'Rua Uruguai, 380', bairro: 'Tijuca', cidade: 'Rio de Janeiro', cep: '20510-061' },
  { name: 'Núcleo Nutri Equilíbrio Ipanema', category: 'wellness', desconto: 25, tagline: 'Nutrição e emagrecimento saudável', esp: ['Nutrição', 'Psicologia'], rua: 'Rua Visconde de Pirajá, 550', bairro: 'Ipanema', cidade: 'Rio de Janeiro', cep: '22410-002' },
  { name: 'Clínica Mulher Plena Leblon', category: 'health', desconto: 30, tagline: 'Saúde da mulher', esp: ['Ginecologia', 'Mastologia'], rua: 'Av. Ataulfo de Paiva, 270', bairro: 'Leblon', cidade: 'Rio de Janeiro', cep: '22440-032' },
  { name: 'Centro de Imagem Diagnóstica Penha', category: 'health', desconto: 40, tagline: 'Ultrassom, raio-X e densitometria', esp: ['Imagem', 'Ultrassonografia'], rua: 'Av. Brás de Pina, 1200', bairro: 'Penha', cidade: 'Rio de Janeiro', cep: '21020-001' },
  { name: 'Estúdio Pilates Corpo & Mente Jacarepaguá', category: 'wellness', desconto: 20, tagline: 'Pilates e alongamento', esp: ['Pilates', 'Alongamento'], rua: 'Estrada dos Bandeirantes, 7500', bairro: 'Jacarepaguá', cidade: 'Rio de Janeiro', cep: '22775-111' },
  { name: 'Pet Amigo Veterinária Flamengo', category: 'other', desconto: 15, tagline: 'Consultas e vacinas para pets', esp: ['Veterinária', 'Banho e Tosa'], rua: 'Rua Marquês de Abrantes, 85', bairro: 'Flamengo', cidade: 'Rio de Janeiro', cep: '22230-060' },
  { name: 'Escola Aprender Mais Centro de Niterói', category: 'education', desconto: 30, tagline: 'Idiomas e informática', esp: ['Idiomas', 'Informática'], rua: 'Rua Visconde do Uruguai, 250', bairro: 'Centro', cidade: 'Niterói', cep: '24020-070' },
] as const

const UNIDADE = {
  nome: 'Clínica Bem Viver Tijuca',
  tipo: 'clinica' as const,
  endereco: { cep: '20520054', logradouro: 'Rua Conde de Bonfim', numero: '420', bairro: 'Tijuca', cidade: 'Rio de Janeiro', uf: 'RJ' as const },
}

const EQUIPE = 'Equipe Zona Norte'
type Papel = 'supervisor' | 'vendedor' | 'balcao'
const PESSOAS: { nome: string; email: string; papel: Papel; equipe: boolean; unidade: boolean; meta: number | null }[] = [
  { nome: 'Rafaela Monteiro', email: 'rafaela.monteiro.mepcard@example.com', papel: 'supervisor', equipe: true, unidade: false, meta: null },
  { nome: 'Thiago Barbosa', email: 'thiago.barbosa.mepcard@example.com', papel: 'vendedor', equipe: true, unidade: false, meta: 10 },
  { nome: 'Camila Nascimento', email: 'camila.nascimento.mepcard@example.com', papel: 'vendedor', equipe: true, unidade: false, meta: 10 },
  { nome: 'Leandro Siqueira', email: 'leandro.siqueira.mepcard@example.com', papel: 'vendedor', equipe: true, unidade: false, meta: 10 },
  { nome: 'Patrícia Guedes', email: 'patricia.guedes.mepcard@example.com', papel: 'vendedor', equipe: false, unidade: false, meta: 8 },
  { nome: 'Vanessa Cardoso', email: 'vanessa.cardoso.mepcard@example.com', papel: 'balcao', equipe: false, unidade: true, meta: null },
]

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

type Tipo = 'planos' | 'benefícios' | 'rede credenciada' | 'unidades' | 'equipes' | 'contas' | 'agentes'
const resumo = new Map<Tipo, { criado: number; existia: number }>()
const conta = (tipo: Tipo, criado: boolean) => {
  const r = resumo.get(tipo) ?? { criado: 0, existia: 0 }
  if (criado) r.criado++
  else r.existia++
  resumo.set(tipo, r)
}

class Desfazer extends Error {}

async function main() {
  const [org] = await db.select().from(organization).where(eq(organization.slug, slug)).limit(1)
  if (!org) {
    console.error(`Clube "${slug}" não existe. Abortado.`)
    await sql.end()
    process.exit(1)
  }
  console.log(`Clube: ${org.name} (${org.slug})  modo: ${dryRun ? 'DRY-RUN (nada é gravado)' : 'GRAVAR'}`)

  try {
    await db.transaction(async tx => {
      // Planos
      for (const [i, p] of PLANOS.entries()) {
        const [ex] = await tx
          .select({ id: clubPlans.id })
          .from(clubPlans)
          .where(and(eq(clubPlans.organizationId, org.id), eq(clubPlans.name, p.name)))
          .limit(1)
        conta('planos', !ex)
        if (ex) continue
        await tx.insert(clubPlans).values({
          organizationId: org.id,
          name: p.name,
          tagline: p.tagline,
          description: p.description,
          priceMonthly: p.priceMonthly,
          priceDependentMonthly: p.priceDependentMonthly,
          maxDependents: p.maxDependents,
          includedDependents: p.includedDependents,
          enrollmentFee: p.enrollmentFee,
          enrollmentFeeWaived: p.enrollmentFeeWaived,
          features: p.features,
          audience: p.audience,
          highlight: p.highlight,
          badge: p.badge,
          sortOrder: i + 1,
          balcaoDescontoPercentual: p.balcao,
          holderMinAge: p.holderMinAge,
          status: 'active',
        })
      }

      // Benefícios
      for (const b of BENEFICIOS) {
        const [ex] = await tx
          .select({ id: benefits.id })
          .from(benefits)
          .where(and(eq(benefits.organizationId, org.id), eq(benefits.name, b.name)))
          .limit(1)
        conta('benefícios', !ex)
        if (ex) continue
        await tx.insert(benefits).values({
          organizationId: org.id,
          name: b.name,
          description: b.description,
          category: b.category,
          discountPercent: b.desconto === null ? null : String(b.desconto),
          provider: b.provider,
        })
      }

      // Rede credenciada (telefone/e-mail/site vazios: não inventamos contato)
      for (const r of REDE) {
        const [ex] = await tx
          .select({ id: partners.id })
          .from(partners)
          .where(and(eq(partners.organizationId, org.id), eq(partners.name, r.name)))
          .limit(1)
        conta('rede credenciada', !ex)
        if (ex) continue
        await tx.insert(partners).values({
          organizationId: org.id,
          name: r.name,
          tagline: r.tagline,
          category: r.category,
          discountPercent: String(r.desconto),
          address: `${r.rua} - ${r.bairro} - CEP ${r.cep}`,
          city: r.cidade,
          state: 'RJ',
          specialties: [...r.esp],
          since: new Date().toISOString().slice(0, 10),
          status: 'active',
        })
      }

      // Unidade própria (balcão)
      let [unidade] = await tx
        .select()
        .from(vendasUnidades)
        .where(and(eq(vendasUnidades.scope, 'tenant'), eq(vendasUnidades.tenantId, org.id), eq(vendasUnidades.nome, UNIDADE.nome)))
        .limit(1)
      conta('unidades', !unidade)
      if (!unidade) {
        ;[unidade] = await tx
          .insert(vendasUnidades)
          .values({ scope: 'tenant', tenantId: org.id, corretoraId: null, nome: UNIDADE.nome, tipo: UNIDADE.tipo, endereco: UNIDADE.endereco })
          .returning()
      }

      // Equipe direto no clube (corretora exige CNPJ e razão social, que não inventamos)
      let [equipe] = await tx
        .select()
        .from(vendasEquipes)
        .where(and(eq(vendasEquipes.scope, 'tenant'), eq(vendasEquipes.tenantId, org.id), eq(vendasEquipes.nome, EQUIPE)))
        .limit(1)
      conta('equipes', !equipe)
      if (!equipe) {
        ;[equipe] = await tx
          .insert(vendasEquipes)
          .values({ scope: 'tenant', tenantId: org.id, corretoraId: null, unidadeId: null, nome: EQUIPE })
          .returning()
      }

      // Pessoas: user (sem senha) + member 'seller' + seller_profiles + vendas_agentes
      let supervisorAgenteId: string | null = null
      let balcaoAgenteId: string | null = null
      for (const p of PESSOAS) {
        const email = p.email.toLowerCase()
        let [u] = await tx.select().from(user).where(eq(user.email, email)).limit(1)
        conta('contas', !u)
        if (!u) {
          ;[u] = await tx.insert(user).values({ id: randomUUID(), name: p.nome, email, emailVerified: true, role: 'user' }).returning()
        }
        const userId = u!.id
        const [vinculo] = await tx
          .select({ id: member.id })
          .from(member)
          .where(and(eq(member.organizationId, org.id), eq(member.userId, userId)))
          .limit(1)
        if (!vinculo) await tx.insert(member).values({ id: randomUUID(), organizationId: org.id, userId, role: 'seller' })
        await tx.insert(sellerProfiles).values({ userId, organizationId: org.id }).onConflictDoNothing()

        let [ag] = await tx
          .select()
          .from(vendasAgentes)
          .where(and(eq(vendasAgentes.userId, userId), eq(vendasAgentes.scope, 'tenant'), eq(vendasAgentes.tenantId, org.id)))
          .limit(1)
        conta('agentes', !ag)
        if (!ag) {
          let codigo = gerarCodigoIndicacao()
          for (let t = 0; t < 20; t++) {
            const [dup] = await tx.select({ id: vendasAgentes.id }).from(vendasAgentes).where(eq(vendasAgentes.codigoIndicacao, codigo)).limit(1)
            if (!dup) break
            codigo = gerarCodigoIndicacao()
          }
          ;[ag] = await tx
            .insert(vendasAgentes)
            .values({
              scope: 'tenant',
              tenantId: org.id,
              userId,
              papel: p.papel,
              corretoraId: null,
              unidadeId: p.unidade ? unidade!.id : null,
              equipeId: p.equipe ? equipe!.id : null,
              codigoIndicacao: codigo,
              ativo: true,
              metaMensal: p.meta,
              nome: p.nome,
              cpf: null,
              telefone: null,
              criadoPorUserId: null,
            })
            .returning()
        }
        if (p.papel === 'supervisor') supervisorAgenteId = ag!.id
        if (p.papel === 'balcao') balcaoAgenteId = ag!.id
      }
      if (supervisorAgenteId && !equipe!.supervisorAgenteId) {
        await tx.update(vendasEquipes).set({ supervisorAgenteId, updatedAt: new Date() }).where(eq(vendasEquipes.id, equipe!.id))
      }
      if (balcaoAgenteId && !unidade!.responsavelAgenteId) {
        await tx.update(vendasUnidades).set({ responsavelAgenteId: balcaoAgenteId, updatedAt: new Date() }).where(eq(vendasUnidades.id, unidade!.id))
      }

      if (dryRun) throw new Desfazer()
    })
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e
  }

  console.log(dryRun ? '\nResumo (DRY-RUN, nada gravado):' : '\nResumo:')
  for (const [tipo, r] of resumo) console.log(`  ${tipo}: ${dryRun ? 'criaria' : 'criado'} ${r.criado} / já existia ${r.existia}`)
  await sql.end()
}

main().catch(async err => {
  console.error('Falhou (transação desfeita):', err)
  await sql.end().catch(() => {})
  process.exit(1)
})
