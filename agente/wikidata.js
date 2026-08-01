/* ---------------------------------------------------------------
   Amate · motor de efemérides sobre Wikidata
   Sin modelo de lenguaje, sin llave de API, sin costo.

   Por qué: una efeméride es un dato estructurado, no una redacción.
   Wikidata lo tiene con identificador permanente y referencias, así
   que la alucinación deja de ser posible: no hay nada que inventar,
   hay una consulta. Cada capa queda ligada a su QID y cualquiera
   puede abrirla y comprobarla.

   Uso:
     node agente/wikidata.js            → la fecha de mañana
     node agente/wikidata.js 07-30      → una fecha concreta
     node agente/wikidata.js --diagnostico
   --------------------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const { leerFrontMatter, escribirFrontMatter } = require('../lib/frontmatter');

const ENDPOINT = 'https://query.wikidata.org/sparql';

/* Wikidata pide un agente de usuario identificable. No lo quites. */
const AGENTE = 'AmateCronicasMorelos/1.0 (https://amatecronicas.netlify.app)';

const ANIO_LIMITE = 1990;
const MAX_POR_AMBITO = { Morelos: 3, 'México': 2, Mundo: 2 };

/* Identificadores. Si alguno estuviera mal, el modo diagnóstico lo
   detecta comparando la etiqueta antes de escribir nada. */
const QID = {
  morelos: 'Q66117',   // estado de Morelos (verificado por etiqueta al arrancar)
  mexico:  'Q96',      // México
};

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
  'agosto','septiembre','octubre','noviembre','diciembre'];

const raiz = path.join(__dirname, '..');
const registro = [];
const log = m => { console.log(m); registro.push(m); };

/* ---- consulta ---------------------------------------------------- */

async function sparql(consulta) {
  const url = `${ENDPOINT}?query=${encodeURIComponent(consulta)}&format=json`;
  const r = await fetch(url, {
    headers: { 'Accept': 'application/sparql-results+json', 'User-Agent': AGENTE },
  });
  if (!r.ok) throw new Error(`Wikidata respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return d.results.bindings.map(f => {
    const o = {};
    for (const [k, v] of Object.entries(f)) o[k] = v.value;
    return o;
  });
}

/* Filtro de precisión: Wikidata guarda fechas con precisión declarada.
   Una fecha con precisión de año se almacena como 1914-01-01, así que sin
   este filtro toda persona con año conocido aparecería un 1 de enero.
   La precisión 11 es "día". */
const PRECISION_DIA = `?nodo wikibase:timePrecision ?prec . FILTER(?prec >= 11)`;

function consultaNacimientos(mes, dia, lugarQID) {
  return `
SELECT ?item ?itemLabel ?fecha ?lugarLabel ?ocupacionLabel ?enlaces ?imagen WHERE {
  ?item p:P569/psv:P569 ?nodo .
  ?nodo wikibase:timeValue ?fecha .
  ${PRECISION_DIA}
  FILTER(MONTH(?fecha) = ${mes} && DAY(?fecha) = ${dia})
  FILTER(YEAR(?fecha) < ${ANIO_LIMITE})
  ?item wdt:P19 ?lugar .
  ?lugar wdt:P131* wd:${lugarQID} .
  ?item wikibase:sitelinks ?enlaces .
  OPTIONAL { ?item wdt:P18 ?imagen . }
  OPTIONAL { ?item wdt:P106 ?ocupacion . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}
ORDER BY DESC(?enlaces)
LIMIT 12`;
}

function consultaDefunciones(mes, dia, lugarQID) {
  return `
SELECT ?item ?itemLabel ?fecha ?lugarLabel ?ocupacionLabel ?enlaces ?imagen WHERE {
  ?item p:P570/psv:P570 ?nodo .
  ?nodo wikibase:timeValue ?fecha .
  ${PRECISION_DIA}
  FILTER(MONTH(?fecha) = ${mes} && DAY(?fecha) = ${dia})
  FILTER(YEAR(?fecha) < ${ANIO_LIMITE})
  ?item wdt:P20 ?lugar .
  ?lugar wdt:P131* wd:${lugarQID} .
  ?item wikibase:sitelinks ?enlaces .
  OPTIONAL { ?item wdt:P18 ?imagen . }
  OPTIONAL { ?item wdt:P106 ?ocupacion . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}
ORDER BY DESC(?enlaces)
LIMIT 12`;
}

/* Hechos con fecha puntual (P585) o de fundación (P571) situados en el
   territorio: batallas, fundaciones, inauguraciones, decretos. */
function consultaHechos(mes, dia, lugarQID) {
  return `
SELECT ?item ?itemLabel ?fecha ?tipoLabel ?lugarLabel ?enlaces ?imagen WHERE {
  { ?item p:P585/psv:P585 ?nodo . } UNION { ?item p:P571/psv:P571 ?nodo . }
  ?nodo wikibase:timeValue ?fecha .
  ${PRECISION_DIA}
  FILTER(MONTH(?fecha) = ${mes} && DAY(?fecha) = ${dia})
  FILTER(YEAR(?fecha) < ${ANIO_LIMITE})
  { ?item wdt:P276 ?lugar . } UNION { ?item wdt:P131 ?lugar . }
  ?lugar wdt:P131* wd:${lugarQID} .
  ?item wikibase:sitelinks ?enlaces .
  OPTIONAL { ?item wdt:P18 ?imagen . }
  OPTIONAL { ?item wdt:P31 ?tipo . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}
ORDER BY DESC(?enlaces)
LIMIT 12`;
}

/* Para el ámbito Mundo no se filtra por lugar: se ordena por número de
   enlaces entre wikipedias, que es el mejor indicador disponible de
   notabilidad y evita que salga un futbolista de tercera división. */
function consultaMundoMuertes(mes, dia) {
  return `
SELECT ?item ?itemLabel ?fecha ?ocupacionLabel ?enlaces ?imagen WHERE {
  ?item p:P570/psv:P570 ?nodo .
  ?nodo wikibase:timeValue ?fecha .
  ${PRECISION_DIA}
  FILTER(MONTH(?fecha) = ${mes} && DAY(?fecha) = ${dia})
  FILTER(YEAR(?fecha) < ${ANIO_LIMITE})
  ?item wikibase:sitelinks ?enlaces .
  OPTIONAL { ?item wdt:P18 ?imagen . }
  FILTER(?enlaces > 60)
  OPTIONAL { ?item wdt:P106 ?ocupacion . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}
ORDER BY DESC(?enlaces)
LIMIT 8`;
}

function consultaMundoHechos(mes, dia) {
  return `
SELECT ?item ?itemLabel ?fecha ?tipoLabel ?enlaces ?imagen WHERE {
  ?item p:P585/psv:P585 ?nodo .
  ?nodo wikibase:timeValue ?fecha .
  ${PRECISION_DIA}
  FILTER(MONTH(?fecha) = ${mes} && DAY(?fecha) = ${dia})
  FILTER(YEAR(?fecha) < ${ANIO_LIMITE})
  ?item wikibase:sitelinks ?enlaces .
  OPTIONAL { ?item wdt:P18 ?imagen . }
  FILTER(?enlaces > 25)
  OPTIONAL { ?item wdt:P31 ?tipo . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}
ORDER BY DESC(?enlaces)
LIMIT 8`;
}

/* ---- redacción por plantilla ------------------------------------- */
/* Sin modelo: se arma la oración con los campos. Sale sobrio, que es
   justo el tono del portal, y no puede inventar nada. */

const anio = f => String(f).slice(0, 4).replace(/^0+/, '');

function fraseNacimiento(r) {
  const oficio = r.ocupacionLabel && !/^Q\d+$/.test(r.ocupacionLabel)
    ? `, ${r.ocupacionLabel}` : '';
  const lugar = r.lugarLabel && !/^Q\d+$/.test(r.lugarLabel)
    ? ` en ${r.lugarLabel}` : '';
  return `Nace${lugar} ${r.itemLabel}${oficio}.`;
}

function fraseDefuncion(r) {
  const oficio = r.ocupacionLabel && !/^Q\d+$/.test(r.ocupacionLabel)
    ? `, ${r.ocupacionLabel},` : '';
  const lugar = r.lugarLabel && !/^Q\d+$/.test(r.lugarLabel)
    ? ` en ${r.lugarLabel}` : '';
  return `Muere${lugar} ${r.itemLabel}${oficio}.`.replace(/,\.$/, '.');
}

/* Tipos que no aportan nada colgados de un nombre: "Otto von Bismarck
   (ser humano)" es peor que "Otto von Bismarck". */
const TIPOS_VACIOS = new Set([
  'ser humano', 'human', 'humano', 'persona', 'hombre', 'mujer',
  'entidad', 'elemento', 'suceso', 'evento',
]);

function fraseHecho(r) {
  const t = (r.tipoLabel || '').toLowerCase();
  const tipo = r.tipoLabel && !/^Q\d+$/.test(r.tipoLabel) && !TIPOS_VACIOS.has(t)
    ? ` (${r.tipoLabel})` : '';
  const lugar = r.lugarLabel && !/^Q\d+$/.test(r.lugarLabel) ? `, en ${r.lugarLabel}` : '';
  return `${r.itemLabel}${tipo}${lugar}.`;
}

function qid(uri) {
  const m = String(uri).match(/Q\d+$/);
  return m ? m[0] : null;
}

function aCapa(r, ambito, frase) {
  const q = qid(r.item);
  if (!q || !r.itemLabel || /^Q\d+$/.test(r.itemLabel)) return null;
  return {
    ambito,
    anio: anio(r.fecha),
    texto: frase(r),
    fuente: `https://www.wikidata.org/wiki/${q}`,
    verificacion: 'wikidata',
    qid: q,
    enlaces: String(r.enlaces || ''),
    precision: 'dia',
    publicada: new Date().toISOString().slice(0, 10),
  };
}


/* ---- ficha de la imagen en Commons ------------------------------- */
/* Wikidata da el archivo; Commons da el autor y la licencia. Sin esos
   dos datos la imagen no se publica: en un archivo, una fotografía sin
   procedencia declarada es un problema esperando turno. */

function archivoDeURL(url) {
  const m = String(url).match(/Special:FilePath\/(.+)$/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]).replace(/_/g, ' '); }
  catch { return m[1].replace(/_/g, ' '); }
}

function limpiaHTML(t) {
  return String(t || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function fichaCommons(archivo) {
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    '&prop=imageinfo&iiprop=extmetadata&titles=' +
    encodeURIComponent('File:' + archivo);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': AGENTE } });
    if (!r.ok) return null;
    const d = await r.json();
    const paginas = d.query && d.query.pages ? Object.values(d.query.pages) : [];
    const info = paginas[0] && paginas[0].imageinfo && paginas[0].imageinfo[0];
    const m = info && info.extmetadata;
    if (!m) return null;
    const autor = limpiaHTML(m.Artist && m.Artist.value);
    const licencia = limpiaHTML(m.LicenseShortName && m.LicenseShortName.value);
    if (!licencia) return null;   // sin licencia declarada, no se usa
    return {
      archivo, origen: 'commons',
      autor: autor || 'Autor no identificado',
      fecha: limpiaHTML(m.DateTimeOriginal && m.DateTimeOriginal.value).slice(0, 40),
      licencia,
    };
  } catch { return null; }
}

/* ---- buscar identificadores ------------------------------------- */
/* Evita volver a adivinar un QID: `node agente/wikidata.js --buscar Cuautla`
   lista los candidatos con su descripción para escoger el correcto. */

async function buscar(texto) {
  const r = await sparql(`SELECT ?item ?itemLabel ?itemDescription ?enlaces WHERE {
    ?item rdfs:label ?etiqueta .
    FILTER(LANG(?etiqueta) = "es" && LCASE(STR(?etiqueta)) = LCASE("${texto}"))
    ?item wikibase:sitelinks ?enlaces .
  OPTIONAL { ?item wdt:P18 ?imagen . }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
  } ORDER BY DESC(?enlaces) LIMIT 15`);
  if (!r.length) return log(`Sin resultados para "${texto}".`);
  log(`Candidatos para "${texto}" (más enlazados primero):`);
  for (const f of r) {
    log(`  ${qid(f.item)}  ${f.itemLabel}  —  ${f.itemDescription || '(sin descripción)'}  [${f.enlaces} wikis]`);
  }
}

/* ---- diagnóstico -------------------------------------------------- */

async function diagnostico() {
  log('Comprobando el endpoint y los identificadores...');
  for (const [nombre, q] of Object.entries(QID)) {
    const r = await sparql(`SELECT ?etiqueta WHERE {
      wd:${q} rdfs:label ?etiqueta . FILTER(LANG(?etiqueta) = "es") } LIMIT 1`);
    const etiqueta = r[0] ? r[0].etiqueta : '(sin etiqueta)';
    log(`  ${q} → "${etiqueta}"  [esperado: ${nombre}]`);
  }
  log('Si alguna etiqueta no corresponde, corrige el QID en agente/wikidata.js.');
}

/* ---- ejecución ---------------------------------------------------- */

function diaObjetivo() {
  const arg = process.argv[2];
  if (arg && /^\d{2}-\d{2}$/.test(arg)) return arg;
  const f = new Date(Date.now() + 24 * 3600 * 1000);
  return String(f.getUTCMonth() + 1).padStart(2, '0') + '-' +
         String(f.getUTCDate()).padStart(2, '0');
}

async function principal() {
  if (process.argv.includes('--diagnostico')) return diagnostico();

  const iBuscar = process.argv.indexOf('--buscar');
  if (iBuscar !== -1) return buscar(process.argv.slice(iBuscar + 1).join(' '));

  // Falla ruidosa: si el identificador del estado no es el correcto, todas
  // las consultas locales devuelven cero y parece un problema de cobertura.
  // Ya pasó una vez. Se comprueba antes de consultar nada.
  const etiqueta = await sparql(`SELECT ?e WHERE {
    wd:${QID.morelos} rdfs:label ?e . FILTER(LANG(?e) = "es") } LIMIT 1`);
  const nombre = etiqueta[0] ? etiqueta[0].e : '';
  if (!/morelos/i.test(nombre)) {
    throw new Error(
      `El identificador ${QID.morelos} corresponde a "${nombre}", no a Morelos. ` +
      `Corrígelo en agente/wikidata.js. Para encontrarlo: node agente/wikidata.js --buscar Morelos`);
  }
  log(`Identificador de Morelos comprobado: ${QID.morelos} → "${nombre}".`);

  const dia = diaObjetivo();
  const [mm, dd] = dia.split('-');
  const mes = Number(mm), num = Number(dd);
  log(`Día ${dia} (${num} de ${MESES[mes - 1]}).`);

  const ruta = path.join(raiz, 'contenido', 'efemerides', `${dia}.md`);
  let previo = { datos: {}, cuerpo: '' };
  if (fs.existsSync(ruta)) previo = leerFrontMatter(fs.readFileSync(ruta, 'utf8'));
  const capasPrevias = previo.datos.capas || [];
  const yaEstan = new Set(capasPrevias.map(c => c.qid).filter(Boolean));
  log(`Capas ya publicadas: ${capasPrevias.length}.`);

  const nuevas = [];

  const agregar = (filas, ambito, frase) => {
    let puestas = 0;
    for (const f of filas) {
      if (puestas >= MAX_POR_AMBITO[ambito]) break;
      const c = aCapa(f, ambito, frase);
      if (!c || yaEstan.has(c.qid)) continue;
      yaEstan.add(c.qid);
      c._imagenPendiente = f.imagen || null;
      nuevas.push(c);
      puestas++;
      log(`  + ${ambito} ${c.anio}: ${c.texto.slice(0, 70)} [${c.qid}]`);
    }
  };

  // Morelos primero: es lo que da valor al portal.
  for (const [etiqueta, consulta, frase] of [
    ['nacimientos', consultaNacimientos, fraseNacimiento],
    ['defunciones', consultaDefunciones, fraseDefuncion],
    ['hechos',      consultaHechos,      fraseHecho],
  ]) {
    try {
      const filas = await sparql(consulta(mes, num, QID.morelos));
      log(`Morelos · ${etiqueta}: ${filas.length} resultados.`);
      agregar(filas, 'Morelos', frase);
    } catch (e) { log(`Morelos · ${etiqueta} falló: ${e.message}`); }
  }

  // México
  for (const [etiqueta, consulta, frase] of [
    ['hechos',      consultaHechos,      fraseHecho],
    ['defunciones', consultaDefunciones, fraseDefuncion],
  ]) {
    try {
      const filas = await sparql(consulta(mes, num, QID.mexico));
      log(`México · ${etiqueta}: ${filas.length} resultados.`);
      agregar(filas, 'México', frase);
    } catch (e) { log(`México · ${etiqueta} falló: ${e.message}`); }
  }

  // Mundo
  for (const [etiqueta, consulta, frase] of [
    ['hechos',      consultaMundoHechos,  fraseHecho],
    ['defunciones', consultaMundoMuertes, fraseDefuncion],
  ]) {
    try {
      const filas = await sparql(consulta(mes, num));
      log(`Mundo · ${etiqueta}: ${filas.length} resultados.`);
      agregar(filas, 'Mundo', frase);
    } catch (e) { log(`Mundo · ${etiqueta} falló: ${e.message}`); }
  }

  if (!nuevas.length) {
    log('Sin capas nuevas. No se escribe nada.');
    return finalizar(dia, 0);
  }

  // Fotografías: sólo las que traigan licencia declarada en Commons.
  let conFoto = 0;
  for (const c of nuevas) {
    const archivo = c._imagenPendiente ? archivoDeURL(c._imagenPendiente) : null;
    delete c._imagenPendiente;
    if (!archivo) continue;
    const ficha = await fichaCommons(archivo);
    if (!ficha) { log(`  (sin licencia declarada: ${archivo})`); continue; }
    // Dentro de una capa la imagen va con claves planas: el front-matter
    // sólo admite un nivel de anidamiento y las capas ya son una lista.
    c.imagen_archivo = ficha.archivo;
    c.imagen_origen = 'commons';
    c.imagen_autor = ficha.autor;
    if (ficha.fecha) c.imagen_fecha = ficha.fecha;
    c.imagen_licencia = ficha.licencia;
    conFoto++;
    log(`  📷 ${c.ambito} ${c.anio}: ${archivo} — ${ficha.licencia}`);
  }
  log(`Fotografías adjuntadas: ${conFoto}.`);

  const orden = ['Cuautla', 'Morelos', 'México', 'Mundo'];
  const todas = [...capasPrevias, ...nuevas]
    .sort((a, b) => orden.indexOf(a.ambito) - orden.indexOf(b.ambito));

  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, escribirFrontMatter({
    dia,
    actualizado: new Date().toISOString().slice(0, 10),
    capas: todas,
    fuentes: [
      ...(previo.datos.fuentes || []),
      `Wikidata, consulta SPARQL del ${new Date().toISOString().slice(0, 10)}`,
    ],
  }, previo.cuerpo));

  const morelenses = nuevas.filter(c => c.ambito === 'Morelos').length;
  log(`Escritas ${nuevas.length} capas nuevas (${morelenses} de Morelos) en ${dia}.md`);
  finalizar(dia, nuevas.length, morelenses);
}

function finalizar(dia, publicadas, morelenses = 0) {
  fs.writeFileSync(path.join(raiz, 'resumen-wikidata.json'),
    JSON.stringify({ dia, publicadas, morelenses, registro }, null, 2));
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT,
      `publicadas=${publicadas}\ndia=${dia}\nmorelenses=${morelenses}\n`);
  }
}

principal().catch(e => {
  console.error('El motor de Wikidata falló:', e.message);
  process.exit(1);
});
