// Estadísticas de movimiento a partir de los inventarios publicados.
//
// No hay registro de ventas: lo único que existe son fotos del inventario, una
// por día. Comparando dos fotos consecutivas se deduce qué salió.
//
// LÍMITE IMPORTANTE, y hay que tenerlo presente al leer los números:
// si un modelo baja de 5 a 2 y ese mismo día entran 6 de resurtido, la foto
// siguiente marca 8 y esta cuenta registra 0 salidas en vez de 3. Con una foto
// diaria no hay forma de separar las dos cosas. Por eso los números son un
// PISO de lo vendido, nunca una cifra exacta, y se nombran "salidas" y no
// "ventas".

export const DIAS_QUE_SE_GUARDAN = 60

/** Clave estable de un producto: el código, y el nombre solo si no hay código. */
export function claveDe(p) {
  const c = String(p?.Codigo ?? '').trim()
  return c || `nombre:${String(p?.Producto ?? '').trim().toUpperCase()}`
}

/** Índice clave → { producto, existencia } de una foto de inventario. */
export function indexar(json) {
  const m = new Map()
  for (const p of json?.productos ?? []) {
    const k = claveDe(p)
    if (!k || k === 'nombre:') continue
    m.set(k, { producto: String(p.Producto ?? '').trim(), existencia: Number(p.Existencia) || 0 })
  }
  return m
}

/**
 * Compara dos fotos y devuelve lo que salió de cada producto.
 *
 * Solo cuentan las bajas. Una subida es resurtido, y sumarla como movimiento
 * mezclaría dos cosas distintas. Los productos que aparecen por primera vez no
 * cuentan: no se sabe si es alta o si estaban antes con otro código.
 */
export function salidasEntre(fotoAnterior, fotoNueva) {
  const antes = indexar(fotoAnterior)
  const ahora = indexar(fotoNueva)
  const salidas = {}
  const catalogo = {}

  for (const [k, a] of antes) {
    const n = ahora.get(k)
    if (!n) continue                       // dejó de existir: no es una salida
    const baja = a.existencia - n.existencia
    if (baja > 0) {
      salidas[k] = baja
      catalogo[k] = n.producto || a.producto
    }
  }
  return { salidas, catalogo }
}

/** Estructura vacía, para la primera vez que se genera el archivo. */
export function estadisticaVacia(slug, nombre) {
  return { sucursal: slug, nombre, actualizado: null, catalogo: {}, dias: [] }
}

/**
 * Agrega un día al historial. Si ese día ya estaba, lo reemplaza, para que
 * volver a correr la sincronización no duplique ni sume dos veces.
 */
export function agregarDia(estad, fecha, salidas, catalogo) {
  const dias = (estad.dias ?? []).filter(d => d.f !== fecha)
  dias.push({ f: fecha, m: salidas })
  dias.sort((a, b) => a.f.localeCompare(b.f))

  const corte = dias.slice(-DIAS_QUE_SE_GUARDAN)
  const vivos = new Set(corte.flatMap(d => Object.keys(d.m)))

  // El catálogo solo conserva los códigos que siguen apareciendo, para que el
  // archivo no crezca sin control con productos que ya no se mueven.
  const cat = {}
  for (const [k, v] of Object.entries({ ...(estad.catalogo ?? {}), ...catalogo })) {
    if (vivos.has(k)) cat[k] = v
  }

  return { ...estad, actualizado: new Date().toISOString(), catalogo: cat, dias: corte }
}

// ── Historial permanente por periodo ──────────────────────────────────────────
//
// El detalle diario solo vive 60 días, porque es lo que alimenta las gráficas.
// Lo que sí se guarda para siempre es el acumulado por mes: una línea por
// modelo y mes con cuántas piezas salieron. Ocupa una fracción de lo que
// ocupaban las copias completas del inventario y responde la pregunta que
// importa a la larga, qué se movió en tal periodo.

export function historialVacio(slug, nombre) {
  return { sucursal: slug, nombre, actualizado: null, catalogo: {}, periodos: [] }
}

/** Suma un día al mes que le corresponde. Reemplaza si ese día ya se contó. */
export function acumularEnPeriodo(historial, fecha, salidas, catalogo) {
  const mes = fecha.slice(0, 7)
  const periodos = [...(historial.periodos ?? [])]
  let p = periodos.find(x => x.p === mes)

  if (!p) {
    p = { p: mes, m: {}, dias: [] }
    periodos.push(p)
  }

  // Si el día ya estaba contado no se suma dos veces: volver a correr la
  // sincronización no debe inflar el mes.
  if (p.dias.includes(fecha)) return historial

  for (const [k, n] of Object.entries(salidas)) p.m[k] = (p.m[k] || 0) + n
  p.dias = [...p.dias, fecha].sort()

  periodos.sort((a, b) => a.p.localeCompare(b.p))

  return {
    ...historial,
    actualizado: new Date().toISOString(),
    catalogo: { ...(historial.catalogo ?? {}), ...catalogo },
    periodos,
  }
}

/** Filas listas para exportar: una por modelo y periodo. */
export function filasDePeriodo(historial, periodo) {
  const p = (historial?.periodos ?? []).find(x => x.p === periodo)
  if (!p) return []
  return Object.entries(p.m)
    .map(([codigo, salidas]) => ({
      codigo: codigo.startsWith('nombre:') ? '' : codigo,
      producto: historial?.catalogo?.[codigo] || codigo.replace(/^nombre:/, ''),
      salidas,
    }))
    .sort((a, b) => b.salidas - a.salidas || a.producto.localeCompare(b.producto))
}

/** Los meses que tienen datos, del más reciente al más viejo. */
export function periodosDisponibles(historial) {
  return (historial?.periodos ?? [])
    .map(p => ({
      periodo: p.p,
      dias: p.dias?.length ?? 0,
      total: Object.values(p.m ?? {}).reduce((s, n) => s + n, 0),
      modelos: Object.keys(p.m ?? {}).length,
    }))
    .sort((a, b) => b.periodo.localeCompare(a.periodo))
}

/**
 * Resume el historial en los últimos N días.
 * Devuelve el ranking de modelos y la serie diaria para la gráfica.
 */
export function resumir(estad, dias = 30, hoy = new Date()) {
  const desde = new Date(hoy)
  desde.setDate(desde.getDate() - (dias - 1))
  const limite = desde.toISOString().slice(0, 10)

  const enRango = (estad?.dias ?? []).filter(d => d.f >= limite)

  const porCodigo = {}
  for (const d of enRango) {
    for (const [k, n] of Object.entries(d.m ?? {})) {
      porCodigo[k] = (porCodigo[k] || 0) + n
    }
  }

  const ranking = Object.entries(porCodigo)
    .map(([codigo, salidas]) => ({
      codigo: codigo.startsWith('nombre:') ? '' : codigo,
      producto: estad?.catalogo?.[codigo] || codigo.replace(/^nombre:/, ''),
      salidas,
    }))
    .sort((a, b) => b.salidas - a.salidas || a.producto.localeCompare(b.producto))

  // Serie continua, con ceros en los días sin dato, para que la gráfica no
  // mienta juntando días separados como si fueran consecutivos.
  const serie = []
  for (let i = dias - 1; i >= 0; i--) {
    const f = new Date(hoy)
    f.setDate(f.getDate() - i)
    const iso = f.toISOString().slice(0, 10)
    const dia = enRango.find(d => d.f === iso)
    serie.push({ fecha: iso, salidas: dia ? Object.values(dia.m ?? {}).reduce((s, n) => s + n, 0) : 0 })
  }

  return {
    ranking,
    serie,
    totalSalidas: ranking.reduce((s, r) => s + r.salidas, 0),
    modelosConMovimiento: ranking.length,
    diasConDato: enRango.length,
  }
}

// ── Consolidado y comparación entre periodos ─────────────────────────────────
//
// Todo lo de abajo trabaja sobre el historial permanente por mes, no sobre el
// detalle diario. Ahí está el acumulado completo, así que se puede mirar tan
// atrás como haya datos sin volver a leer los inventarios.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "2026-09" → "septiembre 2026" */
export function nombreDePeriodo(p) {
  const [a, m] = String(p).split('-')
  return `${MESES[Number(m) - 1] ?? m} ${a}`
}

/** Los n meses que terminan en `periodo`, del más viejo al más nuevo. */
export function mesesHaciaAtras(periodo, n) {
  const [a, m] = String(periodo).split('-').map(Number)
  const salida = []
  for (let i = n - 1; i >= 0; i--) {
    // Date normaliza los meses negativos, así que enero menos dos cae en
    // noviembre del año anterior sin tener que hacer la cuenta a mano.
    const d = new Date(Date.UTC(a, m - 1 - i, 1))
    salida.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return salida
}

/** Etiqueta de un rango: un mes solo, o "abril 2026 a septiembre 2026". */
export function etiquetaDeRango(periodos) {
  if (!periodos?.length) return ''
  if (periodos.length === 1) return nombreDePeriodo(periodos[0])
  return `${nombreDePeriodo(periodos[0])} a ${nombreDePeriodo(periodos[periodos.length - 1])}`
}

/** Suma las piezas de los meses indicados. */
export function totalesDe(historial, periodos) {
  const dentro = new Set(periodos)
  const total = {}
  let dias = 0
  for (const p of historial?.periodos ?? []) {
    if (!dentro.has(p.p)) continue
    dias += p.dias?.length ?? 0
    for (const [k, n] of Object.entries(p.m ?? {})) total[k] = (total[k] || 0) + n
  }
  return { total, dias }
}

/**
 * Compara los últimos `meses` contra los `meses` inmediatamente anteriores.
 *
 * El ancla es el mes más reciente CON DATO, no el del calendario: si la
 * sincronización lleva semanas caída, se compara lo que de verdad existe en
 * lugar de enseñar un periodo vacío.
 */
export function comparativo(historial, meses) {
  const conDato = (historial?.periodos ?? []).map(p => p.p).sort()
  if (conDato.length === 0) return null

  const actuales = mesesHaciaAtras(conDato[conDato.length - 1], meses)
  const previos  = mesesHaciaAtras(actuales[0], meses + 1).slice(0, meses)

  const a = totalesDe(historial, actuales)
  const b = totalesDe(historial, previos)

  const filas = Object.entries(a.total)
    .map(([codigo, salidas]) => {
      const antes = b.total[codigo] ?? 0
      return {
        codigo:   codigo.startsWith('nombre:') ? '' : codigo,
        producto: historial?.catalogo?.[codigo] || codigo.replace(/^nombre:/, ''),
        salidas,
        antes,
        delta: salidas - antes,
        // Sin base previa no hay porcentaje que calcular: pasar de 0 a 4 no es
        // "subió infinito", es un modelo que antes no se movía.
        pct: antes > 0 ? Math.round(((salidas - antes) / antes) * 100) : null,
      }
    })
    .sort((x, y) => y.salidas - x.salidas || x.producto.localeCompare(y.producto))

  const total       = Object.values(a.total).reduce((s, n) => s + n, 0)
  const totalPrevio = Object.values(b.total).reduce((s, n) => s + n, 0)

  return {
    periodos: actuales,
    periodosPrevios: previos,
    etiqueta:       etiquetaDeRango(actuales),
    etiquetaPrevia: etiquetaDeRango(previos),
    filas,
    total,
    totalPrevio,
    delta: total - totalPrevio,
    pct: totalPrevio > 0 ? Math.round(((total - totalPrevio) / totalPrevio) * 100) : null,
    dias: a.dias,
    diasPrevios: b.dias,
    hayPrevio: previos.some(p => conDato.includes(p)),
  }
}

/** Une varias sucursales en un solo historial, para la vista consolidada. */
export function consolidarHistorial(historiales, nombre = 'Todas las sucursales') {
  const vivos = (historiales ?? []).filter(Boolean)
  if (vivos.length === 0) return null

  const catalogo = {}
  const porMes = new Map()

  for (const h of vivos) {
    Object.assign(catalogo, h.catalogo ?? {})
    for (const p of h.periodos ?? []) {
      const acc = porMes.get(p.p) ?? { p: p.p, m: {}, dias: new Set() }
      for (const [k, n] of Object.entries(p.m ?? {})) acc.m[k] = (acc.m[k] || 0) + n
      // Los días se unen, no se suman: si las tres sucursales reportaron el
      // mismo día, sigue siendo un día con dato, no tres.
      for (const d of p.dias ?? []) acc.dias.add(d)
      porMes.set(p.p, acc)
    }
  }

  const periodos = [...porMes.values()]
    .map(p => ({ p: p.p, m: p.m, dias: [...p.dias].sort() }))
    .sort((a, b) => a.p.localeCompare(b.p))

  const sellos = vivos.map(h => h.actualizado).filter(Boolean).sort()

  return { sucursal: 'todas', nombre, actualizado: sellos[sellos.length - 1] ?? null, catalogo, periodos }
}

/** Lo mismo con el detalle diario, para que la gráfica sirva en consolidado. */
export function consolidarEstadisticas(estads, nombre = 'Todas las sucursales') {
  const vivos = (estads ?? []).filter(Boolean)
  if (vivos.length === 0) return null

  const catalogo = {}
  const porFecha = new Map()

  for (const e of vivos) {
    Object.assign(catalogo, e.catalogo ?? {})
    for (const d of e.dias ?? []) {
      const acc = porFecha.get(d.f) ?? {}
      for (const [k, n] of Object.entries(d.m ?? {})) acc[k] = (acc[k] || 0) + n
      porFecha.set(d.f, acc)
    }
  }

  const dias = [...porFecha.entries()]
    .map(([f, m]) => ({ f, m }))
    .sort((a, b) => a.f.localeCompare(b.f))

  const sellos = vivos.map(e => e.actualizado).filter(Boolean).sort()

  return { sucursal: 'todas', nombre, actualizado: sellos[sellos.length - 1] ?? null, catalogo, dias }
}
