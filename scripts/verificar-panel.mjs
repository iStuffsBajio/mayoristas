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

/**
 * Dos folios de surtido, y los dos tienen que estar.
 *
 * Uno CUADRA y el otro trae DIFERENCIA, porque son dos caminos distintos de
 * la pantalla: el que cuadra no despliega lineas y el que no, las despliega.
 * Con solo uno de los dos, la mitad del componente no se ejecuta nunca.
 *
 * El «antes» va por debajo de la existencia de `productos` a proposito: asi
 * (despues - antes) da un numero positivo y el folio aparece como dado de
 * alta. Si el antes fuera igual, los dos saldrian «en camino» y la seccion
 * pasaria en verde sin haber cuadrado nada.
 *
 * Y la fecha es la de HOY, no una fija: el cuadre descuenta lo que la plaza
 * vendio desde que salio la caja, y con una fecha de octubre la ventana se
 * tragaba todos los dias de venta de mentira. Entonces «entraron» salia
 * enorme, los dos folios caian en «diferencia» y el camino del que cuadra no
 * se ejecutaba. Es la misma trampa que la seccion existe para medir.
 */
const HOY_ISO = new Date().toISOString()
/**
 * La venta linea por linea de una plaza, con los TRES grupos poblados.
 *
 * Los tres hacen falta: la seccion los pinta en tablas separadas y con uno
 * solo las otras dos no se dibujan nunca. Y los precios estan elegidos para
 * que el mayoreo salga mas barato que el publico, que es lo que la pantalla
 * dice: con todo al mismo precio el descuento sale cero y no se distingue de
 * un calculo que no corrio.
 *
 * Lleva ademas un codigo cobrado MAS CARO a mayoreo, para que se ejercite el
 * aviso en ambar de los precios invertidos.
 */
const VENTAS_DE = plaza => ({
  plaza,
  generado: GENERADO,
  respaldo: { fecha: '2026-11-04' },
  ventana: {
    dias: 365,
    porCodigo: {
      // Funda: publico $216, mayoreo $130.
      I13T:   { producto: 'IPHONE 13 TPU CASE', pz: 100, dinero: 17300,
                pzMayoreo: 50, dineroMayoreo: 6500 },
      // Funda con el precio INVERTIDO: a mayoreo sale mas cara.
      SGA16T: { producto: 'SAMSUNG A16 TPU CASE', pz: 20, dinero: 4000,
                pzMayoreo: 10, dineroMayoreo: 2500 },
      // Mica: su propio grupo, mucho mas barata.
      HDB:    { producto: 'MICA HIDROGEL HD BASICA', pz: 60, dinero: 3480,
                pzMayoreo: 0, dineroMayoreo: 0 },
      // Sticker: sin inventario, y el que hunde cualquier promedio mezclado.
      SP:     { producto: 'STIKER PEQUEÑO', pz: 200, dinero: 2000,
                pzMayoreo: 0, dineroMayoreo: 0 },
    },
  },
})

const SURTIDOS = [
  {
    folio: 'hoy-leon-0001', destino: 'leon', quien: 'admin',
    cuando: HOY_ISO,
    // I13T tiene 34 piezas: con 24 antes, entraron 10, que es lo que salio.
    // Las existencias de mentira viven en el arreglo de `productos` y hay que
    // leerlas de ahi: elegir un codigo «que suene» daba un folio con 24
    // piezas faltantes y los dos caian en «diferencia».
    lineas: [{ codigo: 'I13T', producto: 'IPHONE 13 TPU CASE', piezas: 10 }],
    antes: { I13T: 24 },
    cerrado: null,
  },
  {
    folio: 'hoy-aguascalientes-0002', destino: 'aguascalientes', quien: 'admin',
    cuando: HOY_ISO,
    // SGS23U3 tiene 12: con 10 antes entraron 2, y salieron 5. Faltan 3.
    lineas: [{ codigo: 'SGS23U3', producto: 'SAMSUNG S23 ULTRA 3 IN 1', piezas: 5 }],
    antes: { SGS23U3: 10 },
    cerrado: null,
  },
]

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

// ── Flujo de efectivo ───────────────────────────────────────────────────────
//
// Las fechas se calculan RELATIVAS A HOY, no fijas. Con un noviembre de 2026
// escrito a mano, esta comprobacion dejaria de ejercitar «la semana en curso»
// en cuanto pasara el mes, y lo haria en silencio: los bloques seguirian
// dibujandose, solo que ninguno seria el de ahora.
const lunesDe = d => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
const isoDia = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const LUNES_HOY = lunesDe(new Date())
// Se IMPORTA, no se copia. Esta comprobacion tiene que seguir contando los
// bloques bien el dia que el dueño mueva el inicio del historial, y una
// constante repetida a mano se queda vieja sin que nada falle.
const { INICIO_HISTORIAL } = await import('../src/lib/caja.js')
/** El lunes de la semana de hace `n` semanas. */
const semanaAtras = n => {
  const x = new Date(LUNES_HOY)
  x.setDate(LUNES_HOY.getDate() - n * 7)
  return isoDia(x)
}
/** El lunes de dentro de `n` semanas. */
const semanaAdelante = n => semanaAtras(-n)

/**
 * Cuantos bloques tiene que dibujar la pantalla HOY.
 *
 * Desde el 2026-11-06 el historial arranca en ceros -`INICIO_HISTORIAL`-, asi
 * que al estrenarlo hay UNA semana y no ocho. Esto se calcula en vez de
 * escribirse para que el numero crezca solo cada lunes hasta toparse en dos,
 * que es lo que se enseña. Escrito a mano, la comprobacion fallaria sola el
 * lunes siguiente sin que nada estuviera roto.
 */
const BLOQUES_HOY = Math.max(1, Math.min(
  2, Math.round((new Date(LUNES_HOY) - new Date(`${INICIO_HISTORIAL}T00:00`)) / (7 * 864e5)) + 1))
/** Los siete dias de esa semana, con venta. */
const diasDe = (n, efectivo) => {
  const l = new Date(LUNES_HOY)
  l.setDate(LUNES_HOY.getDate() - n * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(l)
    d.setDate(l.getDate() + i)
    return {
      f: isoDia(d), efectivo, tarjeta: i === 1 ? 400 : 0,
      transferencia: i === 3 ? 150 : 0, devEfectivo: i === 5 ? 100 : 0,
      nVentas: 3 + i, arqueo: efectivo - (i === 5 ? 100 : 0),
      cajero: 'daniela coronilla',
    }
  })
}

// El control de salidas arranca ESTA semana, que es ademas lo que pasa de
// verdad: empezo el 2026-11-05. Asi la semana en curso se puede juzgar y la
// pasada sale como techo.
//
// Estaba en dos semanas atras, y con eso las ramas de «con control» y «sin
// control» caian en bloques que ya no se dibujan: la pantalla paso a enseñar
// solo la semana pasada y esta -lo pidio el dueño el 2026-11-06- y las dos
// quedaban despues del corte. La comprobacion no se aflojo; se movio el dato
// para que las dos ramas sigan cayendo DENTRO de lo que se ve.
const DESDE_CONTROL = semanaAtras(0)

const diasDeOcho = base => Array.from({ length: 8 }, (_, n) => diasDe(n, base + n * 50)).flat()

const caja = {
  flujos: {
    // Leon: configurada, con un bloque marcado y otro sin marcar, faltantes
    // repetidos de la misma persona y un gasto sin comprobante.
    leon: {
      sucursal: 'leon', nombre: 'León',
      respaldo: { archivo: 'respaldo-04-11-26.fbk', fecha: semanaAtras(0) },
      dias: diasDeOcho(2000),
      movimientos: [
        { f: semanaAtras(0), tipo: 'gasto', monto: 120, concepto: 'garrafon de agua', origen: 'eleventa' },
        { f: semanaAtras(0), tipo: 'retiro', monto: 500, concepto: 'retiro autorizado', origen: 'eleventa', comprobante: true },
        { f: semanaAtras(1), tipo: 'adelanto', monto: 300, concepto: 'adelanto de nomina', origen: 'eleventa', comprobante: true },
        // Una salida que alguien registro PORQUE falto dinero. Es la unica
        // clase de faltante que la pantalla enseña desde el 2026-11-06, y no
        // resta del efectivo neto: va en su propia linea.
        { f: semanaAtras(0), tipo: 'faltante', monto: 180, concepto: 'FALTANTE EN CAJA', persona: 'daniela coronilla', origen: 'eleventa' },
      ],
      // Los descuadres que Eleventa escribe sola al cerrar turno. Se quedan
      // aqui A PROPOSITO aunque ya no se enseñen: el recorrido comprueba que
      // «jenni gllardo» NO aparece en ninguna pantalla. Quitandolos del dato
      // de mentira, esa comprobacion pasaria en verde aunque alguien los
      // volviera a pintar.
      faltantes: [
        { f: semanaAtras(3), monto: 3161.15, persona: 'daniela coronilla', sentido: 'faltante' },
        { f: semanaAtras(6), monto: 2230.04, persona: 'daniela coronilla', sentido: 'faltante' },
        { f: semanaAtras(7), monto: 5700.00, persona: 'jenni gllardo', sentido: 'faltante' },
      ],
    },
    // San Luis: SIN tolerancia, para que salga el camino «sin configurar».
    'san-luis': {
      sucursal: 'san-luis', nombre: 'San Luis Potosí',
      respaldo: { archivo: 'respaldo-04-11-26.fbk', fecha: semanaAtras(0) },
      dias: diasDeOcho(1500), movimientos: [], faltantes: [],
    },
    // Aguascalientes: configurada y sin ningun deposito marcado, para que
    // salgan «pendiente», «atrasado» y «no depositado».
    aguascalientes: {
      sucursal: 'aguascalientes', nombre: 'Aguascalientes',
      respaldo: { archivo: 'respaldo-04-11-26.fbk', fecha: semanaAtras(0) },
      dias: diasDeOcho(1000), movimientos: [], faltantes: [],
    },
    // Ferias: con dato y SIN parametros, para que salga en gris.
    ferias: {
      sucursal: 'ferias', nombre: 'Ferias',
      respaldo: { archivo: 'respaldo-03-11-26.fbk', fecha: semanaAtras(0) },
      dias: diasDe(0, 800), movimientos: [], faltantes: [],
    },
    // Torreon NO aparece a proposito: es el camino de «sin archivo
    // publicado», que no es lo mismo que «sin movimiento» y se dice distinto.
  },
  parametros: {
    leon: {
      diaDeposito: 1, periodoCubre: 'semana-anterior', fondoFijo: 1000,
      // El limite se deja por DEBAJO de lo que acumulan los bloques sin
      // marcar, para que la tarjeta salga en rojo: es la alerta de seguridad
      // y si nada la dispara, no se ejercita.
      limiteEfectivo: 5000, tolerancia: 50, horaLimite: '14:00',
      cuenta: '****1234', responsable: 'Daniela', gastoMaxSinComprobante: 300,
      desdeControlSalidas: DESDE_CONTROL,
    },
    'san-luis': {
      diaDeposito: 2, periodoCubre: 'semana-anterior', fondoFijo: 800,
      limiteEfectivo: null, tolerancia: null, horaLimite: '14:00',
      cuenta: '', responsable: '', gastoMaxSinComprobante: null,
      // En el FUTURO a proposito: asi la semana en curso de esta plaza sale
      // «sin control» y el camino del techo cae DENTRO de lo que se dibuja.
      //
      // Antes bastaba con que la semana pasada no tuviera control. Ya no: el
      // historial arranca el lunes en curso, asi que ahora mismo solo hay una
      // semana a la vista y las dos ramas tienen que caber en ella. Caben
      // porque la fecha va por PLAZA, que es justo para lo que se hizo asi.
      desdeControlSalidas: semanaAdelante(1),
    },
    aguascalientes: {
      diaDeposito: 1, periodoCubre: 'semana-anterior', fondoFijo: 500,
      limiteEfectivo: 90000, tolerancia: 100, horaLimite: '13:00',
      cuenta: '****9999', responsable: 'Brenda', gastoMaxSinComprobante: null,
      desdeControlSalidas: DESDE_CONTROL,
    },
  },
  // Dos bloques marcados: uno CON control -que puede comparar y cuadra- y
  // otro SIN control -que se marca pero no se compara-. Los dos caminos.
  depositos: {
    // Aguascalientes marca la semana EN CURSO y la cuadra al peso: es la
    // rama «depositado» y el unico verde del tablero. Tiene que estar en la
    // semana en curso -7,000 menos 100 de devoluciones- porque es la unica
    // que se dibuja hoy.
    aguascalientes: {
      [semanaAtras(0)]: {
        semana: semanaAtras(0), monto: 6900, fecha: semanaAtras(0), hora: '12:30',
        folio: 'B-312', comprobante: true, deposito: 'Brenda',
        marcadoPor: 'admin', marcadoEn: HOY_ISO,
      },
    },
    leon: {
      [semanaAtras(1)]: {
        semana: semanaAtras(1), monto: 14950, fecha: semanaAtras(0), hora: '13:20',
        folio: 'A-881', comprobante: true, deposito: 'Daniela',
        marcadoPor: 'admin', marcadoEn: HOY_ISO,
      },
      [semanaAtras(4)]: {
        semana: semanaAtras(4), monto: 9000, fecha: semanaAtras(3), hora: '12:00',
        folio: 'A-840', comprobante: false, deposito: 'Daniela',
        marcadoPor: 'admin', marcadoEn: HOY_ISO,
      },
    },
  },
  // Un ajuste, para que se dibuje el rastro: el valor calculado se conserva y
  // la celda sale marcada.
  ajustes: {
    leon: {
      [semanaAtras(0)]: {
        fecha: semanaAtras(0), valores: { gastos: 250 }, motivo: 'gasto-no-registrado',
        nota: 'se pago el garrafon y no se anoto', quien: 'admin', cuando: HOY_ISO,
      },
    },
  },
  movimientos: {
    leon: {
      'm-1': {
        id: 'm-1', f: semanaAtras(0), tipo: 'gasto', monto: 480,
        concepto: 'papeleria sin ticket', comprobante: false,
        origen: 'pagina', quien: 'admin', cuando: HOY_ISO,
      },
      // Capturado AQUI, no en Eleventa. Con los dos, la misma persona sale
      // dos veces y se dibuja el apartado de «repetido», que es la alerta que
      // pidio el dueño y que con un solo faltante no se ejercita.
      'm-2': {
        id: 'm-2', f: semanaAtras(0), tipo: 'faltante', monto: 95,
        concepto: 'falto en el corte de la tarde', persona: 'daniela coronilla',
        origen: 'pagina', quien: 'admin', cuando: HOY_ISO,
      },
    },
  },
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
  if (/surtidos/i.test(u)) return { surtidos: SURTIDOS }
  if (/\/ventas\b/i.test(u)) return VENTAS_DE(u.match(/plaza=([a-z-]+)/)?.[1] ?? 'leon')
  if (/\/caja/i.test(u)) return caja
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
        .map((p, i) => ({ ...p, Producto: p.Producto.replace(/^SAMSUNG\b/, 'GALAXY'),
          // El costo sale de bodega y SOLO de bodega, asi que aqui tiene que
          // haberlo: sin el, la utilidad y «Dinero parado» salen en blanco y
          // esta comprobacion pasaria en verde sin haber valorado nada.
          //
          // Y a dos se les deja sin costo a proposito, para que la bandeja de
          // «Costos que faltan» tenga algo que pintar. Sin eso no se
          // ejercita: un cero es «sin capturar», no «gratis».
          ...(i < 2 ? {} : { Costo: 30 + i }),
        })),
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
  //
  // El rastreador se siembra con algo DISTINTO de lo que se va a escribir.
  // Sembrándolo siempre con '', BORRAR un campo no llegaba nunca: React
  // comparaba '' contra '' y descartaba el evento, así que el componente se
  // quedaba con el valor anterior. Eso hacía parecer que un botón de guardar
  // seguía habilitado con el campo vacío —una regla rota que no lo estaba— y
  // de paso dejaba sin comprobar todas las del tipo «vaciar deshabilita».
  input._valueTracker?.setValue(valor === '' ? '\u0000' : '')
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

  // El sitio de cada ficha en la cola viene en `data-paso`: lo que hay que
  // hacer con ella. La cola tiene que ir de menor a mayor, y comprobarlo es la
  // unica forma de notar que alguien volvio a ordenar por piezas, porque el
  // total de hallazgos no se entera: no cambia cuantos hay, cambia cuales van
  // primero, y eso no sale en ningun numero.
  const pasos = []

  while (doc.querySelector('.revisar-ficha')) {
    if (!saltarVivo()) break
    n++
    apuntar()
    const sitio = Number(doc.querySelector('.revisar-ficha').dataset.paso)
    if (Number.isNaN(sitio)) errores.push(`SIN PASO · ${donde} · el hallazgo ${n} no dice su sitio en la cola`)
    else pasos.push(sitio)
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

  for (let k = 1; k < pasos.length; k++) {
    if (pasos[k] < pasos[k - 1]) {
      errores.push(`ORDEN ROTO · ${donde} · el hallazgo ${k + 1} es del paso ${pasos[k]} y va detras de uno del paso ${pasos[k - 1]}`)
      break
    }
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
/**
 * La seccion del precio por plaza, con los tres grupos SEPARADOS.
 *
 * Lo que se comprueba aqui no son las cuentas -eso lo fija
 * `ventasTicket.test.js`- sino que la seccion SE DIBUJE y que siga dibujando
 * los tres grupos aparte. Lo pidio el dueño asi: «me parece mejor que la
 * informacion vaya separada, porque me hace mucho ruido la mezcla».
 *
 * Y la mezcla no es una mania: el precio medio de Ferias sale $161 y su funda
 * se vende a $254, la mas cara de las cuatro plazas. Lo que tira del numero es
 * que el 21% de sus piezas son stickers a $10. Si esta seccion volviera a
 * juntar los tres, el numero seguiria saliendo y seguiria siendo falso: nada
 * fallaria, que es justo por lo que hace falta mirarlo aqui.
 */
function precioPorPlaza(window, donde) {
  const doc = window.document
  const sec = doc.querySelector('[data-precio-plaza]')
  if (!sec) return 0

  const txt = (sec.textContent || '').replace(/\s+/g, ' ')
  for (const grupo of ['Fundas', 'Micas e hidrogel', 'Stickers']) {
    if (!txt.includes(grupo)) {
      errores.push(`${donde} · la seccion de precios no separa «${grupo}»`)
    }
  }
  // Tres tablas, una por grupo. Con una sola, los grupos se habrian vuelto a
  // mezclar en un solo renglon por plaza.
  const tablas = sec.querySelectorAll('table')
  if (tablas.length < 3) {
    errores.push(`${donde} · la seccion de precios dibuja ${tablas.length} tablas de 3: los grupos se mezclaron`)
  }
  // El aviso de los cobrados mas caro a mayoreo que al publico.
  if (!/mas caro a mayoreo|más caro a mayoreo/i.test(txt)) {
    errores.push(`${donde} · no se avisa de los precios invertidos`)
  }
  return 1
}

/**
 * La bandeja de precios a revisar por sucursal.
 *
 * Se rompe en silencio de dos formas: dejando de dibujarse -y entonces el
 * precio torcido no sale en ningun sitio- o perdiendo el aviso de que la
 * diferencia NO es dinero perdido, que es lo unico que impide que alguien
 * sume la columna y crea que le falta ese dinero.
 *
 * El dato de mentira hace que salte sola: la lista del inventario falso dice
 * $55 para el I13T y la venta falsa lo cobra a $216.
 */
function preciosARevisar(window, donde) {
  const doc = window.document
  const sec = doc.querySelector('[data-precios-revisar]')
  if (!sec) {
    errores.push(`${donde} · no se dibujo la bandeja de precios a revisar`)
    return 0
  }
  const txt = (sec.textContent || '').replace(/\s+/g, ' ')
  if (!/no es dinero perdido/i.test(txt)) {
    errores.push(`${donde} · la bandeja de precios no avisa de que la diferencia no es dinero perdido`)
  }
  if (!/Bajar el Excel/i.test(txt)) {
    errores.push(`${donde} · la bandeja de precios no tiene como bajarse`)
  }
  // Una pastilla por plaza con algo que revisar: sin ellas solo se veria una
  // plaza y las demas quedarian escondidas.
  if (!sec.querySelectorAll('.chip-plaza').length) {
    errores.push(`${donde} · la bandeja de precios no deja elegir plaza`)
  }
  return 1
}

/**
 * La lista de folios de surtido.
 *
 * Las cuentas ya estan fijadas en `surtidos.test.js`. Lo que no ve ninguna
 * prueba de libreria es que la seccion SE DIBUJE, y aqui se rompe de dos
 * formas que no fallan solas:
 *
 *   · La seccion deja de pintarse y un folio con piezas faltantes no sale en
 *     ningun sitio. Nadie lo echa de menos, porque nadie sabia que existia.
 *   · Se pintan los folios pero no se despliegan las lineas que no cuadran,
 *     que es el unico dato por el que esto existe.
 *
 * Los dos folios de mentira estan elegidos para pasar por los dos caminos:
 * uno cuadra y el otro trae una diferencia de 3 piezas.
 */
async function listaDeFolios(window, donde) {
  // Los folios necesitan DOS descargas: los inventarios de S3 -para cuadrar
  // contra el respaldo- y los folios del backend. Un numero fijo de vueltas
  // alcanzaba en dos vistas de tres y fallaba en la tercera sin que nada
  // estuviera roto, asi que se espera a que aparezcan con un tope.
  const doc = window.document

  // Que el boton pulsado diga «Surtido» no significa que estemos en Surtido.
  // El aviso del dashboard «Ver los 30 en Surtido» tambien lo dice, y pulsarlo
  // dejaba la pantalla en Diseño: la comprobacion fallaba sin que nada
  // estuviera roto. El ancla es algo que SOLO dibuja esta pestaña.
  const enSurtido = () => [...doc.querySelectorAll('button')]
    .some(b => /reporte completo en excel/i.test(b.textContent || ''))

  let fichas = []
  for (let i = 0; i < 12 && !fichas.length; i++) {
    await nuevaVuelta(window, 8)
    if (!enSurtido()) return 0
    fichas = [...doc.querySelectorAll('[data-folio]')]
  }
  if (!fichas.length) {
    errores.push(`${donde} · no se dibujo ningun folio de surtido`)
    return 0
  }

  const estados = fichas.map(f => f.getAttribute('data-estado'))
  if (!estados.includes('cuadra')) {
    errores.push(`${donde} · ningun folio sale como «cuadra»: el cuadre contra el respaldo no corrio`)
  }
  if (!estados.includes('diferencia')) {
    errores.push(`${donde} · ningun folio sale con «diferencia»: el camino que importa no se dibujo`)
  }

  // La linea que no cuadra tiene que estar, con su codigo: una diferencia de
  // piezas se persigue por codigo, no por nombre.
  const texto = doc.body.textContent || ''
  if (estados.includes('diferencia') && !/faltan 3/.test(texto)) {
    errores.push(`${donde} · un folio con diferencia no despliega lo que falta`)
  }
  if (estados.includes('diferencia') && !/SGS23U3/.test(texto)) {
    errores.push(`${donde} · la linea con diferencia no enseña el codigo`)
  }
  return fichas.length
}

/**
 * La bandeja de «Costos que faltan en bodega».
 *
 * Esto no se puede fijar en una prueba de libreria: `sinCostear` ya tiene la
 * suya, y lo que falla aqui es otra cosa —que la seccion deje de pintarse—.
 * Importa porque el costo sale de bodega y SOLO de bodega: si el hueco no se
 * ve, la utilidad sigue saliendo, mas pequena, y nadie se entera de que habla
 * de la mitad del catalogo. Una cifra incompleta que no se anuncia es peor
 * que ninguna.
 *
 * Tambien comprueba que la frase de la utilidad diga de cuantos modelos
 * habla, que es la otra mitad del trato.
 */
function bandejaDeCostos(window, donde) {
  const doc = window.document
  const texto = doc.body.textContent || ''
  if (!/Costos que faltan en bodega/i.test(texto)) {
    errores.push(`${donde} · no se dibujo la bandeja de costos que faltan`)
    return 0
  }
  // El boton que la baja en Excel: sin el, la lista es un reproche y no un
  // trabajo que se pueda repartir.
  const baja = [...doc.querySelectorAll('button')].some(b => /bajar la lista/i.test(b.textContent || ''))
  if (!baja) errores.push(`${donde} · la bandeja de costos no tiene como bajarse en Excel`)

  if (/La utilidad de esas cuatro semanas/.test(texto) && !/les falta el costo en bodega/.test(texto)) {
    errores.push(`${donde} · la utilidad no dice de cuantos modelos habla teniendo costos sin capturar`)
  }
  return 1
}

/**
 * La barra de busqueda por codigo de la seccion de ventas.
 *
 * La regla —que la plaza y el rango puestos no esconden un codigo que existe—
 * vive en `buscarVentas.test.js`, que es donde se puede fijar. Lo que se
 * comprueba aqui es lo que ninguna prueba de libreria ve: que la ficha se
 * DIBUJE, y que un codigo inexistente lo diga en vez de dejar el hueco en
 * blanco, que es como se ve igual que un fallo.
 */
async function buscarUnCodigo(window, donde) {
  const doc = window.document
  const campo = [...doc.querySelectorAll('input')]
    .find(i => /buscar un c/i.test(i.placeholder || ''))
  if (!campo) {
    errores.push(`${donde} · no hay barra de busqueda por codigo en ventas`)
    return 0
  }

  escribir(window, campo, 'SGS23UT')
  await nuevaVuelta(window, 4)
  if (!enPie(window, `${donde} · buscando SGS23UT`)) return 0

  const ficha = doc.querySelector('[data-ficha-codigo]')
  if (!ficha) {
    errores.push(`${donde} · buscar SGS23UT no dibujo ninguna ficha`)
    return 0
  }
  if (ficha.dataset.fichaCodigo !== 'SGS23UT') {
    errores.push(`${donde} · la ficha dibujada es de ${ficha.dataset.fichaCodigo}, no del codigo buscado`)
  }
  // La ficha tiene que traer una linea por plaza, tambien las que salieron en
  // cero: ensenar solo las que vendieron es volver a esconder el dato.
  const lineas = ficha.querySelectorAll('[style*="minmax"]').length
  if (lineas < 3) {
    errores.push(`${donde} · la ficha trae ${lineas} renglones: faltan plazas o meses`)
  }

  escribir(window, campo, 'ZZZZ99')
  await nuevaVuelta(window, 4)
  if (!enPie(window, `${donde} · buscando un codigo que no existe`)) return 1
  if (!doc.querySelector('[data-sin-coincidencias]')) {
    errores.push(`${donde} · un codigo inexistente no avisa: la pantalla se queda muda`)
  }

  escribir(window, campo, '')
  await nuevaVuelta(window, 3)
  return 1
}

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

/**
 * La pestaña de flujo de efectivo.
 *
 * Las cuentas ya estan fijadas en `caja.test.js` -45 pruebas-. Lo que no ve
 * ninguna prueba de libreria es que la pantalla SE DIBUJE, y aqui se rompe de
 * formas que no fallan solas:
 *
 *   · La seccion deja de pintarse y una semana sin depositar no sale en
 *     ningun sitio. Nadie la echa de menos, porque nadie sabia que existia.
 *   · Se pintan los bloques pero NO el aviso del techo, y entonces un
 *     esperado que es un maximo se lee como una cifra. Es el fallo caro: se
 *     perseguiria un faltante que no existe.
 *   · Se pinta el acumulado pero sin distinguir los bloques marcados de los
 *     que no, y el dueño deposita dos veces la misma semana.
 *
 * El dato de mentira esta armado para pasar por las dos ramas de cada cosa:
 * con control y sin control, marcado y sin marcar, con parametros y sin ellos,
 * con archivo publicado y sin el.
 */
async function revisarEfectivo(window, donde) {
  const doc = window.document

  // Que el boton pulsado diga «Efectivo» no basta: cualquier aviso del
  // dashboard que lo mencione tambien lo dice. El ancla es algo que SOLO
  // dibuja esta pestaña.
  const enEfectivo = () => !!doc.querySelector('[data-concentrado]')

  let tarjetas = []
  for (let i = 0; i < 12 && !tarjetas.length; i++) {
    await nuevaVuelta(window, 8)
    if (!enEfectivo()) return 0
    tarjetas = [...doc.querySelectorAll('[data-plaza-caja]')]
  }
  if (!tarjetas.length) {
    errores.push(`${donde} · no se dibujo ninguna tarjeta de plaza en el flujo de efectivo`)
    return 0
  }

  // Las cinco plazas que manejan efectivo, Torreon incluida: vende y esta al
  // dia aunque `sucursales.js` la tenga como inactiva para el mayorista.
  const slugs = tarjetas.map(t => t.dataset.plazaCaja)
  for (const esperada of ['leon', 'san-luis', 'aguascalientes', 'torreon', 'ferias']) {
    if (!slugs.includes(esperada)) {
      errores.push(`${donde} · falta la tarjeta de ${esperada} en el flujo de efectivo`)
    }
  }

  // Los semaforos. Si todas salen del mismo color, el color no esta
  // calculandose: el dato de mentira tiene a Leon pasada de limite -rojo- y a
  // Ferias sin parametros -gris-.
  const colores = new Set(tarjetas.map(t => t.dataset.semaforo))
  if (colores.size < 2) {
    errores.push(`${donde} · todas las plazas salen del mismo color (${[...colores]}): el semaforo no se esta calculando`)
  }
  if (!colores.has('gris')) {
    errores.push(`${donde} · ninguna plaza sale en gris: lo que no se puede juzgar se esta pintando como si se pudiera`)
  }

  // El concentrado tiene que decir que es un TECHO: hay semanas de antes del
  // control de salidas dentro del acumulado.
  const texto = () => doc.body.textContent || ''
  if (!/m[aá]x/i.test(texto())) {
    errores.push(`${donde} · el concentrado no avisa de que el acumulado es un maximo`)
  }

  // Torreon no tiene archivo publicado: tiene que decirlo, y decirlo
  // DISTINTO de «no hubo movimiento».
  if (!/extractor todav[ií]a no ha corrido/i.test(texto())) {
    errores.push(`${donde} · una plaza sin archivo publicado no lo dice: un hueco se lee como «no hay nada que depositar»`)
  }

  // El concentrado NO puede sumar semanas anteriores al inicio del historial.
  //
  // Es la comprobacion que ataja lo que se vio en pantalla el 2026-11-06: «lo
  // que debe entrar al banco» decia $411,648 en **32 semanas sin marcar**,
  // dinero que llevaba meses en el banco. Recortar los bloques que se DIBUJAN
  // no basta -el concentrado suma por su cuenta-, asi que se mira su cifra:
  // con cuatro plazas vivas y una semana de historial no puede pasar de
  // cuatro, y sin el recorte se dispara a treinta y tantas.
  const PLAZAS_VIVAS = 4   // las cinco menos Torreon, que es solo historial
  const dice = /(\d+)\s+semanas?\s+sin\s+marcar/.exec(texto())
  if (!dice) {
    errores.push(`${donde} · el concentrado no dice cuantas semanas quedan sin marcar`)
  } else if (Number(dice[1]) > PLAZAS_VIVAS * BLOQUES_HOY) {
    errores.push(`${donde} · el concentrado suma ${dice[1]} semanas sin marcar y como mucho caben ${PLAZAS_VIVAS * BLOQUES_HOY}: esta contando historial anterior al ${INICIO_HISTORIAL} como dinero pendiente`)
  }

  // ── El cuadro de la semana en curso ──
  //
  // El dueño pidio el 2026-11-06 ver, al lado del efectivo, lo cobrado con
  // tarjeta, transferencia y lo demas, y la venta total de la sucursal. Son
  // columnas: si una deja de pintarse, la tabla se ve perfecta y lo que
  // falta no lo echa nadie de menos.
  const cuadro = doc.querySelector('[data-calendario]')
  if (!cuadro) {
    errores.push(`${donde} · no se dibujo el cuadro de la semana en curso`)
  } else {
    const cabeceras = [...cuadro.querySelectorAll('th')].map(t => (t.textContent || '').trim().toLowerCase())
    for (const necesaria of ['efectivo neto', 'tarjeta', 'transfer.', 'otros', 'venta total']) {
      if (!cabeceras.includes(necesaria)) {
        errores.push(`${donde} · al cuadro de la semana le falta la columna «${necesaria}»`)
      }
    }
    // Y la fila de abajo, que son las ventas totales en general. Sin ella hay
    // desglose por plaza y ningun total, que es la mitad de lo que se pidio.
    if (!cuadro.querySelector('[data-calendario-total]')) {
      errores.push(`${donde} · el cuadro de la semana no suma las plazas: no hay fila de total`)
    }
  }

  // ── Los bloques ──
  //
  // Desde el 2026-11-06 el historial arranca en ceros, asi que al estrenar
  // esto hay UNA semana a la vista y no ocho. Eso obliga a recorrer tres
  // plazas en vez de una: las ramas que antes cabian en ocho bloques de Leon
  // -con control y sin control, marcado y sin marcar- ahora viven una en cada
  // plaza, porque `desdeControlSalidas` va por plaza y cada una marca lo suyo.
  //
  // Recorrer solo Leon dejaria sin ejecutar la mitad del componente, y la
  // comprobacion pasaria en verde habiendo mirado un bloque.
  const verLeon = tarjetas.find(t => t.dataset.plazaCaja === 'leon')
    ?.querySelector('button')
  if (!verLeon) {
    errores.push(`${donde} · la tarjeta de Leon no tiene como abrir sus bloques`)
    return tarjetas.length
  }
  clic(window, verLeon)
  await nuevaVuelta(window, 8)
  if (!enPie(window, `${donde} · bloques de Leon`)) return tarjetas.length

  /** Salta a otra plaza por su pestaña y devuelve sus bloques. */
  const irAPlaza = async nombre => {
    const chip = [...doc.querySelectorAll('button')]
      .find(x => (x.textContent || '').trim() === nombre)
    if (!chip) {
      errores.push(`${donde} · no hay pestaña para ${nombre} en los bloques`)
      return []
    }
    clic(window, chip)
    await nuevaVuelta(window, 6)
    if (!enPie(window, `${donde} · bloques de ${nombre}`)) return []
    return [...doc.querySelectorAll('[data-bloque]')]
  }

  const estados = new Set()
  const depositados = new Set()
  let bloquesVistos = 0

  for (const nombre of ['León', 'San Luis Potosí', 'Aguascalientes']) {
    const suyos = nombre === 'León'
      ? [...doc.querySelectorAll('[data-bloque]')]
      : await irAPlaza(nombre)
    if (!suyos.length) {
      errores.push(`${donde} · ${nombre} no dibujo ningun bloque semanal`)
      continue
    }
    // El numero se CALCULA del inicio del historial: hoy uno, dos a partir
    // del lunes siguiente. Escrito a mano fallaria solo sin estar roto nada.
    if (suyos.length !== BLOQUES_HOY) {
      errores.push(`${donde} · ${nombre} dibujo ${suyos.length} bloques y tocaban ${BLOQUES_HOY} desde el ${INICIO_HISTORIAL}`)
    }
    bloquesVistos += suyos.length
    for (const x of suyos) {
      estados.add(x.dataset.estado)
      depositados.add(x.dataset.depositado)
    }
  }

  // Lo de antes del inicio del historial NO se dibuja. Si vuelve a contarse,
  // «lo que debe entrar al banco» regresa a los $411,648 de dinero que ya
  // esta en el banco, y eso no se distingue de una deuda real.
  const viejos = [...doc.querySelectorAll('[data-bloque]')]
    .map(x => x.dataset.bloque).filter(c => c < INICIO_HISTORIAL)
  if (viejos.length) {
    errores.push(`${donde} · se dibujaron semanas anteriores al inicio del historial (${viejos.join(', ')}): vuelven a contarse como pendientes`)
  }

  if (!depositados.has('1')) errores.push(`${donde} · ningun bloque sale como depositado`)
  if (!depositados.has('0')) errores.push(`${donde} · ningun bloque sale sin depositar`)
  if (estados.size < 2) {
    errores.push(`${donde} · todos los bloques salen con el estado «${[...estados]}»: el estado no se calcula`)
  }
  if (!estados.has('sin-control')) {
    errores.push(`${donde} · ningun bloque sale como «sin control»: una semana sin registro de salidas se esta juzgando`)
  }

  // El aviso del techo, que es el que evita perseguir un faltante inventado.
  // Se mira estando en San Luis, que es la plaza sin control.
  await irAPlaza('San Luis Potosí')
  if (!/no se compara contra el dep[oó]sito/i.test(texto())) {
    errores.push(`${donde} · un bloque sin control de salidas no avisa de que no se compara: se leeria como una cifra`)
  }

  // ── La tabla diaria, de vuelta en Leon ──
  await irAPlaza('León')
  const sinMarcar = [...doc.querySelectorAll('[data-bloque][data-depositado="0"]')]
  const verDias = sinMarcar.length && [...sinMarcar[0].querySelectorAll('button')]
    .find(x => /ver d[ií]as/i.test(x.textContent || ''))
  if (!verDias) {
    errores.push(`${donde} · un bloque no tiene como desplegar sus dias`)
  } else {
    clic(window, verDias)
    await nuevaVuelta(window, 6)
    if (!enPie(window, `${donde} · tabla diaria`)) return tarjetas.length

    const lineas = [...doc.querySelectorAll('[data-linea]')].map(l => l.dataset.linea)
    // Las trece lineas del calculo, los faltantes y el arqueo. Si falta una,
    // el neto sale de una resta que no se ve y nadie puede comprobarlo.
    for (const necesaria of [
      'ventaTotal', 'tarjeta', 'transferencia', 'otrasNoEfectivo', 'efectivoCobrado',
      'devoluciones', 'gastos', 'retiros', 'adelantos', 'proveedores',
      'otrasSalidas', 'entradas', 'neto', 'faltantes', 'arqueo',
    ]) {
      if (!lineas.includes(necesaria)) {
        errores.push(`${donde} · falta la linea «${necesaria}» de la tabla diaria`)
      }
    }
  }

  // ── Los faltantes registrados ──
  //
  // Va antes de marcar, porque marcar recarga. Lo que se comprueba aqui es la
  // regla que el dueño puso el 2026-11-06 y que no falla sola: que se enseñe
  // lo que alguien REGISTRO y que NO se enseñen los descuadres que Eleventa
  // escribe al cerrar turno.
  await revisarFaltantes(window, donde)

  // ── Marcar como depositado ──
  //
  // Va AL FINAL del recorrido de esta pantalla. Marcar recarga y vuelve a
  // armar los bloques: haciendolo antes, todo lo de arriba se mira sobre una
  // pantalla que ya cambio.
  await marcarUnBloque(window, donde)

  return tarjetas.length
}

/**
 * La seccion de faltantes registrados.
 *
 * Dos comprobaciones, y la que importa es la segunda:
 *
 *   · Que se dibuje lo que alguien registro como salida por faltante -uno
 *     desde Eleventa y otro capturado en la pagina-, agrupado por persona.
 *   · Que NO aparezca «jenni gllardo», que solo existe en los descuadres de
 *     corte del dato de mentira. El dueño los quito el 2026-11-06 porque no
 *     son precisos: $67,152 en diez meses, el 2.84% del efectivo cobrado, que
 *     no es dinero que desaparece sino un cierre que nadie cuadra. Enseñarlos
 *     acusa de un robo a quien solo cerro deprisa, y eso no falla solo.
 */
async function revisarFaltantes(window, donde) {
  const doc = window.document
  const chip = [...doc.querySelectorAll('button')]
    .find(x => /^faltantes/i.test((x.textContent || '').trim()))
  if (!chip) {
    errores.push(`${donde} · no hay pestaña de faltantes`)
    return
  }
  clic(window, chip)
  await nuevaVuelta(window, 6)
  if (!enPie(window, `${donde} · faltantes`)) return

  if (!doc.querySelector('[data-faltantes]')) {
    errores.push(`${donde} · la seccion de faltantes no se dibujo: un faltante registrado no saldria en ningun sitio`)
    return
  }
  const texto = doc.body.textContent || ''
  if (!/falt[oó] en el corte de la tarde/i.test(texto)) {
    errores.push(`${donde} · un faltante capturado en la pagina no se dibuja`)
  }
  if (!/FALTANTE EN CAJA/i.test(texto)) {
    errores.push(`${donde} · un faltante registrado en Eleventa no se dibuja`)
  }
  if (!/2 veces/.test(texto)) {
    errores.push(`${donde} · no se agrupa por persona: un faltante repetido del mismo cajero es la alerta que se pidio`)
  }
  if (/jenni gllardo/i.test(texto)) {
    errores.push(`REGLA ROTA · ${donde} · se estan enseñando los descuadres de cierre de turno: no son precisos y acusan de un faltante a quien solo cerro deprisa`)
  }

  // Y de vuelta a los bloques, que es donde sigue el recorrido.
  const volver = [...doc.querySelectorAll('button')]
    .find(x => /bloques por sucursal/i.test((x.textContent || '').trim()))
  if (volver) {
    clic(window, volver)
    await nuevaVuelta(window, 6)
    enPie(window, `${donde} · de vuelta en los bloques`)
  }
}

/**
 * Marca un bloque como depositado.
 *
 * Lo que se comprueba es la regla que puede romperse en silencio: que el monto
 * sea obligatorio. Si el boton de guardar deja de estar deshabilitado con el
 * campo vacio, se marcaria una semana como depositada sin monto, y esa semana
 * dejaria de acumular sin que nadie hubiera llevado el dinero al banco.
 */
async function marcarUnBloque(window, donde) {
  const doc = window.document
  const sinMarcar = [...doc.querySelectorAll('[data-bloque][data-depositado="0"]')]
  if (!sinMarcar.length) return

  const abrir = [...sinMarcar[0].querySelectorAll('button')]
    .find(b => /marcar depositado/i.test(b.textContent || ''))
  if (!abrir) {
    errores.push(`${donde} · un bloque sin marcar no tiene boton de marcarlo`)
    return
  }
  clic(window, abrir)
  await nuevaVuelta(window, 5)
  if (!enPie(window, `${donde} · forma de deposito`)) return

  const guardar = () => [...doc.querySelectorAll('button')]
    .find(b => /guardar dep[oó]sito/i.test(b.textContent || ''))
  if (!guardar()) {
    errores.push(`${donde} · la forma de deposito no tiene boton de guardar`)
    return
  }

  // El monto llega con lo esperado puesto, que es lo util. Vaciarlo tiene que
  // deshabilitar el guardado.
  const campo = [...doc.querySelectorAll('input')]
    .find(i => i.inputMode === 'decimal')
  if (campo) {
    escribir(window, campo, '')
    await nuevaVuelta(window, 3)
    if (!guardar()?.disabled) {
      errores.push(`REGLA ROTA · ${donde} · un deposito sin monto se puede guardar: esa semana dejaria de acumular sin que el dinero saliera`)
    }
    escribir(window, campo, '1234.50')
    await nuevaVuelta(window, 3)
    if (guardar()?.disabled) {
      errores.push(`REGLA ROTA · ${donde} · con monto puesto el deposito sigue sin poder guardarse`)
    }
  }

  clic(window, guardar())
  await nuevaVuelta(window, 6)
  enPie(window, `${donde} · tras marcar el deposito`)
}

// ── El recorrido ───────────────────────────────────────────────────────────

const SESIONES = [
  ['sin sesión', null],
  ['sucursal',   { isAdmin: false, branch: 'leon', token: 'x' }],
  ['admin',      { isAdmin: true,  branch: null,   token: 'x' }],
]

let pestanas = 0, secciones = 0, cabeceras = 0, hallazgos = 0
let fichasDeCodigo = 0
let bandejasDeCosto = 0
let foliosVistos = 0
let preciosPorPlaza = 0
let bandejasDePrecio = 0
let plazasDeEfectivo = 0

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
        .filter(x => x.closest('[class*="admin" i], nav, aside') || /pestañ|hero|catálog|color|pie|usuari|dropbox|surtido|compras|personal|efectivo/i.test(x.textContent))
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
        if (/ventas/i.test(t)) {
          fichasDeCodigo += await buscarUnCodigo(window, `${nombre} · admin · ${t}`)
          bandejasDeCosto += bandejaDeCostos(window, `${nombre} · admin · ${t}`)
          preciosPorPlaza += precioPorPlaza(window, `${nombre} · admin · ${t}`)
          bandejasDePrecio += preciosARevisar(window, `${nombre} · admin · ${t}`)
        }
        if (/surtido/i.test(t)) {
          foliosVistos += await listaDeFolios(window, `${nombre} · admin · ${t}`)
        }
        if (/efectivo/i.test(t)) {
          plazasDeEfectivo += await revisarEfectivo(window, `${nombre} · admin · ${t}`)
        }
      }
    }
  }

  revisarConsola(dichos, nombre)
  window.close()
}

// ── El parte ───────────────────────────────────────────────────────────────

console.log(`\nsesiones 3 · pestañas ${pestanas} · secciones de admin ${secciones} · cabeceras pulsadas ${cabeceras} · hallazgos recorridos ${hallazgos}`)
console.log(`  busqueda por codigo en ventas: ${fichasDeCodigo} ficha dibujada`)
if (fichasDeCodigo < 1) errores.push('la busqueda por codigo de ventas no se ejecuto')
console.log(`  bandeja de costos que faltan: ${bandejasDeCosto} dibujada`)
console.log(`  folios de surtido dibujados: ${foliosVistos}`)
console.log(`  seccion de precio por plaza: ${preciosPorPlaza} dibujada`)
console.log(`  bandeja de precios a revisar: ${bandejasDePrecio} dibujada`)
if (bandejasDePrecio < 1) {
  errores.push('la bandeja de precios a revisar no se dibujo: un precio torcido no saldria en ningun sitio')
}
if (preciosPorPlaza < 1) {
  errores.push('la seccion de precio por plaza no se dibujo: sin ella el precio medio vuelve a mezclar fundas, micas y stickers, y eso sale un numero que parece bueno')
}
console.log(`  plazas de flujo de efectivo dibujadas: ${plazasDeEfectivo}`)
if (plazasDeEfectivo < 5) {
  errores.push(`el flujo de efectivo dibujo ${plazasDeEfectivo} plazas de 5: una semana sin depositar no saldria en ningun sitio`)
}
if (foliosVistos < 2) {
  errores.push('la lista de folios de surtido no se dibujo con sus dos caminos: un folio con piezas faltantes no saldria en ningun sitio')
}
if (bandejasDeCosto < 1) {
  errores.push('la bandeja de «Costos que faltan en bodega» no se dibujo: el costo sale solo de bodega, y si el hueco no se ve la utilidad miente por omision')
}
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
