import logging
import os
import socket
import subprocess
import ipaddress
import json
import threading
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor, as_completed

from flask import Flask, jsonify, request
from waitress import serve

from drivers import get_driver, DRIVERS

def env_str(name: str, default: str) -> str:
    return os.getenv(name, default)

def env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except Exception:
        return default

CONFIG = {
    "host": env_str("TV_HOST", "127.0.0.1"),
    "port": env_int("TV_PORT", 8096),
    "adb_path": env_str("ADB_PATH", "/usr/bin/adb"),
    "adb_default_target": env_str("ADB_DEFAULT_TARGET", "192.168.0.120:5555"),
    "smb_share_name": env_str("SMB_SHARE_NAME", "Shared"),
    "default_save_path": env_str("DEFAULT_SAVE_PATH", "/mnt/shared"),
}

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tv-control")

# -------- Хранилище настроек (JSON рядом со скриптом) --------
SETTINGS_PATH = env_str(
    "TV_SETTINGS_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "settings.json"),
)
settings_lock = threading.RLock()

DEFAULT_SETTINGS = {
    "device": None,      # выбранный ТВ: {ip, port, target, name}
    "player": "nova",    # драйвер по умолчанию
}


def load_settings() -> dict:
    """Читает настройки из файла. При отсутствии или ошибке возвращает дефолты."""
    try:
        with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return {**DEFAULT_SETTINGS, **data}
    except FileNotFoundError:
        log.info("Файл настроек %s не найден, используются значения по умолчанию", SETTINGS_PATH)
    except Exception as e:
        log.warning("Не удалось прочитать %s: %s", SETTINGS_PATH, e)
    return dict(DEFAULT_SETTINGS)


def save_settings(data: dict) -> None:
    """Атомарная запись: пишем во временный файл, затем подменяем основной."""
    tmp_path = SETTINGS_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, SETTINGS_PATH)


SETTINGS = load_settings()


def get_current_target() -> str:
    """Адрес выбранного ТВ, либо фолбэк из переменных окружения."""
    with settings_lock:
        device = SETTINGS.get("device")
    if device and device.get("target"):
        return device["target"]
    return CONFIG["adb_default_target"]


def get_current_player() -> str:
    """Выбранный драйвер плеера."""
    with settings_lock:
        return SETTINGS.get("player") or "nova"

def get_local_ip_for_target(target: str) -> str:
    target_ip = target.split(":")[0]
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect((target_ip, 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"

def build_smb_url(file_input: str, target: str) -> str:
    raw = file_input.strip()
    if raw.startswith("smb://"):
        _, rest = raw.split("smb://", 1)
        return "smb://" + quote(rest, safe="/:@")
    
    shared_root = CONFIG["default_save_path"].rstrip("/")
    rel_path = raw[len(shared_root) + 1 :] if raw.startswith(shared_root + "/") else raw.lstrip("/")
    host_ip = os.getenv("SMB_HOST_IP") or get_local_ip_for_target(target)
    share_name = CONFIG["smb_share_name"].strip("/")
    return f"smb://{host_ip}/{share_name}/{quote(rel_path, safe='/')}"

def get_local_subnet(default_target: str) -> str:
    """Определяет подсеть /24 на основе целевого IP (например, из 192.168.0.120 делает 192.168.0.0/24)"""
    ip_part = default_target.split(":")[0]
    try:
        network = ipaddress.IPv4Network(f"{ip_part}/24", strict=False)
        return str(network)
    except Exception:
        return "192.168.0.0/24"

def scan_network_for_adb(subnet: str, port: int = 5555, timeout: float = 0.5) -> list:
    """Сканирует подсеть в поисках открытых портов ADB в щадящем режиме."""
    network = ipaddress.IPv4Network(subnet, strict=False)
    found_devices = []

    def check_ip(ip):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(timeout)
                if s.connect_ex((str(ip), port)) == 0:
                    return str(ip)
        except Exception:
            pass
        return None

    # СНИЖАЕМ max_workers с 50 до 10. Это критически важно для Orange Pi H3
    # и предотвращает перегрузку NAT-таблицы роутера.
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(check_ip, ip): ip for ip in network.hosts()}
        for future in as_completed(futures):
            result = future.result()
            if result:
                found_devices.append({
                    "ip": result,
                    "port": port,
                    "target": f"{result}:{port}"
                })
    
    return sorted(found_devices, key=lambda x: x["ip"])

def get_device_name(adb_path: str, target: str) -> str:
    """Получает бренд и модель устройства через ADB."""
    try:
        # Убеждаемся, что устройство подключено (на случай, если сессия сброшена)
        subprocess.run([adb_path, "connect", target], capture_output=True, timeout=2, check=False)
        
        # Запрашиваем бренд и модель параллельно или последовательно (тут последовательно, но быстро)
        cmd_brand = [adb_path, "-s", target, "shell", "getprop", "ro.product.brand"]
        res_brand = subprocess.run(cmd_brand, capture_output=True, text=True, timeout=2.0, check=False)
        
        cmd_model = [adb_path, "-s", target, "shell", "getprop", "ro.product.model"]
        res_model = subprocess.run(cmd_model, capture_output=True, text=True, timeout=2.0, check=False)
        
        brand = res_brand.stdout.strip()
        model = res_model.stdout.strip()
        
        if brand and model:
            return f"{brand} {model}"
        elif model:
            return model
        else:
            return "Unknown Android Device"
            
    except Exception:
        return "Unknown Device"

@app.get("/api/media/discover")
def discover_devices():
    """Сканирует сеть и возвращает список ADB-устройств с их именами."""
    subnet = get_local_subnet(CONFIG["adb_default_target"])
    log.info("Запуск сканирования сети %s на предмет ADB-устройств...", subnet)
    
    try:
        # 1. Быстрый скан портов (как было)
        devices = scan_network_for_adb(subnet, port=5555, timeout=0.3)
        
        if not devices:
            return jsonify({"ok": True, "subnet": subnet, "devices": [], "count": 0})
            
        log.info("Найдено %d устройств. Опрос имен...", len(devices))
        adb_path = CONFIG["adb_path"]
        
        # 2. Параллельный опрос имен (чтобы не ждать по 2 секунды на каждое устройство)
        def enrich_device(dev):
            dev["name"] = get_device_name(adb_path, dev["target"])
            return dev

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(enrich_device, dev) for dev in devices]
            enriched_devices = [future.result() for future in as_completed(futures)]

        # Сортируем итоговый список по IP для красоты
        enriched_devices.sort(key=lambda x: x["ip"])
        
        return jsonify({
            "ok": True,
            "subnet": subnet,
            "devices": enriched_devices,
            "count": len(enriched_devices)
        })
        
    except Exception as e:
        log.exception("Ошибка при сканировании сети")
        return jsonify({"ok": False, "error": str(e)}), 500

@app.post("/api/media/play")
def media_play():
    data = request.get_json(silent=True) or {}
    file_path = data.get("file") or data.get("path") or data.get("url")
    player = data.get("player") or get_current_player()

    if not file_path or not isinstance(file_path, str):
        return jsonify({"ok": False, "error": "Не передан параметр 'file'"}), 400

    target = data.get("target") or get_current_target()
    smb_url = build_smb_url(file_path, target)
    adb = CONFIG["adb_path"]

    try:
        # Подключаемся (на всякий случай)
        subprocess.run([adb, "connect", target], capture_output=True, text=True, timeout=5, check=False)
        
        driver = get_driver(player)
        log.info("Launching media on %s using driver '%s': %s", target, player, smb_url)
        
        result = driver.play(adb, target, smb_url)
        
        if not result.get("ok"):
            log.error("Play failed: %s", result.get("details"))
            return jsonify({"ok": False, "error": result.get("error"), "details": result.get("details"), "smbUrl": smb_url}), 502

        return jsonify({"ok": True, "target": target, "smbUrl": smb_url, "output": result.get("output")})

    except Exception as e:
        log.exception("Unexpected error in /api/media/play")
        return jsonify({"ok": False, "error": str(e)}), 500

@app.post("/api/media/control")
def media_control():
    data = request.get_json(silent=True) or {}
    action = data.get("action")
    player = data.get("player") or get_current_player()
    target = data.get("target") or get_current_target()
    adb = CONFIG["adb_path"]

    try:
        subprocess.run([adb, "connect", target], capture_output=True, timeout=3, check=False)
        
        driver = get_driver(player)
        log.info("Sending control '%s' to %s using driver '%s'", action, target, player)
        
        result = driver.control(adb, target, action)
        
        if not result.get("ok"):
            return jsonify({"ok": False, "error": result.get("error"), "details": result.get("details")}), 502

        return jsonify({"ok": True, "action": action})

    except Exception as e:
        log.exception("Unexpected error in /api/media/control")
        return jsonify({"ok": False, "error": str(e)}), 500

@app.get("/api/media/status")
def media_status():
    target = request.args.get("target") or get_current_target()
    adb = CONFIG["adb_path"]
    
    # Проверяем плееры по очереди. Первый, кто активен, вернет статус.
    # Порядок важен: если играет Kodi, мы хотим увидеть его (так как он дает лучшее время).
    
    drivers_to_check = ["nova", "tcl", "kodi"]
    
    for player_name in drivers_to_check:
        driver = get_driver(player_name)
        status = driver.get_status(adb, target)
        if status["active"]:
            return jsonify(status)
            
    # Если ни один не активен
    return jsonify({
        "active": False, 
        "isPlaying": False, 
        "filePath": None, 
        "title": None, 
        "positionSeconds": None
    })

@app.get("/api/media/settings")
def media_settings_get():
    """Возвращает текущие настройки сервиса."""
    with settings_lock:
        current = dict(SETTINGS)
    return jsonify({
        "ok": True,
        "settings": current,
        "effectiveTarget": get_current_target(),
        "fallbackTarget": CONFIG["adb_default_target"],
        "availablePlayers": list(DRIVERS.keys()),
        "settingsPath": SETTINGS_PATH,
    })

@app.post("/api/media/settings")
def media_settings_update():
    """Сохраняет настройки. Принимает device (объект из discover или null) и/или player."""
    data = request.get_json(silent=True) or {}

    if "device" not in data and "player" not in data:
        return jsonify({"ok": False, "error": "Не переданы параметры 'device' или 'player'"}), 400

    with settings_lock:
        updated = dict(SETTINGS)

        if "device" in data:
            device = data["device"]
            if device is None:
                updated["device"] = None
            elif isinstance(device, dict) and device.get("target"):
                try:
                    updated["device"] = {
                        "ip": device.get("ip") or device["target"].split(":")[0],
                        "port": int(device.get("port") or 5555),
                        "target": device["target"],
                        "name": device.get("name") or device["target"],
                    }
                except (ValueError, TypeError):
                    return jsonify({"ok": False, "error": "Некорректный порт в объекте 'device'"}), 400
            else:
                return jsonify({"ok": False, "error": "Некорректный объект 'device'"}), 400

        if "player" in data:
            player = data["player"]
            if not isinstance(player, str) or player not in DRIVERS:
                return jsonify({
                    "ok": False,
                    "error": f"Неизвестный плеер. Доступно: {', '.join(DRIVERS.keys())}"
                }), 400
            updated["player"] = player

        try:
            save_settings(updated)
        except Exception as e:
            log.exception("Не удалось сохранить настройки")
            return jsonify({"ok": False, "error": str(e)}), 500

        SETTINGS.clear()
        SETTINGS.update(updated)
        log.info("Настройки сохранены: device=%s player=%s", updated.get("device"), updated.get("player"))

    return jsonify({"ok": True, "settings": updated, "effectiveTarget": get_current_target()})

if __name__ == "__main__":
    log.info("Starting tv-control host=%s port=%s", CONFIG["host"], CONFIG["port"])
    serve(app, host=CONFIG["host"], port=CONFIG["port"], threads=4)