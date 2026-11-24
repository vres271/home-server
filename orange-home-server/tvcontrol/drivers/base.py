from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class BasePlayerDriver(ABC):
    """Базовый класс для драйверов медиаплееров."""
    
    @abstractmethod
    def play(self, adb_path: str, target: str, smb_url: str) -> Dict[str, Any]:
        """Запускает воспроизведение файла."""
        pass

    @abstractmethod
    def control(self, adb_path: str, target: str, action: str) -> Dict[str, Any]:
        """Отправляет команду управления (play_pause, stop)."""
        pass

    @abstractmethod
    def get_status(self, adb_path: str, target: str) -> Dict[str, Any]:
        """Возвращает статус плеера.
        Ожидаемый формат:
        {
            "active": bool,
            "isPlaying": bool,
            "filePath": str | None,
            "title": str | None,
            "positionSeconds": int | None
        }
        """
        pass