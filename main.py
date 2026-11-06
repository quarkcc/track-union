"""Track Union: servidor local para probar la web estática (carpeta static/).

La aplicación funciona entera en el navegador, así que esto sólo sirve ficheros.
En producción se publica la carpeta static/ tal cual (p. ej. en GitHub Pages).

Uso:
    python main.py            # abre http://127.0.0.1:5000 en el navegador
    python main.py --port 8080 --no-browser
"""
from __future__ import annotations

import argparse
import functools
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

STATIC_DIR = Path(__file__).resolve().parent / "static"


def main() -> None:
    parser = argparse.ArgumentParser(description="Track Union - unir tracks GPX")
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(STATIC_DIR))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)

    url = f"http://127.0.0.1:{args.port}"
    if not args.no_browser:
        threading.Timer(1.0, webbrowser.open, args=(url,)).start()
    print(f"Track Union en {url}  (Ctrl+C para salir)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
