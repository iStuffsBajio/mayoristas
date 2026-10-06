// Reconoce a qué mes corresponde la pestaña de un libro de estadística.
//
// Los nombres los puso una persona a lo largo de un año, así que no siguen
// ningún patrón: "OCT 25 AGS", "ENERO 2026  SLP", "MAYO LEON 2026",
// "LEON JUNIO 2026", "11 dias DICIEMBRE 25 LEON". En vez de pelearse con un
// formato, se busca un nombre de mes y un año en cualquier posición.

const MESES = [
  ['enero', 1], ['ene', 1],
  ['febrero', 2], ['feb', 2],
  ['marzo', 3], ['mar', 3],
  ['abril', 4], ['abr', 4],
  ['mayo', 5], ['may', 5],
  ['junio', 6], ['jun', 6],
  ['julio', 7], ['jul', 7],
  ['agosto', 8], ['ago', 8],
  ['septiembre', 9], ['sept', 9], ['sep', 9],
  ['octubre', 10], ['oct', 10],
  ['noviembre', 11], ['nov', 11],
  ['diciembre', 12], ['dic', 12],
]

// Pestañas que no son un mes de ventas: resúmenes, inventarios, mermas.
const NO_SON_MESES = [
  'top vendidos', 'revisiones', 'precio promedio', 'total mermas',
  '3 meses', 'mayoristas', 'inventario',
]

const limpiar = t => String(t || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim()

/**
 * Devuelve { periodo, mes, anio, parcial, dias } o null si la pestaña no es
 * un mes de ventas.
 *
 * `parcial` marca las que el propio nombre reconoce incompletas, como
 * "11 dias DICIEMBRE 25": son datos buenos pero de un tramo, no del mes.
 */
export function mesDePestana(nombre) {
  const t = limpiar(nombre)
  if (!t) return null
  if (NO_SON_MESES.some(p => t.includes(p))) return null

  // El mes más largo que aparezca: "septiembre" antes que "sep", y así no se
  // confunde "marzo" con "mar" dentro de otra palabra.
  let mes = null, largo = 0
  for (const [palabra, n] of MESES) {
    if (t.includes(palabra) && palabra.length > largo) { mes = n; largo = palabra.length }
  }
  if (!mes) return null

  // Año de cuatro cifras, o de dos cuando va suelto (25, 26).
  const cuatro = /\b(20\d{2})\b/.exec(t)
  let anio = cuatro ? Number(cuatro[1]) : null
  if (!anio) {
    const dos = /\b(2[0-9])\b/.exec(t)
    if (dos) anio = 2000 + Number(dos[1])
  }
  if (!anio) return null

  // "11 dias DICIEMBRE 25" → tramo de 11 días, no el mes entero.
  const tramo = /(\d{1,2})\s*dias?/.exec(t)

  return {
    periodo: `${anio}-${String(mes).padStart(2, '0')}`,
    mes,
    anio,
    parcial: !!tramo,
    dias: tramo ? Number(tramo[1]) : null,
  }
}

/** Días que tiene un mes del calendario. */
export const diasDelMes = periodo => {
  const [a, m] = periodo.split('-').map(Number)
  return new Date(a, m, 0).getDate()
}
