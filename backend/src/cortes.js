// El corte semanal de cada sucursal, del lado del servidor.
//
// La tienda ve sus ventas de la semana del punto de venta y captura una sola
// cosa: el conteo de billetes y monedas. Lo que hay aquí es lo que decide qué
// puede ver y qué puede escribir, y está aparte de las rutas para poder
// probarlo sin S3.
//
// ── Lo que una tienda NO puede ver ─────────────────────────────────────────
//
// `caja/<plaza>.json` es del administrador por una razón que sigue en pie: sus
// faltantes llevan el NOMBRE de quien cerró el turno pegado a una cantidad de
// dinero que falta, y sus días traen el cajero. Una tienda recibe de ese
// archivo los días de venta y los movimientos de caja —que es lo que ya
// maneja— SIN nombres y SIN faltantes.
//
// Y de `ventas/<plaza>.json` —que lleva la lista de clientes mayoristas del
// negocio y el cajero de cada ticket— recibe sólo el desglose por tipo de pieza
// y lo que compraron los mayoristas de SU plaza. Nunca lo de otra: lo dijo el
// dueño, «el ranking sólo pueden ver el de su sucursal; el único que puede ver
// todas es admin».

/** Las plazas que llevan corte. Ferias no es una tienda y no la lleva. */
export const PLAZAS_CORTE = ['leon', 'san-luis', 'aguascalientes', 'torreon']

/**
 * Los billetes y monedas del corte. Escrito dos veces a la fuerza —también en
 * `src/lib/corte.js`—; `test/cortes.test.js` los pone frente a frente.
 */
export const DENOMINACIONES = [500, 200, 100, 50, 20, 10, 5, 2, 1]

/** Cuántos días de caja y de venta se entregan: el corte mira semanas. */
export const DIAS_DE_CORTE = 120

/** Desde cuándo cuenta el corte: el mismo inicio que el flujo de efectivo. */
export const INICIO_DEL_CORTE = '2026-11-02'

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** ¿Es una fecha `AAAA-MM-DD` real? */
export function esFecha(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? ''))
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

/** ¿Es lunes? Una semana se identifica por su lunes en todo el proyecto. */
export const esLunes = v => esFecha(v) && new Date(`${v}T00:00:00Z`).getUTCDay() === 1

/** El lunes de la semana que contiene una fecha. */
export function lunesDe(v) {
  const d = new Date(`${v}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/**
 * Valida un conteo y devuelve `{ cantidades, total }`, o `{ error }`.
 *
 * Estricto a propósito: una denominación que no existe o una cantidad que no
 * es un entero no se descartan en silencio, se rechazan. Un conteo guardado
 * a medias es peor que uno que no se guardó, porque nadie sabe que falta.
 * El total lo calcula ESTE lado: lo que mande el navegador no cuenta.
 */
export function validarConteo(cantidades) {
  if (!cantidades || typeof cantidades !== 'object' || Array.isArray(cantidades)) {
    return { error: 'Falta el conteo de billetes y monedas.' }
  }
  const limpio = {}
  let total = 0
  for (const [k, v] of Object.entries(cantidades)) {
    const d = Number(k)
    if (!DENOMINACIONES.includes(d)) return { error: `«${k}» no es una denominación del corte.` }
    if (v === '' || v === null || v === undefined) continue
    const q = Number(v)
    if (!Number.isInteger(q) || q < 0 || q > 100000) {
      return { error: `La cantidad de $${d} no es un número entero válido.` }
    }
    if (q > 0) { limpio[d] = q; total += d * q }
  }
  return { cantidades: limpio, total }
}

/**
 * Los días de caja que ve una tienda: sin el nombre del cajero ni el arqueo de
 * cada turno, y sólo los últimos `DIAS_DE_CORTE`.
 */
export function diasParaTienda(caja, hasta) {
  const corte = restarDias(hasta, DIAS_DE_CORTE - 1)
  return (Array.isArray(caja?.dias) ? caja.dias : [])
    .filter(d => !corte || String(d.f) >= corte)
    .map(({ cajero, arqueo, persona, quien, ...resto }) => resto)   // eslint-disable-line no-unused-vars
}

/**
 * Los movimientos de caja que ve una tienda: los de su plaza, sin los
 * faltantes —que llevan el nombre de quien cerró el turno— y sin el autor.
 */
export function movimientosParaTienda(caja, hasta) {
  const corte = restarDias(hasta, DIAS_DE_CORTE - 1)
  return (Array.isArray(caja?.movimientos) ? caja.movimientos : [])
    .filter(m => m?.tipo !== 'faltante' && (!corte || String(m.f) >= corte))
    .map(({ persona, quien, cajero, ...resto }) => resto)          // eslint-disable-line no-unused-vars
}

/** Sólo lo del corte de un `ventas/<plaza>.json`. Nada más sale de ahí. */
export function ventasParaTienda(ventas) {
  return {
    detalleDias: num(ventas?.detalleDias),
    hasta: ventas?.hasta ?? null,
    porDiaTipo: Array.isArray(ventas?.porDiaTipo) ? ventas.porDiaTipo : [],
    mayoristasPorDia: Array.isArray(ventas?.mayoristasPorDia) ? ventas.mayoristasPorDia : [],
    // Todos los clientes de ESTA plaza con su última visita: es lo que permite
    // decir quién dejó de venir. Sin ventas ni dinero.
    mayoristas: (Array.isArray(ventas?.mayoristas) ? ventas.mayoristas : [])
      .map(m => ({ quien: String(m.quien ?? ''), tickets: num(m.tickets), ultima: m.ultima ?? null }))
      .filter(m => m.quien),
  }
}

/** Sólo los dos parámetros que el corte necesita: no se entrega la cuenta del banco. */
export function parametrosParaTienda(params) {
  return {
    fondoFijo: params?.fondoFijo ?? null,
    desdeControlSalidas: params?.desdeControlSalidas ?? null,
  }
}

function restarDias(dia, n) {
  if (!esFecha(dia)) return null
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * Qué guardar cuando alguien cuenta una semana.
 *
 * Cada cambio deja un renglón en el historial —quién, cuándo y cuánto—, y
 * volver a pulsar Guardar sin cambiar nada NO deja otro: llenaría el registro
 * de renglones iguales, que es la otra forma de no tener registro. El autor y
 * la hora los pone este lado.
 */
export function registroDeConteo({ previo = null, semana, cantidades, total, observaciones = '', quien, ahora = new Date().toISOString() }) {
  const obs = String(observaciones ?? '').slice(0, 300)
  const igual = previo
    && previo.total === total
    && JSON.stringify(previo.cantidades) === JSON.stringify(cantidades)
    && (previo.observaciones ?? '') === obs
  if (igual) return previo

  const renglon = { cuando: ahora, quien, total, cantidades, observaciones: obs }
  return {
    semana, cantidades, total, observaciones: obs,
    cuando: ahora, quien,
    historial: [...(previo?.historial ?? []), renglon].slice(-50),
  }
}
