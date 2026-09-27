#!/bin/bash
set -e

# ==========================================
# Скрипт обновления UI из GitHub Releases
# ==========================================

# ⚠️ ЗАМЕНИТЕ на ваш реальный GitHub репозиторий (владелец/имя)
GITHUB_REPO="your-username/your-repo-name" 
TARGET_DIR="/var/www/orange-home-ui"
TEMP_DIR="/tmp/ui-deploy-$$"

echo "🚀 Начало обновления интерфейса..."

# 1. Получаем информацию о последнем релизе
echo "🔍 Поиск последнего релиза в ${GITHUB_REPO}..."
RELEASE_INFO=$(curl -s "https://api.github.com/repos/${GITHUB_REPO}/releases/latest")

# 2. Ищем URL архива (ищем файл, начинающийся на orange-home-ui-v и заканчивающийся на .tar.gz)
ASSET_URL=$(echo "$RELEASE_INFO" | grep -o '"browser_download_url": "[^"]*orange-home-ui-v.*\.tar.gz"' | head -n 1 | cut -d'"' -f4)

if [ -z "$ASSET_URL" ]; then
    echo "❌ Ошибка: Не удалось найти архив релиза (.tar.gz)."
    echo "Проверьте имя репозитория и убедитесь, что релиз опубликован."
    exit 1
fi

echo "📥 Ссылка на загрузку: $ASSET_URL"

# 3. Скачивание
mkdir -p "$TEMP_DIR"
curl -L -s -o "$TEMP_DIR/release.tar.gz" "$ASSET_URL"

if [ ! -f "$TEMP_DIR/release.tar.gz" ]; then
    echo "❌ Ошибка скачивания архива."
    exit 1
fi

# 4. Очистка старой версии (безопасно, только содержимое папки)
echo "🧹 Очистка старой версии в ${TARGET_DIR}..."
mkdir -p "$TARGET_DIR"
rm -rf "${TARGET_DIR:?}"/*

# 5. Распаковка новой версии
echo "📦 Распаковка новой версии..."
tar -xzf "$TEMP_DIR/release.tar.gz" -C "$TARGET_DIR"

# 6. Установка правильных прав для Nginx
echo "🔐 Установка прав доступа (www-data)..."
chown -R www-data:www-data "$TARGET_DIR"
chmod -R 755 "$TARGET_DIR"

# 7. Уборка
echo "🗑️ Удаление временных файлов..."
rm -rf "$TEMP_DIR"

echo "✅ Успешно! Интерфейс обновлен."
echo "💡 Проверьте версию в браузере или в файле ${TARGET_DIR}/version.json"