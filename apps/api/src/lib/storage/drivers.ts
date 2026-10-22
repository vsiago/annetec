import { createHash, createHmac } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve, sep } from 'node:path'
import type { StorageDriver } from '@annetec/contracts'
import { env } from '@/config/env'
import { logger } from '@/lib/logger'

/**
 * Drivers de armazenamento (blueprint da plataforma §0.1-10): disco local fora
 * do repositório (padrão), Supabase Storage (REST) e S3 (SigV4 com
 * `node:crypto`) — sem SDK novo. O conteúdo NUNCA vai para log.
 */
export interface StorageBackend {
  driver: StorageDriver
  /** Bucket (supabase/s3); `null` no disco local. */
  bucket: string | null
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<Buffer>
  remove(key: string): Promise<void>
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageError'
  }
}

// ---------------------------------------------------------------------------
// Disco local
// ---------------------------------------------------------------------------

export function localStorageDir(): string {
  return resolve(env.STORAGE_LOCAL_DIR ?? resolve(tmpdir(), 'annetec-storage'))
}

export function createLocalBackend(baseDir: string = localStorageDir()): StorageBackend {
  const root = resolve(baseDir)
  const pathOf = (key: string) => {
    const full = resolve(root, key)
    if (!full.startsWith(root + sep)) throw new StorageError('Chave de arquivo inválida')
    return full
  }
  return {
    driver: 'local',
    bucket: null,
    async put(key, bytes) {
      const full = pathOf(key)
      await mkdir(dirname(full), { recursive: true })
      await writeFile(full, bytes)
    },
    async get(key) {
      try {
        return await readFile(pathOf(key))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new StorageError('Arquivo não encontrado no armazenamento')
        throw error
      }
    },
    async remove(key) {
      await rm(pathOf(key), { force: true })
    },
  }
}

// ---------------------------------------------------------------------------
// Supabase Storage (REST)
// ---------------------------------------------------------------------------

const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/')

export function createSupabaseBackend(config: { url: string; serviceRoleKey: string; bucket: string }): StorageBackend {
  const base = `${config.url.replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(config.bucket)}`
  const auth = { authorization: `Bearer ${config.serviceRoleKey}`, apikey: config.serviceRoleKey }
  return {
    driver: 'supabase',
    bucket: config.bucket,
    async put(key, bytes, contentType) {
      const response = await fetch(`${base}/${encodeKey(key)}`, {
        method: 'POST',
        headers: { ...auth, 'content-type': contentType, 'x-upsert': 'true' },
        body: bytes,
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) throw new StorageError(`Supabase Storage recusou o envio (HTTP ${response.status})`)
    },
    async get(key) {
      const response = await fetch(`${base}/${encodeKey(key)}`, { headers: auth, signal: AbortSignal.timeout(30_000) })
      if (response.status === 404 || response.status === 400) throw new StorageError('Arquivo não encontrado no armazenamento')
      if (!response.ok) throw new StorageError(`Supabase Storage falhou (HTTP ${response.status})`)
      return Buffer.from(await response.arrayBuffer())
    },
    async remove(key) {
      const response = await fetch(`${base}/${encodeKey(key)}`, {
        method: 'DELETE',
        headers: auth,
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok && response.status !== 404 && response.status !== 400) {
        throw new StorageError(`Supabase Storage não removeu o arquivo (HTTP ${response.status})`)
      }
    },
  }
}

// ---------------------------------------------------------------------------
// S3 (AWS Signature V4)
// ---------------------------------------------------------------------------

const sha256Hex = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex')
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest()

/**
 * Assina uma requisição S3 (SigV4, cabeçalho `Authorization`). Pura: recebe
 * a data — testada com o vetor oficial da AWS ("GET Object").
 */
export function signS3Request(input: {
  method: string
  /** Caminho já codificado (`/bucket/chave` ou `/chave`). */
  path: string
  host: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  payloadHash: string
  now: Date
  /** Cabeçalhos extras assinados (nomes em minúsculas). */
  headers?: Record<string, string>
}): Record<string, string> {
  const amzDate = input.now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const day = amzDate.slice(0, 8)
  const headers: Record<string, string> = {
    host: input.host,
    'x-amz-content-sha256': input.payloadHash,
    'x-amz-date': amzDate,
    ...Object.fromEntries(Object.entries(input.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
  }
  const names = Object.keys(headers).sort()
  const canonicalHeaders = names.map(name => `${name}:${headers[name]!.trim()}\n`).join('')
  const signedHeaders = names.join(';')
  const canonicalRequest = [input.method, input.path, '', canonicalHeaders, signedHeaders, input.payloadHash].join('\n')
  const scope = `${day}/${input.region}/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n')
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), 's3'), 'aws4_request')
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  const { host: _host, ...rest } = headers
  return {
    ...rest,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}

export function createS3Backend(config: {
  bucket: string
  region: string
  endpoint?: string
  accessKeyId: string
  secretAccessKey: string
}): StorageBackend {
  // Endpoint próprio (R2, MinIO) = path-style; AWS = virtual-hosted.
  const base = config.endpoint
    ? new URL(`${config.endpoint.replace(/\/+$/, '')}/${encodeURIComponent(config.bucket)}/`)
    : new URL(`https://${config.bucket}.s3.${config.region}.amazonaws.com/`)

  async function call(method: 'PUT' | 'GET' | 'DELETE', key: string, body?: Uint8Array, contentType?: string) {
    const url = new URL(encodeKey(key), base)
    const payloadHash = sha256Hex(body ?? '')
    const headers = signS3Request({
      method,
      path: url.pathname,
      host: url.host,
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      payloadHash,
      now: new Date(),
      headers: contentType ? { 'content-type': contentType } : undefined,
    })
    return fetch(url, { method, headers, body, signal: AbortSignal.timeout(30_000) })
  }

  return {
    driver: 's3',
    bucket: config.bucket,
    async put(key, bytes, contentType) {
      const response = await call('PUT', key, bytes, contentType)
      if (!response.ok) throw new StorageError(`S3 recusou o envio (HTTP ${response.status})`)
    },
    async get(key) {
      const response = await call('GET', key)
      if (response.status === 404) throw new StorageError('Arquivo não encontrado no armazenamento')
      if (!response.ok) throw new StorageError(`S3 falhou (HTTP ${response.status})`)
      return Buffer.from(await response.arrayBuffer())
    },
    async remove(key) {
      const response = await call('DELETE', key)
      if (!response.ok && response.status !== 404) throw new StorageError(`S3 não removeu o arquivo (HTTP ${response.status})`)
    },
  }
}

// ---------------------------------------------------------------------------
// Seleção por env (com queda para o disco local)
// ---------------------------------------------------------------------------

const warned = new Set<string>()
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return
  warned.add(key)
  logger.warn({ storageDriver: key }, message)
}

function configuredBackend(driver: StorageDriver): StorageBackend | null {
  if (driver === 'local') return createLocalBackend()
  if (driver === 'supabase') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null
    return createSupabaseBackend({
      url: env.SUPABASE_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      bucket: env.SUPABASE_STORAGE_BUCKET,
    })
  }
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) return null
  return createS3Backend({
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  })
}

const backends = new Map<StorageDriver, StorageBackend>()

/** Driver para GRAVAR agora: `STORAGE_DRIVER`, ou o local (aviso 1×) se faltar credencial. */
export function activeStorage(): StorageBackend {
  const wanted = env.STORAGE_DRIVER
  const cached = backends.get(wanted)
  if (cached) return cached
  const backend = configuredBackend(wanted)
  if (backend) {
    backends.set(wanted, backend)
    return backend
  }
  warnOnce(wanted, `STORAGE_DRIVER=${wanted} sem credenciais: usando o disco local (${localStorageDir()})`)
  const local = storageFor('local')
  backends.set(wanted, local)
  return local
}

/** Driver para LER um arquivo gravado com `driver` (o registro manda, não a env atual). */
export function storageFor(driver: StorageDriver): StorageBackend {
  if (driver === 'local') {
    const cached = backends.get('local')
    if (cached?.driver === 'local') return cached
    const local = createLocalBackend()
    backends.set('local', local)
    return local
  }
  const backend = configuredBackend(driver)
  if (!backend) throw new StorageError(`Armazenamento "${driver}" não está configurado neste servidor`)
  return backend
}
