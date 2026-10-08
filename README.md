# Invitación digital

- **Galería de diseños:** `index.html`
- **Invitación:** `invitaciones/boda/?id=<id del invitado>`
- **Panel de confirmaciones:** `panel/`

## Editar el contenido

Todo se edita desde el **panel** (`panel/`, menú ☰), sin publicar nada:

| Menú | Qué edita | Dónde se guarda |
| --- | --- | --- |
| **Confirmaciones** | (solo consulta) quién confirmó, enlaces y WhatsApp | hoja "Confirmaciones" |
| **Evento** | qué secciones se muestran, nombres, fecha, color, textos, padres, ubicaciones, hospedaje, clima, itinerario, vestimenta, regalos | hoja "Evento" |
| **Invitados** | agregar (uno o varios), editar y eliminar invitados con sus adultos y niños; total de personas | hoja "Invitados" |
| **Fotos** | subir, ordenar y eliminar fotos (1 = portada, 2 = cuenta regresiva… la última = confirmación) | carpeta "fotosinvitacion" de Google Drive |

Las fotos se guardan en el Google Drive del dueño del script, en una carpeta compartida con
"cualquier persona con el enlace" (si no, los invitados no las verían). También se pueden arrastrar
directo a esa carpeta: aparecen al final, en orden por nombre. Las fotos ya no están en el repositorio
(la carpeta `fotos/` solo existe en tu PC para el modo local con `servidor.py`).
La sección de hospedaje usa la foto 7 (con 7 fotos coincide con la de la confirmación; agrega una 8.ª
para que sea distinta), o la foto que se indique para cada hotel en el panel.

Lo único que requiere subir cambios a GitHub:
- `datos/evento.json`: solo guarda `confirmacionesUrl` (la dirección del script de Google).

El enlace de cada invitado es `https://hugohdz.github.io/Invite/invitaciones/boda/?id=<id>`.
El panel genera ids difíciles de adivinar para que nadie vea otras invitaciones cambiando el enlace.

El **clima de la semana** se consulta en [Open-Meteo](https://open-meteo.com/) (gratis, sin clave)
con la ciudad que se escribe en el panel. Es el pronóstico de los próximos días, igual que la original,
no el del día de la boda.

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
