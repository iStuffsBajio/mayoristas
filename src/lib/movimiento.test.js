// Pruebas de «que se mueve en cada tienda».
//
// Lo que fijan es lo que decide una caja: que mandar, que NO mandar, y que
// un modelo nuevo agotandose pese mas que uno viejo que vende igual.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  movimientoDe, loQueMasSeMueve, nuevosQueVuelan, loQueNoMandar, porModeloYPlaza,
  grupoDe, DIAS_PARA_QUEMARSE, DIAS_PARADO,
} from './movimiento.js'

const HOY = new Date('2026-11-06T12:00:00Z')

// Un dia con sus piezas, con la forma que espera `ritmo.js`.
const dia = (f, m) => ({ f, m })

/** Una plaza de mentira: inventario con existencia y venta diaria. */
const plaza = ({ productos = [], dias = [] } = {}) => ({
  inv: { productos },
  est: { dias },
  hist: { periodos: [] },
})

/** Vende `n` piezas de `codigo` cada dia durante los ultimos `cuantos` dias. */
const vendiendo = (codigo, n, cuantos = 28) =>
  Array.from({ length: cuantos }, (_, i) => {
    const d = new Date(HOY)
    d.setDate(d.getDate() - i)
    return dia(d.toISOString().slice(0, 10), { [codigo]: n })
  })

test('el grupo separa las tres cosas, que se reponen distinto', () => {
  assert.equal(grupoDe('SP', 'STIKER PEQUEÑO'), 'produccion')
  assert.equal(grupoDe('HDB', 'MICA HIDROGEL HD BASICA'), 'protector')
  assert.equal(grupoDe('I13T', 'IPHONE 13 TPU CASE'), 'funda')
})

test('los stickers no salen: bodega los imprime, no los manda', () => {
  const filas = movimientoDe(plaza({
    productos: [{ Codigo: 'SP', Producto: 'STIKER PEQUEÑO', Existencia: 0 }],
    dias: vendiendo('SP', 20),
  }), { hoy: HOY })
  assert.equal(filas.length, 0, 'un sticker agotandose no es una caja que preparar')
})

test('los codigos salen de la UNION del ritmo y el inventario', () => {
  // Solo del inventario se pierde lo que se vendio hasta agotarse, que es lo
  // mas urgente. Solo del ritmo se pierde lo parado en el mostrador.
  const filas = movimientoDe(plaza({
    productos: [{ Codigo: 'PARADO', Producto: 'FUNDA A', Existencia: 40 }],
    dias: vendiendo('AGOTADO', 3),
  }), { hoy: HOY })
  const codigos = filas.map(f => f.codigo).sort()
  assert.deepEqual(codigos, ['AGOTADO', 'PARADO'])
})

test('los dias que aguanta salen de la existencia entre el ritmo', () => {
  const filas = movimientoDe(plaza({
    productos: [{ Codigo: 'X', Producto: 'FUNDA', Existencia: 20 }],
    dias: vendiendo('X', 2),
  }), { hoy: HOY })
  const f = filas.find(x => x.codigo === 'X')
  assert.ok(Math.abs(f.ritmo - 2) < 0.01, `ritmo ${f.ritmo}`)
  assert.ok(Math.abs(f.dias - 10) < 0.1, `dias ${f.dias}`)
})

test('lo que no se vende tiene dias NULL, no infinito', () => {
  // Infinito ordena al reves y se cuela en el primer puesto de «lo que menos
  // aguanta», que es la lista urgente.
  const filas = movimientoDe(plaza({
    productos: [{ Codigo: 'X', Producto: 'FUNDA', Existencia: 20 }],
  }), { hoy: HOY })
  assert.equal(filas[0].dias, null)
  assert.equal(filas[0].ritmo, 0)
})

test('lo que mas se mueve va por RITMO, no por piezas acumuladas', () => {
  // Las piezas acumuladas premian al modelo viejo, que lleva mas tiempo
  // sumando. Lo que decide una caja es a que velocidad se vacia el mostrador.
  const p = plaza({
    productos: [
      { Codigo: 'VIEJO', Producto: 'FUNDA VIEJA', Existencia: 50 },
      { Codigo: 'RAPIDO', Producto: 'FUNDA RAPIDA', Existencia: 5 },
    ],
    dias: [
      ...vendiendo('VIEJO', 1),
      ...vendiendo('RAPIDO', 5).map(d => d),
    ].reduce((acc, d) => {
      const y = acc.find(x => x.f === d.f)
      if (y) Object.assign(y.m, d.m)
      else acc.push({ f: d.f, m: { ...d.m } })
      return acc
    }, []),
  })
  const top = loQueMasSeMueve({ leon: p }, { hoy: HOY, cuantos: 5 })
  assert.equal(top.leon[0].codigo, 'RAPIDO')
})

test('un modelo NUEVO que ya se agota es la lista urgente', () => {
  // No tiene historial que lo respalde: si ya se vacia, entro bien y hay que
  // reforzarlo YA, no en el surtido del mes.
  const p = plaza({
    productos: [
      { Codigo: 'NUEVO', Producto: 'FUNDA NUEVA', Existencia: 6, Alta: '2026-10-01' },
      { Codigo: 'ANTIGUO', Producto: 'FUNDA VIEJA', Existencia: 6, Alta: '2024-01-01' },
    ],
    dias: vendiendo('NUEVO', 2).map((d, i) => ({ f: d.f, m: { NUEVO: 2, ANTIGUO: 2 } })),
  })
  const urgentes = nuevosQueVuelan({ leon: p }, { hoy: HOY })
  assert.deepEqual(urgentes.leon.map(f => f.codigo), ['NUEVO'],
    'el antiguo se agota igual, pero no es noticia: ya se sabia que vendia')
})

test('un modelo nuevo PARADO no entra en la lista urgente', () => {
  const p = plaza({
    productos: [{ Codigo: 'NUEVO', Producto: 'FUNDA', Existencia: 30, Alta: '2026-10-01' }],
  })
  assert.deepEqual(nuevosQueVuelan({ leon: p }, { hoy: HOY }).leon, [],
    'no entro: eso se mira en la otra lista, no en la de reforzar')
})

test('lo que NO hay que mandar: tiene existencia y no se mueve', () => {
  // Es la mitad que nadie pide. Meter diez de algo parado es dejar fuera diez
  // de algo que vuela.
  const p = plaza({
    productos: [
      { Codigo: 'PARADO', Producto: 'FUNDA PARADA', Existencia: 40 },
      { Codigo: 'UNA', Producto: 'FUNDA SUELTA', Existencia: 1 },
      { Codigo: 'VUELA', Producto: 'FUNDA BUENA', Existencia: 10 },
    ],
    dias: vendiendo('VUELA', 3),
  })
  const no = loQueNoMandar({ leon: p }, { hoy: HOY })
  assert.deepEqual(no.leon.map(f => f.codigo), ['PARADO'],
    'con una sola pieza «no se vende» no significa nada: puede que no se vea')
})

test('el mismo modelo en todas las plazas a la vez, que es lo que decide la caja', () => {
  // El A07 vuela en Leon y esta parado en Aguascalientes significa mandar a
  // Leon y NO a Aguascalientes, y eso no se ve mirando una plaza cada vez.
  const conVenta = plaza({
    productos: [{ Codigo: 'A07', Producto: 'GALAXY A07', Existencia: 10 }],
    dias: vendiendo('A07', 3),
  })
  const parada = plaza({
    productos: [{ Codigo: 'A07', Producto: 'GALAXY A07', Existencia: 25 }],
  })
  const filas = porModeloYPlaza({ leon: conVenta, aguascalientes: parada }, { hoy: HOY })
  assert.equal(filas[0].codigo, 'A07')
  assert.ok(filas[0].plazas.leon.ritmo > 0)
  assert.equal(filas[0].plazas.aguascalientes.ritmo, 0)
  assert.equal(filas[0].plazas.aguascalientes.existencia, 25, 'y ya tiene 25: no mandar')
})

test('los umbrales son los acordados y conviene saberlo', () => {
  assert.equal(DIAS_PARA_QUEMARSE, 20)
  assert.equal(DIAS_PARADO, 30)
})
