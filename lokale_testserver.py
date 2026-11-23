"""Start de Galway-app op deze computer, zonder internetverbinding."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import functools
import threading
import webbrowser

DIRECTORY = Path(__file__).resolve().parent
handler = functools.partial(SimpleHTTPRequestHandler, directory=str(DIRECTORY))
try:
    server = ThreadingHTTPServer(('127.0.0.1', 8765), handler)
except OSError as error:
    print(f'Kon de app niet starten op poort 8765: {error}')
    print('Misschien staat de app al open. Probeer http://127.0.0.1:8765/')
    raise SystemExit(1)
print('Galway is gestart! Je browser gaat open op http://127.0.0.1:8765/')
print('Laat dit venster open tijdens het testen. Sluit het venster om te stoppen.')
threading.Timer(0.7, lambda: webbrowser.open('http://127.0.0.1:8765/')).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
