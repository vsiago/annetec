import { describe, expect, it } from 'vitest'
import { cnpj, cpf, isValidCpf, slug } from '@annetec/contracts'
import { decryptSecret, encryptSecret } from '@/lib/crypto'

/**
 * Autenticação, sessão e hash de senha são o Better Auth (ver
 * `src/lib/auth.ts`) — não há mais nada nosso ali para testar em isolamento.
 * O que sobra aqui é o que continua sendo código Annetec: os segredos da
 * integração Digital Saúde em repouso (`lib/crypto.ts`) e os validadores de
 * documento (`@annetec/contracts`).
 */
describe('segredos em repouso', () => {
  it('cifra e decifra as credenciais da Digital Saúde', () => {
    const encrypted = encryptSecret('senhaApi-do-inquilino')
    expect(encrypted).not.toContain('senhaApi-do-inquilino')
    expect(decryptSecret(encrypted)).toBe('senhaApi-do-inquilino')
  })

  it('produz cifra diferente a cada chamada (IV aleatório)', () => {
    expect(encryptSecret('mesmo-valor')).not.toBe(encryptSecret('mesmo-valor'))
  })
})

describe('validadores de documento', () => {
  it('valida CPF pelo dígito verificador, não só pelo tamanho', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
    expect(isValidCpf('529.982.247-26')).toBe(false)
    expect(isValidCpf('111.111.111-11')).toBe(false)
  })

  it('normaliza CPF e CNPJ removendo máscara', () => {
    expect(cpf.parse('529.982.247-25')).toBe('52998224725')
    expect(cnpj.parse('11.222.333/0001-81')).toBe('11222333000181')
  })

  it('aceita apenas slugs válidos de inquilino', () => {
    expect(slug.parse('MepCard')).toBe('mepcard')
    expect(slug.safeParse('mep card').success).toBe(false)
    expect(slug.safeParse('-mepcard').success).toBe(false)
  })
})
