// Pruebas de la brecha entre la lista de precios y lo que cobro la caja.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  brechaDeLista, costosInvertidos, listaDe, CASOS, BRECHA, PIEZAS_MINIMAS,
} from './precioCobrado.js'

const inv = productos => ({ productos })
const vendido = (pz, dinero, extra = {}) =>
  ({ pz, dinero, pzMayoreo: 0, dineroMayoreo: 0, ...extra })

test('un codigo que se cobra muy por debajo de su lista sale, con lo que falta', () => {
  // El caso real: el iPhone 11 en Aguascalientes, $250 de lista y $128 cobrado.
  const r = brechaDeLista({
    porCodigo: { I11T: vendido(100, 12800) },
    inventario: inv([{ Codigo: 'I11T', Producto: 'IPHONE 11 TPU CASE', Precio: 250 }]),
  })
  assert.equal(r.filas.length, 1)
  const f = r.filas[0]
  assert.equal(f.cobrado, 128)
  assert.equal(f.lista, 250)
  assert.equal(f.caso, CASOS.COBRA_MENOS)
  assert.equal(f.pesos, (128 - 250) * 100, 'lo que se deja de cobrar en las piezas medidas')
  assert.equal(f.familia, 'funda')
})

test('cobrar MAS que la lista es el otro caso, no el mismo con signo', () => {
  const r = brechaDeLista({
    porCodigo: { X: vendido(10, 3000) },
    inventario: inv([{ Codigo: 'X', Producto: 'FUNDA', Precio: 200 }]),
  })
  assert.equal(r.filas[0].caso, CASOS.COBRA_MAS, 'la lista esta baja: el precio real es otro')
  assert.ok(r.filas[0].pesos > 0)
})

test('dentro del umbral no se molesta a nadie', () => {
  // Leon cobra el 101% de su lista: eso no es una brecha, es el mostrador.
  const r = brechaDeLista({
    porCodigo: { X: vendido(10, 2180) },
    inventario: inv([{ Codigo: 'X', Producto: 'FUNDA', Precio: 216 }]),
  })
  assert.equal(r.filas.length, 0)
  assert.ok(Math.abs(r.razonTipica - 218 / 216) < 1e-9, 'pero si cuenta para la mediana')
  assert.equal(r.comparados, 1)
})

test('con una o dos piezas no se concluye nada', () => {
  // Una rebaja a un conocido no es la politica de precios de la plaza.
  const r = brechaDeLista({
    porCodigo: { X: vendido(PIEZAS_MINIMAS - 1, 100) },
    inventario: inv([{ Codigo: 'X', Producto: 'FUNDA', Precio: 250 }]),
  })
  assert.equal(r.filas.length, 0)
  assert.equal(r.comparados, 0)
})

test('las piezas de MAYOREO no entran en la comparacion', () => {
  // El mayoreo depende de con quien se negocio y no se compara contra la
  // lista al publico. Aqui todo se fue a mayoreo: no hay nada que comparar.
  const r = brechaDeLista({
    porCodigo: { X: { pz: 50, dinero: 5000, pzMayoreo: 50, dineroMayoreo: 5000 } },
    inventario: inv([{ Codigo: 'X', Producto: 'FUNDA', Precio: 250 }]),
  })
  assert.equal(r.filas.length, 0)
  assert.equal(r.comparados, 0)
})

test('el mayoreo se descuenta del publico antes de sacar el precio', () => {
  // 10 piezas, 6 a mayoreo. Al publico quedan 4 por $800 = $200, no $140.
  const r = brechaDeLista({
    porCodigo: { X: { pz: 10, dinero: 1400, pzMayoreo: 6, dineroMayoreo: 600 } },
    inventario: inv([{ Codigo: 'X', Producto: 'FUNDA', Precio: 250 }]),
    umbral: 0.1,
  })
  assert.equal(r.filas[0].cobrado, 200)
  assert.equal(r.filas[0].piezasPublico, 4)
})

test('la familia se dice: una mica fuera de precio no es una funda fuera de precio', () => {
  const r = brechaDeLista({
    porCodigo: {
      HDB: vendido(10, 580),
      SP:  vendido(100, 1000),
      I13T: vendido(10, 1000),
    },
    inventario: inv([
      { Codigo: 'HDB', Producto: 'MICA HIDROGEL HD BASICA', Precio: 150 },
      { Codigo: 'SP',  Producto: 'STIKER PEQUEÑO',          Precio: 30 },
      { Codigo: 'I13T', Producto: 'IPHONE 13 TPU CASE',     Precio: 250 },
    ]),
  })
  const por = Object.fromEntries(r.filas.map(f => [f.codigo, f.familia]))
  assert.equal(por.HDB, 'hidrogel')
  assert.equal(por.SP, 'produccion')
  assert.equal(por.I13T, 'funda')
})

test('se ordena por DINERO, no por lo mas desviado', () => {
  // Un 60% de brecha en tres piezas importa menos que un 25% en cuatrocientas.
  const r = brechaDeLista({
    porCodigo: {
      POCO:  vendido(3, 120),      // $40 de $100: -60%, pero son $180
      MUCHO: vendido(400, 30000),  // $75 de $100: -25%, y son $10,000
    },
    inventario: inv([
      { Codigo: 'POCO',  Producto: 'A', Precio: 100 },
      { Codigo: 'MUCHO', Producto: 'B', Precio: 100 },
    ]),
  })
  assert.deepEqual(r.filas.map(f => f.codigo), ['MUCHO', 'POCO'])
  assert.equal(r.pesosQueFaltan, 10000 + 180)
})

test('un codigo sin precio de lista no se puede comparar', () => {
  const r = brechaDeLista({
    porCodigo: { X: vendido(10, 1000) },
    inventario: inv([{ Codigo: 'X', Producto: 'FUNDA', Precio: 0 }]),
  })
  assert.equal(r.comparados, 0, 'un cero no es un precio contra el que medir')
})

test('un costo por encima del precio esta mal capturado, y eso no es opinable', () => {
  // Medido: bodega tiene 552 de 556 asi, el 99%. Las tiendas, casi ninguno.
  const filas = costosInvertidos(inv([
    { Codigo: 'I15', Producto: 'IPHONE 15', Costo: 36, Precio: 31 },
    { Codigo: 'OK',  Producto: 'FUNDA',     Costo: 55, Precio: 216 },
    { Codigo: 'PEOR', Producto: 'OTRA',     Costo: 90, Precio: 31 },
  ]))
  assert.deepEqual(filas.map(f => f.codigo), ['PEOR', 'I15'], 'lo que mas se pierde primero')
  assert.equal(filas[0].perdida, 59)
})

test('sin costo o sin precio capturado no se acusa de nada', () => {
  assert.deepEqual(costosInvertidos(inv([
    { Codigo: 'A', Costo: 0, Precio: 100 },
    { Codigo: 'B', Costo: 100, Precio: 0 },
  ])), [])
  assert.deepEqual(costosInvertidos(null), [])
})

test('listaDe normaliza el codigo como lo escriba la caja', () => {
  assert.deepEqual(listaDe(inv([{ Codigo: ' i13t ', Producto: 'X', Precio: '216', Mayoreo: '129' }])),
    { I13T: { producto: 'X', publico: 216, mayoreo: 129 } })
})

test('el umbral es del 20% y conviene saberlo', () => {
  assert.equal(BRECHA, 0.20)
})
