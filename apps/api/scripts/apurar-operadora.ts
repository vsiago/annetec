/**
 * Roda a apuração de permissões na operadora (a Annetec), que ainda estava sem
 * `capabilities` — assim o painel de integração já abre mostrando o estado real
 * em vez de "ainda não apurado". Só leitura no ERP; grava apenas o diagnóstico.
 */
import 'dotenv/config'
import { tenantsService } from '../src/modules/tenants/service'

async function main() {
  const operadora = await tenantsService.getOperator()
  if (!operadora) {
    console.log('Nenhuma operadora configurada.')
    process.exit(0)
  }

  console.log(`Operadora: ${operadora.name} (${operadora.slug})`)
  const capabilities = await tenantsService.probeCapabilities(operadora.id)
  for (const [operacao, permitido] of Object.entries(capabilities)) {
    console.log(`  ${permitido ? 'OK ' : 'NAO'}  ${operacao}`)
  }
  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
