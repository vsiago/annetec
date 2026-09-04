/**
 * Diagnóstico do POST /calculo/ — a sonda pegou 401 nele enquanto todo GET
 * passava com as mesmas credenciais. Bate direto no upstream, sem o cliente,
 * pra ver corpo e status crus e descobrir se o problema é permissão da conta
 * ou o campo `nome` (que o Swagger não explica de onde sai).
 */
import 'dotenv/config'

const base = process.env.DIGITALSAUDE_BASE_URL!
const headers = {
  token: process.env.DIGITALSAUDE_APP_TOKEN!,
  senhaApi: process.env.DIGITALSAUDE_API_PASSWORD!,
  accept: 'application/json',
  'content-type': 'application/json',
}

async function raw(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const buf = await res.arrayBuffer()
  const charset = /charset=([^;]+)/i.exec(res.headers.get('content-type') ?? '')?.[1]?.trim()
  const text = new TextDecoder(charset && charset.toLowerCase() !== 'utf-8' ? charset : 'utf-8').decode(buf)
  return { status: res.status, contentType: res.headers.get('content-type'), text: text.slice(0, 400) }
}

async function main() {
  console.log('== controle: GET /convenio/ com as MESMAS credenciais ==')
  const controle = await raw('GET', '/convenio/')
  console.log(`  status ${controle.status} · ${controle.text.slice(0, 80)}\n`)

  const tentativas: { rotulo: string; body: unknown }[] = [
    {
      rotulo: 'nome = nome do convenio',
      body: { nome: 'AMEP FREGUESIA - IDEAL PME 2', uf: 'RJ', calculoVidaList: [{ idade: 30, parentesco: { id: 1 } }] },
    },
    {
      rotulo: 'nome = nome do plano',
      body: { nome: 'IDEAL PME 2', uf: 'RJ', calculoVidaList: [{ idade: 30, parentesco: { id: 1 } }] },
    },
    {
      rotulo: 'nome = codigo do plano',
      body: { nome: 'YTFVT7U6AN', uf: 'RJ', calculoVidaList: [{ idade: 30, parentesco: { id: 1 } }] },
    },
    {
      rotulo: 'nome = codigo do convenio',
      body: { nome: 'DEW9GLTFYD', uf: 'RJ', calculoVidaList: [{ idade: 30, parentesco: { id: 1 } }] },
    },
    {
      rotulo: 'nome = nome do simulante (pessoa)',
      body: { nome: 'Teste Cotacao', uf: 'RJ', calculoVidaList: [{ idade: 30, parentesco: { id: 1 } }] },
    },
    {
      rotulo: 'corpo minimo, sem uf',
      body: { nome: 'Teste Cotacao', calculoVidaList: [{ idade: 30, parentesco: { id: 1 } }] },
    },
    {
      rotulo: 'array de vidas vazio (valida se erro muda)',
      body: { nome: 'Teste Cotacao', uf: 'RJ', calculoVidaList: [] },
    },
  ]

  for (const t of tentativas) {
    const r = await raw('POST', '/calculo/', t.body)
    console.log(`== ${t.rotulo}`)
    console.log(`   status ${r.status} · ${r.contentType}`)
    console.log(`   ${r.text.replace(/\s+/g, ' ').slice(0, 200)}\n`)
  }

  // Nenhum outro POST é testado aqui de propósito: /calculo/ é simulação e não
  // grava nada, mas /pendencia/, /contrato/ e /produtor/ escrevem em produção.
}

main().catch(console.error)
