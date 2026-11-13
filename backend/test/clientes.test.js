// Los clientes y la bandeja del CRM.
//
// Lo que se fija aquí, en orden de lo que más costaría romper:
//
//   1. Con una persona de la tienda en medio, el bot se calla.
//   2. Una tienda ve SÓLO los clientes de su plaza; bodega, ninguno.
//   3. El origen —qué anuncio trajo al cliente— no lo pisa nadie.
//   4. Quién y cuándo los pone el servidor, no el navegador.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  telefonoMx, idDe, idValido, archivoDe, nuevoCliente, botContesta, registrarMensaje,
  aplicarAccion, editarFicha, puedeVer, resumen, ordenarBandeja, contar, MAX_MENSAJES,
} from '../src/clientes.js'

const T0 = Date.parse('2026-11-11T18:00:00Z')
const min = n => T0 + n * 60000
const cliente = (extra = {}) => ({ ...nuevoCliente({ id: 'wa:524771234567', canal: 'whatsapp', telefono: '4771234567' }, { ahora: T0 }), ...extra })

// ── Las llaves ─────────────────────────────────────────────────────────────

test('el teléfono se normaliza a 52 + 10 dígitos, venga como venga', () => {
  for (const t of ['477 123 4567', '+52 477 123 4567', '5214771234567', '524771234567']) {
    assert.equal(telefonoMx(t), '524771234567', t)
  }
  assert.equal(telefonoMx('12345'), '')
  assert.equal(telefonoMx(''), '')
})

test('cada canal tiene su llave, y sin dato no hay llave', () => {
  assert.equal(idDe({ canal: 'whatsapp', telefono: '477 123 4567' }), 'wa:524771234567')
  assert.equal(idDe({ canal: 'instagram', idCanal: '178414' }), 'ig:178414')
  assert.equal(idDe({ canal: 'messenger', idCanal: '99' }), 'fb:99')
  assert.equal(idDe({ canal: 'tickets', plaza: 'leon', clave: 'Fundas Pérez (1234)' }), 'may:leon:fundas-perez-1234')
  assert.equal(idDe({ canal: 'whatsapp', telefono: '123' }), '')
  assert.equal(idDe({ canal: 'tickets', plaza: 'bodega', clave: 'x' }), '', 'bodega no tiene clientes')
})

test('una llave rara no llega a ser nombre de archivo', () => {
  assert.equal(idValido('wa:524771234567'), true)
  for (const malo of ['', '../config/site', 'wa:../../x', 'xx:123', 'wa:']) assert.equal(idValido(malo), false, malo)
  assert.equal(archivoDe('may:leon:abc'), 'may_leon_abc.json')
  assert.equal(nuevoCliente({ id: '../x' }), null)
})

// ── La regla del bot ───────────────────────────────────────────────────────

test('con una persona de la tienda en medio, el bot se calla', () => {
  let c = cliente()
  assert.equal(botContesta(c), true, 'recién llegado lo atiende el bot')

  c = aplicarAccion(c, { accion: 'entregar', plaza: 'leon' }, { quien: 'bot', ahora: min(1) }).cliente
  assert.equal(c.estado, 'pendiente')
  assert.equal(botContesta(c), false, 'entregado: ya le dijo «te paso con la tienda», no puede seguir hablando')

  c = aplicarAccion(c, { accion: 'tomar' }, { quien: 'leon', ahora: min(2) }).cliente
  assert.equal(botContesta(c), false)

  c = aplicarAccion(c, { accion: 'cerrar' }, { quien: 'leon', ahora: min(3) }).cliente
  assert.equal(botContesta(c), true, 'cerrada: si vuelve a escribir, viene por otra cosa')
})

test('si el cliente escribe a una conversación cerrada, se reabre con el bot', () => {
  let c = aplicarAccion(cliente({ plaza: 'leon' }), { accion: 'cerrar' }, { quien: 'leon', ahora: min(1) }).cliente
  c = registrarMensaje(c, { de: 'cliente', texto: 'hola otra vez' }, { ahora: min(2) })
  assert.equal(c.estado, 'bot')
  assert.equal(c.bitacora.at(-1).accion, 'reabierta')
})

test('lo que escribe el cliente mientras lo atiende una persona se cuenta como no leído', () => {
  let c = aplicarAccion(cliente({ plaza: 'leon' }), { accion: 'entregar', plaza: 'leon' }, { quien: 'bot' }).cliente
  c = registrarMensaje(c, { de: 'cliente', texto: '¿siguen ahí?' })
  c = registrarMensaje(c, { de: 'cliente', texto: '¿?' })
  assert.equal(c.noLeidos, 2)
  c = registrarMensaje(c, { de: 'tienda', texto: 'sí, dime', quien: 'leon' })
  assert.equal(c.noLeidos, 0, 'contestar es haberlo leído')

  const conBot = registrarMensaje(cliente(), { de: 'cliente', texto: 'hola' })
  assert.equal(conBot.noLeidos, 0, 'con el bot no se cuenta: el bot contesta')
})

test('el mismo mensaje dos veces —Meta reintenta— no son dos mensajes', () => {
  let c = registrarMensaje(cliente(), { de: 'cliente', texto: 'hola', id: 'wamid.1' })
  c = registrarMensaje(c, { de: 'cliente', texto: 'hola', id: 'wamid.1' })
  assert.equal(c.mensajes.length, 1)
})

test('la conversación se recorta por la cabeza', () => {
  let c = cliente()
  for (let i = 0; i < MAX_MENSAJES + 5; i++) c = registrarMensaje(c, { de: 'cliente', texto: `m${i}` })
  assert.equal(c.mensajes.length, MAX_MENSAJES)
  assert.equal(c.mensajes.at(-1).texto, `m${MAX_MENSAJES + 4}`)
  assert.equal(c.mensajes[0].texto, 'm5')
})

// ── Las acciones ───────────────────────────────────────────────────────────

test('no se puede tomar una conversación que no tiene plaza', () => {
  assert.match(aplicarAccion(cliente(), { accion: 'tomar' }, { quien: 'leon' }).error, /plaza/)
})

test('transferir la deja pendiente en la otra plaza y suelta a quien la atendía', () => {
  let c = aplicarAccion(cliente(), { accion: 'entregar', plaza: 'leon' }, { quien: 'bot' }).cliente
  c = aplicarAccion(c, { accion: 'tomar' }, { quien: 'leon' }).cliente
  const r = aplicarAccion(c, { accion: 'transferir', plaza: 'aguascalientes', motivo: 'vive en Ags' }, { quien: 'leon' })
  assert.equal(r.cliente.plaza, 'aguascalientes')
  assert.equal(r.cliente.estado, 'pendiente')
  assert.equal(r.cliente.atiende, null)
  assert.match(r.cliente.bitacora.at(-1).detalle, /aguascalientes · vive en Ags/)
})

test('bodega y Ferias no reciben clientes', () => {
  for (const plaza of ['bodega', 'ferias', '', undefined]) {
    assert.ok(aplicarAccion(cliente(), { accion: 'entregar', plaza }, { quien: 'bot' }).error, String(plaza))
  }
})

test('cada acción deja su renglón con quién y cuándo', () => {
  const c = aplicarAccion(cliente(), { accion: 'entregar', plaza: 'leon' }, { quien: 'bot', ahora: min(5) }).cliente
  const r = c.bitacora.at(-1)
  assert.equal(r.quien, 'bot')
  assert.equal(r.hora, new Date(min(5)).toISOString())
  assert.equal(r.accion, 'entregar')
})

test('una acción inventada se rechaza', () => {
  assert.ok(aplicarAccion(cliente(), { accion: 'borrar' }, { quien: 'admin' }).error)
})

// ── La ficha ───────────────────────────────────────────────────────────────

test('la ficha sólo cambia lo que se puede cambiar, y dice qué cambió', () => {
  const r = editarFicha(cliente(), { nombre: '  Ana  López ', tipo: 'mayorista', modelo: 'Galaxy A06', estado: 'cerrada', plaza: 'leon', origen: { fuente: 'falsa' } }, { quien: 'admin' })
  assert.equal(r.cliente.nombre, 'Ana López')
  assert.equal(r.cliente.tipo, 'mayorista')
  assert.equal(r.cliente.modelo, 'Galaxy A06')
  assert.equal(r.cliente.estado, 'bot', 'el estado cambia con las acciones, no editando')
  assert.equal(r.cliente.plaza, null, 'la plaza cambia transfiriendo')
  assert.deepEqual(r.cambios.sort(), ['modelo', 'nombre', 'tipo'])
})

test('el origen no lo pisa nadie: es la prueba de qué anuncio trajo al cliente', () => {
  const c = nuevoCliente({ id: 'wa:524771234567', canal: 'whatsapp', telefono: '4771234567', origen: { fuente: 'meta', anuncio: 'A06 León', ctwaClid: 'abc' } })
  const r = editarFicha(c, { origen: { fuente: 'google' } }, { quien: 'admin' })
  assert.equal(r.cliente.origen.fuente, 'meta')
  assert.equal(r.cliente.origen.ctwaClid, 'abc')
})

test('el teléfono de un cliente de WhatsApp no se cambia; el de un mayorista de tickets sí se captura', () => {
  assert.ok(editarFicha(cliente(), { telefono: '4449998877' }, { quien: 'admin' }).error)
  const may = nuevoCliente({ id: 'may:leon:fundas-perez', canal: 'tickets', plaza: 'leon', tipo: 'mayorista' })
  const r = editarFicha(may, { telefono: '477 555 1234' }, { quien: 'leon' })
  assert.equal(r.cliente.telefono, '524775551234')
  assert.ok(editarFicha(may, { telefono: '555' }, { quien: 'leon' }).error, 'un teléfono que no es de 10 dígitos no se guarda')
})

test('los avisos empiezan en «no se sabe», que NO es «sí»', () => {
  assert.equal(cliente().avisos, null)
  const r = editarFicha(cliente(), { avisos: { acepta: true, via: 'tienda' } }, { quien: 'leon', ahora: T0 })
  assert.deepEqual(r.cliente.avisos, { acepta: true, fecha: '2026-11-11', via: 'tienda' })
  assert.ok(editarFicha(cliente(), { avisos: 'sí' }, { quien: 'leon' }).error)
})

test('guardar sin cambiar nada no deja renglón en la bitácora', () => {
  const c = cliente({ nombre: 'Ana' })
  const r = editarFicha(c, { nombre: 'Ana' }, { quien: 'admin' })
  assert.equal(r.cliente, c)
  assert.deepEqual(r.cambios, [])
})

// ── Quién ve qué ───────────────────────────────────────────────────────────

test('una tienda ve SÓLO los clientes de su plaza; bodega, ninguno', () => {
  const deLeon = cliente({ plaza: 'leon' })
  const sinPlaza = cliente()
  assert.equal(puedeVer({ admin: true }, deLeon), true)
  assert.equal(puedeVer({ admin: true }, sinPlaza), true, 'lo que el bot no ha repartido lo ve el administrador')
  assert.equal(puedeVer({ sucursal: 'leon' }, deLeon), true)
  assert.equal(puedeVer({ sucursal: 'san-luis' }, deLeon), false)
  assert.equal(puedeVer({ sucursal: 'leon' }, sinPlaza), false)
  assert.equal(puedeVer({ sucursal: 'bodega' }, deLeon), false)
  assert.equal(puedeVer(null, deLeon), false)
})

test('el resumen de la lista no lleva la conversación ni la bitácora', () => {
  let c = cliente()
  c = registrarMensaje(c, { de: 'cliente', texto: 'x'.repeat(500) })
  const r = resumen(c)
  assert.equal('mensajes' in r, false)
  assert.equal('bitacora' in r, false)
  assert.equal(r.ultimo.texto.length, 140)
})

// ── El orden de la bandeja ─────────────────────────────────────────────────

test('primero lo pendiente, y de ahí el que más lleva esperando', () => {
  const r = (id, estado, n, noLeidos = 0) => ({ id, estado, noLeidos, ultimoMensaje: new Date(min(n)).toISOString() })
  const orden = ordenarBandeja([
    r('bot-reciente', 'bot', 50),
    r('cerrada', 'cerrada', 60),
    r('pend-nuevo', 'pendiente', 40),
    r('atiende-leido', 'atendiendo', 45),
    r('pend-viejo', 'pendiente', 10),
    r('atiende-sin-leer', 'atendiendo', 20, 3),
  ]).map(x => x.id)
  assert.deepEqual(orden, ['pend-viejo', 'pend-nuevo', 'atiende-sin-leer', 'atiende-leido', 'bot-reciente', 'cerrada'])
})

test('las pastillas cuentan cada estado y los no leídos', () => {
  const n = contar([{ estado: 'pendiente', noLeidos: 2 }, { estado: 'pendiente' }, { estado: 'bot' }])
  assert.equal(n.pendiente, 2)
  assert.equal(n.bot, 1)
  assert.equal(n.atendiendo, 0)
  assert.equal(n.total, 3)
  assert.equal(n.noLeidos, 2)
})

// ── Las rutas ──────────────────────────────────────────────────────────────
//
// Con un S3 de memoria que SÍ respeta las escrituras condicionadas: sin eso,
// la prueba de dos escrituras a la vez pasaría aunque la ruta las pisara.

import { S3Client } from '@aws-sdk/client-s3'
import { hashearContrasena, crearSesion } from '../src/seguridad.js'

const ORIGEN = 'https://ejemplo.test'
const SECRETO = 'secreto-de-pruebas-suficientemente-largo'
process.env.S3_BUCKET = 'bucket-de-pruebas'
process.env.S3_REGION = 'us-east-1'
process.env.SESION_SECRETO = SECRETO
process.env.ORIGENES_PERMITIDOS = ORIGEN
process.env.HASH_ADMIN = hashearContrasena('clave-admin')

const { handler } = await import('../src/index.js')

const pedir = (metodo, ruta, { cuerpo, token, query } = {}) => handler({
  rawPath: ruta,
  requestContext: { http: { method: metodo, sourceIp: '1.2.3.4' } },
  headers: { origin: ORIGEN, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  queryStringParameters: query,
  body: cuerpo ? JSON.stringify(cuerpo) : undefined,
})
const tk = (sucursal, admin = false) => crearSesion({ sucursal, admin }, SECRETO)
const json = r => JSON.parse(r.body)

function s3DeMemoria({ antesDeEscribir } = {}) {
  const archivos = new Map()
  let n = 0
  const original = S3Client.prototype.send
  const precondicion = () => Object.assign(new Error('PreconditionFailed'), { name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } })
  S3Client.prototype.send = async function (cmd) {
    const { Key, Body, IfMatch, IfNoneMatch } = cmd.input ?? {}
    const nombre = cmd.constructor?.name ?? ''
    if (nombre.startsWith('Put')) {
      await antesDeEscribir?.(Key, archivos)
      const actual = archivos.get(Key)
      if (IfNoneMatch === '*' && actual) throw precondicion()
      if (IfMatch && (!actual || actual.etag !== IfMatch)) throw precondicion()
      archivos.set(Key, { texto: Buffer.from(Body).toString('utf8'), etag: `"e${++n}"` })
      return {}
    }
    if (nombre.startsWith('Get')) {
      const a = archivos.get(Key)
      if (!a) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
      return { ETag: a.etag, Body: { transformToString: async () => a.texto } }
    }
    return {}
  }
  return {
    archivos,
    leer: k => JSON.parse(archivos.get(k)?.texto ?? 'null'),
    poner: (k, v) => archivos.set(k, { texto: JSON.stringify(v), etag: `"e${++n}"` }),
    restaurar: () => { S3Client.prototype.send = original },
  }
}

const sembrarCliente = (s3, c) => {
  s3.poner(`crm/clientes/${archivoDe(c.id)}`, c)
  const indice = s3.leer('crm/indice.json') ?? { clientes: {} }
  indice.clientes[c.id] = resumen(c)
  s3.poner('crm/indice.json', indice)
}

test('ruta: una tienda recibe SÓLO sus clientes; bodega y sin sesión, nada', async () => {
  const s3 = s3DeMemoria()
  try {
    sembrarCliente(s3, cliente({ id: 'wa:524771111111', plaza: 'leon', nombre: 'De León' }))
    sembrarCliente(s3, cliente({ id: 'wa:524442222222', plaza: 'san-luis', nombre: 'De San Luis' }))
    sembrarCliente(s3, cliente({ id: 'wa:524493333333', plaza: null, nombre: 'Sin repartir' }))

    const leon = json(await pedir('GET', '/crm/clientes', { token: tk('leon') }))
    assert.deepEqual(leon.clientes.map(c => c.nombre), ['De León'])

    const admin = json(await pedir('GET', '/crm/clientes', { token: tk('leon', true) }))
    assert.equal(admin.clientes.length, 3)

    assert.equal((await pedir('GET', '/crm/clientes', { token: tk('leon'), query: { plaza: 'san-luis' } })).statusCode, 403)
    assert.equal((await pedir('GET', '/crm/clientes', { token: tk('bodega') })).statusCode, 403)
    assert.equal((await pedir('GET', '/crm/clientes')).statusCode, 403)

    // Uno ajeno se contesta igual que uno que no existe.
    const ajeno = await pedir('GET', '/crm/cliente', { token: tk('leon'), query: { id: 'wa:524442222222' } })
    const inexistente = await pedir('GET', '/crm/cliente', { token: tk('leon'), query: { id: 'wa:524440000000' } })
    assert.equal(ajeno.statusCode, 404)
    assert.equal(ajeno.body, inexistente.body)
  } finally { s3.restaurar() }
})

test('ruta: contestar toma la conversación, y sin cola de envío dice que NO salió por WhatsApp', async () => {
  // Este archivo corre sin `CRM_COLA_URL`: no hay por dónde mandar. Con cola,
  // lo que pasa está en `responder-panel.test.js`.
  const s3 = s3DeMemoria()
  try {
    // El cliente acaba de escribir: sin eso no hay ventana de 24 horas y la
    // ruta ni siquiera guarda.
    const escrito = registrarMensaje(cliente({ plaza: 'leon' }), { de: 'cliente', texto: '¿tienes para iphone 13?' })
    const c = aplicarAccion(escrito, { accion: 'entregar', plaza: 'leon' }, { quien: 'bot' }).cliente
    sembrarCliente(s3, c)
    const r = json(await pedir('POST', '/crm/responder', { token: tk('leon'), cuerpo: { id: c.id, texto: 'Hola, sí lo tenemos' } }))
    assert.equal(r.cliente.estado, 'atendiendo')
    assert.equal(r.cliente.atiende, 'leon', 'quién lo pone el servidor')
    assert.equal(r.enviado, false)
    assert.match(r.aviso, /NO salió por WhatsApp/)
    assert.equal(r.salida.cola, false)
    assert.equal(r.cliente.mensajes.at(-1).envio, 'sin-canal')
    assert.equal(s3.leer('crm/indice.json').clientes[c.id].estado, 'atendiendo', 'la bandeja se entera')
  } finally { s3.restaurar() }
})

test('ruta: dos escrituras a la vez sobre el mismo cliente no se borran entre ellas', async () => {
  // Justo antes de la primera escritura de la tienda, el bot apunta un mensaje
  // del cliente. La escritura de la tienda tiene que fallar por versión,
  // volver a leer y aplicar encima: al final están los dos mensajes.
  let unaVez = true
  const s3 = s3DeMemoria({
    antesDeEscribir: async (clave) => {
      if (!unaVez || !clave.startsWith('crm/clientes/')) return
      unaVez = false
      const actual = s3.leer(clave)
      s3.poner(clave, registrarMensaje(actual, { de: 'cliente', texto: 'escrito en medio' }))
    },
  })
  try {
    const escrito = registrarMensaje(cliente({ plaza: 'leon' }), { de: 'cliente', texto: 'hola' })
    const c = aplicarAccion(escrito, { accion: 'entregar', plaza: 'leon' }, { quien: 'bot' }).cliente
    sembrarCliente(s3, c)
    const r = await pedir('POST', '/crm/responder', { token: tk('leon'), cuerpo: { id: c.id, texto: 'respuesta de la tienda' } })
    assert.equal(r.statusCode, 200)
    const final = s3.leer(`crm/clientes/${archivoDe(c.id)}`)
    assert.deepEqual(final.mensajes.map(m => m.texto), ['hola', 'escrito en medio', 'respuesta de la tienda'])
  } finally { s3.restaurar() }
})

test('ruta: una tienda da de alta sólo en su plaza, y un teléfono repetido no pisa al que ya existe', async () => {
  const s3 = s3DeMemoria()
  try {
    const r = json(await pedir('POST', '/crm/cliente', { token: tk('leon'), cuerpo: { nuevo: { nombre: 'Fundas Pérez', telefono: '477 555 1234', plaza: 'san-luis', tipo: 'mayorista' } } }))
    assert.equal(r.cliente.plaza, 'leon', 'la plaza la pone la sesión')
    assert.equal(r.cliente.id, 'wa:524775551234')
    assert.equal(r.cliente.tipo, 'mayorista')
    const otra = await pedir('POST', '/crm/cliente', { token: tk('leon', true), cuerpo: { nuevo: { nombre: 'Otro', telefono: '4775551234' } } })
    assert.equal(otra.statusCode, 409)
    assert.equal(s3.leer('crm/clientes/wa_524775551234.json').nombre, 'Fundas Pérez')
  } finally { s3.restaurar() }
})

test('ruta: capturarle teléfono a un mayorista de los tickets lo pasa a su llave de WhatsApp', async () => {
  const s3 = s3DeMemoria()
  try {
    const may = nuevoCliente({ id: 'may:leon:fundas-perez', canal: 'tickets', plaza: 'leon', tipo: 'mayorista', nombre: 'Fundas Pérez' })
    sembrarCliente(s3, may)
    const r = json(await pedir('POST', '/crm/cliente', { token: tk('leon'), cuerpo: { id: may.id, campos: { telefono: '4775551234', notas: 'paga en efectivo' } } }))
    assert.equal(r.vinculado, true)
    assert.equal(r.cliente.id, 'wa:524775551234')
    assert.equal(r.cliente.notas, 'paga en efectivo')
    const indice = s3.leer('crm/indice.json').clientes
    assert.ok(indice['wa:524775551234'])
    assert.equal(indice[may.id], undefined, 'el viejo sale de la bandeja')
    assert.equal(s3.leer('crm/clientes/may_leon_fundas-perez.json').fusionadoEn, 'wa:524775551234', 'pero no se borra')
  } finally { s3.restaurar() }
})

test('ruta: el bot es el único que entrega; una persona transfiere', async () => {
  const s3 = s3DeMemoria()
  try {
    const c = cliente({ plaza: 'leon' })
    sembrarCliente(s3, c)
    assert.equal((await pedir('POST', '/crm/accion', { token: tk('leon'), cuerpo: { id: c.id, accion: 'entregar', plaza: 'leon' } })).statusCode, 400)
    const r = json(await pedir('POST', '/crm/accion', { token: tk('leon'), cuerpo: { id: c.id, accion: 'transferir', plaza: 'aguascalientes', motivo: 'vive en Ags' } }))
    assert.equal(r.cliente.plaza, 'aguascalientes')
    assert.equal(r.cliente.bitacora.at(-1).quien, 'leon')
    const yaNoEsSuyo = await pedir('POST', '/crm/accion', { token: tk('leon'), cuerpo: { id: c.id, accion: 'tomar' } })
    assert.equal(yaNoEsSuyo.statusCode, 404, 'transferido, León ya no lo ve')
  } finally { s3.restaurar() }
})
