// El ranking de mayoristas de una sucursal.
//
// Lo pidió el dueño el 2026-11-09 para la pantalla de corte: el acumulado de
// cada mayorista, el más activo y el menos activo. Y lo acotó él mismo:
//
//   · cada sucursal ve SÓLO el suyo; el único que ve todas es el administrador;
//   · el rango va de 7 días a un máximo de 30.
//
// Lo primero lo impone el servidor —`GET /corte` no entrega a una tienda nada
// de otra—; lo segundo, esta cuenta, que no acepta menos de 7 ni más de 30 sea
// lo que le pidan.
//
// ── Qué es «activo» ────────────────────────────────────────────────────────
//
// Se mide por DINERO: lo que el mayorista compró en el rango, ticket entero.
// Las piezas van al lado —sólo las que cuentan: fundas, hidrogel y stickers— y
// los tickets también, porque dos clientes con el mismo dinero no son el mismo
// cliente: uno compra una vez grande y otro viene cada día. Ante un empate de
// dinero manda quien trajo más piezas, y luego más visitas.
//
// Y «el menos activo» es el menos activo de los que SÍ compraron. Los que no
// compraron nada en el rango no son «el menos activo», son otra cosa y se
// listan aparte —`sinCompras`—: ahí está el cliente que dejó de venir, que es
// la lectura que de verdad le sirve a quien lleva la tienda.

export const DIAS_MINIMOS = 7
export const DIAS_MAXIMOS = 30

/** Los rangos que ofrece la pantalla, todos dentro del tope. */
export const RANGOS_DE_MAYORISTAS = [7, 14, 21, 30]

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** El rango, siempre entre 7 y 30 días, venga lo que venga. */
export const rangoValido = n => {
  const d = Math.round(num(n))
  if (!d) return DIAS_MINIMOS
  return Math.min(DIAS_MAXIMOS, Math.max(DIAS_MINIMOS, d))
}

/** El primer día de una ventana de `dias` días que termina en `hoy`, inclusive. */
function desdeDe(hoy, dias) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(hoy ?? ''))
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] - (dias - 1)))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * El ranking de una plaza.
 *
 * `porDia` son los `mayoristasPorDia` de `ventas/<plaza>.json`; `conocidos` los
 * `mayoristas` de siempre —todos los clientes de la plaza, con su última
 * visita— que es lo único que permite decir quién NO compró; `hoy` es
 * `AAAA-MM-DD` y entra como parámetro: una cuenta que mira el reloj no se
 * puede probar.
 */
export function rankingDeMayoristas({ porDia = [], conocidos = [], dias = DIAS_MINIMOS, hoy } = {}) {
  const rango = rangoValido(dias)
  const desde = desdeDe(hoy, rango)

  const por = new Map()
  for (const r of porDia ?? []) {
    if (desde && String(r.f) < desde) continue
    if (hoy && String(r.f) > String(hoy)) continue
    const k = String(r.quien ?? '').trim()
    if (!k) continue
    const f = por.get(k) ?? { quien: k, tickets: 0, piezas: 0, dinero: 0, ultima: null }
    f.tickets += num(r.tickets)
    f.piezas += num(r.piezas)
    f.dinero += num(r.dinero)
    if (!f.ultima || String(r.f) > f.ultima) f.ultima = String(r.f)
    por.set(k, f)
  }

  const lista = [...por.values()].sort((a, b) =>
    b.dinero - a.dinero || b.piezas - a.piezas || b.tickets - a.tickets || a.quien.localeCompare(b.quien))
    .map((f, i) => ({ ...f, puesto: i + 1 }))

  // Los clientes de la plaza que no aparecen en el rango.
  const activos = new Set(lista.map(f => f.quien))
  const sinCompras = (conocidos ?? [])
    .filter(c => c?.quien && !activos.has(String(c.quien).trim()))
    .map(c => ({ quien: String(c.quien).trim(), ultima: c.ultima ?? null, tickets: num(c.tickets) }))
    // Los que compraron más hace poco primero: son los que acaban de dejar de
    // venir, y a los que hace años que no se ven no hay nada que hacerles.
    .sort((a, b) => String(b.ultima ?? '').localeCompare(String(a.ultima ?? '')) || a.quien.localeCompare(b.quien))

  return {
    dias: rango, desde, hasta: hoy ?? null,
    lista,
    masActivo: lista[0] ?? null,
    // Con uno solo, «el más activo» y «el menos activo» serían el mismo, y
    // decirlo dos veces es ruido.
    menosActivo: lista.length > 1 ? lista[lista.length - 1] : null,
    sinCompras,
    total: {
      clientes: lista.length,
      tickets: lista.reduce((a, f) => a + f.tickets, 0),
      piezas: lista.reduce((a, f) => a + f.piezas, 0),
      dinero: lista.reduce((a, f) => a + f.dinero, 0),
    },
  }
}

/**
 * El ranking de cada plaza, para la vista del administrador. Cada una por
 * separado: el mismo nombre de cliente en dos plazas no es el mismo cliente
 * —el nombre lleva el local—, y sumarlos mezclaría gente distinta.
 */
export function rankingPorPlaza({ plazas = {}, dias, hoy } = {}) {
  return Object.fromEntries(Object.entries(plazas).map(([slug, v]) => [
    slug,
    rankingDeMayoristas({ porDia: v?.porDia, conocidos: v?.conocidos, dias, hoy }),
  ]))
}
