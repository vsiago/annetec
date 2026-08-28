/** @type {import('next').NextConfig} */
const nextConfig = {
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
