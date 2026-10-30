#!/usr/bin/env bash
# Restaura backup do ANNETEC — roda NO SERVIDOR. SOBRESCREVE o banco e/ou os arquivos.
#
#   bash ~/annetec/deploy/restore.sh --db ~/backups/annetec-db-AAAAMMDD-HHMMSS.dump
#   bash ~/annetec/deploy/restore.sh --storage ~/backups/annetec-storage-AAAAMMDD-HHMMSS.tar.gz
#   bash ~/annetec/deploy/restore.sh --db <dump> --storage <tar.gz>     # os dois (use o mesmo carimbo)
#
# Antes de tudo mostra o que será sobrescrito e exige digitar RESTAURAR.
# Para api e web durante a operação e sobe de novo no fim (mesmo se falhar).
# Os arquivos são conferidos ANTES de parar qualquer coisa (dump legível pelo
# pg_restore, tar.gz íntegro): arquivo ruim = nada é tocado.
# O dump é recriado por cima (--clean --if-exists) numa transação só: erro no
# meio desfaz tudo e o banco fica como estava. O storage é ESVAZIADO antes
# de extrair o tar.gz (o estado volta exatamente ao do backup).
# Dumps antigos (.sql.gz do backup.sh anterior) também são aceitos em --db.
# Dica: rode `bash deploy/backup.sh` antes, para poder desfazer.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/annetec}"
DB_FILE=""
FILES_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --db) DB_FILE="${2:-}"; shift 2 ;;
    --storage) FILES_FILE="${2:-}"; shift 2 ;;
    *) echo "Uso: restore.sh [--db ARQUIVO.dump] [--storage ARQUIVO.tar.gz]"; exit 2 ;;
  esac
done
if [ -z "$DB_FILE" ] && [ -z "$FILES_FILE" ]; then
  echo "Informe --db e/ou --storage."
  exit 2
fi
if [ -n "$DB_FILE" ] && [ ! -s "$DB_FILE" ]; then echo "Arquivo inexistente ou vazio: $DB_FILE"; exit 1; fi
if [ -n "$FILES_FILE" ] && [ ! -s "$FILES_FILE" ]; then echo "Arquivo inexistente ou vazio: $FILES_FILE"; exit 1; fi

cd "$APP_DIR"
compose() { docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod "$@"; }

# Confere os arquivos antes de parar serviços ou apagar qualquer coisa.
if [ -n "$DB_FILE" ]; then
  case "$DB_FILE" in
    *.sql.gz) gzip -t "$DB_FILE" || { echo "Dump .sql.gz corrompido: $DB_FILE"; exit 1; } ;;
    *) compose exec -T postgres pg_restore --list < "$DB_FILE" > /dev/null || { echo "pg_restore não reconhece o dump: $DB_FILE"; exit 1; } ;;
  esac
fi
if [ -n "$FILES_FILE" ]; then
  gzip -t "$FILES_FILE" && tar -tzf "$FILES_FILE" > /dev/null || { echo "tar.gz do storage corrompido/ilegível: $FILES_FILE"; exit 1; }
fi

echo "ATENÇÃO: isto SOBRESCREVE dados de produção."
if [ -n "$DB_FILE" ]; then echo "  - banco     <- $DB_FILE"; fi
if [ -n "$FILES_FILE" ]; then echo "  - arquivos  <- $FILES_FILE (o conteúdo atual de /data/storage será apagado)"; fi
read -r -p "Digite RESTAURAR para continuar: " answer
if [ "$answer" != "RESTAURAR" ]; then echo "Cancelado."; exit 1; fi

# Sobe api/web de novo ao sair, mesmo com erro no meio.
trap 'echo "Subindo api e web..."; compose start api web || true' EXIT

echo "Parando api e web..."
compose stop api web

if [ -n "$DB_FILE" ]; then
  echo "Restaurando o banco..."
  case "$DB_FILE" in
    *.sql.gz)
      gunzip -c "$DB_FILE" | compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 --single-transaction'
      ;;
    *)
      compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --exit-on-error --single-transaction' < "$DB_FILE"
      ;;
  esac
fi

if [ -n "$FILES_FILE" ]; then
  echo "Restaurando os arquivos..."
  compose run --rm --no-deps -T --entrypoint sh migrate -c 'find /data/storage -mindepth 1 -delete && tar -xzf - -C /data/storage' < "$FILES_FILE"
fi

echo "Restauração concluída. Confira os logs: docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod logs -f --tail=100 api"
