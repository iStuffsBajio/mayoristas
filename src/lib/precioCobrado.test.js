// Pruebas de la brecha entre la lista de precios y lo que cobro la caja.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  brechaDeLista, costosInvertidos, listaDe, CASOS, BRECHA, PIEZAS_MINIMAS,
  porDebajoDelMayoreo, mayoreoSinMarcar, MARGEN_MAYOREO, esSueloDeVerdad,
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

// ── Vender por debajo del propio precio de mayoreo ────────────────────────

const invM = (codigo, publico, mayoreo, producto = 'FUNDA') =>
  ({ productos: [{ Codigo: codigo, Producto: producto, Precio: publico, Mayoreo: mayoreo }] })

test('se compara contra el MAYOREO, no contra la lista al publico', () => {
  // La lista al publico no es el precio: en Aguascalientes solo el 12% de las
  // lineas se cobran a ella. El mayoreo si es un suelo que el negocio decidio.
  const porCodigo = { I13T: { producto: 'IPHONE 13', pz: 10, dinero: 1400, pzMayoreo: 0, dineroMayoreo: 0 } }
  const r = porDebajoDelMayoreo({ porCodigo, inventario: invM('I13T', 250, 150) })
  assert.equal(r.filas.length, 1, 'cobra 140 y su mayoreo es 150')
  assert.equal(r.filas[0].cobrado, 140)
  assert.equal(r.filas[0].mayoreo, 150)
  assert.equal(r.filas[0].pesos, (150 - 140) * 10, 'lo que se deja de ganar')
})

test('vender a precio de mayoreo NO es un problema: es el suelo, no un error', () => {
  const porCodigo = { X: { pz: 10, dinero: 1500, pzMayoreo: 0, dineroMayoreo: 0 } }
  assert.equal(porDebajoDelMayoreo({ porCodigo, inventario: invM('X', 250, 150) }).filas.length, 0)
})

test('vender por debajo de la LISTA pero por encima del mayoreo tampoco salta', () => {
  // Es justo el caso que llenaba la pantalla de ruido: casi todo Ags.
  const porCodigo = { X: { pz: 10, dinero: 1800, pzMayoreo: 0, dineroMayoreo: 0 } }
  const r = porDebajoDelMayoreo({ porCodigo, inventario: invM('X', 250, 150) })
  assert.equal(r.filas.length, 0, 'cobra 180: por debajo de 250 pero por encima de 150')
  assert.equal(r.comparados, 1, 'pero si se miro')
})

test('las piezas marcadas mayoreo no entran: esas ya son mayoreo', () => {
  const porCodigo = { X: { pz: 10, dinero: 1000, pzMayoreo: 10, dineroMayoreo: 1000 } }
  assert.equal(porDebajoDelMayoreo({ porCodigo, inventario: invM('X', 250, 150) }).comparados, 0)
})

test('sin precio de mayoreo capturado no hay suelo contra el que medir', () => {
  const porCodigo = { X: { pz: 10, dinero: 500, pzMayoreo: 0, dineroMayoreo: 0 } }
  assert.equal(porDebajoDelMayoreo({ porCodigo, inventario: invM('X', 250, 0) }).comparados, 0)
})

test('el mayoreo sin marcar explica por que la mezcla sale corta', () => {
  // Esas piezas se cobraron al precio de mayoreo pero sin tocar la casilla,
  // asi que el panel las cuenta como mostrador. En Ags son 1,900 piezas.
  const porCodigo = {
    X: { pz: 20, dinero: 3000, pzMayoreo: 0, dineroMayoreo: 0 },   // 150 = su mayoreo
    Y: { pz: 5, dinero: 1250, pzMayoreo: 0, dineroMayoreo: 0 },    // 250 = su lista
  }
  const inventario = { productos: [
    { Codigo: 'X', Producto: 'A', Precio: 250, Mayoreo: 150 },
    { Codigo: 'Y', Producto: 'B', Precio: 250, Mayoreo: 150 },
  ] }
  const r = mayoreoSinMarcar({ porCodigo, inventario })
  assert.equal(r.piezas, 20)
  assert.equal(r.codigos, 1)
})

test('un mayoreo POR ENCIMA del publico no es un suelo: esta mal capturado', () => {
  // El caso real: el STIKER PEQUEÑO de Leon se cobra a $9 -su precio de
  // lista- y su «mayoreo» figura en $120. Sin esta regla salia acusado de
  // 614 piezas vendidas baratas y $74,062 «que se dejan de ganar», mandando
  // a buscar un problema que no existe.
  const porCodigo = { SP: { producto: 'STIKER', pz: 614, dinero: 5526, pzMayoreo: 0, dineroMayoreo: 0 } }
  const inventario = { productos: [{ Codigo: 'SP', Producto: 'STIKER', Precio: 9, Mayoreo: 120 }] }
  const r = porDebajoDelMayoreo({ porCodigo, inventario })
  assert.equal(r.filas.length, 0)
  assert.equal(r.comparados, 0, 'ni siquiera se mira: esa pareja no define ningun suelo')
})

test('una plaza que no hace mayoreo queda fuera entera', () => {
  // Ferias tiene 745 de 816 productos con el mayoreo IGUAL al publico. Sin
  // esta regla, «por debajo del mayoreo» volvia a ser «por debajo de la
  // lista», que es el ruido que esta pantalla quita.
  const porCodigo = { X: { pz: 10, dinero: 1000, pzMayoreo: 0, dineroMayoreo: 0 } }
  const inventario = { productos: [{ Codigo: 'X', Producto: 'FUNDA', Precio: 216, Mayoreo: 216 }] }
  assert.equal(porDebajoDelMayoreo({ porCodigo, inventario }).comparados, 0)
})

test('esSueloDeVerdad: solo cuando el mayoreo esta por debajo', () => {
  assert.equal(esSueloDeVerdad({ publico: 250, mayoreo: 150 }), true)
  assert.equal(esSueloDeVerdad({ publico: 216, mayoreo: 216 }), false)
  assert.equal(esSueloDeVerdad({ publico: 9, mayoreo: 120 }), false)
  assert.equal(esSueloDeVerdad({ publico: 250, mayoreo: 0 }), false)
  assert.equal(esSueloDeVerdad(null), false)
})
