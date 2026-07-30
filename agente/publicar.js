/* ---------------------------------------------------------------
   Amate · agente de publicación automática
   Investiga, verifica de forma adversarial y publica sin intervención.

   Diseño: FALLA CERRADA. Ante cualquier duda no publica nada.
   Un día vacío en el calendario no cuesta nada; un dato falso en un
   archivo permanente cuesta la credibilidad de todo lo demás.
   --------------------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const { leerFrontMatter, escribirFrontMatter } = require('../lib/frontmatter');
const { REPOSITORIOS, anclas } = require('./morelos');

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
  'agosto','septiembre','octubre','noviembre','diciembre'];

const MODELO = 'claude-sonnet-4-6';
const AMBITOS = ['Cuautla', 'Morelos', 'México', 'Mundo'];

/* Nada posterior a este año se publica sin humano. Es la frontera entre
   historia y actualidad: protege contra el daño a personas vivas, que es
   donde un error automático deja de ser un problema editorial y se
   convierte en uno legal. */
const ANIO_LIMITE = 1990;

/* ---- utilidades ------------------------------------------------ */

const raiz = path.join(__dirname, '..');
const registro = [];

/* Los motivos del verificador vienen largos; se recortan para que el archivo
   .md siga siendo legible por una persona. */
function recorta(t, n) {
  const x = String(t || 'Sin corroboración independiente.').replace(/\s+/g, ' ').trim();
  return x.length <= n ? x : x.slice(0, n - 1).replace(/[\s,;.]+\S*$/, '') + '…';
}
const log = m => { console.log(m); registro.push(m); };

function diaObjetivo() {
  if (process.env.DIA_MANUAL && /^\d{2}-\d{2}$/.test(process.env.DIA_MANUAL)) {
    return process.env.DIA_MANUAL;
  }
  const f = new Date(Date.now() + 24 * 3600 * 1000);
  return String(f.getUTCMonth() + 1).padStart(2, '0') + '-' +
         String(f.getUTCDate()).padStart(2, '0');
}

async function preguntar(prompt, { buscar = false } = {}) {
  const cuerpo = {
    model: MODELO,
    max_tokens: 3000,
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
  const i = texto.indexOf('{'), f = texto.lastIndexOf('}');
  if (i === -1 || f === -1) throw new Error('El modelo no devolvió JSON.');
  return JSON.parse(texto.slice(i, f + 1));
}

/* ---- pasada 1: investigar -------------------------------------- */

async function investigar(dia, fechaTexto, previo) {
  return preguntar(`Eres investigador de un archivo histórico de Morelos, México.
Busca en la web hechos verificables ocurridos un ${fechaTexto} de cualquier año
anterior a ${ANIO_LIMITE}.

Reglas estrictas:
1. Sólo hechos que hayas CONFIRMADO en una página que consultaste en esta
   sesión. Nada de memoria. Si no lo encontraste buscando, no existe.
2. Cada hecho lleva la URL exacta donde lo verificaste.
3. Nada posterior a ${ANIO_LIMITE}. Nada sobre personas probablemente vivas.
   Nada sobre funcionarios en activo. Nada de causas judiciales.
4. Prioriza Cuautla y Morelos; si no hay nada local confirmado, omite esa capa
   en lugar de rellenar.
5. Máximo cuatro hechos. Texto sobrio, dos o tres oraciones, sin épica.
6. Ámbitos válidos: ${AMBITOS.join(', ')}.

${previo ? `Ya está publicado lo siguiente. Propón sólo hechos DISTINTOS:\n${previo}` : ''}

Responde SÓLO JSON:
{"capas":[{"ambito":"...","anio":"1914","texto":"...","fuente":"https://...",
"cita":"la frase de la fuente que respalda el hecho"}]}`, { buscar: true });
}


/* ---- pasada 0: búsqueda local dedicada ------------------------- */
/* Corre ANTES de la general y con varias consultas distintas. Una
   búsqueda genérica de "29 de julio Morelos" no devuelve nada; entrar
   por hacienda, municipio o figura sí. Acepta precisión de mes, porque
   de la historia de Morelos se conoce mucho más al mes que al día. */

async function investigarLocal(dia, fechaTexto, mesTexto, previo) {
  const a = anclas(dia);
  return preguntar(`Eres investigador del archivo histórico de Morelos, México.
Tu ÚNICA tarea en esta pasada es encontrar hechos de MORELOS o de sus
municipios. Nada de historia nacional ni mundial: eso lo cubre otra pasada.

Busca hechos ocurridos un ${fechaTexto}, o bien durante ${mesTexto}, de
cualquier año anterior a ${ANIO_LIMITE}.

HAZ VARIAS BÚSQUEDAS DISTINTAS, no una sola. Una consulta genérica del tipo
"${fechaTexto} Morelos" no devuelve nada útil. Entra por estos caminos y
combínalos con el mes y con años concretos:

- Municipios: ${a.municipios.join(', ')}
- Haciendas azucareras: ${a.haciendas.join(', ')}
- Figuras: ${a.figuras.join(', ')}
- Episodios: ${a.episodios.join(', ')}

Prioriza estos repositorios, que sí tienen material morelense digitalizado:
${REPOSITORIOS.map(r => '  · ' + r).join('\n')}

Tipos de hecho que suelen estar documentados y sirven:
decretos y leyes del estado, fundación o erección de municipios, tomas y
combates del Ejército Libertador del Sur, reparto de tierras y dotaciones
ejidales, inauguraciones de ingenios, ferrocarriles, mercados, escuelas y
hospitales, nacimientos y muertes de morelenses notables, hallazgos
arqueológicos, temblores y desastres, fundación de instituciones.

Reglas:
1. Sólo hechos CONFIRMADOS en una página que consultaste en esta sesión.
   Nada de memoria. Lo que no encontraste buscando, no existe.
2. Cada hecho lleva la URL exacta donde lo verificaste.
3. Campo "precision": "dia" si la fuente da día y mes exactos; "mes" si sólo
   consta el mes y el año. Nunca inventes un día para que cuadre.
4. Nada posterior a ${ANIO_LIMITE}. Nada de personas probablemente vivas.
5. Si de plano no encuentras nada morelense confirmado, devuelve la lista
   vacía. No rellenes con historia nacional.
6. Máximo tres hechos. Texto sobrio, dos o tres oraciones.

${previo ? `Ya está publicado esto; propón sólo hechos DISTINTOS:\n${previo}` : ''}

Responde SÓLO JSON:
{"capas":[{"ambito":"Cuautla|Morelos","anio":"1914","precision":"dia|mes",
"texto":"...","fuente":"https://...","cita":"la frase que lo respalda"}]}`,
    { buscar: true });
}

/* ---- pasada 2: verificación adversarial ------------------------ */
/* Llamada independiente, sin el razonamiento de la primera. Su trabajo
   no es confirmar sino tumbar. Se le pide explícitamente que asuma que
   la afirmación es falsa hasta que la fuente demuestre lo contrario. */

async function verificar(capa, fechaTexto, mesTexto) {
  return preguntar(`Eres verificador de datos de un archivo histórico. Tu trabajo
es DESMENTIR, no confirmar. Asume que la siguiente afirmación es falsa hasta que
la fuente demuestre lo contrario.

Afirmación: el ${fechaTexto} de ${capa.anio}, ${capa.texto}
Ámbito declarado: ${capa.ambito}
Fuente alegada: ${capa.fuente}
Cita alegada: ${capa.cita || '(ninguna)'}

Busca de forma independiente y comprueba:

1. ¿La fuente existe y es accesible?
2. ¿Dice efectivamente eso, o se le atribuye algo que no dice?
3. ${capa.precision === 'mes'
     ? `La afirmación se presenta con precisión de MES (${mesTexto}), no de día.
   ¿El mes y el año coinciden con la fuente? No exijas día exacto, pero sí
   comprueba que la fuente no dé otro mes.`
     : `¿La FECHA EXACTA (día y mes) coincide? Este es el error más frecuente:
   un hecho real fechado en el día equivocado. Sé implacable aquí.`}
4. ¿El año coincide?
5. ¿Alguna fuente independiente lo contradice o da otra fecha?
6. ¿Hay personas identificables probablemente vivas, o hechos posteriores
   a ${ANIO_LIMITE}?

Emite UNO de estos tres veredictos:

- "aprobado": todo coincide y lo corrobora una fuente independiente distinta
  de la alegada.

- "corregible": el hecho ES REAL y está documentado, pero la afirmación
  contiene un error concreto que TÚ PUEDES CORREGIR con certeza (fecha, cifra,
  nombre, atribución). Devuelve en "texto_corregido" la versión correcta,
  redactada completa y sobria, en dos o tres oraciones, con el error ya
  arreglado. Si al corregir el hecho deja de corresponder a un ${fechaTexto},
  NO es corregible: es rechazado.

- "rechazado": no pudiste confirmar que el hecho haya ocurrido, la fuente es
  un blog o wiki sin respaldo, todas las menciones se rastrean a una sola
  fuente circular, o hay riesgo de daño a personas. Ante la duda, rechaza.

Responde SÓLO JSON:
{"veredicto":"aprobado|corregible|rechazado","motivo":"...",
"texto_corregido":"(sólo si es corregible)",
"fecha_coincide":true|false,"fuente_confirma":true|false,
"corroboracion_independiente":"URL o vacío","riesgo_personas":true|false}`,
    { buscar: true });
}

/* ---- ejecución ------------------------------------------------- */

async function principal() {
  const dia = diaObjetivo();
  const [mes, num] = dia.split('-');
  const fechaTexto = `${Number(num)} de ${MESES[Number(mes) - 1]}`;
  const mesTexto = MESES[Number(mes) - 1];
  const ruta = path.join(raiz, 'contenido', 'efemerides', `${dia}.md`);

  let previo = { datos: {}, cuerpo: '' };
  if (fs.existsSync(ruta)) previo = leerFrontMatter(fs.readFileSync(ruta, 'utf8'));
  const capasPrevias = previo.datos.capas || [];

  log(`Día ${dia}. Capas ya publicadas: ${capasPrevias.length}.`);

  const resumenPrevio = capasPrevias
    .map(c => `${c.ambito} ${c.anio}: ${c.texto}`).join('\n');

  // Primero lo local. Es lo que le da valor al portal y lo más difícil
  // de encontrar, así que se busca con su propia estrategia.
  let locales = [];
  try {
    const r = await investigarLocal(dia, fechaTexto, mesTexto, resumenPrevio);
    locales = (r.capas || []).filter(c => ['Cuautla', 'Morelos'].includes(c.ambito));
    log(`Pasada local: ${locales.length} candidatas de Morelos.`);
  } catch (e) {
    log(`Pasada local falló (${e.message}). Se continúa con la general.`);
  }

  const g = await investigar(dia, fechaTexto, resumenPrevio);
  const generales = (g.capas || []).filter(c => !['Cuautla', 'Morelos'].includes(c.ambito));
  const capas = [...locales, ...generales];

  if (!capas || !capas.length) {
    log('La investigación no arrojó nada. No se publica.');
    return finalizar(dia, 0, 0);
  }
  log(`Candidatas: ${capas.length}.`);

  const aprobadas = [];
  const pendientes = [];
  for (const capa of capas) {
    // Filtros duros antes de gastar una llamada de verificación.
    const anio = parseInt(capa.anio, 10);
    if (!anio || anio >= ANIO_LIMITE) {
      log(`  ✗ ${capa.ambito} ${capa.anio}: fuera del límite de ${ANIO_LIMITE}.`);
      continue;
    }
    if (!AMBITOS.includes(capa.ambito)) {
      log(`  ✗ ámbito no válido: ${capa.ambito}.`);
      continue;
    }
    if (!/^https?:\/\//.test(capa.fuente || '')) {
      log(`  ✗ ${capa.ambito} ${capa.anio}: sin URL de fuente.`);
      continue;
    }

    let v;
    try { v = await verificar(capa, fechaTexto, mesTexto); }
    catch (e) { log(`  ✗ ${capa.ambito} ${capa.anio}: falló la verificación (${e.message}).`); continue; }

    // Toda publicación exige corroboración independiente y ausencia de riesgo.
    const base = v.riesgo_personas !== true &&
                 /^https?:\/\//.test(v.corroboracion_independiente || '');

    const alta = base && v.veredicto === 'aprobado' &&
                 v.fecha_coincide === true && v.fuente_confirma === true;

    const media = base && v.veredicto === 'corregible' &&
                  typeof v.texto_corregido === 'string' &&
                  v.texto_corregido.trim().length > 40;

    // Riesgo a personas: NUNCA se publica, ni con etiqueta. No es duda
    // histórica sino exposición legal, y ahí una etiqueta no protege a nadie.
    if (v.riesgo_personas === true) {
      log(`  ⛔ ${capa.ambito} ${capa.anio}: excluida por riesgo a personas. Sólo a pistas.`);
      pendientes.push({
        ambito: capa.ambito, anio: String(capa.anio), texto: capa.texto,
        fuente: capa.fuente || '', motivo: recorta(v.motivo, 400),
      });
      continue;
    }

    // Lo demás entra a la hoja, pero marcado sin confirmar y con el motivo
    // impreso a la vista del lector.
    if (!alta && !media) {
      log(`  ⚠ ${capa.ambito} ${capa.anio}: publicada SIN CONFIRMAR. ${recorta(v.motivo, 120)}`);
      aprobadas.push({
        ambito: capa.ambito,
        anio: String(capa.anio),
        texto: capa.texto,
        fuente: capa.fuente || '',
        verificacion: 'automatica',
        precision: capa.precision === 'mes' ? 'mes' : 'dia',
        confianza: 'sin_confirmar',
        motivo: recorta(v.motivo, 400),
        publicada: new Date().toISOString().slice(0, 10),
      });
      pendientes.push({
        ambito: capa.ambito, anio: String(capa.anio), texto: capa.texto,
        fuente: capa.fuente || '', motivo: recorta(v.motivo, 400),
      });
      continue;
    }

    if (media) {
      log(`  ~ ${capa.ambito} ${capa.anio}: CORREGIDA y publicada como confianza media. ${v.motivo}`);
    } else {
      log(`  ✓ ${capa.ambito} ${capa.anio}: aprobada, confianza alta. Corrobora ${v.corroboracion_independiente}`);
    }

    aprobadas.push({
      ambito: capa.ambito,
      anio: String(capa.anio),
      texto: media ? v.texto_corregido.trim() : capa.texto,
      fuente: capa.fuente,
      corrobora: v.corroboracion_independiente,
      verificacion: 'automatica',
      precision: capa.precision === 'mes' ? 'mes' : 'dia',
      confianza: media ? 'media' : 'alta',
      publicada: new Date().toISOString().slice(0, 10),
    });
  }

  guardarPistas(dia, pendientes);

  if (!aprobadas.length) {
    log('Ninguna capa pasó la verificación. No se publica nada en la hoja.');
    return finalizar(dia, capas.length, 0, pendientes.length);
  }

  const orden = a => AMBITOS.indexOf(a.ambito);
  const todas = [...capasPrevias, ...aprobadas].sort((a, b) => orden(a) - orden(b));

  const datos = {
    dia,
    actualizado: new Date().toISOString().slice(0, 10),
    capas: todas,
    fuentes: [
      ...(previo.datos.fuentes || []),
      ...aprobadas.map(a => `${a.fuente} (verificación automática, ${a.publicada})`),
    ],
  };

  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, escribirFrontMatter(datos, previo.cuerpo));
  const sc = aprobadas.filter(a => a.confianza === 'sin_confirmar').length;
  log(`Publicadas ${aprobadas.length} capas nuevas en ${dia}.md` +
      (sc ? ` (${sc} marcadas SIN CONFIRMAR)` : ''));
  finalizar(dia, capas.length, aprobadas.length, pendientes.length);
}

/* Las pistas no se publican como ciertas: son material de trabajo para el
   cronista. Se conservan porque una pista mala puede llevar a un documento
   bueno, y porque tirarlas obliga a repetir la búsqueda cada año. */
function guardarPistas(dia, pendientes) {
  if (!pendientes.length) return;
  const ruta = path.join(raiz, 'contenido', 'pistas', `${dia}.md`);
  let previas = [];
  if (fs.existsSync(ruta)) {
    previas = (leerFrontMatter(fs.readFileSync(ruta, 'utf8')).datos.pendientes) || [];
  }
  const vistos = new Set(previas.map(p => `${p.anio}|${String(p.texto).slice(0, 60)}`));
  const nuevas = pendientes.filter(p => !vistos.has(`${p.anio}|${String(p.texto).slice(0, 60)}`));
  if (!nuevas.length) return;

  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, escribirFrontMatter({
    dia,
    actualizado: new Date().toISOString().slice(0, 10),
    pendientes: [...previas, ...nuevas],
  }, ''));
  log(`Guardadas ${nuevas.length} pistas por confirmar en pistas/${dia}.md`);
}

function finalizar(dia, candidatas, publicadas, pistas = 0) {
  const resumen = { dia, candidatas, publicadas, pistas, registro };
  fs.writeFileSync(path.join(raiz, 'resumen-agente.json'), JSON.stringify(resumen, null, 2));
  // Lo lee el workflow para decidir si hay algo que confirmar.
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT,
      `publicadas=${publicadas}\ndia=${dia}\npistas=${pistas}\n`);
  }
}

principal().catch(e => {
  console.error('El agente falló:', e.message);
  // Fallar cerrado: si algo se rompe, no se publica nada.
  process.exit(1);
});
