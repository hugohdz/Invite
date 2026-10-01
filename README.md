# Invitación digital

- **Galería de diseños:** `index.html`
- **Invitación:** `invitaciones/boda/?id=<id del invitado>`
- **Panel de confirmaciones:** `panel/`

## Editar el contenido

Todo se edita desde el **panel** (`panel/`, menú ☰), sin publicar nada:

| Menú | Qué edita | Dónde se guarda |
| --- | --- | --- |
| **Confirmaciones** | (solo consulta) quién confirmó, enlaces y WhatsApp | hoja "Confirmaciones" |
| **Evento** | nombres, fecha, color, textos, padres, ubicaciones, itinerario, vestimenta, regalos | hoja "Evento" |
| **Invitados** | agregar (uno o varios), editar y eliminar invitados | hoja "Invitados" |

Lo único que requiere subir cambios a GitHub:
- **Fotos** (`fotos/1.jpg` = portada, `2.jpg` = cuenta regresiva…): después ejecuta `python publicar.py`.
- `datos/evento.json`: solo guarda `confirmacionesUrl` (la dirección del script de Google).

El enlace de cada invitado es `https://hugohdz.github.io/Invite/invitaciones/boda/?id=<id>`.
El panel genera ids difíciles de adivinar para que nadie vea otras invitaciones cambiando el enlace.

## Google Sheets

El código está en `google-apps-script/Codigo.gs` (instrucciones al inicio del archivo).
Cada vez que cambie: pégalo en Extensiones > Apps Script, conserva tu `CLAVE_PANEL` y
publica una **Nueva versión** en Implementar > Gestionar implementaciones (la URL no cambia).

## Uso local

```
python servidor.py
```

Abre http://localhost:8765/invitaciones/boda/?id=1. El evento, los invitados y las confirmaciones
se siguen leyendo de Google Sheets (la URL está en `datos/evento.json`), así que necesitas internet.
