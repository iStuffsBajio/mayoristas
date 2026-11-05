// El reporte de los costos que faltan en bodega.
//
// Nace de una decisión del dueño: el costo se toma de BODEGA y de nadie más,
// porque bodega es quien compra. En las sucursales lo captura otra persona y
// puede equivocarse -el mismo iPhone 15 dice 36 en bodega y 55 en
// Aguascalientes- y un margen calculado sobre el número equivocado no se
// distingue en pantalla de uno bueno.
//
// El precio de esa decisión es que hoy falta mucho costo, así que la lista no
// se esconde: se baja en Excel, se captura en bodega y la pestaña de Ventas
// la ve encogerse sola en el respaldo siguiente. Eso es el flujo de trabajo
// que pidió el dueño, y no un «pendiente» que nadie mira.
//
// Dos problemas con la misma cara, separados a propósito en hojas distintas
// porque son dos trabajos y los hace gente distinta:
//
//   · `costo-en-cero`     el producto está en bodega y le falta el número.
//                         Es de capturar, de un rato.
//   · `no-esta-en-bodega` el producto no está dado de alta. Se vende en las
//                         tiendas y bodega no lo conoce: eso no es un número
//                         que falte, es una decisión.

import XLSX from 'xlsx-js-style'
import { hojaDeTabla, nombreHoja } from './excelEstilo.js'

export const CASOS = {
  'costo-en-cero':     'Falta capturar el costo',
  'no-esta-en-bodega': 'No está dado de alta en bodega',
}

const COLUMNAS = [
  { titulo: 'Código',   valor: f => f.codigo, fuerte: true, ancho: 14 },
  { titulo: 'Producto', valor: f => f.producto },
  { titulo: 'Piezas vendidas', valor: f => f.piezas, num: true, ancho: 16 },
  { titulo: 'Qué falta', valor: f => CASOS[f.caso] ?? f.caso, ancho: 30 },
]

/** El libro: todo junto y luego cada trabajo por su lado. */
export function libroDeCostos(filas, { hoy = new Date() } = {}) {
  const todas = filas ?? []
  const libro = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(libro, hojaDeTabla(COLUMNAS, todas), nombreHoja('Todos'))

  for (const [caso, hoja] of [
    ['costo-en-cero', 'Capturar costo'],
    ['no-esta-en-bodega', 'Dar de alta'],
  ]) {
    const suyas = todas.filter(f => f.caso === caso)
    if (suyas.length) {
      XLSX.utils.book_append_sheet(libro, hojaDeTabla(COLUMNAS, suyas), nombreHoja(hoja))
    }
  }

  // La fecha va en el nombre: este reporte se baja varias veces y lo único
  // que importa es cuál es el último.
  return { libro, archivo: `costos-que-faltan-${hoy.toISOString().slice(0, 10)}.xlsx` }
}

export function descargarCostos(filas, opciones) {
  const { libro, archivo } = libroDeCostos(filas, opciones)
  XLSX.writeFile(libro, archivo)
  return archivo
}
