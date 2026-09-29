# 🎬 Home Media Torrent System

Веб-приложение для поиска и загрузки торрентов с метаданными из TMDB. Гибридная архитектура: домашний сервер (Orange Pi) управляет загрузками и отдает UI, а облачный VPS выступает защищенным прокси для обхода блокировок TMDB и хостинга Jackett.

## 🏗 Архитектура

```mermaid
graph TD
    User[👤 Пользователь / Браузер] -->|HTTP 80| OP_Nginx[🟠 Nginx на Orange Pi<br/>192.168.0.150]
    
    OP_Nginx -->|/| UI[📁 Angular UI<br/>/var/www/orange-home-ui]
    OP_Nginx -->|/api/qbittorrent/| QB[💾 qBittorrent-nox<br/>localhost:8080]
    OP_Nginx -->|/api/system/| PC[⚡ Power Control Service<br/>localhost:8095]
    
    OP_Nginx -->|/api/jackett/, /tmdb/| VPS_Nginx[🔵 Nginx на VPS<br/>vres271.hlab.kz]
    
    VPS_Nginx -->|localhost:9117| Jackett[🔍 Jackett<br/>Docker Container]
    VPS_Nginx -->|HTTPS| TMDB_API[🌐 TMDB API<br/>api.themoviedb.org]
    VPS_Nginx -->|HTTPS| TMDB_IMG[🖼️ TMDB Images<br/>image.tmdb.org]
    
    QB --> Samba[📂 Samba Share<br/>/mnt/shared]
```

### 🧩 Компоненты
| Компонент | Хост | Назначение |
| :--- | :--- | :--- |
| **Angular UI** | Orange Pi | SPA-приложение. Раздается статически через Nginx. |
| **Nginx (Edge)** | Orange Pi | Reverse proxy. Маршрутизирует запросы к локальным сервисам и на VPS. |
| **qBittorrent-nox** | Orange Pi | Торрент-клиент. Управляется через API. |
| **Power Control** | Orange Pi | Python/Flask сервис для безопасного перезапуска/выключения устройства. |
| **Nginx (Proxy)** | VPS | Reverse proxy. Обходит блокировки TMDB (SNI + Host header). |
| **Jackett** | VPS | Агрегатор индексеров в Docker. |

---

## 📂 Структура скриптов развертывания

Проект использует идемпотентные bash-скрипты. Их можно запускать многократно.

```text
📁 vps/
 ├── jackett.sh       # Установка Docker и запуск контейнера Jackett
 └── nginx.sh         # Настройка Nginx Reverse Proxy (TMDB + Jackett)

📁 orange-home-server/
 ├── nginx.sh               # Настройка Nginx, папки UI и правил проксирования
 ├── qbittorrent-samba.sh   # Установка торрент-клиента, создание пользователя и сетевой папки
 ├── power-control.sh       # Установка и настройка сервиса управления питанием
 └── deploy-ui.sh           # 🚀 Скрипт обновления: скачивает последний релиз с GitHub и распаковывает его
```

---

## 🚀 Развертывание системы

### Этап 1: Настройка VPS
1. Подключитесь к VPS по SSH.
2. Перейдите в папку `vps/`.
3. Запустите `bash jackett.sh`. 
   > ⚠️ **Важно:** После запуска откройте `http://<VPS_IP>:9117`, задайте пароль администратора и скопируйте API-ключ.
4. Запустите `bash nginx.sh`. Скрипт настроит проксирование и автоматически проверит доступность TMDB и Jackett.

### Этап 2: Настройка Orange Pi
1. Подключитесь к Orange Pi по SSH.
2. Перейдите в папку `orange-home-server/`.
3. Выполните скрипты по порядку:
   ```bash
   sudo bash nginx.sh
   sudo bash qbittorrent-samba.sh   # Скрипт попросит задать пароль для Samba
   sudo bash power-control.sh
   ```
4. **Первичная настройка qBittorrent:** Зайдите в WebUI (`http://<OrangePi_IP>:8080`), логин/пароль по умолчанию: `admin` / `adminadmin`. **Смените пароль** и укажите путь сохранения `/mnt/shared`.

### Этап 3: Деплой и обновление Frontend

Сборка и публикация интерфейса выполняется на машине разработчика одной командой:
```bash
npm run release
```
> 💡 **Что делает эта команда:** интерактивно повышает версию, создает Git-коммит и тег, **автоматически удаляет `config.json` из сборки** (для защиты ключей), упаковывает архив и создает Release на GitHub.

**Установка или обновление на сервере:**
Теперь это можно сделать прямо из веб-интерфейса, без SSH:
1. Откройте раздел **Настройки** → **О приложении**.
2. Нажмите кнопку **"Проверить обновления"**.
3. Подтвердите установку. Python-бэкенд безопасно скачает архив, сделает бэкап старой версии и заменит файлы.
4. Обновите страницу в браузере (`F5`).

*(Альтернативно, для первичной установки можно использовать скрипт `sudo bash deploy-ui.sh`, если он добавлен в репозиторий).*

---

## ⚙️ Конфигурация и безопасность API-ключей

Приложение загружает настройки из `/config.json`. Чтобы ваши приватные API-ключи (TMDB, Jackett) **никогда не попадали в Git или публичные релизы GitHub**, реализована следующая схема защиты:

1. Файл `public/config.json` на машине разработчика содержит ключи только для локальной отладки (`ng serve`) и добавлен в `.gitignore`.
2. Скрипт релиза (`create-github-release.js`) автоматически удаляет `config.json` из папки `dist` перед упаковкой архива.
3. На Orange Pi Nginx перехватывает запросы к `/config.json` и отдает защищенный файл из директории `/etc/orange-home-ui/`, игнорируя содержимое папки с фронтендом.

**Пример защищенного `/etc/orange-home-ui/config.json` на сервере:**
```json
{
  "tmdbApiKey": "ВАШ_КЛЮЧ_TMDB_API",
  "jackettApiKey": "ВАШ_КЛЮЧ_ИЗ_ЭТАПА_1",
  "jackettUrl": "/api/jackett",
  "qbittorrentUrl": "/api/qbittorrent"
}
```
*Этот файл создается вручную при развертывании и имеет строгие права доступа (`chmod 640`, владелец `root:www-data`).*


---

## 🛠️ Troubleshooting

| Симптом | Причина | Решение |
| :--- | :--- | :--- |
| **502 Bad Gateway** на `/tmdb/` | Nginx на VPS не может установить HTTPS с TMDB. | Проверьте наличие `proxy_ssl_server_name on;` в `vps/nginx.sh`. |
| **CORS ошибки** в браузере | Фронтенд стучится напрямую на VPS, минуя Nginx Orange Pi. | Убедитесь, что в Angular `baseUrl` указывает на Orange Pi, а эндпоинты относительные. |
| **Версия UI не обновилась** | Браузер закэшировал старый `index.html`. | Скрипт `deploy-ui.sh` корректно настроен, но попробуйте жесткую перезагрузку (`Ctrl+F5`). Конфиг Nginx уже запрещает кэширование `version.json`. |
| **В приложении нет данных из TMDB/Jackett** | Файл `/etc/orange-home-ui/config.json` на сервере отсутствует, пуст или имеет неверные права доступа. | Создайте файл по инструкции из раздела "Конфигурация" и выполните `sudo systemctl reload nginx`. |
