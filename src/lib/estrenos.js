// ¿Los modelos nuevos están vendiendo?
//
// Lo pidió el dueño el 2026-11-07: «trasladar la información de Recién
// llegados a la sección de ventas. Esto servirá para evaluar si los modelos
// nuevos de la edición anterior o de las últimas dos ediciones realmente
// están teniendo ventas».
//
// No es la misma pantalla cambiada de sitio. En Surtido, «Recién llegados»
// contestaba una pregunta de COMPRA —qué entró y todavía no se ha visto
// vender, para no volver a pedirlo— y por eso enseñaba sólo los que llevan
// cero. Aquí la pregunta es la contraria y más grande: de todo lo que entró,
// **qué vende y qué no**. Una lista que sólo trae los fracasos no permite
// decidir si la edición entró bien: para eso hace falta el denominador.
//
// ── Cuatro cosas que, mal hechas, dan la respuesta al revés ───────────────
//
// 1. LA VENTA SALE DEL ACUMULADO MENSUAL, NO DEL DETALLE DIARIO.
//    `estadisticas.json` guarda sólo los **últimos 60 días** de detalle
//    (`DIAS_QUE_SE_GUARDAN`). La pregunta es sobre 120 o 240. Midiendo con el
//    diario, un modelo que entró hace cuatro meses y se vendió entero en los
//    dos primeros saldría con CERO piezas, y la conclusión sería matar justo
//    el modelo que mejor entró. El acumulado por mes de `historial.json` sí
//    está entero.
//
// 2. SE COMPARA A IGUALDAD DE TIEMPO. Un modelo que lleva 10 días no se puede
//    juzgar contra uno que lleva 115 por piezas totales. Por eso manda el
//    ritmo —piezas por cada 30 días desde que llegó— y las piezas se enseñan
//    al lado como lo que son, un total.
//
// 3. LO QUE ACABA DE LLEGAR NO HA FRACASADO. Un modelo con dos semanas y cero
//    ventas no es un fracaso, es un modelo sin medir. Se aparta en su propio
//    montón (`sinMedir`) y no cuenta como «no vende»; metido con los demás,
//    toda edición reciente parecería un desastre.
//
// 4. UN «PISO» NO ES UNA LLEGADA. `Alta` es el primer movimiento del
//    historial, no la fecha de entrada: en León 579 de 647 productos comparten
//    el día en que arrancó Eleventa. Esa fecha dice cuándo empieza lo que se
//    puede ver. Incluirla llenó una vez esta lista de fundas de iPhone 6.

import { valorDe } from './precios.js'
import { DIAS_RECIEN_LLEGADO } from './surtido.js'

/**
 * Hasta dónde llega un modelo para seguir contando como «nuevo». Son los
 * mismos 120 días con los que el resto del panel lo decide —`surtido.js` es
 * su casa— y aquí sólo sirve de respaldo, para cuando las entradas no forman
 * lotes.
 */
export const DIAS_EDICION = DIAS_RECIEN_LLEGADO

/**
 * UNA EDICIÓN ES UN LOTE, NO UNA VENTANA DE CALENDARIO.
 *
 * La primera versión cortaba por tramos de 120 días. Funcionaba por
 * casualidad. Medido en el catálogo real el 2026-11-07, las entradas son
 * lotes nítidos:
 *
 *     2026-08-10   13 modelos      2026-01-28 y 31   26 modelos
 *     2026-05-16 y 18   10 modelos 2025-12-01        10 modelos
 *
 * Dos cosas que eso cambia y que la ventana hacía mal:
 *
 *   - **Una edición puede repartirse en dos días.** Mayo entró el 16 y el 18;
 *     enero el 28 y el 31. Agrupando por día exacto, una edición saldría
 *     partida en dos y la comparación mediría una mitad contra la otra.
 *   - **Dos lotes pueden caer en la misma ventana, o uno quedarse fuera.** La
 *     de enero está a 280 días: con tramos de 120 no sale nunca, por muchas
 *     ediciones que se pidan.
 *
 * Así que se agrupan las fechas de entrada que están a menos de esto una de
 * otra. 21 días separa de sobra los lotes reales —el más apretado son dos
 * días— sin partir ninguno.
 */
export const DIAS_MISMA_EDICION = 21

/**
 * Modelos mínimos para llamarlo edición.
 *
 * Por debajo es goteo: diez de los modelos recientes entraron de uno en uno
 * en ocho días sueltos. Llamar «la última edición» a un modelo solo haría que
 * la comparación midiera un modelo contra trece.
 */
export const MINIMO_EDICION = 3

/**
 * Lo más que puede durar una edición.
 *
 * El agrupado encadena: una fecha se pega a la anterior si están a menos de
 * `DIAS_MISMA_EDICION`. Con mercancía entrando a goteo cada veinte días, esa
 * cadena no se rompería nunca y todo el año acabaría siendo «la última
 * edición» —un solo montón, sin nada con qué compararlo—. Medido, la tanda
 * más larga del catálogo real dura 24 días, así que 45 deja sitio de sobra y
 * corta la cadena antes de que se desboque.
 */
export const DIAS_MAXIMO_EDICION = 45

/**
 * Días que hacen falta para opinar de un modelo.
 *
 * Por debajo de esto no se dice que no vende: se dice que no se sabe. Treinta
 * días es un mes de mostrador, que es el mínimo con el que el dueño decide
 * cualquier otra cosa en este panel.
 */
export const DIAS_PARA_OPINAR = 30

const num = v => Number(v) || 0
const iso = d => d.toISOString().slice(0, 10)

const hace = (hoy, n) => {
  const f = new Date(hoy)
  f.setDate(f.getDate() - n)
  return f
}

/** Días entre dos fechas de calendario. */
function diasEntre(desde, hoy) {
  if (!desde) return null
  const a = new Date(`${desde}T00:00:00`)
  if (Number.isNaN(a.getTime())) return null
  const b = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.max(0, Math.round((b - a) / 86400000))
}

/**
 * Piezas por código desde un mes dado, del acumulado PERMANENTE.
 *
 * `historial.periodos` es `[{ p: '2026-10', m: { codigo: piezas } }]`. Es la
 * única fuente que llega más atrás de 60 días, y por eso es la de aquí.
 */
export function ventasDesdeElMes(historial, desdeMes) {
  const out = {}
  for (const p of historial?.periodos ?? []) {
    if (desdeMes && p.p < desdeMes) continue
    for (const [k, n] of Object.entries(p.m ?? {})) out[k] = (out[k] || 0) + num(n)
  }
  return out
}

/** Las piezas de un código mes a mes, para dibujar si arrancó o se apagó. */
function porMesDe(historial, codigo, desdeMes) {
  const out = []
  for (const p of historial?.periodos ?? []) {
    if (desdeMes && p.p < desdeMes) continue
    out.push({ mes: p.p, piezas: num(p.m?.[codigo]) })
  }
  return out
}

/**
 * Las ediciones que hay, de la más reciente a la más vieja.
 *
 * Devuelve `{ ediciones, sueltos }`: una edición es un grupo de fechas de
 * entrada pegadas con al menos `MINIMO_EDICION` modelos; lo demás es goteo y
 * se cuenta aparte en vez de inventarle una edición.
 */
export function lotesDeEntrada(altas = {}, {
  gap = DIAS_MISMA_EDICION, minimo = MINIMO_EDICION, maximo = DIAS_MAXIMO_EDICION,
} = {}) {
  const porDia = new Map()
  for (const [codigo, d] of Object.entries(altas)) {
    // Un piso no prueba que algo llegó: es el día en que arrancó el historial
    // de su plaza, y en León lo comparten 579 productos de 647.
    if (!d?.alta || d.piso) continue
    if (!porDia.has(d.alta)) porDia.set(d.alta, [])
    porDia.get(d.alta).push(codigo)
  }

  const dias = [...porDia.keys()].sort((a, b) => b.localeCompare(a))
  const grupos = []
  for (const f of dias) {
    const ultimo = grupos[grupos.length - 1]
    const separa = ultimo
      ? Math.abs(new Date(`${ultimo.hasta}T00:00:00`) - new Date(`${f}T00:00:00`)) / 86400000
      : Infinity
    const total = ultimo
      ? Math.abs(new Date(`${ultimo.desde}T00:00:00`) - new Date(`${f}T00:00:00`)) / 86400000
      : 0
    if (ultimo && separa <= gap && total <= maximo) {
      ultimo.hasta = f
      ultimo.codigos.push(...porDia.get(f))
    } else {
      grupos.push({ desde: f, hasta: f, codigos: [...porDia.get(f)] })
    }
  }

  const ediciones = []
  let sueltos = 0
  for (const g of grupos) {
    if (g.codigos.length >= minimo) ediciones.push(g)
    else sueltos += g.codigos.length
  }
  return { ediciones, sueltos }
}

/** La existencia de un código, por plaza y total. */
function existenciaDe(inventarios) {
  const out = {}
  for (const [slug, inv] of Object.entries(inventarios ?? {})) {
    for (const p of inv?.productos ?? []) {
      const c = String(p.Codigo ?? '').trim()
      if (!c) continue
      const e = (out[c] ??= { total: 0, plazas: {}, producto: p.Producto ?? '' })
      const n = num(p.Existencia)
      e.total += n
      if (n > 0) e.plazas[slug] = n
      if (!e.producto) e.producto = p.Producto ?? ''
    }
  }
  return out
}

/**
 * Las ediciones recientes y cómo les está yendo.
 *
 * `altas` es el mapa de `mapaDeAltas`: `{ codigo: { alta, piso } }`.
 * `historial` es el acumulado por mes, ya acotado a la plaza elegida.
 * `inventarios` son los inventarios de esa misma plaza (o de todas).
 */
export function estrenos({
  altas = {}, historial = null, inventarios = {}, precios = {}, costos = {},
  nombres = {}, hoy = new Date(), ediciones = 2,
}) {
  const ex = existenciaDe(inventarios)
  const { ediciones: lotes, sueltos } = lotesDeEntrada(altas)

  // Cuando no hay lotes —una plaza que recibe de goteo— no se deja la
  // pantalla vacía: se juntan las entradas reales de los últimos 120 días en
  // un solo montón y se dice que es eso. Es la misma pregunta con el dato
  // que haya.
  const corte = iso(hace(hoy, DIAS_EDICION))
  const deRespaldo = () => {
    const codigos = Object.entries(altas)
      .filter(([, d]) => d?.alta && !d.piso && d.alta > corte)
      .map(([c]) => c)
    if (!codigos.length) return []
    const fechas = codigos.map(c => altas[c].alta).sort()
    return [{ desde: fechas[fechas.length - 1], hasta: fechas[0], codigos, goteo: true }]
  }

  const elegidos = (lotes.length ? lotes : deRespaldo()).slice(0, ediciones)

  // El mes más antiguo que hay que mirar: el de la edición más vieja que se
  // enseña. Recortar aquí evita recorrer el historial entero por cada código.
  const masViejo = elegidos.length
    ? elegidos[elegidos.length - 1].hasta.slice(0, 7)
    : iso(hace(hoy, DIAS_EDICION)).slice(0, 7)
  const vendidas = ventasDesdeElMes(historial, masViejo)

  const cohortes = elegidos.map((lote, k) => {
    const modelos = []
    for (const codigo of lote.codigos) {
      const alta = altas[codigo].alta
      const edad = diasEntre(alta, hoy)
      // La venta se cuenta desde SU mes de entrada, no desde el corte de la
      // edición: así cada modelo se mide sobre su propio tiempo.
      const suyas = porMesDe(historial, codigo, alta.slice(0, 7))
      const piezas = suyas.reduce((a, m) => a + m.piezas, 0) || num(vendidas[codigo])
      const dinero = valorDe(codigo, piezas, precios)
      const costo = num(costos[codigo])
      const e = ex[codigo] ?? { total: 0, plazas: {}, producto: '' }

      modelos.push({
        codigo,
        producto: nombres[codigo] || e.producto || '',
        alta,
        dias: edad,
        piezas,
        dinero,
        // Sin costo capturado no se inventa un margen: la fila se queda sin
        // utilidad y la pantalla lo dice. Es la misma regla de siempre.
        utilidad: costo > 0 && piezas > 0 ? dinero - costo * piezas : null,
        existencia: e.total,
        plazas: e.plazas,
        porMes: suyas,
        // El ritmo es lo que permite compararlos: piezas por cada 30 días
        // desde que llegó. Null cuando todavía no hay con qué medir.
        ritmo: edad !== null && edad >= DIAS_PARA_OPINAR ? (piezas / edad) * 30 : null,
        sinMedir: edad === null || edad < DIAS_PARA_OPINAR,
      })
    }

    modelos.sort((a, b) =>
      (b.ritmo ?? -1) - (a.ritmo ?? -1)
      || b.piezas - a.piezas
      || String(a.producto).localeCompare(String(b.producto)))

    const medidos = modelos.filter(m => !m.sinMedir)
    const venden = medidos.filter(m => m.piezas > 0)
    const mudos = medidos.filter(m => m.piezas === 0)

    return {
      n: k + 1,
      desde: lote.hasta,
      hasta: lote.desde,
      dias: diasEntre(lote.desde, hoy),
      goteo: Boolean(lote.goteo),
      etiqueta: lote.goteo ? 'Entradas sueltas'
        : k === 0 ? 'La última edición' : k === 1 ? 'La anterior' : `${k + 1} ediciones atrás`,
      modelos,
      resumen: {
        modelos: modelos.length,
        medidos: medidos.length,
        sinMedir: modelos.length - medidos.length,
        venden: venden.length,
        mudos: mudos.length,
        // La parte que vende se calcula sobre los MEDIDOS. Metiendo los que
        // acaban de llegar, cada edición nueva parecería peor que la
        // anterior sólo por ser nueva.
        parte: medidos.length ? venden.length / medidos.length : null,
        piezas: modelos.reduce((a, m) => a + m.piezas, 0),
        dinero: modelos.reduce((a, m) => a + m.dinero, 0),
        // Lo que sigue en el mostrador de los que NO han vendido: es el
        // dinero que la edición dejó parado, y la cifra que decide si la
        // siguiente se compra igual.
        existenciaMuda: mudos.reduce((a, m) => a + m.existencia, 0),
        dineroMudo: mudos.reduce((a, m) => a + valorDe(m.codigo, m.existencia, precios), 0),
      },
    }
  })

  let sinFecha = 0
  for (const d of Object.values(altas)) if (!d?.alta) sinFecha++

  return { cohortes, sinFecha, sueltos, hayLotes: lotes.length > 0 }
}

/**
 * La comparación entre dos ediciones, que es lo que se preguntó.
 *
 * Devuelve null con menos de dos ediciones medibles: con una sola no hay
 * comparación, y enseñar «+0%» contra la nada se lee como que no cambió.
 */
export function comparaEdiciones(cohortes) {
  const [a, b] = cohortes ?? []
  if (!a || !b) return null
  if (!a.resumen.medidos || !b.resumen.medidos) return null
  return {
    parteAhora: a.resumen.parte,
    parteAntes: b.resumen.parte,
    // En puntos, no en porcentaje de porcentaje: pasar del 40% al 50% es
    // «diez puntos más», y decir «un 25% mejor» de dos porcentajes es la
    // forma más fácil de que un número suene al doble de lo que es.
    puntos: (a.resumen.parte - b.resumen.parte) * 100,
    ritmoAhora: medianaRitmo(a.modelos),
    ritmoAntes: medianaRitmo(b.modelos),
  }
}

/**
 * La MEDIANA del ritmo, no el promedio.
 *
 * Un solo modelo que se vende como churros levanta el promedio de toda una
 * edición y la hace parecer buena cuando el resto está parado. Es la misma
 * lección que ya costó una vez en los precios.
 */
export function medianaRitmo(modelos) {
  const r = (modelos ?? []).filter(m => !m.sinMedir).map(m => m.ritmo).sort((x, y) => x - y)
  if (!r.length) return null
  const m = Math.floor(r.length / 2)
  return r.length % 2 ? r[m] : (r[m - 1] + r[m]) / 2
}
