#!/bin/bash
set -e

# ============================================
# Скрипт установки Jackett в Docker на VPS
# Запуск: bash jackett.sh
# ============================================

JACKETT_DIR="/opt/jackett"
CONFIG_FILE="${JACKETT_DIR}/config/Jackett/ServerConfig.json"
COMPOSE_FILE="${JACKETT_DIR}/docker-compose.yml"

echo "=========================================="
echo "  Установка Jackett"
echo "=========================================="

# ------------------------------------------
# 1. Проверка и установка Docker
# ------------------------------------------
if command -v docker &> /dev/null; then
    echo "[OK] Docker уже установлен: $(docker --version)"
else
    echo "[...] Docker не найден, устанавливаю..."
    apt update
    apt install -y docker.io docker-compose
    systemctl enable docker
    systemctl start docker
    echo "[OK] Docker установлен: $(docker --version)"
fi

# Определяем правильную команду compose
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo "[ОШИБКА] docker compose не найден!"
    exit 1
fi
echo "[OK] Compose команда: ${COMPOSE_CMD}"

# ------------------------------------------
# 2. Создание структуры папок
# ------------------------------------------
mkdir -p "${JACKETT_DIR}/config"
mkdir -p "${JACKETT_DIR}/downloads"
echo "[OK] Папки созданы: ${JACKETT_DIR}"

# ------------------------------------------
# 3. Создание docker-compose.yml
# ------------------------------------------
cat > "${COMPOSE_FILE}" << 'EOF'
version: "3.8"
services:
  jackett:
    image: lscr.io/linuxserver/jackett:latest
    container_name: jackett
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Europe/Moscow
      - AUTO_UPDATE=true
    volumes:
      - /opt/jackett/config:/config
      - /opt/jackett/downloads:/downloads
    ports:
      - 9117:9117
    restart: unless-stopped
EOF
echo "[OK] docker-compose.yml создан (порт 9117 открыт наружу для WebUI)"

# ------------------------------------------
# 4. Запуск контейнера
# ------------------------------------------
cd "${JACKETT_DIR}"
${COMPOSE_CMD} up -d
echo "[...] Ожидание запуска Jackett..."

# ------------------------------------------
# 5. Ожидание генерации конфига и вывод API-ключа
# ------------------------------------------
MAX_WAIT=60
WAITED=0
while [ ! -f "${CONFIG_FILE}" ]; do
    sleep 2
    WAITED=$((WAITED + 2))
    if [ ${WAITED} -ge ${MAX_WAIT} ]; then
        echo "[ОШИБКА] Конфиг не появился за ${MAX_WAIT} сек."
        echo "Проверьте логи: docker logs jackett"
        exit 1
    fi
    echo "    ... жду конфиг (${WAITED}с / ${MAX_WAIT}с)"
done

echo "[OK] Конфиг найден: ${CONFIG_FILE}"

# Получаем IP сервера для вывода
VPS_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_VPS_IP")

echo ""
echo "=========================================="
echo "  Jackett успешно установлен!"
echo "=========================================="
echo ""
echo "API-ключ Jackett:"
grep -o '"APIKey"[[:space:]]*:[[:space:]]*"[^"]*"' "${CONFIG_FILE}"
echo ""
echo "=========================================="
echo "  Доступ к Jackett:"
echo "=========================================="
echo "  WebUI:     http://${VPS_IP}:9117"
echo "  API:       http://${VPS_IP}:9117/api/v2.0/..."
echo "  Через Nginx: http://${VPS_IP}/api/jackett/..."
echo "=========================================="
echo ""
echo "⚠️  ВАЖНО: При первом входе в WebUI Jackett попросит задать пароль!"
echo "   Это обязательно, так как порт 9117 открыт наружу."
echo "   После установки пароля не забудьте его сохранить."
echo ""

# ------------------------------------------
# 6. Финальная проверка
# ------------------------------------------
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9117/)
if [ "${HTTP_CODE}" = "301" ] || [ "${HTTP_CODE}" = "200" ]; then
    echo "[OK] Jackett отвечает (HTTP ${HTTP_CODE})"
else
    echo "[ВНИМАНИЕ] Jackett вернул HTTP ${HTTP_CODE}"
    echo "Проверьте логи: docker logs jackett"
fi

echo ""
echo "Готово!"