// El registro de lo que sale de bodega a cada tienda.
//
// ── Qué problema resuelve ───────────────────────────────────────────────────
//
// La pestaña de Surtido calcula qué mandar y lo baja en Excel. De lo que se
// mandó de verdad no quedaba nada: se manda la caja con su lista y se confía.
// Así, si llegan 8 de las 10 que salieron, nadie se entera nunca: la tienda da
// de alta 8, bodega descontó 10, y las dos cuentas parecen correctas cada una
// por su lado.
//
// ── Cómo se comprueba: con el respaldo, no con la palabra de nadie ──────────
//
// A nadie se le pide contar a mano. El conteo ya existe y es mejor que
// cualquier captura: es el ALTA que la tienda hace en su propio Eleventa, y
// aparece en el respaldo siguiente. Lo decidió el dueño así —«lo óptimo es que
// espere a que se dé de alta, por lo general puede tardar 4 días máximo»— y
// tiene dos ventajas sobre un conteo a ciegas: no añade trabajo a la tienda, y
// el número no lo teclea nadie que pueda equivocarse al teclearlo.
//
// ── Por qué el folio se abre AL SALIR y no al confirmar ─────────────────────
//
// Para saber cuánto entró hay que saber cuánto había antes, y el «antes» sólo
// existe mientras todavía es antes. Los respaldos por fecha se quitaron a
// propósito —44 MB al año— y sólo queda `anterior.json`, UN paso atrás: no se
// puede mirar cuatro días hacia atrás.
//
// Por eso el folio **se guarda su propio antes**: al registrar la salida se
// congela la existencia de cada código en la plaza de destino. El folio es
// autosuficiente y no depende de ningún archivo histórico.
//
// ── La trampa que hace falsas todas las cuentas ─────────────────────────────
//
// La tienda VENDE mientras recibe. Restar existencias a secas da de menos:
//
//     entraron = (existencia_después − existencia_antes) + lo_que_se_vendió
//
// Sin el término de la venta, un modelo que recibió 10 y vendió 3 parece haber
// recibido 7, y el folio saldría con una diferencia de 3 piezas que nadie se
// llevó. Las piezas vendidas salen del archivo por mes, igual que en el resto
// del panel.

/**
 * 🔒 Quién puede registrar una salida de bodega.
 *
 * Tiene que decir LO MISMO que `PUEDE_SURTIR` en `backend/src/index.js`. No se
 * pueden compartir -son dos paquetes- así que se escribe dos veces y se dice
 * aquí, que es lo único que evita que se separen sin que nadie lo note.
 *
 * Y el que manda es el del backend: esto sólo decide si se enseña el botón.
 * Enseñar un botón que el servidor va a rechazar es peor que no enseñarlo,
 * pero esconderlo no protege nada por sí solo.
 *
 * Va por capacidad y no atado a «admin» porque el encargado de bodega entra
 * con su propio usuario y tiene que heredarlo sin tocar ninguna pantalla.
 */
export const PUEDE_SURTIR = ['admin', 'bodega']

/** Si esta sesión puede registrar surtidos. */
export const puedeSurtir = ({ isAdmin, plaza } = {}) =>
  isAdmin || PUEDE_SURTIR.includes(String(plaza ?? '').trim().toLowerCase())

/** Lo que le puede pasar a un folio. */
export const ESTADOS = {
  EN_CAMINO:  'en-camino',   // salió; el alta todavía no aparece
  CUADRA:     'cuadra',      // apareció, y coincide con lo que salió
  DIFERENCIA: 'diferencia',  // apareció, y falta o sobra algo
  TARDE:      'tarde',       // pasaron los días de gracia sin dar de alta
}

/**
 * 🔒 Días que se le conceden a una tienda para dar de alta lo que recibió.
 *
 * Lo puso el dueño: «por lo general puede tardar 4 días máximo». Pasados, no
 * es que falte mercancía: es que nadie la ha dado de alta, que es otro
 * problema, se arregla de otra forma y por eso se dice distinto.
 */
export const DIAS_PARA_DAR_DE_ALTA = 4

/**
 * 🔒 Piezas de diferencia que se dejan pasar sin llamarlas diferencia.
 *
 * Cero. Y conviene que siga siendo cero: una tolerancia «de una pieza o dos»
 * es exactamente del tamaño de lo que se pierde de verdad, y la volvería
 * invisible justo en el caso que esto existe para detectar.
 */
export const TOLERANCIA = 0

const limpio = c => String(c ?? '').trim().toUpperCase()
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** La existencia de cada código de un inventario, con el código normalizado. */
export function existenciasDe(inventario) {
  const out = {}
  for (const p of inventario?.productos ?? []) {
    const c = limpio(p.Codigo)
    if (c) out[c] = num(p.Existencia)
  }
  return out
}

/**
 * Un folio nuevo, listo para guardar.
 *
 * `antes` se congela aquí dentro y no se vuelve a tocar nunca: es la única
 * foto del estado anterior que va a existir.
 */
export function nuevoFolio({ destino, lineas, quien, inventarioDestino, cuando = new Date() }) {
  if (!destino) throw new Error('Un surtido sin destino no se puede comprobar.')

  const existencias = existenciasDe(inventarioDestino)
  const utiles = (lineas ?? [])
    .map(l => ({
      codigo: limpio(l.codigo),
      producto: String(l.producto ?? '').trim(),
      piezas: num(l.piezas),
    }))
    .filter(l => l.codigo && l.piezas > 0)

  if (!utiles.length) throw new Error('Un surtido sin piezas no es un surtido.')

  return {
    // La fecha va delante para que el folio ordene solo y se lea de un vistazo
    // en una conversación: «el surtido del 5 a León».
    folio: `${cuando.toISOString().slice(0, 10)}-${destino}-${String(cuando.getTime()).slice(-4)}`,
    destino,
    quien,
    cuando: cuando.toISOString(),
    lineas: utiles,
    // El «antes» de SÓLO los códigos que van en la caja. Guardar el inventario
    // entero por folio sería repetir el error que costó los 44 MB al año.
    antes: Object.fromEntries(utiles.map(l => [l.codigo, existencias[l.codigo] ?? 0])),
    cerrado: null,
  }
}

/**
 * Qué entró de verdad, leído del respaldo de la tienda.
 *
 * `vendidas` son las piezas que esa plaza vendió desde que salió la caja. Sin
 * ese término la cuenta sale corta y culpa a alguien de una pieza que
 * simplemente se vendió, así que cuando no se pasa, cada fila lo dice.
 */
export function cuadrar(folio, { inventarioDestino, vendidas = null, hoy = new Date() }) {
  const ahora = existenciasDe(inventarioDestino)
  const dias = Math.floor((hoy - new Date(folio.cuando)) / 86400000)

  const filas = folio.lineas.map(l => {
    const antes = num(folio.antes?.[l.codigo])
    const despues = ahora[l.codigo]
    // Un código que no aparece en el inventario de la tienda no es un cero: es
    // «no está dado de alta», que aquí es justo lo que se está mirando.
    const existe = despues !== undefined
    const vendio = vendidas ? num(vendidas[l.codigo]) : 0

    const entraron = existe ? (num(despues) - antes) + vendio : null
    return {
      ...l,
      antes,
      despues: existe ? num(despues) : null,
      vendidas: vendidas ? vendio : null,
      entraron,
      // Negativo = falta. Positivo = llegó de más, que también se mira: suele
      // ser una línea mal capturada, no un regalo.
      diferencia: entraron === null ? null : entraron - l.piezas,
      sinVender: !vendidas,
    }
  })

  const aparecio = filas.some(f => f.entraron !== null && f.entraron > 0)
  const conDiferencia = filas.filter(f => f.diferencia !== null && Math.abs(f.diferencia) > TOLERANCIA)

  let estado
  if (!aparecio) {
    estado = dias > DIAS_PARA_DAR_DE_ALTA ? ESTADOS.TARDE : ESTADOS.EN_CAMINO
  } else {
    estado = conDiferencia.length ? ESTADOS.DIFERENCIA : ESTADOS.CUADRA
  }

  return {
    folio: folio.folio,
    destino: folio.destino,
    cuando: folio.cuando,
    quien: folio.quien,
    cerrado: folio.cerrado ?? null,
    dias,
    estado,
    filas,
    piezasQueSalieron: folio.lineas.reduce((a, l) => a + l.piezas, 0),
    piezasQueEntraron: filas.reduce((a, f) => a + Math.max(0, f.entraron ?? 0), 0),
    faltan: conDiferencia.filter(f => f.diferencia < 0).reduce((a, f) => a - f.diferencia, 0),
    sobran: conDiferencia.filter(f => f.diferencia > 0).reduce((a, f) => a + f.diferencia, 0),
    conDiferencia,
  }
}

/**
 * Junta los folios de todos. Cada quien escribe su propio archivo, igual que
 * las revisiones y los ajustes: con uno compartido, dos personas registrando a
 * la vez se borrarían el folio sin avisar.
 */
export function juntarFolios(porQuien) {
  const out = {}
  for (const [quien, lista] of Object.entries(porQuien ?? {})) {
    for (const f of lista ?? []) {
      if (!f?.folio) continue
      const previo = out[f.folio]
      if (!previo || f.cuando > previo.cuando) out[f.folio] = { ...f, quien: f.quien ?? quien }
    }
  }
  return out
}

/**
 * El resumen de lo que hay abierto, para el contador del menú y el dashboard.
 *
 * Un folio CERRADO no se cuenta aunque tuviera diferencia: ya se miró y se
 * decidió. Lo que pesa aquí es lo que nadie ha visto todavía.
 */
export function resumirFolios(cuadres) {
  const vivos = (cuadres ?? []).filter(c => !c.cerrado)
  const de = e => vivos.filter(c => c.estado === e)
  return {
    enCamino: de(ESTADOS.EN_CAMINO).length,
    tarde: de(ESTADOS.TARDE).length,
    diferencia: de(ESTADOS.DIFERENCIA).length,
    piezasQueFaltan: de(ESTADOS.DIFERENCIA).reduce((a, c) => a + c.faltan, 0),
    total: vivos.length,
  }
}

/**
 * Las líneas de un surtido a partir de lo que ya calculó la pestaña.
 *
 * Se parte de lo CALCULADO y no de un formulario en blanco a propósito: lo que
 * se registra tiene que ser lo que se mandó, y teclear doscientos códigos a
 * mano es la forma más segura de que el registro no se llene nunca.
 *
 * `mandado` permite corregir pieza a pieza, porque bodega no siempre tiene
 * todo lo que la cuenta pide; un cero saca la línea del folio.
 */
export function lineasDesdeSurtido(filas, { mandado = null } = {}) {
  return (filas ?? [])
    .map(f => {
      const codigo = limpio(f.codigo)
      return {
        codigo,
        producto: f.producto,
        piezas: mandado && codigo in mandado ? num(mandado[codigo]) : num(f.sugerido),
      }
    })
    .filter(l => l.codigo && l.piezas > 0)
}
