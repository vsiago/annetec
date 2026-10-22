import { createHash, randomBytes } from 'node:crypto'
import { AppError } from '@/http/errors'
import { CARD_BRANDS, ERROR_CODES, detectCardBrand, onlyDigits, type CardBrand } from '@annetec/contracts'
import QRCode from 'qrcode'
import { buildBoletoNumbers } from './boleto'
import {
  CardDeclinedError,
  type CreateChargeInput,
  type GatewayCharge,
  type GatewayCustomerInput,
  type PaymentGateway,
} from './gateway'
import { buildPixBrCode } from './pix-brcode'

/**
 * Gateway SIMULADO (blueprint §0.6) — modo demonstração, sem dinheiro e SEM
 * ESTADO: o status de uma cobrança sai do próprio id (instante de aprovação
 * embutido) + relógio. Reiniciar a API não perde nada, e o seed consegue
 * gerar cobranças que nunca compensam sozinhas (`approveAt = 0`).
 *
 * Ids:
 *   cliente  `sim_cus_<sha256(orgId+cpf)[0..16]>`
 *   cobrança `sim_pay_<pix|boleto|card>_<approveAtMs>_<rand8>` (0 = só manual)
 *   token    `sim_tok_<bandeira>_<finais>_<rand8>`
 */

export const SIMULATED_DECLINED_SUFFIX = '0002'
/** Cartões de recusa da sandbox do Asaas — recusam aqui também, para o roteiro ser o mesmo. */
const DECLINED_NUMBERS = new Set(['5184019740373151', '4916561358240741'])
const PIX_TTL_MS = 24 * 60 * 60 * 1000

export type SimulatedMethod = 'pix' | 'boleto' | 'card'

export interface SimulatedTenant {
  orgId: string
  name: string
  slug: string
  city: string
}

export interface SimulatedOptions {
  /** 0 = só compensa pelo botão/baixa. */
  pixApproveSeconds: number
  boletoApproveSeconds: number
  pixKey: string
  /** Monta o link da página imprimível do boleto (web). */
  boletoUrl: (input: { slug: string; subscriptionId: string; chargeId: string }) => string
}

function rand8(): string {
  return randomBytes(4).toString('hex')
}

export function simulatedChargeId(method: SimulatedMethod, approveAtMs: number): string {
  return `sim_pay_${method}_${Math.max(0, Math.trunc(approveAtMs))}_${rand8()}`
}

export function parseSimulatedChargeId(id: string): { method: SimulatedMethod; approveAt: number } | null {
  const match = /^sim_pay_(pix|boleto|card)_(\d+)_[a-z0-9]+$/.exec(id)
  if (!match) return null
  return { method: match[1] as SimulatedMethod, approveAt: Number(match[2]) }
}

export function simulatedCardToken(brand: CardBrand, last4: string): string {
  return `sim_tok_${brand}_${last4}_${rand8()}`
}

export function parseSimulatedCardToken(token: string): { brand: CardBrand; last4: string } | null {
  const match = /^sim_tok_([a-z]+)_(\d{4})_[a-z0-9]+$/.exec(token)
  if (!match) return null
  const brand = (CARD_BRANDS as readonly string[]).includes(match[1]!) ? (match[1] as CardBrand) : 'outra'
  return { brand, last4: match[2]! }
}

export function simulatedCustomerId(orgId: string, cpf: string): string {
  return `sim_cus_${createHash('sha256').update(orgId + onlyDigits(cpf)).digest('hex').slice(0, 16)}`
}

/** PNG base64 SEM o prefixo `data:` — mesmo formato do `encodedImage` do Asaas. */
export async function qrCodePngBase64(payload: string): Promise<string> {
  const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 320 })
  return dataUrl.replace(/^data:image\/png;base64,/, '')
}

function emptyCharge(id: string, status: GatewayCharge['status']): GatewayCharge {
  return { id, status, paidAt: null, paidAmount: null, invoiceUrl: null, pix: null, boleto: null, card: null }
}

export class SimulatedGateway implements PaymentGateway {
  readonly provider = 'simulated' as const
  /** "Sandbox" no contrato é o Asaas de teste; o simulado não é gateway real. */
  readonly sandbox = false
  readonly canSimulate = true

  constructor(
    private readonly tenant: SimulatedTenant,
    private readonly options: SimulatedOptions,
  ) {}

  async ensureCustomer(input: GatewayCustomerInput): Promise<string> {
    return simulatedCustomerId(this.tenant.orgId, input.cpf)
  }

  async createCharge(input: CreateChargeInput): Promise<GatewayCharge> {
    const now = Date.now()

    if (input.method === 'credit_card') {
      if (input.card) {
        const number = onlyDigits(input.card.number)
        const last4 = number.slice(-4)
        if (last4 === SIMULATED_DECLINED_SUFFIX || DECLINED_NUMBERS.has(number)) throw new CardDeclinedError()
        const brand = detectCardBrand(number) ?? 'outra'
        const id = simulatedChargeId('card', now)
        return {
          ...emptyCharge(id, 'paid'),
          paidAt: new Date(now),
          paidAmount: input.amount,
          card: { token: simulatedCardToken(brand, last4), brand, last4 },
        }
      }
      if (input.cardToken) {
        const parsed = parseSimulatedCardToken(input.cardToken)
        if (!parsed) throw new CardDeclinedError('Cartão salvo inválido. Cadastre o cartão novamente.')
        if (parsed.last4 === SIMULATED_DECLINED_SUFFIX) throw new CardDeclinedError()
        const id = simulatedChargeId('card', now)
        return {
          ...emptyCharge(id, 'paid'),
          paidAt: new Date(now),
          paidAmount: input.amount,
          card: { token: input.cardToken, brand: parsed.brand, last4: parsed.last4 },
        }
      }
      throw AppError.businessRule('Informe os dados do cartão')
    }

    if (input.method === 'pix') {
      const seconds = this.options.pixApproveSeconds
      const id = simulatedChargeId('pix', seconds > 0 ? now + seconds * 1000 : 0)
      const payload = buildPixBrCode({
        key: this.options.pixKey,
        amount: input.amount,
        merchantName: this.tenant.name,
        merchantCity: this.tenant.city,
        txid: input.externalReference.replace(/-/g, ''),
      })
      return {
        ...emptyCharge(id, 'pending'),
        pix: {
          payload,
          qrCodeBase64: await qrCodePngBase64(payload),
          expiresAt: new Date(now + PIX_TTL_MS).toISOString(),
        },
      }
    }

    const seconds = this.options.boletoApproveSeconds
    const id = simulatedChargeId('boleto', seconds > 0 ? now + seconds * 1000 : 0)
    const numbers = buildBoletoNumbers({ amount: input.amount, dueDate: input.dueDate, seed: id })
    return {
      ...emptyCharge(id, 'pending'),
      boleto: {
        identificationField: numbers.identificationField,
        barCode: numbers.barCode,
        url: input.subscriptionId
          ? this.options.boletoUrl({
              slug: this.tenant.slug,
              subscriptionId: input.subscriptionId,
              chargeId: input.externalReference,
            })
          : null,
      },
    }
  }

  /** Cartão → pago; Pix/boleto → pago depois do `approveAt` (0 = nunca sozinho). Vencer é decisão do NOSSO motor. */
  async getCharge(id: string): Promise<GatewayCharge> {
    const parsed = parseSimulatedChargeId(id)
    if (!parsed) throw new AppError(ERROR_CODES.NOT_FOUND, 'Cobrança não encontrada no gateway simulado')
    if (parsed.method === 'card') {
      return { ...emptyCharge(id, 'paid'), paidAt: parsed.approveAt > 0 ? new Date(parsed.approveAt) : null }
    }
    if (parsed.approveAt > 0 && Date.now() >= parsed.approveAt) {
      return { ...emptyCharge(id, 'paid'), paidAt: new Date(parsed.approveAt) }
    }
    return emptyCharge(id, 'pending')
  }

  async cancelCharge(): Promise<void> {
    // Sem estado: nada a desfazer. O serviço registra o evento.
  }

  async refundCharge(id: string, amount?: number): Promise<GatewayCharge> {
    return { ...emptyCharge(id, 'refunded'), paidAmount: amount ?? null }
  }

  async receiveInCash(id: string, paidAt: string, amount: number): Promise<GatewayCharge> {
    return { ...emptyCharge(id, 'paid'), paidAt: new Date(`${paidAt}T12:00:00-03:00`), paidAmount: amount }
  }

  async simulatePayment(): Promise<void> {
    // O serviço dispara `PAYMENT_RECEIVED` (source `simulation`) no handler único.
  }
}
