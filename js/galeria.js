// Galería de invitaciones: carga una invitación del catálogo en un iframe a pantalla completa
// y ofrece navegación anterior/siguiente, menú de invitaciones y favoritas enviables por WhatsApp.
//
// Único parámetro de URL: ?id=<id del invitado>, que se pasa tal cual a la invitación.
// WhatsApp y filtros se configuran en data/catalogo.js (window.GALERIA).
(function () {
  "use strict";

  const FAVORITAS_KEY = "galeria-favoritas";
  const HINT_KEY = "galeria-hint-corazon-visto";
  const INDICE_KEY = "galeria-indice";
  const config = window.GALERIA || {};

  const $ = (id) => document.getElementById(id);
  const el = {
    cargando: $("cargando"), vacio: $("vacio"), frame: $("visor-frame"),
    titulo: $("titulo-actual"), btnTitulo: $("btn-titulo"),
    anterior: $("btn-anterior"), siguiente: $("btn-siguiente"),
    favWrap: $("fav-wrap"), favorita: $("btn-favorita"),
    hint: $("hint-corazon"), pulso: $("hint-pulso"),
    enviarWrap: $("enviar-wrap"), enviar: $("btn-enviar"), enviarTexto: $("btn-enviar-texto"),
    menu: $("menu"), menuLista: $("menu-lista"),
    carrito: $("carrito"), carritoLista: $("carrito-lista"), whatsapp: $("btn-whatsapp"),
  };

  // ---------- Estado ----------
  const params = new URLSearchParams(location.search);
  const state = {
    todos: [],
    demos: [],
    index: 0,
    whatsapp: config.whatsapp || null,
    idInvitado: params.get("id") || "",
    tipo: config.tipo || null,
    linea: config.linea || null,
    favoritas: cargarFavoritas(),
  };

  // ---------- Utilidades ----------
  function normalizar(s) {
    return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "");
  }

  function cargarFavoritas() {
    try {
      const raw = localStorage.getItem(FAVORITAS_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  }

  function guardarFavoritas() {
    try { localStorage.setItem(FAVORITAS_KEY, JSON.stringify([...state.favoritas])); } catch {}
  }

  function filtrar(lista, tipo, linea) {
    let r = lista;
    if (tipo) r = r.filter((d) => normalizar(d.tipo) === normalizar(tipo));
    if (linea) r = r.filter((d) => normalizar(d.linea) === normalizar(linea));
    return r;
  }

  function urlDemo(demo) {
    if (!state.idInvitado) return demo.url;
    const sep = demo.url.includes("?") ? "&" : "?";
    return `${demo.url}${sep}id=${encodeURIComponent(state.idInvitado)}`;
  }

  const actual = () => state.demos[state.index];
  const esFavorita = (codigo) => !!codigo && state.favoritas.has(codigo);
  const listaFavoritas = () => state.todos.filter((d) => state.favoritas.has(d.codigo));

  function urlWhatsApp() {
    const lineas = listaFavoritas().map((d) => `• ${d.title} (${d.codigo})`);
    const texto = `Hola, me gustaron estas invitaciones:\n\n${lineas.join("\n\n")}`;
    return `https://wa.me/${state.whatsapp ?? ""}?text=${encodeURIComponent(texto)}`;
  }

  // Recuerda la invitación actual al recargar (la URL ya no la lleva).
  function recordarActual() {
    const d = actual();
    if (!d) return;
    try { sessionStorage.setItem(INDICE_KEY, d.codigo); } catch {}
  }

  // ---------- Render ----------
  function render() {
    const d = actual();
    el.cargando.hidden = true;
    el.vacio.hidden = state.demos.length > 0;
    el.frame.hidden = !d;
    if (!d) { el.titulo.textContent = ""; return; }

    const src = urlDemo(d);
    if (el.frame.getAttribute("src") !== src) el.frame.setAttribute("src", src);
    el.frame.title = d.title;
    el.titulo.textContent = d.title;
    document.title = `${d.title} · Galería`;

    renderFavorita();
  }

  function renderFavorita() {
    const conWhats = !!state.whatsapp;
    el.favWrap.hidden = !conWhats;

    const fav = esFavorita(actual()?.codigo);
    el.favorita.classList.toggle("activa", fav);
    el.favorita.setAttribute("aria-label", fav ? "Quitar de favoritas" : "Agregar a favoritas");
    el.favorita.querySelector("svg").setAttribute("fill", fav ? "white" : "none");

    const total = listaFavoritas().length;
    el.enviarWrap.hidden = !(conWhats && total > 0);
    el.enviarTexto.textContent = `Enviar Favoritas (${total})`;
  }

  const corazon = '<svg class="item-corazon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>';

  function renderMenu() {
    el.menuLista.innerHTML = "";
    state.demos.forEach((d, i) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "item" + (i === state.index ? " activo" : "");
      b.innerHTML = `<span class="item-num">${i + 1}</span><span class="item-titulo"></span>${esFavorita(d.codigo) ? corazon : ""}`;
      b.querySelector(".item-titulo").textContent = d.title;
      b.addEventListener("click", () => { irA(i); cerrar(el.menu); });
      li.appendChild(b);
      el.menuLista.appendChild(li);
    });
  }

  function renderCarrito() {
    const favs = listaFavoritas();
    el.carritoLista.innerHTML = "";
    if (favs.length === 0) {
      el.carritoLista.innerHTML = '<li class="vacio-carrito">Aún no tienes favoritas</li>';
      el.whatsapp.hidden = true;
      return;
    }
    el.whatsapp.hidden = false;
    el.whatsapp.href = urlWhatsApp();
    favs.forEach((d) => {
      const li = document.createElement("li");
      li.className = "item";
      li.innerHTML = `${corazon}<button type="button" class="item-titulo" style="border:0;background:none;text-align:left;padding:0;color:inherit"></button>
        <button type="button" class="item-quitar" aria-label="Quitar de favoritas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>`;
      const titulo = li.querySelector(".item-titulo");
      titulo.textContent = d.title;
      titulo.addEventListener("click", () => {
        const i = state.demos.findIndex((x) => x.codigo === d.codigo);
        if (i >= 0) irA(i);
        cerrar(el.carrito);
      });
      li.querySelector(".item-quitar").addEventListener("click", () => {
        state.favoritas.delete(d.codigo);
        guardarFavoritas();
        renderFavorita();
        renderCarrito();
      });
      el.carritoLista.appendChild(li);
    });
  }

  // ---------- Acciones ----------
  function irA(i) {
    if (i < 0 || i >= state.demos.length) return;
    state.index = i;
    recordarActual();
    render();
  }
  const anterior = () => state.demos.length && irA((state.index - 1 + state.demos.length) % state.demos.length);
  const siguiente = () => state.demos.length && irA((state.index + 1) % state.demos.length);

  function toggleFavorita() {
    const d = actual();
    if (!d) return;
    if (state.favoritas.has(d.codigo)) state.favoritas.delete(d.codigo);
    else state.favoritas.add(d.codigo);
    guardarFavoritas();
    ocultarHint(true);
    el.favorita.classList.remove("latido");
    void el.favorita.offsetWidth; // reinicia la animación
    el.favorita.classList.add("latido");
    renderFavorita();
  }

  function abrir(modal) { modal.hidden = false; }
  function cerrar(modal) { modal.hidden = true; }

  // Pista "¡Marca tus favoritas!" solo la primera visita.
  function mostrarHint() {
    if (!state.whatsapp) return;
    try { if (localStorage.getItem(HINT_KEY)) return; } catch { return; }
    setTimeout(() => { el.hint.hidden = false; el.pulso.hidden = false; }, 1500);
    setTimeout(() => ocultarHint(true), 7300);
  }
  function ocultarHint(marcarVisto) {
    el.hint.hidden = true;
    el.pulso.hidden = true;
    if (marcarVisto) { try { localStorage.setItem(HINT_KEY, "1"); } catch {} }
  }

  // ---------- Eventos ----------
  el.anterior.addEventListener("click", anterior);
  el.siguiente.addEventListener("click", siguiente);
  el.favorita.addEventListener("click", toggleFavorita);
  el.btnTitulo.addEventListener("click", () => { renderMenu(); abrir(el.menu); });
  el.enviar.addEventListener("click", () => { renderCarrito(); abrir(el.carrito); });

  document.querySelectorAll("[data-cerrar]").forEach((n) =>
    n.addEventListener("click", () => cerrar(n.closest(".modal")))
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { cerrar(el.menu); cerrar(el.carrito); return; }
    if (!el.menu.hidden || !el.carrito.hidden) return;
    if (e.key === "ArrowLeft") anterior();
    if (e.key === "ArrowRight") siguiente();
  });

  // ---------- Inicio ----------
  function iniciar(catalogo) {
    state.todos = catalogo;
    state.demos = filtrar(catalogo, state.tipo, state.linea);
    if (state.demos.length === 0) state.demos = catalogo; // si el filtro no coincide, muestra todo

    let codigo = null;
    try { codigo = sessionStorage.getItem(INDICE_KEY); } catch {}
    const i = codigo ? state.demos.findIndex((d) => normalizar(d.codigo) === normalizar(codigo)) : -1;
    state.index = i >= 0 ? i : 0;

    recordarActual();
    render();
    mostrarHint();
  }

  iniciar(Array.isArray(window.CATALOGO) ? window.CATALOGO : []);
})();
