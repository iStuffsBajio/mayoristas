// Armado de mensajes para wa.me.
//
// Los emojis se quitan a propósito. Varios de los que se usaban (🏷️ ✏️ 🖼️ ✂️)
// son secuencias de varios puntos de código con un selector de variante
// invisible (U+FE0F). Al pasar por la URL y por versiones viejas de WhatsApp
// en Android o Escritorio se rompen y aparecen como cuadros o signos raros.
// El formato en negritas de WhatsApp con *asteriscos* da la misma estructura
// visual sin ningún riesgo de codificación.

// Cubre pictogramas, selectores de variante, uniones ZWJ, tonos de piel,
// teclas numéricas y banderas.
const EMOJI = /\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]|[\u{1F1E6}-\u{1F1FF}]|️|︎|‍|⃣/gu

/** Quita emojis y deja el texto limpio, sin espacios dobles ni sobrantes. */
export function sinEmojis(texto) {
  return String(texto ?? '')
    .replace(EMOJI, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/^[ \t]+/gm, '')
}

/**
 * Construye el mensaje a partir de líneas. Usa `null` o `false` para omitir una
 * línea condicional, y la cadena vacía para dejar un renglón en blanco a
 * propósito. Cada línea pasa por el filtro de emojis, porque el cliente puede
 * escribir alguno en las notas.
 */
export function armarMensaje(lineas) {
  const limpias = lineas
    .filter(l => l !== null && l !== undefined && l !== false)
    .map(l => sinEmojis(l))
  while (limpias.length && limpias[0] === '') limpias.shift()
  while (limpias.length && limpias[limpias.length - 1] === '') limpias.pop()
  return limpias.join('\n')
}

/** Enlace listo para abrir el chat con el mensaje ya escrito. */
export function enlaceWhatsApp(numero, mensaje) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(sinEmojis(mensaje))}`
}
