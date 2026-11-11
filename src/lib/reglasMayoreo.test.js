import { test } from 'node:test'
import assert from 'node:assert/strict'
import { incidenciasDeMayoreo, cobrosElectronicos, MOTIVOS_DE_MAYOREO } from './reglasMayoreo.js'

const T = (id, extra = {}) => ({ id, folio: String(100 + id), cuando: '2026-11-09 12:30:00.0000', cancelado: 'f', cajero: 'ana', ...extra })
const funda = (ticket, cantidad = 1, mayoreo = 'f') =>
  ({ ticket, codigo: 'I13T', producto: 'IPHONE 13 TPU CASE', depto: 'APPLE', cantidad, total: 150 * cantidad, mayoreo })
const mica = (ticket, cantidad = 1, mayoreo = 'f') =>
  ({ ticket, codigo: 'HDB', producto: 'MICA HIDROGEL HD BASICA', depto: 'HIDROGEL', cantidad, total: 60 * cantidad, mayoreo })
const sticker = (ticket, cantidad = 1, mayoreo = 'f') =>
  ({ ticket, codigo: 'SP', producto: 'STIKER PEQUEÑO', depto: 'STIKERS', cantidad, total: 9 * cantidad, mayoreo })
const pop = (ticket, cantidad = 1, mayoreo = 'f') =>
  ({ ticket, codigo: 'POP1', producto: 'POPSOCKET NEGRO', depto: 'POPSOKET', cantidad, total: 40 * cantidad, mayoreo })
const mayorista = (ticket, cantidad) =>
  ({ ticket, codigo: 'M1001', producto: 'ANA LOPEZ LEON (1001)', depto: 'MAYORISTAS', cantidad, total: 0.01 * cantidad, mayoreo: 'f' })

test('el ejemplo del dueño: dos fundas y un sticker, el mayorista tres veces, cuadra', () => {
  const r = incidenciasDeMayoreo({
    tickets: [T(1)],
    lineas: [funda(1, 2, 't'), sticker(1, 1, 't'), mayorista(1, 3)],
  })
  assert.deepEqual(r, [])
})

test('el mayorista dos veces con tres productos: no cuadra', () => {
  const [r] = incidenciasDeMayoreo({
    tickets: [T(1)],
    lineas: [funda(1, 2, 't'), sticker(1, 1, 't'), mayorista(1, 2)],
  })
  assert.deepEqual(r.motivos, ['etiquetas-no-cuadran'])
  assert.equal(r.piezas, 3)
  assert.equal(r.etiquetas, 2)
  assert.equal(r.mayorista, 'ANA LOPEZ LEON (1001)')
  assert.deepEqual(r.tipos, { fundas: 2, hidrogel: 0, stickers: 1, otros: 0 })
})

test('de más también es no cuadrar', () => {
  const [r] = incidenciasDeMayoreo({ tickets: [T(1)], lineas: [funda(1, 1, 't'), mayorista(1, 4)] })
  assert.deepEqual(r.motivos, ['etiquetas-no-cuadran'])
})

test('cuentan TODOS los productos, no sólo los tres tipos del corte', () => {
  // Una funda y un popsocket: dos productos. El mayorista una vez no basta.
  const [r] = incidenciasDeMayoreo({ tickets: [T(1)], lineas: [funda(1, 1, 't'), pop(1, 1, 't'), mayorista(1, 1)] })
  assert.deepEqual(r.motivos, ['etiquetas-no-cuadran'])
  assert.equal(r.piezas, 2)
  assert.deepEqual(incidenciasDeMayoreo({ tickets: [T(1)], lineas: [funda(1, 1, 't'), pop(1, 1, 't'), mayorista(1, 2)] }), [])
})

test('mayoreo SIN funda ni mica: stickers solos a precio de mayoreo', () => {
  const [r] = incidenciasDeMayoreo({ tickets: [T(1)], lineas: [sticker(1, 3, 't'), mayorista(1, 3)] })
  assert.deepEqual(r.motivos, ['mayoreo-sin-funda'])
})

test('con una mica de hidrogel el mayoreo sí vale', () => {
  assert.deepEqual(incidenciasDeMayoreo({ tickets: [T(1)], lineas: [mica(1, 1, 't'), sticker(1, 2, 't'), mayorista(1, 3)] }), [])
})

test('las dos reglas rotas a la vez salen las dos', () => {
  const [r] = incidenciasDeMayoreo({ tickets: [T(1)], lineas: [sticker(1, 3, 't'), mayorista(1, 1)] })
  assert.deepEqual(r.motivos, ['mayoreo-sin-funda', 'etiquetas-no-cuadran'])
  for (const m of r.motivos) assert.ok(MOTIVOS_DE_MAYOREO[m])
})

test('una venta al público sin mayorista no se mira', () => {
  assert.deepEqual(incidenciasDeMayoreo({ tickets: [T(1)], lineas: [sticker(1, 5)] }), [])
})

test('cancelados, fuera de la ventana y líneas en cero no cuentan', () => {
  const tickets = [T(1, { cancelado: 't' }), T(2, { cuando: '2026-01-01 10:00:00' }), T(3)]
  const lineas = [sticker(1, 3, 't'), sticker(2, 3, 't'), funda(3, 1, 't'), { ...sticker(3, 0, 't') }, mayorista(3, 1)]
  assert.deepEqual(incidenciasDeMayoreo({ tickets, lineas, desdeDia: '2026-11-01' }), [])
})

test('la fecha y la hora se leen del texto, sin husos horarios', () => {
  const [r] = incidenciasDeMayoreo({ tickets: [T(1, { cuando: '2026-11-09 23:58:00.0000' })], lineas: [sticker(1, 1, 't')] })
  assert.equal(r.f, '2026-11-09')
  assert.equal(r.hora, '23:58')
  assert.equal(r.folio, '101')
})

test('cobros electrónicos: sólo tarjeta, transferencia y mixto, con su referencia', () => {
  const r = cobrosElectronicos({
    tickets: [
      T(1, { formaPago: 't         ', total: '250.0000', referencia: 'BBVA aut 123456' }),
      T(2, { formaPago: 'e', total: 100 }),
      T(3, { formaPago: 's', total: 900, referencia: '' }),
      T(4, { formaPago: 'm', total: 500, referencia: 'santander 4411' }),
      T(5, { formaPago: 't', total: 80, cancelado: 't' }),
    ],
  })
  assert.deepEqual(r.map(x => x.folio), ['101', '103', '104'])
  assert.equal(r[0].forma, 't')
  assert.equal(r[0].total, 250)
  assert.equal(r[1].referencia, '', 'sin referencia se queda vacía, no se inventa')
})

// ── Tickets que pueden pagar comisión ─────────────────────────────────────
import { ticketsComisionables } from './reglasMayoreo.js'

test('comisionables: sólo cruces de tipos distintos, sin mayorista ni cancelados', () => {
  const tickets = [T(1), T(2), T(3, { cancelado: 't' }), T(4), T(5)]
  const lineas = [
    { ...funda(1, 1), total: 250 }, { ...mica(1, 1), total: 150 },           // cruce: entra
    { ...funda(2, 2), total: 600 },                                           // dos fundas: no
    { ...funda(3, 1), total: 250 }, { ...mica(3, 1), total: 150 },           // cancelado
    { ...funda(4, 1), total: 250 }, { ...mica(4, 1), total: 150 }, mayorista(4, 2), // mayorista
    { ...funda(5, 1), total: 250 }, { ...sticker(5, 1), total: 9 },          // sticker de $9: bajo el piso
  ]
  const r = ticketsComisionables({ tickets, lineas })
  assert.deepEqual(r.map(t => t.id), ['1'])
  assert.deepEqual(r[0].lineas.map(l => [l.tipo, l.precio]), [['funda', 250], ['hidrogel', 150]])
  assert.equal(r[0].cajero, 'ana')
})

test('comisionables: el precio es por pieza, y una línea a mayoreo no hace cruce', () => {
  const r = ticketsComisionables({ tickets: [T(1), T(2)], lineas: [
    { ...funda(1, 2), total: 500 }, { ...mica(1, 1), total: 150 },
    { ...funda(2, 1), total: 250 }, { ...mica(2, 1, 't'), total: 150 },
  ] })
  assert.deepEqual(r.map(t => t.id), ['1'])
  assert.equal(r[0].lineas[0].precio, 250)
})
