/* ---------------------------------------------------------------
   Amate · anclas de búsqueda local
   El agente no encuentra Morelos con búsquedas genéricas: la web
   devuelve lo más indexado y eso nunca es historia municipal.
   Estas listas le dan por dónde entrar y con qué variar consultas.
   Amplíalas con lo que vayas descubriendo: cada ancla nueva
   aumenta la cobertura local del calendario.
   --------------------------------------------------------------- */

const MUNICIPIOS = [
  'Cuautla', 'Cuernavaca', 'Jiutepec', 'Temixco', 'Yautepec', 'Ayala',
  'Jojutla', 'Zacatepec', 'Tlaquiltenango', 'Puente de Ixtla', 'Xochitepec',
  'Emiliano Zapata', 'Tepoztlán', 'Tlayacapan', 'Totolapan', 'Atlatlahucan',
  'Yecapixtla', 'Ocuituco', 'Tetela del Volcán', 'Zacualpan de Amilpas',
  'Temoac', 'Jantetelco', 'Jonacatepec', 'Axochiapan', 'Tepalcingo',
  'Tlaltizapán', 'Amacuzac', 'Tetecala', 'Coatlán del Río', 'Mazatepec',
  'Miacatlán', 'Huitzilac', 'Tlalnepantla', 'Hueyapan', 'Coatetelco',
  'Xoxocotla',
];

/* Las haciendas azucareras estructuraron la historia económica y la
   guerra en Morelos. Buena parte de la documentación existente las
   nombra a ellas, no a los municipios. */
const HACIENDAS = [
  'Chinameca', 'Hospital', 'Cuahuixtla', 'Santa Inés', 'Tenextepango',
  'Calderón', 'San Carlos Borromeo', 'Atlihuayán', 'Oacalco', 'Pantitlán',
  'Temilpa', 'Treinta', 'Zacatepec', 'San Nicolás Obispo', 'Coahuixtla',
  'Guadalupe', 'Actopan', 'Casasano', 'Cocoyoc', 'San Gabriel las Palmas',
];

const FIGURAS = [
  'Emiliano Zapata', 'Eufemio Zapata', 'Genovevo de la O', 'Otilio Montaño',
  'Amador Salazar', 'Francisco Mendoza', 'Lorenzo Vázquez',
  'Antonio Barona', 'Gildardo Magaña', 'Marciano Silva',
  'José María Morelos', 'Mariano Matamoros', 'Hermenegildo Galeana',
  'Leonardo Bravo', 'Vicente Estrada Cajigal', 'Elena Cepeda',
  'Rubén Jaramillo', 'Epifanio Zapata', 'Maurilio Mejía',
];

const EPISODIOS = [
  'Sitio de Cuautla 1812', 'Plan de Ayala 1911', 'Chinameca 1919',
  'Ley Agraria zapatista 1915', 'Convención de Aguascalientes zapatistas',
  'Ejército Libertador del Sur', 'reparto agrario Morelos',
  'ingenio de Zacatepec', 'huelga cañera Morelos',
  'erección del estado de Morelos 1869', 'reconcentración de Robles 1916',
  'ferrocarril interoceánico Cuautla', 'balneario Agua Hedionda',
  'zona arqueológica Xochicalco', 'convento de Tepoztlán',
  'movimiento jaramillista', 'Universidad Autónoma del Estado de Morelos',
];

/* Repositorios que sí tienen material mexicano y morelense en línea.
   Nombrarlos importa: sin esto el agente hace una búsqueda abierta y
   cae en blogs de efemérides copiadas entre sí. */
const REPOSITORIOS = [
  'Hemeroteca Nacional Digital de México (hndm.unam.mx)',
  'Memórica México (memoricamexico.gob.mx)',
  'INEHRM (inehrm.gob.mx)',
  'Mediateca INAH (mediateca.inah.gob.mx)',
  'Archivo General de la Nación (gob.mx/agn)',
  'Periódico Oficial "Tierra y Libertad" del Estado de Morelos',
  'Congreso del Estado de Morelos (congresomorelos.gob.mx)',
  'Repositorio institucional de la UAEM (riaa.uaem.mx)',
  'Biblioteca Digital Mexicana',
  'Google Books, para la historiografía zapatista publicada',
];

/* Devuelve un puñado rotado por día del año, para que dos días
   consecutivos no repitan las mismas consultas. */
function anclas(dia) {
  const semilla = parseInt(String(dia).replace('-', ''), 10) || 1;
  const toma = (lista, n) => {
    const salida = [];
    for (let i = 0; i < n; i++) {
      salida.push(lista[(semilla * (i + 3)) % lista.length]);
    }
    return [...new Set(salida)];
  };
  return {
    municipios: toma(MUNICIPIOS, 6),
    haciendas: toma(HACIENDAS, 4),
    figuras: toma(FIGURAS, 4),
    episodios: toma(EPISODIOS, 4),
  };
}

module.exports = {
  MUNICIPIOS, HACIENDAS, FIGURAS, EPISODIOS, REPOSITORIOS, anclas,
};
