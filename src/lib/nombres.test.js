import test from 'node:test'
import assert from 'node:assert/strict'
import { discrepanciasDeNombre, claseDeDiferencia, porPlaza, CLASE, REFERENCIAS } from './nombres.js'

const inv = nombres => ({ productos: Object.entries(nombres).map(([Codigo, Producto]) => ({ Codigo, Producto })) })
const correr = plazas => discrepanciasDeNombre({
  inventarios: Object.fromEntries(Object.entries(plazas).map(([s, n]) => [s, inv(n)])),
})

test('las referencias son bodega y León', () => {
  assert.deepEqual(REFERENCIAS, ['bodega', 'leon'])
})

test('clasifica la diferencia de menos a más seria', () => {
  // Sólo espacios alrededor de la barra.
  assert.equal(claseDeDiferencia('GALAXY A56/A36 3 IN 1', 'GALAXY A56 / A36 3 IN 1'), CLASE.FORMATO)
  // Las dos formas de nombrar Samsung.
  assert.equal(claseDeDiferencia('GALAXY A07 TPU CASE', 'SAMSUNG A07 TPU CASE'), CLASE.MARCA)
  // Uno sabe que cubre más teléfonos que el otro.
  assert.equal(claseDeDiferencia('HONOR X6/X6S TPU CASE', 'HONOR X6 TPU CASE'), CLASE.COMPATIBILIDAD)
  // Otro teléfono: «NOVA 13» no es «NOVA 13 PRO».
  assert.equal(claseDeDiferencia('HUAWEI NOVA 13 TPU CASE', 'HUAWEI NOVA 13 PRO TPU CASE'), CLASE.OTRO)
})

test('la errata con letra O en vez de cero sale como seria', () => {
  // Caso real de Ferias: «MATE 2O LITE» con la letra O.
  assert.equal(claseDeDiferencia('HUAWEI MATE 2O LITE HARD CASE', 'HUAWEI MATE 20 LITE HARD CASE'), CLASE.OTRO)
})

test('si bodega y León coinciden, el resto se corrige', () => {
  const r = correr({
    bodega: { SGA07T: 'GALAXY A07 TPU CASE' },
    leon:   { SGA07T: 'GALAXY A07 TPU CASE' },
    'san-luis': { SGA07T: 'SAMSUNG A07 TPU CASE' },
  })
  assert.equal(r.length, 1)
  assert.equal(r[0].fuente, 'bodega+leon')
  assert.equal(r[0].corregirEn, 'sucursal')
  assert.equal(r[0].fuera.length, 1)
  assert.equal(r[0].fuera[0].slug, 'san-luis')
  assert.equal(r[0].clase, CLASE.MARCA)
})

test('si bodega y León se contradicen, no se corrige a nadie', () => {
  // Caso real: a bodega le falta «CASE» y las plazas lo ponen. No se puede
  // decidir por la cuenta: hace falta que una persona elija.
  const r = correr({
    bodega: { GP10PXLT: 'GOOGLE PIXEL 10 PRO XL TPU' },
    leon:   { GP10PXLT: 'GOOGLE PIXEL 10 PRO XL TPU CASE' },
    ferias: { GP10PXLT: 'GOOGLE PIXEL 10 PRO XL TPU CASE' },
  })
  assert.equal(r.length, 1)
  assert.equal(r[0].fuente, 'conflicto')
  assert.equal(r[0].corregirEn, 'referencias')
  assert.equal(r[0].referencia, null)
  assert.deepEqual(r[0].fuera.map(f => f.slug).sort(), ['bodega', 'leon'])
})

test('una referencia sola basta si la otra no tiene el código', () => {
  const r = correr({
    leon:   { X1: 'IPHONE 15 TPU CASE' },
    ferias: { X1: 'IPHONE 15 TPU' },
  })
  assert.equal(r[0].fuente, 'leon')
  assert.equal(r[0].fuera[0].slug, 'ferias')
})

test('sin referencias, decide la mayoría', () => {
  const r = correr({
    'san-luis':       { Z: 'VIVO Y35 TPU CASE' },
    aguascalientes:   { Z: 'VIVO Y35 TPU CASE' },
    ferias:           { Z: 'VIVO Y53 TPU CASE' },
  })
  assert.equal(r[0].fuente, 'mayoria')
  assert.equal(r[0].fuera[0].slug, 'ferias')
})

test('con empate no se señala a nadie', () => {
  const r = correr({
    'san-luis': { Z: 'VIVO Y35 TPU CASE' },
    ferias:     { Z: 'VIVO Y53 TPU CASE' },
  })
  assert.equal(r.length, 0)
})

test('un código escrito igual en todas partes no aparece', () => {
  const r = correr({
    bodega: { A: 'IPHONE 15 TPU CASE' },
    leon:   { A: 'IPHONE 15 TPU CASE' },
    ferias: { A: 'iphone 15 tpu case' },   // sólo mayúsculas: es el mismo
  })
  assert.equal(r.length, 0)
})

test('los conflictos de referencia van primero', () => {
  const r = correr({
    bodega: { CONF: 'HONOR X6/X6S TPU CASE', OK: 'IPHONE 15 TPU CASE' },
    leon:   { CONF: 'HONOR X6 TPU CASE',     OK: 'IPHONE 15 TPU CASE' },
    ferias: { CONF: 'HONOR X6 TPU CASE',     OK: 'IPHONE 15 TPU' },
  })
  assert.equal(r[0].codigo, 'CONF')
  assert.equal(r[0].fuente, 'conflicto')
})

test('el resumen por plaza agrupa lo que un listado largo esconde', () => {
  const r = correr({
    bodega: { A: 'GALAXY A07 TPU CASE', B: 'GALAXY A17 TPU CASE' },
    leon:   { A: 'GALAXY A07 TPU CASE', B: 'GALAXY A17 TPU CASE' },
    'san-luis': { A: 'SAMSUNG A07 TPU CASE', B: 'SAMSUNG A17 TPU CASE' },
  })
  const p = porPlaza(r)
  assert.equal(p.length, 1)
  assert.equal(p[0].slug, 'san-luis')
  assert.equal(p[0].total, 2)
  assert.equal(p[0][CLASE.MARCA], 2)
})

test('nada revienta sin datos', () => {
  assert.deepEqual(discrepanciasDeNombre({}), [])
  assert.deepEqual(porPlaza(null), [])
})
