// Editar un modelo desde las tablas, y la bitácora de todo lo que se cambia.
//
// Lo que se fija aquí es lo que hace que el registro sirva:
//   · sólo administración y bodega editan; una tienda, no;
//   · el autor y la hora los pone el SERVIDOR;
//   · sólo se apunta lo que CAMBIA, con lo que había antes;
//   · un lote con un cambio malo no deja nada guardado;
//   · dar de baja y descontinuar también quedan en la bitácora;
//   · la página y el servidor conocen los mismos tipos.

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
const { TIPOS_EDICION, validarValor } = await import('../src/ediciones.js')
const pagina = await import('../../src/lib/ediciones.js')

const pedir = (metodo, ruta, { cuerpo, token } = {}) => handler({
  rawPath: ruta,
  requestContext: { http: { method: metodo, sourceIp: '1.2.3.4' } },
  headers: { origin: ORIGEN, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: cuerpo ? JSON.stringify(cuerpo) : undefined,
})
const cuerpoDe = r => JSON.parse(r.body)
const tokenAdmin  = () => crearSesion({ sucursal: 'leon', admin: true }, SECRETO)
const tokenLeon   = () => crearSesion({ sucursal: 'leon', admin: false }, SECRETO)
const tokenBodega = () => crearSesion({ sucursal: 'bodega', admin: false }, SECRETO)

function s3DeMemoria(sembrados = {}) {
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

test('sólo administración y bodega editan y leen; una tienda y sin sesión, no', async () => {
  const s3 = s3DeMemoria()
  try {
    const cuerpo = { codigo: 'I13T', cambios: [{ tipo: 'nota', valor: 'x' }] }
    assert.equal((await pedir('POST', '/ediciones', { cuerpo })).statusCode, 403)
    assert.equal((await pedir('POST', '/ediciones', { token: tokenLeon(), cuerpo })).statusCode, 403)
    assert.equal((await pedir('GET', '/ediciones', { token: tokenLeon() })).statusCode, 403)
    assert.equal((await pedir('POST', '/bitacora', { token: tokenLeon(), cuerpo: { tipo: 'cantidad', codigo: 'X', despues: 3 } })).statusCode, 403)
    assert.equal(s3.puestos.length, 0)
  } finally { s3.restaurar() }
})

test('guardar apunta en la bitácora lo que cambió, con el antes, y el autor lo pone el servidor', async () => {
  const s3 = s3DeMemoria()
  try {
    const r = await pedir('POST', '/ediciones', { token: tokenAdmin(), cuerpo: {
      codigo: 'i13t', producto: 'IPHONE 13 TPU CASE', pantalla: 'compras', quien: 'otro-nombre',
      cambios: [
        { tipo: 'nota', valor: 'pedir en diciembre' },
        { tipo: 'costo', valor: '$55' },
        { tipo: 'precio', plaza: 'leon', valor: 250 },
      ],
    } })
    assert.equal(r.statusCode, 200)
    assert.equal(cuerpoDe(r).cambios, 3)
    const eds = s3.leer('ediciones/admin.json')
    assert.equal(eds['costo|I13T'].valor, 55)
    assert.equal(eds['precio|I13T|leon'].valor, 250)
    const bit = s3.leer('bitacora/admin.json').entradas
    assert.equal(bit.length, 3)
    assert.ok(bit.every(b => b.antes === null && b.codigo === 'I13T' && b.pantalla === 'compras'))
    assert.ok(!('quien' in bit[0]), 'el autor es el archivo, no lo que mande el navegador')

    // Volver a guardar lo mismo no apunta nada ni escribe.
    const antes = s3.puestos.length
    const otra = await pedir('POST', '/ediciones', { token: tokenAdmin(), cuerpo: {
      codigo: 'I13T', cambios: [{ tipo: 'costo', valor: 55 }] } })
    assert.equal(cuerpoDe(otra).cambios, 0)
    assert.equal(s3.puestos.length, antes)

    // Cambiar lo apunta con lo que había; vaciar lo quita, y también se apunta.
    await pedir('POST', '/ediciones', { token: tokenAdmin(), cuerpo: { codigo: 'I13T', cambios: [{ tipo: 'costo', valor: 58 }] } })
    await pedir('POST', '/ediciones', { token: tokenAdmin(), cuerpo: { codigo: 'I13T', cambios: [{ tipo: 'nota', valor: '' }] } })
    const fin = s3.leer('bitacora/admin.json').entradas
    assert.deepEqual(fin.slice(-2).map(b => [b.tipo, b.antes, b.despues]), [['costo', 55, 58], ['nota', 'pedir en diciembre', null]])
    assert.equal(s3.leer('ediciones/admin.json')['nota|I13T'], undefined)
  } finally { s3.restaurar() }
})

test('un lote con un cambio malo no guarda NADA', async () => {
  const s3 = s3DeMemoria()
  try {
    for (const cambios of [
      [{ tipo: 'nota', valor: 'bien' }, { tipo: 'costo', valor: 0 }],
      [{ tipo: 'precio', valor: 200 }],
      [{ tipo: 'precio', plaza: 'marte', valor: 200 }],
      [{ tipo: 'existencia', valor: 3 }],
      [{ tipo: 'codigo', valor: 'CON ESPACIO' }],
    ]) {
      const r = await pedir('POST', '/ediciones', { token: tokenAdmin(), cuerpo: { codigo: 'I13T', cambios } })
      assert.equal(r.statusCode, 400, JSON.stringify(cambios))
    }
    assert.equal(s3.puestos.length, 0)
  } finally { s3.restaurar() }
})

test('un campo vacío es quitar, nunca cero', () => {
  assert.deepEqual(validarValor('costo', ''), { valor: null })
  assert.deepEqual(validarValor('costo', '  '), { valor: null })
  assert.ok(validarValor('costo', '0').error)
  assert.deepEqual(validarValor('nombre', ' iphone  13 tpu '), { valor: 'IPHONE 13 TPU' })
})

test('bodega edita igual, y al leer se juntan las dos con su autor', async () => {
  const s3 = s3DeMemoria()
  try {
    await pedir('POST', '/ediciones', { token: tokenAdmin(), cuerpo: { codigo: 'A', cambios: [{ tipo: 'nota', valor: 'de admin' }] } })
    await pedir('POST', '/ediciones', { token: tokenBodega(), cuerpo: { codigo: 'B', cambios: [{ tipo: 'costo', valor: 40 }] } })
    const r = cuerpoDe(await pedir('GET', '/ediciones', { token: tokenBodega() }))
    assert.deepEqual(r.ediciones.map(e => [e.codigo, e.quien]).sort(), [['A', 'admin'], ['B', 'bodega']])
    assert.equal(r.bitacora.length, 2)
    assert.ok(r.bitacora.every(b => b.quien))
  } finally { s3.restaurar() }
})

test('dar de baja y descontinuar también quedan en la bitácora', async () => {
  const s3 = s3DeMemoria()
  try {
    await pedir('POST', '/ajustes', { token: tokenAdmin(), cuerpo: { codigo: 'X1', motivo: 'dado-de-baja', pantalla: 'compras' } })
    await pedir('POST', '/ajustes', { token: tokenAdmin(), cuerpo: { codigo: 'X1', motivo: null } })
    await pedir('POST', '/ajustes', { token: tokenAdmin(), cuerpo: { tipo: 'descontinuado', codigo: 'X2', motivo: 'bodega-descontinuo' } })
    const bit = s3.leer('bitacora/admin.json').entradas
    assert.deepEqual(bit.map(b => [b.tipo, b.codigo, b.antes, b.despues]), [
      ['baja', 'X1', null, 'dado-de-baja'],
      ['baja', 'X1', 'dado-de-baja', null],
      ['descontinuado', 'X2', null, 'bodega-descontinuo'],
    ])
  } finally { s3.restaurar() }
})

test('la cantidad a pedir se apunta; lo demás no entra por esa puerta', async () => {
  const s3 = s3DeMemoria()
  try {
    const ok = await pedir('POST', '/bitacora', { token: tokenAdmin(), cuerpo: { tipo: 'cantidad', codigo: 'I13T', antes: 12, despues: 24, pantalla: 'compra' } })
    assert.equal(ok.statusCode, 200)
    assert.equal((await pedir('POST', '/bitacora', { token: tokenAdmin(), cuerpo: { tipo: 'nota', codigo: 'I13T', despues: 'x' } })).statusCode, 400)
    assert.equal((await pedir('POST', '/bitacora', { token: tokenAdmin(), cuerpo: { tipo: 'cantidad', codigo: 'I13T', antes: 5, despues: 5 } })).statusCode, 400)
    assert.equal((await pedir('POST', '/bitacora', { token: tokenAdmin(), cuerpo: { tipo: 'cantidad', codigo: 'I13T', despues: 99999 } })).statusCode, 400)
    assert.equal(s3.leer('bitacora/admin.json').entradas.length, 1)
  } finally { s3.restaurar() }
})

test('la página y el servidor conocen los MISMOS tipos y las mismas plazas de precio', () => {
  assert.deepEqual(Object.keys(pagina.TIPOS_EDICION).sort(), Object.keys(TIPOS_EDICION).sort())
  for (const [t, d] of Object.entries(TIPOS_EDICION)) assert.equal(pagina.TIPOS_EDICION[t].plaza, d.plaza, t)
})
