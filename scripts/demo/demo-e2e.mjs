// Jornada completa da demo do Clube de Benefícios (Chrome headless via CDP, sem dependências).
//
// Uso (na raiz do repo, com API e web no ar):
//   node scripts/demo/demo-e2e.mjs vitrine,planos,checkout,portal,painel,mobile
// Fluxos: vitrine, planos, checkout, portal, login-portal, painel, mobile.
//
// ATENÇÃO: o fluxo `checkout` cria 1 assinante Família de verdade no tenant mapcard2
// (dados de exemplo da tela, e-mail qa-e2e-demo-<ts>@clube.mapcard2.test).
// Prints, estado entre execuções e o perfil temporário do Chrome ficam FORA do
// repositório, em DEMO_OUT (padrão: <tmp do sistema>/annetec-demo). Nunca imprime token.
//
// Variáveis opcionais: DEMO_WEB (http://localhost:3000), DEMO_API (http://localhost:3333),
// DEMO_OUT e CHROME_PATH.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WORK = process.env.DEMO_OUT ?? join(tmpdir(), 'annetec-demo')
const OUT = join(WORK, 'shots')
const STATE = join(WORK, 'demo-state.json')
const PROFILE = join(WORK, `chrome-${Date.now()}`)
const CHROME =
  process.env.CHROME_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find(p => existsSync(p))
if (!CHROME) throw new Error('Chrome não encontrado: defina CHROME_PATH')
const WEB = (process.env.DEMO_WEB ?? 'http://localhost:3000').replace(/\/$/, '')
const API = (process.env.DEMO_API ?? 'http://localhost:3333').replace(/\/$/, '')
// Id do Família lido da API: muda se o banco for semeado de novo.
const checkoutContext = await fetch(`${API}/api/v1/t/mapcard2/public/checkout/contexto`).then(r => r.json()).catch(() => null)
const FAMILIA = checkoutContext?.data?.plans?.find(p => p.name === 'Família')?.id
if (!FAMILIA) throw new Error(`plano Família não encontrado em ${API} (a API está no ar?)`)
const flows = (process.argv[2] ?? 'vitrine,planos,checkout,portal,painel,mobile').split(',')
mkdirSync(OUT, { recursive: true })
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {}
const saveState = () => writeFileSync(STATE, JSON.stringify(state, null, 2), 'utf8')

async function portInUse(port) {
  try { await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(800) }); return true } catch { return false }
}
let PORT = 0
for (let i = 0; i < 20 && !PORT; i++) {
  const candidate = 9700 + Math.floor(Math.random() * 250)
  if (!(await portInUse(candidate))) PORT = candidate
}
if (!PORT) throw new Error('sem porta livre')
console.log('porta CDP', PORT)

const sleep = ms => new Promise(r => setTimeout(r, ms))
const chrome = spawn(
  CHROME,
  ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', '--window-size=1366,900', 'about:blank'],
  { stdio: 'ignore' },
)

async function pageWs() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find(t => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(200)
  }
  throw new Error('Chrome não subiu')
}

const ws = new WebSocket(await pageWs())
await new Promise(r => ws.addEventListener('open', r))
let seq = 0
const pending = new Map()
const handlers = new Map()
ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
  } else if (msg.method) (handlers.get(msg.method) ?? []).forEach(fn => fn(msg.params))
})
const send = (method, params = {}) => {
  const id = ++seq
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}
const on = (method, fn) => handlers.set(method, [...(handlers.get(method) ?? []), fn])

const problems = []
on('Runtime.exceptionThrown', p => problems.push(`EXCEPTION ${(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text).slice(0, 400)}`))
on('Runtime.consoleAPICalled', p => {
  if (p.type === 'error' || p.type === 'warning') {
    const text = p.args.map(a => a.value ?? a.description ?? '').join(' ')
    if (/Download the React DevTools|\[HMR\]|Fast Refresh/.test(text)) return
    problems.push(`console.${p.type}: ${text.slice(0, 400)}`)
  }
})
on('Log.entryAdded', p => {
  if (p.entry.level === 'error') problems.push(`log.error: ${p.entry.text.slice(0, 300)} ${p.entry.url ?? ''}`)
})
on('Network.responseReceived', p => {
  const { status, url } = p.response
  if (status >= 500 || (status >= 400 && !/favicon|\.map$|__nextjs|_next\/static/.test(url))) problems.push(`http ${status} ${url.slice(0, 160)}`)
})
await send('Runtime.enable')
await send('Log.enable')
await send('Page.enable')
await send('Network.enable')
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result.value
}
async function waitFor(expression, label, timeout = 60000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    try {
      if (await evaluate(expression)) return Date.now() - t0
    } catch {}
    await sleep(250)
  }
  throw new Error(`timeout esperando: ${label}`)
}
const NB = `.replace(/\\u00a0/g, ' ')`
const hasText = text => `document.body && document.body.innerText${NB}.includes(${JSON.stringify(text)})`
const mainText = () => evaluate(`(document.querySelector('main')?.innerText ?? document.body.innerText)${NB}`)
const FIND = `(text, sel) => [...document.querySelectorAll(sel)].find(e => {
  const r = e.getBoundingClientRect(); const s = getComputedStyle(e)
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && e.textContent.replace(/\\s+/g, ' ').trim().includes(text)
})`

async function click(text, sel = 'button, a, [role=radio], [role=tab], [role=checkbox], [role=option], [role=menuitem], label') {
  const found = await evaluate(`(() => { const el = (${FIND})(${JSON.stringify(text)}, ${JSON.stringify(sel)}); if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'instant' }); return true })()`)
  if (!found) throw new Error(`não achei para clicar: "${text}" (${sel})`)
  const measure = () => evaluate(`(() => { const el = (${FIND})(${JSON.stringify(text)}, ${JSON.stringify(sel)}); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, disabled: !!el.disabled } })()`)
  let pos = await measure()
  for (let i = 0; i < 20; i++) {
    await sleep(110)
    const next = await measure()
    if (Math.abs(next.y - pos.y) < 0.5 && Math.abs(next.x - pos.x) < 0.5) break
    pos = next
  }
  if (pos.disabled) throw new Error(`desabilitado: "${text}"`)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1, pointerType: 'mouse' })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1, pointerType: 'mouse' })
  await sleep(300)
}
/** Marca um elemento achado por JS e clica nele com o mouse de verdade. */
async function clickJs(findExpr, label) {
  const ok = await evaluate(`(() => { document.querySelectorAll('[data-qa-target]').forEach(e => e.removeAttribute('data-qa-target')); const el = ${findExpr}; if (!el) return false; el.setAttribute('data-qa-target', '1'); return true })()`)
  if (!ok) throw new Error(`não achei: ${label}`)
  await click('', '[data-qa-target="1"]')
}
async function typeInto(selector, value) {
  const ok = await evaluate(`(() => { const all = document.querySelectorAll(${JSON.stringify(selector)}); const el = all[all.length - 1]; if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'instant' }); el.focus(); el.select?.(); return true })()`)
  if (!ok) throw new Error(`campo não encontrado: ${selector}`)
  await send('Input.insertText', { text: value })
  await sleep(200)
}
async function shot(name, fullPage = false) {
  let params = { format: 'png' }
  if (fullPage) {
    const m = await send('Page.getLayoutMetrics')
    params = { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: m.cssContentSize.width, height: Math.min(m.cssContentSize.height, 5000), scale: 1 } }
  }
  const { data } = await send('Page.captureScreenshot', params)
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'))
  console.log(`  shot ${name}.png`)
}
async function goto(path) {
  await send('Page.navigate', { url: path.startsWith('http') || path.startsWith('about:') ? path : `${WEB}${path}` })
  await sleep(600)
}
async function viewport(width, height, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
}
const path = () => evaluate('location.pathname + location.search + location.hash')
const log = (...args) => console.log('   ', ...args)
const h1Has = text => `document.querySelector('main h1')?.textContent?.includes(${JSON.stringify(text)})`
const noHScroll = () => evaluate('document.documentElement.scrollWidth <= window.innerWidth')

const results = []
async function run(name, fn) {
  const before = problems.length
  const t0 = Date.now()
  try {
    await fn()
    results.push(`OK   ${name} (${Math.round((Date.now() - t0) / 1000)} s)`)
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`)
    try { await shot(`erro-${name}`) } catch {}
  }
  if (problems.length > before) results.push(...problems.slice(before).map(p => `     ${p}`))
}

await viewport(1366, 900)

// 1. Vitrine -----------------------------------------------------------------
if (flows.includes('vitrine')) await run('1-vitrine', async () => {
  await goto('/mapcard2')
  const ms = await waitFor(`${hasText('Essencial')} && ${hasText('Família')} && ${hasText('79,90')}`, 'planos na vitrine', 120000)
  log('vitrine com planos em', ms, 'ms')
  await sleep(1200)
  const t = await mainText()
  for (const s of ['Essencial', 'Plus', 'Família', '29,90', '49,90', '79,90']) if (!t.includes(s)) throw new Error(`vitrine sem "${s}"`)
  if (t.includes('Odonto')) log('ATENÇÃO: Odonto (inativo) aparece na vitrine')
  const ctas = await evaluate(`[...document.querySelectorAll('a[href*="/assinar"]')].map(a => a.getAttribute('href')).slice(0, 6)`)
  log('links para o checkout:', JSON.stringify(ctas))
  log('h1:', await evaluate(`document.querySelector('h1')?.innerText ?? ''`))
  await shot('01-vitrine', true)
})

// 2. Planos + comparativo + âncora --------------------------------------------
if (flows.includes('planos')) await run('2-planos-comparativo', async () => {
  await goto('/mapcard2/planos')
  await waitFor(hasText('Compare os planos lado a lado'), 'comparativo', 120000)
  await sleep(1000)
  await shot('02-planos', true)
  // Aba nova (o link do checkout usa target=_blank): carga completa com o hash.
  await goto('about:blank')
  await goto('/mapcard2/planos#comparativo')
  await waitFor(`!!document.getElementById('comparativo')`, 'seção #comparativo', 120000)
  await sleep(3000)
  const pos = await evaluate(`(() => { const r = document.getElementById('comparativo').getBoundingClientRect(); return { top: Math.round(r.top), scrollY: Math.round(scrollY), hash: location.hash } })()`)
  log('âncora #comparativo após carga completa:', JSON.stringify(pos))
  state.anchor = pos
  await shot('03-planos-ancora')
  if (!(pos.top > -40 && pos.top < 160)) throw new Error(`âncora não posicionou a seção no topo (top=${pos.top}, scrollY=${pos.scrollY})`)
})

// 3-4. Checkout Família + 3 via Pix, simular pagamento, sucesso ---------------
if (flows.includes('checkout')) await run('3-checkout-familia-pix', async () => {
  await viewport(1366, 900)
  await goto('/mapcard2/assinar')
  await waitFor(h1Has('Escolha o seu plano'), 'passo plano', 120000)
  await sleep(600)
  const compareHref = await evaluate(`[...document.querySelectorAll('a')].find(a => a.textContent.includes('Comparar todas as coberturas'))?.getAttribute('href')`)
  log('link Comparar do checkout:', compareHref)
  if (compareHref !== '/mapcard2/planos#comparativo') throw new Error(`link Comparar aponta para ${compareHref}`)
  await click('', `label:has(input[name=plano][value="${FAMILIA}"])`)
  await sleep(400)
  await shot('04-checkout-plano')
  await click('Continuar', 'button')
  await waitFor(h1Has('Seus dados'), 'passo titular')
  await click('Preencher com dados de exemplo')
  await waitFor(`[...document.querySelectorAll('input[name=cpf]')].some(i => i.value.length === 14)`, 'CPF preenchido')
  const email = `qa-e2e-demo-${Date.now().toString(36)}@clube.mapcard2.test`
  await typeInto('input[name=email]', email)
  const holder = await evaluate(`({ name: document.querySelector('input[name=name]')?.value, cpf: document.querySelector('input[name=cpf]')?.value, email: document.querySelector('input[name=email]')?.value })`)
  log('titular:', JSON.stringify(holder))
  state.holder = holder
  saveState()
  await click('Continuar', 'button')
  await waitFor(h1Has('Quem vem com você?'), 'passo dependentes')
  for (let i = 0; i < 3; i++) {
    await click('Exemplo', 'button')
    await sleep(350)
  }
  await waitFor(hasText('3 dependentes inclusos no plano'), '3 inclusos', 15000)
  const summary = (await evaluate(`document.querySelector('aside[aria-label="Resumo do pedido"]')?.innerText ?? ''`)).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ')
  log('resumo:', summary.slice(0, 300))
  if (!summary.includes('R$ 129,80') || !summary.includes('R$ 79,90/mês')) throw new Error('resumo sem 129,80 / 79,90')
  await shot('05-checkout-dependentes', true)
  await click('Continuar', 'button')
  await waitFor(h1Has('Como você prefere pagar?'), 'passo pagamento')
  await click('Pix', '[role=tab]')
  await waitFor(hasText('carteirinha liberada em segundos'), 'aba pix')
  await click('Revisar pedido', 'button')
  await waitFor(h1Has('Revise e confirme'), 'revisão')
  await click('', 'button#accept-terms')
  await waitFor("document.querySelector('#accept-terms')?.getAttribute('aria-checked') === 'true'", 'termos aceitos', 5000)
  await shot('06-checkout-revisao', true)
  await click('Confirmar assinatura', 'button')
  await waitFor(hasText('Pix copia e cola'), 'painel Pix', 90000)
  await sleep(800)
  const pix = await mainText()
  if (!pix.includes('R$ 129,80')) throw new Error('painel Pix sem R$ 129,80')
  await shot('07-checkout-pix', true)
  state.checkoutUrl = (await path()).replace(/chave=[^&]+/, 'chave=…')
  log('URL do resultado:', state.checkoutUrl)
  await click('Simular pagamento (demonstração)', 'button')
  await waitFor(hasText('Assinatura confirmada'), 'sucesso', 90000)
  await sleep(1500)
  const done = await mainText()
  const cards = [...new Set(done.match(/MAP-\d{4}-\d{5}(?:-\d{2})?/g) ?? [])]
  log('carteirinhas no sucesso:', cards.join(', '))
  state.cards = cards
  saveState()
  if (cards.length !== 4) throw new Error(`sucesso mostra ${cards.length} carteirinhas`)
  if (!done.includes('R$ 129,80') || !done.includes('R$ 79,90')) throw new Error('sucesso sem 129,80/79,90')
  await shot('08-checkout-sucesso', true)
  await click('Acessar minha área', 'button, a')
  await waitFor(`location.pathname === '/mapcard2/cliente'`, 'ir para o portal', 60000)
  log('após "Acessar minha área":', await path())
})

// 5. Portal do associado -------------------------------------------------------
async function portalChecks(prefix) {
  await waitFor(`location.pathname === '/mapcard2/cliente' && ${hasText('Família')}`, 'portal com o plano', 90000)
  await sleep(1500)
  const home = await mainText()
  log('portal início (trecho):', home.replace(/\s+/g, ' ').slice(0, 260))
  await shot(`${prefix}-portal-inicio`, true)
  await goto('/mapcard2/cliente/carteirinha')
  await waitFor(`/MAP-\\d{4}-\\d{5}/.test(document.body.innerText)`, 'carteirinhas', 90000)
  await sleep(1000)
  const cards = [...new Set((await mainText()).match(/MAP-\d{4}-\d{5}(?:-\d{2})?/g) ?? [])]
  log('carteirinhas no portal:', cards.join(', '))
  await shot(`${prefix}-portal-carteirinhas`, true)
  if (state.cards && !state.cards.every(c => cards.includes(c))) throw new Error('portal não mostra as 4 carteirinhas do checkout')
  await goto('/mapcard2/cliente/beneficios')
  await waitFor(`${hasText('Libera em')} || ${hasText('Liberado')}`, 'coberturas com carência', 90000)
  await sleep(1000)
  const ben = await mainText()
  const libera = (ben.match(/Libera em \d{2}\/\d{2}\/\d{4}/g) ?? []).length
  const liberado = (ben.match(/Liberado/g) ?? []).length
  log(`benefícios: ${libera} "Libera em", ${liberado} "Liberado"`)
  if (libera === 0) throw new Error('nenhuma cobertura com carência ("Libera em")')
  await shot(`${prefix}-portal-beneficios`, true)
  await goto('/mapcard2/cliente/faturas')
  await waitFor(`${hasText('Minhas faturas')} && ${hasText('129,80')}`, 'faturas com 129,80', 90000)
  await sleep(800)
  log('faturas (trecho):', (await mainText()).replace(/\s+/g, ' ').slice(0, 260))
  await shot(`${prefix}-portal-faturas`, true)
  await goto('/mapcard2/cliente/dependentes')
  await waitFor(`${hasText('Qa') } || /MAP-\\d{4}-\\d{5}-0\\d/.test(document.body.innerText)`, 'dependentes', 60000).catch(() => null)
  await sleep(800)
  await shot(`${prefix}-portal-dependentes`, true)
  // Portal no mobile 360
  await viewport(360, 780, true)
  await goto('/mapcard2/cliente')
  await waitFor(hasText('Família'), 'portal mobile', 60000)
  await sleep(1000)
  log('portal 360 sem scroll horizontal:', await noHScroll())
  await shot(`${prefix}-portal-mobile-360`)
  await viewport(1366, 900)
}
if (flows.includes('portal')) await run('5-portal-associado', async () => {
  if ((await path()).startsWith('/mapcard2/cliente')) return portalChecks('09')
  await goto('/mapcard2/cliente')
  await portalChecks('09')
})

// Plano B: entrar no portal pela tela de login (CPF + e-mail) ------------------
if (flows.includes('login-portal')) await run('5b-login-portal-cpf-email', async () => {
  await send('Network.clearBrowserCookies')
  await goto('/login')
  await click('Associado', 'button')
  await waitFor(`!!document.querySelector('#cpf')`, 'campo CPF')
  await typeInto('#cpf', state.holder.cpf.replace(/\D/g, ''))
  await typeInto('#login-email', state.holder.email)
  await click('Acessar Meus Benefícios', 'button')
  await waitFor(`location.pathname === '/mapcard2/cliente'`, 'portal após login', 60000)
  await portalChecks('10')
})

// 6-7. Painel do inquilino entrando pela plataforma -----------------------------
if (flows.includes('painel')) await run('6-login-plataforma-e-portal-do-admin', async () => {
  await send('Network.clearBrowserCookies')
  await viewport(1366, 900)
  await goto('/login')
  await click('Plataforma', 'button')
  await typeInto('#login-email', 'super@annetec.com.br')
  await typeInto('#login-password', 'super123456')
  await click('Acessar Painel', 'button')
  await waitFor(`location.pathname === '/admin'`, 'painel da plataforma', 90000)
  await goto('/admin/inquilinos')
  await waitFor(`!!document.querySelector('a[href="/mapcard2"]')`, 'MapCard2 na lista', 90000)
  await sleep(600)
  await shot('11-plataforma-inquilinos')
  await clickJs(`document.querySelector('a[href="/mapcard2"]').closest('tr').querySelector('a[href^="/admin/inquilinos/"]')`, 'Gerenciar MapCard2')
  await waitFor(`/^\\/admin\\/inquilinos\\/[0-9a-f-]{36}$/.test(location.pathname) && ${hasText('Portal do admin')}`, 'detalhe do inquilino', 90000)
  state.tenantAdminPath = await path()
  await sleep(600)
  await shot('12-plataforma-mapcard2')
  await click('Portal do admin', 'button, a')
  await waitFor(`location.pathname === '/mapcard2/admin'`, 'painel do inquilino', 90000)
  log('entrou em', await path())
})

if (flows.includes('painel')) await run('7a-inicio-bloco-do-clube', async () => {
  await waitFor(`!!document.getElementById('clube-beneficios')`, 'bloco Clube de Benefícios', 90000)
  await waitFor(`${hasText('Últimos cadastros')} && ${hasText('Últimos pagamentos')}`, 'listas do bloco', 60000)
  await sleep(2500)
  const block = (await evaluate(`document.getElementById('clube-beneficios').closest('section').innerText`)).replace(/\u00a0/g, ' ')
  log('bloco do clube:', block.replace(/\s+/g, ' ').slice(0, 600))
  state.homeBlock = block.replace(/\s+/g, ' ').slice(0, 1200)
  const first = state.holder?.name?.split(' ')[0]
  if (first && !block.includes(first)) log(`ATENÇÃO: "${first}" não aparece no bloco do Início`)
  await shot('13-painel-inicio', true)
})

if (flows.includes('painel')) await run('7b-produtos-e-planos', async () => {
  await click('Produtos e Planos', 'nav[aria-label="Menu do painel"] a')
  await waitFor(h1Has('Produtos e Planos'), 'h1 Produtos e Planos', 90000)
  await waitFor(`document.querySelectorAll('main article').length >= 4 && ${hasText('das vidas')}`, 'linhas de plano', 90000)
  await sleep(1000)
  const kpis = await evaluate(`[...document.querySelectorAll('main section[aria-label="Indicadores do clube"] p')].map(p => p.textContent).join(' · ')`)
  log('KPIs:', kpis)
  state.planKpis = kpis
  const rows = await evaluate(`[...document.querySelectorAll('main article')].map(a => a.innerText.replace(/\\s+/g, ' ').slice(0, 160))`)
  rows.forEach(r => log('  ', r))
  state.planRows = rows
  await shot('14-painel-planos', true)
  await goto(`/mapcard2/admin/planos/${FAMILIA}`)
  await waitFor(h1Has('Família'), 'detalhe Família', 90000)
  await sleep(1200)
  await shot('15-painel-plano-familia', true)
  for (const tab of ['Coberturas', 'Regras']) {
    await click(tab, '[role=tab]')
    await sleep(900)
  }
  await click('Pessoas', '[role=tab]')
  await waitFor(`document.querySelectorAll('main table tbody tr').length > 0`, 'tabela Pessoas', 90000)
  await sleep(800)
  const first = state.holder?.name ?? ''
  if (first) {
    await typeInto('main input[type=search]', first)
    await sleep(2000)
    const names = await evaluate(`[...document.querySelectorAll('main table tbody tr')].map(tr => tr.innerText.replace(/\\s+/g, ' ').slice(0, 120))`)
    log('Pessoas busca:', JSON.stringify(names))
    if (!names.some(n => n.includes(first))) throw new Error('novo assinante não aparece em Pessoas')
  }
  await shot('16-painel-plano-pessoas')
})

if (flows.includes('painel')) await run('7c-cadastros', async () => {
  await click('Cadastros', 'nav[aria-label="Menu do painel"] a')
  await waitFor(`location.pathname === '/mapcard2/admin/cadastros' && document.querySelectorAll('main table tbody tr').length > 0`, 'tabela de cadastros', 90000)
  await sleep(1500)
  const firstRow = await evaluate(`document.querySelector('main table tbody tr')?.innerText.replace(/\\s+/g, ' ').slice(0, 200)`)
  log('1ª linha:', firstRow)
  const name = state.holder?.name ?? ''
  if (name && !firstRow.includes(name.split(' ')[0])) log('ATENÇÃO: o novo assinante não é a 1ª linha')
  await shot('17-painel-cadastros', true)
  await typeInto('main input[placeholder^="Buscar por nome"]', state.holder?.email ?? '')
  await sleep(2500)
  const found = await evaluate(`[...document.querySelectorAll('main table tbody tr')].map(tr => tr.innerText.replace(/\\s+/g, ' ').slice(0, 200))`)
  log('busca e-mail:', JSON.stringify(found.slice(0, 3)))
  if (name && !found.some(r => r.includes(name.split(' ')[0]))) throw new Error('busca por e-mail não achou o novo assinante')
  await goto(`/mapcard2/admin/cadastros?plano=${FAMILIA}`)
  await waitFor(`document.querySelectorAll('main table tbody tr').length > 0`, 'cadastros ?plano=', 90000)
  await sleep(1500)
  const filters = await evaluate(`[...document.querySelectorAll('main button[role=combobox]')].map(b => b.textContent).join(' | ')`)
  const planCol = await evaluate(`[...document.querySelectorAll('main table tbody tr')].map(tr => tr.querySelectorAll('td')[1]?.innerText.split('\\n')[0]).filter(Boolean)`)
  const footer = await evaluate(`[...document.querySelectorAll('main p')].map(p => p.textContent).find(t => t.startsWith('Mostrando')) ?? ''`)
  log('?plano= filtros:', filters, '| coluna plano:', JSON.stringify([...new Set(planCol)]), '|', footer)
  if (!filters.includes('Família')) throw new Error('filtro ?plano= não selecionou Família')
  if (planCol.some(p => !p.includes('Família'))) throw new Error('?plano= trouxe outro plano')
  await shot('18-painel-cadastros-familia')
})

if (flows.includes('painel')) await run('7d-faturamento', async () => {
  await click('Faturamento', 'nav[aria-label="Menu do painel"] a')
  await waitFor(`location.pathname === '/mapcard2/admin/faturamento' && ${hasText('Visão geral')}`, 'faturamento', 90000)
  await sleep(2500)
  log('visão geral (trecho):', (await mainText()).replace(/\s+/g, ' ').slice(0, 500))
  state.billingOverview = (await mainText()).replace(/\s+/g, ' ').slice(0, 1500)
  await shot('19-painel-faturamento', true)
  await click('Cobranças', '[role=tab]')
  await waitFor(`document.querySelectorAll('main table tbody tr').length > 0`, 'tabela de cobranças', 90000)
  await sleep(1500)
  const first = state.holder?.name?.split(' ')[0] ?? ''
  const rows = await evaluate(`[...document.querySelectorAll('main table tbody tr')].slice(0, 4).map(tr => tr.innerText.replace(/\\s+/g, ' ').slice(0, 160))`)
  log('cobranças (topo):', JSON.stringify(rows))
  const paidRow = rows.find(r => r.includes(first) && r.includes('129,80'))
  if (!paidRow) log('ATENÇÃO: cobrança do novo assinante não está no topo da lista')
  await shot('20-painel-cobrancas', true)
  if (paidRow) {
    await clickJs(`[...document.querySelectorAll('main table tbody tr')].find(tr => tr.innerText.includes(${JSON.stringify(first)}) && tr.innerText.includes('129,80'))`, 'linha da cobrança')
    await waitFor(`!!document.querySelector('[role=dialog]')`, 'ficha da cobrança', 30000)
    await sleep(1500)
    const sheet = (await evaluate(`document.querySelector('[role=dialog]').innerText`)).replace(/\s+/g, ' ')
    log('ficha da cobrança:', sheet.slice(0, 500))
    await shot('21-painel-cobranca-ficha')
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await sleep(600)
  }
  await click('Automação', '[role=tab]')
  await waitFor(hasText('Executar automação agora'), 'aba automação', 60000)
  await sleep(1500)
  await shot('22-painel-automacao', true)
  await click('Executar automação agora', 'button')
  await waitFor(`${hasText('Nada pendente — tudo em dia')} || ${hasText('Resultado da execução')}`, 'resultado da automação', 60000)
  await sleep(800)
  const auto = (await mainText()).replace(/\s+/g, ' ')
  const idx = auto.indexOf('Nada pendente') >= 0 ? auto.indexOf('Nada pendente') : auto.indexOf('Resultado da execução')
  log('automação:', auto.slice(idx, idx + 300))
  const events = await evaluate(`(() => { const t = document.querySelector('main').innerText; const i = t.search(/Eventos|Linha do tempo|Últimos eventos/i); return i >= 0 ? t.slice(i, i + 400).replace(/\\s+/g, ' ') : '' })()`)
  log('eventos:', events)
  await shot('23-painel-automacao-resultado', true)
})

// 8. Sidebar no mobile 360 ------------------------------------------------------
if (flows.includes('mobile')) await run('8-mobile-360', async () => {
  await viewport(360, 780, true)
  await goto('/mapcard2/admin')
  await waitFor(`!!document.querySelector('nav[aria-label="Navegação móvel"]') && !!document.getElementById('clube-beneficios')`, 'painel mobile', 90000)
  await sleep(1500)
  const labels = await evaluate(`[...document.querySelectorAll('nav[aria-label="Navegação móvel"] a span, nav[aria-label="Navegação móvel"] button span')].map(s => ({ t: s.textContent, cut: s.scrollWidth > s.clientWidth }))`)
  log('barra 360:', labels.map(l => `${l.t}${l.cut ? ' (CORTADO)' : ''}`).join(' · '))
  const ok = await noHScroll()
  log('sem scroll horizontal:', ok)
  await shot('24-mobile-360-inicio')
  if (labels.some(l => l.cut)) throw new Error('rótulo cortado na barra móvel')
  if (!ok) throw new Error('scroll horizontal no Início 360')
  await clickJs(`[...document.querySelectorAll('nav[aria-label="Navegação móvel"] button')].pop()`, 'botão Mais')
  await waitFor(`!!document.querySelector('[role=dialog]')`, 'menu Mais', 10000)
  await sleep(700)
  const more = await evaluate(`[...document.querySelectorAll('[role=dialog] a')].map(a => a.innerText.trim()).filter(Boolean)`)
  log('menu Mais:', more.join(' | '))
  await shot('25-mobile-360-mais')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(500)
  for (const [label, seg] of [['Produtos', 'planos'], ['Cadastros', 'cadastros'], ['Faturamento', 'faturamento']]) {
    await click(label, 'nav[aria-label="Navegação móvel"] a')
    await waitFor(`location.pathname === '/mapcard2/admin/${seg}'`, `ir para ${seg}`, 60000)
    await sleep(2500)
    const fits = await noHScroll()
    log(`${seg} 360 sem scroll horizontal:`, fits)
    await shot(`26-mobile-360-${seg}`)
    if (!fits) results.push(`WARN scroll horizontal em /admin/${seg} a 360px`)
  }
  await viewport(1366, 900)
})

saveState()
console.log('\n' + results.join('\n'))
console.log(`\n${problems.length} problema(s) de console/rede no total`)
console.log(`prints em ${OUT}`)
ws.close()
chrome.kill()
await sleep(1500)
try {
  rmSync(PROFILE, { recursive: true, force: true })
} catch {}
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
