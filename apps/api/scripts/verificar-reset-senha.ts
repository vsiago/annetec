/**
 * Confere o reset administrativo de senha ponta a ponta, em processo.
 *
 * O `setUserPassword` do plugin `admin` do Better Auth não aceita chamada sem
 * sessão (o middleware dele exige uma) — diferente de `createUser`, que a
 * plataforma usa headerless. Este script prova que repassar os headers do
 * superadmin funciona, e que a senha nova realmente entra em vigor.
 *
 * Redefine a conta da vendedora do seed para a MESMA senha que o seed já usa,
 * então o estado final é igual ao inicial.
 */
import 'dotenv/config'
import { createApp } from '../src/app'

const app = createApp()
const SENHA_DO_SEED = 'seller123'

async function req(method: string, path: string, token?: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const texto = await response.text()
  try {
    return { status: response.status, body: JSON.parse(texto) }
  } catch {
    return { status: response.status, body: texto }
  }
}

async function main() {
  const login = await req('POST', '/api/v1/auth/login', undefined, {
    email: 'super@annetec.com.br',
    password: 'super123456',
  })
  const token = login.body?.data?.token
  if (!token) {
    console.error('Sem sessão de superadmin. O seed rodou?', JSON.stringify(login.body).slice(0, 200))
    process.exit(1)
  }
  console.log('OK   sessão de superadmin')

  const inquilinos = await req('GET', '/api/v1/platform/tenants?q=annetec', token)
  const inquilino = inquilinos.body?.data?.find((t: { slug: string }) => t.slug === 'annetec')
  if (!inquilino) {
    console.error('Inquilino `annetec` não encontrado.')
    process.exit(1)
  }
  console.log(`OK   inquilino ${inquilino.slug} (${inquilino.id})`)

  const usuarios = await req('GET', `/api/v1/platform/tenants/${inquilino.id}/usuarios`, token)
  if (usuarios.status !== 200) {
    console.error('FALHA listar usuários:', JSON.stringify(usuarios.body).slice(0, 300))
    process.exit(1)
  }
  console.log(
    `OK   ${usuarios.body.data.length} usuário(s): ` +
      usuarios.body.data.map((u: { role: string; email: string }) => `${u.role}/${u.email}`).join(', '),
  )

  const vendedora = usuarios.body.data.find((u: { email: string }) => u.email === 'maria@annetec.com.br')
  if (!vendedora) {
    console.error('Conta `maria@annetec.com.br` não está neste inquilino.')
    process.exit(1)
  }

  const reset = await req(
    'POST',
    `/api/v1/platform/tenants/${inquilino.id}/usuarios/${vendedora.id}/senha`,
    token,
    { password: SENHA_DO_SEED },
  )
  if (reset.status !== 200) {
    console.error('FALHA reset:', JSON.stringify(reset.body).slice(0, 400))
    process.exit(1)
  }
  console.log(`OK   senha redefinida para ${reset.body.data.email}`)

  const loginVendedora = await req('POST', '/api/v1/auth/login', undefined, {
    email: 'maria@annetec.com.br',
    password: SENHA_DO_SEED,
  })
  if (loginVendedora.status !== 200) {
    console.error('FALHA login com a senha nova:', JSON.stringify(loginVendedora.body).slice(0, 300))
    process.exit(1)
  }
  console.log(
    `OK   login com a senha nova · papel=${loginVendedora.body.data.user.tenantRole} inquilino=${loginVendedora.body.data.user.tenantSlug}`,
  )

  // A rota é de superadmin; um usuário do inquilino não pode chegar nela.
  const tentativa = await req(
    'POST',
    `/api/v1/platform/tenants/${inquilino.id}/usuarios/${vendedora.id}/senha`,
    loginVendedora.body.data.token,
    {},
  )
  console.log(
    tentativa.status === 403
      ? 'OK   vendedora não consegue redefinir senha (403)'
      : `FALHA esperava 403, veio ${tentativa.status}`,
  )

  // Id de usuário que não pertence ao inquilino deve dar 404, não trocar nada.
  const forasteiro = await req(
    'POST',
    `/api/v1/platform/tenants/${inquilino.id}/usuarios/${login.body.data.user.id}/senha`,
    token,
    {},
  )
  console.log(
    forasteiro.status === 404
      ? 'OK   conta de fora do inquilino é recusada (404)'
      : `FALHA esperava 404, veio ${forasteiro.status}`,
  )

  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
