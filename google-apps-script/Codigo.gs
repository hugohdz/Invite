/**
 * Evento, invitados y confirmaciones de la invitación, en Google Sheets.
 *
 * El archivo de Google tiene tres hojas (se crean solas):
 *   - "Evento":         campo | valor     <- se edita desde el panel (menú Evento, incluye qué
 *                                            secciones se muestran, hospedaje y ciudad del clima)
 *   - "Invitados":      id | nombre | pases | telefono | ninos   <- panel (menú Invitados) o a mano
 *                       (pases = adultos; ninos = lugares para niños)
 *   - "Confirmaciones": la llena la invitación cuando alguien confirma (no la edites a mano)
 *   - "Fotos":          id | grupo | nombre | nota   <- orden y notas de las fotos (panel, menú Fotos)
 *
 * Las fotos viven en una carpeta de tu Google Drive ("fotosinvitacion", se crea sola al subir
 * la primera desde el panel, menú Fotos) compartida como "cualquier persona con el enlace".
 * Adentro hay una subcarpeta por grupo: invitacion (fondos de las secciones), galeria (carrusel)
 * y hospedaje (hoteles). También puedes arrastrar fotos directo a una subcarpeta: aparecen al
 * final de su grupo, en orden por nombre.
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
const HOJA_FOTOS = "Fotos";
const COL_EVENTO = ["campo", "valor"];
const COL_INVITADOS = ["id", "nombre", "pases", "telefono", "ninos"];
const COL_CONFIRMACIONES = ["id", "nombre", "asiste", "personas", "fecha", "mensaje"];
const COL_FOTOS = ["id", "grupo", "nombre", "nota"];
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
    if (nombre === HOJA_FOTOS) h.getRange("A:D").setNumberFormat("@");
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

/** Guarda los campos recibidos; los que no vienen se quedan como estaban. */
function guardarEvento_(nuevos) {
  const datos = { ...leerEvento_(), ...nuevos };
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
// Carpeta "fotosinvitacion" con una subcarpeta por grupo (las fotos de un grupo no se mezclan con las de otro):
//   invitacion -> fondos de las secciones (1 = portada, 2 = cuenta regresiva… la última = confirmación)
//   galeria    -> el carrusel de la galería; cada foto puede llevar una nota
//   hospedaje  -> fotos de los hoteles (cada hotel elige la suya en Evento > Hospedaje)
// El orden y las notas se guardan en la hoja "Fotos" (id | grupo | nombre | nota), en orden.
// El id de la carpeta principal se guarda en las propiedades del script.
const GRUPOS_FOTOS = ["invitacion", "galeria", "hospedaje"];
const props_ = () => PropertiesService.getScriptProperties();
const CACHE_FOTOS = "fotos-grupos";

/** La carpeta principal de fotos; con crear=true la crea (y la comparte) si aún no existe. */
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

function subcarpeta_(raiz, grupo, crear) {
  const it = raiz.getFoldersByName(grupo);
  if (it.hasNext()) return it.next();
  if (!crear) return null;
  const c = raiz.createFolder(grupo);
  compartir_(c);
  return c;
}

function compartir_(archivo) {
  try { archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e) { /* cuentas de empresa que no permiten compartir con enlace */ }
}

function imagenes_(carpeta) {
  const lista = [];
  const it = carpeta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (/^image\//.test(f.getMimeType())) lista.push(f);
  }
  return lista;
}

/**
 * Fotos de cada grupo en orden: { invitacion: [{ id, nombre, nota }], galeria: [...], hospedaje: [...] }.
 * Primero el orden de la hoja "Fotos"; las que se subieron directo a Drive van al final de su grupo,
 * por nombre (2.jpg antes que 10.jpg). Se guarda en caché 5 minutos para que la invitación no espere a Drive.
 */
function leerFotos_() {
  const cache = CacheService.getScriptCache();
  const guardada = cache.get(CACHE_FOTOS);
  if (guardada) return JSON.parse(guardada);

  const grupos = { invitacion: [], galeria: [], hospedaje: [] };
  const raiz = carpetaFotos_(false);
  if (!raiz) return grupos;

  // Las fotos sueltas en la carpeta principal (versión anterior, sin subcarpetas) pasan a "invitacion".
  const sueltas = imagenes_(raiz);
  if (sueltas.length) {
    const destino = subcarpeta_(raiz, "invitacion", true);
    sueltas.forEach((f) => f.moveTo(destino));
  }
  const archivos = {}; // id -> { archivo, grupo }
  GRUPOS_FOTOS.forEach((g) => {
    const sub = subcarpeta_(raiz, g, false);
    if (sub) imagenes_(sub).forEach((f) => { archivos[f.getId()] = { archivo: f, grupo: g }; });
  });

  const hoja = hoja_(HOJA_FOTOS, COL_FOTOS);
  let filas = hoja.getDataRange().getValues().slice(1).map((f) => ({ id: String(f[0]).trim(), nota: String(f[3] || "") }));
  // Primera vez con la hoja: se respeta el orden que guardaba la versión anterior.
  if (!filas.length) filas = ordenAnterior_().map((id) => ({ id, nota: "" }));

  const vistos = new Set();
  const agregar = (id, nota) => {
    const a = archivos[id];
    vistos.add(id);
    grupos[a.grupo].push({ id, nombre: a.archivo.getName(), nota: nota || "" });
  };
  filas.forEach((f) => { if (archivos[f.id] && !vistos.has(f.id)) agregar(f.id, f.nota); });
  Object.keys(archivos).filter((id) => !vistos.has(id))
    .sort((a, b) => archivos[a].archivo.getName().localeCompare(archivos[b].archivo.getName(), "es", { numeric: true }))
    .forEach((id) => { compartir_(archivos[id].archivo); agregar(id, ""); }); // las que se arrastraron directo a Drive

  guardarFotos_(grupos);
  return grupos;
}

function ordenAnterior_() {
  try { return JSON.parse(props_().getProperty("ordenFotos") || "[]"); } catch (e) { return []; }
}

/** Escribe la hoja "Fotos" (solo si cambió) y actualiza la caché. */
function guardarFotos_(grupos) {
  const filas = GRUPOS_FOTOS.flatMap((g) => grupos[g].map((f) => [f.id, g, f.nombre, f.nota]));
  const hoja = hoja_(HOJA_FOTOS, COL_FOTOS);
  const actuales = hoja.getDataRange().getValues().slice(1).map((f) => f.map(String));
  if (JSON.stringify(actuales) !== JSON.stringify(filas)) {
    if (hoja.getLastRow() > 1) hoja.getRange(2, 1, hoja.getLastRow() - 1, COL_FOTOS.length).clearContent();
    if (filas.length) hoja.getRange(2, 1, filas.length, COL_FOTOS.length).setNumberFormat("@").setValues(filas);
  }
  CacheService.getScriptCache().put(CACHE_FOTOS, JSON.stringify(grupos), 300);
}

const grupoValido_ = (g) => {
  if (!GRUPOS_FOTOS.includes(g)) throw new Error("Grupo de fotos desconocido");
  return g;
};

/** { grupo, nombre, tipo, datos (base64) } -> la foto nueva, al final de su grupo. */
function subirFoto_(d) {
  const grupo = grupoValido_(d.grupo || "invitacion");
  const tipo = String(d.tipo || "");
  if (!/^image\/(jpeg|png|webp|gif)$/.test(tipo)) throw new Error("Solo se aceptan imágenes JPG, PNG, WEBP o GIF");
  const nombre = texto_(d.nombre, 120) || "foto.jpg";
  const blob = Utilities.newBlob(Utilities.base64Decode(String(d.datos || "")), tipo, nombre);
  const archivo = subcarpeta_(carpetaFotos_(true), grupo, true).createFile(blob);
  compartir_(archivo);
  const grupos = leerFotos_();
  if (!grupos[grupo].some((f) => f.id === archivo.getId())) { // la caché aún no la conocía
    grupos[grupo].push({ id: archivo.getId(), nombre: archivo.getName(), nota: "" });
    guardarFotos_(grupos);
  }
  return { id: archivo.getId(), nombre: archivo.getName(), grupo };
}

/** Solo se pueden borrar (enviar a la papelera de Drive) fotos de la carpeta de la invitación. */
function borrarFoto_(id) {
  const grupos = leerFotos_();
  const grupo = GRUPOS_FOTOS.find((g) => grupos[g].some((f) => f.id === id));
  if (!grupo) throw new Error("Foto no encontrada");
  DriveApp.getFileById(id).setTrashed(true);
  grupos[grupo] = grupos[grupo].filter((f) => f.id !== id);
  guardarFotos_(grupos);
}

function ordenarFotos_(grupo, ids) {
  const grupos = leerFotos_();
  const lista = grupos[grupoValido_(grupo)];
  const orden = ids.map(String).map((id) => lista.find((f) => f.id === id)).filter(Boolean);
  grupos[grupo] = orden.concat(lista.filter((f) => !orden.includes(f)));
  guardarFotos_(grupos);
}

function guardarNota_(id, nota) {
  const grupos = leerFotos_();
  const foto = GRUPOS_FOTOS.flatMap((g) => grupos[g]).find((f) => f.id === id);
  if (!foto) throw new Error("Foto no encontrada");
  foto.nota = texto_(nota, 300).replace(/[\r\n]+/g, " ");
  guardarFotos_(grupos);
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
//   { accion: "subirFoto",       clave, grupo, nombre, tipo, datos } -> panel (datos = imagen en base64)
//   { accion: "borrarFoto",      clave, id }                  -> panel
//   { accion: "ordenarFotos",    clave, grupo, ids: [...] }   -> panel
//   { accion: "notaFoto",        clave, id, nota }            -> panel (nota bajo la foto en la galería)
//   (grupo = "invitacion", "galeria" u "hospedaje")
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
    if (accion === "ordenarFotos") { ordenarFotos_(d.grupo, Array.isArray(d.ids) ? d.ids : []); return json_({ ok: true, ...datosFotos_() }); }
    if (accion === "notaFoto") { guardarNota_(String(d.id), d.nota); return json_({ ok: true, ...datosFotos_() }); }
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
  hoja_(HOJA_FOTOS, COL_FOTOS);
}
