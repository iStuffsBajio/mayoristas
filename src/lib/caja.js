// Flujo de efectivo por sucursal: qué entró en efectivo, qué salió y qué
// debería estar en la caja o en el banco.
//
// ── De dónde sale el dato, y por qué de ahí ────────────────────────────────
//
// De `CORTE_OPERACIONES` de Eleventa, que guarda una fila por día y caja con
// las formas de pago YA separadas. Medido el 2026-11-05: Aguascalientes tiene
// 2,136 días seguidos desde el 2019-11-26.
//
// Y ya reparte los pagos mixtos, lo que importa porque es la trampa de esta
// pantalla. Octubre de León cuadra al peso:
//
//     efectivo  88,428.61 = 88,028.61 de tickets «e» + 400 del mixto
//     tarjeta    9,690.09 =  9,590.09 de tickets «t» + 100 del mismo mixto
//
// Por eso NO se lee `PAGOS_MIXTOS`, aunque el nombre invite: en León esa tabla
// dice 352 líneas y $178,376 de tarjeta cuando los tickets y el corte
// coinciden en $132,551 de tarjeta EN TOTAL. Leyéndola, la tarjeta sale
// inflada un 35% y el efectivo encogido otro tanto.
//
// ── Lo que el dato NO sabe, y es la mitad del cálculo ──────────────────────
//
// Gastos de caja, retiros, adelantos al personal y pagos a proveedores no
// estaban en ninguna parte: `ACUMULADO_SALIDAS` sale en cero en **2,128 de los
// 2,136 días** de Aguascalientes, porque nadie los capturaba.
//
// El dueño dio la indicación el 2026-11-05 de que todas las plazas empiecen a
// registrarlos en Eleventa. De ahí en adelante vienen en `CORTE_MOVIMIENTOS`,
// con su concepto. Antes de esa fecha no hay nada, y eso tiene una
// consecuencia que esta librería tiene que respetar:
//
//     **Sin control de salidas, el efectivo esperado es un TECHO, no una
//     cifra.** Dice que debería haber más dinero del que de verdad hay,
//     porque hubo salidas que nadie anotó.
//
// Restarle el depósito a un techo da un «faltante» inventado, y un faltante
// inventado no se distingue en pantalla de uno real. Por eso `conControl()`
// manda: un día sin control se pinta, se suma y se enseña, pero NO produce
// diferencia ni semáforo rojo. Es la misma regla que ya rige `Alta` en el
// resto del panel: sirve como cota, nunca como prueba.

/**
 * 🔒 La semana operativa va de LUNES a DOMINGO, y el domingo corta.
 *
 * Lo decidió el dueño. No se cambia por iniciativa propia: mover el corte
 * mueve qué venta cubre cada depósito, y con ello todas las diferencias.
 *
 * `personal.js` ya usa el mismo corte para la puntualidad. Que las dos
 * pantallas digan «semana» hablando de los mismos siete días no es casualidad
 * y conviene que siga así.
 */
export const PRIMER_DIA = 1  // getDay(): 0 domingo, 1 lunes

/** Nombres cortos de los siete días, en el orden de la semana operativa. */
export const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

/**
 * 🔒 Desde cuándo cuenta esta pantalla. El historial arranca en CEROS.
 *
 * Lo puso el dueño el 2026-11-06, con sus palabras: «como es una sección
 * nueva y técnicamente quiero empezar el historial en ceros, únicamente
 * considerando la semana en curso, que es la semana que inicia del lunes 2 de
 * noviembre al domingo 8 de noviembre».
 *
 * No es cosmética, y lo que arregla se vio en pantalla: «lo que debe entrar al
 * banco» decía **$411,648 en 32 semanas sin marcar**, la más vieja del 14 de
 * septiembre. Ese dinero ya está en el banco; lo que pasa es que se depositó
 * meses antes de que existiera el botón de marcarlo, así que ocho semanas de
 * venta de Eleventa se leían como un pendiente. Una deuda inventada de medio
 * millón de pesos no se distingue en pantalla de una real, que es la misma
 * trampa que `conControl` existe para evitar un escalón más abajo.
 *
 * Lo de antes **no se borra ni se pierde**: sigue entero en
 * `caja/<plaza>.json` y se sigue pudiendo extraer. Lo único que cambia es que
 * no se cuenta como pendiente de depositar ni se dibuja.
 *
 * Tiene que ser un LUNES, que es como empiezan las semanas de esta casa.
 */
export const INICIO_HISTORIAL = '2026-11-02'

/**
 * Lo que puede pasarle al depósito de una semana.
 *
 * `SIN_CONTROL` no es un estado de dejadez: es el de una semana anterior a
 * que la plaza empezara a registrar sus salidas. Se dice distinto a propósito,
 * porque lo que procede con él no es perseguir un faltante sino no inventarlo.
 */
export const ESTADOS = {
  SIN_CONTROL:  'sin-control',
  SIN_CONFIG:   'sin-config',    // falta el día de depósito o la tolerancia
  PENDIENTE:    'pendiente',     // todavía no llega su día
  COMPLETO:     'completo',
  CON_DIFERENCIA: 'con-diferencia',
  ATRASADO:     'atrasado',      // pasó la hora límite de su día
  NO_DEPOSITADO: 'no-depositado', // pasó el día entero
}

/**
 * Los parámetros de una sucursal, todos vacíos.
 *
 * **Ninguno trae valor por defecto, y es a propósito.** El fondo fijo, el
 * límite de efectivo, la tolerancia y la hora límite son decisiones de negocio
 * del dueño, de las marcadas 🔒 en las reglas de la casa: un número inventado
 * aquí se leería en pantalla igual que uno suyo, y se decidiría sobre él.
 *
 * Mientras falten, la tarjeta de esa plaza lo dice y no pinta semáforo. Un
 * verde calculado sobre una tolerancia que nadie puso es peor que un hueco.
 */
export const PARAMETROS_VACIOS = {
  diaDeposito:    null,   // 1 lunes … 7 domingo
  periodoCubre:   'semana-anterior',
  fondoFijo:      null,
  limiteEfectivo: null,
  cuenta:         '',
  responsable:    '',
  tolerancia:     null,   // en pesos
  horaLimite:     '',     // '14:00'
  gastoMaxSinComprobante: null,
  // Desde cuándo esta plaza registra sus salidas en Eleventa. Antes de esta
  // fecha el esperado es un techo. Va por plaza porque una puede tardar en
  // adoptarlo más que otra, y entonces su fecha es otra.
  desdeControlSalidas: null,
}

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Pesos mexicanos, que es la única moneda que maneja la casa. */
export const pesos = n => num(n).toLocaleString('es-MX', {
  style: 'currency', currency: 'MXN', minimumFractionDigits: 2,
})

/** Pesos sin centavos, para los totales grandes de las tarjetas. */
export const pesosCortos = n => num(n).toLocaleString('es-MX', {
  style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
})

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const comoFecha = f => {
  const [y, m, d] = String(f).split('-').map(Number)
  return new Date(y, m - 1, d)
}

const SEMANA_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Cuántas semanas hay entre dos lunes. Se redondea a propósito: `comoFecha`
 * arma fechas locales y una hora de más o de menos no puede mover la cuenta.
 */
const semanasEntre = (a, b) => Math.round((comoFecha(b) - comoFecha(a)) / SEMANA_MS)

/** La semana de lunes a domingo que contiene esa fecha. */
export function semanaDe(fecha) {
  const d = comoFecha(fecha)
  const lunes = new Date(d)
  lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  return { desde: iso(lunes), hasta: iso(domingo) }
}

/** Corre una semana `n` lugares: −1 es la anterior, +1 la siguiente. */
export function correrSemana({ desde }, n) {
  const d = comoFecha(desde)
  d.setDate(d.getDate() + n * 7)
  return semanaDe(iso(d))
}

/**
 * Las salidas y entradas de una semana, con su concepto, de la más reciente a
 * la más vieja.
 *
 * Los faltantes NO entran: no restan del neto -ver `NO_RESTAN`- y llevan el
 * nombre de quien cerró el turno pegado a una cantidad de dinero. Tienen su
 * propia sección y su propia regla.
 */
export function movimientosDeSemana(filas = []) {
  const out = []
  for (const r of filas) {
    for (const m of r.movs ?? []) {
      if (m.tipo === 'faltante') continue
      out.push({ ...m, f: m.f ?? r.f, dia: r.dia })
    }
  }
  return out.sort((a, b) => String(b.f).localeCompare(String(a.f))
    || num(b.monto) - num(a.monto))
}

/** Los siete días de una semana, en orden, hayan tenido venta o no. */
export function diasDeSemana({ desde }) {
  const d = comoFecha(desde)
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d)
    x.setDate(d.getDate() + i)
    return iso(x)
  })
}

/** Qué día de la semana operativa es una fecha: 1 lunes … 7 domingo. */
export const diaDeSemana = fecha => ((comoFecha(fecha).getDay() + 6) % 7) + 1

export const nombreDia = fecha => DIAS[diaDeSemana(fecha) - 1]

/**
 * ¿Ese día tiene control de salidas?
 *
 * Es la pregunta que decide si el esperado es una cifra o un techo. Sin fecha
 * configurada la respuesta es NO: equivocarse hacia el lado de no acusar a
 * nadie es el error barato, y es el mismo criterio con el que `personal.js`
 * mide los relevos.
 */
export const conControl = (fecha, params) => {
  const desde = params?.desdeControlSalidas
  return !!desde && String(fecha) >= String(desde)
}

// ── El flujo de un día ──────────────────────────────────────────────────────

/**
 * Las siete líneas que restan del efectivo cobrado.
 *
 * Salen de `CORTE_MOVIMIENTOS`, cuyo `TIPO` es texto —`Entrada`, `Salida`,
 * `Devolucion`— y cuya `DESCRIPCION` es el concepto que teclea quien cobra.
 */
export const CONCEPTOS = ['gasto', 'retiro', 'adelanto', 'proveedor', 'otra-salida']

/**
 * 🔒 `faltante` NO está en `CONCEPTOS`, y ésa es toda la regla.
 *
 * Un faltante registrado se cuenta, se enseña y se persigue, pero **no resta
 * del efectivo neto**. Si restara, el esperado bajaría justo lo que falta, el
 * depósito cuadraría al peso y el semáforo saldría verde: el único caso que
 * esta pantalla existe para detectar sería el único invisible.
 *
 * Dejándolo fuera, la cuenta sale al revés y bien: el depósito viene corto
 * por esa cantidad, el bloque sale en rojo, y la sección de faltantes dice de
 * dónde salió la diferencia. La alarma y su explicación, a la vez.
 */
export const NO_RESTAN = ['faltante']

/**
 * El flujo de un día, línea por línea.
 *
 * `d` es un día del archivo publicado; `movs` las entradas y salidas de ese
 * día; `ajuste` lo que una persona haya corregido a mano.
 *
 * **Las devoluciones salen de `CORTE_OPERACIONES` y de ningún otro sitio.**
 * `CORTE_MOVIMIENTOS` también las guarda —473 líneas y $79,081.74 en
 * Aguascalientes— y sumar las dos fuentes las restaría dos veces. Es el mismo
 * suceso anotado en dos tablas.
 */
export function flujoDelDia(d = {}, movs = [], ajuste = null) {
  const porTipo = t => movs.filter(m => m.tipo === t).reduce((a, m) => a + num(m.monto), 0)

  const ventaTotal = num(d.efectivo) + num(d.tarjeta) + num(d.transferencia)
                   + num(d.vales) + num(d.credito) + num(d.cheque)

  const calculado = {
    f:             d.f,
    ventaTotal,
    tarjeta:       num(d.tarjeta),
    transferencia: num(d.transferencia),
    otrasNoEfectivo: num(d.vales) + num(d.credito) + num(d.cheque),
    efectivoCobrado: num(d.efectivo),
    devoluciones:  num(d.devEfectivo),
    gastos:        porTipo('gasto'),
    retiros:       porTipo('retiro'),
    adelantos:     porTipo('adelanto'),
    proveedores:   porTipo('proveedor'),
    otrasSalidas:  porTipo('otra-salida'),
    entradas:      porTipo('entrada'),
    // Fuera del cálculo a propósito: ver `NO_RESTAN`.
    faltantes:     porTipo('faltante'),
    arqueo:        d.arqueo === undefined || d.arqueo === null ? null : num(d.arqueo),
    nVentas:       num(d.nVentas),
    // Los movimientos TAL CUAL, no sólo sumados por tipo.
    //
    // Lo de arriba contesta «cuánto salió»; esto contesta «en qué se fue», y
    // es la pregunta que de verdad se hace quien mira el cajón. Un total de
    // salidas de $1,200 sin conceptos no se puede revisar ni discutir: no se
    // sabe si fue el garrafón, un adelanto o un pago a proveedor.
    movs,
  }

  calculado.neto = calculado.efectivoCobrado
    - calculado.devoluciones
    - calculado.gastos - calculado.retiros - calculado.adelantos
    - calculado.proveedores - calculado.otrasSalidas
    + calculado.entradas

  if (!ajuste) return { ...calculado, ajustado: null }

  // Un ajuste NO borra lo calculado: se guarda al lado y se puede volver a
  // él. Es la misma regla que `ajustes/` sigue con el inventario, y por el
  // mismo motivo: el archivo se regenera del respaldo cuatro veces al día, así
  // que una corrección escrita encima se borraría sola esa misma tarde.
  const ajustado = { ...calculado, ...ajuste.valores }
  ajustado.neto = ajustado.efectivoCobrado
    - ajustado.devoluciones
    - ajustado.gastos - ajustado.retiros - ajustado.adelantos
    - ajustado.proveedores - ajustado.otrasSalidas
    + ajustado.entradas

  return { ...ajustado, calculado, ajustado: ajuste }
}

/**
 * El flujo de una semana entera, día por día y sumado.
 *
 * Los siete días salen siempre, con o sin venta: un hueco en la tabla se lee
 * como «no cargó» y un cero se lee como «no vendió», que es un dato.
 */
export function flujoSemana(semana, { dias = [], movimientos = [], ajustes = {}, params = {} } = {}) {
  const porFecha = new Map((dias ?? []).map(d => [d.f, d]))
  const movsPorFecha = new Map()
  for (const m of movimientos ?? []) {
    if (!movsPorFecha.has(m.f)) movsPorFecha.set(m.f, [])
    movsPorFecha.get(m.f).push(m)
  }

  const filas = diasDeSemana(semana).map(f => ({
    ...flujoDelDia(porFecha.get(f) ?? { f }, movsPorFecha.get(f) ?? [], ajustes[f] ?? null),
    f,
    dia: nombreDia(f),
    conControl: conControl(f, params),
    hayDato: porFecha.has(f),
  }))

  const sumar = k => filas.reduce((a, r) => a + num(r[k]), 0)

  return {
    ...semana,
    filas,
    total: {
      ventaTotal:      sumar('ventaTotal'),
      tarjeta:         sumar('tarjeta'),
      transferencia:   sumar('transferencia'),
      otrasNoEfectivo: sumar('otrasNoEfectivo'),
      efectivoCobrado: sumar('efectivoCobrado'),
      devoluciones:    sumar('devoluciones'),
      gastos:          sumar('gastos'),
      retiros:         sumar('retiros'),
      adelantos:       sumar('adelantos'),
      proveedores:     sumar('proveedores'),
      otrasSalidas:    sumar('otrasSalidas'),
      entradas:        sumar('entradas'),
      neto:            sumar('neto'),
      faltantes:       sumar('faltantes'),
      nVentas:         sumar('nVentas'),
    },
    // La semana entera tiene control sólo si lo tienen sus siete días. Con uno
    // suelto sin control, el total ya es un techo.
    conControl: filas.every(r => r.conControl),
    diasSinControl: filas.filter(r => !r.conControl).length,
  }
}

// ── El depósito ─────────────────────────────────────────────────────────────

/** La semana cuya venta cubre el depósito que se hace en `semana`. */
export function periodoQueCubre(semana, params = {}) {
  return params.periodoCubre === 'semana-en-curso' ? semana : correrSemana(semana, -1)
}

/**
 * Qué se espera que entre al banco, qué entró y qué pasa con la diferencia.
 *
 * `hoy` entra como parámetro y no se lee del reloj: una función que mira la
 * hora no se puede probar, y de lo que decide esto —si una plaza está
 * atrasada— no hay forma de enterarse si no se puede fijar en una prueba.
 */
export function estadoDeposito({ flujo, deposito = null, params = {}, hoy }) {
  const esperado = flujo?.total?.neto ?? 0
  const real = deposito ? num(deposito.monto) : null

  // Sin control de salidas no hay diferencia que perseguir: el esperado es un
  // techo. Se devuelve lo que se sabe y se dice que no se puede comparar.
  if (!flujo?.conControl) {
    return {
      estado: ESTADOS.SIN_CONTROL,
      esperado, real, diferencia: null, techo: true,
      porque: `${flujo?.diasSinControl ?? 7} de los 7 días son de antes de que esta plaza registrara sus salidas: el esperado es un máximo, no una cifra.`,
    }
  }

  if (!params.diaDeposito || params.tolerancia === null || params.tolerancia === undefined) {
    return {
      estado: ESTADOS.SIN_CONFIG,
      esperado, real, diferencia: real === null ? null : real - esperado, techo: false,
      porque: 'Falta configurar el día de depósito o la tolerancia de esta plaza.',
    }
  }

  if (real !== null) {
    const diferencia = real - esperado
    const dentro = Math.abs(diferencia) <= num(params.tolerancia)
    return {
      estado: diferencia === 0 ? ESTADOS.COMPLETO : ESTADOS.CON_DIFERENCIA,
      esperado, real, diferencia, techo: false,
      dentroTolerancia: dentro,
    }
  }

  // Todavía sin depositar: pendiente mientras no llegue su día y su hora.
  const vence = fechaDeDeposito(flujo, params)
  const tarde = hoy > `${vence}T${params.horaLimite || '23:59'}`
  const pasoElDia = String(hoy).slice(0, 10) > vence

  return {
    estado: pasoElDia ? ESTADOS.NO_DEPOSITADO : tarde ? ESTADOS.ATRASADO : ESTADOS.PENDIENTE,
    esperado, real: null, diferencia: null, techo: false,
    vence,
  }
}

/** El día concreto en que toca depositar la venta de ese flujo. */
export function fechaDeDeposito(flujo, params = {}) {
  // El depósito se hace en la semana SIGUIENTE a la que cubre, cuando el
  // periodo es «semana anterior»: la venta del lunes al domingo se lleva al
  // banco el lunes o el martes de después.
  const semanaDelDeposito = params.periodoCubre === 'semana-en-curso'
    ? { desde: flujo.desde }
    : correrSemana({ desde: flujo.desde }, 1)
  const dias = diasDeSemana(semanaDelDeposito)
  return dias[Math.max(0, Math.min(6, num(params.diaDeposito) - 1))]
}

// ── Bloques semanales ───────────────────────────────────────────────────────
//
// Lo decidió el dueño así: **bloques semanales, no acumulados.** Cada semana
// es su propio bloque con su propia cifra y su propio botón de marcarla como
// depositada. Lo que NO se marcó se va acumulando.
//
// Por qué importa que sea así y no un saldo corrido: con un acumulado único no
// se puede saber QUÉ semana quedó sin depositar. Sumaba bien y no servía para
// nada, porque la pregunta que se hace es «¿de qué semana es este dinero?» y
// un saldo de $38,000 no la contesta. En bloques, cada cifra tiene su semana
// pegada y marcar una no toca a las demás.

/**
 * Un bloque: una semana, con su flujo, su depósito y su estado.
 *
 * `deposito` en `null` es una semana sin marcar, y ésa es la que acumula.
 */
export function bloqueSemanal(semana, { dias, movimientos, ajustes, params = {}, deposito = null, hoy } = {}) {
  const flujo = flujoSemana(semana, { dias, movimientos, ajustes, params })
  const est = estadoDeposito({ flujo, deposito, params, hoy })
  return {
    ...flujo,
    clave: semana.desde,          // la semana se identifica por su lunes
    deposito,
    depositado: !!deposito,
    ...est,
  }
}

/**
 * Las últimas `cuantas` semanas, de la más reciente a la más vieja.
 *
 * `depositos` va indexado por el lunes de la semana que cubre, que es la misma
 * clave con la que el bloque se marca y se guarda.
 */
export function bloquesSemanales({
  hasta, cuantas = 8, desde = INICIO_HISTORIAL, dias = [], movimientos = [], ajustes = {},
  params = {}, depositos = {}, hoy,
} = {}) {
  const ultima = semanaDe(hasta ?? String(hoy ?? '').slice(0, 10))

  // El recorte va AQUÍ y no en las pantallas, que es donde se intentó primero
  // y no bastó: el concentrado seguía sumando por su cuenta las semanas que
  // la lista de bloques ya no enseñaba, y el dueño veía ocho donde la pantalla
  // de al lado decía dos. Con un solo sitio que decida cuántas semanas
  // existen, ninguna vista puede volver a contar de más.
  //
  // Y nunca devuelve vacío: la semana en curso sale siempre, aunque el inicio
  // del historial fuera posterior. Una lista sin un solo bloque deja la
  // pantalla en blanco, que se ve igual que un fallo.
  const tope = desde ? semanasEntre(semanaDe(desde).desde, ultima.desde) + 1 : cuantas
  const cuantasDeVerdad = Math.max(1, Math.min(cuantas, tope))

  return Array.from({ length: cuantasDeVerdad }, (_, i) => {
    const semana = correrSemana(ultima, -i)
    return bloqueSemanal(semana, {
      dias, movimientos, ajustes, params, hoy,
      deposito: depositos[semana.desde] ?? null,
    })
  })
}

/**
 * Lo que sigue debiendo entrar al banco: la suma de los bloques sin marcar.
 *
 * Si alguno de esos bloques es de antes del control de salidas, el acumulado
 * es un TECHO y se dice. Un acumulado que mezcla semanas medidas con semanas
 * sin medir no es una cifra, y presentarlo como tal es exactamente el error
 * que `conControl` existe para evitar.
 */
export function acumuladoPorDepositar(bloques = []) {
  const pendientes = (bloques ?? []).filter(b => !b.depositado)
  return {
    bloques: pendientes,
    semanas: pendientes.length,
    total:   pendientes.reduce((a, b) => a + num(b?.total?.neto), 0),
    techo:   pendientes.some(b => !b.conControl),
    // La más vieja sin marcar es la que hay que perseguir primero.
    masVieja: pendientes.length
      ? pendientes.reduce((v, b) => (b.clave < v.clave ? b : v)).clave
      : null,
  }
}

/**
 * El efectivo que debería estar en la caja ahora mismo.
 *
 * Fondo fijo más lo neto de todos los bloques que NO se han marcado como
 * depositados. Marcar un bloque lo saca de esta cuenta, que es justo lo que
 * pasa de verdad cuando el dinero se va al banco.
 *
 * Sin fondo fijo configurado devuelve `null` en vez de asumir cero: cero es un
 * número y se compararía contra el límite, dando un verde sin saberse nada.
 */
export function efectivoEnCaja({ bloques = [], params = {} } = {}) {
  if (params.fondoFijo === null || params.fondoFijo === undefined) return null
  return num(params.fondoFijo) + acumuladoPorDepositar(bloques).total
}

// ── El semáforo ─────────────────────────────────────────────────────────────

/**
 * 🔒 Los colores los puso el dueño:
 *   verde    — cuadra
 *   amarillo — pendiente, o diferencia dentro de tolerancia
 *   rojo     — atrasado, diferencia fuera de tolerancia, o efectivo en caja
 *              por encima del límite
 *
 * `gris` no estaba en la lista y hace falta: es lo que no se puede juzgar
 * —sin control de salidas o sin parámetros—. Pintarlo verde diría que cuadra,
 * y pintarlo rojo acusaría; las dos cosas serían mentira.
 */
export function semaforo({ estado, diferencia, dentroTolerancia, enCaja, params = {} }) {
  if (estado === ESTADOS.SIN_CONTROL || estado === ESTADOS.SIN_CONFIG) return 'gris'

  const limite = params.limiteEfectivo
  const pasaLimite = limite !== null && limite !== undefined
    && enCaja !== null && enCaja !== undefined && num(enCaja) > num(limite)
  if (pasaLimite) return 'rojo'

  if (estado === ESTADOS.ATRASADO || estado === ESTADOS.NO_DEPOSITADO) return 'rojo'
  if (estado === ESTADOS.CON_DIFERENCIA) return dentroTolerancia ? 'amarillo' : 'rojo'
  if (estado === ESTADOS.COMPLETO) return diferencia === 0 ? 'verde' : 'amarillo'
  return 'amarillo'   // pendiente
}

// ── Los faltantes ───────────────────────────────────────────────────────────

/**
 * 🔒 Un faltante es una SALIDA QUE ALGUIEN REGISTRÓ, no un descuadre de corte.
 *
 * Lo decidió el dueño el 2026-11-06: «en la sección de faltantes viene
 * efectivo que faltó al cerrar turno. Lo eliminaría porque realmente la
 * información no es precisa, puesto que ellos a la hora de cerrar no
 * consideran que siempre tiene que coincidir el monto. Lo dejaría cuando
 * ellos registren una salida de efectivo por un faltante y no tanto por el
 * momento del corte».
 *
 * Y tiene razón en los números. Eleventa escribe sola una línea «Efectivo
 * faltante al cerrar turno de ‹nombre›» cada vez que lo contado no cuadra con
 * lo cobrado, cuadre o no la caja de verdad: medido de enero a octubre de 2026
 * eso sumaba **$67,152.12 en las cuatro plazas, el 2.84% del efectivo
 * cobrado**, con San Luis al 4.81%. Un 5% de descuadre sostenido durante diez
 * meses no es dinero que desaparece: es un cierre que nadie cuadra. Enseñarlo
 * como faltante acusa de un robo a quien sólo cerró rápido.
 *
 * Esas líneas **se siguen extrayendo y se siguen apartando** —viven en
 * `faltantes` de `caja/<plaza>.json`, y apartarlas sigue siendo imprescindible
 * para que no caigan en `otra-salida` y resten del neto—. Lo que cambia es que
 * no se enseñan ni se suman en ninguna pantalla.
 *
 * Lo que sí cuenta es lo que lee esta función: movimientos de tipo
 * `faltante`, que son los que alguien tecleó a propósito porque de verdad
 * faltó dinero.
 */
export function faltantesDe(movimientos = [], { desde, hasta } = {}) {
  const dentro = (movimientos ?? []).filter(m =>
    m?.tipo === 'faltante' && (!desde || m.f >= desde) && (!hasta || m.f <= hasta))

  const porPersona = new Map()
  for (const x of dentro) {
    // Sólo `persona`, nunca `quien`. `quien` es el usuario que TECLEÓ el
    // movimiento en la página —casi siempre el administrador— y agruparlo por
    // ahí le colgaría a él todos los faltantes de las cuatro plazas. Pegar un
    // nombre a una cantidad de dinero que falta es justo lo que no se puede
    // hacer a la ligera, así que sin persona queda «sin identificar».
    const quien = x.persona || 'sin identificar'
    const e = porPersona.get(quien) ?? { persona: quien, veces: 0, monto: 0, fechas: [] }
    e.veces++
    e.monto += num(x.monto)
    e.fechas.push(x.f)
    porPersona.set(quien, e)
  }

  return {
    lineas: [...dentro].sort((a, b) => String(b.f).localeCompare(String(a.f))),
    total: dentro.reduce((a, x) => a + num(x.monto), 0),
    veces: dentro.length,
    // Por persona y de mayor a menor: una diferencia repetida del mismo
    // cajero es la alerta que pidió el dueño, y ordenando por monto se ve.
    porPersona: [...porPersona.values()].sort((a, b) => b.monto - a.monto),
  }
}

/**
 * Gastos que piden mirarse: sin comprobante, o por encima del máximo.
 *
 * El máximo lo pone el dueño por plaza. Sin él configurado sólo salen los que
 * no traen comprobante, que es una regla que no necesita número.
 */
export function gastosQueDuelen(movimientos = [], params = {}) {
  const max = params.gastoMaxSinComprobante
  return (movimientos ?? [])
    .filter(m => m.tipo === 'gasto')
    .map(m => ({
      ...m,
      sinComprobante: !m.comprobante,
      pasaMaximo: max !== null && max !== undefined && num(m.monto) > num(max),
    }))
    .filter(m => m.sinComprobante || m.pasaMaximo)
    .sort((a, b) => num(b.monto) - num(a.monto))
}

/**
 * 🔒 Si una plaza tiene dato de caja o no.
 *
 * Parece de sobra y no lo es. El backend devuelve `{}` cuando la clave no
 * existe en S3 —`leerJson` traga el error y devuelve objeto vacío— y `{}` es
 * VERDADERO. Comprobando sólo `!flujo`, la pantalla daba por buena una plaza
 * sin archivo y pintaba la semana entera en CEROS.
 *
 * Y un cero aquí no es inocente: se lee como «no se vendió nada», que es lo
 * contrario de «no se pudo mirar». Pasó el 2026-11-06, el día que se estrenó
 * la pantalla y antes de que el extractor hubiera corrido nunca.
 *
 * Un archivo de verdad siempre trae días medidos; por eso se mira eso y no la
 * existencia del objeto.
 */
export const tieneDatos = flujo => Array.isArray(flujo?.dias) && flujo.dias.length > 0
