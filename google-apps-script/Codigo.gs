/**
 * Evento, invitados y confirmaciones de la invitación, en Google Sheets.
 *
 * El archivo de Google tiene tres hojas (se crean solas):
 *   - "Evento":         campo | valor     <- se edita desde el panel (menú Evento, incluye qué
 *                                            secciones se muestran, hospedaje y ciudad del clima)
 *   - "Invitados":      id | nombre | pases | telefono | ninos   <- panel (menú Invitados) o a mano
 *                       (pases = adultos; ninos = lugares para niños)
 *   - "Confirmaciones": la llena la invitación cuando alguien confirma (no la edites a mano)
 *
 * Las fotos viven en una carpeta de tu Google Drive ("fotosinvitacion", se crea sola al subir
 * la primera desde el panel, menú Fotos) compartida como "cualquier persona con el enlace".
 * También puedes arrastrar fotos directo a esa carpeta: aparecen al final, en orden por nombre.
 *
 * El enlace de cada invitado es: https://hugohdz.github.io/Invite/invitaciones/boda/?id=<id>
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
 *     Si Google pide permisos nuevos (por ejemplo, de Drive para las fotos), acéptalos:
 *       "Revisar permisos" > tu cuenta > Configuración avanzada > Ir a … (no seguro) > Permitir.
 */

const CLAVE_PANEL = "cambia-esta-clave";
const HOJA_EVENTO = "Evento";
const HOJA_INVITADOS = "Invitados";
const HOJA_CONFIRMACIONES = "Confirmaciones";
const COL_EVENTO = ["campo", "valor"];
const COL_INVITADOS = ["id", "nombre", "pases", "telefono", "ninos"];
const COL_CONFIRMACIONES = ["id", "nombre", "asiste", "personas", "fecha", "mensaje"];
const NOMBRE_CARPETA_FOTOS = "fotosinvitacion";
// Campos del evento que son listas u objetos: se guardan como JSON en la columna "valor".
const CAMPOS_LISTA = ["padres", "lugares", "itinerario", "regalos", "hospedaje"];
const CAMPOS_OBJETO = ["secciones"]; // { regalos: false, ... } = secciones ocultas en la invitación
// Campos que acepta el formulario del panel (cualquier otro se ignora).
const CAMPOS_EVENTO = [
  "tema", "eyebrow", "nombre1", "nombre2", "iniciales", "fecha", "whatsapp",
  "bienvenida", "frase", "tituloPadres", "vestimenta", "vestimentaNota", "tituloFotos",
  "rsvpLimite", "cuentaBanco", "ciudadClima", ...CAMPOS_LISTA, ...CAMPOS_OBJETO,
];

function hoja_(nombre, columnas) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let h = libro.getSheetByName(nombre);
  if (!h) {
    h = libro.insertSheet(nombre);
    h.appendRow(columnas);
    h.setFrozenRows(1);
    h.getRange(1, 1, 1, columnas.length).setFontWeight("bold");
    if (nombre === HOJA_INVITADOS) { h.getRange("A:A").setNumberFormat("@"); h.getRange("D:D").setNumberFormat("@"); }
    if (nombre === HOJA_EVENTO) h.getRange("A:B").setNumberFormat("@"); // sin conversiones automáticas (fechas)
  }
  return h;
}

function json_(datos) {
  return ContentService.createTextOutput(JSON.stringify(datos)).setMimeType(ContentService.MimeType.JSON);
}

const fecha_ = (d) => d instanceof Date ? Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm") : String(d || "");
const texto_ = (t, max) => String(t == null ? "" : t).trim().slice(0, max || 2000);

// ---------- Evento ----------
function leerEvento_() {
  const ev = {};
  hoja_(HOJA_EVENTO, COL_EVENTO).getDataRange().getValues().slice(1).forEach((f) => {
    const campo = String(f[0]).trim();
    if (!campo) return;
    const valor = f[1] instanceof Date ? Utilities.formatDate(f[1], Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss") : String(f[1]);
    if (CAMPOS_LISTA.includes(campo)) {
      try { ev[campo] = JSON.parse(valor || "[]"); } catch (e) { ev[campo] = []; }
    } else if (CAMPOS_OBJETO.includes(campo)) {
      try { ev[campo] = JSON.parse(valor || "{}"); } catch (e) { ev[campo] = {}; }
    } else {
      ev[campo] = valor;
    }
  });
  return ev;
}

function guardarEvento_(datos) {
  const esObjeto = (v) => v && typeof v === "object" && !Array.isArray(v);
  const filas = CAMPOS_EVENTO.filter((c) => c in datos).map((c) => [
    c,
    CAMPOS_LISTA.includes(c) ? JSON.stringify(Array.isArray(datos[c]) ? datos[c] : [])
      : CAMPOS_OBJETO.includes(c) ? JSON.stringify(esObjeto(datos[c]) ? datos[c] : {})
      : texto_(datos[c]),
  ]);
  const h = hoja_(HOJA_EVENTO, COL_EVENTO);
  if (h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, 2).clearContent();
  h.getRange("A:B").setNumberFormat("@");
  if (filas.length) h.getRange(2, 1, filas.length, 2).setValues(filas);
  return leerEvento_();
}

// ---------- Invitados ----------
function leerInvitados_() {
  return hoja_(HOJA_INVITADOS, COL_INVITADOS).getDataRange().getValues().slice(1)
    .filter((f) => String(f[0]).trim() && String(f[1]).trim())
    .map((f) => ({
      id: String(f[0]).trim(),
      nombre: String(f[1]).trim(),
      pases: Math.max(1, Number(f[2]) || 1),
      telefono: String(f[3] || "").replace(/\D/g, ""),
      ninos: Math.max(0, Number(f[4]) || 0),
    }));
}

/** Id corto difícil de adivinar (sin letras que se confunden: 0/o, 1/l). */
function nuevoId_(usados) {
  const letras = "abcdefghjkmnpqrstuvwxyz23456789";
  let id;
  do {
    id = "";
    for (let i = 0; i < 5; i++) id += letras[Math.floor(Math.random() * letras.length)];
  } while (usados.has(id));
  usados.add(id);
  return id;
}

/**
 * Agrega o modifica invitados. Cada elemento: { id?, idAnterior?, nombre, pases, ninos, telefono }.
 * - Sin id: se crea uno nuevo con id generado.
 * - Con idAnterior: se modifica esa fila (permite cambiar el id).
 */
function guardarInvitados_(lista) {
  const h = hoja_(HOJA_INVITADOS, COL_INVITADOS);
  h.getRange("A:A").setNumberFormat("@");
  h.getRange("D:D").setNumberFormat("@");
  if (!h.getRange(1, 5).getValue()) h.getRange(1, 5).setValue("ninos").setFontWeight("bold"); // hojas creadas antes de los niños
  const valores = h.getDataRange().getValues();
  const ids = valores.map((f) => String(f[0]).trim()); // ids[0] es el encabezado
  const usados = new Set(ids.slice(1).filter(Boolean));
  const guardados = [];

  for (const d of lista) {
    const nombre = texto_(d.nombre, 200);
    if (!nombre) throw new Error("Falta el nombre del invitado");
    const anterior = texto_(d.idAnterior, 60);
    let id = texto_(d.id, 60).replace(/\s+/g, "");
    const fila = anterior ? ids.indexOf(anterior) : -1;
    if (anterior && fila < 1) throw new Error(`No existe el invitado con id "${anterior}"`);
    if (!id) id = fila > 0 ? anterior : nuevoId_(usados);
    if (id !== anterior && usados.has(id) && ids.indexOf(id) !== fila) throw new Error(`El id "${id}" ya está en uso`);

    const datos = [id, nombre, Math.max(1, Math.min(50, Number(d.pases) || 1)), String(d.telefono || "").replace(/\D/g, ""),
      Math.max(0, Math.min(50, Number(d.ninos) || 0))];
    if (fila > 0) {
      h.getRange(fila + 1, 1, 1, datos.length).setValues([datos]);
      usados.delete(anterior);
      ids[fila] = id;
    } else {
      h.appendRow(datos);
      ids.push(id);
    }
    usados.add(id);
    guardados.push({ id: datos[0], nombre: datos[1], pases: datos[2], telefono: datos[3], ninos: datos[4] });
  }
  return guardados;
}

function borrarInvitado_(id) {
  const h = hoja_(HOJA_INVITADOS, COL_INVITADOS);
  const ids = h.getDataRange().getValues().map((f) => String(f[0]).trim());
  const fila = ids.indexOf(String(id).trim());
  if (fila < 1) throw new Error("Invitado no encontrado");
  h.deleteRow(fila + 1);
}

// ---------- Confirmaciones ----------
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

function confirmar_(d) {
  const id = texto_(d.id, 60);
  const inv = leerInvitados_().find((x) => x.id === id);
  if (!inv) throw new Error("Invitación no encontrada");

  const asiste = !!d.asiste;
  const personas = asiste ? Math.min(Math.max(Number(d.personas) || 1, 1), inv.pases + inv.ninos) : 0; // adultos + niños
  const mensaje = texto_(d.mensaje, 500).replace(/[\r\n]+/g, " ");
  const ahora = new Date();
  const fila = [id, inv.nombre, asiste ? "si" : "no", personas, ahora, mensaje];

  const h = hoja_(HOJA_CONFIRMACIONES, COL_CONFIRMACIONES);
  const ids = h.getRange(1, 1, h.getLastRow(), 1).getValues().map((f) => String(f[0]).trim());
  const i = ids.indexOf(id);
  if (i > 0) h.getRange(i + 1, 1, 1, fila.length).setValues([fila]);
  else h.appendRow(fila);
  return { asiste, personas, fecha: fecha_(ahora), mensaje };
}

// ---------- Fotos (carpeta de Google Drive) ----------
// El id de la carpeta y el orden de las fotos (lista de ids) se guardan en las propiedades del script.
const props_ = () => PropertiesService.getScriptProperties();
const CACHE_FOTOS = "fotos";

/** La carpeta de fotos; con crear=true la crea (y la comparte) si aún no existe. */
function carpetaFotos_(crear) {
  const id = props_().getProperty("carpetaFotos");
  if (id) {
    try {
      const c = DriveApp.getFolderById(id);
      if (!c.isTrashed()) return c;
    } catch (e) { /* se borró: se crea otra */ }
  }
  if (!crear) return null;
  const c = DriveApp.createFolder(NOMBRE_CARPETA_FOTOS);
  compartir_(c);
  props_().setProperty("carpetaFotos", c.getId());
  return c;
}

function compartir_(archivo) {
  try { archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e) { /* cuentas de empresa que no permiten compartir con enlace */ }
}

const ordenFotos_ = () => { try { return JSON.parse(props_().getProperty("ordenFotos") || "[]"); } catch (e) { return []; } };
function guardarOrden_(ids) {
  props_().setProperty("ordenFotos", JSON.stringify(ids));
  CacheService.getScriptCache().remove(CACHE_FOTOS);
}

/**
 * Fotos de la carpeta en orden: [{ id, nombre }]. Primero el orden guardado desde el panel;
 * las que se subieron directo a Drive van al final, por nombre (2.jpg antes que 10.jpg).
 * Se guarda en caché 5 minutos para que la invitación no espere a Drive.
 */
function leerFotos_() {
  const cache = CacheService.getScriptCache();
  const guardada = cache.get(CACHE_FOTOS);
  if (guardada) return JSON.parse(guardada);

  const carpeta = carpetaFotos_(false);
  if (!carpeta) return [];
  const archivos = {};
  const it = carpeta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (/^image\//.test(f.getMimeType())) archivos[f.getId()] = f;
  }
  const orden = ordenFotos_().filter((id) => archivos[id]);
  const nuevas = Object.keys(archivos).filter((id) => !orden.includes(id))
    .sort((a, b) => archivos[a].getName().localeCompare(archivos[b].getName(), "es", { numeric: true }));
  nuevas.forEach((id) => compartir_(archivos[id])); // las que se arrastraron directo a la carpeta
  const ids = orden.concat(nuevas);
  if (nuevas.length || ids.length !== ordenFotos_().length) guardarOrden_(ids);

  const fotos = ids.map((id) => ({ id, nombre: archivos[id].getName() }));
  cache.put(CACHE_FOTOS, JSON.stringify(fotos), 300);
  return fotos;
}

/** { nombre, tipo, datos (base64) } -> la foto nueva, al final de la lista. */
function subirFoto_(d) {
  const tipo = String(d.tipo || "");
  if (!/^image\/(jpeg|png|webp|gif)$/.test(tipo)) throw new Error("Solo se aceptan imágenes JPG, PNG, WEBP o GIF");
  const nombre = texto_(d.nombre, 120) || "foto.jpg";
  const blob = Utilities.newBlob(Utilities.base64Decode(String(d.datos || "")), tipo, nombre);
  const archivo = carpetaFotos_(true).createFile(blob);
  compartir_(archivo);
  const ids = leerFotos_().map((f) => f.id).filter((id) => id !== archivo.getId());
  guardarOrden_(ids.concat(archivo.getId()));
  return { id: archivo.getId(), nombre: archivo.getName() };
}

/** Solo se pueden borrar (enviar a la papelera de Drive) fotos de la carpeta de la invitación. */
function borrarFoto_(id) {
  const carpeta = carpetaFotos_(false);
  let archivo = null;
  try { archivo = DriveApp.getFileById(String(id)); } catch (e) { /* no existe */ }
  const padres = archivo && archivo.getParents();
  if (!carpeta || !padres || !padres.hasNext() || padres.next().getId() !== carpeta.getId()) {
    throw new Error("Foto no encontrada");
  }
  archivo.setTrashed(true);
  guardarOrden_(ordenFotos_().filter((x) => x !== id));
}

function ordenarFotos_(ids) {
  const actuales = leerFotos_().map((f) => f.id);
  const orden = ids.map(String).filter((id) => actuales.includes(id));
  guardarOrden_(orden.concat(actuales.filter((id) => !orden.includes(id))));
}

function datosFotos_() {
  const carpeta = carpetaFotos_(false);
  return { fotos: leerFotos_(), carpetaFotos: carpeta ? carpeta.getUrl() : "" };
}

// ---------- Web ----------
// GET ?accion=inicio&id=k7m2   -> evento + invitado + su confirmación + fotos (todo lo que necesita la invitación)
// GET ?accion=invitado&id=k7m2 -> invitado + su confirmación
// GET ?accion=evento           -> solo el evento
// GET ?accion=resumen&clave=X  -> invitados con su confirmación + evento + fotos (para el panel)
function doGet(e) {
  const p = e.parameter || {};
  const id = String(p.id || "").trim();
  const buscarInvitado = () => {
    const inv = id ? leerInvitados_().find((x) => x.id === id) : null;
    return {
      invitado: inv ? { id: inv.id, nombre: inv.nombre, pases: inv.pases, ninos: inv.ninos } : null, // sin teléfono: esto es público
      confirmacion: inv ? leerConfirmaciones_()[id] || null : null,
    };
  };
  if (p.accion === "inicio") return json_({ evento: leerEvento_(), ...buscarInvitado(), fotos: leerFotos_() });
  if (p.accion === "invitado" || p.accion === "estado") return json_(buscarInvitado());
  if (p.accion === "evento") return json_({ evento: leerEvento_() });
  if (p.accion === "resumen") {
    if (p.clave !== CLAVE_PANEL) return json_({ error: "Clave incorrecta" });
    const conf = leerConfirmaciones_();
    return json_({ evento: leerEvento_(), invitados: leerInvitados_().map((i) => ({ ...i, confirmacion: conf[i.id] || null })), ...datosFotos_() });
  }
  return json_({ ok: true });
}

// POST (cuerpo JSON):
//   { id, asiste, personas, mensaje }                         -> confirmar (invitación, sin clave)
//   { accion: "guardarEvento",   clave, evento: {...} }      -> panel
//   { accion: "guardarInvitados", clave, invitados: [...] }  -> panel
//   { accion: "borrarInvitado",  clave, id }                  -> panel
//   { accion: "subirFoto",       clave, nombre, tipo, datos }  -> panel (datos = imagen en base64)
//   { accion: "borrarFoto",      clave, id }                  -> panel
//   { accion: "ordenarFotos",    clave, ids: [...] }          -> panel
function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ error: "Datos inválidos" });
  }
  const accion = d.accion || "confirmar";
  if (accion !== "confirmar" && d.clave !== CLAVE_PANEL) return json_({ error: "Clave incorrecta" });

  const bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(15000);
  try {
    if (accion === "confirmar") return json_({ ok: true, confirmacion: confirmar_(d) });
    if (accion === "guardarEvento") return json_({ ok: true, evento: guardarEvento_(d.evento || {}) });
    if (accion === "guardarInvitados") return json_({ ok: true, invitados: guardarInvitados_(Array.isArray(d.invitados) ? d.invitados : []) });
    if (accion === "borrarInvitado") { borrarInvitado_(d.id); return json_({ ok: true }); }
    if (accion === "subirFoto") return json_({ ok: true, foto: subirFoto_(d), ...datosFotos_() });
    if (accion === "borrarFoto") { borrarFoto_(d.id); return json_({ ok: true, ...datosFotos_() }); }
    if (accion === "ordenarFotos") { ordenarFotos_(Array.isArray(d.ids) ? d.ids : []); return json_({ ok: true, ...datosFotos_() }); }
    return json_({ error: "Acción desconocida" });
  } catch (err) {
    return json_({ error: err.message });
  } finally {
    bloqueo.releaseLock();
  }
}

/** Ejecútala una vez desde el editor (botón ▶ Ejecutar) si quieres crear las hojas sin esperar. */
function crearHojas() {
  hoja_(HOJA_EVENTO, COL_EVENTO);
  hoja_(HOJA_INVITADOS, COL_INVITADOS);
  hoja_(HOJA_CONFIRMACIONES, COL_CONFIRMACIONES);
}
