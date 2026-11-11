import { test } from 'node:test'
import assert from 'node:assert/strict'
import { libroDeCostos, CASOS } from './exportarCostos.js'

const FILAS = [
  { codigo: 'I17PMT', producto: 'IPHONE 17 PRO MAX', piezas: 26, caso: 'costo-en-cero' },
  { codigo: 'MTE70FT', producto: 'MOTO E70', piezas: 10, caso: 'no-esta-en-bodega' },
]

test('el libro separa los dos trabajos en hojas distintas', () => {
  const { libro, archivo } = libroDeCostos(FILAS, { hoy: new Date('2026-11-05T12:00:00Z') })
  assert.deepEqual(libro.SheetNames, ['Todos', 'Capturar costo', 'Dar de alta'])
  assert.equal(archivo, 'costos-que-faltan-2026-11-05.xlsx')
})

test('una hoja sin renglones no se crea vacía', () => {
  // Cuando ya no falte nada de un caso, su hoja no existe: una hoja vacía se
  // lee como «no se pudo» y no como «ya está».
  const { libro } = libroDeCostos([FILAS[0]])
  assert.deepEqual(libro.SheetNames, ['Todos', 'Capturar costo'])
})

test('el libro se escribe sin NaN ni undefined en el rango', () => {
  const { libro } = libroDeCostos(FILAS)
  for (const nombre of libro.SheetNames) {
    const ref = libro.Sheets[nombre]['!ref']
    assert.ok(/^[A-Z]+\d+:[A-Z]+\d+$/.test(ref), `${nombre}: rango raro «${ref}»`)
  }
})

test('cada caso tiene su texto, para que el reporte se entienda solo', () => {
  for (const f of FILAS) assert.ok(CASOS[f.caso], `sin texto: ${f.caso}`)
})
