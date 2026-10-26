import test from 'node:test'
import assert from 'node:assert/strict'
import { patronesDeEscritura, cambioEntre, MINIMO_CODIGOS } from './patrones.js'

const inv = nombres => ({ productos: Object.entries(nombres).map(([Codigo, Producto]) => ({ Codigo, Producto })) })
const correr = plazas => patronesDeEscritura({
  inventarios: Object.fromEntries(Object.entries(plazas).map(([s, n]) => [s, inv(n)])),
})

test('el cambio de una palabra por otra se reconoce', () => {
  assert.deepEqual(cambioEntre('GALAXY A07 TPU CASE', 'SAMSUNG A07 TPU CASE'), ['GALAXY', 'SAMSUNG'])
  // El orden no depende de quien pregunte.
  assert.deepEqual(cambioEntre('SAMSUNG A07 TPU CASE', 'GALAXY A07 TPU CASE'), ['GALAXY', 'SAMSUNG'])
})

test('una palabra que falta tambien es un cambio', () => {
  assert.deepEqual(cambioEntre('GOOGLE PIXEL 10 PRO XL TPU', 'GOOGLE PIXEL 10 PRO XL TPU CASE'), [null, 'CASE'])
})

test('si cambia mas de una palabra no es un patron', () => {
  assert.equal(cambioEntre('HUAWEI NOVA 13 TPU CASE', 'SAMSUNG A55 HARD CASE'), null)
})

test('el caso real: bodega escribe GALAXY y las tiendas SAMSUNG', () => {
  const bodega = {}, tienda = {}
  for (let i = 0; i < 5; i++) {
    bodega[`S${i}`] = `GALAXY A0${i} TPU CASE`
    tienda[`S${i}`] = `SAMSUNG A0${i} TPU CASE`
  }
  const r = correr({ bodega, leon: tienda, 'san-luis': tienda })
  assert.equal(r.length, 1)
  assert.equal(r[0].gana, 'SAMSUNG')   // dos plazas contra una
  assert.equal(r[0].pierde, 'GALAXY')
  assert.deepEqual(r[0].corrigen, ['bodega'])
  assert.equal(r[0].renglones, 5)
  assert.equal(r[0].alcance, 'catalogo')
})

test('se cuenta el catalogo entero, no solo los codigos en choque', () => {
  // Bodega escribe GALAXY tambien donde nadie la contradice: eso es lo que
  // demuestra que es una costumbre suya y no un desliz.
  const r = correr({
    bodega: { A: 'GALAXY A01 TPU', B: 'GALAXY A02 TPU', C: 'GALAXY A03 TPU', D: 'GALAXY A09 TPU' },
    leon:   { A: 'SAMSUNG A01 TPU', B: 'SAMSUNG A02 TPU', C: 'SAMSUNG A03 TPU' },
  })
  const bod = r[0].filas.find(f => f.slug === 'bodega')
  assert.equal(bod.a, 4)   // los cuatro, incluido el que no choca
  assert.equal(bod.b, 0)
})

test('un cambio en pocos codigos no es costumbre', () => {
  const r = correr({
    bodega: { A: 'VIVO Y35 TPU CASE' },
    leon:   { A: 'VIVO Y53 TPU CASE' },
  })
  assert.equal(r.length, 0)
  assert.ok(MINIMO_CODIGOS >= 2)
})

test('la palabra que falta se cuenta solo donde hay choque', () => {
  const r = correr({
    bodega: { A: 'IPHONE 15 TPU', B: 'IPHONE 14 TPU', C: 'IPHONE 13 TPU' },
    leon:   { A: 'IPHONE 15 TPU CASE', B: 'IPHONE 14 TPU CASE', C: 'IPHONE 13 TPU CASE' },
  })
  assert.equal(r.length, 1)
  assert.equal(r[0].falta, true)
  assert.equal(r[0].gana, 'CASE')
  assert.equal(r[0].alcance, 'codigos')
  assert.deepEqual(r[0].corrigen, ['bodega'])
  assert.equal(r[0].renglones, 3)
})

test('lo que mas renglones limpia va primero', () => {
  const bodega = {}, leon = {}
  for (let i = 0; i < 8; i++) { bodega[`S${i}`] = `GALAXY A0${i} TPU CASE`; leon[`S${i}`] = `SAMSUNG A0${i} TPU CASE` }
  for (let i = 0; i < 3; i++) { bodega[`P${i}`] = `POCCO X${i} TPU CASE`;  leon[`P${i}`] = `POCO X${i} TPU CASE` }
  const r = correr({ bodega, leon })
  assert.ok(r[0].renglones > r[1].renglones)
})

test('nada revienta sin datos', () => {
  assert.deepEqual(patronesDeEscritura({}), [])
  assert.deepEqual(patronesDeEscritura({ inventarios: { a: null } }), [])
})
