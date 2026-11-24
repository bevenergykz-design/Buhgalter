#!/usr/bin/env bash
# Первичная установка сайта «Диалог Учёт» на VPS (Ubuntu 22.04/24.04, Debian 12). Запуск от root:
#   bash setup-vps.sh
# Можно повторять — уже сделанное пропускается.
# Что делает: Node.js 22, Nginx, Certbot, пользователь dialog, код из GitHub, служба systemd,
# автообновление из GitHub каждые 2 минуты, еженедельный архив данных, брандмауэр.
# HTTPS выпускается, только если домен уже указывает на этот сервер; иначе — позже командой из конца вывода.
set -euo pipefail

DOMAIN="${DOMAIN:-dialog-uchet.kz}"
REPO="${REPO:-https://github.com/bevenergykz-design/Buhgalter.git}"
BRANCH="${BRANCH:-main}"
ADMIN_EMAIL="${ADMIN_EMAIL:-info@${DOMAIN}}"
APP_DIR=/srv/dialog-uchet/app
DATA_DIR=/srv/dialog-uchet/data
APP_USER=dialog
export DEBIAN_FRONTEND=noninteractive

echo "==> Пакеты системы"
apt-get update -y
apt-get install -y curl git nginx ca-certificates gnupg ufw sqlite3 unattended-upgrades dnsutils
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  echo "==> Node.js 22 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if (a<22||(a===22&&b<13)) { console.error("Нужен Node.js >= 22.13, установлен "+process.version); process.exit(1) }'
apt-get install -y certbot python3-certbot-nginx
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true   # обновления безопасности сами

echo "==> Файл подкачки (на сервере 1 ГБ памяти)"
if ! swapon --show | grep -q .; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
timedatectl set-timezone Asia/Almaty 2>/dev/null || true

echo "==> Пользователь и папки"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir /srv/dialog-uchet --shell /bin/bash "$APP_USER"
mkdir -p "$DATA_DIR"
chown "$APP_USER:$APP_USER" /srv/dialog-uchet "$DATA_DIR"
chmod 700 "$DATA_DIR"

echo "==> Код сайта ($REPO, ветка $BRANCH)"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" -H git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
else
  sudo -u "$APP_USER" -H git -C "$APP_DIR" fetch origin "$BRANCH"
  sudo -u "$APP_USER" -H git -C "$APP_DIR" checkout -B "$BRANCH" "origin/$BRANCH"
fi
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npm ci --omit=dev --no-audit --no-fund"

echo "==> Настройки сайта /etc/dialog-uchet.env"
ENV_FILE=/etc/dialog-uchet.env
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
DATA_DIR=$DATA_DIR
ADMIN_EMAIL=$ADMIN_EMAIL
# ветка GitHub, из которой сервер сам берёт обновления
DEPLOY_BRANCH=$BRANCH
EOF
  chmod 640 "$ENV_FILE"; chown root:"$APP_USER" "$ENV_FILE"
fi
grep -q '^DEPLOY_BRANCH=' "$ENV_FILE" || echo "DEPLOY_BRANCH=$BRANCH" >> "$ENV_FILE"

echo "==> Службы systemd"
cp "$APP_DIR/deploy/dialog-uchet.service" /etc/systemd/system/
cp "$APP_DIR/deploy/dialog-uchet-update.service" "$APP_DIR/deploy/dialog-uchet-update.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now dialog-uchet
systemctl enable --now dialog-uchet-update.timer
sleep 3
systemctl --no-pager --lines=5 status dialog-uchet || true

echo "==> Еженедельный архив данных"
cat > /etc/cron.d/dialog-uchet-backup <<'EOF'
30 3 * * 0 root /bin/bash /srv/dialog-uchet/app/deploy/backup-data.sh >> /var/log/dialog-uchet-backup.log 2>&1
EOF

echo "==> Nginx"
cp "$APP_DIR/deploy/nginx-proxy.conf" /etc/nginx/snippets/dialog-uchet-proxy.conf
if [ ! -f /etc/nginx/sites-available/dialog-uchet.conf ]; then   # после certbot файл не перезаписываем
  sed "s/__DOMAIN__/${DOMAIN}/g" "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/dialog-uchet.conf
fi
ln -sf /etc/nginx/sites-available/dialog-uchet.conf /etc/nginx/sites-enabled/dialog-uchet.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> Брандмауэр"
ufw allow OpenSSH >/dev/null; ufw allow 'Nginx Full' >/dev/null; ufw --force enable >/dev/null

echo "==> HTTPS"
MY_IP="$(curl -fsS --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')"
DNS_IP="$(dig +short "$DOMAIN" A | tail -1)"
CERTBOT="certbot --nginx --non-interactive --agree-tos --redirect -m $ADMIN_EMAIL -d $DOMAIN -d www.$DOMAIN"
if [ "$DNS_IP" = "$MY_IP" ]; then
  $CERTBOT || echo "!!! Сертификат не выпущен, повторите: $CERTBOT"
else
  echo "Домен $DOMAIN пока указывает на ${DNS_IP:-—}, а сервер — $MY_IP. HTTPS выпустим после переключения A-записей:"
  echo "    $CERTBOT"
fi

echo
echo "Готово. Проверка по IP: http://$MY_IP   Автообновление: systemctl list-timers dialog-uchet-update.timer"
if [ -f "$DATA_DIR/FIRST-ADMIN.txt" ]; then
  echo "Данные первого входа в панель: $DATA_DIR/FIRST-ADMIN.txt (прочитайте и удалите)"
fi
