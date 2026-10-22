# Login com Google

Login de um clique na tela `/[tenant]/login` (associado, vendedor e admin do
inquilino). Usa o **fluxo ID token** do Google Identity Services: o navegador
abre o popup do Google, recebe um `credential` (JWT assinado pelo Google) e o
envia à API, que valida assinatura, emissor, audiência (o nosso client id) e
validade com o Better Auth (`auth.api.signInSocial({ idToken })`). Não há
redirect OAuth nem callback no servidor.

Regras:

- O Google **não cria conta nem vínculo**. Só entra quem já é membro do
  inquilino da URL (associado do checkout, vendedor, admin). Se o e-mail não
  tiver vínculo, a tela mostra "Esta conta Google não tem vínculo com este
  clube".
- A conta Google é vinculada à conta existente **pelo e-mail**. O e-mail da
  conta Google precisa ser o mesmo do cadastro.
- Sem as variáveis abaixo o botão não aparece, e a rota responde
  "Login com Google não configurado".

## 1. Criar o OAuth Client ID (Google Cloud Console)

1. Acesse <https://console.cloud.google.com/> e escolha ou crie o projeto.
2. **APIs e serviços → Tela de permissão OAuth** (OAuth consent screen):
   tipo **Externo**, nome do app, e-mail de suporte e domínios autorizados.
   Escopos: os padrão (`openid`, `email`, `profile`) bastam.
3. **Publique o app** ("Publicar aplicativo" / *In production*). Em modo
   **Testing**, só os e-mails cadastrados como "usuários de teste" conseguem
   entrar. Para associados reais, o app precisa estar publicado. Com os escopos
   básicos, a publicação não exige verificação do Google.
4. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**,
   tipo **Aplicativo da Web**.
5. **Origens JavaScript autorizadas** (*Authorized JavaScript origins*): a
   origem exata (esquema + host + porta, sem caminho nem barra final) de cada
   endereço onde a tela de login web abre:
   - `http://localhost:3000` **e** `http://localhost` (desenvolvimento local).
     A documentação do Google Identity Services pede as duas entradas para
     testes locais: com e sem a porta
     (<https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid>).
     Se abrir o web por outra porta ou por `127.0.0.1`, cadastre também essa
     origem exata.
   - o domínio web de produção, por exemplo `https://app.SEU-DOMINIO.com.br`
   - cada domínio de preview/homologação que precise testar o login (o Google
     **não aceita curingas**, então `https://*.vercel.app` não funciona: cada
     URL de preview precisa entrar na lista, ou use um domínio fixo de
     homologação)
   - se algum inquilino ganhar domínio próprio (ex.: `https://clube.cliente.com.br`),
     esse domínio também precisa entrar na lista. Hoje os inquilinos são
     servidos por caminho (`/<slug>`) no mesmo domínio, então uma origem cobre
     todos.

   > Não encontrei no repositório o domínio de produção do web. Substitua os
   > exemplos acima pelos domínios reais.
6. **URIs de redirecionamento autorizados** (*Authorized redirect URIs*):
   **não são necessários** no fluxo ID token. Deixe em branco.
   Se um dia for adotado o fluxo por redirect do Better Auth, a URI seria
   `<API_BASE_URL>/api/auth/callback/google` (basePath padrão do Better Auth,
   `/api/auth`), por exemplo `http://localhost:3333/api/auth/callback/google`.
   Hoje o handler HTTP do Better Auth **não está montado** na API, então essa
   rota não existe. Seria preciso montá-la antes.
7. Copie o **ID do cliente** e a **Chave secreta do cliente**.

## 2. Variáveis de ambiente

`apps/api/.env` (e no ambiente de produção da API):

```env
GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

`apps/web` (`.env.local` em desenvolvimento, variáveis do projeto web em
produção):

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
```

O client id é **o mesmo nos dois apps**. A API recusa tokens emitidos para
outro client id. `NEXT_PUBLIC_*` entra no bundle no build, então é preciso
refazer o build/deploy do web depois de alterá-la. A API lê as variáveis no boot
e precisa ser reiniciada.

O botão só aparece com as duas pontas configuradas: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
no web e `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` na API (a tela consulta
`GET /api/v1/auth/login/google/config`).

## 3. Rotas da API

| Rota | Uso |
| --- | --- |
| `GET /api/v1/auth/login/google/config` | Pública. `{ googleEnabled }`. |
| `POST /api/v1/auth/login/method` | Também devolve `googleEnabled`. |
| `POST /api/v1/auth/login/google` | `{ idToken, tenantSlug? }` → `{ token, user }`, igual ao login por senha. Rate limit de 10/min por IP. |

Erros:

- 503 `INTEGRATION_NOT_CONFIGURED`: "Login com Google não configurado".
- 401 `INVALID_CREDENTIALS`: "Não foi possível validar o login com Google"
  (token inválido ou expirado) ou "Esta conta Google não tem vínculo com
  este clube".

## 4. Como testar

1. Configure as variáveis acima e reinicie a API e o web.
2. `curl http://localhost:3333/api/v1/auth/login/google/config` deve
   responder `{"success":true,"data":{"googleEnabled":true}}`.
3. Abra `http://localhost:3000/<slug>/login`. O botão "Continuar com o
   Google" aparece abaixo de "Continuar".
4. Entre com uma conta Google cujo e-mail seja o de um membro do inquilino
   (ex.: o e-mail usado num checkout). A pessoa cai na área do seu papel.
5. Entre com uma conta Google sem vínculo. Deve aparecer "Esta conta Google
   não tem vínculo com este clube", sem criar usuário.

Problemas comuns:

- Popup com `origin_mismatch` ou "The given origin is not allowed": a origem
  da página não está em *Authorized JavaScript origins* (em localhost,
  confira se `http://localhost` sem porta também está lá). A propagação pode
  levar alguns minutos.
- O Google precisa receber a origem da página no `Referer` ao carregar
  `accounts.google.com/gsi/client`. O web não define `Referrer-Policy`, então
  vale o padrão do navegador (`strict-origin-when-cross-origin`), que já
  envia a origem. Se alguém adicionar `Referrer-Policy: no-referrer` (ou
  `same-origin`), o botão quebra; o Google recomenda
  `strict-origin-when-cross-origin` e, para testes em http/localhost,
  `no-referrer-when-downgrade`.
- "Não foi possível validar o login com Google": o client id do web é
  diferente do da API.
- Só alguns e-mails conseguem entrar: a tela de consentimento ainda está em
  *Testing*.
