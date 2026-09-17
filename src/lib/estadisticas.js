// Copia compartida con scripts/lib/estadisticas.js. El panel solo usa
// resumir(); las demas funciones las ocupa la sincronizacion.
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
