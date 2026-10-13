// Búsqueda de modelos tolerante a cómo esté escrito el nombre.
//
// El problema con un `includes` crudo: el catálogo escribe el mismo modelo de
// varias formas —«SAMSUNG A16», «GALAXY A 16», «A16 5G»— y la marca a veces va
// y a veces no. Buscar «a16» encontraba unos y otros no, sin que se notara
// cuáles faltaban.
//
// Aquí se normaliza todo a letras y números pegados, sin acentos ni signos, y
// se exige que cada palabra de la búsqueda aparezca en alguna parte. Así
// «a16», «A 16» y «16 a» encuentran lo mismo, y la marca no estorba porque se
// busca dentro de la cadena completa y no por campos.

/** Deja sólo letras y números, en mayúsculas y sin acentos. */
export const normalizar = texto =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

/**
 * Una función que dice si una fila coincide con la búsqueda.
 *
 * Devuelve siempre `true` cuando no hay nada escrito, para poder usarla como
 * filtro sin condicionales alrededor.
 */
export function coincideCon(busqueda, campos = f => [f.producto, f.codigo]) {
  const palabras = String(busqueda ?? '')
    .split(/\s+/)
    .map(normalizar)
    .filter(Boolean)

  if (!palabras.length) return () => true

  return fila => {
    const heno = campos(fila).map(normalizar).join(' ')
    return palabras.every(p => heno.includes(p))
  }
}

/**
 * Filtra una lista aplicando el filtro de la pantalla Y la búsqueda, con la
 * regla que los une: **mientras se busca, el filtro no cuenta**.
 *
 * Vive aquí y no dentro del componente a propósito. La regla se ha roto tres
 * veces: buscar «s23 ultra» en bodega devolvía cero porque el filtro «Urgente
 * (1-3)» estaba puesto y los dos Ultra tienen 34 y 4 piezas. El dato estaba
 * bien y la respuesta parecía mentira. Encerrada aquí, con pruebas que la
 * fijan, cambiarla sin darse cuenta deja de ser posible.
 *
 * Buscar es ir por un modelo concreto. Si existe, tiene que aparecer, esté en
 * el tramo de existencia que esté y sea de la marca que sea.
 */
export function filtrarYBuscar({ filas, busqueda, pasaFiltro = () => true, campos }) {
  const hayBusqueda = String(busqueda ?? '').trim().length > 0
  const base = hayBusqueda ? (filas ?? []) : (filas ?? []).filter(pasaFiltro)
  return base.filter(coincideCon(busqueda, campos))
}

/** True si hay algo escrito. Para que la pantalla lo diga sin recalcularlo. */
export const hayBusqueda = b => String(b ?? '').trim().length > 0
