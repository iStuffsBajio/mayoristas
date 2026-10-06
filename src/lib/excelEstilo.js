// Estilos para los Excel que exporta el panel.
//
// La idea es que el archivo se abra y se entienda sin explicación: un panel
// de portada con los números grandes, una hoja por tema, encabezados fijos y
// filtros puestos. Lo mismo que se ve en pantalla, pero guardable y enviable.
//
// Los colores son los de la marca, los mismos del sitio.

import XLSX from 'xlsx-js-style'

export const C = {
  rosa:     'C4156F',
  rosaFuerte:'D51A7A',
  verde:    '5E9422',
  azul:     '0288AD',
  ambar:    'B45309',
  tinta:    '101619',
  tintaSuave:'4A5A61',
  tintaTenue:'8598A1',
  linea:    'D6E0E4',
  fondo:    'F7FAFB',
  cebra:    'FBFDFD',
  blanco:   'FFFFFF',
}

const borde = (color = C.linea) => ({ style: 'thin', color: { rgb: color } })

/** Título grande de la portada. */
export const estiloTitulo = {
  font:      { bold: true, sz: 18, color: { rgb: C.blanco } },
  fill:      { fgColor: { rgb: C.rosa } },
  alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
}

export const estiloSubtitulo = {
  font:      { sz: 10, color: { rgb: C.blanco } },
  fill:      { fgColor: { rgb: C.rosaFuerte } },
  alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
}

/** El número grande de una tarjeta del panel. */
export const estiloCifra = (color = C.tinta) => ({
  font:      { bold: true, sz: 26, color: { rgb: color } },
  alignment: { horizontal: 'center', vertical: 'center' },
  fill:      { fgColor: { rgb: C.blanco } },
  border:    { top: borde(), bottom: borde(), left: borde(), right: borde() },
})

/** La etiqueta bajo el número. */
export const estiloEtiqueta = {
  font:      { sz: 9, color: { rgb: C.tintaSuave } },
  alignment: { horizontal: 'center', vertical: 'top', wrapText: true },
  fill:      { fgColor: { rgb: C.blanco } },
  border:    { bottom: borde(), left: borde(), right: borde() },
}

/** Encabezado de una tabla. */
export const estiloEncabezado = {
  font:      { bold: true, sz: 10, color: { rgb: C.blanco } },
  fill:      { fgColor: { rgb: C.tintaSuave } },
  alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
  border:    { bottom: borde(C.tinta) },
}

export const estiloEncabezadoNum = {
  ...estiloEncabezado,
  alignment: { horizontal: 'right', vertical: 'center', wrapText: true },
}

/** Celda normal de una tabla, con el rayado de cebra. */
export const estiloCelda = (fila, { num = false, fuerte = false, color = C.tinta, formato } = {}) => ({
  font:      { sz: 10, bold: fuerte, color: { rgb: color } },
  fill:      { fgColor: { rgb: fila % 2 ? C.cebra : C.blanco } },
  alignment: { horizontal: num ? 'right' : 'left', vertical: 'center' },
  border:    { bottom: borde() },
  ...(formato ? { numFmt: formato } : {}),
})

/** Texto de nota, en gris y pequeño. */
export const estiloNota = {
  font:      { sz: 9, color: { rgb: C.tintaTenue }, italic: true },
  alignment: { vertical: 'top', wrapText: true },
}

export const estiloSeccion = {
  font:      { bold: true, sz: 11, color: { rgb: C.tinta } },
  alignment: { vertical: 'center' },
}

/**
 * Arma una hoja de tabla con todo puesto: encabezado fijo, filtro, anchos al
 * contenido y rayado. `columnas` describe cada una.
 */
export function hojaDeTabla(columnas, filas) {
  const encabezados = columnas.map(c => c.titulo)
  const matriz = filas.map(f => columnas.map(c => c.valor(f)))
  const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...matriz])

  columnas.forEach((c, i) => {
    const celda = hoja[XLSX.utils.encode_cell({ r: 0, c: i })]
    if (celda) celda.s = c.num ? estiloEncabezadoNum : estiloEncabezado
  })

  filas.forEach((f, r) => {
    columnas.forEach((c, i) => {
      const ref = XLSX.utils.encode_cell({ r: r + 1, c: i })
      const celda = hoja[ref]
      if (!celda) return
      celda.s = estiloCelda(r, {
        num:    c.num,
        fuerte: c.fuerte,
        color:  typeof c.color === 'function' ? c.color(f) : c.color,
        formato: c.formato,
      })
    })
  })

  hoja['!cols'] = columnas.map((c, i) => ({
    wch: c.ancho ?? Math.min(46, Math.max(
      c.titulo.length + 3,
      ...matriz.map(m => String(m[i] ?? '').length + 2),
    )),
  }))
  hoja['!rows'] = [{ hpt: 24 }]
  // Filtro listo en el encabezado, que es lo primero que se echa en falta al
  // abrir una lista de 300 renglones. Congelar la fila no se puede: escribir
  // paneles es de la version de pago de SheetJS, y cargar ExcelJS entero
  // (21 MB contra 2.7) solo por eso no sale a cuenta. El filtro cubre el caso.
  hoja['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filas.length, c: columnas.length - 1 } }) }

  return hoja
}

/** Pone un valor con estilo en una celda concreta de una hoja existente. */
export function celda(hoja, ref, valor, estilo, tipo) {
  hoja[ref] = { v: valor, t: tipo ?? (typeof valor === 'number' ? 'n' : 's'), s: estilo }
  const r = XLSX.utils.decode_cell(ref)
  const rango = hoja['!ref'] ? XLSX.utils.decode_range(hoja['!ref']) : { s: { r, c: r.c }, e: { r: r.r, c: r.c } }
  rango.s.r = Math.min(rango.s.r, r.r); rango.s.c = Math.min(rango.s.c, r.c)
  rango.e.r = Math.max(rango.e.r, r.r); rango.e.c = Math.max(rango.e.c, r.c)
  hoja['!ref'] = XLSX.utils.encode_range(rango)
}

/** Nombre de hoja válido: 31 caracteres y sin : \ / ? * [ ] */
export const nombreHoja = t => String(t).replace(/[:\\/?*[\]]/g, '-').slice(0, 31)

/** Nombre de archivo sin acentos ni espacios. */
export const nombreArchivo = t => String(t)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()
