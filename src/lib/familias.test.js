import test from 'node:test'
import assert from 'node:assert/strict'
import { esProtector, separarProtectores, soloFundas, CODIGOS_PROTECTOR } from './familias.js'

test('reconoce los ocho códigos de protector del catálogo', () => {
  for (const c of ['HDA', 'PV', 'MT', 'HDB', 'HDT', 'MTT', 'MU', 'HDR']) {
    assert.equal(esProtector(c), true, `${c} debería ser protector`)
  }
  assert.equal(CODIGOS_PROTECTOR.size, 8)
})

test('tolera las erratas reales del catálogo', () => {
  // Los tres existen de verdad en el inventario, tecleados a mano.
  assert.equal(esProtector('XX', 'MICA HIDROGEL HD BASICA'), true)
  assert.equal(esProtector('XX', 'MICA HIDRIOGEL HD ALTA'), true)   // HIDRIOGEL
  assert.equal(esProtector('XX', 'MICA HODROGEL TABLET HD'), true)  // HODROGEL
  assert.equal(esProtector('XX', 'HIDROGEL PRIVACIDAD'), true)
})

test('una funda no se confunde con un protector', () => {
  assert.equal(esProtector('I13T', 'IPHONE 13 TPU CASE'), false)
  assert.equal(esProtector('SGA16T', 'SAMSUNG A16 TPU CASE'), false)
  assert.equal(esProtector('MTG24T', 'MOTO G24 TPU CASE'), false)
  // «MICA» como palabra suelta, no dentro de otra.
  assert.equal(esProtector('XX', 'FUNDA AMICAL'), false)
})

test('separa una lista en las dos familias', () => {
  const filas = [
    { codigo: 'HDA',  producto: 'MICA HIDRIOGEL HD ALTA' },
    { codigo: 'I13T', producto: 'IPHONE 13 TPU CASE' },
    { codigo: 'PV',   producto: 'HIDROGEL PRIVACIDAD' },
  ]
  const { fundas, protectores } = separarProtectores(filas)
  assert.equal(fundas.length, 1)
  assert.equal(protectores.length, 2)
  assert.equal(fundas[0].codigo, 'I13T')
})

test('separarProtectores acepta `nombre` además de `producto`', () => {
  // Los rankings de venta traen `nombre`; los agotados traen `producto`.
  const { protectores } = separarProtectores([{ codigo: 'ZZ', nombre: 'MICA HIDROGEL MATE' }])
  assert.equal(protectores.length, 1)
})

test('soloFundas limpia un mapa de ritmos por código', () => {
  const ritmo = { HDA: 36.7, I13T: 12, PV: 32.4, SGA16T: 8 }
  const r = soloFundas(ritmo, { HDA: 'MICA HIDRIOGEL HD ALTA', PV: 'HIDROGEL PRIVACIDAD' })
  assert.deepEqual(Object.keys(r).sort(), ['I13T', 'SGA16T'])
})

test('listas vacías o nulas no rompen', () => {
  assert.deepEqual(separarProtectores(null), { fundas: [], protectores: [] })
  assert.deepEqual(soloFundas(null), {})
  assert.equal(esProtector(null, null), false)
})
