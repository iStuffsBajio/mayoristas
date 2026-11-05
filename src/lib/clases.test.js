import test from 'node:test'
import assert from 'node:assert/strict'
import {
  claseDe, ritmoPorModelo, clasePorModelo, agotadosPorUbicacion, CLASE_A, CLASE_B,
  bajarClase, ultimaVentaPorModelo, diasDesdeElMes, ESCALONES_SIN_VENDER,
} from './clases.js'

test('los cortes de clase son los medidos sobre el catálogo propio', () => {
  // Si alguien los sube a los números de manual -20 y 5- todo el catálogo
  // cae en C: el modelo más vendido de la casa hace 22 piezas al mes.
  assert.equal(CLASE_A, 5)
  assert.equal(CLASE_B, 2)
})

test('claseDe reparte por ritmo, con los bordes incluidos', () => {
  assert.equal(claseDe(22), 'A')
  assert.equal(claseDe(5), 'A')      // el borde entra en A
  assert.equal(claseDe(4.9), 'B')
  assert.equal(claseDe(2), 'B')      // el borde entra en B
  assert.equal(claseDe(1.9), 'C')
  assert.equal(claseDe(0), 'C')
  assert.equal(claseDe(undefined), 'C')
})

test('el ritmo SUMA el de cada plaza, no divide entre el calendario más largo', () => {
  // Dos plazas con el mismo modelo: una lleva 30 días medidos y la otra 90.
  // Sumar piezas (3 + 9 = 12) y dividir entre 90 daría 4 pz/mes y lo
  // dejaría en clase B. Sumando ritmos son 3 + 3 = 6 y es clase A.
  const historiales = [
    { periodos: [{ p: '2026-09', m: { ABC: 3 }, diasCubiertos: 30 }] },
    { periodos: [{ p: '2026-09', m: { ABC: 9 }, diasCubiertos: 90 }] },
  ]
  const ritmo = ritmoPorModelo(historiales)
  assert.equal(Math.round(ritmo.ABC), 6)
  assert.equal(clasePorModelo(historiales).ABC, 'A')
})

test('un historial vacío o nulo no rompe ni inventa ritmo', () => {
  assert.deepEqual(ritmoPorModelo(null), {})
  assert.deepEqual(ritmoPorModelo([null, undefined]), {})
  assert.deepEqual(ritmoPorModelo([{ periodos: [] }]), {})
  // Sin días medidos no se divide entre cero.
  assert.deepEqual(ritmoPorModelo([{ periodos: [{ m: { X: 5 }, diasCubiertos: 0 }] }]), {})
})

test('cuenta los agotados por ubicación y por clase', () => {
  const filas = [
    { codigo: 'A1', producto: 'Rápido',  enCero: ['leon', 'torreon'] },
    { codigo: 'B1', producto: 'Medio',   enCero: ['leon'] },
    { codigo: 'C1', producto: 'Lento',   enCero: ['leon'] },
    { codigo: 'A1', producto: 'Rápido',  enCero: ['ferias'] },   // fuera de la lista
  ]
  const clases = { A1: 'A', B1: 'B', C1: 'C' }
  const ubicaciones = [{ slug: 'leon', nombre: 'León' }, { slug: 'torreon', nombre: 'Torreón' }]

  const r = agotadosPorUbicacion(filas, clases, ubicaciones)
  const leon = r.find(x => x.slug === 'leon')

  assert.equal(leon.A, 1)
  assert.equal(leon.B, 1)
  assert.equal(leon.C, 1)
  assert.equal(leon.total, 3)
  assert.equal(r.find(x => x.slug === 'torreon').total, 1)
  // Ferias no está en la lista, así que no aparece ni suma en ningún lado.
  assert.equal(r.length, 2)
})

test('un modelo sin historial cuenta como clase C, no se pierde', () => {
  const filas = [{ codigo: 'SIN', producto: 'Sin venta', enCero: ['leon'] }]
  const r = agotadosPorUbicacion(filas, {}, [{ slug: 'leon', nombre: 'León' }])
  assert.equal(r[0].C, 1)
  assert.equal(r[0].total, 1)
})

test('bodega se cuenta por su propio campo, no por enCero', () => {
  // `enCero` nunca trae 'bodega': analizarAgotados solo recibe inventarios de
  // tienda. Pasarla como una ubicacion mas la dejaba siempre en cero, y un
  // cero ahi se lee como «bodega tiene de todo».
  const filas = [
    { codigo: 'A1', enCero: ['leon'], existeEnBodega: true,  bodega: 0 },
    { codigo: 'B1', enCero: ['leon'], existeEnBodega: true,  bodega: 12 },
    { codigo: 'C1', enCero: ['leon'], existeEnBodega: false, bodega: 0 },
  ]
  const clases = { A1: 'A', B1: 'B', C1: 'C' }
  const r = agotadosPorUbicacion(filas, clases, [{ slug: 'leon', nombre: 'León' }], { slug: 'bodega', nombre: 'Bodega' })

  const bodega = r.find(x => x.slug === 'bodega')
  assert.equal(bodega.A, 1)      // A1 esta en cero en bodega
  assert.equal(bodega.B, 0)      // B1 tiene 12 piezas
  assert.equal(bodega.C, 0)      // C1 no es de bodega, no cuenta como agotado
  assert.equal(bodega.total, 1)
  assert.equal(r.find(x => x.slug === 'leon').total, 3)
})

test('sin bodega, la lista sale solo con las tiendas', () => {
  const r = agotadosPorUbicacion([], {}, [{ slug: 'leon', nombre: 'León' }])
  assert.equal(r.length, 1)
})

// ── La clase se oxida ────────────────────────────────────────────────────────
//
// Lo pidió el dueño: «modelos viejos o que antes eran clase A que se vayan
// recorriendo a clase B y así sucesivamente». Sin esto, un modelo que vendió
// mucho en diciembre y nada después sigue reservando sitio en bodega.

test('un modelo que sigue vendiendo no baja de clase', () => {
  const hoy = new Date('2026-11-05T12:00:00Z')
  const hist = { periodos: [
    { p: '2026-09', m: { X: 150 }, diasCubiertos: 30 },
    { p: '2026-11', m: { X: 20 },  diasCubiertos: 5 },
  ] }
  assert.equal(clasePorModelo([hist], { hoy }).X, 'A')
})

test('tres meses sin vender bajan un escalón', () => {
  const hoy = new Date('2026-11-05T12:00:00Z')
  // Vendía como clase A, pero la última venta fue en junio: más de 90 días.
  const hist = { periodos: [{ p: '2026-06', m: { X: 150 }, diasCubiertos: 30 }] }
  assert.equal(clasePorModelo([hist], { hoy }).X, 'B')
  // Y la clase cruda, sin oxidar, sigue siendo A: es la misma venta.
  assert.equal(clasePorModelo([hist], { hoy, oxidar: false }).X, 'A')
})

test('seis meses sin vender bajan dos escalones', () => {
  const hoy = new Date('2026-11-05T12:00:00Z')
  const hist = { periodos: [{ p: '2026-03', m: { X: 150 }, diasCubiertos: 30 }] }
  assert.equal(clasePorModelo([hist], { hoy }).X, 'C')
})

test('nunca se baja de C', () => {
  assert.equal(bajarClase('C', 5), 'C')
  assert.equal(bajarClase('A', 2), 'C')
  assert.equal(bajarClase('A', 0), 'A')
})

test('la última venta sale del acumulado por mes, no de un recuento', () => {
  // Dos plazas: en una vendió en marzo y en otra en octubre. Manda la más
  // reciente, porque el modelo sigue vivo en la red.
  const a = { periodos: [{ p: '2026-03', m: { X: 10 } }] }
  const b = { periodos: [{ p: '2026-10', m: { X: 2 } }] }
  assert.equal(ultimaVentaPorModelo([a, b]).X, '2026-10')
})

test('un mes con cero piezas no cuenta como venta', () => {
  const hist = { periodos: [
    { p: '2026-04', m: { X: 8 } },
    { p: '2026-10', m: { X: 0 } },
  ] }
  assert.equal(ultimaVentaPorModelo([hist]).X, '2026-04')
})

test('el mes en curso cuenta como cero días', () => {
  const hoy = new Date('2026-11-20T12:00:00Z')
  assert.equal(diasDesdeElMes('2026-11', hoy), 0)
  assert.ok(diasDesdeElMes('2026-08', hoy) > 80)
})
