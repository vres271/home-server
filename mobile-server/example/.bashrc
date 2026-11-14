# Автозапуск домашнего медиа-сервера
sshd

# Автозапуск сетевой папки (WebDAV) для просмотра фильмов на ТВ/ПК


pgrep -x rclone >/dev/null || nohup rclone serve webdav /data/data/com.termux/files/home/downloads --addr 0.0.0.0:8085 --vfs-cache-mode minimal --dir-cache-time 5s --poll-interval 5s >/dev/null 2>&1 &
pgrep -x qbittorrent-nox >/dev/null || qbittorrent-nox -d
pgrep -x nginx >/dev/null || nginx
alias stopmedia="pkill -TERM qbittorrent-nox; nginx -s quit 2>/dev/null; pkill -TERM rclone; sleep 2; pgrep -a \"rclone|qbittorrent|nginx\" && echo \"⚠️ Что-то ещё завершается, подождите...\" || echo \"✅ Все службы чисто остановлены, Termux можно закрывать\""
