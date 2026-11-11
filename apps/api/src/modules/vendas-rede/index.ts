import { Hono } from 'hono'
import type { AppEnv } from '@/http/types'
import { salesContext } from './context'
import { balcaoController } from './controllers/balcao.controller'
import { comissoesController } from './controllers/comissoes.controller'
import { configController } from './controllers/config.controller'
import { leadsController } from './controllers/leads.controller'
import { painelController } from './controllers/painel.controller'
import { planosController } from './controllers/planos.controller'
import { publicController } from './controllers/public.controller'
import { redeController } from './controllers/rede.controller'

/**
 * Rede Comercial (`vendas-rede`). O MESMO conjunto de sub-rotas serve dois escopos:
 *
 *   /api/v1/vendas/*                  platform (equipe ANNETEC + vendedores ANNETEC; `GET /planos` só aqui)
 *   /api/v1/t/:tenantSlug/vendas/*    tenant   (admin e seller do clube)
 *   /api/v1/public/vendas/*           entrada pública (sem login)
 *
 * Para adicionar um controller novo: crie `controllers/x.controller.ts` exportando
 * `new Hono<AppEnv>()` (use `vendasOf(c)`, `requirePapel`, `requireEscrita`), e
 * acrescente um `.route('/', xController)` em `rotasComuns` (os dois escopos) ou
 * so em `vendasRedeTenantRoutes` (como o balcao). Nao registre auth: o
 * `salesContext` do escopo ja roda antes de tudo.
 */
const rotasComuns = new Hono<AppEnv>()
  .route('/', redeController)
  .route('/', configController)
  .route('/', leadsController)
  .route('/', comissoesController)
  .route('/', painelController)

export const vendasRedePlatformRoutes = new Hono<AppEnv>()
  .use('*', salesContext('platform'))
  .route('/', rotasComuns)
  .route('/', planosController)

export const vendasRedeTenantRoutes = new Hono<AppEnv>()
  .use('*', salesContext('tenant'))
  .route('/', rotasComuns)
  .route('/balcao', balcaoController)

export const vendasRedePublicRoutes = new Hono<AppEnv>().route('/', publicController)
