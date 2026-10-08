// Invitación. Todo el contenido sale de datos, no del código:
//   Google Sheets, hoja "Evento" -> nombres, fecha, lugares, WhatsApp, tema… (se edita en el panel)
//   /datos/evento.json           -> solo "confirmacionesUrl" (dónde está el script de Google)
//   Google Drive, carpeta "Fotos invitación" -> fotos, en el orden del panel (menú Fotos)
//   /fotos/1.jpg, 2.jpg…         -> respaldo: solo si la carpeta de Drive está vacía (y en modo local)
// El único parámetro de URL es ?id=<id del invitado>.
//
// Dos modos de funcionamiento:
//  - Local (python servidor.py): invitados, fotos y confirmaciones pasan por /api del servidor.
//  - Publicado (GitHub Pages): si evento.json tiene "confirmacionesUrl", los invitados
//    y las confirmaciones se leen/guardan en Google Sheets, y las fotos salen de Google Drive
//    (o de datos/fotos.json, que genera publicar.py, si la carpeta de Drive está vacía).
(function () {
  "use strict";

  const RAIZ = "../../"; // ruta de este archivo a la raíz del sitio (rutas relativas: el sitio puede vivir en /Invite/)
  const params = new URLSearchParams(location.search);
  const idInvitado = (params.get("id") || "").trim();

  const $ = (id) => document.getElementById(id);
  const txt = (id, v) => { $(id).textContent = v ?? ""; };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let evento = null;
  let invitado = null;
  let fotosDrive = []; // [{ id, nombre }] de la carpeta de Google Drive

  // ---------- Carga de datos ----------
  async function obtener(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }

  async function iniciar() {
    try {
      evento = await obtener(`${RAIZ}datos/evento.json`);
    } catch (e) {
      document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">No se pudo leer <code>datos/evento.json</code>. Revisa que el archivo exista y que el JSON sea válido.</p>';
      console.error(e);
      return;
    }

    // Publicado: el evento y el invitado vienen de Google en UNA sola consulta.
    // La primera respuesta puede tardar unos segundos (Google "despierta" el script);
    // mientras tanto el sobre muestra "Cargando…".
    let pedirInvitado;
    if (publicado()) {
      txt("sobre-para", "Cargando…");
      const r = await obtener(`${evento.confirmacionesUrl}?accion=inicio&id=${encodeURIComponent(idInvitado)}`).catch(() => null);
      if (r && r.evento && Object.keys(r.evento).length) {
        evento = { ...evento, ...r.evento, confirmacionesUrl: evento.confirmacionesUrl };
      }
      if (r && Array.isArray(r.fotos)) fotosDrive = r.fotos;
      if (r && "evento" in r) {
        pedirInvitado = Promise.resolve(r.invitado ? { ...r.invitado, confirmacion: r.confirmacion || null } : null);
      }
      txt("sobre-para", "Toca el sello para abrir");
    }
    // evento.json ya solo guarda la URL de Google: sin respuesta de Google no hay qué mostrar.
    if (!evento.nombre1) {
      mostrarSinConexion();
      return;
    }
    // Local o script de Google anterior: el invitado se pide aparte, en paralelo.
    if (!pedirInvitado) pedirInvitado = idInvitado ? buscarInvitado(idInvitado).catch(() => null) : Promise.resolve(null);

    // La galería puede forzar un tema en el iframe; la URL pública solo lleva ?id=.
    document.documentElement.dataset.tema = window.frameElement ? (params.get("tema") || evento.tema) : evento.tema;

    aplicarSecciones();
    rellenar();
    iniciarSobre();
    iniciarCuenta();
    iniciarAnimaciones();
    iniciarClima();
    await cargarFotos();
    iniciarHospedaje();
    iniciarCapas();

    invitado = await pedirInvitado;
    renderInvitado();
    refrescarAOS();
  }

  function mostrarSinConexion() {
    txt("sobre-para", "");
    const caja = document.createElement("div");
    caja.style.cssText = "position:fixed;inset:auto 16px 12vh;z-index:11;text-align:center;font-family:Montserrat,sans-serif;color:#4a4036";
    caja.innerHTML = `<p style="margin:0 0 12px">No pudimos cargar la invitación.<br>Revisa tu conexión a internet.</p>
      <button type="button" style="padding:10px 22px;border:0;border-radius:999px;background:#b38a4a;color:#fff;font:500 14px Montserrat,sans-serif;cursor:pointer">Reintentar</button>`;
    caja.querySelector("button").addEventListener("click", () => location.reload());
    document.body.appendChild(caja);
    $("sobre").style.pointerEvents = "none";
  }

  // ---------- Origen de datos (local o publicado) ----------
  const publicado = () => !!evento.confirmacionesUrl;

  async function buscarInvitado(id) {
    if (!publicado()) return obtener(`${RAIZ}api/invitado?id=${encodeURIComponent(id)}`);
    // La hoja "Invitados" de Google Sheets es la lista oficial.
    const r = await obtener(`${evento.confirmacionesUrl}?accion=invitado&id=${encodeURIComponent(id)}`);
    return r.invitado ? { ...r.invitado, confirmacion: r.confirmacion || null } : null;
  }

  async function guardarConfirmacion(datos) {
    if (!publicado()) {
      const r = await fetch(`${RAIZ}api/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      });
      const res = await r.json();
      if (!r.ok) throw new Error(res.error || "Error");
      return res.confirmacion;
    }
    // Sin cabecera Content-Type para que el navegador no haga la consulta previa (CORS) que Google no admite.
    const r = await fetch(evento.confirmacionesUrl, { method: "POST", body: JSON.stringify(datos) });
    const res = await r.json();
    if (res.error) throw new Error(res.error);
    return res.confirmacion;
  }

  // ---------- Secciones (el panel las muestra u oculta: Evento > Secciones) ----------
  // evento.secciones = { regalos: false, ... }; lo que no aparece está activo.
  // Hospedaje y clima además necesitan datos (hoteles / ciudad) para mostrarse.
  const activa = (k) => (evento.secciones || {})[k] !== false;

  function aplicarSecciones() {
    const conDatos = {
      hospedaje: (evento.hospedaje || []).some((h) => h.nombre),
      clima: !!String(evento.ciudadClima || "").trim(),
    };
    document.querySelectorAll("[data-seccion]").forEach((sec) => {
      const k = sec.dataset.seccion;
      if (k === "galeria") return; // se muestra al cargar las fotos
      sec.hidden = !activa(k) || conDatos[k] === false;
    });
    // Las secciones con foto a un costado alternan el lado entre las que quedan visibles.
    [...document.querySelectorAll(".dividida")].filter((d) => !d.hidden)
      .forEach((d, i) => d.classList.toggle("invertida", i % 2 === 1));
  }

  // ---------- Contenido ----------
  function rellenar() {
    const d = evento;
    const pareja = d.nombre2 ? `${d.nombre1} & ${d.nombre2}` : d.nombre1;
    const fecha = new Date(d.fecha);

    document.title = pareja;
    txt("sello-iniciales", d.iniciales);
    txt("txt-eyebrow", d.eyebrow);
    txt("nombre1", d.nombre1);
    txt("nombre2", d.nombre2);
    document.querySelector(".amp").hidden = !d.nombre2;
    txt("fecha-larga", fecha.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
    txt("frase", d.frase);
    txt("bienvenida", d.bienvenida || "El día más importante de\nnuestras vidas ha llegado");
    txt("fecha-corta", fecha.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }).replace(/ de /g, " "));
    txt("iniciales-itinerario", d.nombre2 ? `${d.nombre1[0]} & ${d.nombre2[0]}` : d.iniciales);
    txt("txt-padres", d.tituloPadres);
    txt("vestimenta", d.vestimenta);
    txt("vestimenta-nota", d.vestimentaNota);
    txt("txt-fotos", d.tituloFotos || "Galería");
    txt("galeria-iniciales", d.nombre2 ? `${d.nombre1[0]} & ${d.nombre2[0]}` : d.iniciales);
    txt("rsvp-limite", d.rsvpLimite);
    txt("firma", pareja);

    const tarjeta = (html, anim, i) => {
      const div = document.createElement("div");
      div.className = "tarjeta";
      div.dataset.aos = anim;
      div.dataset.aosDelay = i * 150;
      div.innerHTML = html;
      return div;
    };

    (d.padres || []).forEach((g, i) => $("padres").appendChild(tarjeta(
      `<h3>${esc(g.titulo)}</h3>${(g.nombres || []).map((n) => `<p>${esc(n)}</p>`).join("")}`,
      i % 2 ? "fade-left" : "fade-right", i)));

    (d.lugares || []).forEach((l, i) => $("lugares").appendChild(tarjeta(
      `<h3>${esc(l.titulo)}</h3><p><strong>${esc(l.lugar)}</strong></p><p>${esc(l.direccion)}</p><p>${esc(l.hora)}</p>
       ${l.mapa ? `<a class="btn linea" href="${esc(l.mapa)}" target="_blank" rel="noopener">Ver ubicación</a>` : ""}`,
      i % 2 ? "flip-right" : "flip-left", i)));

    (d.itinerario || []).forEach(([h, t], i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="punto" data-aos="zoom-in"></span>
        <div class="texto" data-aos="${i % 2 ? "fade-left" : "fade-right"}" data-aos-delay="100">
          <h3>${esc(t)}</h3><time>${esc(h)}</time>
        </div>`;
      $("itinerario").appendChild(li);
    });

    (d.regalos || []).forEach((r) => {
      const a = document.createElement(r.url ? "a" : "span");
      a.className = "btn linea";
      a.textContent = r.texto;
      if (r.url) { a.href = r.url; a.target = "_blank"; a.rel = "noopener"; }
      $("regalos").appendChild(a);
    });
    if (d.cuentaBanco) {
      const p = document.createElement("p");
      p.className = "cuenta-banco";
      p.textContent = d.cuentaBanco;
      $("regalos").appendChild(p);
    }
  }

  // ---------- Invitado (?id=) y confirmación ----------
  function renderInvitado() {
    if (!invitado) {
      $("rsvp-sin-id").hidden = false;
      return;
    }
    $("saludo").hidden = false;
    txt("saludo-nombre", invitado.nombre);
    // "pases" son los adultos; "ninos" los lugares para niños.
    const ninos = Number(invitado.ninos) || 0;
    const lugares = invitado.pases + ninos;
    const detalle = ninos
      ? `: ${invitado.pases === 1 ? "1 adulto" : `${invitado.pases} adultos`} y ${ninos === 1 ? "1 niño" : `${ninos} niños`}`
      : "";
    txt("saludo-pases", lugares === 1 ? "Hemos reservado 1 lugar para ti" : `Hemos reservado ${lugares} lugares para ustedes${detalle}`);
    txt("sobre-para", `Para: ${invitado.nombre}`);

    const sel = $("rsvp-personas");
    sel.innerHTML = "";
    for (let n = 1; n <= lugares; n++) sel.add(new Option(n === 1 ? "1 persona" : `${n} personas`, n));
    sel.value = lugares;
    if (ninos) txt("campo-personas-txt", "¿Cuántas personas asistirán? (contando a los niños)");

    if (invitado.confirmacion) mostrarEstado(invitado.confirmacion);
    else $("rsvp").hidden = false;
  }

  // AOS calcula las posiciones al iniciar; hay que avisarle cuando algo cambia de tamaño.
  const refrescarAOS = () => { if (window.AOS) AOS.refresh(); };

  function mostrarEstado(c) {
    const box = $("rsvp-estado");
    box.hidden = false;
    $("rsvp").hidden = true;
    box.innerHTML = c.asiste
      ? `<strong>¡Gracias por confirmar!</strong><p>Te esperamos: ${c.personas === 1 ? "1 persona" : `${c.personas} personas`}.</p>`
      : `<strong>Gracias por avisarnos</strong><p>Lamentamos que no puedas acompañarnos.</p>`;

    const acciones = document.createElement("div");
    const cambiar = document.createElement("button");
    cambiar.type = "button";
    cambiar.className = "btn linea";
    cambiar.textContent = "Cambiar respuesta";
    cambiar.addEventListener("click", () => { box.hidden = true; $("rsvp").hidden = false; refrescarAOS(); });
    acciones.appendChild(cambiar);

    if (evento.whatsapp) {
      const msg = `Hola, soy ${invitado.nombre}. ${c.asiste ? `Confirmo mi asistencia (${c.personas}).` : "No podré asistir."}${c.mensaje ? `\n${c.mensaje}` : ""}`;
      const wa = document.createElement("a");
      wa.className = "btn";
      wa.style.marginLeft = "8px";
      wa.href = `https://wa.me/${evento.whatsapp}?text=${encodeURIComponent(msg)}`;
      wa.target = "_blank";
      wa.rel = "noopener";
      wa.textContent = "Avisar por WhatsApp";
      acciones.appendChild(wa);
    }
    box.appendChild(acciones);
    refrescarAOS();
  }

  const form = $("rsvp");
  form.addEventListener("change", () => {
    $("campo-personas").hidden = form.asiste.value !== "si";
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const boton = $("rsvp-enviar");
    const error = $("rsvp-error");
    error.hidden = true;
    boton.disabled = true;
    boton.textContent = "Enviando...";
    try {
      const confirmacion = await guardarConfirmacion({
        id: invitado.id,
        asiste: form.asiste.value === "si",
        personas: Number(form.personas.value),
        mensaje: form.mensaje.value,
      });
      invitado.confirmacion = confirmacion;
      mostrarEstado(confirmacion);
    } catch (err) {
      error.textContent = "No se pudo guardar tu confirmación. Intenta de nuevo.";
      error.hidden = false;
      console.error(err);
    } finally {
      boton.disabled = false;
      boton.textContent = "Confirmar asistencia";
    }
  });

  // ---------- Sobre ----------
  function iniciarSobre() {
    const sobre = $("sobre");
    const abrir = () => {
      if (sobre.classList.contains("abierto")) return;
      sobre.classList.add("abierto");
      document.body.classList.remove("cerrado");
      refrescarAOS();
    };
    sobre.addEventListener("click", abrir);
    sobre.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); }
    });
  }

  // ---------- Cuenta regresiva ----------
  function iniciarCuenta() {
    const fecha = new Date(evento.fecha);
    const u = {};
    document.querySelectorAll("#cuenta [data-u]").forEach((n) => { u[n.dataset.u] = n; });
    const tick = () => {
      const ms = Math.max(0, fecha - Date.now());
      u.d.textContent = Math.floor(ms / 864e5);
      u.h.textContent = Math.floor(ms / 36e5) % 24;
      u.m.textContent = Math.floor(ms / 6e4) % 60;
      u.s.textContent = Math.floor(ms / 1e3) % 60;
    };
    tick();
    setInterval(tick, 1000);
  }

  // ---------- Animaciones al hacer scroll (AOS, igual que la original) ----------
  function iniciarAnimaciones() {
    if (!window.AOS) {
      // Sin conexión al CDN: se muestra todo sin animación en lugar de dejarlo oculto.
      document.querySelectorAll("[data-aos]").forEach((n) => n.removeAttribute("data-aos"));
      return;
    }
    AOS.init({ offset: 200, duration: 1300, once: false });
    addEventListener("load", refrescarAOS);
    if (document.fonts) document.fonts.ready.then(refrescarAOS);
  }

  // ---------- Galería de fotos ----------
  // Patrón de la original (3 columnas): [chica + ancha], [3 medianas], [3 bajas] y se repite.
  const PATRON = [["alta", "ancha"], ["", "", ""], ["baja", "baja", "baja"]];
  const EFECTOS = ["fade-right", "zoom-in", "flip-left", "fade-up", "flip-right", "zoom-in", "fade-left", "flip-up"];
  let fotos = [];      // tamaño completo (fondos y carrusel)
  let miniaturas = []; // para la cuadrícula de la galería

  // Imagen de Drive al ancho pedido (la foto debe estar compartida con "cualquier persona con el enlace").
  const urlDrive = (id, ancho) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${ancho}`;

  async function cargarFotos() {
    if (fotosDrive.length) {
      fotos = fotosDrive.map((f) => urlDrive(f.id, 2000));
      miniaturas = fotosDrive.map((f) => urlDrive(f.id, 900));
    } else {
      try {
        let lista;
        try { lista = await obtener(`${RAIZ}api/fotos`); }
        catch { lista = await obtener(`${RAIZ}datos/fotos.json`); } // sitio estático
        fotos = lista.map((f) => RAIZ + f.replace(/^\//, ""));
      } catch {
        fotos = [];
      }
      miniaturas = fotos;
    }
    ponerFotosSecciones();
    if (!fotos.length || !activa("galeria")) return;

    const cont = $("fotos");
    let n = 0;
    for (let g = 0; n < fotos.length; g++) {
      PATRON[g % PATRON.length].forEach((clase, col) => {
        if (n >= fotos.length) return;
        const i = n++;
        const b = document.createElement("button");
        b.type = "button";
        b.className = `galeria-foto ${clase}`.trim();
        b.dataset.aos = EFECTOS[i % EFECTOS.length];
        b.dataset.aosDelay = col * 150;
        b.dataset.aosOffset = 80;
        b.setAttribute("aria-label", `Ver foto ${i + 1}`);
        const img = new Image();
        img.src = miniaturas[i];
        img.alt = `Foto ${i + 1}`;
        img.decoding = "async";
        img.addEventListener("load", refrescarAOS, { once: true });
        b.appendChild(img);
        b.addEventListener("click", () => abrirCarrusel(i));
        cont.appendChild(b);
      });
    }
    // Si la última fila quedó incompleta, la última foto ocupa el espacio sobrante.
    const usadas = [...cont.children].reduce((t, el) => t + (el.classList.contains("ancha") ? 2 : 1), 0);
    const ultima = cont.lastElementChild;
    if (usadas % 3 === 2) ultima.classList.add("ancha");
    if (usadas % 3 === 1) ultima.style.gridColumn = "1 / -1";

    $("seccion-fotos").hidden = false;
    if (window.AOS) AOS.refreshHard();
  }

  // data-foto="0" usa la foto 1, "1" la foto 2, ... "ultima" la última. Si hay menos fotos, se repiten.
  function ponerFotosSecciones() {
    document.querySelectorAll("img[data-foto]").forEach((img) => {
      if (!fotos.length) {
        img.remove(); // sin fotos: queda el color de fondo del tema
        return;
      }
      const n = img.dataset.foto === "ultima" ? fotos.length - 1 : Number(img.dataset.foto) % fotos.length;
      img.src = fotos[n];
      img.addEventListener("load", refrescarAOS, { once: true });
    });
    document.querySelectorAll(".dividida-foto").forEach((div, i) => {
      if (!fotos.length) { div.hidden = true; return; }
      div.dataset.aos = div.parentElement.classList.contains("invertida") ? "fade-left" : "fade-right";
    });
  }

  // ---------- Sugerencia de hospedaje (carrusel de hoteles, como la original) ----------
  // Cada hotel: { nombre, nota, mapa, foto }. "foto" es un enlace a una imagen o el número
  // de una foto de la galería (8 = la 8.ª foto). Sin foto se queda la de la sección.
  let hoteles = [];
  let hotelActual = 0;

  function fotoDeHotel(h) {
    const f = String(h.foto || "").trim();
    if (/^\d+$/.test(f)) return fotos[Number(f) - 1] || "";
    return /^https?:\/\//i.test(f) ? f : "";
  }

  function iniciarHospedaje() {
    const sec = $("seccion-hospedaje");
    if (sec.hidden) return;
    hoteles = (evento.hospedaje || []).filter((h) => h.nombre);
    const lado = sec.querySelector(".dividida-foto");
    let img = $("hospedaje-foto");
    if (!img) { // carpeta sin fotos: ponerFotosSecciones quitó la imagen
      img = new Image();
      img.id = "hospedaje-foto";
      img.alt = "";
      lado.appendChild(img);
    }
    const porDefecto = img.getAttribute("src") || "";
    img.addEventListener("load", () => { img.classList.remove("cambiando"); refrescarAOS(); });

    const mostrar = (i, hacia) => {
      hotelActual = (i + hoteles.length) % hoteles.length;
      const h = hoteles[hotelActual];
      const caja = $("hotel");
      const pintar = () => {
        caja.innerHTML = `<h3>${esc(h.nombre)}</h3>${h.nota ? `<p>${esc(h.nota)}</p>` : ""}
          ${h.mapa ? `<a class="btn linea" href="${esc(h.mapa)}" target="_blank" rel="noopener">Ir a Google Maps</a>` : ""}`;
        caja.classList.remove("cambiando");
      };
      if (hacia) {
        caja.style.setProperty("--hacia", `${hacia * -20}px`);
        caja.classList.add("cambiando");
        setTimeout(pintar, 300);
      } else pintar();
      [...$("hotel-puntos").children].forEach((p, n) => p.classList.toggle("activo", n === hotelActual));

      // La foto de la sección cambia a la del hotel (si tiene).
      const foto = fotoDeHotel(h) || porDefecto;
      lado.hidden = !foto;
      if (foto && img.getAttribute("src") !== foto) {
        img.classList.add("cambiando");
        setTimeout(() => { img.src = foto; }, hacia ? 300 : 0);
      }
    };

    const varios = hoteles.length > 1;
    $("hotel-prev").hidden = !varios;
    $("hotel-next").hidden = !varios;
    $("hotel-puntos").hidden = !varios;
    hoteles.forEach((h, n) => {
      const p = document.createElement("button");
      p.type = "button";
      p.setAttribute("aria-label", h.nombre);
      p.addEventListener("click", () => { if (n !== hotelActual) mostrar(n, n > hotelActual ? 1 : -1); });
      $("hotel-puntos").appendChild(p);
    });
    $("hotel-prev").addEventListener("click", () => mostrar(hotelActual - 1, -1));
    $("hotel-next").addEventListener("click", () => mostrar(hotelActual + 1, 1));

    // Deslizar con el dedo también cambia de hotel.
    let x0 = null;
    const tarjeta = sec.querySelector(".tarjeta-papel");
    tarjeta.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
    tarjeta.addEventListener("pointerup", (e) => {
      if (x0 === null || !varios) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (dx > 50) mostrar(hotelActual - 1, -1);
      else if (dx < -50) mostrar(hotelActual + 1, 1);
    });
    mostrar(0, 0);
  }

  // ---------- Clima de la semana ----------
  // Pronóstico de Open-Meteo (gratis y sin clave) para "ciudadClima": "Saltillo",
  // "Saltillo, Coahuila" o coordenadas "25.42, -101.00". Igual que la original:
  // clima actual + los próximos 3 días.
  const ICONOS = {
    sol: '<circle cx="24" cy="24" r="8"/><path d="M24 6v5M24 37v5M6 24h5M37 24h5M11.3 11.3l3.5 3.5M33.2 33.2l3.5 3.5M11.3 36.7l3.5-3.5M33.2 14.8l3.5-3.5"/>',
    luna: '<path d="M30 8a16 16 0 1 0 10 25A13 13 0 0 1 30 8z"/>',
    "sol-nube": '<path d="M17 9v3M8 18h3M10.6 11.6l2.1 2.1M23.4 11.6l-2.1 2.1"/><path d="M11.5 22a6 6 0 0 1 10.8-5"/><path d="M15 38h20a7 7 0 0 0 .6-14 10 10 0 0 0-19.2 2.6A5.7 5.7 0 0 0 15 38z"/>',
    nube: '<path d="M13 36h23a8 8 0 0 0 .7-16 11.5 11.5 0 0 0-22 3A6.5 6.5 0 0 0 13 36z"/>',
    niebla: '<path d="M13 28h23a8 8 0 0 0 .7-16 11.5 11.5 0 0 0-22 3A6.5 6.5 0 0 0 13 28z"/><path d="M10 34h28M10 40h28"/>',
    llovizna: '<path d="M17 7v3M8 16h3M10.6 9.6l2.1 2.1M23.4 9.6l-2.1 2.1"/><path d="M11.5 20a6 6 0 0 1 10.8-5"/><path d="M15 33h20a7 7 0 0 0 .6-14 10 10 0 0 0-19.2 2.6A5.7 5.7 0 0 0 15 33z"/><path d="M19 37l-2 4M26 37l-2 4M33 37l-2 4"/>',
    lluvia: '<path d="M13 30h23a8 8 0 0 0 .7-16 11.5 11.5 0 0 0-22 3A6.5 6.5 0 0 0 13 30z"/><path d="M16 35l-3 6M24 35l-3 6M32 35l-3 6"/>',
    tormenta: '<path d="M13 28h23a8 8 0 0 0 .7-16 11.5 11.5 0 0 0-22 3A6.5 6.5 0 0 0 13 28z"/><path d="M25 30l-5 7h6l-4 7"/>',
    nieve: '<path d="M13 28h23a8 8 0 0 0 .7-16 11.5 11.5 0 0 0-22 3A6.5 6.5 0 0 0 13 28z"/><path d="M17 35v6M14 38h6M31 35v6M28 38h6M24 39v6M21 42h6"/>',
  };

  // Códigos de clima WMO (los que usa Open-Meteo).
  function iconoClima(codigo) {
    const c = Number(codigo);
    let k = "nube";
    if (c === 0) k = "sol";
    else if (c <= 2) k = "sol-nube";
    else if (c === 45 || c === 48) k = "niebla";
    else if (c >= 51 && c <= 57) k = "llovizna";
    else if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) k = "lluvia";
    else if ((c >= 71 && c <= 77) || c === 85 || c === 86) k = "nieve";
    else if (c >= 95) k = "tormenta";
    return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[k]}</svg>`;
  }

  const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  async function ubicarCiudad(texto) {
    const coords = texto.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coords) return { lat: coords[1], lon: coords[2] };
    const [nombre, ...resto] = texto.split(",").map((x) => x.trim()).filter(Boolean);
    const r = await obtener(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nombre)}&count=10&language=es&format=json`);
    const lista = r.results || [];
    // "Saltillo, Coahuila": entre las ciudades con ese nombre, la del estado o país indicado.
    const pista = sinAcentos(resto.join(" "));
    const coincide = (v) => { const t = sinAcentos(v); return t && (t.includes(pista) || pista.includes(t)); };
    const elegida = (pista && lista.find((c) => [c.admin1, c.country, c.country_code].some(coincide))) || lista[0];
    if (!elegida) throw new Error(`No se encontró la ciudad "${texto}"`);
    return { lat: elegida.latitude, lon: elegida.longitude };
  }

  async function iniciarClima() {
    if ($("seccion-clima").hidden) return;
    try {
      const { lat, lon } = await ubicarCiudad(String(evento.ciudadClima));
      const r = await obtener(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
        + "&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3");
      txt("clima-actual", `Clima actual ${r.current.temperature_2m.toFixed(1)} °C`);
      $("clima-dias").innerHTML = r.daily.time.map((dia, i) => {
        const nombre = new Date(`${dia}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long" });
        const promedio = (r.daily.temperature_2m_max[i] + r.daily.temperature_2m_min[i]) / 2;
        return `<div class="clima-dia" data-aos="fade-up" data-aos-delay="${i * 150}">
          <span>${esc(nombre)}</span>${iconoClima(r.daily.weather_code[i])}<strong>${promedio.toFixed(1)}°C</strong>
        </div>`;
      }).join("");
    } catch (e) {
      console.error("Clima:", e);
      $("clima-actual").hidden = true;
      $("clima-dias").outerHTML = '<p class="clima-error">No se pudo obtener el clima. Intenta más tarde.</p>';
    }
    if (window.AOS) AOS.refreshHard(); // registra los días recién agregados
  }

  // ---------- Capas al hacer scroll ----------
  // Cada escena tiene su foto fija; mientras sube por encima de la anterior, su foto
  // pasa de casi transparente y ampliada a nítida (--entrada de 0 a 1): el "desvanecimiento".
  // Los nombres de la portada se desvanecen hacia arriba al empezar a bajar.
  function iniciarCapas() {
    const escenas = [...document.querySelectorAll(".escena")].filter((e) => !e.hidden);
    const textosPortada = $("portada-textos");
    let pendiente = false;

    const actualizar = () => {
      pendiente = false;
      const alto = innerHeight;
      escenas.forEach((esc, i) => {
        const r = esc.getBoundingClientRect();
        if (r.bottom < 0 || r.top > alto) return;
        const entrada = i === 0 ? 1 : Math.min(1, Math.max(0, (alto - r.top) / alto));
        esc.style.setProperty("--entrada", entrada.toFixed(3));
      });
      const p = Math.min(1, scrollY / (alto * 0.7));
      textosPortada.style.opacity = (1 - p).toFixed(3);
      textosPortada.style.transform = `translateY(${(-p * 80).toFixed(1)}px)`;
    };

    addEventListener("scroll", () => {
      if (!pendiente) { pendiente = true; requestAnimationFrame(actualizar); }
    }, { passive: true });
    addEventListener("resize", actualizar);
    actualizar();
  }

  // ---------- Carrusel (misma transición que la original: sale, salta al otro lado y entra) ----------
  const carrusel = $("carrusel");
  const slide = $("carrusel-slide");
  const imgCarrusel = $("carrusel-img");
  const puntos = $("carrusel-puntos");
  let actual = 0;
  let animando = false;

  function pintarPuntos() {
    puntos.innerHTML = "";
    fotos.forEach((_, i) => {
      const p = document.createElement("button");
      p.type = "button";
      p.textContent = "•";
      p.className = i === actual ? "activo" : "";
      p.setAttribute("aria-label", `Foto ${i + 1}`);
      p.addEventListener("click", () => irA(i));
      puntos.appendChild(p);
    });
  }

  function abrirCarrusel(i) {
    actual = i;
    imgCarrusel.src = fotos[i];
    slide.className = "carrusel-slide";
    pintarPuntos();
    carrusel.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function cerrarCarrusel() {
    carrusel.hidden = true;
    document.body.style.overflow = "";
  }

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  async function irA(i) {
    if (animando || i === actual || !fotos.length) return;
    animando = true;
    const haciaAtras = i < actual;
    slide.className = `carrusel-slide ${haciaAtras ? "sale-der" : "sale-izq"}`;
    await esperar(450);
    slide.className = `carrusel-slide ${haciaAtras ? "desde-izq" : "desde-der"}`;
    actual = i;
    imgCarrusel.src = fotos[i];
    pintarPuntos();
    await esperar(60);
    slide.className = "carrusel-slide entra";
    await esperar(350);
    animando = false;
  }

  const siguiente = () => irA((actual + 1) % fotos.length);
  const anterior = () => irA((actual - 1 + fotos.length) % fotos.length);

  $("carrusel-next").addEventListener("click", siguiente);
  $("carrusel-prev").addEventListener("click", anterior);
  $("carrusel-cerrar").addEventListener("click", cerrarCarrusel);
  carrusel.addEventListener("click", (e) => { if (e.target === carrusel) cerrarCarrusel(); });
  addEventListener("keydown", (e) => {
    if (carrusel.hidden) return;
    if (e.key === "Escape") cerrarCarrusel();
    if (e.key === "ArrowRight") siguiente();
    if (e.key === "ArrowLeft") anterior();
  });

  // Deslizar con el dedo o el mouse: más de 50 px cambia de foto.
  let inicioX = null;
  const cuerpo = $("carrusel-cuerpo");
  cuerpo.addEventListener("pointerdown", (e) => { inicioX = e.clientX; });
  cuerpo.addEventListener("pointerup", (e) => {
    if (inicioX === null) return;
    const dx = e.clientX - inicioX;
    inicioX = null;
    if (dx > 50) anterior();
    else if (dx < -50) siguiente();
  });
  cuerpo.addEventListener("pointercancel", () => { inicioX = null; });

  iniciar();
})();
