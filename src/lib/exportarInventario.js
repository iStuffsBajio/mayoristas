// Exporta a Excel lo que el panel tiene filtrado en pantalla.
//
// La idea es que el archivo sirva para salir a comprar: lo que se ve filtrado
// por "urgente" o "agotado" es, tal cual, la lista de resurtido.

import * as XLSX from 'xlsx'

function hojaDe(filas, encabezados) {
  const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas])
  hoja['!cols'] = encabezados.map((enc, i) => {
    const largo = filas.reduce((max, f) => Math.max(max, String(f[i] ?? '').length), enc.length)
    return { wch: Math.min(48, largo + 2) }
  })
  // Fija la fila de encabezados para que no se pierda al bajar por la lista.
  hoja['!freeze'] = { xSplit: 0, ySplit: 1 }
  return hoja
}

function limpio(texto) {
  return String(texto)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-').toLowerCase()
}

// Las dos columnas de venta solo se agregan si hay estadisticas publicadas.
// Una sucursal recien conectada no las tiene, y sacar columnas vacias en el
// Excel confunde mas que ayudar.
const COLS_VENTA = ['Vendidos 7 d', 'Vendidos 30 d']
const hayVenta = filas => filas.some(f => f.v30 !== undefined)

/** Una sucursal: código, modelo, existencia y, si las hay, las ventas. */
export function descargarInventario(filas, nombreSucursal, etiquetaFiltro) {
  const libro = XLSX.utils.book_new()
  const conVenta = hayVenta(filas)
  const datos = filas.map(f => [
    f.codigo, f.producto, f.existencia,
    ...(conVenta ? [f.v7 ?? 0, f.v30 ?? 0] : []),
  ])
  const encabezados = ['Código', 'Modelo', 'Existencia', ...(conVenta ? COLS_VENTA : [])]
  XLSX.utils.book_append_sheet(libro, hojaDe(datos, encabezados), 'Inventario')
  XLSX.writeFile(libro, `inventario-${limpio(nombreSucursal)}-${limpio(etiquetaFiltro)}.xlsx`)
}

/** Vista consolidada: una columna por sucursal más el total. */
export function descargarInventarioConsolidado(filas, sucursales, etiquetaFiltro) {
  const libro = XLSX.utils.book_new()
  const conVenta = hayVenta(filas)
  const datos = filas.map(f => [
    f.codigo,
    f.producto,
    // Un modelo que no existe en una sucursal deja la celda vacía, no en cero:
    // no es lo mismo "no lo manejan" que "se acabó". Con null la celda ni
    // siquiera se escribe, así que en Excel queda de verdad en blanco y no
    // como una cadena vacía que estorbaría al ordenar.
    ...sucursales.map(s => (f.porSucursal[s.slug] === undefined ? null : f.porSucursal[s.slug])),
    f.total,
    ...(conVenta ? [f.v7 ?? 0, f.v30 ?? 0] : []),
  ])
  XLSX.utils.book_append_sheet(
    libro,
    hojaDe(datos, [
      'Código', 'Modelo', ...sucursales.map(s => s.nombre), 'Total',
      ...(conVenta ? COLS_VENTA : []),
    ]),
    'Consolidado',
  )
  XLSX.writeFile(libro, `inventario-consolidado-${limpio(etiquetaFiltro)}.xlsx`)
}

/**
 * Lista de surtido. Las columnas cambian segun la vista, porque no es lo
 * mismo una orden de compra que una propuesta de baja.
 */
export function descargarSurtido(filas, nombreSucursal, vista, meta = {}) {
  const libro = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(libro, hojaDe([
    ['Sucursal',          nombreSucursal],
    ['Vista',             vista],
    ['Temporada',         meta.esAlta ? 'alta' : 'baja'],
    ['Días de cobertura', meta.cobertura ?? ''],
    ['Días de historial', meta.diasHistorial ?? ''],
    ['Generado',          new Date().toLocaleString('es-MX')],
  ], ['Dato', 'Valor']), 'Resumen')

  let datos, encabezados
  if (vista === 'depurar') {
    encabezados = ['Código', 'Modelo', 'Piezas paradas', 'Sucursales']
    datos = filas.map(f => [f.codigo, f.producto, f.existencia, (f.plazas ?? []).map(p => p.slug).join(', ')])
  } else if (vista === 'muestra') {
    encabezados = ['Código', 'Modelo', 'Pedir']
    datos = filas.map(f => [f.codigo, f.producto, 1])
  } else {
    encabezados = ['Código', 'Modelo', 'Existencia', 'Piezas al día', 'Días que aguanta', 'Pedir']
    datos = filas.map(f => [
      f.codigo, f.producto, f.existencia,
      Number(f.ritmo.toFixed(3)),
      f.cobertura === null ? '' : Math.floor(f.cobertura),
      f.sugerido,
    ])
  }

  XLSX.utils.book_append_sheet(libro, hojaDe(datos, encabezados), 'Surtido')
  XLSX.writeFile(libro, `surtido-${limpio(nombreSucursal)}-${limpio(vista)}.xlsx`)
}
