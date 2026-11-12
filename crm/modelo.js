// El modelo del bot y lo que cuesta, en UN sitio.
//
// Antes el modelo estaba fijo en `cerebro.js` y el precio de Opus copiado a
// mano en tres pantallas de prueba: cambiar de modelo dejaba las tres diciendo
// un costo falso, que es justo el número con el que se decide qué modelo usar.
//
// Desde el 2026-11-11 el de omisión es Haiku 5.5: al dueño le pareció caro Opus
// para un chat de cuatro renglones. Para comparar sin tocar código:
//   CRM_MODELO=claude-opus-5-5 npm run crm:web

/**
 * USD por millón de tokens (precios de lista, noviembre 2026).
 *
 * `cache` es lo LEÍDO de caché y `cacheEscrito` lo que cuesta escribirlo la
 * primera vez, que es 1.25× la entrada en todos los modelos.
 *
 * Sin verificar contra una factura: el `cache` de Haiku. Los demás salen de la
 * guía de precios de la API.
 */
export const PRECIOS = {
  'claude-haiku-5-5':  { entrada: 0.10, salida: 0.50,  cache: 0.01, cacheEscrito: 0.125 },
  'claude-sonnet-5-5': { entrada: 2.00, salida: 10.00, cache: 0.20, cacheEscrito: 2.50 },
  'claude-opus-5-5':   { entrada: 4.00, salida: 20.00, cache: 0.20, cacheEscrito: 5.00 },
}

export const MODELO = process.env.CRM_MODELO || 'claude-haiku-5-5'

if (!PRECIOS[MODELO]) {
  throw new Error(`CRM_MODELO=${MODELO} no está en la tabla de precios de crm/modelo.js: añádelo con su precio`)
}

/**
 * El costo en USD de un uso `{ entrada, salida, cacheLeido, cacheEscrito }`.
 *
 * ── La trampa de esta cuenta ───────────────────────────────────────────────
 *
 * La API reporta `input_tokens`, `cache_read_input_tokens` y
 * `cache_creation_input_tokens` como contadores **separados**, no como partes
 * de un total. Restar lo leído de caché de la entrada —que es lo que parece
 * natural— da un costo **negativo** en cuanto el caché pega, porque se está
 * restando algo que nunca estuvo sumado. Salió en pantalla: −$0.0006.
 *
 * Un uso vacío o a medias cuesta cero, no NaN: un NaN se propaga por toda la
 * suma y deja la cifra en blanco, que se ve igual que un fallo de carga.
 */
export function costoUsd(u = {}, modelo = MODELO) {
  const p = PRECIOS[modelo]
  return (u.entrada      ?? 0) / 1e6 * p.entrada
       + (u.salida       ?? 0) / 1e6 * p.salida
       + (u.cacheLeido   ?? 0) / 1e6 * p.cache
       + (u.cacheEscrito ?? 0) / 1e6 * p.cacheEscrito
}
