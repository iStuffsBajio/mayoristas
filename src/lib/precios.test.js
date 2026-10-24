import test from 'node:test'
import assert from 'node:assert/strict'
import { precioDe, promedioEntrePlazas, desviaciones, valorDe, MAYOREO_MINIMO, DESVIACION } from './precios.js'

const inv = (slug, productos) => ({ [slug]: { sucursal: slug, productos } })

test('el umbral va sobre el mayoreo, no sobre el costo', () => {
  // Todo el catálogo cuesta entre $55 y $60: un umbral de $100 por COSTO
  // dejaba fuera absolutamente todo y la vigilancia no vigilaba nada.
  assert.equal(MAYOREO_MINIMO, 100)
  assert.equal(DESVIACION, 0.15)
})

test('el precio es la media de público y mayoreo', () => {
  assert.equal(precioDe({ Precio: 250, Mayoreo: 150 }), 200)
  // Con uno solo, ese vale; cero significa «sin capturar», no «gratis».
  assert.equal(precioDe({ Precio: 250 }), 250)
  assert.equal(precioDe({ Mayoreo: 150 }), 150)
  assert.equal(precioDe({}), 0)
  assert.equal(precioDe(null), 0)
})

test('bodega no entra en el promedio', () => {
  // Sus precios no se mantienen porque no vende: ahí el iPhone figura con
  // precio igual al costo. Promediarlo arruinaría la referencia.
  const inventarios = {
    ...inv('leon', [{ Codigo: 'I13T', Producto: 'IPHONE 13 TPU CASE', Precio: 250, Mayoreo: 150 }]),
    ...inv('bodega', [{ Codigo: 'I13T', Producto: 'IPHONE 13 TPU CASE', Precio: 36, Mayoreo: 214 }]),
  }
  const pr = promedioEntrePlazas(inventarios)
  assert.equal(pr.I13T.promedio, 200)      // solo León
  assert.equal(pr.I13T.n, 1)
  assert.equal(pr.I13T.porPlaza.bodega, undefined)
})

test('promedia el mismo código entre plazas', () => {
  const inventarios = {
    ...inv('leon',           [{ Codigo: 'I13T', Producto: 'IPHONE 13', Precio: 250, Mayoreo: 150 }]),
    ...inv('aguascalientes', [{ Codigo: 'I13T', Producto: 'IPHONE 13', Precio: 230, Mayoreo: 130 }]),
  }
  const pr = promedioEntrePlazas(inventarios)
  assert.equal(pr.I13T.promedio, 190)      // (200 + 180) / 2
  assert.equal(pr.I13T.n, 2)
})

test('un producto sin precio capturado no entra ni como cero', () => {
  const pr = promedioEntrePlazas(inv('leon', [{ Codigo: 'X', Producto: 'SIN PRECIO' }]))
  assert.equal(pr.X, undefined)
})

test('señala la plaza que se sale de la raya', () => {
  const inventarios = {
    ...inv('leon',           [{ Codigo: 'I13T', Producto: 'IPHONE 13 TPU CASE', Precio: 250, Mayoreo: 150 }]),
    ...inv('san-luis',       [{ Codigo: 'I13T', Producto: 'IPHONE 13 TPU CASE', Precio: 250, Mayoreo: 150 }]),
    ...inv('aguascalientes', [{ Codigo: 'I13T', Producto: 'IPHONE 13 TPU CASE', Precio: 120, Mayoreo: 80 }]),
  }
  const d = desviaciones(promedioEntrePlazas(inventarios), { nombres: { aguascalientes: 'Aguascalientes' } })
  assert.equal(d.length, 1)
  assert.equal(d[0].slug, 'aguascalientes')
  assert.equal(d[0].plaza, 'Aguascalientes')
  assert.ok(d[0].dif < -0.15, 'debería salir muy por debajo')
  assert.equal(d[0].familia, 'funda')
})

test('el que se sale no arrastra a los que están bien', () => {
  // Con el promedio como referencia, estas tres plazas salían las tres
  // desviadas: Aguascalientes tiraba la media hacia abajo y ensuciaba a León
  // y San Luis, que tienen el mismo precio. Con la mediana sólo salta la rara.
  const inventarios = {
    ...inv('leon',           [{ Codigo: 'K', Producto: 'FUNDA X', Precio: 200, Mayoreo: 200 }]),
    ...inv('san-luis',       [{ Codigo: 'K', Producto: 'FUNDA X', Precio: 200, Mayoreo: 200 }]),
    ...inv('aguascalientes', [{ Codigo: 'K', Producto: 'FUNDA X', Precio: 100, Mayoreo: 100 }]),
  }
  const d = desviaciones(promedioEntrePlazas(inventarios))
  assert.equal(d.length, 1)
  assert.equal(d[0].slug, 'aguascalientes')
  assert.equal(Math.round(d[0].dif * 100), -50)
})

test('con sólo dos plazas salen las dos, porque no hay mayoría', () => {
  const inventarios = {
    ...inv('a', [{ Codigo: 'K', Producto: 'FUNDA X', Precio: 200, Mayoreo: 200 }]),
    ...inv('b', [{ Codigo: 'K', Producto: 'FUNDA X', Precio: 100, Mayoreo: 100 }]),
  }
  const d = desviaciones(promedioEntrePlazas(inventarios))
  assert.equal(d.length, 2)
  // Contra la mediana (150) la diferencia es simétrica: +33% y -33%.
  assert.equal(Math.round(d.find(x => x.slug === 'a').dif * 100), 33)
  assert.equal(Math.round(d.find(x => x.slug === 'b').dif * 100), -33)
})

test('los consumibles baratos no entran en la vigilancia', () => {
  // Stiker a $60 de mayoreo: por debajo del umbral, aunque se desvíe mucho.
  const inventarios = {
    ...inv('a', [{ Codigo: 'SP', Producto: 'STIKER PEQUENO', Precio: 60, Mayoreo: 40 }]),
    ...inv('b', [{ Codigo: 'SP', Producto: 'STIKER PEQUENO', Precio: 20, Mayoreo: 10 }]),
  }
  assert.equal(desviaciones(promedioEntrePlazas(inventarios)).length, 0)
})

test('una mica se marca como hidrogel, no como funda', () => {
  const inventarios = {
    ...inv('a', [{ Codigo: 'PV', Producto: 'HIDROGEL PRIVACIDAD', Precio: 200, Mayoreo: 100 }]),
    ...inv('b', [{ Codigo: 'PV', Producto: 'HIDROGEL PRIVACIDAD', Precio: 400, Mayoreo: 300 }]),
  }
  const d = desviaciones(promedioEntrePlazas(inventarios))
  assert.ok(d.length > 0)
  for (const x of d) assert.equal(x.familia, 'hidrogel')
})

test('un producto en una sola plaza no se compara con nada', () => {
  const d = desviaciones(promedioEntrePlazas(inv('a', [{ Codigo: 'Z', Producto: 'FUNDA', Precio: 500, Mayoreo: 400 }])))
  assert.equal(d.length, 0)
})

test('valorDe convierte piezas en pesos', () => {
  const pr = promedioEntrePlazas(inv('leon', [{ Codigo: 'I13T', Producto: 'IPHONE 13', Precio: 250, Mayoreo: 150 }]))
  assert.equal(valorDe('I13T', 10, pr), 2000)
  assert.equal(valorDe('NOEXISTE', 10, pr), 0)
  assert.equal(valorDe('I13T', 0, pr), 0)
})

test('nada de esto revienta con datos vacíos', () => {
  assert.deepEqual(promedioEntrePlazas(null), {})
  assert.deepEqual(desviaciones(null), [])
  assert.equal(valorDe('X', 5, null), 0)
})
