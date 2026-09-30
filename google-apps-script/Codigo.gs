/**
 * Confirmaciones de la invitación guardadas en Google Sheets.
 *
 * Instalación (una sola vez):
 *  1. Crea una hoja de cálculo nueva en Google Sheets.
 *  2. Menú Extensiones > Apps Script. Borra lo que haya y pega este archivo completo.
 *  3. Cambia CLAVE_PANEL (abajo) por una contraseña tuya. Es la que pedirá el panel.
 *  4. Botón "Implementar" > "Nueva implementación" > tipo "Aplicación web".
 *       - Ejecutar como: Yo
 *       - Quién tiene acceso: Cualquier usuario
 *     Autoriza los permisos que pide Google.
 *  5. Copia la URL que termina en /exec y pégala en datos/evento.json:
 *       "confirmacionesUrl": "https://script.google.com/macros/s/XXXX/exec"
 *  6. Si más adelante editas este código: Implementar > Gestionar implementaciones >
 *     editar (lápiz) > Versión: "Nueva versión". Así la URL no cambia.
 */

const CLAVE_PANEL = "cambia-esta-clave";
// URL pública del sitio, para validar los pases de cada invitado (datos/invitados.json).
const SITIO = "https://hugohdz.github.io/Invite/";
const HOJA = "Confirmaciones";
const COLUMNAS = ["id", "nombre", "asiste", "personas", "fecha", "mensaje"];

function hoja_() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let h = libro.getSheetByName(HOJA);
  if (!h) {
    h = libro.insertSheet(HOJA);
    h.appendRow(COLUMNAS);
    h.setFrozenRows(1);
  }
  return h;
}

function json_(datos) {
  return ContentService.createTextOutput(JSON.stringify(datos)).setMimeType(ContentService.MimeType.JSON);
}

function leerConfirmaciones_() {
  const filas = hoja_().getDataRange().getValues().slice(1);
  const conf = {};
  filas.forEach((f) => {
    if (!f[0]) return;
    conf[String(f[0])] = {
      asiste: f[2] === "si",
      personas: Number(f[3]) || 0,
      fecha: f[4] instanceof Date ? Utilities.formatDate(f[4], Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm") : String(f[4]),
      mensaje: String(f[5] || ""),
    };
  });
  return conf;
}

function invitados_() {
  try {
    const r = UrlFetchApp.fetch(SITIO + "datos/invitados.json", { muteHttpExceptions: true });
    return r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : null;
  } catch (e) {
    return null;
  }
}

// GET ?accion=estado&id=3        -> confirmación de un invitado (para la invitación)
// GET ?accion=resumen&clave=XXX  -> todas las confirmaciones (para el panel)
function doGet(e) {
  const p = e.parameter || {};
  if (p.accion === "estado") {
    return json_({ confirmacion: leerConfirmaciones_()[String(p.id || "")] || null });
  }
  if (p.accion === "resumen") {
    if (p.clave !== CLAVE_PANEL) return json_({ error: "Clave incorrecta" });
    return json_({ confirmaciones: leerConfirmaciones_() });
  }
  return json_({ ok: true });
}

// POST (cuerpo JSON): { id, asiste, personas, mensaje }
function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ error: "Datos inválidos" });
  }
  const id = String(d.id || "").trim();
  if (!id) return json_({ error: "Falta el id" });

  const lista = invitados_();
  const inv = lista ? lista.find((x) => String(x.id) === id) : null;
  if (lista && !inv) return json_({ error: "Invitación no encontrada" });

  const pases = inv ? Number(inv.pases) || 1 : 10;
  const asiste = !!d.asiste;
  const personas = asiste ? Math.min(Math.max(Number(d.personas) || 1, 1), pases) : 0;
  const limpio = (t) => String(t || "").replace(/[\r\n]+/g, " ").slice(0, 500);
  const fila = [id, inv ? inv.nombre : "", asiste ? "si" : "no", personas, new Date(), limpio(d.mensaje)];

  const bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(10000);
  try {
    const h = hoja_();
    const ids = h.getRange(1, 1, h.getLastRow(), 1).getValues().map((f) => String(f[0]));
    const i = ids.indexOf(id);
    if (i > 0) h.getRange(i + 1, 1, 1, fila.length).setValues([fila]);
    else h.appendRow(fila);
  } finally {
    bloqueo.releaseLock();
  }

  return json_({
    ok: true,
    confirmacion: { asiste, personas, fecha: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"), mensaje: limpio(d.mensaje) },
  });
}
