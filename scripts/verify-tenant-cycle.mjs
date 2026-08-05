// End-to-end check of the multi-tenant cycle against the real action layer,
// driving a fake localStorage the same way the browser would.
//
// Run with: node --experimental-strip-types scripts/verify-tenant-cycle.mjs
// (loaded through tsx/esbuild by `pnpm verify:cycle`)

import assert from 'node:assert/strict'

// --- fake localStorage ------------------------------------------------------
const store = new Map()
globalThis.window = {
  localStorage: {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key),
  },
}
globalThis.localStorage = globalThis.window.localStorage

const { createTenant, getTenantBySlug, deleteTenant, listTenants } = await import('../lib/actions/tenants.ts')
const { createTenantUser, loginTenantUser, listUsers, deleteUser, updateUser } = await import(
  '../lib/actions/tenant-users.ts'
)
const { createPartner, listPartners } = await import('../lib/actions/partners.ts')
const { createClientPlan, listClientPlans } = await import('../lib/actions/client-plans.ts')
const { createLead, listLeads } = await import('../lib/actions/leads.ts')

let passed = 0
const check = (label, fn) =>
  fn().then(
    () => {
      passed++
      console.log(`  ok  ${label}`)
    },
    err => {
      console.error(`FAIL  ${label}\n      ${err.message}`)
      process.exitCode = 1
    }
  )

console.log('\nCiclo multi-tenant\n')

// 1. Create a tenant -------------------------------------------------------
const created = await createTenant({
  name: 'Clínica Vida',
  legalName: 'Clínica Vida Ltda',
  slug: 'clinica-vida',
  document: '11.222.333/0001-44',
  email: 'contato@clinicavida.com.br',
  phone: '(11) 4000-0000',
  address: { cep: '01000-000', street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'SP', state: 'SP' },
  branding: { primaryColor: '#0ea5e9', secondaryColor: '#1e293b' },
  planId: 'plan-1',
})
assert.ok(created.success, 'tenant criado')
const tenantId = created.data.id

await check('slug duplicado é rejeitado', async () => {
  const dup = await createTenant({ ...created.data, slug: 'clinica-vida' })
  assert.equal(dup.success, false)
})

await check('tenant é resolvido pelo slug', async () => {
  const found = await getTenantBySlug('clinica-vida')
  assert.equal(found.data.id, tenantId)
})

// 2. Admin user + login ----------------------------------------------------
await createTenantUser({
  id: '',
  tenantId,
  name: 'Ana Admin',
  email: 'ana@clinicavida.com.br',
  role: 'admin',
  createdAt: new Date(),
  password: 'senha123',
})

await check('admin do tenant consegue logar', async () => {
  const login = await loginTenantUser(tenantId, 'ana@clinicavida.com.br', 'senha123')
  assert.ok(login.success, login.error)
  assert.equal(login.data.role, 'admin')
})

await check('senha errada é rejeitada', async () => {
  const login = await loginTenantUser(tenantId, 'ana@clinicavida.com.br', 'errada')
  assert.equal(login.success, false)
})

// 3. Cross-tenant isolation ------------------------------------------------
const annetec = await getTenantBySlug('annetec')
assert.ok(annetec.data, 'tenant seed annetec existe')

await check('mesmo e-mail é permitido em tenants diferentes', async () => {
  const result = await createTenantUser({
    id: '',
    tenantId: annetec.data.id,
    name: 'Homônima',
    email: 'ana@clinicavida.com.br',
    role: 'admin',
    createdAt: new Date(),
    password: 'outra123',
  })
  assert.ok(result.success, result.error)
})

await check('e-mail duplicado no MESMO tenant é rejeitado', async () => {
  const result = await createTenantUser({
    id: '',
    tenantId,
    name: 'Clone',
    email: 'ana@clinicavida.com.br',
    role: 'admin',
    createdAt: new Date(),
    password: 'x',
  })
  assert.equal(result.success, false)
})

await check('login não cruza a fronteira do tenant', async () => {
  const login = await loginTenantUser(annetec.data.id, 'ana@clinicavida.com.br', 'senha123')
  assert.equal(login.success, false, 'senha do outro tenant não pode servir')
})

await check('listUsers só devolve usuários do próprio tenant', async () => {
  const mine = await listUsers(tenantId)
  assert.ok(mine.data.length > 0)
  assert.ok(mine.data.every(u => u.tenantId === tenantId))
})

// 4. Backoffice CRUDs ------------------------------------------------------
await check('parceiro criado fica isolado no tenant', async () => {
  await createPartner({
    tenantId,
    name: 'Farmácia Central',
    category: 'pharmacy',
    discountPercent: 25,
    address: 'Rua B, 20',
    phone: '(11) 5000-0000',
    status: 'active',
  })
  const mine = await listPartners(tenantId)
  const others = await listPartners(annetec.data.id)
  assert.equal(mine.data.length, 1)
  assert.ok(others.data.every(p => p.tenantId !== tenantId))
})

await check('plano do clube é persistido', async () => {
  await createClientPlan({ tenantId, name: 'Individual', priceMonthly: 29.9, description: 'Plano base' })
  const plans = await listClientPlans(tenantId)
  assert.equal(plans.data.length, 1)
  assert.equal(plans.data[0].name, 'Individual')
})

await check('lead é persistido com interações vazias', async () => {
  await createLead({
    tenantId,
    name: 'Lead Teste',
    email: 'lead@x.com',
    phone: '1199999',
    source: 'Website',
    status: 'new',
    notes: '',
    value: 500,
    sellerId: 'seller-x',
  })
  const leads = await listLeads(tenantId)
  assert.equal(leads.data.length, 1)
  assert.deepEqual(leads.data[0].interactions, [])
})

// 5. User lifecycle --------------------------------------------------------
await check('trocar e-mail atualiza a credencial de login', async () => {
  const users = await listUsers(tenantId)
  const ana = users.data.find(u => u.name === 'Ana Admin')
  await updateUser(ana.id, { email: 'ana.nova@clinicavida.com.br' })
  const login = await loginTenantUser(tenantId, 'ana.nova@clinicavida.com.br', 'senha123')
  assert.ok(login.success, 'login com o novo e-mail deve funcionar')
})

await check('excluir usuário libera o e-mail para reuso', async () => {
  const users = await listUsers(tenantId)
  const ana = users.data.find(u => u.name === 'Ana Admin')
  await deleteUser(ana.id)
  const recreated = await createTenantUser({
    id: '',
    tenantId,
    name: 'Ana II',
    email: 'ana.nova@clinicavida.com.br',
    role: 'admin',
    createdAt: new Date(),
    password: 'nova123',
  })
  assert.ok(recreated.success, recreated.error)
})

// 6. Tenant deletion cascades ---------------------------------------------
await check('excluir tenant remove todos os seus dados', async () => {
  await deleteTenant(tenantId)

  const users = await listUsers(tenantId)
  const partners = await listPartners(tenantId)
  const plans = await listClientPlans(tenantId)
  const leads = await listLeads(tenantId)

  assert.equal(users.data.length, 0, 'usuários devem sumir')
  assert.equal(partners.data.length, 0, 'parceiros devem sumir')
  assert.equal(plans.data.length, 0, 'planos devem sumir')
  assert.equal(leads.data.length, 0, 'leads devem sumir')

  const login = await loginTenantUser(tenantId, 'ana.nova@clinicavida.com.br', 'nova123')
  assert.equal(login.success, false, 'credenciais órfãs não podem sobreviver')
})

await check('outros tenants sobrevivem à exclusão', async () => {
  const remaining = await listTenants()
  assert.ok(remaining.data.some(t => t.slug === 'annetec'))
  assert.ok(!remaining.data.some(t => t.slug === 'clinica-vida'))
  const annetecUsers = await listUsers(annetec.data.id)
  assert.ok(annetecUsers.data.length > 0, 'annetec manteve seus usuários')
})

// 7. Persistence -----------------------------------------------------------
await check('tudo foi gravado no localStorage', async () => {
  const keys = [...store.keys()]
  assert.ok(keys.includes('annetec:tenants'))
  assert.ok(keys.includes('annetec:tenant-users'))
  assert.ok(keys.includes('annetec:tenant-credentials'))
})

console.log(`\n${passed} verificações passaram${process.exitCode ? ' (com falhas acima)' : ''}\n`)
