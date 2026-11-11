// La nómina del lado del servidor. Lo que se fija aquí:
//
//   1. Una tienda ve SÓLO su plaza y nada de RH: ni fechas de ingreso, ni
//      vacaciones, ni lo de otra sucursal. Bodega, nada.
//   2. Sólo el administrador escribe, y todo lo que escribe deja bitácora.
//   3. Una comisión autorizada sale de la caja como «Comisiones de ‹nombre›».

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashearContrasena, crearSesion } from '../src/seguridad.js'
import { S3Client } from '@aws-sdk/client-s3'

const ORIGEN = 'https://ejemplo.test'
const SECRETO = 'secreto-de-pruebas-suficientemente-largo'
process.env.S3_BUCKET = 'bucket-de-pruebas'
process.env.S3_REGION = 'us-east-1'
process.env.SESION_SECRETO = SECRETO
process.env.ORIGENES_PERMITIDOS = ORIGEN
process.env.HASH_ADMIN = hashearContrasena('clave-admin')

const { handler } = await import('../src/index.js')
const N = await import('../src/nomina.js')

const pedir = (metodo, ruta, { cuerpo, token, query } = {}) => handler({
  rawPath: ruta,
  requestContext: { http: { method: metodo, sourceIp: '1.2.3.4' } },
  headers: { origin: ORIGEN, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  queryStringParameters: query,
  body: cuerpo ? JSON.stringify(cuerpo) : undefined,
})
const token = (sucursal, admin = false) => crearSesion({ sucursal, admin }, SECRETO)
const cuerpoDe = r => JSON.parse(r.body)

function s3ConArchivos(sembrados = {}) {
  const archivos = new Map(Object.entries(sembrados).map(([k, v]) => [k, JSON.stringify(v)]))
  const puestos = []
  const original = S3Client.prototype.send
  S3Client.prototype.send = async function (cmd) {
    const clave = cmd.input?.Key
    const nombre = cmd.constructor?.name ?? ''
    if (nombre.startsWith('Put')) {
      archivos.set(clave, Buffer.isBuffer(cmd.input.Body) ? cmd.input.Body.toString('utf8') : String(cmd.input.Body))
      puestos.push(clave)
      return {}
    }
    if (nombre.startsWith('Get')) {
      if (!archivos.has(clave)) throw new Error('NoSuchKey')
      const texto = archivos.get(clave)
      return { Body: { transformToString: async () => texto, transformToByteArray: async () => Buffer.from(texto) } }
    }
    return {}
  }
  return {
    leer: clave => JSON.parse(archivos.get(clave) ?? '{}'),
    puestos,
    restaurar: () => { S3Client.prototype.send = original },
  }
}

const CONFIG = { empleados: N.EMPLEADOS_INICIALES, parametros: null }
const conIngreso = structuredClone(N.EMPLEADOS_INICIALES).map(e => ({ ...e, personas: e.personas.map(p => ({ ...p, ingreso: '2024-02-01', diasVacaciones: 16 })) }))

// ── limpiarConfig ─────────────────────────────────────────────────────────

const PARAMS = {
  pctComision: 0.07, categorias: { funda: true, hidrogel: true, sticker: true },
  minimos: { funda: 220, hidrogel: 120, sticker: 100 }, maximos: {}, tolerancia: { leon: 10 }, horarios: { leon: { 1: '10:30' } },
}

test('la configuración se valida entera: lo raro se rechaza, no se arregla', () => {
  assert.ok(N.limpiarConfig({ empleados: N.EMPLEADOS_INICIALES, parametros: PARAMS }).config)
  const malo = (cambio, msg) => {
    const empleados = structuredClone(N.EMPLEADOS_INICIALES)
    Object.assign(empleados[0], cambio)
    assert.ok(N.limpiarConfig({ empleados, parametros: PARAMS }).error, msg)
  }
  malo({ sueldo: -5 }, 'sueldo negativo')
  malo({ plaza: 'ferias' }, 'Ferias no lleva nómina')
  malo({ dias: [0, 8] }, 'día que no existe')
  malo({ id: 'Brenda!' }, 'identificador raro')
  malo({ personas: [{ id: 'brenda', ingreso: '15/01/2024' }] }, 'fecha mal escrita')
  assert.ok(N.limpiarConfig({ empleados: [N.EMPLEADOS_INICIALES[0], N.EMPLEADOS_INICIALES[0]], parametros: PARAMS }).error, 'id repetido')
  assert.ok(N.limpiarConfig({ empleados: [], parametros: { ...PARAMS, pctComision: 0.9 } }).error, 'comisión absurda')
  assert.deepEqual(N.limpiarConfig({ empleados: [], parametros: PARAMS }).config.parametros.bonoMinutos, { completo: 20, mitad: 30 }, 'bono por minutos de arranque')
  assert.ok(N.limpiarConfig({ empleados: [], parametros: { ...PARAMS, bonoMinutos: { completo: 30, mitad: 20 } } }).error, 'la mitad por debajo del entero')
  assert.ok(N.limpiarConfig({ empleados: [], parametros: { ...PARAMS, bonoMinutos: { completo: -1, mitad: 20 } } }).error, 'minutos negativos')
  const dj = N.limpiarConfig({ empleados: N.EMPLEADOS_INICIALES, parametros: PARAMS }).config.empleados.filter(e => e.plaza === 'leon')
  assert.deepEqual(dj.map(e => [e.id, e.sueldo, e.bono, e.grupo]), [['daniela', 2000, 500, 'leon'], ['jenni', 2000, 500, 'leon']], 'Daniela y Jenni: cada una lo suyo, puntualidad compartida')
  assert.ok(N.limpiarConfig({ empleados: [{ ...N.EMPLEADOS_INICIALES[0], grupo: 'Grupo Raro!' }], parametros: PARAMS }).error, 'grupo inválido')
  assert.equal(dj.find(e => e.id === 'jenni').noAbre, true, 'Jenni no abre caja')
  assert.ok(N.limpiarConfig({ empleados: [{ ...N.EMPLEADOS_INICIALES[0], noAbre: true, grupo: null }], parametros: PARAMS }).error, 'no abre caja sin grupo: su bono no tendría con qué medirse')
  assert.ok(N.limpiarConfig({ empleados: [], parametros: { ...PARAMS, horarios: { leon: { 1: '25:00' } } } }).error, 'hora imposible')
})

test('un sueldo vacío se guarda null, nunca cero', () => {
  const empleados = structuredClone(N.EMPLEADOS_INICIALES)
  empleados[0].sueldo = ''
  assert.equal(N.limpiarConfig({ empleados, parametros: PARAMS }).config.empleados[0].sueldo, null)
})

test('la bitácora de configuración dice qué cambió, en palabras', () => {
  const despues = structuredClone(CONFIG)
  despues.empleados[0].sueldo = 2200
  despues.empleados.push({ ...despues.empleados[2], id: 'nuevo', nombre: 'Nueva Persona' })
  const c = N.cambiosDeConfig(CONFIG, despues)
  assert.ok(c.some(x => /Brenda Rangel: sueldo 2000 → 2200/.test(x)))
  assert.ok(c.some(x => /alta de Nueva Persona/.test(x)))
})

// ── Lo que ve una tienda ──────────────────────────────────────────────────

test('una tienda ve sólo su plaza, sin fechas de ingreso ni vacaciones', () => {
  const estado = {
    vacaciones: [{ id: 'v', persona: 'andrea', desde: '2026-11-10', hasta: '2026-11-11' }, { id: 'w', persona: 'brenda', desde: '2026-11-10', hasta: '2026-11-10' }],
    comisiones: { 'san-luis|1': { estado: 'autorizada', monto: 30, foto: 'abc123.jpg' }, 'leon|2': { estado: 'pendiente' } },
    justificaciones: { 'brenda|2026-11-10': { motivo: 'x' } },
  }
  const r = N.recorteTienda({ empleados: conIngreso }, estado, 'san-luis')
  assert.deepEqual(r.config.empleados.map(e => e.id), ['andrea', 'cesareo'])
  const texto = JSON.stringify(r)
  assert.ok(!/ingreso|diasVacaciones|2024-02-01/.test(texto), 'nada de antigüedad')
  assert.equal(r.estado.vacaciones, undefined)
  assert.ok(!/vacacion/i.test(texto), 'ni la palabra')
  assert.ok(!texto.includes('Brenda') && !texto.includes('leon|2'), 'nada de otra plaza')
  assert.ok(!texto.includes('abc123'), 'las fotos son del administrador')
  // Las vacaciones se vuelven días justificados: la cuenta sale igual.
  assert.equal(r.estado.justificaciones['andrea|2026-11-10'].sinDescuento, true)
  assert.equal(r.estado.justificaciones['andrea|2026-11-11'].motivo, 'Justificado')
})

// ── Acciones ──────────────────────────────────────────────────────────────

const ahora = '2026-11-11T18:00:00.000Z'

test('justificar lleva motivo y dice qué se perdona', () => {
  assert.ok(N.aplicarAccion({}, CONFIG, { accion: 'justificar', registro: 'andrea', fecha: '2026-11-11' }, { quien: 'admin', ahora }).error)
  const r = N.aplicarAccion({}, CONFIG, { accion: 'justificar', registro: 'andrea', fecha: '2026-11-11', motivo: 'Cita médica', sueldo: false }, { quien: 'admin', ahora })
  assert.deepEqual(r.estado.justificaciones['andrea|2026-11-11'], { motivo: 'Cita médica', bono: true, sueldo: false, quien: 'admin', cuando: ahora })
  assert.match(r.bitacora.detalle, /perdona bono · descuenta el día/)
  assert.equal(r.bitacora.quien, 'admin')
})

test('rechazar una comisión lleva motivo; autorizar guarda el monto y pide rehacer la salida', () => {
  const item = { clave: 'san-luis|501', registro: 'andrea', lunes: '2026-11-09', monto: 28 }
  assert.ok(N.aplicarAccion({}, CONFIG, { accion: 'comision', estado: 'rechazada', items: [item] }, { quien: 'admin', ahora }).error)
  const r = N.aplicarAccion({}, CONFIG, { accion: 'comision', estado: 'autorizada', items: [item] }, { quien: 'admin', ahora })
  assert.equal(r.estado.comisiones['san-luis|501'].monto, 28)
  assert.deepEqual(r.salidas, ['andrea|2026-11-09'])
  // Una comisión de León no se le puede apuntar a alguien de San Luis.
  assert.ok(N.aplicarAccion({}, CONFIG, { accion: 'comision', estado: 'autorizada', items: [{ ...item, clave: 'leon|9' }] }, { quien: 'admin', ahora }).error)
})

test('la salida de efectivo: una por persona y semana, «Comisiones de ‹nombre›», y se borra si ya no hay nada', () => {
  const andrea = N.EMPLEADOS_INICIALES.find(e => e.id === 'andrea')
  const estado = {
    comisiones: {
      'san-luis|1': { estado: 'autorizada', monto: 28, registro: 'andrea', lunes: '2026-11-09' },
      'san-luis|2': { estado: 'autorizada', monto: 15.4, registro: 'andrea', lunes: '2026-11-09' },
      'san-luis|3': { estado: 'rechazada', monto: 99, registro: 'andrea', lunes: '2026-11-09' },
    },
    manuales: [{ id: 'm', registro: 'andrea', fecha: '2026-11-12', monto: 10 }],
  }
  const s = N.salidaDeComisiones(estado, andrea, '2026-11-09', '2026-11-11')
  assert.equal(s.mov.monto, 53.4)
  assert.equal(s.mov.concepto, 'Comisiones de Andrea Serrano Palacios')
  assert.equal(s.mov.tipo, 'otra-salida')
  assert.equal(N.salidaDeComisiones({}, andrea, '2026-11-09', '2026-11-11').borrar, true)
})

test('pagar, ajustar y vacaciones se validan', () => {
  const o = { quien: 'admin', ahora }
  assert.ok(N.aplicarAccion({}, CONFIG, { accion: 'pagar', registro: 'andrea', semana: '2026-11-10', total: 2300 }, o).error, 'la semana es un lunes')
  assert.ok(N.aplicarAccion({}, CONFIG, { accion: 'pagar', registro: 'andrea', semana: '2026-11-09', total: 2300 }, o).estado.pagos['andrea|2026-11-09'])
  assert.ok(N.aplicarAccion({}, CONFIG, { accion: 'ajuste', registro: 'andrea', semana: '2026-11-09', monto: -100 }, o).error, 'ajuste sin motivo')
  assert.ok(N.aplicarAccion({}, CONFIG, { accion: 'vacacion', persona: 'andrea', desde: '2026-12-10', hasta: '2026-12-01' }, o).error, 'fechas al revés')
  const v = N.aplicarAccion({}, CONFIG, { accion: 'vacacion', persona: 'jenni', desde: '2026-12-01', hasta: '2026-12-06', cubre: 'Daniela' }, o)
  assert.equal(v.estado.vacaciones[0].persona, 'jenni')
  assert.ok(N.aplicarAccion({}, CONFIG, { accion: 'despagar', registro: 'andrea', semana: '2026-11-09' }, o).error)
})

// ── Rutas ─────────────────────────────────────────────────────────────────

const TURNOS = { turnos: [
  { slug: 'san-luis', persona: 'andrea serrano palacios', fecha: '2026-11-10', inicio: '2026-11-10T10:20:00', ventas: 5 },
  { slug: 'leon', persona: 'daniela coronilla', fecha: '2026-11-10', inicio: '2026-11-10T10:31:00', ventas: 3 },
] }

test('GET /nomina: la tienda recibe su plaza, el administrador todo, bodega nada', async () => {
  const s3 = s3ConArchivos({ 'nomina/config.json': { empleados: conIngreso, parametros: null }, 'personal/turnos.json': TURNOS })
  try {
    const t = cuerpoDe(await pedir('GET', '/nomina', { token: token('san-luis') }))
    assert.equal(t.plaza, 'san-luis')
    assert.deepEqual(t.config.empleados.map(e => e.id), ['andrea', 'cesareo'])
    assert.deepEqual([...new Set(t.turnos.map(x => x.slug))], ['san-luis'])
    assert.ok(!JSON.stringify(t).includes('2024-02-01'), 'sin fechas de ingreso')
    assert.equal(t.bitacora, undefined, 'la bitácora es del administrador')
    const a = cuerpoDe(await pedir('GET', '/nomina', { token: token('leon', true) }))
    assert.equal(a.config.empleados.length, N.EMPLEADOS_INICIALES.length)
    assert.ok(Array.isArray(a.bitacora))
    assert.equal((await pedir('GET', '/nomina', { token: token('bodega') })).statusCode, 403)
    assert.equal((await pedir('GET', '/nomina')).statusCode, 403)
  } finally { s3.restaurar() }
})

test('sin configuración guardada, el servidor entrega la de arranque, nunca el navegador', async () => {
  const s3 = s3ConArchivos({})
  try {
    const t = cuerpoDe(await pedir('GET', '/nomina', { token: token('aguascalientes') }))
    assert.deepEqual(t.config.empleados.map(e => e.id), ['brenda', 'sobrina-brenda'])
  } finally { s3.restaurar() }
})

test('una tienda NO escribe nada de la nómina', async () => {
  const s3 = s3ConArchivos({})
  try {
    const tk = token('san-luis')
    for (const [ruta, cuerpo] of [['/nomina/config', { config: CONFIG }], ['/nomina/accion', { accion: 'pagar' }], ['/nomina/foto', { datos: 'x' }]]) {
      assert.equal((await pedir('POST', ruta, { token: tk, cuerpo })).statusCode, 403, ruta)
    }
    assert.equal((await pedir('GET', '/nomina/foto', { token: tk, query: { f: 'abc123.jpg' } })).statusCode, 403)
    assert.equal(s3.puestos.length, 0)
  } finally { s3.restaurar() }
})

test('autorizar una comisión escribe el estado, la bitácora y la salida en la caja', async () => {
  const s3 = s3ConArchivos({ 'caja/movimientos.json': { 'san-luis': { otro: { id: 'otro', f: '2026-11-10', tipo: 'gasto', monto: 50, concepto: 'garrafón' } } } })
  try {
    const r = await pedir('POST', '/nomina/accion', { token: token('leon', true), cuerpo: {
      accion: 'comision', estado: 'autorizada', items: [{ clave: 'san-luis|501', registro: 'andrea', lunes: '2026-11-09', monto: 28 }],
    } })
    assert.equal(r.statusCode, 200)
    const movs = s3.leer('caja/movimientos.json')['san-luis']
    assert.equal(movs['nomina-com-andrea-2026-11-09'].concepto, 'Comisiones de Andrea Serrano Palacios')
    assert.equal(movs['nomina-com-andrea-2026-11-09'].monto, 28)
    assert.ok(movs.otro, 'lo demás de la caja sigue')
    assert.equal(s3.leer('nomina/bitacora.json').entradas.at(-1).accion, 'comision-autorizada')
    // Rechazarla después borra la salida.
    await pedir('POST', '/nomina/accion', { token: token('leon', true), cuerpo: {
      accion: 'comision', estado: 'rechazada', motivo: 'No venía la foto', items: [{ clave: 'san-luis|501', registro: 'andrea', lunes: '2026-11-09', monto: 28 }],
    } })
    assert.equal(s3.leer('caja/movimientos.json')['san-luis']['nomina-com-andrea-2026-11-09'], undefined)
  } finally { s3.restaurar() }
})

test('el corte de la tienda también resta lo capturado en la página', async () => {
  const s3 = s3ConArchivos({
    'caja/san-luis.json': { dias: [{ f: '2026-11-10', efectivo: 1000 }], movimientos: [{ f: '2026-11-10', tipo: 'otra-salida', monto: 50, concepto: 'garrafón' }] },
    'caja/movimientos.json': { 'san-luis': { c: { id: 'c', f: '2026-11-10', tipo: 'otra-salida', monto: 28, concepto: 'Comisiones de Andrea Serrano Palacios', quien: 'admin' } } },
  })
  try {
    const r = cuerpoDe(await pedir('GET', '/corte', { token: token('san-luis') }))
    const movs = r.plazas['san-luis'].caja.movimientos
    assert.ok(movs.some(m => m.concepto === 'Comisiones de Andrea Serrano Palacios'))
    assert.ok(movs.every(m => m.quien === undefined), 'sin el autor, como todo lo de la tienda')
  } finally { s3.restaurar() }
})
