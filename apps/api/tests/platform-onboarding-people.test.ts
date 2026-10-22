import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `PUT /propostas/:id/pessoas` com CPF mascarado: a visão do candidato devolve
 * `***.456.789-**`; pessoa já gravada (com `id`) mantém o CPF gravado, e só um
 * CPF completo substitui o anterior (completo inválido = erro de campo).
 */

const ID = '0b6f6c2e-3f1a-4c55-9d0e-1a2b3c4d5e6f'
const P1 = '7a1d2c3b-0000-4000-8000-000000000001'
const P2 = '7a1d2c3b-0000-4000-8000-000000000002'

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/modules/platform-billing/activation', () => ({
  getActivationCharge: vi.fn(async () => null),
  cancelActivationCharge: vi.fn(),
  createActivationCharge: vi.fn(),
  createPlatformSubscription: vi.fn(),
}))
vi.mock('@/modules/platform-onboarding/repository', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/platform-onboarding/repository')>()),
  getProposal: vi.fn(async (id: string) => (id === ID ? { id, status: 'draft', legalForm: 'associacao' } : null)),
  loadPeople: vi.fn(async () => [
    { id: P1, cpf: '11144477735', name: 'Mariana Costa Lima' },
    { id: P2, cpf: '22255588846', name: 'Rafael Souza Pinto' },
  ]),
}))
const saved = vi.hoisted(() => ({ input: null as unknown }))
vi.mock('@/modules/platform-onboarding/service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/platform-onboarding/service')>()),
  savePeople: vi.fn(async (_id: string, input: unknown) => {
    saved.input = input
  }),
  getApplicantView: vi.fn(async (id: string) => ({ id })),
}))

const { restoreMaskedCpfs } = await import('@/modules/platform-onboarding/service')
const { onboardingPublicController } = await import('@/modules/platform-onboarding/public-controller')
const { onboardingAccessKey } = await import('@/modules/platform-onboarding/access-key')
const { errorHandler } = await import('@/http/errors')

const app = new Hono().route('/c', onboardingPublicController)
app.onError(errorHandler)
const URL_PESSOAS = `/c/propostas/${ID}/pessoas?chave=${onboardingAccessKey(ID)}`

function person(overrides: Record<string, unknown>) {
  return {
    name: 'Mariana Costa Lima',
    birthDate: '1980-05-10',
    email: 'mariana@asserv.org.br',
    position: 'presidente',
    isLegalRepresentative: true,
    isPartner: false,
    isBeneficialOwner: false,
    isPep: false,
    ...overrides,
  }
}

async function put(people: unknown[]) {
  const response = await app.request(URL_PESSOAS, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ people }),
  })
  return { status: response.status, body: (await response.json()) as { error?: { issues?: { path: string }[] } } }
}

const savedCpfs = () => (saved.input as { people: { cpf: string }[] }).people.map(p => p.cpf)

beforeEach(() => {
  saved.input = null
})

describe('CPF mascarado no PUT /pessoas', () => {
  it('restoreMaskedCpfs: mascarado/parcial/vazio de pessoa gravada volta ao CPF gravado', async () => {
    const out = (await restoreMaskedCpfs(ID, {
      people: [
        { id: P1, cpf: '***.444.777-**' },
        { id: P2, cpf: '555.888' },
        { id: P2, cpf: '' },
        { cpf: '***.999.999-**' },
        { id: 'desconhecido', cpf: '***.111.111-**' },
      ],
    })) as { people: { cpf: string }[] }
    expect(out.people.map(p => p.cpf)).toEqual(['11144477735', '22255588846', '22255588846', '***.999.999-**', '***.111.111-**'])
  })

  it('reenvio da visão sem redigitar: grava o CPF que já estava', async () => {
    const result = await put([
      person({ id: P1, cpf: '***.444.777-**' }),
      person({ id: P2, name: 'Rafael Souza Pinto', email: 'rafael@asserv.org.br', isLegalRepresentative: false, cpf: '***.555.888-**' }),
    ])
    expect(result.status).toBe(200)
    expect(savedCpfs()).toEqual(['11144477735', '22255588846'])
  })

  it('CPF completo e válido substitui o anterior', async () => {
    const result = await put([person({ id: P1, cpf: '529.982.247-25' })])
    expect(result.status).toBe(200)
    expect(savedCpfs()).toEqual(['52998224725'])
  })

  it('CPF completo inválido não substitui: erro no campo', async () => {
    const result = await put([person({ id: P1, cpf: '111.444.777-00' })])
    expect(result.status).toBe(400)
    expect(result.body.error?.issues?.[0]?.path).toBe('people.0.cpf')
    expect(saved.input).toBeNull()
  })

  it('pessoa nova (sem id) precisa do CPF completo', async () => {
    const result = await put([person({ cpf: '***.444.777-**' })])
    expect(result.status).toBe(400)
    expect(saved.input).toBeNull()
  })
})
