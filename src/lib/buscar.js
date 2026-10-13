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
