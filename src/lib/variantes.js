// Qué productos sirven para el MISMO teléfono.
//
// «IPHONE 15 TPU CASE», «IPHONE 15 HARD CASE» y «IPHONE 15 MORADO TPU CASE»
// son tres códigos distintos del mismo aparato. Si el TPU se agota y hay hard
// case en la bodega, no hace falta comprar: hace falta mover.
//
// ── Por qué esto no es lo mismo que las generaciones ────────────────────────
//
// `mapaGeneraciones` en compras.js relaciona el A06 con el A07: teléfonos
// DISTINTOS, uno sucesor del otro. Una funda de A06 no sirve para un A07, y
// confundirlo dejó 136 códigos sin comprar.
//
// Esto es lo contrario: el MISMO teléfono con otro acabado. Aquí la funda sí
// sirve, que es justo lo que permite mover en vez de comprar.
//
// ── La clave sale del nombre ────────────────────────────────────────────────
//
// Se quita del nombre lo que describe la FUNDA —el tipo y el color— y queda lo
// que describe el TELÉFONO. Es la misma idea que ya usa `emparejar.mjs` para
// casar códigos con archivos PSD, y por los mismos motivos: el nombre es lo
// único que escribe siempre quien da de alta el producto.

/** Lo que describe la funda, no el teléfono. */
const TIPO = /\b(TPU|HARD|DUO|SMART|CASE|CASE2|3 ?EN ?1|3 ?IN ?1|MILITAR|TRANSPARENTE|CRISTAL|GLASS|LAMINA|FUNDA|PROTECTOR|USO RUDO|ARMOR|CLEAR)\b/g

/** Colores: el mismo teléfono en otro tono sigue siendo el mismo teléfono. */
const COLOR = /\b(NEGRO|BLANCO|AZUL|ROJO|ROSA|VERDE|MORADO|SALMON|AMARILLO|GRIS|LILA|MENTA|BEIGE|CAFE|NARANJA|DORADO|PLATA)\b/g

// 5G y 4G NO se quitan: distinguen teléfonos de verdad. Quitarlos emparejaba
// el VIVO V30 LITE 5G con el V30 LITE 4G, que son aparatos distintos y llevan
// funda distinta. Bodega tiene los dos códigos por separado, precisamente.
/**
 * Tonos y acabados: lo que distingue dos versiones del MISMO producto.
 *
 * Es la lista de COLOR mas los dos acabados que viven en TIPO -TRANSPARENTE
 * y CRISTAL-, porque para esto se portan igual: «MOTO G60 TRANSPARENTE TPU»
 * y «MOTO G60 TPU» son el mismo modelo en dos presentaciones.
 *
 * Se escribe aparte a proposito. COLOR y TIPO las usan `claveModelo` y
 * `tipoDeFunda`, que agrupan TODO el catalogo: meter aqui una palabra de mas
 * moveria la agrupacion entera sin que fallara nada.
 */
const TONO = /\b(NEGRO|BLANCO|AZUL|ROJO|ROSA|VERDE|MORADO|SALMON|AMARILLO|GRIS|LILA|MENTA|BEIGE|CAFE|NARANJA|DORADO|PLATA|TRANSPARENTE|CRISTAL)\b/g

/** Los tonos que lleva un nombre, sin repetir. */
export const tonosDe = nombre =>
  [...new Set(String(nombre || '').toUpperCase().match(TONO) ?? [])]

/**
 * ¿Son el mismo producto en distinto tono?
 *
 * Quitando los tonos los nombres tienen que quedar IGUALES. Si ademas cambia
 * otra palabra no es un tono, es otro producto: «IPHONE 11 MORADO TPU» contra
 * «IPHONE 11 AZUL TPU» si; contra «IPHONE 11 PRO AZUL TPU» no.
 *
 * Y alguno de los dos tiene que llevar tono: sin esa condicion, dos nombres
 * iguales sin color entrarian como variante de color, que es falso.
 */
export function mismoSalvoElTono(a, b) {
  if (!tonosDe(a).length && !tonosDe(b).length) return false
  const pelado = s => String(s || '').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(TONO, ' ')
    .replace(/[^A-Z0-9/]+/g, ' ').replace(/\s+/g, ' ').trim()
  const pa = pelado(a)
  return !!pa && pa === pelado(b)
}

const RUIDO = /\b(LTE)\b/g

/**
 * La clave del teléfono al que sirve un producto.
 *
 * Devuelve cadena vacía cuando el nombre no describe un teléfono —micas,
 * stickers, consumibles—, para que no se agrupen entre sí por casualidad.
 */
export function claveModelo(nombre) {
  let t = String(nombre || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    // «IPHONE 12 6.1» y «IPHONE 12» son el mismo: el tamaño de pantalla lo
    // anota una plaza y otra no.
    .replace(/\b\d\.\d\b/g, ' ')
    // Samsung se escribe de las dos formas según quién capturó.
    .replace(/\bGALAXY\b/g, 'SAMSUNG')
    .replace(TIPO, ' ')
    .replace(COLOR, ' ')
    .replace(RUIDO, ' ')

  // Un código que cubre varios teléfonos —«A55/A35»— se queda con todos, para
  // que ambos lo encuentren como alternativa.
  return t.replace(/[^A-Z0-9/]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * El tipo de funda, que es lo que `claveModelo` quita del nombre.
 *
 * Hace falta para distinguir dos cosas que no son iguales: dos códigos del
 * MISMO tipo para el mismo teléfono sobran -el caso del A35, dos «3 en 1»-,
 * pero un TPU y un militar para el mismo teléfono son productos distintos y
 * ninguno sobra.
 */
export function tipoDeFunda(nombre) {
  const n = String(nombre || '').toUpperCase()
  // El orden importa: «MICA HD USO RUDO» es uso rudo antes que mica, y
  // «CRISTAL TPU CASE» es cristal aunque lleve la palabra TPU.
  if (/3 ?EN ?1|3 ?IN ?1/.test(n)) return '3EN1'
  if (/\bUSO RUDO\b|\bMILITAR\b|\bARMOR\b|HEAVY DUTY/.test(n)) return 'RUDO'
  if (/\bDUO\b/.test(n)) return 'DUO'
  if (/\bHARD\b/.test(n)) return 'HARD'
  if (/\bGLASS\b|\bCRISTAL\b/.test(n)) return 'GLASS'
  if (/\bTPU\b/.test(n)) return 'TPU'
  return 'OTRO'
}


/**
 * Todas las claves que cubre un producto.
 *
 * «SAMSUNG A55/A35 3 IN 1» cubre el A55 y el A35: de ahí salen dos claves, la
 * marca más cada trozo. Sin esto, el combinado no aparecía como alternativa de
 * ninguno de los dos.
 */
export function clavesDe(nombre) {
  const base = claveModelo(nombre)
  if (!base) return []

  const m = /^(SAMSUNG|XIAOMI|REDMI|POCO|HUAWEI|MOTOROLA|MOTO|OPPO|REALME|HONOR|VIVO|ZTE|IPHONE|APPLE|LG|GOOGLE|PIXEL|INFINIX|TECNO)\s+/.exec(base)
  const marca = m ? m[1] : ''
  const resto = m ? base.slice(m[0].length) : base

  const trozos = resto.split('/').map(t => t.trim()).filter(Boolean)
  if (trozos.length < 2) return [base.replace(/\s+/g, ' ')]

  return trozos.map(t => `${marca} ${t}`.trim().replace(/\s+/g, ' '))
}

/**
 * Agrupa productos por el teléfono al que sirven.
 *
 * `productos` son filas con `Codigo` y `Producto`. Devuelve
 * { clave: [{ codigo, producto }] }.
 */
export function agruparPorModelo(productos) {
  const grupos = {}
  for (const p of productos ?? []) {
    const codigo = String(p.Codigo ?? p.codigo ?? '').trim()
    const nombre = p.Producto ?? p.producto ?? ''
    if (!codigo) continue
    for (const clave of clavesDe(nombre)) {
      (grupos[clave] ??= []).push({ codigo, producto: nombre })
    }
  }
  return grupos
}

/**
 * Otras formas de atender el mismo teléfono, con dónde hay existencia.
 *
 * `existencias` es { codigo: { slug: piezas } }. Se devuelven sólo las que
 * tienen piezas en algún sitio: una alternativa agotada no es una alternativa.
 */
export function alternativasDe(codigo, nombre, grupos, existencias) {
  const yo = String(codigo ?? '').trim().toUpperCase()
  const vistos = new Set()
  const out = []

  for (const clave of clavesDe(nombre)) {
    for (const v of grupos?.[clave] ?? []) {
      const c = v.codigo.toUpperCase()
      if (c === yo || vistos.has(c)) continue
      vistos.add(c)

      const donde = existencias?.[v.codigo] ?? {}
      const total = Object.values(donde).reduce((a, b) => a + (Number(b) || 0), 0)
      if (total <= 0) continue

      out.push({ codigo: v.codigo, producto: v.producto, total, donde })
    }
  }

  // Lo que más hay primero: es de donde menos duele sacar.
  return out.sort((a, b) => b.total - a.total)
}
