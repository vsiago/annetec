# Rede Comercial — especificação do módulo `vendas-rede`

Documento-fonte para a implementação. Vale para o escopo **plataforma** (ANNETEC vende planos da plataforma a clubes/operadoras) e para o escopo **inquilino** (clube vende planos de associado a pessoas). A UX é inspirada no sistema de vendas do projeto Varredura (`../varredura`, referência apenas), **sem nenhuma parte de IA e sem WhatsApp não oficial**.

Convenções do repositório que continuam valendo: Hono + Drizzle + Zod + envelope `ok/created/paginate`, `AppError`, `recordAudit`, Server Actions no Next (`lib/actions/*-api.ts` → `apiFetch`), kit visual `components/admin-platform/ui/*` no console e nas áreas logadas, `recharts` para gráficos, textos em pt-BR, arquivos kebab-case, testes vitest só na API (`apps/api/tests`). Nada aqui usa IA.

---

## 1. Conceitos

| Termo | Significado |
|---|---|
| **Escopo** | `platform` (tenant_id = null) ou `tenant` (tenant_id = organization.id). Toda tabela nova carrega `scope` + `tenant_id`. |
| **Agente** | Pessoa da força de vendas (linha em `vendas_agentes`). Papel comercial em `papel`. |
| **Papéis comerciais** | `master`, `gerente`, `supervisor`, `vendedor`, `balcao`. |
| **Master implícito** | Equipe ANNETEC (`superadmin`/`platform_admin`) no escopo platform; `admin` do clube no escopo tenant. Não precisa de linha em `vendas_agentes`; se existir, prevalece a linha. |
| **Corretora** | Empresa parceira com CNPJ, cadastrada pelo master. Tem **um gerente** (agente `gerente` com cadastro completo), N **unidades** e N **equipes**. |
| **Unidade** | Local físico: unidade da corretora **ou** unidade própria do escopo (clínica, ambulatório, hospital, loja) sem corretora. É onde o `balcao` atende. |
| **Equipe** | Grupo de vendedores sob **um supervisor**. Pertence a uma corretora e/ou unidade (ambos opcionais). |
| **Solo** | Vendedor sem equipe e sem corretora (`equipe_id` e `corretora_id` nulos). Reporta ao master. Recebe 100 % da comissão de vendedor; não gera overrides. |
| **Pool** | Leads com `agente_id = null`. Chegam do site/público e ficam visíveis a todo agente **online** do escopo (exceto `balcao`), que pode **reivindicar** (claim atômico). |
| **Papel de autenticação** | **Não muda.** Platform: todos os agentes têm `user.role = 'platform_seller'` (master implícito = equipe). Tenant: todos os agentes são `member.role = 'seller'` (master implícito = `admin`). A experiência é decidida por `vendas_agentes.papel`. |

### 1.1 Hierarquia e visibilidade

```
Escopo (master)
├── Solo: vendedor, vendedor, …
├── Unidade própria (clínica) ── balcão, balcão
└── Corretora (gerente)
    ├── Unidade A
    │   ├── Equipe 1 (supervisor) ── vendedor, vendedor
    │   └── Equipe 2 (supervisor) ── vendedor
    └── Unidade B
        └── Equipe 3 (supervisor) ── vendedor
```

`visibleAgentIds(ctx)`:
- `master` (explícito ou implícito): todos os agentes do escopo.
- `gerente`: todos os agentes com `corretora_id` = a sua (inclui supervisores, vendedores e balcões das unidades da corretora) + ele mesmo.
- `supervisor`: agentes com `equipe_id` em equipes que ele supervisiona + ele mesmo.
- `vendedor` e `balcao`: só ele mesmo.

Lead visível = `agente_id ∈ visibleAgentIds` **ou** (`agente_id` nulo **e** papel ≠ `balcao`). Lead editável = visível **e** (dono, ou papel acima do dono na cadeia, ou master). Reatribuir: master para qualquer agente; gerente só dentro da corretora; supervisor só dentro da equipe.

Isolamento entre escopos e entre inquilinos é obrigatório (mesma política anti-IDOR de `requireTenantRole`): todo serviço recebe `ctx.scope`/`ctx.tenantId` e filtra por eles.

---

## 2. Banco de dados (Drizzle, `apps/api/src/db/schema/vendas-rede.ts`, migração `0018_vendas_rede.sql`)

Nomes em português, prefixo `vendas_`. Todos com `created_at`/`updated_at` timestamptz default now. `scope text not null check in ('platform','tenant')`, `tenant_id text null references organization(id) on delete cascade`.

### `vendas_config` (uma por escopo; criada sob demanda com defaults)
- `id uuid pk`, `scope`, `tenant_id`, **unique** `(scope, coalesce(tenant_id,''))`
- `escala_mensal jsonb` default `[100,50,25]` — % da mensalidade paga que vira comissão do vendedor na 1ª, 2ª, 3ª parcela (lista de 1..12 inteiros 0..100).
- `percentual_adesao numeric(5,2)` default `50` no platform, `0` no tenant — % da taxa de adesão paga.
- `overrides jsonb` default `{"supervisor":10,"gerente":5,"corretora":5}` — % **sobre a comissão do vendedor** da mesma parcela, pagos a quem existir na cadeia.
- `balcao_percentual jsonb` null — se presente, escala própria do balcão (senão usa `escala_mensal`).
- `distribuicao text` default `'pool'` (`'pool'` | `'automatica'`). Automática = `escolherAgenteAutomatico` (menor carga 7 dias entre agentes **online** com papel vendedor/supervisor); sem ninguém online → fica no pool.
- `pool_retorno_horas int` default `48` — lead reivindicado sem nenhum evento de contato nesse prazo volta ao pool (aplicado de forma preguiçosa ao listar pool/funil).
- `presenca_minutos int` default `3` — janela para "online".
- `balcao_desconto_padrao int` default `30` — % de desconto mostrado no simulador do balcão quando o plano não define o seu.
- `meta_mensal_padrao int` default `10` (fechamentos/mês).
- `modelos_mensagem jsonb` default lista de modelos `{id, titulo, canal:'whatsapp'|'email', texto}` com placeholders `{{nome}}`, `{{plano}}`, `{{vendedor}}`, `{{link}}`.
- `updated_by_user_id text null`.

### `vendas_corretoras`
- `id`, `scope`, `tenant_id`, `nome_fantasia`, `razao_social`, `cnpj text` (14 dígitos; **unique** `(scope, coalesce(tenant_id,''), cnpj)`), `email`, `telefone`, `endereco jsonb {cep,logradouro,numero,complemento,bairro,cidade,uf}`, `gerente_agente_id uuid null` (FK → `vendas_agentes.id` set null; criada em ALTER depois da tabela de agentes), `status text` `'ativa'|'inativa'`, `comissao_overrides jsonb null` (sobrescreve `vendas_config.overrides` para a corretora), `observacoes`, `created_by_user_id`.

### `vendas_unidades`
- `id`, `scope`, `tenant_id`, `corretora_id uuid null` (FK cascade), `nome`, `tipo text` `'corretora'|'clinica'|'ambulatorio'|'hospital'|'loja'|'outro'`, `endereco jsonb`, `telefone`, `responsavel_agente_id uuid null`, `status 'ativa'|'inativa'`.

### `vendas_equipes`
- `id`, `scope`, `tenant_id`, `corretora_id null`, `unidade_id null`, `nome`, `supervisor_agente_id uuid null` (FK set null), `status`.

### `vendas_agentes`
- `id uuid pk`, `scope`, `tenant_id`, `user_id text` (FK `user.id` cascade), **unique** `(user_id, scope, coalesce(tenant_id,''))`.
- `papel text` (`master|gerente|supervisor|vendedor|balcao`), `corretora_id null`, `unidade_id null`, `equipe_id null`.
- `codigo_indicacao text unique` (6–8 chars maiúsculos sem ambíguos; o gerador fica em `rules.ts`).
- `ativo boolean` default true, `meta_mensal int null`.
- Cadastro completo: `nome`, `cpf text` (11 dígitos), `telefone` (dígitos com DDD), `data_nascimento date null`, `endereco jsonb null`, `repasse jsonb null` `{tipo:'pix'|'conta', chavePix?, banco?, agencia?, conta?, titular?, documento?}`, `observacoes`.
- `ultima_presenca_em timestamptz null`, `criado_por_user_id`.
- Índices: `(scope, tenant_id, papel)`, `(equipe_id)`, `(corretora_id)`, `(unidade_id)`, `(ultima_presenca_em)`.

### `vendas_leads`
- `id`, `scope`, `tenant_id`, `tipo text` `'pessoa'|'empresa'` (platform = empresa; tenant = pessoa, mas `empresa` também é válido no tenant para o formulário "Empresas" da vitrine).
- `nome`, `documento text null` (CPF ou CNPJ só dígitos), `email`, `telefone` (dígitos com DDD), `cidade`, `uf`.
- `origem text` `'site'|'indicacao'|'balcao'|'prospeccao'|'evento'|'redes_sociais'|'importacao'|'link'|'outro'`, `origem_detalhe text null` (ex.: `cadastro`, `empresas`, `contato`, `entidades`, nome do evento).
- `etapa text` `'novo'|'em_contato'|'proposta'|'negociacao'|'ganho'|'perdido'`.
- `agente_id uuid null` (FK set null; **null = pool**), `reivindicado_em`, `pool_desde timestamptz null`.
- `proximo_passo text null`, `proximo_passo_em timestamptz null`, `ultimo_contato_em timestamptz null`.
- `interesse_plano_id text null` (id de `club_plans` ou `tenant_plans`), `valor_estimado numeric(12,2) null`, `vidas_estimadas int null`.
- `atribuicao jsonb null` — **snapshot da cadeia no momento da conversão** `{agenteId, papel, equipeId, supervisorAgenteId, unidadeId, corretoraId, gerenteAgenteId}`; é a base da comissão (não se recalcula se a pessoa mudar de equipe depois).
- `conversao jsonb null` `{tipo:'proposta'|'assinatura', id, status, atualizadoEm}`.
- `ganho_em`, `perdido_em`, `motivo_perda text null`, `observacoes`, `dados jsonb` default `{}` (cargo, site, cnpj da empresa no tenant, utm…), `legado jsonb null` `{tabela, id}`.
- `created_by_user_id`.
- Índices: `(scope, tenant_id, etapa)`, `(agente_id, etapa)`, parcial `(scope, tenant_id) where agente_id is null`, `(documento)`, `(telefone)`, `(proximo_passo_em)`.

### `vendas_lead_eventos` (linha do tempo)
- `id`, `lead_id` (FK cascade), `tipo text` `'criado'|'reivindicado'|'atribuido'|'devolvido_pool'|'etapa'|'ligacao'|'whatsapp'|'email'|'reuniao'|'visita'|'nota'|'atendimento_balcao'|'proximo_passo'|'conversao'|'sistema'`, `texto`, `dados jsonb null`, `por_user_id null`, `por_agente_id null`, `em timestamptz` default now. Índice `(lead_id, em)`.
- Eventos de contato (`ligacao|whatsapp|email|reuniao|visita|atendimento_balcao`) atualizam `vendas_leads.ultimo_contato_em`.

### `vendas_comissoes`
- `id`, `scope`, `tenant_id`, `lead_id null`, `beneficiario_agente_id uuid null`, `beneficiario_corretora_id uuid null`, `parte text` `'vendedor'|'supervisor'|'gerente'|'corretora'`, `tipo text` `'mensalidade'|'adesao'`, `parcela int` (1..n), `cobranca_origem text` `'platform'|'club'`, `cobranca_ref text` (id de `platform_charges` ou `club_charges`), `base numeric(12,2)`, `percentual numeric(6,2)`, `valor numeric(12,2)`, `status text` `'prevista'|'a_pagar'|'paga'|'cancelada'|'a_descontar'`, `mes_referencia text` `YYYY-MM`, `pago_em`, `pago_por_user_id`, `pagamento_ref text null`, `observacao text null`.
- **unique** `(cobranca_origem, cobranca_ref, tipo, parte, coalesce(beneficiario_agente_id::text, beneficiario_corretora_id::text, ''))` — idempotência por fatura+parte+beneficiário.
- Índices: `(scope, tenant_id, status)`, `(beneficiario_agente_id, mes_referencia)`.

### `vendas_atendimentos_balcao`
- `id`, `tenant_id` (not null), `agente_id`, `unidade_id null`, `lead_id null`, `nome`, `documento null`, `telefone null`, `servico text` (ex.: "Consulta cardiologia"), `valor_tabela numeric(12,2)`, `desconto_percentual int`, `valor_com_plano numeric(12,2)`, `plano_id text null`, `resultado text` `'assinou'|'vai_pensar'|'recusou'|'ja_associado'|'so_informacao'`, `observacoes`, `assinatura_id text null` (club_subscriptions.id), `created_at`. Índice `(tenant_id, agente_id, created_at)`.

### Alterações em tabelas existentes
- `club_subscriptions`: `vendas_agente_id uuid null`, `vendas_lead_id uuid null` (atribuição da venda do associado).
- `platform_onboarding_proposals`: `vendas_agente_id uuid null`, `vendas_lead_id uuid null` (verificar se já existe campo de vendedor; manter o antigo preenchido para compatibilidade).
- `club_plans`: `balcao_desconto_percentual int null` (desconto médio nos atendimentos que o plano dá; usado no simulador).
- `notifications`: aceitar `audience = 'sales'` com `tenant_id` nulo (platform) ou preenchido (tenant) e `recipient_user_id` obrigatório. Verificar enum/constraint em `db/schema/notifications.ts`.

### Migração de dados (no mesmo `0018`)
1. `platform_sales_settings` → `vendas_config` scope platform com `escala_mensal=[100,50,25]`, `percentual_adesao=50` (a regra nova substitui a antiga 50/20/10).
2. `platform_sellers` → `vendas_agentes` (scope platform, papel `vendedor`, solo, `codigo_indicacao` preservado, `ativo`, `meta_mensal`, `nome` do `user`).
3. `platform_prospects` → `vendas_leads` (tipo `empresa`, mapa de etapa: `novo→novo`, `em_contato→em_contato`, `proposta_enviada→proposta`, `em_contratacao|em_aprovacao→negociacao`, `ganho→ganho`, `perdido→perdido`; `agente_id` = agente do `seller_user_id`; `conversao` a partir de `proposal_id`; `legado={tabela:'platform_prospects',id}`). `platform_prospect_interactions` → `vendas_lead_eventos`.
4. `seller_profiles` (vínculo `member.role='seller'`) → `vendas_agentes` (scope tenant, papel `vendedor`, solo, código gerado, `meta_mensal = sales_goal` se existir).
5. `leads` (CRM do clube) → `vendas_leads` tipo `pessoa` (`new→novo`, `contacted|qualified→em_contato`, `proposal→proposta`, `negotiation→negociacao`, `closed→ganho`, `lost→perdido`; `agente_id` = agente de `seller_id`; `origem='site'` quando `source` começa com "Site", senão `outro` com `origem_detalhe=source`). `lead_interactions` → eventos.
6. `platform_sales_commissions` → `vendas_comissoes` (parte `vendedor`, `cobranca_origem='platform'`, beneficiário = agente do `seller_user_id`, mesmos status/valores).

As tabelas antigas **não são apagadas** nesta versão.

---

## 3. Regras puras (`apps/api/src/modules/vendas-rede/rules.ts`, 100 % testadas em `tests/vendas-rede-rules.test.ts`)

- `gerarCodigoIndicacao(rand)` — 7 chars de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
- `estaOnline(ultimaPresencaEm, agora, minutos)`.
- `visibilidade(ctx)` → `{ todos: boolean; corretoraId?; equipeIds?: string[]; agenteId }` (sem banco; os serviços traduzem em `where`).
- `podeVerLead(ctx, lead)`, `podeEditarLead(ctx, lead, cadeiaDoDono)`, `podeReatribuir(ctx, deAgente, paraAgente)`.
- `transicaoPermitida(de, para)`: `novo→em_contato|perdido`, `em_contato→proposta|negociacao|perdido|novo`, `proposta→negociacao|ganho|perdido|em_contato`, `negociacao→ganho|perdido|proposta`, `perdido→novo` (reabrir), `ganho` é final (só master reabre).
- `escolherAgenteAutomatico(lead, candidatos[{id, online, cargaSemana, ramos?/ufs? opcional}])` — copia da Varredura: só online; menor carga nos últimos 7 dias; desempate por id; vazio → null (pool).
- `deveVoltarAoPool(lead, config, agora)` — `agente_id` presente, `etapa='novo'`, `reivindicado_em + pool_retorno_horas < agora`, `ultimo_contato_em` nulo ou anterior a `reivindicado_em`.
- `cadeiaDoAgente(agente, equipe?, corretora?)` → `Atribuicao` (snapshot).
- `comissoesDaCobranca({ config, overridesCorretora?, atribuicao, cobranca:{ id, origem, tipo:'mensalidade'|'adesao', parcela, valorPago }, agora })` → lista de `{parte, beneficiarioAgenteId|beneficiarioCorretoraId, percentual, base, valor, mesReferencia}`:
  - vendedor: `tipo='mensalidade'` → `escala_mensal[parcela-1]` (parcela além da escala → 0, não gera); `tipo='adesao'` → `percentual_adesao`. Balcão usa `balcao_percentual` se houver.
  - overrides: `supervisor`, `gerente`, `corretora` = `overrides.x % × valor do vendedor`, só para quem existe no snapshot; solo → nada. Nunca gera linha de valor 0.
  - Arredondar para centavos (`Math.round(x*100)/100`). `mesReferencia` = mês de `agora` em America/Sao_Paulo.
  - Comissão incide só sobre o valor pago, nunca sobre multa/juros; fatura avulsa (`adjustment`) não comissiona (mesma regra do `platform-sales/rules.ts`, reaproveitar funções quando possível).
- `estornarComissao(status)` → `prevista|a_pagar → cancelada`, `paga → a_descontar`.
- `simularEconomiaBalcao({ valorTabela, descontoPercentual, precoMensal, adesao })` → `{ valorComPlano, economiaNaConsulta, economiaAnual12, consultasParaCompensar }`.
- `jornadaDoLead(lead, eventos)` → 6 passos `captado, atribuido, contato, oferta, negociacao, fechado` com estado `feito|agora|falta|pulado`.
- `proximoPassoDoLead(lead, agora)` → `{ quem:'voce'|'cliente'|'sistema', texto, atrasado }`.
- `numerosDaSemana(eventos, leads, agora)` → contatos, respostas (eventos de reunião/whatsapp recebidos… simplificado: eventos de contato), reuniões, vendas, com comparação com a semana anterior.
- `resumirFunil(leads)` → contagem por etapa, taxa de conversão, valor em negociação.
- `rankingDeAgentes(leads, comissoes, agentes)` → por fechamentos e valor.

---

## 4. API (`apps/api/src/modules/vendas-rede/`)

Arquivos: `context.ts` (resolve o contexto comercial), `rules.ts`, `rede.service.ts`, `leads.service.ts`, `comissoes.service.ts`, `painel.service.ts`, `balcao.service.ts`, `intake.service.ts` (entrada pública), `presenca.service.ts`, `config.service.ts`, `conversao.service.ts` (ponte com onboarding/checkout), `controllers/{rede,leads,comissoes,painel,balcao,config,public}.controller.ts`, `index.ts` (monta tudo). Registro em `apps/api/src/routes.ts`.

### 4.1 Contexto (`context.ts`)
Middleware `salesContext(scope)`:
- Platform: `requireAuth`; sessão `scope='platform'`. Equipe (`superadmin|platform_admin`) → master implícito. `platform_seller` → precisa de `vendas_agentes` ativo (scope platform) senão `403 VENDAS_SEM_PERFIL`. Agente inativo: leitura permitida, escrita 403.
- Tenant: `resolveTenant, requireAuth, requireTenantRole('admin','seller')` + regra de acesso da equipe da plataforma já existente. `admin` → master implícito. `seller` → agente ativo do tenant.
- `c.set('vendas', { scope, tenantId, userId, agente: Agente|null, papel, masterImplicito, visibilidade })`.
- Helper `requirePapel(...papeis)` e `requireEscrita`.

Montagem: `/api/v1/vendas/*` (platform) e `/api/v1/t/:tenantSlug/vendas/*` (tenant) com o **mesmo** conjunto de sub-rotas. Público: `/api/v1/public/vendas/*`.

### 4.2 Rotas (todas sob o prefixo do escopo)
Rede (`rede.controller.ts`)
- `GET /eu` — perfil do agente + papel + escopo + config pública (presença, modelos) + contadores (pool, minha vez).
- `POST /presenca` — heartbeat (atualiza `ultima_presenca_em`); `GET /presenca/online` — agentes online visíveis.
- `GET /rede/arvore` — corretoras → unidades → equipes → agentes (filtrado pela visibilidade).
- `GET|POST /rede/corretoras`, `GET|PATCH|DELETE /rede/corretoras/:id` (master). `POST /rede/corretoras/:id/gerente` cria o gerente (cadastro completo + usuário + convite).
- `GET|POST /rede/unidades`, `PATCH|DELETE /rede/unidades/:id` (master; gerente só da própria corretora).
- `GET|POST /rede/equipes`, `PATCH|DELETE /rede/equipes/:id` (master; gerente na corretora; supervisor não cria).
- `GET|POST /rede/agentes`, `GET|PATCH /rede/agentes/:id`, `POST /rede/agentes/:id/ativar|desativar`, `POST /rede/agentes/:id/reenviar-convite`. Quem cria quem: master → todos; gerente → supervisor/vendedor/balcao da sua corretora; supervisor → vendedor da sua equipe. Criação = cria `user` com papel de auth certo (platform: `platform_seller` via o padrão de `platform-users`/`invite.ts`; tenant: `member.role='seller'` via `modules/users`), gera senha provisória/convite por e-mail (reaproveitar `platform-sales/invite.ts` e a régua de e-mails), cria `vendas_agentes`.
- `GET /rede/agentes/:id/desempenho` — BI de um agente visível.

Leads (`leads.controller.ts`)
- `GET /leads?estacao=pool|novos|andamento|fechados&etapa=&agente=&busca=&page=` — respeita visibilidade; aplica `deveVoltarAoPool` antes de responder (devolve ao pool com evento `devolvido_pool`).
- `GET /leads/pool` — só leads sem dono (papel ≠ balcao); `POST /leads/:id/reivindicar` — `UPDATE … WHERE agente_id IS NULL` atômico; conflito → `409 VENDAS_LEAD_JA_REIVINDICADO`.
- `POST /leads` (manual; dono = quem cria, ou agente escolhido se master/gerente/supervisor), `GET /leads/:id` (lead + eventos + conversão + jornada + próximo passo), `PATCH /leads/:id`.
- `POST /leads/:id/etapa {etapa, motivoPerda?}` — valida transição; `ganho` manual só com conversão existente ou confirmação explícita (`confirmar:true`, registrado em evento).
- `POST /leads/:id/eventos {tipo, texto, dados?}` — contato/nota; atualiza `ultimo_contato_em`.
- `POST /leads/:id/proximo-passo {texto, em}`.
- `POST /leads/:id/reatribuir {agenteId|null}` (null = devolver ao pool).
- `GET /leads/:id/mensagem?modelo=` — texto do modelo com placeholders preenchidos + `linkWhatsapp` (`https://wa.me/55DDDNUMERO?text=…`).
- Conversão (`conversao.service.ts`):
  - platform: `POST /leads/:id/proposta` cria/gera link de contratação via `platform-sales/links.service.ts` com a atribuição do agente (`?ref=` do código do agente continua funcionando); `POST /leads/:id/desconto` delega a `platform-sales/discounts.service.ts`; `GET /leads/:id/proposta` estado. Sincronização: onde hoje `prospect-sync.ts` atualiza `platform_prospects`, passar a atualizar também `vendas_leads.conversao` + etapa (`em_contratacao|em_aprovacao→negociacao`, ativado → `ganho` com `ganho_em`).
  - tenant: `POST /leads/:id/link-adesao {planoId}` → URL pública de checkout do clube com `?ref=<codigo>&lead=<id>`; `POST /leads/:id/assinar` (balcão/vendedor presencial) cria a assinatura pelo mesmo serviço do checkout público (`club-billing/checkout.service.ts`) com `vendas_agente_id`/`vendas_lead_id` e devolve link/Pix/boleto conforme já existe.
- `GET /carteira` — leads `ganho` do agente/visíveis com estado da assinatura (tenant: `club_subscriptions` status, próximo vencimento; platform: status do clube/plano).

Comissões (`comissoes.controller.ts`)
- `GET /comissoes?mes=&status=&agente=` — vendedor vê as suas; supervisor/gerente veem as suas + da equipe/corretora; master tudo. Totais por status.
- `GET /comissoes/resumo?mes=` — prevista/a pagar/paga/a descontar por beneficiário.
- `POST /comissoes/pagar {ids[], pagamentoRef?, pagoEm?}` — master; `a_pagar → paga`.
- `POST /comissoes/:id/cancelar {motivo}` — master.
- Geração (`comissoes.service.ts`): `registrarComissoesDaCobrancaPaga({origem:'platform'|'club', cobranca, agora})` e `estornarComissoesDaCobranca(origem, cobrancaId, motivo, agora)`. Ligar:
  - platform: em `platform-billing/events.service.ts` (hoje chama `recordCommissionsForPaidCharge`/`reverseCommissionsForCharge` de `platform-sales/commissions.service.ts`) → trocar para o serviço novo (a atribuição vem de `platform_onboarding_proposals.vendas_agente_id/vendas_lead_id`, com fallback ao `seller_user_id` antigo → agente migrado). Atualizar os testes `platform-sales-commissions.test.ts` para o novo serviço ou movê-los.
  - club: em `club-billing/events.service.ts` no ponto em que a cobrança é marcada paga/estornada (assinatura com `vendas_agente_id`).
  - Primeira cobrança paga da conversão → lead `ganho` (`ganho_em`), evento `conversao`.

Painel/BI (`painel.controller.ts`)
- `GET /painel/hoje` — "Hoje": saudação, presença, contadores (pool, minha vez, em andamento), lista "Sua vez agora" (próximo passo vencido/novo sem contato), números da semana, funil resumido, meta do mês × realizado.
- `GET /painel/resultados?periodo=30d|mes|trimestre&agrupar=agente|equipe|unidade|corretora` — KPIs (leads, contatos, propostas, ganhos, taxa, valor, comissão prevista/a pagar/paga), série diária (leads × ganhos), funil por etapa, ranking (vendedor: só ele; supervisor: vendedores da equipe; gerente: equipes/unidades/supervisores; master: corretoras + solos + unidades), origem dos leads.

Balcão (`balcao.controller.ts`, só tenant; papel `balcao` ou master)
- `GET /balcao/hoje` — atendimentos do dia do agente, adesões, ofertas, ticket médio de economia.
- `GET /balcao/planos` — planos vendáveis (`club_plans` ativos) com `balcao_desconto_percentual` ou default.
- `POST /balcao/simular {valorTabela, planoId?}` → `simularEconomiaBalcao`.
- `GET /balcao/pessoa?documento=|telefone=` — procura associado existente (`club_subscriptions`/membros) e leads; devolve `{ jaAssociado, assinatura?, lead? }`.
- `POST /balcao/atendimentos` `{nome, documento?, telefone?, servico, valorTabela, planoId?, resultado, observacoes?}` → cria o atendimento; se `resultado='assinou'` cria assinatura (via `conversao.service`) e lead `ganho` origem `balcao`; se `vai_pensar` cria lead `em_contato` com dono = atendente e próximo passo em 2 dias; `recusou` cria lead `perdido`; `so_informacao`/`ja_associado` não cria lead.
- `GET /balcao/atendimentos?dia=` — histórico.

Config (`config.controller.ts`)
- `GET /config` (todos leem a parte pública), `PUT /config` (master): escala, adesão, overrides, distribuição, retorno ao pool, presença, desconto padrão, meta padrão, modelos de mensagem. Audit.

Público (`public.controller.ts`, sem auth, rate limit 10/h/IP + honeypot `website`)
- `POST /api/v1/public/vendas/leads` — escopo platform (site ANNETEC: `entidades`, `contratar` interesse). Body `{nome, email, telefone, documento?, empresa?, cidade?, uf?, origemDetalhe, mensagem?, website}`.
- `POST /api/v1/t/:tenantSlug/public/leads` — **já existe** (`modules/tenants/public-leads.ts`); passa a gravar em `vendas_leads` (tenant) no pool em vez de `leads`.
- Ambos: `intake.service.ts` → cria lead `novo` no pool (`pool_desde=now`), evento `criado`, aplica `distribuicao` (automática → tenta atribuir a quem está online), notifica (`audience='sales'`) todos os agentes online do escopo (papéis ≠ balcao) e o master, com `dedupe_key`.
- `GET /api/v1/public/vendas/ref/:codigo` → `{ nomeVendedor }` para a vitrine/checkout mostrarem "Atendido por".

Notificações: reaproveitar `lib/notifications.ts` com o novo público `sales`; SSE em `GET /vendas/notificacoes/stream` (platform) e `GET /t/:slug/vendas/notificacoes/stream`; no Next, route handlers `app/api/notificacoes/vendas/stream` (já existe para platform; criar `app/api/notificacoes/vendas-clube/[tenant]/stream`).

### 4.3 Sessão
Enriquecer `ResolvedMembership` (`modules/auth/membership.ts`, `customSession`) com `salesRole: papel | null` e `salesAgentId`, lendo `vendas_agentes` (um `select` indexado por `(user_id, scope, tenant_id)`). Expor em `/auth/session` para a web decidir o redirecionamento após login.

### 4.4 Erros
Adicionar em `packages/contracts/src/common/errors.ts`: `VENDAS_SEM_PERFIL`, `VENDAS_PERFIL_INATIVO`, `VENDAS_LEAD_JA_REIVINDICADO`, `VENDAS_TRANSICAO_INVALIDA`, `VENDAS_SEM_PERMISSAO_NA_REDE`, `VENDAS_CODIGO_INVALIDO`, `VENDAS_ATENDIMENTO_INVALIDO`.

### 4.5 Contratos (`packages/contracts/src/annetec/vendas-rede.ts`, reexportar em `annetec/index.ts`)
Enums + labels pt-BR (`PAPEL_COMERCIAL_LABELS`, `ETAPA_LEAD_LABELS`, `ORIGEM_LEAD_LABELS`, `TIPO_UNIDADE_LABELS`, `STATUS_COMISSAO_LABELS`, `RESULTADO_BALCAO_LABELS`), schemas Zod de todos os bodies/queries/respostas acima, tipos inferidos.

---

## 5. Front (Next, `apps/web`)

### 5.1 Rotas e cascas

| Área | Rota | Quem | Casca |
|---|---|---|---|
| Vendas da plataforma | `/vendas/*` (reescrita) | `platform_seller` (qualquer papel comercial) | **Casca comercial** (abaixo) |
| Vendas do clube | `/[tenant]/vendas/*` (nova) | `member.role='seller'` com papel ≠ balcao | Casca comercial com branding do clube |
| Balcão | `/[tenant]/balcao/*` (nova) | `seller` com papel `balcao` | **Casca balcão** |
| Console ANNETEC | `/admin/comercial/*` (reescrita) | equipe | layout do console existente |
| Painel do clube | `/[tenant]/admin/comercial/*` (nova) | `admin` do clube | layout do painel existente |

Redirecionamentos: `/[tenant]/vendedor/*` → `/[tenant]/vendas/*`; `/[tenant]/admin/{leads,vendas,vendedores,comissoes}` → `/[tenant]/admin/comercial/{funil,funil,rede,comissoes}`; `/admin/comercial` → `/admin/comercial/funil`. Pós-login (`lib/auth/redirect.ts`): `platform_seller` → `/vendas`; `seller` com `salesRole='balcao'` → `/[tenant]/balcao`, senão `/[tenant]/vendas`.

Actions: `lib/actions/vendas-rede-api.ts` com um parâmetro de escopo `{ kind:'platform' } | { kind:'tenant', slug }` que monta o prefixo. Um único conjunto de funções para as duas áreas.

### 5.2 Casca comercial (`components/vendas-rede/shell/*`)
Copiada da área do vendedor da Varredura: no desktop um **trilho fixo de ícones à esquerda** (expansível ao passar o mouse/Ctrl+B), sem topo pesado; no celular **topo h-14** (logo + avatar com iniciais + sino) e **barra inferior h-16** com as 5 entradas principais. Tema claro. Indicador de presença (bolinha verde "Online") no avatar; heartbeat `POST /presenca` a cada 60 s enquanto a aba está visível; SSE de notificações com toast "Novo lead no pool" com botão **Atender**.

Menu por papel (cada papel vê só o seu):
- **vendedor** (solo ou em equipe): Hoje · Funil · Carteira · Comissões · Meu link · Ajustes.
- **supervisor**: Hoje · Funil (da equipe, com filtro por vendedor) · Equipe · Resultados · Comissões · Ajustes.
- **gerente**: Hoje · Funil (da corretora) · Rede (unidades, equipes, supervisores, vendedores) · Resultados · Comissões · Ajustes.
- **master** (agente explícito): Hoje · Funil (tudo + pool) · Rede · Resultados · Comissões (aprovar/pagar) · Regras · Ajustes.

### 5.3 Telas da casca comercial (`app/vendas/*` e `app/[tenant]/vendas/*` compartilham componentes em `components/vendas-rede/*`)
- **Hoje** (`hoje.tsx`): saudação por hora + data por extenso + "N leads esperam você agora"; pílulas de estado (Online, Pool: N novos, Meta do mês x/y); card âmbar quando há leads no pool sem dono há > 15 min ou próximos passos atrasados; grade 12 col (lg sem rolagem): "Sua vez agora" (6) lista de `LinhaDaVez` com uma ação principal por linha (Atender / Ligar / Registrar / Enviar proposta); "Sua semana" (3) 4 números vs semana anterior; "Seu funil" (3) degraus Novos → Em contato → Proposta → Negociação → Ganhos. Supervisor/gerente/master veem os mesmos blocos no escopo da equipe/corretora/tudo, mais "Equipe online agora".
- **Funil** (`funil/page.tsx`): abas-estação com contadores **Pool · Novos · Em andamento · Fechados** (no celular pílulas roláveis presas no topo, FAB "+"). Cards, não tabela: avatar/iniciais, nome, origem com selo, cidade/UF, plano de interesse, trilha da jornada (6 bolinhas), próximo passo (âmbar se atrasado), dias na etapa, ação principal única (`Atender` no pool; `Registrar contato`; `Enviar proposta/link`; `Fechar`). Filtros: busca (nome, telefone, documento), origem, agente (papéis acima de vendedor), etapa. Detalhe em **Sheet** lateral (desktop) / folha de baixo (mobile): ficha, linha do tempo, modelos de mensagem com **Abrir no WhatsApp** (`wa.me`) e **Copiar**, registrar contato (ligação/whatsapp/e-mail/reunião/visita/nota), próximo passo com data, mudar etapa (com motivo de perda), reatribuir (quem pode), conversão (platform: proposta/link/desconto; tenant: link de adesão por plano / assinar agora). Toast com "Desfazer" para mudança de etapa e devolução ao pool.
- **Carteira**: lista de clientes ganhos com estado da assinatura em uma frase ("Ativa · vence em 12 dias", "Atrasada", "Cancelada"), chips de filtro com contagem, busca, totais no topo.
- **Equipe** (supervisor): cards dos vendedores com online/offline, leads em andamento, ganhos no mês, meta; ação "Convidar vendedor" (wizard com cadastro completo); reatribuir leads em lote.
- **Rede** (gerente/master): árvore Corretora → Unidades → Equipes → Agentes com cards expansíveis; wizards: **Nova corretora** (CNPJ com consulta `integrations/cnpj` como no onboarding, dados, endereço, e passo "Gerente" com cadastro completo + repasse), **Nova unidade**, **Nova equipe** (escolhe supervisor existente ou cria), **Novo agente** (papel, vínculo, cadastro completo, meta, repasse). Master vê também "Solos" e "Unidades próprias (balcão)".
- **Resultados** (BI): KPIs em `KpiCard`, gráfico de área leads × ganhos por dia (recharts), funil horizontal, ranking (tabela compacta), origem dos leads (barras), comissão do período. Seletor de período e de agrupamento conforme papel.
- **Comissões**: tabela por mês com status em `StatusPill`, totais, extrato por fatura (parcela, base, %, valor, parte); master: seleção em lote + "Marcar como pago" (referência) + cancelar.
- **Meu link**: código de indicação, link de contratação (platform) / link de adesão por plano (tenant), QR code (gerar com `qrcode`-like simples em SVG ou lib já presente), copiar.
- **Regras** (master): formulário da `vendas_config` com pré-visualização ("Numa mensalidade de R$ 100: vendedor 100/50/25; supervisor 10/5/2,50…").
- **Ajustes**: dados pessoais, repasse (Pix/conta), senha, tema.

### 5.4 Casca balcão (`app/[tenant]/balcao/*`, `components/vendas-rede/balcao/*`)
Experiência de atendimento rápido, otimizada para tablet/desktop do balcão e para celular:
- **Atender** (home): campo grande "CPF ou celular" → busca; se já associado, mostra "Já é associado · plano X" e encerra; senão formulário curto (nome, telefone) + **Simulador**: "Quanto custa a consulta hoje?" (valor) → cards dos planos com "Com o plano {nome}: R$ X (−30 %) · mensalidade R$ Y · economia de R$ Z já nesta consulta"; três ações: **Assinar agora** (abre resumo e gera Pix/boleto/cartão pelo checkout existente, mostra QR na tela), **Vai pensar** (cria lead com próximo passo em 2 dias e envia modelo por WhatsApp), **Não quis** (motivo curto). Tudo em uma coluna, botões grandes, uma ação principal por passo.
- **Hoje**: atendimentos, ofertas, adesões, economia média mostrada, lista do dia.
- **Histórico**: por dia, com filtro de resultado.
- **Ajustes**: unidade, dados pessoais, sair.
- Menu inferior no celular: Atender · Hoje · Histórico · Ajustes.

### 5.5 Consoles (`app/admin/comercial/*` e `app/[tenant]/admin/comercial/*`)
Mesmos componentes de Rede, Funil (com pool e reatribuição), Comissões (aprovar/pagar), Regras e Resultados, renderizados dentro do layout do console/painel existente (`PageContainer`, `PageHeader`, `SectionTabs`, `DataTable` onde fizer sentido). Itens de menu: console → grupo "Comercial" em `platform-sidebar.tsx` (Funil, Rede, Comissões, Resultados, Regras); clube → `admin-nav.ts` grupo "Comercial" (Funil, Rede, Balcão (atendimentos), Comissões, Resultados, Regras). Remover/redirecionar os itens antigos (Leads, Vendas, Vendedores, Comissões).

### 5.6 Vitrine e checkout
- Formulários públicos do clube (`components/site/lead-forms.tsx`) continuam; o backend grava no pool novo.
- Site ANNETEC: formulário de `/entidades` (e qualquer "quero ser parceiro/operadora") → `POST /public/vendas/leads` (platform). Formulário de pessoa (`/cadastro`) continua caindo no clube-plataforma (tenant kind=platform), que agora também é pool.
- Checkout do clube (`/[tenant]/assinar`): aceitar `?ref=` e `?lead=`; mostrar "Atendido por {nome}"; enviar ao backend para gravar `vendas_agente_id`/`vendas_lead_id`. `/contratar?ref=` já existe; apontar o lookup para `vendas_agentes.codigo_indicacao`.

### 5.7 Design
Regras da Varredura (`docs/DESIGN.md` de lá): 60/30/10, **uma ação principal por tela/card**, cards em vez de tabelas nas áreas operacionais, estados vazios que orientam ("Nenhum lead no pool agora. Quando alguém pedir contato no site, ele aparece aqui."), feedback em toda ação (toast, "Desfazer"), sem gamificação, mobile-first, área logada clara. Cores e tipografia do kit `admin-platform/ui` (tons em `tone.ts`); no clube, o branding do `tenant_profiles.branding` colore a casca.

---

## 6. Testes obrigatórios (`apps/api/tests/vendas-rede-*.test.ts`)
- `rules`: comissão (escala, adesão, overrides, solo, balcão, arredondamento, parcela fora da escala, estorno), transições, visibilidade, escolha automática, retorno ao pool, simulador, jornada, próximo passo.
- `authorization`: cada rota × papel (balcão não vê pool nem funil; vendedor não vê leads de outro; supervisor não vê outra equipe; gerente não vê outra corretora; tenant A não vê tenant B; `platform_seller` não acessa rotas de tenant; agente inativo não escreve).
- `pool`: claim atômico (duas tentativas, uma vence com 409), distribuição automática, retorno ao pool.
- `commissions`: geração idempotente por fatura, estorno antes/depois do pagamento, cadeia completa vs solo, platform e club.
- `intake`: lead público cai no pool, honeypot, rate limit, notificação para online.
- `balcao`: simulação, atendimento → lead/assinatura conforme resultado, isolamento por tenant.

---

## 7. Fora de escopo nesta versão
IA, WhatsApp automático (Baileys/API), vídeo, metas gamificadas, split no Asaas, exclusão das tabelas legadas.
