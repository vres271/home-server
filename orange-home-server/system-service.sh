#!/usr/bin/env bash
#
# Установщик системного бэкенд-сервиса для Orange Pi.
# Запуск: sudo bash system-service.sh [--port 8095]

set -euo pipefail

# -------- Значения по умолчанию --------
DRY_RUN_FLAG=false
FORCE=false
PORT=8095
SERVICE_NAME="power-control"
INSTALL_DIR="/opt/power-control"
ENV_FILE="/etc/power-control.env"
UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
TEMP_PATH_DEFAULT="/sys/class/thermal/thermal_zone0/temp"

# Определяем директорию, откуда запущен этот скрипт, чтобы найти app.py
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# -------- Парсинг аргументов --------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)   PORT="$2"; shift 2 ;;
    --dry-run) DRY_RUN_FLAG=true; shift ;;
    --force)  FORCE=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--port 8095] [--dry-run] [--force]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# -------- Проверки --------
if [[ $EUID -ne 0 ]]; then
  echo "❌ Скрипт должен запускаться от root (sudo)."
  exit 1
fi

run() {
  if [[ "$DRY_RUN_FLAG" == true ]]; then
    echo "[DRY-RUN] $*"
  else
    "$@"
  fi
}

# -------- Шаг 1. Пакеты --------
echo "==> Установка пакетов..."
run apt update
run apt install -y python3 python3-venv python3-pip

# -------- Шаг 2. Проверка systemctl --------
SYSTEMCTL_BIN=$(command -v systemctl || true)
if [[ -z "$SYSTEMCTL_BIN" ]]; then
  echo "❌ Ошибка: systemctl не найден."
  exit 1
fi

# -------- Шаг 3. Каталог и venv --------
echo "==> Создание ${INSTALL_DIR}..."
run mkdir -p "$INSTALL_DIR"

if [[ ! -d "${INSTALL_DIR}/.venv" ]]; then
  run python3 -m venv "${INSTALL_DIR}/.venv"
fi

echo "==> Установка Python-зависимостей..."
run "${INSTALL_DIR}/.venv/bin/pip" install --upgrade pip
run "${INSTALL_DIR}/.venv/bin/pip" install flask waitress

# -------- Шаг 4. Копирование app.py --------
APP_PY_SRC="${SCRIPT_DIR}/app.py"
APP_PY_DST="${INSTALL_DIR}/app.py"

if [[ ! -f "$APP_PY_SRC" ]]; then
  echo "❌ Ошибка: Файл ${APP_PY_SRC} не найден!"
  exit 1
fi

echo "==> Копирование ${APP_PY_SRC} в ${APP_PY_DST}..."
if [[ "$DRY_RUN_FLAG" == false ]]; then
  cp "$APP_PY_SRC" "$APP_PY_DST"
  chmod 644 "$APP_PY_DST"
fi

# -------- Шаг 5. Конфиг .env --------
if [[ -f "$ENV_FILE" && "$FORCE" == false ]]; then
  echo "==> ${ENV_FILE} уже существует. Пропускаем."
else
  echo "==> Запись ${ENV_FILE}..."
  if [[ "$DRY_RUN_FLAG" == false ]]; then
    cat > "$ENV_FILE" <<EOF
POWER_ENABLED=true
POWER_DRY_RUN=true
POWER_ALLOW_REBOOT=true
POWER_ALLOW_SHUTDOWN=true
POWER_HOST=127.0.0.1
POWER_PORT=${PORT}
POWER_DELAY_SECONDS=2
POWER_USE_SUDO=false
POWER_SUDO_PATH=/usr/bin/sudo
POWER_SYSTEMCTL_PATH=/usr/bin/systemctl
POWER_TEMP_PATH=${TEMP_PATH_DEFAULT}
POWER_REQUIRE_ACTION_HEADER=true
POWER_UPDATE_REPO=vres271/home-server
POWER_WEB_ROOT=/var/www/orange-home-ui
POWER_ALLOW_UPDATE=true
EOF
    chmod 600 "$ENV_FILE"
  fi
fi

# -------- Шаг 6. systemd unit --------
if [[ -f "$UNIT_FILE" && "$FORCE" == false ]]; then
  echo "==> ${UNIT_FILE} уже существует. Пропускаем."
else
  echo "==> Запись ${UNIT_FILE}..."
  if [[ "$DRY_RUN_FLAG" == false ]]; then
    cat > "$UNIT_FILE" <<EOF
[Unit]
Description=Orange Pi system backend service
After=network.target

[Service]
Type=simple
User=root
Group=root
EnvironmentFile=${ENV_FILE}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/.venv/bin/python ${INSTALL_DIR}/app.py
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  fi
fi

# -------- Шаг 7. Активация systemd --------
if [[ "$DRY_RUN_FLAG" == false ]]; then
  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}.service"
  systemctl restart "${SERVICE_NAME}.service"
  echo "==> Сервис ${SERVICE_NAME}.service перезапущен."
fi

echo
echo "=============================================="
echo "✅ Установка системного сервиса завершена."
echo "Проверка API: curl http://127.0.0.1:${PORT}/api/system/status"
echo "=============================================="