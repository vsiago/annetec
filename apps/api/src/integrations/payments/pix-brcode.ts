/**
 * BR Code (Pix copia-e-cola) no padrão EMV-QRCPS do Banco Central — usado
 * pelo gateway SIMULADO para gerar um payload com a mesma cara do real.
 * Sem I/O: testável direto (vetor do CRC: `123456789` → `29B1`).
 */

/** CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF, sem reflexão, sem xor final), hex maiúsculo com 4 dígitos. */
export function crc16CcittFalse(payload: string): string {
  const bytes = new TextEncoder().encode(payload)
  let crc = 0xffff
  for (const byte of bytes) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Campo TLV do EMV: id(2) + tamanho(2) + valor. */
function tlv(id: string, value: string): string {
  const length = new TextEncoder().encode(value).length
  if (length > 99) throw new Error(`Campo EMV ${id} excede 99 bytes`)
  return `${id}${String(length).padStart(2, '0')}${value}`
}

/** Tira acento e o que não é letra/dígito/espaço; maiúsculas; corta no limite. */
export function emvText(value: string, max: number): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, max)
    .trim()
}

export interface PixBrCodeInput {
  /** Chave Pix do recebedor (EVP/aleatória no simulado). */
  key: string
  amount: number
  merchantName: string
  merchantCity: string
  /** Identificador da transação — só alfanumérico, até 25. */
  txid: string
}

/**
 * Monta o payload: `00 02 01` · `01 02 12` · `26` [GUI + chave] · `52 04 0000`
 * · `53 03 986` · `54 valor` · `58 02 BR` · `59 nome` · `60 cidade` ·
 * `62` [`05` txid] · `63 04 CRC` (CRC calculado sobre tudo, incluindo `6304`).
 */
export function buildPixBrCode(input: PixBrCodeInput): string {
  const merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', input.key)
  const txid = input.txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'
  const payload =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('26', merchantAccount) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', input.amount.toFixed(2)) +
    tlv('58', 'BR') +
    tlv('59', emvText(input.merchantName, 25) || 'CLUBE DE BENEFICIOS') +
    tlv('60', emvText(input.merchantCity, 15) || 'SAO PAULO') +
    tlv('62', tlv('05', txid)) +
    '6304'
  return payload + crc16CcittFalse(payload)
}
