// Lotes: una sola pregunta para los códigos que se contestan igual.
//
// ── Por qué ─────────────────────────────────────────────────────────────────
//
// La cola preguntaba código por código y salían 112 fichas. En el primer
// reporte contestado de verdad, de 23 respuestas **11 eran la misma frase
// escrita a mano**: «bodega ya lo descontinuó», «bodega lo dio de baja»,
// «bodega ya no lo surte». Preguntar cien veces algo que se contesta una vez
// no es revisar, es cansar a quien revisa, y lo que se abandona a la mitad no
// deja base de datos de nada.
//
// ── La regla que lo compacta ────────────────────────────────────────────────
//
// Bodega lleva el catálogo maestro. Si bodega **no** tiene un código y varias
// tiendas **sí**, lo más probable es que bodega lo diera de baja y las tiendas
// se quedaran con lo que les sobró. Un error de captura no se repite igual en
// tres cajas distintas; una baja en bodega sí deja el mismo rastro en todas.
//
// Y el tiempo lo refuerza: si además nadie lo ha vendido en medio año, no hay
// nada que decidir, sólo que agotar.
//
// ── Lo que NO se agrupa ─────────────────────────────────────────────────────
//
// Lo que todavía se vende. Ahí la pregunta sí es de una en una, porque la
// respuesta cambia: el REALME 16 5G se vendió hace dos meses en tres plazas,
// y eso no es un resto, es un modelo vivo que bodega no tiene dado de alta.
// Agruparlo con los muertos sería esconder justo el caso que cuesta dinero.

import { DIAS_DESCONTINUADO } from './anomalias.js'
import { mismoSalvoElTono } from './variantes.js'

/**
 * ⚠️ Un día que toca 20 productos o más **en una misma plaza** es un
 * recuento, no ventas.
 *
 * `UltimoMov` guarda el último movimiento, y un ajuste de inventario es un
 * movimiento. Medido el 2026-10-26 sobre el catálogo real: el día mediano
 * toca 1 o 2 productos por plaza, pero Aguascalientes tiene **208** productos
 * con fecha 2026-03-11, Ferias **225** con 2026-01-03 y León **104** con
 * 2025-12-20. Un cuarto del catálogo no se vende el mismo día.
 *
 * Contar esos días como venta rejuvenece lo que lleva años parado, que es
 * justo lo que hay que detectar. El umbral se mide, no se copia: si una plaza
 * creciera hasta vender 20 modelos distintos en un día de verdad, hay que
 * volver a mirarlo.
 */
export const MOVIMIENTOS_MASIVOS = 20

/**
 * Códigos mínimos para que un lote valga la pena.
 *
 * Por debajo de esto el lote estorba: una ficha que agrupa dos códigos obliga
 * a leer una tabla para contestar lo que cabía en dos preguntas directas.
 */
export const MINIMO_LOTE = 3

export const CLASE = {
  TONO:           'tono',            // el mismo producto en otro color
  SIN_EXISTENCIA: 'sin-existencia',  // no queda ni una pieza en ninguna plaza
  VARIAS:         'varias-plazas',   // lo tienen varias y no lo vende nadie
  UNA:            'una-plaza',       // queda suelto en un solo mostrador
}

const dias = (iso, hoy) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : Math.floor((hoy - d) / 86400000)
}

/**
 * Las fechas que en cada plaza son recuento y no venta.
 *
 * Devuelve { slug: Set(fecha) }. Se mide sobre el catálogo ENTERO de la plaza,
 * no sobre los huérfanos: un recuento toca todo, y mirando sólo un puñado de
 * códigos no se nota que el día era masivo.
 */
export function diasDeRecuento(inventarios) {
  const out = {}
  for (const [slug, inv] of Object.entries(inventarios ?? {})) {
    const cuenta = new Map()
    for (const p of inv?.productos ?? []) {
      if (p.UltimoMov) cuenta.set(p.UltimoMov, (cuenta.get(p.UltimoMov) ?? 0) + 1)
    }
    out[slug] = new Set([...cuenta].filter(([, n]) => n >= MOVIMIENTOS_MASIVOS).map(([d]) => d))
  }
  return out
}

/**
 * La última venta de verdad de cada código, saltándose los recuentos.
 *
 * Devuelve { codigo: { ultima, plazas: { slug: fecha } } }. Un código que sólo
 * aparece en días de recuento sale con `ultima: null`, que no es «sin datos»:
 * es «no se le conoce una venta», y para decidir una baja pesa igual que una
 * fecha muy vieja.
 */
export function ultimaVentaPorCodigo(inventarios) {
  const recuentos = diasDeRecuento(inventarios)
  const out = {}
  for (const [slug, inv] of Object.entries(inventarios ?? {})) {
    for (const p of inv?.productos ?? []) {
      const c = String(p.Codigo ?? '').trim()
      if (!c) continue
      const e = out[c] ??= { ultima: null, plazas: {} }
      if (!p.UltimoMov || recuentos[slug].has(p.UltimoMov)) continue
      e.plazas[slug] = p.UltimoMov
      if (!e.ultima || p.UltimoMov > e.ultima) e.ultima = p.UltimoMov
    }
  }
  return out
}

const nuevoLote = clase => ({
  id: `lote|${clase}`, clase, codigos: [], piezas: 0, porPlaza: {}, plazas: [],
})

// `porPlaza` cuenta CÓDIGOS, no piezas: la pregunta que contesta la tabla es
// en qué mostrador se concentra el problema, y dos piezas de un código son un
// código, no dos.
//
// Se cuenta sobre `altaEn` y no sobre `plazas`, porque `plazas` sólo trae
// donde hay existencia: el lote de los que no tienen ninguna salía sin tabla,
// y entonces «borrarlos en cada plaza donde sigan dados de alta» no decía en
// cuáles. Dado de alta con cero piezas es justo lo que hay que borrar.
const meter = (lote, h) => {
  lote.codigos.push(h)
  lote.piezas += h.piezas
  for (const slug of h.altaEn) {
    lote.porPlaza[slug] = (lote.porPlaza[slug] ?? 0) + 1
  }
}

/**
 * Reparte los huérfanos entre lotes y preguntas sueltas.
 *
 * `huerfanos` sale de `codigosHuerfanos`; `inventarios` son las tiendas, sin
 * bodega. El orden de las reglas importa y va de la prueba más concreta a la
 * más general: un color que bodega ya no surte se explica por el nombre, y
 * eso es mejor prueba que llevar tiempo parado.
 */
export function agruparHuerfanos({ huerfanos, inventarios, hoy = new Date() }) {
  const ventas = ultimaVentaPorCodigo(inventarios)

  // Dónde está dado de alta cada código, haya o no existencia.
  const altas = new Map()
  for (const [slug, inv] of Object.entries(inventarios ?? {})) {
    for (const p of inv?.productos ?? []) {
      const c = String(p.Codigo ?? '').trim()
      if (c) (altas.get(c) ?? altas.set(c, []).get(c)).push(slug)
    }
  }

  const conVenta = (huerfanos ?? []).map(h => {
    const v = ventas[h.codigo] ?? { ultima: null, plazas: {} }
    return {
      ...h,
      altaEn: altas.get(h.codigo) ?? Object.keys(h.plazas ?? {}),
      ultimaVenta: v.ultima,
      ventaPorPlaza: v.plazas,
      diasSinVender: dias(v.ultima, hoy),
    }
  })

  const quieto = h => h.diasSinVender === null || h.diasSinVender >= DIAS_DESCONTINUADO
  const cuantasPlazas = h => Object.keys(h.plazas ?? {}).length

  const clasificar = h => {
    if (h.cubiertoPor && mismoSalvoElTono(h.producto, h.cubiertoPor.producto)) return CLASE.TONO
    if (h.piezas === 0) return CLASE.SIN_EXISTENCIA
    if (!quieto(h)) return null
    return cuantasPlazas(h) >= 2 ? CLASE.VARIAS : CLASE.UNA
  }

  const lotes = new Map()
  const sueltos = []
  for (const h of conVenta) {
    const clase = clasificar(h)
    if (!clase) { sueltos.push(h); continue }
    if (!lotes.has(clase)) lotes.set(clase, nuevoLote(clase))
    meter(lotes.get(clase), h)
  }

  // Un lote que no junta lo suficiente se deshace: sus códigos vuelven a la
  // cola de uno en uno, que para dos o tres es más claro que una tabla.
  const buenos = []
  for (const lote of lotes.values()) {
    if (lote.codigos.length < MINIMO_LOTE) { sueltos.push(...lote.codigos); continue }
    lote.codigos.sort((a, b) => b.piezas - a.piezas || a.codigo.localeCompare(b.codigo))
    lote.plazas = Object.keys(lote.porPlaza)
    buenos.push(lote)
  }

  // Primero donde hay más piezas paradas, que es donde hay dinero quieto.
  buenos.sort((a, b) => b.piezas - a.piezas || b.codigos.length - a.codigos.length)
  sueltos.sort((a, b) => b.piezas - a.piezas)
  return { lotes: buenos, sueltos }
}
