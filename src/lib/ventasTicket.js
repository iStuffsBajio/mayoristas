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

/** El departamento que no son productos sino clientes. */
export const DEPTO_MAYORISTAS = 'mayoristas'

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
export function claseDeLinea({ depto }) {
  const d = deptoDe(depto)
  if (d === DEPTO_MAYORISTAS) return 'etiqueta'
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
 */
export function agregarVentas({ tickets, lineas }) {
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

  // Los tickets se cuentan una vez, no una por línea.
  for (const t of tickets ?? []) {
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
    if (!t || esSi(t.cancelado)) {
      if (t) resumen.piezasCanceladas += num(l.cantidad)
      continue
    }

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
    }
    fp.pz += piezas
    fp.dinero += dinero
    fp.ganancia += ganancia
    if (may) { fp.pzMayoreo += piezas; fp.dineroMayoreo += dinero }
    porCodigo.set(c, fp)
  }

  const lista = (mapa, llave) => [...mapa.entries()]
    .map(([k, v]) => ({ [llave]: k, ...v }))
    .sort((a, b) => b.dinero - a.dinero)

  return {
    desde, hasta,
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
