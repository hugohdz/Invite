// Invitación. Todo el contenido sale de archivos, no del código:
//   /datos/evento.json    -> nombres, fecha, lugares, WhatsApp, tema, etc.
//   /datos/invitados.txt  -> lista de invitados (se lee por el servidor con ?id=)
//   /fotos/1.jpg, 2.jpg…  -> fotos, se muestran en orden numérico
// El único parámetro de URL es ?id=<id del invitado>.
//
// Dos modos de funcionamiento:
//  - Local (python servidor.py): invitados, fotos y confirmaciones pasan por /api del servidor.
//  - Publicado (GitHub Pages): si evento.json tiene "confirmacionesUrl", se usan
//    datos/invitados.json y datos/fotos.json (los genera publicar.py) y las
//    confirmaciones se guardan en Google Sheets.
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

    if (idInvitado) {
      try { invitado = await buscarInvitado(idInvitado); }
      catch { invitado = null; }
    }

    // La galería puede forzar un tema en el iframe; la URL pública solo lleva ?id=.
    document.documentElement.dataset.tema = window.frameElement ? (params.get("tema") || evento.tema) : evento.tema;

    rellenar();
    renderInvitado();
    iniciarSobre();
    iniciarCuenta();
    iniciarAnimaciones();
    await cargarFotos();
    iniciarCapas();
  }

  // ---------- Origen de datos (local o publicado) ----------
  const publicado = () => !!evento.confirmacionesUrl;

  async function buscarInvitado(id) {
    if (!publicado()) {
      try { return await obtener(`${RAIZ}api/invitado?id=${encodeURIComponent(id)}`); }
      catch { /* sin servidor (p. ej. GitHub Pages aún sin Google Sheets): usa invitados.json */ }
      return buscarEnJson(id);
    }
    // Publicado: la hoja "Invitados" de Google Sheets es la lista oficial.
    const r = await obtener(`${evento.confirmacionesUrl}?accion=invitado&id=${encodeURIComponent(id)}`);
    if ("invitado" in r) return r.invitado ? { ...r.invitado, confirmacion: r.confirmacion || null } : null;
    // Script de Google anterior (sin hoja Invitados): usa invitados.json y pide solo la confirmación.
    const inv = await buscarEnJson(id);
    if (!inv) return null;
    try {
      const est = await obtener(`${evento.confirmacionesUrl}?accion=estado&id=${encodeURIComponent(id)}`);
      inv.confirmacion = est.confirmacion || null;
    } catch {
      inv.confirmacion = null;
    }
    return inv;
  }

  async function buscarEnJson(id) {
    try {
      const lista = await obtener(`${RAIZ}datos/invitados.json`);
      return lista.find((x) => String(x.id) === id) || null;
    } catch {
      return null;
    }
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
    txt("saludo-pases", invitado.pases === 1 ? "Hemos reservado 1 lugar para ti" : `Hemos reservado ${invitado.pases} lugares para ustedes`);
    txt("sobre-para", `Para: ${invitado.nombre}`);

    const sel = $("rsvp-personas");
    sel.innerHTML = "";
    for (let n = 1; n <= invitado.pases; n++) sel.add(new Option(n === 1 ? "1 persona" : `${n} personas`, n));
    sel.value = invitado.pases;

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
  let fotos = [];

  async function cargarFotos() {
    try {
      let lista;
      try { lista = await obtener(`${RAIZ}api/fotos`); }
      catch { lista = await obtener(`${RAIZ}datos/fotos.json`); } // sitio estático
      fotos = lista.map((f) => RAIZ + f.replace(/^\//, ""));
    } catch {
      fotos = [];
    }
    ponerFotosSecciones();
    if (!fotos.length) return;

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
        img.src = fotos[i];
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

  // data-foto="0" usa 1.jpg, "1" usa 2.jpg, ... "ultima" la última. Si hay menos fotos, se repiten.
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

  // ---------- Capas al hacer scroll ----------
  // Cada escena tiene su foto fija; mientras sube por encima de la anterior, su foto
  // pasa de casi transparente y ampliada a nítida (--entrada de 0 a 1): el "desvanecimiento".
  // Los nombres de la portada se desvanecen hacia arriba al empezar a bajar.
  function iniciarCapas() {
    const escenas = [...document.querySelectorAll(".escena")];
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
