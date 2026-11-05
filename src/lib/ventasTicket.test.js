// Pruebas de la venta linea por linea.
//
// Las tres que importan son la del ticket cancelado, la del mayorista apuntado
// como producto y la de la hora: las tres fallan en silencio, dejando una
// cifra alta, una cifra inflada y una grafica con forma correcta y seis horas
// de desfase.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agregarVentas, claseDeLinea, horaDe, diaSemanaDe, pesoDelMayoreo,
  DEPTO_MAYORISTAS, DEPTO_STICKERS,
} from './ventasTicket.js'

const ticket = (id, extra = {}) => ({
  id, folio: `F${id}`, cuando: '2026-10-31 15:03:02.0000',
  cancelado: 'f', cajero: 'Ana', ...extra,
})
const linea = (ticket, extra = {}) => ({
  ticket, codigo: 'I13T', producto: 'IPHONE 13 TPU CASE', depto: 'FUNDAS',
  cantidad: 1, total: 229, ganancia: 120, mayoreo: 'f', ...extra,
})

test('los booleanos de Eleventa son t y f, no 1 y 0', () => {
  // Comparar contra 1 no da cero filas: revienta la consulta entera. Aqui, al
  // leer, hay que aceptar las dos formas o un mayoreo se cuenta como publico.
  const r = agregarVentas({
    tickets: [ticket(1)],
    lineas: [linea(1, { mayoreo: 't' })],
  })
  assert.equal(r.resumen.piezasMayoreo, 1)

  const r2 = agregarVentas({ tickets: [ticket(2)], lineas: [linea(2, { mayoreo: true })] })
  assert.equal(r2.resumen.piezasMayoreo, 1)
})

test('LA TRAMPA: un ticket cancelado conserva sus lineas, y no son venta', () => {
  // Medido en Leon: 67 cancelados con 164 piezas. Sumar las lineas sin mirar
  // el ticket las cuenta como venta y la cifra sale alta sin parecer roto.
  const r = agregarVentas({
    tickets: [ticket(1), ticket(2, { cancelado: 't' })],
    lineas: [linea(1), linea(2, { cantidad: 5 })],
  })
  assert.equal(r.resumen.tickets, 1)
  assert.equal(r.resumen.cancelados, 1)
  assert.equal(r.resumen.piezas, 1, 'las 5 del cancelado no son venta')
  assert.equal(r.resumen.piezasCanceladas, 5, 'pero se cuentan aparte, no se tiran')
})

test('LA OTRA TRAMPA: un mayorista apuntado como producto es una etiqueta', () => {
  // En Leon son 2,368 «piezas» que valen $24: no son fundas, son los clientes
  // dados de alta como si fueran productos para apuntar de quien es el ticket.
  const r = agregarVentas({
    tickets: [ticket(1)],
    lineas: [
      linea(1),
      // Nombre inventado a proposito: los de verdad son la lista de clientes
      // del negocio y este archivo va en git.
      linea(1, { codigo: 'PT999', producto: 'NOMBRE PLAZA (999)', depto: 'MAYORISTAS', cantidad: 1, total: 0, ganancia: 0 }),
    ],
  })
  assert.equal(r.resumen.piezas, 1, 'la etiqueta no suma piezas')
  assert.equal(r.resumen.lineas, 1)
  assert.equal(r.porCodigo.PT999, undefined, 'y no aparece como producto vendido')
  assert.deepEqual(r.mayoristas.map(m => m.quien), ['NOMBRE PLAZA (999)'])
  assert.equal(r.mayoristas[0].tickets, 1)
  assert.equal(r.mayoristas[0].ultima, '2026-10-31', 'cuando compro por ultima vez')
})

test('los stickers son venta de verdad, pero se marcan sin inventario', () => {
  // Bodega los imprime cuando hacen falta: un sticker en cero no es un
  // agotado, asi que no puede entrar en el surtido.
  const r = agregarVentas({
    tickets: [ticket(1)],
    lineas: [linea(1, { codigo: 'SP', producto: 'Stiker Pequeno', depto: 'stikers', cantidad: 3, total: 30 })],
  })
  assert.equal(r.resumen.piezas, 3)
  assert.equal(r.resumen.dinero, 30)
  assert.equal(r.porCodigo.SP.sinStock, true)
})

test('clasificar una linea: tres cosas distintas', () => {
  assert.equal(claseDeLinea({ depto: 'MAYORISTAS' }), 'etiqueta')
  assert.equal(claseDeLinea({ depto: DEPTO_MAYORISTAS }), 'etiqueta')
  assert.equal(claseDeLinea({ depto: DEPTO_STICKERS }), 'sin-stock')
  assert.equal(claseDeLinea({ depto: 'FUNDAS' }), 'producto')
  assert.equal(claseDeLinea({}), 'producto')
})

test('LA TERCERA TRAMPA: la hora se lee del texto, no con new Date()', () => {
  // Llegan sin zona -«2026-10-31 15:03:02.0000»- y en hora local. Pasarlas por
  // new Date() las trata como UTC: la grafica de horas sale corrida seis
  // posiciones y sigue teniendo forma de curva, asi que no se nota.
  assert.deepEqual(horaDe('2026-10-31 15:03:02.0000'), { dia: '2026-10-31', hora: 15, minuto: 3 })
  assert.deepEqual(horaDe('2026-10-31T09:00:00'), { dia: '2026-10-31', hora: 9, minuto: 0 })
  assert.equal(horaDe('no es una fecha'), null)
  assert.equal(horaDe(null), null)
})

test('el dia de la semana sale sin zonas horarias', () => {
  assert.equal(diaSemanaDe('2026-10-31'), 6, 'sabado')
  assert.equal(diaSemanaDe('2026-11-01'), 0, 'domingo')
  assert.equal(diaSemanaDe('x'), null)
})

test('una linea sin su ticket no se cuenta: no se puede fechar', () => {
  const r = agregarVentas({ tickets: [], lineas: [linea(99)] })
  assert.equal(r.resumen.piezas, 0, 'suponerla viva es lo que infla la cifra')
})

test('el dinero se reparte entre publico y mayoreo, que es la mitad de la venta', () => {
  const r = agregarVentas({
    tickets: [ticket(1)],
    lineas: [
      linea(1, { cantidad: 2, total: 458, mayoreo: 'f' }),
      linea(1, { cantidad: 4, total: 572, mayoreo: 't' }),
    ],
  })
  assert.equal(r.resumen.piezas, 6)
  assert.equal(r.resumen.dinero, 1030)
  assert.equal(r.resumen.piezasMayoreo, 4)
  assert.equal(r.resumen.dineroMayoreo, 572)

  const peso = pesoDelMayoreo(r.porCodigo)
  assert.equal(peso.I13T.dePiezas, 4 / 6)
  assert.ok(Math.abs(peso.I13T.deDinero - 572 / 1030) < 1e-9)
  // El precio medio de VERDAD, mezcla incluida. Es lo que hay que usar para
  // valorar, no el promedio de las listas de precios.
  assert.ok(Math.abs(peso.I13T.precioMedio - 1030 / 6) < 1e-9)
})

test('las horas y los dias se agregan, y el ticket se cuenta una sola vez', () => {
  const r = agregarVentas({
    tickets: [ticket(1), ticket(2, { cuando: '2026-10-31 11:10:00.0000' })],
    lineas: [linea(1), linea(1, { codigo: 'SGA16T' }), linea(2)],
  })
  assert.equal(r.resumen.tickets, 2, 'dos tickets, aunque uno traiga dos lineas')
  assert.deepEqual(r.porHora.map(f => [f.h, f.tickets, f.piezas]), [[11, 1, 1], [15, 1, 2]])
  assert.equal(r.desde, '2026-10-31')
  assert.equal(r.hasta, '2026-10-31')
  assert.equal(r.cajeros[0].cajero, 'Ana')
  assert.equal(r.cajeros[0].tickets, 2)
})
