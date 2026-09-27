#!/bin/bash
set -e

echo "🚀 [1/3] Настройка Nginx и директории для Angular..."

# Проверка прав root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Ошибка: Запустите скрипт от имени root (sudo bash $0)"
  exit 1
fi

APP_DIR="/var/www/orange-home-ui"
NGINX_CONF="/etc/nginx/sites-available/orange-home-ui"
VPS_HOST="vres271.hlab.kz" # Ваш актуальный домен VPS

# 1. Установка Nginx
if ! command -v nginx &> /dev/null; then
    echo "📦 Установка Nginx..."
    apt update -y
    apt install nginx -y
    systemctl enable nginx
else
    echo "✅ Nginx уже установлен."
fi

# 2. Создание директории приложения
echo "📁 Создание директории ${APP_DIR}..."
mkdir -p "$APP_DIR"
chown -R www-data:www-data "$APP_DIR"
chmod -R 755 "$APP_DIR"

# 3. Запись ПОЛНОГО и актуального конфига Nginx
echo "⚙️ Обновление конфигурации Nginx..."
cat << EOF > "$NGINX_CONF"
server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    # Запрет кэширования version.json (для актуализации UI после деплоя)
    location = /version.json {
        root ${APP_DIR};
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate";
        add_header Pragma "no-cache";
    }

    # Проксирование Jackett (VPS)
    location /api/jackett/ {
        proxy_pass http://${VPS_HOST}:9117/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_hide_header Access-Control-Allow-Origin;
    }

    # Проксирование qBittorrent-nox (Localhost)
    location /api/qbittorrent/ {
        proxy_pass http://localhost:8080/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_hide_header Access-Control-Allow-Origin;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Проксирование TMDB API на VPS
    location /tmdb/ {
        proxy_pass http://${VPS_HOST};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Проксирование картинок TMDB на VPS
    location /tmdb-images/ {
        proxy_pass http://${VPS_HOST};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Системные команды (Power Control)
    location /api/system/ {
        allow 127.0.0.1;
        allow ::1;
        allow 192.168.0.0/24;
        deny all;

        limit_except GET POST {
            deny all;
        }

        proxy_pass http://127.0.0.1:8095;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 10s;
    }

    # Раздача статических файлов Angular
    location / {
        root ${APP_DIR};
        index index.html;
        try_files \$uri \$uri/ /index.html;

        # Кэширование статики для экономии ресурсов
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

# 5. Брандмауэр
echo "🛡️ Настройка UFW (если активен)..."
ufw allow 80/tcp || true

# 6. Проверка и перезагрузка
echo "🧪 Проверка конфигурации Nginx..."
nginx -t

echo "🔄 Перезагрузка Nginx..."
systemctl reload nginx

echo "✅ [1/3] Готово! Nginx настроен."
echo "📂 Папка для деплоя: ${APP_DIR}"