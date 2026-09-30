// Configuración de la galería (antes venía por la URL; ahora la URL solo lleva ?id=).
//   whatsapp : número al que se envían las favoritas (vacío = sin favoritas)
//   tipo / linea : filtros opcionales del catálogo (null = mostrar todas)
window.GALERIA = {
  whatsapp: "8446005641",
  tipo: null,
  linea: null,
};

// Catálogo de invitaciones que muestra la galería.
// Se define como JS (no JSON) para que funcione también abriendo index.html directo desde el disco.
//
// codigo : identificador único (se usa en ?invitacion=CODIGO y para favoritas)
// title  : nombre que aparece en la barra inferior y en el menú
// url    : ruta (relativa o absoluta) de la invitación que se carga en el iframe
// tipo   : filtro ?tipo=   (ej. "01bodas|b", "02xv|x")
// linea  : filtro ?linea=  (ej. "premium", "clasica")
window.CATALOGO = [
  { codigo: "BPRELE", title: "Boda Premium Elegance", url: "invitaciones/boda/?tema=elegance", tipo: "01bodas|b", linea: "premium" },
  { codigo: "BPRROS", title: "Boda Premium Rosé",     url: "invitaciones/boda/?tema=rose",     tipo: "01bodas|b", linea: "premium" },
  { codigo: "BPRNOC", title: "Boda Premium Noche",    url: "invitaciones/boda/?tema=noche",    tipo: "01bodas|b", linea: "premium" },
  { codigo: "BCLSAL", title: "Boda Clásica Salvia",   url: "invitaciones/boda/?tema=salvia",   tipo: "01bodas|b", linea: "clasica" },
  { codigo: "BPRLIL", title: "Boda Premium Lila",     url: "invitaciones/boda/?tema=lila",     tipo: "01bodas|b", linea: "premium" }
];
