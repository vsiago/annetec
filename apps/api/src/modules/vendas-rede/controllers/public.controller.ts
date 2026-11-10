import { Hono } from 'hono'
import type { AppEnv } from '@/http/types'

/** Público sem login (POST /leads, GET /ref/:codigo), com rate limit e honeypot. Esqueleto: as rotas entram nas próximas fases. */
export const publicController = new Hono<AppEnv>()
