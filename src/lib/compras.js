// Qué comprar para bodega.
//
// Esto no es lo mismo que el surtido a sucursales. Ahí se reparte lo que ya
// hay; aquí se decide qué pedirle al proveedor para que la bodega aguante los
// próximos meses.
//
// La referencia es la misma ventana de meses del año pasado, porque la demanda
// es estacional y comparar contra el mes pasado no dice nada sobre diciembre.
//
// Con una regla encima, y conviene decir bien cuál es, porque la primera
// versión la tenía al revés: una funda no sirve para otro teléfono. La demanda
// del Galaxy A06 NO se cubre comprando A07; quien trae un A06 necesita funda de
// A06. Transferir la demanda hacía que 136 códigos dejaran de comprarse, y 125
// de ellos habían vendido en los últimos seis meses: 1,720 piezas, con el
// iPhone 13 a la cabeza.
//
// La generación anterior sirve para una sola cosa, y es predecir: un modelo
// recién llegado no tiene historial propio, y lo que vendió el que sustituye es
// la mejor pista de cuánto va a venderse. Una generación hacia atrás, no todas
// sumadas.

import { diasDePeriodo } from './estadisticas.js'
import { esTemporadaAlta, MESES_ALTA, mapaDeAltas, diasEnCatalogo } from './surtido.js'
import { seProduce } from './produccion.js'

/** Meses que debe aguantar la bodega. En temporada alta, uno más. */
export const MESES_COBERTURA = { normal: 2, alta: 3 }

/**
 * Parte un código en prefijo, número de modelo y sufijo de tipo de funda.
 *   SGA06T  →  { pre: 'SGA', num: '06', suf: 'T' }
 *   I15PMT  →  { pre: 'I',   num: '15', suf: 'PMT' }
 */
function partirCodigo(codigo) {
  const m = /^([A-Z]+?)(\d+)([A-Z0-9]*)$/.exec(String(codigo || '').toUpperCase())
  return m ? { pre: m[1], num: m[2], suf: m[3] } : null
}

/**
 * Dos modelos son la misma línea si solo cambian en el ÚLTIMO dígito del
 * número. A06 y A07 sí; A06 y A56 no, porque ese 5 es la gama y no la
 * generación.
 */
const familiaDe = p => `${p.pre}|${p.num.slice(0, -1)}|${p.suf}`

/**
 * Qué modelo sustituye a cuál, deducido del catálogo.
 *
 * Sólo la última generación de cada familia y la inmediatamente anterior: el
 * iPhone 17 sustituye al 16, y nada más. Antes mapeaba TODAS las anteriores al
 * último, así que el 17 cargaba con la demanda del 11, 12, 13, 14, 15 y 16
 * juntas —212 piezas sugeridas— mientras esos seis quedaban en cero.
 *
 * No se inventa la aritmética de cada marca, que varía y se equivoca: sólo se
 * mapea cuando la generación nueva EXISTE de verdad en el catálogo y entró
 * después, según la fecha de alta.
 *
 * Esto YA NO mueve demanda de un código a otro. Sirve para saber que un modelo
 * tiene relevo, que es distinto.
 */
export function mapaGeneraciones(productos) {
  const porFamilia = new Map()

  for (const p of productos ?? []) {
    const codigo = String(p.Codigo ?? '').trim()
    const partes = partirCodigo(codigo)
    // Un número de un solo dígito no tiene "último dígito" que separar de la
    // gama, así que esos quedan fuera.
    if (!partes || partes.num.length < 2) continue

    const f = familiaDe(partes)
    if (!porFamilia.has(f)) porFamilia.set(f, [])
    porFamilia.get(f).push({
      codigo,
      producto: String(p.Producto ?? '').trim(),
      num: partes.num,
      alta: p.Alta ?? null,
    })
  }

  const mapa = {}
  const cambios = []

  for (const lista of porFamilia.values()) {
    if (lista.length < 2) continue
    const ord = lista.slice().sort((a, b) => a.num.localeCompare(b.num))
    const nueva = ord[ord.length - 1]
    const previa = ord[ord.length - 2]

    // La fecha de alta tiene que confirmarlo. Sin ella no se mapea: es
    // preferible no opinar que deducir un relevo de la numeración sola.
    if (!previa.alta || !nueva.alta || nueva.alta <= previa.alta) continue
    mapa[previa.codigo] = nueva.codigo
    cambios.push({ de: previa.codigo, deNombre: previa.producto, a: nueva.codigo, aNombre: nueva.producto })
  }

  return { mapa, cambios }
}

/**
 * De cada modelo, la generación inmediatamente anterior que exista.
 *
 * Sirve para lo contrario que el mapa de relevo: cuando un modelo es tan nuevo
 * que no tiene historial propio, lo que vendió su generación anterior es la
 * única pista razonable de cuánto va a venderse. Es justo donde más se falla,
 * porque un modelo recién llegado se agota sin que nadie lo haya previsto.
 */
export function mapaGeneracionAnterior(productos) {
  const porFamilia = new Map()
  for (const p of productos ?? []) {
    const codigo = String(p.Codigo ?? '').trim()
    const partes = partirCodigo(codigo)
    if (!partes || partes.num.length < 2) continue
    const f = familiaDe(partes)
    if (!porFamilia.has(f)) porFamilia.set(f, [])
    porFamilia.get(f).push({ codigo, num: partes.num, producto: String(p.Producto ?? '').trim() })
  }

  const anterior = {}
  for (const lista of porFamilia.values()) {
    const ord = lista.slice().sort((a, b) => a.num.localeCompare(b.num))
    for (let i = 1; i < ord.length; i++) anterior[ord[i].codigo] = ord[i - 1].codigo
  }
  return anterior
}

/** Los n meses que siguen al de hoy, el actual incluido. */
export function mesesSiguientes(n, hoy = new Date()) {
  const salida = []
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth() + i, 1))
    salida.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return salida
}

/** Los mismos meses, un año antes. */
export const unAnioAntes = meses =>
  meses.map(m => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`)

/** Piezas vendidas por código en unos meses, sumando todas las sucursales. */
function demandaDe(historiales, meses) {
  const dentro = new Set(meses)
  const piezas = {}
  const catalogo = {}
  const cubiertos = new Set()
  // Días medidos de cada mes. Se toma el máximo entre plazas y no la suma:
  // cuatro sucursales midiendo el mismo septiembre son 30 días de calendario,
  // no 120. Sin esto el ritmo diario sale dividido entre un número inventado.
  const diasPorMes = {}

  for (const h of (historiales ?? []).filter(Boolean)) {
    Object.assign(catalogo, h.catalogo ?? {})
    for (const p of h.periodos ?? []) {
      const dias = diasDePeriodo(p)
      if (!dentro.has(p.p) || dias <= 0) continue
      cubiertos.add(p.p)
      diasPorMes[p.p] = Math.max(diasPorMes[p.p] ?? 0, dias)
      for (const [k, n] of Object.entries(p.m ?? {})) piezas[k] = (piezas[k] || 0) + n
    }
  }

  return {
    piezas,
    catalogo,
    cubiertos: [...cubiertos].sort(),
    dias: Object.values(diasPorMes).reduce((a, b) => a + b, 0),
  }
}

/**
 * Qué comprar.
 *
 * `historiales` son los de TODAS las sucursales, ferias incluida: la compra se
 * hace para el negocio entero, no para una plaza.
 */
export function calcularCompras({ historiales, productosBodega, hoy = new Date(), margen = 0 }) {
  // La temporada que cuenta es la del periodo QUE SE COMPRA, no la de hoy.
  // Comprando en octubre para noviembre y diciembre hay que cubrir temporada
  // alta, aunque octubre sea un mes normal; mirar el mes actual dejaba el
  // pedido corto justo antes del Buen Fin.
  const dosMeses = mesesSiguientes(MESES_COBERTURA.normal, hoy)
  const alta = dosMeses.some(m => MESES_ALTA.includes(Number(m.slice(5))))
  const nMeses = alta ? MESES_COBERTURA.alta : MESES_COBERTURA.normal

  const objetivo = mesesSiguientes(nMeses, hoy)
  const referencia = unAnioAntes(objetivo)

  const { mapa, cambios } = mapaGeneraciones(productosBodega)
  const { piezas, catalogo, cubiertos, dias } = demandaDe(historiales, referencia)

  // Cuánto de la referencia aporta cada plaza. Hace falta decirlo: León
  // empezó a medirse en enero de 2026, así que para octubre-diciembre de 2025
  // no aporta un solo dato y la compra sale calculada con tres plazas de
  // cuatro. El aviso de «meses faltantes» no lo veía, porque basta que UNA
  // plaza tenga el mes para darlo por cubierto.
  const cobertura = (historiales ?? []).filter(Boolean).map(h => {
    const suyos = (h.periodos ?? []).filter(p => referencia.includes(p.p) && diasDePeriodo(p) > 0)
    return {
      plaza: h.sucursal ?? h.slug ?? '?',
      meses: suyos.map(p => p.p).sort(),
      piezas: suyos.reduce((a, p) => a + Object.values(p.m ?? {}).reduce((x, y) => x + y, 0), 0),
    }
  })
  const sinAportar = cobertura.filter(c => c.meses.length === 0).map(c => c.plaza)

  // Cada código conserva su propia demanda. Transferirla a la generación
  // siguiente dejaba sin comprar cosas que se venden todos los días: una funda
  // de iPhone 13 no se sustituye con una de iPhone 17.
  const demanda = { ...piezas }

  const enBodega = {}
  const nombres = {}
  for (const p of productosBodega ?? []) {
    const c = String(p.Codigo ?? '').trim()
    if (!c) continue
    enBodega[c] = Number(p.Existencia) || 0
    nombres[c] = String(p.Producto ?? '').trim()
  }

  const filas = Object.entries(demanda)
    .map(([codigo, esperado]) => {
      const objetivoPz = esperado * (1 + margen)
      const existencia = enBodega[codigo] ?? 0
      return {
        codigo,
        producto: nombres[codigo] || catalogo[codigo] || codigo,
        esperado,
        existencia,
        // Un código con demanda que bodega ni siquiera maneja hay que darlo de
        // alta antes de poder comprarlo, y conviene que se note.
        enCatalogo: codigo in enBodega,
        sugerido: Math.max(0, Math.ceil(objetivoPz - existencia)),
      }
    })
    .filter(f => f.esperado > 0)
    .sort((a, b) => b.sugerido - a.sugerido || b.esperado - a.esperado)

  // Modelos que ya tienen relevo en el catálogo. Se siguen comprando —sus
  // clientes existen— pero conviene verlos juntos: es donde tiene sentido
  // moderar el pedido si se nota que la venta va cayendo.
  const conRelevo = Object.entries(piezas)
    .filter(([c]) => mapa[c])
    .map(([c, n]) => ({
      codigo: c,
      producto: nombres[c] || catalogo[c] || c,
      piezas: n,
      sustituto: mapa[c],
      sustitutoNombre: nombres[mapa[c]] || catalogo[mapa[c]] || mapa[c],
      existencia: enBodega[c] ?? 0,
    }))
    .sort((a, b) => b.piezas - a.piezas)

  return {
    filas,
    conRelevo,
    cambios,
    objetivo,
    referencia,
    cubiertos,
    dias,
    cobertura,
    sinAportar,
    mapa,
    // Meses de la referencia para los que no hay dato en ninguna sucursal.
    faltantes: referencia.filter(m => !cubiertos.includes(m)),
    nMeses,
    alta,
    totalPiezas: filas.reduce((a, f) => a + f.sugerido, 0),
  }
}

// ── Agotados que cuestan ventas ──────────────────────────────────────────────
//
// Un modelo en cero no siempre es un problema: si es de una generación que ya
// salió del mercado, está bien que se acabe. Lo que hay que cazar es lo otro:
// algo que se vende, que sigue vigente, y que está en cero en varias plazas.
// Eso no es inventario agotándose, es una venta rechazada cada vez que alguien
// lo pide.
//
// La gravedad no sale de una fórmula con pesos inventados, sino de QUÉ hay que
// hacer para arreglarlo, que es lo que de verdad cambia la decisión:
//
//   reparto  — las tiendas en cero pero bodega tiene. Se arregla hoy, enviando.
//   compra   — tiendas y bodega en cero. Hay que pedirle al proveedor.
//   normal   — está en cero pero ya hay generación nueva. No es un descuido.

// Ventana para decidir si un modelo "se vende" hoy. Con todo el historial, la
// lista se llenaba de SAMSUNG NOTE 10 y IPHONE XS MAX: vendieron bien hace
// años, llevan 600 días agotados y nadie los ha repuesto porque ya no se
// piden. Eso no es un descuido, es un producto descontinuado.
export const MESES_RECIENTES = 6

export const ESTADO_AGOTADO = {
  REPARTO: 'reparto',
  COMPRA:  'compra',
  NORMAL:  'normal',
}

/** Días entre una fecha ISO y hoy, o null si no se sabe. */
export function diasDesde(fecha, hoy = new Date()) {
  if (!fecha) return null
  const [a, m, d] = String(fecha).split('-').map(Number)
  if (!a || !m || !d) return null
  return Math.max(0, Math.floor((hoy - new Date(a, m - 1, d)) / 86400000))
}

/**
 * Modelos agotados en las tiendas, con cuánto llevan así y si eso está
 * costando ventas.
 *
 * `inventarios` es { slug: json } de las plazas que venden a mostrador.
 */
export function analizarAgotados({ inventarios, historiales, productosBodega, hoy = new Date() }) {
  const { mapa } = mapaGeneraciones(productosBodega)

  // Dos ventanas: todo el historial para tener contexto, y los últimos meses
  // para decidir si de verdad se sigue pidiendo.
  const corte = new Date(hoy)
  corte.setMonth(corte.getMonth() - MESES_RECIENTES)
  const desde = `${corte.getFullYear()}-${String(corte.getMonth() + 1).padStart(2, '0')}`

  const vendidas = {}
  const recientes = {}
  const catalogo = {}
  for (const h of (historiales ?? []).filter(Boolean)) {
    Object.assign(catalogo, h.catalogo ?? {})
    for (const p of h.periodos ?? []) {
      const esReciente = p.p >= desde
      for (const [k, n] of Object.entries(p.m ?? {})) {
        vendidas[k] = (vendidas[k] || 0) + n
        if (esReciente) recientes[k] = (recientes[k] || 0) + n
      }
    }
  }

  const enBodega = {}
  const bodegaUltimo = {}
  const nombres = {}
  for (const p of productosBodega ?? []) {
    const c = String(p.Codigo ?? '').trim()
    if (!c) continue
    enBodega[c] = Number(p.Existencia) || 0
    bodegaUltimo[c] = p.UltimoMov ?? null
    nombres[c] = String(p.Producto ?? '').trim()
  }

  const porCodigo = new Map()
  for (const [slug, inv] of Object.entries(inventarios ?? {})) {
    for (const p of inv?.productos ?? []) {
      const c = String(p.Codigo ?? '').trim()
      if (!c) continue
      const e = porCodigo.get(c) ?? {
        codigo: c, producto: String(p.Producto ?? '').trim(),
        enCero: [], conStock: [], total: 0,
      }
      const n = Number(p.Existencia) || 0
      e.total += n
      if (n <= 0) e.enCero.push({ slug, dias: diasDesde(p.UltimoMov, hoy) })
      else e.conStock.push(slug)
      porCodigo.set(c, e)
    }
  }

  const filas = []
  for (const e of porCodigo.values()) {
    if (e.enCero.length === 0) continue

    // Lo que bodega fabrica no se compra: nunca está "agotado".
    if (seProduce(e.codigo, e.producto)) continue

    const vendio = vendidas[e.codigo] ?? 0
    const vendioReciente = recientes[e.codigo] ?? 0
    // Lo que no se ha pedido en los últimos meses no está costando ventas
    // aunque esté en cero: ya no lo buscan.
    if (vendioReciente === 0) continue

    const sucesor = mapa[e.codigo] ?? null
    const bodega = enBodega[e.codigo] ?? 0
    const existeEnBodega = e.codigo in enBodega

    // De las plazas que lo tienen en cero, la que lleva más tiempo así.
    const dias = e.enCero.map(x => x.dias).filter(d => d !== null)
    const diasAgotado = dias.length ? Math.max(...dias) : null

    const estado = sucesor ? ESTADO_AGOTADO.NORMAL
      : bodega > 0        ? ESTADO_AGOTADO.REPARTO
      : ESTADO_AGOTADO.COMPRA

    filas.push({
      codigo: e.codigo,
      producto: e.producto || nombres[e.codigo] || catalogo[e.codigo] || e.codigo,
      enCero: e.enCero.map(x => x.slug),
      plazasEnCero: e.enCero.length,
      plazasConStock: e.conStock.length,
      diasAgotado,
      vendio,
      vendioReciente,
      bodega,
      existeEnBodega,
      bodegaDias: bodega <= 0 ? diasDesde(bodegaUltimo[e.codigo], hoy) : null,
      sucesor,
      sucesorNombre: sucesor ? (nombres[sucesor] || catalogo[sucesor] || sucesor) : null,
      estado,
    })
  }

  // Primero lo que se arregla comprando y lleva más tiempo doliendo, luego lo
  // que solo hay que repartir, y al final lo que tiene relevo.
  const orden = { [ESTADO_AGOTADO.COMPRA]: 0, [ESTADO_AGOTADO.REPARTO]: 1, [ESTADO_AGOTADO.NORMAL]: 2 }
  filas.sort((a, b) =>
    orden[a.estado] - orden[b.estado] ||
    b.vendioReciente - a.vendioReciente ||
    b.plazasEnCero - a.plazasEnCero)

  return {
    filas,
    desde,
    compra:  filas.filter(f => f.estado === ESTADO_AGOTADO.COMPRA),
    reparto: filas.filter(f => f.estado === ESTADO_AGOTADO.REPARTO),
    normal:  filas.filter(f => f.estado === ESTADO_AGOTADO.NORMAL),
  }
}

// ── Compra de bodega, todo en una tabla ──────────────────────────────────────

/**
 * Los últimos n meses, el actual incluido.
 *
 * El mes en curso entra a propósito —es la señal más fresca de qué se está
 * vendiendo— pero va a medias, así que el ritmo tiene que dividirse entre los
 * días realmente medidos y no entre los del calendario. Eso lo resuelve
 * `demandaDe`, que devuelve los días.
 */
function mesesAtras(n, hoy) {
  const salida = []
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth() - i, 1))
    salida.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return salida
}

/**
 * Se considera que un modelo se está agotando antes de lo previsto cuando su
 * ritmo reciente supera al de referencia por este margen. Por debajo es ruido.
 */
const SE_ADELANTA = 1.4

/**
 * Y por debajo de estas piezas en la ventana no se marca nada.
 *
 * Sin este minimo la señal salta con ruido: "va a 0.03 piezas al dia contra
 * 0.02 esperadas" es una pieza de diferencia en dos meses, no una tendencia.
 */
const MINIMO_PARA_MARCAR = 4

/** Meses dentro de los cuales un modelo cuenta como recién llegado. */
export const MESES_NUEVO = 12

/** True si el modelo entró hace poco y lo sabemos con una fecha real. */
function esNuevo(codigo, altas, hoy) {
  const a = altas[codigo]
  if (!a || a.piso) return false
  const d = diasEnCatalogo(a.alta, hoy)
  return d !== null && d <= MESES_NUEVO * 30
}

/**
 * La tabla de compra para bodega, con todo lo que hace falta para decidir en
 * un solo renglón: lo que hay, lo que se vendió, lo que se sugiere comprar, en
 * cuántas plazas está agotado y desde cuándo.
 *
 * Dos cosas que no salen de la cuenta normal:
 *
 * Un modelo recién llegado no tiene historial propio, así que el cálculo lo
 * daría por cero y nadie lo compraría hasta que ya se hubiera agotado. Para
 * esos se usa lo que vendió su generación anterior, que es la única pista
 * razonable, y se dice en las observaciones.
 *
 * Y se marca lo que se está agotando MÁS RÁPIDO de lo que la referencia
 * predecía. Ahí es donde el cálculo se queda corto solo, y suele pasar justo
 * con lo nuevo.
 */
export function calcularCompraBodega({ historiales, inventarios, productosBodega, hoy = new Date(), margen = 0 }) {
  const base = calcularCompras({ historiales, productosBodega, hoy, margen })
  const anterior = mapaGeneracionAnterior(productosBodega)
  // Para saber cuáles son de verdad nuevos. Sin esto, «estimado con la
  // generación anterior» le salía a fundas de iPhone 12 dadas de alta antes
  // de 2023: no tenían venta de referencia, que no es lo mismo que ser nuevas.
  const altas = mapaDeAltas({ ...(inventarios ?? {}), bodega: productosBodega ?? [] })
  const agotados = analizarAgotados({ inventarios, historiales, productosBodega, hoy })
  const porCodigoAgotado = new Map(agotados.filas.map(f => [f.codigo, f]))

  // Venta del mes en curso y el anterior, en todas las plazas, con los días
  // que de verdad se midieron.
  const ventana = mesesAtras(2, hoy)
  const { piezas: recientes, dias: diasVentana } = demandaDe(historiales, ventana)

  const nombres = {}
  const enBodega = {}
  for (const p of productosBodega ?? []) {
    const c = String(p.Codigo ?? '').trim()
    if (!c) continue
    nombres[c] = String(p.Producto ?? '').trim()
    enBodega[c] = Number(p.Existencia) || 0
  }

  // Todo lo que pueda necesitar compra: lo que ya salió en el cálculo, más lo
  // que está agotado doliendo aunque la referencia no lo viera.
  const codigos = new Set([
    ...base.filas.map(f => f.codigo),
    ...agotados.filas.map(f => f.codigo),
  ])

  const porBase = new Map(base.filas.map(f => [f.codigo, f]))

  const filas = []
  for (const codigo of codigos) {
    if (seProduce(codigo, nombres[codigo] ?? '')) continue

    const b = porBase.get(codigo)
    const ag = porCodigoAgotado.get(codigo)
    const existencia = enBodega[codigo] ?? 0
    const vendidas2m = recientes[codigo] ?? 0

    let esperado = b?.esperado ?? 0
    const obs = []

    // Sin historial propio Y recién llegado: se estima con la generación
    // inmediatamente anterior, una sola. Hace falta que la fecha de alta sea
    // real: si el modelo ya estaba cuando arranca el historial, no hay forma
    // de saber que es nuevo, y no vender es entonces un dato, no un vacío.
    let estimadoDe = null
    if (esperado === 0 && esNuevo(codigo, altas, hoy)) {
      const previo = anterior[codigo]
      const esperadoPrevio = porBase.get(previo)?.esperado ?? 0
      if (previo && esperadoPrevio > 0) {
        esperado = esperadoPrevio
        estimadoDe = previo
        obs.push(`Modelo nuevo: estimado con ${nombres[previo] || previo}`)
      }
    }

    // ¿Se está agotando más rápido de lo que la referencia predecía?
    const ritmoReferencia = base.dias > 0 ? esperado / base.dias : 0
    const ritmoReciente = diasVentana > 0 ? vendidas2m / diasVentana : 0
    const seAdelanta = ritmoReferencia > 0
      && vendidas2m >= MINIMO_PARA_MARCAR
      && ritmoReciente > ritmoReferencia * SE_ADELANTA
    if (seAdelanta) {
      obs.push(`Se agota antes de lo previsto: va a ${ritmoReciente.toFixed(2)} pz/día contra ${ritmoReferencia.toFixed(2)} esperadas`)
      // La referencia se queda corta, así que manda el ritmo de ahora.
      esperado = ritmoReciente * base.nMeses * 30
    }

    if (ag) {
      if (ag.plazasConStock === 0) obs.push(`Agotado en las ${ag.plazasEnCero} plazas`)
      else obs.push(`Agotado en ${ag.plazasEnCero} de ${ag.plazasEnCero + ag.plazasConStock} plazas`)
    }
    if (!(codigo in enBodega)) obs.push('Bodega no maneja este código: hay que darlo de alta')
    const relevo = base.mapa?.[codigo]
    if (relevo) obs.push(`Ya existe ${nombres[relevo] || relevo}: revisar si la venta va bajando`)

    const sugerido = Math.max(0, Math.ceil(esperado * (1 + margen) - existencia))
    if (sugerido === 0 && vendidas2m === 0 && !ag) continue

    filas.push({
      codigo,
      producto: nombres[codigo] || b?.producto || ag?.producto || codigo,
      existencia,
      enCatalogo: codigo in enBodega,
      vendidas2m,
      esperado,
      sugerido,
      plazasEnCero: ag?.plazasEnCero ?? 0,
      plazasTotal: ag ? ag.plazasEnCero + ag.plazasConStock : 0,
      diasAgotado: ag?.diasAgotado ?? null,
      seAdelanta,
      estimadoDe,
      observaciones: obs.join(' · '),
    })
  }

  // Manda lo que hay que comprar. La marca de "se agota antes" se enseña en su
  // columna y en su propio contador: ponerla a ordenar subía al principio
  // modelos con cero que comprar, que es justo lo que no sirve en una lista de
  // compra.
  filas.sort((a, b2) =>
    b2.sugerido - a.sugerido ||
    (b2.seAdelanta ? 1 : 0) - (a.seAdelanta ? 1 : 0) ||
    b2.vendidas2m - a.vendidas2m)

  return {
    ...base,
    filas,
    ventana,
    adelantados: filas.filter(f => f.seAdelanta),
    nuevosEstimados: filas.filter(f => f.estimadoDe),
    totalPiezas: filas.reduce((a, f) => a + f.sugerido, 0),
  }
}
