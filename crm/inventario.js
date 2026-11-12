// El inventario que ve el bot. Es un CORTE, no tiempo real.
//
// ── Por qué esto importa más aquí que en la página ──────────────────────────
//
// En la página el mayorista ve la fecha del respaldo en pantalla y saca sus
// conclusiones. En un chat no: lo que el bot escriba queda como una promesa
// del negocio, reenviable, sin contexto alrededor. Por eso cada respuesta
// sobre existencias tiene que llevar su corte pegado, y por eso `cargar()`
// devuelve siempre la fecha junto a los productos en vez de dejarla aparte
// para que alguien se acuerde de añadirla.
//
// La sincronización corre en GitHub Actions. Si una tienda no cerró, no hay
// respaldo nuevo y se vuelve a publicar el de ayer: el corte puede tener dos
// o tres días y eso no es un fallo, es el dato.

import { SUCURSALES } from '../src/lib/sucursales.js'
import { PLAZAS_DEL_BOT } from './plazas.js'

const BUCKET = process.env.S3_BUCKET || 'istuffs-inventarios'
const REGION = process.env.S3_REGION || 'us-east-1'

/** A partir de aquí el corte se avisa. Igual que el ámbar de la portada. */
export const DIAS_PARA_AVISAR = 2

/** Minutos que se guarda un inventario en memoria antes de volver a bajarlo. */
const CACHE_MINUTOS = 15

const cache = new Map()

const urlDe = slug =>
  `https://${BUCKET}.s3.${REGION}.amazonaws.com/inventarios/${slug}/inventario.json`

/** Las plazas de las que el bot puede hablar. Nunca bodega, nunca Ferias. Ver `plazas.js`. */
export const PLAZAS_PUBLICAS = new Set(PLAZAS_DEL_BOT.map(s => s.slug))

export const esPlazaPublica = slug => PLAZAS_PUBLICAS.has(String(slug ?? ''))

/** Días entre el corte y hoy. */
export function diasDeAtraso(fechaCorte, hoy = new Date()) {
  if (!fechaCorte) return null
  const corte = new Date(`${fechaCorte}T12:00:00Z`)
  if (Number.isNaN(corte.getTime())) return null
  return Math.floor((hoy - corte) / 86400000)
}

/**
 * El inventario de una plaza.
 *
 * Devuelve `{ slug, nombre, corte, dias, viejo, productos }`. Lanza si le
 * piden una plaza que el bot no debe nombrar: es mejor reventar en pruebas que
 * dejar que bodega se asome a un chat de cliente.
 */
export async function cargar(slug, { ahora = Date.now() } = {}) {
  if (!esPlazaPublica(slug)) {
    throw new Error(`"${slug}" no es una plaza de la que el bot pueda hablar`)
  }

  const guardado = cache.get(slug)
  if (guardado && ahora - guardado.cuando < CACHE_MINUTOS * 60000) return guardado.dato

  const res = await fetch(`${urlDe(slug)}?t=${ahora}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`No se pudo leer el inventario de ${slug} (${res.status})`)
  const json = await res.json()

  const productos = Array.isArray(json?.productos) ? json.productos : []
  if (productos.length === 0) throw new Error(`El inventario de ${slug} vino vacío`)

  const corte = json?.respaldo?.fecha ?? null
  const dias  = diasDeAtraso(corte)

  const dato = {
    slug,
    nombre: SUCURSALES.find(s => s.slug === slug)?.nombre ?? slug,
    // `respaldo.fecha` y no `generado`: generado es cuándo corrió el script,
    // que puede ser hoy republicando el respaldo de anteayer.
    corte,
    dias,
    viejo: dias != null && dias >= DIAS_PARA_AVISAR,
    productos,
  }

  cache.set(slug, { cuando: ahora, dato })
  return dato
}

/** Para las pruebas y para forzar una relectura tras una sincronización. */
export const olvidar = () => cache.clear()

/** Deja un inventario puesto a mano. Solo para pruebas. */
export const sembrar = (slug, dato) =>
  cache.set(slug, { cuando: Date.now(), dato: { slug, ...dato } })
