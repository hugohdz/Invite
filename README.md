# Invitación digital

- **Galería de diseños:** `index.html`
- **Invitación:** `invitaciones/boda/?id=<id del invitado>`
- **Panel de confirmaciones:** `panel/`

## Editar el contenido

| Qué | Dónde |
| --- | --- |
| Nombres, fecha, lugares, itinerario, WhatsApp, tema | `datos/evento.json` |
| Invitados: `id \| nombre \| pases \| teléfono` | `datos/invitados.txt` (**no se sube**: queda solo en tu PC) |
| Fotos (se muestran en orden: 1.jpg = portada, 2.jpg = cuenta regresiva…) | `fotos/` |

Después de cambiar invitados o fotos, regenera los archivos públicos y sube los cambios:

```
python publicar.py
git add -A
git commit -m "Actualizar invitados y fotos"
git push
```

`publicar.py` crea `datos/invitados.json` (solo id, nombre y pases, **sin teléfonos**) y `datos/fotos.json`.

## Confirmaciones en GitHub Pages (Google Sheets)

GitHub Pages no ejecuta Python, así que las confirmaciones se guardan en una hoja de Google:

1. Sigue los pasos al inicio de `google-apps-script/Codigo.gs`.
2. Pega la URL `/exec` en `datos/evento.json` como `"confirmacionesUrl"`.
3. Sube el cambio. El panel (`panel/`) pedirá la clave que pusiste en `CLAVE_PANEL`.

## Uso local

```
python servidor.py
```

Abre http://localhost:8765/invitaciones/boda/?id=1. Si `confirmacionesUrl` está vacío, las confirmaciones se guardan en `datos/confirmaciones.txt`.
