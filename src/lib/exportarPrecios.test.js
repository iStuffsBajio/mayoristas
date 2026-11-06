import { test } from 'node:test'
import assert from 'node:assert/strict'
import { libroDePrecios, TEXTO_CASO } from './exportarPrecios.js'
import { CASOS } from './precioCobrado.js'

const fila = (codigo, extra = {}) => ({
  codigo, producto: 'FUNDA', familia: 'funda', piezasPublico: 10,
  cobrado: 128, lista: 250, razon: 0.512, pesos: -1220,
  caso: CASOS.COBRA_MENOS, ...extra,
})

test('una hoja por plaza, y solo de las que tienen algo', () => {
  const r = libroDePrecios({
    aguascalientes: { nombre: 'Aguascalientes', brecha: { filas: [fila('I11T')] } },
    leon:           { nombre: 'León',           brecha: { filas: [] } },
  })
  assert.deepEqual(r.libro.SheetNames, ['Aguascalientes'],
    'una hoja vacia se lee como «no se pudo», no como «esta limpio»')
})

test('sin nada que revisar no se genera un libro vacio', () => {
  assert.equal(libroDePrecios({ leon: { nombre: 'León', brecha: { filas: [] } } }), null)
  assert.equal(libroDePrecios(null), null)
})

test('la hoja avisa de que la diferencia NO es dinero perdido', () => {
  // Va dentro del Excel porque es donde se lee sin contexto. Sin la nota,
  // alguien suma la columna y cree que falta ese dinero.
  const { libro } = libroDePrecios({
    ags: { nombre: 'Ags', brecha: { filas: [fila('X')] } },
  })
  const hoja = libro.Sheets.Ags
  const texto = Object.values(hoja).map(c => c?.v).filter(v => typeof v === 'string').join(' ')
  assert.match(texto, /NO es dinero perdido/)
  assert.match(texto, /365 días/)
})

test('el rango de la hoja sale bien con la nota puesta', () => {
  // `celda()` tiene que extender el rango; si no, Excel abre el archivo
  // diciendo que esta dañado.
  const { libro } = libroDePrecios({ ags: { nombre: 'Ags', brecha: { filas: [fila('X')] } } })
  const ref = libro.Sheets.Ags['!ref']
  assert.ok(/^[A-Z]+\d+:[A-Z]+\d+$/.test(ref), `rango raro: ${ref}`)
  assert.ok(!/NaN|undefined/.test(ref))
})

test('el nombre del archivo lleva la fecha: esto se baja varias veces', () => {
  const { archivo } = libroDePrecios(
    { ags: { nombre: 'Ags', brecha: { filas: [fila('X')] } } },
    { hoy: new Date('2026-11-06T12:00:00Z') })
  assert.equal(archivo, 'precios-a-revisar-2026-11-06.xlsx')
})

test('cada caso tiene su texto, para que el reporte se entienda solo', () => {
  assert.ok(TEXTO_CASO[CASOS.COBRA_MENOS])
  assert.ok(TEXTO_CASO[CASOS.COBRA_MAS])
})
