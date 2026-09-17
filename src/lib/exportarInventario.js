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

/** Una sucursal: código, modelo y existencia. */
export function descargarInventario(filas, nombreSucursal, etiquetaFiltro) {
  const libro = XLSX.utils.book_new()
  const datos = filas.map(f => [f.codigo, f.producto, f.existencia])
  XLSX.utils.book_append_sheet(libro, hojaDe(datos, ['Código', 'Modelo', 'Existencia']), 'Inventario')
  XLSX.writeFile(libro, `inventario-${limpio(nombreSucursal)}-${limpio(etiquetaFiltro)}.xlsx`)
}

/** Vista consolidada: una columna por sucursal más el total. */
export function descargarInventarioConsolidado(filas, sucursales, etiquetaFiltro) {
  const libro = XLSX.utils.book_new()
  const datos = filas.map(f => [
    f.codigo,
    f.producto,
    // Un modelo que no existe en una sucursal deja la celda vacía, no en cero:
    // no es lo mismo "no lo manejan" que "se acabó". Con null la celda ni
    // siquiera se escribe, así que en Excel queda de verdad en blanco y no
    // como una cadena vacía que estorbaría al ordenar.
    ...sucursales.map(s => (f.porSucursal[s.slug] === undefined ? null : f.porSucursal[s.slug])),
    f.total,
  ])
  XLSX.utils.book_append_sheet(
    libro,
    hojaDe(datos, ['Código', 'Modelo', ...sucursales.map(s => s.nombre), 'Total']),
    'Consolidado',
  )
  XLSX.writeFile(libro, `inventario-consolidado-${limpio(etiquetaFiltro)}.xlsx`)
}
