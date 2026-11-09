#!/usr/bin/env bash
# Первичная установка сайта «Диалог Учёт» на чистый VPS PS.kz (Ubuntu 22.04 / Debian 11 / Debian 12).
# Запуск от root:
#   DOMAIN=dialog-uchet.kz REPO=git@github.com:bevenergykz-design/Buhgalter.git ADMIN_EMAIL=admin@dialog-uchet.kz bash setup-vps.sh
# Что делает: ставит Node.js 22, Nginx, Certbot; создаёт пользователя dialog; забирает сайт из Git;
# поднимает службу systemd; настраивает Nginx и HTTPS (Let's Encrypt).
set -euo pipefail

: "${DOMAIN:?Укажите DOMAIN, например DOMAIN=dialog-uchet.kz}"
: "${REPO:?Укажите REPO — адрес Git-репозитория}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@${DOMAIN}}"
BRANCH="${BRANCH:-main}"
APP_DIR=/srv/dialog-uchet/app
DATA_DIR=/srv/dialog-uchet/data
APP_USER=dialog

echo "==> Пакеты системы"
apt-get update -y
apt-get install -y curl git nginx ca-certificates gnupg ufw
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  echo "==> Node.js 22 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if (a<22||(a===22&&b<13)) { console.error("Нужен Node.js >= 22.13, установлен "+process.version); process.exit(1) }'
apt-get install -y certbot python3-certbot-nginx

echo "==> Пользователь и папки"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir /srv/dialog-uchet --shell /bin/bash "$APP_USER"
mkdir -p "$DATA_DIR" /srv/dialog-uchet/.ssh
chown -R "$APP_USER:$APP_USER" /srv/dialog-uchet
chmod 700 "$DATA_DIR"

if [[ "$REPO" == git@* ]] && [ ! -f /srv/dialog-uchet/.ssh/id_ed25519 ]; then
  sudo -u "$APP_USER" ssh-keygen -t ed25519 -N "" -C "dialog-uchet-deploy@${DOMAIN}" -f /srv/dialog-uchet/.ssh/id_ed25519 >/dev/null
  sudo -u "$APP_USER" bash -c 'ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null'
  echo
  echo "!!! Репозиторий закрытый. Добавьте этот ключ в GitHub → репозиторий → Settings → Deploy keys (только чтение):"
  cat /srv/dialog-uchet/.ssh/id_ed25519.pub
  echo
  read -r -p "Добавили ключ? Нажмите Enter, чтобы продолжить… " _
fi

echo "==> Код сайта"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
else
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only
fi
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && npm ci --omit=dev"

echo "==> Служба systemd"
ENV_FILE=/etc/dialog-uchet.env
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
DATA_DIR=$DATA_DIR
ADMIN_EMAIL=$ADMIN_EMAIL
EOF
  chmod 640 "$ENV_FILE"; chown root:"$APP_USER" "$ENV_FILE"
fi
cp "$APP_DIR/deploy/dialog-uchet.service" /etc/systemd/system/dialog-uchet.service
systemctl daemon-reload
systemctl enable --now dialog-uchet
sleep 2
systemctl --no-pager --lines=5 status dialog-uchet || true

echo "==> Nginx"
sed "s/__DOMAIN__/${DOMAIN}/g" "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/dialog-uchet.conf
ln -sf /etc/nginx/sites-available/dialog-uchet.conf /etc/nginx/sites-enabled/dialog-uchet.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> Брандмауэр"
ufw allow OpenSSH >/dev/null; ufw allow 'Nginx Full' >/dev/null; ufw --force enable >/dev/null

echo "==> HTTPS (домен уже должен указывать на этот сервер)"
certbot --nginx --non-interactive --agree-tos --redirect -m "$ADMIN_EMAIL" -d "$DOMAIN" -d "www.$DOMAIN" \
  || echo "!!! Сертификат не выпущен. Проверьте DNS (A-записи $DOMAIN и www.$DOMAIN) и запустите: certbot --nginx -d $DOMAIN -d www.$DOMAIN"

echo
echo "Готово. Сайт: https://$DOMAIN   Панель: https://$DOMAIN/admin"
if [ -f "$DATA_DIR/FIRST-ADMIN.txt" ]; then
  echo "Данные первого входа в панель:"; cat "$DATA_DIR/FIRST-ADMIN.txt"
  echo "После входа смените пароль и удалите файл: rm $DATA_DIR/FIRST-ADMIN.txt"
fi
