// Familias de producto que NO se comparan entre sí.
//
// Una mica de hidrogel y una funda se venden distinto, se reponen distinto y
// se controlan por separado. Mezclarlas en la misma lista hace que el panel
// mienta de dos formas a la vez:
//
//   · El ranking de «lo que más sale» lo encabezan cuatro micas, así que las
//     fundas que de verdad mueven el mostrador no aparecen.
//   · Los cortes de clase A/B/C se calculan sobre una mezcla: ocho códigos de
//     mica son el 8.3% de la venta con cuatro de los cinco primeros puestos.
//
// Son ocho códigos de quinientos ochenta y uno. Pesan poco en número y mucho
// en venta, que es justo la combinación que descoloca un promedio.
//
// Se identifican por CÓDIGO, igual que los de producción, porque el
// departamento no es de fiar. El patrón de nombre es la red de seguridad para
// códigos nuevos que nadie dé de alta aquí.

/** Micas e hidrogel: protectores de pantalla. */
export const CODIGOS_PROTECTOR = new Set([
  'HDA',  // Mica hidrogel HD alta
  'PV',   // Hidrogel privacidad
  'MT',   // Mica hidrogel mate
  'HDB',  // Mica hidrogel HD básica
  'HDT',  // Mica hidrogel tablet HD
  'MTT',  // Mica hidrogel mate tablet
  'MU',   // Mica uso rudo
  'HDR',  // Mica HD uso rudo
])

// El nombre viene tecleado a mano y trae erratas reales del catálogo:
// «HIDRIOGEL» y «HODROGEL» conviven con «HIDROGEL». El patrón las acepta las
// tres en vez de exigir que alguien corrija el catálogo.
const PATRON_PROTECTOR = /\bmica\b|h[io]dr[io]{1,2}gel/i

/** True si el producto es mica o hidrogel, no funda. */
export function esProtector(codigo, producto = '') {
  if (CODIGOS_PROTECTOR.has(String(codigo ?? '').trim().toUpperCase())) return true
  return PATRON_PROTECTOR.test(String(producto ?? ''))
}

/**
 * Separa una lista en fundas y protectores.
 *
 * Las filas pueden venir de `analizarAgotados` o de un ranking de ventas: lo
 * único que hace falta es que traigan `codigo` y algún nombre.
 */
export function separarProtectores(filas) {
  const fundas = [], protectores = []
  for (const f of filas ?? []) {
    const nombre = f.producto ?? f.nombre ?? ''
    ;(esProtector(f.codigo, nombre) ? protectores : fundas).push(f)
  }
  return { fundas, protectores }
}

/** Quita de un mapa { codigo: algo } los protectores, usando el catálogo. */
export function soloFundas(mapa, nombres = {}) {
  const out = {}
  for (const [codigo, v] of Object.entries(mapa ?? {})) {
    if (!esProtector(codigo, nombres[codigo])) out[codigo] = v
  }
  return out
}
