// Lectura de los archivos públicos del bucket.
//
// Este módulo YA NO TIENE CREDENCIALES, y no debe volver a tenerlas. Antes
// construía un cliente de S3 con la llave de acceso y el secreto, y Vite los
// compilaba dentro del JavaScript que descarga cualquier visitante: la llave
// daba permiso de escritura sobre todo el bucket.
//
// Todo lo que escribe vive ahora en el backend (src/lib/api.js). Lo que queda
// aquí son URLs y descargas de archivos que son públicos a propósito, y para
// eso no hace falta autenticarse.

const BUCKET = import.meta.env.VITE_S3_BUCKET
const REGION = import.meta.env.VITE_S3_REGION || 'us-east-1'

/** Basta con saber a qué bucket apuntar: los archivos son de lectura pública. */
export const s3Configured = !!BUCKET

const urlDe = clave => `https://${BUCKET}.s3.${REGION}.amazonaws.com/${clave}`

// ── Inventario ───────────────────────────────────────────────────────────────

export function inventarioUrl(slug) {
  return urlDe(`inventarios/${slug}/inventario.xlsx`)
}

// Lo genera scripts/sincronizar-inventarios.js a diario desde los respaldos de
// Eleventa; la carga manual de Excel también lo escribe, ahora a través del
// backend, para que ambos caminos dejen el mismo formato.
export function inventarioJsonUrl(slug) {
  return urlDe(`inventarios/${slug}/inventario.json`)
}

export async function loadInventarioJson(slug) {
  const res = await fetch(`${inventarioJsonUrl(slug)}?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return null
  const data = await res.json()
  return Array.isArray(data?.productos) && data.productos.length > 0 ? data : null
}

// ── Estadísticas ─────────────────────────────────────────────────────────────

/** Movimiento diario de los últimos 60 días. */
export function estadisticasUrl(slug) {
  return urlDe(`inventarios/${slug}/estadisticas.json`)
}

/** Acumulado por mes. A diferencia del diario, este no se recorta nunca. */
export function historialUrl(slug) {
  return urlDe(`inventarios/${slug}/historial.json`)
}
