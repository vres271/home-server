#!/bin/bash

# Завершать скрипт при любой ошибке
set -e

echo "🚀 Начало установки qBittorrent-nox и Samba..."

# Проверка прав root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Ошибка: Пожалуйста, запустите скрипт от имени root (sudo ./setup-services.sh)"
  exit 1
fi

# Переменные конфигурации
SHARE_DIR="/mnt/shared"
QBITTORRENT_USER="qbittorrent"
QBITTORRENT_PORT="8080"
SAMBA_WORKGROUP="WORKGROUP"

# 1. Обновление системы и установка пакетов
echo "📦 Обновление пакетов и установка qBittorrent-nox и Samba..."
apt update -y
apt install -y qbittorrent-nox samba samba-common-bin

# 2. Создание пользователя для qBittorrent (если не существует)
echo "👤 Создание пользователя ${QBITTORRENT_USER}..."
if ! id -u "$QBITTORRENT_USER" >/dev/null 2>&1; then
  useradd -r -m -s /usr/sbin/nologin "$QBITTORRENT_USER"
  echo "✅ Пользователь ${QBITTORRENT_USER} создан"
else
  echo "ℹ️ Пользователь ${QBITTORRENT_USER} уже существует"
fi

# 3. Создание и настройка папки для торрентов
echo "📁 Настройка папки ${SHARE_DIR}..."
if [ ! -d "$SHARE_DIR" ]; then
  echo "⚠️ Папка ${SHARE_DIR} не существует. Создаю..."
  mkdir -p "$SHARE_DIR"
fi

# Назначаем права
chown -R "$QBITTORRENT_USER":"$QBITTORRENT_USER" "${SHARE_DIR}"
chmod -R 775 "${SHARE_DIR}"

echo "✅ Папка ${SHARE_DIR} настроена с правами для ${QBITTORRENT_USER}"

# 4. Настройка Samba
echo "⚙️ Настройка Samba..."

# Резервная копия оригинального smb.conf
if [ ! -f /etc/samba/smb.conf.backup ]; then
  cp /etc/samba/smb.conf /etc/samba/smb.conf.backup
  echo "✅ Резервная копия smb.conf создана"
fi

# Добавляем конфигурацию шары
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

echo "✅ Конфигурация Samba добавлена"

# 5. Добавление пользователя в Samba
echo "🔐 Настройка пароля Samba для пользователя ${QBITTORRENT_USER}..."
echo "Введите пароль для доступа к Samba (минимум 8 символов):"
smbpasswd -a "$QBITTORRENT_USER"

# 6. Создание systemd service для qBittorrent-nox
echo "🔧 Создание systemd service для qBittorrent-nox..."
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

# 7. Перезагрузка systemd и включение сервисов
echo "🔄 Включение автозапуска сервисов..."
systemctl daemon-reload
systemctl enable qbittorrent-nox
systemctl enable smbd
systemctl enable nmbd

# 8. Запуск сервисов
echo "▶️ Запуск сервисов..."
systemctl start qbittorrent-nox
systemctl restart smbd
systemctl restart nmbd

# 9. Настройка брандмауэра (если UFW активен)
echo "🛡️ Настройка брандмауэра..."
ufw allow ${QBITTORRENT_PORT}/tcp || true  # qBittorrent Web UI
ufw allow samba || true                    # Samba (порты 137, 138, 139, 445)

# 10. Проверка статуса
echo "🧪 Проверка статуса сервисов..."
systemctl status qbittorrent-nox --no-pager -l
systemctl status smbd --no-pager -l

echo ""
echo "✅ Готово! Все сервисы установлены и запущены."
echo ""
echo "📋 Информация для подключения:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 qBittorrent Web UI: http://$(hostname -I | awk '{print $1}'):${QBITTORRENT_PORT}"
echo "   Логин: admin"
echo "   Пароль: adminadmin (СМЕНИТЕ ПАРОЛЬ при первом входе!)"
echo ""
echo "📁 Samba Share: \\\\$(hostname -I | awk '{print $1}')\\shared"
echo "   Пользователь: ${QBITTORRENT_USER}"
echo "   Пароль: (тот, что вы только что ввели)"
echo ""
echo "📂 Папка торрентов: ${SHARE_DIR}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️ ВАЖНО: При первом входе в qBittorrent Web UI:"
echo "   1. Зайдите в Настройки → Веб-интерфейс"
echo "   2. Смените пароль по умолчанию!"
echo "   3. Убедитесь, что 'Путь сохранения по умолчанию' = ${SHARE_DIR}"