// Pruebas de qué foto le toca a cada producto.
//
// Fijan el fallo que las trajo: buscar «S26» devolvía un solo modelo porque
// la lista salía de las fotos y no del inventario. Aquí se comprueba que un
// producto sin foto propia igual encuentra una de referencia, y que no se
// cuela la de otra marca.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveTelefono, familiaDe, indexarMockups, fotoPara } from './mockups.js'

const MOCKUPS = [
  { codigo: 'SGS26T',  nombre: 'GALAXY S26 TPU CASE',        archivo: 'galaxy-s26.webp' },
  { codigo: 'SGA16T',  nombre: 'GALAXY A16 TPU CASE',        archivo: 'galaxy-a16.webp' },
  { codigo: 'I17PMT',  nombre: 'IPHONE 17 PRO MAX TPU CASE', archivo: 'iphone-17-pro-max.webp' },
  { codigo: 'XR13T',   nombre: 'XIAOMI REDMI 13 TPU CASE',   archivo: 'redmi-13.webp' },
  { codigo: 'VACIO',   nombre: 'MOTO G24 TPU CASE',          archivo: 'moto-g24.webp', vacio: true },
]

const indice = indexarMockups(MOCKUPS)

test('la clave quita lo que describe la funda, no el teléfono', () => {
  assert.equal(claveTelefono('GALAXY S26 ULTRA TPU CASE'), 'SAMSUNGS26ULTRA')
  // Los dos acabados del mismo teléfono dan la misma clave: una foto sirve
  // para los dos códigos.
  assert.equal(claveTelefono('GALAXY S26 ULTRA 3 IN 1'), claveTelefono('GALAXY S26 ULTRA TPU CASE'))
  // SAMSUNG y GALAXY son lo mismo escrito de dos formas.
  assert.equal(claveTelefono('SAMSUNG S26 TPU'), claveTelefono('GALAXY S26 TPU CASE'))
})

test('la familia se lee del nombre', () => {
  assert.equal(familiaDe('GALAXY S26 ULTRA'), 'SAMSUNG')
  assert.equal(familiaDe('XIAOMI REDMI 13'), 'XIAOMI')
  assert.equal(familiaDe('IPHONE 17 PRO MAX'), 'APPLE')
  assert.equal(familiaDe('FUNDA GENERICA'), null)
})

test('el código propio gana siempre', () => {
  const f = fotoPara({ codigo: 'SGS26T', nombre: 'GALAXY S26 TPU CASE' }, indice)
  assert.equal(f.archivo, 'galaxy-s26.webp')
  assert.equal(f.exacta, true)
})

test('otro acabado del mismo teléfono sigue siendo foto exacta', () => {
  // Otro código, mismo aparato: la funda de la foto es la misma.
  const f = fotoPara({ codigo: 'SGS263', nombre: 'GALAXY S26 3 IN 1' }, indice)
  assert.equal(f.archivo, 'galaxy-s26.webp')
  assert.equal(f.exacta, true)
})

test('sin foto propia se usa la del pariente, y se marca como no exacta', () => {
  // El caso que destapó todo: el S26 Ultra no tiene foto y el S26 sí.
  const f = fotoPara({ codigo: 'SGS26UT', nombre: 'GALAXY S26 ULTRA TPU CASE' }, indice)
  assert.equal(f.archivo, 'galaxy-s26.webp')
  assert.equal(f.exacta, false, 'tiene que poder avisarse en pantalla')
  assert.equal(f.modelo, 'GALAXY S26 TPU CASE')
})

test('nunca se presta una foto de otra marca', () => {
  // «OPPO A16» no puede llevarse la del GALAXY A16 por parecerse el número.
  assert.equal(fotoPara({ codigo: 'OPA16T', nombre: 'OPPO A16 TPU CASE' }, indice), null)
})

test('un mockup marcado vacío no se usa para nada', () => {
  assert.equal(fotoPara({ codigo: 'VACIO', nombre: 'MOTO G24 TPU CASE' }, indice), null)
})

test('un nombre sin teléfono reconocible no arrastra una foto cualquiera', () => {
  assert.equal(fotoPara({ codigo: 'X', nombre: 'TPU CASE' }, indice), null)
  assert.equal(fotoPara(null, indice), null)
})
