/* Extractor robusto: recorre el texto contando llaves, respetando cadenas
   y escapes, y devuelve TODOS los objetos JSON balanceados que encuentre.
   Luego elige el que traiga la clave esperada. Recortar de la primera a la
   última llave falla en cuanto el modelo escribe algo después del JSON. */
function extraerJSON(texto, claveEsperada) {
  const candidatos = [];
  let inicio = -1, prof = 0, enCadena = false, escape = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enCadena) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') { enCadena = true; continue; }
    if (c === '{') { if (prof === 0) inicio = i; prof++; continue; }
    if (c === '}') {
      prof--;
      if (prof === 0 && inicio !== -1) {
        candidatos.push(texto.slice(inicio, i + 1));
        inicio = -1;
      }
      if (prof < 0) prof = 0;
    }
  }

  const analizados = [];
  for (const c of candidatos) {
    try { analizados.push(JSON.parse(c)); } catch { /* fragmento inválido */ }
  }
  if (!analizados.length) throw new Error('No se encontró JSON válido en la respuesta.');

  if (claveEsperada) {
    const conClave = analizados.filter(o => Object.hasOwn(o, claveEsperada));
    if (conClave.length) return conClave[conClave.length - 1];
  }
  return analizados[analizados.length - 1];
}
module.exports = { extraerJSON };
