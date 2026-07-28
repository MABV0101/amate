/* ---------------------------------------------------------------
   Amate · agente de propuesta
   Redacta una hoja candidata y la deja en contenido/propuestas/.
   NO escribe en contenido/efemerides/. Eso lo hace un humano al
   aprobar el pull request.
   --------------------------------------------------------------- */

const fs = require('fs');
const path = require('path');

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
  'agosto','septiembre','octubre','noviembre','diciembre'];

/* ---- qué día investigar ---------------------------------------- */

function diaObjetivo() {
  if (process.env.DIA_MANUAL && /^\d{2}-\d{2}$/.test(process.env.DIA_MANUAL)) {
    return process.env.DIA_MANUAL;
  }
  const manana = new Date(Date.now() + 24 * 3600 * 1000);
  return String(manana.getUTCMonth() + 1).padStart(2, '0') + '-' +
         String(manana.getUTCDate()).padStart(2, '0');
}

const dia = diaObjetivo();
const [mes, num] = dia.split('-');
const fechaTexto = `${Number(num)} de ${MESES[Number(mes) - 1]}`;

/* ---- qué hay ya, para no repetir ------------------------------- */

const rutaExistente = path.join(__dirname, '..', 'contenido', 'efemerides', `${dia}.md`);
const yaExiste = fs.existsSync(rutaExistente);
const contenidoPrevio = yaExiste ? fs.readFileSync(rutaExistente, 'utf8') : '';

const INSTRUCCION = `Eres asistente de investigación de un archivo histórico de
Morelos, México. Propón capas de efeméride para el ${fechaTexto}.

Reglas que no se negocian:

1. Sólo hechos de los que tengas certeza alta. Si dudas de un año, NO lo
   incluyas. Una hoja con dos capas sólidas vale más que una con seis dudosas.
2. Cada capa lleva una referencia concreta y comprobable: obra publicada con
   autor y año, fondo documental identificado, o publicación periódica con
   fecha. Nunca inventes una referencia ni cites de memoria un número de
   expediente.
3. Marca tu propia incertidumbre en el campo "confianza": alta, media o baja.
   Todo lo que marques media o baja será revisado con lupa; no lo maquilles.
4. Prioriza Cuautla y Morelos. Si no encuentras nada local con certeza, deja
   esas capas fuera en lugar de rellenar.
5. Texto sobrio, dos o tres oraciones, sin adjetivos épicos.

${yaExiste ? `La hoja YA EXISTE con este contenido. Propón únicamente capas
NUEVAS que no dupliquen lo que ya está:\n\n${contenidoPrevio}` : 'La hoja no existe todavía.'}

Responde SÓLO con JSON válido, sin markdown ni preámbulo:
{"capas":[{"ambito":"Cuautla|Morelos|México|Mundo","anio":"1914",
"texto":"...","fuente":"...","confianza":"alta|media|baja"}]}`;

/* ---- llamada al modelo ----------------------------------------- */

async function investigar() {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: INSTRUCCION }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    }),
  });

  if (!r.ok) throw new Error(`La API respondió ${r.status}: ${await r.text()}`);

  const data = await r.json();
  const texto = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .replace(/```json|```/g, '')
    .trim();

  const inicio = texto.indexOf('{');
  const fin = texto.lastIndexOf('}');
  if (inicio === -1 || fin === -1) throw new Error('El modelo no devolvió JSON.');
  return JSON.parse(texto.slice(inicio, fin + 1));
}

/* ---- escribir la propuesta ------------------------------------- */

investigar()
  .then(({ capas }) => {
    if (!capas || !capas.length) {
      console.log(`Sin propuestas para el ${dia}. No se abre pull request.`);
      return;
    }

    const hoy = new Date().toISOString().slice(0, 10);
    const cuerpo = `---
dia: ${dia}
actualizado: ${hoy}
capas:
${capas.map(c => `  - ambito: ${c.ambito}
    anio: "${c.anio}"
    texto: "${String(c.texto).replace(/"/g, "'")}"`).join('\n')}
fuentes:
${capas.map(c => `  - "${String(c.fuente).replace(/"/g, "'")} [SIN VERIFICAR]"`).join('\n')}
---

<!-- PROPUESTA AUTOMÁTICA · NO PUBLICADA · ${hoy}

Confianza declarada por el agente, capa por capa:
${capas.map((c, i) => `  ${i + 1}. ${c.ambito} ${c.anio} → ${c.confianza}`).join('\n')}

Para aprobar: comprueba cada fuente, borra las marcas [SIN VERIFICAR],
reescribe el texto con voz propia y mueve este archivo a
contenido/efemerides/${dia}.md

Para rechazar: cierra el pull request. No cuesta nada.
-->
`;

    const destino = path.join(__dirname, '..', 'contenido', 'propuestas');
    fs.mkdirSync(destino, { recursive: true });
    fs.writeFileSync(path.join(destino, `${dia}.md`), cuerpo);
    console.log(`Propuesta escrita para el ${dia}: ${capas.length} capas candidatas.`);
  })
  .catch(err => {
    console.error('El agente no pudo proponer:', err.message);
    process.exit(1);
  });
