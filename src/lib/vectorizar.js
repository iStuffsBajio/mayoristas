// Vectorizado de imágenes: convierte un mapa de píxeles en trazados.
//
// Todo ocurre en el navegador. No se sube nada a ningún servidor, así que el
// diseño de un cliente no sale del equipo y no hay costo por imagen.
//
// Qué es y qué no es: esto traza contornos, no es una red neuronal. Con un
// logotipo o un dibujo de colores planos el resultado es inmejorable. Con una
// foto no funciona, y no por estar mal hecho: una foto no tiene contornos que
// seguir, tiene millones de tonos, así que el trazador acaba dibujando un
// trazo por mancha. Medido: una foto de 1000x1000 sale en 4.4 MB y 18 mil
// trazados. Por eso se avisa en pantalla en vez de entregar esa basura.

// Más allá de este tamaño el trazado no mejora: solo tarda más y recoge más
// ruido de compresión. El resultado es vectorial, así que se escala después
// sin perder nada.
const LADO_MAXIMO = 1600

// A partir de aquí el resultado deja de ser aprovechable. El umbral sale de
// medir: un logo limpio da 2 o 3 trazados; una foto, miles.
const TRAZADOS_SOSPECHOSOS = 1500

export const DETALLES = [
  { id: 'suave',     nombre: 'Suave',     ltres: 1,   qtres: 1,   pathomit: 24, desc: 'bordes redondeados, menos trazados' },
  { id: 'normal',    nombre: 'Normal',    ltres: 1,   qtres: 1,   pathomit: 8,  desc: 'equilibrio para la mayoría de los logos' },
  { id: 'detallado', nombre: 'Detallado', ltres: 0.1, qtres: 0.1, pathomit: 0,  desc: 'sigue cada esquina, pesa más' },
]

export const COLORES = [2, 4, 8, 16, 32]

let tracerCache = null

/** Carga la librería la primera vez que se usa, no al abrir la página. */
async function tracer() {
  if (!tracerCache) {
    const mod = await import('imagetracerjs')
    tracerCache = mod.default ?? mod
  }
  return tracerCache
}

/**
 * Lee el archivo a un canvas y devuelve sus píxeles.
 * Reduce la imagen si viene enorme, por lo dicho arriba.
 */
export function leerImagen(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * escala))
      const h = Math.max(1, Math.round(img.height * escala))

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      // Fondo blanco: un PNG transparente trazado sobre nada deja los bordes
      // sucios, y en la UV el soporte es blanco de todos modos.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)

      URL.revokeObjectURL(url)
      resolve({
        imageData: ctx.getImageData(0, 0, w, h),
        vistaPrevia: canvas.toDataURL('image/png'),
        ancho: w,
        alto: h,
        anchoOriginal: img.width,
        altoOriginal: img.height,
        reducida: escala < 1,
      })
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')) }
    img.src = url
  })
}

/** Convierte los píxeles en SVG. Devuelve el SVG y con qué quedó hecho. */
export async function vectorizar(imageData, { detalle = 'normal', colores = 8, quitarRuido = false } = {}) {
  const ImageTracer = await tracer()
  const d = DETALLES.find(x => x.id === detalle) ?? DETALLES[1]

  const svg = ImageTracer.imagedataToSVG(imageData, {
    numberofcolors: colores,
    ltres:          d.ltres,
    qtres:          d.qtres,
    pathomit:       d.pathomit,
    // Un desenfoque suave antes de trazar borra el ruido de compresión de
    // WhatsApp, que si no acaba convertido en cientos de manchitas.
    blurradius:     quitarRuido ? 2 : 0,
    blurdelta:      20,
    strokewidth:    0,
    linefilter:     true,
    rightangleenhance: true,
  })

  const trazados = (svg.match(/<path/g) || []).length
  const paleta = [...new Set(svg.match(/fill="rgb\([^)]*\)"/g) || [])]

  return {
    svg,
    trazados,
    colores: paleta.length,
    bytes: new Blob([svg]).size,
    pareceFoto: trazados > TRAZADOS_SOSPECHOSOS,
  }
}

/**
 * Deja el SVG listo para imprimir a un tamaño físico exacto.
 *
 * El trazador devuelve el tamaño en píxeles. Poniendo viewBox y midiendo en
 * centímetros, el archivo se abre ya a la medida en el programa de la
 * impresora y no hay que escalarlo a mano cada vez.
 */
export function conTamanoFisico(svg, anchoCm) {
  const m = /<svg([^>]*)>/.exec(svg)
  if (!m) return svg

  const atributos = m[1]

  // El viewBox manda cuando ya está puesto: significa que esto ya pasó por
  // aquí y el width dice "10cm", que no es un número de píxeles. Sin esto,
  // volver a aplicar la función la dejaba sin efecto en silencio.
  const vb = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(atributos)
  const w = vb ? Number(vb[1]) : Number(/width="(\d+(?:\.\d+)?)"/.exec(atributos)?.[1])
  const h = vb ? Number(vb[2]) : Number(/height="(\d+(?:\.\d+)?)"/.exec(atributos)?.[1])
  if (!w || !h || !anchoCm) return svg

  const altoCm = (anchoCm * h) / w
  const limpios = atributos
    .replace(/\s*width="[^"]*"/, '')
    .replace(/\s*height="[^"]*"/, '')
    .replace(/\s*viewBox="[^"]*"/, '')

  return svg.replace(
    /<svg[^>]*>/,
    `<svg${limpios} viewBox="0 0 ${w} ${h}" width="${anchoCm}cm" height="${altoCm.toFixed(2)}cm">`,
  )
}

/** Dimensiones en píxeles que declara un SVG, para calcular proporciones. */
export function medidasDe(svg) {
  const a = /<svg([^>]*)>/.exec(svg)?.[1] ?? ''
  const vb = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(a)
  if (vb) return { ancho: Number(vb[1]), alto: Number(vb[2]) }
  return {
    ancho: Number(/width="(\d+(?:\.\d+)?)"/.exec(a)?.[1]) || 0,
    alto:  Number(/height="(\d+(?:\.\d+)?)"/.exec(a)?.[1]) || 0,
  }
}

/** Baja el SVG al equipo. */
export function descargarSvg(svg, nombreBase) {
  const limpio = String(nombreBase || 'vectorizado')
    .replace(/\.[^.]+$/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'vectorizado'

  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${limpio}-vector.svg`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
