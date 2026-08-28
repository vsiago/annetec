# Annetec

Plataforma white-label para administradoras de benefícios. Monorepo pnpm com o app
Next.js e a API Hono que integra a Digital Saúde.

```
apps/
  web/        Next.js 16 (App Router) — portais /admin, /[tenant]
  api/        API Hono + Drizzle + Postgres, integração Digital Saúde
packages/
  contracts/  Schemas Zod compartilhados (domínio Annetec + Digital Saúde)
docs/
  digital-saude-mapping.md   Mapeamento endpoint a endpoint do ERP
```

## Requisitos

- Node 22+
- pnpm 10+
- Postgres 15+ (local ou Supabase)

## Subindo o ambiente

```bash
pnpm install

# API
cp apps/api/.env.example apps/api/.env      # preencha DATABASE_URL e JWT_SECRET
pnpm db:migrate
pnpm db:seed

# Web
cp apps/web/.env.example apps/web/.env.local

pnpm dev        # sobe web (3000) e api (3333) em paralelo
```

Contas do seed:

| Escopo | E-mail | Senha |
| --- | --- | --- |
| Plataforma (superadmin) | `super@annetec.com.br` | `super123456` |
| Inquilino `annetec` — admin | `admin@annetec.com.br` | `admin123` |
| Inquilino `annetec` — vendedor | `maria@annetec.com.br` | `seller123` |
| Inquilino `annetec` — cliente | `ana@email.com` | `client123` |
| Inquilino `mepcard` — admin | `admin@mepcard.com.br` | `admin123` |

## Scripts

| Comando | O que faz |
| --- | --- |
| `pnpm dev` | web + api em paralelo |
| `pnpm build` | build de todos os pacotes |
| `pnpm typecheck` | `tsc --noEmit` em todo o workspace |
| `pnpm test` | Vitest |
| `pnpm db:generate` | gera migração a partir do schema Drizzle |
| `pnpm db:migrate` | aplica as migrações |
| `pnpm db:seed` | popula dados de desenvolvimento |
| `pnpm db:studio` | Drizzle Studio |

## Arquitetura da API

MVC com uma camada de integração isolada:

```
src/
  config/env.ts             validação das variáveis de ambiente no boot
  db/schema/*               tabelas Drizzle
  http/                     envelope, erros, validação, middlewares
  integrations/digitalsaude/
    client.ts               único ponto de saída HTTP para o ERP
    mappers.ts              Digital Saúde → domínio Annetec
    provider.ts             credenciais por inquilino
  modules/<domínio>/
    controller.ts           rotas + autorização
    service.ts              regra de negócio
    repository.ts           acesso a dados
```

Regras que valem para todo o código:

- **Envelope único.** Toda resposta é `{ success: true, data, meta? }` ou
  `{ success: false, error: { code, message, issues?, requestId } }`. Controllers usam
  `ok`/`created` de `http/respond.ts`, nunca `c.json` cru.
- **Erro é `AppError`.** Um único `onError` converte para HTTP, com código do catálogo
  em `packages/contracts/src/common/errors.ts`.
- **Contrato antes do código.** Entrada e saída são schemas Zod em `@annetec/contracts`;
  a API e o front importam os mesmos tipos.
- **Nada de `fetch` para o ERP fora de `integrations/digitalsaude/client.ts`.**
- **Escopo de inquilino é do servidor.** `resolveTenant` resolve pelo slug da rota e
  `requireTenantRole` confere contra o `tenantId` do JWT.

## Rotas

Dois espaços, espelhando as duas áreas do frontend:

```
/api/v1/auth/*                    login, portal do associado, refresh, logout, me
/api/v1/platform/tenants/*        equipe Annetec (/admin)
/api/v1/t/:tenantSlug/usuarios    usuários do inquilino
/api/v1/t/:tenantSlug/contratos   contratos e adesão
/api/v1/t/:tenantSlug/carteirinhas
/api/v1/t/:tenantSlug/catalogo    convênios, planos, carências, tabelas, cotação
/api/v1/t/:tenantSlug/financeiro  faturas, demonstrativos, comissões
/api/v1/t/:tenantSlug/crm         leads, vendas, metas
/api/v1/t/:tenantSlug/rede        parceiros e benefícios
/healthz  /readyz
```

## Integração Digital Saúde

Ver [docs/digital-saude-mapping.md](docs/digital-saude-mapping.md).

As credenciais (`token` e `senhaApi`) são por inquilino, gravadas cifradas em
`tenant_integrations` pela tela do superadmin — que valida contra o ERP antes de salvar.
`DIGITALSAUDE_APP_TOKEN`/`DIGITALSAUDE_API_PASSWORD` no `.env` servem só de fallback
em desenvolvimento.
