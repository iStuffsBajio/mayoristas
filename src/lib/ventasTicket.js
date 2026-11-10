// La venta línea por línea, como la registra la caja.
//
// ── Qué añade sobre lo que ya teníamos ──────────────────────────────────────
//
// Hasta ahora la venta se contaba agrupada por mes desde `INVENTARIO_HISTORIAL`:
// piezas por modelo y nada más. Eleventa guarda bastante más en `VENTATICKETS`
// y `VENTATICKETS_ARTICULOS`, y son cosas que no se pueden deducir de un
// agregado mensual:
//
//   · El día y la HORA de cada venta. Cuándo se vende de verdad.
//   · Qué PRECIO se uso: `USA_MAYOREO` por línea.
//   · La ganancia que la caja calculó en ese momento.
//   · Quién cobró, y a qué mayorista se le apunto.
//
// ── El hallazgo que cambia cómo se valora el dinero ─────────────────────────
//
// Medido en el respaldo de León del 2026-10-31 (5,474 tickets, 8,996 líneas,
// del 2025-12-20 al 2026-10-31):
//
//     público   4,852 líneas · 5,960 pz · $576,674
//     MAYOREO   4,144 líneas · 4,309 pz · $614,149   ← 52% del dinero
//
// Y en el mismo código, el mayoreo es un 38% más barato por pieza:
//
//     I13T    público $229 · mayoreo $143   (45 pz contra 104)
//     SGA16T  público $209 · mayoreo $142   (34 pz contra  58)
//     I15PMT  público $206 · mayoreo $142   (43 pz contra  33)
//
// En los modelos que mueven, DOS DE CADA TRES PIEZAS salen a mayoreo. Valorar
// todo al precio público -o al promedio de público y mayoreo, que es lo que
// hace hoy la pestaña de Ventas- infla el dinero. Aquí no hace falta estimar
// nada: la caja apuntó qué precio cobró en cada línea.
//
// ── Dos trampas medidas, y las dos silenciosas ─────────────────────────────
//
// **Los booleanos de Eleventa son `'t'`/`'f'`, no 1/0.** Comparar contra 1
// no devuelve cero filas: revienta la consulta entera con «conversion error
// from string "t"». Da igual para leer, pero al escribir una consulta nueva
// cuesta una corrida.
//
// **Los tickets CANCELADOS siguen teniendo sus líneas.** En León hay 67
// cancelados con 164 piezas. Sumar las líneas sin mirar el ticket las cuenta
// como venta, y la cifra sale alta sin que nada parezca roto.
//
// ── Lo que parecía un agujero del 29% y no lo era ──────────────────────────
//
// Los tickets de León dan 10,105 piezas y el historial que publicamos 7,184.
// La diferencia -2,921- está entera en productos que NO aparecen en
// `INVENTARIO_HISTORIAL` porque llevan `USA_INVENTARIO = 'f'`:
//
//     MAYORISTAS  2,368 pz  pero sólo $24   ← no es mercancía
//     stikers       614 pz        $5,710    ← si es venta, sin inventario
//
// El departamento MAYORISTAS no son productos: son **los clientes mayoristas
// dados de alta COMO si fueran productos** -con su nombre y su local, al
// estilo «NOMBRE PLAZA (1234)»- y se añaden a la venta para apuntar de quién
// es el ticket. Por eso suman piezas y no suman dinero.
//
// Los nombres de verdad no van en el codigo: son la lista de clientes del
// negocio, viven en `ventas/<plaza>.json` -prefijo privado- y este archivo va
// en git. Aqui y en las pruebas se usan ejemplos inventados.
//
// Asi que el historial publicado está BIEN al no contarlos. Lo que hay que no
// hacer es sumarlos aquí como si fueran fundas: una «pieza» de MAYORISTAS es
// una etiqueta, y contarla inflaría todo.
//
// Y de paso resuelve una pregunta que llevaba abierta: a qué mayorista se le
// vendió cada ticket se puede saber, y está en uso.

// La clasificacion no se repite aqui: `produccion.js` conoce los stickers y
// `familias.js` las micas y el hidrogel, los dos por CODIGO y con el nombre
// como red de seguridad -y el patron ya acepta las erratas del catalogo de
// verdad, HIDRIOGEL y HODROGEL-. Duplicarla era garantizar que una se quedara
// atras.
import { seProduce } from './produccion.js'
import { esProtector } from './familias.js'

/**
 * 🔒 Descuento a partir del cual una línea deja de ser un precio.
 *
 * 80%. Por debajo es una venta negociada —en Aguascalientes la mitad lo
 * son— y cuenta. Por encima no es una venta a un precio: es un regalo, una
 * reposición de garantía o una corrección metida por caja.
 *
 * Medido el 2026-11-06 en Aguascalientes: **255 líneas cobradas a $1 con el
 * 100% de descuento**. En el iPhone 13 son 2 piezas de 44 y bajan su precio
 * medio de $175 a $167, un 5%. Lo detectó el dueño mirando el kárdex.
 *
 * No se tiran en silencio: se cuentan en `resumen.noSonPrecio`, porque un
 * montón de ventas a un peso es un dato por sí solo.
 */
export const DESCUENTO_MAXIMO = 80

/** El departamento que no son productos sino clientes. */
export const DEPTO_MAYORISTAS = 'mayoristas'

/**
 * Cómo se llama ese departamento según la plaza.
 *
 * Torreón lo tiene en SINGULAR —«MAYORISTA»—, y con sólo el plural su cliente
 * se habría contado como una funda y habría salido publicado en el inventario
 * PÚBLICO con nombre y apellido. Un departamento mal escrito en una caja no es
 * un caso raro: es lo normal, porque lo teclea quien da de alta.
 */
export const DEPTOS_MAYORISTAS = new Set([DEPTO_MAYORISTAS, 'mayorista'])

/**
 * 🔒 El precio con el que el punto de venta apunta a un mayorista: $0.01.
 *
 * Lo definió el dueño el 2026-11-09: todo lo que se procese a $0.01 es del
 * esquema de mayoristas y NO es una pieza vendida. Sirve de segunda red
 * detrás del departamento, que es lo que falla cuando alguien lo escribe
 * distinto. Medido en León: 2,368 «piezas» que valen $24 en total.
 */
export const PRECIO_DE_ETIQUETA = 0.01

/** ¿Este precio unitario es el de una etiqueta de mayorista? */
export const esPrecioDeEtiqueta = v =>
  Number.isFinite(Number(v)) && Math.abs(Number(v) - PRECIO_DE_ETIQUETA) < 0.005

/** Lo que se vende sin tener inventario: bodega lo imprime cuando hace falta. */
export const DEPTO_STICKERS = 'stikers'

const limpio = v => String(v ?? '').trim()
const clave = v => limpio(v).toUpperCase()
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)
const esSi = v => limpio(v).toLowerCase() === 't' || v === true || v === 1

/** Un departamento normalizado para comparar, sin acentos ni mayúsculas. */
export const deptoDe = v => limpio(v).toLowerCase()

/**
 * Qué es cada línea. Son tres cosas distintas y mezclarlas falsea todo.
 *
 *   · `etiqueta`   un cliente mayorista apuntado como producto. No es venta.
 *   · `sin-stock`  venta de verdad, pero sin inventario (stickers).
 *   · `producto`   lo demás: mercancía con existencia.
 */
export function claseDeLinea({ depto, cantidad, total } = {}) {
  const d = deptoDe(depto)
  if (DEPTOS_MAYORISTAS.has(d)) return 'etiqueta'
  // Segunda red: el precio. Una línea cuyas piezas cuestan $0.01 cada una no
  // es una venta, sea cual sea el departamento que alguien le puso. Hace falta
  // que haya piezas y dinero: una línea en cero no es una etiqueta, es otra
  // cosa que ya se cuenta aparte.
  const piezas = num(cantidad)
  if (piezas > 0 && num(total) > 0 && esPrecioDeEtiqueta(num(total) / piezas)) return 'etiqueta'
  if (d === DEPTO_STICKERS) return 'sin-stock'
  return 'producto'
}

/**
 * La hora local de una marca de tiempo de Eleventa.
 *
 * Llegan como «2026-10-31 15:03:02.0000», en hora local y sin zona. Pasarlas
 * por `new Date()` las trataría como UTC en algunos motores y la gráfica de
 * horas saldría corrida seis posiciones, que es un error que no se nota: la
 * curva sigue teniendo forma de curva.
 */
export function horaDe(cuando) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(limpio(cuando))
  if (!m) return null
  return { dia: `${m[1]}-${m[2]}-${m[3]}`, hora: Number(m[4]), minuto: Number(m[5]) }
}

/** El día de la semana, 0 = domingo, calculado sin zonas horarias. */
export function diaSemanaDe(dia) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(limpio(dia))
  if (!m) return null
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()
}

const vacio = () => ({ tickets: 0, piezas: 0, dinero: 0, ganancia: 0 })

/**
 * Agrega las líneas de venta de una plaza.
 *
 * `tickets` es una lista de `{ id, folio, cuando, cancelado, cajero, cliente }`
 * y `lineas` de `{ ticket, codigo, producto, depto, cantidad, total, ganancia,
 * mayoreo }`. Devuelve sólo agregados: el detalle crudo no se publica, porque
 * son miles de renglones y porque lleva nombres.
 *
 * ── `desde` NO es un lujo: sin él los precios no se pueden comparar ────────
 *
 * El historial de cada plaza arranca un día distinto —Aguascalientes 2019-11,
 * San Luis 2020-03, León 2025-12— y los precios han subido. Medido, dinero por
 * pieza:
 *
 *                   2021   2022   2023   2024   2025   2026
 *     San Luis      $108   $123   $124   $134   $148   $152
 *     Aguascalientes   —    $66   $120   $146   $147   $137
 *     León             —      —      —      —   $151   $152
 *
 * El 92% de las piezas de San Luis son de antes de 2026, así que su precio
 * medio de TODO el historial —$83 en Aguascalientes— no es su precio: es el de
 * hace tres años. Comparar eso con los once meses de León decía que
 * Aguascalientes vende a mitad de precio, y no es verdad. Y comparado contra
 * la lista de HOY daba una «diferencia» de más de un millón y medio de pesos
 * que era, casi toda, cinco años de subidas de precio.
 *
 * Por eso cualquier cuenta de PRECIO se hace con ventana. El acumulado de todo
 * el historial sigue valiendo para contar piezas y para la temporada, donde lo
 * viejo no estorba.
 */
export function agregarVentas({ tickets, lineas, desdeDia = null }) {
  const porId = new Map()
  for (const t of tickets ?? []) porId.set(String(t.id), t)

  const resumen = { ...vacio(), cancelados: 0, piezasCanceladas: 0, lineas: 0 }
  const porHora = new Map()
  const porDiaSemana = new Map()
  const porDia = new Map()
  const porCodigo = new Map()
  const porMayorista = new Map()
  const porCajero = new Map()
  let desde = null, hasta = null

  const dentro = t => {
    if (!desdeDia) return true
    const h = horaDe(t.cuando)
    return !!h && h.dia >= desdeDia
  }

  // Los tickets se cuentan una vez, no una por línea.
  for (const t of tickets ?? []) {
    if (!dentro(t)) continue
    if (esSi(t.cancelado)) { resumen.cancelados++; continue }
    resumen.tickets++
    const h = horaDe(t.cuando)
    if (!h) continue
    if (!desde || h.dia < desde) desde = h.dia
    if (!hasta || h.dia > hasta) hasta = h.dia

    const porHoraFila = porHora.get(h.hora) ?? vacio()
    porHoraFila.tickets++
    porHora.set(h.hora, porHoraFila)

    const d = diaSemanaDe(h.dia)
    if (d !== null) {
      const fila = porDiaSemana.get(d) ?? vacio()
      fila.tickets++
      porDiaSemana.set(d, fila)
    }
    if (t.cajero) {
      const fila = porCajero.get(limpio(t.cajero)) ?? vacio()
      fila.tickets++
      porCajero.set(limpio(t.cajero), fila)
    }
  }

  for (const l of lineas ?? []) {
    const t = porId.get(String(l.ticket))
    // Una línea sin su ticket no se puede fechar ni saber si se cancelo. No
    // se cuenta: suponerla viva es lo que infla la cifra.
    if (t && !dentro(t)) continue
    if (!t || esSi(t.cancelado)) {
      if (t) resumen.piezasCanceladas += num(l.cantidad)
      continue
    }

    // Una línea con descuento extremo no es un precio. Entra en el conteo de
    // piezas -se vendió de verdad- pero no en ningún promedio de precio, que
    // es donde hace daño.
    const descuento = num(l.descuento)
    const esPrecio = descuento < DESCUENTO_MAXIMO

    const clase = claseDeLinea(l)
    const piezas = num(l.cantidad)
    const dinero = num(l.total)
    const ganancia = num(l.ganancia)
    const may = esSi(l.mayoreo)

    // Un mayorista apuntado como producto es una ETIQUETA, no mercancía: sus
    // «piezas» no se suman a nada y su nombre va a su propia lista.
    if (clase === 'etiqueta') {
      const quien = limpio(l.producto) || clave(l.codigo)
      const fila = porMayorista.get(quien) ?? { tickets: 0, piezas: 0, dinero: 0, ultima: null }
      fila.tickets++
      const h = horaDe(t.cuando)
      if (h && (!fila.ultima || h.dia > fila.ultima)) fila.ultima = h.dia
      porMayorista.set(quien, fila)
      continue
    }

    resumen.lineas++
    resumen.piezas += piezas
    resumen.dinero += dinero
    resumen.ganancia += ganancia
    if (!esPrecio) {
      resumen.noSonPrecio = (resumen.noSonPrecio ?? 0) + 1
      resumen.piezasNoPrecio = (resumen.piezasNoPrecio ?? 0) + piezas
    }

    const h = horaDe(t.cuando)
    if (h) {
      const fh = porHora.get(h.hora) ?? vacio()
      fh.piezas += piezas; fh.dinero += dinero
      porHora.set(h.hora, fh)

      const fd = porDia.get(h.dia) ?? vacio()
      fd.piezas += piezas; fd.dinero += dinero
      porDia.set(h.dia, fd)

      const ds = diaSemanaDe(h.dia)
      if (ds !== null) {
        const f = porDiaSemana.get(ds) ?? vacio()
        f.piezas += piezas; f.dinero += dinero
        porDiaSemana.set(ds, f)
      }
    }
    if (t.cajero) {
      const fc = porCajero.get(limpio(t.cajero)) ?? vacio()
      fc.piezas += piezas; fc.dinero += dinero; fc.ganancia += ganancia
      porCajero.set(limpio(t.cajero), fc)
    }

    const c = clave(l.codigo)
    const fp = porCodigo.get(c) ?? {
      producto: limpio(l.producto), sinStock: clase === 'sin-stock',
      pz: 0, dinero: 0, ganancia: 0, pzMayoreo: 0, dineroMayoreo: 0,
      pzRegalada: 0,
    }
    fp.ganancia += ganancia
    if (!esPrecio) {
      // Se apunta aparte para poder decirlo, y NO entra en pz ni en dinero:
      // si entrara, el precio medio del codigo saldria hundido por dos
      // piezas que nadie vendio a ese precio.
      fp.pzRegalada += piezas
      porCodigo.set(c, fp)
      continue
    }
    fp.pz += piezas
    fp.dinero += dinero
    if (may) { fp.pzMayoreo += piezas; fp.dineroMayoreo += dinero }
    porCodigo.set(c, fp)
  }

  const lista = (mapa, llave) => [...mapa.entries()]
    .map(([k, v]) => ({ [llave]: k, ...v }))
    .sort((a, b) => b.dinero - a.dinero)

  return {
    desde, hasta,
    // La ventana pedida, para que quien lea el archivo sepa si estos numeros
    // son de todo el historial o de un tramo.
    ventanaDesde: desdeDia,
    resumen: {
      ...resumen,
      // Cuánto del dinero sale a precio de mayoreo. Es la cifra que decide si
      // valorar al público engaña, y no se puede deducir de las piezas.
      dineroMayoreo: [...porCodigo.values()].reduce((a, f) => a + f.dineroMayoreo, 0),
      piezasMayoreo: [...porCodigo.values()].reduce((a, f) => a + f.pzMayoreo, 0),
    },
    porHora: [...porHora.entries()].map(([h, v]) => ({ h, ...v })).sort((a, b) => a.h - b.h),
    porDiaSemana: [...porDiaSemana.entries()].map(([d, v]) => ({ d, ...v })).sort((a, b) => a.d - b.d),
    porDia: [...porDia.entries()].map(([f, v]) => ({ f, ...v })).sort((a, b) => a.f.localeCompare(b.f)),
    porCodigo: Object.fromEntries(porCodigo),
    mayoristas: [...porMayorista.entries()]
      .map(([quien, v]) => ({ quien, ...v }))
      .sort((a, b) => b.tickets - a.tickets),
    cajeros: lista(porCajero, 'cajero'),
  }
}

/** La mediana de una lista. Robusta a la linea rara, que en precios abunda. */
function medianaDe(xs) {
  const o = [...xs].sort((a, b) => a - b)
  const m = o.length >> 1
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/**
 * Qué parte del dinero sale a mayoreo, por código.
 *
 * Sirve para valorar: un modelo que sale casi todo a mayoreo no se puede
 * contar al precio público. Devuelve la proporción, no el precio, porque el
 * precio ya viene en el propio dato y no hay que recalcularlo.
 */
export function pesoDelMayoreo(porCodigo) {
  const out = {}
  for (const [c, f] of Object.entries(porCodigo ?? {})) {
    if (!(f.dinero > 0)) continue
    out[c] = {
      dePiezas: f.pz > 0 ? f.pzMayoreo / f.pz : 0,
      deDinero: f.dineroMayoreo / f.dinero,
      // El precio medio de verdad, mezcla incluida. Es lo que hay que usar
      // para valorar, en vez del promedio de las listas de precios.
      precioMedio: f.pz > 0 ? f.dinero / f.pz : null,
    }
  }
  return out
}

// ── El precio promedio por plaza ───────────────────────────────────────────
//
// Es el dato que pidió el dueño, y con sus palabras: «me habla precisamente de
// cuánto vende la sucursal a público versus cuánto vende a mayoreo». No es una
// curiosidad: una plaza que vende casi todo a mayoreo tiene otro negocio que
// una que vende al mostrador, y hasta ahora no se podía ver.
//
// ── Qué queda fuera, y por qué NO es un corte de pesos ─────────────────────
//
// El dueño pidió excluir «los productos que su costo es menor a 100 pesos, por
// ejemplo stickers pequeños y productos adicionales». La intención está clara;
// el corte por pesos no la cumple, medido:
//
//   · **Por COSTO no se puede.** Todo el catálogo de fundas cuesta entre $55 y
//     $60, así que un umbral de $100 por costo deja fuera absolutamente todo.
//     Es la misma lección que ya costó una corrida en `precios.js`.
//
//   · **Por PRECIO deja fuera fundas de verdad.** En Aguascalientes un corte de
//     $100 se lleva el 61% de las piezas: 595 códigos, 25,583 piezas y $1.22M.
//     Entre ellos el IPHONE 7 PLUS a $53, el XR a $76 y el P30 LITE a $52, que
//     son fundas liquidándose baratas, no «productos adicionales». Y al mismo
//     tiempo DEJA DENTRO el hidrogel de privacidad, a $109.
//
// Lo que el dueño quiere decir -stickers y añadidos fuera, fundas dentro- es
// exactamente lo que ya clasifican `produccion.js` y `familias.js`, por CÓDIGO
// y con el nombre como red de seguridad. Así que se usa eso, que además acierta
// con el hidrogel barato y con la funda vieja barata.
//
// El piso en pesos se queda disponible y en CERO: lo único que descarta por
// defecto es el precio cero, que no es un precio sino una línea regalada o mal
// capturada, y que arrastraría el promedio hacia abajo.

/** 🔒 Piso de precio para el promedio. Cero: sólo descarta el precio cero. */
export const PISO_PRECIO = 0

/**
 * El precio promedio de una plaza, separando público de mayoreo.
 *
 * `porCodigo` es el de `agregarVentas`. Devuelve los tres grupos por separado
 * -fundas, protectores y producción- porque mezclarlos es justo lo que el
 * dueño pidió evitar, y porque verlos aparte dice más que esconderlos.
 */
export function precioPorPlaza(porCodigo, { piso = PISO_PRECIO } = {}) {
  const grupo = () => ({
    codigos: 0, pz: 0, dinero: 0,
    pzPublico: 0, dineroPublico: 0, pzMayoreo: 0, dineroMayoreo: 0,
    // Para el descuento, que se mide POR CODIGO y se resume con la MEDIANA.
    // Ver abajo por que no con un promedio.
    razones: [], invertidos: 0,
  })
  const grupos = { fundas: grupo(), protectores: grupo(), produccion: grupo() }

  for (const [codigo, f] of Object.entries(porCodigo ?? {})) {
    const pz = num(f.pz)
    const dinero = num(f.dinero)
    if (pz <= 0) continue
    // Un precio de cero no es un precio: es una linea regalada o mal
    // capturada, y metida en un promedio lo arrastra sin decir nada.
    if (dinero / pz <= piso) continue

    const nombre = String(f.producto ?? '')
    const g = seProduce(codigo, nombre) ? grupos.produccion
      : esProtector(codigo, nombre) ? grupos.protectores
      : grupos.fundas

    g.codigos++
    g.pz += pz
    g.dinero += dinero
    g.pzMayoreo += num(f.pzMayoreo)
    g.dineroMayoreo += num(f.dineroMayoreo)
    g.pzPublico += pz - num(f.pzMayoreo)
    g.dineroPublico += dinero - num(f.dineroMayoreo)

    // ── El descuento se mide POR CODIGO, y esto no es un detalle ───────────
    //
    // Dividiendo los totales de la plaza sale la paradoja de Simpson: los
    // modelos caros se van casi todos a mayoreo y los baratos al mostrador,
    // asi que el promedio «de mayoreo» puede salir MAS ALTO que el «de
    // publico» sin que ningun precio este mal. Paso de verdad: San Luis
    // aparecia con el mayoreo un 9% mas caro y en su lista de precios no hay
    // ni un solo precio invertido, 0 de 780.
    //
    // Comparando cada codigo contra si mismo eso desaparece, porque es el
    // mismo producto en los dos lados.
    const pzMay = num(f.pzMayoreo)
    const pzPub = pz - pzMay
    if (pzMay > 0 && pzPub > 0) {
      const pMay = num(f.dineroMayoreo) / pzMay
      const pPub = (dinero - num(f.dineroMayoreo)) / pzPub
      if (pPub > 0) {
        // Se guarda la RAZON, no el descuento ya calculado: el resumen se
        // hace con la mediana y hace falta la lista entera.
        g.razones.push(pMay / pPub)
        // Un codigo que se cobra MAS CARO a mayoreo que al publico. Eso si es
        // un precio mal puesto, y hay que poder perseguirlo por codigo.
        if (pMay > pPub) g.invertidos++
      }
    }
  }

  const cerrar = g => ({
    ...g,
    precioMedio: g.pz > 0 ? g.dinero / g.pz : null,
    // Los dos precios que de verdad se comparan. `null` cuando esa plaza no
    // vendio nada de ese modo: un cero diria «lo da gratis».
    precioPublico: g.pzPublico > 0 ? g.dineroPublico / g.pzPublico : null,
    precioMayoreo: g.pzMayoreo > 0 ? g.dineroMayoreo / g.pzMayoreo : null,
    // La mezcla, que es lo que distingue una plaza mayorista de una de
    // mostrador.
    mezclaPiezas: g.pz > 0 ? g.pzMayoreo / g.pz : null,
    mezclaDinero: g.dinero > 0 ? g.dineroMayoreo / g.dinero : null,
    // Cuanto mas barato sale el mayoreo, codigo contra si mismo y resumido
    // con la MEDIANA. Dos razones, y las dos se vieron en los datos:
    //
    //   · Dividir el total cobrado a mayoreo entre el total cobrado al
    //     publico da la paradoja de Simpson -los modelos caros se van a
    //     mayoreo y los baratos al mostrador- y el descuento sale invertido
    //     sin que ningun precio este mal.
    //
    //   · Promediar los descuentos por codigo tampoco sirve: la razon no
    //     esta acotada por abajo. Un codigo vendido una vez a $1 al publico
    //     y a $145 a mayoreo aporta un -144, y San Luis salia con un
    //     descuento del -63% teniendo publico $197 y mayoreo $145.
    //
    // La mediana no se mueve por un puñado de lineas raras, que en precios
    // los hay siempre.
    descuento: g.razones.length ? 1 - medianaDe(g.razones) : null,
    // Y aparte, cuantos codigos se cobran mas caro a mayoreo que al publico.
    // Ese numero si senala precios que hay que corregir.
    invertidos: g.invertidos,
  })

  return {
    fundas: cerrar(grupos.fundas),
    protectores: cerrar(grupos.protectores),
    produccion: cerrar(grupos.produccion),
  }
}

/**
 * 🔒 El precio con el que se valora todo: el que de verdad se cobró.
 *
 * Sustituye a `promedioEntrePlazas()`, que promediaba el precio público y el
 * de mayoreo de la LISTA del inventario. Esa lista no es lo que se cobra:
 * Aguascalientes cobra el 75% de la suya, así que cada peso que el panel
 * calculaba para esa plaza venía inflado. Y el promedio de público y mayoreo
 * supone una mezcla 50/50 que no existe en ninguna plaza —León va al 65% de
 * piezas a mayoreo, Ferias al 0%—.
 *
 * Aquí no se supone nada: se divide el dinero cobrado entre las piezas, que
 * ya lleva dentro la mezcla real de cada plaza.
 *
 * `porPlaza` es `{ slug: porCodigo }`, y debe venir de la VENTANA, no del
 * acumulado: los precios subieron un 40% en cinco años.
 *
 * `lista` es el respaldo para los códigos sin venta en la ventana. No se
 * puede prescindir de él: un modelo que no se ha vendido en un año sigue
 * teniendo existencia que vale dinero, y sin precio saldría en cero, que es
 * peor que un precio viejo.
 */
export function preciosDeVenta(porPlaza, { lista = {} } = {}) {
  const suma = {}
  for (const porCodigo of Object.values(porPlaza ?? {})) {
    for (const [codigo, f] of Object.entries(porCodigo ?? {})) {
      const pz = num(f.pz)
      const dinero = num(f.dinero)
      if (pz <= 0 || dinero <= 0) continue
      const a = (suma[codigo] ??= { pz: 0, dinero: 0 })
      a.pz += pz
      a.dinero += dinero
    }
  }

  const out = {}
  // La lista va primero para que el dato de ticket la pise donde lo haya.
  for (const [codigo, precio] of Object.entries(lista)) {
    const v = num(precio?.promedio ?? precio)
    if (v > 0) out[codigo] = { precio: v, de: 'lista', piezas: 0 }
  }
  for (const [codigo, a] of Object.entries(suma)) {
    out[codigo] = { precio: a.dinero / a.pz, de: 'cobrado', piezas: a.pz }
  }
  return out
}

/** El mapa plano que esperan las funciones de `radiografia.js`. */
export const soloPrecios = mapa =>
  Object.fromEntries(Object.entries(mapa ?? {}).map(([c, v]) => [c, v.precio]))

/** Cuánto del valor se apoya en precio cobrado y cuánto en lista. */
export function cobertura(mapa, salidas = {}) {
  let conCobrado = 0, conLista = 0
  for (const [codigo, pz] of Object.entries(salidas)) {
    if (!(pz > 0)) continue
    const v = mapa?.[codigo]
    if (!v) continue
    if (v.de === 'cobrado') conCobrado += pz
    else conLista += pz
  }
  const total = conCobrado + conLista
  return { conCobrado, conLista, total, parte: total > 0 ? conCobrado / total : null }
}
