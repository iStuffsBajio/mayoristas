// Pruebas de la venta linea por linea.
//
// Las tres que importan son la del ticket cancelado, la del mayorista apuntado
// como producto y la de la hora: las tres fallan en silencio, dejando una
// cifra alta, una cifra inflada y una grafica con forma correcta y seis horas
// de desfase.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agregarVentas, claseDeLinea, horaDe, diaSemanaDe, pesoDelMayoreo, esPrecioDeEtiqueta, PRECIO_DE_ETIQUETA,
  DEPTO_MAYORISTAS, DEPTO_STICKERS, precioPorPlaza, PISO_PRECIO,
  preciosDeVenta, soloPrecios, cobertura, DESCUENTO_MAXIMO, tipoDePieza, TIPOS_QUE_CUENTAN,
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

test('TORREÓN lo escribe en singular, y el precio de $0.01 es la segunda red', () => {
  // «MAYORISTA» no era «MAYORISTAS»: sin esto su cliente se contaba como una
  // funda. Y aunque el departamento fallara por otro motivo, el dueño definió
  // que lo cobrado a $0.01 es del esquema de mayoristas.
  assert.equal(claseDeLinea({ depto: 'MAYORISTA' }), 'etiqueta')
  assert.equal(claseDeLinea({ depto: ' Mayorista ' }), 'etiqueta')
  assert.equal(claseDeLinea({ depto: 'FUNDAS', cantidad: 1, total: 0.01 }), 'etiqueta')
  assert.equal(claseDeLinea({ depto: 'FUNDAS', cantidad: 3, total: 0.03 }), 'etiqueta')
  assert.ok(esPrecioDeEtiqueta(0.01) && !esPrecioDeEtiqueta(1) && !esPrecioDeEtiqueta(0))
  assert.equal(PRECIO_DE_ETIQUETA, 0.01)
})

test('el precio de etiqueta NO se confunde con una venta de verdad', () => {
  // Una línea en cero no es una etiqueta; una a $1 es el «regalo» que ya se
  // cuenta aparte; y un sticker barato sigue siendo un sticker.
  assert.equal(claseDeLinea({ depto: 'FUNDAS', cantidad: 1, total: 0 }), 'producto')
  assert.equal(claseDeLinea({ depto: 'FUNDAS', cantidad: 1, total: 1 }), 'producto')
  assert.equal(claseDeLinea({ depto: 'FUNDAS', cantidad: 2, total: 250 }), 'producto')
  assert.equal(claseDeLinea({ depto: 'stikers', cantidad: 10, total: 90 }), 'sin-stock')

  const r = agregarVentas({
    tickets: [ticket(1)],
    lineas: [
      linea(1),
      linea(1, { codigo: 'PT998', producto: 'OTRO CLIENTE (998)', depto: 'MAYORISTA', cantidad: 1, total: 0.01 }),
      // Sin departamento reconocible, pero cobrada a $0.01: tampoco es pieza.
      linea(1, { codigo: 'PT997', producto: 'OTRO CLIENTE (997)', depto: 'COSAS', cantidad: 1, total: 0.01 }),
    ],
  })
  assert.equal(r.resumen.piezas, 1, 'las dos etiquetas no suman piezas')
  assert.equal(r.porCodigo.PT998, undefined)
  assert.equal(r.porCodigo.PT997, undefined)
  assert.equal(r.mayoristas.length, 2)
})

test('el inventario PÚBLICO no publica a un cliente: ni en singular ni por precio', async () => {
  // Con la sincronización de Torreón, su «MAYORISTA» habría salido en
  // inventario.json —que lee cualquiera— con el nombre del cliente. Este
  // filtro es lo único que lo impide, así que se prueba con el mismo código
  // que usa la sincronización.
  const { deptoOculto, esEtiquetaDeCliente } = await import('../../scripts/lib/departamentos.js')
  const sale = f => !deptoOculto(f.depto) && !esEtiquetaDeCliente(f)

  assert.equal(sale({ depto: 'MAYORISTAS', pventa: 0.01, existencia: 0 }), false)
  assert.equal(sale({ depto: 'MAYORISTA',  pventa: 0.01, existencia: 0 }), false, 'el singular de Torreón')
  assert.equal(sale({ depto: 'COSAS',      pventa: 0.01, existencia: 0 }), false, 'por precio, aunque el depto falle')
  assert.equal(sale({ depto: 'GALAXY',     pventa: 215,  existencia: 8 }), true)

  // Un producto DE VERDAD con el precio mal capturado en $0.01 y piezas en el
  // mostrador tiene que verse: es justo la clase de error que hay que poder
  // encontrar, y esconderlo lo volvería invisible.
  assert.equal(sale({ depto: 'GALAXY', pventa: 0.01, existencia: 5 }), true)
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

test('LA QUINTA TRAMPA: una linea cobrada a $1 no es un precio', () => {
  // Medido en Aguascalientes: 255 lineas a $1 con el 100% de descuento. No
  // son ventas a un precio -son regalos, garantias o correcciones metidas
  // por caja- y metidas en el promedio lo hunden. En el iPhone 13 eran 2
  // piezas de 44 y bajaban su precio medio de $175 a $167.
  //
  // Lo olio el dueño mirando el kardex, y tenia razon en que algo se estaba
  // interpretando mal, aunque la causa no fueran los ajustes de inventario.
  const tickets = [{ id: 1, cuando: '2026-10-01 12:00:00.0000', cancelado: 'f' }]
  const lineas = [
    { ticket: 1, codigo: 'I13T', depto: 'FUNDAS', cantidad: 10, total: 2300, mayoreo: 'f', descuento: 0 },
    { ticket: 1, codigo: 'I13T', depto: 'FUNDAS', cantidad: 1, total: 1, mayoreo: 'f', descuento: 100 },
  ]
  const r = agregarVentas({ tickets, lineas })
  assert.equal(r.porCodigo.I13T.pz, 10, 'la de $1 no entra en el precio')
  assert.equal(r.porCodigo.I13T.dinero, 2300)
  assert.equal(r.porCodigo.I13T.dinero / r.porCodigo.I13T.pz, 230, 'sin ella serian 209')
  assert.equal(r.porCodigo.I13T.pzRegalada, 1, 'pero se apunta: no se tira en silencio')
  assert.equal(r.resumen.noSonPrecio, 1)
  assert.equal(r.resumen.piezas, 11, 'y en el conteo de piezas si cuenta: se vendio de verdad')
})

test('una venta negociada normal SI cuenta', () => {
  // En Aguascalientes la mitad de las lineas llevan descuento y son ventas
  // de verdad: el mostrador negocia. Solo lo extremo queda fuera.
  const tickets = [{ id: 1, cuando: '2026-10-01 12:00:00.0000', cancelado: 'f' }]
  const lineas = [
    { ticket: 1, codigo: 'X', depto: 'FUNDAS', cantidad: 1, total: 140, mayoreo: 'f', descuento: 39 },
    { ticket: 1, codigo: 'X', depto: 'FUNDAS', cantidad: 1, total: 150, mayoreo: 'f', descuento: 34.8 },
  ]
  const r = agregarVentas({ tickets, lineas })
  assert.equal(r.porCodigo.X.pz, 2)
  assert.equal(r.porCodigo.X.dinero, 290)
  assert.equal(r.resumen.noSonPrecio, undefined)
})

test('el umbral del descuento es el acordado', () => {
  assert.equal(DESCUENTO_MAXIMO, 80)
})

// ── El desglose del corte: tipo de pieza y lo que compra cada mayorista ─────

test('SÓLO TRES TIPOS CUENTAN como pieza: fundas, hidrogel y stickers', () => {
  assert.deepEqual(TIPOS_QUE_CUENTAN, ['funda', 'hidrogel', 'sticker'])
  assert.equal(tipoDePieza({ codigo: 'I13T', producto: 'IPHONE 13 TPU CASE', depto: 'APPLE' }), 'funda')
  assert.equal(tipoDePieza({ codigo: 'SGA07T', producto: 'GALAXY A07 TPU CASE', depto: 'GALAXY' }), 'funda')
  assert.equal(tipoDePieza({ codigo: 'X', producto: 'FUNDA RARA', depto: '' }), 'funda', 'sin depto, por el nombre')
  assert.equal(tipoDePieza({ codigo: 'SP', producto: 'STIKER PEQUEÑO', depto: 'stikers' }), 'sticker')
  assert.equal(tipoDePieza({ codigo: 'ST', producto: 'STIKER DISEÑO', depto: '' }), 'sticker', 'por producción')
  // Lo que se vende pero no es una de las tres.
  assert.equal(tipoDePieza({ codigo: 'PS', producto: 'POPSOCKET', depto: 'POPSOKET' }), 'otro')
  assert.equal(tipoDePieza({ codigo: 'LL', producto: 'LLAVERO', depto: 'Llaveros' }), 'otro')
  assert.equal(tipoDePieza({ codigo: 'Z', producto: 'COSA SUELTA', depto: 'COSAS' }), 'otro', 'no se adivina funda')
})

test('MICAS = el departamento HIDROGEL, o cualquier nombre que lo lleve', () => {
  // Lo dijo el dueño el 2026-11-09. La errata del catálogo también cuenta.
  assert.equal(tipoDePieza({ codigo: 'HDA', producto: 'MICA HIDRIOGEL HD ALTA', depto: 'HIDROGEL' }), 'hidrogel')
  assert.equal(tipoDePieza({ codigo: 'NUEVO', producto: 'LO QUE SEA', depto: 'HIDROGEL' }), 'hidrogel', 'por departamento')
  assert.equal(tipoDePieza({ codigo: 'Q', producto: 'MICA HODROGEL TABLET', depto: '' }), 'hidrogel', 'por nombre')
})

test('un mayorista apuntado como producto NO es una pieza, de ningún tipo', () => {
  assert.equal(tipoDePieza({ codigo: 'PT1', producto: 'NOMBRE PLAZA (1)', depto: 'MAYORISTAS' }), null)
  assert.equal(tipoDePieza({ codigo: 'PT1', producto: 'NOMBRE PLAZA (1)', depto: 'MAYORISTA' }), null)
})

test('SIN `detalleDias` el resultado es el de siempre: nada nuevo en el archivo', () => {
  const r = agregarVentas({ tickets: [ticket(1)], lineas: [linea(1)] })
  assert.equal('porDiaTipo' in r, false)
  assert.equal('mayoristasPorDia' in r, false)
})

test('piezas por día y por tipo, con «otros» aparte', () => {
  const r = agregarVentas({
    tickets: [ticket(1), ticket(2, { cuando: '2026-11-01 10:00:00.0000' })],
    lineas: [
      linea(1, { cantidad: 3 }),
      linea(1, { codigo: 'HDA', producto: 'MICA HIDROGEL', depto: 'HIDROGEL', cantidad: 4 }),
      linea(1, { codigo: 'SP', producto: 'STIKER PEQUEÑO', depto: 'stikers', cantidad: 10, total: 90 }),
      linea(1, { codigo: 'PS', producto: 'POPSOCKET', depto: 'POPSOKET', cantidad: 2, total: 60 }),
      linea(2, { cantidad: 1 }),
    ],
    detalleDias: 120,
  })
  assert.deepEqual(r.porDiaTipo, [
    { f: '2026-10-31', fundas: 3, hidrogel: 4, stickers: 10, otros: 2 },
    { f: '2026-11-01', fundas: 1, hidrogel: 0, stickers: 0, otros: 0 },
  ])
  // El ejemplo del dueño: 3 + 4 + 10 = 17, y lo de «otros» no suma.
  const d = r.porDiaTipo[0]
  assert.equal(d.fundas + d.hidrogel + d.stickers, 17)
})

test('LO QUE COMPRA UN MAYORISTA es el ticket entero, no la etiqueta de $0.01', () => {
  // La línea de la etiqueta vale un centavo; lo que se vendió de verdad son las
  // otras líneas del mismo ticket. Sin atribuírselas, el ranking de mayoristas
  // sale todo en cero.
  const marca = (t, quien) => linea(t, { codigo: `PT${quien}`, producto: quien, depto: 'MAYORISTAS', cantidad: 1, total: 0.01, ganancia: 0 })
  const r = agregarVentas({
    tickets: [ticket(1), ticket(2), ticket(3, { cancelado: 't' }), ticket(4, { cuando: '2026-11-01 11:00:00.0000' }), ticket(5)],
    lineas: [
      marca(1, 'LOCAL 12'), linea(1, { cantidad: 5, total: 500 }), linea(1, { codigo: 'PS', producto: 'POPSOCKET', depto: 'POPSOKET', cantidad: 3, total: 90 }),
      marca(2, 'LOCAL 12'), linea(2, { cantidad: 2, total: 200 }),
      marca(3, 'LOCAL 99'), linea(3, { cantidad: 9, total: 900 }),   // cancelado
      marca(4, 'LOCAL 12'),                                          // ticket sin productos
      linea(5, { cantidad: 7, total: 700 }),                         // venta de mostrador, sin cliente
    ],
    detalleDias: 120,
  })
  const l12 = r.mayoristasPorDia.filter(x => x.quien === 'LOCAL 12')
  assert.deepEqual(l12.map(x => [x.f, x.tickets, x.piezas, x.dinero]), [
    ['2026-10-31', 2, 7, 790],    // 2 tickets; 5 + 2 piezas que cuentan (los popsockets no); 500 + 90 + 200
    ['2026-11-01', 1, 0, 0],      // un ticket sin productos sigue contando como visita
  ])
  assert.ok(!r.mayoristasPorDia.some(x => x.quien === 'LOCAL 99'), 'el cancelado no cuenta')
  assert.equal(r.resumen.piezas, 5 + 3 + 2 + 7, 'y el resumen no cambia: las etiquetas siguen sin ser piezas')
})

test('el detalle se recorta a los últimos días: el corte no necesita años', () => {
  const r = agregarVentas({
    tickets: [ticket(1, { cuando: '2026-06-01 10:00:00.0000' }), ticket(2, { cuando: '2026-10-31 10:00:00.0000' })],
    lineas: [linea(1), linea(2)],
    detalleDias: 30,
  })
  assert.deepEqual(r.porDiaTipo.map(x => x.f), ['2026-10-31'])
})
