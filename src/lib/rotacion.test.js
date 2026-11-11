import test from 'node:test'
import assert from 'node:assert/strict'
import { rotacionDe, rotacionDeRed, existenciasDeCodigo, agotadosDeCodigo } from './rotacion.js'

test('rotación: piezas al día y para cuántos días alcanza', () => {
  // 12 piezas en 30 días son 0.4 al día; con 8 en el mostrador, 20 días.
  const r = rotacionDe({ salidas: 12, rango: 30, existencia: 8 })
  assert.equal(r.estado, 'rota')
  assert.ok(Math.abs(r.porDia - 0.4) < 1e-9)
  assert.ok(Math.abs(r.porSemana - 2.8) < 1e-9)
  assert.ok(Math.abs(r.dias - 20) < 1e-9)
})

test('UN RITMO DE CERO NO ES «DURA PARA SIEMPRE»: son piezas paradas', () => {
  // Dividir entre cero y enseñar infinito se leería como buena noticia cuando
  // es justo lo contrario.
  const r = rotacionDe({ salidas: 0, rango: 30, existencia: 5 })
  assert.equal(r.estado, 'sin-venta')
  assert.equal(r.dias, null)
  assert.equal(r.existencia, 5)
})

test('sin existencia no hay días que decir: es cero, no «sin dato»', () => {
  const r = rotacionDe({ salidas: 9, rango: 30, existencia: 0 })
  assert.equal(r.estado, 'sin-existencia')
  assert.equal(r.dias, 0)
})

test('sin saber cuántas hay NO se opina', () => {
  for (const existencia of [null, undefined, NaN]) {
    const r = rotacionDe({ salidas: 9, rango: 30, existencia })
    assert.equal(r.estado, 'sin-dato')
    assert.equal(r.dias, null)
    assert.equal(r.existencia, null)
  }
  assert.equal(rotacionDe().estado, 'sin-dato')
})

test('un rango de cero días no revienta', () => {
  const r = rotacionDe({ salidas: 5, rango: 0, existencia: 5 })
  assert.equal(r.porDia, 0)
  assert.equal(r.estado, 'sin-venta')
})

test('la red: las tiendas suman, y bodega se traduce a días AL RITMO DE LAS TIENDAS', () => {
  // Bodega no vende: su existencia es de donde se surte. Sus 40 piezas, al
  // ritmo de las tiendas (30 en 30 días = 1 al día), son 40 días más.
  const r = rotacionDeRed({
    tiendas: [{ salidas: 20, existencia: 6 }, { salidas: 10, existencia: 4 }],
    bodega: 40, rango: 30,
  })
  assert.equal(r.tiendas.existencia, 10)
  assert.ok(Math.abs(r.tiendas.dias - 10) < 1e-9)
  assert.ok(Math.abs(r.diasBodega - 40) < 1e-9)
  assert.equal(r.sinInventario, 0)
})

test('UNA TIENDA SIN INVENTARIO NO SUMA CERO: se deja fuera y se cuenta', () => {
  // Sumarla como cero haría ver un faltante que sólo es un archivo que no ha
  // llegado —es lo que pasa con Torreón hasta su primera sincronización—.
  const r = rotacionDeRed({
    tiendas: [{ salidas: 10, existencia: 5 }, { salidas: 0, existencia: null }],
    bodega: 10, rango: 10,
  })
  assert.equal(r.sinInventario, 1)
  assert.equal(r.tiendas.existencia, 5, 'sólo lo que sí se sabe')
  assert.equal(r.tiendas.estado, 'rota')
})

test('si NINGUNA tienda tiene inventario no se opina de la red', () => {
  const r = rotacionDeRed({ tiendas: [{ salidas: 3, existencia: null }], bodega: 5, rango: 30 })
  assert.equal(r.tiendas.estado, 'sin-dato')
})

test('sin ritmo no hay días de bodega: no se inventa con una división por cero', () => {
  const r = rotacionDeRed({ tiendas: [{ salidas: 0, existencia: 5 }], bodega: 50, rango: 30 })
  assert.equal(r.diasBodega, null)
  assert.equal(r.bodega, 50)
  assert.equal(rotacionDeRed({ tiendas: [{ salidas: 5, existencia: 5 }], rango: 30 }).bodega, null)
})

test('existencias: null es «no se sabe» y la ausencia es «no lo maneja»', () => {
  const inventarios = {
    leon:   { productos: [{ Codigo: 'HX7DT', Existencia: 5 }, { Codigo: 'OTRO', Existencia: 1 }] },
    ags:    { productos: [{ Codigo: 'OTRO', Existencia: 9 }] },
    torreon: null,
  }
  const e = existenciasDeCodigo(' hx7dt ', inventarios)
  assert.equal(e.leon, 5)
  assert.equal('ags' in e, false, 'publicó inventario y no lo tiene: no lo maneja')
  assert.equal(e.torreon, null, 'no publicó inventario: no se sabe')
  assert.deepEqual(existenciasDeCodigo('', inventarios), {})
  assert.deepEqual(existenciasDeCodigo('X', null), {})
})

test('agotados: dato, null y undefined son tres cosas distintas', () => {
  const ago = {
    leon: { porCodigo: { HX7DT: { diasEnCero: 32, diasMedidos: 91, parte: 0.35 } } },
    ags:  { porCodigo: {} },
    torreon: null,
  }
  const a = agotadosDeCodigo('hx7dt', ago)
  assert.equal(a.leon.diasEnCero, 32)
  assert.equal(a.ags, null, 'tiene archivo y el código no está: no lo maneja')
  assert.equal(a.torreon, undefined, 'todavía no tiene archivo: no se sabe')
})
