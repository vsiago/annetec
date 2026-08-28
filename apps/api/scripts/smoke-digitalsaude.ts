/**
 * Smoke test manual: chama a Digital Saúde de verdade com as credenciais do
 * .env (DIGITALSAUDE_APP_TOKEN / DIGITALSAUDE_API_PASSWORD) e imprime o
 * resultado. Não faz parte da suíte automatizada (tests/ usa fetch mockado) —
 * é só para confirmar, na mão, que a integração está de pé.
 *
 * Uso: pnpm --filter @annetec/api exec tsx scripts/smoke-digitalsaude.ts
 */
import 'dotenv/config'
import { createDigitalSaudeClient } from '../src/integrations/digitalsaude/client'

async function main() {
  const baseUrl = process.env.DIGITALSAUDE_BASE_URL
  const appToken = process.env.DIGITALSAUDE_APP_TOKEN
  const apiPassword = process.env.DIGITALSAUDE_API_PASSWORD

  if (!baseUrl || !appToken || !apiPassword) {
    console.error('Faltam variáveis DIGITALSAUDE_* no .env')
    process.exit(1)
  }

  console.log(`Base URL: ${baseUrl}`)
  console.log(`Token:    ${appToken}`)
  console.log(`Senha:    ${'*'.repeat(apiPassword.length)}`)

  const client = createDigitalSaudeClient({ baseUrl, appToken, apiPassword, label: 'smoke-test' })

  console.log('\n> healthCheck() — chama convenioListar...')
  const ok = await client.healthCheck()
  console.log(ok ? '✔ credenciais aceitas' : '✘ credenciais recusadas ou upstream indisponível')

  if (ok) {
    const convenios = await client.call('convenioListar')
    console.log(`\n> convenioListar retornou ${convenios.length} convênio(s):`)
    console.table(convenios.slice(0, 10))
  }
}

main().catch(error => {
  console.error('\n✘ Falhou:', error instanceof Error ? error.message : error)
  process.exit(1)
})
