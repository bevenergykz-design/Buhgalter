#!/usr/bin/env bash
# Обновить сайт сразу, не дожидаясь таймера (запуск от root): bash /srv/dialog-uchet/app/deploy/update.sh
set -uo pipefail
rm -f /srv/dialog-uchet/DEPLOY_FAILED_*        # разрешить повторную попытку
systemctl start dialog-uchet-update.service
journalctl -u dialog-uchet-update -n 15 --no-pager -o cat
curl -fsS -o /dev/null -w "Главная страница: HTTP %{http_code}\n" http://127.0.0.1:3000/
