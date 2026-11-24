import subprocess
import re
from typing import Dict, Any
from .base import BasePlayerDriver

class NovaDriver(BasePlayerDriver):
    def __init__(self):
        self.component = "org.courville.nova/com.archos.mediacenter.video.player.PlayerActivity"

    def play(self, adb_path: str, target: str, smb_url: str) -> Dict[str, Any]:
        shell_cmd = f"am start -a android.intent.action.VIEW -d '{smb_url}' -t 'video/*' -n '{self.component}'"
        cmd = [adb_path, "-s", target, "shell", shell_cmd]
        
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=10, check=False)
        output = (res.stdout or "") + (res.stderr or "")
        
        if res.returncode != 0 or "Error" in output or "Exception" in output:
            return {"ok": False, "error": "Ошибка запуска", "details": output.strip()}
            
        return {"ok": True, "output": output.strip()}

    def control(self, adb_path: str, target: str, action: str) -> Dict[str, Any]:
        commands = {"play_pause": "input keyevent 85", "stop": "input keyevent 4"}
        if action not in commands:
            return {"ok": False, "error": "Неизвестное действие"}
            
        cmd = [adb_path, "-s", target, "shell", commands[action]]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=5, check=False)
        
        if res.returncode != 0:
            return {"ok": False, "error": "Ошибка отправки команды", "details": (res.stdout or "") + (res.stderr or "")}
            
        return {"ok": True, "action": action}

    def get_status(self, adb_path: str, target: str) -> Dict[str, Any]:
        # 1. Получаем активность
        cmd = [adb_path, "-s", target, "shell", "dumpsys activity activities"]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=5, check=False)
        lines = res.stdout.split('\n')
        
        active_id = None
        for line in lines:
            if ('topResumedActivity=' in line or 'ResumedActivity:' in line) and 'org.courville.nova' in line:
                match = re.search(r'ActivityRecord\{([a-f0-9]+)\s', line)
                if match:
                    active_id = match.group(1)
                    break
                    
        if not active_id:
            return {"active": False, "isPlaying": False, "filePath": None, "title": None, "positionSeconds": None}
            
        block_start = None
        for i, line in enumerate(lines):
            if f'ActivityRecord{{{active_id} ' in line and 'org.courville.nova' in line:
                block_start = i
                break
                
        if block_start is None:
            return {"active": False, "isPlaying": False, "filePath": None, "title": None, "positionSeconds": None}
            
        block_text = "\n".join(lines[block_start : block_start + 40])
        
        # 2. Получаем статус из media_session
        media_cmd = [adb_path, "-s", target, "shell", "dumpsys media_session"]
        media_res = subprocess.run(media_cmd, capture_output=True, text=True, timeout=5, check=False)
        media_output = media_res.stdout
        
        is_playing = False
        position_seconds = None
        
        if 'org.courville.nova' in media_output:
            section = media_output.split('org.courville.nova')[1][:1000]
            is_playing = 'state=PLAYING' in section
            
            pos_match = re.search(r'position=(-?\d+)', section)
            if pos_match and int(pos_match.group(1)) >= 0:
                position_seconds = int(pos_match.group(1)) // 1000
                
        # 3. Извлекаем путь и название
        file_path_match = re.search(r'dat=(smb://[^\s}]+)', block_text)
        file_path = file_path_match.group(1) if file_path_match else None
        
        title = None
        title_match = re.search(r'description=([^,\n]+)', media_output)
        if title_match:
            title = title_match.group(1).strip()
            
        return {
            "active": True,
            "isPlaying": is_playing,
            "filePath": file_path,
            "title": title,
            "positionSeconds": position_seconds
        }