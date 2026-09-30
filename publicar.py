"""Prepara los archivos que necesita la versión estática (GitHub Pages).

Genera, a partir de tus archivos locales:
  datos/fotos.json      -> lista de fotos de la carpeta fotos/ en orden numérico
  datos/invitados.json  -> id, nombre y pases de datos/invitados.txt (SIN teléfonos)

Ejecútalo cada vez que cambies fotos o invitados, y luego sube los cambios:
  python publicar.py
  git add -A && git commit -m "Actualizar invitados y fotos" && git push
"""

import json

from servidor import DATOS, leer_invitados, listar_fotos

fotos = listar_fotos()  # rutas relativas: GitHub Pages vive en /Invite/
(DATOS / "fotos.json").write_text(json.dumps(fotos, ensure_ascii=False, indent=2), encoding="utf-8")

invitados = [{"id": i["id"], "nombre": i["nombre"], "pases": i["pases"]} for i in leer_invitados().values()]
(DATOS / "invitados.json").write_text(json.dumps(invitados, ensure_ascii=False, indent=2), encoding="utf-8")

print(f"datos/fotos.json: {len(fotos)} fotos")
print(f"datos/invitados.json: {len(invitados)} invitados (sin teléfonos)")
