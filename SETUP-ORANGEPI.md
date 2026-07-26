# 🛠 Настройка Orange Pi для OrangeHome-UI

Этот скрипт автоматически настраивает Orange Pi как веб-сервер для нашего Angular-приложения.

## 📋 Что делает скрипт

- ✅ Устанавливает и обновляет **Nginx**
- ✅ Создаёт директорию `/var/www/orange-home-ui` с правильными правами
- ✅ Настраивает **reverse proxy** для:
  - Jackett (`/api/jackett/` → `109.248.162.130:9117`)
  - qBittorrent (`/api/qbittorrent/` → `localhost:8080`)
- ✅ Раздаёт статические файлы Angular-приложения
- ✅ Настраивает кэширование статики (JS/CSS/шрифты)
- ✅ Открывает порт 80 в UFW (если firewall активен)
- ✅ Отключает стандартный сайт Nginx (`default`)

## 📦 Требования

- Orange Pi с Armbian (или другим Debian-based дистрибутивом)
- Доступ по SSH с правами `root`
- Сеть: Orange Pi должен иметь доступ к Jackett VPS и локальному qBittorrent

## 🚀 Пошаговая инструкция

### 1. Загрузи скрипт на Orange Pi

На своём ПК (в Git Bash), находясь в корне проекта:

```bash
scp setup-orangepi.sh root@192.168.0.150:/root/
```

> 💡 Если не настроены SSH-ключи, будет запрошен пароль root.

### 2. Подключись к Orange Pi по SSH

```bash
ssh root@192.168.0.150
```

### 3. Сделай скрипт исполняемым

```bash
chmod +x /root/setup-orangepi.sh
```

### 4. Запусти скрипт

```bash
/root/setup-orangepi.sh
```

Скрипт выведет прогресс выполнения и в конце покажет IP-адрес для проверки.

### 5. Проверь работу Nginx

Открой в браузере:

```
http://192.168.0.150
```

> ⚠️ На этом этапе ты увидишь ошибку `403 Forbidden` или страницу Nginx по умолчанию — это нормально, потому что мы ещё не залили файлы Angular-приложения.

## 📤 Деплой приложения

После настройки сервера нужно залить собранный Angular-проект.

### На своём ПК (в Git Bash):

```bash
# 1. Собери продакшен-версию
npm run build

# 2. Скопируй файлы на Orange Pi
scp -r dist/orange-home-ui/browser/* root@192.168.0.150:/var/www/orange-home-ui/
```

### Проверка в браузере:

Открой `http://192.168.0.150` — должно открыться приложение.

## 🔧 Проверка прокси

Убедись, что прокси работают корректно, выполнив на Orange Pi:

```bash
# Проверка Jackett
curl -I http://localhost/api/jackett/api/v2.0/indexers/all/results

# Проверка qBittorrent
curl -I http://localhost/api/qbittorrent/api/v2/torrents/info
```

Оба запроса должны вернуть HTTP-ответ (200, 401 или другой — главное, не `502 Bad Gateway`).

## 🔄 Переустановка

Скрипт **идемпотентный** — его можно запускать несколько раз без последствий. Если что-то сломалось в конфигурации Nginx, просто запусти скрипт заново:

```bash
/root/setup-orangepi.sh
```

## 🐛 Возможные проблемы

### Ошибка "Permission denied" при запуске
**Решение:** Скрипт нужно запускать от `root`:
```bash
sudo /root/setup-orangepi.sh
```

### Ошибка "nginx: [emerg] bind() to 0.0.0.0:80 failed"
**Причина:** Кто-то уже занимает порт 80.
**Решение:**
```bash
sudo lsof -i :80
sudo systemctl stop apache2  # Если это Apache
```

### Ошибка 502 Bad Gateway при обращении к `/api/jackett/`
**Причина:** Jackett недоступен с Orange Pi.
**Решение:** Проверь доступность с Orange Pi:
```bash
curl -I http://109.248.162.130:9117
```

### Ошибка 502 Bad Gateway при обращении к `/api/qbittorrent/`
**Причина:** qBittorrent-nox не запущен.
**Решение:**
```bash
sudo systemctl status qbittorrent-nox
sudo systemctl start qbittorrent-nox
```

## 📂 Структура после настройки

```
/etc/nginx/
├── sites-available/
│   └── orange-home-ui       # Конфигурация сайта
└── sites-enabled/
    └── orange-home-ui -> ... # Символическая ссылка

/var/www/
└── orange-home-ui/          # Папка для Angular-файлов
    ├── index.html
    ├── main-XXXX.js
    ├── styles-XXXX.css
    └── ...
```

## 🧹 Удаление (если нужно)

Чтобы откатить все изменения, выполни на Orange Pi:

```bash
# Удалить конфигурацию Nginx
sudo rm /etc/nginx/sites-enabled/orange-home-ui
sudo rm /etc/nginx/sites-available/orange-home-ui
sudo systemctl reload nginx

# Удалить папку с приложением
sudo rm -rf /var/www/orange-home-ui

# Удалить сам скрипт
rm /root/setup-orangepi.sh
```

---

**Версии компонентов:**
- Nginx: любой актуальный из apt
- Orange Pi OS: Armbian (Debian-based)
- Скрипт протестирован: Июль 2026

