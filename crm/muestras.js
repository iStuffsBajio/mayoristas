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
//
// `reglas-muestras.test.js` comprueba que cada archivo nombrado aquí exista en
// `public/crm/`: un nombre mal escrito mandaría un enlace roto sin avisar.

import { SITIO } from './herramientas.js'

export const MUESTRAS = {
  'goma-flexible': {
    que: 'funda de goma flexible',
    fotos: [
      { archivo: 'material-goma-flexible.jpg', pie: 'Así es la de goma flexible: se dobla, negra mate, con textura antiderrapante a los lados.' },
      { archivo: 'ejemplo-goma-flexible.jpg',  pie: 'Y así queda ya personalizada.' },
    ],
  },
  'goma-flexible-color': {
    que: 'funda de goma flexible de color',
    nota: 'Según la ficha, la de color sólo se hace para iPhone 11 a iPhone 12 Pro Max. Confírmalo con buscar_existencias antes de ofrecerla para otro teléfono.',
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
    fotos: [
      { archivo: 'ejemplo-uso-rudo.jpg',   pie: 'Así es la de uso rudo, ya personalizada: más gruesa, con las esquinas reforzadas.' },
      { archivo: 'ejemplo-uso-rudo-2.jpg', pie: 'Otra de uso rudo.' },
    ],
  },

  'sucursal-leon':           { que: 'tienda de León',           fotos: [{ archivo: 'sucursal-leon.jpg',           pie: 'Así se ve nuestra tienda de León.' }] },
  'sucursal-san-luis':       { que: 'tienda de San Luis Potosí', fotos: [{ archivo: 'sucursal-san-luis.jpg',       pie: 'Así se ve nuestra tienda de San Luis Potosí.' }] },
  'sucursal-aguascalientes': { que: 'tienda de Aguascalientes', fotos: [{ archivo: 'sucursal-aguascalientes.jpg', pie: 'Así se ve nuestra tienda de Aguascalientes.' }] },
}

/** Las claves que el modelo puede pedir. */
export const CLAVES_DE_MUESTRA = [
  ...Object.keys(MUESTRAS),
  // Se aceptan para poder contestar «de eso no tengo foto» en vez de dejar que
  // el modelo elija la más parecida y mande la que no es.
  'mica', 'sticker', 'sucursal-torreon',
]

/**
 * Las fotos de una muestra, con su dirección completa, o un error que le dice
 * al modelo qué hacer. Nunca devuelve la foto de otra cosa «parecida».
 */
export function muestraDe({ que } = {}) {
  const m = MUESTRAS[que]
  if (!m) {
    return {
      error: 'sin-foto',
      nota: 'De eso no tengo foto de muestra. No describas una foto que no existe: dilo con naturalidad y ofrece que la tienda le mande una.',
    }
  }
  return {
    que: m.que,
    ...(m.nota && { nota: m.nota }),
    fotos: m.fotos.map(f => ({ url: `${SITIO}/crm/${f.archivo}`, pie: f.pie })),
  }
}
