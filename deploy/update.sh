#!/usr/bin/env bash
# Обновление сайта на VPS после изменений в Git (запуск от root): bash /srv/dialog-uchet/app/deploy/update.sh
set -euo pipefail
APP_DIR=/srv/dialog-uchet/app
sudo -u dialog git -C "$APP_DIR" pull --ff-only
sudo -u dialog bash -c "cd '$APP_DIR' && npm ci --omit=dev"
cp "$APP_DIR/deploy/dialog-uchet.service" /etc/systemd/system/dialog-uchet.service
systemctl daemon-reload
systemctl restart dialog-uchet
sleep 2
systemctl --no-pager --lines=5 status dialog-uchet
curl -fsS -o /dev/null -w "Главная страница: HTTP %{http_code}\n" http://127.0.0.1:3000/
