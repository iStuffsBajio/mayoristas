// Cuánto rota un modelo, y para cuántos días alcanza lo que hay.
//
// Lo pidió el dueño el 2026-11-09 para la ficha de un modelo en Ventas:
// «unidades vendidas por período, desglose comparativo por sucursal, cruce de
// ventas contra stock disponible en bodega y sucursales, e indicadores de
// velocidad de rotación».
//
// Las tres primeras ya las trae la ficha. Esto es la cuarta, y es la que junta
// las otras: una venta de 12 piezas no dice nada hasta que se sabe cuántas hay.
// Con 3 en el mostrador son diez días; con 60, cinco meses.
//
// ── Lo que NO hace, a propósito ────────────────────────────────────────────
//
// No promete. «Alcanza para 17 días» es la cuenta al ritmo del rango elegido,
// y se dice así: un modelo que estuvo agotado parte del rango vendió menos
// de lo que se pedía (ver `agotados.js`) y su ritmo sale corto, así que los
// días salen largos. Por eso el bloque de «¿su venta es de fiar?» va justo
// encima, y esto no intenta corregirlo.
//
// Y un ritmo de cero NO es «dura para siempre»: es «no se vende». Dividir
// entre cero y mostrar infinito, o un número enorme, se leería como una buena
// noticia cuando es justo lo contrario —piezas paradas—.

const limpio = c => String(c ?? '').trim().toUpperCase()

/**
 * Las piezas que salen al día y los días que aguanta lo que hay.
 *
 * `salidas` son las del `rango` en días; `existencia` es lo que hay hoy, o
 * `null` cuando no se sabe (una plaza sin inventario publicado).
 *
 * `estado` dice qué clase de respuesta es, para que quien la pinte no tenga
 * que adivinar qué significa un `null`:
 *
 *   · `sin-dato`       no se sabe cuántas hay
 *   · `sin-existencia` no hay ninguna: lo que se vendió no se puede repetir
 *   · `sin-venta`      hay y no salen: piezas paradas
 *   · `rota`           sale y hay: `dias` es cuánto aguanta
 */
export function rotacionDe({ salidas = 0, rango = 30, existencia = null } = {}) {
  const n = Number(salidas) || 0
  const porDia = rango > 0 ? n / rango : 0
  const base = { salidas: n, porDia, porSemana: porDia * 7 }

  const hay = existencia === null || existencia === undefined ? null : Number(existencia)
  if (hay === null || !Number.isFinite(hay)) return { ...base, existencia: null, dias: null, estado: 'sin-dato' }
  if (hay <= 0) return { ...base, existencia: 0, dias: 0, estado: 'sin-existencia' }
  if (porDia <= 0) return { ...base, existencia: hay, dias: null, estado: 'sin-venta' }
  return { ...base, existencia: hay, dias: hay / porDia, estado: 'rota' }
}

/**
 * La rotación de toda la red de tiendas, con bodega aparte.
 *
 * `tiendas` es `[{ salidas, existencia }]`: las plazas que venden. Bodega no
 * vende —su existencia es de donde se surte, no un mostrador— así que se suma
 * aparte y se traduce a días al ritmo de las TIENDAS: es la pregunta que
 * contesta «¿alcanza para lo que se va a pedir?».
 *
 * Una tienda sin inventario publicado (`existencia: null`) no suma cero: se
 * deja fuera y se cuenta en `sinInventario`. Sumarla como cero haría ver
 * un faltante que sólo es un archivo que no ha llegado.
 */
export function rotacionDeRed({ tiendas = [], bodega = null, rango = 30 } = {}) {
  let salidas = 0
  let existencia = 0
  let sinInventario = 0
  for (const t of tiendas) {
    salidas += Number(t?.salidas) || 0
    if (t?.existencia === null || t?.existencia === undefined) sinInventario++
    else existencia += Number(t.existencia) || 0
  }

  const tiendasRot = rotacionDe({ salidas, rango, existencia: sinInventario === tiendas.length ? null : existencia })
  const enBodega = bodega === null || bodega === undefined ? null : Number(bodega) || 0

  return {
    tiendas: tiendasRot,
    sinInventario,
    bodega: enBodega,
    // Los días que añade bodega, al mismo ritmo de las tiendas. Sin ritmo no
    // hay días que decir: no se inventa un número con una división por cero.
    diasBodega: enBodega !== null && tiendasRot.porDia > 0 ? enBodega / tiendasRot.porDia : null,
  }
}

/**
 * La existencia de un código en cada plaza.
 *
 * `inventarios` es `{ slug: json | null }`. Devuelve `{ slug: piezas }` con
 * DOS ausencias que no son lo mismo y que la pantalla dice distinto:
 *
 *   · `null`      la plaza no tiene inventario publicado: no se sabe
 *   · sin clave   la plaza lo tiene publicado y ese código no está: no lo maneja
 */
export function existenciasDeCodigo(codigo, inventarios) {
  const c = limpio(codigo)
  const out = {}
  if (!c) return out
  for (const [slug, inv] of Object.entries(inventarios ?? {})) {
    if (!inv) { out[slug] = null; continue }
    const p = (inv.productos ?? []).find(x => limpio(x.Codigo) === c)
    if (p) out[slug] = Number(p.Existencia) || 0
  }
  return out
}

/**
 * Los días en cero de un código en cada plaza, de sus `agotados.json`.
 *
 * `agotados` es `{ slug: json | null }`. Devuelve `{ slug: dato }` con tres
 * casos, por la misma razón que arriba:
 *
 *   · el dato        `{ diasEnCero, diasMedidos, parte }`
 *   · `null`         la plaza tiene archivo y el código no está: no lo maneja
 *   · `undefined`    la plaza todavía no tiene archivo: no se sabe
 */
export function agotadosDeCodigo(codigo, agotados) {
  const c = limpio(codigo)
  const out = {}
  for (const [slug, ago] of Object.entries(agotados ?? {})) {
    out[slug] = ago ? (ago.porCodigo?.[c] ?? null) : undefined
  }
  return out
}
