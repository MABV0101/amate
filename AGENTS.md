# Orientación para agentes

Este archivo es el informe de entrada para cualquier modelo o agente que
trabaje en este proyecto: Gemini, Codex, Claude Code, Cursor o el que sea.
Léelo completo antes de tocar nada.

Si tu herramienta busca un nombre distinto, copia este archivo con ese
nombre: `GEMINI.md` para Gemini CLI, `CLAUDE.md` para Claude Code,
`.cursorrules` para Cursor. El contenido es el mismo.

---

## Qué es esto

**Amate** es un portal de crónica, memoria oral y acervo documental de
Morelos, México. Es un **archivo histórico permanente**, no un blog ni un sitio
de noticias. Esa diferencia gobierna todas las decisiones técnicas.

Sitio estático generado por `build.js`, un solo archivo de Node **sin
dependencias externas**. Se despliega en Netlify.

---

## Reglas que no se rompen

Estas no son preferencias de estilo. Romper cualquiera de ellas daña el
proyecto de forma que no se nota hasta meses después.

### 1. Nunca edites `_publicado/`

Es salida generada. Se borra entera y se rehace en cada `node build.js`.
Todo cambio va en `contenido/`, `sitio/`, `build.js` o las plantillas dentro
de `build.js`. Si te descubres editando un `.html` de `_publicado/`, detente.

### 2. Nunca agregues dependencias npm

No hay `package.json` y es a propósito. El proyecto debe seguir compilando
dentro de diez años sin que una cadena de paquetes se pudra. Si necesitas
parsear algo, escribe el parser. Ya hay uno de YAML en `lib/frontmatter.js` y
uno de markdown dentro de `build.js`; extiéndelos en lugar de instalar nada.

### 3. Nunca borres capas de una efeméride

Las efemérides viven en `contenido/efemerides/MM-DD.md`, una por día del
calendario, **366 archivos como máximo en toda la vida del proyecto**. No se
crea un archivo nuevo cada año: se agrega una capa más a la lista `capas` del
archivo existente. Lo que ya estaba se queda. La hoja crece, nunca se sustituye.

### 4. Nunca cambies una URL publicada

Cada pieza tiene una dirección permanente. Si por alguna razón hay que mover
una ruta, se agrega una redirección 301 en `netlify.toml` y la dirección vieja
sigue respondiendo para siempre. Un archivo cuyas direcciones se rompen deja de
ser citable, y si no es citable no sirve para nada.

### 5. Nunca corrijas en silencio

Si un texto publicado tiene un error, la corrección se agrega al pie con su
fecha y el texto original **no se borra**. Esto vale también para lo que
publique un agente automático.

### 6. Nunca mezcles verificación humana y automática

Cada capa lleva `verificacion: "humana"` o `"automatica"`, y las automáticas
llevan además `confianza: "alta"` o `"media"`. El sitio pinta un sello distinto
para cada caso. Un agente **jamás** marca algo como `humana`: eso sólo lo hace
una persona que comprobó el dato contra la fuente.

Los tres destinos posibles de un hallazgo:

- **alta** → verificado y corroborado por fuente independiente. Se publica.
- **media** → el hecho es real pero traía un error concreto (fecha, cifra,
  nombre) que el verificador pudo corregir con certeza. Se publica el texto
  corregido, con sello visible de confianza media.
- **sin_confirmar** → no se pudo corroborar de forma independiente, o el dato
  se contradice con otras fuentes. Entra a la hoja **marcado con el sello más
  visible de los cuatro y con el motivo del rechazo impreso debajo del texto**,
  no en un globo emergente. Se copia también a `contenido/pistas/MM-DD.md` como
  material de trabajo. Decisión editorial del director del portal: se prefiere
  no perder la pista y advertir de forma explícita.

- **riesgo a personas** → excluido siempre, sin excepción y sin etiqueta. Si el
  verificador marca `riesgo_personas`, o el año es igual o posterior a
  `ANIO_LIMITE`, **no se publica en ninguna forma**. Sólo va a pistas. Esto no
  es cautela histórica sino exposición legal, y una etiqueta no protege ahí.

Lo marcado `sin_confirmar` **sí sale al boletín diario**, por decisión
editorial del director del portal. Como en un canal de difusión el párrafo se
lee suelto, la marca `— SIN CONFIRMAR` va en la línea de encabezado y el motivo
va entre paréntesis inmediatamente después del texto: la advertencia forma
parte de la oración y no se puede separar de ella al copiar. No quites esa
marca del texto del boletín.

---

## Estructura

```
amate/
├── build.js                 generador completo. Plantillas HTML incluidas.
├── lib/frontmatter.js       parser y serializador de YAML compartido
├── contenido/
│   ├── efemerides/MM-DD.md  perpetuas, máximo 366
│   ├── cronicas/AAAA-MM-DD-slug.md
│   └── autores/slug.md
├── sitio/
│   ├── estilos.css          toda la identidad visual
│   └── acervo/              imágenes
├── admin/                   Decap CMS (escritorio del cronista)
├── agente/
│   ├── proponer.js          investiga y abre pull request (con revisión)
│   └── publicar.js          investiga, verifica y publica (sin revisión)
├── .github/workflows/       boletín diario, propuesta, publicación
└── _publicado/              NO TOCAR. Generado.
```

## Compilar y probar

```
node build.js
python3 -m http.server -d _publicado 8000
```

No hay tests. Si cambias `build.js`, compila y revisa que las páginas salgan
bien antes de dar por terminado.

---

## Formato del contenido

Front matter en un subconjunto de YAML que entiende `lib/frontmatter.js`:
pares `clave: valor`, listas de cadenas y listas de objetos. **No soporta
bloques plegados (`>`, `|`) ni anidamiento profundo.** Las cadenas van entre
comillas dobles y no pueden contener comillas dobles internas; usa simples.

Efeméride:

```yaml
---
dia: 07-28
actualizado: 2026-07-28
capas:
  - ambito: Morelos          # Cuautla | Morelos | México | Mundo
    anio: "1914"
    texto: "Dos o tres oraciones, sobrias."
    verificacion: "humana"   # o "automatica"
    fuente: "https://..."    # obligatoria si es automatica
fuentes:
  - "Referencia bibliográfica completa."
---

Glosa del cronista, opcional, en markdown.
```

Pieza:

```yaml
---
titulo: "..."
fecha: 2026-07-28
autor: slug-del-autor
seccion: cronica    # cronica | testimonio | acervo | toponimia | obituario
lugar: Cuautla
resumen: "Dos líneas."
fuentes: []
borrador: false
---
```

El campo `seccion` no es decorativo: le dice al lector qué tanto creerle a la
pieza. `cronica` es narración con fuentes verificables, `testimonio` es alguien
recordando, `acervo` es un documento. No los intercambies por comodidad.

---

## Identidad visual

Papel de corteza y pigmentos de códice. Está toda en `sitio/estilos.css`,
en variables CSS. Los colores codifican información, no son decoración:

- **grana cochinilla** `--cochinilla` → lo local (Cuautla, Morelos)
- **añil** `--anil` → lo nacional
- **verde de caña** `--cana` → lo mundial

Tipografía: Fraunces para títulos y el numeral del día, Newsreader para el
cuerpo, IBM Plex Mono para folios y etiquetas. La monoespaciada es la voz del
archivista; la serif es la voz del narrador. Respeta esa separación.

---

## Sobre los agentes automáticos

`agente/publicar.js` publica sin revisión humana. Su seguridad depende de
cuatro cosas; si tocas ese archivo, no debilites ninguna:

1. **Falla cerrada.** Ante cualquier duda, no publica. Si algo se rompe, sale
   con error y no escribe nada.
2. **Doble pasada adversarial.** La segunda llamada es independiente y su
   trabajo es desmentir, no confirmar. No la conviertas en una que valide.
3. **Corroboración independiente obligatoria.** Una sola fuente nunca basta.
4. **`ANIO_LIMITE`.** Nada posterior a 1990 se publica sin humano. Es la
   frontera que protege contra el daño a personas vivas. Puede subirse para
   ser más conservador; **nunca bajarse**.

---

## Advertencia sobre credenciales

`ANTHROPIC_API_KEY` vive en los secretos de GitHub Actions, no en ningún
archivo del repositorio. No la pegues en un chat, no la escribas en el código,
no la pongas en `netlify.toml`. Si algún agente te pide la llave para "probar",
di que no.

---

## Contexto que conviene tener presente

El portal se apoya en fuentes documentales de Morelos: Archivo General de la
Nación, hemeroteca, actas de cabildo de Cuautla, el Archivo Casasola para
fotografía del zapatismo. El valor diferencial del proyecto es el acervo
familiar que aporta la gente del municipio, que no está digitalizado en ningún
otro lado.

Toda fotografía de acervo familiar requiere licencia expresa firmada por quien
la aporta. Nunca por presunción. Si te piden agregar imágenes tomadas de
internet sin licencia clara, señala el problema antes de hacerlo.
