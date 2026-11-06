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
  DEPTO_MAYORISTAS, DEPTO_STICKERS, precioPorPlaza, PISO_PRECIO,
  preciosDeVenta, soloPrecios, cobertura,
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

// ── El precio promedio por plaza ───────────────────────────────────────────

test('el precio promedio separa publico de mayoreo, que es para lo que se pidio', () => {
  const r = precioPorPlaza({
    I13T: { producto: 'IPHONE 13 TPU CASE', pz: 10, dinero: 1800, pzMayoreo: 6, dineroMayoreo: 900 },
  })
  const f = r.fundas
  assert.equal(f.precioPublico, 900 / 4, 'publico: 4 piezas por $900')
  assert.equal(f.precioMayoreo, 900 / 6, 'mayoreo: 6 piezas por $900')
  assert.equal(f.precioMedio, 180)
  assert.equal(f.mezclaPiezas, 0.6)
  assert.equal(f.mezclaDinero, 0.5)
  // El mayoreo sale un 33% mas barato por pieza.
  assert.ok(Math.abs(f.descuento - (1 - 150 / 225)) < 1e-9)
})

test('los stickers y las micas van APARTE, no se cuelan en el promedio', () => {
  // Es lo que pidio el dueño -«sin considerar stickers pequeños y productos
  // adicionales»- y se hace por CODIGO, con `produccion.js` y `familias.js`,
  // no con un corte de pesos: un corte de $100 por precio se lleva el 61% de
  // las piezas de Aguascalientes, fundas viejas baratas incluidas, y deja
  // dentro el hidrogel de privacidad a $109.
  const r = precioPorPlaza({
    I13T: { producto: 'IPHONE 13 TPU CASE', pz: 2, dinero: 400, pzMayoreo: 0, dineroMayoreo: 0 },
    SP:   { producto: 'STIKER PEQUEÑO',     pz: 100, dinero: 1000, pzMayoreo: 0, dineroMayoreo: 0 },
    PV:   { producto: 'HIDROGEL PRIVACIDAD', pz: 50, dinero: 5450, pzMayoreo: 0, dineroMayoreo: 0 },
  })
  assert.equal(r.fundas.codigos, 1)
  assert.equal(r.fundas.precioMedio, 200, 'los 100 stickers a $10 no tiran el promedio')
  assert.equal(r.produccion.codigos, 1)
  assert.equal(r.protectores.codigos, 1)
  assert.equal(r.protectores.precioMedio, 109, 'y el hidrogel se ve, en su grupo')
})

test('una errata del catalogo no saca una mica del grupo de las micas', () => {
  // HIDRIOGEL y HODROGEL conviven con HIDROGEL en el catalogo de verdad.
  const r = precioPorPlaza({
    XX1: { producto: 'MICA HIDRIOGEL HD ALTA', pz: 1, dinero: 77, pzMayoreo: 0, dineroMayoreo: 0 },
    XX2: { producto: 'MICA HODROGEL MATE',     pz: 1, dinero: 88, pzMayoreo: 0, dineroMayoreo: 0 },
  })
  assert.equal(r.protectores.codigos, 2)
  assert.equal(r.fundas.codigos, 0)
})

test('un precio de CERO no entra: no es un precio, es una linea regalada', () => {
  const r = precioPorPlaza({
    I13T: { producto: 'IPHONE 13 TPU CASE', pz: 2, dinero: 400, pzMayoreo: 0, dineroMayoreo: 0 },
    FBX:  { producto: 'IPHONE XR TPU CASE', pz: 8, dinero: 0, pzMayoreo: 0, dineroMayoreo: 0 },
  })
  assert.equal(r.fundas.codigos, 1)
  assert.equal(r.fundas.precioMedio, 200, 'las 8 regaladas arrastrarian el promedio a $40')
})

test('sin venta de un modo, ese precio es null y no cero', () => {
  // Un cero diria «lo da gratis», que es lo contrario de «no vendio asi».
  const r = precioPorPlaza({
    I13T: { producto: 'IPHONE 13 TPU CASE', pz: 5, dinero: 1000, pzMayoreo: 5, dineroMayoreo: 1000 },
  })
  assert.equal(r.fundas.precioPublico, null)
  assert.equal(r.fundas.precioMayoreo, 200)
  assert.equal(r.fundas.descuento, null, 'sin las dos patas no hay descuento que calcular')
})

test('un mayoreo MAS CARO que el publico sale como descuento negativo', () => {
  // No es un descuento raro: es un precio mal puesto, y hay que poder verlo.
  const r = precioPorPlaza({
    I13T: { producto: 'IPHONE 13 TPU CASE', pz: 2, dinero: 300, pzMayoreo: 1, dineroMayoreo: 200 },
  })
  assert.ok(r.fundas.descuento < 0)
})

test('LA CUARTA TRAMPA: sin ventana, el precio medio es el de hace tres años', () => {
  // El historial de cada plaza arranca un dia distinto y los precios suben.
  // El 92% de las piezas de San Luis son de antes de 2026, asi que su precio
  // medio de TODO el historial no es su precio: es el de hace tres años.
  // Comparado contra la lista de HOY daba una «diferencia» de 1.5 millones
  // que era, casi toda, cinco años de subidas.
  const tickets = [
    { id: 1, cuando: '2021-06-01 12:00:00.0000', cancelado: 'f' },
    { id: 2, cuando: '2026-10-01 12:00:00.0000', cancelado: 'f' },
  ]
  const lineas = [
    { ticket: 1, codigo: 'I13T', producto: 'IPHONE 13', depto: 'FUNDAS', cantidad: 10, total: 1080, mayoreo: 'f' },
    { ticket: 2, codigo: 'I13T', producto: 'IPHONE 13', depto: 'FUNDAS', cantidad: 10, total: 2160, mayoreo: 'f' },
  ]

  const todo = agregarVentas({ tickets, lineas })
  assert.equal(todo.resumen.dinero / todo.resumen.piezas, 162, 'mezcla 2021 con 2026')
  assert.equal(todo.ventanaDesde, null)

  const reciente = agregarVentas({ tickets, lineas, desdeDia: '2026-01-01' })
  assert.equal(reciente.resumen.dinero / reciente.resumen.piezas, 216, 'el precio de HOY')
  assert.equal(reciente.resumen.tickets, 1)
  assert.equal(reciente.ventanaDesde, '2026-01-01')
  assert.equal(reciente.desde, '2026-10-01', 'y el rango real empieza dentro de la ventana')
})

test('la ventana no cuenta las lineas de los tickets que deja fuera', () => {
  const tickets = [{ id: 1, cuando: '2020-01-01 12:00:00.0000', cancelado: 'f' }]
  const lineas = [{ ticket: 1, codigo: 'X', depto: 'FUNDAS', cantidad: 99, total: 9900, mayoreo: 'f' }]
  const r = agregarVentas({ tickets, lineas, desdeDia: '2026-01-01' })
  assert.equal(r.resumen.piezas, 0)
  assert.equal(r.porCodigo.X, undefined)
})

test('una linea rara no puede torcer el descuento: se resume con MEDIANA', () => {
  // Paso de verdad: San Luis salia con un descuento del -63% teniendo publico
  // $197 y mayoreo $145. La razon no esta acotada por abajo, asi que un
  // codigo vendido una vez a $1 al publico aporta un -144 y arrastra el
  // promedio entero.
  const normales = {}
  for (let i = 0; i < 9; i++) {
    normales['N' + i] = {
      producto: 'FUNDA', pz: 2, dinero: 300, pzMayoreo: 1, dineroMayoreo: 100,
    }   // publico $200, mayoreo $100 -> 50% de descuento
  }
  const r = precioPorPlaza({
    ...normales,
    // El bicho: una pieza a $1 al publico y otra a $145 a mayoreo.
    RARO: { producto: 'FUNDA', pz: 2, dinero: 146, pzMayoreo: 1, dineroMayoreo: 145 },
  })
  assert.equal(r.fundas.descuento, 0.5, 'la mediana no se mueve por el bicho')
  assert.equal(r.fundas.invertidos, 1, 'pero el bicho se cuenta y se puede perseguir')
})

// ── El precio con el que se valora todo ───────────────────────────────────

test('el precio sale de lo COBRADO, no de la lista', () => {
  // Aguascalientes cobra el 75% de su lista: valorar con la lista inflaba
  // cada peso que el panel calculaba para esa plaza.
  const m = preciosDeVenta(
    { aguascalientes: { I13T: { pz: 10, dinero: 1670 } } },
    { lista: { I13T: 250 } })
  assert.equal(m.I13T.precio, 167)
  assert.equal(m.I13T.de, 'cobrado')
})

test('la lista queda de respaldo para lo que no se vendio en la ventana', () => {
  // Un modelo parado un año sigue teniendo existencia que vale dinero. Sin
  // precio saldria en CERO, que es peor que un precio viejo.
  const m = preciosDeVenta({ leon: {} }, { lista: { VIEJO: 216 } })
  assert.equal(m.VIEJO.precio, 216)
  assert.equal(m.VIEJO.de, 'lista', 'y se dice de donde salio')
})

test('varias plazas se ponderan por piezas, no se promedian a secas', () => {
  // 10 piezas a $200 en una y 90 a $100 en otra dan $110, no $150: si no,
  // una plaza chica pesa lo mismo que una grande.
  const m = preciosDeVenta({
    leon: { X: { pz: 10, dinero: 2000 } },
    ags:  { X: { pz: 90, dinero: 9000 } },
  })
  assert.equal(m.X.precio, 110)
  assert.equal(m.X.piezas, 100)
})

test('un precio de cero no pisa a la lista', () => {
  const m = preciosDeVenta({ leon: { X: { pz: 5, dinero: 0 } } }, { lista: { X: 216 } })
  assert.equal(m.X.precio, 216, 'regalar cinco piezas no fija el precio en cero')
})

test('se puede saber cuanto del valor se apoya en lista y cuanto en ticket', () => {
  // Importa decirlo: una cifra que se apoya en la lista a medias no es la
  // misma cifra, y el dueño tiene que poder verlo.
  const m = preciosDeVenta({ leon: { A: { pz: 30, dinero: 6000 } } }, { lista: { B: 100 } })
  const c = cobertura(m, { A: 30, B: 10 })
  assert.equal(c.conCobrado, 30)
  assert.equal(c.conLista, 10)
  assert.equal(c.parte, 0.75)
})

test('el mapa plano es el que esperan las cuentas de radiografia', () => {
  const m = preciosDeVenta({ leon: { X: { pz: 2, dinero: 400 } } })
  assert.deepEqual(soloPrecios(m), { X: 200 })
})
