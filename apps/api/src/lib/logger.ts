import { env } from '@/config/env'

/**
 * Logger mínimo em JSON. Sem dependência externa de propósito: a saída já é
 * estruturada e legível por qualquer coletor (Vercel, Railway, CloudWatch).
 */
type Level = 'debug' | 'info' | 'warn' | 'error'

const ORDER: Record<Level | 'silent', number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
}

const threshold = ORDER[env.LOG_LEVEL]

function emit(level: Level, context: Record<string, unknown> | string, message?: string) {
  if (ORDER[level] < threshold) return
  const fields = typeof context === 'string' ? {} : serialize(context)
  const text = typeof context === 'string' ? context : (message ?? '')
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg: text, ...fields })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

/** Converte Error em objeto serializável e remove `undefined`. */
function serialize(context: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue
    out[key] = value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value
  }
  return out
}

export const logger = {
  debug: (context: Record<string, unknown> | string, message?: string) => emit('debug', context, message),
  info: (context: Record<string, unknown> | string, message?: string) => emit('info', context, message),
  warn: (context: Record<string, unknown> | string, message?: string) => emit('warn', context, message),
  error: (context: Record<string, unknown> | string, message?: string) => emit('error', context, message),
}
