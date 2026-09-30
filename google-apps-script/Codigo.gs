/**
 * Invitados y confirmaciones de la invitación, en Google Sheets.
 *
 * El archivo de Google tiene dos hojas (se crean solas la primera vez):
 *   - "Invitados":      id | nombre | pases | telefono   <- ESTA la editas tú
 *   - "Confirmaciones": la llena la invitación cuando alguien confirma (no la edites a mano)
 *
 * Agregar un invitado = agregar una fila en "Invitados". No hay que publicar nada.
 * Su enlace es: https://hugohdz.github.io/Invite/invitaciones/boda/?id=<id>
 * Consejo: usa ids difíciles de adivinar (p. ej. "k7m2" en lugar de 1, 2, 3) para que
 * nadie pueda ver otras invitaciones cambiando el número del enlace.
 *
 * Instalación / actualización:
 *  1. En tu archivo de Google Sheets: Extensiones > Apps Script.
 *  2. Borra el código que haya y pega este archivo completo.
 *  3. Pon tu contraseña del panel en CLAVE_PANEL (abajo). Si ya tenías una, vuelve a ponerla.
 *  4. Guarda (icono del disquete).
 *  5. Primera vez: Implementar > Nueva implementación > "Aplicación web",
 *       Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario. Copia la URL /exec
 *       a datos/evento.json como "confirmacionesUrl".
 *     Si ya estaba implementado: Implementar > Gestionar implementaciones > lápiz (editar) >
 *       Versión: "Nueva versión" > Implementar. La URL no cambia.
 */

const CLAVE_PANEL = "cambia-esta-clave";
const HOJA_INVITADOS = "Invitados";
const HOJA_CONFIRMACIONES = "Confirmaciones";
const COL_INVITADOS = ["id", "nombre", "pases", "telefono"];
const COL_CONFIRMACIONES = ["id", "nombre", "asiste", "personas", "fecha", "mensaje"];

function hoja_(nombre, columnas) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let h = libro.getSheetByName(nombre);
  if (!h) {
    h = libro.insertSheet(nombre);
    h.appendRow(columnas);
    h.setFrozenRows(1);
    h.getRange(1, 1, 1, columnas.length).setFontWeight("bold");
    if (nombre === HOJA_INVITADOS) h.getRange("A:A").setNumberFormat("@"); // ids como texto
  }
  return h;
}

function json_(datos) {
  return ContentService.createTextOutput(JSON.stringify(datos)).setMimeType(ContentService.MimeType.JSON);
}

const fecha_ = (d) => d instanceof Date ? Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm") : String(d || "");

/** Lista de la hoja "Invitados", en el orden de la hoja. */
function leerInvitados_() {
  return hoja_(HOJA_INVITADOS, COL_INVITADOS).getDataRange().getValues().slice(1)
    .filter((f) => String(f[0]).trim() && String(f[1]).trim())
    .map((f) => ({
      id: String(f[0]).trim(),
      nombre: String(f[1]).trim(),
      pases: Math.max(1, Number(f[2]) || 1),
      telefono: String(f[3] || "").replace(/\D/g, ""),
    }));
}

function leerConfirmaciones_() {
  const conf = {};
  hoja_(HOJA_CONFIRMACIONES, COL_CONFIRMACIONES).getDataRange().getValues().slice(1).forEach((f) => {
    if (!f[0]) return;
    conf[String(f[0]).trim()] = {
      asiste: f[2] === "si",
      personas: Number(f[3]) || 0,
      fecha: fecha_(f[4]),
      mensaje: String(f[5] || ""),
    };
  });
  return conf;
}

// GET ?accion=invitado&id=k7m2  -> nombre, pases y confirmación de UN invitado (para la invitación)
// GET ?accion=resumen&clave=XXX -> todos los invitados con su confirmación (para el panel)
function doGet(e) {
  const p = e.parameter || {};
  if (p.accion === "invitado" || p.accion === "estado") {
    const id = String(p.id || "").trim();
    const inv = leerInvitados_().find((x) => x.id === id);
    if (!inv) return json_({ invitado: null, confirmacion: null });
    return json_({
      invitado: { id: inv.id, nombre: inv.nombre, pases: inv.pases }, // sin teléfono: esto es público
      confirmacion: leerConfirmaciones_()[id] || null,
    });
  }
  if (p.accion === "resumen") {
    if (p.clave !== CLAVE_PANEL) return json_({ error: "Clave incorrecta" });
    const conf = leerConfirmaciones_();
    return json_({ invitados: leerInvitados_().map((i) => ({ ...i, confirmacion: conf[i.id] || null })) });
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
  const inv = leerInvitados_().find((x) => x.id === id);
  if (!inv) return json_({ error: "Invitación no encontrada" });

  const asiste = !!d.asiste;
  const personas = asiste ? Math.min(Math.max(Number(d.personas) || 1, 1), inv.pases) : 0;
  const mensaje = String(d.mensaje || "").replace(/[\r\n]+/g, " ").slice(0, 500);
  const ahora = new Date();
  const fila = [id, inv.nombre, asiste ? "si" : "no", personas, ahora, mensaje];

  const bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(10000);
  try {
    const h = hoja_(HOJA_CONFIRMACIONES, COL_CONFIRMACIONES);
    const ids = h.getRange(1, 1, h.getLastRow(), 1).getValues().map((f) => String(f[0]).trim());
    const i = ids.indexOf(id);
    if (i > 0) h.getRange(i + 1, 1, 1, fila.length).setValues([fila]);
    else h.appendRow(fila);
  } finally {
    bloqueo.releaseLock();
  }
  return json_({ ok: true, confirmacion: { asiste, personas, fecha: fecha_(ahora), mensaje } });
}

/** Ejecútala una vez desde el editor (botón ▶ Ejecutar) si quieres crear las dos hojas sin esperar. */
function crearHojas() {
  hoja_(HOJA_INVITADOS, COL_INVITADOS);
  hoja_(HOJA_CONFIRMACIONES, COL_CONFIRMACIONES);
}
