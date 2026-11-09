// Pruebas de la cuenta de dias.
//
// Existe por un fallo que se veia asi: el dashboard decia «el inventario de
// Leon lleva 2 dias sin actualizarse» y la pestaña de Inventarios, en la
// misma sesion, decia «Leon: ayer». Las dos leian la misma fecha.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diasDesde, hace , hoyLocal} from './fechas.js'

test('LA TRAMPA: la hora del dia NO puede cambiar la cuenta', () => {
  // `new Date('2026-11-05')` es la medianoche del 5 en UTC, que en Mexico son
  // las 18:00 del dia 4. Restando de «ahora» y redondeando hacia abajo, el
  // resultado cambiaba a lo largo del dia: a las 10:00 daba 1 y a las 21:00
  // daba 2. Acertaba por la mañana y fallaba por la tarde, que es la peor
  // forma de estar roto: nadie lo reporta porque la mitad del tiempo esta
  // bien.
  //
  // Esta prueba lo caza en cualquier huso: los dos extremos del MISMO dia
  // tienen que dar lo mismo.
  const temprano = new Date(2026, 10, 6, 0, 1)
  const tarde    = new Date(2026, 10, 6, 23, 59)
  assert.equal(diasDesde('2026-11-05', temprano), 1)
  assert.equal(diasDesde('2026-11-05', tarde), 1)
  assert.equal(diasDesde('2026-11-06', temprano), 0)
  assert.equal(diasDesde('2026-11-06', tarde), 0)
})

test('cuenta dias de calendario, no periodos de 24 horas', () => {
  const hoy = new Date(2026, 10, 6, 9, 0)
  assert.equal(diasDesde('2026-11-06', hoy), 0, 'hoy')
  assert.equal(diasDesde('2026-11-05', hoy), 1, 'ayer')
  assert.equal(diasDesde('2026-11-01', hoy), 5)
  assert.equal(diasDesde('2026-10-30', hoy), 7)
})

test('cruza el cambio de mes y de año sin despeinarse', () => {
  assert.equal(diasDesde('2026-10-31', new Date(2026, 10, 1, 12)), 1)
  assert.equal(diasDesde('2025-12-31', new Date(2026, 0, 1, 12)), 1)
})

test('acepta una marca de tiempo completa y se queda con el dia', () => {
  assert.equal(diasDesde('2026-11-05T23:50:00.000Z', new Date(2026, 10, 6, 9)), 1)
})

test('sin fecha devuelve NULL, que no es cero', () => {
  // Cero significa «hoy» y null «no se sabe». Confundirlos pinta un verde
  // donde no se sabe nada.
  assert.equal(diasDesde(null), null)
  assert.equal(diasDesde(''), null)
  assert.equal(diasDesde('no es una fecha'), null)
  assert.equal(diasDesde(undefined), null)
})

test('una fecha futura sale NEGATIVA, no recortada a cero', () => {
  // Una fecha futura es un dato roto y conviene que se note, no que se
  // disfrace de «hoy».
  assert.equal(diasDesde('2026-11-10', new Date(2026, 10, 6, 9)), -4)
})

test('el texto dice lo que se lee en pantalla', () => {
  assert.equal(hace(0), 'hoy')
  assert.equal(hace(1), 'ayer')
  assert.equal(hace(5), 'hace 5 días')
  assert.equal(hace(null), 'sin fecha')
  assert.equal(hace(-2), 'con fecha futura')
})

test('HOY ES HOY AQUI, no en UTC, y esto tumbo la pantalla de efectivo', () => {
  // El domingo 8 de noviembre de 2026 a las 18:11 de la tarde en Mexico, la
  // fecha en UTC ya era el 9 -lunes-. La pantalla de efectivo dio por
  // empezada la semana del 9 al 15, que todavia no habia pasado, y lo enseño
  // todo en ceros con la venta real escondida en el bloque anterior.
  //
  // Se construye la hora como LOCAL a proposito: es lo que ve el navegador de
  // la tienda.
  const domingoTarde = new Date(2026, 10, 8, 18, 11, 0)
  assert.equal(hoyLocal(domingoTarde), '2026-11-08')
  // Y lo que hacia antes, para que se vea la diferencia:
  assert.notEqual(domingoTarde.toISOString().slice(0, 10), '2026-11-08')

  // Por la mañana del mismo dia acertaban los dos. Por eso no se reportaba.
  const domingoManana = new Date(2026, 10, 8, 9, 0, 0)
  assert.equal(hoyLocal(domingoManana), '2026-11-08')
  assert.equal(domingoManana.toISOString().slice(0, 10), '2026-11-08')
})
