import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Impede que alguém grave direto nas tabelas que são ESPELHO da Digital Saúde.
 *
 * `contracts`, `beneficiaries` e `upstream_cache` moram no nosso banco mas a
 * fonte da verdade é o ERP. Gravar nelas por fora do caminho de sincronização
 * cria divergência silenciosa: a tela passa a mostrar um dado que a Digital
 * Saúde não tem, e a próxima sincronização sobrescreve sem avisar.
 *
 * O caminho certo é sempre: escrever no ERP → sincronizar de volta.
 *
 * Hoje a regra já é respeitada; este script existe para ela não se perder na
 * próxima pessoa que precisar "só corrigir um campo". Roda em CI junto do
 * `dict:check` e falha com saída 1.
 */

/** Tabela espelho → arquivos autorizados a gravar nela (o dono do sync). */
const DONOS: Record<string, string[]> = {
  contracts: ['modules/contracts/repository.ts'],
  beneficiaries: ['modules/contracts/repository.ts'],
  upstreamCache: ['modules/catalog/service.ts'],
}

const RAIZ = join(import.meta.dirname, '..', 'src')

/** `db.insert(contracts)`, `tx.update(beneficiaries)`, `.delete(upstreamCache)`. */
function escritas(conteudo: string, tabela: string): number {
  const padrao = new RegExp(`\\.(insert|update|delete)\\(\\s*${tabela}\\b`, 'g')
  return conteudo.match(padrao)?.length ?? 0
}

function arquivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap(nome => {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) return arquivosTs(caminho)
    return caminho.endsWith('.ts') ? [caminho] : []
  })
}

const violacoes: string[] = []

for (const caminho of arquivosTs(RAIZ)) {
  const relativo = relative(RAIZ, caminho).split(sep).join('/')
  // O próprio schema declara as tabelas; não é escrita.
  if (relativo.startsWith('db/schema/')) continue

  const conteudo = readFileSync(caminho, 'utf8')
  for (const [tabela, donos] of Object.entries(DONOS)) {
    const total = escritas(conteudo, tabela)
    if (total > 0 && !donos.includes(relativo)) {
      violacoes.push(
        `   ${relativo} grava em "${tabela}" (${total}x) — só ${donos.join(', ')} pode.`,
      )
    }
  }
}

if (violacoes.length > 0) {
  console.error('\nESCRITA DIRETA EM TABELA ESPELHO DA DIGITAL SAÚDE:\n')
  console.error(violacoes.join('\n'))
  console.error(
    '\nEssas tabelas são cópia do ERP. Grave na Digital Saúde e sincronize de volta',
    '\n(ver contractsService.sync). Se a tabela deixou de ser espelho, remova-a de',
    '\nDONOS em scripts/checar-espelhos.ts explicando por quê.\n',
  )
  process.exit(1)
}

console.log(
  `Tabelas espelho protegidas: ${Object.keys(DONOS).join(', ')} — nenhuma escrita fora do dono.`,
)
