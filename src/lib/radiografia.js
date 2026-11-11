// La radiografía de la venta: qué pasa, por qué, cuánto dinero hay en juego.
//
// ── Lo que esta librería puede y lo que no ──────────────────────────────────
//
// Aquí no hay tickets. El único registro de venta que llega a la web es
// cuántas piezas de cada código salieron cada día, deducido de comparar dos
// fotos de inventario. De ahí salen cosas de verdad útiles -qué se acelera,
// qué se frena, dónde hay dinero parado- y NO salen otras que parecen
// básicas: número de tickets, ticket promedio, piezas por ticket, hora de
// venta, vendedor, forma de pago ni productos que se compran juntos. Todo eso
// existe en la tabla de movimientos de Eleventa y no se extrae todavía.
//
// Se nombra «salidas» y no «ventas» a propósito, y el número es un PISO: si
// un modelo baja de 5 a 2 y el mismo día entran 6 de resurtido, la foto del
// día siguiente marca 8 y esa salida no se ve. La diferencia medida contra la
// venta real de Eleventa ronda el 19%.
//
// ── Y el dinero ─────────────────────────────────────────────────────────────
//
// El precio sale de las plazas que VENDEN, nunca de bodega: ahí el iPhone 15
// figura con precio igual al costo. El costo, igual. Donde no hay costo
// capturado no se inventa un margen: la fila se queda sin utilidad y se dice.

import { valorDe } from './precios.js'

const num = v => Number(v) || 0
const iso = d => d.toISOString().slice(0, 10)

/** El día de hace `n` días. */
function hace(hoy, n) {
  const f = new Date(hoy)
  f.setDate(f.getDate() - n)
  return f
}

/** Piezas por código entre dos fechas del detalle diario, inclusive. */
export function salidasEntre(est, desde, hasta) {
  const out = {}
  for (const d of est?.dias ?? []) {
    if (d.f < desde || d.f > hasta) continue
    for (const [k, n] of Object.entries(d.m ?? {})) out[k] = (out[k] || 0) + n
  }
  return out
}

/** Lo que valen unas salidas, en pesos. */
export const pesosDe = (salidas, precios) =>
  Object.entries(salidas ?? {}).reduce((a, [c, n]) => a + valorDe(c, n, precios), 0)

/**
 * El precio de un código, en limpio.
 *
 * Hace falta porque `valorDe` devuelve 0 con cantidades negativas -está
 * pensado para valorar piezas perdidas- y aquí se valoran DIFERENCIAS: con
 * él, todo lo que frenaba salía valorado en cero pesos y la mitad de la
 * pantalla se quedaba muda justo en lo que hay que dejar de comprar.
 */
export const precioUnitario = (codigo, precios) => valorDe(codigo, 1, precios)

// ── 1. Cómo va el mes y en qué va a cerrar ──────────────────────────────────

/**
 * El peso de cada día de la semana, medido sobre el propio historial.
 *
 * Proyectar con un promedio plano de los días que faltan se equivoca siempre
 * en la misma dirección: si quedan tres sábados, un negocio de mostrador
 * cierra por encima; si quedan tres lunes, por debajo. Los pesos salen de los
 * días medidos, no de una tabla copiada.
 *
 * Con menos de dos semanas de dato todos los pesos valen 1: inventar una
 * curva con cuatro días es peor que no tenerla.
 */
export function pesoPorDiaSemana(est, hoy = new Date()) {
  const dias = (est?.dias ?? []).filter(d => d.f <= iso(hoy))
  const plano = [1, 1, 1, 1, 1, 1, 1]
  if (dias.length < 14) return plano

  const suma = [0, 0, 0, 0, 0, 0, 0]
  const cuenta = [0, 0, 0, 0, 0, 0, 0]
  let total = 0

  for (const d of dias) {
    const [a, m, x] = d.f.split('-').map(Number)
    const dow = new Date(a, m - 1, x).getDay()
    const piezas = Object.values(d.m ?? {}).reduce((s, n) => s + n, 0)
    suma[dow] += piezas
    cuenta[dow]++
    total += piezas
  }

  const medioGeneral = total / dias.length
  if (medioGeneral <= 0) return plano

  return suma.map((s, i) => (cuenta[i] > 0 ? (s / cuenta[i]) / medioGeneral : 1))
}

/**
 * Cómo va el mes y en cuánto cierra.
 *
 * `acumulado` son las piezas del mes hasta hoy; `proyectado`, lo que cierra
 * si los días que faltan se portan como los últimos 28, cada uno con el peso
 * de su día de la semana.
 */
export function proyeccionDelMes({ est, precios = null, hoy = new Date() }) {
  const dias = est?.dias ?? []
  if (!dias.length) return null

  const mes = iso(hoy).slice(0, 7)
  const delMes = dias.filter(d => d.f.startsWith(mes) && d.f <= iso(hoy))
  const acumulado = delMes.reduce((a, d) => a + Object.values(d.m ?? {}).reduce((s, n) => s + n, 0), 0)

  // El ritmo de las últimas cuatro semanas, no el del mes: un mes que
  // empieza flojo arrastraría la proyección todo el mes.
  const recientes = dias.filter(d => d.f >= iso(hace(hoy, 27)) && d.f <= iso(hoy))
  const piezasRecientes = recientes.reduce((a, d) => a + Object.values(d.m ?? {}).reduce((s, n) => s + n, 0), 0)
  const ritmo = recientes.length ? piezasRecientes / recientes.length : 0

  const pesos = pesoPorDiaSemana(est, hoy)
  const ultimoDelMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()

  let porVenir = 0
  for (let d = hoy.getDate() + 1; d <= ultimoDelMes; d++) {
    const dow = new Date(hoy.getFullYear(), hoy.getMonth(), d).getDay()
    porVenir += ritmo * pesos[dow]
  }

  const acumuladoPesos = precios ? pesosDe(salidasEntre(est, `${mes}-01`, iso(hoy)), precios) : null
  const porPieza = acumulado > 0 && acumuladoPesos ? acumuladoPesos / acumulado : null

  return {
    mes,
    diasCorridos: delMes.length,
    diasQueFaltan: ultimoDelMes - hoy.getDate(),
    acumulado,
    ritmo,
    proyectado: Math.round(acumulado + porVenir),
    acumuladoPesos: acumuladoPesos === null ? null : Math.round(acumuladoPesos),
    proyectadoPesos: porPieza === null ? null : Math.round((acumulado + porVenir) * porPieza),
  }
}

// ── 2. Por qué subió o bajó ─────────────────────────────────────────────────

/**
 * El puente de variación entre dos periodos, en pesos.
 *
 * Sin tickets no se puede partir en tráfico y piezas por ticket, así que se
 * parte en lo que sí se puede medir y suma exacto:
 *
 *   · VOLUMEN  — las mismas piezas de más o de menos.
 *   · MEZCLA   — modelos que entran o salen del surtido vendido.
 *
 * NO hay componente de precio, y no por descuido: sólo se guarda el precio de
 * HOY, no el que tenía cada modelo cuando se vendió. Un tercer renglón
 * calculado como resto daría cero siempre y se leería como «el precio no
 * movió nada», que no es lo que se sabe: lo que se sabe es que no se puede
 * medir. Para eso hace falta el precio por línea de venta, que está en la
 * tabla de movimientos de Eleventa.
 */
export function puenteDeVariacion({ ahora, antes, precios }) {
  const codigos = new Set([...Object.keys(ahora ?? {}), ...Object.keys(antes ?? {})])

  let volumen = 0, mezcla = 0
  let piezasAhora = 0, piezasAntes = 0

  for (const c of codigos) {
    const a = num(ahora?.[c])
    const b = num(antes?.[c])
    piezasAhora += a
    piezasAntes += b
    const precio = precioUnitario(c, precios)

    // Un modelo que antes no se vendía -o que dejó de venderse- no es «más
    // volumen del mismo»: es otra mezcla, y conviene verlo aparte porque la
    // acción es distinta. Lo uno se repone; lo otro se decide si se repite.
    if (a > 0 && b > 0) volumen += (a - b) * precio
    else mezcla += (a - b) * precio
  }

  const pesosAhora = pesosDe(ahora, precios)
  const pesosAntes = pesosDe(antes, precios)
  const total = pesosAhora - pesosAntes

  return {
    pesosAhora: Math.round(pesosAhora),
    pesosAntes: Math.round(pesosAntes),
    piezasAhora,
    piezasAntes,
    total: Math.round(total),
    volumen: Math.round(volumen),
    mezcla: Math.round(mezcla),
  }
}

// ── 3. Qué se acelera y qué se frena ────────────────────────────────────────

/**
 * Las últimas cuatro semanas contra las cuatro anteriores, modelo a modelo.
 *
 * Es la sección que alimenta la compra: un modelo que dobló su salida lleva
 * cuatro semanas avisando antes de agotarse, y uno que se frenó a la mitad
 * lleva cuatro semanas diciendo que no se vuelva a pedir.
 */
export function momentum({ est, precios, nombres = {}, hoy = new Date(), minimo = 2 }) {
  const ahora = salidasEntre(est, iso(hace(hoy, 27)), iso(hoy))
  const antes = salidasEntre(est, iso(hace(hoy, 55)), iso(hace(hoy, 28)))

  const filas = []
  for (const c of new Set([...Object.keys(ahora), ...Object.keys(antes)])) {
    const a = num(ahora[c]), b = num(antes[c])
    // Pasar de 1 a 2 piezas no es una tendencia, es ruido. El mínimo deja
    // fuera el rumor de la cola larga, que es casi todo el catálogo.
    if (Math.max(a, b) < minimo) continue

    filas.push({
      codigo: c,
      producto: nombres[c] || c,
      ahora: a,
      antes: b,
      delta: a - b,
      // Sin base previa no se inventa un porcentaje: de 0 a 4 no es «subió
      // infinito», es un modelo que antes no se movía.
      pct: b > 0 ? Math.round(((a - b) / b) * 100) : null,
      pesos: Math.round(precioUnitario(c, precios) * (a - b)),
      direccion: a > b ? 'acelera' : a < b ? 'frena' : 'igual',
    })
  }

  filas.sort((x, y) => Math.abs(y.pesos) - Math.abs(x.pesos) || Math.abs(y.delta) - Math.abs(x.delta))
  return {
    acelerando: filas.filter(f => f.direccion === 'acelera'),
    frenando: filas.filter(f => f.direccion === 'frena'),
  }
}

// ── 4. Lo que vuela en una tienda y está parado en otra ─────────────────────

/**
 * Brechas de surtido entre tiendas.
 *
 * Es la recomendación más barata que existe: mover una caja de donde no se
 * vende a donde se acaba no cuesta comprar nada. Se dicen dos casos distintos
 * porque la acción es distinta:
 *
 *   · `parado`   — la tiene y no la vende, mientras en otra vuela. Traspaso.
 *   · `no tiene` — ni siquiera la maneja. Exhibirla y probar.
 */
export function brechas({ ritmoPorPlaza, inventarios, precios, plazas, nombres = {}, umbral = 0.2 }) {
  const codigos = new Set()
  for (const t of Object.values(ritmoPorPlaza ?? {})) for (const c of Object.keys(t)) codigos.add(c)

  const existe = {}
  for (const [slug, inv] of Object.entries(inventarios ?? {})) {
    existe[slug] = {}
    for (const p of inv?.productos ?? []) {
      const c = String(p.Codigo ?? '').trim()
      if (c) existe[slug][c] = num(p.Existencia)
    }
  }

  const filas = []
  for (const c of codigos) {
    const ritmos = plazas.map(p => ({ plaza: p, ritmo: ritmoPorPlaza[p.slug]?.[c] ?? 0 }))
    const lider = ritmos.reduce((m, r) => (r.ritmo > m.ritmo ? r : m), ritmos[0])
    if (!lider || lider.ritmo <= 0) continue

    for (const r of ritmos) {
      if (r.plaza.slug === lider.plaza.slug) continue
      if (r.ritmo > lider.ritmo * umbral) continue

      const hay = existe[r.plaza.slug]?.[c] ?? 0
      const dejaDeHacer = (lider.ritmo - r.ritmo) * 30
      filas.push({
        codigo: c,
        producto: nombres[c] || c,
        plaza: r.plaza.slug,
        nombrePlaza: r.plaza.nombre,
        lider: lider.plaza.nombre,
        ritmoLider: lider.ritmo,
        ritmoAqui: r.ritmo,
        existencia: hay,
        caso: hay > 0 ? 'parado' : 'no tiene',
        // Lo que esa tienda dejaría de perder al mes si vendiera como la que
        // manda. Es un techo, no una promesa: cada plaza tiene su clientela.
        pesosAlMes: Math.round(valorDe(c, dejaDeHacer, precios)),
      })
    }
  }

  return filas.sort((a, b) => b.pesosAlMes - a.pesosAlMes)
}

// ── 5. Dónde está el dinero y dónde está parado ─────────────────────────────

/**
 * 🔒 El costo sale de BODEGA, y sólo de bodega.
 *
 * Es al revés que el precio, y conviene no confundirlos:
 *
 *   · **Precio** -público y mayoreo- de las plazas que VENDEN. En bodega es
 *     basura heredada: el iPhone 15 figura con precio igual al costo.
 *   · **Costo** de BODEGA. Es quien compra, así que es quien lo sabe. En las
 *     sucursales lo captura otra persona y puede equivocarse: hoy el mismo
 *     iPhone 15 dice 36 en bodega y 55 en Aguascalientes, y no hay forma de
 *     saber cuál es el bueno mirando la pantalla.
 *
 * Lo decidió el dueño el 2026-11-05 y tiene un precio que hay que conocer:
 * bodega tiene el costo en cero en 111 de los modelos que se venden, así que
 * el 43% de las piezas vendidas se queda HOY sin margen calculable. No se
 * rellena con el de la sucursal: un margen inventado es peor que uno que
 * falta, y esa lista es justo el trabajo pendiente de captura.
 */
export function costoPorModelo(inventarios, desde = 'bodega') {
  const out = {}
  for (const p of inventarios?.[desde]?.productos ?? []) {
    const c = String(p.Codigo ?? '').trim()
    const costo = num(p.Costo)
    if (c && costo > 0) out[c] = costo
  }
  return out
}

/**
 * Lo que se vende y bodega no tiene costeado. Es la lista de trabajo: cada
 * renglón es un costo que alguien tiene que capturar, ordenado por lo que
 * más se mueve.
 */
export function sinCostear({ salidas, costos, inventarios, nombres = {}, desde = 'bodega' }) {
  const enBodega = new Set(
    (inventarios?.[desde]?.productos ?? []).map(p => String(p.Codigo ?? '').trim()))

  return Object.entries(salidas ?? {})
    .filter(([c, piezas]) => piezas > 0 && !costos?.[c])
    .map(([codigo, piezas]) => ({
      codigo,
      producto: nombres[codigo] || codigo,
      piezas,
      // Dos problemas distintos con la misma cara: uno se arregla capturando
      // un número y el otro dando de alta el producto.
      caso: enBodega.has(codigo) ? 'costo-en-cero' : 'no-esta-en-bodega',
    }))
    .sort((a, b) => b.piezas - a.piezas)
}

/**
 * Utilidad por modelo en un periodo, y el Pareto.
 *
 * Donde no hay costo capturado NO se inventa margen: la fila sale con
 * `utilidad: null` y se cuenta aparte. Un cero ahí se leería como «no deja
 * nada», que es lo contrario de «no se sabe».
 */
export function rentabilidad({ salidas, precios, costos, nombres = {} }) {
  const filas = []
  let sinCosto = 0

  for (const [c, piezas] of Object.entries(salidas ?? {})) {
    if (!(piezas > 0)) continue
    const precio = valorDe(c, 1, precios)
    const costo = costos?.[c] ?? null
    if (precio <= 0) continue
    if (costo === null) { sinCosto++; continue }

    const utilidad = (precio - costo) * piezas
    filas.push({
      codigo: c,
      producto: nombres[c] || c,
      piezas,
      venta: Math.round(precio * piezas),
      utilidad: Math.round(utilidad),
      margen: precio > 0 ? (precio - costo) / precio : null,
    })
  }

  filas.sort((a, b) => b.utilidad - a.utilidad)

  const total = filas.reduce((a, f) => a + f.utilidad, 0)
  let acc = 0
  let cuantosHacenEl80 = 0
  for (const f of filas) {
    acc += f.utilidad
    cuantosHacenEl80++
    if (acc >= total * 0.8) break
  }

  return {
    filas,
    total: Math.round(total),
    sinCosto,
    cuantosHacenEl80,
    // Los que mueven mucha pieza y dejan poco margen COMPARADO CON LOS
    // DEMÁS. Un umbral fijo -«menos del 35%»- no saltaba nunca: este
    // catálogo ronda el 70% parejo, así que lo que importa no es el número
    // absoluto sino quién se queda atrás de su propia casa.
    pocoMargen: (() => {
      const conMargen = filas.filter(f => f.margen !== null && f.piezas >= 3)
      if (conMargen.length < 10) return []
      const ordenados = [...conMargen].sort((a, b) => a.margen - b.margen)
      const corte = ordenados[Math.floor(ordenados.length * 0.1)]?.margen ?? 0
      return ordenados.filter(f => f.margen <= corte).sort((a, b) => b.piezas - a.piezas)
    })(),
  }
}

/**
 * Capital parado: lo que hay en el estante sin venderse, valuado a costo.
 *
 * `diasSinVender` llega calculado -de `clases.js`, que lo saca del acumulado
 * por mes y no de `UltimoMov`, porque ese campo cuenta los recuentos como
 * movimiento y rejuvenece lo que lleva años quieto-.
 */
export function capitalParado({ inventarios, diasSinVender, costos, nombres = {}, desde = 90 }) {
  const porCodigo = {}

  for (const [slug, inv] of Object.entries(inventarios ?? {})) {
    for (const p of inv?.productos ?? []) {
      const c = String(p.Codigo ?? '').trim()
      const piezas = num(p.Existencia)
      if (!c || piezas <= 0) continue
      const dias = diasSinVender?.[c]
      if (dias === null || dias === undefined || dias < desde) continue

      const e = (porCodigo[c] ??= {
        codigo: c, producto: nombres[c] || String(p.Producto ?? '').trim(),
        piezas: 0, dias, plazas: [],
      })
      e.piezas += piezas
      e.plazas.push({ slug, piezas })
    }
  }

  const filas = Object.values(porCodigo).map(e => ({
    ...e,
    costo: costos?.[e.codigo] ?? null,
    pesos: costos?.[e.codigo] ? Math.round(costos[e.codigo] * e.piezas) : null,
  })).sort((a, b) => (b.pesos ?? 0) - (a.pesos ?? 0))

  return {
    filas,
    piezas: filas.reduce((a, f) => a + f.piezas, 0),
    pesos: filas.reduce((a, f) => a + (f.pesos ?? 0), 0),
  }
}
