/* ---------------------------------------------------------------
   Amate · agente de piezas
   Produce piezas largas sobre Morelos. Corre SEMANAL, no diario:
   una pieza al día sería relleno, y el relleno es lo que mata la
   credibilidad de un archivo.

   Dos modos:
     'acervo' (por omisión) — ficha documental de una fuente
                              digitalizada. Mecánico y verificable.
     'nota'                 — nota de investigación: señala qué
                              material existe y qué crónica falta.
                              Material de trabajo para los cronistas.

   El modo 'cronica' existe pero viene APAGADO. Lee la advertencia
   antes de encenderlo.
   --------------------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const { REPOSITORIOS, anclas } = require('./morelos');
const { extraerJSON } = require('../lib/json');

const MODELO = 'claude-sonnet-4-6';
const ANIO_LIMITE = 1990;
const MINIMO_FUENTES = 2;        // documentos distintos, no ligas distintas
const MINIMO_INSTITUCIONES = 2;  // dominios distintos: evita la circularidad

/* Modo de la pieza. Cambiar por variable de entorno MODO_PIEZA.
   ADVERTENCIA sobre 'cronica': una crónica exige conocimiento local que
   no está en la web. Lo que produce una máquina es un resumen con
   adjetivos, y publicar eso bajo la firma del portal contamina la
   confianza en las crónicas buenas. Si lo enciendes, revisa cada pieza
   antes de que salga y no lo dejes correr solo. */
const MODO = ['acervo', 'nota', 'cronica'].includes(process.env.MODO_PIEZA)
  ? process.env.MODO_PIEZA
  : 'acervo';

const raiz = path.join(__dirname, '..');
const registro = [];
const log = m => { console.log(m); registro.push(m); };

const slug = s => String(s).toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '').slice(0, 60);


/* Dominio institucional, no servidor. "bibliotecadigital.scjn.gob.mx" y
   "emiliano-zapata.scjn.gob.mx" son dos máquinas de la MISMA institución:
   la Suprema Corte. Comparar por servidor deja pasar la circularidad. */
const SUFIJOS_COMPUESTOS = new Set([
  'gob.mx', 'com.mx', 'edu.mx', 'org.mx', 'net.mx',
  'co.uk', 'ac.uk', 'org.uk', 'gob.ar', 'com.ar', 'edu.ar',
  'com.br', 'gov.br', 'edu.br', 'gob.es', 'com.es',
  'gob.pe', 'edu.pe', 'gob.cl', 'gov.co', 'edu.co',
]);

function institucion(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return null; }
  const p = host.split('.');
  if (p.length < 2) return host;
  const dos = p.slice(-2).join('.');
  // Con sufijo compuesto hacen falta tres etiquetas: scjn.gob.mx
  return SUFIJOS_COMPUESTOS.has(dos) && p.length >= 3
    ? p.slice(-3).join('.')
    : dos;
}

async function preguntar(prompt, { buscar = false, tokens = 4000 } = {}, clave = null) {
  const cuerpo = {
    model: MODELO, max_tokens: tokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (buscar) cuerpo.tools = [{ type: 'web_search_20250305', name: 'web_search' }];

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 300)}`);

  const data = await r.json();
  const texto = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  return extraerJSON(texto, clave);
}

/* ---- qué tema tocar esta semana -------------------------------- */

function temaSemana() {
  const hoy = new Date();
  const semana = Math.floor(
    (hoy - new Date(hoy.getFullYear(), 0, 1)) / (7 * 24 * 3600 * 1000));
  const a = anclas(String(semana).padStart(2, '0') + '-01');
  return { semana, ...a };
}

/* ---- redacción ------------------------------------------------- */

const INSTRUCCIONES = {
  acervo: `Produce una FICHA DE ACERVO: la descripción de UN documento, plano,
fotografía, decreto o publicación digitalizada relativa a Morelos que hayas
localizado y consultado en línea.

Estructura del texto:
- Qué es el documento y de qué fecha.
- Dónde está resguardado y con qué identificador o liga.
- Qué dice, en tus palabras, sin transcribirlo largo.
- Por qué importa para la historia local.
- Qué NO se puede saber a partir de él. Este párrafo es obligatorio: una
  ficha honesta declara los límites de su fuente.

No narres, no adjetives, no reconstruyas escenas. Es una ficha, no una crónica.`,

  nota: `Produce una NOTA DE INVESTIGACIÓN dirigida a los cronistas del portal.
No es una crónica: es el señalamiento de que existe material y falta quien lo
trabaje.

Estructura del texto:
- Qué tema local está documentado y poco contado.
- Qué fuentes concretas existen y dónde están, con ligas.
- Qué preguntas quedan abiertas que esas fuentes no resuelven.
- Qué haría falta para escribir la crónica: a quién entrevistar, qué archivo
  visitar, qué expediente pedir y en dónde.

Escribe en segunda persona del plural, como encargo abierto a quien quiera
tomarlo. Sé concreto: "en el ramo tal del archivo tal", no "en los archivos".`,

  cronica: `Produce una CRÓNICA sobre un tema de Morelos.

Advertencia que debes respetar: no inventes escenas, no atribuyas
pensamientos, no describas lo que no consta en una fuente. Si el material sólo
alcanza para una ficha, entrega una ficha y dilo. Es preferible una pieza corta
y sólida que una larga y rellena.`,
};

async function redactar() {
  const t = temaSemana();
  return preguntar(`Eres documentalista del archivo histórico de Morelos, México.

${INSTRUCCIONES[MODO]}

Busca en línea material sobre alguno de estos anclajes, el que dé mejores
resultados verificables:
- Municipios: ${t.municipios.join(', ')}
- Haciendas: ${t.haciendas.join(', ')}
- Figuras: ${t.figuras.join(', ')}
- Episodios: ${t.episodios.join(', ')}

Repositorios donde sí hay material morelense digitalizado:
${REPOSITORIOS.map(r => '  · ' + r).join('\n')}

Reglas que no se negocian:
1. Sólo afirmaciones que hayas CONFIRMADO en páginas consultadas en esta
   sesión. Nada de memoria.
2. Mínimo ${MINIMO_FUENTES} fuentes que sean DOCUMENTOS DISTINTOS y de al
   menos ${MINIMO_INSTITUCIONES} INSTITUCIONES DISTINTAS (dominios distintos).
   Dos ligas al mismo PDF no son dos fuentes, aunque estén en direcciones
   diferentes. Si sólo reúnes una institución, busca en otra: hemeroteca,
   repositorio universitario, archivo estatal, obra publicada. Si de plano no
   lo logras, devuelve {"suficiente": false} y nada más.
3. Nada posterior a ${ANIO_LIMITE}. Nada de personas probablemente vivas, ni de
   funcionarios en activo, ni de causas judiciales.
4. Ninguna cita textual de más de quince palabras.
5. Entre 400 y 700 palabras. Prosa sobria, sin épica revolucionaria.
6. Markdown simple: subtítulos con ## y párrafos. Nada de tablas.

Responde SÓLO JSON:
{"suficiente":true,
 "titulo":"...",
 "resumen":"dos líneas",
 "lugar":"municipio o Morelos",
 "cuerpo":"el texto en markdown",
 "fuentes":[{"referencia":"...","url":"https://..."}],
 "afirmaciones_clave":["afirmación verificable 1","afirmación 2","afirmación 3"]}`,
    { buscar: true, tokens: 6000 }, 'suficiente');
}

/* ---- verificación adversarial de las afirmaciones -------------- */

async function verificar(pieza) {
  return preguntar(`Eres verificador de un archivo histórico. Tu trabajo es
DESMENTIR, no confirmar. Asume que el texto contiene errores hasta comprobar
lo contrario.

Título: ${pieza.titulo}
Fuentes alegadas:
${pieza.fuentes.map(f => `  · ${f.referencia} — ${f.url}`).join('\n')}

Afirmaciones a comprobar:
${pieza.afirmaciones_clave.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}

Texto completo:
${pieza.cuerpo}

Comprueba de forma independiente:
1. ¿Las URL existen y son accesibles?
1b. ¿Son DOCUMENTOS DISTINTOS de INSTITUCIONES DISTINTAS, o son varias ligas
   al mismo archivo? Si todo proviene de una sola institución o de un mismo
   documento, RECHAZA: no hay corroboración independiente.
2. ¿Cada afirmación clave se sostiene en las fuentes, o se les atribuye algo
   que no dicen?
3. ¿Hay fechas, cifras, nombres o atribuciones equivocados? Sé implacable con
   las fechas: es el error más frecuente.
4. ¿Hay escenas, diálogos o motivaciones inventadas que ninguna fuente respalde?
5. ¿Aparecen personas identificables probablemente vivas, o hechos posteriores
   a ${ANIO_LIMITE}?
6. ¿Hay citas textuales de más de quince palabras?

Rechaza si alguna fuente no abre, si todas las fuentes son el mismo documento
o la misma institución, si una afirmación clave no se sostiene, si hay invención
narrativa, o si hay riesgo sobre personas. Ante la duda, rechaza.

Presta atención especial a los NÚMEROS DE ARTÍCULO, fechas y cifras citados:
son los datos que más se deslizan y los que nadie vuelve a comprobar.

Responde SÓLO JSON:
{"veredicto":"aprobado|rechazado","motivo":"...",
"fuentes_accesibles":true|false,"fuentes_independientes":true|false,
"afirmaciones_sostenidas":true|false,
"invencion_narrativa":true|false,"riesgo_personas":true|false,
"correcciones":["si algo es corregible, la corrección concreta"]}`,
    { buscar: true, tokens: 3000 }, 'veredicto');
}

/* ---- ejecución ------------------------------------------------- */

async function principal() {
  log(`Modo: ${MODO}. Mínimo de fuentes: ${MINIMO_FUENTES}.`);

  const pieza = await redactar();

  if (!pieza.suficiente || !pieza.cuerpo) {
    log('No se reunió material suficiente. No se publica nada.');
    return finalizar(0);
  }
  if (!Array.isArray(pieza.fuentes) || pieza.fuentes.length < MINIMO_FUENTES) {
    log(`Sólo ${(pieza.fuentes || []).length} fuentes. No alcanza el mínimo.`);
    return finalizar(0);
  }

  // Dos ligas al mismo PDF no son dos fuentes. Se exigen dominios
  // distintos: si todo viene de una institución, no hay corroboración
  // independiente, hay una sola fuente citada dos veces.
  const dominios = new Set();
  for (const f of pieza.fuentes) {
    const i = institucion(f.url);
    if (i) dominios.add(i);
  }
  if (dominios.size < MINIMO_INSTITUCIONES) {
    log(`Todas las fuentes vienen de ${dominios.size} institución(es): ` +
        `${[...dominios].join(', ')}. No hay corroboración independiente. No se publica.`);
    return finalizar(0);
  }
  log(`Instituciones distintas: ${[...dominios].join(', ')}.`);
  log(`Borrador: "${pieza.titulo}" con ${pieza.fuentes.length} fuentes.`);

  const v = await verificar(pieza);
  const pasa = v.veredicto === 'aprobado' &&
               v.fuentes_accesibles === true &&
               v.fuentes_independientes !== false &&
               v.afirmaciones_sostenidas === true &&
               v.invencion_narrativa !== true &&
               v.riesgo_personas !== true;

  if (!pasa) {
    log(`Rechazada en verificación: ${v.motivo}`);
    if (v.correcciones && v.correcciones.length) {
      log(`Correcciones señaladas: ${v.correcciones.join(' | ')}`);
    }
    return finalizar(0);
  }
  log(`Aprobada. ${v.motivo || ''}`);

  const fecha = new Date().toISOString().slice(0, 10);
  const nombre = `${fecha}-${slug(pieza.titulo)}`;
  const seccion = MODO === 'nota' ? 'nota' : (MODO === 'cronica' ? 'cronica' : 'acervo');

  const frontmatter = [
    '---',
    `titulo: "${String(pieza.titulo).replace(/"/g, "'")}"`,
    `fecha: ${fecha}`,
    'autor: redaccion-amate',
    `seccion: ${seccion}`,
    `lugar: "${String(pieza.lugar || 'Morelos').replace(/"/g, "'")}"`,
    `resumen: "${String(pieza.resumen).replace(/"/g, "'").replace(/\s+/g, ' ')}"`,
    'verificacion: automatica',
    'fuentes:',
    ...pieza.fuentes.map(f =>
      `  - "${String(f.referencia).replace(/"/g, "'")} — ${f.url}"`),
    'borrador: false',
    '---',
    '',
    pieza.cuerpo.trim(),
    '',
  ].join('\n');

  const ruta = path.join(raiz, 'contenido', 'cronicas', `${nombre}.md`);
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, frontmatter);
  log(`Publicada en contenido/cronicas/${nombre}.md`);
  finalizar(1, nombre);
}

function finalizar(publicadas, nombre = '') {
  fs.writeFileSync(path.join(raiz, 'resumen-piezas.json'),
    JSON.stringify({ modo: MODO, publicadas, nombre, registro }, null, 2));
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT,
      `publicadas=${publicadas}\nnombre=${nombre}\nmodo=${MODO}\n`);
  }
}

principal().catch(e => {
  console.error('El agente de piezas falló:', e.message);
  process.exit(1);
});
