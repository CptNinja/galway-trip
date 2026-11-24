"""Start de Galway-app op deze computer, inclusief de sync-API.

Draait de app precies zoals in de cloud, maar zonder AWS:

  * de bestanden uit deze map worden geserveerd (zoals CloudFront + S3),
  * /config.js wordt hier gegenereerd, met een relatief api-adres,
  * /api/state is dezelfde JSON-API als de Lambda in api/room_api.py,
    met dezelfde revisiezeggenschap: een botsing geeft 409 met de stand van toen.

De gedeelde stand staat in .galway-room.json naast dit bestand. Die map is
git-ignored; verwijder het bestand om opnieuw te beginnen.

Gebruik:
    python3 lokale_testserver.py                # alleen op deze computer
    python3 lokale_testserver.py --lan          # ook bereikbaar voor je telefoon
    python3 lokale_testserver.py --port 9000
"""

from __future__ import annotations

import argparse
import functools
import json
import os
import socket
import threading
import webbrowser
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DIRECTORY = Path(__file__).resolve().parent
DEFAULT_PORT = 8765
ROOM_FILE = DIRECTORY / ".galway-room.json"
ROOM_PATTERN_OK = set("abcdefghijklmnopqrstuvwxyz0123456789-")
MAX_BODY_BYTES = 1_000_000
write_lock = threading.Lock()


def local_room_key() -> str:
    """Vaste sleutel voor lokaal werk; GALWAY_LOCAL_KEY als je die wilt wijzigen."""
    return os.environ.get("GALWAY_LOCAL_KEY", "").strip() or "lokale-ontwikkeling"


def config_js() -> str:
    """config.js zoals de app die in de cloud krijgt, maar dan naar deze server."""
    return (
        "// Lokaal gegenereerd door lokale_testserver.py - sync wijst naar deze server.\n"
        "window.GALWAY_CONFIG = Object.freeze({\n"
        '  api: "/api",\n'
        f'  room: "galway",\n'
        f'  key: "{local_room_key()}",\n'
        "  syncIntervalMs: 5000,\n"
        "});\n"
    )


def read_room(room: str) -> dict | None:
    """De opgeslagen kamer, of None als die nog niet bestaat."""
    if not ROOM_FILE.is_file():
        return None
    stored = json.loads(ROOM_FILE.read_text(encoding="utf-8"))
    return stored.get(room)


def write_room(room: str, state: dict, rev: int) -> dict:
    """Schrijf de kamer weg en geef het document zoals de API het teruggeeft."""
    document = {"rev": rev, "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "state": state}
    all_rooms = json.loads(ROOM_FILE.read_text(encoding="utf-8")) if ROOM_FILE.is_file() else {}
    all_rooms[room] = document
    temporary = ROOM_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(all_rooms, ensure_ascii=False, indent=1), encoding="utf-8")
    temporary.replace(ROOM_FILE)
    return document


class Handler(SimpleHTTPRequestHandler):
    """Bestanden serveren plus de twee sync-eindpunten."""

    protocol_version = "HTTP/1.1"

    def end_headers(self) -> None:
        """Zonder deze kop onthoudt de browser statische bestanden: bij het
        ontwikkelen zie je dan je eigen wijziging niet."""
        if not getattr(self, "_cachebeleid", ""):
            self.send_header("cache-control", "no-cache")
        self._cachebeleid = ""
        super().end_headers()

    # ------------------------------------------------------------- helpers

    def _json(self, status: int, body: dict | None) -> None:
        payload = b"" if body is None else (body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode())
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self._cachebeleid = "no-store"
        self.send_header("cache-control", "no-store")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        if payload:
            self.wfile.write(payload)

    def _room_name(self, query: str) -> str:
        for part in query.split("&"):
            name, _, value = part.partition("=")
            if name == "room":
                room = value.strip().lower()
                if room and room[0].isalnum() and set(room) <= ROOM_PATTERN_OK and len(room) <= 40:
                    return room
        return ""

    def _authorised(self) -> bool:
        return self.headers.get("x-galway-key", "") == local_room_key()

    def _body(self) -> dict:
        length = int(self.headers.get("content-length") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            return {}
        try:
            parsed = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            return {}
        return parsed if isinstance(parsed, dict) else {}

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - stdlib signatuur
        if "/api/" in str(args[0] if args else ""):
            super().log_message(format, *args)

    # -------------------------------------------------------------- routes

    def do_GET(self) -> None:  # noqa: N802 - stdlib signatuur
        path, _, query = self.path.partition("?")
        if path == "/config.js":
            body = config_js().encode()
            self.send_response(200)
            self.send_header("content-type", "text/javascript; charset=utf-8")
            self.send_header("cache-control", "no-store")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/health":
            self._json(200, {"ok": True})
            return
        if path == "/api/state":
            if not self._authorised():
                self._json(403, {"error": "missing or wrong x-galway-key"})
                return
            document = read_room(self._room_name(query))
            if document is None:
                self._json(404, {"error": "empty-room"})
                return
            self._json(200, document)
            return
        super().do_GET()

    def do_PUT(self) -> None:  # noqa: N802 - stdlib signatuur
        path, _, query = self.path.partition("?")
        if path != "/api/state":
            self._json(404, {"error": "unknown path"})
            return
        if not self._authorised():
            self._json(403, {"error": "missing or wrong x-galway-key"})
            return
        room = self._room_name(query)
        if not room:
            self._json(400, {"error": "room must match ^[a-z0-9][a-z0-9-]{0,39}$"})
            return
        body = self._body()
        state = body.get("state")
        if not isinstance(state, dict):
            self._json(400, {"error": "state must be an object"})
            return
        base_rev = body.get("baseRev", 0)
        if not isinstance(base_rev, int) or isinstance(base_rev, bool) or base_rev < 0:
            self._json(400, {"error": "baseRev must be a non-negative integer"})
            return
        size = len(json.dumps(state, ensure_ascii=False, separators=(",", ":")).encode())
        if size > 380_000:
            self._json(413, {"error": f"state is te groot voor één kamer ({size} bytes)"})
            return

        with write_lock:
            current = read_room(room)
            expected = current["rev"] if current else 0
            if expected != base_rev:
                if current is None:
                    self._json(409, {"error": "empty-room"})
                    return
                self._json(409, current)
                return
            document = write_room(room, state, expected + 1)
        self._json(201, {"rev": document["rev"]})

    def do_OPTIONS(self) -> None:  # noqa: N802 - stdlib signatuur
        # Lokaal is alles dezelfde oorsprong; deze antwoorden laten een telefoon
        # op een andere poort of een extern testfront-end toch werken.
        self.send_response(204)
        self.send_header("access-control-allow-methods", "GET, PUT, OPTIONS")
        self.send_header("access-control-allow-headers", "content-type, x-galway-key")
        self.send_header("access-control-allow-origin", self.headers.get("origin", "*"))
        self.send_header("access-control-max-age", "600")
        self.send_header("content-length", "0")
        self.end_headers()


def lan_address() -> str:
    """Een lokaal IP van deze machine, zodat je telefoon de app kan laden."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("10.255.255.255", 1))
        return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        probe.close()


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Galway-app lokaal serveren, met sync-API.")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--lan", action="store_true", help="bind op 0.0.0.0 zodat je telefoon meedoet")
    parser.add_argument("--no-browser", action="store_true", help="open de browser niet automatisch")
    return parser.parse_args()


def main() -> int:
    options = parse_arguments()
    host = "0.0.0.0" if options.lan else "127.0.0.1"

    class Server(ThreadingHTTPServer):
        daemon_threads = True

        def __init__(self) -> None:
            super().__init__((host, options.port), functools.partial(Handler, directory=str(DIRECTORY)))

    try:
        server = Server()
    except OSError as error:
        print(f"Kon de app niet starten op poort {options.port}: {error}")
        print("Misschien staat de app al open. Probeer http://127.0.0.1:%d/" % options.port)
        return 1

    shown = lan_address() if options.lan else "127.0.0.1"
    print(f"Galway is gestart op http://{shown}:{options.port}/")
    print(f"Sync staat aan: /api · ruimte 'galway' · sleutel {local_room_key()}")
    print(f"Gedeelde stand: {ROOM_FILE.name} (verwijderen = opnieuw beginnen)")
    if options.lan:
        print("Telefoon: dezelfde URL openen en 'Toevoegen aan beginscherm' gebruiken.")
    else:
        print("Met --lan doen je telefoon en laptop samen mee op hetzelfde netwerk.")
    print("Laat dit venster open tijdens het testen. Sluit het venster (of Ctrl-C) om te stoppen.")
    if not options.no_browser:
        threading.Timer(0.7, lambda: webbrowser.open(f"http://127.0.0.1:{options.port}/")).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nGestopt.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
