// Pruebas de las reservas: qué reponer antes de que se agote y de dónde.
//
// Lo que fijan es la regla de los dos relojes. Pedir al proveedor tarda 40
// días y al nacional 4: si a la red le quedan menos de 40 días de venta y la
// bodega no tiene, el pedido normal NO LLEGA, y decirlo a tiempo es la
// diferencia entre ganar menos y no vender.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  reservas, ENTREGA, COBERTURA_TIENDA, COBERTURA_BODEGA, ESTADOS, ORIGENES,
} from './reservas.js'

const inv = (...prods) => ({ productos: prods })
const prod = (Codigo, Existencia, Producto = Codigo, Mayoreo = 100) =>
  ({ Codigo, Existencia, Producto, Mayoreo })

test('los dos relojes son los que dio el dueño', () => {
  assert.equal(ENTREGA.proveedor, 40)
  assert.equal(ENTREGA.nacional, 4)
  // Y bodega guarda el doble de lo que tarda el pedido para la clase A.
  assert.equal(COBERTURA_BODEGA.A, 80)
})

test('la cobertura pondera por clase: A aguanta más que C', () => {
  assert.ok(COBERTURA_TIENDA.baja.A > COBERTURA_TIENDA.baja.C)
  assert.ok(COBERTURA_TIENDA.alta.A > COBERTURA_TIENDA.baja.A)
})

test('lo que no se vende no se repone', () => {
  const { filas } = reservas({
    inventarios: { leon: inv(prod('X', 0)) },
    bodega: inv(),
    ritmoPorPlaza: { leon: {} },     // sin ritmo: no se mueve
    clase: { X: 'A' },
  })
  assert.equal(filas.length, 0, 'un cero sin venta no es un faltante')
})

test('en cero y vendiéndose es lo primero de la lista', () => {
  const { filas, resumen } = reservas({
    inventarios: { leon: inv(prod('X', 0, 'IPHONE 17', 150), prod('Y', 3, 'MOTO G06', 100)) },
    bodega: inv(prod('X', 20), prod('Y', 20)),
    ritmoPorPlaza: { leon: { X: 0.4, Y: 0.17 } },
    clase: { X: 'A', Y: 'A' },
  })
  assert.equal(filas[0].codigo, 'X')
  assert.equal(filas[0].estado, ESTADOS.CERO)
  assert.equal(resumen.cero, 1)
  // Lo que se pierde al día: 0.4 piezas × 150 de mayoreo.
  assert.equal(Math.round(resumen.pesosAlDia), 60)
})

test('si bodega tiene, la reposición es un traslado', () => {
  const { filas } = reservas({
    inventarios: { leon: inv(prod('X', 1)) },
    bodega: inv(prod('X', 50)),
    ritmoPorPlaza: { leon: { X: 0.5 } },
    clase: { X: 'A' },
  })
  assert.equal(filas[0].origen, ORIGENES.BODEGA)
  // 0.5/día × 30 días de objetivo = 15, menos la que hay.
  assert.equal(filas[0].falta, 14)
  assert.equal(filas[0].desdeBodega, 14)
})

test('nunca se promete más de lo que hay en bodega', () => {
  const { filas } = reservas({
    inventarios: { leon: inv(prod('X', 0)) },
    bodega: inv(prod('X', 3)),
    ritmoPorPlaza: { leon: { X: 1 } },
    clase: { X: 'A' },
  })
  assert.equal(filas[0].falta, 30)
  assert.equal(filas[0].desdeBodega, 3, 'lo demás es compra, no traslado')
})

test('sin bodega y sin días para esperar al proveedor, toca el nacional', () => {
  // A la red le quedan 10 piezas a 1 por día: 10 días. El pedido tarda 40.
  const { filas, resumen } = reservas({
    inventarios: { leon: inv(prod('X', 10)) },
    bodega: inv(),                       // bodega no tiene
    ritmoPorPlaza: { leon: { X: 1 } },
    clase: { X: 'A' },
  })
  assert.equal(filas[0].origen, ORIGENES.NACIONAL)
  assert.ok(filas[0].diasRed < ENTREGA.proveedor)
  assert.equal(resumen.nacional, 1)
})

test('con holgura en la red sí da tiempo a pedirle al proveedor', () => {
  // La tienda anda corta, pero entre todas quedan 200 días de venta.
  const { filas } = reservas({
    inventarios: { leon: inv(prod('X', 5)), 'san-luis': inv(prod('X', 195)) },
    bodega: inv(),
    ritmoPorPlaza: { leon: { X: 1 }, 'san-luis': { X: 0 } },
    clase: { X: 'A' },
  })
  const fila = filas.find(f => f.plaza === 'leon')
  assert.equal(fila.origen, ORIGENES.PROVEEDOR)
})

test('lo que no aguanta ni el traslado se marca aparte', () => {
  const { filas } = reservas({
    inventarios: { leon: inv(prod('X', 1)) },
    bodega: inv(prod('X', 9)),
    ritmoPorPlaza: { leon: { X: 1 } },   // una pieza, un día: ni llega el camión
    clase: { X: 'A' },
  })
  assert.equal(filas[0].estado, ESTADOS.URGE)
  assert.ok(filas[0].dias < ENTREGA.traslado)
})

test('en temporada alta se pide para más días', () => {
  const comun = {
    inventarios: { leon: inv(prod('X', 10)) },
    bodega: inv(prod('X', 99)),
    ritmoPorPlaza: { leon: { X: 1 } },
    clase: { X: 'A' },
  }
  const baja = reservas({ ...comun, alta: false }).filas[0]
  const alta = reservas({ ...comun, alta: true }).filas[0]
  assert.equal(baja.falta, 20)   // 30 de objetivo menos 10 que hay
  assert.equal(alta.falta, 50)   // 60 de objetivo menos 10
})

test('un clase C no se repone como si fuera clase A', () => {
  const comun = {
    inventarios: { leon: inv(prod('X', 5)) },
    bodega: inv(prod('X', 99)),
    ritmoPorPlaza: { leon: { X: 1 } },
  }
  const a = reservas({ ...comun, clase: { X: 'A' } }).filas[0]
  const c = reservas({ ...comun, clase: { X: 'C' } }).filas[0]
  assert.ok(a.falta > c.falta, 'la clase pondera el surtido')
})
