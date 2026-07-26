# OrangePi Home Server UI

Веб-приложение для управления домашним сервером на базе Orange Pi PC H3.  
Торренты — только один из разделов. Архитектура спроектирована для расширения.

## 🏗 Архитектура

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Браузер       │ ───▶ │  nginx (OrangePi)│ ───▶ │ Jackett (VPS)  │
│   (Angular)     │      │  порт 80         │      │ 109.248.162.130 │
│                 │      │                  │      │ :9117           │
│                 │ ───▶ │                  │ ───▶ │                │
│                 │      │ qBittorrent      │      │                 │
│                 │      │ localhost:8080   │      │                 │
└─────────────────┘      └──────────────────┘      └─────────────────┘
```

### Компоненты
- **Frontend:** Angular 19 + PrimeNG 19 + PrimeFlex
- **Backend-сервисы:**
  - Jackett (VPS) — поиск торрентов по трекерам
  - qBittorrent-nox (Orange Pi) — скачивание торрентов
- **Web-сервер:** nginx (Orange Pi) — прокси и раздача статики
- **Хостинг:** Orange Pi PC H3 (Armbian, 1 ГБ RAM, SSD в /mnt/shared)

## 📋 Требования

### Для разработки (Windows/Linux/macOS)
- **Node.js 22 LTS** (скачать: https://nodejs.org/)
- **npm 10+** (идёт в комплекте с Node.js)
- Git

### Для Orange Pi
- Armbian (или другой Debian-based дистрибутив)
- nginx
- qBittorrent-nox
- Примонтированный SSD в `/mnt/shared` (ext4, опция `noatime`)

## 🚀 Локальная разработка

### 1. Установка зависимостей

```bash
npm install
```

> ⚠️ Если возникают ошибки `ERESOLVE` с `@angular/animations`, используй:
> ```bash
> npm install --legacy-peer-deps
> ```

### 2. Запуск dev-сервера

```bash
npm start
```

Открой в браузере: http://localhost:4200

## 📦 Сборка для продакшена

```bash
npm run build
```

Результат появится в папке `dist/orange-home-ui/browser/`.

> ⚠️ **Важно:** В Angular 19 с новым сборщиком esbuild файлы лежат в подпапке `browser/`, не в корне `dist/`!

## 🖥 Настройка Orange Pi

### 1. Установка nginx

```bash
sudo apt update
sudo apt install nginx -y
sudo systemctl enable nginx
```

### 2. Конфигурация nginx

Создай файл `/etc/nginx/sites-available/orange-home-ui`:

```nginx
server {
    listen 80;
    server_name _;  # Замени на IP Orange Pi или домен

    client_max_body_size 50M;

    # Проксирование Jackett (VPS)
    location /api/jackett/ {
        proxy_pass http://109.248.162.130:9117/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_hide_header Access-Control-Allow-Origin;
    }

    # Проксирование qBittorrent-nox (Localhost)
    location /api/qbittorrent/ {
        proxy_pass http://localhost:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_hide_header Access-Control-Allow-Origin;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Раздача статических файлов Angular
    location / {
        root /var/www/orange-home-ui;
        index index.html;
        try_files $uri $uri/ /index.html;

        # Кэширование статики
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

### 3. Активация конфигурации

```bash
sudo ln -s /etc/nginx/sites-available/orange-home-ui /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Удаляем стандартную конфигурацию
sudo nginx -t                              # Проверяем синтаксис
sudo systemctl reload nginx                # Перезагружаем nginx
```

### 4. Создание папки для приложения

```bash
sudo mkdir -p /var/www/orange-home-ui
sudo chown -R root:root /var/www/orange-home-ui
```

### 5. Firewall (если включён)

```bash
sudo ufw allow 80/tcp
sudo ufw status
```

## 📤 Деплой на Orange Pi

### Из Git Bash (Windows)

```bash
# Копируем содержимое папки browser/ на Orange Pi
scp -r dist/orange-home-ui/browser/* root@192.168.0.150:/var/www/orange-home-ui/
```

> 💡 **Совет:** Настрой SSH-ключи, чтобы не вводить пароль каждый раз:
> ```bash
> ssh-keygen -t ed25519 -C "orangepi-deploy"
> ssh-copy-id root@192.168.0.150
> ```

### Альтернатива: WinSCP

Используй графический клиент WinSCP (https://winscp.net/) для удобной загрузки файлов.

## 🔍 Проверка работы

После деплоя открой в браузере:
```
http://192.168.0.150
```

Должен появиться интерфейс с боковым меню и разделами:
- Главная (Dashboard)
- Торренты
- Настройки

### Проверка прокси

На Orange Pi выполни:
```bash
# Проверка Jackett
curl -I http://localhost/api/jackett/api/v2.0/indexers/all/results

# Проверка qBittorrent
curl -I http://localhost/api/qbittorrent/api/v2/torrents/info
```

## 🐛 Частые проблемы и решения

### 1. `ERESOLVE unable to resolve dependency tree`

**Причина:** Конфликт peer dependencies (например, `@angular/animations` не той версии).

**Решение:**
```bash
npm install --legacy-peer-deps
```

Или явно укажи совместимые версии:
```bash
npm install @angular/animations@^19
```

### 2. `Could not resolve "primeng/resources/..."`

**Причина:** В PrimeNG 18+ удалена папка `resources`. Темы теперь подключаются через `@primeng/themes`.

**Решение:**
1. Установи пакет тем:
   ```bash
   npm install @primeng/themes
   ```
2. В `angular.json` убери все пути к `primeng/resources/...`
3. В `app.config.ts` добавь:
   ```typescript
   import { providePrimeNG } from 'primeng/config';
   import Lara from '@primeng/themes/lara';

   providePrimeNG({
     theme: {
       preset: Lara,
       options: { darkModeSelector: false }
     }
   })
   ```

### 3. `Could not resolve "node_modules/primeng/..."` в angular.json

**Причина:** Новый сборщик esbuild не любит явный префикс `node_modules/` в путях.

**Решение:** В `angular.json` убери `node_modules/` из путей:
```json
"styles": [
  "primeicons/primeicons.css",
  "primeflex/primeflex.css",
  "src/styles.css"
]
```

### 4. `Permission denied` при scp

**Причина:** Неправильное имя пользователя или пароль.

**Решение:** Используй `root@` вместо `user@`:
```bash
scp -r dist/orange-home-ui/browser/* root@192.168.0.150:/var/www/orange-home-ui/
```

### 5. Белый экран после деплоя

**Причина:** Файлы скопированы не в ту папку (создалась вложенная папка `browser/`).

**Решение:** Проверь структуру на Orange Pi:
```bash
ls /var/www/orange-home-ui/
```
Файл `index.html` должен быть **прямо в корне** `/var/www/orange-home-ui/`, а не в подпапке.

### 6. Ошибка 403 Forbidden

**Причина:** Nginx не может прочитать файлы.

**Решение:**
```bash
sudo chmod -R 755 /var/www/orange-home-ui
sudo chown -R www-data:www-data /var/www/orange-home-ui
```

### 7. `ng: command not found`

**Причина:** Angular CLI не установлен глобально (и не должен быть!).

**Решение:** Используй `npm start` или `npx ng serve` вместо `ng serve`.

## 📁 Структура проекта

```
src/app/
├── core/                   # Синглтоны, конфиги, интерцепторы
├── shared/                 # Переиспользуемые компоненты
├── layout/                 # Каркас (меню, шапка, сайдбар)
│   ├── layout.component.ts
│   ├── layout.component.html
│   └── layout.component.css
├── features/               # Функциональные модули
│   ├── dashboard/          # Главный экран
│   └── torrents/           # Раздел торрентов
├── app.component.ts        # Корневой компонент (только router-outlet)
├── app.config.ts           # Глобальная конфигурация
└── app.routes.ts           # Маршруты верхнего уровня
```

## 🔧 Версии компонентов

- **Node.js:** 22 LTS
- **Angular:** 19.x
- **PrimeNG:** 19.x
- **PrimeFlex:** последняя версия
- **nginx:** любая актуальная версия из apt

## 📝 TODO

- [ ] Настроить `environment.ts` для API ключей
- [ ] Создать `JackettService` для поиска торрентов
- [ ] Создать `QBittorrentService` для управления загрузками
- [ ] Реализовать `SearchComponent` с таблицей результатов
- [ ] Реализовать `DownloadsComponent` со списком активных загрузок
- [ ] Добавить автоопределение категории (фильм/сериал)
- [ ] Настроить последовательную загрузку (`sequentialDownload`)
- [ ] Добавить базовую аутентификацию (JWT или HTTP Basic)
- [ ] Настроить HTTPS через Let's Encrypt
- [ ] Добавить мониторинг системы (CPU, RAM, диск) в Dashboard

## 📄 Лицензия

Проект создан для личного использования.

---

**Автор:** Чепурной Никита
**Дата создания:** 23 Июля 2026
```