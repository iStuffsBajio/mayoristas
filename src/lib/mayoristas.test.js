import test from 'node:test'
import assert from 'node:assert/strict'
import {
  rankingDeMayoristas, rankingPorPlaza, rangoValido, DIAS_MINIMOS, DIAS_MAXIMOS, RANGOS_DE_MAYORISTAS,
} from './mayoristas.js'

const HOY = '2026-11-09'
const fila = (f, quien, tickets, piezas, dinero) => ({ f, quien, tickets, piezas, dinero })

test('EL RANGO VA DE 7 A 30 DÍAS, pidan lo que pidan', () => {
  assert.equal(DIAS_MINIMOS, 7)
  assert.equal(DIAS_MAXIMOS, 30)
  assert.equal(rangoValido(1), 7)
  assert.equal(rangoValido(0), 7)
  assert.equal(rangoValido(null), 7)
  assert.equal(rangoValido('abc'), 7)
  assert.equal(rangoValido(14), 14)
  assert.equal(rangoValido(30), 30)
  assert.equal(rangoValido(31), 30)
  assert.equal(rangoValido(365), 30)
  assert.ok(RANGOS_DE_MAYORISTAS.every(r => r >= 7 && r <= 30))
})

test('el acumulado de cada mayorista, del más al menos activo', () => {
  const r = rankingDeMayoristas({
    hoy: HOY, dias: 7,
    porDia: [
      fila('2026-11-03', 'LOCAL 12', 1, 10, 800),
      fila('2026-11-05', 'LOCAL 12', 2, 20, 1200),
      fila('2026-11-06', 'LOCAL 5', 1, 50, 5000),
      fila('2026-11-08', 'LOCAL 9', 1, 3, 300),
    ],
  })
  assert.deepEqual(r.lista.map(f => [f.quien, f.puesto, f.tickets, f.piezas, f.dinero]), [
    ['LOCAL 5', 1, 1, 50, 5000],
    ['LOCAL 12', 2, 3, 30, 2000],
    ['LOCAL 9', 3, 1, 3, 300],
  ])
  assert.equal(r.masActivo.quien, 'LOCAL 5')
  assert.equal(r.menosActivo.quien, 'LOCAL 9')
  assert.equal(r.total.clientes, 3)
  assert.equal(r.total.dinero, 7300)
})

test('un empate de dinero lo desempatan las piezas, y luego las visitas', () => {
  const r = rankingDeMayoristas({
    hoy: HOY, dias: 7,
    porDia: [fila('2026-11-08', 'A', 5, 10, 1000), fila('2026-11-08', 'B', 1, 40, 1000), fila('2026-11-08', 'C', 3, 40, 1000)],
  })
  assert.deepEqual(r.lista.map(f => f.quien), ['C', 'B', 'A'])
})

test('SÓLO CUENTA EL RANGO: lo de antes y lo de «mañana» quedan fuera', () => {
  const porDia = [
    fila('2026-11-02', 'VIEJO', 1, 1, 100),     // 8 días antes de hoy: fuera de 7
    fila('2026-11-03', 'JUSTO', 1, 1, 100),     // el primer día de la ventana
    fila('2026-11-09', 'HOY', 1, 1, 100),
    fila('2026-11-10', 'FUTURO', 1, 1, 100),    // un dato que no debería existir
  ]
  const r7 = rankingDeMayoristas({ hoy: HOY, dias: 7, porDia })
  assert.deepEqual(r7.lista.map(f => f.quien).sort(), ['HOY', 'JUSTO'])
  assert.equal(r7.desde, '2026-11-03')
  const r30 = rankingDeMayoristas({ hoy: HOY, dias: 30, porDia })
  assert.deepEqual(r30.lista.map(f => f.quien).sort(), ['HOY', 'JUSTO', 'VIEJO'])
  // Pedir más de 30 no da más de 30.
  assert.equal(rankingDeMayoristas({ hoy: HOY, dias: 400, porDia }).dias, 30)
})

test('EL MENOS ACTIVO es el menos activo de los que compraron: los que no, van aparte', () => {
  const r = rankingDeMayoristas({
    hoy: HOY, dias: 7,
    porDia: [fila('2026-11-08', 'ACTIVO', 3, 30, 3000), fila('2026-11-08', 'POCO', 1, 1, 50)],
    conocidos: [
      { quien: 'ACTIVO', tickets: 90, ultima: '2026-11-08' },
      { quien: 'POCO', tickets: 20, ultima: '2026-11-08' },
      { quien: 'DEJO DE VENIR', tickets: 40, ultima: '2026-10-20' },
      { quien: 'HACE AÑOS', tickets: 5, ultima: '2024-01-10' },
      { quien: 'SIN FECHA', tickets: 1, ultima: null },
    ],
  })
  assert.equal(r.menosActivo.quien, 'POCO', 'no es el que no compró nada')
  assert.deepEqual(r.sinCompras.map(c => c.quien), ['DEJO DE VENIR', 'HACE AÑOS', 'SIN FECHA'])
  assert.equal(r.sinCompras[0].ultima, '2026-10-20', 'con su última visita: es lo que se lee')
})

test('con un solo cliente no hay «menos activo»: sería el mismo', () => {
  const r = rankingDeMayoristas({ hoy: HOY, dias: 7, porDia: [fila('2026-11-08', 'UNO', 1, 1, 10)] })
  assert.equal(r.masActivo.quien, 'UNO')
  assert.equal(r.menosActivo, null)
})

test('sin datos no revienta ni inventa a nadie', () => {
  for (const args of [undefined, {}, { hoy: HOY }, { hoy: HOY, porDia: null, conocidos: null }]) {
    const r = rankingDeMayoristas(args)
    assert.deepEqual(r.lista, [])
    assert.equal(r.masActivo, null)
    assert.equal(r.menosActivo, null)
    assert.equal(r.total.dinero, 0)
  }
  // Un renglón sin nombre no es un cliente.
  assert.equal(rankingDeMayoristas({ hoy: HOY, porDia: [fila('2026-11-08', '  ', 1, 1, 1)] }).lista.length, 0)
})

test('en la vista del administrador cada plaza lleva su ranking, sin mezclarse', () => {
  // El mismo nombre en dos plazas no es el mismo cliente: el nombre lleva el
  // local.
  const r = rankingPorPlaza({
    hoy: HOY, dias: 7,
    plazas: {
      leon: { porDia: [fila('2026-11-08', 'LOCAL 1', 1, 5, 500)] },
      'san-luis': { porDia: [fila('2026-11-08', 'LOCAL 1', 1, 9, 900)], conocidos: [{ quien: 'OTRO', ultima: '2026-10-01', tickets: 3 }] },
    },
  })
  assert.equal(r.leon.total.dinero, 500)
  assert.equal(r['san-luis'].total.dinero, 900)
  assert.equal(r['san-luis'].sinCompras[0].quien, 'OTRO')
})
