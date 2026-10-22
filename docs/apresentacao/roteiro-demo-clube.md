# Roteiro da demo — Clube de Benefícios MapCard2

**Duração: cerca de 15 min, mais perguntas.**
Tenant: `mapcard2`. Web: `http://localhost:3000`. API: `http://localhost:3333`.
Rode os comandos abaixo **na raiz do repositório**.

> **Situação da validação em 27/09, 21:40**
> - Validado ponta a ponta pela API: checkout, Pix, portal e painel. Também passaram o typecheck (contracts, api, web) e os 112 testes da API.
> - A passada no navegador ficou pendente: a web ficou fora do ar das 21:08 às 21:47.
> - Assim que a web voltar, rode `node scripts/demo/demo-e2e.mjs vitrine,planos,checkout,portal,painel,mobile`. O script cria 1 assinante Família `qa-e2e-demo-*`, e os prints saem em `%TEMP%\annetec-demo\shots`, fora do repo.

## Scripts

| Comando | O que faz | Cria dados? |
|---|---|---|
| `node scripts/demo/demo-precheck.mjs` | Confere API, web, planos do checkout e login da plataforma. Imprime os números do painel, os links com o id atual do Família e o CPF do associado reserva. Termina com código 0 quando está tudo OK. | Não, só lê |
| `node scripts/demo/demo-e2e.mjs vitrine,planos,checkout,portal,painel,mobile` | Faz a jornada completa no Chrome headless e tira prints. Fluxos disponíveis: `vitrine`, `planos`, `checkout`, `portal`, `login-portal`, `painel`, `mobile`. | Sim: o fluxo `checkout` cria 1 assinante Família |

Variáveis opcionais: `DEMO_WEB`, `DEMO_API`, `DEMO_OUT` (pasta dos prints; padrão `%TEMP%\annetec-demo`) e `CHROME_PATH`.

---

## Preparação (30 min antes)

1. **Duas janelas do Chrome:**
   - **Janela anônima** (Ctrl+Shift+N): vitrine, checkout e portal do associado.
   - **Janela normal:** painel, com login Plataforma.
   - Por que separar: o checkout só abre a sessão do associado se a janela **não** tiver sessão de equipe. Na mesma janela do painel, "Acessar minha área" cai no `/login`.
2. **Aquecer as páginas.** O Next em modo dev compila cada rota na 1ª visita, o que leva de 5 a 20 s.
   - O `demo-precheck.mjs` já aquece `/mapcard2`, `/planos`, `/assinar` e `/login`.
   - Abra também `/mapcard2/cliente` (pode ser sem login) e as telas do painel.
3. **Painel já aberto na janela normal:**
   - Faça o login Plataforma, clique em "Portal do admin" do MapCard2 e deixe o Início carregado.
   - Deixe em abas: Início, Produtos e Planos, Cadastros e Faturamento.
4. **Dados de teste — decisão pendente.** Hoje os 8 "Últimos cadastros" do Início são **contas de teste** (o precheck marca com `[TESTE]`). A limpeza ainda **não foi autorizada**. Sem limpeza, apresente como "base de homologação". O cadastro feito ao vivo entra no topo da lista.

## Contas

| Uso | Onde | Credencial |
|---|---|---|
| Plataforma, que dá acesso ao painel do inquilino | `http://localhost:3000/login`, aba **Plataforma** | `super@annetec.com.br` / `super123456` (superadmin de desenvolvimento, o mesmo do README) |
| Associado criado ao vivo | Sessão aberta automaticamente pelo checkout | CPF e e-mail do "Preencher com dados de exemplo" (a tela de sucesso mostra os dois quando pede login) |
| Associado reserva (plano B) | `/login`, aba **Associado** | E-mail `qa-e2e-familia-mukhnfyd@clube.mapcard2.test` + o **CPF que o precheck imprime** na linha "associado reserva". Plano Família, 4 carteirinhas. |

---

## Passo a passo

### Janela anônima

| # | Tempo | URL / tela | O que clicar | O que falar |
|---|---|---|---|---|
| 1 | 1:00 | `http://localhost:3000/mapcard2` | Rolar: hero, planos, rede e benefícios | "Este é o site do clube com a marca do cliente; tudo que aparece aqui é configurado no painel." |
| 2 | 1:00 | `http://localhost:3000/mapcard2/planos` | Rolar até **"Compare os planos lado a lado"** (ou clicar em "Comparar coberturas e regras") | "Três planos com coberturas, carências e regras lado a lado, sem letra miúda." |
| 3 | 3:00 | `http://localhost:3000/mapcard2/assinar` | **Plano:** escolher **Família**; o link "Comparar todas as coberturas e regras" abre `/mapcard2/planos#comparativo` em aba nova. Continuar.<br>**Seus dados:** "Preencher com dados de exemplo". Continuar.<br>**Dependentes:** **"Exemplo" 3×** (cônjuge, filho, pai/mãe); o resumo mostra "3 dependentes inclusos no plano", **1ª cobrança R$ 129,80** e **R$ 79,90/mês**. Continuar.<br>**Pagamento:** aba **Pix**. Revisar pedido.<br>**Revisão:** aceitar os termos, depois "Confirmar assinatura". | "O checkout aplica as regras do plano na hora: idade, parentesco, limite de dependentes e formas de pagamento." |
| 4 | 1:00 | Tela do Pix e depois a de sucesso | Mostrar o QR e o copia-e-cola de **R$ 129,80**. O Pix **aprova sozinho em ~20 s**; fale enquanto espera, ou clique em **"Simular pagamento (demonstração)"**. A tela vira para **"Assinatura confirmada"**, com 4 carteirinhas. | "Pagou, a carteirinha sai na hora: do titular e de cada dependente." |
| 5 | 2:00 | "Acessar minha área" leva a `/mapcard2/cliente` | Início, **Carteirinha** (4 cartões), **Benefícios** (13 coberturas, "Liberado" ou "Libera em dd/mm/aaaa"), **Faturas** (R$ 129,80 paga) | "O associado vê plano, carências e faturas sem ligar para ninguém." |

### Janela normal

| # | Tempo | URL / tela | O que clicar | O que falar |
|---|---|---|---|---|
| 6 | 1:00 | `http://localhost:3000/login` | Aba **Plataforma**, credencial super, "Acessar Painel". Depois **Inquilinos** (`/admin/inquilinos`), linha **/mapcard2**, **Gerenciar** e **"Portal do admin"**; o painel abre em `/mapcard2/admin`. | "A Annetec opera vários clubes; entro no painel deste cliente com um clique." |
| 7 | 1:00 | Início, bloco **"Clube de Benefícios"** | Mostrar **Últimos cadastros** (a venda de agora no topo) e **Últimos pagamentos** (R$ 129,80). Clicar no pagamento abre a ficha. | "A venda que acabamos de fazer já está aqui, paga." |
| 8 | 2:00 | **Produtos e Planos** (`/mapcard2/admin/planos`) | Indicadores e linhas por plano (vidas, MRR). Abrir **Família** e passar pelas abas Visão geral, Coberturas, Regras e **Pessoas**; buscar o nome do novo assinante. | "O produto é configurável: preço, coberturas, carências e regras de dependentes." |
| 9 | 1:00 | **Cadastros** (`/mapcard2/admin/cadastros`) | Novo assinante no topo; abrir a ficha (dependentes e carteirinhas). Para filtrar por plano, use o link **"cadastros filtro"** que o precheck imprime (`/mapcard2/admin/cadastros?plano=<id do Família>`). | "Base de associados com carteirinha, dependentes e situação de cada um." |
| 10 | 2:00 | **Faturamento** (`/mapcard2/admin/faturamento`) | **Visão geral** (MRR, recebido, inadimplência, eventos), **Cobranças** (a paga de R$ 129,80 e a ficha com a linha do tempo), **Automação** e **"Executar automação agora"**, que retorna "Nada pendente — tudo em dia". | "A cobrança é automática: gera, lembra, marca atraso, suspende e reativa sozinha." |
| 11 | 0:30 | Celular | F12, Ctrl+Shift+M, largura 360. Barra inferior: Início · Produtos · Cadastros · Faturamento · Mais | "E funciona no celular do gestor." |

---

## Números reais (API, 27/09 às 21:40, antes do checkout ao vivo)

**Planos (vitrine e checkout)**

| Plano | Mensalidade | Dependentes | Adesão | Formas de pagamento |
|---|---|---|---|---|
| Essencial | R$ 29,90 | +R$ 14,90 cada, até 2 | sem adesão | Pix e cartão, sem boleto |
| Plus | R$ 49,90 | 1 incluso, +R$ 19,90 a partir do 2º, até 3 | R$ 29,90, isenta | Pix, boleto e cartão |
| Família | R$ 79,90 | até 5 inclusos | R$ 49,90 | Pix, boleto e cartão |

- **Família + 3 dependentes:**
  - 1ª cobrança **R$ 129,80** (R$ 79,90 + adesão de R$ 49,90);
  - depois **R$ 79,90/mês**;
  - carteirinhas `MAP-2026-000NN`, `-01`, `-02` e `-03`.
- **Carências das coberturas do Família (13):**
  - Sem carência (0 dias): Telemedicina 24h, Desconto em farmácias, Clube de vantagens.
  - 15 dias: Especialistas online, Consultas presenciais, Exames.
  - 30 dias: Psicologia online, Nutricionista online, Assistência residencial 24h.
  - 60 dias: Odontologia preventiva, Tratamentos odontológicos.
  - 90 dias: Check-up anual, Assistência funeral familiar.
  - Para uma ativação em 28/09, o portal mostra "Libera em" **13/10**, **28/10**, **27/11** e **27/12**.
- **Painel antes do checkout ao vivo:**
  - Totais: **33 titulares · 27 dependentes · 60 vidas · MRR R$ 1.826,10**.
  - Essencial: 2 titulares · 4 vidas · R$ 79,60 (1 suspensa).
  - Plus: 23 titulares · 34 vidas · R$ 1.262,00.
  - Família: 5 titulares · 12 vidas · R$ 369,50.
  - Odonto: plano inativo, fora da vitrine; 3 titulares · 10 vidas · R$ 115,00.
  - Faturamento: recebido no mês **R$ 2.040,60** · a receber R$ 64,80 · em atraso R$ 29,90 (1 cobrança) · inadimplência 1,04% · 25 novas no mês · 3 canceladas no mês · gateway *simulated*.
  - Automação: roda em ~0,5 s e hoje responde "Nada pendente — tudo em dia".
- **Depois do checkout ao vivo** (+1 Família com 3 dependentes):
  - Família: 6 titulares · 16 vidas · R$ 449,40.
  - Totais: **34 titulares · 30 dependentes · 64 vidas · MRR R$ 1.906,00**.
  - Recebido no mês **R$ 2.170,40** · 26 novas no mês.
- A automação roda sozinha durante a noite e pode mudar "a receber" e "em atraso". **Releia os números** com o precheck (ver checklist).

---

## Plano B

| Se… | Faça |
|---|---|
| Uma página demora ou dá erro na 1ª abertura | F5. É compilação do modo dev; por isso as páginas são aquecidas antes. |
| O Pix não confirmou em 30 s | Clicar em **"Simular pagamento (demonstração)"**. |
| "Acessar minha área" foi para o `/login` | A janela tinha sessão de equipe. Use a aba **Associado** com o CPF e o e-mail que a tela de sucesso mostra. |
| O checkout falhou | Seguir com o **associado reserva** (e-mail acima + o CPF impresso pelo precheck) e mostrar essa assinatura no painel. |
| "Portal do admin" deu "Rota restrita à equipe Annetec" | Menu do usuário, **Sair**. Entrar de novo como Plataforma e repetir. Abrir `/mapcard2/admin` direto **não** funciona com sessão de plataforma. |
| A web caiu | Pedir para religar. Enquanto isso, rodar `node scripts/demo/demo-precheck.mjs` para mostrar os números vivos da API e usar os prints da última execução do `demo-e2e.mjs`, em `%TEMP%\annetec-demo\shots`, como slides de emergência. |
| O resultado da automação não for "tudo em dia" | É o esperado: ela mostra o que fez (lembretes, atrasos, suspensões). Explicar a régua. |

---

## Checklist dos 5 minutos antes

1. Na raiz do repo, rode `node scripts/demo/demo-precheck.mjs`.
   - Tudo deve dar **OK** e terminar em "TUDO OK para a demo.".
   - Anote MRR, vidas e titulares, o CPF do associado reserva e o link "cadastros filtro".
2. Janela anônima aberta em `http://localhost:3000/mapcard2`, já carregada, sem nenhum login.
3. Janela normal dentro de `/mapcard2/admin`, com as abas Início, Produtos e Planos, Cadastros e Faturamento carregadas.
4. `/mapcard2/cliente` e as telas do painel abertas uma vez (as páginas públicas o precheck já aqueceu).
5. Notificações do sistema desligadas, zoom em 100%, DevTools fechado (só abre no passo 11).
