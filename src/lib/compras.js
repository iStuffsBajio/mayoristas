// Qué comprar para bodega.
//
// Esto no es lo mismo que el surtido a sucursales. Ahí se reparte lo que ya
// hay; aquí se decide qué pedirle al proveedor para que la bodega aguante los
// próximos meses.
//
// La referencia es la misma ventana de meses del año pasado, porque la demanda
// es estacional y comparar contra el mes pasado no dice nada sobre diciembre.
//
// Con una regla encima: la demanda de una generación vieja NO se compra en esa
// generación. Si el año pasado se vendieron fundas de Galaxy A06 y hoy existe
// la A07, lo que hay que comprar es A07. Comprar A06 sería surtirse de algo
// que ya está saliendo del mercado.

import { diasDePeriodo } from './estadisticas.js'
import { esTemporadaAlta } from './surtido.js'
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
 * Mapa de generación vieja → generación nueva, deducido del catálogo.
 *
 * No se inventa la aritmética de cada marca, que varía y se equivoca: solo se
 * mapea cuando la generación nueva EXISTE de verdad en el catálogo y entró
 * después, según la fecha de alta. Si no hay sucesora, el modelo se queda
 * como está.
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

    for (const viejo of ord.slice(0, -1)) {
      // La fecha de alta tiene que confirmarlo. Sin ella no se mapea: es
      // preferible comprar de más un modelo viejo que dejar de comprar el
      // nuevo por una suposición.
      if (!viejo.alta || !nueva.alta || nueva.alta <= viejo.alta) continue
      mapa[viejo.codigo] = nueva.codigo
      cambios.push({ de: viejo.codigo, deNombre: viejo.producto, a: nueva.codigo, aNombre: nueva.producto })
    }
  }

  return { mapa, cambios }
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

  for (const h of (historiales ?? []).filter(Boolean)) {
    Object.assign(catalogo, h.catalogo ?? {})
    for (const p of h.periodos ?? []) {
      if (!dentro.has(p.p) || diasDePeriodo(p) <= 0) continue
      cubiertos.add(p.p)
      for (const [k, n] of Object.entries(p.m ?? {})) piezas[k] = (piezas[k] || 0) + n
    }
  }

  return { piezas, catalogo, cubiertos: [...cubiertos].sort() }
}

/**
 * Qué comprar.
 *
 * `historiales` son los de TODAS las sucursales, ferias incluida: la compra se
 * hace para el negocio entero, no para una plaza.
 */
export function calcularCompras({ historiales, productosBodega, hoy = new Date(), margen = 0 }) {
  const alta = esTemporadaAlta(hoy)
  const nMeses = alta ? MESES_COBERTURA.alta : MESES_COBERTURA.normal

  const objetivo = mesesSiguientes(nMeses, hoy)
  const referencia = unAnioAntes(objetivo)

  const { mapa, cambios } = mapaGeneraciones(productosBodega)
  const { piezas, catalogo, cubiertos } = demandaDe(historiales, referencia)

  // La demanda de una generación vieja se transfiere a la nueva.
  const demanda = {}
  const heredado = {}
  for (const [codigo, n] of Object.entries(piezas)) {
    const destino = mapa[codigo] ?? codigo
    demanda[destino] = (demanda[destino] || 0) + n
    if (destino !== codigo) {
      if (!heredado[destino]) heredado[destino] = []
      heredado[destino].push({ codigo, piezas: n })
    }
  }

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
        heredado: heredado[codigo] ?? [],
      }
    })
    .filter(f => f.esperado > 0)
    .sort((a, b) => b.sugerido - a.sugerido || b.esperado - a.esperado)

  // Generaciones viejas cuya demanda se transfirió: no se compran.
  const descartados = Object.entries(piezas)
    .filter(([c]) => mapa[c])
    .map(([c, n]) => ({
      codigo: c,
      producto: catalogo[c] || c,
      piezas: n,
      sustituto: mapa[c],
      sustitutoNombre: nombres[mapa[c]] || catalogo[mapa[c]] || mapa[c],
      existencia: enBodega[c] ?? 0,
    }))
    .sort((a, b) => b.piezas - a.piezas)

  return {
    filas,
    descartados,
    cambios,
    objetivo,
    referencia,
    cubiertos,
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
