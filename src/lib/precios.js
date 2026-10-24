// Precios: el promedio entre plazas y las desviaciones que valen la pena mirar.
//
// ── Por qué el promedio entre sucursales ────────────────────────────────────
//
// Cada plaza captura sus propios precios en su caja, así que el mismo producto
// puede estar a $250 en León y a $230 en Aguascalientes. Valorar con el precio
// de una sola plaza dice más de esa plaza que del producto.
//
// Y de paso sale gratis lo más útil: cuando una plaza se sale de la raya
// respecto a las demás, casi siempre es un precio mal capturado.
//
// ── Bodega no cuenta ────────────────────────────────────────────────────────
//
// Sus precios no se mantienen porque bodega no vende. Ahí el iPhone 15 figura
// con precio igual al costo y un «mayoreo» de 5.95 veces el costo, heredado de
// quién sabe cuándo. Meterla en el promedio lo arruina.
//
// ── No se mezclan familias ──────────────────────────────────────────────────
//
// El promedio es SIEMPRE del mismo código entre plazas, nunca de productos
// distintos entre sí. Una mica de hidrogel y una funda no se comparan: ni se
// venden igual ni cuestan igual, y promediarlas no significa nada.

import { esProtector } from './familias.js'

/**
 * 🔒 Por debajo de este precio de mayoreo, un producto no entra en la
 * vigilancia de precios. Son consumibles menores —stickers, pantillas— donde
 * una diferencia de pesos no dice nada.
 *
 * Va sobre el precio de MAYOREO, no sobre el costo: el catálogo entero cuesta
 * entre $55 y $60, así que un umbral por costo dejaba fuera absolutamente
 * todo.
 */
export const MAYOREO_MINIMO = 100

/**
 * 🔒 Desviación que se considera digna de mirar. Un 15% sobre el promedio de
 * las demás plazas ya no es redondeo: es otro precio.
 */
export const DESVIACION = 0.15

/** El precio con el que se valora: promedio de público y mayoreo. */
export const precioDe = p => {
  const pub = Number(p?.Precio) || 0
  const may = Number(p?.Mayoreo) || 0
  if (pub > 0 && may > 0) return (pub + may) / 2
  return pub || may || 0
}

/**
 * Promedio de cada producto entre las plazas que VENDEN.
 *
 * `inventarios` es { slug: json }. Bodega no debe venir aquí; si viene, se
 * ignora: sus precios no se mantienen.
 */
export function promedioEntrePlazas(inventarios, excluir = ['bodega']) {
  const suma = {}

  for (const [slug, inv] of Object.entries(inventarios ?? {})) {
    if (!inv || excluir.includes(slug)) continue
    for (const p of inv.productos ?? []) {
      const precio = precioDe(p)
      if (precio <= 0) continue
      const c = String(p.Codigo ?? '').trim()
      if (!c) continue
      const e = (suma[c] ??= { codigo: c, producto: p.Producto, total: 0, n: 0, porPlaza: {} })
      e.total += precio
      e.n++
      e.porPlaza[slug] = precio
    }
  }

  const out = {}
  for (const [c, e] of Object.entries(suma)) {
    out[c] = { ...e, promedio: e.total / e.n }
  }
  return out
}

/** La mediana de una lista de números. */
const mediana = xs => {
  const o = [...xs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/**
 * Plazas cuyo precio se sale de la raya respecto a las demás.
 *
 * Se compara contra la MEDIANA, no contra el promedio. Con León a $200, San
 * Luis a $200 y Aguascalientes a $100, el promedio es $167 y entonces las
 * TRES plazas aparecen desviadas: el que se sale arrastra la referencia y
 * ensucia a los que están bien. La mediana es $200 y sólo salta
 * Aguascalientes, que es lo que hay que mirar.
 *
 * Con sólo dos plazas no hay mayoría: las dos salen señaladas con la misma
 * diferencia y es la persona quien decide cuál está mal. Eso es honesto, no
 * un defecto.
 */
export function desviaciones(promedios, { minimo = MAYOREO_MINIMO, umbral = DESVIACION, nombres = {} } = {}) {
  const out = []

  for (const e of Object.values(promedios ?? {})) {
    // Los consumibles menores no entran: una diferencia de pesos ahí no dice
    // nada y llenaría la lista de ruido.
    const plazas = Object.entries(e.porPlaza)
    if (plazas.length < 2) continue
    if (e.promedio < minimo) continue

    const refe = mediana(plazas.map(([, v]) => v))
    if (refe <= 0) continue

    for (const [slug, precio] of plazas) {
      const dif = (precio - refe) / refe
      if (Math.abs(dif) < umbral) continue

      out.push({
        codigo: e.codigo,
        producto: e.producto,
        // La familia se dice, no se mezcla: una mica fuera de precio y una
        // funda fuera de precio no son el mismo problema.
        familia: esProtector(e.codigo, e.producto) ? 'hidrogel' : 'funda',
        slug,
        plaza: nombres[slug] ?? slug,
        precio,
        referencia: refe,
        dif,
      })
    }
  }

  // Lo más desviado primero: es donde más probable está el error de captura.
  return out.sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif))
}

/** Valor en pesos de una cantidad de piezas de un código. */
export function valorDe(codigo, piezas, promedios) {
  const e = promedios?.[String(codigo ?? '').trim()]
  if (!e || !(piezas > 0)) return 0
  return e.promedio * piezas
}
