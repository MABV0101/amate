/* ---------------------------------------------------------------
   Amate · limpieza única
   Corre UNA VEZ para quitar del calendario ya publicado lo que el
   parche de hoy hubiera evitado si hubiera existido antes:

   1. Imágenes de ruido visual (montajes/collages, mapas, escudos).
   2. Capas que sólo registran la fundación administrativa de una
      localidad ("Manzanillo (gran ciudad), en Municipio de...") sin
      ninguna narrativa. Ya no se generan desde hoy; esto limpia las
      que quedaron de antes.

   Uso:  node agente/limpiar.js
   --------------------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const { leerFrontMatter, escribirFrontMatter } = require('../lib/frontmatter');

const RUIDO = /(locator|location_map|map_of|mapa_de|coat_of_arms|escudo|flag_|bandera|logo|seal_|\.svg|blank|outline|chart|diagram|montaje|montage|collage|composite)/i;

/* Mismo patrón que producía la consulta P571 ya retirada: nombre propio
   seguido de un paréntesis de tipo administrativo, terminando en "en
   Municipio de..." o similar. No coincide con hechos reales (batallas,
   tratados, nacimientos, muertes), que tienen otra forma. */
const TIPOS_ADMINISTRATIVOS = /\((?:gran ciudad|ciudad|localidad de México|pueblo|villa|municipio de México)\)/i;

function esCapaAdministrativaVacia(capa) {
  const t = String(capa.texto || '');
  return TIPOS_ADMINISTRATIVOS.test(t) && /,\s*en\s+/i.test(t);
}

const dir = path.join(__dirname, '..', 'contenido', 'efemerides');
const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

let totalImagenesQuitadas = 0;
let totalCapasQuitadas = 0;
let archivosTocados = 0;

for (const f of archivos) {
  const ruta = path.join(dir, f);
  const { datos, cuerpo } = leerFrontMatter(fs.readFileSync(ruta, 'utf8'));
  if (!Array.isArray(datos.capas)) continue;

  let cambio = false;
  const capas = [];

  for (const capa of datos.capas) {
    // 1. capa que sólo es fundación administrativa: se quita entera
    if (esCapaAdministrativaVacia(capa)) {
      console.log(`  ✗ ${f}: quitada capa administrativa — "${capa.texto}"`);
      totalCapasQuitadas++;
      cambio = true;
      continue;
    }

    // 2. imagen de ruido dentro de una capa que sí se conserva: se quita
    //    sólo la imagen, el texto se queda.
    if (capa.imagen_archivo && RUIDO.test(capa.imagen_archivo)) {
      console.log(`  ✗ ${f}: quitada imagen de ruido — ${capa.imagen_archivo}`);
      delete capa.imagen_archivo;
      delete capa.imagen_origen;
      delete capa.imagen_autor;
      delete capa.imagen_fecha;
      delete capa.imagen_licencia;
      delete capa.imagen_contexto;
      totalImagenesQuitadas++;
      cambio = true;
    }

    capas.push(capa);
  }

  if (!cambio) continue;
  archivosTocados++;
  fs.writeFileSync(ruta, escribirFrontMatter({ ...datos, capas }, cuerpo));
}

console.log('');
console.log(`Archivos revisados: ${archivos.length}`);
console.log(`Archivos modificados: ${archivosTocados}`);
console.log(`Capas administrativas quitadas: ${totalCapasQuitadas}`);
console.log(`Imágenes de ruido quitadas: ${totalImagenesQuitadas}`);
