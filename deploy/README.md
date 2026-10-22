# Deploy — EC2 + Docker Compose

Um único EC2 **t4g.medium** (arm64, 4 GB + 2 GB de swap, Ubuntu, Docker + compose plugin).
As imagens são construídas **no servidor**. Tudo em HTTPS desde o primeiro deploy (Caddy + Let's Encrypt).

```
internet ──443──▶ caddy ─┬─▶ web:3000  (Next standalone)  ──http://api:3333──┐
                         └─▶ api:3333  (Hono, webhooks Asaas) ◀────────────────┘
                                         └─▶ postgres:5432 (sem porta publicada)
```

| Arquivo | Papel |
| --- | --- |
| `docker-compose.prod.yml` | caddy, web, api, postgres, migrate (perfil `tools`) |
| `deploy/Caddyfile` | sites a partir de `WEB_DOMAIN` / `API_DOMAIN` / `APEX_DOMAIN` |
| `deploy/.env.prod.example` | modelo do `deploy/.env.prod` (só existe no servidor) |
| `deploy/deploy.sh` | da sua máquina: envia o `HEAD` e sobe |
| `deploy/backup.sh` | no servidor: `pg_dump` + arquivos, guarda 7 |

Fases:

- **Interina** — `www.3-131-89-130.sslip.io` / `api.3-131-89-130.sslip.io` (o sslip.io resolve para o IP;
  o certificado sai normalmente), `DEPLOY_STAGE=preview`, Asaas **sandbox**, e-mail em caixa de saída, disco local.
- **Final** — `www.annetec.com.br` / `api.annetec.com.br` (raiz `annetec.com.br` → 301 para www), produção estrita.

Atalho usado abaixo (no servidor, dentro de `~/annetec`):

```bash
alias dc='docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod'
```

## 1. Preparar o servidor (uma vez)

Security group: entrada **22** (só seu IP), **80** e **443** (TCP) e **443/UDP** (HTTP/3) de qualquer lugar. Nada mais.

```bash
ssh -i ~/.ssh/annetec-prod.pem ubuntu@3.131.89.130
sudo apt-get update && sudo apt-get install -y rsync
sudo usermod -aG docker ubuntu && exit          # relogar para valer o grupo
docker version && docker compose version
free -h                                          # confira os 2 GB de swap
```

## 2. Criar o `deploy/.env.prod`

O primeiro `deploy.sh` cria `~/annetec` e para avisando que falta o `.env.prod`. Então, no servidor:

```bash
cd ~/annetec
cp deploy/.env.prod.example deploy/.env.prod && chmod 600 deploy/.env.prod
openssl rand -base64 48   # → BETTER_AUTH_SECRET
openssl rand -hex 32      # → POSTGRES_PASSWORD (hex: entra na DATABASE_URL sem escape)
openssl rand -hex 32      # → ASAAS_WEBHOOK_TOKEN
nano deploy/.env.prod
```

- Chaves do Asaas começam com `$`: **sempre entre aspas simples** (`ASAAS_API_KEY='$aact_hmlg_...'`),
  senão o compose interpola e a chave chega vazia.
- `DATABASE_URL`, `NODE_ENV`, `PORT`, `TRUST_PROXY=true` e `STORAGE_LOCAL_DIR` vêm do compose.
- `POSTGRES_PASSWORD` só vale na **criação** do volume; trocar depois exige `ALTER USER` no banco.
- `NEXT_PUBLIC_*` entram no build da web: mudou, rode `dc up -d --build web`.

Variáveis novas do deploy:

| Variável | Onde | Efeito |
| --- | --- | --- |
| `WEB_DOMAIN`, `API_DOMAIN`, `APEX_DOMAIN`, `ACME_EMAIL` | Caddy | sites HTTPS e e-mail da conta ACME |
| `DEPLOY_STAGE=preview` | API | `NODE_ENV=production` aceitando Asaas **sandbox** (e recusando chave de produção), `EMAIL_PROVIDER=outbox` e `STORAGE_DRIVER=local`; superadmin pode revelar senhas provisórias na caixa de saída. Vazio = produção estrita. Aviso grande no log a cada boot. |
| `TRUST_PROXY` | API | usa `X-Forwarded-For` (1º salto) como IP do cliente — rate limit, auditoria, `remoteIp` do Asaas. O compose fixa `true` (o Caddy sobrescreve o cabeçalho e a porta da API não é publicada). Sem a env: ligado na Vercel e fora de produção, desligado em produção. |

## 3. Deploy

Da sua máquina (Git Bash), na raiz do repo, com tudo commitado:

```bash
bash deploy/deploy.sh                       # HOST=3.131.89.130 KEY=~/.ssh/annetec-prod.pem por padrão
HOST=... KEY=... bash deploy/deploy.sh
SKIP_MIGRATE=1 bash deploy/deploy.sh
```

O script: `git archive HEAD` → `~/annetec` (preserva `deploy/.env.prod`), builda **um de cada vez**
(api, tools, web — a web usa até 2 GB de heap), roda `migrate`, `up -d`, e limpa imagens antigas.
O primeiro build demora (~10–15 min na t4g.medium); os seguintes reaproveitam cache.

Na primeira subida o Caddy pede os certificados — o DNS dos três hostnames já precisa apontar para o IP.

## 4. Migrações, seeds e admin

O serviço `migrate` é a imagem `tools` (código-fonte + tsx), cwd `apps/api`, comando padrão `pnpm db:migrate`:

```bash
dc run --rm migrate                                    # aplica src/db/migrations (idempotente)
```

Admin da plataforma (sem seed — use senha forte):

```bash
dc run --rm migrate pnpm platform:create-admin "Nome Sobrenome" voce@annetec.com.br 'SenhaForte!2026'
dc run --rm migrate pnpm tenant:create-admin <slug> "Nome" admin@cliente.com.br 'SenhaForte!2026'
```

Dados de demonstração (só na fase interina). Os seeds abortam com `NODE_ENV=production`;
libere explicitamente com `ALLOW_SEED_IN_PRODUCTION=1`:

```bash
dc run --rm -e ALLOW_SEED_IN_PRODUCTION=1 migrate pnpm db:seed               # planos, superadmin, inquilinos annetec e mepcard
dc run --rm -e ALLOW_SEED_IN_PRODUCTION=1 migrate pnpm demo:seed annetec     # carteira: vendedores, associados, leads, vendas
dc run --rm -e ALLOW_SEED_IN_PRODUCTION=1 migrate pnpm demo:planos annetec   # 3 planos completos do clube
dc run --rm -e ALLOW_SEED_IN_PRODUCTION=1 migrate pnpm demo:propostas        # 5 propostas na fila de compliance
```

> **O `db:seed` grava senhas triviais e públicas** (`super@annetec.com.br` / `super123456`, `admin123`…, ver
> README da raiz) — num endereço público, prefira **não** rodá-lo: crie o superadmin com `platform:create-admin`,
> crie o inquilino pelo console (`/admin/inquilinos/novo`) e só então rode `demo:seed <slug>` / `demo:planos <slug>`.
> Se rodar o `db:seed`, redefina as senhas dos admins de inquilino com `tenant:create-admin` (idempotente).
> As contas criadas por `demo:seed` usam a senha `demo1234` (`*@equipe.<slug>.test`, `*@assoc.<slug>.test`).
> `demo:billing` e `demo:plataforma` criam cobranças do gateway **simulado**, que não existe com
> `NODE_ENV=production` — não use no servidor.

Asaas (sandbox agora, produção no fim) — cadastra/atualiza os dois webhooks na conta:

```bash
dc run --rm migrate pnpm asaas:setup --public-url https://api.3-131-89-130.sslip.io --dry-run      # só consulta
dc run --rm migrate pnpm asaas:setup --public-url https://api.3-131-89-130.sslip.io --pix-key   # sandbox precisa de chave Pix
```

## 5. Operação

```bash
dc ps
dc logs -f --tail=200 api            # web | caddy | postgres
dc restart api
dc up -d                             # aplica mudanças do .env.prod (recria quem mudou)
dc exec postgres psql -U annetec -d annetec
docker stats --no-stream             # memória por container
curl -s https://api.3-131-89-130.sslip.io/readyz
```

Logs: json-file, 10 MB × 5 por container.

## 6. Backup e restore

```bash
bash ~/annetec/deploy/backup.sh                        # ~/backups/annetec-db-*.sql.gz e annetec-storage-*.tar.gz (guarda 7)
BACKUP_S3_URI=s3://bucket/annetec bash ~/annetec/deploy/backup.sh   # também envia ao S3 (AWS CLI + IAM role)
```

Cron diário (`crontab -e`):

```
15 3 * * * /bin/bash $HOME/annetec/deploy/backup.sh >> $HOME/backups/backup.log 2>&1
```

Restore (o dump tem `--clean --if-exists`, recria por cima):

```bash
dc stop api web
gunzip -c ~/backups/annetec-db-AAAAMMDD-HHMMSS.sql.gz | dc exec -T postgres psql -U annetec -d annetec -v ON_ERROR_STOP=1
dc run --rm --no-deps -T --entrypoint sh migrate -c 'tar -xzf - -C /data/storage' < ~/backups/annetec-storage-AAAAMMDD-HHMMSS.tar.gz
dc start api web
```

## 7. Virada para o domínio final (annetec.com.br)

1. **DNS na GoDaddy** (zona de `annetec.com.br`) — **não mexa em MX/TXT** (e-mail, SPF, verificações):
   - `A` `@` → `3.131.89.130`
   - `A` `api` → `3.131.89.130`
   - `CNAME` `www` → `annetec.com.br` (ou `A` `www` → `3.131.89.130`; CNAME não aceita IP)
   - Confira: `dig +short www.annetec.com.br api.annetec.com.br annetec.com.br`
2. **Banco limpo** (sem contas/dados de demonstração) — antes de abrir para clientes:
   ```bash
   bash ~/annetec/deploy/backup.sh               # guarda a demo, por via das dúvidas
   dc down
   docker volume rm annetec_postgres_data annetec_api_storage
   ```
3. **`deploy/.env.prod`**:
   - `WEB_DOMAIN=www.annetec.com.br`, `API_DOMAIN=api.annetec.com.br`, `APEX_DOMAIN=annetec.com.br`
   - `API_BASE_URL=https://api.annetec.com.br`, `WEB_BASE_URL=https://www.annetec.com.br`, `CORS_ORIGINS=https://www.annetec.com.br`
   - remova `DEPLOY_STAGE`
   - `ASAAS_ENV=production`, `ASAAS_API_KEY='$aact_prod_...'` (e `PLATFORM_ASAAS_API_KEY` se houver), tokens de webhook novos
   - `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` (domínio do remetente verificado no Resend)
   - `STORAGE_DRIVER=s3` + `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
   - Google: adicione `https://www.annetec.com.br` às origens autorizadas do client OAuth
4. **Subir**: `dc up -d` (o Caddy emite os certificados novos; a API valida a config estrita no boot —
   se faltar algo, `dc logs api` lista tudo). Mudou `NEXT_PUBLIC_*`? `dc up -d --build web`.
5. **Banco**: `dc run --rm migrate` e `platform:create-admin` (sem seeds).
6. **Webhooks do Asaas de produção**:
   ```bash
   dc run --rm migrate pnpm asaas:setup --public-url https://api.annetec.com.br
   ```
   Cadastra `https://api.annetec.com.br/api/v1/webhooks/asaas` e `/api/v1/webhooks/asaas-plataforma`
   com os tokens do `.env.prod`. Teste com um evento pelo painel do Asaas e acompanhe `dc logs -f api`.
7. Os certificados do sslip.io simplesmente deixam de ser renovados; nada a remover.
