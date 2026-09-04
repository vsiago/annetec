# Mapeamento da API Digital Saúde → API Annetec

Fonte: `https://digitalsaude.com.br/api/digitalsaude_2.0.0.yaml` (Swagger 2.0, `basePath /api/v2/`).
Levantamento feito em 27/08/2026 sobre a especificação publicada, com verificação de
disponibilidade do host (`GET /api/v2/convenio/` responde `401 - Acesso Não Autorizado`
sem credenciais, como esperado).

## Como a integração autentica

Dois headers, definidos em `securityDefinitions`:

| Header | Significado |
| --- | --- |
| `token` | identificador da aplicação (appId) |
| `senhaApi` | senha da API |

**Não são o login do portal web.** As credenciais do portal (`digitalsaude.com.br/login`)
servem para obter o par `token`/`senhaApi` dentro do painel; o portal em si é um sistema
JSF protegido por reCAPTCHA Enterprise e não pode ser automatizado.

Cada administradora (inquilino) tem seu próprio par. Por isso as credenciais ficam na
tabela `tenant_integrations`, cifradas em AES-256-GCM, e o cliente HTTP é resolvido por
inquilino em `apps/api/src/integrations/digitalsaude/provider.ts`.

## Comportamentos do upstream que moldaram o código

1. **Toda resposta de sucesso é um array**, inclusive a busca por chave única —
   `/contrato/{codigoContrato}` devolve um array de um elemento. O cliente expõe
   `one()` para esses casos.
2. **Corpo em ISO-8859-1** nas respostas de erro. Decodificar como UTF-8 corrompe acentos,
   então o charset é lido do `content-type`.
3. **Status são texto livre** em `{ id, nome }`, sem tabela documentada. Os mappers
   normalizam por palavra-chave e preservam o original em `upstreamStatus`.
4. **Sem idempotência em POST.** Retry automático só em `GET`.
5. **Grafias do upstream mantidas**: `estatoCivil` (sic) no beneficiário e
   `Lancamento.statusFatura` (que na verdade carrega `TipoLancamento`).
6. **`/recibo/procurarPorEmitido|Pago` exigem login e senha do produtor em query string.**
   Essas rotas nunca são expostas ao cliente: as credenciais ficam cifradas no perfil do
   vendedor e só são decifradas dentro do serviço de comissões.

## Cobertura: 33 operações, 100% mapeadas

Todas estão declaradas em `packages/contracts/src/digitalsaude/endpoints.ts`, com schema
de entrada e de saída. A coluna "Uso na Annetec" indica se o endpoint é reaproveitado
como está (**reutilizável**), embrulhado em regra de negócio própria (**adaptável**) ou
apenas disponível para uso futuro (**disponível**).

### contrato

| Upstream | Rota Annetec | Uso |
| --- | --- | --- |
| `GET /contrato/procurarPorClientePortal` | `POST /api/v1/auth/login/portal` | **adaptável** — é a validação do primeiro acesso do associado; provisiona o usuário local |
| `GET /contrato/procurarPorCpfTitular` | `GET /t/:slug/contratos/busca/cpf` | **adaptável** — restrito a admin (o Swagger marca como rota de URA) |
| `GET /contrato/{codigoContrato}` | `GET /t/:slug/contratos/:codigo` | **adaptável** — resposta espelhada em `contracts` |
| `POST /contrato/` | `POST /t/:slug/contratos` | **adaptável** — adesão; a API completa `grupo`/`filial`/`convenio` a partir da configuração do inquilino |
| `GET /contrato/retornarContratoParaProduzido` | `POST /t/:slug/contratos/:codigo/produzido` | **reutilizável** |
| `GET /contrato/enviarCarteiraPorContrato` | `POST /t/:slug/contratos/:codigo/carteirinha/email` | **reutilizável** |

### fatura / demonstrativo / recibo

| Upstream | Rota Annetec | Uso |
| --- | --- | --- |
| `GET /fatura/procurarPorContrato` | `GET /t/:slug/financeiro/faturas` | **adaptável** — o upstream exige `idStatusFatura` e não documenta a tabela; a API varre os ids conhecidos e filtra pelo status normalizado |
| `GET /fatura/{codigoFatura}` | `GET /t/:slug/financeiro/faturas/:codigo` | **reutilizável** |
| `GET /fatura/procurarPorVencida` | `GET /t/:slug/financeiro/faturas/vencidas` | **adaptável** — visão de cobrança, só admin |
| `GET /fatura/enviarFaturaVencidaPorContrato` | `POST /t/:slug/financeiro/faturas/enviar-vencidas` | **reutilizável** |
| `GET /demonstrativoPagamento/procurarPorContrato` | `GET /t/:slug/financeiro/demonstrativos` | **reutilizável** |
| `GET /demonstrativoPagamento/{codigo}` | `GET /t/:slug/financeiro/demonstrativos/:codigo` | **reutilizável** |
| `GET /recibo/procurarPorEmitido` | `GET /t/:slug/financeiro/comissoes?status=emitido` | **adaptável** — credenciais do produtor resolvidas no servidor |
| `GET /recibo/procurarPorPago` | `GET /t/:slug/financeiro/comissoes?status=pago` | **adaptável** — idem |
| `GET /recibo/{codigoRecibo}` | `GET /t/:slug/financeiro/comissoes/:codigo` | **reutilizável** |

### catálogo (convênio, plano, carência, tabela, cálculo)

| Upstream | Rota Annetec | Uso |
| --- | --- | --- |
| `GET /convenio/` | `GET /t/:slug/catalogo/convenios` | **reutilizável** — com cache de 60 min |
| `GET /convenio/{codigoConvenio}` | `GET /t/:slug/catalogo/convenios/:codigo` | **reutilizável** |
| `GET /plano/procurarPorProduto` | `GET /t/:slug/catalogo/planos` | **reutilizável** — com cache |
| `GET /plano/{codigoPlano}` | `GET /t/:slug/catalogo/planos/:codigo` | **reutilizável** |
| `GET /carencia/procurarPorConvenio` | `GET /t/:slug/catalogo/carencias` | **reutilizável** — com cache |
| `GET /carencia/{codigoCarencia}` | — | **disponível** (coberto pela listagem por convênio) |
| `GET /tabela/procurarPorConvenio` | `GET /t/:slug/catalogo/tabelas` | **reutilizável** — com cache |
| `GET /tabela/{codigoTabela}` | `GET /t/:slug/catalogo/tabelas/:codigo` | **reutilizável** |
| `POST /calculo/` | `POST /t/:slug/catalogo/cotacao` | **adaptável** — nunca cacheado; preço velho é preço errado |

### produtor (vendedores)

| Upstream | Rota Annetec | Uso |
| --- | --- | --- |
| `GET /produtor/{codigoProdutor}` | usado por `PUT /t/:slug/usuarios/:id/produtor` | **adaptável** — confere o código antes de vincular |
| `POST /produtor/` | `POST /t/:slug/usuarios/:id/produtor` | **adaptável** — cria no ERP e vincula ao vendedor Annetec |
| `GET /produtor/procurarPorNumeroDocumento` | — | **disponível** |
| `GET /produtor/procurarPorLogin` | — | **disponível** |

### documentos, saúde e atendimento

| Upstream | Rota Annetec | Uso |
| --- | --- | --- |
| `POST /anexo/` | `POST /t/:slug/contratos/anexos` | **reutilizável** — exige URL pública do arquivo |
| `POST /patologia/` | `POST /t/:slug/contratos/patologias` | **reutilizável** — declaração de saúde / CPT |
| `POST /pendencia/` | `POST /t/:slug/contratos/pendencias` | **reutilizável** |
| `GET /atendimento/procurarPorContrato` | — | **disponível** — entra quando o módulo de suporte usar o ERP |
| `GET /atendimento/{protocolo}` | — | **disponível** |
| `POST /notificacao/` | — | **disponível** — depende de mapear `Usuario.codigo` do ERP |

## Apuração contra o ambiente de produção (04/09/2026)

Tudo acima foi levantado a partir do **Swagger publicado**. Rodando as sondas
(`apps/api/scripts/probe-digitalsaude.ts`, `diag-schema-drift.ts`,
`diag-tabela-preco.ts`, `diag-calculo.ts`) contra o servidor real com o token da
Annetec, o Swagger se mostrou defasado em pontos que quebravam funcionalidade.

### O Swagger está desatualizado: 64 campos não documentados

O servidor devolve 64 campos a mais do que os `definitions` declaram. Como o Zod
descartava chave desconhecida em silêncio — inclusive dentro de `contracts.raw`,
que guarda a saída já validada — esses campos sumiam sem erro. Agora todo modelo
usa `.passthrough()` e os relevantes estão declarados. Os que mais importam:

| Entidade | Campo | Por que importa |
| --- | --- | --- |
| `tabela` | `tabelaPrecoApiList` | **Onde os preços realmente estão.** `tabelaPrecoList` (a documentada) vem sempre vazia — a Annetec exibia tabela de preço sem nenhuma faixa |
| `tabela` | `grupoApi` | Único lugar da API que revela o código do grupo; `grupo` vem ausente |
| `beneficiario` | `estadoCivil` | O Swagger diz `estatoCivil` (sic) e o servidor manda `estadoCivil` — o campo chegava sempre nulo |
| `plano` | `registroAns`, `abrangencia`, `statusPlanoApi` | Registro ANS é obrigatório em material de venda; `statusPlanoApi` diz se o plano pode ser vendido |
| `contrato` | `corretora`, `supervisor`, `gerente`, `angariador` | A cadeia comercial inteira, que define o rateio da comissão |
| `contrato` | `pendenciaList`, `matricula`, `dataExclusao` | Pendência era só escrita (`POST /pendencia/`); dá para ler |
| `produtor` | `grupoProdutor`, `login`, `filial`, `chavePix` | `grupoProdutor` é obrigatório em `POST /produtor/` e era digitado à mão |
| `convenio` | `estipulante`, `dataProximoReajuste`, `diaVigencia` | Contratante do coletivo e a data do próximo reajuste |
| `fatura` | `pixList`, `dataVencimentoCobranca` | Meio de pagamento do associado |

### "Não achei nada" é 400, não lista vazia

`GET /atendimento/procurarPorContrato` e `GET /produtor/procurarPorLogin`
devolvem `400` com texto (`"Nenhum atendimento foi localizado"`) quando não há
resultado. O cliente traduzia isso em erro e derrubava a tela; agora reconhece o
padrão e devolve lista vazia (ou `null` em busca por chave). `400` de verdade
continua sendo erro.

### O 401 é por operação, não por credencial

`POST /calculo/` responde **401 para qualquer payload** com o mesmo token que lê
todo o catálogo — confirmado testando sete formatos de corpo diferentes contra
um controle `GET /convenio/` que devolveu 200. **A cotação está bloqueada até a
Digital Saúde liberar o endpoint para este token.** `tenant_integrations.capabilities`
guarda o resultado dessa apuração para a interface avisar antes de o vendedor
tentar cotar.

### Existe limite de chamadas por token

`"Ultrapassado Rate Limit para o TOKEN <token>"`. Apanhado hidratando as 287
faturas vencidas da carteira: `/fatura/procurarPorVencida` devolve só os códigos
e cada um exige um `GET /fatura/{codigo}`. A lista voltava furada. Correções:
a rota de vencidas passou a ser paginada, a concorrência caiu de 10 para 4 e o
cliente reconhece o limite (`UPSTREAM_RATE_LIMITED`, com espera antes de repetir).

### Grupo, filial e grupo de produtor são descobríveis

Não existe `GET /grupo/`, `GET /filial/` nem `GET /grupoProdutor/`, e por isso
esses códigos eram copiados do portal na mão. Mas eles aparecem dentro de outras
respostas, e `GET /platform/tenants/:id/integration/discovery` percorre a trilha:

```
convenioListar          → convênios, produtos, filiais (filialList), estipulantes
tabelaPorConvenio       → grupos (grupoApi)            ... 27 encontrados
faturaVencidas → faturaPorCodigo → CPF do titular
                → contratoPorCpfTitular → produtor.codigo
                → produtorPorCodigo → grupoProdutor
```

### Não há carga inicial da carteira — mas há uma trilha

Nenhum endpoint lista contratos. A única listagem sem chave é
`/fatura/procurarPorVencida`, e ela abre caminho até os contratos pelo CPF do
titular (por isso `Invoice.beneficiaryCpf` passou a ser exposto). Cobre apenas
quem tem fatura vencida — o resto da carteira só entra quando o associado faz o
primeiro acesso ou alguém busca por CPF.

### Tabelas de status observadas

| Tabela | Valores confirmados em produção |
| --- | --- |
| `idStatusFatura` | `4 = Vencida` (1, 2, 3 existem mas não retornaram na amostra) |
| `statusContrato` | `3 = Suspenso` |

Continua sem documentação oficial; o `KNOWN_UPSTREAM_INVOICE_STATUS_IDS = [1,2,3,4]`
segue como varredura.

### O que só existe no portal, nunca na API

O portal operacional tem módulos que a API v2 não expõe de forma alguma —
visíveis no menu: **Grade de Comissões**, **Declaração de Saúde**, **Grupos**,
Propostas Web/PME, Movimentação, Migração de Dados, Relatórios, Integração. O
cadastro de convênio do portal tem dezenas de campos sem contrapartida na API
(regras de multa e juros, dia de corte/faturamento/vencimento, remessa bancária,
faixas de estorno de comissão). Esses endpoints internos autenticam por
`JSESSIONID` — sessão de navegador criada por login com reCAPTCHA Enterprise;
`token`/`senhaApi` não valem nada neles. Servem para levantamento manual, não
como caminho de integração.

## O que a Digital Saúde **não** cobre

Estas áreas são regra de negócio nova, com o Postgres da Annetec como fonte da verdade:

- **Multi-inquilino** — inquilinos, marca, planos de assinatura, configuração da integração;
- **Identidade e papéis** — admin/vendedor/cliente por inquilino, sessões, refresh tokens;
- **CRM** — leads, interações, funil, vendas, metas e comissão interna;
- **Rede credenciada e clube de benefícios** — parceiros e benefícios;
- **Auditoria** — trilha de quem fez o quê;
- **Cache do catálogo** — reduz a carga sobre o ERP.

## Redundâncias eliminadas

O que existia em `apps/web/lib/actions/*` e `apps/web/lib/mock-seed.ts` como
implementação própria em `localStorage` passa a ter uma única fonte:

| Mock atual | Substituto |
| --- | --- |
| `lib/actions/tenants.ts` | `GET/POST/PATCH /api/v1/platform/tenants` |
| `lib/actions/tenant-users.ts`, `platform-users.ts` | `/api/v1/t/:slug/usuarios` |
| `lib/actions/client-plans.ts`, `tenant-plans.ts` | `/api/v1/t/:slug/catalogo/*` (ERP) e `tenant_plans` (assinatura) |
| `lib/actions/leads.ts`, `sales.ts` | `/api/v1/t/:slug/crm/*` |
| `lib/actions/partners.ts`, `benefits.ts` | `/api/v1/t/:slug/rede/*` |
| `lib/actions/appointments.ts` | `/atendimento/` do ERP + tabela `appointments` |
| `lib/storage/local-collection.ts` | Postgres via Drizzle |
