import test from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorModelo } from './variantes.js'
import { codigosHuerfanos, resumirHuerfanos, MOTIVO, DIAS_DESCONTINUADO } from './anomalias.js'

const HOY = new Date('2026-10-26')
const prod = (Codigo, Producto, Existencia = 0, UltimoMov = '2026-10-20') => ({ Codigo, Producto, Existencia, UltimoMov })

const correr = ({ tienda, bodega }) => {
  const todos = [...tienda, ...bodega]
  return codigosHuerfanos({
    inventarios: { leon: { productos: tienda } },
    bodega: { productos: bodega },
    grupos: agruparPorModelo(todos),
    hoy: HOY,
  })
}

test('un código que bodega sí tiene no es anomalía', () => {
  const r = correr({
    tienda: [prod('I15T', 'IPHONE 15 TPU CASE', 4)],
    bodega: [prod('I15T', 'IPHONE 15 TPU CASE', 60)],
  })
  assert.equal(r.length, 0)
})

test('el caso del A35: bodega lo cubre con el código combinado', () => {
  // SGA353 vive en las tiendas; bodega tiene SGA553, que es el mismo producto
  // para dos aparatos. El código suelto sobra.
  const r = correr({
    tienda: [prod('SGA353', 'SAMSUNG A35 3 IN 1', 1)],
    bodega: [prod('SGA553', 'SAMSUNG A55/A35 3 IN 1', 24)],
  })
  assert.equal(r.length, 1)
  assert.equal(r[0].motivo, MOTIVO.DUPLICADO)
  assert.equal(r[0].cubiertoPor.codigo, 'SGA553')
  assert.match(r[0].accion, /bodega ya lo cubre/)
})

test('el TIPO de funda cuenta: un militar no lo cubre un hard case', () => {
  // Sin esto, el detector proponía borrar el iPhone 12 militar porque bodega
  // tiene un hard case del mismo teléfono. Son productos distintos.
  const r = correr({
    tienda: [prod('I12MIT', 'IPHONE 12 MILITAR TPU CASE', 9)],
    bodega: [prod('I12', 'IPHONE 12 6.1 HARD CASE', 30)],
  })
  assert.equal(r.length, 1)
  assert.notEqual(r[0].motivo, MOTIVO.DUPLICADO)
})

test('5G y 4G no se cubren entre sí', () => {
  const r = correr({
    tienda: [prod('VV30LT', 'VIVO V30 LITE 5G TPU CASE', 8)],
    bodega: [prod('VV30L4GT', 'VIVO V30 LITE 4G TPU CASE', 10)],
  })
  assert.notEqual(r[0].motivo, MOTIVO.DUPLICADO)
})

test('sin mover en mucho tiempo y sin respaldo: descontinuado', () => {
  const r = correr({
    tienda: [prod('IXSMST', 'IPHONE XS MAX SALMON TPU CASE', 2, '2023-03-31')],
    bodega: [],
  })
  assert.equal(r[0].motivo, MOTIVO.DESCONTINUADO)
  assert.ok(r[0].diasSinMover > DIAS_DESCONTINUADO)
  // Con piezas todavía: primero agotarlas.
  assert.match(r[0].accion, /Agotar/)
})

test('descontinuado y sin piezas: eliminar el código', () => {
  const r = correr({
    tienda: [prod('VIEJO', 'IPHONE 6 TPU CASE', 0, '2023-01-01')],
    bodega: [],
  })
  assert.equal(r[0].motivo, MOTIVO.DESCONTINUADO)
  assert.match(r[0].accion, /^Eliminar/)
})

test('se mueve y nadie lo cubre: falta darlo de alta', () => {
  const r = correr({
    tienda: [prod('R16NUEVO', 'REALME 16 PRO TPU CASE', 3, '2026-10-22')],
    bodega: [],
  })
  assert.equal(r[0].motivo, MOTIVO.SIN_ALTA)
  assert.match(r[0].accion, /darlo de alta/)
})

test('nada se borra solo: todo sale como propuesta', () => {
  const r = correr({
    tienda: [prod('A', 'IPHONE 15 TPU CASE', 1, '2026-10-20'),
             prod('B', 'IPHONE 6 TPU CASE', 0, '2022-01-01')],
    bodega: [],
  })
  // Ninguna acción dice «borrado»: todas piden confirmar o son instrucciones
  // para una persona.
  for (const f of r) assert.ok(f.accion && f.accion.length > 0)
})

test('el resumen cuenta por motivo y suma piezas', () => {
  const r = correr({
    tienda: [prod('SGA353', 'SAMSUNG A35 3 IN 1', 1),
             prod('VIEJO', 'IPHONE 6 TPU CASE', 2, '2022-01-01')],
    bodega: [prod('SGA553', 'SAMSUNG A55/A35 3 IN 1', 24)],
  })
  const s = resumirHuerfanos(r)
  assert.equal(s.total, 2)
  assert.equal(s.piezas, 3)
  assert.equal(s[MOTIVO.DUPLICADO], 1)
  assert.equal(s[MOTIVO.DESCONTINUADO], 1)
})

test('nada revienta sin datos', () => {
  assert.deepEqual(codigosHuerfanos({}), [])
  assert.equal(resumirHuerfanos(null).total, 0)
})

test('lo que bodega fabrica no es un huerfano', () => {
  // Bodega no tiene el Stiker Pequeno de alta porque no lo almacena: lo
  // imprime cuando hace falta. Sin esta regla salia en la lista de «sin
  // existencia en ninguna: borrense», que es la cosa falsa contra la que se
  // escribio produccion.js. Un sticker en cero no es un agotado ni un muerto.
  const inventarios = {
    leon: { productos: [
      { Codigo: 'SP', Producto: 'Stiker Pequeño', Existencia: 0, UltimoMov: '2023-01-01' },
      { Codigo: 'MTST01', Producto: 'STIKER MARIPOSAS', Existencia: 0, UltimoMov: '2023-01-01' },
      { Codigo: 'HP10LT', Producto: 'HUAWEI P10 LITE TPU CASE', Existencia: 0, UltimoMov: '2023-01-01' },
    ] },
  }
  const bodega = { productos: [{ Codigo: 'I13T', Producto: 'IPHONE 13 TPU CASE', Existencia: 5 }] }
  const filas = codigosHuerfanos({ inventarios, bodega, grupos: [], hoy: new Date('2026-10-26') })
  assert.deepEqual(filas.map(f => f.codigo), ['HP10LT'])
})
