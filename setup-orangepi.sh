#!/bin/bash

# Завершать скрипт при любой ошибке
set -e

echo "🚀 Начало настройки Orange Pi Home Server..."

# Проверка прав root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Ошибка: Пожалуйста, запустите скрипт от имени root (sudo ./setup-orangepi.sh)"
  exit 1
fi

# Переменные конфигурации
APP_DIR="/var/www/orange-home-ui"
NGINX_CONF="/etc/nginx/sites-available/orange-home-ui"
JACKETT_IP="109.248.162.130"
JACKETT_PORT="9117"
QBITTORRENT_PORT="8080"

# 1. Установка Nginx
echo "📦 Обновление пакетов и установка Nginx..."
apt update -y
apt install nginx -y

# 2. Создание директории и настройка прав
echo "📁 Создание директории для приложения..."
mkdir -p "$APP_DIR"
chown -R www-data:www-data "$APP_DIR"
chmod -R 755 "$APP_DIR"

# 3. Создание конфигурации Nginx
echo "⚙️ Создание конфигурации Nginx..."
cat << EOF > "$NGINX_CONF"
server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    # Проксирование Jackett (VPS)
    location /api/jackett/ {
        proxy_pass http://${JACKETT_IP}:${JACKETT_PORT}/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_hide_header Access-Control-Allow-Origin;
    }

    # Проксирование qBittorrent-nox (Localhost)
    location /api/qbittorrent/ {
        proxy_pass http://localhost:${QBITTORRENT_PORT}/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_hide_header Access-Control-Allow-Origin;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Раздача статических файлов Angular
    location / {
        root ${APP_DIR};
        index index.html;
        try_files \$uri \$uri/ /index.html;

        # Кэширование статики
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
EOF

# 4. Активация конфигурации
echo "🔗 Активация сайта в Nginx..."
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 5. Настройка брандмауэра (игнорируем ошибки, если UFW не установлен)
echo "🛡️ Настройка брандмауэра (если активен)..."
ufw allow 80/tcp || true

# 6. Проверка и перезагрузка
echo "🧪 Проверка конфигурации Nginx..."
nginx -t

echo "🔄 Перезагрузка Nginx..."
systemctl reload nginx

echo "✅ Готово! Сервер успешно настроен."
echo "📂 Папка для деплоя файлов: $APP_DIR"
echo "🌐 Локальный IP для проверки: http://$(hostname -I | awk '{print $1}')"