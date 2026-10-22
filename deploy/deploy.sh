#!/usr/bin/env bash
# Envia o HEAD do git para o EC2 e sobe/atualiza os containers.
# Roda na SUA máquina (Git Bash no Windows, ou qualquer bash com ssh):
#
#   bash deploy/deploy.sh
#   HOST=1.2.3.4 KEY=~/.ssh/outra.pem bash deploy/deploy.sh
#   SKIP_MIGRATE=1 bash deploy/deploy.sh      # não roda as migrações
#
# Só o que está COMMITADO vai (git archive HEAD). O deploy/.env.prod do
# servidor é preservado e nunca sai da sua máquina — este script não tem segredo.
set -euo pipefail

HOST="${HOST:-3.131.89.130}"
SSH_USER="${SSH_USER:-ubuntu}"
KEY="${KEY:-$HOME/.ssh/annetec-prod.pem}"
REMOTE_DIR="${REMOTE_DIR:-annetec}"            # relativo ao $HOME remoto
SKIP_MIGRATE="${SKIP_MIGRATE:-0}"

cd "$(git rev-parse --show-toplevel)"

if [ ! -f "$KEY" ]; then
  echo "Chave SSH não encontrada: $KEY (defina KEY=...)" >&2
  exit 1
fi

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "AVISO: há alterações não commitadas — elas NÃO vão no deploy (só o HEAD)." >&2
fi

SHA="$(git rev-parse --short HEAD)"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$HOST")

echo "==> Enviando $SHA para $SSH_USER@$HOST:~/$REMOTE_DIR"
git archive --format=tar HEAD | "${SSH[@]}" "rm -rf ~/.annetec-incoming && mkdir -p ~/.annetec-incoming && tar -x -C ~/.annetec-incoming"

echo "==> Build e subida no servidor"
"${SSH[@]}" bash -s -- "$REMOTE_DIR" "$SHA" "$SKIP_MIGRATE" <<'REMOTE'
set -euo pipefail
REMOTE_DIR="$1"; SHA="$2"; SKIP_MIGRATE="$3"
APP="$HOME/$REMOTE_DIR"
mkdir -p "$APP"

# Espelha o release no diretório do app, preservando o .env.prod do servidor.
rsync -a --delete --exclude '/deploy/.env.prod' "$HOME/.annetec-incoming/" "$APP/"
rm -rf "$HOME/.annetec-incoming"
echo "$SHA $(date -Is)" > "$APP/.release"

cd "$APP"
if [ ! -f deploy/.env.prod ]; then
  echo "Falta $APP/deploy/.env.prod — copie de deploy/.env.prod.example e preencha (ver deploy/README.md)." >&2
  exit 1
fi
chmod 600 deploy/.env.prod

compose() { docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod "$@"; }

# Um build por vez: a t4g.medium não aguenta web + api compilando juntos.
compose build api
compose --profile tools build migrate
compose build web

if [ "$SKIP_MIGRATE" != "1" ]; then
  echo "==> Migrações"
  compose up -d postgres
  compose run --rm migrate
fi

compose up -d --remove-orphans
compose ps

echo "==> Limpando imagens antigas"
docker image prune -f >/dev/null
docker builder prune -f --filter until=168h >/dev/null || true

echo "==> Deploy $SHA concluído"
REMOTE
