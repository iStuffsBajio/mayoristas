// Exporta el historial permanente a un Excel.
//
// El historial en S3 guarda el acumulado por mes y modelo. Aquí se convierte a
// un libro con una hoja de resumen y una hoja por mes, que es el formato en el
// que se puede abrir, filtrar y comparar sin depender de la página.

import * as XLSX from 'xlsx'
import { filasDePeriodo, periodosDisponibles } from './estadisticas'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "2026-09" → "septiembre 2026" */
export function nombreDePeriodo(p) {
  const [a, m] = String(p).split('-')
  return `${MESES[Number(m) - 1] ?? m} ${a}`
}

/** Nombre de hoja válido para Excel: 31 caracteres y sin : \ / ? * [ ] */
function nombreHoja(texto) {
  return texto.replace(/[:\/?*[\]]/g, '-').slice(0, 31)
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

/**
 * Arma el libro. Si se pasa un periodo, solo ese mes; si no, todos.
 * Devuelve el workbook para que quien llame decida si descargarlo.
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
  const libro = libroDeHistorial(historial, periodo)
  const marca = periodo || 'historial-completo'
  const suc   = String(nombreSucursal).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').toLowerCase()
  XLSX.writeFile(libro, `movimiento-${suc}-${marca}.xlsx`)
}
