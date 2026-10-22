# Go-live: do sandbox para produção

Situação em 09/10/2026. A plataforma está pronta para **apresentação em sandbox**. Para **produção real** faltam 7 itens bloqueantes, quase todos de configuração de contas e infraestrutura, não de código.

## 1. Pronto para a apresentação?

Sim, em ambiente de testes, com três cuidados:

| Cuidado | Por quê | Ação antes de apresentar |
| --- | --- | --- |
| Nada está commitado | Mais de 230 arquivos alterados só no disco. Um erro apaga dias de trabalho. | Commit de checkpoint numa branch `release/demo`. |
| Fluxos não vistos no navegador | Google dentro do checkout, cartão recusado, boleto e o onboarding obrigatório foram testados por API e testes automatizados, não clicando. | Ensaio completo do roteiro abaixo, uma vez. |
| Túnel ngrok | Se o ngrok reiniciar, a URL muda e os webhooks do Asaas param de chegar. | Manter o ngrok aberto; se cair, rodar `asaas:setup --public-url <nova>`. |

### Roteiro sugerido da apresentação

1. Site do clube `/mapcard2`: marca própria, nada da ANNETEC.
2. Checkout em 2 etapas com Google e Pix (`/mapcard2/assinar?plano=...`), depois cartão `4444 4444 4444 4444` · `12/30` · `123`.
3. Webhook confirma, carteirinha emitida, associado entra no portal.
4. Associado novo via Google sem plano: cai no onboarding obrigatório.
5. Painel do clube: Financeiro → Recebimento e Faturamento.
6. Inadimplência do clube com a ANNETEC: "Regularizar agora" paga dentro do painel e o aviso some.
7. Backoffice ANNETEC: inquilinos, responsáveis, cobrança da plataforma.

## 2. O que já impede demo em produção

A API se recusa a subir em produção se encontrar qualquer configuração de demonstração. Não é preciso "lembrar de desligar": o boot falha listando o que falta.

| Bloqueado em produção | Onde |
| --- | --- |
| Gateway simulado, chave sandbox, `ASAAS_ENV=sandbox` | `apps/api/src/config/assert-production.ts` |
| E-mail só na caixa de saída (`outbox`) | idem |
| Armazenamento local de arquivos | idem |
| Consulta de CNPJ simulada e CNPJs de demonstração | `integrations/cnpj` |
| "Simular pagamento", "avançar dias", cartão de teste 4444 | `canSimulate*`, `demoToolsAllowed` |
| Seeds de demonstração | abortam com `NODE_ENV=production` |
| Credenciais globais da Digital Saúde para qualquer clube | só slugs em `DIGITALSAUDE_GLOBAL_TENANTS` |

No web, todo atalho de teste depende do que a API informa, então some sozinho quando a API está em produção.

## 3. Pipeline simples de virada

1. **Congelar**: commit, branch `release/1.0`, typecheck e testes verdes.
2. **Preparar contas**: Asaas produção, provedor de e-mail com domínio, storage, Google OAuth, domínio da API e do web.
3. **Configurar produção**: variáveis de ambiente de produção (bloco "Produção (obrigatório)" em `apps/api/.env.example`).
4. **Banco**: backup, `migrate` até a 0010, sem seeds, superadmin real criado por script.
5. **Virar a chave**: deploy; a API só sobe se o assert passar; rodar `asaas:setup --public-url https://api.<dominio>`.
6. **Smoke test** com cartão real de valor baixo, estornado em seguida.
7. **Limpar demo** do banco de produção, se algum dado de teste tiver ido junto.

## 4. Backlog priorizado (RICE)

Escala usada: **Alcance** 1–10 (10 = todos os clubes e associados), **Impacto** 3 enorme · 2 alto · 1 médio · 0,5 baixo, **Confiança** 0–100%, **Esforço** em semanas-pessoa. Pontuação = Alcance × Impacto × Confiança ÷ Esforço.

| # | Tarefa | Bloqueia go-live | A | I | C | E | RICE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Rotacionar segredos expostos: chave Asaas sandbox que esteve no `.env.example`, `BETTER_AUTH_SECRET`, tokens de webhook | Sim | 10 | 2 | 100% | 0,1 | 200 |
| 2 | Backup automático do banco e plano de rollback | Sim | 10 | 2 | 90% | 0,25 | 72 |
| 3 | Conta Asaas de produção aprovada, chave `$aact_prod_`, webhooks pelo `asaas:setup` | Sim | 10 | 3 | 90% | 0,5 | 54 |
| 4 | E-mail real (Resend ou SendGrid) com domínio neutro de envio, SPF e DKIM | Sim | 10 | 3 | 90% | 0,5 | 54 |
| 5 | Banco de produção: migrations, sem seeds, superadmin com senha forte | Sim | 10 | 3 | 90% | 0,5 | 54 |
| 6 | Commit, branch de release e CI com typecheck e testes | Sim | 10 | 2 | 100% | 0,5 | 40 |
| 7 | Monitoramento de erros e alerta de webhook falhando (o Asaas pausa a fila após falhas seguidas) | Não | 10 | 2 | 80% | 0,5 | 32 |
| 8 | Google OAuth de produção: origens do domínio e tela de consentimento publicada | Não | 8 | 1 | 90% | 0,25 | 29 |
| 9 | Teste ponta a ponta no navegador dos fluxos críticos | Não | 10 | 3 | 90% | 1 | 27 |
| 10 | Deploy do web e da API com domínio, `WEB_BASE_URL`, CORS e cookies | Sim | 10 | 3 | 80% | 1 | 24 |
| 11 | Cron externo da automação de cobrança (a Vercel não mantém timers) | Sim | 10 | 3 | 80% | 1 | 24 |
| 12 | Storage externo para documentos de KYB e logos | Não | 4 | 2 | 80% | 0,5 | 13 |
| 13 | Proteção anti-robô (Turnstile) no checkout público | Não | 8 | 2 | 70% | 1 | 11 |
| 14 | Limpeza de dados de demonstração e decisão sobre o MapCard2 de teste | Não | 6 | 1 | 80% | 0,5 | 10 |
| 15 | "Esqueci minha senha" com envio real | Não | 5 | 1 | 90% | 0,5 | 9 |
| 16 | Split ou subcontas Asaas para repasse automático aos clubes | Não | 10 | 3 | 60% | 3 | 6 |
| 17 | Troca de senha no perfil sem desconectar a pessoa | Não | 3 | 0,5 | 90% | 0,25 | 5 |
| 18 | Tokenização do cartão (reduz escopo PCI) | Não | 8 | 2 | 60% | 2 | 5 |
| 19 | Inclusão de dependentes pelo portal do associado | Não | 6 | 1 | 80% | 1 | 5 |
| 20 | "Novo cliente" no portal do vendedor (hoje dá erro de permissão) | Não | 3 | 1 | 80% | 1 | 2 |

Itens 10 e 11 têm pontuação menor, mas bloqueiam: sem deploy não há produção, e sem cron nenhum ciclo de cobrança, lembrete ou suspensão acontece.

## 5. Decisões pendentes do dono

- [ ] Domínio de envio de e-mail neutro para o white label (hoje o remetente ainda é `nao-responda@annetec.com.br`).
- [ ] Repasse aos clubes: manual no início ou split automático (item 16).
- [ ] Fatura ANNETEC → clube continua com a marca ANNETEC?
- [ ] O MapCard2 do banco atual vai para produção ou é só demonstração?
- [ ] Remover do histórico do git os dados pessoais que estavam no script do operador.
