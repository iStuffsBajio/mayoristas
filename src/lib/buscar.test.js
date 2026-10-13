// Pruebas de la búsqueda de modelos.
//
// Estas fijan un comportamiento que se rompió tres veces seguidas. Si alguien
// vuelve a acotar la búsqueda al filtro de existencia, o la ata a la marca,
// estas pruebas fallan antes de que llegue a la pantalla.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizar, coincideCon, filtrarYBuscar, hayBusqueda } from './buscar.js'

const CATALOGO = [
  { codigo: 'SGA16T',   producto: 'SAMSUNG A16 TPU CASE',      existencia: 5 },
  { codigo: 'OPA16T',   producto: 'OPPO A16 TPU CASE',         existencia: 2 },
  { codigo: 'SGS23FET', producto: 'GALAXY S23 FE TPU CASE',    existencia: 0 },
  { codigo: 'SGS23PT',  producto: 'GALAXY S23 PLUS TPU CASE',  existencia: 10 },
  { codigo: 'SGS23T',   producto: 'GALAXY S23 TPU CASE',       existencia: 1 },
  { codigo: 'SGS23U3',  producto: 'GALAXY S23 ULTRA 3 IN 1',   existencia: 34 },
  { codigo: 'SGS23UT',  producto: 'GALAXY S23 ULTRA TPU CASE', existencia: 4 },
  { codigo: 'I11T',     producto: 'IPHONE 11 TPU CASE',        existencia: 21 },
]

const codigos = filas => filas.map(f => f.codigo).sort()

test('normalizar quita acentos, signos y espacios', () => {
  assert.equal(normalizar('Galaxy A 16  5G'), 'GALAXYA165G')
  assert.equal(normalizar('Niño/Señal'), 'NINOSENAL')
  assert.equal(normalizar(null), '')
})

test('encuentra el modelo sin importar la marca', () => {
  // El caso que fallaba: «a16» tiene que traer el Samsung Y el Oppo.
  assert.deepEqual(codigos(CATALOGO.filter(coincideCon('a16'))), ['OPA16T', 'SGA16T'])
})

test('encuentra aunque el catálogo lo escriba con espacios', () => {
  const filas = [{ codigo: 'X', producto: 'GALAXY A 16 5G HARD CASE' }]
  assert.equal(filas.filter(coincideCon('a16')).length, 1)
})

test('el orden de las palabras no importa', () => {
  const a = codigos(CATALOGO.filter(coincideCon('s23 ultra')))
  const b = codigos(CATALOGO.filter(coincideCon('ultra s23')))
  assert.deepEqual(a, b)
  assert.deepEqual(a, ['SGS23U3', 'SGS23UT'])
})

test('busca también por código', () => {
  assert.deepEqual(codigos(CATALOGO.filter(coincideCon('sgs23u3'))), ['SGS23U3'])
})

test('sin búsqueda no descarta nada', () => {
  assert.equal(CATALOGO.filter(coincideCon('')).length, CATALOGO.length)
  assert.equal(CATALOGO.filter(coincideCon('   ')).length, CATALOGO.length)
})

test('buscar IGNORA el filtro de existencia', () => {
  // Esto es lo que fallaba en pantalla: con «Urgente (1-3)» puesto, buscar
  // «s23 ultra» daba cero, porque los dos Ultra tienen 34 y 4 piezas.
  const urgente = f => f.existencia >= 1 && f.existencia <= 3

  const conFiltro = filtrarYBuscar({ filas: CATALOGO, busqueda: '', pasaFiltro: urgente })
  assert.deepEqual(codigos(conFiltro), ['OPA16T', 'SGS23T'])

  const buscando = filtrarYBuscar({ filas: CATALOGO, busqueda: 's23 ultra', pasaFiltro: urgente })
  assert.deepEqual(codigos(buscando), ['SGS23U3', 'SGS23UT'])
})

test('buscar encuentra incluso lo que el filtro dejaría en cero', () => {
  const nada = () => false
  const r = filtrarYBuscar({ filas: CATALOGO, busqueda: 's23', pasaFiltro: nada })
  assert.equal(r.length, 5)
})

test('se puede decir en qué campos buscar', () => {
  const soloNombre = filtrarYBuscar({
    filas: CATALOGO, busqueda: 'sgs23u3', campos: f => [f.producto],
  })
  assert.equal(soloNombre.length, 0)
})

test('hayBusqueda distingue vacío de espacios', () => {
  assert.equal(hayBusqueda(''), false)
  assert.equal(hayBusqueda('  '), false)
  assert.equal(hayBusqueda('a'), true)
})
