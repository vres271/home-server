# Power Control Service

Локальный сервис управления питанием Orange Pi (reboot / shutdown) с REST API, проксируемым через Nginx.

## Назначение

Сервис позволяет веб-интерфейсу (Angular) выполнять безопасные системные команды
`reboot` и `shutdown` на домашнем сервере Orange Pi H3, а также получать информацию
о состоянии системы: uptime и температуру CPU.

## Архитектура

```
Browser (Angular UI)
        ↓ HTTP
      Nginx (порт 80/443)
        ↓ /api/system/
  Python Flask + Waitress (127.0.0.1:8095)
        ↓
  systemctl poweroff / systemctl reboot
```

Сервис запускается как systemd-unit от пользователя `root` и слушает только
`127.0.0.1:8095`. Извне доступен исключительно через Nginx, который дополнительно
ограничивает доступ по IP-подсети локальной сети.

## API

### `GET /api/system/health`
Легкий health-check. Используется Angular для ожидания возврата сервера после reboot.

Ответ:
```json
{ "ok": true, "time": "2026-08-13T..." }
```

### `GET /api/system/status`
Текущее состояние сервиса и сервера, включая температуру CPU.

Ответ:
```json
{
  "enabled": true,
  "dryRun": false,
  "actions": { "reboot": true, "shutdown": true },
  "actionInProgress": false,
  "currentAction": null,
  "time": "2026-08-13T...",
  "uptimeSeconds": 12345.6,
  "cpuTempCelsius": 31.1
}
```

Поле `cpuTempCelsius` читается из системного файла (по умолчанию `/sys/class/thermal/thermal_zone0/temp`),
где значение хранится в миллиградусах. Сервис автоматически конвертирует его в градусы Цельсия.

### `POST /api/system/actions/reboot`
Запуск перезагрузки.

### `POST /api/system/actions/shutdown`
Запуск выключения.

Оба эндпоинта требуют заголовок:
```
X-System-Action: true
```

Ответ при успехе: `202 Accepted`
```json
{
  "accepted": true,
  "action": "reboot",
  "dryRun": false,
  "executeInSeconds": 2.0
}
```

## Принцип работы

1. Angular отправляет POST-запрос с заголовком `X-System-Action: true`.
2. Сервис проверяет флаги `enabled`, `allow_reboot`, `allow_shutdown`.
3. Проверяется, что действие не запущено повторно (защита от двойного клика).
4. Возвращается `202 Accepted`, а реальная команда выполняется в фоновом потоке
   с небольшой задержкой (`POWER_DELAY_SECONDS`), чтобы клиент успел получить ответ.
5. Команда выполняется через `subprocess.run` напрямую (без shell), что исключает
   инъекции.

## Мониторинг температуры

Сервис читает температуру CPU из системного файла thermal zone. По умолчанию используется:

```
/sys/class/thermal/thermal_zone0/temp
```

Путь можно изменить через переменную окружения `POWER_TEMP_PATH`.

В веб-интерфейсе Angular отображает температуру с цветовой индикацией:
- **Зеленый** (до 50°C) — нормальная температура
- **Желтый** (50–65°C) — повышенная температура
- **Красный** (выше 65°C) — перегрев, требуется внимание

## Режим dry-run

При `POWER_DRY_RUN=true` сервис принимает команды и пишет в лог, но не выполняет
`systemctl`. Позволяет безопасно разрабатывать и тестировать UI.

## Конфигурация

Файл `/etc/power-control.env`:

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `POWER_ENABLED` | `true` | Полное включение/выключение сервиса |
| `POWER_DRY_RUN` | `true` | Сухой режим (без реального выключения) |
| `POWER_ALLOW_REBOOT` | `true` | Разрешена ли перезагрузка |
| `POWER_ALLOW_SHUTDOWN` | `true` | Разрешено ли выключение |
| `POWER_HOST` | `127.0.0.1` | На каком адресе слушать |
| `POWER_PORT` | `8095` | Порт |
| `POWER_DELAY_SECONDS` | `2.0` | Задержка перед выполнением команды |
| `POWER_USE_SUDO` | `false` | Использовать sudo (для не-root режима) |
| `POWER_SUDO_PATH` | `/usr/bin/sudo` | Путь к sudo |
| `POWER_SYSTEMCTL_PATH` | `/usr/bin/systemctl` | Путь к systemctl |
| `POWER_TEMP_PATH` | `/sys/class/thermal/thermal_zone0/temp` | Путь к файлу температуры CPU |
| `POWER_REQUIRE_ACTION_HEADER` | `true` | Требовать заголовок `X-System-Action` |

После изменения конфига:
```bash
sudo systemctl restart power-control.service
```

## Nginx

В основной конфиг сайта (например, `/etc/nginx/sites-available/orange-home-ui`)
добавляется сниппет:

```nginx
include /etc/nginx/snippets/power-control.conf;
```

Содержимое сниппета (`/etc/nginx/snippets/power-control.conf`):

```nginx
location /api/system/ {
    allow 127.0.0.1;
    allow ::1;
    allow 192.168.0.0/24;
    deny all;

    limit_except GET POST {
        deny all;
    }

    proxy_pass http://127.0.0.1:8095;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 10s;
}
```

## Файлы

- `/opt/power-control/app.py` — код сервиса
- `/opt/power-control/.venv/` — виртуальное окружение Python
- `/opt/power-control/install.sh` — скрипт установки/обновления
- `/opt/power-control/README.md` — эта документация
- `/etc/power-control.env` — конфигурация
- `/etc/systemd/system/power-control.service` — systemd-юнит
- `/etc/nginx/snippets/power-control.conf` — Nginx-сниппет

## Управление

```bash
sudo systemctl status power-control.service
sudo systemctl restart power-control.service
sudo journalctl -u power-control -f
```

## Установка и обновление

### Предварительный просмотр (что будет сделано)
```bash
sudo /opt/power-control/install.sh --dry-run
```

### Установка с параметрами по умолчанию
```bash
sudo /opt/power-control/install.sh
```

### Установка с другой подсетью (например, `192.168.1.0/24`)
```bash
sudo /opt/power-control/install.sh --subnet 192.168.1.0/24
```

### Перезаписать существующие файлы
```bash
sudo /opt/power-control/install.sh --force
```

Скрипт **не модифицирует** основной Nginx-конфиг автоматически. Вместо этого он создает
готовый сниппет `/etc/nginx/snippets/power-control.conf`, который нужно один раз
подключить в основной конфиг сайта через `include`.

## Поведение после команд

- **reboot**: сервер перезагружается, systemd корректно останавливает qBittorrent,
  Jackett и другие сервисы. После загрузки сервис `power-control` стартует
  автоматически. Angular UI ожидает возврата сервера через polling `/api/system/health`.
- **shutdown**: сервер выключается. Включить обратно можно только физически,
  через умную розетку или WoL (если поддерживается).

## Безопасность

Сервис работает от `root`, поэтому:

- доступен только из локальной сети (ограничение Nginx по IP-подсети);
- не имеет авторизации (предполагается доверенная локальная сеть);
- требует заголовок `X-System-Action: true` как минимальную защиту от CSRF;
- не выполняет произвольные shell-команды — только заранее известные действия;
- имеет защиту от повторного запуска действия;
- имеет режим `dry_run` для безопасной разработки.

## Интеграция с Angular

В Angular-приложении используются:

- `SystemService` (`core/services/system.service.ts`) — HTTP-клиент для API
- `SystemStatus` модель (`core/models/system.model.ts`) — типы данных
- `SystemPowerControlComponent` (`features/settings/components/system-power-control/`) — UI компонент

Все запросы к действиям (reboot/shutdown) отправляются с заголовком:
```
X-System-Action: true
```

После успешной перезагрузки UI автоматически опрашивает `/api/system/health` каждые 3 секунды,
чтобы дождаться возврата сервера и обновить статус.

## Возможные проблемы

### Сервис не запускается
```bash
sudo journalctl -u power-control -n 50
```

### Ошибка 403 Forbidden
Nginx отклонил запрос из-за ограничения по IP. Проверь, что твой IP входит в разрешенную подсеть
в `/etc/nginx/snippets/power-control.conf`.

### Ошибка 409 Conflict
Действие уже выполняется. Подожди 10–15 секунд или перезапусти сервис.

### Температура не отображается
Проверь, существует ли файл `/sys/class/thermal/thermal_zone0/temp`:
```bash
cat /sys/class/thermal/thermal_zone0/temp
```

Если файла нет, укажи правильный путь в `POWER_TEMP_PATH`.
