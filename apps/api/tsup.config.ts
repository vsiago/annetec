import { defineConfig } from 'tsup'

/**
 * `@annetec/contracts` é publicado como TypeScript-fonte pura (`main` aponta
 * pra `src/index.ts`), pensado pra ser transpilado por quem consome — o
 * Next.js faz isso via `transpilePackages`. Esta API não tem transpilador
 * em runtime (roda com `node dist/index.js`/`node api/index.js` puro), então
 * o pacote precisa ser EMBUTIDO no bundle no build — se ficar como import
 * externo (o padrão do tsup pra tudo que está em `dependencies`), o Node
 * tenta importar o `.ts` cru em produção e quebra com `ERR_MODULE_NOT_FOUND`
 * / `ERR_UNSUPPORTED_DIR_IMPORT`.
 */
const noExternal: string[] = ['@annetec/contracts']

export default defineConfig([
  {
    // Servidor persistente — Railway/Render/dev (`@hono/node-server`, `serve()`).
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node22',
    outDir: 'dist',
    clean: true,
    sourcemap: true,
    noExternal,
  },
  {
    // Serverless Function da Vercel — mesmo `createApp()`, embrulhado por
    // `hono/vercel`. Sai já compilado dentro de `api/`, ao lado do
    // `api/index.ts`-fonte não existe mais (ver src/vercel.ts).
    entry: { index: 'src/vercel.ts' },
    format: ['esm'],
    target: 'node22',
    outDir: 'api',
    clean: false,
    sourcemap: false,
    noExternal,
  },
])
