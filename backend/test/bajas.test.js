// El candado de las bajas definitivas.
//
// «Queda estrictamente PROHIBIDO eliminar un SKU si tiene stock global > 0 o
// si registra ventas en los últimos 365 días» —el dueño, el 2026-11-09—.
//
// Se prueba en tres capas porque «estrictamente» no se cumple con una sola:
//
//   1. La cuenta pura (`src/bajas.js`), caso por caso.
//   2. La RUTA, con un S3 de memoria: que sólo el administrador entre, que si
//      falta el inventario de una plaza no se escriba NADA, y que la baja no se
//      pueda registrar saltándose el candado por la ruta genérica.
//   3. La PARIDAD con la página (`src/lib/depuracion.js`): son dos paquetes y
//      la misma regla escrita dos veces, y dos reglas escritas dos veces acaban
//      diciendo cosas distintas sin que nada falle.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashearContrasena, crearSesion } from '../src/seguridad.js'
import { S3Client } from '@aws-sdk/client-s3'

const ORIGEN = 'https://ejemplo.test'
const SECRETO = 'secreto-de-pruebas-suficientemente-largo'

process.env.S3_BUCKET           = 'bucket-de-pruebas'
process.env.S3_REGION           = 'us-east-1'
process.env.SESION_SECRETO      = SECRETO
process.env.ORIGENES_PERMITIDOS = ORIGEN
process.env.HASH_ADMIN          = hashearContrasena('clave-admin')
process.env.HASH_LEON           = hashearContrasena('clave-leon')

const { handler } = await import('../src/index.js')
const { verificarBajas, PLAZAS_CON_STOCK, DIAS_MINIMOS_PARA_BAJA, DIAS_MAXIMOS, hoyMexico } = await import('../src/bajas.js')

// ── Datos de prueba ─────────────────────────────────────────────────────────

const HOY = '2026-11-09'
const hace = n => {
  const [a, m, d] = HOY.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1, d - n))
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`
}

/** Un inventario de plaza con un producto de relleno, que es como son de verdad. */
const plaza = (productos, { publicaVenta = true } = {}) => ({
  productos: [
    { Codigo: 'RELLENO', Producto: 'IPHONE 99 TPU CASE', Existencia: 1, Alta: hace(900), ...(publicaVenta ? { UltimaVenta: hace(1) } : {}) },
    ...productos,
  ],
})

/** Las seis plazas; `s in porPlaza` y no `??`, para poder pedir una que falte. */
const red = (porPlaza = {}) => Object.fromEntries(
  PLAZAS_CON_STOCK.map(s => [s, s in porPlaza ? porPlaza[s] : plaza([])]))

const verificar = (inventarios, codigos, extra = {}) =>
  verificarBajas({ codigos, inventarios, hoy: HOY, ...extra })

const muerto = (cod, extra = {}) =>
  ({ Codigo: cod, Producto: `LG ${cod} TPU CASE`, Existencia: 0, Alta: hace(2000), UltimaVenta: hace(1500), ...extra })

// ── La cuenta ───────────────────────────────────────────────────────────────

test('las plazas son las seis, y están escritas igual que en la página', () => {
  assert.deepEqual(PLAZAS_CON_STOCK, ['leon', 'san-luis', 'aguascalientes', 'torreon', 'bodega', 'ferias'])
  assert.equal(DIAS_MINIMOS_PARA_BAJA, 365)
})

test('un código muerto de verdad se puede dar de baja', () => {
  const r = verificar(red({ aguascalientes: plaza([muerto('M1')]) }), ['M1'])
  assert.equal(r.resultados[0].ok, true, r.resultados[0].motivos.join(' | '))
  assert.equal(r.plazasSinInventario.length, 0)
})

test('CON UNA SOLA PIEZA EN CUALQUIER PLAZA NO SE PUEDE', () => {
  // Torreón vende, aunque su página no esté abierta.
  for (const slug of PLAZAS_CON_STOCK) {
    const r = verificar(red({ [slug]: plaza([muerto('M1', { Existencia: 1 })]) }), ['M1'])
    assert.equal(r.resultados[0].ok, false, `una pieza en ${slug}`)
    assert.ok(r.resultados[0].motivos.some(m => /tiene 1 piezas/.test(m)), slug)
  }
})

test('con una venta dentro de los 365 días NO se puede, y 365 exactos tampoco', () => {
  for (const dias of [1, 30, 364, 365]) {
    const r = verificar(red({ leon: plaza([muerto('M1', { UltimaVenta: hace(dias) })]) }), ['M1'])
    assert.equal(r.resultados[0].ok, false, `vendido hace ${dias}`)
  }
  assert.equal(verificar(red({ leon: plaza([muerto('M1', { UltimaVenta: hace(366) })]) }), ['M1']).resultados[0].ok, true)
})

test('un código que NUNCA se vendió y lleva años sí se puede', () => {
  const sin = muerto('M1'); delete sin.UltimaVenta
  assert.equal(verificar(red({ leon: plaza([sin]) }), ['M1']).resultados[0].ok, true)
})

test('SIN EL INVENTARIO DE UNA PLAZA NO SE PUEDE NINGUNO', () => {
  // Es lo que pasa hoy con Torreón. Sin su inventario, una pieza suya no se ve
  // en el stock global.
  for (const faltante of PLAZAS_CON_STOCK) {
    // `[faltante]: null` va DESPUÉS: si la plaza que falta fuera la misma que
    // tiene el código, el segundo valor la rellenaba y no se probaba nada.
    const r = verificar(red({ aguascalientes: plaza([muerto('M1')]), [faltante]: null }), ['M1'])
    assert.deepEqual(r.plazasSinInventario, [faltante])
    assert.equal(r.resultados[0].ok, false, `sin ${faltante}`)
  }
  // Y un inventario VACÍO cuenta como faltante.
  assert.deepEqual(verificar({ ...red(), leon: { productos: [] } }, ['M1']).plazasSinInventario, ['leon'])
})

test('lo que no existe en ninguna caja no es una baja', () => {
  const r = verificar(red(), ['FANTASMA'])
  assert.equal(r.resultados[0].ok, false)
  assert.ok(r.resultados[0].motivos.some(m => /no existe en ninguna caja/.test(m)))
})

test('un código nuevo sin ventas no está muerto, acaba de llegar', () => {
  const r = verificar(red({ leon: plaza([muerto('M1', { Alta: hace(200), UltimaVenta: undefined })]) }), ['M1'])
  assert.equal(r.resultados[0].ok, false)
  assert.ok(r.resultados[0].motivos.some(m => /lleva 200 días en el catálogo/.test(m)))
  // Y sin saber desde cuándo existe, tampoco.
  const sin = muerto('M2'); delete sin.Alta
  assert.equal(verificar(red({ leon: plaza([sin]) }), ['M2']).resultados[0].ok, false)
})

test('EL PISO ES 365: pedir menos no lo baja, y pedir más endurece', () => {
  const inv = red({ leon: plaza([muerto('M1', { UltimaVenta: hace(200) })]) })
  assert.equal(verificar(inv, ['M1'], { dias: 30 }).dias, 365)
  assert.equal(verificar(inv, ['M1'], { dias: 30 }).resultados[0].ok, false, 'pedir 30 no libera una venta de hace 200')
  assert.equal(verificar(inv, ['M1'], { dias: -5 }).dias, 365)
  assert.equal(verificar(inv, ['M1'], { dias: 'abc' }).dias, 365)
  assert.equal(verificar(inv, ['M1'], { dias: 999999 }).dias, DIAS_MAXIMOS, 'y un número absurdo no pasa')

  const viejo = red({ leon: plaza([muerto('M2', { UltimaVenta: hace(500) })]) })
  assert.equal(verificar(viejo, ['M2'], { dias: 365 }).resultados[0].ok, true)
  assert.equal(verificar(viejo, ['M2'], { dias: 730 }).resultados[0].ok, false, 'con 730 sí endurece')
})

test('UNA VENTA EN UNA PLAZA DONDE EL CÓDIGO YA SE BORRÓ SIGUE BLOQUEANDO', () => {
  // Aguascalientes lo tiene muerto; León lo vendió en febrero y lo borró. Su
  // inventario ya no lo trae, pero su historial sí.
  const r = verificar(
    red({ aguascalientes: plaza([muerto('B1')]) }), ['B1'],
    { historiales: { leon: { periodos: [{ p: '2026-02', m: { B1: 3 } }] } } })
  assert.equal(r.resultados[0].ok, false)
  assert.ok(r.resultados[0].motivos.some(m => /se vendió hace/.test(m)))
})

test('UNA PLAZA QUE NO PUBLICA LA ÚLTIMA VENTA no puede dar fe de que algo no se vendió', () => {
  // `UltimaVenta: undefined` a propósito: `muerto` la trae, y con ella León
  // «publicaría» por culpa de ese solo producto.
  const r = verificar(red({ leon: plaza([muerto('L1', { UltimaVenta: undefined })], { publicaVenta: false }) }), ['L1'])
  assert.equal(r.resultados[0].ok, false)
  assert.ok(r.resultados[0].motivos.some(m => /última venta exacta/.test(m)))
})

test('los códigos se comparan sin mirar mayúsculas ni espacios, y no se repiten', () => {
  const r = verificar(red({ leon: plaza([muerto('M1')]) }), [' m1 ', 'M1', '', null, 'M1'])
  assert.equal(r.resultados.length, 1)
  assert.equal(r.resultados[0].codigo, 'M1')
})

test('datos raros no revientan: lo que no se puede probar se rechaza', () => {
  assert.doesNotThrow(() => verificarBajas())
  assert.doesNotThrow(() => verificarBajas({ codigos: ['X'], inventarios: null, historiales: null }))
  const r = verificarBajas({ codigos: ['X'], inventarios: { leon: { productos: [{ Codigo: 'X', Existencia: 'mucho', Alta: 'ayer' }] } } })
  assert.equal(r.resultados[0].ok, false)
})

test('«hoy» sale de México, no de UTC', () => {
  // A las 21:00 de México del 9 de noviembre, UTC ya es el 10.
  assert.equal(hoyMexico(new Date('2026-11-10T03:00:00Z')), '2026-11-09')
  assert.equal(hoyMexico(new Date('2026-11-09T15:00:00Z')), '2026-11-09')
})

// ── La paridad con la página ────────────────────────────────────────────────

test('LA PÁGINA Y EL SERVIDOR DICEN LO MISMO, caso por caso', async () => {
  // Son dos paquetes y la misma regla escrita dos veces. Si una cambia y la
  // otra no, la pantalla ofrecería botones que el servidor rechaza o, peor,
  // al revés. Aquí se ponen frente a frente con los mismos casos.
  const { reunirCatalogo, razonesDeBloqueo, PLAZAS_CON_STOCK: PLAZAS_PAGINA } =
    await import('../../src/lib/depuracion.js')
  assert.deepEqual(PLAZAS_PAGINA, PLAZAS_CON_STOCK, 'las dos listas de plazas son la misma')

  const hoyLocal = new Date(2026, 10, 9, 12, 0, 0)
  const casos = [
    ['limpio',          red({ aguascalientes: plaza([muerto('C')]) })],
    ['con pieza',       red({ aguascalientes: plaza([muerto('C', { Existencia: 2 })]) })],
    ['pieza en torreón', red({ torreon: plaza([muerto('C', { Existencia: 1 })]) })],
    ['venta reciente',  red({ leon: plaza([muerto('C', { UltimaVenta: hace(100) })]) })],
    ['venta en 365',    red({ leon: plaza([muerto('C', { UltimaVenta: hace(365) })]) })],
    ['venta en 366',    red({ leon: plaza([muerto('C', { UltimaVenta: hace(366) })]) })],
    ['nunca vendido',   red({ leon: plaza([(() => { const m = muerto('C'); delete m.UltimaVenta; return m })()]) })],
    ['nuevo',           red({ leon: plaza([muerto('C', { Alta: hace(100), UltimaVenta: undefined })]) })],
    ['sin alta',        red({ leon: plaza([(() => { const m = muerto('C'); delete m.Alta; return m })()]) })],
    ['sin torreón',     red({ torreon: null, leon: plaza([muerto('C')]) })],
    ['sin ferias',      red({ ferias: null, leon: plaza([muerto('C')]) })],
    ['plaza sin venta', red({ leon: plaza([muerto('C')], { publicaVenta: false }) })],
    ['no existe',       red()],
  ]

  for (const [nombre, inventarios] of casos) {
    for (const dias of [365, 730]) {
      const servidor = verificarBajas({ codigos: ['C'], inventarios, dias, hoy: HOY }).resultados[0]

      const cat = reunirCatalogo({ inventarios, hoy: hoyLocal })
      const fila = cat.filas.find(f => f.codigo === 'C')
      // Un código que no existe en ninguna caja no tiene renglón en la página:
      // para ella tampoco se puede.
      const paginaOk = fila
        ? razonesDeBloqueo(fila, { dias, plazasSinInventario: cat.plazasSinInventario, plazasSinVenta: cat.plazasSinVenta }).length === 0
        : false

      assert.equal(servidor.ok, paginaOk,
        `«${nombre}» con ${dias} días: el servidor dice ${servidor.ok} y la página ${paginaOk} (${servidor.motivos.join(' | ')})`)
    }
  }
})

// ── La ruta ─────────────────────────────────────────────────────────────────

const pedir = (metodo, ruta, { cuerpo, token } = {}) => handler({
  rawPath: ruta,
  requestContext: { http: { method: metodo, sourceIp: '1.2.3.4' } },
  headers: { origin: ORIGEN, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: cuerpo ? JSON.stringify(cuerpo) : undefined,
})
const tokenAdmin  = () => crearSesion({ sucursal: 'leon', admin: true }, SECRETO)
const tokenLeon   = () => crearSesion({ sucursal: 'leon', admin: false }, SECRETO)
const tokenBodega = () => crearSesion({ sucursal: 'bodega', admin: false }, SECRETO)

/** Un S3 de memoria con los archivos que se le siembren. */
function s3ConArchivos(sembrados = {}) {
  const archivos = new Map(Object.entries(sembrados).map(([k, v]) => [k, JSON.stringify(v)]))
  const puestos = []
  const original = S3Client.prototype.send
  S3Client.prototype.send = async function (cmd) {
    const clave = cmd.input?.Key
    const nombre = cmd.constructor?.name ?? ''
    if (nombre.startsWith('Put')) {
      archivos.set(clave, Buffer.from(cmd.input.Body).toString('utf8'))
      puestos.push(clave)
      return {}
    }
    if (nombre.startsWith('Get')) {
      if (!archivos.has(clave)) throw new Error('NoSuchKey')
      const texto = archivos.get(clave)
      return { Body: { transformToString: async () => texto } }
    }
    return {}
  }
  return {
    leer: clave => JSON.parse(archivos.get(clave) ?? '{}'),
    puestos,
    restaurar: () => { S3Client.prototype.send = original },
  }
}

/** Los inventarios de las seis plazas, como los archivos de S3. */
const archivosDe = inventarios => Object.fromEntries(
  Object.entries(inventarios).filter(([, v]) => v).map(([slug, v]) => [`inventarios/${slug}/inventario.json`, v]))

test('LA BAJA DEFINITIVA es sólo del administrador', async () => {
  assert.equal((await pedir('POST', '/ajustes/bajas', { cuerpo: { codigos: ['X'] } })).statusCode, 403, 'sin sesión')
  assert.equal((await pedir('POST', '/ajustes/bajas', { token: tokenLeon(), cuerpo: { codigos: ['X'] } })).statusCode, 403, 'una tienda')
  assert.equal((await pedir('POST', '/ajustes/bajas', { token: tokenBodega(), cuerpo: { codigos: ['X'] } })).statusCode, 403, 'bodega tampoco')
})

test('sin códigos, o demasiados, no se hace nada', async () => {
  const s3 = s3ConArchivos(archivosDe(red()))
  try {
    assert.equal((await pedir('POST', '/ajustes/bajas', { token: tokenAdmin(), cuerpo: {} })).statusCode, 400)
    assert.equal((await pedir('POST', '/ajustes/bajas', { token: tokenAdmin(), cuerpo: { codigos: [] } })).statusCode, 400)
    const muchos = Array.from({ length: 501 }, (_, i) => `C${i}`)
    assert.equal((await pedir('POST', '/ajustes/bajas', { token: tokenAdmin(), cuerpo: { codigos: muchos } })).statusCode, 400)
    assert.equal(s3.puestos.length, 0)
  } finally { s3.restaurar() }
})

test('FALTA EL INVENTARIO DE UNA PLAZA: 409 y NO se escribe nada', async () => {
  // Torreón hoy. Aunque el código cumpla todo lo demás.
  const s3 = s3ConArchivos(archivosDe(red({ torreon: null, aguascalientes: plaza([muerto('M1')]) })))
  try {
    const r = await pedir('POST', '/ajustes/bajas', { token: tokenAdmin(), cuerpo: { codigos: ['M1'] } })
    assert.equal(r.statusCode, 409)
    const d = JSON.parse(r.body)
    assert.deepEqual(d.plazasSinInventario, ['torreon'])
    assert.equal(s3.puestos.length, 0, 'no se escribe NADA')
  } finally { s3.restaurar() }
})

test('SE REGISTRAN LOS QUE PASAN Y VUELVEN CON MOTIVOS LOS QUE NO', async () => {
  const s3 = s3ConArchivos(archivosDe(red({
    aguascalientes: plaza([
      muerto('BUENO'),
      muerto('CONPIEZAS', { Existencia: 4 }),
      muerto('RECIENTE', { UltimaVenta: hace(30) }),
    ]),
  })))
  try {
    const r = await pedir('POST', '/ajustes/bajas', {
      token: tokenAdmin(), cuerpo: { codigos: ['BUENO', 'CONPIEZAS', 'RECIENTE', 'FANTASMA'], dias: 30 },
    })
    assert.equal(r.statusCode, 200)
    const d = JSON.parse(r.body)
    assert.equal(d.dias, 365, 'el piso no se baja')
    assert.deepEqual(d.aceptados.map(a => a.codigo), ['BUENO'])
    assert.deepEqual(d.rechazados.map(x => x.codigo).sort(), ['CONPIEZAS', 'FANTASMA', 'RECIENTE'])
    assert.ok(d.rechazados.find(x => x.codigo === 'CONPIEZAS').motivos.some(m => /tiene 4 piezas/.test(m)))

    // Quedó apuntado como una baja normal, con el motivo propio, a nombre de
    // quien la pidió —lo pone el servidor—.
    const guardado = s3.leer('ajustes/admin.json')
    assert.deepEqual(Object.keys(guardado), ['ocultar|BUENO'])
    assert.equal(guardado['ocultar|BUENO'].motivo, 'baja-definitiva')
    assert.equal(guardado['ocultar|BUENO'].tipo, 'ocultar')
    assert.ok(!Number.isNaN(Date.parse(guardado['ocultar|BUENO'].cuando)))
  } finally { s3.restaurar() }
})

test('NO SE PUEDE SALTAR EL CANDADO por la ruta genérica de ajustes', async () => {
  // Si la baja definitiva fuera un motivo más de `/ajustes`, bastaría mandarlo
  // ahí para registrar una baja sin que nadie mirara la existencia.
  const s3 = s3ConArchivos()
  try {
    const r = await pedir('POST', '/ajustes', {
      token: tokenAdmin(), cuerpo: { tipo: 'ocultar', codigo: 'CONPIEZAS', motivo: 'baja-definitiva' },
    })
    assert.equal(r.statusCode, 400)
    assert.match(JSON.parse(r.body).error, /\/ajustes\/bajas/)
    assert.equal(s3.puestos.length, 0)
  } finally { s3.restaurar() }
})

test('lo que bodega descontinuó: lo marcan administración y bodega, nadie más', async () => {
  const s3 = s3ConArchivos()
  try {
    const marcar = token => pedir('POST', '/ajustes', {
      token, cuerpo: { tipo: 'descontinuado', codigo: 'LGQ6T', motivo: 'bodega-descontinuo', producto: 'LG Q6 TPU CASE' },
    })
    assert.equal((await marcar(tokenLeon())).statusCode, 403, 'una tienda no decide qué descontinuó bodega')
    assert.equal(s3.puestos.length, 0)

    assert.equal((await marcar(tokenBodega())).statusCode, 200)
    assert.equal((await marcar(tokenAdmin())).statusCode, 200)
    const g = s3.leer('ajustes/bodega.json')['descontinuado|LGQ6T']
    assert.equal(g.tipo, 'descontinuado')
    assert.equal(g.motivo, 'bodega-descontinuo')
  } finally { s3.restaurar() }
})

test('el motivo tiene que ser el del tipo: no se mezclan', async () => {
  const s3 = s3ConArchivos()
  try {
    // «descontinuado» sólo con su motivo…
    assert.equal((await pedir('POST', '/ajustes', {
      token: tokenAdmin(), cuerpo: { tipo: 'descontinuado', codigo: 'X', motivo: 'dado-de-baja' },
    })).statusCode, 400)
    // …y el motivo de descontinuado no vale para ocultar.
    assert.equal((await pedir('POST', '/ajustes', {
      token: tokenAdmin(), cuerpo: { tipo: 'ocultar', codigo: 'X', motivo: 'bodega-descontinuo' },
    })).statusCode, 400)
    // Quitar la marca (motivo nulo) sí.
    assert.notEqual((await pedir('POST', '/ajustes', {
      token: tokenAdmin(), cuerpo: { tipo: 'descontinuado', codigo: 'X', motivo: null },
    })).statusCode, 400)
  } finally { s3.restaurar() }
})

test('MARCAR VARIOS EN UNA PETICIÓN no pierde ninguno', async () => {
  // Cada petición lee el archivo, lo modifica y lo reescribe entero: varias
  // simultáneas se pisan y la última gana. En una sola se escribe una vez.
  const s3 = s3ConArchivos()
  try {
    const items = Array.from({ length: 40 }, (_, i) => ({ codigo: `lg${i}`, producto: `LG ${i} TPU CASE` }))
    const r = await pedir('POST', '/ajustes', {
      token: tokenAdmin(), cuerpo: { tipo: 'descontinuado', motivo: 'bodega-descontinuo', items },
    })
    assert.equal(r.statusCode, 200)
    assert.equal(JSON.parse(r.body).cantidad, 40)
    const g = s3.leer('ajustes/admin.json')
    assert.equal(Object.keys(g).length, 40, 'se guardaron los cuarenta')
    assert.ok(g['descontinuado|LG7'], 'y con el código normalizado')
    assert.equal(s3.puestos.filter(k => k === 'ajustes/admin.json').length, 1, 'con UNA sola escritura')

    // Y quitar el mismo lote también es uno solo.
    await pedir('POST', '/ajustes', {
      token: tokenAdmin(), cuerpo: { tipo: 'descontinuado', motivo: null, items: items.slice(0, 10) },
    })
    assert.equal(Object.keys(s3.leer('ajustes/admin.json')).length, 30)
  } finally { s3.restaurar() }
})

test('un lote con un motivo malo no deja NADA guardado a medias', async () => {
  const s3 = s3ConArchivos()
  try {
    const r = await pedir('POST', '/ajustes', {
      token: tokenAdmin(),
      cuerpo: { tipo: 'ocultar', motivo: 'baja-definitiva', items: [{ codigo: 'A' }, { codigo: 'B' }] },
    })
    assert.equal(r.statusCode, 400)
    assert.equal(s3.puestos.length, 0)

    const sinCodigo = await pedir('POST', '/ajustes', {
      token: tokenAdmin(), cuerpo: { tipo: 'ocultar', motivo: 'otro', items: [{ codigo: 'A' }, { codigo: '' }] },
    })
    assert.equal(sinCodigo.statusCode, 400)
    assert.equal(s3.puestos.length, 0, 'un renglón sin código invalida el lote entero')

    const muchos = Array.from({ length: 501 }, (_, i) => ({ codigo: `C${i}` }))
    assert.equal((await pedir('POST', '/ajustes', {
      token: tokenAdmin(), cuerpo: { tipo: 'ocultar', motivo: 'otro', items: muchos },
    })).statusCode, 400)
  } finally { s3.restaurar() }
})

test('una tienda no puede marcar un lote de descontinuados', async () => {
  const s3 = s3ConArchivos()
  try {
    const r = await pedir('POST', '/ajustes', {
      token: tokenLeon(),
      cuerpo: { tipo: 'descontinuado', motivo: 'bodega-descontinuo', items: [{ codigo: 'A' }] },
    })
    assert.equal(r.statusCode, 403)
    assert.equal(s3.puestos.length, 0)
  } finally { s3.restaurar() }
})
