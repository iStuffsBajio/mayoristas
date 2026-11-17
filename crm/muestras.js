// Las fotos de MUESTRA que el bot manda: cómo es cada material y cómo se ve la
// tienda. No son las fotos por modelo de teléfono (ésas salen de `fotoDe`, en
// herramientas.js): éstas contestan «¿cómo es la de goma?» y «¿cómo los
// reconozco al llegar?».
//
// Las dio el dueño el 2026-11-16. Los originales viven fuera del repositorio;
// `scripts/crm-preparar-fotos.py` saca de ellos la versión ligera de
// `public/crm/`, y su mapa `SELECCION` decide qué se publica.
//
// ── Reglas ──────────────────────────────────────────────────────────────────
//
// 1. **Lo que no está aquí, no se manda ni se describe.** De las micas no hay
//    foto todavía, y Torreón no tiene foto de tienda: la herramienta lo dice y
//    el bot no inventa una descripción de algo que no vio.
// 2. **Máximo dos fotos por material**: la ficha y un ejemplo ya personalizado.
//    Un álbum de seis fotos es un mensaje que nadie pidió.
// 3. **El pie dice qué es y nada más.** Sin precio (cambia, y vive en precio.js)
//    y sin prometer existencias.
// 4. **JPEG**, que es lo que la Cloud API de WhatsApp documenta para imágenes.
// 5. **Dos clases de imagen por material** (2026-11-17, a pedido del dueño):
//    - la FICHA: una lámina con la descripción del material. Es la PRIMERA
//      instancia, la que se manda cuando el cliente pregunta por su modelo y se
//      le confirma de qué tipo hay: dice qué es sin que haya que escribirlo;
//    - los EJEMPLOS: fotos reales de trabajos ya hechos, que se mandan cuando
//      piden ver cómo queda. Un material sin ficha (rígida, cristal) usa su foto.
// 6. **La foto de la tienda lleva SIEMPRE la leyenda de distribuidores** y sale
//    sola con los datos de la sucursal (no depende de que el modelo la pida).
//
// `reglas-muestras.test.js` comprueba que cada archivo nombrado aquí exista en
// `public/crm/`: un nombre mal escrito mandaría un enlace roto sin avisar.

import { SITIO } from './herramientas.js'

export const MUESTRAS = {
  'goma-flexible': {
    que: 'funda de goma flexible',
    ficha: { archivo: 'ficha-goma-flexible.jpg', pie: 'Funda de goma flexible personalizada.' },
    fotos: [
      { archivo: 'material-goma-flexible.jpg', pie: 'Así es la de goma flexible: se dobla, negra mate, con textura antiderrapante a los lados.' },
      { archivo: 'ejemplo-goma-flexible.jpg',  pie: 'Y así queda ya personalizada.' },
    ],
  },
  'goma-flexible-color': {
    que: 'funda de goma flexible de color',
    ficha: { archivo: 'ficha-goma-flexible-color.jpg', pie: 'Funda de goma flexible de color, personalizada.' },
    // ⚠️ POR CONFIRMAR con el dueño: la lámina nueva dice «Disponible para iPhone ·
    // todos los modelos», y la ficha técnica vieja decía «sólo iPhone 11 a 12 Pro
    // Max». Hasta que lo diga, el bot NO afirma para qué teléfonos hay de color:
    // lo confirma con buscar_existencias.
    nota: 'No afirmes para qué teléfonos hay de color: confírmalo con buscar_existencias antes de ofrecerla.',
    fotos: [
      { archivo: 'material-goma-flexible-color.jpg', pie: 'La de goma flexible de color, con los botones en otro tono.' },
      { archivo: 'ejemplo-goma-flexible-color.jpg',  pie: 'Así quedan ya personalizadas.' },
    ],
  },
  'cristal': {
    que: 'funda de goma flexible con cristal',
    fotos: [
      { archivo: 'material-cristal.jpg', pie: 'La de goma flexible con acabado de cristal: el diseño va sobre un inserto de cristal.' },
    ],
  },
  'hard': {
    que: 'funda rígida',
    fotos: [
      { archivo: 'material-hard.jpg', pie: 'Así es la rígida: transparente y delgada.' },
      { archivo: 'ejemplo-hard.jpg',  pie: 'Y así queda ya personalizada.' },
    ],
  },
  'uso-rudo': {
    que: 'funda de uso rudo',
    ficha: { archivo: 'ficha-uso-rudo.jpg', pie: 'Funda de uso rudo transparente, personalizada.' },
    fotos: [
      { archivo: 'ejemplo-uso-rudo.jpg',   pie: 'Así es la de uso rudo, ya personalizada: más gruesa, con las esquinas reforzadas.' },
      { archivo: 'ejemplo-uso-rudo-2.jpg', pie: 'Otra de uso rudo.' },
    ],
  },

}

/** Las claves que el modelo puede pedir. */
export const CLAVES_DE_MUESTRA = [
  ...Object.keys(MUESTRAS),
  // Se aceptan para poder contestar «de eso no tengo foto» en vez de dejar que
  // el modelo elija la más parecida y mande la que no es.
  'mica', 'sticker',
]

export const CLASES_DE_MUESTRA = ['ficha', 'ejemplos']

/**
 * La leyenda que lleva TODA foto de una tienda. La dictó el dueño el
 * 2026-11-17: hay distribuidores con exhibidores de la marca, y el cliente que
 * llega a uno cree que es la sucursal y reclama una garantía o una promoción
 * que no podemos respaldar. Va en el pie de la foto, no en el texto del bot:
 * así sale siempre y con las mismas palabras.
 */
export const LEYENDA_SUCURSAL =
  'Recuerda: esta es nuestra sucursal. Si encuentras otro local con un exhibidor de nuestra marca, ' +
  'solo es un distribuidor y no podremos respaldar nuestra garantía ni las promociones de la publicidad.'

const FOTOS_DE_SUCURSAL = {
  leon:           'sucursal-leon.jpg',
  'san-luis':     'sucursal-san-luis.jpg',
  aguascalientes: 'sucursal-aguascalientes.jpg',
  // torreon: sin foto todavía (2026-11-17). Se dice que no hay, no se inventa.
}

/** La foto de una tienda con su leyenda, o null si de esa no hay. */
export function fotoDeSucursal(plaza) {
  const archivo = FOTOS_DE_SUCURSAL[plaza]
  if (!archivo) return null
  return { url: `${SITIO}/crm/${archivo}`, pie: `Así se ve nuestra tienda. ${LEYENDA_SUCURSAL}` }
}

export const SUCURSALES_CON_FOTO = Object.keys(FOTOS_DE_SUCURSAL)

/**
 * Las fotos de una muestra, con su dirección completa, o un error que le dice
 * al modelo qué hacer. Nunca devuelve la foto de otra cosa «parecida».
 */
export function muestraDe({ que, cual = 'ficha' } = {}) {
  const m = MUESTRAS[que]
  if (!m) {
    return {
      error: 'sin-foto',
      nota: 'De eso no tengo foto de muestra. No describas una foto que no existe: dilo con naturalidad y ofrece que la tienda le mande una.',
    }
  }
  // La ficha es la primera instancia; si el material no la tiene todavía, su
  // foto de siempre. Los ejemplos son siempre las fotos de trabajos hechos.
  const fotos = cual === 'ejemplos' ? m.fotos : [m.ficha ?? m.fotos[0]]
  return {
    que: m.que,
    clase: cual === 'ejemplos' ? 'ejemplos' : 'ficha',
    ...(m.nota && { nota: m.nota }),
    fotos: fotos.map(f => ({ url: `${SITIO}/crm/${f.archivo}`, pie: f.pie })),
  }
}
