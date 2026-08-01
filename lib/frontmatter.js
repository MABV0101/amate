/* ---------------------------------------------------------------
   Amate · front-matter
   Subconjunto de YAML compartido por el generador y los agentes,
   para que ambos lean y escriban exactamente el mismo formato.
   --------------------------------------------------------------- */

function limpiaValor(v) {
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

function leerFrontMatter(texto) {
  if (!texto.startsWith('---')) return { datos: {}, cuerpo: texto };
  const fin = texto.indexOf('\n---', 3);
  if (fin === -1) return { datos: {}, cuerpo: texto };

  const bloque = texto.slice(3, fin).split('\n');
  const cuerpo = texto.slice(fin + 4).replace(/^\n/, '');
  const datos = {};
  let claveActual = null;
  let objetoActual = null;

  for (const linea of bloque) {
    if (!linea.trim() || linea.trim().startsWith('#')) continue;
    const sangria = linea.length - linea.trimStart().length;
    const t = linea.trim();

    if (sangria === 0) {
      const i = t.indexOf(':');
      if (i === -1) continue;
      const clave = t.slice(0, i).trim();
      const valor = t.slice(i + 1).trim();
      if (valor === '') {
        // Puede ser lista o mapa: se decide al ver la primera línea sangrada.
        datos[clave] = null; claveActual = clave; objetoActual = null;
      } else { datos[clave] = limpiaValor(valor); claveActual = null; }
      continue;
    }

    if (!claveActual) continue;

    // Primera línea sangrada: define si la clave era lista o mapa.
    if (datos[claveActual] === null) {
      datos[claveActual] = t.startsWith('- ') ? [] : {};
    }

    // Mapa anidado de un nivel: clave: / sub: valor
    if (!Array.isArray(datos[claveActual])) {
      const i = t.indexOf(':');
      if (i > 0) datos[claveActual][t.slice(0, i).trim()] = limpiaValor(t.slice(i + 1));
      continue;
    }

    if (t.startsWith('- ')) {
      const resto = t.slice(2).trim();
      const i = resto.indexOf(':');
      if (i > 0 && !resto.slice(0, i).includes(' ')) {
        objetoActual = { [resto.slice(0, i).trim()]: limpiaValor(resto.slice(i + 1)) };
        datos[claveActual].push(objetoActual);
      } else {
        datos[claveActual].push(limpiaValor(resto));
        objetoActual = null;
      }
    } else if (objetoActual) {
      const i = t.indexOf(':');
      if (i > 0) objetoActual[t.slice(0, i).trim()] = limpiaValor(t.slice(i + 1));
    }
  }
  for (const k of Object.keys(datos)) if (datos[k] === null) datos[k] = [];
  return { datos, cuerpo };
}

/* Serializa de vuelta. Las cadenas siempre entrecomilladas y con las
   comillas dobles internas cambiadas por simples: es la única forma de
   que un texto redactado por un modelo no rompa el archivo. */

function comilla(v) {
  return `"${String(v).replace(/"/g, "'").replace(/\r?\n/g, ' ').trim()}"`;
}

function escribirFrontMatter(datos, cuerpo = '') {
  const lineas = [];
  for (const [clave, valor] of Object.entries(datos)) {
    if (Array.isArray(valor)) {
      lineas.push(`${clave}:`);
      for (const item of valor) {
        if (item && typeof item === 'object') {
          const claves = Object.entries(item);
          claves.forEach(([k, v], i) => {
            lineas.push(`${i === 0 ? '  - ' : '    '}${k}: ${comilla(v)}`);
          });
        } else {
          lineas.push(`  - ${comilla(item)}`);
        }
      }
    } else if (valor && typeof valor === 'object') {
      lineas.push(`${clave}:`);
      for (const [k, v] of Object.entries(valor)) {
        if (v !== undefined && v !== null && v !== '') lineas.push(`  ${k}: ${comilla(v)}`);
      }
    } else {
      lineas.push(`${clave}: ${valor}`);
    }
  }
  return `---\n${lineas.join('\n')}\n---\n\n${cuerpo}`.trimEnd() + '\n';
}

module.exports = { leerFrontMatter, escribirFrontMatter, limpiaValor };
