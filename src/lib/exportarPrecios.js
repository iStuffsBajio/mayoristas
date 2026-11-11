// El reporte de precios a revisar, una hoja por sucursal.
//
// Nace de una instrucción del dueño: «los modelos que tengan un precio
// diferente posiblemente sea un error, esos también aislarlos y ponerlo
// dentro de la lista de cosas a modificar por sucursal».
//
// ── Por qué se baja en vez de enseñarse en el panel de la sucursal ─────────
//
// Porque la sucursal no puede verlo. Esto sale de `ventas/<plaza>.json`, que
// es un prefijo privado de administrador: lleva los nombres de los mayoristas
// y el de quién cobró cada ticket. Así que el dueño lo baja y se lo manda a
// cada plaza, igual que el reporte de la cola de revisión.
//
// ── Dos trabajos distintos en hojas distintas ─────────────────────────────
//
//   · **Cobra menos que su lista.** O la lista está alta y hay que bajarla, o
//     el mostrador está regalando margen. Lo decide quien conoce la plaza.
//   · **Mayoreo más caro que público.** Eso no es opinable: es un precio mal
//     puesto, y se arregla sin discutir.
//
// Y una advertencia que va dentro del propio Excel, porque es donde se va a
// leer sin contexto: estas cifras son de la VENTANA de 365 días. Con todo el
// historial, la diferencia de San Luis salía en $1,582,316 cuando la de verdad
// es $9,657: se estaban comparando ventas de 2021 contra la lista de hoy.

import XLSX from 'xlsx-js-style'
import { hojaDeTabla, nombreHoja, celda, estiloNota } from './excelEstilo.js'
import { CASOS } from './precioCobrado.js'

export const TEXTO_CASO = {
  [CASOS.COBRA_MENOS]: 'Cobra menos que su lista',
  [CASOS.COBRA_MAS]:   'Cobra más que su lista',
}

const COLUMNAS = [
  { titulo: 'Código',   valor: f => f.codigo, fuerte: true, ancho: 14 },
  { titulo: 'Producto', valor: f => f.producto },
  { titulo: 'Familia',  valor: f => f.familia, ancho: 12 },
  { titulo: 'Piezas al público', valor: f => f.piezasPublico, num: true, ancho: 16 },
  { titulo: 'Se cobra', valor: f => Math.round(f.cobrado), num: true, ancho: 11 },
  { titulo: 'Su mayoreo', valor: f => Math.round(f.mayoreo), num: true, ancho: 12 },
  { titulo: 'Dice la lista', valor: f => Math.round(f.lista), num: true, ancho: 13 },
  { titulo: 'Se deja de ganar', valor: f => f.pesos, num: true, ancho: 16 },
]

/**
 * El libro. Una hoja por plaza, y dentro lo que más dinero mueve primero.
 *
 * `porPlaza` es `{ slug: { nombre, bajo } }`, con `bajo` lo que devuelve
 * `porDebajoDelMayoreo()`.
 */
export function libroDePrecios(porPlaza, { hoy = new Date(), dias = 365 } = {}) {
  const libro = XLSX.utils.book_new()
  let alguna = false

  for (const [, { nombre, bajo }] of Object.entries(porPlaza ?? {})) {
    const filas = bajo?.filas ?? []
    if (!filas.length) continue
    alguna = true

    const hoja = hojaDeTabla(COLUMNAS, filas)
    // La nota va DENTRO de la hoja, dos renglones por debajo de la tabla: es
    // donde se lee, y sin ella alguien puede sumar la columna de diferencia y
    // creer que falta ese dinero.
    const fin = filas.length + 3
    celda(hoja, `A${fin}`,
      `Cifras de los últimos ${dias} días. Estos códigos se cobraron a un cliente de `
      + `mostrador POR DEBAJO de su propio precio de mayoreo. No se comparan contra la `
      + `lista al público: en las plazas que negocian, casi ninguna venta sale a ese `
      + `precio. «Se deja de ganar» es la diferencia contra haber cobrado al menos el `
      + `mayoreo, no dinero que falte de la caja.`,
      estiloNota)

    XLSX.utils.book_append_sheet(libro, hoja, nombreHoja(nombre))
  }

  if (!alguna) return null
  return { libro, archivo: `precios-a-revisar-${hoy.toISOString().slice(0, 10)}.xlsx` }
}

export function descargarPrecios(porPlaza, opciones) {
  const r = libroDePrecios(porPlaza, opciones)
  if (!r) return null
  XLSX.writeFile(r.libro, r.archivo)
  return r.archivo
}
