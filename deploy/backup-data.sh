#!/usr/bin/env bash
# Еженедельный архив всех данных сайта (база, загруженные фото и видео, документы).
# Запускается cron-файлом /etc/cron.d/dialog-uchet-backup по воскресеньям в 03:30. Хранятся 8 последних архивов.
# База дополнительно копируется самим сайтом раз в сутки (data/backups, 14 копий).
set -euo pipefail
DATA_DIR=/srv/dialog-uchet/data
OUT=/srv/dialog-uchet/archive
mkdir -p "$OUT"; chmod 700 "$OUT"
F="$OUT/data-$(date +%F).tar.gz"
# копия базы через sqlite-снимок, чтобы архив был целым даже во время записи
SNAP="$(mktemp -d)"
trap 'rm -rf "$SNAP"' EXIT
if command -v sqlite3 >/dev/null; then sqlite3 "$DATA_DIR/site.sqlite" ".backup '$SNAP/site.sqlite'"; fi
# в архиве: data/ (без базы и её суточных копий) и site.sqlite — снимок базы.
# Восстановление: распаковать, положить site.sqlite в data/, заменить /srv/dialog-uchet/data.
tar -czf "$F" --exclude='data/backups' --exclude='data/site.sqlite*' -C /srv/dialog-uchet data -C "$SNAP" site.sqlite
ls -1t "$OUT"/data-*.tar.gz | tail -n +9 | xargs -r rm -f
echo "Архив: $F ($(du -h "$F" | cut -f1))"
