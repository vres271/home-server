#!/bin/bash
set -e

# ============================================
# Скрипт настройки Nginx Reverse Proxy на VPS
# Запуск: bash /opt/setup-scripts/02-nginx.sh
# ============================================

# Переменные конфигурации
VPS_HOST="vres271.hlab.kz" # Ваш актуальный домен или IP VPS
CONFIG_FILE="/etc/nginx/sites-available/torrent-proxy"
ENABLED_LINK="/etc/nginx/sites-enabled/torrent-proxy"
DEFAULT_LINK="/etc/nginx/sites-enabled/default"

echo "=========================================="
echo "  Настройка Nginx Reverse Proxy"
echo "  Целевой хост: ${VPS_HOST}"
echo "=========================================="

# ------------------------------------------
# 1. Проверка и установка Nginx
# ------------------------------------------
if ! command -v nginx &> /dev/null; then
    echo "[...] Nginx не найден, устанавливаю..."
    apt update
    apt install -y nginx
    systemctl enable nginx
    systemctl start nginx
    echo "[OK] Nginx установлен и запущен: $(nginx -v 2>&1)"
else
    echo "[OK] Nginx уже установлен: $(nginx -v 2>&1)"
fi

# ------------------------------------------
# 2. Запись конфигурации
# ------------------------------------------
echo "[...] Создаю конфигурационный файл..."
cat > "${CONFIG_FILE}" << 'EOF'
server {
    listen 80;
    server_name __VPS_HOST__;

    # Явный DNS-резолвер. 
    # ipv6=off предотвращает зависания, если IPv6 на VPS настроен неидеально.
    resolver 8.8.8.8 1.1.1.1 valid=300s ipv6=off;

    # 1. Проксирование Jackett (для WebUI и API)
    location /api/jackett/ {
        proxy_pass http://127.0.0.1:9117/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 2. Проксирование TMDB API (обход блокировок)
    location /tmdb/ {
        proxy_pass https://api.themoviedb.org/;
        proxy_set_header Host api.themoviedb.org;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # КРИТИЧНО для Cloudflare/TMDB:
        proxy_ssl_server_name on;
        proxy_ssl_name api.themoviedb.org;
    }

    # 3. Проксирование картинок TMDB
    location /tmdb-images/ {
        proxy_pass https://image.tmdb.org/;
        proxy_set_header Host image.tmdb.org;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # КРИТИЧНО для Cloudflare/TMDB:
        proxy_ssl_server_name on;
        proxy_ssl_name image.tmdb.org;

        # Кэширование картинок на 30 дней (раскомментируйте строки ниже, если нужно сэкономить трафик VPS)
        # proxy_cache_valid 200 302 30d;
        # proxy_cache_valid 404 1m;
        # add_header Cache-Control "public, max-age=2592000";
    }
}
EOF

# Безопасная подстановка переменной VPS_HOST вместо плейсхолдера
sed -i "s/__VPS_HOST__/${VPS_HOST}/g" "${CONFIG_FILE}"
echo "[OK] Конфигурация сохранена в ${CONFIG_FILE}"

# ------------------------------------------
# 3. Управление символическими ссылками
# ------------------------------------------
echo "[...] Настраиваю активные сайты..."

# Удаляем стандартный конфиг default, чтобы он не перехватывал запросы на 80 порт
if [ -L "${DEFAULT_LINK}" ] || [ -f "${DEFAULT_LINK}" ]; then
    rm -f "${DEFAULT_LINK}"
    echo "[OK] Стандартный конфиг 'default' отключен."
fi

# Создаем ссылку на наш конфиг, если её еще нет
if [ ! -L "${ENABLED_LINK}" ]; then
    ln -s "${CONFIG_FILE}" "${ENABLED_LINK}"
    echo "[OK] Конфиг 'torrent-proxy' активирован."
else
    echo "[OK] Конфиг 'torrent-proxy' уже активирован."
fi

# ------------------------------------------
# 4. Проверка синтаксиса и перезагрузка
# ------------------------------------------
echo "[...] Проверяю синтаксис Nginx..."
nginx -t

echo "[...] Перезагружаю Nginx..."
systemctl reload nginx
echo "[OK] Nginx успешно перезагружен."

# ------------------------------------------
# 5. Автоматическая проверка работы
# ------------------------------------------
echo ""
echo "=========================================="
echo "  Проверка работы прокси (локально)"
echo "=========================================="

# 1. Проверка Jackett
JACKETT_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/api/jackett/)
if [ "${JACKETT_CODE}" = "301" ] || [ "${JACKETT_CODE}" = "200" ]; then
    echo "[OK] Jackett (/api/jackett/): HTTP ${JACKETT_CODE}"
else
    echo "[ВНИМАНИЕ] Jackett (/api/jackett/): HTTP ${JACKETT_CODE} (убедитесь, что контейнер Jackett запущен)"
fi

# 2. Проверка TMDB API
TMDB_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1/tmdb/3/movie/popular?api_key=10c34eac115400ee04361d62d80bcd8a")
if [ "${TMDB_CODE}" = "200" ]; then
    echo "[OK] TMDB API (/tmdb/): HTTP ${TMDB_CODE}"
else
    echo "[ВНИМАНИЕ] TMDB API (/tmdb/): HTTP ${TMDB_CODE}"
fi

# 3. Проверка TMDB Images (404 допустим, главное не 502/504)
IMG_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1/tmdb-images/t/p/w500/placeholder_test.jpg")
if [ "${IMG_CODE}" = "200" ] || [ "${IMG_CODE}" = "404" ]; then
    echo "[OK] TMDB Images (/tmdb-images/): HTTP ${IMG_CODE} (связь с image.tmdb.org установлена)"
else
    echo "[ВНИМАНИЕ] TMDB Images (/tmdb-images/): HTTP ${IMG_CODE}"
fi

echo "=========================================="
echo "  Готово! Nginx полностью настроен."
echo "=========================================="