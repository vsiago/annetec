/**
 * Contas de demonstração exibidas na tela de login de cada inquilino, para
 * clique único (login + redirecionamento automático para o painel do perfil).
 * Cobre apenas os inquilinos de seed (dados fixos em lib/mock-seed.ts) — um
 * inquilino criado pelo wizard do superadmin não aparece aqui, pois nasce
 * sem usuários de demonstração.
 */
export interface DemoAccount {
  role: 'Admin' | 'Vendedor' | 'Cliente'
  label: string
  email: string
  password: string
  colorClass: string
}

export const DEMO_CREDENTIALS_BY_TENANT_SLUG: Record<string, DemoAccount[]> = {
  annetec: [
    { role: 'Admin', label: 'Carlos, administrador', email: 'admin@annetec.com.br', password: 'admin123', colorClass: 'bg-secondary' },
    { role: 'Vendedor', label: 'Maria, vendedora', email: 'maria@annetec.com.br', password: 'seller123', colorClass: 'bg-primary' },
    { role: 'Cliente', label: 'Ana, associada', email: 'ana@email.com', password: 'client123', colorClass: 'bg-teal-500' },
  ],
  mepcard: [
    { role: 'Admin', label: 'Gustavo, administrador', email: 'admin@mepcard.com.br', password: 'admin123', colorClass: 'bg-secondary' },
    { role: 'Vendedor', label: 'Juliana, vendedora', email: 'vendedor@mepcard.com.br', password: 'seller123', colorClass: 'bg-primary' },
    { role: 'Cliente', label: 'Mariana, associada', email: 'cliente@mepcard.com.br', password: 'client123', colorClass: 'bg-teal-500' },
  ],
}
