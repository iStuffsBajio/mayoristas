// Cuántos días hace que pasó algo.
//
// Parece de sobra tener un archivo para esto. Lo tiene porque la cuenta
// estaba escrita dos veces, cada una de una forma, y las dos pantallas se
// contradecían: el dashboard decía «el inventario de León lleva 2 días sin
// actualizarse» mientras la pestaña de Inventarios, en la misma sesión,
// decía «León: ayer».
//
// ── La trampa: una fecha sin hora se lee en UTC ───────────────────────────
//
// `new Date('2026-11-05')` NO es la medianoche del 5 aquí: es la medianoche
// del 5 en UTC, que en hora de México son las 18:00 del día 4. Restando eso
// de «ahora» y redondeando hacia abajo, el resultado depende de la hora a la
// que se mire:
//
//     a las 10:00 del día 6 → 1 día   (bien, por casualidad)
//     a las 21:00 del día 6 → 2 días  (mal)
//
// Es decir: **acertaba por la mañana y fallaba por la tarde**, que es la peor
// forma de estar roto. Nadie lo reporta porque la mitad de las veces está
// bien, y cuando no lo está parece que el respaldo falló de verdad.
//
// ── El arreglo: días de CALENDARIO, no milisegundos ───────────────────────
//
// Lo que se quiere saber no es cuántas 24 horas han pasado, sino cuántas
// veces ha cambiado la fecha. «Ayer» es ayer tanto a las nueve de la mañana
// como a las once de la noche. Comparando las dos fechas a medianoche local,
// la hora deja de poder mover el resultado.

/** Los tres números de una fecha `AAAA-MM-DD`, o null si no lo es. */
function partes(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor ?? '').trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/**
 * Días de calendario desde una fecha hasta hoy.
 *
 * Acepta `AAAA-MM-DD` y marcas de tiempo completas —de las que sólo mira el
 * día—. Devuelve `null` si no hay fecha, que NO es lo mismo que cero: cero
 * significa «hoy» y null «no se sabe», y confundirlos pinta un verde donde
 * no se sabe nada.
 *
 * Negativo si la fecha es futura. No se recorta a cero a propósito: una
 * fecha futura es un dato roto y conviene que se note.
 */
export function diasDesde(valor, hoy = new Date()) {
  const p = partes(valor)
  if (!p) return null
  const [y, m, d] = p
  const esa = new Date(y, m - 1, d)
  if (Number.isNaN(esa.getTime())) return null
  // Las dos a medianoche LOCAL: así la hora del día no puede mover la cuenta.
  const hoySolo = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.round((hoySolo - esa) / 86400000)
}

/** «hoy», «ayer» o «hace N días». Lo que se lee en pantalla. */
export function hace(dias) {
  if (dias === null || dias === undefined) return 'sin fecha'
  if (dias < 0) return 'con fecha futura'
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

/**
 * HOY, en el calendario de aquí. Nunca `toISOString()`.
 *
 * `new Date().toISOString().slice(0, 10)` da la fecha en UTC, y en hora de
 * México eso es **el día siguiente a partir de las 18:00**. No es teoría:
 * tumbó la pantalla de efectivo.
 *
 * El domingo 8 de noviembre de 2026, a las 18:11 de la tarde, el panel
 * preguntó la fecha y le contestaron «9 de noviembre». Como el 9 era lunes,
 * la semana en curso pasó a ser la del 9 al 15 —que todavía no había
 * ocurrido— y la tabla entera salió en ceros, con la venta real de esa misma
 * semana escondida en el bloque anterior.
 *
 * Es el mismo fallo que ya costó una vuelta con «lleva 2 días sin
 * actualizarse» contra «ayer», y tiene la misma firma, que es la peor: **por
 * la mañana acierta y por la tarde falla**. Nadie lo reporta porque la mitad
 * del tiempo está bien, y cuando no lo está parece que no hubo ventas.
 */
export const hoyLocal = (ahora = new Date()) =>
  `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
