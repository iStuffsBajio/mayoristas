// Pruebas del ritmo ponderado.
//
// Fijan el arreglo del fallo que contó el dueño: «se me agotan recién cuando
// surto». El surtido pedía al promedio de todo el historial, así que un
// modelo que dobla su venta se repone al ritmo viejo y se vacía enseguida.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ritmoPonderado, ritmoDeLaRed, VENTANAS } from './ritmo.js'

const HOY = new Date('2026-11-05T12:00:00Z')

/** Un detalle diario con `n` piezas del código `cod` cada día del tramo. */
function diario(cod, tramos) {
  const dias = []
  for (const [desde, hasta, n] of tramos) {
    for (let i = desde; i <= hasta; i++) {
      const f = new Date(HOY)
      f.setDate(f.getDate() - i)
      dias.push({ f: f.toISOString().slice(0, 10), m: { [cod]: n } })
    }
  }
  return { dias: dias.sort((a, b) => a.f.localeCompare(b.f)) }
}

test('los pesos son los que pidió el dueño y suman uno', () => {
  assert.deepEqual(VENTANAS.map(v => v.peso), [0.5, 0.3, 0.2])
  assert.equal(VENTANAS.reduce((a, v) => a + v.peso, 0), 1)
})

test('lo de ahora pesa más que lo viejo', () => {
  // Se vendía 1 al día y ahora van 3. El plano daría 2; el ponderado tiene
  // que acercarse a 3, que es lo que de verdad está saliendo.
  const est = diario('X', [[0, 27, 3], [28, 55, 1], [56, 83, 1]])
  const { tasa } = ritmoPonderado({ est, hist: null, hoy: HOY })
  assert.equal(Number(tasa.X.toFixed(2)), 2.0)   // 0.5*3 + 0.3*1 + 0.2*1

  const plano = (3 * 28 + 1 * 28 + 1 * 28) / 84
  assert.ok(tasa.X > plano, 'el ponderado tiene que ir por encima del promedio plano')
})

test('lo que se frenó pesa menos, y no se sigue pidiendo igual', () => {
  // Vendía 4 y ahora vende 1: el plano seguiría pidiendo para 3.
  const est = diario('X', [[0, 27, 1], [28, 55, 4], [56, 83, 4]])
  const { tasa } = ritmoPonderado({ est, hist: null, hoy: HOY })
  assert.equal(Number(tasa.X.toFixed(2)), 2.5)   // 0.5*1 + 0.3*4 + 0.2*4
  assert.ok(tasa.X < 3, 'tiene que quedar por debajo del promedio plano')
})

test('una ventana sin dato reparte su peso, no cuenta como cero', () => {
  // Tres semanas de historia y nada más. El ritmo es el de esas tres semanas:
  // diluirlo entre ventanas que nadie midió hundiría el surtido de todo lo
  // que acaba de entrar al catálogo.
  const est = diario('X', [[0, 20, 2]])
  const { tasa, tramos } = ritmoPonderado({ est, hist: null, hoy: HOY })
  assert.equal(Number(tasa.X.toFixed(2)), 2)
  assert.equal(tramos[1].dias, 0)
  assert.equal(tramos[2].dias, 0)
})

test('la ventana que no cabe en el diario sale del acumulado por mes', () => {
  // El detalle diario guarda 60 días; la tercera ventana llega a 84.
  const est = diario('X', [[0, 55, 1]])
  const hist = {
    periodos: [
      // Agosto queda dentro del tramo de los días 56 a 83 contados desde el
      // 5 de noviembre.
      { p: '2026-08', m: { X: 62 }, origen: 'eleventa', diasCubiertos: 31 },
    ],
  }
  const { tasa, tramos } = ritmoPonderado({ est, hist, hoy: HOY })
  assert.equal(tramos[2].fuente, 'mensual')
  assert.ok(tramos[2].dias > 0, 'el mes tiene que aportar días medidos')
  assert.ok(tasa.X > 1, 'agosto vendía al doble, así que sube el ritmo')
})

test('un mes a medias se divide entre los días medidos, no entre el calendario', () => {
  // Es la misma trampa que ya costó una vez: dividir entre 61 días fijos
  // subestimaba el ritmo a la mitad.
  const hist = {
    periodos: [{ p: '2026-08', m: { X: 30 }, dias: ['2026-08-01', '2026-08-02', '2026-08-03'] }],
  }
  const { tasa } = ritmoPonderado({ est: null, hist, hoy: HOY })
  // 30 piezas en 3 días medidos son 10 al día, no 30/31.
  assert.ok(tasa.X > 5, `salió ${tasa.X}, se esperaba un ritmo alto`)
})

test('sin ningún dato el ritmo es vacío, no cero inventado', () => {
  const { tasa, dias } = ritmoPonderado({ est: null, hist: null, hoy: HOY })
  assert.deepEqual(tasa, {})
  assert.equal(dias, 0)
})

test('la red suma los ritmos de cada plaza, no sus piezas', () => {
  // Cada plaza lleva medidos distintos días: juntar piezas y dividir entre el
  // calendario más largo castiga a la que lleva menos tiempo midiendo.
  const a = { est: diario('X', [[0, 27, 2]]), hist: null }
  const b = { est: diario('X', [[0, 6, 4]]),  hist: null }
  const { tasa } = ritmoDeLaRed([a, b], HOY)
  assert.equal(Number(tasa.X.toFixed(2)), 6)
})
