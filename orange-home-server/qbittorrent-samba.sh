#!/bin/bash
set -e

echo "🚀 [2/3] Установка qBittorrent-nox и Samba..."

if [ "$EUID" -ne 0 ]; then
  echo "❌ Ошибка: Запустите скрипт от имени root (sudo bash $0)"
  exit 1
fi

SHARE_DIR="/mnt/shared"
QBITTORRENT_USER="qbittorrent"
QBITTORRENT_PORT="8080"

# 1. Установка пакетов
echo "📦 Обновление и установка пакетов..."
apt update -y
apt install -y qbittorrent-nox samba samba-common-bin

# 2. Создание пользователя
echo "👤 Настройка пользователя ${QBITTORRENT_USER}..."
if ! id -u "$QBITTORRENT_USER" >/dev/null 2>&1; then
  useradd -r -m -s /usr/sbin/nologin "$QBITTORRENT_USER"
  echo "✅ Пользователь создан."
else
  echo "ℹ️ Пользователь уже существует."
fi

# 3. Настройка папки
echo "📁 Настройка папки ${SHARE_DIR}..."
mkdir -p "$SHARE_DIR"
chown -R "$QBITTORRENT_USER":"$QBITTORRENT_USER" "${SHARE_DIR}"
chmod -R 775 "${SHARE_DIR}"

# 4. Настройка Samba
echo "⚙️ Настройка Samba..."
if [ ! -f /etc/samba/smb.conf.backup ]; then
  cp /etc/samba/smb.conf /etc/samba/smb.conf.backup
fi

# Удаляем старую секцию [shared], если она есть, чтобы избежать дублирования при повторном запуске
sed -i '/^\[shared\]/,/^$/d' /etc/samba/smb.conf

cat << EOF >> /etc/samba/smb.conf

# Orange Pi Home Server - Shared Folder
[shared]
   comment = Orange Pi Shared Storage
   path = ${SHARE_DIR}
   valid users = ${QBITTORRENT_USER}
   read only = no
   browsable = yes
   create mask = 0664
   directory mask = 0775
   force user = ${QBITTORRENT_USER}
   force group = ${QBITTORRENT_USER}
EOF

echo "🔐 Установка пароля Samba для ${QBITTORRENT_USER}..."
echo "⚠️ ВНИМАНИЕ: Сейчас потребуется ввести пароль дважды (минимум 8 символов)."
smbpasswd -a "$QBITTORRENT_USER"

# 5. Systemd сервис для qBittorrent
echo "🔧 Настройка сервиса qBittorrent-nox..."
cat << EOF > /etc/systemd/system/qbittorrent-nox.service
[Unit]
Description=qBittorrent-nox Daemon
After=network.target

[Service]
Type=simple
User=${QBITTORRENT_USER}
Group=${QBITTORRENT_USER}
ExecStart=/usr/bin/qbittorrent-nox --webui-port=${QBITTORRENT_PORT}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 6. Перезагрузка и запуск
echo "🔄 Включение и запуск сервисов..."
systemctl daemon-reload
systemctl enable qbittorrent-nox smbd nmbd
systemctl restart qbittorrent-nox smbd nmbd

# 7. Брандмауэр
ufw allow ${QBITTORRENT_PORT}/tcp || true
ufw allow samba || true

echo "✅ [2/3] Готово!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 qBittorrent Web UI: http://$(hostname -I | awk '{print $1}'):${QBITTORRENT_PORT}"
echo "   Логин: admin | Пароль: adminadmin (СМЕНИТЕ в настройках!)"
echo "📁 Samba Share: \\\\$(hostname -I | awk '{print $1}')\\shared"
echo "   Пользователь: ${QBITTORRENT_USER}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"