// Ejecuta el paquete construido y lo recorre entero.
//
//   npm run build && node scripts/verificar-panel.mjs
//
// Compilar no es verificar. Vite no falla si usas un identificador que no
// importaste: lo deja como variable global y revienta en el navegador. Ya
// pasó dos veces —`LogoutIcon` y `coincideCon`— y la segunda compiló sin una
// queja. Esto corre el paquete de verdad.
//
// Lo que recorre, y por qué cada cosa:
//
//   · Las TRES sesiones (sin sesión, sucursal, administrador). Media página
//     sólo existe con una de ellas.
//   · Las seis secciones del panel de administración.
//   · TODAS las cabeceras ordenables, no las primeras. La caída de la
//     pantalla en blanco se escapó porque la comprobación pulsaba cuatro y la
//     columna rota era la octava: una función guardada en `useState` que
//     React llamaba con `null`.
//
// Falla si en cualquier momento el contenido se vacía o la consola suelta un
// error de React.

import { readFileSync, existsSync } from 'node:fs'
// jsdom es CommonJS: sus clases no salen como exportaciones con nombre.
import jsdom from 'jsdom'
const { JSDOM, VirtualConsole } = jsdom
import path from 'node:path'

const RAIZ = path.resolve(import.meta.dirname, '..')
const DIST = path.join(RAIZ, 'dist')

if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error('No hay dist/. Corre `npm run build` primero.')
  process.exit(1)
}

const errores = []
const avisos = []

// ── Datos de mentira, con la forma de los de verdad ───────────────────────
//
// Con las tablas vacías no hay cabeceras que pulsar, y la comprobación que
// importa -pulsarlas TODAS- no comprueba nada. Estos productos existen para
// que las tablas se pinten enteras.

const MODELOS = [
  ['I13T',    'IPHONE 13 TPU CASE'],
  ['SGA16T',  'SAMSUNG A16 TPU CASE'],
  ['SGS23UT', 'SAMSUNG S23 ULTRA TPU CASE'],
  ['SGS23U3', 'SAMSUNG S23 ULTRA 3 IN 1'],
  ['MTG24T',  'MOTO G24 TPU CASE'],
  ['XRN13PT', 'XIAOMI REDMI NOTE 13 PRO TPU CASE'],
  ['I15PMT',  'IPHONE 15 PRO MAX TPU CASE'],
  ['OPR74GT', 'OPPO RENO 7 4G TPU CASE'],
  ['HX7CT',   'HONOR X7C TPU CASE'],
  ['MTST01',  'STIKER MARIPOSAS'],
]

const GENERADO = '2026-10-19T10:00:00Z'

const productos = MODELOS.map(([Codigo, Producto], i) => ({
  Codigo, Producto,
  Existencia: [34, 4, 0, 12, 7, 0, 91, 0, 25, 0][i],
  Precio: 55 + i * 3,
  Alta: `2025-${String(1 + (i % 12)).padStart(2, '0')}-14`,
}))

// La forma la fijan `estadisticaVacia` y `historialVacio` en
// src/lib/estadisticas.js: `dias` es una LISTA de { f, m }, no un número, y
// `periodos` otra de { p, m, dias }. Un número donde iba una lista tumbaba
// el panel entero con «302 is not iterable»; conviene que estos datos de
// mentira tengan la forma exacta, porque es justo lo que se comprueba.
const dia = (f, i) => ({ f, m: Object.fromEntries(MODELOS.map(([c], k) => [c, 1 + ((i + k) % 7)])) })

const estadisticas = {
  sucursal: 'leon', nombre: 'León', actualizado: '2026-10-19',
  catalogo: Object.fromEntries(MODELOS.map(([c, n]) => [c, n])),
  dias: ['2026-09-28', '2026-09-29', '2026-10-01', '2026-10-05', '2026-10-12'].map(dia),
}

const historial = {
  sucursal: 'leon', nombre: 'León', actualizado: '2026-10-19',
  catalogo: Object.fromEntries(MODELOS.map(([c, n]) => [c, n])),
  periodos: ['2025-10', '2025-11', '2025-12', '2026-09', '2026-10'].map((p, i) => ({
    p,
    m: Object.fromEntries(MODELOS.map(([c], k) => [c, 10 + ((i + k) % 23)])),
    dias: [{ f: `${p}-05`, n: 30 }],
    desde: `${p}-01`, hasta: `${p}-28`, diasCubiertos: 28,
  })),
}

const turnos = {
  generado: '2026-10-13',
  registros: MODELOS.slice(0, 6).map(([c], i) => ({
    sucursal: ['leon', 'slp', 'ags'][i % 3],
    empleado: ['Brenda', 'André', 'Cesáreo'][i % 3],
    fecha: `2026-10-0${i + 1}`,
    entrada: ['10:28', '10:43', '10:02'][i % 3],
  })),
}

/** Lo que devuelve cada ruta, según lo que pida. */
function respuesta(url) {
  const u = String(url)
  if (/indice\.json/.test(u)) {
    return { mockups: MODELOS.map(([codigo, nombre], i) => ({ codigo, nombre, archivo: `${codigo}.png`, piezas: 200 - i * 10 })) }
  }
  if (/estadistica/i.test(u)) return estadisticas
  if (/historial/i.test(u)) return historial
  if (/turnos/i.test(u)) return turnos
  // Las respuestas de la cola viven en el backend, no en S3 publico.
  if (/revisiones/i.test(u)) return { marcas: {} }
  if (/site\.json|config/i.test(u)) return {}
  const plaza = u.match(/inventarios\/([a-z-]+)\/inventario\.json/)?.[1]
  if (plaza) return inventarioDe(plaza)
  return { productos, generado: GENERADO }
}

/**
 * El inventario de una plaza, con las diferencias que la cola de revisión
 * tiene que encontrar.
 *
 * Devolver el MISMO inventario a las cinco plazas dejaba la cola vacía, y una
 * cola vacía no pinta ninguna ficha: la tabla, los botones y el avance no se
 * ejecutaban nunca. La sección pasaba por verde sin haber comprobado nada.
 */
// Los que bodega no tiene. HX7CT conserva piezas, así que se pregunta solo;
// los demás están en cero y se preguntan en bloque, que es otra ficha
// distinta -con su lista desplegable- y si no hay tres no se dibuja nunca.
//
// El MTST01 está aquí para que NO salga: es un sticker, y lo que bodega
// fabrica no es un huérfano. Si alguien quitara esa regla, este código
// aparecería en la lista de «bórrense» y los lotes pasarían a ser otros.
//
// Ninguno puede ser de los SAMSUNG: quitarle uno a bodega dejaba el patrón de
// escritura en dos códigos, por debajo del mínimo, y esa tercera ficha -la de
// la tabla con porcentajes- dejaba de pintarse sin que nada fallara.
const SIN_BODEGA = ['HX7CT', 'XRN13PT', 'MTST01', 'OPR74GT']

const TIENDAS = ['leon', 'san-luis', 'aguascalientes', 'ferias']

/**
 * Códigos que sólo tienen las tiendas, para que se dibujen los lotes.
 *
 * Un lote es una pregunta que ordena muchos códigos de golpe, y **se deshace
 * si no junta tres**. Por eso van de tres en tres: con dos, la ficha del lote
 * no se pinta y la comprobación pasa en verde sin haberla ejecutado, que es
 * justo el fallo que esta comprobación existe para evitar.
 *
 * Cada terna dibuja una clase distinta, y las cuatro se redactan aparte:
 *   · color   — bodega tiene el I13T; las tiendas, el mismo en tres colores
 *   · varias  — dos plazas o más lo tienen y nadie lo ha vendido en años
 *   · una     — queda suelto en un solo mostrador
 *   · sin existencia — la cuarta sale de SIN_BODEGA, que están en cero
 *
 * Ninguno lleva nombre SAMSUNG: estos códigos no están en bodega, y meter uno
 * movería las cuentas del patrón de escritura, que es otra ficha.
 */
const HUERFANOS = [
  ['I13MOT',  'IPHONE 13 MORADO TPU CASE',   3, '2026-09-10', TIENDAS],
  ['I13VT',   'IPHONE 13 VERDE TPU CASE',    2, '2026-09-11', TIENDAS],
  ['I13ST',   'IPHONE 13 SALMON TPU CASE',   1, '2026-09-12', TIENDAS],

  ['HP20LT',  'HUAWEI P20 LITE TPU CASE',    4, '2024-03-02', ['leon', 'ferias']],
  ['HM20PT',  'HUAWEI MATE 20 PRO TPU CASE', 3, '2024-04-05', ['leon', 'san-luis']],
  ['OPA12H',  'OPPO A12 HARD CASE',          2, '2024-05-06', ['ferias', 'aguascalientes']],

  ['MTOP30T', 'MOTOROLA ONE P30 TPU CASE',   2, '2024-06-07', ['ferias']],

  // En cero en todas: con los dos de SIN_BODEGA que están a cero hacen las
  // tres que el lote necesita para dibujarse.
  ['LGQ6T',   'LG Q6 TPU CASE',              0, '2023-02-02', TIENDAS],
  ['HNY91T',  'HUAWEI NOVA Y91 TPU CASE',    1, '2024-07-08', ['ferias']],
  ['R11PPT',  'REALME 11 PRO PLUS TPU CASE', 1, '2024-08-09', ['ferias']],
]

function inventarioDe(plaza) {
  // Bodega escribe GALAXY donde las tiendas escriben SAMSUNG. Es el patrón
  // real del catálogo, y la ficha que más renglones ordena de una vez.
  if (plaza === 'bodega') {
    return {
      productos: productos
        .filter(p => !SIN_BODEGA.includes(p.Codigo))
        .map(p => ({ ...p, Producto: p.Producto.replace(/^SAMSUNG\b/, 'GALAXY') })),
      generado: GENERADO,
    }
  }
  return {
    productos: [
      // Todos con venta reciente a propósito. El HX7CT es el único de
      // SIN_BODEGA que conserva piezas, y vendiéndose no entra en ningún
      // lote: se queda como pregunta suelta, que es la otra clase de ficha.
      // Dándole fecha vieja se lo tragaba el lote y la comprobación dejaba de
      // pintar una ficha individual sin que nada fallara.
      ...productos.map(p => ({ ...p, UltimoMov: '2026-10-18' })),
      ...HUERFANOS
        .filter(([, , , , donde]) => donde.includes(plaza))
        .map(([Codigo, Producto, Existencia, UltimoMov]) => ({
          Codigo, Producto, Existencia, UltimoMov, Precio: 60, Alta: '2024-01-10',
        })),
    ],
    generado: GENERADO,
  }
}

// ── El arranque ────────────────────────────────────────────────────────────

/**
 * Levanta el paquete en jsdom con la sesión dada.
 *
 * jsdom NO aplica la política de seguridad de contenido, así que un guion en
 * línea bloqueado en el navegador aquí corre tan campante. Por eso esta
 * comprobación no sustituye mirar la página servida; detecta otra clase de
 * fallo: el que revienta al ejecutar.
 */
async function arrancar(sesion) {
  const consola = new VirtualConsole()
  const dichos = []
  consola.on('jsdomError', e => dichos.push(e.message))
  consola.on('error', (...a) => dichos.push(a.map(String).join(' ')))

  // La hoja de estilos se quita: jsdom no maqueta, así que no aporta nada y
  // en cambio intenta ir a buscarla a la red y ensucia la consola con un
  // error que no es de la página.
  const bruto = readFileSync(path.join(DIST, 'index.html'), 'utf8')
  const html = bruto.replace(/<link[^>]+rel="stylesheet"[^>]*>/g, '')
  const dom = new JSDOM(html, {
    url: 'https://istuffsbajio.com/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: consola,
  })

  const { window } = dom

  if (sesion) window.sessionStorage.setItem('istuffs_session', JSON.stringify(sesion))

  // Nada de red: el inventario vive en S3 y aquí no se va a buscar. Lo que
  // se devuelve tiene la forma de lo real para que las tablas se pinten.
  window.fetch = url => {
    const cuerpo = respuesta(url)
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve(cuerpo),
      text: () => Promise.resolve(JSON.stringify(cuerpo)),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    })
  }
  window.IntersectionObserver = class {
    constructor(fn) { this.fn = fn }
    observe(el) { this.fn([{ target: el, isIntersecting: true }], this) }
    unobserve() {} disconnect() {}
  }
  window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  window.scrollTo = () => {}
  window.HTMLElement.prototype.scrollIntoView = () => {}

  // El paquete se carga a mano: jsdom no ejecuta los <script type=module>.
  const js = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1]
  if (!js) throw new Error('No encuentro el bundle en dist/index.html')
  const codigo = readFileSync(path.join(DIST, js.replace(/^\//, '')), 'utf8')

  // Los módulos se transforman a guion normal quitando el export final, que
  // es lo único que jsdom no digiere de un bundle de Vite.
  window.eval(codigo.replace(/\bexport\s*\{[^}]*\};?\s*$/, ''))

  await nuevaVuelta(window, 12)
  return { dom, window, dichos }
}

const nuevaVuelta = (window, n = 6) =>
  new Promise(r => { let i = 0; const t = () => (++i >= n ? r() : window.setTimeout(t, 0)); t() })

// ── Las comprobaciones ─────────────────────────────────────────────────────

/** La página no se queda en blanco: siempre hay texto visible en el cuerpo. */
function enPie(window, donde) {
  const txt = (window.document.body.textContent || '').replace(/\s+/g, ' ').trim()
  if (txt.length < 40) {
    errores.push(`PANTALLA EN BLANCO · ${donde} · sólo ${txt.length} caracteres`)
    return false
  }
  return true
}

function revisarConsola(dichos, donde) {
  for (const d of dichos.splice(0)) {
    if (/Warning:|act\(/.test(d)) { avisos.push(`${donde} · ${d.slice(0, 120)}`); continue }
    errores.push(`CONSOLA · ${donde} · ${d.slice(0, 200)}`)
  }
}

/** Escribe en un campo controlado por React. */
function escribir(window, input, valor) {
  // React guarda el valor anterior en un rastreador y descarta el evento si
  // no cambió. Sin esto el cambio no llega nunca al componente.
  input._valueTracker?.setValue('')
  // El prototipo sale del elemento: un <textarea> no hereda de HTMLInputElement
  // y usar el descriptor equivocado escribe el valor sin que React se entere.
  const proto = input.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, valor)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
}

const clic = (window, el) =>
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))

/** Pulsa TODAS las cabeceras ordenables que haya a la vista. */
const porSitio = []

async function todasLasCabeceras(window, donde) {
  const doc = window.document
  const ths = [...doc.querySelectorAll('th[aria-sort]')]
  let n = 0
  for (let i = 0; i < ths.length; i++) {
    // Se vuelve a buscar en cada vuelta: React repinta la tabla y el nodo
    // viejo ya no está en el documento.
    const vivos = [...doc.querySelectorAll('th[aria-sort]')]
    const th = vivos[i]
    if (!th) continue
    for (const sentido of ['ida', 'vuelta']) {
      clic(window, th.querySelector('button') || th)
      await nuevaVuelta(window, 3)
      if (!enPie(window, `${donde} · cabecera ${i + 1} (${sentido})`)) return n
    }
    n++
  }
  if (n) porSitio.push(`${donde}: ${n}`)
  return n
}

/**
 * La cola de revisión, de principio a fin.
 *
 * Cada hallazgo pinta una ficha distinta: un patrón de escritura lleva tres
 * columnas con porcentajes, un código huérfano lleva dos con piezas, y el
 * bloque de códigos muertos lleva además una lista desplegable. Mirar sólo el
 * primero comprueba una de las tres, que es la misma trampa de las cabeceras
 * ordenables. Se pulsa «Saltar» hasta el final.
 */
async function recorrerCola(window, donde) {
  const doc = window.document
  let n = 0
  // El boton de avanzar dice «Lo veo despues» si el caso esta sin contestar y
  // «Siguiente» si ya lo esta: las dos formas tienen que encontrarse.
  const saltarVivo = () => [...doc.querySelectorAll('.rev-botones button')]
    .find(b => /lo veo despu|siguiente/i.test(b.textContent))

  // Qué clase de ficha se está viendo. Un lote se reconoce por su lista
  // desplegable de códigos; sin ella la ficha es una pregunta suelta.
  //
  // Se apunta aparte porque el total de hallazgos no distingue: si los cuatro
  // lotes volvieran a ser una pregunta por código el número subiría, no
  // bajaría, y la alarma no sonaría.
  const apuntar = () => {
    if (!doc.querySelector('.rev-detalle summary')) return
    lotesVistos.add(doc.querySelector('.revisar-ficha h4')?.textContent?.trim() ?? '?')
  }

  while (doc.querySelector('.revisar-ficha')) {
    if (!saltarVivo()) break
    n++
    apuntar()
    if (!enPie(window, `${donde} · hallazgo ${n}`)) return n

    // El botón se vuelve a buscar aquí: contestar o avanzar repinta la ficha
    // y el nodo de antes ya no está en el documento. Pulsarlo no hacía nada y
    // el recorrido se cortaba en el primer hallazgo sin que nada fallara.
    const saltar = saltarVivo()
    if (!saltar) break
    const antes = doc.querySelector('.revisar-cuenta')?.textContent
    clic(window, saltar)
    await nuevaVuelta(window, 3)
    // El último no avanza: «Lo veo después» se queda en el mismo sitio.
    if (doc.querySelector('.revisar-cuenta')?.textContent === antes) break
  }

  // Contestar va AL FINAL, sobre la ficha que quedó a la vista.
  //
  // Es la única parte de la cola que escribe, y contestar reordena: lo
  // contestado se va al fondo y lo que estaba detrás sube al primer puesto.
  // Haciéndolo en la primera ficha, esa que subía ya no se volvía a ver, y
  // así se escaparon dos lotes enteros. El total de hallazgos no se enteró
  // porque seguían siendo seis fichas; lo que cambió fue CUÁLES.
  if (n && !await contestarCaso(window, donde)) return n

  if (n) porSitio.push(`${donde}: ${n} hallazgos`)
  return n
}

/**
 * Contesta el hallazgo a la vista con «no», que es el camino con regla.
 *
 * Se elige el «no» a propósito: el «sí» sólo guarda, pero el «no» no se puede
 * guardar sin explicación, y esa regla es la única de esta pantalla que puede
 * romperse en silencio. Si el botón de guardar deja de estar deshabilitado con
 * el campo vacío, se contestaría que no a doscientos casos sin decir por qué y
 * el reporte quedaría sin la mitad que importa.
 */
async function contestarCaso(window, donde) {
  const doc = window.document
  const boton = txt => [...doc.querySelectorAll('.revisar-ficha button')]
    .find(b => new RegExp(txt, 'i').test(b.textContent))

  const no = boton('^no$')
  if (!no) { errores.push(`SIN BOTÓN · ${donde} · «No»`); return false }
  clic(window, no)
  await nuevaVuelta(window, 3)

  const campo = doc.querySelector('.rev-nota textarea')
  if (!campo) { errores.push(`SIN CAMPO · ${donde} · la explicación del «no»`); return false }

  const guardar = boton('guardar respuesta')
  if (!guardar) { errores.push(`SIN BOTÓN · ${donde} · «Guardar respuesta»`); return false }
  if (!guardar.disabled) {
    errores.push(`REGLA ROTA · ${donde} · un «no» sin explicación se puede guardar`)
    return false
  }

  escribir(window, campo, 'lo sigue pidiendo un cliente, lo ve Brenda')
  await nuevaVuelta(window, 2)

  const guardar2 = boton('guardar respuesta')
  if (guardar2?.disabled) {
    errores.push(`REGLA ROTA · ${donde} · con explicación sigue sin poder guardarse`)
    return false
  }
  clic(window, guardar2)
  await nuevaVuelta(window, 4)

  if (!enPie(window, `${donde} · tras contestar`)) return false

  // La explicación tiene que haber quedado guardada: al contestar, el caso baja
  // al final de la cola y otro ocupa su sitio.
  if (!/Brenda/.test(doc.body.textContent) && !notaGuardada(window)) {
    errores.push(`NOTA PERDIDA · ${donde} · se contestó y no quedó rastro`)
    return false
  }
  return true
}

const notaGuardada = window => /Brenda/.test(window.localStorage.getItem('istuffs_revisar_marcas') ?? '')

// ── El recorrido ───────────────────────────────────────────────────────────

const SESIONES = [
  ['sin sesión', null],
  ['sucursal',   { isAdmin: false, branch: 'leon', token: 'x' }],
  ['admin',      { isAdmin: true,  branch: null,   token: 'x' }],
]

let pestanas = 0, secciones = 0, cabeceras = 0, hallazgos = 0

// Las cuatro clases de lote, por su titulo. Es la comprobacion de que la
// agrupacion sigue viva: sin ella la cola vuelve a ser una pregunta por
// codigo, que es lo que se vino a arreglar.
const lotesVistos = new Set()

for (const [nombre, sesion] of SESIONES) {
  const { window, dichos } = await arrancar(sesion)
  const doc = window.document
  if (!enPie(window, `${nombre} · arranque`)) continue
  revisarConsola(dichos, `${nombre} · arranque`)

  // Las pestañas del sitio.
  const barra = doc.querySelector('.barra-pestanas-dentro')
  const botones = barra ? [...barra.querySelectorAll('button')] : []
  if (!botones.length) errores.push(`${nombre} · no hay barra de pestañas`)

  for (let i = 0; i < botones.length; i++) {
    const vivos = [...(doc.querySelector('.barra-pestanas-dentro')?.querySelectorAll('button') || [])]
    const b = vivos[i]
    if (!b) continue
    const etiqueta = b.textContent.trim()
    clic(window, b)
    await nuevaVuelta(window, 8)
    pestanas++
    if (!enPie(window, `${nombre} · pestaña «${etiqueta}»`)) continue
    revisarConsola(dichos, `${nombre} · pestaña «${etiqueta}»`)

    cabeceras += await todasLasCabeceras(window, `${nombre} · ${etiqueta}`)

    // La búsqueda no respeta el filtro de existencia: si el modelo existe,
    // aparece. Se rompió tres veces; aquí sólo se comprueba que escribir no
    // tumbe la página —la regla en sí vive en buscar.test.js—.
    for (const campo of doc.querySelectorAll('input[type="search"], input[type="text"]')) {
      escribir(window, campo, 's23')
      await nuevaVuelta(window, 3)
      if (!enPie(window, `${nombre} · ${etiqueta} · buscando`)) break
      escribir(window, campo, '')
      await nuevaVuelta(window, 2)
    }

    // Los paneles, seccion por seccion: el de administracion y el de
    // sucursal, que lleva la misma cola de revision y su propio surtido.
    if (/admin|mi panel/i.test(etiqueta)) {
      const menu = [...doc.querySelectorAll('button')]
        .filter(x => x.closest('[class*="admin" i], nav, aside') || /pestañ|hero|catálog|color|pie|usuari|dropbox|surtido|compras|personal/i.test(x.textContent))
      const vistas = new Set()
      for (const m of menu) {
        const t = m.textContent.trim()
        if (!t || vistas.has(t) || t.length > 40) continue
        vistas.add(t)
        clic(window, m)
        await nuevaVuelta(window, 6)
        secciones++
        if (!enPie(window, `${nombre} · admin · «${t}»`)) break
        revisarConsola(dichos, `${nombre} · admin · «${t}»`)
        cabeceras += await todasLasCabeceras(window, `${nombre} · admin · ${t}`)
        hallazgos += await recorrerCola(window, `${nombre} · admin · ${t}`)
      }
    }
  }

  revisarConsola(dichos, nombre)
  window.close()
}

// ── El parte ───────────────────────────────────────────────────────────────

console.log(`\nsesiones 3 · pestañas ${pestanas} · secciones de admin ${secciones} · cabeceras pulsadas ${cabeceras} · hallazgos recorridos ${hallazgos}`)
for (const l of porSitio) console.log('  ' + l)
console.log(`  lotes dibujados: ${lotesVistos.size}`)
for (const l of lotesVistos) console.log('    · ' + l)
if (lotesVistos.size < 4) errores.push(`solo se dibujaron ${lotesVistos.size} lotes de 4: la cola volvio a preguntar codigo por codigo`)
if (avisos.length) console.log(`avisos de React: ${avisos.length}`)

if (errores.length) {
  console.log(`\nFALLA (${errores.length}):`)
  for (const e of errores) console.log('  ' + e)
  process.exit(1)
}
console.log('\nsin pantallas en blanco ni errores de consola.')
