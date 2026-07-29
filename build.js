/* ---------------------------------------------------------------
   Amate · generador del sitio
   Sin dependencias. Se ejecuta con:  node build.js
   Lee /contenido, escribe /_publicado
   --------------------------------------------------------------- */

const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;
const CONTENIDO = path.join(RAIZ, 'contenido');
const ESTATICO = path.join(RAIZ, 'sitio');
const ADMIN = path.join(RAIZ, 'admin');
const SALIDA = path.join(RAIZ, '_publicado');

const SITIO = {
  nombre: 'Amate',
  lema: 'Crónicas de Morelos',
  url: 'https://amatecronicas.netlify.app',
  descripcion:
    'Portal de crónica, memoria oral y acervo documental de Morelos. Un archivo perpetuo del territorio.',
  licencia: 'CC BY-SA 4.0',
  correo: 'estrategia03@gmail.com',

  /* Mientras sea true, el sitio se declara NO INDEXABLE: sin canónicas,
     con noindex y con robots.txt cerrado. Es lo correcto mientras la
     dirección sea provisional: indexar bajo un nombre que vas a abandonar
     es peor que no indexar.

     Cámbialo a false SÓLO cuando: (1) el dominio definitivo esté
     registrado, (2) SITIO.url apunte a ese dominio, y (3) el contenido
     de ejemplo esté sustituido por piezas reales. */
  provisional: true,
};

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
  'agosto','septiembre','octubre','noviembre','diciembre'];

const SECCIONES = {
  cronica:   { nombre: 'Crónica',    color: 'cochinilla' },
  testimonio:{ nombre: 'Testimonio', color: 'anil' },
  acervo:    { nombre: 'Acervo',     color: 'cana' },
  toponimia: { nombre: 'Toponimia',  color: 'cana' },
  obituario: { nombre: 'Obituario',  color: 'cochinilla' },
};

/* ---------- utilidades ---------------------------------------- */

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
           .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slug = (s = '') =>
  String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function escribir(rel, html) {
  const destino = path.join(SALIDA, rel);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, html);
}

function copiarDir(origen, destino) {
  if (!fs.existsSync(origen)) return;
  fs.mkdirSync(destino, { recursive: true });
  for (const item of fs.readdirSync(origen)) {
    const o = path.join(origen, item), d = path.join(destino, item);
    fs.statSync(o).isDirectory() ? copiarDir(o, d) : fs.copyFileSync(o, d);
  }
}

/* ---------- front-matter (módulo compartido) ------------------- */

const { leerFrontMatter } = require('./lib/frontmatter');

/* ---------- markdown: subconjunto suficiente para crónica ------ */

function enLinea(s) {
  return esc(s)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
      '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function markdown(md) {
  const lineas = md.split('\n');
  const salida = [];
  let parrafo = [], lista = null, cita = [];

  const cerrarParrafo = () => {
    if (parrafo.length) { salida.push(`<p>${enLinea(parrafo.join(' '))}</p>`); parrafo = []; }
  };
  const cerrarLista = () => {
    if (lista) { salida.push(`</${lista}>`); lista = null; }
  };
  const cerrarCita = () => {
    if (cita.length) {
      salida.push(`<blockquote><p>${enLinea(cita.join(' '))}</p></blockquote>`);
      cita = [];
    }
  };
  const cerrarTodo = () => { cerrarParrafo(); cerrarLista(); cerrarCita(); };

  for (const linea of lineas) {
    const t = linea.trim();

    if (!t) { cerrarTodo(); continue; }

    if (t.startsWith('> ')) { cerrarParrafo(); cerrarLista(); cita.push(t.slice(2)); continue; }
    cerrarCita();

    if (/^---+$/.test(t)) { cerrarTodo(); salida.push('<hr>'); continue; }

    const enc = t.match(/^(#{2,4})\s+(.*)$/);
    if (enc) {
      cerrarTodo();
      const n = enc[1].length;
      salida.push(`<h${n}>${enLinea(enc[2])}</h${n}>`);
      continue;
    }

    if (/^[-*]\s+/.test(t)) {
      cerrarParrafo();
      if (lista !== 'ul') { cerrarLista(); salida.push('<ul>'); lista = 'ul'; }
      salida.push(`<li>${enLinea(t.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    if (/^\d+\.\s+/.test(t)) {
      cerrarParrafo();
      if (lista !== 'ol') { cerrarLista(); salida.push('<ol>'); lista = 'ol'; }
      salida.push(`<li>${enLinea(t.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }
    cerrarLista();
    parrafo.push(t);
  }
  cerrarTodo();
  return salida.join('\n');
}

/* ---------- carga de contenido --------------------------------- */

function cargar(carpeta) {
  const dir = path.join(CONTENIDO, carpeta);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const crudo = fs.readFileSync(path.join(dir, f), 'utf8');
      const { datos, cuerpo } = leerFrontMatter(crudo);
      return { archivo: f, nombre: f.replace(/\.md$/, ''), ...datos, cuerpo };
    });
}

const autores = cargar('autores');
const efemerides = cargar('efemerides');
const pistas = cargar('pistas');
const cronicas = cargar('cronicas')
  .filter(c => c.borrador !== 'true')
  .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

const autorPorSlug = Object.fromEntries(
  autores.map(a => [a.nombre, a])
);

function fechaLarga(iso = '') {
  const [a, m, d] = String(iso).split('-');
  if (!a || !m || !d) return iso;
  return `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}`;
}

function folio(c) {
  const [a, m, d] = String(c.fecha).split('-');
  return `AMT·${a}${m}${d}`;
}

/* ---------- plantilla base ------------------------------------- */

function pagina({ titulo, descripcion, cuerpo, clase = '', canonica = '' }) {
  const t = titulo ? `${titulo} — ${SITIO.nombre}` : `${SITIO.nombre}. ${SITIO.lema}`;
  return `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t)}</title>
<meta name="description" content="${esc(descripcion || SITIO.descripcion)}">
<meta property="og:title" content="${esc(t)}">
<meta property="og:description" content="${esc(descripcion || SITIO.descripcion)}">
<meta property="og:type" content="article">
<meta property="og:locale" content="es_MX">
${SITIO.provisional
  ? '<meta name="robots" content="noindex, nofollow">'
  : (canonica ? `<link rel="canonical" href="${SITIO.url}${canonica}">` : '')}
<link rel="alternate" type="application/rss+xml" title="${SITIO.nombre}" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/estilos.css">
</head>
<body class="${clase}">
<a class="saltar" href="#principal">Ir al contenido</a>

<header class="cabecera">
  <div class="marco cabecera-fila">
    <a class="marca" href="/">
      <span class="marca-nombre">Amate</span>
      <span class="marca-lema">Crónicas de Morelos</span>
    </a>
    <nav class="nav" aria-label="Secciones">
      <a href="/efemerides/">Efemérides</a>
      <a href="/cronicas/">Crónicas</a>
      <a href="/archivo/">Archivo</a>
      <a href="/cronistas/">Cronistas</a>
      <a href="/colaborar/">Colaborar</a>
      <a href="/buscar/">Buscar</a>
    </nav>
  </div>
</header>

<main id="principal">
${cuerpo}
</main>

<footer class="pie">
  <div class="marco pie-rejilla">
    <div>
      <p class="pie-marca">Amate</p>
      <p class="pie-nota">${esc(SITIO.descripcion)}</p>
    </div>
    <div>
      <p class="pie-titulo">El archivo</p>
      <p class="pie-nota">${efemerides.length} días documentados de 366.
      ${cronicas.length} piezas publicadas. Nada se retira: lo publicado
      conserva su dirección de forma permanente.</p>
    </div>
    <div>
      <p class="pie-titulo">Uso</p>
      <p class="pie-nota">Textos bajo licencia ${SITIO.licencia}: se pueden
      reproducir citando autor y portal. Las imágenes de acervo familiar
      conservan los derechos de quien las aportó.</p>
      <p class="pie-nota"><a href="/colaborar/">Enviar material</a> ·
      ${pistas.length ? '<a href="/pistas/">Pistas por confirmar</a> · ' : ''}
      <a href="/feed.xml">Sindicación RSS</a> ·
      <a href="/admin/">Escritorio del cronista</a></p>
    </div>
  </div>
</footer>
</body>
</html>`;
}

/* ---------- componentes ---------------------------------------- */

function tarjetaCronica(c) {
  const sec = SECCIONES[c.seccion] || SECCIONES.cronica;
  const autor = autorPorSlug[c.autor];
  return `<article class="tarjeta">
  <div class="tarjeta-meta">
    <span class="etiqueta etiqueta--${sec.color}">${esc(sec.nombre)}</span>
    <span class="folio">${esc(folio(c))}</span>
  </div>
  <h3 class="tarjeta-titulo"><a href="/cronicas/${esc(c.nombre)}/">${esc(c.titulo)}</a></h3>
  <p class="tarjeta-resumen">${esc(c.resumen || '')}</p>
  <p class="tarjeta-pie">
    ${autor ? esc(autor.titulo) : esc(c.autor || '')}
    ${c.lugar ? ` · ${esc(c.lugar)}` : ''}
    · <time datetime="${esc(c.fecha)}">${esc(fechaLarga(c.fecha))}</time>
  </p>
</article>`;
}

function hojaEfemeride(ef, { enlace = true } = {}) {
  const [mes, dia] = ef.nombre.split('-');
  const capas = (ef.capas || []).map(capa => {
    const modo = capa.verificacion || 'humana';
    const enlaceFuente = capa.fuente ? ` · <a href="${esc(capa.fuente)}">fuente</a>` : '';
    let sello;
    if (modo === 'humana') {
      sello = '<span class="sello sello--humana" title="Comprobada por un cronista contra la fuente original.">Verificada por cronista</span>';
    } else if (capa.confianza === 'sin_confirmar') {
      sello = `<span class="sello sello--sinconfirmar">Sin confirmar</span>${enlaceFuente ? `<span class="sello-fuente">${enlaceFuente.replace(' · ', '')}</span>` : ''}`;
    } else if (capa.confianza === 'media') {
      sello = `<span class="sello sello--media" title="El verificador encontró un error en el dato original y lo corrigió contra una fuente independiente. Todavía no la revisa una persona.">Confianza media · dato corregido${enlaceFuente}</span>`;
    } else {
      sello = `<span class="sello sello--maquina" title="Confirmada contra la fuente y corroborada por una segunda independiente. Todavía no la revisa una persona.">Confianza alta · automática${enlaceFuente}</span>`;
    }
    return `
    <li class="capa capa--${slug(capa.ambito)}">
      <span class="capa-ambito">${esc(capa.ambito)}</span>
      <span class="capa-anio">${esc(capa.anio)}</span>
      <div class="capa-texto${capa.confianza === 'sin_confirmar' ? ' capa-texto--dudosa' : ''}">
        <p>${enLinea(capa.texto || '')}</p>
        ${sello}
        ${capa.confianza === 'sin_confirmar' && capa.motivo ? `
        <p class="motivo-duda"><span class="motivo-etiqueta">Por qué no se pudo confirmar</span>${esc(capa.motivo)}</p>` : ''}
      </div>
    </li>`;
  }).join('');

  return `<div class="hoja">
  <div class="hoja-fecha">
    <span class="hoja-dia">${Number(dia)}</span>
    <span class="hoja-mes">${MESES[Number(mes) - 1]}</span>
    <span class="hoja-nota">día perpetuo</span>
  </div>
  <div class="hoja-cuerpo">
    <ol class="capas">${capas}</ol>
    ${ef.cuerpo.trim() ? `<div class="hoja-glosa">${markdown(ef.cuerpo)}</div>` : ''}
    ${(ef.capas || []).some(c => c.confianza === 'sin_confirmar') ? `
    <p class="aviso-verificacion aviso-verificacion--fuerte"><strong>Esta hoja
    incluye datos SIN CONFIRMAR.</strong> Son hallazgos que no resistieron la
    verificación: la fuente no se pudo corroborar de forma independiente o el
    dato se contradice con otras fuentes. Se publican para no perder la pista,
    pero <strong>no deben citarse como ciertos</strong> mientras no los
    respalde un documento. El motivo del rechazo va impreso debajo de cada
    uno.</p>` : (ef.capas || []).some(c => c.verificacion === 'automatica') ? `
    <p class="aviso-verificacion"><strong>Parte de esta hoja se publicó
    automáticamente.</strong> El agente sólo publica lo que confirmó contra una
    fuente y corroboró con una segunda independiente, pero todavía no la ha leído
    una persona. Las capas con sello punteado están pendientes de auditoría; las
    de sello continuo ya las comprobó un cronista.</p>` : ''}
    <p class="hoja-pie">
      <span class="folio">Actualizado ${esc(fechaLarga(ef.actualizado))}</span>
      ${enlace ? ` · <a href="/efemerides/${esc(ef.nombre)}/">Ver la hoja completa</a>` : ''}
    </p>
  </div>
</div>`;
}

/* ---------- portada -------------------------------------------- */

function construirPortada() {
  const mapaEf = Object.fromEntries(efemerides.map(e => [e.nombre, e]));
  const hoy = new Date();
  const claveHoy = String(hoy.getMonth() + 1).padStart(2, '0') + '-' +
                   String(hoy.getDate()).padStart(2, '0');
  const efHoy = mapaEf[claveHoy] || efemerides[0];

  // La hoja del día se elige también en el navegador, para que un sitio
  // estático servido desde caché muestre siempre el día correcto.
  const datosCliente = JSON.stringify(
    Object.fromEntries(efemerides.map(e => [e.nombre, hojaEfemeride(e)]))
  );

  const destacada = cronicas[0];
  const resto = cronicas.slice(1, 7);

  const cuerpo = `
<section class="hoy">
  <div class="marco">
    <p class="eyebrow">Hoy en la historia de Morelos</p>
    <div id="hoja-de-hoy">${efHoy ? hojaEfemeride(efHoy) : ''}</div>
    <p class="hoy-aviso" id="hoja-vacia" hidden>
      Esta fecha todavía no tiene hoja. Si conoces un hecho ocurrido hoy en
      Morelos, <a href="/admin/">propónlo al consejo editorial</a>.
    </p>
  </div>
</section>

${destacada ? `
<section class="destacada">
  <div class="marco">
    <p class="eyebrow">Lo último</p>
    <article class="pieza-destacada">
      <div>
        <span class="etiqueta etiqueta--${(SECCIONES[destacada.seccion] || SECCIONES.cronica).color}">${esc((SECCIONES[destacada.seccion] || SECCIONES.cronica).nombre)}</span>
        <h2><a href="/cronicas/${esc(destacada.nombre)}/">${esc(destacada.titulo)}</a></h2>
        <p class="destacada-resumen">${esc(destacada.resumen || '')}</p>
        <p class="tarjeta-pie">${esc(destacada.autor ? (autorPorSlug[destacada.autor]?.titulo || destacada.autor) : '')} · <time datetime="${esc(destacada.fecha)}">${esc(fechaLarga(destacada.fecha))}</time></p>
      </div>
    </article>
  </div>
</section>` : ''}

${resto.length ? `
<section class="rejilla-seccion">
  <div class="marco">
    <div class="rejilla">${resto.map(tarjetaCronica).join('')}</div>
    <p class="mas"><a href="/cronicas/">Todas las crónicas</a></p>
  </div>
</section>` : ''}

<section class="convocatoria">
  <div class="marco convocatoria-caja">
    <h2>El archivo se hace entre todos</h2>
    <p>Si tienes una fotografía, un plano, un contrato de hacienda o una
    grabación con alguien que recuerde el pueblo de antes, este portal la
    resguarda y un cronista la contextualiza. La pieza se publica a tu
    nombre y el original se queda contigo.</p>
    <p class="convocatoria-nota">Cada aportación se revisa contra el criterio
    de fuentes antes de publicarse, y se marca si es documento, memoria oral
    o interpretación.</p>
    <p><a class="boton" href="/colaborar/">Cómo enviar tu material</a></p>
  </div>
</section>

<script>
  var HOJAS = ${datosCliente};
  (function () {
    var h = new Date();
    var clave = String(h.getMonth() + 1).padStart(2, '0') + '-' +
                String(h.getDate()).padStart(2, '0');
    var caja = document.getElementById('hoja-de-hoy');
    if (HOJAS[clave]) { caja.innerHTML = HOJAS[clave]; }
    else { caja.innerHTML = ''; document.getElementById('hoja-vacia').hidden = false; }
  })();
</script>`;

  escribir('index.html', pagina({ cuerpo, canonica: '/' }));
}

/* ---------- efemérides: índice y hojas -------------------------- */

function construirEfemerides() {
  const porMes = {};
  for (const ef of efemerides) {
    const mes = ef.nombre.split('-')[0];
    (porMes[mes] = porMes[mes] || []).push(ef);
  }

  const calendario = MESES.map((nombreMes, i) => {
    const mes = String(i + 1).padStart(2, '0');
    const dias = (porMes[mes] || []).sort((a, b) => a.nombre.localeCompare(b.nombre));
    return `<section class="mes">
      <h2 class="mes-titulo">${nombreMes}<span class="mes-cuenta">${dias.length}</span></h2>
      ${dias.length ? `<ul class="mes-dias">${dias.map(d => {
        const num = Number(d.nombre.split('-')[1]);
        const primera = (d.capas || [])[0];
        return `<li><a href="/efemerides/${esc(d.nombre)}/">
          <span class="mes-dia">${num}</span>
          <span class="mes-glosa">${esc(primera ? `${primera.anio} · ${String(primera.texto).slice(0, 70)}…` : '')}</span>
        </a></li>`;
      }).join('')}</ul>` : '<p class="mes-vacio">Sin hojas todavía.</p>'}
    </section>`;
  }).join('');

  escribir('efemerides/index.html', pagina({
    titulo: 'Efemérides',
    descripcion: 'Calendario perpetuo de Morelos: un día, una hoja que crece cada año.',
    canonica: '/efemerides/',
    cuerpo: `
<section class="encabezado-seccion">
  <div class="marco">
    <p class="eyebrow">Calendario perpetuo</p>
    <h1>366 hojas, una por día</h1>
    <p class="entrada">Una hoja no se publica y se archiva: se abre una vez y
    se enriquece cada año. Cuando aparece un dato nuevo sobre el 28 de julio,
    se suma a la hoja del 28 de julio, junto a lo que ya estaba.
    Llevamos <strong>${efemerides.length} de 366</strong>.</p>
  </div>
</section>
<div class="marco calendario">${calendario}</div>`,
  }));

  for (const ef of efemerides) {
    const [mes, dia] = ef.nombre.split('-');
    escribir(`efemerides/${ef.nombre}/index.html`, pagina({
      titulo: `${Number(dia)} de ${MESES[Number(mes) - 1]}`,
      descripcion: (ef.capas || []).map(c => `${c.anio}: ${c.texto}`).join(' ').slice(0, 180),
      canonica: `/efemerides/${ef.nombre}/`,
      clase: 'pagina-hoja',
      cuerpo: `<div class="marco columna">
        ${hojaEfemeride(ef, { enlace: false })}
        ${ef.fuentes && ef.fuentes.length ? `
        <section class="fuentes">
          <h2>Fuentes</h2>
          <ol>${ef.fuentes.map(f => `<li>${enLinea(f)}</li>`).join('')}</ol>
        </section>` : ''}
        <p class="volver"><a href="/efemerides/">Volver al calendario</a></p>
      </div>`,
    }));
  }
}

/* ---------- crónicas -------------------------------------------- */

function construirCronicas() {
  escribir('cronicas/index.html', pagina({
    titulo: 'Crónicas',
    canonica: '/cronicas/',
    cuerpo: `
<section class="encabezado-seccion">
  <div class="marco">
    <p class="eyebrow">Todas las piezas</p>
    <h1>Crónicas</h1>
    <p class="entrada">Crónica documentada, testimonio oral, ficha de acervo,
    toponimia y obituario. Cada pieza indica de qué tipo es, porque no se leen
    igual un documento y un recuerdo.</p>
  </div>
</section>
<div class="marco"><div class="rejilla">${cronicas.map(tarjetaCronica).join('')}</div></div>`,
  }));

  for (const c of cronicas) {
    const sec = SECCIONES[c.seccion] || SECCIONES.cronica;
    const autor = autorPorSlug[c.autor];
    escribir(`cronicas/${c.nombre}/index.html`, pagina({
      titulo: c.titulo,
      descripcion: c.resumen,
      canonica: `/cronicas/${c.nombre}/`,
      clase: 'pagina-pieza',
      cuerpo: `
<article class="pieza">
  <header class="pieza-cabeza marco columna">
    <div class="tarjeta-meta">
      <span class="etiqueta etiqueta--${sec.color}">${esc(sec.nombre)}</span>
      <span class="folio">${esc(folio(c))}</span>
    </div>
    <h1>${esc(c.titulo)}</h1>
    ${c.resumen ? `<p class="entrada">${esc(c.resumen)}</p>` : ''}
    <p class="pieza-firma">
      ${autor ? `<a href="/cronistas/${esc(autor.nombre)}/">${esc(autor.titulo)}</a>` : esc(c.autor || '')}
      ${c.lugar ? ` · ${esc(c.lugar)}` : ''}
      · <time datetime="${esc(c.fecha)}">${esc(fechaLarga(c.fecha))}</time>
    </p>
  </header>
  <div class="pieza-cuerpo marco columna">${markdown(c.cuerpo)}</div>
  ${c.fuentes && c.fuentes.length ? `
  <section class="fuentes marco columna">
    <h2>Fuentes</h2>
    <ol>${c.fuentes.map(f => `<li>${enLinea(f)}</li>`).join('')}</ol>
  </section>` : ''}
  <footer class="pieza-pie marco columna">
    <p>Publicado el ${esc(fechaLarga(c.fecha))} con el folio
    <span class="folio">${esc(folio(c))}</span>. Esta dirección es permanente.
    Si detectas un error, escríbenos: la corrección se publica al pie y no se
    borra lo corregido.</p>
  </footer>
</article>`,
    }));
  }
}

/* ---------- archivo por año ------------------------------------- */

function construirArchivo() {
  const porAnio = {};
  for (const c of cronicas) {
    const anio = String(c.fecha).slice(0, 4);
    (porAnio[anio] = porAnio[anio] || []).push(c);
  }
  const anios = Object.keys(porAnio).sort().reverse();

  escribir('archivo/index.html', pagina({
    titulo: 'Archivo',
    canonica: '/archivo/',
    cuerpo: `
<section class="encabezado-seccion">
  <div class="marco">
    <p class="eyebrow">Todo lo publicado</p>
    <h1>Archivo</h1>
    <p class="entrada">Ordenado por año de publicación. Nada de lo que aparece
    aquí se retira: si una pieza se corrige, la corrección se añade al pie y
    la dirección sigue funcionando.</p>
  </div>
</section>
<div class="marco columna">
${anios.map(anio => `
  <section class="anio">
    <h2 class="anio-titulo">${anio}<span class="anio-cuenta">${porAnio[anio].length} piezas</span></h2>
    <ul class="anio-lista">
      ${porAnio[anio].map(c => `<li>
        <span class="folio">${esc(folio(c))}</span>
        <a href="/cronicas/${esc(c.nombre)}/">${esc(c.titulo)}</a>
        <span class="anio-seccion">${esc((SECCIONES[c.seccion] || SECCIONES.cronica).nombre)}</span>
      </li>`).join('')}
    </ul>
  </section>`).join('')}
</div>`,
  }));
}

/* ---------- cronistas ------------------------------------------- */

function construirCronistas() {
  escribir('cronistas/index.html', pagina({
    titulo: 'Cronistas',
    canonica: '/cronistas/',
    cuerpo: `
<section class="encabezado-seccion">
  <div class="marco">
    <p class="eyebrow">Quién escribe</p>
    <h1>Cronistas</h1>
    <p class="entrada">En crónica la firma no es un trámite: lo que se lee es
    una voz. Cada cronista responde por sus fuentes.</p>
  </div>
</section>
<div class="marco"><div class="rejilla">
${autores.map(a => `<article class="tarjeta">
  <h3 class="tarjeta-titulo"><a href="/cronistas/${esc(a.nombre)}/">${esc(a.titulo)}</a></h3>
  <p class="tarjeta-resumen">${esc(a.semblanza || '')}</p>
  <p class="tarjeta-pie">${cronicas.filter(c => c.autor === a.nombre).length} piezas${a.municipio ? ` · ${esc(a.municipio)}` : ''}</p>
</article>`).join('')}
</div></div>`,
  }));

  for (const a of autores) {
    const suyas = cronicas.filter(c => c.autor === a.nombre);
    escribir(`cronistas/${a.nombre}/index.html`, pagina({
      titulo: a.titulo,
      canonica: `/cronistas/${a.nombre}/`,
      cuerpo: `
<section class="encabezado-seccion">
  <div class="marco columna">
    <p class="eyebrow">Cronista${a.municipio ? ` · ${esc(a.municipio)}` : ''}</p>
    <h1>${esc(a.titulo)}</h1>
    <p class="entrada">${esc(a.semblanza || '')}</p>
  </div>
</section>
<div class="marco"><div class="rejilla">${suyas.map(tarjetaCronica).join('')}</div></div>`,
    }));
  }
}

/* ---------- buscador (índice JSON + página) --------------------- */

function construirBuscador() {
  const indice = [
    ...cronicas.map(c => ({
      t: c.titulo, u: `/cronicas/${c.nombre}/`, k: 'Crónica',
      f: c.fecha, r: c.resumen || '',
      c: (c.cuerpo || '').replace(/[#*>\[\]()]/g, ' ').slice(0, 1200),
    })),
    ...efemerides.map(e => {
      const [m, d] = e.nombre.split('-');
      return {
        t: `${Number(d)} de ${MESES[Number(m) - 1]}`, u: `/efemerides/${e.nombre}/`,
        k: 'Efeméride', f: e.actualizado || '',
        r: (e.capas || []).map(x => `${x.anio}: ${x.texto}`).join(' ').slice(0, 220),
        c: (e.capas || []).map(x => `${x.ambito} ${x.anio} ${x.texto}`).join(' '),
      };
    }),
  ];
  escribir('indice-busqueda.json', JSON.stringify(indice));

  escribir('buscar/index.html', pagina({
    titulo: 'Buscar',
    canonica: '/buscar/',
    cuerpo: `
<section class="encabezado-seccion">
  <div class="marco columna">
    <p class="eyebrow">Todo el acervo</p>
    <h1>Buscar</h1>
    <p class="entrada">Busca por lugar, apellido, oficio, año o palabra suelta.
    Se busca dentro del texto completo de cada pieza.</p>
    <label class="buscador">
      <span class="buscador-etiqueta">Palabra o frase</span>
      <input type="search" id="q" placeholder="hacienda, apantle, 1914, Galeana…" autofocus>
    </label>
    <p class="buscador-estado" id="estado">Escribe para empezar.</p>
  </div>
</section>
<div class="marco"><div class="rejilla" id="resultados"></div></div>
<script>
(function () {
  var datos = [], q = document.getElementById('q');
  var caja = document.getElementById('resultados'), estado = document.getElementById('estado');
  fetch('/indice-busqueda.json').then(function (r) { return r.json(); })
    .then(function (d) { datos = d; estado.textContent = d.length + ' piezas listas para buscar.'; })
    .catch(function () { estado.textContent = 'No se pudo cargar el índice. Recarga la página.'; });

  function normal(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  }
  function buscar() {
    var t = normal(q.value.trim());
    if (t.length < 2) { caja.innerHTML = ''; estado.textContent = 'Escribe al menos dos letras.'; return; }
    var res = datos.filter(function (x) {
      return normal(x.t + ' ' + x.r + ' ' + x.c).indexOf(t) !== -1;
    }).slice(0, 40);
    estado.textContent = res.length ? res.length + ' resultados para “' + q.value.trim() + '”.'
      : 'Sin resultados. Prueba con una palabra más corta o un año.';
    caja.innerHTML = res.map(function (x) {
      return '<article class="tarjeta"><div class="tarjeta-meta"><span class="etiqueta">' + x.k +
        '</span></div><h3 class="tarjeta-titulo"><a href="' + x.u + '">' + x.t +
        '</a></h3><p class="tarjeta-resumen">' + x.r + '</p></article>';
    }).join('');
  }
  q.addEventListener('input', buscar);
})();
</script>`,
  }));
}



/* ---------- colaborar y pistas por confirmar -------------------- */

function construirColaborar() {
  escribir('colaborar/index.html', pagina({
    titulo: 'Colaborar',
    descripcion: 'Cómo enviar una crónica, una fotografía o un documento al archivo de Amate.',
    canonica: '/colaborar/',
    cuerpo: `
<section class="encabezado-seccion">
  <div class="marco columna">
    <p class="eyebrow">Para cronistas y vecinos</p>
    <h1>Cómo enviar tu material</h1>
    <p class="entrada">Este archivo se hace entre todos. Si tienes una crónica
    escrita, una fotografía antigua, un plano, un contrato de hacienda o la
    grabación de alguien que recuerda el pueblo de antes, aquí es donde llega.</p>
  </div>
</section>

<div class="marco columna">
  <p class="correo-caja">
    <span class="correo-etiqueta">Escríbenos a</span>
    <a class="correo-dir" href="mailto:${SITIO.correo}?subject=Colaboraci%C3%B3n%20para%20Amate">${SITIO.correo}</a>
  </p>

  <h2>Qué incluir en el correo</h2>
  <ol class="lista-envio">
    <li><strong>El texto o el archivo.</strong> Si es fotografía o documento,
    escanéalo lo más grande que puedas. Vale más una foto de celular bien
    iluminada que un escaneo chico.</li>
    <li><strong>De dónde salió.</strong> Quién la tomó o dónde apareció, si se
    sabe. Un "era de mi abuela, vivía en el barrio de Santo Domingo" es
    procedencia válida y suficiente.</li>
    <li><strong>Cómo quieres aparecer.</strong> Con tu nombre completo, con
    iniciales o de forma anónima. Tú decides.</li>
    <li><strong>Tu autorización para publicarla.</strong> Basta una línea en el
    cuerpo del correo diciendo que autorizas su publicación en el portal.</li>
  </ol>

  <h2>Qué pasa después</h2>
  <p>El consejo editorial revisa el material y lo clasifica. Si es un documento
  se publica como <em>acervo</em>, con su ficha. Si es un recuerdo se publica
  como <em>testimonio</em>, con la fecha de la entrevista. Si es una narración
  con fuentes se publica como <em>crónica</em>. Esa etiqueta le dice al lector
  qué tan cierto es lo que está leyendo, y por eso no se pone al azar.</p>

  <p>Si el material necesita verificación y no la resiste, te lo decimos y te
  explicamos por qué. No se publica nada sin comprobar, ni se descarta nada sin
  avisar.</p>

  <h2>Lo que pasa con tus derechos</h2>
  <p><strong>El original se queda contigo.</strong> El portal sólo publica una
  copia digital. Las fotografías de acervo familiar conservan los derechos de
  quien las aporta: no se ceden al portal ni pasan a dominio público por
  publicarse aquí.</p>
  <p>Los textos del portal se publican bajo licencia ${SITIO.licencia}, que
  permite reproducirlos citando al autor y al portal. Si prefieres otras
  condiciones para tu material, dilo en el correo y lo respetamos.</p>

  <h2>Una petición</h2>
  <p>Si la persona que recuerda es mayor, <strong>graba la conversación</strong>
  aunque no la transcribas. Un audio de teléfono basta. Es lo primero que se
  pierde cuando alguien se va, y no hay forma de recuperarlo después.</p>
</div>`,
  }));
}

function construirPistas() {
  if (!pistas.length) return;

  const items = pistas.flatMap(p =>
    (p.pendientes || []).map(x => ({ ...x, dia: p.nombre }))
  );
  if (!items.length) return;

  escribir('pistas/index.html', pagina({
    titulo: 'Pistas por confirmar',
    descripcion: 'Hallazgos que no resistieron la verificación y esperan comprobación documental.',
    canonica: '/pistas/',
    cuerpo: `
<section class="encabezado-seccion">
  <div class="marco columna">
    <p class="eyebrow">Material de trabajo</p>
    <h1>Pistas por confirmar</h1>
    <p class="entrada"><strong>Nada de esta página está publicado como cierto.</strong>
    Son hallazgos que no resistieron la verificación: la fuente no se pudo
    corroborar de forma independiente, o el dato se contradice con otras
    fuentes. Se conservan porque una pista mala puede llevar a un documento
    bueno, y porque tirarlas equivaldría a repetir la búsqueda cada año.</p>
    <p class="entrada">Si confirmas alguna contra un documento de archivo,
    escribe a <a href="mailto:${SITIO.correo}">${SITIO.correo}</a> y pasa a la
    hoja del día como capa verificada.</p>
  </div>
</section>
<div class="marco columna">
  ${items.map(x => {
    const [m, d] = x.dia.split('-');
    return `<article class="pista">
      <p class="pista-fecha"><a href="/efemerides/${esc(x.dia)}/">${Number(d)} de ${MESES[Number(m) - 1]}</a>
      ${x.anio ? ` · ${esc(x.anio)}` : ''} ${x.ambito ? ` · ${esc(x.ambito)}` : ''}</p>
      <p class="pista-texto">${enLinea(x.texto || '')}</p>
      <p class="pista-motivo"><span class="pista-etiqueta">Por qué no se publicó</span>
      ${enLinea(x.motivo || '')}</p>
    </article>`;
  }).join('')}
</div>`,
  }));
}

/* ---------- boletín diario en texto plano ----------------------
   Un archivo por día, servido como estático. Un bot puede pedir
   https://amate.mx/boletin/07-28.txt y publicarlo sin API ni servidor.
   ---------------------------------------------------------------- */

function construirBoletin() {
  for (const ef of efemerides) {
    const [mes, dia] = ef.nombre.split('-');
    // Todo sale al boletín, incluido lo no confirmado. Como en un canal de
    // difusión el párrafo se lee suelto, la marca va DENTRO del texto y no
    // como nota aparte: así no se puede separar de la afirmación.
    const capas = (ef.capas || []).map(c => {
      if (c.confianza !== 'sin_confirmar') {
        return `${c.ambito}, ${c.anio}\n${c.texto}`;
      }
      return `${c.ambito}, ${c.anio} — SIN CONFIRMAR\n${c.texto}\n` +
             `(Dato no corroborado. ${c.motivo || 'Sin corroboración independiente.'})`;
    }).join('\n\n');
    if (!capas.trim()) continue;
    const texto =
`AMATE · Crónicas de Morelos
Hoy, ${Number(dia)} de ${MESES[Number(mes) - 1]}

${capas}

Hoja completa: ${SITIO.url}/efemerides/${ef.nombre}/
`;
    escribir(`boletin/${ef.nombre}.txt`, texto);
  }

  // Índice para que un agente sepa qué días faltan por documentar.
  const cubiertos = new Set(efemerides.map(e => e.nombre));
  const faltantes = [];
  for (let m = 1; m <= 12; m++) {
    const dias = new Date(2024, m, 0).getDate(); // 2024 es bisiesto
    for (let d = 1; d <= dias; d++) {
      const clave = String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      if (!cubiertos.has(clave)) faltantes.push(clave);
    }
  }
  escribir('estado-archivo.json', JSON.stringify({
    generado: new Date().toISOString(),
    hojas: efemerides.length,
    faltantes,
    piezas: cronicas.length,
  }, null, 2));
}

/* ---------- RSS y 404 ------------------------------------------- */

function construirExtras() {
  const items = cronicas.slice(0, 30).map(c => `  <item>
    <title>${esc(c.titulo)}</title>
    <link>${SITIO.url}/cronicas/${c.nombre}/</link>
    <guid isPermaLink="true">${SITIO.url}/cronicas/${c.nombre}/</guid>
    <pubDate>${new Date(c.fecha + 'T08:00:00-06:00').toUTCString()}</pubDate>
    <description>${esc(c.resumen || '')}</description>
  </item>`).join('\n');

  escribir('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${SITIO.nombre}. ${SITIO.lema}</title>
  <link>${SITIO.url}</link>
  <description>${esc(SITIO.descripcion)}</description>
  <language>es-mx</language>
${items}
</channel></rss>`);

  const urls = [
    '/', '/efemerides/', '/cronicas/', '/archivo/', '/cronistas/', '/buscar/',
    ...efemerides.map(e => `/efemerides/${e.nombre}/`),
    ...cronicas.map(c => `/cronicas/${c.nombre}/`),
    ...autores.map(a => `/cronistas/${a.nombre}/`),
  ];
  escribir('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `<url><loc>${SITIO.url}${u}</loc></url>`).join('\n')}
</urlset>`);

  escribir('robots.txt', SITIO.provisional
    ? `# Dirección provisional: no indexar todavía.\nUser-agent: *\nDisallow: /\n`
    : `User-agent: *\nAllow: /\nSitemap: ${SITIO.url}/sitemap.xml\n`);

  escribir('404.html', pagina({
    titulo: 'Página no encontrada',
    cuerpo: `<div class="marco columna vacio">
      <p class="eyebrow">Error 404</p>
      <h1>Esta dirección no existe</h1>
      <p class="entrada">Ninguna pieza publicada en Amate cambia de dirección,
      así que este enlace nunca existió o está mal escrito.
      Busca la pieza por su nombre o revisa el archivo completo.</p>
      <p><a href="/buscar/">Buscar en el acervo</a> · <a href="/archivo/">Ver el archivo</a></p>
    </div>`,
  }));
}

/* ---------- ejecución ------------------------------------------- */

fs.rmSync(SALIDA, { recursive: true, force: true });
fs.mkdirSync(SALIDA, { recursive: true });

construirPortada();
construirEfemerides();
construirCronicas();
construirArchivo();
construirCronistas();
construirBuscador();
construirColaborar();
construirPistas();
construirBoletin();
construirExtras();

copiarDir(ESTATICO, SALIDA);
copiarDir(ADMIN, path.join(SALIDA, 'admin'));

console.log(`Amate construido.
  ${efemerides.length} hojas de efeméride
  ${cronicas.length} piezas
  ${autores.length} cronistas
  → ${path.relative(RAIZ, SALIDA)}/`);
