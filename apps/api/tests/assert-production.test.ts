import { describe, expect, it, vi } from 'vitest'
import {
  assertProductionConfig,
  productionConfigViolations,
  productionConfigWarnings,
  type ProductionConfigInput,
} from '@/config/assert-production'

/** Trava de boot de produção: nenhuma simulação passa; dev/test não são afetados. */

const FULL_PRODUCTION: ProductionConfigInput = {
  NODE_ENV: 'production',
  PAYMENT_GATEWAY: 'asaas',
  PLATFORM_PAYMENT_GATEWAY: 'asaas',
  ASAAS_API_KEY: '$aact_prod_000chave-de-producao',
  PLATFORM_ASAAS_API_KEY: '$aact_prod_000chave-da-plataforma',
  ASAAS_ENV: 'production',
  ASAAS_WEBHOOK_TOKEN: 'token-do-webhook-com-mais-de-32-caracteres',
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 're_producao',
  CNPJ_LOOKUP_PROVIDER: 'brasilapi',
  STORAGE_DRIVER: 's3',
  S3_BUCKET: 'annetec-kyb',
  S3_ACCESS_KEY_ID: 'AKIA',
  S3_SECRET_ACCESS_KEY: 'segredo',
  BILLING_AUTOMATION_ENABLED: true,
  PLATFORM_BILLING_AUTOMATION_ENABLED: true,
}

describe('assertProductionConfig', () => {
  it('produção sem envs: lista TODAS as violações em um único erro', () => {
    const empty: ProductionConfigInput = { NODE_ENV: 'production' }
    const violations = productionConfigViolations(empty)
    const joined = violations.join('\n')
    for (const name of [
      'PAYMENT_GATEWAY',
      'PLATFORM_PAYMENT_GATEWAY',
      'ASAAS_API_KEY',
      'ASAAS_ENV',
      'ASAAS_WEBHOOK_TOKEN',
      'EMAIL_PROVIDER',
      'STORAGE_DRIVER',
    ]) {
      expect(joined).toContain(name)
    }
    expect(violations.length).toBeGreaterThanOrEqual(7)
    expect(() => assertProductionConfig(empty)).toThrowError(/Configuração inválida para produção/)
    try {
      assertProductionConfig(empty)
    } catch (error) {
      for (const item of violations) expect((error as Error).message).toContain(item)
    }
  })

  it('produção: chave sandbox, CNPJ simulado e driver sem credencial também são violações', () => {
    const violations = productionConfigViolations({
      ...FULL_PRODUCTION,
      ASAAS_API_KEY: '$aact_hmlg_000sandbox',
      PLATFORM_ASAAS_API_KEY: '$aact_hmlg_000sandbox',
      CNPJ_LOOKUP_PROVIDER: 'simulated',
      EMAIL_PROVIDER: 'sendgrid',
      SENDGRID_API_KEY: undefined,
      STORAGE_DRIVER: 'supabase',
    })
    const joined = violations.join('\n')
    expect(joined).toContain('ASAAS_API_KEY não é chave de produção')
    expect(joined).toContain('PLATFORM_ASAAS_API_KEY não é chave de produção')
    expect(joined).toContain('CNPJ_LOOKUP_PROVIDER')
    expect(joined).toContain('SENDGRID_API_KEY')
    expect(joined).toContain('SUPABASE_URL')
    expect(violations).toHaveLength(5)
  })

  it('produção completa: passa sem avisos', () => {
    const log = { warn: vi.fn() }
    expect(productionConfigViolations(FULL_PRODUCTION)).toEqual([])
    expect(() => assertProductionConfig(FULL_PRODUCTION, log)).not.toThrow()
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('produção completa com automação desligada: sobe, mas avisa que precisa de cron externo', () => {
    const log = { warn: vi.fn() }
    const config = { ...FULL_PRODUCTION, BILLING_AUTOMATION_ENABLED: undefined, PLATFORM_BILLING_AUTOMATION_ENABLED: undefined }
    expect(() => assertProductionConfig(config, log)).not.toThrow()
    expect(productionConfigWarnings(config)).toHaveLength(2)
    expect(log.warn).toHaveBeenCalledTimes(2)
    expect(String(log.warn.mock.calls[0]?.[1])).toMatch(/cron externo/)
  })

  it('development/test com tudo simulado: ok, sem avisos', () => {
    const simulated: ProductionConfigInput = {
      PAYMENT_GATEWAY: 'simulated',
      PLATFORM_PAYMENT_GATEWAY: 'simulated',
      ASAAS_API_KEY: '$aact_hmlg_000sandbox',
      ASAAS_ENV: 'sandbox',
      EMAIL_PROVIDER: 'outbox',
      CNPJ_LOOKUP_PROVIDER: 'simulated',
      STORAGE_DRIVER: 'local',
    }
    for (const NODE_ENV of ['development', 'test']) {
      const log = { warn: vi.fn() }
      expect(productionConfigViolations({ ...simulated, NODE_ENV })).toEqual([])
      expect(() => assertProductionConfig({ ...simulated, NODE_ENV }, log)).not.toThrow()
      expect(log.warn).not.toHaveBeenCalled()
    }
  })

  describe('DEPLOY_STAGE=preview (demo com NODE_ENV=production)', () => {
    const PREVIEW: ProductionConfigInput = {
      NODE_ENV: 'production',
      DEPLOY_STAGE: 'preview',
      PAYMENT_GATEWAY: 'asaas',
      PLATFORM_PAYMENT_GATEWAY: 'asaas',
      ASAAS_API_KEY: '$aact_hmlg_000sandbox',
      ASAAS_ENV: 'sandbox',
      ASAAS_WEBHOOK_TOKEN: 'token-do-webhook-com-mais-de-32-caracteres',
      EMAIL_PROVIDER: 'outbox',
      CNPJ_LOOKUP_PROVIDER: 'brasilapi',
      STORAGE_DRIVER: 'local',
      BILLING_AUTOMATION_ENABLED: true,
      PLATFORM_BILLING_AUTOMATION_ENABLED: true,
    }

    it('aceita Asaas sandbox, outbox e disco local — e avisa alto no boot', () => {
      const log = { warn: vi.fn() }
      expect(productionConfigViolations(PREVIEW)).toEqual([])
      expect(() => assertProductionConfig(PREVIEW, log)).not.toThrow()
      expect(log.warn).toHaveBeenCalledTimes(1)
      expect(String(log.warn.mock.calls[0]?.[1])).toMatch(/DEPLOY_STAGE=preview/)
    })

    it('recusa chave/ambiente de produção do Asaas', () => {
      const joined = productionConfigViolations({
        ...PREVIEW,
        ASAAS_API_KEY: '$aact_prod_000chave',
        PLATFORM_ASAAS_API_KEY: '$aact_prod_000chave',
        ASAAS_ENV: 'production',
      }).join('\n')
      expect(joined).toContain('ASAAS_API_KEY precisa começar com $aact_hmlg_')
      expect(joined).toContain('PLATFORM_ASAAS_API_KEY precisa começar com $aact_hmlg_')
      expect(joined).toContain('ASAAS_ENV')
    })

    it('continua exigindo gateway asaas, webhook token, CNPJ real e credenciais de driver remoto', () => {
      const violations = productionConfigViolations({
        ...PREVIEW,
        PAYMENT_GATEWAY: 'simulated',
        ASAAS_WEBHOOK_TOKEN: undefined,
        CNPJ_LOOKUP_PROVIDER: 'simulated',
        EMAIL_PROVIDER: 'resend',
        STORAGE_DRIVER: 's3',
      })
      expect(violations).toHaveLength(5)
    })

    it('sem DEPLOY_STAGE a mesma configuração é recusada (padrão estrito)', () => {
      expect(productionConfigViolations({ ...PREVIEW, DEPLOY_STAGE: undefined }).length).toBeGreaterThan(0)
    })
  })
})
