#!/usr/bin/env bash
# Автообновление сайта из GitHub. Запускается таймером dialog-uchet-update.timer каждые 2 минуты (от root).
# Если в ветке появились новые коммиты: забирает их, при необходимости ставит зависимости,
# перезапускает сайт и проверяет главную страницу. Не открылась — откатывает на прежнюю версию.
# Пауза: touch /srv/dialog-uchet/DEPLOY_PAUSED   (снять: rm /srv/dialog-uchet/DEPLOY_PAUSED)
# Журнал: journalctl -u dialog-uchet-update -n 50
set -euo pipefail

APP_DIR=/srv/dialog-uchet/app
APP_USER=dialog
[ -f /etc/dialog-uchet.env ] && BRANCH="$(sed -n 's/^DEPLOY_BRANCH=//p' /etc/dialog-uchet.env | tail -1)"
BRANCH="${BRANCH:-main}"

[ -f /srv/dialog-uchet/DEPLOY_PAUSED ] && exit 0
exec 9>/run/dialog-uchet-update.lock
flock -n 9 || exit 0

as_app() { sudo -u "$APP_USER" -H "$@"; }
git_app() { as_app git -C "$APP_DIR" "$@"; }

git_app fetch --quiet origin "$BRANCH"
OLD="$(git_app rev-parse HEAD)"
NEW="$(git_app rev-parse "origin/$BRANCH")"
[ "$OLD" = "$NEW" ] && exit 0
[ -f /srv/dialog-uchet/DEPLOY_FAILED_"${NEW:0:7}" ] && exit 0   # эта версия уже не запустилась — ждём исправления

echo "Обновление ${OLD:0:7} → ${NEW:0:7} ($(git_app log -1 --format=%s "$NEW"))"

deploy() {
  local rev="$1" prev="$2"
  git_app checkout --quiet -B "$BRANCH" "$rev"
  git_app reset --quiet --hard "$rev"
  if [ -n "$prev" ] && git_app diff --quiet "$prev" "$rev" -- package.json package-lock.json; then
    : # зависимости не менялись
  else
    as_app bash -c "cd '$APP_DIR' && npm ci --omit=dev --no-audit --no-fund"
  fi
  if ! cmp -s "$APP_DIR/deploy/dialog-uchet.service" /etc/systemd/system/dialog-uchet.service; then
    cp "$APP_DIR/deploy/dialog-uchet.service" /etc/systemd/system/dialog-uchet.service
    systemctl daemon-reload
  fi
  systemctl restart dialog-uchet
}

healthy() {
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 2
    curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:3000/ && return 0
  done
  return 1
}

deploy "$NEW" "$OLD"
if healthy; then
  echo "Готово: сайт работает на ${NEW:0:7}"
else
  echo "!!! Сайт не отвечает после обновления — откат на ${OLD:0:7}" >&2
  journalctl -u dialog-uchet -n 30 --no-pager >&2 || true
  deploy "$OLD" "$NEW"
  healthy && echo "Откат выполнен, сайт работает на ${OLD:0:7}" || echo "!!! После отката сайт тоже не отвечает" >&2
  # не пытаться ставить сломанную версию снова, пока не придёт следующий коммит
  touch /srv/dialog-uchet/DEPLOY_FAILED_"${NEW:0:7}"
  exit 1
fi
