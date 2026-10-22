import { SIMULATED_CNPJ_DATA, type CnpjLookupResult } from '@annetec/contracts'

/**
 * Respostas SEM rede: os CNPJs de demonstração do contracts (sempre, em
 * qualquer modo) e, com `CNPJ_LOOKUP_PROVIDER=simulated`, um cadastro
 * sintético determinístico para qualquer outro CNPJ válido.
 */

type Lookup = Omit<CnpjLookupResult, 'cached' | 'fetchedAt'>

function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10)
}

/** CNPJ de demonstração (`SIMULATED_CNPJ_DATA`); `recent` → aberto "hoje − 60 dias". */
export function demoCnpjLookup(cnpj: string, now: Date = new Date()): Lookup | null {
  const entry = SIMULATED_CNPJ_DATA[cnpj]
  if (!entry) return null
  const { scenario: _scenario, recent, ...data } = entry
  const openingDate = data.openingDate ?? (recent ? isoDaysAgo(now, 60) : null)
  return {
    ...data,
    openingDate,
    registrationStatusDate: data.registrationStatusDate ?? openingDate,
    address: { ...data.address },
    partners: data.partners.map(p => ({ ...p })),
    secondaryCnaes: data.secondaryCnaes.map(c => ({ ...c })),
    mainCnae: data.mainCnae ? { ...data.mainCnae } : null,
    provider: 'simulated',
  }
}

/** Cadastro sintético (sempre ATIVA, sem QSA) — mesmo CNPJ, mesma resposta. */
export function syntheticCnpjLookup(cnpj: string): Lookup {
  const seed = [...cnpj].reduce((acc, digit, index) => (acc * 31 + Number(digit) * (index + 7)) % 1_000_003, 17)
  const opening = new Date(Date.UTC(2008, 0, 1) + (seed % 5000) * 86_400_000).toISOString().slice(0, 10)
  const suffix = cnpj.slice(8, 12)
  return {
    cnpj,
    legalName: `EMPRESA SIMULADA ${suffix} LTDA`,
    tradeName: `SIMULADA ${suffix}`,
    legalNatureCode: '2062',
    legalNatureName: 'Sociedade Empresária Limitada',
    registrationStatus: 'ATIVA',
    registrationStatusDate: opening,
    registrationStatusReason: null,
    openingDate: opening,
    size: 'ME',
    shareCapital: 10_000 + (seed % 90) * 1_000,
    mainCnae: { code: '8299799', description: 'Outras atividades de serviços prestados principalmente às empresas' },
    secondaryCnaes: [],
    address: {
      cep: '20040020',
      street: 'Avenida Rio Branco',
      number: String(1 + (seed % 300)),
      complement: null,
      neighborhood: 'Centro',
      city: 'Rio de Janeiro',
      state: 'RJ',
    },
    email: null,
    phone: null,
    partners: [],
    provider: 'simulated',
  }
}
