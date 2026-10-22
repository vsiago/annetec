#!/usr/bin/env bash
# Backup do Postgres (e dos arquivos do STORAGE_DRIVER=local) — roda NO SERVIDOR.
#
#   bash ~/annetec/deploy/backup.sh
#   BACKUP_S3_URI=s3://annetec-backups/db bash ~/annetec/deploy/backup.sh
#
# Guarda os últimos $KEEP (padrão 7) em ~/backups. Com BACKUP_S3_URI definido,
# copia também para o S3 (precisa do AWS CLI e de permissão na instância).
#
# Cron diário às 03:15 (crontab -e do usuário ubuntu):
#   15 3 * * * /bin/bash $HOME/annetec/deploy/backup.sh >> $HOME/backups/backup.log 2>&1
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/annetec}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP="${KEEP:-7}"
BACKUP_S3_URI="${BACKUP_S3_URI:-}"

cd "$APP_DIR"
compose() { docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod "$@"; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
umask 077

TS="$(date +%Y%m%d-%H%M%S)"
DB_FILE="$BACKUP_DIR/annetec-db-$TS.sql.gz"
FILES_FILE="$BACKUP_DIR/annetec-storage-$TS.tar.gz"

echo "[$(date -Is)] pg_dump → $DB_FILE"
# --clean --if-exists: o restore recria os objetos por cima de um banco existente.
compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --clean --if-exists' \
  | gzip -9 > "$DB_FILE.partial"
mv "$DB_FILE.partial" "$DB_FILE"

# Arquivos enviados (KYB, logos) quando STORAGE_DRIVER=local.
echo "[$(date -Is)] storage local → $FILES_FILE"
compose exec -T api sh -c 'tar -czf - -C /data/storage .' > "$FILES_FILE.partial" \
  && mv "$FILES_FILE.partial" "$FILES_FILE" \
  || { rm -f "$FILES_FILE.partial"; echo "  (sem storage local para copiar)"; }

# Rotação: mantém os $KEEP mais recentes de cada tipo.
for prefix in annetec-db- annetec-storage-; do
  ls -1t "$BACKUP_DIR"/"$prefix"*.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
done

if [ -n "$BACKUP_S3_URI" ]; then
  echo "[$(date -Is)] enviando para $BACKUP_S3_URI"
  aws s3 cp "$DB_FILE" "${BACKUP_S3_URI%/}/"
  [ -f "$FILES_FILE" ] && aws s3 cp "$FILES_FILE" "${BACKUP_S3_URI%/}/"
fi

echo "[$(date -Is)] ok: $(du -h "$DB_FILE" | cut -f1) $DB_FILE"
