// Checagem SÓ DE LEITURA para os 5 minutos antes da demo do Clube de Benefícios.
// Não cria assinatura, não roda automação, não grava arquivo.
//
// Uso (na raiz do repo, com API e web no ar):
//   node scripts/demo/demo-precheck.mjs
//
// Variáveis opcionais: DEMO_API (http://localhost:3333), DEMO_WEB (http://localhost:3000),
// DEMO_TENANT (mapcard2), DEMO_PLATFORM_EMAIL / DEMO_PLATFORM_PASSWORD (padrão: o
// superadmin de desenvolvimento do README) e DEMO_BACKUP_EMAIL (associado reserva do plano B).
const API = (process.env.DEMO_API ?? 'http://localhost:3333').replace(/\/$/, '')
const WEB = (process.env.DEMO_WEB ?? 'http://localhost:3000').replace(/\/$/, '')
const TENANT = process.env.DEMO_TENANT ?? 'mapcard2'
const PLATFORM_EMAIL = process.env.DEMO_PLATFORM_EMAIL ?? 'super@annetec.com.br'
const PLATFORM_PASSWORD = process.env.DEMO_PLATFORM_PASSWORD ?? 'super123456'
const BACKUP_EMAIL = process.env.DEMO_BACKUP_EMAIL ?? 'qa-e2e-familia-mukhnfyd@clube.mapcard2.test'
const T = `${API}/api/v1/t/${TENANT}`

let failures = 0
const brl = n => (typeof n === 'number' ? 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(n))
const cpfMask = d => (/^\d{11}$/.test(d) ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d)
const ok = (label, cond, extra = '') => {
  if (!cond) failures++
  console.log(`${cond ? 'OK   ' : 'FALHA'} ${label}${extra ? ' — ' + extra : ''}`)
}
async function get(url, token) {
  const r = await fetch(url, { headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(20000) })
  return { status: r.status, json: await r.json().catch(() => null) }
}

const health = await get(`${API}/healthz`).catch(() => ({ status: 0 }))
ok(`API no ar (${API})`, health.status === 200, `http ${health.status}`)
// 1ª visita compila a rota no modo dev: esta checagem também serve de aquecimento.
for (const p of [`/${TENANT}`, `/${TENANT}/planos`, `/${TENANT}/assinar`, '/login']) {
  const t0 = Date.now()
  const r = await fetch(`${WEB}${p}`, { signal: AbortSignal.timeout(90000) }).then(x => x.status).catch(() => 0)
  ok(`web ${p}`, r === 200, `http ${r} em ${Date.now() - t0} ms`)
}

const ctx = await get(`${T}/public/checkout/contexto`).catch(() => ({ json: null }))
const plans = (ctx.json?.data?.plans ?? []).filter(p => p.status === 'active')
ok('checkout com Essencial, Plus e Família', ['Essencial', 'Plus', 'Família'].every(n => plans.some(p => p.name === n)), plans.map(p => `${p.name} ${brl(p.priceMonthly)}`).join(' · '))
const familia = plans.find(p => p.name === 'Família')
if (familia) {
  console.log(`\nLinks com o id atual do Família (${familia.id}):`)
  console.log(`  checkout direto:   ${WEB}/${TENANT}/assinar?plano=${familia.id}`)
  console.log(`  cadastros filtro:  ${WEB}/${TENANT}/admin/cadastros?plano=${familia.id}`)
}

const login = await fetch(`${API}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD }),
})
  .then(r => r.json())
  .catch(() => null)
const token = login?.data?.token
console.log('')
ok(`login Plataforma ${PLATFORM_EMAIL}`, Boolean(token))

if (token) {
  const r = (await get(`${T}/faturamento/resumo`, token)).json?.data
  if (r) {
    console.log(
      `\nResumo: MRR ${brl(r.mrr)} · ativas ${r.activeSubscriptions} · novas no mês ${r.newThisMonth} · dependentes ${r.totalDependents} · ` +
        `recebido no mês ${brl(r.receivedThisMonth)} · a receber ${brl(r.pendingThisMonth)} · em atraso ${brl(r.overdueAmount)} (${r.overdueCharges}) · ` +
        `inadimplência ${r.delinquencyRate}% · suspensas ${r.suspendedSubscriptions} · canceladas no mês ${r.canceledThisMonth} · gateway ${r.gateway}`,
    )
  }
  const s = (await get(`${T}/faturamento/planos/estatisticas`, token)).json?.data
  if (s) {
    for (const p of s.plans) console.log(`  ${p.planName}: ${p.holders} titulares · ${p.dependents} dependentes · ${p.lives} vidas · MRR ${brl(p.mrr)} · canceladas ${p.canceled} · suspensas ${p.suspended}`)
    console.log(`  TOTAL: ${s.totals.holders} titulares · ${s.totals.dependents} dependentes · ${s.totals.lives} vidas · MRR ${brl(s.totals.mrr)}`)
  }

  const subs = (await get(`${T}/faturamento/assinaturas?page=1&perPage=8`, token)).json?.data ?? []
  console.log('\nÚltimos cadastros (o que o Início do painel mostra):')
  for (const x of subs) {
    const email = x.holder?.email ?? ''
    const test = /qa-|curl-|@exemplo\.com$/.test(email) || /\bQa\b|Teste/.test(x.holder?.name ?? '')
    console.log(`  ${test ? '[TESTE] ' : ''}${x.holder?.name} · ${x.planName} · ${x.status} · ${email}`)
  }

  // Associado reserva do plano B: o CPF não fica no repositório, sai daqui na hora.
  const backup = (await get(`${T}/faturamento/assinaturas?q=${encodeURIComponent(BACKUP_EMAIL)}&page=1&perPage=5`, token)).json?.data ?? []
  const active = backup.find(x => x.holder?.email === BACKUP_EMAIL && x.status === 'active')
  console.log('')
  ok('associado reserva (plano B) ativo', Boolean(active), active ? `CPF ${cpfMask(active.holder.cpf)} + ${BACKUP_EMAIL} · ${active.planName}` : `${BACKUP_EMAIL} não encontrado`)
}

console.log(failures === 0 ? '\nTUDO OK para a demo.' : `\n${failures} FALHA(S) — veja o plano B do roteiro.`)
process.exit(failures === 0 ? 0 : 1)
