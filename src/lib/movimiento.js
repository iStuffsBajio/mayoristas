// Qué se mueve en cada tienda, para decidir qué mandarle.
//
// ── Para qué existe ───────────────────────────────────────────────────────
//
// Lo pidió el encargado de bodega a través del dueño: «qué modelos son los
// que se mueven más en cada sucursal, y de los modelos nuevos cuáles se están
// agotando más rápido». No es un informe: es lo que se mira antes de armar
// una caja.
//
// Y la mitad del valor está en el lado que nadie pide: **qué NO mandar**. Una
// caja tiene sitio limitado, así que meter diez de algo que no se mueve es
// dejar fuera diez de algo que sí. Por eso aquí salen las dos listas.
//
// ── Por qué el ritmo y no las piezas vendidas ─────────────────────────────
//
// Las piezas vendidas premian a la tienda grande y a los modelos viejos, que
// llevan más tiempo sumando. Lo que decide una caja es a qué VELOCIDAD se
// vacía el mostrador, y eso es el ritmo ponderado de `ritmo.js`: la mitad del
// peso en las últimas cuatro semanas.
//
// Con el promedio plano se agotaban modelos recién surtidos —medido: 30 clase
// A iban a ×1.5 o más de su histórico y 42 a la mitad o menos—.
//
// ── Lo que queda fuera ────────────────────────────────────────────────────
//
// Stickers: bodega los imprime, no los manda. Un sticker «agotándose» no es
// una caja que preparar.
//
// Micas e hidrogel: van en su propio grupo, no mezcladas con las fundas,
// porque se reponen con otras reglas y tienen otro precio. Se calculan igual
// y se devuelven aparte.

import { ritmoPonderado } from './ritmo.js'
import { esProtector } from './familias.js'
import { seProduce } from './produccion.js'
import { diasEnCatalogo, DIAS_RECIEN_LLEGADO } from './surtido.js'

/**
 * 🔒 Días de cobertura por debajo de los cuales un modelo «se está agotando».
 *
 * Veinte: es lo que cubre una tienda en temporada baja para su clase más
 * floja (`COBERTURA_TIENDA.baja.C`). Por debajo de eso ya no es un surtido
 * programado, es ir a apagar un fuego.
 */
export const DIAS_PARA_QUEMARSE = 20

/**
 * 🔒 Días sin vender ni una pieza para considerar que algo no se mueve.
 *
 * Treinta, y con existencia en el mostrador. Sin existencia no es que no se
 * venda: es que no hay qué vender, que es el problema contrario.
 */
export const DIAS_PARADO = 30

const limpio = v => String(v ?? '').trim().toUpperCase()
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** En qué grupo cae un código. Las tres cosas se reponen distinto. */
export function grupoDe(codigo, producto = '') {
  if (seProduce(codigo, producto)) return 'produccion'
  if (esProtector(codigo, producto)) return 'protector'
  return 'funda'
}

/** Existencia y nombre de cada código de un inventario. */
function catalogoDe(inventario) {
  const out = {}
  for (const p of inventario?.productos ?? []) {
    const c = limpio(p.Codigo)
    if (!c) continue
    out[c] = {
      producto: String(p.Producto ?? '').trim(),
      existencia: num(p.Existencia),
      alta: p.Alta ?? null,
    }
  }
  return out
}

/**
 * Lo que se mueve en una plaza, ordenado por velocidad.
 *
 * `datos` es `{ inv, hist, est }` de esa plaza. Devuelve una fila por código
 * con su ritmo, lo que le queda y cuántos días aguanta.
 */
export function movimientoDe(datos, { hoy = new Date() } = {}) {
  const { tasa } = ritmoPonderado({ est: datos?.est, hist: datos?.hist, hoy })
  const catalogo = catalogoDe(datos?.inv)

  // Los códigos salen de la UNIÓN de los dos lados a propósito. Sólo del
  // inventario se pierde lo que se vendió hasta agotarse —que es justo lo
  // más urgente— y sólo del ritmo se pierde lo que está parado en el
  // mostrador, que es la otra lista.
  const codigos = new Set([...Object.keys(tasa), ...Object.keys(catalogo)])

  const filas = []
  for (const codigo of codigos) {
    const c = limpio(codigo)
    const info = catalogo[c] ?? {}
    const producto = info.producto ?? ''
    const grupo = grupoDe(c, producto)
    // Los stickers no se mandan: bodega los imprime cuando hacen falta.
    if (grupo === 'produccion') continue

    const ritmo = num(tasa[c])
    const existencia = num(info.existencia)
    filas.push({
      codigo: c,
      producto,
      grupo,
      ritmo,
      existencia,
      // Días que aguanta con lo que tiene. `null` si no se vende: dividir
      // entre cero daría infinito y ordenaría al revés.
      dias: ritmo > 0 ? existencia / ritmo : null,
      diasEnCatalogo: info.alta ? diasEnCatalogo(info.alta, hoy) : null,
    })
  }
  return filas
}

/**
 * Los que más se mueven en cada plaza. Esto es lo que hay que mandar.
 *
 * Por grupo, para no mezclar fundas con micas.
 */
export function loQueMasSeMueve(porPlaza, { cuantos = 8, hoy = new Date(), grupo = 'funda' } = {}) {
  const out = {}
  for (const [slug, datos] of Object.entries(porPlaza ?? {})) {
    out[slug] = movimientoDe(datos, { hoy })
      .filter(f => f.grupo === grupo && f.ritmo > 0)
      .sort((a, b) => b.ritmo - a.ritmo)
      .slice(0, cuantos)
  }
  return out
}

/**
 * Los recién llegados que se están agotando. Es la lista urgente.
 *
 * Un modelo nuevo no tiene historial que lo respalde, así que si ya se está
 * vaciando es que entró bien y hay que reforzarlo YA —no en el surtido del
 * mes—. Y al revés: un modelo nuevo parado dice que no entró, y eso también
 * conviene saberlo antes de mandar más.
 */
export function nuevosQueVuelan(porPlaza, {
  hoy = new Date(), dias = DIAS_RECIEN_LLEGADO, umbral = DIAS_PARA_QUEMARSE, grupo = 'funda',
} = {}) {
  const out = {}
  for (const [slug, datos] of Object.entries(porPlaza ?? {})) {
    out[slug] = movimientoDe(datos, { hoy })
      .filter(f => f.grupo === grupo
        && f.diasEnCatalogo !== null && f.diasEnCatalogo <= dias
        && f.ritmo > 0 && f.dias !== null && f.dias <= umbral)
      // Lo que menos aguanta primero: es el orden en que se llenan las cajas.
      .sort((a, b) => a.dias - b.dias)
  }
  return out
}

/**
 * Lo que NO hay que mandar: tiene existencia y no se mueve.
 *
 * Es la mitad que nadie pide y la que libera sitio en la caja. Meter diez de
 * algo parado es dejar fuera diez de algo que vuela.
 *
 * Se piden piezas mínimas porque con una sola en el mostrador «no se vende»
 * no significa nada: puede que no se vea.
 */
export function loQueNoMandar(porPlaza, { hoy = new Date(), minimo = 3, grupo = 'funda' } = {}) {
  const out = {}
  for (const [slug, datos] of Object.entries(porPlaza ?? {})) {
    out[slug] = movimientoDe(datos, { hoy })
      .filter(f => f.grupo === grupo && f.existencia >= minimo && f.ritmo === 0)
      // Lo que más sitio ocupa primero.
      .sort((a, b) => b.existencia - a.existencia)
  }
  return out
}

/**
 * El mismo modelo visto en todas las plazas a la vez.
 *
 * Es la vista que de verdad decide una caja: el A07 vuela en León y está
 * parado en Aguascalientes significa mandar a León y no a Aguascalientes,
 * y eso no se ve mirando una plaza cada vez.
 */
export function porModeloYPlaza(porPlaza, { hoy = new Date(), cuantos = 10, grupo = 'funda' } = {}) {
  const porCodigo = {}
  for (const [slug, datos] of Object.entries(porPlaza ?? {})) {
    for (const f of movimientoDe(datos, { hoy })) {
      if (f.grupo !== grupo) continue
      const e = (porCodigo[f.codigo] ??= {
        codigo: f.codigo, producto: f.producto, ritmoTotal: 0, plazas: {},
      })
      if (!e.producto && f.producto) e.producto = f.producto
      e.ritmoTotal += f.ritmo
      e.plazas[slug] = { ritmo: f.ritmo, existencia: f.existencia, dias: f.dias }
    }
  }
  return Object.values(porCodigo)
    .filter(e => e.ritmoTotal > 0)
    .sort((a, b) => b.ritmoTotal - a.ritmoTotal)
    .slice(0, cuantos)
}
