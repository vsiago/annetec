import { describe, expect, it, vi } from 'vitest'

/**
 * Opções do Better Auth que decidem a quem uma conta Google pode se ligar.
 * Fixadas em `src/lib/auth.ts`; este teste impede que alguém as "simplifique".
 * Nenhuma conexão com o banco é aberta (o client do Postgres é preguiçoso).
 */
vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = 'client-id-de-teste.apps.googleusercontent.com'
  process.env.GOOGLE_CLIENT_SECRET = 'segredo-de-teste'
})

const { auth } = await import('@/lib/auth')

describe('configuração do vínculo com Google', () => {
  it('não trata o Google como provedor "confiável" (que vincularia com email_verified falso)', () => {
    // Lido sem o tipo estreito da config (que hoje nem tem a chave).
    const linking = (auth.options.account?.accountLinking ?? {}) as Record<string, unknown>
    const trusted = linking.trustedProviders
    expect(Array.isArray(trusted) ? trusted : []).not.toContain('google')
  })

  it('exige e-mail local verificado e nunca copia dados do Google para a conta local', () => {
    expect(auth.options.account?.accountLinking).toMatchObject({
      enabled: true,
      requireLocalEmailVerified: true,
      updateUserInfoOnLink: false,
    })
    expect(auth.options.socialProviders?.google).toMatchObject({
      disableImplicitSignUp: true,
      overrideUserInfoOnSignIn: false,
    })
  })
})
