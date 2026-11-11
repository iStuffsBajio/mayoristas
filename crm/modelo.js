// El modelo del bot y lo que cuesta, en UN sitio.
//
// Antes el modelo estaba fijo en `cerebro.js` y el precio de Opus copiado a
// mano en tres pantallas de prueba: cambiar de modelo dejaba las tres diciendo
// un costo falso, que es justo el número con el que se decide qué modelo usar.
//
// Desde el 2026-11-11 el de omisión es Haiku 5.5: al dueño le pareció caro Opus
// para un chat de cuatro renglones. Para comparar sin tocar código:
//   CRM_MODELO=claude-opus-5-5 npm run crm:web

/** USD por millón de tokens: entrada, salida y lo leído de caché (precios de lista, noviembre 2026). */
export const PRECIOS = {
  'claude-haiku-5-5':  { entrada: 0.10, salida: 0.50,  cache: 0.01 },
  'claude-sonnet-5-5': { entrada: 2.00, salida: 10.00, cache: 0.10 },
  'claude-opus-5-5':   { entrada: 4.00, salida: 20.00, cache: 0.20 },
}

export const MODELO = process.env.CRM_MODELO || 'claude-haiku-5-5'

if (!PRECIOS[MODELO]) {
  throw new Error(`CRM_MODELO=${MODELO} no está en la tabla de precios de crm/modelo.js: añádelo con su precio`)
}

/** El costo en USD de un uso `{ entrada, salida, cacheLeido }`. */
export function costoUsd(u, modelo = MODELO) {
  const p = PRECIOS[modelo]
  return (u.entrada - u.cacheLeido) / 1e6 * p.entrada + u.cacheLeido / 1e6 * p.cache + u.salida / 1e6 * p.salida
}
