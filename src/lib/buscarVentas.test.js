// Pruebas de la búsqueda por código en la sección de ventas.
//
// Lo que fijan es la misma regla que `buscar.test.js` fija para inventarios,
// que allí se rompió tres veces: la pastilla puesta en la pantalla no puede
// hacer que un modelo que existe desaparezca. Aquí hay dos pastillas —la
// plaza y el rango— y por eso la ficha se arma con todas las plazas y con el
// archivo por mes entero.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modelosQueCoinciden, fichaDeVentas, catalogoDeVentas } from './buscarVentas.js'

const HOY = new Date('2026-10-28T12:00:00Z')

const PLAZAS = [
  { slug: 'leon',           nombre: 'León' },
  { slug: 'san-luis',       nombre: 'San Luis Potosí' },
  { slug: 'aguascalientes', nombre: 'Aguascalientes' },
]

// León movió el A07 y la mica; San Luis no movió nada de los dos; a
// Aguascalientes todavía no se le publica archivo. El MU es una mica y el
// MULTIUSO está para que buscar «MU» no lo ponga delante del código MU.
const DATOS = {
  leon: {
    est: {
      catalogo: { SGA07T: 'SAMSUNG A07 TPU CASE', MU: 'MICA UV', MULTI: 'MULTIUSO CARGADOR' },
      dias: [
        { f: '2026-10-20', m: { SGA07T: 4, MULTI: 9 } },
        { f: '2026-10-26', m: { SGA07T: 3, MU: 2, MULTI: 9 } },
      ],
    },
    hist: {
      catalogo: { SGA07T: 'SAMSUNG A07 TPU CASE', HP20LT: 'HUAWEI P20 LITE TPU CASE' },
      periodos: [
        { p: '2026-07', m: { HP20LT: 12 } },
        { p: '2026-09', m: { SGA07T: 20 } },
        { p: '2026-10', m: { SGA07T: 7, MU: 2 } },
      ],
    },
  },
  'san-luis': {
    est: {
      catalogo: { SGA07T: 'SAMSUNG A07 TPU CASE' },
      dias: [{ f: '2026-10-26', m: { MULTI: 1 } }],
    },
    hist: { catalogo: {}, periodos: [{ p: '2026-10', m: { MULTI: 1 } }] },
  },
  aguascalientes: { est: null, hist: null },
}

const claves = filas => filas.map(f => f.clave)

test('el catálogo junta el detalle diario y el archivo por mes', () => {
  // El HP20LT sólo está en el archivo: el diario se recorta a 60 días. Si el
  // catálogo saliera nada más del diario, un modelo parado desde julio no se
  // podría ni buscar, que es cuando más hace falta.
  const cat = catalogoDeVentas(DATOS)
  assert.ok(cat.HP20LT, 'un modelo que sólo está en el archivo tiene que poder buscarse')
  assert.equal(cat.SGA07T, 'SAMSUNG A07 TPU CASE')
})

test('el código escrito tal cual va en el primer renglón', () => {
  // MULTIUSO movió 19 piezas y la mica 2. Ordenando por piezas, buscar «MU»
  // enterraba el código MU debajo de un nombre que lo lleva en medio.
  const filas = modelosQueCoinciden({ porSucursal: DATOS, consulta: 'MU', hoy: HOY })
  assert.equal(filas[0].clave, 'MU')
  assert.ok(claves(filas).includes('MULTI'), 'el otro sigue saliendo, sólo detrás')
})

test('buscar encuentra el código aunque la plaza puesta no lo haya movido', () => {
  // La regla: la ficha se arma con TODAS las plazas. Mirando San Luis, que no
  // movió ninguno, el A07 tiene que seguir apareciendo con lo de León.
  const f = fichaDeVentas({ porSucursal: DATOS, clave: 'SGA07T', plazas: PLAZAS, rango: 30, hoy: HOY })
  assert.equal(f.total, 7)
  assert.deepEqual(
    f.plazas.map(p => [p.slug, p.salidas]),
    [['leon', 7], ['san-luis', 0], ['aguascalientes', 0]],
  )
})

test('una plaza sin archivo publicado se marca, no se cuenta como cero vendido', () => {
  const f = fichaDeVentas({ porSucursal: DATOS, clave: 'SGA07T', plazas: PLAZAS, rango: 30, hoy: HOY })
  assert.equal(f.plazas.find(p => p.slug === 'aguascalientes').sinDato, true)
  assert.equal(f.plazas.find(p => p.slug === 'san-luis').sinDato, false)
})

test('un código que existe y no se movió no es «no encontrado»', () => {
  // El HP20LT no tiene un solo día en el detalle diario. La ficha sale igual,
  // con cero piezas y sin puesto, y con sus meses: eso es el dato.
  const filas = modelosQueCoinciden({ porSucursal: DATOS, consulta: 'p20 lite', hoy: HOY })
  assert.deepEqual(claves(filas), ['HP20LT'])

  const f = fichaDeVentas({ porSucursal: DATOS, clave: 'HP20LT', plazas: PLAZAS, rango: 30, hoy: HOY })
  assert.equal(f.total, 0)
  assert.equal(f.lugar, null, 'sin salidas no se le inventa un puesto')
  assert.equal(f.ultimo, null)
  assert.equal(f.meses.find(m => m.periodo === '2026-07').salidas, 12)
})

test('el rango no decide si el modelo aparece, sólo qué gráfica se dibuja', () => {
  // A 7 días el A07 sólo tiene el 26 de octubre: 3 piezas. A 30, las 7. En
  // los dos casos la ficha existe y los meses son los mismos.
  const corta = fichaDeVentas({ porSucursal: DATOS, clave: 'SGA07T', plazas: PLAZAS, rango: 7, hoy: HOY })
  const larga = fichaDeVentas({ porSucursal: DATOS, clave: 'SGA07T', plazas: PLAZAS, rango: 30, hoy: HOY })
  assert.equal(corta.total, 3)
  assert.equal(larga.total, 7)
  assert.equal(corta.serie.length, 7)
  assert.equal(larga.serie.length, 30)
  assert.deepEqual(corta.meses, larga.meses)
})

test('la serie trae un día por cada día del rango, con ceros', () => {
  const f = fichaDeVentas({ porSucursal: DATOS, clave: 'SGA07T', plazas: PLAZAS, rango: 30, hoy: HOY })
  assert.equal(f.serie.length, 30)
  assert.equal(f.serie[f.serie.length - 1].fecha, '2026-10-28')
  assert.equal(f.serie.find(d => d.fecha === '2026-10-26').salidas, 3)
  assert.equal(f.serie.find(d => d.fecha === '2026-10-27').salidas, 0)
  assert.equal(f.ultimo, '2026-10-26')
})

test('el puesto se cuenta entre todos los modelos del rango', () => {
  // MULTIUSO 19, A07 7, mica 2: el A07 va segundo de tres.
  const f = fichaDeVentas({ porSucursal: DATOS, clave: 'SGA07T', plazas: PLAZAS, rango: 30, hoy: HOY })
  assert.equal(f.lugar, 2)
  assert.equal(f.deCuantos, 3)
})

test('los meses llevan cero donde el modelo no se movió', () => {
  // Un cero entre dos meses con venta es lo que hay que ver: el A07 no
  // existía en julio y sí en septiembre y octubre.
  const f = fichaDeVentas({ porSucursal: DATOS, clave: 'SGA07T', plazas: PLAZAS, rango: 30, hoy: HOY })
  assert.deepEqual(f.meses, [
    { periodo: '2026-07', salidas: 0 },
    { periodo: '2026-09', salidas: 20 },
    { periodo: '2026-10', salidas: 7 },
  ])
})

test('sin nada escrito no hay coincidencias', () => {
  assert.deepEqual(modelosQueCoinciden({ porSucursal: DATOS, consulta: '', hoy: HOY }), [])
  assert.deepEqual(modelosQueCoinciden({ porSucursal: DATOS, consulta: '   ', hoy: HOY }), [])
  assert.equal(fichaDeVentas({ porSucursal: DATOS, clave: null, plazas: PLAZAS }), null)
})
