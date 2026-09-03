#!/usr/bin/env bash
#
# One-shot bootstrap for a fresh Ubuntu 24.04 VPS: sets up staging +
# production side by side (separate DB, .env, systemd service, port and
# Nginx vhost each), wires up SSH access for GitHub Actions so future
# deploys are fully automatic (git push to `staging` or `main`).
#
# Run ONCE, as root, on a brand new VPS:
#   bash bootstrap-vps.sh
#
# HTTPS: set DOMAIN (and optionally STAGING_DOMAIN, default staging.$DOMAIN)
# to hostnames whose DNS already points at this server, and the script gets
# Let's Encrypt certificates and serves both environments over TLS:
#   DOMAIN=crm.example.ru EMAIL=admin@example.ru bash bootstrap-vps.sh
# Without DOMAIN it falls back to plain HTTP on the IP (port 80 / 8080) —
# fine for a first look, not for real use: passwords travel unencrypted.
#
# Safe-ish to re-run: it skips steps that already succeeded (DB
# users/databases, .env files, cloned repos) instead of clobbering them.
# The GitHub Actions SSH key is the one exception — it is regenerated
# every run, so re-running after the initial setup means updating the
# VPS_SSH_KEY secret on GitHub again with the newly printed value.

set -euo pipefail

GITHUB_REPO="git@github.com:vladimirsch888/omg.git"
APP_USER="deploy"
STAGING_DIR="/opt/revenue-saas-staging"
PROD_DIR="/opt/revenue-saas-prod"
DOMAIN="${DOMAIN:-}"
STAGING_DOMAIN="${STAGING_DOMAIN:-${DOMAIN:+staging.$DOMAIN}}"
EMAIL="${EMAIL:-}"
TIMEZONE="${TIMEZONE:-Europe/Moscow}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите скрипт от root (например: sudo bash bootstrap-vps.sh)" >&2
  exit 1
fi

echo "== [1/10] Обновление системы и swap =="
apt-get update -y && apt-get upgrade -y
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "swap создан (2G)"
else
  echo "swap уже существует, пропускаю"
fi

echo "== [2/10] Node.js 24 LTS, PostgreSQL, Nginx, Git =="
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
apt-get install -y git nginx postgresql postgresql-contrib openssl curl ufw apache2-utils
if [ -n "$DOMAIN" ]; then
  apt-get install -y certbot python3-certbot-nginx
fi
timedatectl set-timezone "$TIMEZONE" || true
node -v

echo "== [3/10] Пользователь приложения =="
id -u "$APP_USER" &>/dev/null || useradd -m -s /bin/bash "$APP_USER"
mkdir -p "$STAGING_DIR" "$PROD_DIR"
chown "$APP_USER:$APP_USER" "$STAGING_DIR" "$PROD_DIR"

echo "== [4/10] PostgreSQL: подготовка (создание/синхронизация делаем позже, вместе с .env) =="
db_user_exists() { sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$1'" | grep -q 1; }
db_exists() { sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$1'" | grep -q 1; }

PGCONF=$(find /etc/postgresql -name postgresql.conf | head -1)
if [ -n "$PGCONF" ]; then
  sed -i "s/^shared_buffers.*/shared_buffers = 128MB/" "$PGCONF"
  sed -i "s/^#work_mem.*/work_mem = 4MB/" "$PGCONF"
  systemctl restart postgresql
else
  echo "Не нашёл postgresql.conf — пропускаю тюнинг памяти (не критично)"
fi

echo "== [5/10] Ключ для чтения приватного репозитория GitHub =="
sudo -u "$APP_USER" mkdir -p "/home/$APP_USER/.ssh"
chmod 700 "/home/$APP_USER/.ssh"
REPO_KEY="/home/$APP_USER/.ssh/id_ed25519_repo"
if [ ! -f "$REPO_KEY" ]; then
  sudo -u "$APP_USER" ssh-keygen -t ed25519 -C "vps-repo-readonly" -f "$REPO_KEY" -N ""
fi
if ! grep -q "IdentityFile ~/.ssh/id_ed25519_repo" "/home/$APP_USER/.ssh/config" 2>/dev/null; then
  sudo -u "$APP_USER" bash -c "cat >> /home/$APP_USER/.ssh/config" <<'CFG'
Host github.com
  IdentityFile ~/.ssh/id_ed25519_repo
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
CFG
  chmod 600 "/home/$APP_USER/.ssh/config"
fi

if [ ! -d "$STAGING_DIR/.git" ]; then
  echo ""
  echo "############################################################"
  echo "# ДЕЙСТВИЕ: добавьте этот ключ как read-only Deploy Key    #"
  echo "# GitHub -> vladimirsch888/omg -> Settings -> Deploy keys  #"
  echo "# -> Add deploy key. \"Allow write access\" НЕ включать.    #"
  echo "############################################################"
  cat "${REPO_KEY}.pub"
  echo "############################################################"
  read -r -p "Нажмите Enter после того как добавили ключ на GitHub..."
fi

echo "== [6/10] Клонирование репозитория (staging + production) =="
clone_or_update() {
  local dir="$1" branch="$2"
  if [ -d "$dir/.git" ]; then
    sudo -u "$APP_USER" git -C "$dir" fetch origin
  else
    sudo -u "$APP_USER" git clone "$GITHUB_REPO" "$dir"
  fi
  sudo -u "$APP_USER" git -C "$dir" checkout "$branch"
  sudo -u "$APP_USER" git -C "$dir" pull origin "$branch"
}
clone_or_update "$STAGING_DIR" staging
clone_or_update "$PROD_DIR" main

PUBLIC_IP=$(curl -fsS ifconfig.me || echo "СЕРВЕР_IP")

echo "== [7/10] Базы данных + .env (атомарно, чтобы пароль в .env всегда совпадал с реальным паролем в PostgreSQL) =="
setup_db_and_env() {
  local dir="$1" role="$2" dbname="$3" port="$4" cors="$5"
  local env_file="${dir}/apps/api/.env"

  if [ -f "$env_file" ]; then
    echo "  ${env_file} уже существует — БД и пароль не трогаю"
    db_exists "$dbname" || sudo -u postgres psql -c "CREATE DATABASE ${dbname} OWNER ${role};"
    return
  fi

  # hex, а не base64 — пароль без /+= гарантированно не сломает строку подключения
  local password
  password=$(openssl rand -hex 24)

  if db_user_exists "$role"; then
    sudo -u postgres psql -c "ALTER USER ${role} WITH PASSWORD '${password}';"
  else
    sudo -u postgres psql -c "CREATE USER ${role} WITH PASSWORD '${password}' CREATEDB;"
  fi
  db_exists "$dbname" || sudo -u postgres psql -c "CREATE DATABASE ${dbname} OWNER ${role};"

  sudo -u "$APP_USER" bash -c "cat > '${env_file}'" <<EOF
DATABASE_URL="postgresql://${role}:${password}@localhost:5432/${dbname}?schema=public"
JWT_SECRET="$(openssl rand -base64 48)"
PORT=${port}
CORS_ORIGIN="${cors}"
TZ="${TIMEZONE}"
TAX_RESERVE_PERCENT=7
# Саморегистрация закрыта: первый владелец регистрируется, пока база пуста,
# остальных заводит владелец в разделе «Пользователи».
ALLOW_REGISTRATION=false
# Дайджест напоминаний в Telegram (необязательно)
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""
TELEGRAM_DIGEST_HOUR=9
EOF
  chmod 600 "$env_file"
}

if [ -n "$DOMAIN" ]; then
  PROD_ORIGIN="https://${DOMAIN}"
  STAGING_ORIGIN="https://${STAGING_DOMAIN}"
else
  PROD_ORIGIN="http://${PUBLIC_IP}"
  STAGING_ORIGIN="http://${PUBLIC_IP}:8080"
fi
setup_db_and_env "$STAGING_DIR" revenue_staging revenue_saas_staging 4001 "$STAGING_ORIGIN"
setup_db_and_env "$PROD_DIR" revenue_prod revenue_saas_prod 4000 "$PROD_ORIGIN"

echo "== [8/10] Установка зависимостей, сборка, миграции =="
for DIR in "$STAGING_DIR" "$PROD_DIR"; do
  sudo -u "$APP_USER" bash -c "cd '$DIR' && npm install"
  sudo -u "$APP_USER" bash -c "cd '$DIR' && npm run build:api"
  sudo -u "$APP_USER" bash -c "cd '$DIR' && npm run prisma:deploy --workspace apps/api"
  sudo -u "$APP_USER" bash -c "cd '$DIR' && npm run build:web"
done

echo "== [9/10] systemd-сервисы =="
cat > /etc/systemd/system/revenue-api-staging.service <<EOF
[Unit]
Description=Revenue SaaS API (staging)
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=${STAGING_DIR}/apps/api
EnvironmentFile=${STAGING_DIR}/apps/api/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=3
User=${APP_USER}
MemoryMax=256M

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/revenue-api-prod.service <<EOF
[Unit]
Description=Revenue SaaS API (production)
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=${PROD_DIR}/apps/api
EnvironmentFile=${PROD_DIR}/apps/api/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=3
User=${APP_USER}
MemoryMax=256M

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now revenue-api-staging revenue-api-prod
systemctl restart revenue-api-staging revenue-api-prod

# Let GitHub Actions restart the two services over SSH without a password,
# but nothing else — least privilege for the CI deploy user.
cat > /etc/sudoers.d/deploy-restart <<EOF
${APP_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl restart revenue-api-staging, /usr/bin/systemctl restart revenue-api-prod
EOF
chmod 440 /etc/sudoers.d/deploy-restart

echo "== [10/10] Nginx =="

# Staging is a copy of production data-wise nothing, but it still runs the
# same login screen — put HTTP basic auth in front so it isn't a public
# playground. The password is printed at the end.
STAGING_HTPASSWD="/etc/nginx/.htpasswd-staging"
if [ ! -f "$STAGING_HTPASSWD" ]; then
  STAGING_BASIC_PASS="$(openssl rand -hex 8)"
  htpasswd -cb "$STAGING_HTPASSWD" staging "$STAGING_BASIC_PASS"
  echo "$STAGING_BASIC_PASS" > /root/.staging-basic-auth
  chmod 600 /root/.staging-basic-auth
else
  STAGING_BASIC_PASS="$(cat /root/.staging-basic-auth 2>/dev/null || echo '(см. /etc/nginx/.htpasswd-staging — пароль задан ранее)')"
fi

# Shared snippets: security headers, the SPA fallback and cache rules.
# index.html must never be cached (a stale one references deleted bundles
# after a deploy → white screen), hashed assets can be cached forever.
cat > /etc/nginx/snippets/revenue-common.conf <<EOF
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    client_max_body_size 2m;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    location /api/ {
        proxy_pass http://127.0.0.1:__API_PORT__;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files \$uri =404;
    }

    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location / {
        try_files \$uri /index.html;
    }
EOF

write_vhost() {
  local file="$1" listen="$2" server_name="$3" root="$4" api_port="$5" extra="$6"
  cat > "$file" <<EOF
server {
    listen ${listen};
    server_name ${server_name};

    root ${root};
    index index.html;
${extra}
$(sed "s/__API_PORT__/${api_port}/" /etc/nginx/snippets/revenue-common.conf)
}
EOF
}

STAGING_AUTH="    auth_basic \"Staging\";
    auth_basic_user_file ${STAGING_HTPASSWD};"

if [ -n "$DOMAIN" ]; then
  write_vhost /etc/nginx/sites-available/revenue-prod "80" "$DOMAIN" "${PROD_DIR}/apps/web/dist" 4000 ""
  write_vhost /etc/nginx/sites-available/revenue-staging "80" "$STAGING_DOMAIN" "${STAGING_DIR}/apps/web/dist" 4001 "$STAGING_AUTH"
  ln -sf /etc/nginx/sites-available/revenue-prod /etc/nginx/sites-enabled/revenue-prod
  ln -sf /etc/nginx/sites-available/revenue-staging /etc/nginx/sites-enabled/revenue-staging
  rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/revenue-saas
  nginx -t && systemctl restart nginx
  # certbot rewrites both vhosts with listen 443 + the certificate and adds a
  # permanent http→https redirect.
  certbot --nginx --non-interactive --agree-tos --redirect \
    ${EMAIL:+--email "$EMAIL"} ${EMAIL:---register-unsafely-without-email} \
    -d "$DOMAIN" -d "$STAGING_DOMAIN"
  # HSTS only once TLS really works.
  for f in /etc/nginx/sites-available/revenue-prod /etc/nginx/sites-available/revenue-staging; do
    grep -q "Strict-Transport-Security" "$f" || sed -i '0,/listen 443 ssl/s//listen 443 ssl;\n    add_header Strict-Transport-Security "max-age=31536000" always/' "$f"
  done
  nginx -t && systemctl reload nginx
else
  write_vhost /etc/nginx/sites-available/revenue-prod "80 default_server" "_" "${PROD_DIR}/apps/web/dist" 4000 ""
  write_vhost /etc/nginx/sites-available/revenue-staging "8080" "_" "${STAGING_DIR}/apps/web/dist" 4001 "$STAGING_AUTH"
  ln -sf /etc/nginx/sites-available/revenue-prod /etc/nginx/sites-enabled/revenue-prod
  ln -sf /etc/nginx/sites-available/revenue-staging /etc/nginx/sites-enabled/revenue-staging
  rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/revenue-saas
  nginx -t && systemctl restart nginx
fi

echo "== Бэкапы и самопроверка =="
install -m 755 "${PROD_DIR}/deploy/backup.sh" /usr/local/bin/revenue-backup
install -m 755 "${PROD_DIR}/deploy/healthcheck.sh" /usr/local/bin/revenue-healthcheck
cat > /etc/cron.d/revenue-saas <<EOF
# Nightly PostgreSQL dumps (kept 14 days) and a 5-minute API self-check.
0 3 * * * root /usr/local/bin/revenue-backup >> /var/log/revenue-backup.log 2>&1
*/5 * * * * root /usr/local/bin/revenue-healthcheck
EOF
chmod 644 /etc/cron.d/revenue-saas
/usr/local/bin/revenue-backup || echo "первый бэкап не удался — проверьте /var/log/revenue-backup.log"

ufw allow OpenSSH || true
ufw allow 80/tcp || true
if [ -n "$DOMAIN" ]; then
  ufw allow 443/tcp || true
else
  ufw allow 8080/tcp || true
fi
yes | ufw enable || true

echo "== Ключ для GitHub Actions (доступ CI к серверу) =="
CI_KEY=$(mktemp -u)
ssh-keygen -t ed25519 -C "github-actions-ci" -f "$CI_KEY" -N ""
sudo -u "$APP_USER" bash -c "mkdir -p /home/$APP_USER/.ssh && touch /home/$APP_USER/.ssh/authorized_keys && cat '${CI_KEY}.pub' >> /home/$APP_USER/.ssh/authorized_keys && chmod 600 /home/$APP_USER/.ssh/authorized_keys"

echo ""
echo "======================================================================"
echo "ГОТОВО. Добавьте 3 секрета в GitHub:"
echo "vladimirsch888/omg -> Settings -> Secrets and variables -> Actions"
echo "-> New repository secret"
echo ""
echo "  VPS_HOST     = ${PUBLIC_IP}"
echo "  VPS_USER     = ${APP_USER}"
echo "  VPS_SSH_KEY  = (весь текст ниже целиком, включая строки BEGIN/END)"
echo "----------------------------------------------------------------------"
cat "$CI_KEY"
echo "----------------------------------------------------------------------"
rm -f "$CI_KEY" "${CI_KEY}.pub"
echo ""
echo "Production:  ${PROD_ORIGIN}/"
echo "Staging:     ${STAGING_ORIGIN}/  (basic auth: staging / ${STAGING_BASIC_PASS})"
echo ""
echo "Бэкапы: /opt/backups/revenue-saas (ежедневно в 03:00, хранятся 14 дней)."
echo "Самопроверка API: каждые 5 минут, лог в /var/log/revenue-healthcheck.log."
if [ -z "$DOMAIN" ]; then
  echo ""
  echo "ВНИМАНИЕ: сервер работает по HTTP. Для HTTPS направьте домен на этот IP и"
  echo "перезапустите скрипт: DOMAIN=ваш.домен EMAIL=почта bash bootstrap-vps.sh"
fi
echo ""
echo "После добавления секретов ничего больше на сервере делать не нужно —"
echo "дальнейшие обновления приходят через git push в staging/main."
echo "======================================================================"
