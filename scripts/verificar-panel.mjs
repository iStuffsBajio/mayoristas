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
      // Funda: publico $216, mayoreo $130. La lista del inventario falso dice
      // $55, asi que esta por ENCIMA de todo: sirve para el precio por plaza.
      I13T:   { producto: 'IPHONE 13 TPU CASE', pz: 100, dinero: 17300,
                pzMayoreo: 50, dineroMayoreo: 6500 },
      // Y esta se cobra POR DEBAJO de su propio mayoreo, que es lo que la
      // bandeja tiene que cazar. Sin una asi, la seccion no se dibuja y la
      // comprobacion pasaria en verde sin haber mirado nada.
      MTG24T: { producto: 'MOTO G24 TPU CASE', pz: 20, dinero: 400,
                pzMayoreo: 0, dineroMayoreo: 0 },
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

/** El dia de hace n dias, en ISO. */
const diasAtras = n => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const productos = MODELOS.map(([Codigo, Producto], i) => ({
  Codigo, Producto,
  // Dos en el tramo 1-3 a proposito: el panel de Inventarios arranca filtrado
  // por «Urgente (1-3)» y sin ninguno la tabla nacia VACIA. Con la tabla
  // vacia no hay renglones, y todo lo que vive en un renglon -el boton de
  // dar de baja, la clase junto al codigo- no se comprobaba nunca.
  Existencia: [34, 3, 0, 12, 2, 0, 91, 0, 25, 0][i],
  Precio: 55 + i * 3,
  // Sin precio de MAYOREO no hay suelo contra el que medir, y la bandeja de
  // «se vende mas barato que a un mayorista» no se dibujaba nunca: pasaba en
  // verde sin haber mirado un solo codigo.
  Mayoreo: 40 + i * 2,
  // RELATIVAS a hoy, por lo mismo que las de venta: con fechas fijas de 2025
  // ninguna entrada cae ya en las dos ediciones recientes, la seccion de
  // «¿estan vendiendo los modelos nuevos?» sale diciendo que no hay nada y
  // pasa en verde sin haber mirado un solo modelo.
  //
  // El reparto no es decorativo. Hacen falta las cuatro clases o la seccion
  // se ejercita a medias: uno que VENDE y otro MUDO en la ultima edicion
  // -sin mudo no se pinta el dinero parado-, uno de menos de 30 dias -que no
  // puede contar como fracaso- y dos en la edicion ANTERIOR, porque la
  // comparacion entre ediciones necesita las dos con algo medible y sin ella
  // no se dibuja.
  // DOS LOTES de verdad, porque una edicion es un lote y no un tramo de
  // calendario. Con diez fechas sueltas y lejanas cada una seria su propio
  // grupo, ninguno llegaria al minimo de tres, y la seccion caeria al
  // respaldo del goteo: sin segunda edicion no hay comparacion que mirar, y
  // comparar es lo que se pidio.
  //
  // El primer lote se reparte en varios dias -40, 36, 32 y 25- a proposito:
  // asi comprueba de paso que una tanda partida en dias NO sale como dos
  // ediciones, y dentro lleva uno de 25 dias que todavia no se puede juzgar,
  // que es el contador de «muy nuevos».
  Alta: diasAtras([400, 40, 36, 32, 25, 170, 168, 165, 500, 420][i]),
}))

/**
 * Un código NUEVO para un teléfono que YA existía, como el Galaxy S10e.
 *
 * El del 2026-11-09 no era un reabasto: León dio de alta otro código para un
 * teléfono que otras plazas vendían desde 2023, y «Modelos nuevos» agrupaba
 * por código. Éste es el IPHONE 13 —alta de hace 400 días— con un «3 en 1»
 * dado de alta hace 33, dentro del primer lote.
 *
 * Tiene que estar en la bodega también (entra por `productos`): si no, sería
 * un huérfano más y movería las cuentas de la cola de revisión.
 */
const VARIANTE_DE_MENTIRA = 'I13NT'
productos.push({
  Codigo: VARIANTE_DE_MENTIRA, Producto: 'IPHONE 13 3 IN 1',
  Existencia: 5, Precio: 70, Mayoreo: 50, Alta: diasAtras(33),
})

// La forma la fijan `estadisticaVacia` y `historialVacio` en
// src/lib/estadisticas.js: `dias` es una LISTA de { f, m }, no un número, y
// `periodos` otra de { p, m, dias }. Un número donde iba una lista tumbaba
// el panel entero con «302 is not iterable»; conviene que estos datos de
// mentira tengan la forma exacta, porque es justo lo que se comprueba.
const dia = (f, i) => ({ f, m: Object.fromEntries(MODELOS.map(([c], k) => [c, 1 + ((i + k) % 7)])) })

const estadisticas = {
  sucursal: 'leon', nombre: 'León', actualizado: '2026-10-19',
  catalogo: Object.fromEntries(MODELOS.map(([c, n]) => [c, n])),
  // RELATIVAS a hoy, no fijas. Con fechas fijas el dato caduca solo: pasados
  // 30 dias ningun modelo tiene «venta reciente», el panel de Inventarios
  // -que arranca filtrado por «solo los que se venden»- sale vacio, y todo lo
  // que vive en un renglon deja de comprobarse sin que nada falle.
  dias: [20, 16, 12, 8, 3].map(n => {
    const f = new Date()
    f.setDate(f.getDate() - n)
    return f.toISOString().slice(0, 10)
  }).map(dia),
}

/** El mes de hace n meses, como 'AAAA-MM'. */
const mesAtras = n => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 7)
}

const historial = {
  sucursal: 'leon', nombre: 'León', actualizado: '2026-10-19',
  catalogo: Object.fromEntries(MODELOS.map(([c, n]) => [c, n])),
  // Los meses tambien van relativos: con meses fijos, la venta de un modelo
  // que entro hace 45 dias caeria fuera de todos los periodos y saldria mudo
  // siendo el que mejor entro.
  periodos: Array.from({ length: 10 }, (_, i) => mesAtras(9 - i)).map((p, i) => ({
    p,
    // MUDOS A PROPOSITO: el segundo modelo de la ultima edicion y el segundo
    // de la anterior no venden nunca. Con todos vendiendo, «ni una pieza» y
    // «dinero parado» salen en cero y no se dibujan: la seccion pasaria en
    // verde sin haber enseñado la mitad que duele.
    // MUDOS A PROPOSITO, y los dos en la ULTIMA edicion: con todos
    // vendiendo, «ni una pieza» y «dinero parado» salen en cero y no se
    // dibujan, asi que la seccion pasaria en verde sin enseñar la mitad que
    // duele. El indice 3 tiene 12 piezas de existencia, que es lo que hace
    // que «parado» valga algo.
    m: Object.fromEntries(MODELOS
      .filter((_, k) => k !== 2 && k !== 3)
      .map(([c], k) => [c, 10 + ((i + k) % 23)])),
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

/**
 * Bajas dadas desde la pagina, para que el archivo tenga algo que enseñar.
 *
 * Hacen falta LAS DOS CLASES. Con solo pendientes no se ejercita el renglon
 * «ya no esta», que es justo lo que el archivo existe para conservar: la
 * pantalla vieja los perdia de vista en cuanto desaparecian del respaldo. Y
 * con solo resueltas no sale el boton de deshacer, que solo tiene sentido
 * mientras el codigo sigue ahi.
 *
 * `NOEXISTE` no esta en ningun inventario de mentira a proposito: por eso
 * cuenta como resuelta sin que nadie marque nada.
 */
const BAJAS = [
  {
    clave: `ocultar|${MODELOS[0][0]}`, codigo: MODELOS[0][0], producto: MODELOS[0][1],
    motivo: 'dado-de-baja', quien: 'admin',
    cuando: new Date(Date.now() - 3 * 864e5).toISOString(),
  },
  {
    // De hace mas de tres semanas: enciende el aviso de que nadie lo corrige,
    // que es una alerta distinta -ya no del dato, sino de que nadie lo toca-.
    clave: `ocultar|${MODELOS[1][0]}`, codigo: MODELOS[1][0], producto: MODELOS[1][1],
    motivo: 'mal-capturado', quien: 'leon', nota: 'se captura con dos nombres',
    cuando: new Date(Date.now() - 40 * 864e5).toISOString(),
  },
  {
    clave: 'ocultar|NOEXISTE', codigo: 'NOEXISTE', producto: 'MODELO QUE YA SE BORRO',
    motivo: 'ya-no-existe', quien: 'admin',
    cuando: new Date(Date.now() - 90 * 864e5).toISOString(),
  },
]

/**
 * Los días en cero del kárdex, con los TRES casos que la pantalla dice
 * distinto: León censura (la mitad del tiempo en cero), Aguascalientes es de
 * fiar (nunca en cero), y San Luis no tiene archivo —antes de la primera
 * sincronización que lo mide—. Con un solo caso, dos tercios de lo que se
 * dibuja no se ejecutarían nunca.
 */
function agotadosDe(plaza) {
  const parte = { leon: 0.5, aguascalientes: 0 }[plaza]
  if (parte === undefined) return null
  return {
    plaza, dias: 90,
    porCodigo: Object.fromEntries(productos.map(p => [p.Codigo,
      { diasEnCero: 90 * parte, diasMedidos: 90, parte }])),
  }
}

/**
 * ¿Torreón ya publicó su inventario?
 *
 * Por defecto NO, que es el estado real de producción hoy: vende, tiene
 * mercancía y no publica nada en `inventarios/`. Es lo que hace que la ficha
 * tenga que distinguir «sin dato» de «cero», y que la depuración bloquee toda
 * baja: con los archivos presentes esas ramas no se ejecutarían nunca.
 *
 * `depurar()` lo enciende un rato para ejercitar el otro camino —el de elegir
 * un código y darlo de baja— y lo vuelve a apagar al salir.
 */
let TORREON_PUBLICA = false

/**
 * Los ajustes que la página ha mandado, para que la siguiente pantalla que los
 * pida los encuentre. Sin esto, marcar un modelo como descontinuado en
 * «Depurar» no se vería en «Revisar» —cada pantalla vuelve a pedirlos— y no
 * se podría comprobar lo único que ese marcado promete.
 */
const AJUSTES_GUARDADOS = new Map()

// ── El corte semanal de la sucursal ──────────────────────────────────────
//
// El dato sale de los mismos `caja.flujos` del flujo de efectivo, pasado por el
// MISMO recorte que hace el servidor —`backend/src/cortes.js`, importado, no
// copiado—: una tienda recibe los días y los movimientos sin cajero ni
// faltantes. Si el recorte se rompiera, `daniela coronilla` llegaría a la
// pantalla y la comprobación de abajo lo diría.
const {
  diasParaTienda, movimientosParaTienda, ventasParaTienda, parametrosParaTienda,
} = await import('../backend/src/cortes.js')

// La sesión de la ventana que corre: el servidor contesta distinto a una tienda
// y al administrador, y el mock tiene que hacer lo mismo.
let SESION_ACTUAL = { isAdmin: false, branch: 'leon' }
const CORTES_GUARDADOS = {}      // plaza -> { lunes -> registro }
const POSTS_DE_CORTE = []
const FONDOS_GUARDADOS = {}
const POSTS_DE_FONDO = []

const PLAZAS_DEL_CORTE = ['leon', 'san-luis', 'aguascalientes', 'torreon']
const CAJA_TORREON = {
  respaldo: { archivo: 'respaldo-08-11-26.fbk', fecha: semanaAtras(0) },
  dias: [0, 1, 2, 3].flatMap(n => diasDe(n, 700 + n * 30)),
  movimientos: [
    { f: semanaAtras(0), tipo: 'gasto', monto: 90, concepto: 'papeleria', origen: 'eleventa' },
    { f: semanaAtras(0), tipo: 'retiro', monto: 800, concepto: 'pago de nomina quincena', origen: 'eleventa' },
    { f: semanaAtras(0), tipo: 'otra-salida', monto: 150, concepto: 'Comision Felipe Soto', origen: 'eleventa' },
  ],
  faltantes: [],
}
const PARAMS_TORREON = { fondoFijo: 600, desdeControlSalidas: DESDE_CONTROL }

const haceDias = n => { const d = new Date(); d.setDate(d.getDate() - n); return isoDia(d) }

/** Las ventas del corte de una plaza: desglose por tipo y mayoristas de ESA plaza. */
function ventasDeCorte(slug) {
  const dias = diasDe(0, 0).map(d => d.f)
  const mayor = {
    leon:             [['ANA LOPEZ LEON (1001)', 4, 38, 5200], ['BETO RUIZ LEON (1002)', 2, 12, 1500]],
    'san-luis':       [['CARLA PEREZ SLP (2001)', 3, 20, 2700]],
    aguascalientes:   [['DIEGO MORA AGS (3001)', 5, 41, 5600], ['ELSA RIOS AGS (3002)', 1, 6, 650]],
    torreon:          [['FELIPE SOTO TORREON (4001)', 2, 15, 1900]],
  }[slug] ?? []
  return {
    plaza: slug, detalleDias: 120, hasta: dias[6],
    porDiaTipo: dias.map((f, i) => ({ f, fundas: 6 + i, hidrogel: 2, stickers: 3, otros: i === 2 ? 4 : 0 })),
    // Fechas contadas hacia ATRAS desde hoy: una venta de mañana no existe, y
    // el ranking descarta lo futuro. Con los dias de la semana en curso, un
    // lunes la mitad quedaba fuera y el «menos activo» no salia.
    mayoristasPorDia: mayor.flatMap(([quien, tickets, piezas, dinero], i) =>
      [{ f: haceDias(i), quien, tickets, piezas, dinero }, { f: haceDias(3), quien, tickets, piezas: piezas + 2, dinero: dinero + 100 }]),
    mayoristas: [...mayor.map(([quien, tickets]) => ({ quien, tickets, ultima: haceDias(3) })),
                 { quien: `CLIENTE VIEJO ${slug.toUpperCase()} (9999)`, tickets: 8, ultima: '2026-08-01' }],
    // 🔒 Un ticket que rompe las reglas de mayoreo, ESTA semana, con el cajero
    // dentro: a una tienda le tiene que llegar sin él.
    reglasMayoreo: { dias: 120, desde: haceDias(119), total: 1, incidencias: [{
      f: haceDias(0), hora: '12:30', folio: `${slug.length}01`, cajero: 'daniela coronilla',
      mayorista: mayor[0]?.[0] ?? null, piezas: 3, etiquetas: 2,
      tipos: { fundas: 2, hidrogel: 0, stickers: 1, otros: 0 }, importe: 300, mayoreo: true,
      motivos: ['etiquetas-no-cuadran'],
    }] },
    cobrosElectronicos: { dias: 120, desde: haceDias(119), filas: [
      { f: haceDias(0), hora: '13:00', folio: '9001', forma: 't', total: 250, referencia: 'BBVA aut 123456' },
      { f: haceDias(0), hora: '14:10', folio: '9002', forma: 's', total: 900, referencia: '' },
    ] },
    // Esto NO debe llegar a una tienda: lo quita `ventasParaTienda`.
    ventana: { dias: 365, porCodigo: {} },
    cajeros: [{ quien: 'daniela coronilla', tickets: 50 }],
  }
}

function datosDeCorteMock(slug, esAdmin) {
  const f = slug === 'torreon' ? CAJA_TORREON : caja.flujos[slug]
  const params = slug === 'torreon' ? PARAMS_TORREON : caja.parametros[slug]
  const nombre = { leon: 'León', 'san-luis': 'San Luis Potosí', aguascalientes: 'Aguascalientes', torreon: 'Torreón' }[slug]
  return {
    plaza: slug, nombre,
    caja: esAdmin
      ? { hayDatos: true, respaldo: f.respaldo, dias: f.dias, movimientos: f.movimientos }
      : { hayDatos: true, respaldo: f.respaldo, dias: diasParaTienda(f, isoDia(new Date())), movimientos: movimientosParaTienda(f, isoDia(new Date())) },
    parametros: parametrosParaTienda(slug in FONDOS_GUARDADOS ? { ...params, fondoFijo: FONDOS_GUARDADOS[slug] } : params),
    ventas: ventasParaTienda(ventasDeCorte(slug), { conCajero: esAdmin }),
    conteos: CORTES_GUARDADOS[slug] ?? {},
  }
}

function respuestaDeCorte(u, opciones, sesionAdmin, plazaDeSesion) {
  if (/\/caja\/fondo/.test(u)) {
    const c = JSON.parse(opciones?.body ?? '{}')
    POSTS_DE_FONDO.push(c)
    FONDOS_GUARDADOS[c.sucursal] = c.fondoFijo
    return { ok: true, plaza: c.sucursal, fondoFijo: c.fondoFijo }
  }
  if (opciones?.method === 'POST') {
    const c = JSON.parse(opciones.body ?? '{}')
    POSTS_DE_CORTE.push(c)
    const total = Object.entries(c.cantidades ?? {}).reduce((a, [d, q]) => a + Number(d) * Number(q), 0)
    const previo = CORTES_GUARDADOS[c.plaza]?.[c.semana]
    const cuando = new Date().toISOString()
    const registro = {
      semana: c.semana, cantidades: c.cantidades, total, observaciones: c.observaciones ?? '',
      cuando, quien: sesionAdmin ? 'admin' : plazaDeSesion,
      historial: [...(previo?.historial ?? []), { cuando, quien: 'x', total }],
    }
    CORTES_GUARDADOS[c.plaza] = { ...(CORTES_GUARDADOS[c.plaza] ?? {}), [c.semana]: registro }
    return { ok: true, registro }
  }
  const pedida = u.match(/plaza=([a-z-]+)/)?.[1]
  const slugs = pedida && pedida !== 'todas' ? [pedida] : (sesionAdmin ? PLAZAS_DEL_CORTE : [plazaDeSesion])
  const r = {
    hoy: isoDia(new Date()),
    plazas: Object.fromEntries(slugs.map(s => [s, datosDeCorteMock(s, sesionAdmin)])),
  }
  // Lo que RECIBE una tienda, no sólo lo que se pinta: una pantalla que no
  // dibuja la columna del cajero esconde una fuga que sigue estando en los datos.
  if (!sesionAdmin && /daniela|jenni/i.test(JSON.stringify(r))) {
    errores.push('la respuesta del corte a una TIENDA lleva el nombre de quien cobro o cerro turno')
  }
  return r
}

// ── La nómina ────────────────────────────────────────────────────────────
//
// El dato pasa por el MISMO código del servidor —`recorteTienda` y
// `aplicarAccion`, importados— así lo que se comprueba es lo que de verdad
// recibe cada sesión. Daniela abre León toda la semana; el LUNES 45 minutos tarde —35 fuera de tolerancia, más de los 30 que admite la semana—, para
// que el bono salga perdido y haya algo que justificar. Y un ticket con funda
// $250 + mica $120 + sticker $100: el ejemplo del dueño, $25.90.
const NOM = await import('../backend/src/nomina.js')
const NOMINA = { config: { empleados: NOM.EMPLEADOS_INICIALES, parametros: null }, estado: {}, posts: [], configs: [] }
const diasHastaHoy = Array.from({ length: 7 }, (_, i) => { const d = new Date(LUNES_HOY); d.setDate(d.getDate() + i); return isoDia(d) })
  .filter(f => f <= isoDia(new Date()))
const TURNOS_NOMINA = diasHastaHoy.map((f, i) => ({ slug: 'leon', persona: 'daniela coronilla', fecha: f, inicio: `${f}T${i === 0 ? '11:15' : '10:22'}:00` }))
const COMISIONABLES_NOMINA = {
  leon: [{ id: '9001', folio: '9001', f: isoDia(new Date()), hora: '13:05', cajero: 'daniela coronilla', lineas: [
    { codigo: 'I13PER', producto: 'FUNDA PERSONALIZADA', tipo: 'funda', cantidad: 1, precio: 250, mayoreo: false },
    { codigo: 'HDA', producto: 'MICA HIDRIOGEL HD ALTA', tipo: 'hidrogel', cantidad: 1, precio: 120, mayoreo: false },
    { codigo: 'ST', producto: 'STIKER DISEÑO', tipo: 'sticker', cantidad: 1, precio: 100, mayoreo: false },
  ] }],
  'san-luis': [], aguascalientes: [], torreon: [],
}
function respuestaDeNomina(u, opciones, sesionAdmin, plazaDeSesion) {
  const hoy = isoDia(new Date())
  if (/\/nomina\/config/.test(u)) {
    const c = JSON.parse(opciones?.body ?? '{}')
    const r = NOM.limpiarConfig(c.config)
    NOMINA.configs.push(c)
    if (r.error) return { error: r.error }
    NOMINA.config = r.config
    return { ok: true, config: r.config, cambios: NOM.cambiosDeConfig(NOM.EMPLEADOS_INICIALES ? { empleados: NOM.EMPLEADOS_INICIALES } : {}, r.config) }
  }
  if (/\/nomina\/accion/.test(u)) {
    const a = JSON.parse(opciones?.body ?? '{}')
    NOMINA.posts.push(a)
    const r = NOM.aplicarAccion(NOMINA.estado, NOMINA.config, a, { quien: 'admin' })
    if (r.error) return { error: r.error }
    NOMINA.estado = r.estado
    return { ok: true, estado: r.estado }
  }
  if (sesionAdmin) {
    return { hoy, config: NOMINA.config, estado: NOMINA.estado, turnos: TURNOS_NOMINA, ultimoDato: { leon: hoy }, comisionables: COMISIONABLES_NOMINA, bitacora: [] }
  }
  const r = NOM.recorteTienda(NOMINA.config, NOMINA.estado, plazaDeSesion)
  // Lo que RECIBE la tienda, no sólo lo que pinta: la pantalla sólo calcula su
  // plaza, así que el sueldo de otra llegaría en los datos sin dibujarse.
  const ajenos = (r.config?.empleados ?? []).filter(e => e.plaza !== plazaDeSesion)
  if (ajenos.length) errores.push(`la nómina que recibe ${plazaDeSesion} trae a ${ajenos.map(e => e.nombre).join(', ')}`)
  if (/"ingreso"|diasVacaciones|"vacaciones"/.test(JSON.stringify(r))) errores.push(`la nómina que recibe ${plazaDeSesion} trae datos de RH`)
  return { hoy, plaza: plazaDeSesion, config: r.config, estado: r.estado,
    turnos: TURNOS_NOMINA.filter(t => t.slug === plazaDeSesion), ultimoDato: { [plazaDeSesion]: hoy },
    comisionables: { [plazaDeSesion]: COMISIONABLES_NOMINA[plazaDeSesion] ?? [] } }
}

// ── El CRM: clientes y bandeja ────────────────────────────────────────────
//
// Las fichas pasan por las MISMAS reglas del servidor —`backend/src/clientes.js`,
// importado— así lo que se comprueba es lo que de verdad recibe cada sesión.
// Tres clientes: uno de León que el bot ya pasó a la tienda (pendiente, con su
// conversación y el anuncio del que llegó), un mayorista de León y uno de San
// Luis, que una tienda de León NO puede ver ni en los datos.
const CRM = await import('../backend/src/clientes.js')
const CRM_CLIENTES = new Map()
{
  const alta = (datos, mensajes = [], entregar = null) => {
    let c = CRM.nuevoCliente(datos)
    for (const m of mensajes) c = CRM.registrarMensaje(c, m)
    if (entregar) c = CRM.aplicarAccion(c, { accion: 'entregar', plaza: entregar }, { quien: 'bot' }).cliente
    CRM_CLIENTES.set(c.id, c)
  }
  alta({ id: CRM.idDe({ canal: 'whatsapp', telefono: '4771234567' }), canal: 'whatsapp', telefono: '4771234567',
         nombre: 'Cliente de prueba León', plaza: 'leon', quien: 'bot',
         origen: { fuente: 'meta', anuncio: 'Fundas iPhone 17', codigo: 'IS-LEON-01' } },
       [{ de: 'cliente', texto: '¿Tienen funda del iPhone 17 Pro?', id: 'wamid.1' },
        { de: 'bot', texto: 'Sí, te paso con la tienda de León.' }], 'leon')
  alta({ id: CRM.idDe({ canal: 'tienda', plaza: 'leon', clave: 'Mayorista de prueba' }), canal: 'tienda',
         nombre: 'Mayorista de prueba', plaza: 'leon', tipo: 'mayorista', quien: 'admin', origen: { fuente: 'tienda' } })
  alta({ id: CRM.idDe({ canal: 'whatsapp', telefono: '4449876543' }), canal: 'whatsapp', telefono: '4449876543',
         nombre: 'CLIENTE AJENO SLP', plaza: 'san-luis', quien: 'bot', origen: { fuente: 'meta' } },
       [{ de: 'cliente', texto: 'Hola', id: 'wamid.2' }])
  // A éste el bot no pudo contestarle y se rindió: es la marca que pone el
  // trabajador al agotar los reintentos (`crm/trabajador.js`). Está «con el
  // bot» —que por orden iría al fondo— y aun así tiene que salir el primero.
  alta({ id: CRM.idDe({ canal: 'whatsapp', telefono: '4775550000' }), canal: 'whatsapp', telefono: '4775550000',
         nombre: 'Cliente sin respuesta', plaza: 'leon', quien: 'bot', origen: { fuente: 'meta' } },
       [{ de: 'cliente', texto: '¿Tienen para Moto G84?', id: 'wamid.3' }])
  const sr = CRM.idDe({ canal: 'whatsapp', telefono: '4775550000' })
  CRM_CLIENTES.set(sr, CRM.marcarSinRespuesta(CRM_CLIENTES.get(sr), { motivo: 'el bot falló 3 veces', mensaje: 'wamid.3' }))
}
const POSTS_CRM = []

function respuestaDeCrm(u, opciones, sesionAdmin, plazaDeSesion) {
  const sesion = { admin: sesionAdmin, sucursal: plazaDeSesion }
  if (!sesionAdmin && !CRM.PLAZAS_CLIENTES.includes(plazaDeSesion)) {
    errores.push(`la sesion de ${plazaDeSesion} pidio el CRM, que no le toca`)
    return null
  }
  const quien = sesionAdmin ? 'admin' : plazaDeSesion
  const cuerpo = JSON.parse(opciones?.body ?? '{}')
  if (/\/crm\/clientes/.test(u)) {
    const pedida = u.match(/plaza=([a-z-]+)/)?.[1]
    const visibles = [...CRM_CLIENTES.values()]
      .filter(c => CRM.puedeVer(sesion, c))
      .filter(c => !pedida || (pedida === 'sin-plaza' ? !c.plaza : c.plaza === pedida))
    const r = { clientes: CRM.ordenarBandeja(visibles), cuenta: CRM.contar(visibles) }
    if (!sesionAdmin && /AJENO|4449876543/.test(JSON.stringify(r))) {
      errores.push(`la bandeja que recibe ${plazaDeSesion} trae un cliente de otra plaza`)
    }
    return r
  }
  if (/\/crm\/cliente\?/.test(u)) {
    const c = CRM_CLIENTES.get(decodeURIComponent(u.match(/id=([^&]+)/)?.[1] ?? ''))
    return c && CRM.puedeVer(sesion, c) ? { cliente: c } : null
  }
  POSTS_CRM.push({ ruta: u.replace(/^.*\/crm/, '/crm'), cuerpo })
  const c = CRM_CLIENTES.get(cuerpo.id)
  if (!c || !CRM.puedeVer(sesion, c)) return null
  let sig = c
  if (/\/crm\/responder/.test(u)) {
    if (c.estado !== 'atendiendo' || c.atiende !== quien) sig = CRM.aplicarAccion(c, { accion: 'tomar' }, { quien }).cliente
    sig = CRM.registrarMensaje(sig, { de: 'tienda', texto: cuerpo.texto, quien, envio: 'sin-canal' })
    CRM_CLIENTES.set(sig.id, sig)
    return { ok: true, cliente: sig, enviado: false, aviso: 'Quedó guardado en la conversación. Todavía no sale por WhatsApp: la línea de Meta no está encendida.' }
  }
  if (/\/crm\/accion/.test(u)) {
    const r = CRM.aplicarAccion(c, { accion: cuerpo.accion, plaza: cuerpo.plaza }, { quien })
    if (r.error) { errores.push(`CRM · ${cuerpo.accion}: ${r.error}`); return null }
    CRM_CLIENTES.set(r.cliente.id, r.cliente)
    return { ok: true, cliente: r.cliente }
  }
  return null
}

/** Lo que devuelve cada ruta, según lo que pida. `null` es un 404. */
function respuesta(url, opciones) {
  const u = String(url)
  if (/\/nomina(\/config|\/accion)?(\?|$)/.test(u)) {
    return respuestaDeNomina(u, opciones, SESION_ACTUAL.isAdmin, SESION_ACTUAL.branch)
  }
  if (/\/crm\//.test(u)) {
    return respuestaDeCrm(u, opciones, SESION_ACTUAL.isAdmin, SESION_ACTUAL.branch)
  }
  if (/\/corte(\/conteo)?(\?|$)|\/caja\/fondo/.test(u)) {
    return respuestaDeCorte(u, opciones, SESION_ACTUAL.isAdmin, SESION_ACTUAL.branch)
  }
  if (opciones?.method === 'POST' && /\/ajustes(\?|$)/.test(u)) {
    const c = JSON.parse(opciones.body ?? '{}')
    const items = c.items?.length ? c.items : [{ codigo: c.codigo, producto: c.producto }]
    for (const { codigo, producto } of items) {
      const k = String(codigo ?? '').toUpperCase()
      const clave = `${c.tipo ?? 'ocultar'}|${k}`
      if (c.motivo == null) AJUSTES_GUARDADOS.delete(clave)
      else AJUSTES_GUARDADOS.set(clave, {
        clave, tipo: c.tipo ?? 'ocultar', codigo: k, motivo: c.motivo,
        producto: producto ?? '', nota: c.nota ?? '', cuando: new Date().toISOString(), quien: 'admin',
      })
    }
    return { ok: true, por: 'admin', cantidad: items.length }
  }
  if (/inventarios\/torreon\//.test(u)) {
    // Sólo el inventario, y sólo cuando se pide: estadística, historial y días
    // en cero de Torreón siguen sin existir, que también es lo real.
    return TORREON_PUBLICA && /inventario\.json/.test(u) ? inventarioDe('torreon') : null
  }
  // La ruta de bajas: el servidor acepta lo que le llegue. El candado de verdad
  // se prueba en `backend/test/bajas.test.js`; aquí sólo importa que la
  // pantalla pida, enseñe lo contestado y no se rompa.
  if (/\/ajustes\/bajas/.test(u)) {
    const codigos = JSON.parse(opciones?.body ?? '{}').codigos ?? []
    return {
      ok: true, dias: 365, rechazados: [],
      aceptados: codigos.map(c => ({
        clave: `ocultar|${c}`, tipo: 'ocultar', codigo: c, motivo: 'baja-definitiva',
        producto: '', nota: '', cuando: new Date().toISOString(), quien: 'admin',
      })),
    }
  }
  if (/indice\.json/.test(u)) {
    return { mockups: MODELOS.map(([codigo, nombre], i) => ({ codigo, nombre, archivo: `${codigo}.png`, piezas: 200 - i * 10 })) }
  }
  // Antes que nada: la ruta lleva `inventarios/` y caería en el inventario.
  if (/agotados\.json/.test(u)) return agotadosDe(u.match(/inventarios\/([a-z-]+)\//)?.[1])
  if (/estadistica/i.test(u)) return estadisticas
  if (/historial/i.test(u)) return historial
  if (/turnos/i.test(u)) return turnos
  // Las respuestas de la cola viven en el backend, no en S3 publico.
  if (/revisiones/i.test(u)) return { marcas: {} }
  if (/\/ajustes/i.test(u)) return { ajustes: [...BAJAS, ...AJUSTES_GUARDADOS.values()] }
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
          // La última venta exacta. Sin ella en ninguna plaza, la depuración
          // dice que no puede probar nada y bloquea toda baja: lo correcto, pero
          // entonces ninguna rama de «se puede dar de baja» se ejercita.
          UltimaVenta: diasAtras(3),
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
      ...productos.map(p => ({ ...p, UltimoMov: '2026-10-18', UltimaVenta: diasAtras(3) })),
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
  SESION_ACTUAL = sesion ?? { isAdmin: false, branch: null }

  if (sesion) window.sessionStorage.setItem('istuffs_session', JSON.stringify(sesion))

  // Nada de red: el inventario vive en S3 y aquí no se va a buscar. Lo que
  // se devuelve tiene la forma de lo real para que las tablas se pinten.
  window.fetch = (url, opciones) => {
    const cuerpo = respuesta(url, opciones)
    if (cuerpo === null) {
      return Promise.resolve({
        ok: false, status: 404,
        json: () => Promise.reject(new Error('404')),
        text: () => Promise.resolve(''),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      })
    }
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
 * «¿Estan vendiendo los modelos nuevos?», en la pestaña de Ventas.
 *
 * Lo que esto caza no son las cuentas -eso lo fija `estrenos.test.js`- sino
 * que la seccion deje de dibujarse o se quede a medias. Y puede quedarse a
 * medias sin que nada falle: si solo salieran los que venden, la pantalla se
 * veria perfecta y diria que la edicion entro bien; si se perdiera la
 * comparacion entre ediciones, se seguiria pudiendo leer una sola y nadie
 * echaria de menos la otra. Las dos cosas son la pregunta que se hizo.
 */
async function modelosNuevos(window, donde) {
  const doc = window.document
  const sec = doc.querySelector('[data-estrenos]')
  if (!sec) {
    errores.push(`${donde} · no se dibujo «estan vendiendo los modelos nuevos»`)
    return 0
  }

  // Las dos ediciones. Con una sola no hay nada que comparar, que es
  // literalmente lo que se pidio: «la edicion anterior o las ultimas dos».
  for (const n of ['1', '2']) {
    if (!doc.querySelector(`[data-edicion="${n}"]`)) {
      errores.push(`${donde} · falta la edicion ${n}`)
    }
  }
  if (!doc.querySelector('[data-compara-ediciones]')) {
    errores.push(`${donde} · no se compara una edicion con la otra`)
  }

  const filas = () => [...doc.querySelectorAll('[data-estreno]')]
  if (!filas().length) {
    errores.push(`${donde} · la seccion no listo ningun modelo nuevo`)
    return 1
  }

  // Un código nuevo de un teléfono que ya existía NO es un modelo nuevo, y no
  // se esconde en silencio: sale aparte, con el código del que viene. Si la
  // regla se cae, el S10e vuelve a salir como estreno; si se cae lo segundo,
  // quien vea que falta un modelo no tiene dónde mirar por qué.
  if (filas().some(f => f.dataset.estreno === VARIANTE_DE_MENTIRA)) {
    errores.push(`${donde} · ${VARIANTE_DE_MENTIRA} sale como modelo nuevo siendo otra presentacion de un telefono que ya existia`)
  }
  const apartadas = doc.querySelector('[data-variantes]')
  if (!apartadas) {
    errores.push(`${donde} · la seccion no enseña los codigos que dejo fuera por ser variantes`)
  } else if (!apartadas.querySelector(`[data-variante="${VARIANTE_DE_MENTIRA}"]`)) {
    errores.push(`${donde} · ${VARIANTE_DE_MENTIRA} no aparece entre los que se dejaron fuera`)
  } else if (!/ya existía como/.test(apartadas.textContent || '')) {
    // No se mira UN código concreto: la prueba cita el más antiguo de todos
    // los IPHONE 13 que hay, y cuál sea depende de los datos de mentira.
    errores.push(`${donde} · no dice de que codigo viene la variante`)
  }

  const txt = (sec.textContent || '').replace(/\s+/g, ' ')
  // Los tres montones tienen que estar. «Muy nuevos» es el que evita que un
  // modelo de dos semanas cuente como fracaso, y es el que se cae solo.
  for (const que of ['sí venden', 'ni una pieza', 'muy nuevos']) {
    if (!txt.includes(que)) errores.push(`${donde} · la seccion no separa «${que}»`)
  }
  // Y el ritmo, que es lo unico que permite comparar un modelo de 115 dias
  // con uno de 35: sin el, la tabla ordena por piezas y dice lo contrario.
  if (!txt.includes('pz/mes')) {
    errores.push(`${donde} · la tabla perdio el ritmo: comparar por piezas totales miente`)
  }

  // Cambiar de edicion tiene que cambiar la tabla de verdad.
  const antes = filas().map(f => f.dataset.estreno).join(',')
  clic(window, doc.querySelector('[data-edicion="2"]'))
  await nuevaVuelta(window, 5)
  if (!enPie(window, `${donde} · edicion anterior`)) return 1
  const despues = filas().map(f => f.dataset.estreno).join(',')
  if (antes === despues) {
    errores.push(`${donde} · cambiar de edicion no cambio la lista: enseña los mismos modelos`)
  }
  clic(window, doc.querySelector('[data-edicion="1"]'))
  await nuevaVuelta(window, 5)
  return 1
}

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

/** Elige en un <select> controlado por React. */
function elegir(window, select, valor) {
  // Igual que `escribir`, pero con el prototipo de <select>: usando el de
  // <input> el valor se escribe y React no se entera, asi que el componente
  // se queda con la opcion anterior y la comprobacion mide otra cosa.
  select._valueTracker?.setValue(valor === '' ? '\u0000' : '')
  Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')
    .set.call(select, valor)
  select.dispatchEvent(new window.Event('change', { bubbles: true }))
}

/** Pulsa una tecla en la ventana, como la pulsaria una persona. */
const tecla = (window, key) =>
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }))

/**
 * La pestaña de Revisar entera: la bandeja que sustituyo a la cola.
 *
 * Lo que esto existe para cazar NO es que las cuentas salgan mal -eso lo fijan
 * `incidencias.test.js` y las pruebas del backend- sino que una de las piezas
 * del rediseño deje de dibujarse. Y son justo las que pueden desaparecer sin
 * que nada falle: si el panel de detalle se cae, la lista sigue ahi y se ve
 * perfecta; si las acciones en bloque se van, se puede seguir contestando de
 * una en una; si el mensaje para la sucursal no se genera, no hay error en
 * consola. Cada una de las dos quejas que pidieron el rediseño -no habia
 * registro de los movimientos, y llenarlo era tedioso- se vuelve invisible asi.
 */
async function revisarBandeja(window, donde) {
  const doc = window.document
  let sec = null
  for (let i = 0; i < 10 && !sec; i++) {
    await nuevaVuelta(window, 6)
    sec = doc.querySelector('[data-bandeja]')
  }
  if (!sec) {
    errores.push(`${donde} · no se dibujo la bandeja de incidencias`)
    return 0
  }

  // Y la cola vieja NO puede seguir ahi. Se quito a proposito: dejandola
  // debajo, todo lo de abajo seguiria pasando y el rediseño no habria
  // cambiado la forma de operar, que era justo la queja.
  if (doc.querySelector('.revisar-ficha')) {
    errores.push(`${donde} · la cola de una ficha a la vez sigue dibujandose`)
  }

  for (const p of ['atender', 'sucursal', 'conflicto', 'descartadas', 'cerradas']) {
    if (!doc.querySelector(`[data-bandeja-pestana="${p}"]`)) {
      errores.push(`${donde} · la bandeja no tiene la pestaña «${p}»`)
    }
  }

  const filas = () => [...doc.querySelectorAll('[data-incidencia]')]
  if (!filas().length) {
    errores.push(`${donde} · la bandeja no listo ninguna incidencia`)
    return 0
  }
  const cuantas = filas().length

  // ── El orden, ANTES de escribir nada ──────────────────────────────────
  //
  // 🔒 Dentro de un mismo estado manda `PASO`, la escalera del dueño. Se
  // comprueba aqui porque reordenar la bandeja no cambia cuantas incidencias
  // hay -cambia cuales van primero- y eso no sale en ningun numero. Y va
  // antes de cualquier guardado porque guardar cambia el estado, y el estado
  // manda por encima de la escalera: midiendolo despues se mediria otra cosa.
  const pasos = filas().map(f => Number(f.dataset.paso))
  if (pasos.some(Number.isNaN)) {
    errores.push(`SIN PASO · ${donde} · una incidencia no dice su sitio en la escalera`)
  }
  for (let k = 1; k < pasos.length; k++) {
    if (pasos[k] < pasos[k - 1]) {
      errores.push(`ORDEN ROTO · ${donde} · la incidencia ${k + 1} es del paso ${pasos[k]} y va detras de una del paso ${pasos[k - 1]} · escalera: ${pasos.join(',')} · estados: ${filas().map(f => f.dataset.estado).join(',')}`)
      break
    }
  }

  // Los lotes. Se apuntan aparte porque el total NO distingue: si la
  // agrupacion se rompiera y la bandeja volviera a preguntar codigo por
  // codigo, el total SUBIRIA, no bajaria, y la alarma no sonaria.
  for (const f of filas()) {
    const h = f.dataset.incidencia ?? ''
    if (h.startsWith('lote|')) lotesVistos.add(h.split('|')[1] ?? '?')
  }

  // ── Los filtros y las vistas ──────────────────────────────────────────
  for (const sel of ['[data-filtro-plaza]', '[data-filtro-regla]', '[data-filtro-busca]']) {
    if (!doc.querySelector(sel)) errores.push(`${donde} · falta el filtro ${sel}`)
  }
  const vistaVencidas = doc.querySelector('[data-vista="vencidas"]')
  if (!vistaVencidas) errores.push(`${donde} · no hay vista guardada de «fuera de plazo»`)
  else {
    // Filtrar tiene que filtrar DE VERDAD. Un filtro que se pinta y no quita
    // nada es la forma mas facil de que esto parezca funcionar: sin ninguna
    // vencida, esta vista tiene que dejar la lista en cero.
    clic(window, vistaVencidas)
    await nuevaVuelta(window, 5)
    if (filas().length === cuantas && cuantas > 0) {
      errores.push(`${donde} · la vista «fuera de plazo» no filtro nada: enseña las ${cuantas} igual`)
    }
    clic(window, doc.querySelector('[data-vista="todo"]'))
    await nuevaVuelta(window, 5)
  }

  // ── El tablero ────────────────────────────────────────────────────────
  const verTablero = doc.querySelector('[data-ver-tablero]')
  if (!verTablero) errores.push(`${donde} · no se puede ver el tablero`)
  else {
    clic(window, verTablero)
    await nuevaVuelta(window, 5)
    if (!doc.querySelector('[data-tablero]')) {
      errores.push(`${donde} · el tablero no se dibujo`)
    }
    if (!enPie(window, `${donde} · tablero`)) return cuantas
    clic(window, doc.querySelector('[data-ver-tablero]'))
    await nuevaVuelta(window, 5)
  }

  // ── El atajo de teclado ───────────────────────────────────────────────
  //
  // Es la mitad de «que cualquiera lo haga el doble de rapido», y se puede
  // romper sin que nada falle: el oyente se registra en `window`, asi que si
  // deja de hacerlo la pantalla se dibuja perfecta y las teclas no hacen
  // nada. `x` marca la fila del cursor, y marcar saca la barra de bloque.
  tecla(window, 'x')
  await nuevaVuelta(window, 5)
  if (!doc.querySelector('[data-bloque]')) {
    errores.push(`${donde} · el atajo «x» no marco nada: los atajos de teclado no responden`)
  } else {
    // ── Las acciones en bloque ──────────────────────────────────────────
    for (const sel of ['[data-bloque-revisando]', '[data-bloque-origen]',
                       '[data-bloque-responsable]', '[data-bloque-asignar]']) {
      if (!doc.querySelector(sel)) errores.push(`${donde} · la barra de bloque no tiene ${sel}`)
    }
    // Asignar con los dos campos vacios no se puede: una asignacion sin
    // nombre ni fecha no asigna nada y se leeria como que si.
    const asignar = doc.querySelector('[data-bloque-asignar]')
    if (asignar && !asignar.disabled) {
      errores.push(`REGLA ROTA · ${donde} · se puede asignar un bloque sin nombre ni fecha`)
    }
    const aQuien = doc.querySelector('[data-bloque-responsable]')
    if (aQuien) {
      escribir(window, aQuien, 'Brenda')
      await nuevaVuelta(window, 4)
      if (doc.querySelector('[data-bloque-asignar]')?.disabled) {
        errores.push(`REGLA ROTA · ${donde} · con nombre puesto sigue sin poder asignarse`)
      }
    }
    tecla(window, 'x')
    await nuevaVuelta(window, 4)
  }

  // ── El panel de detalle ───────────────────────────────────────────────
  //
  // Se pulsa el area de abrir del renglon, no el renglon: el manejador vive
  // ahi -la casilla de marcar esta dentro y con el clic en el padre marcar
  // abriria la ficha de paso- y los eventos suben, no bajan.
  const primera = filas()[0]
  const huella = primera.dataset.incidencia
  clic(window, primera.querySelector('[data-abrir]') ?? primera)
  await nuevaVuelta(window, 6)
  const panel = doc.querySelector('[data-detalle]')
  if (!panel) {
    errores.push(`${donde} · una incidencia no se puede abrir para trabajarla`)
    return cuantas
  }
  if (!enPie(window, `${donde} · panel de detalle`)) return cuantas

  // La evidencia tiene que seguir ahi. Es lo que enseñaba la ficha vieja, y
  // quitarla al rediseñar habria convertido el panel en un formulario a
  // ciegas: decidir sin los hechos delante es como se contesta mal.
  const txt = (panel.textContent || '').replace(/\s+/g, ' ')
  if (!/Qué se sabe|Si sí:|Si no:/.test(txt)) {
    errores.push(`${donde} · el panel de detalle perdio la evidencia: ya no dice que se sabe ni que pasa con cada respuesta`)
  }
  if (!/Historial del caso/.test(txt)) {
    errores.push(`${donde} · el panel no tiene historial: era la razon del rediseño`)
  }
  for (const sel of ['[data-gravedad]', '[data-motivo]', '[data-responsable]',
                     '[data-compromiso]', '[data-comentario]', '[data-guardar]']) {
    if (!panel.querySelector(sel)) errores.push(`${donde} · el panel no tiene ${sel}`)
  }

  // ── La regla con dientes: descartar PIDE motivo ───────────────────────
  //
  // Es la unica de esta pantalla que puede romperse en silencio. Si el boton
  // de guardar deja de estar deshabilitado, se descartarian doscientos casos
  // sin decir por que, y un aviso apagado sin motivo no lo puede revisar
  // nadie a la semana. Es la heredera de la regla del «no» de la cola vieja.
  const elEstado = panel.querySelector('[data-estado-elegido]')
  if (!elEstado) errores.push(`${donde} · el panel no deja elegir que hacer`)
  else {
    elegir(window, elEstado, 'descartada')
    await nuevaVuelta(window, 5)
    const guardar = doc.querySelector(`[data-guardar="${huella}"]`)
    if (!guardar) errores.push(`${donde} · tras elegir descartar no hay con que guardar`)
    else if (!guardar.disabled) {
      errores.push(`REGLA ROTA · ${donde} · se puede descartar sin motivo`)
    } else {
      elegir(window, doc.querySelector('[data-motivo]'), 'no-es-error')
      await nuevaVuelta(window, 5)
      if (doc.querySelector(`[data-guardar="${huella}"]`)?.disabled) {
        errores.push(`REGLA ROTA · ${donde} · con motivo elegido sigue sin poder descartarse`)
      } else {
        clic(window, doc.querySelector(`[data-guardar="${huella}"]`))
        await nuevaVuelta(window, 6)
        if (!enPie(window, `${donde} · tras descartar`)) return cuantas
      }
    }
  }

  // ── Lo que impide que esto se vacie y se vuelva a llenar igual ────────
  for (const [sel, que] of [
    ['[data-por-sucursal]', 'lo que le toca a cada plaza'],
    ['[data-causa]', 'de donde sale el trabajo'],
    ['[data-catalogo]', 'que significa cada error'],
  ]) {
    if (!doc.querySelector(sel)) errores.push(`${donde} · no se dibujo «${que}»`)
  }

  // El mensaje para la sucursal. Se genera y no se escribe porque escribirlo
  // a mano es lo que no se hace nunca; si el boton desaparece, nadie lo echa
  // de menos y se vuelve a mandar «mira la pestaña», que no es un encargo.
  const wa = doc.querySelector('[data-whatsapp]')
  if (!wa) errores.push(`${donde} · no hay como mandarle a la plaza lo que le toca`)

  // El catalogo editable: si el boton de editar se va, la explicacion de cada
  // regla vuelve a estar enterrada en el codigo.
  const editar = doc.querySelector('[data-editar-catalogo]')
  if (!editar) errores.push(`${donde} · el catalogo de errores no se puede editar`)
  else {
    clic(window, editar)
    await nuevaVuelta(window, 5)
    if (!doc.querySelector('[data-guardar-catalogo]')) {
      errores.push(`${donde} · el catalogo se abre pero no se puede guardar`)
    }
    if (!enPie(window, `${donde} · catalogo`)) return cuantas
  }

  porSitio.push(`${donde}: ${cuantas} incidencias`)
  return cuantas
}

/**
 * El detalle de salidas de caja, en la pestaña de Efectivo.
 *
 * La tabla de la semana dice CUANTO salio; esto dice EN QUE se fue, que es la
 * pregunta que de verdad se hace quien mira el cajon. Lo pidio el dueño el
 * 2026-11-08 porque no habia ningun sitio donde leer el concepto.
 *
 * Y lo que esto caza de verdad es que se cuele un FALTANTE en la lista. Un
 * faltante no resta del efectivo neto -ver `NO_RESTAN`- y lleva el nombre de
 * quien cerro el turno pegado a una cantidad de dinero que falta. Metido
 * entre las salidas se leeria como una salida mas, cuadraria la cuenta que no
 * debe cuadrar, y de paso acusaria a alguien en una lista donde no toca.
 */
async function salidasDeCaja(window, donde) {
  const doc = window.document
  const sec = doc.querySelector('[data-salidas-semana]')
  if (!sec) {
    // Puede no haber ninguna salida esa semana, y entonces se DICE en vez de
    // dejar el hueco: un hueco se lee como que no cargo.
    if (doc.querySelector('[data-sin-salidas]')) return 1
    errores.push(`${donde} · ni detalle de salidas ni aviso de que no hay`)
    return 0
  }

  const abrir = doc.querySelector('[data-abrir-salidas]')
  if (!abrir) {
    errores.push(`${donde} · el detalle de salidas no se puede abrir`)
    return 1
  }
  clic(window, abrir)
  await nuevaVuelta(window, 6)
  if (!enPie(window, `${donde} · salidas de caja`)) return 1

  const filas = [...doc.querySelectorAll('[data-salida]')]
  if (!filas.length) {
    errores.push(`${donde} · el detalle se abrio vacio`)
    return 1
  }

  const txt = (sec.textContent || '').replace(/\s+/g, ' ')
  // El concepto es la unica columna por la que esta tabla existe.
  if (!/papeleria sin ticket/.test(txt)) {
    errores.push(`${donde} · el detalle no enseña el concepto de la salida`)
  }
  // Y el faltante NO puede estar.
  if (/falto en el corte/.test(txt)) {
    errores.push(`FALTANTE EN LAS SALIDAS · ${donde} · un faltante no resta del neto y lleva un nombre pegado`)
  }
  return 1
}

/**
 * El archivo de bajas, en la pestaña de Inventarios.
 *
 * Lo que esto caza es que el archivo vuelva a perder de vista lo ya resuelto,
 * que es el agujero que lo pidio: la pantalla vieja filtraba por pendiente,
 * asi que en cuanto un codigo desaparecia del respaldo el renglon se caia y
 * no quedaba donde mirarlo. Si alguien vuelve a filtrar aqui, la seccion se
 * seguira dibujando perfecta —con menos renglones— y nada fallaria.
 */
async function archivoDeBajas(window, donde) {
  const doc = window.document
  const sec = doc.querySelector('[data-archivo-bajas]')
  if (!sec) {
    errores.push(`${donde} · no se dibujo el archivo de bajas`)
    return 0
  }

  const abrir = doc.querySelector('[data-abrir-archivo]')
  if (!abrir) {
    errores.push(`${donde} · el archivo de bajas no se puede abrir`)
    return 1
  }
  clic(window, abrir)
  await nuevaVuelta(window, 6)
  if (!enPie(window, `${donde} · archivo de bajas`)) return 1

  const filas = [...doc.querySelectorAll('[data-baja-archivada]')]
  if (filas.length !== BAJAS.length) {
    errores.push(`${donde} · el archivo enseña ${filas.length} bajas de ${BAJAS.length}: volvio a perder las resueltas`)
  }

  const txt = (sec.textContent || '').replace(/\s+/g, ' ')
  // Las dos clases tienen que distinguirse. Sin esto, enseñarlas todas
  // mezcladas no diria cual sigue pendiente de borrar en la caja.
  if (!/ya no está/.test(txt)) {
    errores.push(`${donde} · el archivo no marca lo que YA desaparecio del respaldo`)
  }
  if (!/sigue en/.test(txt)) {
    errores.push(`${donde} · el archivo no dice donde sigue vivo lo pendiente`)
  }
  // Y la frase que contesta la pregunta que lo origino: a donde va lo que
  // se borra. Si se cae, la pantalla vuelve a no explicarse sola.
  if (!/no borra nada de Eleventa/.test(txt)) {
    errores.push(`${donde} · el archivo ya no explica que la ✕ no borra nada`)
  }
  if (!doc.querySelector('[data-bajar-archivo]')) {
    errores.push(`${donde} · el archivo no se puede bajar en Excel`)
  }
  // Deshacer solo en lo pendiente: devolver a los recuadros un codigo que ya
  // no existe no devolveria nada.
  const deshacer = doc.querySelectorAll('[data-deshacer-baja]').length
  if (deshacer !== BAJAS.length - 1) {
    errores.push(`${donde} · «deshacer» sale en ${deshacer} renglones y deberia salir en los ${BAJAS.length - 1} pendientes`)
  }
  return 1
}

/**
 * El desglose por clase en los recuadros de inventario.
 *
 * «99 agotados» no dice si hay que correr: 99 de clase C es limpieza de
 * catalogo y 12 de clase A es la venta de la semana. El desglose es lo unico
 * que distingue las dos cosas, y si deja de pintarse el recuadro sigue
 * viendose entero y correcto.
 *
 * La clase sale del HISTORIAL, que este panel no bajaba. Si alguien quita esa
 * descarga, los recuadros vuelven a enseñar solo el total y nada falla.
 */
async function clasesEnRecuadros(window, donde) {
  const doc = window.document
  // La clase sale del HISTORIAL, que es una descarga mas y llega una vuelta
  // despues que el inventario. Sin esperar, se juzga antes de que exista.
  let con = []
  for (let i = 0; i < 10 && !con.length; i++) {
    await nuevaVuelta(window, 6)
    con = [...doc.querySelectorAll('[data-clases]')]
  }
  if (!con.length) {
    errores.push(`${donde} · los recuadros no desglosan por clase: un agotado de clase A se ve igual que uno de clase C`)
    return 0
  }
  const txt = con.map(e => (e.textContent || '').replace(/\s+/g, ' ')).join(' | ')
  for (const k of ['A ', 'B ', 'C ']) {
    if (!txt.includes(k)) errores.push(`${donde} · falta la clase «${k.trim()}» en el desglose`)
  }

  // Las pastillas para filtrar por clase. Sin ellas, un agotado de clase A se
  // sigue viendo revuelto con 400 de clase C y el desglose solo sirve para
  // mirar, no para trabajar.
  for (const k of ['A', 'B', 'C']) {
    if (!doc.querySelector(`[data-clase-filtro="${k}"]`)) {
      errores.push(`${donde} · no se puede filtrar por clase ${k}`)
    }
  }

  // Y el boton de dar de baja, que es lo que convierte la lista en una
  // decision. Solo para administrador; una tienda no decide que sale del
  // catalogo de la red.
  // Se pulsa «modelos» antes de mirar: el panel arranca en «Urgente (1-3)» y
  // en la vista consolidada las existencias se SUMAN entre plazas, asi que
  // con el dato de mentira ese tramo sale vacio. Con la tabla vacia no hay
  // renglones, y el boton vive en un renglon.
  const todos = doc.querySelector('[data-filtro="todos"]')
  if (todos) { clic(window, todos); await nuevaVuelta(window, 6) }

  const baja = doc.querySelector('[data-baja]')
  if (!baja) errores.push(`${donde} · no hay forma de dar de baja un codigo desde el inventario`)

  return con.length
}

/**
 * Que la explicacion del metodo nazca PLEGADA.
 *
 * Ocupaba seis parrafos fijos encima de la tabla y cinco explicaban como se
 * calcula, que no cambia de un dia para otro. El dueño lo pidio retractil.
 *
 * Lo que se comprueba, y es lo facil de perder: que siga PLEGADO. Un
 * `<details open>` se ve exactamente igual de util en una captura y deja el
 * muro donde estaba.
 *
 * Y que el aviso de un mes SIN DATO se quede FUERA del plegable: eso no es
 * metodo, es que la cuenta de hoy vale menos, y plegarlo seria esconderlo.
 */
function metodoPlegado(window, donde) {
  const doc = window.document
  const det = doc.querySelector('[data-metodo-compra]')
  if (!det) {
    errores.push(`${donde} · no esta el plegable del metodo de compra`)
    return 0
  }
  if (det.hasAttribute('open')) {
    errores.push(`${donde} · el metodo de compra nace ABIERTO: vuelve a ser un muro sobre la tabla`)
  }
  if (!det.querySelector('summary')) {
    errores.push(`${donde} · el plegable no tiene de donde tirar`)
  }
  // El aviso de meses sin dato, si lo hay, no puede estar dentro.
  const dentro = (det.textContent || '')
  if (/la referencia de esos meses sale incompleta/.test(dentro)) {
    errores.push(`${donde} · el aviso de meses sin dato quedo DENTRO del plegable: eso no es metodo, es una alerta`)
  }
  return 1
}

/**
 * Que la cantidad a pedir se pueda cambiar a mano.
 *
 * Lo pidio el dueño: «necesito que me permita dar doble clic y cambiar lo que
 * quiero comprar». Se comprueba el camino entero -doble clic, escribir,
 * Enter- y no solo que exista la celda, porque las tres piezas se rompen por
 * separado y las tres dejan la pantalla con el mismo aspecto.
 *
 * Y lo que de verdad importa: que el numero nuevo llegue al TOTAL. Si el
 * ajuste se quedara solo en la celda, la tabla diria una cosa, la cabecera
 * otra y el Excel bajaria la sugerencia; nadie lo notaria hasta tener el
 * pedido del proveedor delante.
 */
async function pedirEditable(window, donde) {
  const doc = window.document
  const celda = doc.querySelector('[data-pedir]')
  if (!celda) {
    errores.push(`${donde} · la cantidad a pedir no se puede cambiar: no hay celda editable`)
    return 0
  }

  const antes = (celda.textContent || '').trim()

  // Doble clic, que es como se abre. Un clic normal no debe abrirla: la tabla
  // se recorre a golpe de raton y se abriria una celda al mirar.
  celda.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await nuevaVuelta(window, 4)
  if (doc.querySelector('[data-pedir] input, input[title*="Enter"]')) {
    errores.push(`${donde} · un clic simple abre la celda: deberia hacer falta doble clic`)
  }

  celda.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }))
  await nuevaVuelta(window, 4)

  const campo = [...doc.querySelectorAll('input')].find(i => /Enter para guardar/.test(i.title || ''))
  if (!campo) {
    errores.push(`${donde} · el doble clic no abrio el campo para escribir`)
    return 0
  }

  // Se usa `escribir`, que ya existe en este archivo y lo hace BIEN: pasa por
  // el descriptor del prototipo en vez de asignar `el.value`. Mi primera
  // version asignaba directo y React no se enteraba, asi que el campo se veia
  // con el numero nuevo y el estado seguia con el viejo. Dos vueltas.
  escribir(window, campo, '7777')
  // Hay que ESPERAR antes del Enter. React procesa el cambio de texto en su
  // propio turno, y disparando la tecla en el mismo bloque sincrono el
  // manejador lee el texto viejo y guarda la cifra que ya estaba: el ajuste
  // se creaba con el mismo valor y la prueba decia «no quedo guardada».
  // En un navegador de verdad median milisegundos entre teclear y pulsar
  // Enter, asi que el fallo era solo de la comprobacion.
  await nuevaVuelta(window, 3)
  campo.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await nuevaVuelta(window, 6)

  const texto = (doc.body.textContent || '').replace(/\s+/g, ' ')
  if (!/7777/.test(texto)) {
    errores.push(`${donde} · se escribio una cantidad nueva y no quedo guardada`)
  }
  // El aviso tiene que salir: sin el, un ajuste de hace dos semanas sigue
  // puesto y nadie entiende por que el Excel no cuadra con la pantalla.
  if (!/cambiada a mano|cambiadas a mano/i.test(texto)) {
    errores.push(`${donde} · se cambio una cantidad y no se avisa de que hay ajustes a mano`)
  }
  if (!/Volver a lo sugerido/i.test(texto)) {
    errores.push(`${donde} · no hay forma de deshacer los ajustes`)
  }

  // Y se deja como estaba, que si no el resto del recorrido mide con 7777
  // piezas dentro.
  const celda2 = doc.querySelector('[data-pedir]')
  celda2?.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }))
  await nuevaVuelta(window, 4)
  const campo2 = [...doc.querySelectorAll('input')].find(i => /Enter para guardar/.test(i.title || ''))
  if (campo2) {
    escribir(window, campo2, '')
    await nuevaVuelta(window, 3)
    campo2.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nuevaVuelta(window, 6)
  }
  const ahora = (doc.querySelector('[data-pedir]')?.textContent || '').trim()
  if (ahora !== antes) {
    errores.push(`${donde} · vaciar la celda no devolvio la sugerencia («${antes}» → «${ahora}»)`)
  }
  return 1
}

/**
 * Que una SUCURSAL no vea lo de bodega.
 *
 * Es la unica comprobacion de este archivo que mira lo que NO esta, y por eso
 * es la mas facil de perder: nadie reclama una columna que no deberia ver.
 *
 * El dueño entro como Leon y se encontro la existencia de bodega en su tabla.
 * Y debajo habia mas: el boton «Bajar el reporte completo en Excel» le daba
 * el plan de compra al proveedor, los agotados con su dinero perdido y el
 * stock entero de bodega. El Excel no se puede mirar desde aqui -lo escribe
 * una libreria-, asi que lo que se fija en pantalla es la columna, y el libro
 * queda cubierto por `veBodega` y sus pruebas.
 */
function sucursalSinBodega(window, donde) {
  const doc = window.document
  // Solo tiene sentido dentro del surtido, que es donde vivia la columna.
  const enSurtido = [...doc.querySelectorAll('button')]
    .some(b => /reporte completo en excel/i.test(b.textContent || ''))
  if (!enSurtido) return 0

  // Ojo con la coincidencia exacta: una cabecera ordenable arrastra su flecha
  // pegada al texto -«En bodega▲»- asi que `^...$` no casa nunca y la
  // comprobacion pasaba en verde con la fuga puesta. Costo una vuelta.
  const cabeceras = [...doc.querySelectorAll('th')].map(t => (t.textContent || '').trim())
  if (cabeceras.some(t => /en bodega/i.test(t))) {
    errores.push(`${donde} · una sucursal esta viendo la columna «En bodega»`)
  }
  // Las vistas de bodega tampoco pueden estar como pestaña.
  const txt = (doc.body.textContent || '').replace(/\s+/g, ' ')
  for (const prohibido of ['Comprar al proveedor', 'Lo que puede surtir', 'Agotados que duelen']) {
    if (txt.includes(prohibido)) {
      errores.push(`${donde} · una sucursal ve «${prohibido}», que es de bodega`)
    }
  }
  return 1
}

/**
 * «Que se mueve», el panel de bodega que sustituyo a «Comprar».
 *
 * Son cuatro listas y las cuatro tienen que estar. Si una deja de pintarse,
 * las otras tres siguen y la pantalla parece entera: lo que desaparece es
 * justo la mitad de la decision. La que mas se echaria de menos sin notarlo
 * es «no hace falta mandar», porque nadie reclama una lista que no pidio.
 *
 * No se comprueban las cuentas -eso lo fija `movimiento.test.js`- sino que la
 * seccion se dibuje y siga teniendo sus cuatro bloques.
 */
function queSeMueve(window, donde) {
  const doc = window.document
  const sec = doc.querySelector('[data-movimiento]')
  if (!sec) return 0

  const txt = (sec.textContent || '').replace(/\s+/g, ' ')
  for (const bloque of [
    'Se están agotando',
    'Lo que más se mueve',
    'No hace falta mandar',
  ]) {
    if (!txt.includes(bloque)) {
      errores.push(`${donde} · «Que se mueve» perdio el bloque «${bloque}»`)
    }
  }
  // Bodega no compra: si vuelve a aparecer el proveedor aqui, alguien
  // deshizo la decision del dueño sin querer.
  if (/proveedor/i.test(txt)) {
    errores.push(`${donde} · «Que se mueve» habla del proveedor: bodega no compra`)
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
  // Contra QUE se compara no se comprueba por la prosa -la frase «precio de
  // mayoreo» sale en cuatro sitios de la seccion y cualquiera la daba por
  // buena-, sino porque CADA RENGLON enseñe los dos numeros: lo que se cobra
  // y el mayoreo contra el que se mide. Si alguien vuelve a compararlo contra
  // la lista al publico, ese par desaparece.
  //
  // Importa: comparando contra la lista, Aguascalientes marcaba 116 codigos
  // -casi todos- y la pantalla dejaba de decir nada.
  if (!/cobra \$[\d,]+ · mayoreo \$[\d,]+/.test(txt)) {
    errores.push(`${donde} · los renglones no enseñan «cobra X · mayoreo Y»: se perdio contra que se compara`)
  }
  if (!/m[aá]s barato que a un mayorista/i.test(txt)) {
    errores.push(`${donde} · la bandeja perdio su titulo: ya no dice que mide`)
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
/**
 * «Depurar»: las cuatro listas, los candados y el flujo de dar de baja.
 *
 * Lo que se cuida aquí es lo que, rompiéndose, NO se nota: un botón de «dar de
 * baja» que se enciende sin el inventario de una plaza se ve igual de bien que
 * uno apagado, y es justo lo que el dueño prohibió. Por eso se recorren los dos
 * estados reales —Torreón sin inventario, y Torreón publicado— y se mira que el
 * botón responda a cada uno.
 *
 * Las cuentas y el candado en sí los fijan `depuracion.test.js` y
 * `backend/test/bajas.test.js`; esto comprueba que la pantalla los respete y
 * diga POR QUÉ algo no se puede.
 */
async function depurar(window, donde) {
  const doc = window.document
  let cabeceras = 0
  let vistas = 0
  const dentro = id => doc.querySelector(`[data-vista-depurar="${id}"]`)
  const vuelta = async (n = 4) => { await nuevaVuelta(window, n) }
  const esperar = async cond => { for (let i = 0; i < 30 && !cond(); i++) await vuelta(3) }
  const ir = async id => {
    clic(window, doc.querySelector(`[data-depurar-vista="${id}"]`))
    await esperar(() => dentro(id))
  }
  const pildora = (id, texto) =>
    [...dentro(id).querySelectorAll('button')].find(b => (b.textContent || '').trim() === texto)
  const casilla = codigo => doc.querySelector(`[data-fila-depurar="${codigo}"] input[type="checkbox"]`)

  await esperar(() => doc.querySelector('[data-depurar]'))
  if (!doc.querySelector('[data-depurar]')) {
    errores.push(`${donde} · «Depurar» no se dibujo`)
    return { vistas, cabeceras }
  }
  for (const id of ['salida', 'rotacion', 'obsoletos', 'categorias']) {
    if (!doc.querySelector(`[data-depurar-vista="${id}"]`)) errores.push(`${donde} · falta la pestaña «${id}»`)
  }
  if (!doc.querySelector('[data-bajar-depuracion]')) errores.push(`${donde} · falta el botón del reporte de cuatro hojas`)

  // ── Torreón SIN inventario: lo real hoy. Nada se puede dar de baja. ──────
  const aviso = doc.querySelector('[data-bloqueo-inventario]')
  if (!aviso || !/Torre[oó]n/.test(aviso.textContent || '')) {
    errores.push(`${donde} · falta el aviso de que falta el inventario de Torreon: sin el, el stock global esta incompleto y nadie se entera`)
  }

  // 1. Modelos de salida
  await esperar(() => dentro('salida')?.querySelector('[data-fila-depurar]'))
  if (!dentro('salida')?.querySelector('[data-fila-depurar]')) {
    errores.push(`${donde} · «Modelos de salida» no listo nada: bodega descontinuo varios codigos`)
  } else {
    vistas++
    cabeceras += await todasLasCabeceras(window, `${donde} · salida`)
    if (!dentro('salida').querySelector('[data-fila-depurar="HX7CT"]')) {
      errores.push(`${donde} · HX7CT esta en las tiendas y bodega no lo tiene: tenia que salir como modelo de salida`)
    }
    // Los stickers no se almacenan: bodega los imprime. Con piezas en una
    // tienda saldrian como «descontinuados», que es mentira.
    if (dentro('salida').querySelector('[data-fila-depurar="MTST01"]')) {
      errores.push(`${donde} · un sticker sale como modelo de salida: bodega no los almacena, los imprime`)
    }

    // Marcar como descontinuado: se pinta al momento…
    const seccion = async texto => {
      const b = [...doc.querySelectorAll('.menu-seccion')].find(x => new RegExp(texto, 'i').test(x.textContent || ''))
      if (!b) { errores.push(`${donde} · no encuentro la seccion ${texto} en el menu`); return false }
      clic(window, b)
      await vuelta(8)
      return true
    }
    const enRevisar = async () => {
      if (!(await seccion('Revisar'))) return null
      await esperar(() => doc.querySelector('[data-incidencia]'))
      return [...doc.querySelectorAll('[data-incidencia]')].map(f => f.dataset.incidencia)
    }

    const c = casilla('HX7CT')
    if (!c) errores.push(`${donde} · HX7CT no se puede elegir`)
    else {
      // Antes de marcar, HX7CT TIENE que estar en la cola: se vende y bodega
      // no lo tiene de alta. Si no estuviera, la comprobación de abajo pasaría
      // sin demostrar nada.
      const antes = await enRevisar()
      if (antes && !antes.includes('cod|HX7CT')) {
        errores.push(`${donde} · HX7CT no sale en Revisar ANTES de marcarlo: la comprobacion de abajo no probaria nada`)
      }
      await seccion('Depurar')
      await esperar(() => casilla('HX7CT'))

      clic(window, casilla('HX7CT'))
      await vuelta()
      const marcar = doc.querySelector('[data-marcar-descontinuado]')
      if (!marcar || marcar.disabled) errores.push(`${donde} · elegir un modelo no enciende «marcar como descontinuado»`)
      else {
        clic(window, marcar)
        await vuelta(6)
        const fila = doc.querySelector('[data-fila-depurar="HX7CT"]')
        if (!/marcado/.test(fila?.textContent || '')) errores.push(`${donde} · marcar como descontinuado no se pinta`)

        // …y es lo único que promete: lo marcado deja de reclamarse en Revisar.
        const durante = await enRevisar()
        if (durante && durante.includes('cod|HX7CT')) {
          errores.push(`${donde} · HX7CT esta marcado como descontinuado y Revisar lo sigue reclamando como un error`)
        }
        if (durante && !durante.length) errores.push(`${donde} · Revisar quedo vacio al marcar un solo codigo`)

        // Y se quita, y VUELVE: sin esta mitad, que haya desaparecido podría
        // ser por cualquier otra cosa.
        await seccion('Depurar')
        await esperar(() => casilla('HX7CT'))
        clic(window, casilla('HX7CT'))
        await vuelta()
        const quitar = doc.querySelector('[data-quitar-marca]')
        if (!quitar) errores.push(`${donde} · un modelo marcado no ofrece quitar la marca`)
        else { clic(window, quitar); await vuelta(6) }
        if (/marcado/.test(doc.querySelector('[data-fila-depurar="HX7CT"]')?.textContent || '')) {
          errores.push(`${donde} · quitar la marca no la quita`)
        }
        const despues = await enRevisar()
        if (despues && !despues.includes('cod|HX7CT')) {
          errores.push(`${donde} · al quitar la marca HX7CT no vuelve a Revisar`)
        }
        await seccion('Depurar')
        await esperar(() => doc.querySelector('[data-vista-depurar="salida"]'))
      }
    }
  }

  // 2. Sin rotación
  await ir('rotacion')
  if (!dentro('rotacion')) errores.push(`${donde} · «Sin rotacion» no se dibujo`)
  else {
    vistas++
    if (!dentro('rotacion').querySelector('[data-fila-depurar]')) {
      errores.push(`${donde} · «Sin rotacion» no listo ningun codigo parado con piezas`)
    } else cabeceras += await todasLasCabeceras(window, `${donde} · rotacion`)
  }

  // 3. Obsoletos en ceros, SIN el inventario de Torreón: todo bloqueado.
  await ir('obsoletos')
  if (!dentro('obsoletos')) errores.push(`${donde} · «Obsoletos en ceros» no se dibujo`)
  else {
    vistas++
    const todos = pildora('obsoletos', 'Todos')
    if (todos) { clic(window, todos); await vuelta(5) }
    const lgq6 = dentro('obsoletos').querySelector('[data-fila-depurar="LGQ6T"]')
    if (!lgq6) errores.push(`${donde} · LGQ6T (sin piezas y sin ventas) no sale como obsoleto en ceros`)
    else {
      if (lgq6.dataset.puede !== 'no') errores.push(`${donde} · LGQ6T se puede dar de baja SIN el inventario de Torreon`)
      if (!/Torre[oó]n/.test(lgq6.textContent || '')) errores.push(`${donde} · la fila no dice por que no se puede: falta Torreon`)
    }
    const baja = doc.querySelector('[data-dar-baja]')
    if (!baja || !baja.disabled) errores.push(`${donde} · el boton de dar de baja esta ENCENDIDO sin el inventario de Torreon`)
    cabeceras += await todasLasCabeceras(window, `${donde} · obsoletos`)
  }

  // 4. Por marca o departamento
  await ir('categorias')
  if (!dentro('categorias')) errores.push(`${donde} · «Por marca» no se dibujo`)
  else {
    vistas++
    if (!dentro('categorias').querySelector('[data-categoria]')) errores.push(`${donde} · «Por marca» no listo ninguna categoria`)
    else {
      const lg = dentro('categorias').querySelector('[data-categoria="LG"]')
      if (!lg) errores.push(`${donde} · no sale la categoria LG, que se deduce del nombre`)
      else if (lg.dataset.entera !== 'no') errores.push(`${donde} · LG se puede dar de baja entera SIN el inventario de Torreon`)
      if (dentro('categorias').querySelector('[data-dar-baja-categoria]:not([disabled])')) {
        errores.push(`${donde} · hay un boton de dar de baja una categoria ENCENDIDO sin el inventario de Torreon`)
      }
      // Una categoría con piezas no se da de baja nunca: APPLE tiene.
      const apple = dentro('categorias').querySelector('[data-categoria="APPLE"]')
      if (apple && apple.dataset.entera !== 'no') errores.push(`${donde} · APPLE tiene piezas y sale como «entera»`)
      cabeceras += await todasLasCabeceras(window, `${donde} · categorias`)
    }
  }

  // ── Torreón CON inventario: ahora sí hay a dónde llegar. ─────────────────
  TORREON_PUBLICA = true
  try {
    // Se sale y se vuelve a entrar: el panel baja sus archivos al montarse.
    const botones = [...doc.querySelectorAll('.menu-seccion')]
    const otro = botones.find(b => /Dashboard/i.test(b.textContent || ''))
    const mio = botones.find(b => /Depurar/i.test(b.textContent || ''))
    if (!otro || !mio) { errores.push(`${donde} · no encuentro el menu para volver a montar Depurar`); return { vistas, cabeceras } }
    clic(window, otro); await vuelta(6)
    clic(window, mio)
    await esperar(() => doc.querySelector('[data-depurar]'))
    await vuelta(6)

    if (doc.querySelector('[data-bloqueo-inventario]')) {
      errores.push(`${donde} · sigue el aviso de que falta un inventario con las seis plazas publicadas`)
    }

    // Categoría LG entera: el botón se enciende, y confirmar pide confirmación.
    await ir('categorias')
    const btnCat = doc.querySelector('[data-dar-baja-categoria="LG"]')
    if (!btnCat) errores.push(`${donde} · LG (sin piezas, sin ventas, de hace años) no se puede dar de baja entera con todo publicado`)
    else if (btnCat.disabled) errores.push(`${donde} · el boton de dar de baja LG esta apagado con todo publicado`)
    else {
      clic(window, btnCat); await vuelta()
      const conf = doc.querySelector('[data-confirmar-baja]')
      if (!conf) errores.push(`${donde} · dar de baja una categoria no pide confirmacion`)
      else {
        if (!/no borra nada de Eleventa/.test(conf.textContent || '')) {
          errores.push(`${donde} · la confirmacion no dice que la pagina NO borra nada de Eleventa`)
        }
        const cancelar = [...conf.querySelectorAll('button')].find(b => /Cancelar/.test(b.textContent || ''))
        if (cancelar) { clic(window, cancelar); await vuelta() }
        if (doc.querySelector('[data-confirmar-baja]')) errores.push(`${donde} · «Cancelar» no cierra la confirmacion`)
      }
    }

    // Obsoletos: LGQ6T se puede, se elige, se confirma y queda pedido.
    await ir('obsoletos')
    const fila = dentro('obsoletos')?.querySelector('[data-fila-depurar="LGQ6T"]')
    if (!fila) errores.push(`${donde} · LGQ6T no sale entre los que se pueden dar de baja`)
    else if (fila.dataset.puede !== 'si') errores.push(`${donde} · LGQ6T no se puede dar de baja con todo publicado: ${(fila.textContent || '').slice(0, 160)}`)
    else {
      clic(window, casilla('LGQ6T')); await vuelta()
      const baja = doc.querySelector('[data-dar-baja]')
      if (!baja || baja.disabled) errores.push(`${donde} · elegir LGQ6T no enciende el boton de dar de baja`)
      else {
        clic(window, baja); await vuelta()
        const si = doc.querySelector('[data-confirmar-si]')
        if (!si) errores.push(`${donde} · dar de baja no pide confirmacion`)
        else {
          clic(window, si)
          await esperar(() => doc.querySelector('[data-resultado-baja]'))
          const res = doc.querySelector('[data-resultado-baja]')
          if (!res || !/Se apuntaron 1 baja/.test(res.textContent || '')) {
            errores.push(`${donde} · dar de baja no enseña lo que se apunto: ${(res?.textContent || '(nada)').slice(0, 140)}`)
          } else if (!/Excel de bajas por tienda/.test(res.textContent || '')) {
            errores.push(`${donde} · tras dar de baja no se ofrece el Excel de lo que cada tienda debe borrar`)
          }
          // Queda como «ya pedida»: no se vuelve a ofrecer como si nada.
          const pedidas = pildora('obsoletos', 'Ya pedidas')
          if (pedidas) { clic(window, pedidas); await vuelta(5) }
          if (!/Baja pedida/.test(dentro('obsoletos')?.querySelector('[data-fila-depurar="LGQ6T"]')?.textContent || '')) {
            errores.push(`${donde} · lo dado de baja no queda como «baja pedida»: se podria pedir otra vez`)
          }
        }
      }
    }
  } finally {
    TORREON_PUBLICA = false
  }
  return { vistas, cabeceras }
}

/**
 * «Consultar modelo», el panel de bodega para mirar un modelo de cerca.
 *
 * Lo que se comprueba es lo que contesta la pregunta del dueño —¿vendió poco
 * porque no había?—: la lista de los más vendidos, que abrir uno dibuje su
 * ficha, y que la ficha diga plaza por plaza si su venta es de fiar, con los
 * tres casos (censurada, de fiar, sin medir). Si la lectura dejara de
 * dibujarse, la ficha seguiría ahí y parecería entera.
 */
async function consultaModelo(window, donde) {
  const doc = window.document
  const sec = doc.querySelector('[data-consulta-modelo]')
  if (!sec) { errores.push(`${donde} · «Consultar modelo» no se dibujó`); return 0 }

  const abrir = sec.querySelector('[data-mas-vendidos] [data-abrir-modelo]')
  if (!abrir) { errores.push(`${donde} · «Consultar modelo» no enseña los más vendidos`); return 0 }
  clic(window, abrir)
  await nuevaVuelta(window, 4)
  if (!enPie(window, `${donde} · abriendo un modelo`)) return 0

  const ficha = doc.querySelector('[data-consulta-modelo] [data-ficha-codigo]')
  if (!ficha) { errores.push(`${donde} · abrir un más vendido no dibujó su ficha`); return 0 }
  if (!doc.querySelector('[data-en-bodega]')) {
    errores.push(`${donde} · la ficha no dice cuánto hay en bodega, que es de donde se surte`)
  }
  const fiar = ficha.querySelector('[data-venta-de-fiar]')
  if (!fiar) {
    errores.push(`${donde} · la ficha no dice si su venta es de fiar: vuelve a no distinguir poca demanda de mostrador vacío`)
  } else {
    const txt = fiar.textContent || ''
    if (!fiar.querySelector('[data-censurada="si"]')) errores.push(`${donde} · ninguna plaza sale censurada, y León estuvo en cero la mitad del tiempo`)
    if (!fiar.querySelector('[data-censurada="no"]')) errores.push(`${donde} · ninguna plaza sale de fiar, y Aguascalientes nunca estuvo en cero`)
    if (!/sin medir/.test(txt)) errores.push(`${donde} · San Luis no tiene archivo y no lo dice`)
  }

  const volver = [...sec.querySelectorAll('button')].find(b => /volver/i.test(b.textContent))
  if (volver) { clic(window, volver); await nuevaVuelta(window, 3) }
  if (!doc.querySelector('[data-mas-vendidos]')) errores.push(`${donde} · «Volver» no regresa a los más vendidos`)
  return 1
}

/**
 * La marca ⚠ de venta censurada en «Pedir por venta».
 *
 * 🔒 Se marca y no se corrige, así que lo único que hay que ver es que la
 * marca salga. Sin ella el X8D vuelve a ser un número que no se sabe si creer.
 */
function marcaDeCensura(window, donde) {
  const doc = window.document
  if (!doc.querySelector('[data-pedir]')) return 0
  return doc.querySelector('[data-censurada]') ? 1 : 0
}

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

  // «Investigar un modelo» del administrador: ventas, existencia y rotación,
  // en las cuatro tiendas y en bodega. Es lo que pidió el dueño el
  // 2026-11-09 y la misma ficha que ve bodega, así que si se cae aquí se cae
  // en las dos.
  const rot = ficha.querySelector('[data-rotacion]')
  if (!rot) {
    errores.push(`${donde} · la ficha no trae la rotacion: ventas contra existencia`)
  } else {
    for (const slug of ['leon', 'san-luis', 'aguascalientes', 'torreon', 'red', 'bodega']) {
      if (!rot.querySelector(`[data-rotacion-de="${slug}"]`)) {
        errores.push(`${donde} · la rotacion no trae el renglon de ${slug}`)
      }
    }
    // Torreón no tiene nada publicado: tiene que decirlo, no enseñar ceros
    // que se leerían como «vendió cero y no tiene nada».
    const t = rot.querySelector('[data-rotacion-de="torreon"]')
    if (t && !/sin dato/.test(t.textContent || '')) {
      errores.push(`${donde} · Torreon no tiene datos y la ficha no lo dice: enseña ceros inventados`)
    }
    if (!(rot.textContent || '').includes('no es una promesa') && !(rot.textContent || '').includes('no una promesa')) {
      errores.push(`${donde} · la rotacion no avisa de que «alcanza» es una cuenta y no una promesa`)
    }
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

    // ── El detalle de un renglon ──────────────────────────────────────
    //
    // El dueño podia ver que salieron $750 y no en que: «solo veo la salida,
    // no puedo ver el concepto que pusieron». Si el desplegable se cae, la
    // tabla se sigue viendo perfecta -con sus cifras- y la pregunta vuelve a
    // no tener respuesta, sin que nada falle.
    const desplegables = [...doc.querySelectorAll('[data-ver-detalle]')]
    if (desplegables.length < 6) {
      errores.push(`${donde} · solo ${desplegables.length} renglones se pueden desplegar: se esperan al menos 6 (devoluciones y las cinco salidas)`)
    }
    const verGastos = doc.querySelector('[data-ver-detalle="gastos"]')
    if (!verGastos) {
      errores.push(`${donde} · la linea de gastos no se puede desplegar`)
    } else {
      clic(window, verGastos)
      await nuevaVuelta(window, 5)
      if (!enPie(window, `${donde} · detalle de una linea`)) return tarjetas.length
      const det = doc.querySelector('[data-detalle="gastos"], [data-detalle-vacio="gastos"]')
      if (!det) {
        errores.push(`${donde} · desplegar la linea no enseño nada`)
      } else if (!/papeleria sin ticket/.test(det.textContent || '')) {
        errores.push(`${donde} · el detalle no trae el CONCEPTO, que es para lo unico que se abre`)
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

// ── El corte semanal ────────────────────────────────────────────────────────

const { bloquesDeCorte, PLAZAS_CORTE } = await import('../src/lib/corte.js')
const hoyDeCorte = () => isoDia(new Date())
const bloquesEsperados = slug => {
  const plaza = PLAZAS_CORTE.find(p => p.slug === slug)
  const d = datosDeCorteMock(slug, true)
  return bloquesDeCorte({
    plaza, fecha: hoyDeCorte(), caja: d.caja, ventas: d.ventas, params: d.parametros, conteos: d.conteos,
  })
}

/** Escribe un conteo de monedas de $1 y devuelve lo que dice el semáforo en vivo. */
async function contarEnUnPeso(window, bloque, cantidad) {
  const campo = bloque.querySelector('[data-denominacion="1"]')
  escribir(window, campo, String(cantidad))
  await nuevaVuelta(window, 3)
  return bloque.querySelector('[data-diferencia-en-vivo]')?.getAttribute('data-diferencia-en-vivo') ?? null
}

/**
 * El corte de UNA TIENDA: sus ventas, su conteo, sin tolerancia y sin ver nada
 * de otra plaza ni de quien cobró.
 */
async function corteDeLaTienda(window, donde) {
  const doc = window.document
  const raiz = doc.querySelector('[data-corte]')
  if (!raiz) { errores.push(`${donde} · el corte no se dibujo`); return 0 }
  if (doc.querySelector('[data-corte-plaza]')) errores.push(`${donde} · una tienda ve el selector de plazas`)

  const esperados = bloquesEsperados('leon')
  const bloques = [...doc.querySelectorAll('[data-bloque-corte]')]
  if (bloques.length !== esperados.bloques.length) {
    errores.push(`${donde} · dibujo ${bloques.length} semanas y deberian ser ${esperados.bloques.length}`)
  }
  const b0 = bloques[0]
  if (!b0) { errores.push(`${donde} · no hay semana en curso`); return 0 }
  if (b0.querySelectorAll('[data-dia-corte]').length !== 7) errores.push(`${donde} · la tabla de ventas no trae siete dias`)
  const cab = b0.querySelector('[data-tabla-ventas] thead')?.textContent ?? ''
  for (const t of ['Fundas', 'Hidrogel', 'Stickers', 'Piezas']) {
    if (!cab.includes(t)) errores.push(`${donde} · la tabla de ventas no tiene la columna «${t}»`)
  }

  // Lo que sale del punto de venta: gastos y sueldos, cada uno en su lista.
  const gastos = b0.querySelector('[data-lista-corte="Gastos de la semana"]')?.textContent ?? ''
  if (!/garrafon de agua/.test(gastos)) errores.push(`${donde} · el gasto del punto de venta no sale en la lista de gastos`)
  if (/FALTANTE EN CAJA/i.test(raiz.textContent)) errores.push(`${donde} · un faltante registrado salio en la pantalla de la tienda`)

  // Privacidad: nada de quien cobro ni de otras plazas.
  const texto = raiz.textContent
  for (const prohibido of ['daniela', 'jenni', 'CARLA PEREZ', 'DIEGO MORA', 'FELIPE SOTO']) {
    if (new RegExp(prohibido, 'i').test(texto)) errores.push(`${donde} · la pantalla de la tienda enseña «${prohibido}»`)
  }

  // Las reglas de mayoreo y los cobros electrónicos de la semana.
  if (b0.querySelector('[data-reglas-mayoreo]')?.getAttribute('data-reglas-mayoreo') !== '1') {
    errores.push(`${donde} · el ticket que rompe las reglas de mayoreo no salió en la semana`)
  }
  if (!b0.querySelector('[data-cobros="2"] [data-sin-referencia="1"]')) {
    errores.push(`${donde} · los cobros con tarjeta no dicen cuál viene sin referencia`)
  }
  if (doc.querySelector('[data-fondo-caja]')) errores.push(`${donde} · una tienda puede asignar su propio fondo de caja`)

  // Sin conteo no hay semaforo de color: gris.
  if (b0.getAttribute('data-estado-corte') !== 'sin-conteo') {
    errores.push(`${donde} · sin conteo la semana debia salir «sin-conteo» y salio «${b0.getAttribute('data-estado-corte')}»`)
  }

  // SIN TOLERANCIA: el peso exacto cuadra y un peso de diferencia ya no.
  const esperado = esperados.bloques[0].esperadoEnCaja
  if (esperado === null || esperado < 2) { errores.push(`${donde} · no hay esperado con que comparar`); return 0 }
  const casos = [[esperado, 'cuadra', 'verde'], [esperado + 1, 'sobrante', 'azul'], [esperado - 1, 'faltante', 'rojo']]
  for (const [cantidad, estado, color] of casos) {
    const vivo = await contarEnUnPeso(window, doc.querySelector('[data-bloque-corte]'), cantidad)
    if (vivo !== estado) errores.push(`${donde} · contando $${cantidad} (esperado $${esperado}) el semaforo en vivo dijo «${vivo}» y debia decir «${estado}»: hay una tolerancia escondida`)
    // Y al guardarlo, el bloque cambia de estado y de color.
    const antes = POSTS_DE_CORTE.length
    clic(window, doc.querySelector('[data-bloque-corte] [data-guardar-conteo]'))
    await nuevaVuelta(window, 6)
    if (POSTS_DE_CORTE.length !== antes + 1) { errores.push(`${donde} · guardar «${estado}» no mando el conteo al servidor`); continue }
    const enviado = POSTS_DE_CORTE.at(-1)
    if (enviado.plaza !== 'leon' || enviado.semana !== esperados.bloques[0].clave) {
      errores.push(`${donde} · el conteo se mando con plaza/semana equivocadas: ${enviado.plaza} ${enviado.semana}`)
    }
    const b = doc.querySelector('[data-bloque-corte]')
    if (b.getAttribute('data-estado-corte') !== estado) errores.push(`${donde} · guardado «${estado}», el bloque dice «${b.getAttribute('data-estado-corte')}»`)
    if (!b.querySelector(`[data-semaforo="${color}"]`)) errores.push(`${donde} · el color de «${estado}» no es ${color}`)
    if (!b.querySelector('[data-conteo-guardado]')) errores.push(`${donde} · tras guardar no dice quien ni cuando`)
  }

  // Mayoristas: solo los de su plaza, mas y menos activo, y los 4 rangos.
  const m = doc.querySelector('[data-mayoristas="leon"]')
  if (!m) { errores.push(`${donde} · no salio el ranking de mayoristas`); return 1 }
  if (doc.querySelectorAll('[data-mayoristas]').length !== 1) errores.push(`${donde} · una tienda ve mas de un ranking`)
  if (!/ANA LOPEZ/.test(m.querySelector('[data-mas-activo]')?.textContent ?? '')) errores.push(`${donde} · el mas activo no es ANA LOPEZ`)
  if (!/BETO RUIZ/.test(m.querySelector('[data-menos-activo]')?.textContent ?? '')) errores.push(`${donde} · el menos activo no es BETO RUIZ`)
  const rangos = [...m.querySelectorAll('[data-rango-mayoristas]')].map(x => x.getAttribute('data-rango-mayoristas'))
  if (rangos.join() !== '7,14,21,30') errores.push(`${donde} · los rangos son ${rangos.join()} y deben ser 7 a 30`)
  clic(window, m.querySelector('[data-rango-mayoristas="30"]'))
  await nuevaVuelta(window, 3)
  if (!doc.querySelector('[data-mayoristas="leon"] [data-sin-compras]')) errores.push(`${donde} · no dice que mayoristas no compraron`)

  // Semana anterior y de vuelta.
  const ant = doc.querySelector('[data-semana-anterior]')
  if (ant && !ant.disabled) {
    clic(window, ant)
    await nuevaVuelta(window, 4)
    if (!enPie(window, `${donde} · semana anterior`)) return 1
    if (!doc.querySelector('[data-bloque-corte]')) errores.push(`${donde} · la semana anterior se quedo sin bloques`)
    clic(window, doc.querySelector('[data-semana-siguiente]'))
    await nuevaVuelta(window, 4)
  }
  return 1
}

/** El corte del ADMINISTRADOR: todas las plazas, el ciclo de Torreon y lo que ve cada una. */
async function corteDelAdmin(window, donde) {
  const doc = window.document
  if (!doc.querySelector('[data-corte]')) { errores.push(`${donde} · el corte no se dibujo`); return 0 }
  if (!doc.querySelector('[data-resumen-global]')) errores.push(`${donde} · sin resumen de todas las plazas`)
  if (doc.querySelectorAll('[data-plaza-resumen]').length !== 4) errores.push(`${donde} · el resumen no trae las cuatro plazas`)
  if (doc.querySelectorAll('[data-mayoristas]').length !== 4) errores.push(`${donde} · el administrador no ve el ranking de las cuatro plazas`)
  if (doc.querySelector('[data-guardar-conteo]')) errores.push(`${donde} · en «Todas» se puede escribir un conteo, y no sabria de que plaza`)
  if (!doc.querySelector('[data-piezas-globales]')) errores.push(`${donde} · faltan las piezas globales por tipo`)
  // La tienda dejo un faltante guardado: el administrador tiene que verlo.
  if (!doc.querySelector('[data-alertas-corte]')) errores.push(`${donde} · hay un faltante guardado por la tienda y la vista global no avisa`)

  if (!doc.querySelector('[data-alertas-mayoreo]')) errores.push(`${donde} · la vista global no avisa de los tickets que rompen las reglas de mayoreo`)

  // Torreon: cuatro semanas y un bloque global.
  clic(window, doc.querySelector('[data-corte-plaza="torreon"]'))
  await nuevaVuelta(window, 6)
  if (!enPie(window, `${donde} · Torreon`)) return 1
  if (doc.querySelectorAll('[data-bloque-corte]').length !== 4) errores.push(`${donde} · Torreon no dibujo sus cuatro semanas`)
  if (!doc.querySelector('[data-bloque-global]')) errores.push(`${donde} · Torreon no tiene bloque global del ciclo`)
  if (!/nomina/i.test(doc.querySelector('[data-lista-corte="Sueldo"]')?.textContent ?? '')) {
    errores.push(`${donde} · el sueldo registrado como salida no salio en la lista de sueldos`)
  }
  if (doc.querySelectorAll('[data-mayoristas]').length !== 1) errores.push(`${donde} · Torreon enseña mas de un ranking`)
  if (!/Felipe/.test(doc.querySelector('[data-lista-corte="Comisiones"]')?.textContent ?? '')) {
    errores.push(`${donde} · la comision registrada como salida no salio en la lista de comisiones`)
  }
  if (!doc.querySelector('[data-lista-corte="Sueldo"] [data-sin-nombre]')) {
    errores.push(`${donde} · un sueldo sin el nombre del trabajador no se señala`)
  }
  // El administrador ve quien cobro el ticket que rompe la regla; la tienda no.
  if (!/daniela coronilla/.test(doc.querySelector('[data-incidencia-mayoreo]')?.textContent ?? '')) {
    errores.push(`${donde} · el administrador no ve quien cobro el ticket que rompe la regla de mayoreo`)
  }

  // Una plaza concreta: el administrador SI puede contar por ella.
  clic(window, doc.querySelector('[data-corte-plaza="leon"]'))
  await nuevaVuelta(window, 6)
  if (!doc.querySelector('[data-guardar-conteo]')) errores.push(`${donde} · el administrador no puede guardar el conteo de una plaza`)

  // El fondo de caja lo asigna el administrador, plaza por plaza.
  const fondo = doc.querySelector('[data-fondo-caja="leon"] input')
  if (!fondo) { errores.push(`${donde} · el administrador no puede asignar el fondo de caja`); return 1 }
  escribir(window, fondo, '1500')
  await nuevaVuelta(window, 3)
  const antes = POSTS_DE_FONDO.length
  clic(window, doc.querySelector('[data-fondo-caja="leon"] [data-guardar-fondo]'))
  await nuevaVuelta(window, 6)
  const enviado = POSTS_DE_FONDO.at(-1)
  if (POSTS_DE_FONDO.length !== antes + 1 || enviado?.sucursal !== 'leon' || enviado?.fondoFijo !== 1500) {
    errores.push(`${donde} · guardar el fondo no mandó 1500 para León: ${JSON.stringify(enviado)}`)
  }
  if (!doc.querySelector('[data-fondo-caja="leon"] [data-fondo-guardado]')) errores.push(`${donde} · tras guardar el fondo no dice que se guardó`)
  return 1
}

// ── La nómina ───────────────────────────────────────────────────────────────

/** «Mi pago» de la tienda: sólo su gente, el bono, la comisión y nada de RH. */
async function miPagoDeLaTienda(window, donde) {
  const doc = window.document
  const raiz = doc.querySelector('[data-mi-pago]')
  if (!raiz) { errores.push(`${donde} · «Mi pago» no se dibujó`); return 0 }
  const recibos = [...doc.querySelectorAll('[data-recibo]')].map(x => x.getAttribute('data-recibo'))
  if (recibos.sort().join() !== 'daniela,jenni') errores.push(`${donde} · la tienda de León ve los recibos ${recibos.join()} y debía ver el de Daniela y el de Jenni, cada una el suyo`)
  const texto = raiz.textContent
  for (const prohibido of ['Brenda', 'Andrea', 'Cesareo', 'Ximena', 'Ingreso', 'Antigüedad', 'vacaciones']) {
    if (texto.includes(prohibido)) errores.push(`${donde} · «Mi pago» enseña «${prohibido}»`)
  }
  if (!/\$25\.90/.test(texto)) errores.push(`${donde} · la comisión del ejemplo del dueño no sale en $25.90`)
  // La puntualidad es de las dos: el retardo de Daniela le cuesta el bono también a Jenni.
  if (doc.querySelectorAll('[data-bono="perdido"]').length !== 2) errores.push(`${donde} · el lunes a las 11:15 (35 min fuera de tolerancia) debía perder el bono de Daniela Y de Jenni`)
  if (!doc.querySelector('[data-imprimir-recibo]')) errores.push(`${donde} · no hay botón de imprimir para firma`)
  if (doc.querySelector('[data-marcar-pagado], [data-justificar], [data-autorizar-lote]')) errores.push(`${donde} · la tienda tiene botones del administrador`)
  return 1
}

/** «Nómina y RH» del administrador: las seis vistas, autorizar y dar de alta. */
async function nominaDelAdmin(window, donde) {
  const doc = window.document
  const ir = async v => { clic(window, doc.querySelector(`[data-vista-nomina="${v}"]`)); await nuevaVuelta(window, 6) }
  const pestana = doc.querySelector('[data-vista-personal="nomina"]')
  if (!pestana) { errores.push(`${donde} · Personal no tiene la pestaña «Nómina y RH»`); return 0 }
  clic(window, pestana)
  await nuevaVuelta(window, 8)
  if (!doc.querySelector('[data-nomina]')) { errores.push(`${donde} · «Nómina y RH» no se dibujó`); return 0 }
  const plazas = [...doc.querySelectorAll('[data-resumen-plaza]')].map(x => x.getAttribute('data-resumen-plaza'))
  if (plazas.join() !== 'leon,san-luis,aguascalientes,torreon') errores.push(`${donde} · el resumen trae ${plazas.join()}`)
  if (doc.body.textContent.includes('Ferias')) errores.push(`${donde} · Ferias no lleva nómina y aparece`)

  // Puntualidad: el retardo del lunes se puede justificar.
  await ir('puntualidad')
  const just = doc.querySelector('[data-justificar]')
  if (!just) errores.push(`${donde} · el retardo del lunes no se puede justificar`)
  else {
    clic(window, just); await nuevaVuelta(window, 3)
    escribir(window, doc.querySelector('[aria-label="Motivo de la justificación"]'), 'Tráfico')
    await nuevaVuelta(window, 2)
    const antes = NOMINA.posts.length
    clic(window, doc.querySelector('[data-guardar-justificacion]')); await nuevaVuelta(window, 6)
    if (NOMINA.posts.at(-1)?.accion !== 'justificar' || NOMINA.posts.length !== antes + 1) errores.push(`${donde} · justificar no mandó la acción`)
    await ir('resumen')
    clic(window, doc.querySelector('[data-fila-nomina="daniela"] button')); await nuevaVuelta(window, 4)
    if (!doc.querySelector('[data-recibo="daniela"] [data-bono="vigente"]')) errores.push(`${donde} · justificado el retardo, el bono no volvió`)
    clic(window, doc.querySelector('[data-fila-nomina="jenni"] button')); await nuevaVuelta(window, 4)
    if (!doc.querySelector('[data-recibo="jenni"] [data-bono="vigente"]')) errores.push(`${donde} · justificado el retardo de Daniela, el bono de Jenni no volvió`)
  }

  // Comisiones: autorizar manda el monto congelado.
  await ir('comisiones')
  const c = doc.querySelector('[data-comision="leon|9001"] input[type="checkbox"]')
  if (!c) errores.push(`${donde} · la comisión del ticket 9001 no está en la bandeja`)
  else {
    clic(window, c); await nuevaVuelta(window, 2)
    clic(window, doc.querySelector('[data-autorizar-lote]')); await nuevaVuelta(window, 6)
    const a = NOMINA.posts.at(-1)
    if (a?.accion !== 'comision' || a.estado !== 'autorizada' || a.items?.[0]?.monto !== 25.9) errores.push(`${donde} · autorizar no mandó $25.90: ${JSON.stringify(a)}`)
  }

  await ir('vacaciones')
  if (doc.querySelectorAll('[data-saldo-vacaciones]').length !== 8) errores.push(`${donde} · vacaciones no lista a las 8 personas`)
  if (!/captúrala en Parámetros/.test(doc.querySelector('[data-vacaciones]')?.textContent ?? '')) errores.push(`${donde} · la fecha de ingreso vacía no se pide`)

  // Parámetros: dar de alta a alguien y guardar.
  await ir('parametros')
  clic(window, doc.querySelector('[data-agregar-empleado]')); await nuevaVuelta(window, 3)
  const nuevos = [...doc.querySelectorAll('[aria-label="Nombre del registro"]')]
  escribir(window, nuevos.at(-1), 'Persona Nueva'); await nuevaVuelta(window, 2)
  clic(window, doc.querySelector('[data-guardar-parametros]')); await nuevaVuelta(window, 6)
  const cfg = NOMINA.configs.at(-1)?.config
  if (!cfg?.empleados?.some(e => e.id === 'persona-nueva' && e.nombre === 'Persona Nueva')) errores.push(`${donde} · el alta no se guardó con su identificador`)
  if (!doc.querySelector('[data-parametros-guardados]')) errores.push(`${donde} · guardar parámetros no dice que se guardó`)

  await ir('bitacora')
  if (!doc.querySelector('[data-bitacora]')) errores.push(`${donde} · la bitácora no se dibujó`)
  return 1
}

// ── El recorrido ───────────────────────────────────────────────────────────

/**
 * El CRM: la bandeja se dibuja, una tienda sólo ve su plaza, la ficha abre
 * con la conversación, y contestar la toma y DICE que todavía no sale por
 * WhatsApp —un mensaje que parece enviado y no lo está es peor que ninguno—.
 */
async function clientesDelPanel(window, donde, esAdmin) {
  const doc = window.document
  await nuevaVuelta(window, 8)
  if (!doc.querySelector('[data-clientes]')) { errores.push(`${donde} · la bandeja de clientes no se dibujo`); return 0 }
  const ids = [...doc.querySelectorAll('[data-cliente]')].map(b => b.getAttribute('data-cliente'))
  const esperados = esAdmin ? 4 : 3
  if (ids.length !== esperados) errores.push(`${donde} · la bandeja trae ${ids.length} clientes y deberian ser ${esperados}`)
  if (!esAdmin && /AJENO/.test(doc.body.textContent)) errores.push(`${donde} · una tienda ve un cliente de otra plaza`)
  if (esAdmin && !doc.querySelector('[data-filtro-plaza]')) errores.push(`${donde} · el administrador no tiene filtro de plaza`)
  if (!esAdmin && doc.querySelector('[data-filtro-plaza]')) errores.push(`${donde} · una tienda tiene filtro de plaza`)

  const id = 'wa:524771234567'
  const boton = doc.querySelector(`[data-cliente="${id}"]`)
  if (!boton) { errores.push(`${donde} · no esta el cliente de León que paso el bot (${ids.join(', ')})`); return 0 }
  // El que se quedó sin respuesta va ANTES que el pendiente, y se dice en tres
  // sitios: el aviso de arriba, su renglón y su ficha. El silencio no puede
  // parecerse a una conversación más «con el bot».
  const SR = 'wa:524775550000'
  const hayMarca = !!doc.querySelector(`[data-cliente="${SR}"] [data-sin-respuesta]`)
  const marcado = !!CRM_CLIENTES.get(SR)?.sinRespuesta   // la tienda le contesta más abajo, y el administrador entra después
  if (marcado && ids[0] !== SR) errores.push(`${donde} · el cliente sin respuesta no va primero en la bandeja (${ids[0]})`)
  if (!hayMarca && CRM_CLIENTES.get(SR)?.sinRespuesta) errores.push(`${donde} · el renglon del cliente sin respuesta no lo dice`)
  if (CRM_CLIENTES.get(SR)?.sinRespuesta && !/1 cliente al que nadie/.test(doc.querySelector('[data-aviso-sin-respuesta]')?.textContent ?? '')) {
    errores.push(`${donde} · la bandeja no avisa de que hay un cliente sin respuesta`)
  }
  if (doc.querySelectorAll('[data-sin-respuesta]').length > 1) errores.push(`${donde} · hay clientes marcados sin respuesta que no lo estan`)
  if (!esAdmin && marcado && ids[1] !== id) errores.push(`${donde} · el pendiente no va justo despues del que no tiene respuesta`)
  clic(window, boton)
  await nuevaVuelta(window, 8)
  const ficha = doc.querySelector(`[data-ficha="${id}"]`)
  if (!ficha) { errores.push(`${donde} · la ficha no se abrio`); return 0 }
  if (!ficha.querySelector('[data-mensaje="cliente"]')) errores.push(`${donde} · la ficha no trae lo que escribio el cliente`)
  if (!/Fundas iPhone 17/.test(ficha.querySelector('[data-origen]')?.textContent ?? '')) errores.push(`${donde} · la ficha no dice de que anuncio llego`)
  if (esAdmin) return 1

  const caja = ficha.querySelector('[data-respuesta]')
  const mandar = ficha.querySelector('[data-mandar]')
  if (!caja || !mandar) { errores.push(`${donde} · la ficha no tiene donde contestar`); return 0 }
  if (!mandar.disabled) errores.push(`${donde} · «Mandar» esta habilitado sin texto`)
  escribir(window, caja, 'Sí la tenemos, te la aparto.')
  await nuevaVuelta(window, 4)
  clic(window, doc.querySelector('[data-mandar]'))
  await nuevaVuelta(window, 10)
  const c = CRM_CLIENTES.get(id)
  if (c?.estado !== 'atendiendo') errores.push(`${donde} · contestar no tomo la conversacion (estado ${c?.estado})`)
  if (!c?.mensajes?.some(m => m.de === 'tienda')) errores.push(`${donde} · la respuesta no quedo en la conversacion`)
  if (!doc.querySelector('[data-aviso-envio]')) errores.push(`${donde} · no dice que la respuesta todavia no sale por WhatsApp`)
  if (!doc.querySelector(`[data-ficha="${id}"] [data-mensaje="tienda"]`)) errores.push(`${donde} · la respuesta no se pinta en la conversacion`)

  // Y al que nadie le contestó: su ficha lo dice, y contestarle QUITA el aviso
  // —de la ficha, del renglón y de arriba—. Sin esa mitad, un aviso que no se
  // apaga nunca deja de leerse.
  clic(window, doc.querySelector(`[data-cliente="${SR}"]`))
  await nuevaVuelta(window, 8)
  if (!doc.querySelector(`[data-ficha="${SR}"] [data-ficha-sin-respuesta]`)) errores.push(`${donde} · la ficha del cliente sin respuesta no lo dice`)
  escribir(window, doc.querySelector(`[data-ficha="${SR}"] [data-respuesta]`), 'Sí hay, disculpa la espera.')
  await nuevaVuelta(window, 4)
  clic(window, doc.querySelector(`[data-ficha="${SR}"] [data-mandar]`))
  await nuevaVuelta(window, 10)
  if (CRM_CLIENTES.get(SR)?.sinRespuesta) errores.push(`${donde} · contestarle no quito la marca de sin respuesta`)
  if (doc.querySelector('[data-sin-respuesta], [data-ficha-sin-respuesta], [data-aviso-sin-respuesta]')) {
    errores.push(`${donde} · el aviso de sin respuesta sigue en pantalla despues de contestarle`)
  }
  return 1
}

const SESIONES = [
  ['sin sesión', null],
  ['sucursal',   { isAdmin: false, branch: 'leon', token: 'x' }],
  // Bodega entra con la suya y ve OTRO panel: surtir y comprar, no «lo que te
  // toca recibir». Sin recorrerla, ese panel no lo mira nadie hasta que lo
  // abra el encargado, y lo que se rompa ahi se descubre en el mostrador.
  ['bodega',     { isAdmin: false, branch: 'bodega', token: 'x' }],
  ['admin',      { isAdmin: true,  branch: null,   token: 'x' }],
]

let clientesVistos = 0
let pestanas = 0, secciones = 0, cabeceras = 0, hallazgos = 0
let fichasDeCodigo = 0
let bandejasDeCosto = 0
let foliosVistos = 0
let preciosPorPlaza = 0
let bandejasDePrecio = 0
let movimientoVisto = 0
let sucursalLimpia = 0
let celdasEditables = 0
let metodosPlegados = 0
let clasesVistas = 0
let bandejasVistas = 0
let plazasDeEfectivo = 0

// Las cuatro clases de lote, por su titulo. Es la comprobacion de que la
// agrupacion sigue viva: sin ella la cola vuelve a ser una pregunta por
// codigo, que es lo que se vino a arreglar.
const lotesVistos = new Set()
let nuevosVistos = 0
let archivosDeBaja = 0
let salidasVistas = 0
let consultasVistas = 0
let censurasVistas = 0
let depuradosVistos = 0
let cortesVistos = 0
let nominasVistas = 0

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
        if (/ventas/i.test(t)) {
          fichasDeCodigo += await buscarUnCodigo(window, `${nombre} · admin · ${t}`)
          bandejasDeCosto += bandejaDeCostos(window, `${nombre} · admin · ${t}`)
          preciosPorPlaza += precioPorPlaza(window, `${nombre} · admin · ${t}`)
          nuevosVistos += await modelosNuevos(window, `${nombre} · admin · ${t}`)
          bandejasDePrecio += preciosARevisar(window, `${nombre} · admin · ${t}`)
        }
        if (/surtido|surtir/i.test(t)) {
          censurasVistas += marcaDeCensura(window, `${nombre} · ${t}`)
          foliosVistos += await listaDeFolios(window, `${nombre} · admin · ${t}`)
          // Solo para una sesion de TIENDA: admin y bodega si deben verlo.
          if (nombre === 'sucursal') {
            sucursalLimpia += sucursalSinBodega(window, `${nombre} · ${t}`)
          }
        }
        // La bandeja se mira con las DOS sesiones que la trabajan. Bodega
        // escribe en la cola igual que el administrador -esta en
        // `QUIENES_ESCRIBEN`- y comprobarla solo con admin dejaria sin mirar
        // justo la sesion a la que ya se le perdio el trabajo una vez.
        if (/revisar/i.test(t) && (nombre === 'admin' || nombre === 'bodega')) {
          const cuantas = await revisarBandeja(window, `${nombre} · ${t}`)
          hallazgos += cuantas
          if (cuantas) bandejasVistas++
        }
        if (/inventarios/i.test(t)) {
          clasesVistas += await clasesEnRecuadros(window, `${nombre} · ${t}`)
          archivosDeBaja += await archivoDeBajas(window, `${nombre} · ${t}`)
        }
        if (/consultar modelo/i.test(t) && nombre === 'bodega') {
          consultasVistas += await consultaModelo(window, `${nombre} · ${t}`)
        }
        if (/mi pago/i.test(t) && nombre === 'sucursal') {
          nominasVistas += await miPagoDeLaTienda(window, `${nombre} · ${t}`)
        }
        if (t.replace(/[^\p{L}\s]/gu, '').trim() === 'Personal' && nombre === 'admin') {
          nominasVistas += await nominaDelAdmin(window, `${nombre} · ${t}`)
        }
        if (/clientes/i.test(t) && (nombre === 'sucursal' || nombre === 'admin')) {
          clientesVistos += await clientesDelPanel(window, `${nombre} · ${t}`, nombre === 'admin')
        }
        if (/clientes/i.test(t) && nombre === 'bodega') errores.push('bodega ve la seccion de clientes')
        if (/corte/i.test(t) && nombre === 'sucursal') {
          cortesVistos += await corteDeLaTienda(window, `${nombre} · ${t}`)
        }
        if (/depurar/i.test(t) && nombre === 'admin') {
          const r = await depurar(window, `${nombre} · admin · ${t}`)
          depuradosVistos += r.vistas
          cabeceras += r.cabeceras
        }
        if (/se mueve/i.test(t)) {
          movimientoVisto += queSeMueve(window, `${nombre} · admin · ${t}`)
        }
        // Solo con sesion de administrador: es su pantalla de compras.
        if (nombre === 'admin' && /bodega/i.test(t)) {
          celdasEditables += await pedirEditable(window, `${nombre} · ${t}`)
          metodosPlegados += metodoPlegado(window, `${nombre} · ${t}`)
        }
        if (/efectivo/i.test(t)) {
          // El detalle de salidas va ANTES: vive en el calendario del
          // tablero, y `revisarEfectivo` se mete dentro de una plaza, que es
          // otra vista. Comprobandolo despues se buscaba algo que ya no
          // estaba en pantalla.
          salidasVistas += await salidasDeCaja(window, `${nombre} · admin · ${t}`)
          plazasDeEfectivo += await revisarEfectivo(window, `${nombre} · admin · ${t}`)
          // El corte semanal es una vista de Efectivo desde el 2026-11-09.
          if (nombre === 'admin') {
            const vista = window.document.querySelector('[data-vista-efectivo="corte"]')
            if (!vista) errores.push(`${nombre} · ${t} · no hay vista de corte semanal dentro de Efectivo`)
            else {
              clic(window, vista)
              await nuevaVuelta(window, 8)
              cabeceras += await todasLasCabeceras(window, `${nombre} · ${t} · corte`)
              cortesVistos += await corteDelAdmin(window, `${nombre} · ${t} · corte`)
            }
          }
        }
      }
    }
  }

  revisarConsola(dichos, nombre)
  window.close()
}

// ── El parte ───────────────────────────────────────────────────────────────

console.log(`\nsesiones ${SESIONES.length} · pestañas ${pestanas} · secciones de admin ${secciones} · cabeceras pulsadas ${cabeceras} · incidencias listadas ${hallazgos}`)
console.log(`  busqueda por codigo en ventas: ${fichasDeCodigo} ficha dibujada`)
if (fichasDeCodigo < 1) errores.push('la busqueda por codigo de ventas no se ejecuto')
console.log(`  bandeja de costos que faltan: ${bandejasDeCosto} dibujada`)
console.log(`  folios de surtido dibujados: ${foliosVistos}`)
console.log(`  seccion de precio por plaza: ${preciosPorPlaza} dibujada`)
console.log(`  bandeja de precios a revisar: ${bandejasDePrecio} dibujada`)
console.log(`  panel «que se mueve» de bodega: ${movimientoVisto} dibujado`)
console.log(`  surtido de sucursal revisado por fugas: ${sucursalLimpia}`)
console.log(`  cantidad a pedir editable: ${celdasEditables} comprobada`)
console.log(`  metodo de compra plegado: ${metodosPlegados} comprobado`)
console.log(`  recuadros con desglose por clase: ${clasesVistas}`)
console.log(`  bandeja de incidencias: ${bandejasVistas} dibujada`)
if (bandejasVistas < 1) errores.push('la bandeja de incidencias no se dibujo: la pestaña vuelve a ser un reporte')
if (clasesVistas < 1) errores.push('los recuadros de inventario no desglosan por clase')
if (metodosPlegados < 1) errores.push('no se comprobo que la explicacion del metodo de compra este plegada')
if (celdasEditables < 1) {
  errores.push('no se comprobo que la cantidad a pedir se pueda cambiar a mano')
}
if (sucursalLimpia < 1) {
  errores.push('no se llego a comprobar que una sucursal no ve lo de bodega: esa comprobacion mira lo que NO esta, y si no corre nadie la echa de menos')
}
if (movimientoVisto < 1) {
  errores.push('el panel «que se mueve» de bodega no se dibujo: sin el, quien arma las cajas no ve que vuela ni que sobra en cada tienda')
}
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
console.log(`  detalle de salidas de caja: ${salidasVistas} dibujado`)
if (!salidasVistas) errores.push('el detalle de salidas de caja no se dibujo en ninguna sesion')
console.log(`  archivo de bajas: ${archivosDeBaja} dibujado`)
if (!archivosDeBaja) errores.push('el archivo de bajas no se dibujo en ninguna sesion')
console.log(`  seccion de modelos nuevos: ${nuevosVistos} dibujada`)
if (!nuevosVistos) errores.push('la seccion «estan vendiendo los modelos nuevos» no se dibujo en ninguna sesion')
console.log(`  depurar (listas y candados): ${depuradosVistos} vistas recorridas`)
if (depuradosVistos < 4) errores.push(`«Depurar» recorrio ${depuradosVistos} vistas de 4: una baja con piezas en la red no saldria en ningun sitio`)
console.log(`  nómina (Mi pago y Nómina y RH): ${nominasVistas} de 2 recorridos`)
if (nominasVistas < 2) errores.push(`la nómina se recorrió ${nominasVistas} vez de 2`)
console.log(`  corte semanal (tienda y administrador): ${cortesVistos} de 2 recorridos`)
if (cortesVistos < 2) errores.push(`el corte semanal se recorrio ${cortesVistos} vez de 2: sin el, un faltante sin tolerancia no saldria en ningun sitio`)
console.log(`  CRM (bandeja de la tienda y del administrador): ${clientesVistos} de 2 recorridos`)
if (clientesVistos < 2) errores.push(`la bandeja de clientes se recorrio ${clientesVistos} vez de 2`)
console.log(`  consultar modelo de bodega: ${consultasVistas} dibujado`)
if (!consultasVistas) errores.push('«Consultar modelo» de bodega no se recorrió: bodega se queda sin poder mirar un modelo de cerca')
console.log(`  marca de venta censurada en «Pedir»: ${censurasVistas} vista`)
if (!censurasVistas) errores.push('ninguna lista de «Pedir» marcó un modelo que estuvo en cero: vuelve a no saberse si un número bajo es de fiar')
console.log(`  lotes dibujados: ${lotesVistos.size}`)
for (const l of lotesVistos) console.log('    · ' + l)
if (lotesVistos.size < 4) errores.push(`solo se dibujaron ${lotesVistos.size} lotes de 4: la bandeja volvio a preguntar codigo por codigo`)
if (avisos.length) console.log(`avisos de React: ${avisos.length}`)

if (errores.length) {
  console.log(`\nFALLA (${errores.length}):`)
  for (const e of errores) console.log('  ' + e)
  process.exit(1)
}
console.log('\nsin pantallas en blanco ni errores de consola.')
