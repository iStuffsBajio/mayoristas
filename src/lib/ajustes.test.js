// Pruebas de la capa de ajustes.
//
// Lo que fijan es la regla que puso el dueño con estas palabras: «si no
// detecta que ya se corrigió, no lo cambia de color, sigue en ámbar». El
// estado NO lo decide nadie marcando una casilla: lo decide el respaldo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TIPOS, MOTIVOS, ESTADOS, DIAS_PARA_INSISTIR,
  nuevoAjuste, juntarAjustes, dondeSigue, estadoDe,
  codigosOcultos, sinOcultos, pendientesPorPlaza, resumirAjustes, codigosDeFicha,
} from './ajustes.js'

const HOY = new Date('2026-11-05T12:00:00Z')
const inv = (...codigos) => ({ productos: codigos.map(c => ({ Codigo: c, Existencia: 1 })) })

const ajuste = (codigo, extra = {}) => nuevoAjuste({
  codigo, motivo: 'ya-no-existe', quien: 'admin',
  cuando: new Date('2026-11-01T12:00:00Z'), ...extra,
})

test('un ajuste sin código o sin motivo válido no se crea', () => {
  assert.throws(() => nuevoAjuste({ codigo: '', motivo: 'ya-no-existe', quien: 'admin' }))
  assert.throws(() => nuevoAjuste({ codigo: 'X', motivo: 'porque si', quien: 'admin' }))
})

test('el código se normaliza: la caja lo escribe como le toca', () => {
  const a = ajuste(' i11t-wihr ')
  assert.equal(a.codigo, 'I11T-WIHR')
  assert.equal(a.clave, 'ocultar|I11T-WIHR')
})

test('mientras el código siga en una plaza, el ajuste sigue PENDIENTE', () => {
  const inventarios = { leon: inv('I11T', 'X'), 'san-luis': inv('X') }
  const e = estadoDe(ajuste('I11T'), inventarios, HOY)
  assert.equal(e.estado, ESTADOS.PENDIENTE)
  assert.deepEqual(e.plazas, ['leon'], 'hay que ir a corregirlo donde sigue vivo')
  assert.equal(e.dias, 4)
})

test('cuando el respaldo ya no lo trae, el ajuste se resuelve SOLO', () => {
  // Nadie marcó nada: el código desapareció de Eleventa y con eso basta.
  const inventarios = { leon: inv('X'), 'san-luis': inv('X') }
  assert.equal(estadoDe(ajuste('I11T'), inventarios, HOY).estado, ESTADOS.RESUELTO)
})

test('un pendiente que nadie toca en tres semanas vuelve a ser alerta', () => {
  const inventarios = { leon: inv('I11T') }
  const viejo = ajuste('I11T', { cuando: new Date('2026-10-01T12:00:00Z') })
  const e = estadoDe(viejo, inventarios, HOY)
  assert.ok(e.dias >= DIAS_PARA_INSISTIR)
  assert.equal(e.insiste, true, 'ya no es del dato: es de que nadie lo corrige')

  // El recién hecho no insiste todavía.
  assert.equal(estadoDe(ajuste('I11T'), inventarios, HOY).insiste, false)
})

test('si dos personas ajustan el mismo código, gana el más reciente', () => {
  const juntos = juntarAjustes({
    admin: [ajuste('X', { nota: 'viejo', cuando: new Date('2026-11-01T00:00:00Z') })],
    leon:  [ajuste('X', { nota: 'nuevo', cuando: new Date('2026-11-03T00:00:00Z'), quien: 'leon' })],
  })
  assert.equal(Object.keys(juntos).length, 1)
  assert.equal(juntos['ocultar|X'].nota, 'nuevo')
  assert.equal(juntos['ocultar|X'].quien, 'leon')
})

test('lo ajustado deja de salir en las listas del panel', () => {
  const ocultos = codigosOcultos({ 'ocultar|X': ajuste('X') })
  const filas = [{ codigo: 'X' }, { codigo: 'Y' }, { codigo: 'x' }]
  // También el que viene en minúsculas: es el mismo código.
  assert.deepEqual(sinOcultos(filas, ocultos).map(f => f.codigo), ['Y'])
})

test('sin ajustes, la lista pasa entera y sin copiarse', () => {
  const filas = [{ codigo: 'X' }]
  assert.equal(sinOcultos(filas, new Set()), filas)
})

test('cada sucursal recibe sólo lo que le toca corregir', () => {
  const inventarios = { leon: inv('A', 'B'), 'san-luis': inv('B'), bodega: inv('C') }
  const ajustes = juntarAjustes({ admin: [ajuste('A'), ajuste('B'), ajuste('C')] })
  const por = pendientesPorPlaza(ajustes, inventarios, HOY)

  assert.deepEqual(por.leon.map(a => a.codigo).sort(), ['A', 'B'])
  assert.deepEqual(por['san-luis'].map(a => a.codigo), ['B'])
  assert.deepEqual(por.bodega.map(a => a.codigo), ['C'])
})

test('el resumen separa lo pendiente de lo que ya se resolvió', () => {
  const inventarios = { leon: inv('A') }
  const ajustes = juntarAjustes({ admin: [ajuste('A'), ajuste('YA-NO-ESTA')] })
  const r = resumirAjustes(ajustes, inventarios, HOY)
  assert.equal(r.pendientes, 1)
  assert.equal(r.resueltos, 1)
  assert.equal(r.total, 2)
})

test('los motivos son una lista cerrada, para poder contarlos', () => {
  assert.ok(Object.keys(MOTIVOS).includes('codigo-duplicado'))
  assert.equal(TIPOS.OCULTAR, 'ocultar')
})

test('los códigos de una ficha salen como texto, venga como venga', () => {
  // Una ficha suelta trae un texto; un lote, una lista de objetos. Tratarlos
  // igual daba «[object Object]» en pantalla y un filtro que no filtraba.
  assert.deepEqual(codigosDeFicha({ codigo: 'i13t' }), ['I13T'])
  assert.deepEqual(
    codigosDeFicha({ codigos: [{ codigo: 'a', piezas: 2 }, { codigo: 'b' }] }),
    ['A', 'B'])
  assert.deepEqual(codigosDeFicha({ codigos: ['x', { codigo: 'y' }, null] }), ['X', 'Y'])
  assert.deepEqual(codigosDeFicha({}), [])
  assert.deepEqual(codigosDeFicha(null), [])
})
