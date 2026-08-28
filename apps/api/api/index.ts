import { handle } from 'hono/vercel'
import { createApp } from '@/app'

/**
 * Ponto de entrada para hospedar esta API como Serverless Function na
 * Vercel — alternativa provisória ao servidor persistente de `src/index.ts`
 * (usado em Railway/Render/dev local via `@hono/node-server`).
 *
 * `src/app.ts` já era separado de `src/index.ts` justamente pra isso: aqui só
 * se pega o mesmo `Hono` app e se embrulha no adapter da Vercel, sem duplicar
 * nenhuma rota/middleware.
 *
 * Runtime Node.js (não Edge): `lib/crypto.ts` e o Better Auth usam `node:crypto`
 * diretamente, que não existe no Edge Runtime.
 */
export const config = {
  runtime: 'nodejs',
}

export default handle(createApp())
