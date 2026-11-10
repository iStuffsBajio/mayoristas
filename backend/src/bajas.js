// El candado de las bajas definitivas, del lado que manda.
//
// El dueño lo puso por escrito el 2026-11-09:
//
//   «Queda estrictamente PROHIBIDO eliminar un SKU si tiene stock global > 0
//    o si registra ventas en los últimos 365 días.»
//
// «Estrictamente» no se cumple con un botón apagado en la página: cualquiera
// con una sesión de administrador puede mandar la petición a mano. Por eso la
// comprobación vive AQUÍ, en el servidor, y lee los inventarios de S3 en el
// momento —nada de lo que mande el navegador cuenta como prueba—.
//
// La misma cuenta está escrita en `src/lib/depuracion.js`, para que la pantalla
// no ofrezca un botón que esto va a rechazar y diga por qué. Son dos paquetes y
// no se puede compartir, así que hay una prueba que las pone frente a frente
// con los mismos casos: `test/bajas.test.js`.
//
// ── Lo que se exige, todo a la vez ─────────────────────────────────────────
//
//   1. El inventario de CADA plaza. Sin el de una sola, el stock global está
//      incompleto y una cifra falsa no se distingue de una buena. Hoy Torreón
//      vende y no publica el suyo: mientras tanto, no se baja NADA.
//   2. Que el código exista en alguna caja: no hay nada que dar de baja de lo
//      que ya no está.
//   3. Cero piezas en toda la red.
//   4. Más de `dias` desde su última venta (o que nunca se haya vendido).
//   5. Que lleve al menos `dias` en el catálogo: un código nuevo sin ventas no
//      está muerto, acaba de llegar.
//   6. Que la última venta sea EXACTA, es decir, que cada plaza que lo tiene
//      publique `UltimaVenta`. El historial por mes sólo sirve para BLOQUEAR.
//
// `dias` no baja nunca de 365, pida lo que pida el cliente.

/** Todas las plazas donde puede haber mercancía, la vea o no un mayorista. */
export const PLAZAS_CON_STOCK = ['leon', 'san-luis', 'aguascalientes', 'torreon', 'bodega', 'ferias']

/** 🔒 El piso: lo fijó el dueño. No existe un valor menor. */
export const DIAS_MINIMOS_PARA_BAJA = 365

/** Lo más que se acepta pedir. Es sólo para que un número absurdo no pase. */
export const DIAS_MAXIMOS = 3650

const clave = c => String(c ?? '').trim().toUpperCase()
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

/**
 * La fecha de HOY en México, como `AAAA-MM-DD`.
 *
 * La Lambda corre en UTC: después de las 18:00 de México `new Date()` ya es
 * mañana. Con un umbral de 365 días un día no cambia nada, pero es la misma
 * trampa que ya tumbó la pantalla de efectivo un domingo por la tarde, y no se
 * deja una fecha de «hoy» sacada de `toISOString()`.
 */
export const hoyMexico = (ahora = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora)

/** Días de calendario entre dos fechas AAAA-MM-DD, sin husos horarios. */
function diasEntre(desde, hasta) {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(desde ?? ''))
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(hasta ?? ''))
  if (!a || !b) return null
  return Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / 86400000)
}

/** Último día de un mes `AAAA-MM`: una venta de ese mes pudo ser cualquier día. */
function finDeMes(periodo) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(periodo ?? ''))
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2], 0))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * Comprueba una lista de códigos contra los inventarios y los historiales.
 *
 * `inventarios` e `historiales` son `{ slug: json | null }`; `hoy` es
 * `AAAA-MM-DD`. Devuelve:
 *
 *   · `plazasSinInventario` — plazas de `PLAZAS_CON_STOCK` sin inventario
 *   · `dias`                — el umbral que se aplicó, ya con el piso
 *   · `resultados`          — `[{ codigo, producto, ok, motivos: [texto] }]`
 *
 * Nunca lanza por datos raros: lo que no se puede probar se rechaza.
 */
export function verificarBajas({ codigos = [], inventarios = {}, historiales = {}, dias = DIAS_MINIMOS_PARA_BAJA, hoy = hoyMexico() } = {}) {
  const umbral = Math.min(DIAS_MAXIMOS, Math.max(DIAS_MINIMOS_PARA_BAJA, Number(dias) || 0))
  const pedidos = [...new Set((codigos ?? []).map(clave).filter(Boolean))]

  const hay = slug => Array.isArray(inventarios?.[slug]?.productos) && inventarios[slug].productos.length > 0
  const plazasSinInventario = PLAZAS_CON_STOCK.filter(s => !hay(s))

  // Un mapa por plaza, y si publica la última venta. Un inventario de antes de
  // esta función no trae el campo en ningún producto, y de esa plaza no se
  // puede probar que algo NO se vendió.
  const mapas = {}
  const publica = {}
  for (const slug of PLAZAS_CON_STOCK) {
    if (!hay(slug)) continue
    mapas[slug] = new Map(inventarios[slug].productos.map(p => [clave(p.Codigo), p]))
    publica[slug] = inventarios[slug].productos.some(p => p.UltimaVenta)
  }

  // Para cada código pedido, el último mes con salidas de cada plaza.
  const meses = {}
  const quiero = new Set(pedidos)
  for (const slug of PLAZAS_CON_STOCK) {
    const m = new Map()
    for (const per of historiales?.[slug]?.periodos ?? []) {
      for (const [c, n] of Object.entries(per.m ?? {})) {
        const k = clave(c)
        if (!quiero.has(k) || !num(n)) continue
        if (!m.has(k) || per.p > m.get(k)) m.set(k, per.p)
      }
    }
    meses[slug] = m
  }

  const resultados = pedidos.map(codigo => {
    let producto = ''
    let stockGlobal = 0
    let existe = false
    let exacta = true
    let alta = null
    let ultimaVenta = null

    for (const slug of PLAZAS_CON_STOCK) {
      const p = mapas[slug]?.get(codigo)
      let cand = null
      if (p && publica[slug]) {
        cand = p.UltimaVenta ? String(p.UltimaVenta).slice(0, 10) : null
      } else {
        const mes = meses[slug]?.get(codigo)
        cand = mes ? finDeMes(mes) : null
        if (p) exacta = false
      }
      if (cand && (!ultimaVenta || cand > ultimaVenta)) ultimaVenta = cand

      if (p) {
        existe = true
        stockGlobal += num(p.Existencia)
        if (!producto || slug === 'bodega') producto = p.Producto ?? producto
        if (p.Alta) {
          const a = String(p.Alta).slice(0, 10)
          if (!alta || a < alta) alta = a
        }
      }
    }

    const diasSinVender = ultimaVenta ? diasEntre(ultimaVenta, hoy) : null
    const diasEnCatalogo = alta ? diasEntre(alta, hoy) : null

    const motivos = []
    if (plazasSinInventario.length) {
      motivos.push(`falta el inventario de ${plazasSinInventario.join(', ')}: el stock global está incompleto`)
    }
    if (!existe) motivos.push('no existe en ninguna caja: no hay nada que dar de baja')
    if (stockGlobal > 0) motivos.push(`tiene ${stockGlobal} piezas en la red`)
    if (diasSinVender !== null && diasSinVender <= umbral) {
      motivos.push(`se vendió hace ${diasSinVender} días y se piden más de ${umbral}`)
    }
    if (diasEnCatalogo === null || diasEnCatalogo < umbral) {
      motivos.push(diasEnCatalogo === null
        ? 'no se sabe desde cuándo existe'
        : `lleva ${diasEnCatalogo} días en el catálogo y se piden ${umbral}`)
    }
    if (!exacta) motivos.push('falta la última venta exacta de alguna plaza que lo tiene')

    return { codigo, producto, ok: motivos.length === 0, motivos }
  })

  return { plazasSinInventario, dias: umbral, resultados }
}
