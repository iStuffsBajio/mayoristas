import test from 'node:test'
import assert from 'node:assert/strict'
import { claveModelo, clavesDe, tipoDeFunda, agruparPorModelo, alternativasDe } from './variantes.js'

test('el tipo de funda se reconoce, y el orden importa', () => {
  assert.equal(tipoDeFunda('IPHONE 15 TPU CASE'), 'TPU')
  assert.equal(tipoDeFunda('IPHONE 12 6.1 HARD CASE'), 'HARD')
  assert.equal(tipoDeFunda('SAMSUNG A35 3 IN 1'), '3EN1')
  assert.equal(tipoDeFunda('IPHONE 7 PLUS DUO CASE'), 'DUO')
  // «CRISTAL TPU CASE» lleva la palabra TPU pero es cristal.
  assert.equal(tipoDeFunda('IPHONE 14 CRISTAL TPU CASE'), 'GLASS')
  // «MILITAR TPU» es uso rudo, no un TPU normal.
  assert.equal(tipoDeFunda('IPHONE 12 MILITAR TPU CASE'), 'RUDO')
  assert.equal(tipoDeFunda('MICA HD HEAVY DUTY'), 'RUDO')
  assert.equal(tipoDeFunda(''), 'OTRO')
})

test('el mismo teléfono con otro acabado da la misma clave', () => {
  const k = claveModelo('IPHONE 15 TPU CASE')
  assert.equal(claveModelo('IPHONE 15 HARD CASE'), k)
  assert.equal(claveModelo('IPHONE 15 MORADO TPU CASE'), k)
  // El tamaño de pantalla lo anota una plaza y otra no.
  assert.equal(claveModelo('IPHONE 12 6.1 TPU CASE'), claveModelo('IPHONE 12 TPU CASE'))
  // Samsung y Galaxy se escriben según quién capturó.
  assert.equal(claveModelo('GALAXY A35 TPU CASE'), claveModelo('SAMSUNG A35 3 IN 1'))
})

test('5G y 4G NO se borran: son teléfonos distintos', () => {
  // Borrarlos emparejaba el VIVO V30 LITE 5G con el 4G. Bodega tiene los dos
  // códigos por separado, precisamente porque llevan funda distinta.
  assert.notEqual(
    claveModelo('VIVO V30 LITE 5G TPU CASE'),
    claveModelo('VIVO V30 LITE 4G TPU CASE'))
})

test('un código que cubre dos teléfonos da dos claves', () => {
  const k = clavesDe('SAMSUNG A55/A35 3 IN 1')
  assert.deepEqual(k.sort(), ['SAMSUNG A35', 'SAMSUNG A55'])
  // Y cada uno lo encuentra como suyo.
  assert.ok(k.includes(claveModelo('GALAXY A35 TPU CASE')))
})

test('las micas no se agrupan con las fundas', () => {
  const mica = claveModelo('MICA HIDROGEL MATE')
  assert.notEqual(mica, claveModelo('IPHONE 15 TPU CASE'))
  // Ni dos micas de acabado distinto entre sí.
  assert.notEqual(mica, claveModelo('MICA HIDROGEL HD BASICA'))
})

test('las alternativas son otros códigos del mismo teléfono CON existencia', () => {
  const productos = [
    { Codigo: 'I15T',  Producto: 'IPHONE 15 TPU CASE' },
    { Codigo: 'I15H',  Producto: 'IPHONE 15 HARD CASE' },
    { Codigo: 'I15X',  Producto: 'IPHONE 15 MORADO TPU CASE' },
    { Codigo: 'I14T',  Producto: 'IPHONE 14 TPU CASE' },
  ]
  const grupos = agruparPorModelo(productos)
  const existencias = {
    I15H: { bodega: 6, leon: 0 },
    I15X: { leon: 0 },                 // sin piezas: no es alternativa
    I14T: { bodega: 50 },              // otro teléfono: no aplica
  }
  const alt = alternativasDe('I15T', 'IPHONE 15 TPU CASE', grupos, existencias)
  assert.equal(alt.length, 1)
  assert.equal(alt[0].codigo, 'I15H')
  assert.equal(alt[0].total, 6)
})

test('un producto no se propone como alternativa de sí mismo', () => {
  const grupos = agruparPorModelo([{ Codigo: 'I15T', Producto: 'IPHONE 15 TPU CASE' }])
  assert.equal(alternativasDe('I15T', 'IPHONE 15 TPU CASE', grupos, { I15T: { leon: 9 } }).length, 0)
})

test('nada revienta con datos vacíos', () => {
  assert.deepEqual(clavesDe(''), [])
  assert.deepEqual(clavesDe(null), [])
  assert.deepEqual(agruparPorModelo(null), {})
  assert.deepEqual(alternativasDe('X', 'Y', null, null), [])
})
