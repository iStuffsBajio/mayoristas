// El reporte de depuración del catálogo, descargable.
//
// Lo pidió el dueño el 2026-11-09: un reporte «descargable / filtrable» con
// cuatro pestañas —modelos de salida, sin rotación de más de un año,
// obsoletos en ceros y depuración por marca o departamento—.
//
// Cada hoja lleva DENTRO la nota de qué es y qué no es, que es donde se lee
// sin contexto: un Excel suelto que dice «dar de baja» sin decir que la página
// no borra nada de Eleventa se lee como un informe de algo ya hecho, y nadie
// va a la caja. Y las filas que el candado no deja dar de baja salen con su
// motivo en una columna, no escondidas: lo que casi se puede es justo lo que
// el dueño quiere ver venir.

import XLSX from 'xlsx-js-style'
import { hojaDeTabla, nombreHoja, celda, estiloNota } from './excelEstilo.js'
import { nombreSucursal } from './sucursales.js'
import { hoyLocal } from './fechas.js'

/** «León 3 · San Luis Potosí 2»: dónde hay piezas de un código. */
const dondeHay = f => Object.entries(f.stock ?? {})
  .filter(([, n]) => n > 0)
  .sort((a, b) => b[1] - a[1])
  .map(([slug, n]) => `${nombreSucursal(slug)} ${n}`)
  .join(' · ')

const ultima = f => f.ultimaVenta ?? 'nunca'
const dias = f => (f.diasSinVender === null || f.diasSinVender === undefined ? '' : f.diasSinVender)

const RAZON = {
  'sin-alta':         'Bodega lo descontinuó (no está en su catálogo)',
  'agotado-largo':    'Bodega lo tiene en cero desde hace tiempo',
  'agotado-reciente': 'Bodega lo tiene en cero hace poco: se resurte',
}

const COLUMNAS_SALIDA = [
  { titulo: 'Estado',   valor: f => (f.descontinuado ? 'Marcado' : 'Por revisar'), ancho: 13 },
  { titulo: 'Código',   valor: f => f.codigo, fuerte: true, ancho: 16 },
  { titulo: 'Modelo',   valor: f => f.producto, ancho: 38 },
  { titulo: 'Marca',    valor: f => f.categoria, ancho: 14 },
  { titulo: 'Qué pasa en bodega', valor: f => RAZON[f.razon] ?? '', ancho: 40 },
  { titulo: 'Piezas en tiendas', valor: f => f.stockTiendas, num: true, ancho: 17 },
  { titulo: 'Dónde hay', valor: dondeHay, ancho: 34 },
  { titulo: 'Última venta', valor: ultima, ancho: 14 },
  { titulo: 'Días sin vender', valor: dias, num: true, ancho: 16 },
]

const COLUMNAS_ROTACION = [
  { titulo: 'Código',   valor: f => f.codigo, fuerte: true, ancho: 16 },
  { titulo: 'Modelo',   valor: f => f.producto, ancho: 38 },
  { titulo: 'Marca',    valor: f => f.categoria, ancho: 14 },
  { titulo: 'Piezas en la red', valor: f => f.stockGlobal, num: true, ancho: 17 },
  { titulo: 'Dónde hay', valor: dondeHay, ancho: 34 },
  { titulo: 'Última venta', valor: ultima, ancho: 14 },
  { titulo: 'Días sin vender', valor: dias, num: true, ancho: 16 },
  { titulo: 'Días en el catálogo', valor: f => f.diasEnCatalogo ?? '', num: true, ancho: 19 },
]

const COLUMNAS_OBSOLETOS = [
  { titulo: '¿Se puede dar de baja?', valor: f => (f.puede ? 'Sí' : 'No todavía'), ancho: 22 },
  { titulo: 'Código',   valor: f => f.codigo, fuerte: true, ancho: 16 },
  { titulo: 'Modelo',   valor: f => f.producto, ancho: 38 },
  { titulo: 'Marca',    valor: f => f.categoria, ancho: 14 },
  { titulo: 'Última venta', valor: ultima, ancho: 14 },
  { titulo: 'Días sin vender', valor: dias, num: true, ancho: 16 },
  { titulo: 'Días en el catálogo', valor: f => f.diasEnCatalogo ?? '', num: true, ancho: 19 },
  { titulo: 'Qué falta', valor: f => (f.bloqueos ?? []).join('; '), ancho: 60 },
]

const COLUMNAS_CATEGORIA = [
  { titulo: '¿Entera?', valor: c => (c.completa ? 'Sí' : 'No'), ancho: 10 },
  { titulo: 'Marca o departamento', valor: c => c.categoria, fuerte: true, ancho: 24 },
  { titulo: 'Códigos', valor: c => c.codigos, num: true, ancho: 10 },
  { titulo: 'Piezas en la red', valor: c => c.stock, num: true, ancho: 17 },
  { titulo: 'Códigos con piezas', valor: c => c.conStock, num: true, ancho: 19 },
  { titulo: 'Última venta', valor: c => c.ultimaVenta ?? 'nunca', ancho: 14 },
  { titulo: 'Días sin vender', valor: c => (c.diasSinVender ?? ''), num: true, ancho: 16 },
  { titulo: 'Se podrían dar de baja', valor: c => c.libres, num: true, ancho: 22 },
  { titulo: 'Qué lo impide', valor: c => resumenBloqueos(c), ancho: 60 },
]

/** Lo que impide dar de baja una categoría, en una frase. */
function resumenBloqueos(c) {
  if (c.completa) return ''
  const partes = []
  if (c.conStock) partes.push(`${c.conStock} ${c.conStock === 1 ? 'código tiene' : 'códigos tienen'} piezas`)
  if (c.conVentaReciente) partes.push(`${c.conVentaReciente} ${c.conVentaReciente === 1 ? 'se vendió' : 'se vendieron'} dentro del plazo`)
  const otros = c.bloqueados.length - c.conStock - c.conVentaReciente
  if (otros > 0) partes.push(`${otros} sin prueba suficiente (poca antigüedad o falta un dato)`)
  return partes.join('; ')
}

const nota = (hoja, filas, texto) => celda(hoja, `A${filas + 3}`, texto, estiloNota)

/**
 * El libro de depuración. Devuelve `null` si no hay nada en ninguna lista: un
 * libro vacío se lee como «no se pudo», no como «no hay nada que depurar».
 */
export function libroDeDepuracion({
  salida = [], rotacion = [], obsoletos = [], categorias = [], dias: umbralObsoletos = 365,
  plazasSinInventario = [], hoy = new Date(),
}) {
  if (!salida.length && !rotacion.length && !obsoletos.length && !categorias.length) return null

  const libro = XLSX.utils.book_new()
  const falta = plazasSinInventario.length
    ? ` OJO: falta el inventario de ${plazasSinInventario.map(nombreSucursal).join(', ')}; su existencia NO está en estas cuentas y no se puede dar de baja nada hasta que se publique.`
    : ''

  if (salida.length) {
    const h = hojaDeTabla(COLUMNAS_SALIDA, salida)
    nota(h, salida.length,
      'Modelos con bodega en cero y piezas todavía en las tiendas. «Bodega lo descontinuó» es lo que '
      + 'se está liquidando; «en cero hace poco» es un faltante normal que bodega resurte, y hay que '
      + 'COMPRARLO, no liquidarlo. Marcar un modelo como descontinuado no lo oculta ni lo borra: sólo '
      + 'hace que la cola de revisión deje de reclamarlo como si fuera un error.')
    XLSX.utils.book_append_sheet(libro, h, nombreHoja('Modelos de salida'))
  }

  if (rotacion.length) {
    const h = hojaDeTabla(COLUMNAS_ROTACION, rotacion)
    nota(h, rotacion.length,
      'Piezas que no se han vendido en un año en toda la red, para acordar retirarlas de exhibición o '
      + 'rematarlas. Sólo se incluyen los códigos que llevan al menos un año en el catálogo: uno más '
      + 'nuevo no ha tenido tiempo de venderse, y decir que no rota sería inventarlo.'
      + ' La última venta sale del kárdex de Eleventa: un recuento de inventario no la rejuvenece.')
    XLSX.utils.book_append_sheet(libro, h, nombreHoja('Sin rotación'))
  }

  if (obsoletos.length) {
    const h = hojaDeTabla(COLUMNAS_OBSOLETOS, obsoletos)
    nota(h, obsoletos.length,
      `Códigos sin piezas en ninguna plaza y con la última venta de hace más de ${umbralObsoletos} días. `
      + 'La página no borra nada de Eleventa: dar de baja apunta la decisión y arma la lista de lo que '
      + 'cada tienda borra en su caja, y se cierra sola cuando el código deja de salir en el respaldo. '
      + 'Nunca se puede dar de baja un código con piezas en la red ni con ventas en los últimos 365 días.'
      + falta)
    XLSX.utils.book_append_sheet(libro, h, nombreHoja('Obsoletos en ceros'))
  }

  if (categorias.length) {
    const h = hojaDeTabla(COLUMNAS_CATEGORIA, categorias)
    nota(h, categorias.length,
      'Una marca o departamento sólo se puede dar de baja ENTERO si cada uno de sus códigos pasa el '
      + 'candado: sin piezas en la red y sin venta en dos años. Basta una pieza o una venta reciente '
      + 'para que no. El departamento sale de Eleventa; donde no viaja se deduce del nombre del producto.'
      + falta)
    XLSX.utils.book_append_sheet(libro, h, nombreHoja('Por marca o departamento'))
  }

  return { libro, archivo: `depuracion-${hoyLocal(hoy)}.xlsx` }
}

export function descargarDepuracion(datos) {
  const r = libroDeDepuracion(datos)
  if (!r) return null
  XLSX.writeFile(r.libro, r.archivo)
  return r.archivo
}
