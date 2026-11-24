#!/usr/bin/env bash
#
# Установщик системного и TV бэкенд-сервисов для Orange Pi.
# Запуск: sudo bash system-service.sh [--port 8095] [--tv-port 8096] [--dry-run] [--force]

set -euo pipefail

# -------- Значения по умолчанию --------
DRY_RUN_FLAG=false
FORCE=false
PORT=8095
TV_PORT=8096
SYSTEM_SERVICE_NAME="system-control"
TV_SERVICE_NAME="tv-control"
INSTALL_DIR="/opt/power-control"
SYSTEM_ENV_FILE="/etc/system-control.env"
TV_ENV_FILE="/etc/tv-control.env"
SYSTEM_UNIT_FILE="/etc/systemd/system/${SYSTEM_SERVICE_NAME}.service"
TV_UNIT_FILE="/etc/systemd/system/${TV_SERVICE_NAME}.service"
TEMP_PATH_DEFAULT="/sys/class/thermal/thermal_zone0/temp"

# Определяем директорию, откуда запущен этот скрипт, чтобы найти файлы
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# -------- Парсинг аргументов --------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)      PORT="$2"; shift 2 ;;
    --tv-port)   TV_PORT="$2"; shift 2 ;;
    --dry-run)   DRY_RUN_FLAG=true; shift ;;
    --force)     FORCE=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--port 8095] [--tv-port 8096] [--dry-run] [--force]"
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
# Добавлен adb, так как он необходим для TV-сервиса
run apt install -y python3 python3-venv python3-pip adb

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

# -------- Шаг 4. Копирование файлов приложения --------
SYSTEM_APP_SRC="${SCRIPT_DIR}/system_app.py"
SYSTEM_APP_DST="${INSTALL_DIR}/system_app.py"
TV_APP_SRC="${SCRIPT_DIR}/tvcontrol/tv_app.py"
TV_APP_DST="${INSTALL_DIR}/tv_app.py"

if [[ ! -f "$SYSTEM_APP_SRC" ]]; then
  echo "❌ Ошибка: Файл ${SYSTEM_APP_SRC} не найден!"
  exit 1
fi

if [[ ! -f "$TV_APP_SRC" ]]; then
  echo "❌ Ошибка: Файл ${TV_APP_SRC} не найден!"
  exit 1
fi

echo "==> Копирование файлов приложения в ${INSTALL_DIR}..."
if [[ "$DRY_RUN_FLAG" == false ]]; then
  cp "$SYSTEM_APP_SRC" "$SYSTEM_APP_DST"
  cp "$TV_APP_SRC" "$TV_APP_DST"
  chmod 644 "$SYSTEM_APP_DST"
  chmod 644 "$TV_APP_DST"
fi

# -------- Шаг 5. Конфиг .env --------
# 5.1 System Control
if [[ -f "$SYSTEM_ENV_FILE" && "$FORCE" == false ]]; then
  echo "==> ${SYSTEM_ENV_FILE} уже существует. Пропускаем."
else
  echo "==> Запись ${SYSTEM_ENV_FILE}..."
  if [[ "$DRY_RUN_FLAG" == false ]]; then
    cat > "$SYSTEM_ENV_FILE" <<EOF
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
    chmod 600 "$SYSTEM_ENV_FILE"
  fi
fi

# 5.2 TV Control
if [[ -f "$TV_ENV_FILE" && "$FORCE" == false ]]; then
  echo "==> ${TV_ENV_FILE} уже существует. Пропускаем."
else
  echo "==> Запись ${TV_ENV_FILE}..."
  if [[ "$DRY_RUN_FLAG" == false ]]; then
    cat > "$TV_ENV_FILE" <<EOF
TV_HOST=127.0.0.1
TV_PORT=${TV_PORT}
ADB_PATH=/usr/bin/adb
ADB_DEFAULT_TARGET=192.168.0.120:5555
SMB_SHARE_NAME=Shared
DEFAULT_SAVE_PATH=/mnt/shared
NOVA_COMPONENT=org.courville.nova/com.archos.mediacenter.video.player.PlayerActivity
EOF
    chmod 600 "$TV_ENV_FILE"
  fi
fi

# -------- Шаг 6. systemd unit --------
# 6.1 System Control Unit
if [[ -f "$SYSTEM_UNIT_FILE" && "$FORCE" == false ]]; then
  echo "==> ${SYSTEM_UNIT_FILE} уже существует. Пропускаем."
else
  echo "==> Запись ${SYSTEM_UNIT_FILE}..."
  if [[ "$DRY_RUN_FLAG" == false ]]; then
    cat > "$SYSTEM_UNIT_FILE" <<EOF
[Unit]
Description=Orange Pi system backend service
After=network.target

[Service]
Type=simple
User=root
Group=root
EnvironmentFile=${SYSTEM_ENV_FILE}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/.venv/bin/python ${INSTALL_DIR}/system_app.py
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  fi
fi

# 6.2 TV Control Unit
if [[ -f "$TV_UNIT_FILE" && "$FORCE" == false ]]; then
  echo "==> ${TV_UNIT_FILE} уже существует. Пропускаем."
else
  echo "==> Запись ${TV_UNIT_FILE}..."
  if [[ "$DRY_RUN_FLAG" == false ]]; then
    cat > "$TV_UNIT_FILE" <<EOF
[Unit]
Description=Orange Pi TV backend service (ADB)
After=network.target

[Service]
Type=simple
User=root
Group=root
EnvironmentFile=${TV_ENV_FILE}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/.venv/bin/python ${INSTALL_DIR}/tv_app.py
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  fi
fi

# -------- Шаг 7. Активация systemd --------
if [[ "$DRY_RUN_FLAG" == false ]]; then
  # Очистка старого единого сервиса, если он вдруг остался
  if [[ -f "/etc/systemd/system/power-control.service" ]]; then
    echo "==> Остановка и удаление устаревшего сервиса power-control..."
    systemctl stop power-control.service || true
    systemctl disable power-control.service || true
    rm -f "/etc/systemd/system/power-control.service"
  fi

  systemctl daemon-reload
  
  systemctl enable "${SYSTEM_SERVICE_NAME}.service"
  systemctl restart "${SYSTEM_SERVICE_NAME}.service"
  echo "==> Сервис ${SYSTEM_SERVICE_NAME}.service перезапущен."

  systemctl enable "${TV_SERVICE_NAME}.service"
  systemctl restart "${TV_SERVICE_NAME}.service"
  echo "==> Сервис ${TV_SERVICE_NAME}.service перезапущен."
fi

echo
echo "=============================================="
echo "✅ Установка бэкенд-сервисов завершена."
echo "Проверка System API: curl http://127.0.0.1:${PORT}/api/system/status"
echo "Проверка TV API:     curl http://127.0.0.1:${TV_PORT}/api/media/status"
echo "=============================================="