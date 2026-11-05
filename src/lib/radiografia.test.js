// Pruebas de la radiografía de la venta.
//
// Lo que fijan, sobre todo, es que ningún número se invente: sin costo no hay
// margen, sin base previa no hay porcentaje, y el puente de variación tiene
// que sumar exacto o no explica nada.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  salidasEntre, pesosDe, pesoPorDiaSemana, proyeccionDelMes, puenteDeVariacion,
  momentum, brechas, costoPorModelo, rentabilidad, capitalParado,
} from './radiografia.js'

const HOY = new Date('2026-11-20T12:00:00Z')

const PRECIOS = {
  X: { codigo: 'X', promedio: 100 },
  Y: { codigo: 'Y', promedio: 50 },
  Z: { codigo: 'Z', promedio: 200 },
}

/** Detalle diario: `n` piezas de `cod` cada día entre dos fechas hacia atrás. */
function diario(tramos) {
  const dias = []
  for (const [desde, hasta, m] of tramos) {
    for (let i = desde; i <= hasta; i++) {
      const f = new Date(HOY)
      f.setDate(f.getDate() - i)
      dias.push({ f: f.toISOString().slice(0, 10), m })
    }
  }
  return { dias: dias.sort((a, b) => a.f.localeCompare(b.f)) }
}

test('las salidas de un tramo se suman por código', () => {
  const est = diario([[0, 2, { X: 2, Y: 1 }]])
  const s = salidasEntre(est, '2026-11-18', '2026-11-20')
  assert.deepEqual(s, { X: 6, Y: 3 })
  assert.equal(pesosDe(s, PRECIOS), 750)
})

test('con poco historial los pesos del día de la semana valen uno', () => {
  // Inventar una curva semanal con cuatro días es peor que no tenerla.
  const est = diario([[0, 3, { X: 1 }]])
  assert.deepEqual(pesoPorDiaSemana(est, HOY), [1, 1, 1, 1, 1, 1, 1])
})

test('la proyección usa el ritmo de las últimas cuatro semanas', () => {
  // 2 piezas diarias durante 60 días: el mes cierra cerca de 2 × los días.
  const est = diario([[0, 59, { X: 2 }]])
  const p = proyeccionDelMes({ est, precios: PRECIOS, hoy: HOY })
  assert.equal(p.mes, '2026-11')
  assert.equal(p.acumulado, 40)             // del 1 al 20 de noviembre
  assert.equal(Math.round(p.ritmo), 2)
  assert.equal(p.diasQueFaltan, 10)
  assert.ok(p.proyectado >= 58 && p.proyectado <= 62, `proyectó ${p.proyectado}`)
  assert.equal(p.acumuladoPesos, 4000)
})

test('sin un solo día medido no hay proyección inventada', () => {
  assert.equal(proyeccionDelMes({ est: { dias: [] }, hoy: HOY }), null)
})

test('el puente de variación suma exacto', () => {
  const ahora = { X: 10, Y: 4 }          // 1000 + 200 = 1200
  const antes = { X: 6, Z: 1 }           //  600 + 200 =  800
  const p = puenteDeVariacion({ ahora, antes, precios: PRECIOS })

  assert.equal(p.pesosAhora, 1200)
  assert.equal(p.pesosAntes, 800)
  assert.equal(p.total, 400)
  // X estaba en los dos periodos: sus 4 piezas de más son volumen.
  assert.equal(p.volumen, 400)
  // Y entró e Z salió: eso es mezcla, y se compensa.
  assert.equal(p.mezcla, 0)
  assert.equal(p.volumen + p.mezcla, p.total, 'el puente tiene que cuadrar')
  // No hay componente de precio: sólo se guarda el de hoy, no el de cuando
  // se vendió. Un renglón calculado como resto daría cero siempre.
  assert.equal(p.precio, undefined)
})

test('momentum separa lo que acelera de lo que frena, y lo valora', () => {
  const est = diario([
    [0, 27, { X: 3 }],     // últimas cuatro semanas
    [28, 55, { X: 1, Y: 2 }],
  ])
  const { acelerando, frenando } = momentum({ est, precios: PRECIOS, hoy: HOY })

  const x = acelerando.find(f => f.codigo === 'X')
  assert.equal(x.ahora, 84)
  assert.equal(x.antes, 28)
  assert.equal(x.pct, 200)
  assert.equal(x.pesos, 5600)

  const y = frenando.find(f => f.codigo === 'Y')
  assert.equal(y.ahora, 0)
  assert.equal(y.pct, -100)
  // Lo que frena vale pesos NEGATIVOS. Valorándolo con `valorDe` salía cero
  // -esa función ignora las cantidades negativas- y la mitad de la pantalla
  // se quedaba muda justo en lo que hay que dejar de comprar.
  assert.equal(y.pesos, -56 * 50)
})

test('el ruido de la cola larga no entra en momentum', () => {
  // Pasar de una pieza a dos no es una tendencia.
  const est = diario([[0, 0, { X: 1 }], [30, 30, { X: 1 }]])
  const { acelerando, frenando } = momentum({ est, precios: PRECIOS, hoy: HOY })
  assert.equal(acelerando.length + frenando.length, 0)
})

test('una brecha distingue «lo tiene parado» de «ni lo maneja»', () => {
  const plazas = [{ slug: 'leon', nombre: 'León' }, { slug: 'slp', nombre: 'San Luis' }]
  const filas = brechas({
    plazas,
    ritmoPorPlaza: { leon: { X: 1, Y: 1 }, slp: { X: 0, Y: 0 } },
    inventarios: {
      leon: { productos: [{ Codigo: 'X', Existencia: 5 }, { Codigo: 'Y', Existencia: 5 }] },
      slp:  { productos: [{ Codigo: 'X', Existencia: 8 }] },   // tiene X, no tiene Y
    },
    precios: PRECIOS,
  })

  const x = filas.find(f => f.codigo === 'X')
  const y = filas.find(f => f.codigo === 'Y')
  assert.equal(x.caso, 'parado', 'San Luis tiene ocho y no vende ninguna')
  assert.equal(y.caso, 'no tiene')
  assert.equal(x.pesosAlMes, 3000)      // 1/día × 30 × $100
})

test('sin costo no se inventa margen', () => {
  const costos = costoPorModelo({
    leon: { productos: [{ Codigo: 'X', Costo: 40 }] },
    // Bodega queda fuera aunque traiga costo: ahí no se mantienen.
    bodega: { productos: [{ Codigo: 'X', Costo: 5 }, { Codigo: 'Y', Costo: 5 }] },
  })
  assert.equal(costos.X, 40)
  assert.equal(costos.Y, undefined)

  const r = rentabilidad({ salidas: { X: 10, Y: 10 }, precios: PRECIOS, costos })
  assert.equal(r.filas.length, 1, 'Y no entra: no hay con qué calcular su margen')
  assert.equal(r.sinCosto, 1)
  assert.equal(r.filas[0].utilidad, 600)
  assert.equal(Number(r.filas[0].margen.toFixed(2)), 0.6)
})

test('el Pareto dice cuántos modelos hacen el 80% de la utilidad', () => {
  const precios = { A: { promedio: 100 }, B: { promedio: 100 }, C: { promedio: 100 } }
  const costos = { A: 0, B: 0, C: 0 }
  // 80, 15 y 5 de utilidad: el primero solo ya hace el 80%.
  const r = rentabilidad({ salidas: { A: 80, B: 15, C: 5 }, precios, costos })
  assert.equal(r.cuantosHacenEl80, 1)
  assert.equal(r.total, 10000)
})

test('el capital parado se valora a costo y sólo cuenta lo que lleva tiempo quieto', () => {
  const { filas, pesos } = capitalParado({
    inventarios: { leon: { productos: [
      { Codigo: 'X', Existencia: 10, Producto: 'VIEJO' },
      { Codigo: 'Y', Existencia: 10, Producto: 'SE VENDE' },
    ] } },
    diasSinVender: { X: 200, Y: 10 },
    costos: { X: 55, Y: 55 },
    desde: 90,
  })
  assert.equal(filas.length, 1)
  assert.equal(filas[0].codigo, 'X')
  assert.equal(pesos, 550)
})
