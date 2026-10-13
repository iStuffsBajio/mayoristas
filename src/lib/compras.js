// Qué comprar para bodega.
//
// Esto no es lo mismo que el surtido a sucursales. Ahí se reparte lo que ya
// hay; aquí se decide qué pedirle al proveedor para que la bodega aguante los
// próximos meses.
//
// La referencia es la misma ventana de meses del año pasado, porque la demanda
// es estacional y comparar contra el mes pasado no dice nada sobre diciembre.
//
// Con una regla encima, y conviene decir bien cuál es, porque la primera
// versión la tenía al revés: una funda no sirve para otro teléfono. La demanda
// del Galaxy A06 NO se cubre comprando A07; quien trae un A06 necesita funda de
// A06. Transferir la demanda hacía que 136 códigos dejaran de comprarse, y 125
// de ellos habían vendido en los últimos seis meses: 1,720 piezas, con el
// iPhone 13 a la cabeza.
//
// La generación anterior sirve para una sola cosa, y es predecir: un modelo
// recién llegado no tiene historial propio, y lo que vendió el que sustituye es
// la mejor pista de cuánto va a venderse. Una generación hacia atrás, no todas
// sumadas.

import { diasDePeriodo } from './estadisticas.js'
import { esTemporadaAlta, MESES_ALTA, mapaDeAltas, diasEnCatalogo } from './surtido.js'
import { seProduce } from './produccion.js'

/** Meses que debe aguantar la bodega. En temporada alta, uno más. */
export const MESES_COBERTURA = { normal: 2, alta: 3 }

/**
 * Parte un código en prefijo, número de modelo y sufijo de tipo de funda.
 *   SGA06T  →  { pre: 'SGA', num: '06', suf: 'T' }
 *   I15PMT  →  { pre: 'I',   num: '15', suf: 'PMT' }
 */
function partirCodigo(codigo) {
  const m = /^([A-Z]+?)(\d+)([A-Z0-9]*)$/.exec(String(codigo || '').toUpperCase())
  return m ? { pre: m[1], num: m[2], suf: m[3] } : null
}

/**
 * Dos modelos son la misma línea si solo cambian en el ÚLTIMO dígito del
 * número. A06 y A07 sí; A06 y A56 no, porque ese 5 es la gama y no la
 * generación.
 */
const familiaDe = p => `${p.pre}|${p.num.slice(0, -1)}|${p.suf}`

/**
 * Qué modelo sustituye a cuál, deducido del catálogo.
 *
 * Sólo la última generación de cada familia y la inmediatamente anterior: el
 * iPhone 17 sustituye al 16, y nada más. Antes mapeaba TODAS las anteriores al
 * último, así que el 17 cargaba con la demanda del 11, 12, 13, 14, 15 y 16
 * juntas —212 piezas sugeridas— mientras esos seis quedaban en cero.
 *
 * No se inventa la aritmética de cada marca, que varía y se equivoca: sólo se
 * mapea cuando la generación nueva EXISTE de verdad en el catálogo y entró
 * después, según la fecha de alta.
 *
 * Esto YA NO mueve demanda de un código a otro. Sirve para saber que un modelo
 * tiene relevo, que es distinto.
 */
export function mapaGeneraciones(productos) {
  const porFamilia = new Map()

  for (const p of productos ?? []) {
    const codigo = String(p.Codigo ?? '').trim()
    const partes = partirCodigo(codigo)
    // Un número de un solo dígito no tiene "último dígito" que separar de la
    // gama, así que esos quedan fuera.
    if (!partes || partes.num.length < 2) continue

    const f = familiaDe(partes)
    if (!porFamilia.has(f)) porFamilia.set(f, [])
    porFamilia.get(f).push({
      codigo,
      producto: String(p.Producto ?? '').trim(),
      num: partes.num,
      alta: p.Alta ?? null,
    })
  }

  const mapa = {}
  const cambios = []

  for (const lista of porFamilia.values()) {
    if (lista.length < 2) continue
    const ord = lista.slice().sort((a, b) => a.num.localeCompare(b.num))
    const nueva = ord[ord.length - 1]
    const previa = ord[ord.length - 2]

    // La fecha de alta tiene que confirmarlo. Sin ella no se mapea: es
    // preferible no opinar que deducir un relevo de la numeración sola.
    if (!previa.alta || !nueva.alta || nueva.alta <= previa.alta) continue
    mapa[previa.codigo] = nueva.codigo
    cambios.push({ de: previa.codigo, deNombre: previa.producto, a: nueva.codigo, aNombre: nueva.producto })
  }

  return { mapa, cambios }
}

/**
 * De cada modelo, la generación inmediatamente anterior que exista.
 *
 * Sirve para lo contrario que el mapa de relevo: cuando un modelo es tan nuevo
 * que no tiene historial propio, lo que vendió su generación anterior es la
 * única pista razonable de cuánto va a venderse. Es justo donde más se falla,
 * porque un modelo recién llegado se agota sin que nadie lo haya previsto.
 */
export function mapaGeneracionAnterior(productos) {
  const porFamilia = new Map()
  for (const p of productos ?? []) {
    const codigo = String(p.Codigo ?? '').trim()
    const partes = partirCodigo(codigo)
    if (!partes || partes.num.length < 2) continue
    const f = familiaDe(partes)
    if (!porFamilia.has(f)) porFamilia.set(f, [])
    porFamilia.get(f).push({ codigo, num: partes.num, producto: String(p.Producto ?? '').trim() })
  }

  const anterior = {}
  for (const lista of porFamilia.values()) {
    const ord = lista.slice().sort((a, b) => a.num.localeCompare(b.num))
    for (let i = 1; i < ord.length; i++) anterior[ord[i].codigo] = ord[i - 1].codigo
  }
  return anterior
}

/** Los n meses que siguen al de hoy, el actual incluido. */
export function mesesSiguientes(n, hoy = new Date()) {
  const salida = []
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth() + i, 1))
    salida.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return salida
}

/** Los mismos meses, un año antes. */
export const unAnioAntes = meses =>
  meses.map(m => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`)

/** Piezas vendidas por código en unos meses, sumando todas las sucursales. */
function demandaDe(historiales, meses) {
  const dentro = new Set(meses)
  const piezas = {}
  const catalogo = {}
  const cubiertos = new Set()
  // Días medidos de cada mes. Se toma el máximo entre plazas y no la suma:
  // cuatro sucursales midiendo el mismo septiembre son 30 días de calendario,
  // no 120. Sin esto el ritmo diario sale dividido entre un número inventado.
  const diasPorMes = {}

  for (const h of (historiales ?? []).filter(Boolean)) {
    Object.assign(catalogo, h.catalogo ?? {})
    for (const p of h.periodos ?? []) {
      const dias = diasDePeriodo(p)
      if (!dentro.has(p.p) || dias <= 0) continue
      cubiertos.add(p.p)
      diasPorMes[p.p] = Math.max(diasPorMes[p.p] ?? 0, dias)
      for (const [k, n] of Object.entries(p.m ?? {})) piezas[k] = (piezas[k] || 0) + n
    }
  }

  return {
    piezas,
    catalogo,
    cubiertos: [...cubiertos].sort(),
    dias: Object.values(diasPorMes).reduce((a, b) => a + b, 0),
  }
}

// ── Plazas con historial corto ───────────────────────────────────────────────
//
// La referencia son los mismos meses del año pasado. El problema: León empezó
// a medirse en enero de 2026, así que para octubre-diciembre de 2025 no tiene
// un solo dato. Contarlo como cero equivale a decir que no vendió nada, y León
// es el 52% de la venta: la compra salía calculada a la mitad.
//
// Lo que sí se puede hacer es estimarlo con su propio ritmo, corregido por la
// temporada que midieron las plazas que sí tienen esos meses.
//
// Con un cuidado, porque no todo hueco es un hueco: ferias no tiene diciembre,
// pero tampoco lo tiene en 2023, 2024 ni 2025. No es que falte el dato, es que
// el puesto no abre en diciembre, y estimarle venta sería inventarla. La
// diferencia está en CUÁNDO empieza su historial: si el mes que falta es
// anterior al primer dato de la plaza, es un hueco; si cae dentro de su
// historial y aun así no está, es un cero de verdad.

/** El primer mes con dato de un historial. */
const inicioDe = h => {
  const ps = (h?.periodos ?? []).filter(p => diasDePeriodo(p) > 0).map(p => p.p).sort()
  return ps[0] ?? null
}

/** Ritmo diario por código de una plaza, sobre todo su historial. */
function ritmoDe(historial) {
  const piezas = {}
  let dias = 0
  for (const p of historial?.periodos ?? []) {
    const d = diasDePeriodo(p)
    if (d <= 0) continue
    dias += d
    for (const [k, n] of Object.entries(p.m ?? {})) piezas[k] = (piezas[k] || 0) + n
  }
  const tasa = {}
  if (dias > 0) for (const [k, n] of Object.entries(piezas)) tasa[k] = n / dias
  return { tasa, dias, total: Object.values(piezas).reduce((a, b) => a + b, 0) }
}

const diasDelMes = m => {
  const [a, mm] = m.split('-').map(Number)
  return new Date(a, mm, 0).getDate()
}

/**
 * Cuánto más se vende en los meses de la referencia que en un mes cualquiera,
 * medido por las plazas que tienen ambos periodos. Si ninguna los tiene,
 * devuelve 1 y no se inventa nada.
 */
function factorDeTemporada(historiales, referencia) {
  let pRef = 0, dRef = 0, pTodo = 0, dTodo = 0
  for (const h of historiales) {
    for (const p of h?.periodos ?? []) {
      const d = diasDePeriodo(p)
      if (d <= 0) continue
      const n = Object.values(p.m ?? {}).reduce((a, b) => a + b, 0)
      pTodo += n; dTodo += d
      if (referencia.includes(p.p)) { pRef += n; dRef += d }
    }
  }
  if (dRef === 0 || dTodo === 0 || pTodo === 0) return 1
  const rRef = pRef / dRef
  const rTodo = pTodo / dTodo
  return rTodo > 0 ? rRef / rTodo : 1
}

/**
 * Estima lo que habrían vendido en la referencia las plazas cuyo historial
 * todavía no llegaba a esos meses.
 */
function estimarFaltantes(historiales, referencia) {
  const vivos = (historiales ?? []).filter(Boolean)
  const cubre = m => h => (h.periodos ?? []).some(p => p.p === m && diasDePeriodo(p) > 0)

  // El factor sale sólo de las plazas que midieron la referencia COMPLETA.
  // Con las que la cubren a medias se deforma: ferias tiene octubre y
  // noviembre de 2025 pero no diciembre, y su temporada fuerte es enero, así
  // que metía un x0.94 donde las tiendas dicen x1.23.
  const completas = vivos.filter(h => referencia.every(m => cubre(m)(h)))
  const factor = factorDeTemporada(completas, referencia)

  const piezas = {}
  const detalle = []

  for (const h of vivos) {
    const inicio = inicioDe(h)
    if (!inicio) continue
    // Sólo los meses anteriores a su primer dato. Un mes posterior sin venta
    // es un cero real.
    const huecos = referencia.filter(m => m < inicio && !cubre(m)(h))
    if (!huecos.length) continue

    const { tasa, dias } = ritmoDe(h)
    if (dias <= 0) continue

    const diasHueco = huecos.reduce((a, m) => a + diasDelMes(m), 0)
    let suma = 0
    for (const [k, t] of Object.entries(tasa)) {
      const n = t * diasHueco * factor
      piezas[k] = (piezas[k] || 0) + n
      suma += n
    }
    detalle.push({
      plaza: h.sucursal ?? h.slug ?? '?',
      nombre: h.nombre ?? h.sucursal ?? '?',
      meses: huecos,
      desde: inicio,
      piezas: Math.round(suma),
    })
  }

  return { piezas, detalle, factor }
}

/**
 * Qué comprar.
 *
 * `historiales` son los de TODAS las sucursales, ferias incluida: la compra se
 * hace para el negocio entero, no para una plaza.
 */
export function calcularCompras({ historiales, productosBodega, hoy = new Date(), margen = 0 }) {
  // La temporada que cuenta es la del periodo QUE SE COMPRA, no la de hoy.
  // Comprando en octubre para noviembre y diciembre hay que cubrir temporada
  // alta, aunque octubre sea un mes normal; mirar el mes actual dejaba el
  // pedido corto justo antes del Buen Fin.
  const dosMeses = mesesSiguientes(MESES_COBERTURA.normal, hoy)
  const alta = dosMeses.some(m => MESES_ALTA.includes(Number(m.slice(5))))
  const nMeses = alta ? MESES_COBERTURA.alta : MESES_COBERTURA.normal

  const objetivo = mesesSiguientes(nMeses, hoy)
  const referencia = unAnioAntes(objetivo)

  const { mapa, cambios } = mapaGeneraciones(productosBodega)
  const { piezas, catalogo, cubiertos, dias } = demandaDe(historiales, referencia)

  // Cuánto de la referencia aporta cada plaza. Hace falta decirlo: León
  // empezó a medirse en enero de 2026, así que para octubre-diciembre de 2025
  // no aporta un solo dato y la compra sale calculada con tres plazas de
  // cuatro. El aviso de «meses faltantes» no lo veía, porque basta que UNA
  // plaza tenga el mes para darlo por cubierto.
  const cobertura = (historiales ?? []).filter(Boolean).map(h => {
    const suyos = (h.periodos ?? []).filter(p => referencia.includes(p.p) && diasDePeriodo(p) > 0)
    return {
      plaza: h.sucursal ?? h.slug ?? '?',
      meses: suyos.map(p => p.p).sort(),
      piezas: suyos.reduce((a, p) => a + Object.values(p.m ?? {}).reduce((x, y) => x + y, 0), 0),
    }
  })
  const sinAportar = cobertura.filter(c => c.meses.length === 0).map(c => c.plaza)

  // Cada código conserva su propia demanda. Transferirla a la generación
  // siguiente dejaba sin comprar cosas que se venden todos los días: una funda
  // de iPhone 13 no se sustituye con una de iPhone 17.
  //
  // A lo medido se le suma lo estimado de las plazas que todavía no existían
  // en la referencia. León es el 52% de la venta y se contaba como cero.
  const estimado = estimarFaltantes(historiales, referencia)
  const demanda = { ...piezas }
  for (const [k, n] of Object.entries(estimado.piezas)) demanda[k] = (demanda[k] || 0) + n

  const enBodega = {}
  const nombres = {}
  for (const p of productosBodega ?? []) {
    const c = String(p.Codigo ?? '').trim()
    if (!c) continue
    enBodega[c] = Number(p.Existencia) || 0
    nombres[c] = String(p.Producto ?? '').trim()
  }

  const filas = Object.entries(demanda)
    .map(([codigo, esperado]) => {
      const objetivoPz = esperado * (1 + margen)
      const existencia = enBodega[codigo] ?? 0
      return {
        codigo,
        producto: nombres[codigo] || catalogo[codigo] || codigo,
        esperado,
        existencia,
        // Un código con demanda que bodega ni siquiera maneja hay que darlo de
        // alta antes de poder comprarlo, y conviene que se note.
        enCatalogo: codigo in enBodega,
        sugerido: Math.max(0, Math.ceil(objetivoPz - existencia)),
      }
    })
    .filter(f => f.esperado > 0)
    .sort((a, b) => b.sugerido - a.sugerido || b.esperado - a.esperado)

  // Modelos que ya tienen relevo en el catálogo. Se siguen comprando —sus
  // clientes existen— pero conviene verlos juntos: es donde tiene sentido
  // moderar el pedido si se nota que la venta va cayendo.
  const conRelevo = Object.entries(piezas)
    .filter(([c]) => mapa[c])
    .map(([c, n]) => ({
      codigo: c,
      producto: nombres[c] || catalogo[c] || c,
      piezas: n,
      sustituto: mapa[c],
      sustitutoNombre: nombres[mapa[c]] || catalogo[mapa[c]] || mapa[c],
      existencia: enBodega[c] ?? 0,
    }))
    .sort((a, b) => b.piezas - a.piezas)

  return {
    filas,
    conRelevo,
    cambios,
    objetivo,
    referencia,
    cubiertos,
    dias,
    cobertura,
    sinAportar,
    // Plazas cuyo aporte a la referencia está estimado y no medido.
    estimadas: estimado.detalle,
    factorTemporada: estimado.factor,
    mapa,
    // Meses de la referencia para los que no hay dato en ninguna sucursal.
    faltantes: referencia.filter(m => !cubiertos.includes(m)),
    nMeses,
    alta,
    totalPiezas: filas.reduce((a, f) => a + f.sugerido, 0),
  }
}

// ── Agotados que cuestan ventas ──────────────────────────────────────────────
//
// Un modelo en cero no siempre es un problema: si es de una generación que ya
// salió del mercado, está bien que se acabe. Lo que hay que cazar es lo otro:
// algo que se vende, que sigue vigente, y que está en cero en varias plazas.
// Eso no es inventario agotándose, es una venta rechazada cada vez que alguien
// lo pide.
//
// La gravedad no sale de una fórmula con pesos inventados, sino de QUÉ hay que
// hacer para arreglarlo, que es lo que de verdad cambia la decisión:
//
//   reparto  — las tiendas en cero pero bodega tiene. Se arregla hoy, enviando.
//   compra   — tiendas y bodega en cero. Hay que pedirle al proveedor.
//   normal   — está en cero pero ya hay generación nueva. No es un descuido.

// Ventana para decidir si un modelo "se vende" hoy. Con todo el historial, la
// lista se llenaba de SAMSUNG NOTE 10 y IPHONE XS MAX: vendieron bien hace
// años, llevan 600 días agotados y nadie los ha repuesto porque ya no se
// piden. Eso no es un descuido, es un producto descontinuado.
export const MESES_RECIENTES = 6

// Ventana corta para la columna de la hoja. Seis meses es demasiado para
// saber si algo se pide HOY, pero no se puede usar la ventana corta para
// filtrar: estos modelos están agotados, así que su venta reciente está
// suprimida por la propia falta de stock. Con tres meses, 50 de 110 renglones
// quedaban en cero —y entre ellos el Moto Edge 50, que lleva 108 días en cero
// y vendía bien antes—. Así que la ventana corta se enseña y la larga decide.
export const MESES_CORTOS = 3

// Y para que los renglones con meses agotados no sean una fila de ceros, se
// mide lo que vendían ANTES de agotarse. Eso es lo que se está perdiendo cada
// mes que siguen así, que es la pregunta de esta hoja.
const MESES_ANTES = 3

export const ESTADO_AGOTADO = {
  REPARTO: 'reparto',
  COMPRA:  'compra',
  NORMAL:  'normal',
}

/**
 * Qué hacer con un renglón de agotados, dicho con precisión.
 *
 * El estado `compra` sólo significa que BODEGA está en cero, y la etiqueta
 * decía «nadie tiene». No es lo mismo: el Galaxy S26 Ultra sale con una plaza
 * en cero de tres, o sea que dos sí tienen, y aun así se leía que no había en
 * ninguna parte. Son dos situaciones con dos salidas distintas: si queda
 * existencia en otra plaza se puede mover hoy; si no queda en ninguna hay que
 * pedirle al proveedor y esperar.
 */
export function queHacerCon(a) {
  if (a.estado === ESTADO_AGOTADO.NORMAL)  return 'Ya hay generación nueva'
  if (a.estado === ESTADO_AGOTADO.REPARTO) return 'Repartir: bodega sí tiene'
  return a.plazasConStock > 0
    ? `Mover de otra plaza o comprar: bodega en cero, ${a.plazasConStock} ${a.plazasConStock === 1 ? 'plaza tiene' : 'plazas tienen'}`
    : 'Comprar: no hay en ninguna parte'
}

/** Días entre una fecha ISO y hoy, o null si no se sabe. */
export function diasDesde(fecha, hoy = new Date()) {
  if (!fecha) return null
  const [a, m, d] = String(fecha).split('-').map(Number)
  if (!a || !m || !d) return null
  return Math.max(0, Math.floor((hoy - new Date(a, m - 1, d)) / 86400000))
}

/**
 * Modelos agotados en las tiendas, con cuánto llevan así y si eso está
 * costando ventas.
 *
 * `inventarios` es { slug: json } de las plazas que venden a mostrador.
 */
export function analizarAgotados({ inventarios, historiales, productosBodega, hoy = new Date() }) {
  const { mapa } = mapaGeneraciones(productosBodega)

  // Dos ventanas: todo el historial para tener contexto, y los últimos meses
  // para decidir si de verdad se sigue pidiendo.
  const corte = new Date(hoy)
  corte.setMonth(corte.getMonth() - MESES_RECIENTES)
  const desde = `${corte.getFullYear()}-${String(corte.getMonth() + 1).padStart(2, '0')}`

  const corte3 = new Date(hoy)
  corte3.setMonth(corte3.getMonth() - MESES_CORTOS)
  const desdeCorto = `${corte3.getFullYear()}-${String(corte3.getMonth() + 1).padStart(2, '0')}`

  const vendidas = {}
  const recientes = {}
  const cortos = {}
  const catalogo = {}
  // Serie mensual por código, para poder mirar hacia atrás desde el día en que
  // cada modelo se agotó, que es distinto para cada uno.
  const porMes = {}
  for (const h of (historiales ?? []).filter(Boolean)) {
    Object.assign(catalogo, h.catalogo ?? {})
    for (const p of h.periodos ?? []) {
      const esReciente = p.p >= desde
      const esCorto = p.p >= desdeCorto
      for (const [k, n] of Object.entries(p.m ?? {})) {
        vendidas[k] = (vendidas[k] || 0) + n
        if (esReciente) recientes[k] = (recientes[k] || 0) + n
        if (esCorto) cortos[k] = (cortos[k] || 0) + n
        ;(porMes[k] ??= {})[p.p] = (porMes[k][p.p] ?? 0) + n
      }
    }
  }

  /** Piezas al mes que vendía en los meses previos a quedarse sin stock. */
  const ritmoAntes = (codigo, diasAgotado) => {
    const serie = porMes[codigo]
    if (!serie) return 0
    // El mes en que se agotó. Sin dato de cuándo, se mira desde hoy.
    const fin = new Date(hoy)
    fin.setDate(fin.getDate() - (diasAgotado ?? 0))
    const meses = []
    for (let i = 1; i <= MESES_ANTES; i++) {
      const d = new Date(fin.getFullYear(), fin.getMonth() - i, 1)
      meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const suma = meses.reduce((a, m) => a + (serie[m] ?? 0), 0)
    return suma / MESES_ANTES
  }

  const enBodega = {}
  const bodegaUltimo = {}
  const nombres = {}
  for (const p of productosBodega ?? []) {
    const c = String(p.Codigo ?? '').trim()
    if (!c) continue
    enBodega[c] = Number(p.Existencia) || 0
    bodegaUltimo[c] = p.UltimoMov ?? null
    nombres[c] = String(p.Producto ?? '').trim()
  }

  const porCodigo = new Map()
  for (const [slug, inv] of Object.entries(inventarios ?? {})) {
    for (const p of inv?.productos ?? []) {
      const c = String(p.Codigo ?? '').trim()
      if (!c) continue
      const e = porCodigo.get(c) ?? {
        codigo: c, producto: String(p.Producto ?? '').trim(),
        enCero: [], conStock: [], total: 0,
      }
      const n = Number(p.Existencia) || 0
      e.total += n
      if (n <= 0) e.enCero.push({ slug, dias: diasDesde(p.UltimoMov, hoy) })
      else e.conStock.push(slug)
      porCodigo.set(c, e)
    }
  }

  const filas = []
  for (const e of porCodigo.values()) {
    if (e.enCero.length === 0) continue

    // Lo que bodega fabrica no se compra: nunca está "agotado".
    if (seProduce(e.codigo, e.producto)) continue

    const vendio = vendidas[e.codigo] ?? 0
    const vendioReciente = recientes[e.codigo] ?? 0
    // Lo que no se ha pedido en los últimos meses no está costando ventas
    // aunque esté en cero: ya no lo buscan.
    if (vendioReciente === 0) continue

    const sucesor = mapa[e.codigo] ?? null
    const bodega = enBodega[e.codigo] ?? 0
    const existeEnBodega = e.codigo in enBodega

    // De las plazas que lo tienen en cero, la que lleva más tiempo así.
    const dias = e.enCero.map(x => x.dias).filter(d => d !== null)
    const diasAgotado = dias.length ? Math.max(...dias) : null

    const estado = sucesor ? ESTADO_AGOTADO.NORMAL
      : bodega > 0        ? ESTADO_AGOTADO.REPARTO
      : ESTADO_AGOTADO.COMPRA

    filas.push({
      codigo: e.codigo,
      producto: e.producto || nombres[e.codigo] || catalogo[e.codigo] || e.codigo,
      enCero: e.enCero.map(x => x.slug),
      plazasEnCero: e.enCero.length,
      plazasConStock: e.conStock.length,
      diasAgotado,
      vendio,
      vendioReciente,
      vendioCorto: cortos[e.codigo] ?? 0,
      vendiaAlMes: ritmoAntes(e.codigo, diasAgotado),
      bodega,
      existeEnBodega,
      bodegaDias: bodega <= 0 ? diasDesde(bodegaUltimo[e.codigo], hoy) : null,
      sucesor,
      sucesorNombre: sucesor ? (nombres[sucesor] || catalogo[sucesor] || sucesor) : null,
      estado,
    })
  }

  // Primero lo que se arregla comprando y lleva más tiempo doliendo, luego lo
  // que solo hay que repartir, y al final lo que tiene relevo.
  const orden = { [ESTADO_AGOTADO.COMPRA]: 0, [ESTADO_AGOTADO.REPARTO]: 1, [ESTADO_AGOTADO.NORMAL]: 2 }
  filas.sort((a, b) =>
    orden[a.estado] - orden[b.estado] ||
    b.vendioReciente - a.vendioReciente ||
    b.plazasEnCero - a.plazasEnCero)

  return {
    filas,
    desde,
    compra:  filas.filter(f => f.estado === ESTADO_AGOTADO.COMPRA),
    reparto: filas.filter(f => f.estado === ESTADO_AGOTADO.REPARTO),
    normal:  filas.filter(f => f.estado === ESTADO_AGOTADO.NORMAL),
  }
}

// ── Compra de bodega, todo en una tabla ──────────────────────────────────────

/**
 * Los últimos n meses, el actual incluido.
 *
 * El mes en curso entra a propósito —es la señal más fresca de qué se está
 * vendiendo— pero va a medias, así que el ritmo tiene que dividirse entre los
 * días realmente medidos y no entre los del calendario. Eso lo resuelve
 * `demandaDe`, que devuelve los días.
 */
function mesesAtras(n, hoy) {
  const salida = []
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth() - i, 1))
    salida.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return salida
}

/**
 * Se considera que un modelo se está agotando antes de lo previsto cuando su
 * ritmo reciente supera al de referencia por este margen. Por debajo es ruido.
 */
const SE_ADELANTA = 1.4

/**
 * Y por debajo de estas piezas en la ventana no se marca nada.
 *
 * Sin este minimo la señal salta con ruido: "va a 0.03 piezas al dia contra
 * 0.02 esperadas" es una pieza de diferencia en dos meses, no una tendencia.
 */
const MINIMO_PARA_MARCAR = 4

/** Meses dentro de los cuales un modelo cuenta como recién llegado. */
export const MESES_NUEVO = 12

/** True si el modelo entró hace poco y lo sabemos con una fecha real. */
function esNuevo(codigo, altas, hoy) {
  const a = altas[codigo]
  if (!a || a.piso) return false
  const d = diasEnCatalogo(a.alta, hoy)
  return d !== null && d <= MESES_NUEVO * 30
}

/**
 * La tabla de compra para bodega, con todo lo que hace falta para decidir en
 * un solo renglón: lo que hay, lo que se vendió, lo que se sugiere comprar, en
 * cuántas plazas está agotado y desde cuándo.
 *
 * Dos cosas que no salen de la cuenta normal:
 *
 * Un modelo recién llegado no tiene historial propio, así que el cálculo lo
 * daría por cero y nadie lo compraría hasta que ya se hubiera agotado. Para
 * esos se usa lo que vendió su generación anterior, que es la única pista
 * razonable, y se dice en las observaciones.
 *
 * Y se marca lo que se está agotando MÁS RÁPIDO de lo que la referencia
 * predecía. Ahí es donde el cálculo se queda corto solo, y suele pasar justo
 * con lo nuevo.
 */
export function calcularCompraBodega({ historiales, inventarios, productosBodega, hoy = new Date(), margen = 0 }) {
  const base = calcularCompras({ historiales, productosBodega, hoy, margen })
  const anterior = mapaGeneracionAnterior(productosBodega)
  // Para saber cuáles son de verdad nuevos. Sin esto, «estimado con la
  // generación anterior» le salía a fundas de iPhone 12 dadas de alta antes
  // de 2023: no tenían venta de referencia, que no es lo mismo que ser nuevas.
  const altas = mapaDeAltas({ ...(inventarios ?? {}), bodega: productosBodega ?? [] })
  const agotados = analizarAgotados({ inventarios, historiales, productosBodega, hoy })
  const porCodigoAgotado = new Map(agotados.filas.map(f => [f.codigo, f]))

  // Venta del mes en curso y el anterior, en todas las plazas, con los días
  // que de verdad se midieron.
  const ventana = mesesAtras(2, hoy)
  const { piezas: recientes, dias: diasVentana } = demandaDe(historiales, ventana)

  // Venta de los últimos seis meses, para no comprar lo que ya nadie pide.
  // La referencia es de hace un año y no se entera de que un modelo murió.
  const { piezas: medioAnio } = demandaDe(historiales, mesesAtras(MESES_RECIENTES, hoy))

  const nombres = {}
  const enBodega = {}
  for (const p of productosBodega ?? []) {
    const c = String(p.Codigo ?? '').trim()
    if (!c) continue
    nombres[c] = String(p.Producto ?? '').trim()
    enBodega[c] = Number(p.Existencia) || 0
  }

  // Todo lo que pueda necesitar compra: lo que ya salió en el cálculo, más lo
  // que está agotado doliendo aunque la referencia no lo viera.
  const codigos = new Set([
    ...base.filas.map(f => f.codigo),
    ...agotados.filas.map(f => f.codigo),
  ])

  const porBase = new Map(base.filas.map(f => [f.codigo, f]))

  const filas = []
  for (const codigo of codigos) {
    if (seProduce(codigo, nombres[codigo] ?? '')) continue

    const b = porBase.get(codigo)
    const ag = porCodigoAgotado.get(codigo)
    const existencia = enBodega[codigo] ?? 0
    const vendidas2m = recientes[codigo] ?? 0

    let esperado = b?.esperado ?? 0
    const obs = []

    // Sin historial propio Y recién llegado: se estima con la generación
    // inmediatamente anterior, una sola. Hace falta que la fecha de alta sea
    // real: si el modelo ya estaba cuando arranca el historial, no hay forma
    // de saber que es nuevo, y no vender es entonces un dato, no un vacío.
    let estimadoDe = null
    if (esperado === 0 && esNuevo(codigo, altas, hoy)) {
      const previo = anterior[codigo]
      const esperadoPrevio = porBase.get(previo)?.esperado ?? 0
      if (previo && esperadoPrevio > 0) {
        esperado = esperadoPrevio
        estimadoDe = previo
        obs.push(`Modelo nuevo: estimado con ${nombres[previo] || previo}`)
      }
    }

    // ¿Se está agotando más rápido de lo que la referencia predecía?
    const ritmoReferencia = base.dias > 0 ? esperado / base.dias : 0
    const ritmoReciente = diasVentana > 0 ? vendidas2m / diasVentana : 0
    const seAdelanta = ritmoReferencia > 0
      && vendidas2m >= MINIMO_PARA_MARCAR
      && ritmoReciente > ritmoReferencia * SE_ADELANTA
    if (seAdelanta) {
      obs.push(`Se agota antes de lo previsto: va a ${ritmoReciente.toFixed(2)} pz/día contra ${ritmoReferencia.toFixed(2)} esperadas`)
      // La referencia se queda corta, así que manda el ritmo de ahora.
      esperado = ritmoReciente * base.nMeses * 30
    }

    if (ag) {
      if (ag.plazasConStock === 0) obs.push(`Agotado en las ${ag.plazasEnCero} plazas`)
      else obs.push(`Agotado en ${ag.plazasEnCero} de ${ag.plazasEnCero + ag.plazasConStock} plazas`)
    }
    if (!(codigo in enBodega)) obs.push('Bodega no maneja este código: hay que darlo de alta')
    const relevo = base.mapa?.[codigo]
    if (relevo) obs.push(`Ya existe ${nombres[relevo] || relevo}: revisar si la venta va bajando`)

    let sugerido = Math.max(0, Math.ceil(esperado * (1 + margen) - existencia))

    // Freno: si no se ha vendido una sola pieza en medio año, la referencia
    // del año pasado está describiendo un modelo que ya murió. Eran 35
    // códigos y 78 piezas, entre ellos fundas de iPhone 7 y Galaxy A03S.
    //
    // Al quedar en cero, el filtro de abajo saca de la tabla a los que
    // tampoco vendieron en los dos últimos meses ni están agotados doliendo.
    // Es lo correcto para una lista de compra; de proponer cuáles dar de baja
    // se encarga la hoja Depurar, que mira otra cosa.
    const sinVentaMedioAnio = (medioAnio[codigo] ?? 0) === 0
    if (sugerido > 0 && sinVentaMedioAnio && !estimadoDe) {
      obs.push(`Sin una sola venta en ${MESES_RECIENTES} meses: la referencia es del año pasado y el modelo pudo salir del mercado`)
      sugerido = 0
    }

    if (sugerido === 0 && vendidas2m === 0 && !ag) continue

    filas.push({
      codigo,
      producto: nombres[codigo] || b?.producto || ag?.producto || codigo,
      existencia,
      enCatalogo: codigo in enBodega,
      vendidas2m,
      esperado,
      sugerido,
      plazasEnCero: ag?.plazasEnCero ?? 0,
      plazasTotal: ag ? ag.plazasEnCero + ag.plazasConStock : 0,
      diasAgotado: ag?.diasAgotado ?? null,
      seAdelanta,
      estimadoDe,
      observaciones: obs.join(' · '),
    })
  }

  // Manda lo que hay que comprar. La marca de "se agota antes" se enseña en su
  // columna y en su propio contador: ponerla a ordenar subía al principio
  // modelos con cero que comprar, que es justo lo que no sirve en una lista de
  // compra.
  filas.sort((a, b2) =>
    b2.sugerido - a.sugerido ||
    (b2.seAdelanta ? 1 : 0) - (a.seAdelanta ? 1 : 0) ||
    b2.vendidas2m - a.vendidas2m)

  return {
    ...base,
    filas,
    ventana,
    adelantados: filas.filter(f => f.seAdelanta),
    nuevosEstimados: filas.filter(f => f.estimadoDe),
    totalPiezas: filas.reduce((a, f) => a + f.sugerido, 0),
  }
}
