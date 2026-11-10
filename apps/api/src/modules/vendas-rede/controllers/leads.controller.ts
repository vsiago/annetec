import { Hono } from 'hono'
import type { AppEnv } from '@/http/types'

/** Leads (GET /leads, pool, reivindicar, etapa, eventos, conversao...). Esqueleto: as rotas entram nas próximas fases. */
export const leadsController = new Hono<AppEnv>()
