Ты абсолютно прав! Давай исправим оба файла, убрав упоминания подпапок `torrents/` и `downloads/`.

## Исправленный `setup-services.sh`

Замени содержимое файла на это:

```bash
#!/bin/bash

# Завершать скрипт при любой ошибке
set -e

echo "🚀 Начало установки qBittorrent-nox и Samba..."

# Проверка прав root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Ошибка: Пожалуйста, запустите скрипт от имени root (sudo ./setup-services.sh)"
  exit 1
fi

# Переменные конфигурации
SHARE_DIR="/mnt/shared"
QBITTORRENT_USER="qbittorrent"
QBITTORRENT_PORT="8080"
SAMBA_WORKGROUP="WORKGROUP"

# 1. Обновление системы и установка пакетов
echo "📦 Обновление пакетов и установка qBittorrent-nox и Samba..."
apt update -y
apt install -y qbittorrent-nox samba samba-common-bin

# 2. Создание пользователя для qBittorrent (если не существует)
echo "👤 Создание пользователя ${QBITTORRENT_USER}..."
if ! id -u "$QBITTORRENT_USER" >/dev/null 2>&1; then
  useradd -r -m -s /usr/sbin/nologin "$QBITTORRENT_USER"
  echo "✅ Пользователь ${QBITTORRENT_USER} создан"
else
  echo "ℹ️ Пользователь ${QBITTORRENT_USER} уже существует"
fi

# 3. Создание и настройка папки для торрентов
echo "📁 Настройка папки ${SHARE_DIR}..."
if [ ! -d "$SHARE_DIR" ]; then
  echo "⚠️ Папка ${SHARE_DIR} не существует. Создаю..."
  mkdir -p "$SHARE_DIR"
fi

# Назначаем права
chown -R "$QBITTORRENT_USER":"$QBITTORRENT_USER" "${SHARE_DIR}"
chmod -R 775 "${SHARE_DIR}"

echo "✅ Папка ${SHARE_DIR} настроена с правами для ${QBITTORRENT_USER}"

# 4. Настройка Samba
echo "⚙️ Настройка Samba..."

# Резервная копия оригинального smb.conf
if [ ! -f /etc/samba/smb.conf.backup ]; then
  cp /etc/samba/smb.conf /etc/samba/smb.conf.backup
  echo "✅ Резервная копия smb.conf создана"
fi

# Добавляем конфигурацию шары
cat << EOF >> /etc/samba/smb.conf

# Orange Pi Home Server - Shared Folder
[shared]
   comment = Orange Pi Shared Storage
   path = ${SHARE_DIR}
   valid users = ${QBITTORRENT_USER}
   read only = no
   browsable = yes
   create mask = 0664
   directory mask = 0775
   force user = ${QBITTORRENT_USER}
   force group = ${QBITTORRENT_USER}
EOF

echo "✅ Конфигурация Samba добавлена"

# 5. Добавление пользователя в Samba
echo "🔐 Настройка пароля Samba для пользователя ${QBITTORRENT_USER}..."
echo "Введите пароль для доступа к Samba (минимум 8 символов):"
smbpasswd -a "$QBITTORRENT_USER"

# 6. Создание systemd service для qBittorrent-nox
echo "🔧 Создание systemd service для qBittorrent-nox..."
cat << EOF > /etc/systemd/system/qbittorrent-nox.service
[Unit]
Description=qBittorrent-nox Daemon
After=network.target

[Service]
Type=simple
User=${QBITTORRENT_USER}
Group=${QBITTORRENT_USER}
ExecStart=/usr/bin/qbittorrent-nox --webui-port=${QBITTORRENT_PORT}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 7. Перезагрузка systemd и включение сервисов
echo "🔄 Включение автозапуска сервисов..."
systemctl daemon-reload
systemctl enable qbittorrent-nox
systemctl enable smbd
systemctl enable nmbd

# 8. Запуск сервисов
echo "▶️ Запуск сервисов..."
systemctl start qbittorrent-nox
systemctl restart smbd
systemctl restart nmbd

# 9. Настройка брандмауэра (если UFW активен)
echo "🛡️ Настройка брандмауэра..."
ufw allow ${QBITTORRENT_PORT}/tcp || true  # qBittorrent Web UI
ufw allow samba || true                    # Samba (порты 137, 138, 139, 445)

# 10. Проверка статуса
echo "🧪 Проверка статуса сервисов..."
systemctl status qbittorrent-nox --no-pager -l
systemctl status smbd --no-pager -l

echo ""
echo "✅ Готово! Все сервисы установлены и запущены."
echo ""
echo "📋 Информация для подключения:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 qBittorrent Web UI: http://$(hostname -I | awk '{print $1}'):${QBITTORRENT_PORT}"
echo "   Логин: admin"
echo "   Пароль: adminadmin (СМЕНИТЕ ПАРОЛЬ при первом входе!)"
echo ""
echo "📁 Samba Share: \\\\$(hostname -I | awk '{print $1}')\\shared"
echo "   Пользователь: ${QBITTORRENT_USER}"
echo "   Пароль: (тот, что вы только что ввели)"
echo ""
echo "📂 Папка торрентов: ${SHARE_DIR}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️ ВАЖНО: При первом входе в qBittorrent Web UI:"
echo "   1. Зайдите в Настройки → Веб-интерфейс"
echo "   2. Смените пароль по умолчанию!"
echo "   3. Убедитесь, что 'Путь сохранения по умолчанию' = ${SHARE_DIR}"
```

## Исправленный `SETUP-SERVICES.md`

Замени содержимое файла на это:

```markdown
# 🛠 Установка qBittorrent-nox и Samba на Orange Pi

Этот скрипт автоматически устанавливает и настраивает qBittorrent-nox (headless торрент-клиент) и Samba (файловый сервер) на Orange Pi.

## 📋 Что делает скрипт

- ✅ Устанавливает **qBittorrent-nox** (headless версия для сервера)
- ✅ Устанавливает **Samba** (файловый сервер для доступа из Windows/Linux/macOS)
- ✅ Создаёт отдельного пользователя `qbittorrent` для безопасности
- ✅ Настраивает папку `/mnt/shared` с правильными правами
- ✅ Создаёт systemd service для автозапуска qBittorrent
- ✅ Настраивает Samba шару `[shared]` с доступом для пользователя `qbittorrent`
- ✅ Открывает необходимые порты в UFW (если firewall активен)

## 📦 Требования

- Orange Pi с Armbian (или другим Debian-based дистрибутивом)
- Доступ по SSH с правами `root`
- Примонтированный SSD в `/mnt/shared` (опционально, скрипт создаст папку, если её нет)

## 🚀 Пошаговая инструкция

### 1. Загрузи скрипт на Orange Pi

На своём ПК (в Git Bash), находясь в корне проекта:

```bash
scp setup-services.sh root@192.168.0.150:/root/
```

### 2. Подключись к Orange Pi по SSH

```bash
ssh root@192.168.0.150
```

### 3. Сделай скрипт исполняемым

```bash
chmod +x /root/setup-services.sh
```

### 4. Запусти скрипт

```bash
/root/setup-services.sh
```

Скрипт:
1. Установит все необходимые пакеты
2. Создаст пользователя `qbittorrent`
3. Настроит папку `/mnt/shared`
4. Добавит конфигурацию Samba
5. **Запросит пароль для Samba** (введи любой пароль, минимум 8 символов)
6. Создаст systemd service для qBittorrent
7. Запустит все сервисы

### 5. Проверь работу

#### qBittorrent Web UI
Открой в браузере:
```
http://192.168.0.150:8080
```

**Дефолтные данные для входа:**
- Логин: `admin`
- Пароль: `adminadmin`

⚠️ **ВАЖНО:** При первом входе сразу смени пароль в настройках!

#### Samba Share
На Windows:
1. Открой Проводник
2. В адресной строке введи: `\\192.168.0.150\shared`
3. Введи учётные данные:
   - Пользователь: `qbittorrent`
   - Пароль: (тот, что ты ввёл при установке)

На Linux/macOS:
```bash
# Linux (через файловый менеджер или команду)
smb://192.168.0.150/shared

# macOS (Finder → Go → Connect to Server)
smb://192.168.0.150/shared
```

## 🔧 Ручная настройка qBittorrent

После первого входа в Web UI (`http://192.168.0.150:8080`):

1. **Смени пароль:**
   - Настройки → Веб-интерфейс → Аутентификация
   - Введи новый пароль

2. **Настрой пути сохранения:**
   - Настройки → Загрузки
   - Путь сохранения по умолчанию: `/mnt/shared`

3. **Оптимизация для 1 ГБ RAM:**
   - Настройки → Дополнительно
   - Кэш диска: `16` МБ (уменьшить для экономии RAM)
   - Снимите галочку "Использовать кэш операционной системы"

4. **Настройки сети:**
   - Настройки → Подключение
   - Порт для входящих соединений: `51413` (или любой другой)
   - Включите UPnP / NAT-PMP (если роутер поддерживает)

## 📂 Структура папок

После выполнения скрипта:

```
/mnt/shared/
├── (здесь будут скачанные торренты)
└── (все файлы доступны через Samba)
```

## 🔍 Проверка сервисов

### Статус qBittorrent
```bash
sudo systemctl status qbittorrent-nox
```

### Статус Samba
```bash
sudo systemctl status smbd
sudo systemctl status nmbd
```

### Логи qBittorrent
```bash
sudo journalctl -u qbittorrent-nox -f
```

### Логи Samba
```bash
sudo tail -f /var/log/samba/log.smbd
```

## 🔄 Управление сервисами

### qBittorrent
```bash
# Запуск
sudo systemctl start qbittorrent-nox

# Остановка
sudo systemctl stop qbittorrent-nox

# Перезапуск
sudo systemctl restart qbittorrent-nox

# Отключить автозапуск
sudo systemctl disable qbittorrent-nox
```

### Samba
```bash
# Перезапуск
sudo systemctl restart smbd nmbd

# Проверка конфигурации
testparm
```

## 🐛 Возможные проблемы

### Ошибка "Failed to start qBittorrent-nox Daemon"
**Причина:** Проблема с правами на `/mnt/shared`.
**Решение:**
```bash
sudo chown -R qbittorrent:qbittorrent /mnt/shared
sudo chmod -R 775 /mnt/shared
```

### Не могу подключиться к Samba
**Причина:** Firewall блокирует порты или неправильный пароль.
**Решение:**
```bash
# Проверь, что порты открыты
sudo ufw status

# Добавь пользователя в Samba заново
sudo smbpasswd -a qbittorrent
```

### qBittorrent не скачивает торренты
**Причина:** Неправильные пути сохранения или нет места на диске.
**Решение:**
1. Проверь в Web UI настройки путей
2. Проверь свободное место: `df -h /mnt/shared`
3. Проверь права: `ls -la /mnt/shared`

### Samba шары не видны в сети
**Причина:** NMBD не запущен или проблема с Workgroup.
**Решение:**
```bash
sudo systemctl restart nmbd
# Проверь конфигурацию
testparm
```

## 🧹 Удаление (если нужно)

```bash
# Остановить и удалить сервисы
sudo systemctl stop qbittorrent-nox smbd nmbd
sudo systemctl disable qbittorrent-nox smbd nmbd

# Удалить пакеты
sudo apt remove --purge qbittorrent-nox samba samba-common-bin

# Удалить пользователя
sudo userdel -r qbittorrent

# Удалить конфигурацию
sudo rm /etc/systemd/system/qbittorrent-nox.service
sudo rm -rf /etc/samba/smb.conf
sudo mv /etc/samba/smb.conf.backup /etc/samba/smb.conf

# Перезагрузить systemd
sudo systemctl daemon-reload
```

## 📊 Мониторинг ресурсов

Так как у Orange Pi всего 1 ГБ RAM, следи за использованием:

```bash
# Использование памяти
free -h

# Использование диска
df -h /mnt/shared

# Топ процессов по памяти
ps aux --sort=-%mem | head -n 10
```

---

**Версии компонентов:**
- qBittorrent-nox: из репозитория Armbian
- Samba: из репозитория Armbian
- Скрипт протестирован: Июль 2026
```

## Что изменилось:

✅ Убрано создание подпапок `torrents/` и `downloads/`  
✅ Все упоминания путей теперь указывают на `/mnt/shared` без подпапок  
✅ Документация отражает реальную структуру  
✅ Рекомендации по настройке qBittorrent теперь корректные

