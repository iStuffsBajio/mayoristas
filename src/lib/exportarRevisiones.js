// El Excel de la cola de revisión.
//
// No es un volcado de la pantalla: la pantalla sirve para contestar caso por
// caso, y este archivo sirve para la pregunta siguiente, que es **por qué se
// repiten**. Por eso lleva dos hojas además del detalle:
//
//   · **Por plaza** — cuántos casos toca a cada una y de qué tipo. Si una sola
//     plaza pone la mitad de las diferencias de nombre, el problema no son
//     doscientos descuidos: es cómo se da de alta ahí.
//   · **Por tipo** — cuántos casos de cada clase y cuántos se contestaron. Es
//     lo que dice si lo que hay que arreglar es el catálogo de bodega, la
//     captura de las tiendas o la forma de dar de baja un modelo.
//
// Los casos sin contestar también salen, marcados como tales: un análisis que
// sólo mire lo contestado mide el entusiasmo de quien contesta, no el catálogo.

import XLSX from 'xlsx-js-style'
import {
  C, estiloTitulo, estiloSubtitulo, estiloNota, estiloSeccion,
  hojaDeTabla, celda, nombreHoja,
} from './excelEstilo.js'
import { nombreSucursal } from './sucursales.js'

const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
             'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const hoy = () => {
  const d = new Date()
  return `${d.getDate()} de ${MES[d.getMonth()]} de ${d.getFullYear()}`
}

const quienEs = por => (!por ? '' : por === 'admin' ? 'Administración' : nombreSucursal(por))

/** «pendiente» e «ignorado» son como se llamaban el sí y el no al principio. */
const respuestaDe = m => {
  if (!m) return null
  if (m.estado === 'si' || m.estado === 'pendiente') return 'si'
  if (m.estado === 'no' || m.estado === 'ignorado') return 'no'
  return null
}

const comoEstado = m => {
  const r = respuestaDe(m)
  return r === 'si' ? 'Sí' : r === 'no' ? 'No' : 'Sin contestar'
}

/**
 * Lo que hay que hacer con el caso, según lo contestado.
 *
 * Un «sí» lleva la solución dentro —es la propuesta— y un «no» la lleva en la
 * explicación que se obligó a escribir. Ponerlas en la misma columna es lo que
 * hace que la hoja se pueda repartir como lista de tareas.
 */
const queHacer = f => {
  const r = respuestaDe(f.marca)
  if (r === 'si') return f.item.siHacer ?? ''
  if (r === 'no') return f.marca.nota || f.item.noHacer || ''
  return ''
}

// El `if (!iso)` no sobra: `new Date(null)` no es una fecha inválida, es el
// 1 de enero de 1970, así que un código sin venta conocida salía con una fecha
// de aspecto perfectamente normal en la columna «Última venta».
const soloFecha = iso => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/**
 * Las plazas a las que toca un caso, por su nombre.
 *
 * Cada ficha la trae ya resuelta: la tabla que enseña la pantalla no sirve
 * para esto porque en un patron de escritura lista las cinco plazas, incluidas
 * las que ya lo tienen bien.
 */
const plazasDe = item => (item.plazas ?? []).map(nombreSucursal).join(', ')

const COLUMNAS = [
  { titulo: 'Caso',        valor: f => f.item.id, ancho: 26 },
  { titulo: 'Tipo',        valor: f => (f.item.bloque === 'codigo' ? 'Código' : 'Nombre'), ancho: 10 },
  { titulo: 'Qué toca',    valor: f => f.item.etiqueta ?? '', ancho: 26 },
  { titulo: 'Problema',    valor: f => f.item.titulo, ancho: 44 },
  { titulo: 'Qué se sabe', valor: f => (f.item.contexto ?? []).join(' · '), ancho: 70 },
  { titulo: 'Plazas',      valor: f => plazasDe(f.item), ancho: 30 },
  { titulo: 'Pregunta',    valor: f => f.item.pregunta ?? '', ancho: 44 },
  { titulo: 'Respuesta',   valor: f => comoEstado(f.marca), fuerte: true, ancho: 12,
    color: f => { const r = respuestaDe(f.marca); return r === 'si' ? C.verde : r === 'no' ? C.tinta : C.tintaTenue } },
  { titulo: 'Qué hacer',   valor: queHacer, ancho: 56 },
  { titulo: 'Explicación', valor: f => f.marca?.nota ?? '', ancho: 46 },
  { titulo: 'Quién',       valor: f => quienEs(f.marca?.por), ancho: 16 },
  { titulo: 'Cuándo',      valor: f => soloFecha(f.marca?.fecha), ancho: 12 },
  { titulo: 'Peso',        valor: f => f.item.peso, num: true, ancho: 8 },
]

/**
 * Un renglón por CÓDIGO, que es como se trabaja.
 *
 * Una ficha puede ser un lote: una pregunta que ordena veinte códigos de
 * golpe. Eso está bien para contestar y fatal para repartir el trabajo, así
 * que aquí el lote se abre y cada código sale con su propia línea, llevándose
 * la respuesta que se dio al lote entero.
 *
 * Las fichas de patrón no tienen código —cambian una palabra en cientos de
 * nombres— y por eso no aparecen en esta hoja; están enteras en «Casos».
 */
const porCodigo = filas => filas.flatMap(f =>
  (f.item.codigos ?? []).map(c => ({ ...f, c })))

// En qué plaza hay que hacer el trabajo.
//
// Va sobre dónde está dado de ALTA el código y no sobre dónde hay existencia:
// la lista que abre esta hoja es la de los que no tienen ni una pieza en
// ninguna parte, y con las plazas con existencia la columna salía en blanco
// justo en los treinta renglones donde la única pregunta es «¿en dónde lo
// borro?». Dado de alta con cero piezas es exactamente lo que hay que borrar.
const dondeTocar = c => {
  const alta = c.altaEn ?? []
  return (alta.length ? alta : Object.keys(c.plazas ?? {})).map(nombreSucursal).join(', ')
}

const COLUMNAS_CODIGO = [
  { titulo: 'Código',       valor: f => f.c.codigo, fuerte: true, ancho: 14 },
  { titulo: 'Producto',     valor: f => f.c.producto ?? '', ancho: 46 },
  { titulo: 'Piezas',       valor: f => Number(f.c.piezas) || 0, num: true, ancho: 9 },
  { titulo: 'Plazas',       valor: f => dondeTocar(f.c), ancho: 30 },
  { titulo: 'Última venta', valor: f => soloFecha(f.c.ultimaVenta), ancho: 13 },
  { titulo: 'Respuesta',    valor: f => comoEstado(f.marca), fuerte: true, ancho: 12,
    color: f => { const r = respuestaDe(f.marca); return r === 'si' ? C.verde : r === 'no' ? C.tinta : C.tintaTenue } },
  { titulo: 'Qué hacer',    valor: queHacer, ancho: 60 },
  { titulo: 'Qué toca',     valor: f => f.item.etiqueta ?? '', ancho: 26 },
  { titulo: 'Caso',         valor: f => f.item.id, ancho: 24 },
]

/** Una hoja de resumen: etiqueta, total, sí, no, sin contestar. */
function hojaResumen(titulo, grupos) {
  return hojaDeTabla([
    { titulo, valor: g => g.etiqueta, fuerte: true, ancho: 30 },
    { titulo: 'Casos',         valor: g => g.total, num: true },
    { titulo: 'Sí',            valor: g => g.si,    num: true },
    { titulo: 'No',            valor: g => g.no,    num: true },
    { titulo: 'Sin contestar', valor: g => g.sinContestar, num: true,
      color: g => (g.sinContestar > 0 ? C.ambar : C.tinta) },
  ], grupos)
}

const agrupar = (filas, clave) => {
  const r = new Map()
  for (const f of filas) {
    for (const etiqueta of [clave(f)].flat().filter(Boolean)) {
      const g = r.get(etiqueta) ?? { etiqueta, total: 0, si: 0, no: 0, sinContestar: 0 }
      g.total++
      const contesto = respuestaDe(f.marca)
      if (contesto === 'si') g.si++
      else if (contesto === 'no') g.no++
      else g.sinContestar++
      r.set(etiqueta, g)
    }
  }
  return [...r.values()].sort((a, b) => b.total - a.total)
}

/** Portada: de qué va el archivo y cuánto se ha contestado. */
function portada(filas) {
  const hoja = {}
  const contestados = filas.filter(f => f.marca).length

  celda(hoja, 'A1', 'Revisión del catálogo', estiloTitulo, 's')
  celda(hoja, 'A2', hoy(), estiloSubtitulo, 's')
  const si = filas.filter(f => respuestaDe(f.marca) === 'si').length
  const no = filas.filter(f => respuestaDe(f.marca) === 'no').length

  celda(hoja, 'A4', `${filas.length} casos · ${si} con «sí» · ${no} con «no» · ${filas.length - contestados} sin contestar`, estiloSeccion, 's')
  celda(hoja, 'A6',
    'Cada caso sale de comparar el catálogo de las cinco plazas entre sí. No hay nada escrito a mano: '
    + 'si un caso desaparece es porque el dato ya cambió en la caja.', estiloNota, 's')
  celda(hoja, 'A7',
    'La columna «Qué hacer» es la lista de tareas: en los «sí» es la propuesta que se aceptó, y en los '
    + '«no» es la explicación que quien contestó tuvo que escribir para poder guardarlo.', estiloNota, 's')
  celda(hoja, 'A8',
    'Las hojas «Por plaza» y «Por tipo» están para buscar la causa, no para contar: lo que importa no es '
    + 'cuántos casos hay, sino si se concentran en una plaza o en una forma de dar de alta.', estiloNota, 's')
  celda(hoja, 'A9',
    'Un caso puede ser un lote: una pregunta que ordena muchos códigos de golpe. «Casos» lleva las '
    + 'preguntas; «Códigos» las abre y da un renglón por código, que es como se reparte el trabajo.',
    estiloNota, 's')

  hoja['!cols'] = [{ wch: 120 }]
  hoja['!ref'] = 'A1:A9'
  return hoja
}

/**
 * Descarga el libro.
 *
 * `cola` son las fichas tal y como las construye el panel, y `marcas` el mapa
 * de respuestas { id: { estado, nota, fecha, por } }.
 */
export function libroDeRevisiones(cola, marcas) {
  // El libro sale en el mismo orden que la pantalla —por lo que hay que hacer
  // con cada caso— y no en el que se detectaron. La hoja se reparte como lista
  // de tareas, así que lo que se ejecuta sin pensar tiene que ir arriba.
  const filas = (cola ?? [])
    .map(item => ({ item, marca: marcas?.[item.id] ?? null }))
    .sort((a, b) => (a.item.orden ?? 9) - (b.item.orden ?? 9)
      || (b.item.peso ?? 0) - (a.item.peso ?? 0))
  if (!filas.length) return null

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, portada(filas), nombreHoja('Resumen'))
  XLSX.utils.book_append_sheet(libro, hojaResumen('Plaza', agrupar(filas, f => plazasDe(f.item).split(', '))), nombreHoja('Por plaza'))
  XLSX.utils.book_append_sheet(libro, hojaResumen('Tipo', agrupar(filas, f => f.item.titulo)), nombreHoja('Por tipo'))
  XLSX.utils.book_append_sheet(libro, hojaDeTabla(COLUMNAS, filas), nombreHoja('Casos'))
  XLSX.utils.book_append_sheet(libro, hojaDeTabla(COLUMNAS_CODIGO, porCodigo(filas)), nombreHoja('Códigos'))

  return libro
}

/** Lo mismo, pero descargado. Separado para poder comprobar el libro sin
 *  navegador: un .xlsx corrupto se abre sin quejarse con la misma libreria
 *  que lo escribio, asi que la prueba mira el XML. */
export function exportarRevisiones(cola, marcas) {
  const libro = libroDeRevisiones(cola, marcas)
  if (!libro) return false
  XLSX.writeFile(libro, `revision-catalogo-${new Date().toISOString().slice(0, 10)}.xlsx`)
  return true
}
