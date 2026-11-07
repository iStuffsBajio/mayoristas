// Pruebas de los ajustes a mano sobre lo que se va a pedir.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  interpretar, conAjuste, aplicarAjustes, resumirAjustes, limpiarAmbito,
  leerGuardado, guardar, claveDe, MAXIMO, CLAVE_GUARDADO,
} from './ajusteCompra.js'

const filas = () => ([
  { codigo: 'I13T', producto: 'IPHONE 13', sugerido: 20 },
  { codigo: 'SGA07T', producto: 'GALAXY A07', sugerido: 12 },
])

test('la celda vacia QUITA el ajuste, no lo pone en cero', () => {
  // Es lo que uno espera al borrar la celda y salir. Si vaciar significara
  // cero, borrar sin querer dejaria el modelo fuera del pedido.
  const r = interpretar('')
  assert.equal(r.ok, true)
  assert.equal(r.valor, null)
  assert.equal(r.quitar, true)
})

test('un CERO escrito a proposito si es cero: «de este no pidas ninguno»', () => {
  const r = interpretar('0')
  assert.equal(r.ok, true)
  assert.equal(r.valor, 0)
  assert.equal(r.quitar, false)
})

test('se acepta como se teclea una cantidad: con coma o con espacio', () => {
  assert.equal(interpretar('1,200').valor, 1200)
  assert.equal(interpretar('1 200').valor, 1200)
  assert.equal(interpretar('  48  ').valor, 48)
})

test('lo que no es un entero se rechaza con su motivo', () => {
  assert.equal(interpretar('doce').ok, false)
  assert.equal(interpretar('12.5').ok, false)
  assert.equal(interpretar('-5').ok, false, 'pedir en negativo no significa nada')
  assert.ok(interpretar('doce').porque)
})

test('el tope separa un error de tecleo de una decision', () => {
  // Diez mil piezas de un modelo no es una compra: es un dedo que se quedo
  // pulsado. Sin tope, un cero de mas se lleva el presupuesto.
  assert.equal(interpretar(String(MAXIMO)).ok, true)
  const r = interpretar(String(MAXIMO + 1))
  assert.equal(r.ok, false)
  assert.match(r.porque, /sobra un cero/)
})

test('el ambito va en la llave: comprar 50 y mandar 50 no son lo mismo', () => {
  let a = conAjuste({}, 'compra', 'I13T', 50)
  a = conAjuste(a, 'leon', 'I13T', 8)
  assert.equal(a[claveDe('compra', 'I13T')], 50)
  assert.equal(a[claveDe('leon', 'I13T')], 8)
  assert.equal(Object.keys(a).length, 2, 'no se pisan')
})

test('aplicar un ajuste conserva lo que decia la cuenta', () => {
  // Un numero cambiado sin referencia no se puede revisar: a la semana nadie
  // recuerda si 24 era la cuenta o lo que alguien escribio.
  const r = aplicarAjustes(filas(), conAjuste({}, 'compra', 'I13T', 36), 'compra')
  const f = r.find(x => x.codigo === 'I13T')
  assert.equal(f.sugerido, 36)
  assert.equal(f.sugeridoOriginal, 20)
  assert.equal(f.ajustado, true)
  assert.equal(r.find(x => x.codigo === 'SGA07T').ajustado, undefined, 'la otra no se toca')
})

test('sin ajustes la lista pasa entera y SIN copiarse', () => {
  const f = filas()
  assert.equal(aplicarAjustes(f, {}, 'compra'), f, 'asi una tabla sin ajustes no se redibuja')
  assert.equal(aplicarAjustes(f, null, 'compra'), f)
})

test('el ajuste de otro ambito no se aplica aqui', () => {
  const r = aplicarAjustes(filas(), conAjuste({}, 'leon', 'I13T', 99), 'compra')
  assert.equal(r.find(x => x.codigo === 'I13T').sugerido, 20)
})

test('el resumen dice cuantos se tocaron y cuanto cambia el total', () => {
  let a = conAjuste({}, 'compra', 'I13T', 36)     // +16
  a = conAjuste(a, 'compra', 'SGA07T', 4)         // -8
  const r = resumirAjustes(aplicarAjustes(filas(), a, 'compra'))
  assert.equal(r.cuantos, 2)
  assert.equal(r.subidas, 1)
  assert.equal(r.bajadas, 1)
  assert.equal(r.diferencia, 8)
})

test('limpiar un ambito deja en pie los de los demas', () => {
  let a = conAjuste({}, 'compra', 'X', 1)
  a = conAjuste(a, 'leon', 'X', 2)
  const r = limpiarAmbito(a, 'compra')
  assert.deepEqual(Object.keys(r), [claveDe('leon', 'X')])
})

test('un guardado corrupto o raro no se convierte en una compra', () => {
  // Se filtra al LEER y no solo al escribir: lo guardado pudo quedar de una
  // version anterior, y un valor raro aqui es una cantidad que alguien pide.
  const caja = v => ({ getItem: () => v, setItem: () => {} })
  assert.deepEqual(leerGuardado(caja('no es json')), {})
  assert.deepEqual(leerGuardado(caja('[1,2,3]')), {})
  assert.deepEqual(leerGuardado(caja('null')), {})
  assert.deepEqual(leerGuardado(caja(JSON.stringify({ 'compra|X': -5 }))), {})
  assert.deepEqual(leerGuardado(caja(JSON.stringify({ 'compra|X': 1.5 }))), {})
  assert.deepEqual(leerGuardado(caja(JSON.stringify({ 'compra|X': MAXIMO + 1 }))), {})
  assert.deepEqual(leerGuardado(caja(JSON.stringify({ 'compra|X': 12 }))), { 'compra|X': 12 })
  assert.deepEqual(leerGuardado(null), {})
})

test('si el navegador no deja guardar, no se rompe nada', () => {
  // Modo privado: `setItem` lanza. Perder el ajuste es un fastidio; que se
  // caiga la pantalla de compras es otra cosa.
  const caja = { getItem: () => null, setItem: () => { throw new Error('denied') } }
  assert.doesNotThrow(() => guardar(caja, { 'compra|X': 1 }))
})

test('la clave de guardado es estable', () => {
  assert.equal(CLAVE_GUARDADO, 'istuffs_ajuste_compra')
})
