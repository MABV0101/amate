# Amate · Crónicas de Morelos

Portal de crónica, memoria oral y acervo documental. Sitio estático sin
dependencias: el generador es un solo archivo de Node sin librerías externas,
para que siga compilando dentro de diez años aunque el ecosistema de paquetes
cambie por completo.

---

## Cómo se guarda lo anterior

Esta es la decisión central del proyecto. Hay cuatro capas de permanencia.

### 1. Las efemérides son perpetuas, no periódicas

Un archivo por día del calendario: `contenido/efemerides/07-28.md`. Un máximo
de 366 archivos en toda la vida del portal.

Cuando llegue el 28 de julio de 2027 **no se crea un archivo nuevo**: se abre
el mismo y se le agrega una capa más a la lista `capas`. Lo de 1914 se queda
donde estaba. La hoja crece hacia abajo cada año y nunca se vacía.

Esto resuelve el problema que mata a los portales de historia local: no
necesitas producir contenido diario para tener portada diaria. El día tres del
segundo año, la hoja ya es mejor que el día tres del primero.

### 2. Las crónicas son acumulativas y de dirección permanente

Cada pieza es un archivo con fecha en el nombre y una dirección propia que
**nunca cambia**. Se apilan solas en `/archivo/`, agrupadas por año.

Si una pieza tiene un error, la corrección se agrega al pie con su fecha y el
texto original no se borra. Un archivo que se edita en silencio deja de ser un
archivo. Si alguna vez hubiera que mover una ruta, se agrega una redirección
301 en `netlify.toml` y la dirección vieja sigue respondiendo.

### 3. Git guarda cada versión de cada texto

Como el contenido son archivos de texto plano en un repositorio, cada
corrección queda registrada con fecha, autor y el texto exacto de antes y
después. Puedes recuperar cualquier crónica tal como estaba en cualquier
momento. Esto también te sirve legalmente: es una bitácora verificable de
quién publicó qué y cuándo.

### 4. Netlify guarda cada despliegue completo

Cada vez que se publica algo, Netlify conserva una copia inmutable del sitio
entero con su propia dirección permanente (*deploy permalink*). Puedes abrir
el portal tal como se veía cualquier día del pasado. En el panel:
**Deploys → cualquier despliegue → Preview**.

### Respaldo externo recomendado

Además de lo anterior, cada seis meses conviene:

- Clonar el repositorio a un disco físico (`git clone --mirror`).
- Registrar la portada y el archivo en el **Internet Archive**
  (`web.archive.org/save/`), que da una copia fuera de tu control y por tanto
  fuera del alcance de un cambio de administración.
- Si el acervo de imágenes crece, sacarlo del repositorio a almacenamiento
  aparte y dejar sólo las fichas. Git no está hecho para miles de fotografías
  pesadas.

---

## Publicar en Netlify

### Primera vez

1. Sube esta carpeta a un repositorio de GitHub (privado o público, da igual).
2. En Netlify: **Add new site → Import an existing project → GitHub**.
3. Netlify lee `netlify.toml` y ya trae la configuración correcta:
   - Build command: `node build.js`
   - Publish directory: `_publicado`
4. **Deploy.** Tarda unos segundos porque no hay `npm install`.

### Dominio

En **Domain settings** conectas `amate.mx` o el que registres. Netlify da el
certificado HTTPS gratis. Mientras tanto funciona en `amate.netlify.app`.

Cambia también la constante `SITIO.url` en `build.js` cuando tengas el dominio
definitivo: de ahí salen el sitemap, el RSS y las etiquetas canónicas.

### Escritorio del cronista

Para que los cronistas publiquen desde el navegador, sin Git ni terminal:

1. En Netlify: **Site configuration → Identity → Enable Identity**.
2. **Identity → Registration → Invite only** (importante: si lo dejas abierto,
   cualquiera se registra y publica).
3. **Identity → Services → Git Gateway → Enable**.
4. En `admin/config.yml`, cambia `usuario/amate` por tu repositorio real.
5. Invita a cada cronista por correo desde **Identity → Invite users**.

Entran en `tudominio.mx/admin/`. Escriben, adjuntan fotografías, y al guardar
la pieza entra como **borrador**: `publish_mode: editorial_workflow` obliga a
que alguien del consejo la apruebe antes de que salga. Ese es tu filtro
editorial, y es el que impide que el portal se convierta en boletín municipal.

---

## Agregar contenido a mano

### Una hoja de efeméride

`contenido/efemerides/MM-DD.md`

```
---
dia: 09-30
actualizado: 2026-09-30
capas:
  - ambito: Morelos
    anio: 1914
    texto: "Qué ocurrió, en dos o tres oraciones."
  - ambito: Mundo
    anio: 1791
    texto: "Lo mismo, para la capa lejana."
fuentes:
  - "Autor, *Obra*. Ciudad: Editorial, año."
---

Glosa del cronista, opcional. Aquí va el juicio, la duda o la pista de
investigación pendiente. Va aparte de las capas a propósito: los hechos
envejecen distinto que las interpretaciones.
```

Ámbitos válidos: `Cuautla`, `Morelos`, `México`, `Mundo`. El orden en que los
escribas es el orden en que se muestran; va de lo cercano a lo lejano.

### Una pieza

`contenido/cronicas/AAAA-MM-DD-titulo-en-guiones.md`

```
---
titulo: "El apantle de los limones"
fecha: 2026-07-20
autor: consejo-editorial
seccion: toponimia
lugar: Cuautla
resumen: "Dos líneas. Es lo que se ve en portada y en el buscador."
fuentes:
  - "Referencia."
borrador: false
---

Texto en markdown.
```

`seccion` acepta: `cronica`, `testimonio`, `acervo`, `toponimia`, `obituario`.
Cada una se pinta de un color distinto para que el lector sepa de entrada qué
tipo de verdad está leyendo. Poner `borrador: true` la deja fuera del sitio sin
borrar el archivo.

### Probar localmente

```
node build.js
npx serve _publicado      # o: python3 -m http.server -d _publicado 8000
```

---

## Estructura

```
amate/
├── build.js                 generador completo, sin dependencias
├── netlify.toml             configuración de despliegue y cabeceras
├── contenido/
│   ├── efemerides/          MM-DD.md · máximo 366, perpetuos
│   ├── cronicas/            AAAA-MM-DD-slug.md · acumulativos
│   └── autores/             slug.md
├── sitio/
│   ├── estilos.css
│   └── acervo/              imágenes subidas desde el CMS
├── admin/                   escritorio del cronista (Decap CMS)
└── _publicado/              salida generada; no se versiona
```

Lo que genera: portada con la hoja del día, calendario perpetuo de los doce
meses, página por hoja, página por pieza, archivo por año, página por cronista,
buscador de texto completo del lado del cliente, RSS, sitemap y 404.

La hoja del día se elige **en el navegador** contra la fecha del lector, no en
el momento de compilar. Por eso la portada muestra el día correcto aunque no
hayas publicado nada en semanas y aunque el sitio esté servido desde caché.

---

## Diseño

Identidad de papel de corteza y pigmentos de códice. Fondo ocre fibroso, tinta
de corteza, y tres pigmentos que codifican información real, no decoración:
**grana cochinilla** para lo local, **añil** para lo nacional, **verde de caña**
para lo mundial. El mismo código de color aparece en el filete lateral de la
hoja del día y en las etiquetas de sección.

Tipografía: Fraunces para los títulos y el numeral del día, Newsreader para el
cuerpo de las crónicas, IBM Plex Mono para folios, fechas y etiquetas — la voz
del archivista frente a la voz del narrador.

---

## Publicación diaria automática

"Automático" son tres cosas distintas. Dos convienen, una no.

### Lo que ya es automático

La hoja del día rota sola contra la fecha del lector, en el navegador. El
portal amanece distinto todos los días aunque nadie lo toque en un mes. No
requiere servidor, cron ni infraestructura de ningún tipo.

### Boletín diario · `.github/workflows/boletin-diario.yml`

Todos los días a las 6:00 a.m. de Morelos reconstruye el sitio y envía la hoja
del día a un canal de Telegram y/o a una lista de correo. Si ese día no hay
hoja, no envía nada: más vale silencio que boletín vacío.

El generador deja además un archivo de texto plano por día en
`/boletin/MM-DD.txt`. Como es estático, **cualquier bot puede consumirlo sin
API ni servidor**: basta pedir `https://amate.mx/boletin/07-28.txt`. Sirve
igual para un bot de WhatsApp, una pantalla en la presidencia municipal o un
programa de radio local que lea la efeméride al aire.

Secretos a configurar en GitHub (*Settings → Secrets and variables → Actions*):
`TELEGRAM_TOKEN`, `TELEGRAM_CANAL`, y opcionalmente `CORREO_USUARIO`,
`CORREO_CLAVE`, `CORREO_LISTA`. Los pasos que no tengan secreto configurado se
saltan solos.

También se publica `/estado-archivo.json` con la lista de días del calendario
que siguen sin hoja: es el mapa de trabajo pendiente del portal.

### Publicación automática · `.github/workflows/publicar-automatico.yml`

El agente investiga, verifica y **publica solo**, sin esperar a nadie. Corre a
las 3:00 a.m. sobre la fecha de mañana, para que lo publicado ya esté en el
sitio al amanecer.

Lo que hace que esto sea defendible y no una máquina de inventar fechas:

**Falla cerrada.** Ante cualquier duda no publica. Si el proceso se rompe, sale
con error y no escribe nada. Un día vacío en el calendario no cuesta nada; un
dato falso en un archivo permanente cuesta la credibilidad de las otras
trescientas hojas, retroactivamente.

**Nada de memoria.** La primera pasada sólo puede proponer hechos que confirmó
en una página consultada en esa sesión, con la URL y la frase exacta que los
respalda. Lo que no encontró buscando, no existe.

**Segunda pasada adversarial.** Una llamada independiente, que no ve el
razonamiento de la primera, con la instrucción explícita de *desmentir*: asume
que la afirmación es falsa hasta que la fuente demuestre lo contrario. Se le
insiste en el error más común y más difícil de detectar, que no es el hecho
inventado sino **el hecho real fechado en el día equivocado**.

**Corroboración independiente obligatoria.** No basta que la fuente alegada
diga lo que se le atribuye: hace falta una segunda fuente distinta. Si sólo hay
una, se descarta.

**Frontera de 1990.** Nada posterior se publica sin humano. Es la línea entre
historia y actualidad, y es la que protege contra el daño a personas vivas —
donde un error automático deja de ser un problema editorial y pasa a ser uno
legal. Tampoco se publica nada sobre funcionarios en activo ni sobre causas
judiciales.

**Procedencia a la vista.** Cada capa lleva su sello. Continuo y verde:
comprobada por un cronista. Punteado y gris: verificación automática, con
enlace a la fuente, y la hoja completa muestra un aviso. El lector siempre sabe
qué está leyendo. Esto es lo que permite automatizar sin mentir: no se lava
salida de máquina bajo la firma de un cronista.

**Auditoría posterior obligatoria.** Cada tanda publicada abre un *issue* con
la bitácora completa de qué se propuso, qué se rechazó y por qué. Cuando el
cronista confirma una capa, cambia `verificacion: "automatica"` por
`"humana"` y el sello del sitio cambia solo. Se publica sin esperar al humano,
pero el humano llega. Si algo no resiste, se borra del archivo y se anota en el
cuerpo de la hoja: nunca en silencio.

Requiere el secreto `ANTHROPIC_API_KEY`. Para probarlo antes de dejarlo suelto,
lánzalo a mano desde *Actions → Publicación automática → Run workflow* con un
día concreto, y revisa el `resumen-agente.json` que deja.

### Cómo endurecerlo con el tiempo

- Sube `ANIO_LIMITE` en `agente/publicar.js` si quieres ser más conservador.
- Exige dos corroboraciones en vez de una: es un cambio de una línea en el
  filtro `pasa`.
- Limita las fuentes admisibles a una lista blanca (hemeroteca, AGN, INEHRM,
  repositorios universitarios) y rechaza todo lo demás. Es la mejora que más
  reduce el error por unidad de esfuerzo.
- Cada tanto, audita una hoja vieja al azar. Si aparece un error que las dos
  pasadas dejaron pasar, ese es el momento de apretar el filtro, no después.


---

## Antes de lanzar

- [ ] Consultar disponibilidad del título **Amate** en el registro de Reserva
      de Derechos al Uso Exclusivo ante INDAUTOR. La reserva se otorga por
      título de publicación periódica, no por dominio, e incluye las digitales.
      Hazlo **antes** de registrar el dominio y mandar hacer el logotipo.
- [ ] Publicar el criterio editorial en una página fija, con la política de
      corrección de errores y la distinción entre documento, memoria y opinión.
- [ ] Definir por escrito la licencia de las fotografías de acervo familiar:
      licencia expresa firmada por quien la aporta, nunca presunción.
- [ ] Revisar datos personales de terceros vivos que aparezcan en actas,
      expedientes o padrones antes de publicarlos.
- [ ] Convenio de resguardo con el archivo estatal o una universidad, para que
      el acervo digitalizado tenga una segunda casa institucional.

---

Textos bajo licencia CC BY-SA 4.0. El código del generador es libre.
