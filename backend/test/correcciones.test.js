// Los ajustes del administrador al corte.
//
// Lo pidió el dueño el 2026-11-17: corregir lo que la tienda registró mal sin
// tocar Eleventa, con motivo y nota, y que quede el precedente. Se fija aquí:
//
//   1. Que la huella del servidor y la de la pantalla sean la MISMA. Si se
//      separan, un ajuste guardado aquí no encontraría su movimiento allá.
//   2. Que sólo el administrador ajuste, y siempre con motivo y nota.
//   3. Que deshacer NO borre: el ajuste se queda, marcado.

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

const { handler } = await import('../src/index.js')
const A = await import('../src/correcciones.js')
const { lunesDe } = await import('../src/cortes.js')
const { hoyMexico } = await import('../src/bajas.js')
const pagina = await import('../../src/lib/correcciones.js')

const pedir = (metodo, ruta, { cuerpo, token, query } = {}) => handler({
  rawPath: ruta,
  requestContext: { http: { method: metodo, sourceIp: '1.2.3.4' } },
  headers: { origin: ORIGEN, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  queryStringParameters: query,
  body: cuerpo ? JSON.stringify(cuerpo) : undefined,
})
const token = (sucursal, admin = false) => crearSesion({ sucursal, admin }, SECRETO)

function s3ConArchivos(sembrados = {}) {
  const archivos = new Map(Object.entries(sembrados).map(([k, v]) => [k, JSON.stringify(v)]))
  const original = S3Client.prototype.send
  S3Client.prototype.send = async function (cmd) {
    const clave = cmd.input?.Key
    const nombre = cmd.constructor?.name ?? ''
    if (nombre.startsWith('Put')) { archivos.set(clave, Buffer.from(cmd.input.Body).toString('utf8')); return {} }
    if (nombre.startsWith('Get')) {
      if (!archivos.has(clave)) throw new Error('NoSuchKey')
      const texto = archivos.get(clave)
      return { Body: { transformToString: async () => texto } }
    }
    return {}
  }
  return { leer: clave => JSON.parse(archivos.get(clave) ?? '{}'), restaurar: () => { S3Client.prototype.send = original } }
}

const LUNES = lunesDe(hoyMexico())
const MOVS = [
  { f: LUNES, tipo: 'gasto', monto: 735, concepto: '', origen: 'eleventa' },
  { f: LUNES, tipo: 'gasto', monto: 20, concepto: 'agua', origen: 'eleventa' },
  { f: LUNES, tipo: 'gasto', monto: 20, concepto: 'agua', origen: 'eleventa' },
  { f: LUNES, tipo: 'adelanto', monto: 320, concepto: 'SUELDO BRENDA ANTICIPO', origen: 'eleventa' },
]

test('🔒 la huella del servidor es la MISMA que la de la pantalla', () => {
  const conPagina = [...MOVS, { id: 'nomina-com-x', f: LUNES, tipo: 'otra-salida', monto: 90, concepto: 'Comisiones de Ana', origen: 'pagina' }]
  assert.deepEqual(A.conHuella(conPagina).map(m => m.ref), pagina.conHuella(conPagina).map(m => m.ref))
  // Dos idénticos el mismo día se distinguen por cuál va primero.
  const refs = A.conHuella(MOVS).map(m => m.ref)
  assert.equal(new Set(refs).size, refs.length)
  assert.deepEqual([A.MOTIVOS_DE_AJUSTE.size, A.CATEGORIAS_DE_AJUSTE.size],
    [pagina.MOTIVOS_DE_AJUSTE.length, Object.keys(pagina.CATEGORIAS_DE_AJUSTE).length])
  for (const m of pagina.MOTIVOS_DE_AJUSTE) assert.ok(A.MOTIVOS_DE_AJUSTE.has(m.id), m.id)
  for (const c of Object.keys(pagina.CATEGORIAS_DE_AJUSTE)) assert.ok(A.CATEGORIAS_DE_AJUSTE.has(c), c)
})

test('validar: sin motivo o sin nota no se guarda', () => {
  const base = { accion: 'agregar', nuevo: { f: LUNES, categoria: 'sueldo', monto: 100, concepto: 'Sueldo Ana' } }
  assert.ok(A.validarAjuste({ ...base, nota: 'x' }, { semana: LUNES, quien: 'admin', id: '1' }).error)
  assert.ok(A.validarAjuste({ ...base, motivo: 'no-registrado', nota: '  ' }, { semana: LUNES, quien: 'admin', id: '1' }).error)
  const ok = A.validarAjuste({ ...base, motivo: 'no-registrado', nota: 'no lo registró' }, { semana: LUNES, quien: 'admin', id: '1' })
  assert.equal(ok.error, undefined)
  assert.equal(ok.ajuste.nuevo.monto, 100)
})

test('validar: el día del ajuste cae en la semana, el monto es positivo, y no se ajusta dos veces lo mismo', () => {
  const v = (cuerpo, extra = {}) => A.validarAjuste({ motivo: 'otro', nota: 'n', ...cuerpo }, { semana: LUNES, movimientos: MOVS, quien: 'admin', id: 'z', ...extra })
  assert.ok(v({ accion: 'agregar', nuevo: { f: '2020-01-01', categoria: 'gasto', monto: 1, concepto: 'c' } }).error)
  assert.ok(v({ accion: 'agregar', nuevo: { f: LUNES, categoria: 'gasto', monto: 0, concepto: 'c' } }).error)
  assert.ok(v({ accion: 'agregar', nuevo: { f: LUNES, categoria: 'gasto', monto: -5, concepto: 'c' } }).error)
  assert.ok(v({ accion: 'agregar', nuevo: { f: LUNES, categoria: 'regalo', monto: 5, concepto: 'c' } }).error)
  assert.ok(v({ accion: 'anular', ref: 'e:no-existe' }).error, 'un movimiento que no está no se anula')
  const ref = A.conHuella(MOVS)[0].ref
  const r = v({ accion: 'anular', ref })
  assert.equal(r.error, undefined)
  assert.deepEqual(r.ajuste.original, { f: LUNES, tipo: 'gasto', monto: 735, concepto: '', origen: 'eleventa' }, 'el original lo pone el servidor')
  assert.ok(v({ accion: 'anular', ref }, { vigentes: [r.ajuste] }).error, 'ya tiene un ajuste')
  assert.equal(v({ accion: 'anular', ref }, { vigentes: [{ ...r.ajuste, deshecho: { quien: 'admin' } }] }).error, undefined, 'uno deshecho no estorba')
})

test('POST /corte/ajuste: sólo el administrador', async () => {
  const s3 = s3ConArchivos({ 'caja/leon.json': { movimientos: MOVS } })
  try {
    const r = await pedir('POST', '/corte/ajuste', {
      token: token('leon'),
      cuerpo: { plaza: 'leon', semana: LUNES, accion: 'agregar', motivo: 'otro', nota: 'n', nuevo: { f: LUNES, categoria: 'gasto', monto: 5, concepto: 'c' } },
    })
    assert.equal(r.statusCode, 403)
    assert.deepEqual(s3.leer('caja/correcciones.json'), {})
  } finally { s3.restaurar() }
})

test('POST /corte/ajuste: sustituir, y deshacer SIN borrar; la tienda ve el ajuste en su corte', async () => {
  const s3 = s3ConArchivos({ 'caja/leon.json': { movimientos: MOVS, dias: [{ f: LUNES, efectivo: 1000 }] } })
  try {
    const ref = A.conHuella(MOVS)[0].ref
    const r = await pedir('POST', '/corte/ajuste', {
      token: token('leon', true),
      cuerpo: {
        plaza: 'leon', semana: LUNES, accion: 'sustituir', ref, motivo: 'sin-concepto', nota: 'era el sueldo de Brenda',
        nuevo: { categoria: 'sueldo', monto: '735', concepto: 'Sueldo Brenda' },
      },
    })
    assert.equal(r.statusCode, 200, r.body)
    const [aj] = Object.values(s3.leer('caja/correcciones.json').leon)
    assert.equal(aj.quien, 'admin')
    assert.equal(aj.nuevo.f, LUNES, 'sin día, toma el del original')
    assert.equal(aj.original.monto, 735)

    // La tienda lo recibe con su corte: si no, su cuenta cambiaría sin saber por qué.
    const corte = JSON.parse((await pedir('GET', '/corte', { token: token('leon') })).body)
    assert.equal(corte.plazas.leon.correcciones.length, 1)

    const d = await pedir('POST', '/corte/ajuste', { token: token('leon', true), cuerpo: { plaza: 'leon', deshacer: aj.id } })
    assert.equal(d.statusCode, 200)
    const despues = s3.leer('caja/correcciones.json').leon[aj.id]
    assert.ok(despues, 'deshacer no borra')
    assert.equal(despues.deshecho.quien, 'admin')
    const otra = await pedir('POST', '/corte/ajuste', { token: token('leon', true), cuerpo: { plaza: 'leon', deshacer: aj.id } })
    assert.equal(otra.statusCode, 400, 'no se deshace dos veces')
  } finally { s3.restaurar() }
})
