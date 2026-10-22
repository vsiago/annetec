import { tenantAddress } from '@annetec/contracts'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { env } from '@/config/env'
import { encryptSecret } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import { db, sql } from './client'
import { organization, tenantIntegrations, tenantProfiles, user } from './schema'

// Trava de produção: scripts de seed/provisionamento não rodam em produção sem
// liberação explícita. (Avaliado depois dos imports — `./client` só conecta na
// primeira query.)
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IN_PRODUCTION !== '1') {
  console.error(
    `[create-platform-operator] Abortado: NODE_ENV=production. Este script não roda em produção.\n` +
      'Se for mesmo intencional, rode de novo com ALLOW_SEED_IN_PRODUCTION=1.',
  )
  process.exit(1)
}

/**
 * Cria (ou atualiza) a organização `kind: 'platform'` — a Annetec operando
 * como operadora, com clientes diretos na Digital Saúde.
 *
 * Fica separada de propósito da organização de demonstração `annetec`
 * (slug `annetec`, seedada por `db/seed.ts`, com senhas triviais e
 * publicadas no repo): aquela existe só para exercitar o painel de inquilino
 * comum e NUNCA deve carregar credenciais reais da Digital Saúde. Esta aqui
 * é a operadora de verdade, no slug `annetec-operadora`.
 *
 * Idempotente: rodar de novo atualiza credenciais em vez de duplicar (o
 * cadastro só é gravado na criação do perfil).
 *
 * O cadastro da operadora (CNPJ, contato, endereço) NÃO fica no código: vem de
 * argumentos `--chave=valor` ou, na falta deles, das variáveis OPERATOR_*.
 * Ver `USAGE` abaixo.
 */
const SLUG = 'annetec-operadora'

const USAGE = `Uso:
  pnpm --filter @annetec/api exec tsx src/db/create-platform-operator.ts \\
    --razao-social="..." --cnpj=00000000000000 --email=contato@exemplo.com.br --telefone=21999999999 \\
    --cep=00000000 --rua="..." --numero=123 --bairro="..." --cidade="..." --uf=RJ

Cada argumento pode vir, em vez disso, da variável de ambiente correspondente:
  OPERATOR_LEGAL_NAME, OPERATOR_CNPJ, OPERATOR_EMAIL, OPERATOR_PHONE,
  OPERATOR_CEP, OPERATOR_STREET, OPERATOR_NUMBER, OPERATOR_NEIGHBORHOOD,
  OPERATOR_CITY, OPERATOR_STATE

Requer também DIGITALSAUDE_APP_TOKEN e DIGITALSAUDE_API_PASSWORD no .env.`

/** Argumento → variável de ambiente de fallback. */
const FIELDS = {
  'razao-social': 'OPERATOR_LEGAL_NAME',
  cnpj: 'OPERATOR_CNPJ',
  email: 'OPERATOR_EMAIL',
  telefone: 'OPERATOR_PHONE',
  cep: 'OPERATOR_CEP',
  rua: 'OPERATOR_STREET',
  numero: 'OPERATOR_NUMBER',
  bairro: 'OPERATOR_NEIGHBORHOOD',
  cidade: 'OPERATOR_CITY',
  uf: 'OPERATOR_STATE',
} as const

type Field = keyof typeof FIELDS

/** Lê o cadastro da operadora de `--chave=valor` / OPERATOR_*; sem tudo, imprime o uso e sai. */
function readOperatorProfile() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(USAGE)
    process.exit(0)
  }

  const args = new Map<string, string>()
  for (const raw of process.argv.slice(2)) {
    const match = /^--([a-z-]+)=([\s\S]*)$/.exec(raw)
    if (match) args.set(match[1]!, match[2]!)
  }

  const values = {} as Record<Field, string>
  const missing: string[] = []
  for (const [field, envName] of Object.entries(FIELDS) as [Field, string][]) {
    const value = (args.get(field) ?? process.env[envName] ?? '').trim()
    if (!value) missing.push(`--${field} (ou ${envName})`)
    values[field] = value
  }

  if (missing.length > 0) {
    console.error(`Cadastro da operadora incompleto. Faltando:\n  ${missing.join('\n  ')}\n\n${USAGE}`)
    process.exit(1)
  }

  const document = values.cnpj.replace(/\D/g, '')
  if (document.length !== 14) {
    console.error(`--cnpj inválido: esperado 14 dígitos, recebido "${values.cnpj}".\n\n${USAGE}`)
    process.exit(1)
  }

  const address = tenantAddress.safeParse({
    cep: values.cep,
    street: values.rua,
    number: values.numero,
    neighborhood: values.bairro,
    city: values.cidade,
    state: values.uf.toUpperCase(),
  })
  if (!address.success) {
    const issues = address.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    console.error(`Endereço da operadora inválido:\n${issues}\n\n${USAGE}`)
    process.exit(1)
  }

  return {
    legalName: values['razao-social'],
    document,
    email: values.email,
    phone: values.telefone.replace(/\D/g, ''),
    address: address.data,
  }
}

async function main() {
  const cadastro = readOperatorProfile()

  const appToken = env.DIGITALSAUDE_APP_TOKEN
  const apiPassword = env.DIGITALSAUDE_API_PASSWORD
  if (!appToken || !apiPassword) {
    console.error('DIGITALSAUDE_APP_TOKEN / DIGITALSAUDE_API_PASSWORD ausentes no .env')
    process.exit(1)
  }

  const [existing] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, SLUG))
    .limit(1)

  let organizationId: string

  if (existing) {
    organizationId = existing.id
    logger.info({ organizationId, slug: SLUG }, 'Organização da operadora já existe — atualizando')
  } else {
    // Dono técnico da organization no Better Auth (exigido por createOrganization);
    // por ser conta de plataforma, `resolveActiveMembership` já resolve
    // scope: 'platform' para ela antes de olhar para membership, então virar
    // membro daqui não muda nada no que ela já podia fazer.
    const [owner] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.role, 'superadmin'))
      .limit(1)
    if (!owner) {
      console.error('Nenhum usuário superadmin encontrado para ser o criador da organization')
      process.exit(1)
    }

    const org = await auth.api.createOrganization({
      body: { name: 'Annetec', slug: SLUG, userId: owner.id },
    })
    if (!org) throw new Error('createOrganization não retornou a organização')
    organizationId = org.id
    logger.info({ organizationId, slug: SLUG }, 'Organização da operadora criada')
  }

  await db
    .insert(tenantProfiles)
    .values({
      organizationId,
      legalName: cadastro.legalName,
      document: cadastro.document,
      email: cadastro.email,
      phone: cadastro.phone,
      address: cadastro.address,
      branding: { primaryColor: '#DC2626', secondaryColor: '#1F2937' },
      status: 'active',
      kind: 'platform',
    })
    .onConflictDoUpdate({
      target: tenantProfiles.organizationId,
      set: { kind: 'platform', status: 'active', updatedAt: new Date() },
    })

  await db
    .insert(tenantIntegrations)
    .values({
      organizationId,
      provider: 'digitalsaude',
      baseUrl: env.DIGITALSAUDE_BASE_URL,
      appTokenEncrypted: encryptSecret(appToken),
      apiPasswordEncrypted: encryptSecret(apiPassword),
      enabled: true,
      lastCheckedAt: new Date(),
      lastCheckOk: true,
    })
    .onConflictDoUpdate({
      target: tenantIntegrations.organizationId,
      set: {
        baseUrl: env.DIGITALSAUDE_BASE_URL,
        appTokenEncrypted: encryptSecret(appToken),
        apiPasswordEncrypted: encryptSecret(apiPassword),
        enabled: true,
        lastCheckedAt: new Date(),
        lastCheckOk: true,
        updatedAt: new Date(),
      },
    })

  logger.info({ organizationId, slug: SLUG }, 'Operadora Annetec pronta, credenciais gravadas cifradas')
}

main()
  .catch(error => {
    logger.error({ err: error }, 'Falha ao criar operadora da plataforma')
    process.exit(1)
  })
  .finally(() => sql.end())
