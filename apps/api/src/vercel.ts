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
 * Runtime Node.js (não Edge): `lib/crypto.ts` e o Better Auth usam
 * `node:crypto` diretamente, que não existe no Edge Runtime.
 *
 * Este arquivo NÃO é o que a Vercel deploya direto — o `tsup.config.ts`
 * compila ele (resolvendo os aliases `@/*` e embutindo `@annetec/contracts`,
 * que é TypeScript-fonte pura) para `api/index.js`, e É esse arquivo gerado
 * que fica na pasta `api/` de verdade. Ver o aviso em `ERR_MODULE_NOT_FOUND`
 * se alguém um dia recriar um `api/index.ts` de propósito por engano.
 */
export const config = {
  runtime: 'nodejs',
}

// Exportar como `fetch` (não `default`) é o que faz a Vercel reconhecer a
// assinatura Web-padrão `(req: Request) => Response` sem ambiguidade — com
// `export default` ela tentou tratar isso como a assinatura antiga
// `(req, res) => void` e descartava o `Response` retornado, deixando a
// requisição pendurada até estourar o timeout.
export const fetch = handle(createApp())
