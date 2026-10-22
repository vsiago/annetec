import { fileURLToPath } from 'node:url'

/**
 * Raiz do monorepo: o rastreamento de arquivos do build precisa enxergar
 * `packages/contracts` e o `node_modules` da raiz (pnpm) para montar o
 * `.next/standalone` completo.
 */
const monorepoRoot = fileURLToPath(new URL('../../', import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Imagem Docker (deploy/EC2): `node apps/web/server.js` a partir de
  // `.next/standalone`. Na Vercel fica o build padrão dela; `next dev` ignora.
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),
  outputFileTracingRoot: monorepoRoot,
  // `@annetec/contracts` é publicado como TypeScript-fonte dentro do monorepo,
  // então o Next precisa compilá-lo junto com o app.
  transpilePackages: ['@annetec/contracts'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  /**
   * Cabeçalhos de segurança em toda resposta da web.
   *  - Referrer-Policy: `strict-origin-when-cross-origin` (não `no-referrer`:
   *    o botão do Google Identity Services confere a origem pelo Referer).
   *    Nunca vaza caminho/query (`?chave=` da contratação) para outro site.
   *  - nosniff: o navegador não "adivinha" tipo de arquivo servido por aqui.
   *  - Enquadramento só pelo próprio site: o visualizador de documentos da
   *    contratação usa `<iframe>` com URL nossa; ninguém de fora embute o app.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
    ]
  },
}

export default nextConfig
