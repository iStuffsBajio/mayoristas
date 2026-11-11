// Pruebas del registro de surtidos.
//
// Las dos que importan de verdad son la de la venta a medio camino y la del
// código sin dar de alta: son las dos formas en que esta cuenta puede salir
// mal pareciendo correcta, y ninguna de las dos se ve en pantalla.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESTADOS, DIAS_PARA_DAR_DE_ALTA, TOLERANCIA,
  existenciasDe, nuevoFolio, cuadrar, juntarFolios, resumirFolios, lineasDesdeSurtido,
  PUEDE_SURTIR, puedeSurtir, veBodega,
} from './surtidos.js'

const SALIO = new Date('2026-11-01T12:00:00Z')
const inv = pares => ({ productos: Object.entries(pares).map(([Codigo, Existencia]) => ({ Codigo, Existencia })) })

const folioDe = (lineas, antes) => nuevoFolio({
  destino: 'leon', lineas, quien: 'bodega', inventarioDestino: inv(antes), cuando: SALIO,
})

test('el folio congela el antes de los codigos que van en la caja, y solo esos', () => {
  const f = folioDe([{ codigo: 'i13t', producto: 'IPHONE 13', piezas: 10 }], { I13T: 4, OTRO: 99 })
  assert.deepEqual(f.antes, { I13T: 4 }, 'guardar el inventario entero por folio es el error de los 44 MB')
  assert.equal(f.lineas[0].codigo, 'I13T', 'el codigo se normaliza al guardarlo')
  assert.match(f.folio, /^2026-11-01-leon-\d{4}$/)
})

test('un codigo que la tienda no tenia arranca en cero, no en undefined', () => {
  const f = folioDe([{ codigo: 'NUEVO', piezas: 3 }], { OTRO: 1 })
  assert.equal(f.antes.NUEVO, 0)
})

test('un surtido sin destino o sin piezas no se crea', () => {
  assert.throws(() => folioDe([{ codigo: 'X', piezas: 1 }], {}) && nuevoFolio({ lineas: [], quien: 'b' }))
  assert.throws(() => nuevoFolio({ destino: 'leon', lineas: [{ codigo: 'X', piezas: 0 }], quien: 'b' }))
  assert.throws(() => nuevoFolio({ destino: '', lineas: [{ codigo: 'X', piezas: 1 }], quien: 'b' }))
})

test('lo que entro se mide contra el respaldo y cuadra', () => {
  const f = folioDe([{ codigo: 'I13T', piezas: 10 }], { I13T: 4 })
  const c = cuadrar(f, { inventarioDestino: inv({ I13T: 14 }), vendidas: { I13T: 0 },
                         hoy: new Date('2026-11-03T12:00:00Z') })
  assert.equal(c.estado, ESTADOS.CUADRA)
  assert.equal(c.filas[0].entraron, 10)
  assert.equal(c.filas[0].diferencia, 0)
  assert.equal(c.piezasQueSalieron, 10)
  assert.equal(c.piezasQueEntraron, 10)
})

test('LA TRAMPA: la tienda vende mientras recibe, y sin ese termino falta mercancia que nadie se llevo', () => {
  // Salieron 10, habia 4, vendio 3 → el respaldo dice 11. Restando a secas
  // «entraron 7» y el folio acusaria de 3 piezas que estan en una bolsa de
  // cliente.
  const f = folioDe([{ codigo: 'I13T', piezas: 10 }], { I13T: 4 })
  const opciones = { inventarioDestino: inv({ I13T: 11 }), hoy: new Date('2026-11-03T12:00:00Z') }

  const bien = cuadrar(f, { ...opciones, vendidas: { I13T: 3 } })
  assert.equal(bien.filas[0].entraron, 10, '(11 - 4) + 3')
  assert.equal(bien.estado, ESTADOS.CUADRA)

  // Y sin el dato de venta, la fila lo CONFIESA en vez de callarlo.
  const sin = cuadrar(f, opciones)
  assert.equal(sin.filas[0].entraron, 7)
  assert.equal(sin.filas[0].sinVender, true, 'una cuenta sin el termino de venta tiene que decirlo')
})

test('faltar piezas es diferencia, y sobrar tambien', () => {
  const f = folioDe([{ codigo: 'A', piezas: 10 }, { codigo: 'B', piezas: 5 }], { A: 0, B: 0 })
  const c = cuadrar(f, { inventarioDestino: inv({ A: 8, B: 7 }), vendidas: {},
                         hoy: new Date('2026-11-03T12:00:00Z') })
  assert.equal(c.estado, ESTADOS.DIFERENCIA)
  assert.equal(c.faltan, 2)
  assert.equal(c.sobran, 2, 'llegar de mas suele ser una linea mal capturada, no un regalo')
  assert.equal(c.conDiferencia.length, 2)
})

test('la tolerancia es cero, y tiene que seguir siendolo', () => {
  // Una tolerancia «de una pieza» es del tamaño exacto de lo que se pierde de
  // verdad: la haria invisible justo en el caso que esto detecta.
  assert.equal(TOLERANCIA, 0)
  const f = folioDe([{ codigo: 'A', piezas: 10 }], { A: 0 })
  const c = cuadrar(f, { inventarioDestino: inv({ A: 9 }), vendidas: {},
                         hoy: new Date('2026-11-03T12:00:00Z') })
  assert.equal(c.estado, ESTADOS.DIFERENCIA)
  assert.equal(c.faltan, 1)
})

test('mientras no aparezca el alta esta EN CAMINO, no faltando', () => {
  // Es la diferencia que decidio el dueño: hasta cuatro dias es normal. Dar
  // esto por mercancia perdida mandaria a buscar cajas que estan en su sitio.
  const f = folioDe([{ codigo: 'A', piezas: 10 }], { A: 0 })
  const c = cuadrar(f, { inventarioDestino: inv({ OTRO: 1 }), vendidas: {},
                         hoy: new Date('2026-11-03T12:00:00Z') })
  assert.equal(c.estado, ESTADOS.EN_CAMINO)
  assert.equal(c.filas[0].entraron, null, 'sin alta no hay numero, y un cero diria que llego vacia')
  assert.equal(c.filas[0].despues, null)
  assert.equal(c.faltan, 0, 'no se acusa de nada todavia')
})

test('pasados los dias de gracia sin dar de alta, es TARDE y no «falta»', () => {
  const f = folioDe([{ codigo: 'A', piezas: 10 }], { A: 0 })
  const tarde = new Date(SALIO.getTime() + (DIAS_PARA_DAR_DE_ALTA + 1) * 86400000)
  const c = cuadrar(f, { inventarioDestino: inv({ OTRO: 1 }), vendidas: {}, hoy: tarde })
  assert.equal(c.estado, ESTADOS.TARDE)
  assert.equal(c.dias, DIAS_PARA_DAR_DE_ALTA + 1)
})

test('existenciasDe normaliza el codigo como lo escriba la caja', () => {
  assert.deepEqual(existenciasDe({ productos: [{ Codigo: ' i13t ', Existencia: '7' }] }), { I13T: 7 })
  assert.deepEqual(existenciasDe(null), {})
})

test('si dos personas registran el mismo folio, gana el mas reciente', () => {
  const juntos = juntarFolios({
    bodega: [{ folio: 'F1', cuando: '2026-11-01T00:00:00Z', lineas: [], nota: 'viejo' }],
    admin:  [{ folio: 'F1', cuando: '2026-11-02T00:00:00Z', lineas: [], nota: 'nuevo' }],
  })
  assert.equal(Object.keys(juntos).length, 1)
  assert.equal(juntos.F1.nota, 'nuevo')
  assert.equal(juntos.F1.quien, 'admin')
})

test('un folio cerrado deja de pesar en el resumen', () => {
  const r = resumirFolios([
    { estado: ESTADOS.DIFERENCIA, faltan: 3 },
    { estado: ESTADOS.DIFERENCIA, faltan: 9, cerrado: '2026-11-04T00:00:00Z' },
    { estado: ESTADOS.TARDE, faltan: 0 },
    { estado: ESTADOS.CUADRA, faltan: 0 },
  ])
  assert.equal(r.diferencia, 1, 'el cerrado ya se miro y se decidio')
  assert.equal(r.piezasQueFaltan, 3)
  assert.equal(r.tarde, 1)
  assert.equal(r.total, 3)
})

test('las lineas salen de lo calculado, y lo mandado puede corregirlas', () => {
  const filas = [
    { codigo: 'a', producto: 'A', sugerido: 10 },
    { codigo: 'b', producto: 'B', sugerido: 5 },
    { codigo: 'c', producto: 'C', sugerido: 0 },
  ]
  assert.deepEqual(lineasDesdeSurtido(filas).map(l => [l.codigo, l.piezas]),
                   [['A', 10], ['B', 5]], 'lo sugerido en cero no va en la caja')

  // Bodega no siempre tiene todo lo que la cuenta pide, y un cero saca la
  // linea del folio en vez de registrar un envio que no ocurrio.
  const corregido = lineasDesdeSurtido(filas, { mandado: { A: 4, B: 0 } })
  assert.deepEqual(corregido.map(l => [l.codigo, l.piezas]), [['A', 4]])
})

test('quien puede registrar un surtido va por CAPACIDAD, no por «admin»', () => {
  // Estaba atado a admin, y con eso el encargado de bodega -que es quien
  // manda la mercancia- no habria podido registrar nada aunque el backend si
  // le dejara. El panel enseñaba una puerta que el servidor cerraba.
  assert.equal(puedeSurtir({ isAdmin: true, plaza: 'leon' }), true)
  assert.equal(puedeSurtir({ isAdmin: false, plaza: 'bodega' }), true)
  assert.equal(puedeSurtir({ isAdmin: false, plaza: 'leon' }), false,
    'una tienda recibe, no manda')
  assert.equal(puedeSurtir({ isAdmin: false, plaza: 'san-luis' }), false)
  assert.equal(puedeSurtir({}), false)
  assert.equal(puedeSurtir(), false, 'sin sesion no se registra nada')
})

test('el nombre de la plaza se normaliza antes de decidir', () => {
  // La sesion guarda lo que mando el login. Un espacio o una mayuscula no
  // pueden decidir un permiso.
  assert.equal(puedeSurtir({ plaza: ' BODEGA ' }), true)
})

test('la lista de capacidad tiene que decir lo mismo que el backend', () => {
  // No se pueden compartir -son dos paquetes- asi que se escriben dos veces.
  // Esta prueba no puede leer el backend, pero deja la lista fijada: si
  // alguien la cambia aqui sin tocar `PUEDE_SURTIR` en
  // `backend/src/index.js`, el fallo sale en esta linea y no en produccion.
  assert.deepEqual(PUEDE_SURTIR, ['admin', 'bodega'])
})

test('una TIENDA no ve informacion de bodega, y no era solo una columna', () => {
  // El dueño entro como Leon y se lo encontro. Una sucursal tenia a mano la
  // existencia de bodega en su tabla y, pulsando «Bajar el reporte completo
  // en Excel», el plan de compra al proveedor, los «agotados que duelen» con
  // su dinero perdido y el stock entero de bodega. El boton decia «completo»
  // y lo era.
  assert.equal(veBodega({ isAdmin: false, plaza: 'leon' }), false)
  assert.equal(veBodega({ isAdmin: false, plaza: 'san-luis' }), false)
  assert.equal(veBodega({ isAdmin: false, plaza: 'ferias' }), false)
})

test('el administrador y bodega si lo ven', () => {
  // Y esto NO se puede atar al ambito de la pantalla: el administrador mira
  // el surtido de las sucursales con `ambito="sucursales"` y ahi debe verlo
  // todo. Lo decide la SESION, no la vista.
  assert.equal(veBodega({ isAdmin: true, plaza: 'leon' }), true)
  assert.equal(veBodega({ isAdmin: false, plaza: 'bodega' }), true)
  assert.equal(veBodega({ isAdmin: false, plaza: ' BODEGA ' }), true)
  assert.equal(veBodega({}), false)
  assert.equal(veBodega(), false, 'sin sesion no se ve nada')
})
