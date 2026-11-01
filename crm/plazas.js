// A qué sucursal le toca cada ciudad.
//
// 🔒 CONFIRMAR — Este mapa es una decisión de negocio, no de código. Lo que
// hay aquí es un primer tiro por cercanía en carretera; quien sabe a dónde le
// conviene mandar a un mayorista de Querétaro es el dueño, no un mapa.
//
// La regla que SÍ es de código: cuando no se sabe, no se adivina. Mandar a
// alguien a la plaza más grande «por si acaso» es el mismo viaje perdido que
// la portada ya evita al no enseñar «Todas».

import { SUCURSALES_ACTIVAS, nombreSucursal } from '../src/lib/sucursales.js'
import { normalizar } from '../src/lib/buscar.js'

/**
 * Ciudades y estados que atiende cada plaza. Se comparan normalizados, así
 * que «San Luis», «SLP» y «san luis potosi» caen en el mismo sitio.
 */
export const COBERTURA = {
  'leon': [
    'leon', 'guanajuato', 'gto', 'irapuato', 'salamanca', 'silao', 'celaya',
    'san francisco del rincon', 'purisima', 'lagos de moreno', 'san juan de los lagos',
  ],
  'san-luis': [
    'san luis', 'san luis potosi', 'slp', 'soledad', 'rioverde', 'matehuala',
    'ciudad valles', 'tamazunchale',
  ],
  'aguascalientes': [
    'aguascalientes', 'ags', 'jesus maria', 'calvillo', 'zacatecas',
    'guadalupe zacatecas', 'fresnillo', 'jerez',
  ],
}

/**
 * La plaza que le toca a una ciudad, o null si no se sabe.
 *
 * Devolver null es una respuesta buena: significa «pregúntale al cliente», no
 * «falló algo». Solo se consideran las plazas ACTIVAS: Torreón está dada de
 * alta pero cerrada, y bodega y Ferias no atienden a nadie.
 */
export function plazaPara(ciudad) {
  const buscado = normalizar(ciudad)
  if (!buscado) return null

  const activas = new Set(SUCURSALES_ACTIVAS.map(s => s.slug))

  // Primero coincidencia exacta, luego por contención. Sin el orden,
  // «san luis» entraría por «san luis» de León (san francisco…) antes que por
  // su propia plaza.
  for (const [slug, lugares] of Object.entries(COBERTURA)) {
    if (!activas.has(slug)) continue
    if (lugares.some(l => normalizar(l) === buscado)) return slug
  }
  for (const [slug, lugares] of Object.entries(COBERTURA)) {
    if (!activas.has(slug)) continue
    if (lugares.some(l => buscado.includes(normalizar(l)))) return slug
  }
  return null
}

/** Las opciones que se le ofrecen a un cliente cuando hay que preguntarle. */
export const opcionesDePlaza = () =>
  SUCURSALES_ACTIVAS.map(s => ({ slug: s.slug, nombre: nombreSucursal(s.slug) }))
