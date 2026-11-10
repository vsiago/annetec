import { Hono } from 'hono'
import type { AppEnv } from '@/http/types'

/** Balcão (somente escopo tenant; papel balcao ou master). Esqueleto: as rotas entram nas próximas fases. */
export const balcaoController = new Hono<AppEnv>()
