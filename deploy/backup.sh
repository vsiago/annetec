#!/usr/bin/env bash
# Backup diário do ANNETEC — roda NO SERVIDOR (usuário ubuntu).
#
#   bash ~/annetec/deploy/backup.sh
#   BACKUP_S3_URI=s3://bucket/annetec bash ~/annetec/deploy/backup.sh   # cópia extra no S3 (opcional)
#
# Gera, em ~/backups, um par com o MESMO carimbo de data:
#   annetec-db-AAAAMMDD-HHMMSS.dump        pg_dump em formato custom (restaura com pg_restore)
#   annetec-storage-AAAAMMDD-HHMMSS.tar.gz volume api_storage (/data/storage): documentos KYB e logos
#
# Verifica cada arquivo (não vazio, `pg_restore --list` ok, `gzip -t`/`tar -t` ok);
# qualquer falha apaga o par incompleto, registra no log e sai com código != 0.
#
# Retenção (por carimbo): os 14 pares mais recentes (diários) + os 8 mais recentes
# de domingo (semanais). O resto é apagado. Ajuste com KEEP_DAILY / KEEP_WEEKLY.
#
# AVISO: backup no mesmo disco não protege contra perda da instância — ative os
# snapshots automáticos do EBS (deploy/README.md, seção "Cópia fora do servidor").
#
# Agendamento: deploy/install-backup-cron.sh (03:30, horário do servidor = UTC).
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/annetec}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
BACKUP_S3_URI="${BACKUP_S3_URI:-}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
umask 077

log() { echo "[$(date -Is)] $*"; }

# Evita duas execuções ao mesmo tempo (cron + manual).
exec 9>"$BACKUP_DIR/.backup.lock"
flock -n 9 || { log "ERRO: outro backup já está em andamento"; exit 1; }

cd "$APP_DIR"
compose() { docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod "$@"; }

TS="$(date +%Y%m%d-%H%M%S)"
DB_FILE="$BACKUP_DIR/annetec-db-$TS.dump"
FILES_FILE="$BACKUP_DIR/annetec-storage-$TS.tar.gz"

fail() {
  log "ERRO: $*"
  rm -f "$DB_FILE" "$DB_FILE.partial" "$FILES_FILE" "$FILES_FILE.partial"
  exit 1
}

# 1) Postgres — formato custom, comprimido. Dentro do container as credenciais já existem.
log "pg_dump -> $DB_FILE"
compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=6 --no-owner --no-privileges' \
  > "$DB_FILE.partial" || fail "pg_dump falhou"
[ -s "$DB_FILE.partial" ] || fail "dump do banco vazio"
compose exec -T postgres pg_restore --list < "$DB_FILE.partial" > /dev/null || fail "pg_restore --list recusou o dump"
mv "$DB_FILE.partial" "$DB_FILE"

# 2) Storage — container descartável (não depende da API estar de pé) com o volume api_storage.
log "storage (/data/storage) -> $FILES_FILE"
compose run --rm --no-deps -T --entrypoint tar migrate -czf - -C /data/storage . \
  > "$FILES_FILE.partial" || fail "tar do storage falhou"
[ -s "$FILES_FILE.partial" ] || fail "arquivo do storage vazio"
gzip -t "$FILES_FILE.partial" || fail "tar.gz do storage corrompido"
tar -tzf "$FILES_FILE.partial" > /dev/null || fail "tar.gz do storage ilegível"
mv "$FILES_FILE.partial" "$FILES_FILE"

# 3) Retenção por carimbo: KEEP_DAILY mais recentes + KEEP_WEEKLY mais recentes de domingo.
mapfile -t STAMPS < <(ls -1 "$BACKUP_DIR"/annetec-db-*.dump 2>/dev/null | sed -E 's/.*annetec-db-(.*)\.dump/\1/' | sort -r)
declare -A KEEP_SET=()
weekly=0
for i in "${!STAMPS[@]}"; do
  stamp="${STAMPS[$i]}"
  if [ "$i" -lt "$KEEP_DAILY" ]; then KEEP_SET[$stamp]=1; fi
  day="${stamp%%-*}"
  if [ "$weekly" -lt "$KEEP_WEEKLY" ] && [ "$(date -d "$day" +%u 2>/dev/null || echo 0)" = "7" ]; then
    KEEP_SET[$stamp]=1
    weekly=$((weekly + 1))
  fi
done
for stamp in "${STAMPS[@]}"; do
  if [ -z "${KEEP_SET[$stamp]:-}" ]; then
    log "retenção: apagando $stamp"
    rm -f "$BACKUP_DIR/annetec-db-$stamp.dump" "$BACKUP_DIR/annetec-storage-$stamp.tar.gz"
  fi
done

# 4) Cópia extra opcional no S3.
if [ -n "$BACKUP_S3_URI" ]; then
  log "enviando para $BACKUP_S3_URI"
  aws s3 cp "$DB_FILE" "${BACKUP_S3_URI%/}/" || log "AVISO: envio do dump ao S3 falhou"
  aws s3 cp "$FILES_FILE" "${BACKUP_S3_URI%/}/" || log "AVISO: envio do storage ao S3 falhou"
fi

log "ok: db $(du -h "$DB_FILE" | cut -f1), storage $(du -h "$FILES_FILE" | cut -f1) ($TS)"
