#!/usr/bin/env bash
#
# Установщик системного бэкенд-сервиса для Orange Pi (Управление питанием + Обновление UI).
# Запуск: sudo bash system-service.sh [--port 8095]

set -euo pipefail

# -------- Значения по умолчанию --------
DRY_RUN_FLAG=false
FORCE=false
PORT=8095
SERVICE_NAME="power-control" # Оставляем прежнее имя для совместимости с systemd
INSTALL_DIR="/opt/power-control"
ENV_FILE="/etc/power-control.env"
UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
TEMP_PATH_DEFAULT="/sys/class/thermal/thermal_zone0/temp"

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
  echo "❌ Ошибка: systemctl не найден. Система не поддерживает systemd."
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

# -------- Шаг 4. app.py (АКТУАЛЬНАЯ ВЕРСИЯ) --------
APP_PY="${INSTALL_DIR}/app.py"
echo "==> Запись ${APP_PY}..."
if [[ "$DRY_RUN_FLAG" == false ]]; then
  cat > "$APP_PY" <<'PYEOF'
import logging
import os
import subprocess
import threading
import time
from datetime import datetime, timezone
import json
import shutil
import tarfile
import urllib.request
from pathlib import Path

from flask import Flask, jsonify, request
from waitress import serve

def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None: return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

def env_float(name: str, default: float) -> float:
    try: return float(os.getenv(name, str(default)))
    except Exception: return default

def env_int(name: str, default: int) -> int:
    try: return int(os.getenv(name, str(default)))
    except Exception: return default

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
    "temp_path": os.getenv("POWER_TEMP_PATH", "/sys/class/thermal/thermal_zone0/temp"),
    "require_action_header": env_bool("POWER_REQUIRE_ACTION_HEADER", True),
    "update_repo": os.getenv("POWER_UPDATE_REPO", "vres271/home-server"),
    "web_root": os.getenv("POWER_WEB_ROOT", "/var/www/orange-home-ui"),
    "allow_update": env_bool("POWER_ALLOW_UPDATE", True),
}

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("power-control")

state_lock = threading.Lock()
state = {"action": None, "started_at": 0.0}

update_state_lock = threading.Lock()
update_state = {"status": "idle", "currentVersion": None, "availableVersion": None, "message": "", "started_at": 0.0}
ACTION_TTL = max(CONFIG["delay_seconds"] + 10.0, 15.0)

def action_in_progress() -> bool:
    now = time.monotonic()
    with state_lock:
        if state["action"] is None: return False
        if now - state["started_at"] > ACTION_TTL:
            state["action"] = None; state["started_at"] = 0.0; return False
        return True

def try_set_action(action: str) -> bool:
    now = time.monotonic()
    with state_lock:
        if state["action"] is not None and now - state["started_at"] <= ACTION_TTL: return False
        state["action"] = action; state["started_at"] = now; return True

def clear_action() -> None:
    with state_lock: state["action"] = None; state["started_at"] = 0.0

def command_for(action: str):
    systemctl_argument = "reboot" if action == "reboot" else "poweroff"
    cmd = [CONFIG["systemctl_path"], systemctl_argument]
    return [CONFIG["sudo_path"], "-n"] + cmd if CONFIG["use_sudo"] else cmd

def run_action(action: str) -> None:
    time.sleep(CONFIG["delay_seconds"])
    if CONFIG["dry_run"]:
        log.info("DRY-RUN: would execute action=%s", action); clear_action(); return
    log.info("Executing action=%s", action)
    try:
        result = subprocess.run(command_for(action), check=False)
        if result.returncode != 0: log.warning("Action failed with code=%s", result.returncode)
    except Exception as e: log.exception("Unexpected error: %s", e)
    finally: clear_action()

def get_uptime_seconds():
    try:
        with open("/proc/uptime", "r") as f: return float(f.read().split()[0])
    except Exception: return None

def get_cpu_temp_celsius():
    try:
        with open(CONFIG["temp_path"], "r") as f: return round(int(f.read().strip()) / 1000.0, 1)
    except Exception: return None

def get_current_version():
    try:
        version_file = Path(CONFIG["web_root"]) / "version.json"
        if version_file.exists(): return json.loads(version_file.read_text(encoding="utf-8")).get("version")
    except Exception as e: log.warning("Failed to read version: %s", e)
    return None

def check_github_release():
    url = f"https://api.github.com/repos/{CONFIG['update_repo']}/releases/latest"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "orange-home-ui-updater"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            tag = data.get("tag_name", "").removeprefix("v")
            download_url = next((a["browser_download_url"] for a in data.get("assets", []) if a["name"].endswith(".tar.gz")), None)
            return tag, download_url
    except Exception as e:
        log.error("Failed to check GitHub: %s", e); return None, None

def run_update_install(download_url, new_version):
    try:
        set_update_state("downloading", new_version, "Скачивание архива...")
        tmp_dir = Path("/tmp/orange-home-ui-update"); tmp_dir.mkdir(exist_ok=True)
        archive_path = tmp_dir / "update.tar.gz"
        urllib.request.urlretrieve(download_url, archive_path)
        
        set_update_state("installing", new_version, "Распаковка и установка...")
        web_root = Path(CONFIG["web_root"])
        backup_dir = web_root.parent / f"{web_root.name}-backup-{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
        
        if web_root.exists():
            shutil.copytree(web_root, backup_dir, dirs_exist_ok=False)
            log.info("Backup created at %s", backup_dir)
            
        for item in web_root.iterdir():
            if item.is_file(): item.unlink()
            elif item.is_dir(): shutil.rmtree(item)
            
        with tarfile.open(archive_path, "r:gz") as tar: tar.extractall(web_root)
        for item in web_root.rglob("*"): item.chmod(0o755 if item.is_dir() else 0o644)
            
        shutil.rmtree(tmp_dir, ignore_errors=True)
        set_update_state("success", new_version, f"Обновление до v{new_version} завершено")
        log.info("Update to v%s completed successfully", new_version)
    except Exception as e:
        log.exception("Update failed"); set_update_state("error", new_version, f"Ошибка: {e}")

def set_update_state(status, version=None, message=""):
    with update_state_lock:
        update_state["status"] = status
        if version: update_state["availableVersion"] = version
        update_state["message"] = message; update_state["started_at"] = time.monotonic()

@app.get("/api/system/health")
def health(): return jsonify({"ok": True, "time": datetime.now(timezone.utc).isoformat()})

@app.get("/api/system/status")
def status():
    with state_lock: current_action = state["action"]
    return jsonify({"enabled": CONFIG["enabled"], "dryRun": CONFIG["dry_run"], "actions": {"reboot": CONFIG["allow_reboot"], "shutdown": CONFIG["allow_shutdown"]}, "actionInProgress": action_in_progress(), "currentAction": current_action, "time": datetime.now(timezone.utc).isoformat(), "uptimeSeconds": get_uptime_seconds(), "cpuTempCelsius": get_cpu_temp_celsius()})

@app.get("/api/system/update/check")
def check_update():
    if not CONFIG["enabled"] or not CONFIG.get("allow_update", True): return jsonify({"error": "updates disabled"}), 403
    current, latest_tag, download_url = get_current_version(), *check_github_release()
    with update_state_lock: update_state["currentVersion"] = current
    has_update = current is not None and latest_tag is not None and current != latest_tag
    return jsonify({"currentVersion": current, "availableVersion": latest_tag, "hasUpdate": has_update, "downloadUrl": download_url if has_update else None})

@app.post("/api/system/update/install")
def install_update():
    if not CONFIG["enabled"] or not CONFIG.get("allow_update", True): return jsonify({"accepted": False, "error": "updates disabled"}), 403
    if CONFIG["require_action_header"] and request.headers.get("X-System-Action") != "true": return jsonify({"accepted": False, "error": "missing header"}), 400
    with update_state_lock:
        if update_state["status"] in ("checking", "downloading", "installing"): return jsonify({"accepted": False, "error": "update in progress"}), 409
    current, latest_tag, download_url = get_current_version(), *check_github_release()
    if not download_url or current == latest_tag: return jsonify({"accepted": False, "error": "no update available"}), 400
    if CONFIG["dry_run"]: return jsonify({"accepted": True, "dryRun": True, "newVersion": latest_tag})
    set_update_state("checking", latest_tag, "Проверка...")
    threading.Thread(target=run_update_install, args=(download_url, latest_tag), daemon=True).start()
    return jsonify({"accepted": True, "dryRun": False, "newVersion": latest_tag}), 202

@app.get("/api/system/update/status")
def update_status():
    with update_state_lock: return jsonify(dict(update_state))

def handle_action(action: str):
    if not CONFIG["enabled"]: return jsonify({"accepted": False, "error": "disabled"}), 503
    if (action == "reboot" and not CONFIG["allow_reboot"]) or (action == "shutdown" and not CONFIG["allow_shutdown"]): return jsonify({"accepted": False, "error": "action disabled"}), 403
    if CONFIG["require_action_header"] and request.headers.get("X-System-Action") != "true": return jsonify({"accepted": False, "error": "missing header"}), 400
    if not try_set_action(action): return jsonify({"accepted": False, "error": "already in progress"}), 409
    threading.Thread(target=run_action, args=(action,), daemon=True).start()
    return jsonify({"accepted": True, "action": action, "dryRun": CONFIG["dry_run"], "executeInSeconds": CONFIG["delay_seconds"]}), 202

@app.post("/api/system/actions/reboot")
def reboot(): return handle_action("reboot")

@app.post("/api/system/actions/shutdown")
def shutdown(): return handle_action("shutdown")

if __name__ == "__main__":
    log.info("Starting service host=%s port=%s", CONFIG["host"], CONFIG["port"])
    serve(app, host=CONFIG["host"], port=CONFIG["port"], threads=4)
PYEOF
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