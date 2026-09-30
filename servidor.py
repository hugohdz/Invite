"""Servidor de la invitación.

Sirve los archivos del sitio y agrega una pequeña API para:
  - leer el invitado de datos/invitados.txt a partir de ?id=
  - guardar confirmaciones en datos/confirmaciones.txt
  - listar las fotos de la carpeta fotos/ en orden numérico
  - dar el resumen (enviadas / confirmadas) al panel en /panel/

Uso:  python servidor.py            (puerto 8765)
      python servidor.py 8080       (otro puerto)
"""

import json
import re
import sys
import threading
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

# Cambia esta clave: se pide al entrar a /panel/
PANEL_CLAVE = "mela2027"

RAIZ = Path(__file__).resolve().parent
DATOS = RAIZ / "datos"
INVITADOS = DATOS / "invitados.txt"
CONFIRMACIONES = DATOS / "confirmaciones.txt"
FOTOS = RAIZ / "fotos"
EXT_FOTOS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"}

# Archivos que nunca se sirven directamente (contienen la lista de invitados).
PRIVADOS = {INVITADOS.resolve(), CONFIRMACIONES.resolve(), (RAIZ / "servidor.py").resolve()}

_lock = threading.Lock()


def _limpiar(texto):
    """Quita separadores y saltos de línea para no romper el formato del .txt."""
    return re.sub(r"[|\r\n]+", " ", str(texto or "")).strip()


def leer_invitados():
    invitados = {}
    if not INVITADOS.exists():
        return invitados
    for linea in INVITADOS.read_text(encoding="utf-8-sig").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#"):
            continue
        partes = [p.strip() for p in linea.split("|")]
        if len(partes) < 2 or not partes[0]:
            continue
        try:
            pases = int(partes[2]) if len(partes) > 2 and partes[2] else 1
        except ValueError:
            pases = 1
        invitados[partes[0]] = {
            "id": partes[0],
            "nombre": partes[1],
            "pases": max(1, pases),
            "telefono": partes[3] if len(partes) > 3 else "",
        }
    return invitados


def leer_confirmaciones():
    """Formato: id | asiste (si/no) | personas | fecha | mensaje"""
    conf = {}
    if not CONFIRMACIONES.exists():
        return conf
    for linea in CONFIRMACIONES.read_text(encoding="utf-8-sig").splitlines():
        if not linea.strip() or linea.startswith("#"):
            continue
        p = [x.strip() for x in linea.split("|")]
        p += [""] * (5 - len(p))
        conf[p[0]] = {
            "asiste": p[1] == "si",
            "personas": int(p[2]) if p[2].isdigit() else 0,
            "fecha": p[3],
            "mensaje": p[4],
        }
    return conf


def guardar_confirmaciones(conf):
    lineas = ["# id | asiste | personas | fecha | mensaje   (lo escribe el servidor)"]
    for id_, c in conf.items():
        lineas.append(" | ".join([
            id_, "si" if c["asiste"] else "no", str(c["personas"]), c["fecha"], _limpiar(c["mensaje"]),
        ]))
    CONFIRMACIONES.write_text("\n".join(lineas) + "\n", encoding="utf-8")


def listar_fotos():
    def clave(p):
        m = re.match(r"\d+", p.stem)
        return (int(m.group()) if m else float("inf"), p.name.lower())

    if not FOTOS.exists():
        return []
    fotos = [p for p in FOTOS.iterdir() if p.is_file() and p.suffix.lower() in EXT_FOTOS]
    return [f"fotos/{p.name}" for p in sorted(fotos, key=clave)]  # relativas a la raíz del sitio


class Manejador(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(RAIZ), **kwargs)

    def end_headers(self):
        # Evita que el navegador guarde datos viejos mientras editas.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, datos, estado=200):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(estado)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        url = urlparse(self.path)
        ruta = url.path
        q = parse_qs(url.query)

        if ruta == "/api/invitado":
            id_ = (q.get("id") or [""])[0].strip()
            inv = leer_invitados().get(id_)
            if not inv:
                return self._json({"error": "Invitación no encontrada"}, 404)
            conf = leer_confirmaciones().get(id_)
            return self._json({"id": inv["id"], "nombre": inv["nombre"], "pases": inv["pases"], "confirmacion": conf})

        if ruta == "/api/fotos":
            return self._json(listar_fotos())

        if ruta == "/api/resumen":
            if self.headers.get("X-Clave") != PANEL_CLAVE:
                return self._json({"error": "Clave incorrecta"}, 401)
            invitados = leer_invitados()
            conf = leer_confirmaciones()
            filas = [{**inv, "confirmacion": conf.get(id_)} for id_, inv in invitados.items()]
            return self._json({"invitados": filas})

        return super().do_GET()

    def send_head(self):
        # Se aplica a GET y HEAD sobre la ruta real ya resuelta (evita trucos con %xx, ./ o mayúsculas).
        destino = Path(self.translate_path(self.path)).resolve()
        if str(destino).lower() in {str(p).lower() for p in PRIVADOS}:
            self.send_error(403)
            return None
        return super().send_head()

    def do_POST(self):
        if urlparse(self.path).path != "/api/confirmar":
            return self.send_error(404)
        try:
            largo = int(self.headers.get("Content-Length", 0))
            datos = json.loads(self.rfile.read(min(largo, 10_000)) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._json({"error": "Datos inválidos"}, 400)

        id_ = str(datos.get("id", "")).strip()
        inv = leer_invitados().get(id_)
        if not inv:
            return self._json({"error": "Invitación no encontrada"}, 404)

        asiste = bool(datos.get("asiste"))
        try:
            personas = int(datos.get("personas", 0))
        except (TypeError, ValueError):
            personas = 0
        personas = min(max(personas, 1), inv["pases"]) if asiste else 0

        with _lock:
            conf = leer_confirmaciones()
            conf[id_] = {
                "asiste": asiste,
                "personas": personas,
                "fecha": datetime.now().strftime("%Y-%m-%d %H:%M"),
                "mensaje": _limpiar(datos.get("mensaje", ""))[:500],
            }
            guardar_confirmaciones(conf)
        return self._json({"ok": True, "confirmacion": conf[id_]})


if __name__ == "__main__":
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"Invitación:  http://localhost:{puerto}/invitaciones/boda/?id=1")
    print(f"Panel:       http://localhost:{puerto}/panel/   (clave: {PANEL_CLAVE})")
    print(f"Galería:     http://localhost:{puerto}/")
    ThreadingHTTPServer(("", puerto), Manejador).serve_forever()
