"""Prepara los archivos que necesita la versión estática (GitHub Pages).

Genera datos/fotos.json: la lista de fotos de la carpeta fotos/ en orden numérico.
(Los invitados ya no se publican: se leen de la hoja "Invitados" de Google Sheets.)

Ejecútalo cada vez que cambies las fotos, y luego sube los cambios:
  python publicar.py
  git add -A && git commit -m "Actualizar fotos" && git push
"""

import json

from servidor import DATOS, listar_fotos

fotos = listar_fotos()  # rutas relativas: GitHub Pages vive en /Invite/
(DATOS / "fotos.json").write_text(json.dumps(fotos, ensure_ascii=False, indent=2), encoding="utf-8")

print(f"datos/fotos.json: {len(fotos)} fotos")
