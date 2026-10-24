// Clase A, B y C de cada modelo, por ritmo de venta.
//
// Es una etiqueta ESTABLE del catálogo: no depende de cuántos días lleve algo
// agotado, sino de cuánto se vende normalmente. Así «clase A» significa lo
// mismo en cualquier pantalla y en cualquier mes.
//
// ── De dónde salen los cortes ───────────────────────────────────────────────
//
// No de un manual. Se miró el catálogo real el 2026-10-24: 581 modelos con
// venta, 1,337 piezas al mes entre las cuatro tiendas.
//
//      5+ pz/mes    69 modelos   58% de la venta
//    2-5 pz/mes    107 modelos   25% de la venta
//    0-2 pz/mes    405 modelos   18% de la venta
//
// El primer intento usó los números de manual —A: 20+, B: 5-20— y con esos
// TODO el catálogo caía en C: el modelo más vendido de la casa hace 22 piezas
// al mes y sólo 26 pasan de 10. Una gráfica de un solo color.
//
// La lección: los cortes se miden sobre las ventas propias, nunca se copian.
//
// ── Cómo se suma el ritmo ───────────────────────────────────────────────────
//
// Se suman los RITMOS de cada plaza, no las piezas de todas divididas entre el
// calendario más largo. Cada plaza lleva medidos distintos días y hacerlo mal
// dejaba el ritmo del conjunto 18% por debajo.

/**
 * 🔒 Los dos cortes. Cambiarlos cambia qué se ve como urgente en el panel.
 * Se revisan cuando el catálogo cambie de tamaño, no por gusto.
 */
export const CLASE_A = 5
export const CLASE_B = 2

export const CLASES = ['A', 'B', 'C']

/** La clase de un ritmo de venta mensual. */
export function claseDe(piezasAlMes) {
  const n = Number(piezasAlMes) || 0
  if (n >= CLASE_A) return 'A'
  if (n >= CLASE_B) return 'B'
  return 'C'
}

/**
 * Ritmo de venta mensual de cada modelo, sumando el de cada plaza.
 *
 * `historiales` es el arreglo de historiales que ya usan compras.js y el
 * panel: { periodos: [{ p, m: { codigo: piezas }, diasCubiertos }] }.
 */
export function ritmoPorModelo(historiales) {
  const ritmo = {}

  for (const h of (historiales ?? []).filter(Boolean)) {
    const piezas = {}
    let dias = 0

    for (const p of h.periodos ?? []) {
      // `diasCubiertos` existe porque el mes en curso va a medias: dividir
      // entre los días del calendario subestimaba el ritmo a la mitad.
      dias += p.diasCubiertos ?? 30
      for (const [codigo, n] of Object.entries(p.m ?? {})) {
        piezas[codigo] = (piezas[codigo] || 0) + n
      }
    }

    if (dias <= 0) continue
    for (const [codigo, n] of Object.entries(piezas)) {
      ritmo[codigo] = (ritmo[codigo] || 0) + (n / dias) * 30
    }
  }

  return ritmo
}

/** La clase de cada modelo, listo para consultar por código. */
export function clasePorModelo(historiales) {
  const ritmo = ritmoPorModelo(historiales)
  const clases = {}
  for (const [codigo, n] of Object.entries(ritmo)) clases[codigo] = claseDe(n)
  return clases
}

/**
 * Cuántos modelos están en cero en cada ubicación, repartidos por clase.
 *
 * `filas` son las de `analizarAgotados`, que traen `enCero` con los slugs
 * de las TIENDAS donde el modelo está a cero.
 *
 * Bodega va aparte y por eso se pide con su propio argumento. `enCero` nunca
 * la incluye —`analizarAgotados` sólo recibe los inventarios de tienda—, así
 * que pasarla como una ubicación más la dejaba siempre en cero. Y un cero ahí
 * no se lee como «no sé», se lee como «bodega tiene de todo», que es lo
 * contrario de la verdad. Su dato real está en el campo `bodega` de cada fila.
 *
 * Ferias no entra: cierra ocho meses al año, así que su «agotado» no
 * significa lo mismo que el de una tienda abierta y deforma la comparación.
 */
export function agotadosPorUbicacion(filas, clases, ubicaciones, bodega = null) {
  const vacio = () => ({ A: 0, B: 0, C: 0, total: 0 })
  const cuenta = Object.fromEntries(ubicaciones.map(u => [u.slug, vacio()]))
  const enBodega = bodega ? vacio() : null

  for (const f of filas ?? []) {
    const clase = clases[f.codigo] ?? 'C'

    for (const slug of f.enCero ?? []) {
      const c = cuenta[slug]
      if (!c) continue
      c[clase]++
      c.total++
    }

    // Sólo cuenta como agotado en bodega lo que bodega maneja. Un código que
    // no está en su catálogo no está agotado: no es suyo.
    if (enBodega && f.existeEnBodega && (Number(f.bodega) || 0) <= 0) {
      enBodega[clase]++
      enBodega.total++
    }
  }

  const filasSalida = ubicaciones.map(u => ({ ...u, ...cuenta[u.slug] }))
  return bodega ? [...filasSalida, { ...bodega, ...enBodega }] : filasSalida
}
