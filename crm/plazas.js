// A qué sucursal le toca cada ciudad.
//
// 🔒 CONFIRMAR — Este mapa es una decisión de negocio, no de código. Lo que
// hay aquí es un primer tiro por cercanía en carretera; quien sabe a dónde le
// conviene mandar a un mayorista de Querétaro es el dueño, no un mapa.
//
// La regla que SÍ es de código: cuando no se sabe, no se adivina. Mandar a
// alguien a la plaza más grande «por si acaso» es el mismo viaje perdido que
// la portada ya evita al no enseñar «Todas».

import { SUCURSALES_CONSULTA, nombreSucursal } from '../src/lib/sucursales.js'
import { normalizar } from '../src/lib/buscar.js'

/**
 * Plazas que la portada YA enseña y el bot todavía NO atiende, con el porqué.
 *
 * 🔒 CONFIRMAR — Quitar una de aquí es decisión del dueño.
 *
 * Existe por un fallo real: el 2026-11-11 Torreón entró en la portada
 * (`consulta: true`) y el bot seguía leyendo `SUCURSALES_ACTIVAS`, que la
 * deja fuera. La página enseñaba Torreón y el chat decía que no existía, sin
 * que nadie lo hubiera decidido. Ahora el bot parte de lo mismo que la
 * portada, `SUCURSALES_CONSULTA`, y cualquier diferencia tiene que estar
 * escrita aquí con su razón. `reglas.test.js` falla si la portada enseña una
 * plaza que no está ni en el bot ni en esta lista.
 */
export const FUERA_DEL_BOT = {
  // Vacío desde el 2026-11-11: el dueño metió Torreón al bot («agregamos a
  // torreon»). Si alguna plaza vuelve a quedar fuera, va aquí con su razón.
}

/** Las plazas de las que el bot habla y a las que entrega. Nunca bodega ni Ferias. */
export const PLAZAS_DEL_BOT = SUCURSALES_CONSULTA.filter(s => !(s.slug in FUERA_DEL_BOT))

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
  // La Comarca Lagunera y los dos estados que la comparten (2026-11-11). Primer
  // tiro por cercanía, igual que las demás: el dueño lo afina. «San Pedro» y
  // «Matamoros» van con apellido: a secas caerían San Pedro Garza García
  // (Monterrey) y Matamoros (Tamaulipas).
  'torreon': [
    'torreon', 'coahuila', 'coah', 'gomez palacio', 'lerdo', 'ciudad lerdo',
    'matamoros coahuila', 'san pedro de las colonias', 'francisco i madero',
    'la laguna', 'comarca lagunera', 'durango', 'dgo',
  ],
}

/**
 * La plaza que le toca a una ciudad, o null si no se sabe.
 *
 * Devolver null es una respuesta buena: significa «pregúntale al cliente», no
 * «falló algo». Solo se consideran las plazas del bot: las que FUERA_DEL_BOT
 * aparta no reciben a nadie, y bodega y Ferias no atienden a nadie.
 */
export function plazaPara(ciudad) {
  const buscado = normalizar(ciudad)
  if (!buscado) return null

  const activas = new Set(PLAZAS_DEL_BOT.map(s => s.slug))

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
  PLAZAS_DEL_BOT.map(s => ({ slug: s.slug, nombre: nombreSucursal(s.slug) }))
