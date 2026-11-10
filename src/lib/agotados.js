// Cuántos días estuvo cada modelo en CERO, y qué le hace eso a su venta.
//
// Lo preguntó el dueño el 2026-11-09, mirando el HONOR X8D en «Pedir»: «solo
// me pedía una o dos fundas, pero quiero saber si eso se debe a que estaba
// agotado o si realmente es un número confiable… no se vendió, pero quizás el
// motivo fue que estaba agotado».
//
// Es la pregunta correcta y el panel no podía contestarla. Toda la cuenta de
// «Pedir» sale de lo que se VENDIÓ, y lo que no está en el mostrador no se
// vende: un modelo agotado tres semanas sale con ritmo bajo, se le pide poco,
// vuelve a agotarse, y la cuenta se confirma a sí misma. Es una venta
// CENSURADA, no una demanda baja.
//
// CLAUDE.md lo tenía anotado como lo que faltaba: «lo que todavía NO se puede
// medir es cuántas veces se ha agotado cada modelo… hace falta el historial de
// existencias, y eso sólo sale de la tabla de movimientos de Eleventa».
//
// ── De dónde sale, y por qué así ───────────────────────────────────────────
//
// `INVENTARIO_HISTORIAL` guarda cada movimiento con `CANTIDAD_ANTERIOR`: la
// existencia que había JUSTO ANTES. No hay «existencia después», y deducirla
// exige saber si cada movimiento suma o resta —una venta resta, una recepción
// suma, un ajuste puede hacer cualquier cosa—.
//
// Se evita entero con una observación: **la existencia entre un movimiento y
// el siguiente es la `CANTIDAD_ANTERIOR` del siguiente**, porque nada cambió
// en medio. Y del último movimiento hasta hoy, la existencia de hoy. No hay
// que adivinar ningún signo.

/** La ventana que se mide. Tres meses: una temporada, no un mes suelto. */
export const DIAS_AGOTADOS = 90

/**
 * A partir de qué parte del tiempo en cero la venta deja de ser de fiar.
 *
 * Es un criterio, no una medida, y conviene saberlo. Un cuarto del tiempo sin
 * mercancía es una semana de cada cuatro: lo bastante para que el ritmo salga
 * visiblemente corto, y no tan poco como para avisar por un día suelto en
 * cero, que pasa siempre entre que se vacía y llega la caja.
 */
export const PARTE_QUE_CENSURA = 0.25

const MS_DIA = 86400000

/**
 * Un instante, SIEMPRE en hora local.
 *
 * `new Date('2026-10-21')` —sólo fecha— es medianoche en UTC, pero
 * `new Date('2026-10-21T00:00')` —con hora— es medianoche aquí. Mezclando las
 * dos formas, la fecha de alta caía seis horas antes que el primer movimiento
 * del mismo día y esas seis horas contaban como «en cero». La prueba lo cazó
 * con 0.3 días donde tenía que haber cero. Es la misma trampa que ya tumbó la
 * pantalla de efectivo un domingo por la tarde.
 */
const momento = t => {
  const s = String(t ?? '').trim().replace(' ', 'T')
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00` : s).getTime()
}

/**
 * Los días en cero de cada código en una plaza.
 *
 * `movimientos`: `[{ codigo, cuando, anterior }]`, en cualquier orden.
 * `existenciaHoy`: `{ codigo: piezas }`, del inventario.
 * `altas`: `{ codigo: 'AAAA-MM-DD' }`. Un modelo se cuenta desde que existe.
 * `desde` / `hasta`: la ventana, como texto de fecha u hora.
 *
 * Devuelve `{ codigo: { diasEnCero, diasMedidos, parte } }`.
 */
export function diasEnCero({ movimientos = [], existenciaHoy = {}, altas = {}, desde, hasta }) {
  const t0 = momento(desde)
  const t1 = momento(hasta)
  if (!(t1 > t0)) return {}

  const porCodigo = new Map()
  for (const m of movimientos) {
    const c = String(m.codigo ?? '').trim().toUpperCase()
    const t = momento(m.cuando)
    if (!c || !(t >= t0 && t <= t1)) continue
    if (!porCodigo.has(c)) porCodigo.set(c, [])
    porCodigo.get(c).push({ t, anterior: Number(m.anterior) || 0 })
  }

  const codigos = new Set([
    ...porCodigo.keys(),
    ...Object.keys(existenciaHoy).map(c => String(c).trim().toUpperCase()),
  ])

  const out = {}
  for (const c of codigos) {
    // Un modelo que llegó dentro de la ventana se cuenta desde su alta. Antes
    // de llegar su existencia era cero porque no existía, no porque se
    // agotara, y contarlo así pintaría cada novedad como «agotada» casi toda
    // la ventana.
    const alta = altas[c] ? momento(altas[c]) : NaN
    const inicio = Number.isFinite(alta) && alta > t0 ? alta : t0
    if (inicio >= t1) continue

    const movs = (porCodigo.get(c) ?? []).filter(m => m.t >= inicio).sort((a, b) => a.t - b.t)
    const hoy = Number(existenciaHoy[c] ?? existenciaHoy[c.toLowerCase()]) || 0

    // Los tramos: [inicio, mov1) vale anterior de mov1; [mov_i, mov_i+1)
    // vale anterior de mov_i+1; [ultimo, hasta) vale lo de hoy.
    let enCero = 0
    let desdeT = inicio
    for (const m of movs) {
      if (m.anterior <= 0) enCero += m.t - desdeT
      desdeT = m.t
    }
    if (hoy <= 0) enCero += t1 - desdeT

    const medidos = (t1 - inicio) / MS_DIA
    const dias = enCero / MS_DIA
    out[c] = {
      diasEnCero: Math.round(dias * 10) / 10,
      diasMedidos: Math.round(medidos),
      parte: medidos > 0 ? dias / medidos : 0,
    }
  }
  return out
}

/**
 * Qué le pasa a la venta de un modelo, dicho en palabras.
 *
 * `vendidas` en el MISMO periodo medido. Puede faltar: la ficha de un código
 * mira 30 o 60 días y esto mide 90, y estimar con las ventas de una ventana y
 * los días en cero de otra daría un número con aspecto de cuenta que no lo
 * es. Sin `vendidas` se dice el hecho y no se estima nada.
 *
 * Devuelve null si no hay dato de existencia: sin él no se sabe, y decir
 * «fiable» a ciegas es justo lo que esto evita.
 */
export function lecturaDeVenta({ vendidas = null, agotado = null }) {
  if (!agotado) return null
  const { diasEnCero, diasMedidos, parte } = agotado
  const conMercancia = Math.max(0, diasMedidos - diasEnCero)

  if (parte >= 0.999) {
    return {
      censurada: true,
      texto: `Estuvo en cero los ${diasMedidos} días: no se sabe cuánto se pide, porque no hubo con qué venderlo.`,
      estimado: null,
    }
  }

  if (parte >= PARTE_QUE_CENSURA) {
    // Lo que habría vendido con mercancía todo el tiempo, al ritmo que llevó
    // cuando sí tenía. Es una estimación y se dice como tal: supone que la
    // gente lo pedía igual los días que no había.
    const estimado = conMercancia > 0 && Number.isFinite(vendidas)
      ? Math.round((vendidas / conMercancia) * diasMedidos)
      : null
    return {
      censurada: true,
      texto: `Estuvo en cero ${Math.round(diasEnCero)} de ${diasMedidos} días. La venta se queda corta: `
        + (estimado !== null && estimado > vendidas
          ? `con mercancía todo el tiempo habría rondado ${estimado}, no ${vendidas}.`
          : 'el número no refleja lo que se pide.'),
      estimado,
    }
  }

  return {
    censurada: false,
    texto: diasEnCero >= 1
      ? `Estuvo en cero ${Math.round(diasEnCero)} de ${diasMedidos} días: poco, la venta es de fiar.`
      : `Tuvo mercancía los ${diasMedidos} días: la venta es de fiar.`,
    estimado: null,
  }
}

/**
 * En qué plazas la venta de un código no es de fiar por haber estado en cero.
 *
 * `porPlaza`: `{ slug: agotados.json }`. Devuelve `[{ slug, diasEnCero,
 * diasMedidos, parte }]`, de más a menos tiempo en cero, sólo con las que
 * pasan de `PARTE_QUE_CENSURA`. Una plaza sin archivo no sale: no se sabe, y
 * callar es mejor que decir «de fiar» a ciegas.
 */
export function censuraEn(porPlaza, codigo, slugs = Object.keys(porPlaza ?? {})) {
  const c = String(codigo ?? '').trim().toUpperCase()
  const out = []
  for (const slug of slugs) {
    const a = porPlaza?.[slug]?.porCodigo?.[c]
    if (a && a.parte >= PARTE_QUE_CENSURA) out.push({ slug, ...a })
  }
  return out.sort((x, y) => y.parte - x.parte)
}
