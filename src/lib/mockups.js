// Qué fotografía le toca a cada producto del inventario.
//
// ── El fallo que arregla ────────────────────────────────────────────────────
//
// El buscador de la portada se alimentaba del índice de mockups, es decir, de
// los modelos que TIENEN FOTO. Buscar «S26» devolvía un solo renglón —el
// Galaxy S26— y ni rastro del S26+ ni del S26 Ultra, que existen, tienen
// piezas en la tienda y se venden. Para quien busca, un modelo que no sale es
// un modelo que no hay: la página le estaba escondiendo inventario.
//
// La lista de la que vive el buscador es el INVENTARIO. La foto es un adorno
// que se añade cuando existe, y nunca al revés.
//
// ── Y cuando no hay foto de ese modelo exacto ───────────────────────────────
//
// Se enseña la del teléfono más parecido de la misma familia —la del Galaxy
// S26 para el S26 Ultra— y se dice con letra que es de referencia. Una funda
// de la misma gama se parece lo suficiente para ayudar a reconocerla, y
// callarlo sería enseñar una foto que no es sin avisar.

import { normalizar } from './buscar.js'

/** Lo que describe la FUNDA y no el teléfono: tipo de carcasa y color. */
const DE_LA_FUNDA = /\b(TPU|HARD|DUO|SMART|CASE2|CASE|3 ?EN ?1|3 ?IN ?1|MILITAR|TRANSPARENTE|CRISTAL|GLASS|LAMINA|FUNDA|PROTECTOR|USO RUDO|ARMOR|CLEAR|NEGRO|BLANCO|AZUL|ROJO|ROSA|VERDE|MORADO|SALMON|AMARILLO|GRIS|LILA|MENTA|BEIGE|CAFE|NARANJA|DORADO|PLATA)\b/gi

/** Marcas que son la misma familia escritas de otra forma. */
const FAMILIA = [
  [/\b(IPHONE|APPLE)\b/,            'APPLE'],
  [/\b(GALAXY|SAMSUNG)\b/,          'SAMSUNG'],
  [/\b(REDMI|POCO|POCCO|XIAOMI)\b/, 'XIAOMI'],
  [/\b(MOTO|MOTOROLA)\b/,           'MOTOROLA'],
  [/\bREALME\b/,                    'REALME'],
  [/\bOPPO\b/,                      'OPPO'],
  [/\bHONOR\b/,                     'HONOR'],
  [/\b(HUAWEI|NOVA|MATE|PURA)\b/,   'HUAWEI'],
  [/\bVIVO\b/,                      'VIVO'],
  [/\bZTE\b/,                       'ZTE'],
  [/\b(PIXEL|GOOGLE)\b/,            'GOOGLE'],
]

export function familiaDe(nombre) {
  const t = String(nombre ?? '').toUpperCase()
  for (const [re, f] of FAMILIA) if (re.test(t)) return f
  return null
}

/**
 * La clave del TELÉFONO: el nombre sin lo que describe la funda.
 *
 * «GALAXY S26 ULTRA TPU CASE» y «GALAXY S26 ULTRA 3 IN 1» dan la misma, que
 * es lo que permite que una foto sirva a los dos. Samsung se escribe de las
 * dos maneras en el catálogo, así que GALAXY cuenta como SAMSUNG.
 */
export const claveTelefono = nombre =>
  normalizar(String(nombre ?? '').toUpperCase()
    .replace(/\bGALAXY\b/g, 'SAMSUNG')
    .replace(DE_LA_FUNDA, ' '))

/** Índice de búsqueda a partir de los mockups publicados. */
export function indexarMockups(mockups) {
  const porCodigo = new Map()
  const porTelefono = []
  for (const m of mockups ?? []) {
    if (m.vacio || !m.archivo) continue
    porCodigo.set(String(m.codigo).toUpperCase(), m)
    porTelefono.push({ ...m, clave: claveTelefono(m.nombre), familia: familiaDe(m.nombre) })
  }
  // Primero las claves largas: entre «SAMSUNGS26» y «SAMSUNGS2», para un
  // S26 Ultra la buena es la larga.
  porTelefono.sort((a, b) => b.clave.length - a.clave.length)
  return { porCodigo, porTelefono }
}

/** Mínimo de letras compartidas para que dos teléfonos se parezcan de verdad. */
const MINIMO = 6

/**
 * La foto que le toca a un producto del inventario.
 *
 * Devuelve `{ archivo, modelo, exacta }`, o null si no hay ninguna de la
 * familia. `exacta: false` significa que la foto es de otro modelo parecido
 * y que hay que decirlo en pantalla.
 */
export function fotoPara(producto, indice) {
  if (!producto || !indice) return null

  const propia = indice.porCodigo.get(String(producto.codigo ?? '').toUpperCase())
  if (propia) return { archivo: propia.archivo, modelo: propia.nombre, exacta: true }

  const clave = claveTelefono(producto.nombre)
  if (clave.length < MINIMO) return null
  const familia = familiaDe(producto.nombre)

  // Otro código del MISMO teléfono: el S26 Ultra TPU y el S26 Ultra 3 en 1
  // llevan la misma funda de foto. Eso sigue siendo exacto.
  const mismo = indice.porTelefono.find(m => m.clave === clave)
  if (mismo) return { archivo: mismo.archivo, modelo: mismo.nombre, exacta: true }

  // Si no, el pariente más cercano: una clave que sea principio de la otra.
  // El Galaxy S26 para el S26 Ultra, no al revés si hay algo mejor; por eso
  // la lista va ordenada de clave más larga a más corta.
  const pariente = indice.porTelefono.find(m =>
    (!familia || !m.familia || m.familia === familia)
    && m.clave.length >= MINIMO
    && (clave.startsWith(m.clave) || m.clave.startsWith(clave)))

  return pariente
    ? { archivo: pariente.archivo, modelo: pariente.nombre, exacta: false }
    : null
}
