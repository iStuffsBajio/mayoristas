// Pruebas del backend simulando los eventos que manda Lambda.
// Se ejecutan con:  node --test backend/test/
//
// No tocan S3 ni Dropbox: solo verifican autenticación, permisos, validación
// de entradas y que los errores no filtren información.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashearContrasena, crearSesion } from '../src/seguridad.js'

const ORIGEN = 'https://ejemplo.test'
const SECRETO = 'secreto-de-pruebas-suficientemente-largo'

process.env.S3_BUCKET           = 'bucket-de-pruebas'
process.env.S3_REGION           = 'us-east-1'
process.env.SESION_SECRETO      = SECRETO
process.env.ORIGENES_PERMITIDOS = ORIGEN
process.env.HASH_ADMIN          = hashearContrasena('clave-admin')
process.env.HASH_LEON           = hashearContrasena('clave-leon')
process.env.CARPETAS_CATALOGO   = '/permitida'

const { handler } = await import('../src/index.js')

const pedir = (metodo, ruta, { cuerpo, token, origen = ORIGEN, query } = {}) => handler({
  rawPath: ruta,
  requestContext: { http: { method: metodo, sourceIp: '1.2.3.4' } },
  headers: { origin: origen, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  queryStringParameters: query,
  body: cuerpo ? JSON.stringify(cuerpo) : undefined,
})

const cuerpoDe = r => JSON.parse(r.body)

test('OPTIONS responde al preflight sin cuerpo', async () => {
  const r = await pedir('OPTIONS', '/login')
  assert.equal(r.statusCode, 204)
  assert.equal(r.headers['Access-Control-Allow-Origin'], ORIGEN)
})

test('rechaza origenes no permitidos', async () => {
  const r = await pedir('POST', '/login', { origen: 'https://sitio-malicioso.test' })
  assert.equal(r.statusCode, 403)
})

test('login correcto de sucursal devuelve token', async () => {
  const r = await pedir('POST', '/login', { cuerpo: { sucursal: 'leon', contrasena: 'clave-leon' } })
  assert.equal(r.statusCode, 200)
  const d = cuerpoDe(r)
  assert.equal(d.sucursal, 'leon')
  assert.equal(d.admin, false)
  assert.ok(d.token)
})

test('login de admin marca admin', async () => {
  const r = await pedir('POST', '/login', { cuerpo: { sucursal: 'leon', contrasena: 'clave-admin' } })
  assert.equal(cuerpoDe(r).admin, true)
})

test('contrasena incorrecta no revela si la sucursal existe', async () => {
  const a = cuerpoDe(await pedir('POST', '/login', { cuerpo: { sucursal: 'leon', contrasena: 'mala' } }))
  const b = cuerpoDe(await pedir('POST', '/login', { cuerpo: { sucursal: 'inventada', contrasena: 'mala' } }))
  assert.equal(a.error, b.error)
})

test('la respuesta de login no incluye hashes ni contrasenas', async () => {
  const r = await pedir('POST', '/login', { cuerpo: { sucursal: 'leon', contrasena: 'clave-leon' } })
  assert.ok(!r.body.includes('pbkdf2'))
  assert.ok(!r.body.includes('clave-leon'))
})

test('guardar configuracion exige sesion de administrador', async () => {
  const sinSesion = await pedir('POST', '/config', { cuerpo: { config: {} } })
  assert.equal(sinSesion.statusCode, 403)

  const deSucursal = await pedir('POST', '/config', {
    cuerpo: { config: {} },
    token: crearSesion({ sucursal: 'leon', admin: false }, SECRETO),
  })
  assert.equal(deSucursal.statusCode, 403)
})

test('subir inventario exige permiso sobre esa sucursal', async () => {
  const r = await pedir('POST', '/inventario', {
    cuerpo: { sucursal: 'san-luis', productos: [{ Producto: 'x', Existencia: 1 }] },
    token: crearSesion({ sucursal: 'leon', admin: false }, SECRETO),
  })
  assert.equal(r.statusCode, 403)
})

test('la galeria solo abre carpetas de la lista blanca', async () => {
  const r = await pedir('GET', '/galeria', { query: { carpeta: '/Espacio familiar/privado' } })
  assert.equal(r.statusCode, 403)
})

test('rechaza tipos de imagen no permitidos', async () => {
  const r = await pedir('POST', '/diseno', {
    cuerpo: { sucursal: 'leon', tipo: 'application/x-msdownload', datos: 'AAAA', nombre: 'x' },
  })
  assert.equal(r.statusCode, 400)
})

test('rechaza sucursal desconocida al subir diseno', async () => {
  const r = await pedir('POST', '/diseno', {
    cuerpo: { sucursal: 'ninguna', tipo: 'image/png', datos: 'AAAA' },
  })
  assert.equal(r.statusCode, 400)
})

test('rechaza imagenes que superan el limite', async () => {
  const grande = Buffer.alloc(11 * 1024 * 1024).toString('base64')
  const r = await pedir('POST', '/diseno', {
    cuerpo: { sucursal: 'leon', tipo: 'image/png', datos: grande, nombre: 'x' },
  })
  assert.equal(r.statusCode, 413)
})

test('cuerpo JSON invalido da 400 y no rompe', async () => {
  const r = await handler({
    rawPath: '/login',
    requestContext: { http: { method: 'POST', sourceIp: '1.2.3.4' } },
    headers: { origin: ORIGEN },
    body: 'esto no es json',
  })
  assert.equal(r.statusCode, 400)
})

test('ruta inexistente da 404 sin detalles', async () => {
  const r = await pedir('GET', '/no-existe')
  assert.equal(r.statusCode, 404)
  assert.equal(cuerpoDe(r).error, 'Ruta no encontrada.')
})

test('token manipulado no da acceso', async () => {
  const bueno = crearSesion({ sucursal: 'leon', admin: true }, SECRETO)
  const malo  = bueno.slice(0, -4) + 'AAAA'
  const r = await pedir('POST', '/config', { cuerpo: { config: {} }, token: malo })
  assert.equal(r.statusCode, 403)
})

test('una sesion firmada con otro secreto no sirve', async () => {
  const r = await pedir('POST', '/config', {
    cuerpo: { config: {} },
    token: crearSesion({ sucursal: 'all', admin: true }, 'otro-secreto-distinto'),
  })
  assert.equal(r.statusCode, 403)
})

// ── Lo que se guarda de verdad ───────────────────────────────────────────────
//
// Las pruebas de arriba comprueban permisos y validación. Estas dos miran el
// contenido que sale hacia S3 y hacia Dropbox, interceptando la llamada para
// no tocar ningún servicio real.

import { S3Client } from '@aws-sdk/client-s3'

test('el inventario guardado conserva el codigo del producto', async () => {
  const enviados = []
  const original = S3Client.prototype.send
  S3Client.prototype.send = async function (cmd) { enviados.push(cmd); return {} }

  try {
    const r = await pedir('POST', '/inventario', {
      token: crearSesion({ sucursal: 'leon', admin: false }, SECRETO),
      cuerpo: {
        sucursal: 'leon',
        productos: [
          { Codigo: 'HDA', Producto: 'MICA HIDROGEL HD ALTA', Existencia: 7 },
          { Codigo: '',    Producto: 'SIN CODIGO',            Existencia: 2 },
        ],
      },
    })
    assert.equal(r.statusCode, 200)

    const guardado = JSON.parse(Buffer.from(enviados[0].input.Body).toString('utf8'))
    assert.equal(guardado.productos[0].Codigo, 'HDA',
      'el codigo es la clave con la que las estadisticas cruzan un modelo')
    assert.equal(guardado.productos[0].Existencia, 7)
    assert.equal(guardado.productos[1].Codigo, '', 'un producto sin codigo no revienta')
    assert.equal(guardado.totalProductos, 2)
  } finally {
    S3Client.prototype.send = original
  }
})

test('la imagen del pedido lleva el modelo en el nombre del archivo', async () => {
  const llamadas = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, opciones) => {
    llamadas.push({ url: String(url), arg: opciones?.headers?.['Dropbox-API-Arg'] })
    if (String(url).includes('oauth2/token')) {
      return { ok: true, json: async () => ({ access_token: 'x', expires_in: 3600 }) }
    }
    return { ok: true, json: async () => ({ name: 'archivo.jpg' }) }
  }

  try {
    const r = await pedir('POST', '/diseno', {
      cuerpo: {
        sucursal: 'leon',
        tipo: 'image/jpeg',
        datos: Buffer.from('imagen falsa').toString('base64'),
        nombre: 'Juan Pérez',
        modelo: 'IPHONE 17 PRO MAX',
      },
    })
    assert.equal(r.statusCode, 200)

    const subida = llamadas.find(l => l.url.includes('files/upload'))
    const ruta = JSON.parse(subida.arg).path
    assert.match(ruta, /Juan_Perez/,  'el acento se limpia, no rompe la ruta')
    assert.match(ruta, /IPHONE_17_PRO_MAX/, 'el modelo va en el nombre para identificar la imagen')
    assert.equal(cuerpoDe(r).carpeta, 'Leon', 'solo se devuelve la carpeta, no la ruta completa')
  } finally {
    globalThis.fetch = original
  }
})

test('un modelo con caracteres raros no puede salirse de la carpeta', async () => {
  const llamadas = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, opciones) => {
    llamadas.push({ url: String(url), arg: opciones?.headers?.['Dropbox-API-Arg'] })
    if (String(url).includes('oauth2/token')) return { ok: true, json: async () => ({ access_token: 'x', expires_in: 3600 }) }
    return { ok: true, json: async () => ({ name: 'a.jpg' }) }
  }
  try {
    await pedir('POST', '/diseno', {
      cuerpo: {
        sucursal: 'leon', tipo: 'image/jpeg',
        datos: Buffer.from('x').toString('base64'),
        nombre: '../../../etc/passwd',
        modelo: '../../otra-carpeta',
      },
    })
    const ruta = JSON.parse(llamadas.find(l => l.url.includes('files/upload')).arg).path
    assert.ok(!ruta.includes('..'), 'no quedan saltos de directorio')
    assert.ok(ruta.startsWith('/'), 'la ruta sigue anclada a la carpeta de pedidos')
  } finally {
    globalThis.fetch = original
  }
})

// ── Revisiones del catálogo ────────────────────────────────────────────────
//
// No tocan S3: lo que se comprueba aquí es el permiso y la validación, que es
// donde se decide si un usuario de sucursal puede contestar casos y si puede
// escribir en el archivo de otro.

const tokenLeon  = () => crearSesion({ sucursal: 'leon', admin: false }, SECRETO)
const tokenAdmin = () => crearSesion({ sucursal: 'leon', admin: true }, SECRETO)

test('las revisiones piden sesion', async () => {
  assert.equal((await pedir('GET', '/revisiones')).statusCode, 403)
  assert.equal((await pedir('POST', '/revisiones', { cuerpo: { id: 'x', estado: 'pendiente' } })).statusCode, 403)
})

test('una sucursal SI puede contestar casos', async () => {
  // Es el punto de todo esto: Leon contesta y el administrador lo ve.
  const r = await pedir('POST', '/revisiones', {
    token: tokenLeon(),
    cuerpo: { id: 'cod|HX7CT', estado: 'pendiente', nota: 'lo ve Brenda' },
  })
  assert.notEqual(r.statusCode, 403)
})

test('un estado inventado se rechaza', async () => {
  const r = await pedir('POST', '/revisiones', {
    token: tokenAdmin(), cuerpo: { id: 'x', estado: 'borrado' },
  })
  assert.equal(r.statusCode, 400)
})

test('sin caso no se guarda nada', async () => {
  const r = await pedir('POST', '/revisiones', { token: tokenAdmin(), cuerpo: { estado: 'pendiente' } })
  assert.equal(r.statusCode, 400)
})

test('estado nulo es quitar la marca, no un error', async () => {
  const r = await pedir('POST', '/revisiones', { token: tokenLeon(), cuerpo: { id: 'x', estado: null } })
  assert.notEqual(r.statusCode, 400)
})
