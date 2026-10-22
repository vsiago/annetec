import { auth } from '@/lib/auth'
import { sql } from './client'
import { logger } from '@/lib/logger'

/**
 * Cria (ou promove) uma conta de plataforma (equipe Annetec) direto no banco.
 *
 * Usa `auth.api.createUser` — não insert manual — porque é o próprio Better
 * Auth quem faz o hash da senha e grava a linha de `account` com o `issuer`
 * certo (`local:credential`); um insert manual errado nesse detalhe é
 * exatamente o bug que o seed teve antes.
 *
 * A senha NÃO deve ir na linha de comando (fica no histórico do shell e na
 * lista de processos). Em ordem de preferência:
 *
 *   # 1) digitada (sem eco) quando o terminal é interativo
 *   pnpm --filter @annetec/api exec tsx src/db/create-platform-admin.ts "Nome da Pessoa" email@annetec.com.br [superadmin|platform_admin]
 *
 *   # 2) variável de ambiente (ex.: `read -rs PLATFORM_ADMIN_PASSWORD; export PLATFORM_ADMIN_PASSWORD`)
 *   PLATFORM_ADMIN_PASSWORD=... pnpm ... create-platform-admin.ts "Nome" email@annetec.com.br
 *
 *   # 3) stdin (pipe), ex.: de um gerenciador de senhas
 *   pass annetec/admin | pnpm ... create-platform-admin.ts "Nome" email@annetec.com.br
 *
 * Compatibilidade: a senha como 3º argumento ainda funciona, com aviso.
 * Mínimo de 12 caracteres.
 */

const ROLES = ['superadmin', 'platform_admin'] as const
type PlatformRole = (typeof ROLES)[number]
const MIN_PLATFORM_PASSWORD_LENGTH = 12
const PASSWORD_ENV = 'PLATFORM_ADMIN_PASSWORD'

function isRole(value: string | undefined): value is PlatformRole {
  return value !== undefined && (ROLES as readonly string[]).includes(value)
}

/**
 * Lê os argumentos: `<nome> <email> [papel]` (senha fora da linha de
 * comando) ou o formato antigo `<nome> <email> <senha> [papel]`. Puro.
 */
function parseArgs(argv: string[]): {
  name?: string
  email?: string
  password: string | null
  role: string
} {
  const [name, email, third, fourth] = argv
  if (third === undefined || isRole(third)) {
    return { name, email, password: null, role: third ?? 'superadmin' }
  }
  return { name, email, password: third, role: fourth ?? 'superadmin' }
}

/** Lê a senha digitada sem eco (TTY) ou tudo o que vier pelo pipe. */
async function readPasswordFromStdin(): Promise<string> {
  const stdin = process.stdin
  if (!stdin.isTTY) {
    const chunks: Buffer[] = []
    for await (const chunk of stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '')
  }

  process.stdout.write('Senha (não aparece na tela): ')
  return new Promise((resolve, reject) => {
    let value = ''
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const done = (result: string | null) => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', onData)
      process.stdout.write('\n')
      if (result === null) reject(new Error('Cancelado'))
      else resolve(result)
    }
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return done(value)
        if (char === '\u0003') return done(null) // Ctrl+C
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1)
        else value += char
      }
    }
    stdin.on('data', onData)
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { name, email, role } = args

  if (!name || !email) {
    console.error(
      `Uso: create-platform-admin.ts "<nome>" <email> [superadmin|platform_admin]\n` +
        `A senha vem de ${PASSWORD_ENV}, do stdin (pipe) ou é digitada sem eco.`,
    )
    process.exit(1)
  }
  if (!isRole(role)) {
    console.error('Papel inválido — use "superadmin" ou "platform_admin"')
    process.exit(1)
  }

  let password = args.password
  if (password !== null) {
    console.warn(
      `Aviso: senha passada na linha de comando fica no histórico do shell. Prefira ${PASSWORD_ENV} ou digitar quando pedido.`,
    )
  } else {
    password = process.env[PASSWORD_ENV] || (await readPasswordFromStdin())
  }

  if (password.length < MIN_PLATFORM_PASSWORD_LENGTH) {
    console.error(`Senha curta demais: conta de plataforma exige pelo menos ${MIN_PLATFORM_PASSWORD_LENGTH} caracteres.`)
    process.exit(1)
  }

  try {
    const result = await auth.api.createUser({
      body: { name, email: email.toLowerCase(), password, role },
    })
    logger.info(
      { userId: result.user.id, email: result.user.email, role },
      'Conta de plataforma criada',
    )
  } finally {
    await sql.end()
  }
}

main().catch(error => {
  logger.error({ err: error }, 'Falha ao criar conta de plataforma')
  process.exit(1)
})
