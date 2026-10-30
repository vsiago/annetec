#!/usr/bin/env bash
# Instala (idempotente) o backup diário no crontab do usuário atual (ubuntu) — NO SERVIDOR.
#
#   bash ~/annetec/deploy/install-backup-cron.sh            # instala/atualiza
#   bash ~/annetec/deploy/install-backup-cron.sh --remove   # remove
#
# Roda todo dia às 03:30 no horário do SERVIDOR, que numa EC2 Ubuntu é UTC
# (03:30 UTC = 00:30 em Brasília). Saída em ~/backups/backup.log.
# Rodar de novo substitui a entrada anterior; não duplica.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/annetec}"
MARK="# annetec-backup-diario"
LINE="30 3 * * * /bin/bash $APP_DIR/deploy/backup.sh >> $HOME/backups/backup.log 2>&1 $MARK"

mkdir -p "$HOME/backups"
chmod 700 "$HOME/backups"

current="$(crontab -l 2>/dev/null || true)"
others="$(printf '%s\n' "$current" | grep -vF "$MARK" | sed '/^$/d' || true)"

if [ "${1:-}" = "--remove" ]; then
  printf '%s\n' "$others" | crontab -
  echo "Entrada removida."
  exit 0
fi

{
  [ -z "$others" ] || printf '%s\n' "$others"
  echo "$LINE"
} | crontab -
echo "Cron instalado (fuso do servidor: $(date +%Z)):"
crontab -l | grep -F "$MARK"
