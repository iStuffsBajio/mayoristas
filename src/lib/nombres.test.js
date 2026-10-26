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

test('la compatibilidad no se discute: gana quien liste más', () => {
  // Si bodega sabe que el X6 sirve también para el X6S, bodega tiene razón y
  // a las demás les falta la actualización. No es que una se equivoque.
  const r = correr({
    bodega: { HX6T: 'HONOR X6/X6S TPU CASE' },
    leon:   { HX6T: 'HONOR X6 TPU CASE' },
    ferias: { HX6T: 'HONOR X6 TPU CASE' },
  })
  assert.equal(r.length, 1)
  assert.equal(r[0].fuente, 'compatibilidad:bodega')
  assert.equal(r[0].referencia, 'HONOR X6/X6S TPU CASE')
  assert.deepEqual(r[0].fuera.map(f => f.slug).sort(), ['ferias', 'leon'])
})

test('y gana León cuando es León quien lista más', () => {
  const r = correr({
    bodega: { I16E3: 'IPHONE 16E 3 IN 1' },
    leon:   { I16E3: 'IPHONE 16E/17E 3 IN 1' },
  })
  assert.equal(r[0].fuente, 'compatibilidad:leon')
  assert.equal(r[0].referencia, 'IPHONE 16E/17E 3 IN 1')
})

test('«3 IN 1» no cuenta como dos teléfonos', () => {
  // Sus números falseaban la cuenta de modelos y daban ganadores falsos.
  const r = correr({
    bodega: { X: 'IPHONE 16E 3 IN 1' },
    leon:   { X: 'IPHONE 16E TPU CASE' },
  })
  // La diferencia es el tipo de funda, no la compatibilidad.
  assert.notEqual(r[0].fuente, 'compatibilidad:bodega')
})

test('GALAXY y SAMSUNG no enfrentan a las referencias', () => {
  // Bodega escribe GALAXY en sus 192 productos Samsung; las cuatro tiendas
  // escriben SAMSUNG. Es una convención, no un choque que alguien resuelva.
  const r = correr({
    bodega: { SGA07T: 'GALAXY A07 TPU CASE' },
    leon:   { SGA07T: 'SAMSUNG A07 TPU CASE' },
    ferias: { SGA07T: 'SAMSUNG A07 TPU CASE' },
  })
  for (const x of r) assert.notEqual(x.fuente, 'conflicto')
})

test('un nombre nunca es alerta grave: eso son los códigos', () => {
  const r = correr({
    bodega: { A: 'HUAWEI NOVA 13 PRO TPU CASE', B: 'GALAXY A07 TPU CASE' },
    leon:   { A: 'HUAWEI NOVA 13 PRO TPU CASE', B: 'GALAXY A07 TPU CASE' },
    ferias: { A: 'HUAWEI NOVA 13 TPU CASE',     B: 'SAMSUNG A07 TPU CASE' },
  })
  const sev = Object.fromEntries(r.map(x => [x.codigo, x.severidad]))
  assert.equal(sev.A, 'media')   // apunta a otro teléfono
  assert.equal(sev.B, 'baja')    // sólo forma de escribir
  for (const x of r) assert.notEqual(x.severidad, 'alta')
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
