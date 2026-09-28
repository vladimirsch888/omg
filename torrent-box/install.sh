#!/usr/bin/env bash
#
# Торрент-качалка на VPS: qBittorrent-nox (с мобильным веб-интерфейсом
# VueTorrent) за Nginx + HTTPS (Let's Encrypt) + раздача готовых файлов
# по ссылке под логином/паролем.
#
#   https://<домен>/        — веб-морда: загрузить .torrent / magnet, управлять
#   https://<домен>/files/  — готовые файлы, прямые ссылки для скачивания на iPhone
#   https://<домен>/links   — список последних завершённых загрузок со ссылками
#
# Запуск (от root, Ubuntu 22.04/24.04):
#   sudo bash install.sh
#
# Параметры можно передать переменными окружения (иначе спросит / подберёт сам):
#   DOMAIN         домен, A-запись которого указывает на этот VPS.
#                  По умолчанию torrent.<ip-с-дефисами>.sslip.io — работает
#                  без покупки домена.
#   TORRENT_USER   логин (по умолчанию admin)
#   TORRENT_PASS   пароль (по умолчанию спросит; без терминала — сгенерирует)
#   LE_EMAIL       e-mail для Let's Encrypt (необязательно)
#   TG_BOT_TOKEN, TG_CHAT_ID — если заданы, по завершении скачивания
#                  ссылка придёт в Telegram.
#   WEBUI          vuetorrent (по умолчанию, удобно с телефона) или classic
#   SFTP           yes (по умолчанию) — доступ к готовым файлам по SFTP только
#                  на чтение (для VLC на iPhone); no — не настраивать
#   SFTP_USER      логин для SFTP (по умолчанию media), пароль тот же
#
# Скрипт можно перезапускать: он обновит логин/пароль, домен и настройки,
# не трогая уже скачанное и список торрентов.

set -euo pipefail

QBT_USER="qbt"
QBT_HOME="/var/lib/qbittorrent"
QBT_CONF="$QBT_HOME/qBittorrent/config/qBittorrent.conf"
QBT_PORT=8090          # веб-интерфейс, слушает только 127.0.0.1
PEER_PORT=6881         # входящие соединения торрент-клиента
DATA="/srv/torrent"
DOWNLOADS="$DATA/downloads"
INCOMPLETE="$DATA/incomplete"
WWW="$DATA/www"
ENV_FILE="/etc/torrent-box.env"
HOOK="/usr/local/bin/torrent-box-finished"
HTPASSWD="/etc/nginx/torrent-box.htpasswd"
SITE="/etc/nginx/sites-available/torrent-box"

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите скрипт от root: sudo bash install.sh" >&2
  exit 1
fi

# Прежние значения (при повторном запуске) — как значения по умолчанию.
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  PREV_DOMAIN=$(. "$ENV_FILE"; echo "${DOMAIN:-}")
  PREV_TG_BOT_TOKEN=$(. "$ENV_FILE"; echo "${TG_BOT_TOKEN:-}")
  PREV_TG_CHAT_ID=$(. "$ENV_FILE"; echo "${TG_CHAT_ID:-}")
  PREV_TORRENT_USER=$(. "$ENV_FILE"; echo "${TORRENT_USER:-}")
  PREV_SFTP_USER=$(. "$ENV_FILE"; echo "${SFTP_USER:-}")
fi

echo "== [1/9] Пакеты =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y || echo "!! apt-get update завершился с ошибкой — продолжаю с текущими списками пакетов"
apt-get install -y qbittorrent-nox nginx certbot python3-certbot-nginx python3 openssl curl unzip
SFTP="${SFTP:-yes}"
if [ "$SFTP" = "yes" ]; then
  apt-get install -y openssh-server fail2ban
fi

echo "== [2/9] Домен, логин, пароль =="
if [ -z "${DOMAIN:-}" ]; then
  DOMAIN="${PREV_DOMAIN:-}"
fi
if [ -z "${DOMAIN:-}" ]; then
  IP=$(curl -4 -fsS --max-time 10 https://api.ipify.org || curl -4 -fsS --max-time 10 https://ifconfig.me || true)
  if [ -z "$IP" ]; then
    echo "Не удалось определить внешний IP. Задайте домен явно: DOMAIN=torrent.example.com bash install.sh" >&2
    exit 1
  fi
  DOMAIN="torrent.${IP//./-}.sslip.io"
fi
TORRENT_USER="${TORRENT_USER:-${PREV_TORRENT_USER:-admin}}"
# При повторном запуске пустой пароль = оставить текущий (если логин тот же).
CAN_KEEP=""
if [ -f "$QBT_CONF" ] && [ -f "$HTPASSWD" ] && [ "$TORRENT_USER" = "${PREV_TORRENT_USER:-}" ]; then
  CAN_KEEP=1
fi
if [ -z "${TORRENT_PASS:-}" ] && [ -t 0 ]; then
  if [ -n "$CAN_KEEP" ]; then HINT="Enter — оставить текущий"; else HINT="Enter — сгенерировать"; fi
  while true; do
    read -rsp "Пароль для $TORRENT_USER (минимум 8 символов, $HINT): " TORRENT_PASS; echo
    [ -z "$TORRENT_PASS" ] && break
    [ "${#TORRENT_PASS}" -ge 8 ] && break
    echo "Слишком короткий."
  done
fi
KEEP_PASS=""
if [ -z "${TORRENT_PASS:-}" ]; then
  if [ -n "$CAN_KEEP" ]; then
    KEEP_PASS=1
  else
    TORRENT_PASS=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)
    GENERATED_PASS=1
  fi
fi
TG_BOT_TOKEN="${TG_BOT_TOKEN:-${PREV_TG_BOT_TOKEN:-}}"
TG_CHAT_ID="${TG_CHAT_ID:-${PREV_TG_CHAT_ID:-}}"
WEBUI="${WEBUI:-vuetorrent}"
SFTP_USER="${SFTP_USER:-${PREV_SFTP_USER:-media}}"
echo "Домен: $DOMAIN, логин: $TORRENT_USER"

echo "== [3/9] Пользователь и каталоги =="
id -u "$QBT_USER" &>/dev/null || useradd --system --home-dir "$QBT_HOME" --create-home --shell /usr/sbin/nologin "$QBT_USER"
mkdir -p "$DOWNLOADS" "$INCOMPLETE" "$WWW" "$(dirname "$QBT_CONF")"
chown -R "$QBT_USER:$QBT_USER" "$QBT_HOME" "$DOWNLOADS" "$INCOMPLETE" "$WWW"
# Корень $DATA принадлежит root: этого требует chroot SFTP в sshd.
chown root:root "$DATA"
chmod 755 "$DATA" "$DOWNLOADS" "$WWW"
chmod 750 "$INCOMPLETE"

cat > "$ENV_FILE" <<EOF
DOMAIN='$DOMAIN'
DOWNLOADS='$DOWNLOADS'
WWW='$WWW'
TG_BOT_TOKEN='$TG_BOT_TOKEN'
TG_CHAT_ID='$TG_CHAT_ID'
TORRENT_USER='$TORRENT_USER'
SFTP_USER='$SFTP_USER'
EOF
chown "root:$QBT_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

echo "== [4/9] Веб-интерфейс =="
ALT_UI=false
if [ "$WEBUI" = "vuetorrent" ]; then
  TMP_ZIP=$(mktemp --suffix=.zip)
  if curl -fsSL --max-time 120 -o "$TMP_ZIP" https://github.com/VueTorrent/VueTorrent/releases/latest/download/vuetorrent.zip; then
    rm -rf "$QBT_HOME/vuetorrent"
    unzip -q -o "$TMP_ZIP" -d "$QBT_HOME"
    chown -R "$QBT_USER:$QBT_USER" "$QBT_HOME/vuetorrent"
    ALT_UI=true
    echo "VueTorrent $(cat "$QBT_HOME/vuetorrent/version.txt" 2>/dev/null || true) установлен"
  else
    echo "Не удалось скачать VueTorrent — будет стандартный интерфейс qBittorrent"
  fi
  rm -f "$TMP_ZIP"
fi

echo "== [5/9] Хук «скачивание завершено» =="
cat > "$HOOK" <<'PY'
#!/usr/bin/env python3
"""Вызывается qBittorrent по завершении торрента: torrent-box-finished NAME CONTENT_PATH.

Строит ссылку https://<домен>/files/..., обновляет страницу /links и,
если настроено, отправляет ссылку в Telegram.
"""
import html
import json
import os
import sys
import time
import urllib.parse
import urllib.request

ENV_FILE = "/etc/torrent-box.env"
MAX_ITEMS = 100


def read_env():
    env = {}
    with open(ENV_FILE, encoding="utf-8") as f:
        for line in f:
            key, sep, value = line.strip().partition("=")
            if sep:
                env[key] = value.strip("'")
    return env


def human_size(path):
    total = 0
    if os.path.isdir(path):
        for root, _, files in os.walk(path):
            for name in files:
                try:
                    total += os.path.getsize(os.path.join(root, name))
                except OSError:
                    pass
    elif os.path.exists(path):
        total = os.path.getsize(path)
    for unit in ("Б", "КБ", "МБ", "ГБ"):
        if total < 1024:
            return f"{total:.0f} {unit}"
        total /= 1024
    return f"{total:.1f} ТБ"


def render(items, www):
    rows = "\n".join(
        f'<li><a href="{html.escape(i["url"])}">{html.escape(i["name"])}</a>'
        f'<span>{html.escape(i["size"])} · {html.escape(i["time"])}</span></li>'
        for i in items
    ) or "<li>Пока ничего не скачано</li>"
    page = f"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Готовые загрузки</title><style>
body{{font:16px -apple-system,system-ui,sans-serif;margin:0;padding:16px;background:#111;color:#eee}}
h1{{font-size:20px}} a{{color:#6cf;word-break:break-all}} ul{{list-style:none;padding:0}}
li{{padding:12px 0;border-bottom:1px solid #333}} span{{display:block;color:#999;font-size:13px;margin-top:4px}}
nav a{{margin-right:16px}}
</style></head><body><h1>Готовые загрузки</h1>
<nav><a href="/">Торренты</a><a href="/files/">Все файлы</a></nav>
<ul>{rows}</ul></body></html>"""
    tmp = os.path.join(www, ".links.html.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(page)
    os.replace(tmp, os.path.join(www, "links.html"))


def main():
    env = read_env()
    if len(sys.argv) < 3:
        # Без аргументов — просто перерисовать страницу.
        name, path = None, None
    else:
        name, path = sys.argv[1], sys.argv[2]

    www, downloads = env["WWW"], env["DOWNLOADS"]
    state_file = os.path.join(www, ".links.json")
    try:
        with open(state_file, encoding="utf-8") as f:
            items = json.load(f)
    except (OSError, ValueError):
        items = []

    if name:
        rel = os.path.relpath(os.path.realpath(path), os.path.realpath(downloads))
        if rel.startswith(".."):
            rel = os.path.basename(path)
        url = f'https://{env["DOMAIN"]}/files/' + urllib.parse.quote(rel)
        if os.path.isdir(path):
            url += "/"
        items.insert(0, {
            "name": name,
            "url": url,
            "size": human_size(path),
            "time": time.strftime("%d.%m.%Y %H:%M"),
        })
        items = items[:MAX_ITEMS]
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False)

        token, chat = env.get("TG_BOT_TOKEN"), env.get("TG_CHAT_ID")
        if token and chat:
            text = f"✅ Скачано: {name} ({items[0]['size']})\n{url}"
            data = urllib.parse.urlencode({"chat_id": chat, "text": text}).encode()
            try:
                urllib.request.urlopen(f"https://api.telegram.org/bot{token}/sendMessage", data, timeout=15)
            except Exception as e:  # уведомление не должно ломать остальное
                print(f"telegram: {e}", file=sys.stderr)

    render(items, www)


if __name__ == "__main__":
    main()
PY
chmod 755 "$HOOK"
runuser -u "$QBT_USER" -- "$HOOK"   # создать пустую страницу /links

echo "== [6/9] Настройки qBittorrent =="
systemctl stop qbittorrent-nox 2>/dev/null || true
QBT_CONF="$QBT_CONF" TORRENT_USER="$TORRENT_USER" TORRENT_PASS="${TORRENT_PASS:-}" \
QBT_PORT="$QBT_PORT" PEER_PORT="$PEER_PORT" DOWNLOADS="$DOWNLOADS" INCOMPLETE="$INCOMPLETE" \
HOOK="$HOOK" ALT_UI="$ALT_UI" QBT_HOME="$QBT_HOME" python3 - <<'PY'
import base64, configparser, hashlib, os

e = os.environ

cfg = configparser.RawConfigParser(delimiters=("=",), strict=False)
cfg.optionxform = str
cfg.read(e["QBT_CONF"], encoding="utf-8")

settings = {
    "LegalNotice": {"Accepted": "true"},
    "AutoRun": {
        "enabled": "true",
        # Формат QSettings: кавычки экранируются обратным слешем.
        "program": '%s \\"%%N\\" \\"%%F\\"' % e["HOOK"],
    },
    "BitTorrent": {
        "Session\\DefaultSavePath": e["DOWNLOADS"],
        "Session\\TempPath": e["INCOMPLETE"],
        "Session\\TempPathEnabled": "true",
        "Session\\Port": e["PEER_PORT"],
    },
    "Network": {"PortForwardingEnabled": "false"},
    "Preferences": {
        "General\\Locale": "ru",
        "WebUI\\Address": "127.0.0.1",
        "WebUI\\Port": e["QBT_PORT"],
        "WebUI\\Username": e["TORRENT_USER"],
        "WebUI\\LocalHostAuth": "true",
        "WebUI\\ReverseProxySupportEnabled": "true",
        "WebUI\\TrustedReverseProxiesList": "127.0.0.1",
        "WebUI\\MaxAuthenticationFailCount": "5",
        "WebUI\\BanDuration": "3600",
        "WebUI\\SessionTimeout": "86400",
        "WebUI\\AlternativeUIEnabled": e["ALT_UI"],
        "WebUI\\RootFolder": os.path.join(e["QBT_HOME"], "vuetorrent"),
    },
}
if e["TORRENT_PASS"]:  # пусто — оставить текущий пароль
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha512", e["TORRENT_PASS"].encode(), salt, 100000, 64)
    pw = "@ByteArray(%s:%s)" % (base64.b64encode(salt).decode(), base64.b64encode(dk).decode())
    settings["Preferences"]["WebUI\\Password_PBKDF2"] = '"%s"' % pw

for section, values in settings.items():
    if not cfg.has_section(section):
        cfg.add_section(section)
    for k, v in values.items():
        cfg.set(section, k, v)

with open(e["QBT_CONF"], "w", encoding="utf-8") as f:
    cfg.write(f, space_around_delimiters=False)
PY
chown -R "$QBT_USER:$QBT_USER" "$QBT_HOME"

cat > /etc/systemd/system/qbittorrent-nox.service <<EOF
[Unit]
Description=qBittorrent-nox (torrent-box)
After=network-online.target
Wants=network-online.target

[Service]
User=$QBT_USER
Group=$QBT_USER
UMask=0022
ExecStart=/usr/bin/qbittorrent-nox --profile=$QBT_HOME --webui-port=$QBT_PORT
Restart=on-failure
TimeoutStopSec=60
# Не мешать остальным сервисам на этом VPS.
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now qbittorrent-nox
systemctl restart qbittorrent-nox

echo "== [7/9] Nginx + HTTPS =="
# Пароль для /files и /links — тот же, что и для веб-морды.
if [ -z "$KEEP_PASS" ]; then
  printf '%s:%s\n' "$TORRENT_USER" "$(openssl passwd -apr1 -stdin <<<"$TORRENT_PASS")" > "$HTPASSWD"
fi
chown root:www-data "$HTPASSWD"
chmod 640 "$HTPASSWD"

# Если сертификат уже выпущен (повторный запуск) — сразу пишем HTTPS-конфиг.
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
write_site() {
  local listen_block cookie_flags=""
  if [ -f "$CERT_DIR/fullchain.pem" ]; then
    cookie_flags="        proxy_cookie_flags ~ secure;"
    listen_block="    listen 443 ssl;
    ssl_certificate $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"
  else
    listen_block="    listen 80;"
  fi
  cat > "$SITE" <<EOF
server {
$listen_block
    server_name $DOMAIN;

    # .torrent-файлы бывают крупными
    client_max_body_size 50m;

    # Веб-морда qBittorrent (свой логин/пароль)
    location / {
        proxy_pass http://127.0.0.1:$QBT_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host 127.0.0.1:$QBT_PORT;
        proxy_set_header X-Forwarded-Host \$http_host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
$cookie_flags
    }

    # Готовые файлы: прямые ссылки для скачивания (докачка поддерживается)
    location /files/ {
        alias $DOWNLOADS/;
        autoindex on;
        autoindex_exact_size off;
        autoindex_localtime on;
        charset utf-8;
        auth_basic "Torrent files";
        auth_basic_user_file $HTPASSWD;
    }

    location = /links {
        alias $WWW/links.html;
        default_type text/html;
        charset utf-8;
        add_header Cache-Control no-store;
        auth_basic "Torrent files";
        auth_basic_user_file $HTPASSWD;
    }
}
EOF
  if [ -f "$CERT_DIR/fullchain.pem" ]; then
    cat >> "$SITE" <<EOF

server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}
EOF
  fi
}
write_site
ln -sf "$SITE" /etc/nginx/sites-enabled/torrent-box
nginx -t
systemctl enable nginx
systemctl reload nginx || systemctl restart nginx

if command -v ufw >/dev/null; then
  ufw allow 80/tcp >/dev/null || true
  ufw allow 443/tcp >/dev/null || true
  ufw allow "$PEER_PORT/tcp" >/dev/null || true
  ufw allow "$PEER_PORT/udp" >/dev/null || true
fi

SCHEME=http
if [ -f "$CERT_DIR/fullchain.pem" ]; then
  SCHEME=https
else
  if [ -n "${LE_EMAIL:-}" ]; then EMAIL_ARGS=(-m "$LE_EMAIL"); else EMAIL_ARGS=(--register-unsafely-without-email); fi
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos "${EMAIL_ARGS[@]}" --redirect; then
    write_site          # перезаписать в нашем формате, уже с сертификатом
    nginx -t && systemctl reload nginx
    SCHEME=https
  else
    echo "!! Не удалось получить HTTPS-сертификат. Проверьте, что $DOMAIN указывает на этот сервер"
    echo "!! и открыт порт 80, затем запустите скрипт ещё раз. Пока работает по HTTP."
  fi
fi

echo "== [8/9] SFTP для VLC =="
SSHD_DROPIN="/etc/ssh/sshd_config.d/torrent-box.conf"
SFTP_STATUS=""
if [ "$SFTP" = "yes" ]; then
  getent group torrent-sftp >/dev/null || groupadd --system torrent-sftp
  SFTP_NEW=""
  if ! id -u "$SFTP_USER" &>/dev/null; then
    useradd --no-create-home --home-dir "/$(basename "$DOWNLOADS")" --shell /usr/sbin/nologin \
      --gid torrent-sftp "$SFTP_USER"
    SFTP_NEW=1
  fi
  if [ "$(id -gn "$SFTP_USER")" != "torrent-sftp" ]; then
    echo "!! Пользователь $SFTP_USER уже существует и это не SFTP-пользователь качалки."
    echo "!! Задайте другой логин: SFTP_USER=... bash install.sh. SFTP пропущен."
  else
    # Пароль тот же, что и для веб-морды. Если веб-пароль оставлен прежним,
    # а SFTP-пользователь новый, прежнего пароля мы не знаем — генерируем.
    if [ -n "${TORRENT_PASS:-}" ]; then
      SFTP_PASS="$TORRENT_PASS"
    elif [ -n "$SFTP_NEW" ]; then
      SFTP_PASS=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)
      SFTP_PASS_GENERATED=1
    fi
    if [ -n "${SFTP_PASS:-}" ]; then
      printf '%s:%s\n' "$SFTP_USER" "$SFTP_PASS" | chpasswd
    fi
    usermod -U "$SFTP_USER" 2>/dev/null || true   # мог быть заблокирован при SFTP=no

    # Только SFTP, только чтение, видна только папка с загрузками.
    mkdir -p /run/sshd
    [ -f /etc/ssh/ssh_host_rsa_key ] || ssh-keygen -A
    cat > "$SSHD_DROPIN" <<EOF
# torrent-box: доступ к готовым файлам по SFTP (только чтение)

# VLC для iOS (его libssh2) умеет проверять ключ сервера только как ssh-rsa,
# а OpenSSH 8.8+ по умолчанию его не предлагает — без этого VLC не подключится.
# Современные клиенты по-прежнему выбирают ed25519.
HostKeyAlgorithms +ssh-rsa

Match Group torrent-sftp
    ChrootDirectory $DATA
    ForceCommand internal-sftp -R -d /$(basename "$DOWNLOADS")
    PasswordAuthentication yes
    AllowTcpForwarding no
    AllowAgentForwarding no
    X11Forwarding no
    PermitTTY no
EOF
    if sshd -t; then
      systemctl reload ssh 2>/dev/null || systemctl restart ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
      # Защита от подбора пароля: бан IP после нескольких неудачных попыток входа.
      systemctl enable --now fail2ban >/dev/null 2>&1 || true
      SSH_PORT=$(sshd -T 2>/dev/null | awk '$1=="port"{print $2; exit}')
      SSH_PORT="${SSH_PORT:-22}"
      if command -v ufw >/dev/null; then ufw allow "$SSH_PORT/tcp" >/dev/null || true; fi
      SFTP_STATUS=ok
    else
      rm -f "$SSHD_DROPIN"
      echo "!! Конфиг sshd не прошёл проверку, SFTP не включён (SSH не тронут)."
    fi
  fi
else
  if [ -f "$SSHD_DROPIN" ]; then
    rm -f "$SSHD_DROPIN"
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
    echo "SFTP выключен"
  fi
  if id -u "$SFTP_USER" &>/dev/null && [ "$(id -gn "$SFTP_USER")" = "torrent-sftp" ]; then
    usermod -L "$SFTP_USER"
  fi
fi

echo "== [9/9] Проверка =="
sleep 2
if curl -fsS -o /dev/null "http://127.0.0.1:$QBT_PORT/"; then
  echo "qBittorrent запущен"
else
  echo "!! qBittorrent не отвечает, смотрите: journalctl -u qbittorrent-nox -n 50"
fi

cat <<EOF

=====================================================================
 Готово!

 Веб-морда:        $SCHEME://$DOMAIN/
 Готовые файлы:    $SCHEME://$DOMAIN/files/
 Последние ссылки: $SCHEME://$DOMAIN/links

 Логин:  $TORRENT_USER
EOF
if [ -n "${GENERATED_PASS:-}" ]; then
  echo " Пароль: $TORRENT_PASS   (сгенерирован — сохраните его!)"
elif [ -n "$KEEP_PASS" ]; then
  echo " Пароль: прежний (не менялся)"
else
  echo " Пароль: тот, что вы ввели"
fi
if [ -n "$TG_BOT_TOKEN" ] && [ -n "$TG_CHAT_ID" ]; then
  echo
  echo " Уведомления в Telegram включены."
fi
if [ "$SFTP_STATUS" = ok ]; then
  echo
  echo " SFTP для VLC (Сеть → Подключиться к серверу → SFTP):"
  echo "   Сервер: $DOMAIN   Порт: $SSH_PORT"
  echo "   Логин:  $SFTP_USER"
  if [ -n "${SFTP_PASS_GENERATED:-}" ]; then
    echo "   Пароль: $SFTP_PASS   (сгенерирован — сохраните его!)"
  elif [ -n "${SFTP_PASS:-}" ]; then
    echo "   Пароль: тот же, что для веб-морды"
  else
    echo "   Пароль: прежний (не менялся)"
  fi
fi
cat <<EOF

 Сменить пароль/домен: запустите скрипт ещё раз.
 Логи: journalctl -u qbittorrent-nox -f
=====================================================================
EOF
