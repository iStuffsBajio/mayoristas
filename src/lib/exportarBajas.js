// La lista de lo que hay que dar de baja, para llevarla a la caja.
//
// ── Por qué existe ────────────────────────────────────────────────────────
//
// La página no puede borrar un código de Eleventa, y no debería poder: el
// respaldo manda y cualquier cosa escrita encima se borra sola esa tarde. Lo
// que sí puede es **llevar el control** de lo que hay que borrar, que es lo
// que pidió el dueño: «quiero llevar un control de todo lo que tengo que dar
// de baja, y una vez que se dé de baja que aparezca como resuelto».
//
// El estado no lo marca nadie. Mientras el código siga vivo en alguna plaza
// queda pendiente; cuando desaparece de todas, `estadoDe()` lo pasa a
// resuelto solo. Esto sólo lleva lo PENDIENTE al papel, que es lo que se
// imprime o se manda a cada tienda.
//
// ── Una hoja por plaza, y no una lista general ───────────────────────────
//
// Porque el trabajo es de cada tienda: borrar un código en León no borra nada
// en San Luis. Una lista general obliga a quien la recibe a buscar sus
// renglones entre los de los demás, y eso es exactamente lo que hace que un
// reporte no se use.

import XLSX from 'xlsx-js-style'
import { hojaDeTabla, nombreHoja, celda, estiloNota } from './excelEstilo.js'
import {
  MOTIVOS, pendientesPorPlaza, historialDeBajas, resumenDeBajas,
} from './ajustes.js'
import { nombreSucursal } from './sucursales.js'

const COLUMNAS = [
  { titulo: 'Código',   valor: f => f.codigo, fuerte: true, ancho: 16 },
  { titulo: 'Producto', valor: f => f.producto || '', ancho: 38 },
  { titulo: 'Por qué',  valor: f => MOTIVOS[f.motivo] ?? f.motivo, ancho: 26 },
  { titulo: 'Días pendiente', valor: f => f.dias, num: true, ancho: 15 },
  { titulo: 'Lo marcó', valor: f => f.quien ?? '', ancho: 14 },
  { titulo: 'Nota',     valor: f => f.nota || '', ancho: 34 },
]

/**
 * El libro de bajas pendientes, una hoja por plaza.
 *
 * `ajustes` son los ya juntados e `inventarios` el `{ slug: json }` con el
 * que se decide qué sigue vivo. Devuelve `null` si no hay nada pendiente: un
 * libro vacío se lee como «no se pudo», no como «está todo hecho».
 */
export function libroDeBajas(ajustes, inventarios, { hoy = new Date() } = {}) {
  const porPlaza = pendientesPorPlaza(ajustes, inventarios, hoy)
  const slugs = Object.keys(porPlaza).filter(s => porPlaza[s].length)
  if (!slugs.length) return null

  const libro = XLSX.utils.book_new()
  for (const slug of slugs) {
    // Lo más viejo primero: es lo que lleva más tiempo ensuciando el panel.
    const filas = [...porPlaza[slug]].sort((a, b) => b.dias - a.dias)
    const hoja = hojaDeTabla(COLUMNAS, filas)

    // La nota va DENTRO de la hoja, que es donde se lee sin contexto.
    const fin = filas.length + 3
    celda(hoja, `A${fin}`,
      'Estos códigos hay que borrarlos en la caja de esta plaza. La página no '
      + 'puede hacerlo: el respaldo de Eleventa manda, y lo que se escriba '
      + 'encima se borra solo. En cuanto el respaldo llegue sin el código, '
      + 'desaparece de esta lista sin que nadie marque nada.',
      estiloNota)

    XLSX.utils.book_append_sheet(libro, hoja, nombreHoja(nombreSucursal(slug) || slug))
  }

  return { libro, archivo: `bajas-pendientes-${hoy.toISOString().slice(0, 10)}.xlsx` }
}

export function descargarBajas(ajustes, inventarios, opciones) {
  const r = libroDeBajas(ajustes, inventarios, opciones)
  if (!r) return null
  XLSX.writeFile(r.libro, r.archivo)
  return r.archivo
}

// ── El archivo completo: todo lo que se ha dado de baja alguna vez ────────
//
// El libro de arriba lleva sólo lo PENDIENTE, porque es una lista de tareas
// para la tienda. Este lleva TODO, incluido lo que ya desapareció del
// respaldo, porque contesta otra pregunta: «¿qué he quitado yo?».
//
// Sin él, la única pantalla que enseñaba estas notas las perdía de vista en
// cuanto el código desaparecía de verdad —se caía de «pendientes» y ya no
// salía en ningún sitio—, así que llevar el control acababa justo cuando el
// trabajo se había hecho bien.

const COLUMNAS_ARCHIVO = [
  { titulo: 'Estado',   valor: f => (f.resuelto ? 'Ya no está' : 'Sigue en la caja'), ancho: 17 },
  { titulo: 'Código',   valor: f => f.codigo, fuerte: true, ancho: 16 },
  { titulo: 'Producto', valor: f => f.producto || '', ancho: 38 },
  { titulo: 'Por qué',  valor: f => MOTIVOS[f.motivo] ?? f.motivo, ancho: 26 },
  { titulo: 'Se marcó', valor: f => String(f.cuando ?? '').slice(0, 10), ancho: 13 },
  { titulo: 'Lo marcó', valor: f => f.quien ?? '', ancho: 14 },
  { titulo: 'Dónde sigue', valor: f => (f.plazas ?? []).map(nombreSucursal).join(', '), ancho: 30 },
  { titulo: 'Días',     valor: f => f.dias, num: true, ancho: 9 },
  { titulo: 'Nota',     valor: f => f.nota || '', ancho: 34 },
]

export function libroArchivoDeBajas(ajustes, inventarios, { hoy = new Date() } = {}) {
  const filas = historialDeBajas(ajustes, inventarios, hoy)
  if (!filas.length) return null

  const libro = XLSX.utils.book_new()
  const hoja = hojaDeTabla(COLUMNAS_ARCHIVO, filas)
  const r = resumenDeBajas(filas)

  const fin = filas.length + 3
  celda(hoja, `A${fin}`,
    `${r.total} códigos dados de baja desde la página: ${r.pendientes} siguen `
    + `en la caja de alguna plaza y ${r.resueltas} ya no están en ningún `
    + 'respaldo. La página no borra nada de Eleventa —el respaldo manda— así '
    + 'que esto es el registro de lo que se decidió, no de lo que se ejecutó: '
    + 'un renglón pasa a «Ya no está» solo, cuando el respaldo llega sin él.',
    estiloNota)

  XLSX.utils.book_append_sheet(libro, hoja, nombreHoja('Archivo de bajas'))
  return { libro, archivo: `archivo-de-bajas-${hoy.toISOString().slice(0, 10)}.xlsx` }
}

export function descargarArchivoDeBajas(ajustes, inventarios, opciones) {
  const r = libroArchivoDeBajas(ajustes, inventarios, opciones)
  if (!r) return null
  XLSX.writeFile(r.libro, r.archivo)
  return r.archivo
}
