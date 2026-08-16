/* ---------------------------------------------------------------
   Amate · crónica diaria, solo Morelos, con reflexión
   Decisión editorial (agosto 2026): la hoja del día muestra UN SOLO
   hecho, y únicamente si es de Morelos. Sin respaldo a México/Mundo:
   si Wikidata no tiene nada morelense ese día, la hoja se queda vacía
   hasta que aparezca un dato real (falla cerrada).

   Paso 1 — Wikidata (sin costo): busca hecho verificable por SPARQL
            en Morelos.
   Paso 2 — con el hecho ya en la mano, un modelo de lenguaje redacta
            la reflexión: qué significa, qué enseñanza o valor se
            extrae, por qué importa hoy. El modelo NO inventa el
            hecho ni la fecha; sólo reflexiona sobre lo ya verificado.
   Paso 3 — si el hecho trae fotografía, se exige una reseña de la
            imagen. Sin reseña, no se publica la foto.

   Uso:  node agente/cronica-diaria.js
         node agente/cronica-diaria.js 08-05
   --------------------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const { leerFrontMatter, escribirFrontMatter } = require('../lib/frontmatter');
const { extraerJSON } = require('../lib/json');

const MODELO = 'claude-sonnet-4-6';
const ANIO_LIMITE = 1990;
const AGENTE_HTTP = 'AmateCronicasMorelos/1.0 (https://amatecronicas.netlify.app)';
const ENDPOINT_WD = 'https://query.wikidata.org/sparql';
const QID_MORELOS = 'Q66117';

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
  'agosto','septiembre','octubre','noviembre','diciembre'];

const raiz = path.join(__dirname, '..');
const registro = [];
const log = m => { console.log(m); registro.push(m); };

/* ---- Wikidata: mismo motor de consulta que agente/wikidata.js ---- */

async function sparql(consulta) {
  const url = `${ENDPOINT_WD}?query=${encodeURIComponent(consulta)}&format=json`;
  const r = await fetch(url, {
    headers: { 'Accept': 'application/sparql-results+json', 'User-Agent': AGENTE_HTTP },
  });
  if (!r.ok) throw new Error(`Wikidata respondió ${r.status}`);
  const d = await r.json();
  return d.results.bindings.map(f => {
    const o = {};
    for (const [k, v] of Object.entries(f)) o[k] = v.value;
    return o;
  });
}

const PRECISION_DIA = `?nodo wikibase:timePrecision ?prec . FILTER(?prec >= 11)`;

function consultaPersonas(propiedad, propLugar, mes, dia, lugarQID) {
  return `
SELECT ?item ?itemLabel ?fecha ?lugarLabel ?ocupacionLabel ?enlaces ?imagen WHERE {
  ?item p:${propiedad}/psv:${propiedad} ?nodo .
  ?nodo wikibase:timeValue ?fecha .
  ${PRECISION_DIA}
  FILTER(MONTH(?fecha) = ${mes} && DAY(?fecha) = ${dia})
  FILTER(YEAR(?fecha) < ${ANIO_LIMITE})
  ?item wdt:${propLugar} ?lugar .
  ?lugar wdt:P131* wd:${lugarQID} .
  ?item wikibase:sitelinks ?enlaces .
  OPTIONAL { ?item wdt:P18 ?imagen . }
  OPTIONAL { ?item wdt:P106 ?ocupacion . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}
ORDER BY DESC(?enlaces)
LIMIT 8`;
}

function consultaHechos(mes, dia, lugarQID) {
  return `
SELECT ?item ?itemLabel ?fecha ?tipoLabel ?lugarLabel ?enlaces ?imagen WHERE {
  ?item p:P585/psv:P585 ?nodo .
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
LIMIT 8`;
}

const RUIDO_IMAGEN = /(locator|location_map|map_of|mapa_de|coat_of_arms|escudo|flag_|bandera|logo|seal_|\.svg|blank|outline|chart|diagram|montaje|montage|collage|composite)/i;

function archivoDeURL(url) {
  const m = String(url).match(/Special:FilePath\/(.+)$/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]).replace(/_/g, ' '); }
  catch { return m[1].replace(/_/g, ' '); }
}

async function fichaImagen(archivo) {
  if (RUIDO_IMAGEN.test(archivo)) return null;
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    '&prop=imageinfo&iiprop=extmetadata&titles=' + encodeURIComponent('File:' + archivo);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': AGENTE_HTTP } });
    if (!r.ok) return null;
    const d = await r.json();
    const paginas = d.query && d.query.pages ? Object.values(d.query.pages) : [];
    const info = paginas[0] && paginas[0].imageinfo && paginas[0].imageinfo[0];
    const m = info && info.extmetadata;
    if (!m) return null;
    const licencia = String((m.LicenseShortName && m.LicenseShortName.value) || '').replace(/<[^>]+>/g, '').trim();
    if (!licencia) return null;
    return {
      archivo,
      autor: String((m.Artist && m.Artist.value) || 'Autor no identificado').replace(/<[^>]+>/g, '').trim(),
      fecha: String((m.DateTimeOriginal && m.DateTimeOriginal.value) || '').replace(/<[^>]+>/g, '').slice(0, 40),
      licencia,
    };
  } catch { return null; }
}

/* Fila cruda de Wikidata -> candidato con lo mínimo para poder redactar. */
function aCandidato(fila, ambito, tipo) {
  const nombre = fila.itemLabel;
  if (!nombre || /^Q\d+$/.test(nombre)) return null;
  const anio = String(fila.fecha).slice(0, 4).replace(/^0+/, '');
  const lugar = fila.lugarLabel && !/^Q\d+$/.test(fila.lugarLabel) ? fila.lugarLabel : '';
  const ocupacion = fila.ocupacionLabel && !/^Q\d+$/.test(fila.ocupacionLabel) ? fila.ocupacionLabel : '';
  const tipoLbl = fila.tipoLabel && !/^Q\d+$/.test(fila.tipoLabel) ? fila.tipoLabel : '';
  return {
    ambito, tipo, nombre, anio, lugar, ocupacion, tipo_wikidata: tipoLbl,
    qid: (String(fila.item).match(/Q\d+$/) || [])[0],
    enlaces: Number(fila.enlaces || 0),
    imagenUrl: fila.imagen || null,
  };
}

/* Busca en Wikidata, sólo Morelos. Devuelve el mejor candidato (más
   enlaces entre wikipedias) entre nacimientos, defunciones y hechos. */
async function buscarEnMorelos(mes, dia) {
  const candidatos = [];
  try {
    const [n, d, h] = await Promise.all([
      sparql(consultaPersonas('P569', 'P19', mes, dia, QID_MORELOS)),
      sparql(consultaPersonas('P570', 'P20', mes, dia, QID_MORELOS)),
      sparql(consultaHechos(mes, dia, QID_MORELOS)),
    ]);
    candidatos.push(...n.map(f => aCandidato(f, 'Morelos', 'nacimiento')));
    candidatos.push(...d.map(f => aCandidato(f, 'Morelos', 'defuncion')));
    candidatos.push(...h.map(f => aCandidato(f, 'Morelos', 'hecho')));
  } catch (e) {
    log(`  Wikidata (Morelos) falló: ${e.message}`);
    return null;
  }
  const validos = candidatos.filter(Boolean).sort((a, b) => b.enlaces - a.enlaces);
  return validos[0] || null;
}

/* ---- llamadas al modelo, sólo para redactar sobre el hecho ya verificado */

async function preguntarModelo(prompt, clave = null) {
  const cuerpo = {
    model: MODELO, max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const texto = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  return extraerJSON(texto, clave);
}

/* ---- redacción de la reflexión -------------------------------- */
/* El modelo NO decide el hecho ni la fecha: eso ya viene fijo. Su único
   trabajo es explicar qué significó y qué se puede aprender de él hoy. */

async function redactarReflexion(c, fechaTexto) {
  const descripcion = c.tipo === 'nacimiento'
    ? `Nace ${c.lugar ? `en ${c.lugar} ` : ''}${c.nombre}${c.ocupacion ? `, ${c.ocupacion}` : ''}.`
    : c.tipo === 'defuncion'
    ? `Muere ${c.lugar ? `en ${c.lugar} ` : ''}${c.nombre}${c.ocupacion ? `, ${c.ocupacion}` : ''}.`
    : `${c.nombre}${c.tipo_wikidata ? ` (${c.tipo_wikidata})` : ''}${c.lugar ? `, en ${c.lugar}` : ''}.`;

  return preguntarModelo(`Este es un archivo de crónica histórica de Morelos,
México. Hoy, ${fechaTexto} de ${c.anio}, ocurrió lo siguiente (ya verificado,
NO LO CAMBIES ni le agregues datos que no están aquí):

"${descripcion}"

Escribe DOS PÁRRAFOS BREVES en español:

1. Una frase que amplíe el hecho con el contexto mínimo indispensable para
   entenderlo (quién era, qué pasaba entonces), sin inventar datos que no
   puedas justificar con lo ya dado.
2. Una reflexión: qué enseñanza, valor o significado se puede extraer de este
   hecho para leerlo hoy. Sobria, sin moralina, sin frases de calendario de
   escritorio.

   Si el hecho es menor y no da para una enseñanza honesta, deja
   "reflexion" como cadena vacía (""). NO escribas un párrafo explicando
   que no hay nada que reflexionar, ni "esto es demasiado escueto", ni
   nada por el estilo — eso es tan relleno como la moralina forzada.
   Silencio es mejor que una frase que solo dice "no tengo nada que decir".

Máximo 90 palabras en total. No repitas la fecha ni el nombre en cada frase
como si fuera una ficha.

Responde SÓLO JSON:
{"contexto":"...","reflexion":"..."}`, 'reflexion');
}

/* Red de seguridad determinista: el modelo, pese a la instrucción, tiende
   a rellenar con variaciones de "esto es menor y no da para lección" en
   vez de dejar el campo vacío. En lugar de perseguir cada nueva variante
   con más instrucciones, se detecta el patrón por código y se fuerza la
   cadena vacía sin importar qué haya escrito el modelo. */
const PATRON_RELLENO = /(no hay (aquí|en él|en ella)?\s*(una?)?\s*(enseñanza|lección|moraleja)|no da para (una?)?\s*(enseñanza|lección)|demasiado escueto|es[,]? honestamente|registro (menor|modesto)|hecho menor|dato de archivo|ya justifica el ejercicio|no tengo nada que (decir|reflexionar)|sin forzarla|sin forzar(la|lo)?\s*(una?)?\s*(enseñanza|lección)?)/i;

function limpiarReflexion(texto) {
  const t = (texto || '').trim();
  if (!t || PATRON_RELLENO.test(t)) return '';
  return t;
}

/* Reseña de la fotografía: obligatoria para publicarla. Se le pide al
   mismo modelo, en la misma llamada de reflexión sería más barato, pero
   se separa para poder omitir la foto sin gastar la reflexión si no hay
   licencia o si el modelo no logra describirla con sentido. */
async function redactarReseñaFoto(c, ficha) {
  return preguntarModelo(`Fotografía de Wikimedia Commons: archivo
"${ficha.archivo}", autor ${ficha.autor}${ficha.fecha ? `, de ${ficha.fecha}` : ''}.
Relacionada con: "${c.nombre}"${c.lugar ? ` en ${c.lugar}` : ''}.

Escribe UNA frase (máximo 20 palabras) que diga qué se ve en la imagen y por
qué se incluye aquí. Si el nombre del archivo no te da suficiente información
para describir la imagen con honestidad, responde {"suficiente":false}.

Responde SÓLO JSON: {"suficiente":true,"reseña":"..."} o {"suficiente":false}`,
    'suficiente');
}

/* ---- ejecución -------------------------------------------------- */

function diaObjetivo() {
  const arg = process.argv[2];
  if (arg && /^\d{2}-\d{2}$/.test(arg)) return arg;
  const f = new Date(Date.now() + 24 * 3600 * 1000);
  return String(f.getUTCMonth() + 1).padStart(2, '0') + '-' +
         String(f.getUTCDate()).padStart(2, '0');
}

async function principal() {
  const dia = diaObjetivo();
  const [mm, dd] = dia.split('-');
  const mes = Number(mm), num = Number(dd);
  const fechaTexto = `${num} de ${MESES[mes - 1]}`;
  log(`Día ${dia} (${fechaTexto}). Solo Morelos.`);

  const candidato = await buscarEnMorelos(mes, num);
  if (candidato) {
    log(`  Wikidata (Morelos): "${candidato.nombre}" ${candidato.anio}, ${candidato.enlaces} wikis.`);
  } else {
    log('  Wikidata (Morelos): nada. No se publica.');
    return finalizar(dia, 0);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    log('Sin ANTHROPIC_API_KEY: no se puede redactar la reflexión. No se publica.');
    return finalizar(dia, 0);
  }

  let reflexion;
  try { reflexion = await redactarReflexion(candidato, fechaTexto); }
  catch (e) { log(`La redacción de la reflexión falló: ${e.message}. No se publica.`); return finalizar(dia, 0); }

  // Imagen: sólo si hay licencia Y el modelo logra reseñarla con sentido.
  let imagen = null;
  if (candidato.imagenUrl) {
    const archivo = archivoDeURL(candidato.imagenUrl);
    if (archivo) {
      const ficha = await fichaImagen(archivo);
      if (ficha) {
        try {
          const r = await redactarReseñaFoto(candidato, ficha);
          if (r.suficiente && r.reseña) {
            imagen = { ...ficha, origen: 'commons', pie: r.reseña };
            log(`  📷 con reseña: ${archivo}`);
          } else {
            log(`  (foto descartada: sin reseña suficiente — ${archivo})`);
          }
        } catch { log(`  (foto descartada: fallo al redactar reseña — ${archivo})`); }
      }
    }
  }

  const descripcion = candidato.tipo === 'nacimiento'
    ? `Nace ${candidato.lugar ? `en ${candidato.lugar} ` : ''}${candidato.nombre}${candidato.ocupacion ? `, ${candidato.ocupacion}` : ''}.`
    : candidato.tipo === 'defuncion'
    ? `Muere ${candidato.lugar ? `en ${candidato.lugar} ` : ''}${candidato.nombre}${candidato.ocupacion ? `, ${candidato.ocupacion}` : ''}.`
    : candidato.tipo === 'hecho' && candidato.qid
    ? `${candidato.nombre}${candidato.tipo_wikidata ? ` (${candidato.tipo_wikidata})` : ''}${candidato.lugar ? `, en ${candidato.lugar}` : ''}.`
    : candidato.nombre;

  const capa = {
    ambito: 'Morelos',
    anio: String(candidato.anio),
    texto: `${descripcion} ${reflexion.contexto || ''}`.trim(),
    reflexion: limpiarReflexion(reflexion.reflexion),
    verificacion: candidato.qid ? 'wikidata' : 'automatica',
    ...(candidato.qid ? { fuente: `https://www.wikidata.org/wiki/${candidato.qid}` } : {}),
    ...(candidato.fuente ? { fuente: candidato.fuente } : {}),
    ...(imagen ? {
      imagen_archivo: imagen.archivo, imagen_origen: 'commons',
      imagen_autor: imagen.autor, imagen_licencia: imagen.licencia,
      imagen_pie: imagen.pie,
    } : {}),
  };

  const ruta = path.join(raiz, 'contenido', 'efemerides', `${dia}.md`);
  // Decisión editorial: esta hoja muestra UN solo hecho, no se acumula
  // con lo que hubiera antes de otros motores. Se sustituye.
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, escribirFrontMatter({
    dia, actualizado: new Date().toISOString().slice(0, 10), capas: [capa],
  }, ''));

  log(`Publicado: ${candidato.ambito} ${candidato.anio} — "${candidato.nombre}"${imagen ? ' (con foto)' : ''}`);
  finalizar(dia, 1);
}

function finalizar(dia, publicadas) {
  fs.writeFileSync(path.join(raiz, 'resumen-cronica-diaria.json'),
    JSON.stringify({ dia, publicadas, registro }, null, 2));
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `publicadas=${publicadas}\ndia=${dia}\n`);
  }
}

principal().catch(e => {
  console.error('La crónica diaria falló:', e.message);
  process.exit(1);
});
