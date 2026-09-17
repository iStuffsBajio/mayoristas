// Exporta el historial permanente a un Excel.
//
// El historial en S3 guarda el acumulado por mes y modelo. Aquí se convierte a
// un libro con una hoja de resumen y una hoja por mes, que es el formato en el
// que se puede abrir, filtrar y comparar sin depender de la página.

import * as XLSX from 'xlsx'
import { filasDePeriodo, periodosDisponibles, comparativo, nombreDePeriodo } from './estadisticas'

export { nombreDePeriodo }

/** Nombre de hoja válido para Excel: 31 caracteres y sin : \ / ? * [ ] */
function nombreHoja(texto) {
  return texto.replace(/[:\\/?*[\]]/g, '-').slice(0, 31)
}

/** Ajusta el ancho de las columnas al contenido, con un tope razonable. */
function anchos(filas, encabezados) {
  return encabezados.map((enc, i) => {
    const largo = filas.reduce((max, f) => Math.max(max, String(f[i] ?? '').length), enc.length)
    return { wch: Math.min(48, largo + 2) }
  })
}

function hojaDe(filas, encabezados) {
  const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas])
  hoja['!cols'] = anchos(filas, encabezados)
  return hoja
}

/** Archivo con el nombre de la sucursal ya limpio de acentos y espacios. */
function nombreArchivo(nombreSucursal, marca) {
  const suc = String(nombreSucursal)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-').toLowerCase()
  return `movimiento-${suc}-${marca}.xlsx`
}

/**
 * Arma el libro del archivo por mes. Si se pasa un periodo, solo ese mes;
 * si no, todos. Devuelve el workbook para que quien llame decida qué hacer.
 */
export function libroDeHistorial(historial, periodo = null) {
  const disponibles = periodosDisponibles(historial)
  const elegidos = periodo ? disponibles.filter(p => p.periodo === periodo) : disponibles

  const libro = XLSX.utils.book_new()

  const resumen = elegidos.map(p => [
    nombreDePeriodo(p.periodo),
    p.periodo,
    p.total,
    p.modelos,
    p.dias,
  ])
  XLSX.utils.book_append_sheet(
    libro,
    hojaDe(resumen, ['Periodo', 'Clave', 'Piezas que salieron', 'Modelos distintos', 'Días con dato']),
    'Resumen',
  )

  for (const p of elegidos) {
    const filas = filasDePeriodo(historial, p.periodo).map(f => [f.codigo, f.producto, f.salidas])
    XLSX.utils.book_append_sheet(
      libro,
      hojaDe(filas, ['Código', 'Modelo', 'Piezas que salieron']),
      nombreHoja(nombreDePeriodo(p.periodo)),
    )
  }

  return libro
}

/** Arma el libro y lo baja al equipo. */
export function descargarHistorial(historial, nombreSucursal, periodo = null) {
  XLSX.writeFile(libroDeHistorial(historial, periodo), nombreArchivo(nombreSucursal, periodo || 'historial-completo'))
}

// ── Comparativo entre periodos ───────────────────────────────────────────────

/** Palabra de la tendencia, para poder filtrar la columna en Excel. */
export function tendenciaDe(fila) {
  if (fila.antes === 0) return fila.salidas > 0 ? 'nuevo' : 'sin movimiento'
  if (fila.delta > 0) return 'sube'
  if (fila.delta < 0) return 'baja'
  return 'igual'
}

/**
 * Libro del comparativo: el ranking completo del periodo con su columna del
 * periodo previo al lado, para poder ordenar por caída o por alza en Excel.
 */
export function libroDeComparativo(comp, nombreSucursal) {
  const libro = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(libro, hojaDe([
    ['Sucursal',        nombreSucursal],
    ['Periodo',         comp.etiqueta],
    ['Periodo previo',  comp.etiquetaPrevia],
    ['Piezas',          comp.total],
    ['Piezas previas',  comp.totalPrevio],
    ['Diferencia',      comp.delta],
    ['Cambio %',        comp.pct === null ? 'sin base' : comp.pct],
    ['Días con dato',   comp.dias],
    ['Días previos',    comp.diasPrevios],
  ], ['Dato', 'Valor']), 'Resumen')

  const filas = comp.filas.map(f => [
    f.codigo,
    f.producto,
    f.salidas,
    f.antes,
    f.delta,
    f.pct === null ? '' : f.pct / 100,
    tendenciaDe(f),
  ])

  const hoja = hojaDe(filas, [
    'Código', 'Modelo',
    `Piezas ${comp.etiqueta}`,
    `Piezas ${comp.etiquetaPrevia}`,
    'Diferencia', 'Cambio %', 'Tendencia',
  ])

  // La columna de porcentaje va como número con formato, no como texto, para
  // que Excel la pueda ordenar y graficar.
  for (let i = 0; i < filas.length; i++) {
    const celda = hoja[XLSX.utils.encode_cell({ r: i + 1, c: 5 })]
    if (celda && typeof celda.v === 'number') { celda.t = 'n'; celda.z = '+0%;-0%;0%' }
  }

  XLSX.utils.book_append_sheet(libro, hoja, 'Comparativo')
  return libro
}

/** Arma el comparativo de los últimos `meses` y lo baja al equipo. */
export function descargarComparativo(historial, nombreSucursal, meses) {
  const comp = comparativo(historial, meses)
  if (!comp) return
  XLSX.writeFile(libroDeComparativo(comp, nombreSucursal), nombreArchivo(nombreSucursal, `comparativo-${meses}m`))
}
