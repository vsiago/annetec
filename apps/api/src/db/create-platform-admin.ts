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
 *   pnpm --filter @annetec/api exec tsx src/db/create-platform-admin.ts \
 *     "Nome da Pessoa" email@annetec.com.br 'SenhaForte123!' [superadmin|platform_admin]
 */
async function main() {
  const [name, email, password, role = 'superadmin'] = process.argv.slice(2)

  if (!name || !email || !password) {
    console.error('Uso: create-platform-admin.ts "<nome>" <email> <senha> [superadmin|platform_admin]')
    process.exit(1)
  }
  if (role !== 'superadmin' && role !== 'platform_admin') {
    console.error('Papel inválido — use "superadmin" ou "platform_admin"')
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
