import type { FilePurpose, FileVisibility } from '@annetec/contracts'
import { createHash, randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { env } from '@/config/env'
import { db } from '@/db/client'
import { platformFiles } from '@/db/schema'
import { logger } from '@/lib/logger'
import { activeStorage, storageFor } from './drivers'

/**
 * Índice de arquivos (`platform_files`) + binário no driver. O conteúdo nunca
 * passa pelo banco nem pelo log; aqui só nome, tipo, tamanho e sha256.
 */
export type PlatformFileRow = typeof platformFiles.$inferSelect

export interface StoreFileInput {
  bytes: Uint8Array
  fileName: string
  mimeType: string
  ext: string
  purpose: FilePurpose
  visibility: FileVisibility
  ownerType: 'proposal' | 'organization'
  ownerId: string
  /** `applicant` (candidato pela chave) ou `user.id`. */
  uploadedBy: string
  /** Pasta da chave: `kyb/<proposalId>`, `logos`. */
  keyPrefix: string
  organizationId?: string | null
}

export async function storeFile(input: StoreFileInput): Promise<PlatformFileRow> {
  const backend = activeStorage()
  const id = randomUUID()
  const storageKey = `${input.keyPrefix.replace(/\/+$/, '')}/${id}.${input.ext}`
  await backend.put(storageKey, input.bytes, input.mimeType)
  try {
    const [row] = await db
      .insert(platformFiles)
      .values({
        id,
        driver: backend.driver,
        bucket: backend.bucket,
        storageKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.bytes.length,
        sha256: createHash('sha256').update(input.bytes).digest('hex'),
        visibility: input.visibility,
        purpose: input.purpose,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        organizationId: input.organizationId ?? null,
        uploadedBy: input.uploadedBy,
      })
      .returning()
    return row!
  } catch (error) {
    // Sem o índice o binário vira lixo: remove (melhor esforço) e repassa o erro.
    await backend.remove(storageKey).catch(() => {})
    throw error
  }
}

export async function findFile(id: string): Promise<PlatformFileRow | null> {
  const [row] = await db.select().from(platformFiles).where(eq(platformFiles.id, id)).limit(1)
  return row ?? null
}

export async function readFileContent(file: PlatformFileRow): Promise<Buffer> {
  return storageFor(file.driver).get(file.storageKey)
}

/** Exclusão lógica no índice + remoção do binário (falha no driver só vai para o log). */
export async function discardFile(file: PlatformFileRow): Promise<void> {
  await db.update(platformFiles).set({ deletedAt: new Date() }).where(eq(platformFiles.id, file.id))
  try {
    await storageFor(file.driver).remove(file.storageKey)
  } catch (error) {
    logger.warn({ fileId: file.id, err: error }, 'Binário não removido do armazenamento')
  }
}

/** URL pública de um arquivo `public` (logo) — servida por `GET /api/v1/public/arquivos/:id`. */
export function publicFileUrl(fileId: string): string {
  return `${env.API_BASE_URL.replace(/\/+$/, '')}/api/v1/public/arquivos/${fileId}`
}
