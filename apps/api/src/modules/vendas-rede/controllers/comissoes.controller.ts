import { Hono } from 'hono'
import type { AppEnv } from '@/http/types'

/** Comissões (GET /comissoes, resumo, pagar, cancelar). Esqueleto: as rotas entram nas próximas fases. */
export const comissoesController = new Hono<AppEnv>()
