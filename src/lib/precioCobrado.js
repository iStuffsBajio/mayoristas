// Lo que la lista dice contra lo que la caja cobró.
//
// ── Por qué hace falta mirarlo ─────────────────────────────────────────────
//
// Todo lo que el panel valora en pesos sale de la LISTA de precios del
// inventario (`promedioEntrePlazas`). Hasta ahora no había con qué comprobar
// esa lista. Con la venta línea por línea sí, y no cuadra:
//
//     plaza            cobrado/lista al público   códigos bajo el 70%
//     León                      101%                      4
//     Ferias                    105%                      5
//     San Luis                   71%                    295
//     Aguascalientes             67%                    247
//
// León y Ferias cobran su lista. San Luis y Aguascalientes cobran un 30%
// menos de lo que su lista dice, y no en cuatro códigos sueltos: en cientos.
// El iPhone 11 en Aguascalientes tiene $250 de lista y se cobra a $128.
//
// Eso significa que **cada peso que el panel calcula para esas dos plazas
// está inflado**, y no por un error de código: por un dato que nadie podía
// contrastar. Es exactamente lo que el dueño pidió aislar —«los modelos que
// tengan un precio diferente posiblemente sea un error, aislarlos y ponerlos
// dentro de la lista de cosas a modificar por sucursal»—.
//
// ── Lo que este archivo NO decide ──────────────────────────────────────────
//
// No dice quién tiene razón. Una brecha puede ser dos cosas distintas:
//
//   · la lista está alta y hay que bajarla, o
//   · el mostrador está regalando margen y hay que sujetarlo.
//
// Las dos se arreglan en la sucursal y las dos empiezan por verlas. El panel
// enseña el número y quien decide es el dueño.
//
// ── Una trampa que ya costó una vuelta ─────────────────────────────────────
//
// El descuento del mayoreo NO se mide dividiendo el total cobrado a mayoreo
// entre el total cobrado al público. Los modelos caros se van casi todos a
// mayoreo y los baratos al mostrador, así que ese cociente puede salir
// invertido sin que ningún precio esté mal. Se mide código contra sí mismo.
// Está hecho así en `precioPorPlaza`, en `ventasTicket.js`.

import { esProtector } from './familias.js'
import { seProduce } from './produccion.js'

/**
 * 🔒 Cuánto puede apartarse lo cobrado de la lista antes de mirarlo.
 *
 * Un 20%: por debajo de eso caben los redondeos, las promociones de un día y
 * el regateo normal del mostrador. Por encima, la lista y la caja están
 * contando cosas distintas.
 */
export const BRECHA = 0.20

/**
 * 🔒 Piezas mínimas para que un código entre.
 *
 * Tres. Con una o dos ventas, una rebaja a un conocido se lee como política
 * de precios de la plaza.
 */
export const PIEZAS_MINIMAS = 3

/** De qué lado cae la brecha. Son dos problemas, no uno con signo. */
export const CASOS = {
  COBRA_MENOS: 'cobra-menos',  // la lista está alta, o se regala margen
  COBRA_MAS:   'cobra-mas',    // la lista está baja: el precio real es otro
}

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)
const clave = v => String(v ?? '').trim().toUpperCase()

/** El precio de lista de cada código de un inventario. */
export function listaDe(inventario) {
  const out = {}
  for (const p of inventario?.productos ?? []) {
    const c = clave(p.Codigo)
    if (!c) continue
    out[c] = {
      producto: String(p.Producto ?? '').trim(),
      publico: num(p.Precio),
      mayoreo: num(p.Mayoreo),
    }
  }
  return out
}

/**
 * Los códigos cuyo precio cobrado se aparta de su lista.
 *
 * `porCodigo` es el de `agregarVentas`; `inventario`, el JSON de esa plaza.
 * Se compara el precio PÚBLICO cobrado contra el público de la lista: el
 * mayoreo depende de con quién se negoció y no es comparable igual.
 */
export function brechaDeLista({
  porCodigo, inventario, umbral = BRECHA, minimo = PIEZAS_MINIMAS,
}) {
  const lista = listaDe(inventario)
  const filas = []
  const razones = []

  for (const [codigo, f] of Object.entries(porCodigo ?? {})) {
    const pzMayoreo = num(f.pzMayoreo)
    const pzPublico = num(f.pz) - pzMayoreo
    if (pzPublico < minimo) continue

    const l = lista[codigo]
    if (!l || !(l.publico > 0)) continue

    const cobrado = (num(f.dinero) - num(f.dineroMayoreo)) / pzPublico
    if (!(cobrado > 0)) continue

    const razon = cobrado / l.publico
    razones.push(razon)
    if (Math.abs(razon - 1) < umbral) continue

    filas.push({
      codigo,
      producto: l.producto || String(f.producto ?? ''),
      // La familia se dice, no se mezcla: una mica fuera de precio y una
      // funda fuera de precio no son el mismo problema.
      familia: seProduce(codigo, l.producto) ? 'produccion'
        : esProtector(codigo, l.producto) ? 'hidrogel' : 'funda',
      piezas: num(f.pz),
      piezasPublico: pzPublico,
      cobrado,
      lista: l.publico,
      razon,
      caso: razon < 1 ? CASOS.COBRA_MENOS : CASOS.COBRA_MAS,
      // Lo que se deja de cobrar -o se cobra de más- en las piezas medidas.
      // Es lo que convierte «un 35% de brecha» en una cantidad que duele.
      pesos: Math.round((cobrado - l.publico) * pzPublico),
    })
  }

  // Lo que más dinero mueve primero, no lo más desviado: un 60% de brecha en
  // tres piezas importa menos que un 25% en cuatrocientas.
  filas.sort((a, b) => Math.abs(b.pesos) - Math.abs(a.pesos))

  return {
    filas,
    // La mediana de TODOS los comparables, no sólo de los desviados: es la que
    // dice si la plaza entera cobra su lista o no.
    razonTipica: razones.length ? mediana(razones) : null,
    comparados: razones.length,
    pesosQueFaltan: filas.filter(f => f.pesos < 0).reduce((a, f) => a - f.pesos, 0),
  }
}

function mediana(xs) {
  const o = [...xs].sort((a, b) => a - b)
  const m = o.length >> 1
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/**
 * 🔒 Los costos invertidos: el costo sale por encima del precio de venta.
 *
 * Esto no es opinable como la brecha: un producto que cuesta más de lo que se
 * vende está mal capturado, punto.
 *
 * Medido el 2026-11-05, y el resultado importa porque no estaba donde se
 * creía: **bodega tiene 552 de 556 productos así, el 99%**, con el costo en
 * mediana a $36 y el precio a $31. Las tiendas están limpias —León 1 de 713,
 * San Luis 0 de 756, Aguascalientes 0 de 783—, lo que confirma por otra vía
 * que el costo bueno es el de bodega sólo como COSTO: sus precios no sirven
 * para nada.
 */
export function costosInvertidos(inventario) {
  const filas = []
  for (const p of inventario?.productos ?? []) {
    const codigo = clave(p.Codigo)
    const costo = num(p.Costo)
    const publico = num(p.Precio)
    if (!codigo || !(costo > 0) || !(publico > 0)) continue
    if (costo <= publico) continue
    filas.push({
      codigo,
      producto: String(p.Producto ?? '').trim(),
      costo,
      publico,
      // Cuánto se pierde por pieza si alguien vende a ese precio.
      perdida: Math.round(costo - publico),
    })
  }
  return filas.sort((a, b) => b.perdida - a.perdida)
}

// ── Lo que de verdad hay que revisar: vender por debajo del mayoreo ────────
//
// Esta parte sustituye a `brechaDeLista` como pantalla. La brecha contra la
// lista no sirve donde la lista no es el precio, y medido el 2026-11-06 en
// Aguascalientes no lo es: de 7,792 líneas al público, sólo **921 —el 12%—**
// se cobraron al precio de lista. El resto se negocia en el mostrador.
//
// Con eso, marcar 116 códigos como «desviados» era marcar casi todos, y el
// dueño lo vio enseguida: «no se está interpretando de la mejor manera».
//
// Lo que sí es accionable es otra cosa. El iPhone 13 tiene lista 250 y
// mayoreo 150, y buena parte de sus ventas «al público» salen justo a 150 o
// a 140: **el mostrador está dando precio de mayoreo sin marcar la casilla**.
// Cuando el precio baja de ahí, se está vendiendo a un cliente suelto más
// barato que a un mayorista, y eso es margen que se va.
//
// En Aguascalientes son 1,243 líneas y 1,367 piezas.

/** 🔒 Pesos por debajo del mayoreo a partir de los cuales se mira. */
export const MARGEN_MAYOREO = 2

/**
 * Códigos vendidos al público por debajo de su propio precio de mayoreo.
 *
 * No compara contra la lista al público —esa no es el precio— sino contra el
 * de mayoreo, que es el suelo que el negocio ya decidió para quien compra en
 * cantidad. Vender por debajo de él a un cliente de mostrador no es negociar:
 * es perder.
 */
export function porDebajoDelMayoreo({
  porCodigo, inventario, minimo = PIEZAS_MINIMAS, margen = MARGEN_MAYOREO,
}) {
  const lista = listaDe(inventario)
  const filas = []
  let comparados = 0

  for (const [codigo, f] of Object.entries(porCodigo ?? {})) {
    const pzMayoreo = num(f.pzMayoreo)
    const pzPublico = num(f.pz) - pzMayoreo
    if (pzPublico < minimo) continue

    const l = lista[codigo]
    if (!l || !(l.mayoreo > 0)) continue

    const cobrado = (num(f.dinero) - num(f.dineroMayoreo)) / pzPublico
    if (!(cobrado > 0)) continue
    comparados++
    if (cobrado >= l.mayoreo - margen) continue

    filas.push({
      codigo,
      producto: l.producto || String(f.producto ?? ''),
      familia: seProduce(codigo, l.producto) ? 'produccion'
        : esProtector(codigo, l.producto) ? 'hidrogel' : 'funda',
      piezas: num(f.pz),
      piezasPublico: pzPublico,
      cobrado,
      mayoreo: l.mayoreo,
      lista: l.publico,
      // Lo que se deja de ganar frente a haber cobrado al menos el mayoreo.
      // Es lo que convierte «vende barato» en una cantidad.
      pesos: Math.round((l.mayoreo - cobrado) * pzPublico),
    })
  }

  filas.sort((a, b) => b.pesos - a.pesos)
  return {
    filas,
    comparados,
    pesos: filas.reduce((a, f) => a + f.pesos, 0),
    piezas: filas.reduce((a, f) => a + f.piezasPublico, 0),
  }
}

/**
 * Cuánto de la venta «al público» va en realidad a precio de mayoreo.
 *
 * Explica por qué la mezcla de mayoreo que enseña el panel se queda corta:
 * esas piezas se cobraron al precio de mayoreo pero sin marcar la casilla, así
 * que cuentan como mostrador. En Aguascalientes son 1,900 piezas.
 */
export function mayoreoSinMarcar({ porCodigo, inventario, margen = MARGEN_MAYOREO }) {
  const lista = listaDe(inventario)
  let piezas = 0, codigos = 0
  for (const [codigo, f] of Object.entries(porCodigo ?? {})) {
    const pzMayoreo = num(f.pzMayoreo)
    const pzPublico = num(f.pz) - pzMayoreo
    if (pzPublico <= 0) continue
    const l = lista[codigo]
    if (!l || !(l.mayoreo > 0)) continue
    const cobrado = (num(f.dinero) - num(f.dineroMayoreo)) / pzPublico
    if (cobrado > 0 && cobrado <= l.mayoreo + margen) { piezas += pzPublico; codigos++ }
  }
  return { piezas, codigos }
}
