// A qué ritmo se vende HOY cada modelo.
//
// ── El fallo que arregla ────────────────────────────────────────────────────
//
// El surtido pedía con `velocidadDiaria`, que promedia TODO el historial: en
// León mezcla enero con noviembre en un solo número. Un modelo que dobló su
// venta este mes se surtía al ritmo del año pasado, y se agotaba a los pocos
// días de haberlo surtido.
//
// Medido el 2026-11-05 sobre los 86 modelos clase A de las tres tiendas,
// comparando el ritmo plano con lo que de verdad salió en los últimos 30 días:
//
//   · la mediana va en ×0.80 -la temporada está floja y se pide de más-
//   · pero 30 modelos van a ×1.5 o más, algunos a ×3.6
//   · y 42 van a la mitad o menos: ésos son dinero parado
//
// El iPhone 17 Pro Max de Aguascalientes estaba en CERO con un ritmo plano de
// 0.15/día y uno real de 0.40. El Moto G06 de San Luis, igual: 0.07 contra
// 0.17, en cero. Se agotaron porque se pidieron al ritmo viejo.
//
// ── Cómo se pondera ─────────────────────────────────────────────────────────
//
// Tres ventanas de cuatro semanas, con el peso que pidió el dueño: lo de
// ahora manda y lo viejo sólo corrige.
//
//   50%  días 0-27     lo que está pasando
//   30%  días 28-55    el mes anterior
//   20%  días 56-83    el de antes
//
// Las dos primeras salen del detalle diario, que guarda 60 días. La tercera
// cae fuera de esa ventana y sale del acumulado por mes. Si una ventana no
// tiene dato, su peso se reparte entre las que sí: con tres semanas de
// historia el ritmo sigue siendo el de esas tres semanas, no un número
// diluido entre ceros que no se midieron.
//
// ── Lo que todavía NO hace ──────────────────────────────────────────────────
//
// Excluir los días en que el modelo estuvo agotado. Un día en cero no es un
// día de venta cero: es venta perdida, y promediarlo hunde el ritmo justo de
// lo que más se vende. Para saberlo hace falta el historial de EXISTENCIAS,
// que hoy no se guarda en ninguna parte: sale de la tabla de movimientos de
// Eleventa. Mientras no esté, este ritmo es un piso, igual que la estimación
// por diferencia de inventario.

/** Los tres tramos, en días hacia atrás, con su peso. */
export const VENTANAS = [
  { desde: 0,  hasta: 27, peso: 0.5 },
  { desde: 28, hasta: 55, peso: 0.3 },
  { desde: 56, hasta: 83, peso: 0.2 },
]

const iso = d => d.toISOString().slice(0, 10)

/** El día de hace `n` días, en ISO. */
function hace(hoy, n) {
  const f = new Date(hoy)
  f.setDate(f.getDate() - n)
  return iso(f)
}

/**
 * Piezas por código dentro de una ventana, leídas del detalle diario.
 *
 * Devuelve también cuántos días de esa ventana están medidos de verdad: una
 * ventana a medias no se divide entre 28, se divide entre lo que tiene.
 */
function delDiario(est, hoy, { desde, hasta }) {
  const limInf = hace(hoy, hasta)
  const limSup = hace(hoy, desde)
  const piezas = {}
  let dias = 0

  for (const d of est?.dias ?? []) {
    if (d.f < limInf || d.f > limSup) continue
    dias++
    for (const [k, n] of Object.entries(d.m ?? {})) piezas[k] = (piezas[k] || 0) + n
  }
  return { piezas, dias }
}

/**
 * Lo mismo desde el acumulado por mes, para la ventana que ya no cabe en el
 * detalle diario.
 *
 * Un mes entra si se solapa con la ventana, y aporta en proporción a los días
 * que se solapan: la ventana de los días 56 a 83 pisa dos meses casi siempre.
 */
function delMensual(hist, hoy, { desde, hasta }) {
  const limInf = hace(hoy, hasta)
  const limSup = hace(hoy, desde)
  const piezas = {}
  let dias = 0

  for (const per of hist?.periodos ?? []) {
    const [a, m] = String(per.p).split('-').map(Number)
    if (!a || !m) continue
    const primero = new Date(a, m - 1, 1)
    const ultimo = new Date(a, m, 0)
    const ini = iso(primero) > limInf ? iso(primero) : limInf
    const fin = iso(ultimo) < limSup ? iso(ultimo) : limSup
    if (ini > fin) continue

    // Días del mes que caen dentro de la ventana, sobre los días que el mes
    // tiene MEDIDOS -no los del calendario-: un mes a medias contaría de menos.
    const medidos = per.origen === 'eleventa'
      ? (per.diasCubiertos ?? new Date(a, m, 0).getDate())
      : (per.dias?.length ?? 0)
    if (medidos <= 0) continue

    const delMes = (new Date(fin) - new Date(ini)) / 86400000 + 1
    const parte = Math.min(1, delMes / new Date(a, m, 0).getDate())

    dias += medidos * parte
    for (const [k, n] of Object.entries(per.m ?? {})) piezas[k] = (piezas[k] || 0) + n * parte
  }
  return { piezas, dias }
}

/**
 * El ritmo ponderado de una plaza, en piezas por día y por código.
 *
 * `est` es su detalle diario y `hist` su acumulado por mes. Devuelve también
 * de dónde salió cada ventana, que es lo que permite decir en pantalla si un
 * número se apoya en tres semanas o en tres meses.
 */
export function ritmoPonderado({ est, hist, hoy = new Date() }) {
  const tramos = VENTANAS.map(v => {
    // El detalle diario manda donde llega; el mensual cubre lo que queda
    // fuera de sus 60 días.
    const diario = delDiario(est, hoy, v)
    const fuente = diario.dias > 0 ? 'diario' : 'mensual'
    const datos = diario.dias > 0 ? diario : delMensual(hist, hoy, v)
    return { ...v, ...datos, fuente }
  })

  const vivos = tramos.filter(t => t.dias > 0)
  const pesoVivo = vivos.reduce((a, t) => a + t.peso, 0)

  const tasa = {}
  if (pesoVivo > 0) {
    for (const t of vivos) {
      // El peso de las ventanas sin dato se reparte entre las que sí tienen.
      const peso = t.peso / pesoVivo
      for (const [k, n] of Object.entries(t.piezas)) {
        tasa[k] = (tasa[k] || 0) + (n / t.dias) * peso
      }
    }
  }

  return {
    tasa,
    tramos: tramos.map(({ desde, hasta, peso, dias, fuente }) => ({ desde, hasta, peso, dias, fuente })),
    dias: Math.round(vivos.reduce((a, t) => a + t.dias, 0)),
  }
}

/** Suma los ritmos de varias plazas. Se suman RITMOS, nunca piezas. */
export function ritmoDeLaRed(plazas, hoy = new Date()) {
  const tasa = {}
  for (const p of plazas.filter(Boolean)) {
    const r = ritmoPonderado({ ...p, hoy })
    for (const [k, t] of Object.entries(r.tasa)) tasa[k] = (tasa[k] || 0) + t
  }
  return { tasa }
}
