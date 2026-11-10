# Rede Comercial: kit visual e cascas

Tudo aqui é apresentacional: sem fetch, sem server actions, tipos de props locais (`ui/tipos.ts`). As telas (fase 3) convertem os dados da API para estes formatos. Importe de `@/components/vendas-rede`.

## Vocabulário visual

- **60/30/10**: 60 % superfície clara (fundo `#F8F9FB`, cartões brancos), 30 % marinho/cor do clube (trilho, abas, trilha da jornada), 10 % cor de ação, **só** na `AcaoPrincipal`.
- **Uma ação principal por cartão/tela**; o resto vai no menu ⋯ ou como botão de contorno.
- **Cartões, não tabelas**, na área operacional (Funil, Hoje, Equipe). Tabelas só em Resultados e Comissões.
- **Estados vazios orientam** (`EstadoVazio`): dizem o que aconteceu e o que fazer.
- A cor nunca é o único sinal: todo estado tem texto (e forma, na trilha da jornada). Sem gamificação.
- Tokens: tons de `admin-platform/ui/tone.ts` (`TONES`, `CARD_SURFACE`). A cor de ação é a variável CSS `--vr-accent` / `--vr-accent-fg`, definida pela casca a partir de `branding.corPrimaria` (padrão marinho `#1E2A4A`).
- Cascas sempre **claras** (redefinem as variáveis de tema no próprio elemento).

## Cascas (`shell/`)

- `ComercialShell({ papel, itens, usuario, branding?, slotSino?, slotConta?, raiz?, children })`: trilho de 56 px no desktop (hover/foco abre; `Ctrl+B` fixa; fica no localStorage); celular com topo `h-14` e barra inferior `h-16` (até 5 entradas; com mais, a 5ª vira "Mais"). Use `<Conteudo largo?>` dentro dela para padding e largura máxima.
- `BalcaoShell({ unidade, itens, usuario, branding?, slotSino?, children })`: uma coluna `max-w-2xl`, barra inferior de 72 px.
- `itensDoPapel(papel, basePath)` e `itensDoBalcao(basePath)`: menus da seção 5.2. O ícone é um nome (`IconeMenu`), então o menu pode ser montado em Server Component. `badge` coloca um contador no ícone.
- `usuario = { nome, iniciais?, online }`; `branding = { nome, logoUrl?, corPrimaria? }`.

## Componentes (`ui/`)

| Componente | Props principais |
|---|---|
| `AcaoPrincipal` | `href?` ou `onClick`, `icone?`, `tamanho` (`md`/`lg`/`xl`), `bloco?`, `carregando?`, `variante` (`principal`/`secundaria`) |
| `LeadCard` | `lead: LeadCardDados`, `acao: {rotulo, icone?, onClick?/href?}`, `menu?: {rotulo, onSelecionar, perigo?}[]`, `onAbrir?` |
| `LinhaDaVez` | `item: {id, nome, etapa, motivo, urgente?}`, `acao`, `onAbrir?` |
| `EstacoesTabs` | `estacoes: {id, rotulo, contador?, destaque?}[]`, `valor`, `aoMudar` (abas no desktop, pílulas fixas no celular) |
| `JornadaTrilha` | `passos: {id, rotulo, estado: feito/agora/falta/pulado}[]`, `variante` (`compacta`/`completa`); rótulos padrão em `JORNADA_ROTULOS` |
| `ProximoPassoBadge` | `passo?: {texto, quando?, atrasado?}` (âmbar quando atrasado) |
| `OrigemBadge` / `EtapaBadge` / `PresencaDot` | `origem`, `detalhe?` / `etapa` / `online`, `rotulo?` |
| `NumerosDaSemana` | `itens: {rotulo, atual, anterior, formatar?}[]` (4 números com variação) |
| `FunilDegraus` | `degraus: {rotulo, valor}[]`, `orientacao` (`horizontal`/`vertical`) |
| `KpiGrid` | `itens: {rotulo, valor, dica?, variacao?, icone?, tom?, serie?}[]`, `colunas` (2/3/4); usa `KpiCard` do console |
| `GraficoLeadsGanhos` | `dados: {dia, leads, ganhos}[]` (recharts, `ChartContainer` do projeto) |
| `GraficoOrigens` | `dados: {origem, total, ganhos?}[]` |
| `RankingTabela` | `linhas: {id, nome, detalhe?, leads, ganhos, valor?}[]` (já ordenadas) |
| `TimelineLead` | `eventos: {id, tipo, texto, quando, autor?}[]` |
| `ModeloMensagemCard` | `titulo`, `texto` (já preenchido), `canal`, `telefone?`, `email?`; botões "Abrir no WhatsApp" e "Copiar" |
| `EstadoVazio` | `ilustracao`, `titulo`, `descricao?`, `acao?`, `moldura?` |
| `ArvoreRede` | `corretoras`, `solos?`, `unidadesProprias?`, `aoAbrirAgente?`, `acoes?`, `acaoVazio?` |
| `AgenteCard` | `agente: {nome, papel, online, vinculo?, emAndamento?, ganhosNoMes?, metaMensal?}`, `acao?`, `aoAbrir?` |
| `ComissaoExtrato` | `linhas: {id, parcela, base, percentual, valor, parte, status, descricao?, tipo?}[]` |
| `SimuladorEconomia` | `planos: {id, nome, precoMensal, descontoPercentual, adesao?}[]`, `valorInicial?`, `aoMudarValor?`, `aoEscolher?` |
| `ResultadoAtendimento` | `aoEscolher('assinou' \| 'vai_pensar' \| 'recusou')`, `carregando?` |
| `QrCode` | `valor`, `tamanho?`, `titulo?` (SVG local, lib `qrcode`) |
| `CopiarBotao` | `texto`, `rotulo?`, `mensagem?`, `variante` (`texto`/`icone`); toast do sonner |

Utilitários: `mascaras.ts` (`formatarCpf/Cnpj/Documento/Celular/Moeda/Percentual`, `dataPorExtenso`, `saudacaoPorHora`, `primeiroNome`, `variacaoPercentual`), `wa-link.ts` (`montarWaLink(telefone, texto?)`, `preencherModelo(texto, valores)`).

O componente `Toaster` do `sonner` precisa estar montado na página (já está no layout raiz).
