import { onlyDigits, type CnpjLookupPartner, type CnpjLookupResult } from '@annetec/contracts'

/**
 * Consulta de CNPJ na BrasilAPI (`/api/cnpj/v1/:cnpj`, espelho dos dados
 * abertos da Receita). Sem chave. O mapeador é puro (testado com um corpo
 * real); `fetchBrasilApiCnpj` só faz a chamada com timeout.
 */

export const BRASILAPI_CNPJ_URL = 'https://brasilapi.com.br/api/cnpj/v1'

/** Campos que usamos do corpo da BrasilAPI — tudo tolerante (a API muda tipos: número × string). */
export interface BrasilApiCnpjBody {
  cnpj?: string | number | null
  razao_social?: string | null
  nome_fantasia?: string | null
  codigo_natureza_juridica?: string | number | null
  natureza_juridica?: string | null
  situacao_cadastral?: string | number | null
  descricao_situacao_cadastral?: string | null
  data_situacao_cadastral?: string | null
  motivo_situacao_cadastral?: string | number | null
  descricao_motivo_situacao_cadastral?: string | null
  data_inicio_atividade?: string | null
  porte?: string | null
  descricao_porte?: string | null
  capital_social?: string | number | null
  cnae_fiscal?: string | number | null
  cnae_fiscal_descricao?: string | null
  cnaes_secundarios?: { codigo?: string | number | null; descricao?: string | null }[] | null
  cep?: string | number | null
  descricao_tipo_de_logradouro?: string | null
  logradouro?: string | null
  numero?: string | number | null
  complemento?: string | null
  bairro?: string | null
  municipio?: string | null
  uf?: string | null
  email?: string | null
  ddd_telefone_1?: string | null
  qsa?:
    | {
        nome_socio?: string | null
        cnpj_cpf_do_socio?: string | null
        qualificacao_socio?: string | null
        data_entrada_sociedade?: string | null
      }[]
    | null
}

/** Código numérico da situação cadastral → descrição (quando a API manda só o código). */
const REGISTRATION_STATUS_BY_CODE: Record<string, string> = {
  '1': 'NULA',
  '2': 'ATIVA',
  '3': 'SUSPENSA',
  '4': 'INAPTA',
  '8': 'BAIXADA',
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

function isoDate(value: unknown): string | null {
  const raw = text(value)
  if (!raw) return null
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw)
  return match ? match[1]! : null
}

function cnaeCode(value: unknown): string | null {
  const digits = onlyDigits(text(value))
  if (!digits || Number(digits) === 0) return null
  return digits.padStart(7, '0').slice(0, 7)
}

/** Corpo da BrasilAPI → `CnpjLookupResult` (sem `cached`/`fetchedAt`, que o provedor preenche). */
export function mapBrasilApiCnpj(
  body: BrasilApiCnpjBody,
  fallbackCnpj: string,
): Omit<CnpjLookupResult, 'cached' | 'fetchedAt'> {
  const statusText = text(body.descricao_situacao_cadastral)
  const statusCode = text(body.situacao_cadastral)
  const registrationStatus = (
    statusText ?? (statusCode ? (REGISTRATION_STATUS_BY_CODE[statusCode] ?? statusCode) : 'DESCONHECIDA')
  ).toUpperCase()
  const reason = text(body.descricao_motivo_situacao_cadastral)
  const natureDigits = onlyDigits(text(body.codigo_natureza_juridica))
  const mainCode = cnaeCode(body.cnae_fiscal)
  const capital = text(body.capital_social)
  const street = [text(body.descricao_tipo_de_logradouro), text(body.logradouro)].filter(Boolean).join(' ')
  const cep = onlyDigits(text(body.cep))

  const partners: CnpjLookupPartner[] = (body.qsa ?? [])
    .filter(p => text(p?.nome_socio))
    .map(p => ({
      name: text(p.nome_socio)!,
      document: text(p.cnpj_cpf_do_socio),
      qualification: text(p.qualificacao_socio),
      entryDate: isoDate(p.data_entrada_sociedade),
    }))

  return {
    cnpj: onlyDigits(text(body.cnpj)) || fallbackCnpj,
    legalName: text(body.razao_social) ?? '',
    tradeName: text(body.nome_fantasia),
    legalNatureCode: natureDigits ? natureDigits.padStart(4, '0').slice(0, 4) : null,
    legalNatureName: text(body.natureza_juridica),
    registrationStatus,
    registrationStatusDate: isoDate(body.data_situacao_cadastral),
    registrationStatusReason: reason && reason.toUpperCase() !== 'SEM MOTIVO' ? reason : null,
    openingDate: isoDate(body.data_inicio_atividade),
    size: text(body.porte) ?? text(body.descricao_porte),
    shareCapital: capital !== null && Number.isFinite(Number(capital)) ? Number(capital) : null,
    mainCnae: mainCode ? { code: mainCode, description: text(body.cnae_fiscal_descricao) ?? '' } : null,
    secondaryCnaes: (body.cnaes_secundarios ?? [])
      .map(item => ({ code: cnaeCode(item?.codigo), description: text(item?.descricao) ?? '' }))
      .filter((item): item is { code: string; description: string } => item.code !== null),
    address: {
      cep: cep.length === 8 ? cep : cep ? cep.padStart(8, '0') : null,
      street: street || null,
      number: text(body.numero),
      complement: text(body.complemento),
      neighborhood: text(body.bairro),
      city: text(body.municipio),
      state: text(body.uf)?.toUpperCase() ?? null,
    },
    email: text(body.email)?.toLowerCase() ?? null,
    phone: onlyDigits(text(body.ddd_telefone_1)) || null,
    partners,
    provider: 'brasilapi',
  }
}

export type BrasilApiOutcome =
  | { kind: 'found'; body: BrasilApiCnpjBody }
  | { kind: 'not_found' }
  | { kind: 'unavailable'; reason: string }

/** GET na BrasilAPI com timeout. Nunca lança. */
export async function fetchBrasilApiCnpj(cnpj: string, timeoutMs: number): Promise<BrasilApiOutcome> {
  try {
    const response = await fetch(`${BRASILAPI_CNPJ_URL}/${cnpj}`, {
      headers: { accept: 'application/json', 'user-agent': 'ANNETEC-Contratacao/1.0' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.status === 404 || response.status === 400) return { kind: 'not_found' }
    if (!response.ok) return { kind: 'unavailable', reason: `HTTP ${response.status}` }
    const body = (await response.json()) as BrasilApiCnpjBody
    if (!body || typeof body !== 'object' || !text(body.razao_social)) {
      return { kind: 'unavailable', reason: 'Resposta sem razão social' }
    }
    return { kind: 'found', body }
  } catch (error) {
    const reason = error instanceof Error ? error.name === 'TimeoutError' ? 'Tempo esgotado' : error.message : 'Erro'
    return { kind: 'unavailable', reason }
  }
}
