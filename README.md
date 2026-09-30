# Invitación digital

- **Galería de diseños:** `index.html`
- **Invitación:** `invitaciones/boda/?id=<id del invitado>`
- **Panel de confirmaciones:** `panel/`

## Editar el contenido

| Qué | Dónde |
| --- | --- |
| Nombres, fecha, lugares, itinerario, WhatsApp, tema | `datos/evento.json` (requiere subir cambios) |
| **Invitados**: `id \| nombre \| pases \| telefono` | Hoja **"Invitados"** del archivo de Google Sheets (**sin publicar nada**) |
| Confirmaciones | Hoja "Confirmaciones" (la llena la invitación sola) |
| Fotos (1.jpg = portada, 2.jpg = cuenta regresiva…) | `fotos/` + `python publicar.py` y subir cambios |

El enlace de cada invitado es `https://hugohdz.github.io/Invite/invitaciones/boda/?id=<id>`.
Usa ids difíciles de adivinar (p. ej. `k7m2`) para que nadie vea otras invitaciones cambiando el número.

## Google Sheets

El código está en `google-apps-script/Codigo.gs` (instrucciones al inicio del archivo).
Cada vez que cambie: pégalo en Extensiones > Apps Script, conserva tu `CLAVE_PANEL` y
publica una **Nueva versión** en Implementar > Gestionar implementaciones (la URL no cambia).

## Uso local

```
python servidor.py
```

Abre http://localhost:8765/invitaciones/boda/?id=1. Si `confirmacionesUrl` está vacío, las confirmaciones se guardan en `datos/confirmaciones.txt`.
