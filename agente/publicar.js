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

/* ---- pasada 2: verificación adversarial ------------------------ */
/* Llamada independiente, sin el razonamiento de la primera. Su trabajo
   no es confirmar sino tumbar. Se le pide explícitamente que asuma que
   la afirmación es falsa hasta que la fuente demuestre lo contrario. */

async function verificar(capa, fechaTexto) {
  return preguntar(`Eres verificador de datos de un archivo histórico. Tu trabajo
es DESMENTIR, no confirmar. Asume que la siguiente afirmación es falsa hasta que
la fuente demuestre lo contrario.

Afirmación: el ${fechaTexto} de ${capa.anio}, ${capa.texto}
Ámbito declarado: ${capa.ambito}
Fuente alegada: ${capa.fuente}
Cita alegada: ${capa.cita || '(ninguna)'}

Busca de forma independiente. Después responde:

1. ¿La fuente existe y es accesible?
2. ¿La fuente dice efectivamente eso, o se le está atribuyendo algo que no dice?
3. ¿La FECHA EXACTA (día y mes) coincide? Este es el error más frecuente:
   un hecho real fechado en el día equivocado. Sé implacable aquí.
4. ¿El año coincide?
5. ¿Alguna fuente independiente lo contradice o da otra fecha?
6. ¿Hay personas identificables probablemente vivas, o hechos posteriores
   a ${ANIO_LIMITE}?

Rechaza si hay cualquier discrepancia, si la fuente es un blog sin respaldo, si
es una wiki sin referencia, o si sólo pudiste confirmarlo con la misma fuente
alegada. Ante la duda, rechaza: publicar de menos no cuesta nada.

Responde SÓLO JSON:
{"veredicto":"aprobado|rechazado","motivo":"...",
"fecha_coincide":true|false,"fuente_confirma":true|false,
"corroboracion_independiente":"URL o vacío","riesgo_personas":true|false}`,
    { buscar: true });
}

/* ---- ejecución ------------------------------------------------- */

async function principal() {
  const dia = diaObjetivo();
  const [mes, num] = dia.split('-');
  const fechaTexto = `${Number(num)} de ${MESES[Number(mes) - 1]}`;
  const ruta = path.join(raiz, 'contenido', 'efemerides', `${dia}.md`);

  let previo = { datos: {}, cuerpo: '' };
  if (fs.existsSync(ruta)) previo = leerFrontMatter(fs.readFileSync(ruta, 'utf8'));
  const capasPrevias = previo.datos.capas || [];

  log(`Día ${dia}. Capas ya publicadas: ${capasPrevias.length}.`);

  const { capas } = await investigar(dia, fechaTexto,
    capasPrevias.map(c => `${c.ambito} ${c.anio}: ${c.texto}`).join('\n'));

  if (!capas || !capas.length) {
    log('La investigación no arrojó nada. No se publica.');
    return finalizar(dia, 0, 0);
  }
  log(`Candidatas: ${capas.length}.`);

  const aprobadas = [];
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
    try { v = await verificar(capa, fechaTexto); }
    catch (e) { log(`  ✗ ${capa.ambito} ${capa.anio}: falló la verificación (${e.message}).`); continue; }

    const pasa = v.veredicto === 'aprobado' && v.fecha_coincide === true &&
                 v.fuente_confirma === true && v.riesgo_personas !== true &&
                 /^https?:\/\//.test(v.corroboracion_independiente || '');

    if (!pasa) {
      log(`  ✗ ${capa.ambito} ${capa.anio}: rechazada. ${v.motivo || 'sin corroboración independiente'}`);
      continue;
    }

    log(`  ✓ ${capa.ambito} ${capa.anio}: aprobada. Corrobora ${v.corroboracion_independiente}`);
    aprobadas.push({
      ambito: capa.ambito,
      anio: String(capa.anio),
      texto: capa.texto,
      fuente: capa.fuente,
      corrobora: v.corroboracion_independiente,
      verificacion: 'automatica',
      publicada: new Date().toISOString().slice(0, 10),
    });
  }

  if (!aprobadas.length) {
    log('Ninguna capa pasó la verificación. No se publica nada. El día queda vacío.');
    return finalizar(dia, capas.length, 0);
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
  log(`Publicadas ${aprobadas.length} capas nuevas en ${dia}.md`);
  finalizar(dia, capas.length, aprobadas.length);
}

function finalizar(dia, candidatas, publicadas) {
  const resumen = { dia, candidatas, publicadas, registro };
  fs.writeFileSync(path.join(raiz, 'resumen-agente.json'), JSON.stringify(resumen, null, 2));
  // Lo lee el workflow para decidir si hay algo que confirmar.
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `publicadas=${publicadas}\ndia=${dia}\n`);
  }
}

principal().catch(e => {
  console.error('El agente falló:', e.message);
  // Fallar cerrado: si algo se rompe, no se publica nada.
  process.exit(1);
});
