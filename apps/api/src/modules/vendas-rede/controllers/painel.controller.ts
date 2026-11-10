import { Hono } from 'hono'
import type { AppEnv } from '@/http/types'

/** Painel/BI (GET /painel/hoje, /painel/resultados). Esqueleto: as rotas entram nas próximas fases. */
export const painelController = new Hono<AppEnv>()
