// La depuración del catálogo: qué se puede dar de baja, qué está en
// liquidación y qué no se toca, con los candados que lo impiden.
//
// Lo pidió el dueño el 2026-11-09 y puso una regla por delante de todas:
//
//   «Queda estrictamente PROHIBIDO eliminar un SKU si tiene stock global > 0
//    o si registra ventas en los últimos 365 días.»
//
// Este archivo es donde esa regla vive en la página. El que manda es el
// backend —`backend/src/bajas.js`, con la misma cuenta escrita otra vez, a la
// fuerza, porque son dos paquetes— y hay pruebas que fijan las dos con los
// mismos casos. Aquí sirve para que la pantalla no ofrezca un botón que el
// servidor va a rechazar, y para decir POR QUÉ: un botón apagado sin motivo se
// lee como un fallo.
//
// ── Lo que ESTO NO PUEDE hacer ─────────────────────────────────────────────
//
// No borra nada de Eleventa. `inventario.json` se regenera desde el respaldo
// cuatro veces al día; lo que se escriba encima se borra esa misma tarde. Una
// «baja» es una decisión APUNTADA —va a `ajustes/`, igual que la ✕— más una
// lista de lo que cada tienda tiene que borrar en su caja, y se verifica sola
// cuando el código deja de salir en el respaldo.
//
// ── Cuatro cosas medidas el 2026-11-09 que cambian cómo se hace ────────────
//
// 1. **1,022 «obsoletos» eran 37.** De los códigos sin existencia y sin venta
//    en un año, 985 ya no están en ninguna caja: sólo viven en el historial
//    por mes, como nombres de lo que se vendió. No hay nada que dar de baja.
//    Se cuentan aparte y NO entran a la lista de bajas.
//
// 2. **La venta sale del kárdex, no del historial por mes.** El historial que
//    publica la sincronización sólo llega a octubre de 2025 en Aguascalientes
//    y San Luis, a enero de 2026 en León, y Torreón no tiene ninguno: con él
//    no se puede probar «dos años sin venta». Cada inventario trae ahora
//    `UltimaVenta`, la última vez que el kárdex registró una VENTA. No sirve
//    `UltimoMov`: cuenta los recuentos de inventario, y un ajuste hace parecer
//    reciente un modelo parado desde hace dos años.
//
// 3. **Un plaza sin su inventario no puede opinar.** Sin el de Torreón, una
//    pieza suya no se vería en el «stock global» y se propondría dar de baja
//    un código que tiene mercancía. Por eso, mientras falte el inventario de
//    cualquier plaza, NADA se puede dar de baja.
//
// 5. **Los stickers no son catálogo que depurar.** Bodega no los almacena, los
//    imprime cuando hacen falta (`produccion.js`): cada sticker con piezas en
//    una tienda salía como «modelo de salida», y uno en cero como «obsoleto».
//    Ni lo uno ni lo otro: se apartan de todas las listas.
//
// 4. **«Bodega en cero» no es «descontinuado».** De 186 modelos con bodega en
//    cero y piezas en las tiendas, 145 ni siquiera están en el catálogo de
//    bodega —eso es descontinuar—, pero 41 sí, y son faltantes normales que
//    se resurten. Se separan, o la lista de liquidación se llena de modelos
//    que hay que COMPRAR.

import { SUCURSALES, BODEGA } from './sucursales.js'
import { diasDesde } from './fechas.js'
import { DIAS_DESCONTINUADO } from './anomalias.js'
import { seProduce } from './produccion.js'

/**
 * 🔒 Días mínimos sin venta (y de antigüedad en el catálogo) para dar de baja.
 *
 * El dueño dijo «365–730 días». El PISO es 365 y no se baja de ahí en ningún
 * sitio; 730 es la opción más prudente y se elige en la pantalla. Lo que no
 * existe es un valor menor.
 */
export const DIAS_MINIMOS_PARA_BAJA = 365

/** Días sin venta de una lista de «sin rotación»: un año. */
export const DIAS_SIN_ROTACION = 365

/** 🔒 Una categoría entera sin movimiento: dos años, como pidió el dueño. */
export const DIAS_CATEGORIA_SIN_MOVIMIENTO = 730

/**
 * Todas las plazas donde puede haber mercancía, la vea o no un mayorista.
 *
 * Es `SUCURSALES` entera y no `SUCURSALES_ACTIVAS`: Torreón tiene
 * `activa: false` porque su página no está abierta, no porque no tenga
 * piezas. Una cuenta de «stock global» que se salte una plaza es la que
 * propone borrar lo que tiene mercancía.
 */
export const PLAZAS_CON_STOCK = SUCURSALES.map(s => s.slug)

const clave = c => String(c ?? '').trim().toUpperCase()
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

// ── Marca y categoría ──────────────────────────────────────────────────────

/** Nombres de marca que son la misma familia escrita de otra forma. */
const ALIAS = [
  [/^(GALAXY|SAMSUNG)$/,                'SAMSUNG'],
  [/^(IPHONE|APPLE)$/,                  'APPLE'],
  [/^(REDMI|POCO|POCCO|XIAOMI)$/,       'XIAOMI'],
  [/^(MOTO|MOTOROLA)$/,                 'MOTOROLA'],
  [/^(PIXEL|GOOGLE)$/,                  'GOOGLE'],
  [/^(ONE ?PLUS|ONEPLUS)$/,             'ONE PLUS'],
]

const sinAcentos = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Normaliza una marca o departamento: mayúsculas, sin acentos, con alias. */
export function normalizarMarca(texto) {
  const t = sinAcentos(texto).toUpperCase().replace(/\s+/g, ' ').trim()
  if (!t) return ''
  for (const [re, marca] of ALIAS) if (re.test(t)) return marca
  return t
}

/**
 * La marca de un producto, leída de su nombre.
 *
 * Existe porque el departamento no siempre viaja —el inventario público no lo
 * traía hasta la sincronización del 2026-11-09— y para tener una respuesta
 * antes de que llegue. Cuando viaja, manda `categoriaDe`.
 */
export function marcaDe(nombre) {
  const t = sinAcentos(nombre).toUpperCase().replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const doble = /^(ONE ?PLUS)\b/.exec(t)
  if (doble) return 'ONE PLUS'
  return normalizarMarca(t.split(' ')[0])
}

/**
 * La categoría de un código para depurar: su departamento de Eleventa y, si no
 * lo trae, la marca que dice su nombre. Samsung sale en dos departamentos
 * —«GALAXY» y «SAMSUNG»— según la plaza, y son lo mismo.
 */
export function categoriaDe({ departamento, producto }) {
  return normalizarMarca(departamento) || marcaDe(producto) || 'SIN CATEGORÍA'
}

// ── El catálogo de toda la red ─────────────────────────────────────────────

/** Último día de un mes `AAAA-MM`. Una venta de ese mes pudo ser cualquier día. */
function finDeMes(periodo) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(periodo ?? ''))
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]), 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Para cada código de una plaza, el último mes con salidas de su historial. */
function ultimoMesPorCodigo(historial) {
  const out = new Map()
  for (const per of historial?.periodos ?? []) {
    for (const [c, n] of Object.entries(per.m ?? {})) {
      if (!num(n)) continue
      const k = clave(c)
      if (!out.has(k) || per.p > out.get(k)) out.set(k, per.p)
    }
  }
  return out
}

/**
 * Junta los inventarios de todas las plazas en un renglón por código.
 *
 * `inventarios` y `historiales` son `{ slug: json | null }`. `descontinuados`
 * es el conjunto de códigos que el dueño marcó como descontinuados en bodega.
 *
 * Lo que devuelve, además de los renglones:
 *
 *   · `plazasSinInventario` — plazas que deberían tener y no tienen. Mientras
 *     haya alguna, `inventarioCompleto` es falso y no se puede dar de baja
 *     nada: un stock global al que le falta una plaza es una cifra falsa que
 *     no se distingue de una buena.
 *   · `soloEnHistorial` — códigos con venta registrada que ya no están en
 *     ninguna caja. Se cuentan para que se vea de dónde salía el número
 *     inflado, y no entran a ninguna lista.
 */
export function reunirCatalogo({
  inventarios = {}, historiales = {}, descontinuados = new Set(), hoy = new Date(),
} = {}) {
  const hay = slug => Array.isArray(inventarios?.[slug]?.productos) && inventarios[slug].productos.length > 0
  const plazasSinInventario = PLAZAS_CON_STOCK.filter(s => !hay(s))

  // ¿La plaza publica la última venta? Si ni un producto la trae, es un
  // inventario de antes de esta función, y de esa plaza no se puede probar
  // que algo NO se vendió.
  const publicaVenta = {}
  const mesesDe = {}
  for (const slug of PLAZAS_CON_STOCK) {
    publicaVenta[slug] = hay(slug) && inventarios[slug].productos.some(p => p.UltimaVenta)
    mesesDe[slug] = ultimoMesPorCodigo(historiales?.[slug])
  }

  const filas = new Map()
  for (const slug of PLAZAS_CON_STOCK) {
    if (!hay(slug)) continue
    for (const p of inventarios[slug].productos) {
      const k = clave(p.Codigo)
      if (!k) continue
      let f = filas.get(k)
      if (!f) {
        f = {
          codigo: String(p.Codigo).trim(), producto: p.Producto ?? '', departamento: null,
          stock: {}, ultimoMov: {}, altas: [], ventasPublicadas: {},
        }
        filas.set(k, f)
      }
      // El nombre de bodega manda: es el catálogo maestro.
      if (slug === BODEGA.slug && p.Producto) f.producto = p.Producto
      if (!f.departamento && p.Departamento) f.departamento = p.Departamento
      f.stock[slug] = num(p.Existencia)
      if (p.UltimoMov) f.ultimoMov[slug] = String(p.UltimoMov).slice(0, 10)
      if (p.Alta) f.altas.push(String(p.Alta).slice(0, 10))
      if (p.UltimaVenta) f.ventasPublicadas[slug] = String(p.UltimaVenta).slice(0, 10)
    }
  }

  const out = []
  for (const [k, f] of filas) {
    const plazasQueLoTienen = Object.keys(f.stock)

    // La última venta de la red. Por plaza: si esa plaza tiene el código y
    // publica la última venta, esa fecha es EXACTA; si no, se cae al último
    // mes con salidas de su historial, que es aproximado —se toma el fin de
    // mes, el día más tardío posible— y sólo puede BLOQUEAR, nunca liberar.
    let ultimaVenta = null
    let exacta = true
    for (const slug of PLAZAS_CON_STOCK) {
      let cand = null
      if (slug in f.stock && publicaVenta[slug]) {
        cand = f.ventasPublicadas[slug] ?? null
      } else {
        const mes = mesesDe[slug].get(k)
        cand = mes ? finDeMes(mes) : null
        if (slug in f.stock) exacta = false
      }
      if (cand && (!ultimaVenta || cand > ultimaVenta)) ultimaVenta = cand
    }

    const stockGlobal = Object.values(f.stock).reduce((a, b) => a + b, 0)
    const stockBodega = f.stock[BODEGA.slug] ?? 0
    const enBodega = BODEGA.slug in f.stock
    const alta = f.altas.length ? f.altas.reduce((a, b) => (b < a ? b : a)) : null

    // Cuánto lleva en cero en bodega: el último movimiento de un producto en
    // cero es cuándo se acabó (o un recuento posterior, que sólo puede hacerlo
    // parecer más reciente: se erra hacia «todavía se puede resurtir»).
    const diasEnCeroBodega = enBodega && stockBodega === 0 && f.ultimoMov[BODEGA.slug]
      ? diasDesde(f.ultimoMov[BODEGA.slug], hoy) : null

    out.push({
      codigo: f.codigo,
      producto: f.producto,
      departamento: f.departamento,
      categoria: categoriaDe({ departamento: f.departamento, producto: f.producto }),
      stock: f.stock,
      stockGlobal,
      stockBodega,
      stockTiendas: stockGlobal - stockBodega,
      enBodega,
      existeEnCaja: plazasQueLoTienen.length > 0,
      // Lo que bodega fabrica en vez de almacenar: nunca entra a una lista.
      produce: seProduce(f.codigo, f.producto),
      plazas: plazasQueLoTienen,
      alta,
      diasEnCatalogo: alta ? diasDesde(alta, hoy) : null,
      ultimaVenta,
      diasSinVender: ultimaVenta ? diasDesde(ultimaVenta, hoy) : null,
      ventaExacta: exacta,
      diasEnCeroBodega,
      descontinuado: descontinuados.has(k),
    })
  }

  // Lo que sólo vive en el historial: se cuenta, y nada más.
  let soloEnHistorial = 0
  const vistos = new Set(filas.keys())
  const soloHist = new Set()
  for (const slug of PLAZAS_CON_STOCK) {
    for (const k of mesesDe[slug].keys()) if (!vistos.has(k)) soloHist.add(k)
  }
  soloEnHistorial = soloHist.size

  return {
    filas: out,
    plazasSinInventario,
    inventarioCompleto: plazasSinInventario.length === 0,
    plazasSinVenta: PLAZAS_CON_STOCK.filter(s => hay(s) && !publicaVenta[s]),
    soloEnHistorial,
  }
}

// ── Los candados ───────────────────────────────────────────────────────────

/** Lista un texto de plazas: «León, San Luis y Torreón». */
const nombresDe = slugs => {
  const n = slugs.map(s => SUCURSALES.find(x => x.slug === s)?.nombre ?? s)
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`
}

/** ¿Pasó más de `dias` desde su última venta, o nunca se vendió? */
export const sinVentaEn = (f, dias) => f.diasSinVender === null || f.diasSinVender > dias

/**
 * Por qué un código NO se puede dar de baja. Lista vacía = se puede.
 *
 * Cada motivo se dice con palabras, porque un botón apagado sin razón se lee
 * como un fallo de la página. Y el orden es el de la gravedad: lo primero que
 * sale es lo que no se arregla con tiempo.
 *
 * `dias` no baja nunca de `DIAS_MINIMOS_PARA_BAJA`, pase lo que pase.
 */
export function razonesDeBloqueo(f, { dias = DIAS_MINIMOS_PARA_BAJA, plazasSinInventario = [], plazasSinVenta = [] } = {}) {
  const piso = Math.max(DIAS_MINIMOS_PARA_BAJA, Number(dias) || 0)
  const razones = []

  if (plazasSinInventario.length) {
    razones.push(`falta el inventario de ${nombresDe(plazasSinInventario)}: su existencia no se ve en el stock global`)
  }
  if (!f.existeEnCaja) {
    razones.push('ya no existe en ninguna caja: no hay nada que dar de baja')
  }
  if (f.stockGlobal > 0) {
    razones.push(`tiene ${f.stockGlobal} ${f.stockGlobal === 1 ? 'pieza' : 'piezas'} en la red`)
  }
  if (f.diasSinVender !== null && f.diasSinVender <= piso) {
    razones.push(`se vendió hace ${f.diasSinVender} ${f.diasSinVender === 1 ? 'día' : 'días'} y se piden más de ${piso}`)
  }
  // La antigüedad es la prueba de que «no vende» significa algo: un código de
  // hace tres meses sin ventas no es un código muerto, es uno que acaba de
  // llegar. `Alta` es una cota inferior —el primer movimiento—, así que si ya
  // pasó el año, ahí hay prueba de sobra.
  if (f.diasEnCatalogo === null || f.diasEnCatalogo < piso) {
    razones.push(f.diasEnCatalogo === null
      ? 'no se sabe desde cuándo existe: no se puede afirmar que no vende'
      : `lleva ${f.diasEnCatalogo} días en el catálogo y se piden ${piso}: no se puede afirmar que no vende`)
  }
  if (!f.ventaExacta || plazasSinVenta.some(s => f.plazas.includes(s))) {
    const cuales = plazasSinVenta.filter(s => f.plazas.includes(s))
    razones.push(cuales.length
      ? `${nombresDe(cuales)} todavía no publica su última venta: se llena con la próxima sincronización`
      : 'falta la última venta exacta de alguna plaza que lo tiene')
  }
  return razones
}

// ── Las cuatro listas ──────────────────────────────────────────────────────

/**
 * 1. Modelos de salida: bodega no tiene y las tiendas todavía venden lo que queda.
 *
 * Es la definición del dueño —stock de bodega en cero y de las tiendas por
 * encima— pero separada por lo que de verdad significa, porque no es una sola
 * cosa:
 *
 *   · `sin-alta`          bodega ni siquiera lo tiene en su catálogo: lo
 *                         descontinuó. Es la liquidación.
 *   · `agotado-largo`     bodega lo tiene en cero desde hace `DIAS_DESCONTINUADO`
 *                         días o más: casi seguro nadie lo está resurtiendo.
 *   · `agotado-reciente`  bodega lo tiene en cero desde hace poco: es un
 *                         faltante normal, hay que COMPRAR, no liquidar.
 *
 * Mezclarlos llenaba la lista de modelos que hay que pedir al proveedor.
 */
export function modelosDeSalida(filas) {
  return (filas ?? [])
    .filter(f => !f.produce && f.existeEnCaja && f.stockBodega === 0 && f.stockTiendas > 0)
    .map(f => ({
      ...f,
      razon: !f.enBodega ? 'sin-alta'
        : (f.diasEnCeroBodega !== null && f.diasEnCeroBodega >= DIAS_DESCONTINUADO) ? 'agotado-largo'
        : 'agotado-reciente',
    }))
    .sort((a, b) => b.stockTiendas - a.stockTiendas || a.codigo.localeCompare(b.codigo))
}

/**
 * 2. Sin rotación: hay piezas y no se ha vendido ni una en `dias`.
 *
 * `probado` dice si hay con qué afirmarlo: un código que lleva menos de `dias`
 * en el catálogo no ha tenido tiempo de venderse. Esos no se ocultan —se ven
 * aparte— pero tampoco se cuentan como «sin rotación».
 */
export function sinRotacion(filas, dias = DIAS_SIN_ROTACION) {
  return (filas ?? [])
    .filter(f => !f.produce && f.stockGlobal > 0 && sinVentaEn(f, dias))
    .map(f => ({ ...f, probado: f.diasEnCatalogo !== null && f.diasEnCatalogo >= dias }))
    .sort((a, b) => b.stockGlobal - a.stockGlobal || a.codigo.localeCompare(b.codigo))
}

/**
 * 3. Obsoletos en ceros: sin piezas en la red y sin venta en `dias`.
 *
 * Es la definición del dueño: sin piezas en toda la red y la última venta de
 * hace más de `dias` (365 o 730; nunca menos de 365).
 *
 * Trae TODOS los que la cumplen, con `bloqueos` —lo que todavía impide darlos
 * de baja— y `puede`. Lo que impide casi nunca es la venta: es que falta el
 * inventario de una plaza, o que el código lleva menos de un año en el
 * catálogo, y eso se tiene que ver para saber qué hace falta.
 */
export function obsoletosEnCeros(filas, { dias = DIAS_MINIMOS_PARA_BAJA, plazasSinInventario = [], plazasSinVenta = [] } = {}) {
  return (filas ?? [])
    .filter(f => !f.produce && f.existeEnCaja && f.stockGlobal === 0 && sinVentaEn(f, Math.max(DIAS_MINIMOS_PARA_BAJA, Number(dias) || 0)))
    .map(f => {
      const bloqueos = razonesDeBloqueo(f, { dias, plazasSinInventario, plazasSinVenta })
      return { ...f, bloqueos, puede: bloqueos.length === 0 }
    })
    .sort((a, b) => Number(b.puede) - Number(a.puede)
      || (b.diasSinVender ?? 1e9) - (a.diasSinVender ?? 1e9)
      || a.codigo.localeCompare(b.codigo))
}

/**
 * 4. Por marca o departamento: categorías enteras sin movimiento.
 *
 * Una categoría se puede dar de baja COMPLETA sólo si cada uno de sus códigos
 * pasa el candado. Basta una pieza o una venta reciente para que no: «sin
 * movimiento en dos años» no admite un «casi».
 */
export function porCategoria(filas, { dias = DIAS_CATEGORIA_SIN_MOVIMIENTO, plazasSinInventario = [], plazasSinVenta = [], hoy = new Date() } = {}) {
  const grupos = new Map()
  for (const f of filas ?? []) {
    if (f.produce || !f.existeEnCaja) continue
    if (!grupos.has(f.categoria)) grupos.set(f.categoria, [])
    grupos.get(f.categoria).push(f)
  }

  const out = []
  for (const [categoria, codigos] of grupos) {
    const evaluados = codigos.map(f => ({
      f, bloqueos: razonesDeBloqueo(f, { dias, plazasSinInventario, plazasSinVenta }),
    }))
    const libres = evaluados.filter(e => e.bloqueos.length === 0)
    const ventas = codigos.map(f => f.ultimaVenta).filter(Boolean).sort()
    out.push({
      categoria,
      codigos: codigos.length,
      stock: codigos.reduce((a, f) => a + f.stockGlobal, 0),
      conStock: codigos.filter(f => f.stockGlobal > 0).length,
      ultimaVenta: ventas.length ? ventas[ventas.length - 1] : null,
      diasSinVender: ventas.length ? diasDesde(ventas[ventas.length - 1], hoy) : null,
      conVentaReciente: codigos.filter(f => f.diasSinVender !== null && f.diasSinVender <= Math.max(DIAS_MINIMOS_PARA_BAJA, dias)).length,
      libres: libres.length,
      // Entera: todos pasan. Una categoría vacía no es «completa».
      completa: codigos.length > 0 && libres.length === codigos.length,
      codigosLista: codigos,
      bloqueados: evaluados.filter(e => e.bloqueos.length).map(e => ({ ...e.f, bloqueos: e.bloqueos })),
    })
  }
  return out.sort((a, b) => Number(b.completa) - Number(a.completa)
    || (b.diasSinVender ?? 1e9) - (a.diasSinVender ?? 1e9)
    || a.categoria.localeCompare(b.categoria))
}

/** Las cuentas de la cabecera, de una vez. */
export function resumirDepuracion({ filas, plazasSinInventario = [], plazasSinVenta = [] }) {
  const salida = modelosDeSalida(filas)
  const rot = sinRotacion(filas)
  const obs = obsoletosEnCeros(filas, { plazasSinInventario, plazasSinVenta })
  return {
    salida: salida.length,
    salidaMarcados: salida.filter(f => f.descontinuado).length,
    sinRotacion: rot.filter(f => f.probado).length,
    sinRotacionPiezas: rot.filter(f => f.probado).reduce((a, f) => a + f.stockGlobal, 0),
    obsoletos: obs.length,
    obsoletosListos: obs.filter(f => f.puede).length,
  }
}
