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
- **Final** — `www.annetec.org.br` / `api.annetec.org.br` (raiz `annetec.org.br` → 301 para www), produção estrita.

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

Admin da plataforma (sem seed — senha forte, mínimo 12 caracteres). A senha **não** vai na linha de
comando (ficaria no histórico do shell e na lista de processos): o script lê `PLATFORM_ADMIN_PASSWORD`,
o stdin ou pede sem eco.

```bash
# a) variável de ambiente: `read -rs` não ecoa nem grava no histórico; `-e VAR` sem valor repassa a do shell
read -rs PLATFORM_ADMIN_PASSWORD; export PLATFORM_ADMIN_PASSWORD
dc run --rm -e PLATFORM_ADMIN_PASSWORD migrate pnpm platform:create-admin "Nome Sobrenome" voce@annetec.org.br
unset PLATFORM_ADMIN_PASSWORD

# b) digitada quando pedida (sem eco) — precisa do TTY: NÃO use `-T` aqui
dc run --rm migrate pnpm platform:create-admin "Nome Sobrenome" voce@annetec.org.br

# c) pipe (só a senha, sem outras linhas) — use `-T`: sem TTY o script lê o stdin inteiro
pass show annetec/admin | head -n1 | dc run --rm -T migrate pnpm platform:create-admin "Nome Sobrenome" voce@annetec.org.br
```

Papel opcional no fim (`superadmin`, o padrão, ou `platform_admin`). Admin de inquilino (este script ainda
recebe a senha como argumento):

```bash
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

Asaas (sandbox agora, produção no fim) — cadastra/atualiza o webhook da **plataforma** na conta da ANNETEC.
Cada clube recebe na própria conta Asaas: o admin do clube cola a chave em Faturamento → Configurações →
Recebimento e a API cadastra o webhook do clube (`/api/v1/webhooks/asaas/clube/<organizationId>`) sozinha
(passo a passo em `docs/pagamentos-asaas-configuracao.md`, seção 5). Clube sem chave não vende (409).

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

## 7. Virada para o domínio final (annetec.org.br)

1. **DNS no Registro.br** (modo avançado, zona de `annetec.org.br`; o Registro.br **não aceita `@`**: o registro da raiz é criado com o campo Nome **vazio**) — **não mexa em MX/TXT** (e-mail, SPF, verificações):
   - `A` (Nome vazio) → `3.131.89.130`
   - `A` `api` → `3.131.89.130`
   - `CNAME` `www` → `annetec.org.br` (ou `A` `www` → `3.131.89.130`; CNAME não aceita IP)
   - Confira: `dig +short www.annetec.org.br api.annetec.org.br annetec.org.br`
2. **Banco limpo** (sem contas/dados de demonstração) — antes de abrir para clientes:
   ```bash
   bash ~/annetec/deploy/backup.sh               # guarda a demo, por via das dúvidas
   dc down
   docker volume rm annetec_postgres_data annetec_api_storage
   ```
3. **`deploy/.env.prod`**:
   - `WEB_DOMAIN=www.annetec.org.br`, `API_DOMAIN=api.annetec.org.br`, `APEX_DOMAIN=annetec.org.br`
   - `API_BASE_URL=https://api.annetec.org.br`, `WEB_BASE_URL=https://www.annetec.org.br`, `CORS_ORIGINS=https://www.annetec.org.br`
   - remova `DEPLOY_STAGE`
   - `ASAAS_ENV=production`, `ASAAS_API_KEY='$aact_prod_...'` (conta da ANNETEC — só a cobrança da plataforma;
     ou `PLATFORM_ASAAS_API_KEY`), token de webhook da plataforma novo. As chaves de **sandbox** que os clubes
     conectaram na demo deixam de valer: em produção estrita a API só aceita chave `$aact_prod_` de clube —
     cada clube reconecta com a chave de produção da conta dele
   - `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` (domínio do remetente verificado no Resend)
   - `STORAGE_DRIVER=s3` + `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
   - Google: adicione `https://www.annetec.org.br` às origens autorizadas do client OAuth
4. **Banco primeiro, migrações antes da API** (a API nova nunca sobe com o schema velho):
   ```bash
   dc up -d postgres
   dc run --rm -T migrate
   ```
5. **Subir**: `dc up -d` (o Caddy emite os certificados novos; a API valida a config estrita no boot —
   se faltar algo, `dc logs api` lista tudo). Mudou `NEXT_PUBLIC_*`? `dc up -d --build web`.
   Depois, o admin: `dc run --rm migrate pnpm platform:create-admin ...` (sem seeds).
6. **Webhooks do Asaas de produção**:
   ```bash
   dc run --rm migrate pnpm asaas:setup --public-url https://api.annetec.org.br
   ```
   Cadastra `https://api.annetec.org.br/api/v1/webhooks/asaas-plataforma` na conta da ANNETEC com o token do
   `.env.prod` (mínimo 32 caracteres — a API não sobe com menos) e todos os eventos que o código trata (inclui
   chargeback, estorno parcial e restauração). Se o webhook antigo do clube (`/api/v1/webhooks/asaas`, hoje 410)
   ainda estiver na conta, o script avisa — remova-o no painel do Asaas. O webhook de cada **clube** é cadastrado
   na conta dele quando o admin conecta o recebimento (com `API_BASE_URL` pública). **Mudou a lista
   `ASAAS_WEBHOOK_EVENTS` (`src/integrations/asaas/webhook-events.ts`)? Rode o setup de novo e clique em
   "Testar" no recebimento de cada clube.** Teste com um evento pelo painel do Asaas e acompanhe `dc logs -f api`.
7. Os certificados do sslip.io simplesmente deixam de ser renovados; nada a remover.
