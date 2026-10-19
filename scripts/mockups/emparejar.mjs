// Casa cada código del inventario con su archivo PSD.
//
// Los dos lados escriben el mismo teléfono distinto:
//   inventario   MOTO E22i/E22 TPU CASE
//   mockup       MOTO E22i-E22.psd
//   inventario   XIAOMI REDMI NOTE 13 PRO 4G TPU CASE
//   mockup       REDMI NOTE 13 PRO 4G.psd
//
// Así que se comparan normalizados —sin acentos, signos ni espacios— después
// de quitar de los dos lo que no identifica al teléfono: el tipo de funda, la
// marca cuando sobra, y los colores.

import { listarPsd } from './extraer.mjs'

const RUIDO = /\b(TPU|HARD|DUO|SMART|CASE|CASE2|3 ?EN ?1|3 ?IN ?1|MILITAR|TRANSPARENTE|CRISTAL|LAMINA|FUNDA|PROTECTOR|5G|4G|LTE)\b/gi
const COLORES = /\b(NEGRO|BLANCO|AZUL|ROJO|ROSA|VERDE|MORADO|SALMON|AMARILLO|GRIS|LILA|MENTA)\b/gi
const MARCAS = /\b(SAMSUNG|GALAXY|XIAOMI|REDMI|POCCO|POCO|HUAWEI|MOTOROLA|MOTO|OPPO|REALME|HONOR|VIVO|ZTE|IPHONE|APPLE|LG|GOOGLE|PIXEL)\b/gi

export const clave = (texto, conMarca = true) => {
  let t = String(texto || '').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // El inventario a veces anota el tama\u00f1o de pantalla -\u00abIPHONE 12 6.1\u00bb- y
    // el archivo no. Y Samsung se escribe de las dos formas seg\u00fan qui\u00e9n lo
    // captur\u00f3, as\u00ed que \u00abGALAXY\u00bb y \u00abSAMSUNG\u00bb valen igual.
    .replace(/\b\d\.\d\b/g, ' ')
    .replace(/\bGALAXY\b/g, 'SAMSUNG')
    .replace(RUIDO, ' ').replace(COLORES, ' ')
  if (!conMarca) t = t.replace(MARCAS, ' ')
  return t.replace(/[^A-Z0-9]/g, '')
}

/**
 * Empareja. Primero exacto con marca, luego exacto sin marca, y por último
 * uno dentro del otro: «REDMI NOTE 13 PRO» contra «NOTE 13 PRO».
 */
const MARCA_AL_INICIO = /^(SAMSUNG|GALAXY|XIAOMI|REDMI|POCCO|POCO|HUAWEI|MOTOROLA|MOTO|OPPO|REALME|HONOR|VIVO|ZTE|IPHONE|LG|GOOGLE|PIXEL)\s+/i

/**
 * Un archivo cubre varios teléfonos. «MOTO G54-G55.psd» sirve para el G54 y
 * el G55; «MOTO G04-G24-G24POWER-E14.psd» para cuatro. Así que de cada
 * nombre salen varias claves: la marca más cada trozo.
 *
 * Sin esto se perdían catorce de los cincuenta y nueve más vendidos, y los
 * PSD estaban ahí todo el tiempo.
 */
function variantes(nombre) {
  const n = String(nombre || '').toUpperCase()
  const m = MARCA_AL_INICIO.exec(n)
  const marca = m ? m[1] : ''
  const resto = m ? n.slice(m[0].length) : n
  const trozos = resto.split(/[-\/,]+/).map(t => t.trim()).filter(Boolean)
  const out = new Set([n])
  for (const t of trozos) out.add(marca ? `${marca} ${t}` : t)
  return [...out]
}

export function emparejar(codigos) {
  const psds = listarPsd()
  const porK = new Map(), porKs = new Map()
  for (const p of psds) {
    for (const v of variantes(p.nombre)) {
      const k = clave(v), ks = clave(v, false)
      if (k && !porK.has(k)) porK.set(k, p)
      if (ks && !porKs.has(ks)) porKs.set(ks, p)
    }
  }
  const lista = psds.map(p => ({ ...p, k: clave(p.nombre), ks: clave(p.nombre, false) }))

  return codigos.map(c => {
    let psd = null, como = null
    for (const v of variantes(c.nombre)) {
      psd = porK.get(clave(v)) || porKs.get(clave(v, false))
      if (psd) { como = 'exacto'; break }
    }
    const ks = clave(c.nombre, false)

    if (!psd && ks.length >= 5) {
      // Que uno contenga al otro, quedándose con el más parecido en largo.
      const cands = lista.filter(p => p.ks.length >= 5 && (p.ks.includes(ks) || ks.includes(p.ks)))
      cands.sort((a, b) => Math.abs(a.ks.length - ks.length) - Math.abs(b.ks.length - ks.length))
      if (cands.length) { psd = cands[0]; como = 'parcial' }
    }
    return { ...c, psd, como }
  })
}
