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
}

export default nextConfig
