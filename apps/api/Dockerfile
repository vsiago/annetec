# syntax=docker/dockerfile:1.7
#
# API Annetec (Hono + @hono/node-server) — servidor persistente `src/index.ts`.
# Contexto de build = RAIZ do monorepo:
#   docker build -f apps/api/Dockerfile -t annetec-api .
#
# Alvos:
#   runtime (padrão)  `node dist/index.js`, só dependências de produção, usuário `node`.
#   tools             código-fonte + devDependencies (tsx): migrações, seeds e scripts.
#                     CMD padrão = `pnpm db:migrate`. Ver deploy/README.md.

ARG NODE_IMAGE=node:22-bookworm-slim

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
# pnpm na versão exata do `packageManager` da raiz. Instalado pelo npm (e não
# ativado pelo corepack) para funcionar igual com qualquer usuário — o corepack
# guardaria o binário no cache do root e tentaria baixá-lo de novo como `node`.
RUN npm install -g pnpm@10.17.1 && npm cache clean --force
ENV CI=true \
    PNPM_STORE_DIR=/pnpm/store
WORKDIR /repo

# ---------------------------------------------------------------------------
# Manifestos primeiro: a camada de dependências só refaz quando o lockfile muda.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

# ---------------------------------------------------------------------------
# Todas as dependências da API (dev incluídas: tsup, tsx, drizzle-kit).
FROM manifests AS deps
RUN --mount=type=cache,id=annetec-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@annetec/api..."

# ---------------------------------------------------------------------------
# Só as de produção (o que o `dist/index.js` importa em runtime).
FROM manifests AS prod-deps
RUN --mount=type=cache,id=annetec-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --store-dir /pnpm/store --filter "@annetec/api..."

# ---------------------------------------------------------------------------
FROM deps AS build
COPY packages/contracts packages/contracts
COPY apps/api apps/api
# tsup: dist/ (servidor) e api/ (Vercel); `@annetec/contracts` vai embutido.
RUN pnpm --filter @annetec/api build

# ---------------------------------------------------------------------------
# Ferramentas: `docker compose run --rm migrate [comando]` (cwd = apps/api).
FROM build AS tools
ENV NODE_ENV=production
RUN mkdir -p /data/storage && chown node:node /data/storage
WORKDIR /repo/apps/api
USER node
CMD ["pnpm", "db:migrate"]

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3333 \
    STORAGE_LOCAL_DIR=/data/storage
WORKDIR /app
# Mesma estrutura do monorepo: os symlinks do pnpm (apps/api/node_modules →
# node_modules/.pnpm) continuam válidos.
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
# Pasta do STORAGE_DRIVER=local (volume nomeado no compose herda o dono).
RUN mkdir -p /data/storage && chown node:node /data/storage
WORKDIR /app/apps/api
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3333)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/index.js"]
