// Envío del pedido con las imágenes adjuntas.
//
// El enlace wa.me solo transporta texto: no hay forma de adjuntar archivos por
// URL. La alternativa es la hoja de compartir del sistema, que en celular sí
// entrega archivos a WhatsApp. En escritorio casi nunca está disponible, así
// que ahí se descargan las imágenes ya renombradas y el usuario las arrastra
// al chat.

/** Limpia un texto para usarlo como nombre de archivo. */
export function paraNombreArchivo(texto, largo = 45) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, largo)
}

/**
 * Copia un archivo cambiándole el nombre para que lleve el modelo.
 * El contenido no se toca, solo la etiqueta con la que viaja.
 */
export function renombrar(file, modelo, cliente = '') {
  const ext    = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const fecha  = new Date().toISOString().slice(0, 10)
  const partes = [fecha, paraNombreArchivo(cliente, 25), paraNombreArchivo(modelo)].filter(Boolean)
  return new File([file], `${partes.join('_')}.${ext}`, { type: file.type })
}

/**
 * ¿Es un celular o tableta?
 *
 * Importa porque Windows también dice que puede compartir archivos, pero su
 * menú solo alcanza apps instaladas. Quien usa WhatsApp Web en una pestaña no
 * aparece ahí, y el pedido se quedaba a medias con el menú abierto sin destino
 * posible. En escritorio conviene siempre el enlace wa.me, que sí abre la
 * sesión de WhatsApp Web que la sucursal ya tiene lista.
 */
export function esDispositivoMovil() {
  if (typeof navigator === 'undefined') return false
  if (navigator.userAgentData?.mobile !== undefined) return navigator.userAgentData.mobile
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent || '')
}

/** ¿El navegador puede entregar estos archivos a otra app? */
export function puedeCompartirArchivos(archivos) {
  if (!archivos.length) return false
  if (!esDispositivoMovil()) return false
  try {
    return !!(navigator.canShare && navigator.canShare({ files: archivos }))
  } catch {
    return false
  }
}

/**
 * Abre la hoja de compartir del sistema con las imágenes y el texto.
 * Devuelve true si el usuario completó el envío, false si lo canceló o si el
 * navegador no lo soporta.
 */
export async function compartirArchivos(archivos, texto) {
  if (!puedeCompartirArchivos(archivos)) return false
  try {
    await navigator.share({ files: archivos, text: texto })
    return true
  } catch (err) {
    // AbortError significa que el usuario cerró la hoja de compartir a
    // proposito. No es un fallo que haya que reportar.
    if (err?.name === 'AbortError') return false
    console.error('No se pudo compartir:', err)
    return false
  }
}

/** Descarga los archivos al equipo, ya con el nombre del modelo. */
export function descargarArchivos(archivos) {
  for (const [i, file] of archivos.entries()) {
    // Se espacian un poco: algunos navegadores descartan descargas seguidas
    // disparadas en el mismo instante.
    setTimeout(() => {
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    }, i * 350)
  }
}
