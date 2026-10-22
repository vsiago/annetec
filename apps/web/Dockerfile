# syntax=docker/dockerfile:1.7
#
# Web Annetec (Next.js 16, `output: 'standalone'`).
# Contexto de build = RAIZ do monorepo:
#   docker build -f apps/web/Dockerfile -t annetec-web \
#     --build-arg NEXT_PUBLIC_GOOGLE_CLIENT_ID=... --build-arg NEXT_PUBLIC_CONTACT_EMAIL=... .
#
# NEXT_PUBLIC_* são embutidas no bundle do navegador NO BUILD: mudou o valor,
# refaça a imagem (`docker compose up -d --build web`). O resto do env
# (API_BASE_URL etc.) é lido em runtime.

ARG NODE_IMAGE=node:22-bookworm-slim

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
# Ver apps/api/Dockerfile: pnpm exato pelo npm, sem corepack.
RUN npm install -g pnpm@10.17.1 && npm cache clean --force
ENV CI=true \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo

# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,id=annetec-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@annetec/web..."

# ---------------------------------------------------------------------------
FROM deps AS build
COPY packages/contracts packages/contracts
COPY apps/web apps/web
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
ARG NEXT_PUBLIC_CONTACT_EMAIL=""
# Heap de 2 GB: cabe na t4g.medium (4 GB + swap) sem o build matar o resto da máquina.
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID} \
    NEXT_PUBLIC_CONTACT_EMAIL=${NEXT_PUBLIC_CONTACT_EMAIL} \
    NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=2048
RUN pnpm --filter @annetec/web build

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# Standalone espelha o monorepo (outputFileTracingRoot = raiz): o servidor fica
# em apps/web/server.js. `static` e `public` não vêm no standalone — copiar.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/icon.png').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
