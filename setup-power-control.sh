#!/usr/bin/env bash
#
# Установщик power-control сервиса для Orange Pi.
# Запуск: sudo ./install.sh [--subnet 192.168.0.0/24] [--dry-run] [--force]

set -euo pipefail

# -------- Значения по умолчанию --------
SUBNET="192.168.0.0/24"
DRY_RUN_FLAG=false
FORCE=false
PORT=8095
SERVICE_NAME="power-control"
INSTALL_DIR="/opt/power-control"
ENV_FILE="/etc/power-control.env"
UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NGINX_SNIPPET="/etc/nginx/snippets/power-control.conf"

# -------- Парсинг аргументов --------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --subnet) SUBNET="$2"; shift 2 ;;
    --port)   PORT="$2"; shift 2 ;;
    --dry-run) DRY_RUN_FLAG=true; shift ;;
    --force)  FORCE=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--subnet 192.168.0.0/24] [--port 8095] [--dry-run] [--force]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# -------- Проверки --------
if [[ $EUID -ne 0 ]]; then
  echo "Скрипт должен запускаться от root (sudo)."
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
run apt install -y python3 python3-venv python3-pip nginx

# -------- Шаг 2. Проверка systemctl --------
SYSTEMCTL_BIN=$(command -v systemctl || true)
if [[ -z "$SYSTEMCTL_BIN" ]]; then
  echo "Ошибка: systemctl не найден. Система не поддерживает systemd."
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

# -------- Шаг 4. app.py --------
APP_PY="${INSTALL_DIR}/app.py"
if [[ -f "$APP_PY" && "$FORCE" == false ]]; then
  echo "==> ${APP_PY} уже существует. Используй --force для перезаписи."
else
  echo "==> Запись ${APP_PY}..."
  if [[ "$DRY_RUN_FLAG" == false ]]; then
    cat > "$APP_PY" <<'PYEOF'
import logging
import os
import subprocess
import threading
import time
from datetime import datetime, timezone

from flask import Flask, jsonify, request
from waitress import serve


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except Exception:
        return default


def env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except Exception:
        return default


CONFIG = {
    "enabled": env_bool("POWER_ENABLED", True),
    "dry_run": env_bool("POWER_DRY_RUN", True),
    "allow_reboot": env_bool("POWER_ALLOW_REBOOT", True),
    "allow_shutdown": env_bool("POWER_ALLOW_SHUTDOWN", True),
    "host": os.getenv("POWER_HOST", "127.0.0.1"),
    "port": env_int("POWER_PORT", 8095),
    "delay_seconds": max(env_float("POWER_DELAY_SECONDS", 2.0), 0.5),
    "use_sudo": env_bool("POWER_USE_SUDO", False),
    "sudo_path": os.getenv("POWER_SUDO_PATH", "/usr/bin/sudo"),
    "systemctl_path": os.getenv("POWER_SYSTEMCTL_PATH", "/usr/bin/systemctl"),
    "require_action_header": env_bool("POWER_REQUIRE_ACTION_HEADER", True),
}

app = Flask(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("power-control")

state_lock = threading.Lock()
state = {
    "action": None,
    "started_at": 0.0,
}

ACTION_TTL = max(CONFIG["delay_seconds"] + 10.0, 15.0)


def action_in_progress() -> bool:
    now = time.monotonic()
    with state_lock:
        if state["action"] is None:
            return False
        if now - state["started_at"] > ACTION_TTL:
            state["action"] = None
            state["started_at"] = 0.0
            return False
        return True


def try_set_action(action: str) -> bool:
    now = time.monotonic()
    with state_lock:
        if state["action"] is not None and now - state["started_at"] <= ACTION_TTL:
            return False
        state["action"] = action
        state["started_at"] = now
        return True


def clear_action() -> None:
    with state_lock:
        state["action"] = None
        state["started_at"] = 0.0


def command_for(action: str):
    systemctl_argument = "reboot" if action == "reboot" else "poweroff"
    systemctl_command = [CONFIG["systemctl_path"], systemctl_argument]
    if CONFIG["use_sudo"]:
        return [CONFIG["sudo_path"], "-n"] + systemctl_command
    return systemctl_command


def run_action(action: str) -> None:
    time.sleep(CONFIG["delay_seconds"])
    if CONFIG["dry_run"]:
        log.info("DRY-RUN: would execute action=%s", action)
        clear_action()
        return

    cmd = command_for(action)
    log.info("Executing action=%s command=%s", action, cmd)
    try:
        result = subprocess.run(cmd, check=False)
        if result.returncode != 0:
            log.warning("Action command finished with non-zero code: action=%s code=%s",
                        action, result.returncode)
    except FileNotFoundError:
        log.exception("Command not found for action=%s", action)
    except Exception:
        log.exception("Unexpected error while executing action=%s", action)
    finally:
        clear_action()


def get_uptime_seconds():
    try:
        with open("/proc/uptime", "r", encoding="ascii") as f:
            return float(f.read().split()[0])
    except Exception:
        return None


@app.get("/api/system/health")
def health():
    return jsonify({"ok": True, "time": datetime.now(timezone.utc).isoformat()})


@app.get("/api/system/status")
def status():
    in_progress = action_in_progress()
    with state_lock:
        current_action = state["action"]
    return jsonify({
        "enabled": CONFIG["enabled"],
        "dryRun": CONFIG["dry_run"],
        "actions": {"reboot": CONFIG["allow_reboot"], "shutdown": CONFIG["allow_shutdown"]},
        "actionInProgress": in_progress,
        "currentAction": current_action,
        "time": datetime.now(timezone.utc).isoformat(),
        "uptimeSeconds": get_uptime_seconds(),
    })


def handle_action(action: str):
    if not CONFIG["enabled"]:
        return jsonify({"accepted": False, "error": "power control disabled"}), 503
    if action == "reboot" and not CONFIG["allow_reboot"]:
        return jsonify({"accepted": False, "error": "reboot disabled"}), 403
    if action == "shutdown" and not CONFIG["allow_shutdown"]:
        return jsonify({"accepted": False, "error": "shutdown disabled"}), 403
    if CONFIG["require_action_header"]:
        if request.headers.get("X-System-Action") != "true":
            return jsonify({"accepted": False,
                             "error": "missing required header X-System-Action: true"}), 400
    if not try_set_action(action):
        return jsonify({"accepted": False, "error": "action already in progress"}), 409

    threading.Thread(target=run_action, args=(action,), daemon=True).start()
    log.info("Accepted action=%s dry_run=%s delay_seconds=%s",
             action, CONFIG["dry_run"], CONFIG["delay_seconds"])
    return jsonify({
        "accepted": True,
        "action": action,
        "dryRun": CONFIG["dry_run"],
        "executeInSeconds": CONFIG["delay_seconds"],
    }), 202


@app.post("/api/system/actions/reboot")
def reboot():
    return handle_action("reboot")


@app.post("/api/system/actions/shutdown")
def shutdown():
    return handle_action("shutdown")


if __name__ == "__main__":
    log.info("Starting power-control host=%s port=%s dry_run=%s enabled=%s",
             CONFIG["host"], CONFIG["port"], CONFIG["dry_run"], CONFIG["enabled"])
    serve(app, host=CONFIG["host"], port=CONFIG["port"], threads=4)
PYEOF
  else
    echo "[DRY-RUN] запись ${APP_PY} пропущена"
  fi
fi

# -------- Шаг 5. Конфиг .env --------
if [[ -f "$ENV_FILE" && "$FORCE" == false ]]; then
  echo "==> ${ENV_FILE} уже существует. Пропускаем (используй --force для перезаписи)."
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
POWER_REQUIRE_ACTION_HEADER=true
EOF
    chmod 600 "$ENV_FILE"
  fi
fi

# -------- Шаг 6. systemd unit --------
if [[ -f "$UNIT_FILE" && "$FORCE" == false ]]; then
  echo "==> ${UNIT_FILE} уже существует. Пропускаем (используй --force для перезаписи)."
else
  echo "==> Запись ${UNIT_FILE}..."
  if [[ "$DRY_RUN_FLAG" == false ]]; then
    cat > "$UNIT_FILE" <<EOF
[Unit]
Description=Orange Pi power control service
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
SyslogIdentifier=power-control

[Install]
WantedBy=multi-user.target
EOF
  fi
fi

# -------- Шаг 7. Nginx snippet --------
echo "==> Запись nginx-сниппета ${NGINX_SNIPPET}..."
run mkdir -p /etc/nginx/snippets
if [[ "$DRY_RUN_FLAG" == false ]]; then
  cat > "$NGINX_SNIPPET" <<EOF
location /api/system/ {
    allow 127.0.0.1;
    allow ::1;
    allow ${SUBNET};
    deny all;

    limit_except GET POST {
        deny all;
    }

    proxy_pass http://127.0.0.1:${PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_read_timeout 10s;
}
EOF
fi

# -------- Шаг 8. Активация systemd --------
if [[ "$DRY_RUN_FLAG" == false ]]; then
  systemctl daemon-reload
  systemctl enable --now "${SERVICE_NAME}.service"
  echo "==> Сервис ${SERVICE_NAME}.service запущен."
fi

# -------- Шаг 9. Финальная инструкция --------
echo
echo "=============================================="
echo "Установка завершена."
echo
echo "Проверка API (должно вернуть JSON):"
echo "  curl http://127.0.0.1:${PORT}/api/system/status"
echo
echo "ВАЖНО: добавь в свой Nginx-конфиг сайта (например,"
echo "/etc/nginx/sites-available/orange-home-ui) одну строку"
echo "внутри блока server { ... }:"
echo
echo "    include ${NGINX_SNIPPET};"
echo
echo "Затем:"
echo "  sudo nginx -t"
echo "  sudo systemctl reload nginx"
echo "=============================================="
