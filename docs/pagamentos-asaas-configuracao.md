# Pagamentos com Asaas — configuração sandbox e produção

Guia para quem opera a API da ANNETEC e precisa ligar a cobrança real no Asaas,
primeiro na sandbox (teste) e depois em produção, para vários inquilinos ao mesmo tempo.

Convenções deste documento:

- Caminhos com linha (`arquivo.ts:40`) apontam para o código como está hoje.
- "No painel do Asaas..." indica conhecimento do Asaas, não do nosso código. Os nomes de menu do painel mudam com o tempo. Confira na documentação oficial (docs.asaas.com).
- Todos os comandos rodam na raiz do repositório, salvo indicação.

---

## 1. Visão geral: como o sistema cobra hoje

### Dois motores de cobrança

| Motor | Quem paga quem | Módulo | Tabelas | Webhook |
|---|---|---|---|---|
| **club-billing** | O associado paga o clube do inquilino (checkout, mensalidade, dependentes) — o dinheiro cai na **conta Asaas do próprio clube** | `apps/api/src/modules/club-billing/` | `billing_settings`, `club_subscriptions`, `club_charges`, `payment_events` (migração `0006`), `tenant_asaas_accounts` (migração `0015`) | `POST /api/v1/webhooks/asaas/clube/:organizationId` (um por clube, token próprio) |
| **platform-billing** | A ANNETEC cobra o inquilino (ativação, mensalidade, ajustes) — conta Asaas da ANNETEC (`PLATFORM_ASAAS_API_KEY ?? ASAAS_API_KEY`) | `apps/api/src/modules/platform-billing/` | `tenant_plan_prices`, `platform_billing_settings`, `platform_subscriptions`, `platform_charges`, `platform_billing_events` (migração `0008`) | `POST /api/v1/webhooks/asaas-plataforma` |

Os dois usam o mesmo cliente HTTP (`apps/api/src/integrations/asaas/client.ts`) e a mesma classe `AsaasGateway` (`apps/api/src/integrations/asaas/gateway.ts:26`).
O ciclo da assinatura é nosso. O Asaas só cria, consulta, cancela, dá baixa e estorna cobranças (`gateway.ts:21-25`).

### Gateways disponíveis

| Gateway | Quando é usado | O que faz |
|---|---|---|
| `simulated` (padrão) | Sem configuração nenhuma | Pix/boleto/cartão de mentira, sem dinheiro. Pix compensa sozinho em 20 s, boleto em 120 s. Cartão com final `0002` é recusado (`apps/api/.env.example:61-66`). |
| `asaas` | `PAYMENT_GATEWAY=asaas` (ou override do inquilino) | Cobranças reais na API v3 do Asaas, na **conta do clube** (chave colada pelo admin do clube — seção 5). Sandbox ou produção conforme o prefixo da chave do clube. Clube sem conta conectada: adesão e cobrança bloqueadas (409 `RECEBIMENTO_NAO_CONFIGURADO`). |

URLs da API do Asaas (`client.ts:44-47`):

- produção: `https://api.asaas.com/v3`
- sandbox: `https://api-sandbox.asaas.com/v3`

Autenticação: header `access_token` com a chave, sem "Bearer", mais `User-Agent` (`client.ts:100-104`).

### Como cada inquilino escolhe o gateway

Ordem de decisão do clube (`apps/api/src/integrations/payments/provider.ts:56-66`):

1. `billing_settings.gateway` do inquilino (override gravado pela tela ou pela API).
2. Se for `null`, vale a env `PAYMENT_GATEWAY`.
3. Se o resultado for `asaas`, o clube precisa ter a conta Asaas própria conectada (`tenant_asaas_accounts`). Sem ela, checkout, pagamento de cobrança, segunda via, cobrança manual e reativação respondem **409 `RECEBIMENTO_NAO_CONFIGURADO`** ("Este clube ainda não configurou o recebimento das mensalidades."); a automação pula o clube com um alerta no log. **Nunca** cai no simulado nem na conta da ANNETEC — o club-billing não usa `ASAAS_API_KEY`.

A plataforma segue a lógica antiga com `platform_billing_settings.gateway` → `PLATFORM_PAYMENT_GATEWAY` → `simulated`, na conta da ANNETEC (`apps/api/src/modules/platform-billing/gateway.ts`); sem chave fora de produção ela ainda cai no simulado.

Regra importante: **a cobrança segue no gateway em que nasceu**. Cada linha de `club_charges`/`platform_charges` grava `gateway_provider`. Trocar o gateway do inquilino só afeta as próximas cobranças (`provider.ts:20-22`, `provider.ts:74`).

### Fluxo de uma cobrança no Asaas

```mermaid
flowchart TD
    A[Checkout público<br/>ou automação gera o ciclo] --> B{Gateway efetivo<br/>do inquilino}
    B -- simulated --> S[SimulatedGateway<br/>sem dinheiro]
    B -- asaas --> C[ensureCustomer<br/>busca por CPF/CNPJ, senão cria]
    C --> D[POST /v3/payments<br/>externalReference = id da cobrança]
    D --> E[Grava club_charges<br/>gateway_charge_id, Pix/boleto/invoiceUrl]
    E --> F[Cliente paga<br/>Pix, boleto ou cartão]
    F --> G[Asaas envia webhook<br/>header asaas-access-token]
    G --> H[webhook-controller confere token<br/>e responde 200 sempre]
    H --> I[handleGatewayEvent<br/>dedupe em payment_events]
    I --> J[Cobrança paid<br/>assinatura active]
    J --> K[Carteirinhas liberadas]
    L[Automação: sync a cada 15 min] -. recupera webhook perdido .-> I
```

Detalhes do caminho:

- O `externalReference` da cobrança do clube é o `id` (uuid) da linha em `club_charges` (`apps/api/src/modules/club-billing/charges.service.ts:179`).
- O da plataforma é `plt_` + uuid sem hífens (`apps/api/src/modules/platform-billing/access-key.ts:35-44`). Assim um handler nunca confunde a cobrança do outro.
- Se o `POST /payments` der timeout ou 5xx, o gateway consulta por `externalReference` antes de qualquer repetição (`gateway.ts:96-106`). POST nunca é repetido automaticamente (`client.ts:107`).
- O webhook e a sincronização periódica chamam o mesmo handler (`apps/api/src/modules/club-billing/events.service.ts:135`).

### Cada clube na própria conta Asaas

```mermaid
flowchart LR
    subgraph Servidor["API ANNETEC"]
        K1["tenant_asaas_accounts<br/>chave do Clube X (cifrada)"]
        K2["tenant_asaas_accounts<br/>chave do Clube Y (cifrada)"]
        K3["PLATFORM_ASAAS_API_KEY<br/>(vazia = ASAAS_API_KEY)"]
    end
    subgraph AsaasX["Conta Asaas do Clube X"]
        P1[pay_111<br/>externalReference = uuid A]
    end
    subgraph AsaasY["Conta Asaas do Clube Y"]
        P2[pay_222<br/>externalReference = uuid B]
    end
    subgraph AsaasA["Conta Asaas da ANNETEC"]
        P3[pay_333<br/>externalReference = plt_...]
    end
    K1 --> P1
    K2 --> P2
    K3 --> P3
    P1 -- "webhook /asaas/clube/X" --> C1[club_charges A]
    P2 -- "webhook /asaas/clube/Y" --> C2[club_charges B]
    P3 -- "webhook /asaas-plataforma" --> C3[platform_charges]
```

| Peça | Onde mora | Papel |
|---|---|---|
| Chave de API do clube | `tenant_asaas_accounts.api_key_encrypted` (AES-256-GCM, `lib/crypto.ts`) | Cobranças do clube nascem na conta dele; nunca sai da API |
| Token do webhook do clube | `tenant_asaas_accounts.webhook_token_encrypted` | Conferido no header `asaas-access-token` da rota do clube |
| `externalReference` da cobrança | Asaas, igual a `club_charges.id` ou `plt_<id>` | Liga o pagamento à linha certa |
| `organization_id` | `club_charges`, `club_subscriptions`, URL do webhook | O webhook de um clube só mexe em cobrança daquele clube (evento de outro clube é logado e ignorado) |
| `gateway_customer_id` / `card_token` | `club_subscriptions` | Id do cliente e token do cartão **na conta do clube** — por isso trocar de conta com assinaturas vivas é bloqueado |
| Chave da ANNETEC | `.env` (`PLATFORM_ASAAS_API_KEY ?? ASAAS_API_KEY`) | Só a cobrança da plataforma |

O cliente no Asaas é buscado por CPF/CNPJ **dentro da conta do clube** (`gateway.ts`): a mesma pessoa associada a dois clubes vira dois clientes, um em cada conta.

---

## 2. Variáveis de ambiente

Arquivo: `apps/api/.env` (modelo em `apps/api/.env.example`). Validação em `apps/api/src/config/env.ts`. Variável presente mas vazia (`FOO=`) vale como ausente (`env.ts:11-14`). Booleanos aceitam `true/false/1/0/yes/no/on/off/sim/não` (`env.ts:20-27`).

### Tabela completa

| Variável | Para quê | Valor sandbox | Valor produção | Obrigatória? |
|---|---|---|---|---|
| `NODE_ENV` | Liga as regras de produção (webhook sem token = 401, automação e atalhos de demo desligados por padrão) | `development` | `production` | Sim em produção |
| `PAYMENT_GATEWAY` | Gateway padrão do clube | `asaas` (ou `simulated` e override por inquilino) | `asaas` | Não. Padrão `simulated` (produção exige `asaas`) |
| `ASAAS_API_KEY` | Chave da conta Asaas **da ANNETEC** — só a cobrança da plataforma (fallback de `PLATFORM_ASAAS_API_KEY`). O club-billing **não** usa: cada clube conecta a própria chave no painel | `$aact_hmlg_...` | `$aact_prod_...` | Esta ou `PLATFORM_ASAAS_API_KEY` em produção |
| `ASAAS_ENV` | URL base da conta da ANNETEC. A chave de cada clube carrega o ambiente no prefixo | `sandbox` | `production` | Não. Padrão `sandbox` |
| `ASAAS_WEBHOOK_TOKEN` | Fallback de `PLATFORM_ASAAS_WEBHOOK_TOKEN` (webhook da plataforma). O webhook de cada clube tem token próprio, gerado ao conectar | Gerado, 64 hex | Gerado, 64 hex | Este ou `PLATFORM_ASAAS_WEBHOOK_TOKEN` em produção |
| `ASAAS_USER_AGENT` | `User-Agent` exigido pelo Asaas em contas novas (`env.ts:68`) | `ANNETEC-Clube/1.0` | `ANNETEC-Clube/1.0` | Não. Tem padrão |
| `ASAAS_TIMEOUT_MS` | Timeout de cada chamada ao Asaas (`env.ts:69`) | `20000` | `20000` | Não. Padrão `20000` |
| `SIMULATED_PIX_APPROVE_SECONDS` | Segundos até o Pix simulado compensar; `0` = só pelo botão (`env.ts:71`) | `20` | irrelevante com Asaas | Não |
| `SIMULATED_BOLETO_APPROVE_SECONDS` | Idem para boleto simulado (`env.ts:73`) | `120` | irrelevante com Asaas | Não |
| `SIMULATED_PIX_KEY` | Chave Pix fictícia do BR Code simulado (`env.ts:75-78`) | padrão | irrelevante com Asaas | Não |
| `BILLING_AUTOMATION_ENABLED` | Liga o timer da automação do clube (`env.ts:80`, regra em `env.ts:155`) | `true` | `true` em servidor persistente; na Vercel não tem efeito | Não. Padrão: ligado fora de produção, **desligado em produção** |
| `BILLING_AUTOMATION_INTERVAL_SECONDS` | Intervalo do timer do clube (`env.ts:81-84`, mín. 10) | `60` | `60` | Não. Padrão `60` |
| `WEB_BASE_URL` | Base dos links montados pela API: boleto simulado e página pública da fatura da plataforma, usada nos e-mails (`env.ts:86`, `env.ts:158`, `access-key.ts:30-33`) | `http://localhost:3000` | `https://<web de produção>` | Recomendada. Padrão: 1ª origem de `CORS_ORIGINS` |
| `PLATFORM_PAYMENT_GATEWAY` | Gateway padrão da cobrança ANNETEC → inquilino (`env.ts:95`) | `asaas` | `asaas` | Não. Padrão `simulated` |
| `PLATFORM_ASAAS_API_KEY` | Chave da conta Asaas da ANNETEC (cobrança da plataforma) | vazio ou `$aact_hmlg_...` | vazio ou `$aact_prod_...` | Não. Vazio = `ASAAS_API_KEY` |
| `PLATFORM_ASAAS_WEBHOOK_TOKEN` | Token do webhook `/asaas-plataforma` (`env.ts:99`) | vazio ou gerado | gerado (recomendado separado) | Não. Vazio = `ASAAS_WEBHOOK_TOKEN` |
| `PLATFORM_BILLING_AUTOMATION_ENABLED` | Liga o timer da automação da plataforma (`env.ts:101`, regra em `env.ts:161`) | vazio | `true` em servidor persistente | Não. Vazio = segue `BILLING_AUTOMATION_ENABLED` |
| `PLATFORM_BILLING_AUTOMATION_INTERVAL_SECONDS` | Intervalo do timer da plataforma (`env.ts:102-104`) | `60` | `60` | Não. Padrão `60` |
| `PLATFORM_MERCHANT_NAME` | Recebedor no Pix/boleto **simulado** da plataforma (`env.ts:107`) | `ANNETEC` | irrelevante com Asaas | Não |
| `PLATFORM_MERCHANT_CITY` | Cidade no Pix simulado da plataforma (`env.ts:108`) | `Rio de Janeiro` | irrelevante com Asaas | Não |
| `PLATFORM_DEMO_TOOLS_ENABLED` | Atalho "avançar N dias" do console (`env.ts:110`, `env.ts:164`). Só funciona com o gateway da plataforma em `simulated` (`apps/api/src/modules/platform-billing/settings.service.ts:87-90`) | vazio | `false` | Não. Vazio = ligado fora de produção |

Variáveis que a cobrança também usa, já existentes: `API_BASE_URL` (URL pública da API), `CORS_ORIGINS`, `BETTER_AUTH_SECRET` (assina a chave das páginas públicas de fatura, `access-key.ts:14-19`), `EMAIL_PROVIDER` (e-mails da cobrança da plataforma).

### Bloco `.env` — sandbox

```dotenv
NODE_ENV=development
API_BASE_URL=http://localhost:3333
CORS_ORIGINS=http://localhost:3000
WEB_BASE_URL=http://localhost:3000

# Clube (associado -> inquilino): cada clube conecta a PRÓPRIA chave no painel
# (Faturamento -> Configurações -> Recebimento). Nada de chave do clube aqui.
PAYMENT_GATEWAY=asaas
ASAAS_USER_AGENT=ANNETEC-Clube/1.0
ASAAS_TIMEOUT_MS=20000

BILLING_AUTOMATION_ENABLED=true
BILLING_AUTOMATION_INTERVAL_SECONDS=60

# Conta Asaas da ANNETEC (cobrança da plataforma)
ASAAS_API_KEY=$aact_hmlg_COLE_A_CHAVE_DA_SANDBOX_DA_ANNETEC_AQUI
ASAAS_ENV=sandbox
ASAAS_WEBHOOK_TOKEN=COLE_O_TOKEN_GERADO_AQUI_64_HEX

# Plataforma (ANNETEC -> inquilino). Vazio = usa ASAAS_API_KEY / ASAAS_WEBHOOK_TOKEN.
PLATFORM_PAYMENT_GATEWAY=asaas
PLATFORM_ASAAS_API_KEY=
PLATFORM_ASAAS_WEBHOOK_TOKEN=
PLATFORM_BILLING_AUTOMATION_ENABLED=
PLATFORM_BILLING_AUTOMATION_INTERVAL_SECONDS=60
PLATFORM_MERCHANT_NAME=ANNETEC
PLATFORM_MERCHANT_CITY=Rio de Janeiro
PLATFORM_DEMO_TOOLS_ENABLED=
```

Obs.: em alguns shells o `$` da chave é interpretado. No arquivo `.env` lido pelo `dotenv` não há problema. Em painel de hospedagem, cole a chave como está.

### Bloco `.env` — produção

```dotenv
NODE_ENV=production
API_BASE_URL=https://api.SEU-DOMINIO.com.br
CORS_ORIGINS=https://app.SEU-DOMINIO.com.br
WEB_BASE_URL=https://app.SEU-DOMINIO.com.br

# Clube (associado -> inquilino): chave de PRODUÇÃO de cada clube, colada no painel.
PAYMENT_GATEWAY=asaas
ASAAS_USER_AGENT=ANNETEC-Clube/1.0
ASAAS_TIMEOUT_MS=20000

# Conta Asaas da ANNETEC (cobrança da plataforma)
ASAAS_API_KEY=$aact_prod_COLE_A_CHAVE_DE_PRODUCAO_DA_ANNETEC_AQUI
ASAAS_ENV=production
ASAAS_WEBHOOK_TOKEN=

# Em servidor persistente (Railway/Render/VM): ligue. Na Vercel não há timer (ver seção 6).
BILLING_AUTOMATION_ENABLED=true
BILLING_AUTOMATION_INTERVAL_SECONDS=60

# Plataforma (ANNETEC -> inquilino)
PLATFORM_PAYMENT_GATEWAY=asaas
PLATFORM_ASAAS_API_KEY=
PLATFORM_ASAAS_WEBHOOK_TOKEN=COLE_OUTRO_TOKEN_64_HEX
PLATFORM_BILLING_AUTOMATION_ENABLED=true
PLATFORM_BILLING_AUTOMATION_INTERVAL_SECONDS=60
PLATFORM_DEMO_TOOLS_ENABLED=false
```

### Regra de fallback

- `PLATFORM_ASAAS_API_KEY` vazia → a plataforma usa `ASAAS_API_KEY` (`platform-billing/gateway.ts`).
- `PLATFORM_ASAAS_WEBHOOK_TOKEN` vazio → usa `ASAAS_WEBHOOK_TOKEN`.
- `PLATFORM_BILLING_AUTOMATION_ENABLED` vazio → segue a do clube.
- **Clube:** não há fallback. A chave é por inquilino (`tenant_asaas_accounts`), cifrada, resolvida em runtime com cache por clube + `updated_at` (`integrations/payments/provider.ts`). Sem ela o clube não cobra no Asaas (409 `RECEBIMENTO_NAO_CONFIGURADO`).

### Política de ambiente das chaves dos clubes

A mesma da trava de boot (`config/assert-production.ts` → `allowedClubAsaasEnvironments`):

| Servidor | Chave do clube aceita |
|---|---|
| Produção estrita (`NODE_ENV=production`) | só `$aact_prod_…` |
| Demo (`NODE_ENV=production` + `DEPLOY_STAGE=preview`) | só `$aact_hmlg_…` |
| Desenvolvimento/teste | as duas |

---

## 3. Passo a passo: conta sandbox (teste)

### Pré-requisitos

- Node >= 22 e pnpm 10 (`package.json` da raiz).
- Banco migrado: `pnpm db:migrate`.
- `jq` instalado, para os exemplos de `curl`.

### 1. Criar a conta sandbox

No painel do Asaas: acesse `https://sandbox.asaas.com` e crie uma conta. A sandbox não movimenta dinheiro e não exige aprovação de documentos para testar.

### 2. Gerar as chaves de API

No painel do Asaas (sandbox): menu de Integrações → Chaves de API → gerar chave. A chave da sandbox começa com `$aact_hmlg_`. Copie na hora; o Asaas só mostra uma vez.

- **Conta da ANNETEC** (plataforma): vai em `ASAAS_API_KEY` (ou `PLATFORM_ASAAS_API_KEY`) no `.env`.
- **Conta de cada clube**: crie outra conta sandbox para o clube de teste e gere a chave dela. Essa chave **não** vai no `.env`: o admin do clube cola no painel (passo 8).

### 3. Gerar o token do webhook

O código aceita de 1 a 255 caracteres (`env.ts:66`). O `.env.example` registra a regra do Asaas de 32 a 255 (`apps/api/.env.example:53`). Use 64 caracteres hex:

```bash
openssl rand -hex 32
# ou
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Gere um para `ASAAS_WEBHOOK_TOKEN` (ou `PLATFORM_ASAAS_WEBHOOK_TOKEN`): é o token do webhook da **plataforma**. O token do webhook de cada clube é gerado pela API ao conectar o recebimento e nunca aparece.

### 4. Preencher o `.env`

Copie `apps/api/.env.example` para `apps/api/.env` e use o bloco sandbox da seção 2.

### 5. Subir a API

```bash
pnpm install
pnpm db:migrate
pnpm dev:api        # só a API (tsx watch src/index.ts) na porta 3333
# ou
pnpm dev            # API + web em paralelo
```

No log, confira:

- `Automação de cobrança do clube agendada` (primeira rodada 10 s após o boot, `apps/api/src/modules/club-billing/automation.service.ts:497-502`).
- Clube com Asaas sem conta conectada aparece uma vez no log: `Clube sem conta de recebimento (Asaas) conectada` — conecte no passo 8.

### 6. Expor a API local para o webhook

O Asaas precisa alcançar sua máquina. Use um túnel:

```bash
ngrok http 3333
# ou
cloudflared tunnel --url http://localhost:3333
```

Anote a URL pública, por exemplo `https://abc123.ngrok-free.app`, e use-a como `API_BASE_URL` da API (o webhook de cada clube é montado a partir dela; com `localhost` ele fica `pendente`). Ela muda a cada execução do túnel gratuito; quando mudar, atualize `API_BASE_URL`, rode o `asaas:setup` de novo (passo 7, webhook da plataforma) e clique em **Testar** no recebimento de cada clube (passo 8), que atualiza a URL dos webhooks já cadastrados.

Teste o token antes de cadastrar no Asaas:

```bash
TUNNEL=https://abc123.ngrok-free.app
TOKEN_WH=COLE_O_PLATFORM_ASAAS_WEBHOOK_TOKEN_OU_ASAAS_WEBHOOK_TOKEN

# Webhook da plataforma — token certo: 200 {"success":true,"data":{"received":true}}
curl -i -X POST "$TUNNEL/api/v1/webhooks/asaas-plataforma" \
  -H "asaas-access-token: $TOKEN_WH" -H 'content-type: application/json' \
  -d '{"id":"evt_teste_1","event":"PAYMENT_RECEIVED","payment":{"id":"pay_inexistente"}}'

# Token errado: 401
curl -i -X POST "$TUNNEL/api/v1/webhooks/asaas-plataforma" \
  -H "asaas-access-token: errado" -H 'content-type: application/json' -d '{}'

# Webhook de um clube SEM conta conectada (ou token errado): 401
curl -i -X POST "$TUNNEL/api/v1/webhooks/asaas/clube/ID_DA_ORGANIZACAO" \
  -H "asaas-access-token: qualquer" -H 'content-type: application/json' -d '{}'

# Rota global antiga do clube: 410 (desativada)
curl -i -X POST "$TUNNEL/api/v1/webhooks/asaas" -H 'content-type: application/json' -d '{}'
```

O primeiro chega como "sem cobrança correspondente — ignorado" no log, o que é esperado. O webhook do clube só se testa depois de conectar o recebimento (passo 8): o token dele é gerado pela API e não é exibido — use **Testar** no painel e confira as entregas no painel do Asaas do clube.

### 7. Cadastrar o webhook da PLATAFORMA e a chave Pix (script)

Com a chave da ANNETEC em `PLATFORM_ASAAS_API_KEY` (ou `ASAAS_API_KEY`) e o túnel no ar, rode na raiz do repositório:

```bash
pnpm --filter @annetec/api asaas:setup --public-url https://abc123.ngrok-free.app --pix-key
# conferir antes, sem criar nem alterar nada:
pnpm --filter @annetec/api asaas:setup --public-url https://abc123.ngrok-free.app --pix-key --dry-run
```

O script (`apps/api/scripts/asaas-setup.ts`) é idempotente e cuida **só da conta da ANNETEC**:

1. Valida a chave em `GET /v3/myAccount/commercialInfo/` e mostra nome, e-mail e situação da conta. Chave recusada, ou prefixo `$aact_prod_` com `ASAAS_ENV=sandbox` (e o contrário), param o script com erro.
2. Lista os webhooks da conta (`GET /v3/webhooks`). Se já existir um com a mesma URL, ou com o mesmo nome (o túnel mudou), atualiza com `PUT /v3/webhooks/{id}`; senão cria com `POST /v3/webhooks`. Nunca duplica.
3. Cadastra o webhook da plataforma (`/api/v1/webhooks/asaas-plataforma`): ativo, fila não interrompida, v3, envio sequencial, os eventos de `ASAAS_WEBHOOK_EVENTS` (`apps/api/src/integrations/asaas/webhook-events.ts`) e o token do `.env`. Se encontrar o webhook antigo do clube (`/api/v1/webhooks/asaas`) na conta, avisa para removê-lo no painel.
4. Com `--pix-key`, cria uma chave Pix aleatória (EVP) se a conta não tiver nenhuma ativa ou aguardando ativação (`/v3/pix/addressKeys`). Sem chave Pix a sandbox não gera QR Code.
5. Imprime um resumo e sai com código 1 em qualquer erro. Chave e token nunca aparecem inteiros.

O webhook de **cada clube** não passa por aqui: a API cadastra na conta do clube ao conectar o recebimento (passo 8) e reativa a cada **Testar**.

Outras opções: `--email ops@seudominio` (e-mail que o Asaas avisa quando o webhook falha; padrão: e-mail da conta). Sem `--public-url`, o script usa `API_BASE_URL`, desde que não seja `localhost`. Se o token estiver vazio, o script gera um, imprime e para: grave o valor no `.env`, reinicie a API e rode de novo. O script nunca escreve no `.env`.

**Alternativa manual (plataforma).** No painel do Asaas da ANNETEC: Integrações → Webhooks → Adicionar.

| Campo no painel | Webhook da plataforma |
|---|---|
| Nome | `ANNETEC plataforma` |
| URL | `https://<túnel>/api/v1/webhooks/asaas-plataforma` |
| Token de autenticação | valor de `PLATFORM_ASAAS_WEBHOOK_TOKEN` (ou `ASAAS_WEBHOOK_TOKEN`, se vazio) |
| Versão da API | v3 |
| Tipo de envio | Sequencial |
| Fila de sincronização | Ativada |
| Webhook ativo | Sim |
| E-mail de erro | e-mail técnico da equipe |

O webhook de cada clube é cadastrado pela API com nome `ANNETEC — Clube <slug>`, URL `<API_BASE_URL>/api/v1/webhooks/asaas/clube/<organizationId>`, os mesmos eventos e um token aleatório guardado cifrado. Não cadastre à mão (o token não é exibido).

O Asaas envia o token no header `asaas-access-token`. A API compara em tempo constante, com SHA-256 dos dois lados (`apps/api/src/integrations/asaas/webhook.ts:20-26`).

Eventos que os webhooks assinam (lista única em `integrations/asaas/webhook-events.ts`; os que mudam estado):

| Evento | Efeito no sistema |
|---|---|
| `PAYMENT_CONFIRMED` | Cobrança `paid`; ativa/reativa a assinatura |
| `PAYMENT_RECEIVED` | Cobrança `paid` (mesmo efeito; aplicado uma vez só) |
| `PAYMENT_OVERDUE` | Cobrança `overdue` |
| `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` | Cobrança `failed` |
| `PAYMENT_REPROVED_BY_RISK_ANALYSIS` | Cobrança `failed` |
| `PAYMENT_REFUNDED` | Cobrança `refunded` |
| `PAYMENT_DELETED` | Cobrança `canceled` |

Outros eventos são gravados na timeline mas não mudam estado. Não há prejuízo em marcá-los, mas não há ganho.

Se a mesma conta Asaas servir a mais de um clube (ou ao clube e à plataforma), cada URL recebe todos os eventos da conta. O webhook do clube só aplica eventos de cobrança **daquele** clube (os de outro clube são logados e ignorados) e ignora o `externalReference` `plt_...`; o da plataforma faz o inverso. Todos respondem 200 e seguem.

### 8. Conectar o recebimento do clube e ativar o Asaas

Cada clube recebe na própria conta Asaas. O **admin do clube** (ou o superadmin da ANNETEC, para suporte) cola a chave de API da conta do clube no painel. Passo a passo para o clube gerar a chave: seção 5.

**Pela tela:** `/<slug>/admin/faturamento` → Configurações → **Recebimento** → colar a chave → Conectar. A tela mostra a conta (nome, CPF/CNPJ mascarado, e-mail), a situação cadastral no Asaas, o status do webhook e os 4 últimos caracteres da chave. **Testar** revalida a chave e reativa o webhook.

**Pela API:** a API só aceita `Authorization: Bearer <token>`; o token vem do login.

```bash
API=http://localhost:3333
SLUG=mapcard2

TOKEN=$(curl -s -X POST "$API/api/v1/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"admin@seuclube.com.br","password":"SENHA"}' | jq -r '.data.token')

# Conecta (ou renova) a chave do clube. Valida no Asaas e cadastra o webhook do clube.
curl -s -X PUT "$API/api/v1/t/$SLUG/faturamento/configuracoes/recebimento" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"apiKey":"$aact_hmlg_CHAVE_DA_CONTA_DO_CLUBE"}' | jq '.data'

# Situação (sem segredo)
curl -s "$API/api/v1/t/$SLUG/faturamento/configuracoes/recebimento" -H "authorization: Bearer $TOKEN" | jq '.data'

# Grava o override (opcional). O campo é gatewayOverride; null volta a seguir PAYMENT_GATEWAY.
curl -s -X PATCH "$API/api/v1/t/$SLUG/faturamento/configuracoes" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"gatewayOverride":"asaas"}' | jq '.data | {gateway, gatewayOverride, asaasConfigured, sandbox}'
```

Esperado: recebimento `connected: true`, `webhookStatus: "ativo"` (com `API_BASE_URL` pública) e configurações com `gateway: "asaas"`, `asaasConfigured: true`, `sandbox: true`. Escolher o override `asaas` sem conta conectada é recusado ("Conecte a conta Asaas do clube…").

As rotas `/faturamento/*` exigem admin do inquilino; a equipe ANNETEC só lê, e só o superadmin grava (`apps/api/src/http/middleware/auth.ts`, `requireTenantRole`).

### 9. Fazer um checkout de teste

Abra `http://localhost:3000/<slug>/assinar` em janela anônima e siga o checkout. Meios:

| Meio | O que acontece na sandbox |
|---|---|
| Pix | QR e copia-e-cola reais da sandbox (`gateway.ts:170-177`). Se o QR não vier, falta chave Pix na conta: rode o `asaas:setup` com `--pix-key` (passo 7) ou cadastre uma chave aleatória no painel. |
| Boleto | Linha digitável e link do boleto da sandbox (`gateway.ts:178-185`). |
| Cartão | Captura na criação. Recusa vira `CardDeclinedError` e a cobrança não é criada (`client.ts:151-155`). |

Cartões da sandbox (`packages/contracts/src/annetec/club-billing.ts:416-421`):

| Número | Resultado |
|---|---|
| `4444 4444 4444 4444` | Aprovado (aceito mesmo sem passar no Luhn) |
| `5184 0197 4037 3151` | Recusado |
| `4916 5613 5824 0741` | Recusado |

CVV: qualquer 3 dígitos. Validade: qualquer data futura. O checkout também pede CPF, CEP e número do endereço do titular, que o Asaas exige em `creditCardHolderInfo` (`gateway.ts:77-84`).

O número do cartão e o CVV passam pela API até o Asaas. Só o token, bandeira, finais e validade ficam gravados (`club_subscriptions.card_token`, `apps/api/src/db/schema/club-billing.ts:124-125`).

### 10. Confirmar o pagamento

Três jeitos, do mais simples ao mais real:

1. **Botão "Simular pagamento"** na tela do checkout ou no painel de faturamento. Só aparece com gateway simulado ou Asaas sandbox (`apps/web/lib/adapters/faturamento.ts:124-127`). No Asaas, chama `POST /v3/sandbox/payment/{id}/confirm` e sincroniza na hora (`charges.service.ts:596-622`, `client.ts:233-237`).
2. **Pela API:**

   ```bash
   # Lista cobranças do inquilino e pega o id
   curl -s "$API/api/v1/t/$SLUG/faturamento/cobrancas" -H "authorization: Bearer $TOKEN" | jq '.data[0]'

   CHARGE_ID=cole-o-id
   curl -s -X POST "$API/api/v1/t/$SLUG/faturamento/cobrancas/$CHARGE_ID/simular-pagamento" \
     -H "authorization: Bearer $TOKEN" | jq '.data.status'
   ```

3. **No painel do Asaas (sandbox):** abra a cobrança e use a opção de confirmar pagamento. Isso gera o webhook de verdade.

Com o jeito 1 ou 2 a baixa acontece pela sincronização. O webhook chega depois e é marcado como duplicado ou "registrado" sem mudar nada, por causa da idempotência (`events.service.ts:36-43`).

### 11. Conferir o webhook e a assinatura

```bash
# Timeline de eventos do inquilino (origem: webhook, automação, checkout, equipe)
curl -s "$API/api/v1/t/$SLUG/faturamento/eventos" -H "authorization: Bearer $TOKEN" \
  | jq '.data[] | {type, source, message}'

# Assinaturas
curl -s "$API/api/v1/t/$SLUG/faturamento/assinaturas" -H "authorization: Bearer $TOKEN" \
  | jq '.data[] | {id, status}'
```

Esperado: um evento `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED` com origem `webhook`, assinatura `active` e carteirinhas visíveis em `/<slug>/cliente/carteirinha`.

No painel do Asaas, a tela do webhook mostra cada entrega e o status HTTP devolvido. Tem que ser 200.

### 12. Testar a cobrança da plataforma

1. Login como superadmin (seed: `super@annetec.com.br`, ver `docs/apresentacao/roteiro-demo-clube.md`).
2. `/admin/financeiro` → aba **Régua e automação** → **Gateway da plataforma** → Asaas (só o superadmin grava, `apps/api/src/modules/platform-billing/admin-controller.ts:184`).
3. Gere uma fatura: segunda via de uma fatura existente, ou "Executar automação agora" com uma assinatura perto do vencimento. Dados de demo: `pnpm --filter @annetec/api demo:plataforma`.
4. Pague pela página pública `/fatura-annetec/<id>?chave=...` ou use "Simular pagamento".
5. Confira em `GET /api/v1/platform/billing/eventos`.

### 13. Rodar os testes da integração

```bash
pnpm test:api
```

`apps/api/tests/club-billing-asaas.test.ts` cobre o cliente (header, GET sem corpo, retry só em GET, 400 de cartão, 401), o gateway (Pix, cartão, recuperação por `externalReference`) e o token do webhook. `club-billing-receiving-account.test.ts` e `club-billing-receiving-provider.test.ts` cobrem a conta do clube (formato/ambiente da chave, conectar, rotação × troca de conta, webhook, desconectar, cache do provider, checkout bloqueado e automação pulando o clube). Usam `fetch`/banco falsos; não chamam o Asaas.

---

## 4. Passo a passo: conta produção

### Pré-requisitos

- Contas Asaas de produção **aprovadas** — a da ANNETEC (plataforma) e a de cada clube. No painel do Asaas: envio de documentos da empresa e análise cadastral. Sem aprovação o Asaas pode recusar operações (a API devolve 403, ver `client.ts:172-179`).
- Chaves de produção, prefixo `$aact_prod_` (a da ANNETEC no `.env`; a de cada clube colada no painel — o servidor de produção recusa chave de sandbox de clube).
- **Banco de produção separado** do banco onde você testou a sandbox. O banco não registra em qual ambiente/conta a cobrança nasceu, só `gateway_provider = 'asaas'`. Cobranças, clientes e tokens de cartão da sandbox não existem na produção.
- API publicada com URL HTTPS pública e estável.

### Passos

1. **Variáveis.** Use o bloco de produção da seção 2. Pontos obrigatórios:
   - `NODE_ENV=production`.
   - `ASAAS_ENV=production`.
   - `PLATFORM_ASAAS_WEBHOOK_TOKEN` (ou `ASAAS_WEBHOOK_TOKEN`) preenchido: sem ele o webhook da plataforma responde 401 e a API nem sobe (`config/assert-production.ts`). O webhook de cada clube usa token próprio, gerado ao conectar.
   - Tokens **novos**, diferentes dos da sandbox.
2. **Webhook da plataforma.** Com as variáveis de produção carregadas (`ASAAS_ENV=production`, chave `$aact_prod_`, tokens novos), rode o script da seção 3, passo 7, com a URL de produção:

   ```bash
   pnpm --filter @annetec/api asaas:setup --public-url https://api.SEU-DOMINIO.com.br --dry-run   # confere
   pnpm --filter @annetec/api asaas:setup --public-url https://api.SEU-DOMINIO.com.br             # aplica
   ```

   - Cadastra `https://api.SEU-DOMINIO.com.br/api/v1/webhooks/asaas-plataforma` na conta da ANNETEC. Se ainda existir o webhook antigo do clube (`/api/v1/webhooks/asaas`, hoje 410), o script avisa: remova-o no painel.
   - Os webhooks dos clubes são cadastrados pela API quando cada clube conecta o recebimento (seção 5).
   - `--pix-key` também funciona em produção, mas o Asaas só cria chave Pix em conta aprovada. Se recusar, cadastre a chave pelo painel.
   - O script lê `apps/api/.env`. Rode onde as variáveis de produção estejam disponíveis (no servidor, ou localmente com elas exportadas no shell; variável do ambiente vence o `.env`).
   - Alternativa manual: cadastre o webhook da plataforma no painel do Asaas de produção com os campos da tabela da seção 3, passo 7.
3. **Recebimento dos clubes.** Com `PAYMENT_GATEWAY=asaas` (obrigatório em produção), cada clube só vende depois que o admin dele conecta a chave de produção da conta do clube (seção 5). Até lá a vitrine mostra o aviso (`receivingConfigured: false`) e a adesão responde 409 `RECEBIMENTO_NAO_CONFIGURADO`.
4. **Automação.** Em produção o padrão é **desligado** (`env.ts:155`).
   - Servidor persistente (Railway, Render, VM com `pnpm --filter @annetec/api start`): defina `BILLING_AUTOMATION_ENABLED=true` e `PLATFORM_BILLING_AUTOMATION_ENABLED=true`. Os timers sobem em `apps/api/src/index.ts:16` e `apps/api/src/index.ts:22`.
   - **Vercel:** o ponto de entrada é `apps/api/src/vercel.ts`, que não chama os `start*Automation`. Não há timer, qualquer que seja a env. É preciso um cron externo chamando `POST .../automacao/executar` (seção 6). Sem isso nenhum ciclo novo é gerado, nada vence e nada é suspenso.
5. **Atalhos de demo.** `PLATFORM_DEMO_TOOLS_ENABLED=false`. Com gateway da plataforma em Asaas o atalho já fica bloqueado (`platform-billing/settings.service.ts:87-90`), mas deixe explícito.
6. **Teste de fumaça.** Com um inquilino interno, faça uma assinatura real de valor baixo via Pix. Confira o webhook 200 no painel do Asaas e o evento em `/faturamento/eventos`. Estorne pelo painel do Asaas; o `PAYMENT_REFUNDED` deve marcar a cobrança como `refunded`.

### Rotação de chaves

**Chave de um clube** (mesma conta Asaas, chave nova): o admin do clube gera a nova chave na MESMA conta e cola em Configurações → Recebimento. Vale na hora (o cache do gateway é invalidado pelo `updated_at` da conta; não precisa reiniciar). Depois ele desativa a chave antiga no Asaas. Ids de cobrança, clientes e tokens de cartão pertencem à conta, não à chave.

**Clube trocando de conta Asaas:** a API compara a conta da chave nova com a salva (`/myAccount/status` → `id`; sem id, o CPF/CNPJ; ambiente diferente = conta diferente). Se houver assinaturas com cliente/cartão na conta atual (aguardando pagamento, ativas, em atraso ou suspensas), responde **409** "a conta atual ainda tem N assinaturas vinculadas". Sem vínculo, troca: o webhook da conta antiga é apagado (best effort, com a chave antiga), o token do webhook do clube é trocado (o antigo ficava visível no painel da conta anterior) e o webhook novo, com token novo, é cadastrado na conta nova; os ids de cliente/cartão das assinaturas **encerradas** são esquecidos (uma reativação cria o cliente na conta nova). Desconectar segue a mesma regra.

**Chave da ANNETEC (plataforma):**

1. No painel do Asaas, gere a nova chave.
2. Troque `PLATFORM_ASAAS_API_KEY` (ou `ASAAS_API_KEY`) no ambiente.
3. Reinicie a API (o `AsaasGateway` da plataforma fica em cache no processo).
4. Só então desative a chave antiga no painel do Asaas.

**Token do webhook da plataforma:** troque no `.env` e rode `asaas:setup` (ou edite no painel do Asaas) quase ao mesmo tempo. Entre uma troca e outra, as entregas recebem 401 e se acumulam na fila do Asaas. A sincronização de 15 min cobre o intervalo.

### Limites do Asaas que o código já respeita

| Proteção | Onde |
|---|---|
| Sync de cobranças Asaas no máximo a cada 15 min por cobrança (simulado: 30 s). Comentário cita o limite de 25 mil requisições em 12 h | `automation.service.ts:44-45`, `platform-billing/automation.service.ts:59` |
| Até 200 cobranças sincronizadas por inquilino por rodada | `automation.service.ts:43` |
| GET repetido até 3× em falha de rede, 429 e 5xx; espera 1,5 s após 429 | `client.ts:68-69`, `client.ts:192-193` |
| POST/DELETE nunca repetidos | `client.ts:107` |
| GET sem corpo (corpo em GET dá 403 no Asaas) | `client.ts:35`, `client.ts:99` |
| Cliente reaproveitado por CPF/CNPJ (sem duplicar no painel) | `gateway.ts:40-44` |
| Cliente criado com `notificationDisabled: true` (Asaas não manda e-mail/SMS ao pagador) | `gateway.ts:51` |

### Checklist de go-live

- [ ] Conta Asaas de produção da ANNETEC aprovada.
- [ ] Banco de produção sem dados da sandbox.
- [ ] `NODE_ENV=production` e `ASAAS_ENV=production`.
- [ ] `PLATFORM_ASAAS_API_KEY` (ou `ASAAS_API_KEY`) com prefixo `$aact_prod_`.
- [ ] `PLATFORM_ASAAS_WEBHOOK_TOKEN` (ou `ASAAS_WEBHOOK_TOKEN`) novo, 64 hex.
- [ ] `WEB_BASE_URL` e `API_BASE_URL` com os domínios de produção (`API_BASE_URL` pública: é a base do webhook de cada clube).
- [ ] Webhook `/api/v1/webhooks/asaas-plataforma` cadastrado, ativo, v3, sequencial, token conferido.
- [ ] Webhook antigo `/api/v1/webhooks/asaas` removido da conta da ANNETEC (a rota responde 410).
- [ ] Teste com `curl` do token da plataforma: certo = 200, errado = 401.
- [ ] Cada clube que vai vender: recebimento conectado com chave `$aact_prod_`, conta aprovada e webhook `ativo`.
- [ ] Gateway da plataforma definido (env ou tela "Régua e automação").
- [ ] Automação ligada (servidor persistente) **ou** cron externo configurado (Vercel).
- [ ] `PLATFORM_DEMO_TOOLS_ENABLED=false`.
- [ ] `EMAIL_PROVIDER` real (`resend` ou `sendgrid`) para os e-mails da cobrança da plataforma.
- [ ] Transação real de valor baixo paga, webhook 200 e evento na timeline.
- [ ] Estorno de teste pelo painel do Asaas refletido como `refunded`.
- [ ] Clubes orientados a gerar a chave sem permissão de saque via API (seção 5).

---

## 5. Múltiplos inquilinos: cada clube recebe na própria conta Asaas

### O modelo

- **Cada clube (inquilino) tem a própria conta Asaas** e recebe as mensalidades dos associados direto nela. A ANNETEC não toca no dinheiro do clube; o saque é do clube.
- Quem conecta é o **admin do clube** (Faturamento → Configurações → Recebimento), colando a chave de API da conta dele. O superadmin da ANNETEC também pode, para suporte; o resto da equipe só consulta.
- A chave é validada no Asaas (`GET /myAccount/commercialInfo/` e `GET /myAccount/status/`) no ambiente indicado pelo prefixo, gravada **cifrada** em `tenant_asaas_accounts` (AES-256-GCM, chave derivada do `BETTER_AUTH_SECRET`) e nunca devolvida — a tela só vê os 4 últimos caracteres.
- Ao conectar, a API cadastra na conta do clube o webhook `ANNETEC — Clube <slug>` → `<API_BASE_URL>/api/v1/webhooks/asaas/clube/<organizationId>`, com token aleatório próprio. O webhook só aplica eventos de cobranças daquele clube.
- **Clube sem chave = sem venda.** Com gateway `asaas`, checkout, pagamento de cobrança, segunda via, cobrança manual e reativação respondem 409 `RECEBIMENTO_NAO_CONFIGURADO` ("Este clube ainda não configurou o recebimento das mensalidades."); a vitrine abre com `receivingConfigured: false`; a automação pula o clube (sincronização, geração de ciclo e cartão) com um alerta no log por clube, sem afetar os outros. **Nunca** cai na conta da ANNETEC.
- A cobrança da plataforma (ANNETEC → clube) continua na conta da ANNETEC (`PLATFORM_ASAAS_API_KEY ?? ASAAS_API_KEY`), sem mudança.
- `revenue_share_percent` continua sendo só um percentual no cálculo da fatura que a ANNETEC emite ao clube. **Não** é split.

### Passo a passo para o clube gerar a chave no Asaas

Envie ao responsável financeiro do clube:

1. Entre na conta Asaas **do clube** (produção: `https://www.asaas.com`; teste: `https://sandbox.asaas.com`). A conta precisa estar aprovada para receber em produção.
2. Menu **Integrações → Chaves de API → Gerar chave de API**.
3. Nome sugerido: `ANNETEC - mensalidades`.
4. **Sem data de expiração** (uma chave que expira para de cobrar sem aviso).
5. **NÃO marque "operações de saque via API"** (ou equivalente, como transferências/Pix de saída pela API). A ANNETEC só cria, consulta, cancela e estorna cobranças; nunca precisa sacar.
6. Opcional: restrinja a chave aos IPs do servidor da ANNETEC (peça o IP de saída do servidor à equipe técnica).
7. Copie a chave na hora (o Asaas mostra uma vez). Produção começa com `$aact_prod_`; sandbox com `$aact_hmlg_`.
8. No painel da ANNETEC: **Faturamento → Configurações → Recebimento** → cole a chave → **Conectar**. Confira o nome/CNPJ da conta exibidos, a situação cadastral e o webhook **Ativo**.

Chave de outro formato (ex.: antiga, sem `prod`/`hmlg`) é recusada como inválida. O ambiente precisa casar com o servidor (seção 2, "Política de ambiente").

### Endpoints (admin do clube; superadmin para suporte)

Base: `/api/v1/t/:tenantSlug/faturamento`. Mutações limitadas a 10 por hora **por clube**; toda mutação vai para a auditoria, sem a chave (só ambiente, 4 últimos caracteres e o nome da conta).

| Método e rota | Corpo | Resposta (`data`) |
|---|---|---|
| `GET /configuracoes/recebimento` | — | Situação da conta (abaixo) |
| `PUT /configuracoes/recebimento` | `{ "apiKey": "$aact_…" }` | Situação após validar a chave e cadastrar o webhook |
| `POST /configuracoes/recebimento/testar` | — | Revalida a chave, atualiza a situação cadastral e reativa o webhook |
| `DELETE /configuracoes/recebimento` | — | `connected: false` (apaga o webhook no Asaas, best effort) |

Situação (`clubReceivingAccount` em `packages/contracts`): `connected`, `env` (`sandbox`/`production`), `keyHint`, `accountName`, `cpfCnpj` (mascarado), `email`, `accountStatus` (`{ approved, general, pending[] }`), `webhookStatus` (`ativo`/`pendente`/`erro`), `webhookLastError`, `webhookUrl`, `connectedAt`, `lastCheckedAt`. A chave e o token do webhook nunca saem.

Erros: chave em formato inválido ou de ambiente não aceito → 400 (campo `apiKey`); chave recusada pelo Asaas → 422; troca de conta ou desconexão com assinaturas vinculadas → 409; testar sem conta → 409 `RECEBIMENTO_NAO_CONFIGURADO`. Falha ao cadastrar o webhook **não** desfaz a conexão: fica `webhookStatus: "erro"` com o motivo (ou `pendente` se `API_BASE_URL` não for pública) — corrija e clique em **Testar**.

Webhook do clube: `POST /api/v1/webhooks/asaas/clube/:organizationId` — token ausente/errado ou clube sem conta → 401; token certo → sempre 200 (evento de cobrança de outro clube é logado e ignorado). A rota global antiga `POST /api/v1/webhooks/asaas` responde **410**.

### Próximos passos (fora desta etapa)

- **Subconta criada pela ANNETEC** (`POST /v3/accounts`): a resposta traz `apiKey` e `walletId` da subconta; a `apiKey` alimenta a mesma `tenant_asaas_accounts` (coluna `source = 'subaccount'` já reservada). White label depende de liberação comercial do Asaas.
- **Split** (comissão da ANNETEC retida na liquidação): exigiria o `walletId` do clube e o array `split` em `AsaasCreatePaymentInput`.

---

## 6. Automação

### O que já roda sozinho

Em servidor persistente, dois timers sobem no boot (`apps/api/src/index.ts:14-22`):

| Motor | Função | Primeira rodada | Intervalo | Liga/desliga |
|---|---|---|---|---|
| Clube | `startBillingAutomation` (`automation.service.ts:458`) | 10 s após o boot | `BILLING_AUTOMATION_INTERVAL_SECONDS` (60) | `BILLING_AUTOMATION_ENABLED` |
| Plataforma | `startPlatformBillingAutomation` (`platform-billing/automation.service.ts:738`) | 15 s após o boot | `PLATFORM_BILLING_AUTOMATION_INTERVAL_SECONDS` (60) | `PLATFORM_BILLING_AUTOMATION_ENABLED` |

Os dois têm mutex em processo: uma rodada não começa se a anterior ainda roda. Erro de um inquilino não derruba os outros (`automation.service.ts:36-41`).

Passos da rodada do clube, por inquilino (`automation.service.ts:116-429`):

| Passo | O que faz | Padrão em `billing_settings` |
|---|---|---|
| sincronizar | Consulta no gateway as cobranças abertas não sincronizadas há 15 min (Asaas) | — |
| checkout abandonado | Encerra checkout sem pagamento há mais de 7 dias (`automation.rules.ts:11`) | — |
| gerar ciclo | Cria a cobrança do próximo ciclo antes do vencimento | `generate_days_before` = 10 |
| cartão | Cobra o cartão salvo no vencimento e repete se falhar | `max_card_retries` = 3, `card_retry_interval_hours` = 24 |
| lembretes | Marca o lembrete na timeline (envio é no-op, ver abaixo) | `reminder_days_before` = 3 |
| vencer | Marca cobranças vencidas como `overdue` | — |
| inadimplência | Suspende (bloqueia carteirinhas) e depois cancela | `suspend_after_days` = 15, `cancel_after_days` = 60 |
| reativar | Reativa quem quitou tudo | — |

Outros padrões do clube: `boleto_due_days` = 3, `fine_percent` = 2, `interest_monthly_percent` = 1, repassados ao Asaas como multa e juros (`apps/api/src/db/schema/club-billing.ts:74-82`, `gateway.ts:64-65`).

A plataforma tem passos equivalentes, mais restrição de acesso, expiração de overrides e de propostas. Padrões em `platform_billing_settings` (`platform-billing.ts:79-90`): gerar 10 dias antes, lembrete 3 dias, restringir após 10, suspender após 30, cancelar após 90, boleto 5 dias, 3 tentativas de cartão a cada 24 h.

### O que falta

| Lacuna | Detalhe |
|---|---|
| Lembrete do clube não é enviado | `deliverReminder` é vazio (`automation.service.ts:53-56`). E o cliente Asaas é criado com `notificationDisabled: true` (`gateway.ts:51`), então o associado não recebe aviso nenhum. |
| Lembretes da plataforma | São enviados por e-mail via `EMAIL_PROVIDER` (`platform-billing/automation.service.ts:300`, `platform-billing/notify.ts:36-55`). Com o padrão `outbox` só ficam na caixa de saída do console. Sem WhatsApp. |
| Cadastro de webhook pela API | Resolvido por script, não pelo boot da API: `pnpm --filter @annetec/api asaas:setup --public-url <url> [--pix-key]` (`apps/api/scripts/asaas-setup.ts`) cria ou atualiza os dois webhooks e a chave Pix. Precisa rodar de novo quando a URL pública ou o token mudar. |
| Cron na Vercel | `apps/api/vercel.json` só tem rewrite e `maxDuration: 30`. Nenhum cron. |
| Estorno | `refundCharge` existe no gateway (`gateway.ts:123-126`) mas não há rota. Estorno é pelo painel do Asaas; o webhook `PAYMENT_REFUNDED` atualiza o sistema. |
| Rodar todos os inquilinos por HTTP | `runAll` (`automation.service.ts:436`) só é chamado pelo timer. A rota HTTP do clube roda **um** inquilino por chamada. |

### Como as rotas de automação autenticam

| Rota | Escopo | Quem pode | Arquivo |
|---|---|---|---|
| `POST /api/v1/t/:slug/faturamento/automacao/executar` | Um inquilino | Admin do inquilino **ou** qualquer sessão da equipe ANNETEC | `admin-controller.ts:61`, `:181-191`; `auth.ts:55-59` |
| `POST /api/v1/platform/billing/automacao/executar` | Toda a plataforma | `superadmin` ou `platform_admin` | `platform-billing/admin-controller.ts:50`, `:197-207` |

Não há token de serviço. A API só entende `Authorization: Bearer <token de sessão>` do Better Auth (plugin `bearer`, `apps/api/src/lib/auth.ts:135`). O token sai de `POST /api/v1/auth/login` no campo `data.token`. A sessão dura 30 dias e é renovada no uso (`lib/auth.ts:99-103`). Se a rodada já estiver em execução, a rota responde 409 (`throwIfBusy`).

Caminho recomendado hoje:

1. Criar um usuário só para o cron, com papel `platform_admin`. A senha (mínimo 12 caracteres) não vai na
   linha de comando — vem de `PLATFORM_ADMIN_PASSWORD`, do stdin ou é digitada sem eco quando pedida:

   ```bash
   read -rs PLATFORM_ADMIN_PASSWORD; export PLATFORM_ADMIN_PASSWORD

   # local
   pnpm --filter @annetec/api exec tsx src/db/create-platform-admin.ts \
     "Cron Cobrança" cron-cobranca@annetec.com.br platform_admin

   # servidor (docker compose, ver deploy/README.md §4): `-e VAR` sem valor repassa a do shell
   dc run --rm -e PLATFORM_ADMIN_PASSWORD migrate pnpm platform:create-admin \
     "Cron Cobrança" cron-cobranca@annetec.com.br platform_admin

   unset PLATFORM_ADMIN_PASSWORD
   ```

   Sem a variável, o script pede a senha sem eco (no `dc run`, só com TTY — não passe `-T`).

2. O cron faz login a cada execução (não depende da validade do token), lista os inquilinos e chama as rotas.

### Exemplo: GitHub Actions

O repositório não tem `.github/`. Este é um exemplo para criar em `.github/workflows/cobranca-cron.yml`. Segredos: `ANNETEC_API_URL`, `ANNETEC_CRON_EMAIL`, `ANNETEC_CRON_PASSWORD`.

```yaml
name: cobranca-cron
on:
  schedule:
    - cron: '*/15 * * * *'   # GitHub executa no máximo a cada 5 min e pode atrasar
  workflow_dispatch: {}

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - name: Automação do clube e da plataforma
        env:
          API: ${{ secrets.ANNETEC_API_URL }}
          EMAIL: ${{ secrets.ANNETEC_CRON_EMAIL }}
          PASSWORD: ${{ secrets.ANNETEC_CRON_PASSWORD }}
        run: |
          set -euo pipefail
          TOKEN=$(curl -sf -X POST "$API/api/v1/auth/login" \
            -H 'content-type: application/json' \
            -d "$(jq -n --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p}')" \
            | jq -r '.data.token')

          # Um POST por inquilino (até 200 por página)
          SLUGS=$(curl -sf "$API/api/v1/platform/tenants?perPage=200" \
            -H "authorization: Bearer $TOKEN" | jq -r '.data[].slug')
          for SLUG in $SLUGS; do
            curl -s -o /dev/null -w "$SLUG %{http_code}\n" -X POST \
              "$API/api/v1/t/$SLUG/faturamento/automacao/executar" \
              -H "authorization: Bearer $TOKEN" || true
          done

          # Plataforma (uma chamada)
          curl -s -w "\nplataforma %{http_code}\n" -X POST \
            "$API/api/v1/platform/billing/automacao/executar" \
            -H "authorization: Bearer $TOKEN" | jq '.data | {generated, markedOverdue, errors}'
```

Observações:

- A lista de inquilinos não inclui a operação própria da ANNETEC (`GET /api/v1/platform/tenants/operador`). Se ela também vender clube, acrescente o slug dela.
- Na Vercel cada chamada tem até 30 s (`vercel.json`). A rota do clube é por inquilino, o que ajuda. A rodada da plataforma é única; acompanhe a duração.
- 15 min é suficiente: o Asaas avisa os pagamentos por webhook, e o sync do Asaas já é de 15 min.

### Exemplo: cron-job.org (ou similar)

Serviços como cron-job.org fazem POST com header fixo, mas não fazem login nem laço. Só servem se você colar um token de sessão no header `authorization: Bearer ...` e criar um job por inquilino. O token expira em 30 dias sem uso e cai no logout. Prefira o GitHub Actions acima.

### Por que não Vercel Cron

No Vercel Cron, a Vercel chama a rota com **GET** e manda `Authorization: Bearer <CRON_SECRET>` (documentação da Vercel). Nossas rotas são **POST** e exigem sessão do Better Auth. Para usar Vercel Cron é preciso criar uma rota nova (ver seção 8). Exemplo do que seria o `vercel.json` depois dessa rota existir:

```json
{
  "crons": [{ "path": "/api/v1/cron/cobranca", "schedule": "*/15 * * * *" }]
}
```

Essa rota **não existe hoje**. No plano Hobby da Vercel o cron é limitado a uma execução por dia (regra da Vercel).

---

## 7. Checklist de validação e troubleshooting

### Validação rápida

- [ ] `GET /api/v1/t/<slug>/faturamento/configuracoes` mostra `gateway: "asaas"`, `asaasConfigured: true` e `sandbox` correto.
- [ ] `GET /api/v1/t/<slug>/faturamento/configuracoes/recebimento` mostra `connected: true` e `webhookStatus: "ativo"`.
- [ ] `curl` no webhook da plataforma com token certo devolve 200; com token errado, 401.
- [ ] Painel do Asaas mostra entregas do webhook com 200.
- [ ] Checkout de teste gera `gateway_charge_id` (`pay_...`) na cobrança.
- [ ] Pagamento gera evento com origem `webhook` em `/faturamento/eventos`.
- [ ] Assinatura vira `active` e as carteirinhas aparecem.
- [ ] Log sem `Falha ao processar webhook do Asaas`.

### Sintomas

| Sintoma | Causa provável | Onde olhar |
|---|---|---|
| Webhook do clube responde 401 | Clube desconectado, token do webhook editado à mão no painel do Asaas, ou URL com `organizationId` de outro clube | Clique em **Testar** no recebimento (reenvia o token certo); `club-billing/webhook-controller.ts` |
| Webhook da plataforma responde 401 | Token do painel diferente de `PLATFORM_ASAAS_WEBHOOK_TOKEN ?? ASAAS_WEBHOOK_TOKEN` | `platform-billing/webhook-controller.ts`; tela do webhook no painel do Asaas |
| Webhook responde 410 | Webhook antigo do clube (`/api/v1/webhooks/asaas`) ainda cadastrado na conta da ANNETEC | Remova-o no painel; o `asaas:setup` avisa |
| 409 `RECEBIMENTO_NAO_CONFIGURADO` no checkout/cobrança | Clube com gateway Asaas sem conta conectada | Configurações → Recebimento |
| Webhook do clube `pendente` | `API_BASE_URL` não é pública (localhost/http) | Ajuste `API_BASE_URL` e clique em **Testar** |
| Webhook não chega | URL errada (falta `/api/v1`), túnel caiu ou mudou de endereço, webhook inativo, eventos não marcados, fila pausada | Painel do Asaas → Webhooks → histórico; log da API |
| Cobrança fica `pending` depois de pago | Webhook não chegou ou falhou; sync só roda a cada 15 min e só com automação ativa | `/faturamento/eventos`; log `Webhook do Asaas processado`; automação ligada? |
| Log `Gateway da plataforma = asaas sem PLATFORM_ASAAS_API_KEY/ASAAS_API_KEY: usando o simulado` | Chave da ANNETEC vazia ou não lida (só afeta a plataforma) | `platform-billing/gateway.ts` |
| Log `Clube sem conta de recebimento (Asaas) conectada` | Clube com gateway Asaas sem conta: a automação pula sincronização, ciclo e cartão dele | `club-billing/automation.service.ts`; Configurações → Recebimento |
| Fila do Asaas pausada | No Asaas, 15 falhas seguidas pausam a fila. Nossa API devolve 200 sempre que o token confere, então a causa é token errado (401), API fora do ar, 413 (corpo > 256 KB) ou URL inexistente | `webhook-controller.ts:11-19`; no painel do Asaas, corrija e reative a fila |
| Erro "O Asaas recusou a chave de API (401)" / "O Asaas recusou esta chave de API" | Chave revogada/expirada; na plataforma, chave de sandbox com `ASAAS_ENV=production` ou o contrário | `client.ts`; `club-billing/receiving-account.service.ts` |
| Erro 403 do Asaas | Conta ainda não aprovada para a operação, ou recurso não liberado | `client.ts:172-179`; situação cadastral no painel do Asaas |
| Cartão recusado na sandbox | Número diferente de `4444 4444 4444 4444`, validade passada, ou dados do titular (CPF, CEP, número) inválidos | `club-billing.ts:416-421` (contracts); mensagem do Asaas repassada em `client.ts:151-155` |
| QR do Pix não aparece na sandbox | No Asaas, a conta precisa de chave Pix cadastrada para gerar QR | Painel do Asaas → Pix → chaves |
| Tentativa de cobrança duplicada | Bloqueada: unique `(subscription_id, period_start)` e `(gateway_provider, gateway_charge_id)` em `club_charges`; unique de evento em `payment_events`; consulta por `externalReference` após timeout | `schema/club-billing.ts:215`, `:217`, `:244`; `gateway.ts:96-106` |
| Evento aparece como duplicado | Normal: o Asaas entrega "pelo menos uma vez" | `events.service.ts:148-170` |
| Automação não roda em produção | Padrão é desligado com `NODE_ENV=production`; ou hospedado na Vercel (sem timer) | `env.ts:155`, `env.ts:161`; `apps/api/src/vercel.ts`; seção 6 |
| `POST /automacao/executar` responde 409 | Rodada já em execução | `automation.service.ts:63-68` |
| Inquilino não consegue mudar para Asaas na tela | Clube sem conta de recebimento conectada: a API recusa o override | `club-billing/settings.service.ts` |
| Botão "Simular pagamento" sumiu | Gateway Asaas em produção (só existe na sandbox) | `adapters/faturamento.ts:124-127`; `gateway.ts:133-136` |

---

## 8. Lacunas e próximos passos

Em ordem de prioridade:

1. **Rota de cron com token de serviço.** Criar algo como `GET|POST /api/v1/cron/cobranca` protegido por um segredo (`CRON_SECRET`), que chame `runAll` do clube e `runPlatformAutomation`. Resolve Vercel Cron e tira a dependência de usuário e senha no cron.
2. **Registrar o ambiente/conta na cobrança.** Gravar `ASAAS_ENV` (ou um id de conta) em `club_charges`/`platform_charges` e nas assinaturas. Evita misturar sandbox e produção no mesmo banco e permite trocar de conta com segurança.
3. **Enviar os lembretes do clube.** Implementar `deliverReminder` (`automation.service.ts:53-56`) com o mesmo `sendEmail` da plataforma, ou ligar as notificações do próprio Asaas (`notificationDisabled: false` em `gateway.ts:51`).
4. ~~**Cadastro de webhook por script.**~~ Feito: `pnpm --filter @annetec/api asaas:setup` (seção 3, passo 7).
5. **Rota de estorno.** Expor `refundCharge` com auditoria, para não depender do painel do Asaas.
6. **Alerta de webhook parado.** Monitorar a última entrega com origem `webhook` e avisar se passar de X horas sem nada com cobranças abertas.
7. ~~**Relatório de repasse por inquilino.**~~ Não se aplica mais: cada clube recebe na própria conta Asaas (seção 5).
8. **Subconta criada pela ANNETEC ou split.** Ver "Próximos passos" da seção 5.
9. **Validar o token com 32+ caracteres no `env.ts`.** Hoje aceita 1 (`env.ts:66`); o `.env.example` documenta 32–255.
10. **WhatsApp.** Canal de lembrete e cobrança, depois do item 3.
