import test from 'node:test'
import assert from 'node:assert/strict'
import { diasEnCero, lecturaDeVenta, censuraEn, DIAS_AGOTADOS, PARTE_QUE_CENSURA } from './agotados.js'

const VENTANA = { desde: '2026-10-01 00:00', hasta: '2026-10-31 00:00' }   // 30 dias

test('LA EXISTENCIA ENTRE DOS MOVIMIENTOS es la «anterior» del siguiente', () => {
  // INVENTARIO_HISTORIAL no tiene «existencia despues», y deducirla obliga a
  // saber si cada movimiento suma o resta. Con la «anterior» del siguiente no
  // hace falta adivinar ningun signo.
  //
  // Aqui: tenia 2, el dia 11 se vende y queda en 0 (la anterior del dia 21
  // es 0), el dia 21 llega la caja, y hoy tiene 5. En cero del 11 al 21.
  const r = diasEnCero({
    ...VENTANA,
    movimientos: [
      { codigo: 'HX8DT', cuando: '2026-10-11 00:00', anterior: 2 },
      { codigo: 'HX8DT', cuando: '2026-10-21 00:00', anterior: 0 },
    ],
    existenciaHoy: { HX8DT: 5 },
  })
  assert.equal(r.HX8DT.diasEnCero, 10)
  assert.equal(r.HX8DT.diasMedidos, 30)
})

test('sin movimientos en la ventana, vale lo de hoy para todo el periodo', () => {
  // Si nada se movio, la existencia no cambio. Con cero hoy, estuvo en cero
  // todo el tiempo; con mercancia, nunca.
  const r = diasEnCero({ ...VENTANA, movimientos: [], existenciaHoy: { VACIO: 0, LLENO: 7 } })
  assert.equal(r.VACIO.diasEnCero, 30)
  assert.equal(r.LLENO.diasEnCero, 0)
})

test('UN MODELO NUEVO se cuenta desde que llego, no desde el principio', () => {
  // Antes de llegar su existencia era cero porque no existia, no porque se
  // agotara. Contado desde el principio de la ventana, cada novedad saldria
  // «agotada» casi todo el tiempo y la lista se llenaria de falsos avisos.
  const r = diasEnCero({
    ...VENTANA,
    movimientos: [{ codigo: 'NUEVO', cuando: '2026-10-21 00:00', anterior: 0 }],
    existenciaHoy: { NUEVO: 10 },
    altas: { NUEVO: '2026-10-21' },
  })
  assert.equal(r.NUEVO.diasEnCero, 0, 'llego con mercancia y la sigue teniendo')
  assert.equal(r.NUEVO.diasMedidos, 10, 'solo cuenta los dias que existe')
})

test('un modelo viejo con alta antigua no cambia por tener alta', () => {
  const r = diasEnCero({
    ...VENTANA, movimientos: [], existenciaHoy: { VIEJO: 0 }, altas: { VIEJO: '2024-01-01' },
  })
  assert.equal(r.VIEJO.diasMedidos, 30)
  assert.equal(r.VIEJO.diasEnCero, 30)
})

test('los movimientos fuera de la ventana no cuentan', () => {
  const r = diasEnCero({
    ...VENTANA,
    movimientos: [{ codigo: 'A', cuando: '2026-09-15 00:00', anterior: 0 }],
    existenciaHoy: { A: 3 },
  })
  assert.equal(r.A.diasEnCero, 0)
})

test('el codigo se compara sin mirar mayusculas ni espacios', () => {
  const r = diasEnCero({
    ...VENTANA,
    movimientos: [{ codigo: ' hx8dt ', cuando: '2026-10-16 00:00', anterior: 0 }],
    existenciaHoy: { HX8DT: 4 },
  })
  assert.equal(r.HX8DT.diasEnCero, 15)
  assert.equal(Object.keys(r).length, 1, 'el mismo codigo no sale dos veces')
})

// ── La lectura ──────────────────────────────────────────────────────────

test('LA PREGUNTA DEL DUEÑO: con mercancia todo el tiempo, la venta es de fiar', () => {
  // Es el caso del X8D en Aguascalientes: 5 en el mostrador y ni una venta.
  // Eso no es falta de mercancia, es falta de demanda, y se dice.
  const l = lecturaDeVenta({ vendidas: 0, agotado: { diasEnCero: 0, diasMedidos: 90, parte: 0 } })
  assert.equal(l.censurada, false)
  assert.match(l.texto, /de fiar/)
})

test('MUCHO TIEMPO EN CERO: la venta se queda corta, y se estima cuanto', () => {
  // Agotado 45 de 90 dias y vendio 6 en los 45 que tuvo: al mismo ritmo
  // habria vendido 12. El 6 haria pedir la mitad de lo que se pide.
  const l = lecturaDeVenta({ vendidas: 6, agotado: { diasEnCero: 45, diasMedidos: 90, parte: 0.5 } })
  assert.equal(l.censurada, true)
  assert.equal(l.estimado, 12)
  assert.match(l.texto, /habría rondado 12, no 6/)
})

test('SIN LAS VENTAS DEL MISMO PERIODO se dice el hecho y no se estima', () => {
  // La ficha mira 30 o 60 dias y esto mide 90: estimar mezclando las dos
  // ventanas daria un numero con cara de cuenta que no lo es.
  const l = lecturaDeVenta({ agotado: { diasEnCero: 45, diasMedidos: 90, parte: 0.5 } })
  assert.equal(l.censurada, true)
  assert.equal(l.estimado, null)
  assert.match(l.texto, /45 de 90/)
  assert.doesNotMatch(l.texto, /rondado/)
})

test('EN CERO TODO EL PERIODO no se inventa ninguna demanda', () => {
  // No hubo con que venderlo, asi que no hay ritmo del que estimar. Cero
  // ventas aqui no dice nada, y un estimado seria un numero inventado.
  const l = lecturaDeVenta({ vendidas: 0, agotado: { diasEnCero: 90, diasMedidos: 90, parte: 1 } })
  assert.equal(l.censurada, true)
  assert.equal(l.estimado, null)
  assert.match(l.texto, /no se sabe cuánto se pide/)
})

test('un dia suelto en cero no dispara el aviso', () => {
  // Pasa siempre entre que se vacia y llega la caja. Avisar por eso llenaria
  // la lista de avisos y dejaria de leerse.
  assert.equal(PARTE_QUE_CENSURA, 0.25)
  const l = lecturaDeVenta({ vendidas: 10, agotado: { diasEnCero: 2, diasMedidos: 90, parte: 2 / 90 } })
  assert.equal(l.censurada, false)
})

test('sin dato de existencia NO se opina', () => {
  // Decir «fiable» a ciegas es justo lo que esto existe para evitar.
  assert.equal(lecturaDeVenta({ vendidas: 3, agotado: null }), null)
  assert.equal(DIAS_AGOTADOS, 90)
})

test('censuraEn: solo las plazas donde estuvo en cero lo bastante, la peor primero', () => {
  const porPlaza = {
    leon:  { porCodigo: { HX8DT: { diasEnCero: 30, diasMedidos: 90, parte: 1 / 3 } } },
    ags:   { porCodigo: { HX8DT: { diasEnCero: 1,  diasMedidos: 90, parte: 1 / 90 } } },
    slp:   { porCodigo: { HX8DT: { diasEnCero: 60, diasMedidos: 90, parte: 2 / 3 } } },
    ferias: null,
  }
  const r = censuraEn(porPlaza, ' hx8dt ')
  assert.deepEqual(r.map(x => x.slug), ['slp', 'leon'], 'ags estuvo un dia: no cuenta')
  assert.deepEqual(censuraEn(porPlaza, 'HX8DT', ['ags']), [])
  assert.deepEqual(censuraEn(null, 'HX8DT'), [], 'sin archivo no se opina')
})
