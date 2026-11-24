from .nova import NovaDriver
from .tcl import TclDriver
from .kodi import KodiDriver

DRIVERS = {
    "nova": NovaDriver(),
    "tcl": TclDriver(),
    "kodi": KodiDriver(),
}

def get_driver(player_name: str):
    return DRIVERS.get(player_name.lower(), DRIVERS["nova"])