// Buscar un código concreto en el movimiento de las sucursales.
//
// ── Por qué la regla vive aquí y no dentro del panel ─────────────────────────
//
// Por lo mismo que `filtrarYBuscar` en `buscar.js`: buscar es ir por un modelo
// concreto, y las pastillas de la pantalla no pueden hacer que desaparezca.
// Aquí la trampa es la misma con otra ropa, y hay dos pastillas puestas a la
// vez: la plaza y el rango. Buscando desde «San Luis · 7 días» un código que
// sólo se movió en León, o que vendió el mes pasado y este no, la respuesta
// sería cero teniendo el dato a la vista.
//
// Por eso la ficha se arma SIEMPRE con todas las plazas y con el archivo por
// mes completo, sin mirar qué pastilla esté puesta. El rango decide qué
// gráfica se dibuja; nunca si el modelo aparece.
//
// El otro cuidado: un código que existe y no se movió NO es «no encontrado».
// Es «no salió ni una pieza», que es un dato, y de los que más duelen. Se
// distinguen a propósito.

import { coincideCon, normalizar } from './buscar.js'
import { salidasPorCodigo, sumarSalidas } from './estadisticas.js'

/** El día de hace `i` días en ISO, calculado igual que lo hace `resumir`. */
function isoHace(hoy, i) {
  const f = new Date(hoy)
  f.setDate(f.getDate() - i)
  return f.toISOString().slice(0, 10)
}

/** Las claves sin código llevan el prefijo `nombre:`. Ahí no hay código. */
const codigoDe = clave => (String(clave).startsWith('nombre:') ? '' : String(clave))
const nombreDe = clave => String(clave).replace(/^nombre:/, '')

/**
 * Catálogo unido de todas las plazas: clave → nombre del producto.
 *
 * Se juntan el detalle diario y el archivo por mes. El diario se recorta a 60
 * días, así que un modelo que vendía en agosto y lleva dos meses parado sólo
 * está en el archivo: buscándolo únicamente en el diario no existiría, que es
 * el caso en el que más importa encontrarlo.
 */
export function catalogoDeVentas(porSucursal) {
  const cat = {}
  for (const par of Object.values(porSucursal ?? {})) {
    Object.assign(cat, par?.hist?.catalogo ?? {}, par?.est?.catalogo ?? {})
  }
  return cat
}

/**
 * Los modelos que coinciden con lo escrito, de todas las plazas.
 *
 * El orden es por parecido y no por piezas: primero el código escrito tal
 * cual, luego los que empiezan por lo escrito, y dentro de cada grupo lo que
 * más salió. Buscar «MU» tiene que dar el código MU en el primer renglón, no
 * enterrarlo bajo los nombres que llevan «mu» en medio.
 */
export function modelosQueCoinciden({ porSucursal, consulta, rango = 60, hoy = new Date(), limite = 20 }) {
  if (!String(consulta ?? '').trim()) return []

  const cat = catalogoDeVentas(porSucursal)
  const movidas = sumarSalidas(
    Object.values(porSucursal ?? {}).map(p => salidasPorCodigo(p?.est, rango, hoy)),
  )
  const buscado = normalizar(consulta)

  const filas = Object.entries(cat).map(([clave, producto]) => ({
    clave,
    codigo: codigoDe(clave),
    producto: producto || nombreDe(clave),
    salidas: movidas[clave] ?? 0,
  }))

  const parecido = f => {
    const c = normalizar(f.codigo)
    if (!c || !buscado) return 2
    if (c === buscado) return 0
    if (c.startsWith(buscado)) return 1
    return 2
  }

  return filas
    .filter(coincideCon(consulta, f => [f.producto, f.codigo]))
    .sort((a, b) => parecido(a) - parecido(b)
      || b.salidas - a.salidas
      || a.producto.localeCompare(b.producto))
    .slice(0, limite)
}

/**
 * Todo lo que se sabe de un código: sus piezas, su plaza, su puesto, su serie
 * diaria y sus meses.
 *
 * `plazas` es la lista de `{ slug, nombre }` que hay que reportar; van todas,
 * también las que salieron en cero. Que en San Luis no se haya movido ninguna
 * es parte de la respuesta, no un hueco que se calle.
 */
export function fichaDeVentas({ porSucursal, clave, plazas, rango = 30, hoy = new Date() }) {
  if (!clave) return null

  const lista = plazas ?? Object.keys(porSucursal ?? {}).map(slug => ({ slug, nombre: slug }))
  const cat = catalogoDeVentas(porSucursal)

  const porPlaza = lista.map(p => {
    const est = porSucursal?.[p.slug]?.est ?? null
    return {
      slug: p.slug,
      nombre: p.nombre,
      salidas: est ? (salidasPorCodigo(est, rango, hoy)[clave] ?? 0) : 0,
      // Sin archivo publicado no es que no se vendiera: es que no se sabe.
      sinDato: !est,
    }
  })

  const total = porPlaza.reduce((s, p) => s + p.salidas, 0)

  // El puesto en el ranking del rango, sumando las plazas. Sin salidas no hay
  // puesto: darle el último lugar diría que compitió, y no corrió.
  const todas = sumarSalidas(lista.map(p => salidasPorCodigo(porSucursal?.[p.slug]?.est, rango, hoy)))
  const ordenadas = Object.entries(todas).sort((a, b) => b[1] - a[1])
  const lugar = total > 0 ? ordenadas.findIndex(([k]) => k === clave) + 1 : null

  // Serie continua, con ceros en los días sin dato: un hueco dibujado como si
  // no existiera junta días que no son consecutivos.
  const porFecha = new Map()
  let ultimo = null
  for (const p of lista) {
    for (const d of porSucursal?.[p.slug]?.est?.dias ?? []) {
      const n = d.m?.[clave]
      if (!n) continue
      porFecha.set(d.f, (porFecha.get(d.f) ?? 0) + n)
      if (!ultimo || d.f > ultimo) ultimo = d.f
    }
  }

  const serie = []
  for (let i = rango - 1; i >= 0; i--) {
    const iso = isoHace(hoy, i)
    serie.push({ fecha: iso, salidas: porFecha.get(iso) ?? 0 })
  }

  // El archivo por mes, con cero en los meses que el modelo no se movió. Un
  // cero entre dos meses con venta es justo lo que hay que ver.
  const meses = new Map()
  for (const p of lista) {
    for (const per of porSucursal?.[p.slug]?.hist?.periodos ?? []) {
      meses.set(per.p, (meses.get(per.p) ?? 0) + (per.m?.[clave] ?? 0))
    }
  }

  return {
    clave,
    codigo: codigoDe(clave),
    producto: cat[clave] || nombreDe(clave),
    total,
    plazas: porPlaza,
    lugar,
    deCuantos: ordenadas.length,
    serie,
    ultimo,
    meses: [...meses.entries()]
      .map(([periodo, salidas]) => ({ periodo, salidas }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo)),
  }
}
