import test from 'node:test'
import assert from 'node:assert/strict'
import {
  reemplazosDeCancelados, resumirReemplazos, MINUTOS_PARA_REEMPLAZO,
} from './reemplazos.js'

const t = (id, cuando, extra = {}) =>
  ({ id, folio: `F${id}`, cuando: `2026-11-08 ${cuando}:00`, cajero: 'Brenda', cancelado: false, ...extra })

const l = (codigo, producto, piezas = 1, importe = 200) => ({ codigo, producto, piezas, importe })

test('EL CASO QUE DESCRIBIO EL DUEÑO: mismo telefono, otra funda', () => {
  // «Cancelo un iPhone 14 en 3 piezas. Y despues doy de alta un iPhone 14 en
  // TPU. Pero es el ticket exactamente siguiente despues de cancelar.»
  const filas = reemplazosDeCancelados({
    tickets: [
      t(1, '17:30', { cancelado: true }),
      t(2, '17:34'),
    ],
    lineasPorTicket: {
      1: [l('I143EN1', 'IPHONE 14 3 IN 1', 1, 320)],
      2: [l('I14T', 'IPHONE 14 TPU CASE', 1, 229)],
    },
  })

  assert.equal(filas.length, 1)
  assert.equal(filas[0].confianza, 'probable')
  assert.equal(filas[0].reemplazo.folio, 'F2')
  assert.equal(filas[0].reemplazo.minutosDespues, 4)
  // Y se dice POR QUE se sospecha, que es lo que permite estar en desacuerdo.
  assert.match(filas[0].porque, /mismo teléfono/i)
  assert.match(filas[0].porque, /otro tipo de funda/i)
})

test('SI EL MODELO NO COINCIDE, se enseña pero NO se da por reemplazo', () => {
  // Hay venta justo despues, pero de otro telefono. Puede ser el reemplazo
  // -el cliente se llevo otra cosa- y puede no tener nada que ver. Decir que
  // lo es seria inventar la relacion.
  const filas = reemplazosDeCancelados({
    tickets: [t(1, '12:00', { cancelado: true }), t(2, '12:03')],
    lineasPorTicket: {
      1: [l('I14T', 'IPHONE 14 TPU CASE')],
      2: [l('SGA17T', 'GALAXY A17 TPU CASE')],
    },
  })
  assert.equal(filas[0].confianza, 'dudosa')
  assert.match(filas[0].porque, /de otro modelo/)
  assert.ok(filas[0].reemplazo, 'se enseña igual, para que lo juzgue una persona')
})

test('UNA CANCELACION SIN NADA DESPUES es el dato que mas importa', () => {
  // Es venta que se fue por la puerta y no volvio. No es una sospecha: es un
  // hecho, y el unico de los tres que se puede sumar.
  const filas = reemplazosDeCancelados({
    tickets: [t(1, '20:00', { cancelado: true })],
    lineasPorTicket: { 1: [l('I14T', 'IPHONE 14 TPU CASE', 2, 458)] },
  })
  assert.equal(filas[0].confianza, 'ninguna')
  assert.equal(filas[0].reemplazo, null)
  assert.match(filas[0].porque, /se fue/)

  const r = resumirReemplazos(filas)
  assert.equal(r.sinNadaDespues, 1)
  assert.equal(r.importeSinReemplazo, 458)
})

test('EL CAJERO IMPORTA: dos mostradores atienden a la vez', () => {
  // El ticket siguiente EN EL TIEMPO puede ser de otro cliente, de la otra
  // caja, que no tiene nada que ver con la cancelacion. Emparejarlos seria
  // inventar una relacion por pura coincidencia de reloj.
  const filas = reemplazosDeCancelados({
    tickets: [
      t(1, '15:00', { cancelado: true }),
      t(2, '15:01', { cajero: 'Otro' }),
      t(3, '15:09'),
    ],
    lineasPorTicket: {
      1: [l('I14T', 'IPHONE 14 TPU CASE')],
      2: [l('I14T', 'IPHONE 14 TPU CASE')],
      3: [l('I143EN1', 'IPHONE 14 3 IN 1')],
    },
  })
  assert.equal(filas[0].reemplazo.folio, 'F3', 'el de SU cajero, aunque sea mas tarde')
  assert.equal(filas[0].confianza, 'probable')
})

test('fuera de la ventana no se empareja', () => {
  // Treinta minutos es lo que tarda un cliente en elegir otra funda con el
  // mostrador delante. Mas alla, lo que venga ya no tiene por que tener
  // relacion, y emparejarlo seria ruido con apariencia de dato.
  assert.equal(MINUTOS_PARA_REEMPLAZO, 30)
  const filas = reemplazosDeCancelados({
    tickets: [t(1, '10:00', { cancelado: true }), t(2, '11:30')],
    lineasPorTicket: {
      1: [l('I14T', 'IPHONE 14 TPU CASE')],
      2: [l('I14T', 'IPHONE 14 TPU CASE')],
    },
  })
  assert.equal(filas[0].confianza, 'ninguna')
  assert.equal(filas[0].reemplazo, null)
})

test('un ticket cancelado NO puede ser el reemplazo de otro', () => {
  const filas = reemplazosDeCancelados({
    tickets: [
      t(1, '09:00', { cancelado: true }),
      t(2, '09:02', { cancelado: true }),
      t(3, '09:05'),
    ],
    lineasPorTicket: {
      1: [l('I14T', 'IPHONE 14 TPU CASE')],
      2: [l('I14T', 'IPHONE 14 TPU CASE')],
      3: [l('I14T', 'IPHONE 14 TPU CASE')],
    },
  })
  assert.equal(filas.length, 2, 'las dos cancelaciones salen')
  const primera = filas.find(f => f.cancelado.folio === 'F1')
  assert.equal(primera.reemplazo.folio, 'F3', 'se salta la cancelada')
})

test('el mismo telefono y el MISMO tipo tambien cuenta, pero se dice distinto', () => {
  // Rehacer el mismo ticket -se equivoco al cobrar- es tan probable como
  // cambiar de funda, y es util saber cual de las dos cosas fue.
  const filas = reemplazosDeCancelados({
    tickets: [t(1, '13:00', { cancelado: true }), t(2, '13:02')],
    lineasPorTicket: {
      1: [l('I14T', 'IPHONE 14 TPU CASE')],
      2: [l('I14T', 'IPHONE 14 TPU CASE')],
    },
  })
  assert.equal(filas[0].confianza, 'probable')
  assert.ok(!/otro tipo de funda/.test(filas[0].porque), 'no cambio de tipo, no se dice que si')
})

test('el resumen separa el hecho de la sospecha', () => {
  const filas = reemplazosDeCancelados({
    tickets: [
      t(1, '10:00', { cancelado: true }), t(2, '10:02'),
      t(3, '14:00', { cancelado: true }),
      t(4, '16:00', { cancelado: true }), t(5, '16:01'),
    ],
    lineasPorTicket: {
      1: [l('A', 'IPHONE 14 TPU CASE')], 2: [l('B', 'IPHONE 14 3 IN 1')],
      3: [l('C', 'IPHONE 15 TPU CASE', 1, 300)],
      4: [l('D', 'IPHONE 16 TPU CASE')], 5: [l('E', 'GALAXY A17 TPU CASE')],
    },
  })
  const r = resumirReemplazos(filas)
  assert.equal(r.cancelados, 3)
  assert.equal(r.conReemplazoProbable, 1)
  assert.equal(r.dudosos, 1)
  assert.equal(r.sinNadaDespues, 1)
  assert.equal(r.importeSinReemplazo, 300, 'solo lo que de verdad se perdio')
})
