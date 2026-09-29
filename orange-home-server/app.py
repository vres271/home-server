import logging
import os
import subprocess
import threading
import time
from datetime import datetime, timezone

from flask import Flask, jsonify, request
from waitress import serve

import json
import shutil
import tarfile
import urllib.request
from pathlib import Path

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
    "temp_path": os.getenv("POWER_TEMP_PATH", "/sys/class/thermal/thermal_zone0/temp"),
    "update_repo": os.getenv("POWER_UPDATE_REPO", "vres271/home-server"),
    "web_root": os.getenv("POWER_WEB_ROOT", "/var/www/orange-home-ui"),
    "allow_update": env_bool("POWER_ALLOW_UPDATE", True),
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
update_state_lock = threading.Lock()
update_state = {
    "status": "idle",  # idle, checking, downloading, installing, success, error
    "currentVersion": None,
    "availableVersion": None,
    "message": "",
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
            log.warning(
                "Action command finished with non-zero code: action=%s code=%s",
                action,
                result.returncode,
            )
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

def get_cpu_temp_celsius():
    try:
        with open(CONFIG["temp_path"], "r", encoding="ascii") as f:
            raw = f.read().strip()
            return round(int(raw) / 1000.0, 1)
    except Exception:
        return None

@app.get("/api/system/health")
def health():
    return jsonify(
        {
            "ok": True,
            "time": datetime.now(timezone.utc).isoformat(),
        }
    )


@app.get("/api/system/status")
def status():
    in_progress = action_in_progress()

    with state_lock:
        current_action = state["action"]

    return jsonify(
        {
            "enabled": CONFIG["enabled"],
            "dryRun": CONFIG["dry_run"],
            "actions": {
                "reboot": CONFIG["allow_reboot"],
                "shutdown": CONFIG["allow_shutdown"],
            },
            "actionInProgress": in_progress,
            "currentAction": current_action,
            "time": datetime.now(timezone.utc).isoformat(),
            "uptimeSeconds": get_uptime_seconds(),
            "cpuTempCelsius": get_cpu_temp_celsius(),
        }
    )

def get_current_version():
    """Читает текущую версию из /var/www/orange-home-ui/version.json"""
    try:
        version_file = Path(CONFIG["web_root"]) / "version.json"
        if version_file.exists():
            data = json.loads(version_file.read_text(encoding="utf-8"))
            return data.get("version")
    except Exception as e:
        log.warning("Failed to read current version: %s", e)
    return None


def check_github_release():
    """Проверяет последнюю версию на GitHub"""
    url = f"https://api.github.com/repos/{CONFIG['update_repo']}/releases/latest"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "orange-home-ui-updater"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            tag = data.get("tag_name", "")
            if tag.startswith("v"):
                tag = tag[1:]
            download_url = None
            for asset in data.get("assets", []):
                if asset["name"].endswith(".tar.gz"):
                    download_url = asset["browser_download_url"]
                    break
            return tag, download_url
    except Exception as e:
        log.error("Failed to check GitHub: %s", e)
        return None, None


def run_update_install(download_url, new_version):
    """Фоновая задача: скачивает и устанавливает обновление"""
    try:
        set_update_state("downloading", new_version, "Скачивание архива...")

        # Скачиваем во временный файл
        tmp_dir = Path("/tmp/orange-home-ui-update")
        tmp_dir.mkdir(exist_ok=True)
        archive_path = tmp_dir / "update.tar.gz"

        urllib.request.urlretrieve(download_url, archive_path)

        set_update_state("installing", new_version, "Распаковка и установка...")

        web_root = Path(CONFIG["web_root"])

        # Очистка старых бэкапов ПЕРЕД созданием нового
        cleanup_old_backups(str(web_root), max_backups=2)

        # Делаем бэкап текущей версии
        backup_dir = web_root.parent / f"{web_root.name}-backup-{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"

        if web_root.exists():
            shutil.copytree(web_root, backup_dir, dirs_exist_ok=False)
            log.info("Backup created at %s", backup_dir)

        # Очищаем целевую директорию (кроме .git и других системных)
        for item in web_root.iterdir():
            if item.is_file():
                item.unlink()
            elif item.is_dir():
                shutil.rmtree(item)

        # Распаковываем
        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(web_root)

        # Устанавливаем права
        for item in web_root.rglob("*"):
            if item.is_dir():
                item.chmod(0o755)
            else:
                item.chmod(0o644)

        # Очищаем временные файлы
        shutil.rmtree(tmp_dir, ignore_errors=True)

        set_update_state("success", new_version, f"Обновление до v{new_version} завершено")
        log.info("Update to v%s completed successfully", new_version)

    except Exception as e:
        log.exception("Update failed")
        set_update_state("error", new_version, f"Ошибка: {e}")


def set_update_state(status, version=None, message=""):
    with update_state_lock:
        update_state["status"] = status
        if version:
            update_state["availableVersion"] = version
        update_state["message"] = message
        update_state["started_at"] = time.monotonic()


def handle_action(action: str):
    if not CONFIG["enabled"]:
        return jsonify({"accepted": False, "error": "power control disabled"}), 503

    if action == "reboot" and not CONFIG["allow_reboot"]:
        return jsonify({"accepted": False, "error": "reboot disabled"}), 403

    if action == "shutdown" and not CONFIG["allow_shutdown"]:
        return jsonify({"accepted": False, "error": "shutdown disabled"}), 403

    if CONFIG["require_action_header"]:
        if request.headers.get("X-System-Action") != "true":
            return jsonify(
                {
                    "accepted": False,
                    "error": "missing required header X-System-Action: true",
                }
            ), 400

    if not try_set_action(action):
        return jsonify({"accepted": False, "error": "action already in progress"}), 409

    threading.Thread(target=run_action, args=(action,), daemon=True).start()

    log.info(
        "Accepted action=%s dry_run=%s delay_seconds=%s",
        action,
        CONFIG["dry_run"],
        CONFIG["delay_seconds"],
    )

    return jsonify(
        {
            "accepted": True,
            "action": action,
            "dryRun": CONFIG["dry_run"],
            "executeInSeconds": CONFIG["delay_seconds"],
        }
    ), 202

@app.get("/api/system/update/check")
def check_update():
    """Проверяет наличие новой версии"""
    if not CONFIG["enabled"] or not CONFIG.get("allow_update", True):
        return jsonify({"error": "updates disabled"}), 403

    current = get_current_version()
    latest_tag, download_url = check_github_release()

    with update_state_lock:
        update_state["currentVersion"] = current

    has_update = (
        current is not None
        and latest_tag is not None
        and current != latest_tag
    )

    return jsonify({
        "currentVersion": current,
        "availableVersion": latest_tag,
        "hasUpdate": has_update,
        "downloadUrl": download_url if has_update else None,
    })


def cleanup_old_backups(web_root_path: str, max_backups: int = 2):
    """Удаляет старые бэкапы, оставляя только max_backups последних."""
    parent_dir = Path(web_root_path).parent
    base_name = Path(web_root_path).name
    backup_pattern = f"{base_name}-backup-*"
    
    # Находим все папки бэкапов и сортируем их по времени создания (от старых к новым)
    backup_dirs = sorted(parent_dir.glob(backup_pattern), key=os.path.getmtime)
    
    # Мы собираемся создать 1 новый бэкап, поэтому освобождаем место заранее
    to_delete_count = len(backup_dirs) - max_backups + 1
    
    if to_delete_count > 0:
        log.info(f"🧹 Очистка старых бэкапов: найдено {len(backup_dirs)}, удаляем {to_delete_count}")
        for old_dir in backup_dirs[:to_delete_count]:
            try:
                shutil.rmtree(old_dir)
                log.info(f"   🗑️ Удален старый бэкап: {old_dir.name}")
            except Exception as e:
                log.warning(f"   ⚠️ Не удалось удалить {old_dir.name}: {e}")
    else:
        log.info("🧹 Очистка бэкапов не требуется (лимит не превышен).")

@app.post("/api/system/update/install")
def install_update():
    """Запускает установку обновления в фоне"""
    if not CONFIG["enabled"]:
        return jsonify({"accepted": False, "error": "power control disabled"}), 503

    if not CONFIG.get("allow_update", True):
        return jsonify({"accepted": False, "error": "updates disabled"}), 403

    if CONFIG["require_action_header"]:
        if request.headers.get("X-System-Action") != "true":
            return jsonify({
                "accepted": False,
                "error": "missing required header X-System-Action: true",
            }), 400

    # Проверяем, не идёт ли уже обновление
    with update_state_lock:
        if update_state["status"] in ("checking", "downloading", "installing"):
            return jsonify({
                "accepted": False,
                "error": "update already in progress"
            }), 409

    current = get_current_version()
    latest_tag, download_url = check_github_release()

    if not download_url:
        return jsonify({
            "accepted": False,
            "error": "no update available or GitHub unreachable"
        }), 400

    if current == latest_tag:
        return jsonify({
            "accepted": False,
            "error": "already on latest version"
        }), 400

    if CONFIG["dry_run"]:
        log.info("DRY-RUN: would install update to v%s", latest_tag)
        return jsonify({
            "accepted": True,
            "dryRun": True,
            "newVersion": latest_tag,
        })

    set_update_state("checking", latest_tag, "Проверка обновлений...")

    threading.Thread(
        target=run_update_install,
        args=(download_url, latest_tag),
        daemon=True
    ).start()

    log.info("Update to v%s started", latest_tag)

    return jsonify({
        "accepted": True,
        "dryRun": False,
        "newVersion": latest_tag,
    }), 202


@app.get("/api/system/update/status")
def update_status():
    """Возвращает статус текущей операции обновления"""
    with update_state_lock:
        return jsonify(dict(update_state))

@app.post("/api/system/actions/reboot")
def reboot():
    return handle_action("reboot")


@app.post("/api/system/actions/shutdown")
def shutdown():
    return handle_action("shutdown")


if __name__ == "__main__":
    log.info(
        "Starting power-control host=%s port=%s dry_run=%s enabled=%s",
        CONFIG["host"],
        CONFIG["port"],
        CONFIG["dry_run"],
        CONFIG["enabled"],
    )
    serve(app, host=CONFIG["host"], port=CONFIG["port"], threads=4)
