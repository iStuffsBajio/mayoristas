// El corte semanal de cada sucursal.
//
// Dos cosas se fijan aquí y la segunda pesa más que la primera:
//
//   1. Que una tienda pueda guardar SU conteo, con el total calculado por el
//      servidor y un renglón de historial por cada cambio.
//   2. Que una tienda NO pueda ver nada de otra, ni los nombres de quien cerró
//      turno ni de quien cobró, ni la lista de mayoristas de otra plaza. El
//      dueño lo dijo así: «el ranking sólo pueden ver el de su sucursal; el
//      único que puede ver todas es admin».

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
const C = await import('../src/cortes.js')
const { hoyMexico } = await import('../src/bajas.js')

const pedir = (metodo, ruta, { cuerpo, token, query } = {}) => handler({
  rawPath: ruta,
  requestContext: { http: { method: metodo, sourceIp: '1.2.3.4' } },
  headers: { origin: ORIGEN, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  queryStringParameters: query,
  body: cuerpo ? JSON.stringify(cuerpo) : undefined,
})
const token = (sucursal, admin = false) => crearSesion({ sucursal, admin }, SECRETO)
const tokenLeon = () => token('leon')
const tokenSlp = () => token('san-luis')
const tokenTorreon = () => token('torreon')
const tokenBodega = () => token('bodega')
const tokenAdmin = () => token('leon', true)

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

// Una semana que SÍ ha empezado: el lunes de hoy.
const LUNES = C.lunesDe(hoyMexico())

// ── Los datos de prueba: con nombres de personas a propósito ────────────────

const hoy = hoyMexico()
const archivosDePrueba = () => ({
  'caja/leon.json': {
    respaldo: { fecha: hoy },
    dias: [
      { f: hoy, efectivo: 1000, tarjeta: 600, nVentas: 9, arqueo: 1000, cajero: 'CAJERA SECRETA LEON' },
    ],
    movimientos: [
      { f: hoy, tipo: 'otra-salida', monto: 100, concepto: 'garrafón', quien: 'OTRO SECRETO' },
      { f: hoy, tipo: 'faltante', monto: 300, persona: 'FALTANTE SECRETO', concepto: 'faltante' },
    ],
    faltantes: [{ f: hoy, monto: 300, persona: 'FALTANTE SECRETO' }],
  },
  'caja/san-luis.json': {
    dias: [{ f: hoy, efectivo: 7777, cajero: 'CAJERA DE SAN LUIS' }],
    movimientos: [],
  },
  'caja/parametros.json': {
    leon: { fondoFijo: 500, desdeControlSalidas: '2026-11-02', cuenta: 'CUENTA BANCARIA SECRETA', responsable: 'ALGUIEN' },
    'san-luis': { fondoFijo: 900 },
  },
  'ventas/leon.json': {
    detalleDias: 120, hasta: hoy,
    porDiaTipo: [{ f: hoy, fundas: 3, hidrogel: 4, stickers: 10, otros: 1 }],
    mayoristasPorDia: [{ f: hoy, quien: 'LOCAL 12 LEON', tickets: 1, piezas: 5, dinero: 500 }],
    mayoristas: [{ quien: 'LOCAL 12 LEON', tickets: 30, piezas: 0, dinero: 0, ultima: hoy }],
    cajeros: [{ cajero: 'CAJERO SECRETO', tickets: 9 }],
    porCodigo: { X: { producto: 'PRODUCTO SECRETO' } },
  },
  'ventas/san-luis.json': {
    detalleDias: 120, porDiaTipo: [],
    mayoristasPorDia: [{ f: hoy, quien: 'CLIENTE DE SAN LUIS', tickets: 1, piezas: 1, dinero: 1 }],
    mayoristas: [{ quien: 'CLIENTE DE SAN LUIS', tickets: 1, ultima: hoy }],
  },
})

const TEXTO = r => r.body

// ── Qué ve cada quien ───────────────────────────────────────────────────────

test('UNA TIENDA VE SÓLO SU PLAZA', async () => {
  const s3 = s3ConArchivos(archivosDePrueba())
  try {
    const r = await pedir('GET', '/corte', { token: tokenLeon() })
    assert.equal(r.statusCode, 200)
    const d = JSON.parse(r.body)
    assert.deepEqual(Object.keys(d.plazas), ['leon'])
    assert.equal(d.plazas.leon.parametros.fondoFijo, 500)
    assert.equal(d.plazas.leon.ventas.porDiaTipo[0].fundas, 3)
    assert.equal(d.plazas.leon.caja.dias[0].efectivo, 1000)
  } finally { s3.restaurar() }
})

test('UNA TIENDA NO VE LO DE OTRA: ni pidiéndolo, ni pidiendo «todas»', async () => {
  const s3 = s3ConArchivos(archivosDePrueba())
  try {
    assert.equal((await pedir('GET', '/corte', { token: tokenLeon(), query: { plaza: 'san-luis' } })).statusCode, 403)
    assert.equal((await pedir('GET', '/corte', { token: tokenLeon(), query: { plaza: 'todas' } })).statusCode, 403)
    assert.equal((await pedir('GET', '/corte', { token: tokenSlp(), query: { plaza: 'leon' } })).statusCode, 403)
    assert.equal((await pedir('GET', '/corte')).statusCode, 403, 'sin sesión')
    // Bodega no es una tienda.
    assert.equal((await pedir('GET', '/corte', { token: tokenBodega() })).statusCode, 400)
    assert.equal((await pedir('GET', '/corte', { token: tokenBodega(), query: { plaza: 'leon' } })).statusCode, 403)
    // Una plaza que no lleva corte.
    assert.equal((await pedir('GET', '/corte', { token: tokenAdmin(), query: { plaza: 'ferias' } })).statusCode, 400)
    assert.equal((await pedir('GET', '/corte', { token: tokenAdmin(), query: { plaza: 'inventada' } })).statusCode, 400)
  } finally { s3.restaurar() }
})

test('LO QUE RECIBE UNA TIENDA NO LLEVA NOMBRES: ni cajeros, ni faltantes, ni otras plazas', async () => {
  const s3 = s3ConArchivos(archivosDePrueba())
  try {
    const r = await pedir('GET', '/corte', { token: tokenLeon() })
    const t = TEXTO(r)
    for (const secreto of [
      'CAJERA SECRETA LEON', 'OTRO SECRETO', 'FALTANTE SECRETO', 'CAJERO SECRETO', 'PRODUCTO SECRETO',
      'CUENTA BANCARIA SECRETA', 'ALGUIEN', 'CAJERA DE SAN LUIS', 'CLIENTE DE SAN LUIS', '7777',
    ]) {
      assert.ok(!t.includes(secreto), `se coló «${secreto}»`)
    }
    const d = JSON.parse(t).plazas.leon
    assert.ok(!('faltantes' in d.caja), 'el archivo de faltantes no sale')
    assert.ok(!d.caja.movimientos.some(m => m.tipo === 'faltante'), 'ni un faltante entre los movimientos')
    assert.ok(d.caja.dias.every(x => !('cajero' in x) && !('arqueo' in x)))
    // Y lo que SÍ es suyo, sí: sus propios mayoristas.
    assert.equal(d.ventas.mayoristasPorDia[0].quien, 'LOCAL 12 LEON')
    assert.equal(d.ventas.mayoristas[0].quien, 'LOCAL 12 LEON')
    assert.equal(d.caja.movimientos[0].concepto, 'garrafón')
  } finally { s3.restaurar() }
})

test('SÓLO EL ADMINISTRADOR VE TODAS LAS PLAZAS, y es lo que recibe por defecto', async () => {
  const s3 = s3ConArchivos(archivosDePrueba())
  try {
    const d = JSON.parse((await pedir('GET', '/corte', { token: tokenAdmin() })).body)
    assert.deepEqual(Object.keys(d.plazas).sort(), ['aguascalientes', 'leon', 'san-luis', 'torreon'])
    assert.equal(d.plazas['san-luis'].ventas.mayoristas[0].quien, 'CLIENTE DE SAN LUIS')
    const una = JSON.parse((await pedir('GET', '/corte', { token: tokenAdmin(), query: { plaza: 'san-luis' } })).body)
    assert.deepEqual(Object.keys(una.plazas), ['san-luis'])
  } finally { s3.restaurar() }
})

test('una plaza sin archivo dice que no hay datos, no que no vendió', async () => {
  const s3 = s3ConArchivos({})
  try {
    const d = JSON.parse((await pedir('GET', '/corte', { token: tokenTorreon() })).body).plazas.torreon
    assert.equal(d.caja.hayDatos, false)
    assert.deepEqual(d.caja.dias, [])
    assert.equal(d.parametros.fondoFijo, null, 'sin fondo: null, no cero')
  } finally { s3.restaurar() }
})

// ── Guardar el conteo ───────────────────────────────────────────────────────

const guardar = (cuerpo, tok = tokenLeon()) =>
  pedir('POST', '/corte/conteo', { token: tok, cuerpo: { plaza: 'leon', semana: LUNES, ...cuerpo } })

test('UNA TIENDA GUARDA SU CONTEO, y el total lo calcula el servidor', async () => {
  const s3 = s3ConArchivos()
  try {
    const r = await guardar({ cantidades: { 500: 2, 200: 1, 100: 3, 1: 7 }, total: 99999 })
    assert.equal(r.statusCode, 200)
    const g = s3.leer('cortes/leon.json')[LUNES]
    assert.equal(g.total, 1000 + 200 + 300 + 7, 'el total que mande el navegador no cuenta')
    assert.deepEqual(g.cantidades, { 500: 2, 200: 1, 100: 3, 1: 7 })
    assert.equal(g.quien, 'leon', 'el autor lo pone el servidor')
    assert.ok(!Number.isNaN(Date.parse(g.cuando)))
    assert.equal(g.historial.length, 1)
  } finally { s3.restaurar() }
})

test('UNA TIENDA NO GUARDA EL CONTEO DE OTRA', async () => {
  const s3 = s3ConArchivos()
  try {
    const r = await pedir('POST', '/corte/conteo', {
      token: tokenSlp(), cuerpo: { plaza: 'leon', semana: LUNES, cantidades: { 1: 1 } },
    })
    assert.equal(r.statusCode, 403)
    assert.equal(s3.puestos.length, 0)
    assert.equal((await pedir('POST', '/corte/conteo', { cuerpo: { plaza: 'leon', semana: LUNES, cantidades: {} } })).statusCode, 403, 'sin sesión')
    // El administrador sí.
    assert.equal((await guardar({ cantidades: { 1: 5 } }, tokenAdmin())).statusCode, 200)
    assert.equal(s3.leer('cortes/leon.json')[LUNES].quien, 'admin')
  } finally { s3.restaurar() }
})

test('un conteo inválido se rechaza ENTERO, no a medias', async () => {
  const s3 = s3ConArchivos()
  try {
    for (const cantidades of [
      null, [], 'mucho', { 1000: 1 }, { 500: -1 }, { 500: 1.5 }, { 500: 'dos' }, { 500: 100001 }, { abc: 1 },
    ]) {
      const r = await guardar({ cantidades })
      assert.equal(r.statusCode, 400, JSON.stringify(cantidades))
    }
    assert.equal(s3.puestos.length, 0, 'no se guardó nada, ni siquiera lo bueno')
  } finally { s3.restaurar() }
})

test('la semana se identifica por su lunes, y no puede ser futura ni anterior al corte', async () => {
  const s3 = s3ConArchivos()
  try {
    const martes = new Date(`${LUNES}T00:00:00Z`); martes.setUTCDate(martes.getUTCDate() + 1)
    assert.equal((await guardar({ semana: martes.toISOString().slice(0, 10), cantidades: { 1: 1 } })).statusCode, 400, 'un martes')
    assert.equal((await guardar({ semana: 'ayer', cantidades: { 1: 1 } })).statusCode, 400)
    assert.equal((await guardar({ semana: '2026-02-30', cantidades: { 1: 1 } })).statusCode, 400, 'una fecha que no existe')
    const proxima = new Date(`${LUNES}T00:00:00Z`); proxima.setUTCDate(proxima.getUTCDate() + 7)
    assert.equal((await guardar({ semana: proxima.toISOString().slice(0, 10), cantidades: { 1: 1 } })).statusCode, 400, 'la próxima semana')
    assert.equal((await guardar({ semana: '2026-10-26', cantidades: { 1: 1 } })).statusCode, 400, 'antes del 2 de noviembre')
    assert.equal(s3.puestos.length, 0)
  } finally { s3.restaurar() }
})

test('CADA CAMBIO DEJA UN RENGLÓN, y guardar lo mismo dos veces no', async () => {
  const s3 = s3ConArchivos()
  try {
    await guardar({ cantidades: { 500: 1 } })
    await guardar({ cantidades: { 500: 1 } })
    assert.equal(s3.leer('cortes/leon.json')[LUNES].historial.length, 1, 'lo mismo no apunta otro renglón')
    assert.equal(s3.puestos.length, 1, 'ni escribe otra vez')

    await guardar({ cantidades: { 500: 1, 100: 2 } })
    await guardar({ cantidades: { 500: 1, 100: 2 }, observaciones: 'faltó un billete de 50' })
    const h = s3.leer('cortes/leon.json')[LUNES].historial
    assert.deepEqual(h.map(x => x.total), [500, 700, 700])
    assert.equal(h[2].observaciones, 'faltó un billete de 50')
    // El conteo vigente es el último.
    assert.equal(s3.leer('cortes/leon.json')[LUNES].total, 700)
  } finally { s3.restaurar() }
})

test('cada plaza guarda en su propio archivo y no se pisan', async () => {
  const s3 = s3ConArchivos()
  try {
    await guardar({ cantidades: { 1: 100 } })
    await pedir('POST', '/corte/conteo', { token: tokenSlp(), cuerpo: { plaza: 'san-luis', semana: LUNES, cantidades: { 1: 200 } } })
    assert.equal(s3.leer('cortes/leon.json')[LUNES].total, 100)
    assert.equal(s3.leer('cortes/san-luis.json')[LUNES].total, 200)
  } finally { s3.restaurar() }
})

test('un conteo guardado vuelve en /corte para esa plaza', async () => {
  const s3 = s3ConArchivos(archivosDePrueba())
  try {
    await guardar({ cantidades: { 500: 2 } })
    const d = JSON.parse((await pedir('GET', '/corte', { token: tokenLeon() })).body)
    assert.equal(d.plazas.leon.conteos[LUNES].total, 1000)
  } finally { s3.restaurar() }
})

// ── La paridad con la página ────────────────────────────────────────────────

test('LAS DENOMINACIONES Y EL TOTAL SON LOS MISMOS en la página y en el servidor', async () => {
  const pagina = await import('../../src/lib/corte.js')
  assert.deepEqual(C.DENOMINACIONES, pagina.DENOMINACIONES)
  assert.deepEqual(C.PLAZAS_CORTE, pagina.PLAZAS_CORTE.map(p => p.slug))
  for (const cantidades of [{ 500: 2, 1: 7 }, {}, { 200: 3, 100: 1, 5: 9, 2: 4 }, { 1: 100000 }]) {
    assert.equal(C.validarConteo(cantidades).total, pagina.totalContado(cantidades), JSON.stringify(cantidades))
  }
})

test('funciones puras: lunes, fechas y recortes', () => {
  assert.equal(C.esLunes('2026-11-09'), true)
  assert.equal(C.esLunes('2026-11-10'), false)
  assert.equal(C.lunesDe('2026-11-15'), '2026-11-09', 'el domingo es de la semana que empezó el lunes anterior')
  assert.equal(C.lunesDe('2026-11-09'), '2026-11-09')
  assert.equal(C.esFecha('2026-02-29'), false)
  assert.equal(C.esFecha('2028-02-29'), true)
  assert.deepEqual(C.validarConteo({ 500: '2', 200: '' }), { cantidades: { 500: 2 }, total: 1000 })
  assert.equal(C.ventasParaTienda(null).porDiaTipo.length, 0)
  assert.deepEqual(C.parametrosParaTienda({ fondoFijo: 500, cuenta: 'x' }), { fondoFijo: 500, desdeControlSalidas: null })
})

// ── El fondo de caja lo asigna el administrador, y sólo toca el fondo ───────

test('el administrador asigna el fondo de UNA plaza sin borrar sus otros parámetros', async () => {
  const s3 = s3ConArchivos({
    'caja/parametros.json': { leon: { fondoFijo: 500, cuenta: '****1234', responsable: 'Dani', tolerancia: 50, desdeControlSalidas: '2026-11-05' } },
  })
  try {
    const r = await pedir('POST', '/caja/fondo', { token: tokenAdmin(), cuerpo: { sucursal: 'leon', fondoFijo: 1500 } })
    assert.equal(r.statusCode, 200)
    const p = s3.leer('caja/parametros.json').leon
    assert.equal(p.fondoFijo, 1500)
    assert.equal(p.cuenta, '****1234', 'la cuenta sigue')
    assert.equal(p.responsable, 'Dani')
    assert.equal(p.desdeControlSalidas, '2026-11-05')

    // Torreón, que no tenía nada, recibe el suyo.
    assert.equal((await pedir('POST', '/caja/fondo', { token: tokenAdmin(), cuerpo: { sucursal: 'torreon', fondoFijo: '800' } })).statusCode, 200)
    assert.equal(s3.leer('caja/parametros.json').torreon.fondoFijo, 800)

    // Vacío es «sin capturar»: null, nunca cero.
    await pedir('POST', '/caja/fondo', { token: tokenAdmin(), cuerpo: { sucursal: 'leon', fondoFijo: '' } })
    assert.equal(s3.leer('caja/parametros.json').leon.fondoFijo, null)
  } finally { s3.restaurar() }
})

test('una tienda NO asigna fondo, ni el suyo; y un fondo raro se rechaza', async () => {
  const s3 = s3ConArchivos({ 'caja/parametros.json': {} })
  try {
    assert.equal((await pedir('POST', '/caja/fondo', { token: tokenLeon(), cuerpo: { sucursal: 'leon', fondoFijo: 1 } })).statusCode, 403)
    assert.equal((await pedir('POST', '/caja/fondo', { cuerpo: { sucursal: 'leon', fondoFijo: 1 } })).statusCode, 403)
    assert.equal((await pedir('POST', '/caja/fondo', { token: tokenAdmin(), cuerpo: { sucursal: 'narnia', fondoFijo: 1 } })).statusCode, 400)
    assert.equal((await pedir('POST', '/caja/fondo', { token: tokenAdmin(), cuerpo: { sucursal: 'leon', fondoFijo: -5 } })).statusCode, 400)
    assert.equal((await pedir('POST', '/caja/fondo', { token: tokenAdmin(), cuerpo: { sucursal: 'leon', fondoFijo: 'mil' } })).statusCode, 400)
    assert.equal(s3.puestos.length, 0, 'nada rechazado se escribió')
  } finally { s3.restaurar() }
})

// ── Las reglas de mayoreo: la tienda las ve sin quién cobró ─────────────────

test('las incidencias de mayoreo llegan a la tienda SIN cajero, y al administrador con él', () => {
  const ventas = {
    reglasMayoreo: { dias: 120, desde: '2026-07-13', total: 1, incidencias: [
      { f: '2026-11-09', hora: '12:30', folio: '101', cajero: 'daniela coronilla', mayorista: 'ANA (1001)', piezas: 3, etiquetas: 2, motivos: ['etiquetas-no-cuadran'] },
    ] },
    cobrosElectronicos: { dias: 120, filas: [{ f: '2026-11-09', hora: '13:00', folio: '102', forma: 't', total: '250', referencia: 'BBVA 1234', cajero: 'x' }] },
  }
  const tienda = C.ventasParaTienda(ventas)
  assert.equal(tienda.reglasMayoreo.incidencias[0].cajero, undefined)
  assert.ok(!JSON.stringify(tienda).includes('daniela'))
  assert.equal(tienda.cobrosElectronicos.filas[0].total, 250)
  assert.equal(tienda.cobrosElectronicos.filas[0].cajero, undefined)
  assert.equal(C.ventasParaTienda(ventas, { conCajero: true }).reglasMayoreo.incidencias[0].cajero, 'daniela coronilla')
  // Sin extraer todavía: null, no una lista vacía que diría «ninguna».
  assert.equal(C.ventasParaTienda({}).reglasMayoreo, null)
  assert.equal(C.ventasParaTienda({}).cobrosElectronicos, null)
})
