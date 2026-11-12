// Los dos almacenes de S3, contra un S3 de mentira que SÍ respeta las
// escrituras condicionales (`falsos.js`). Lo que se prueba aquí es lo que no
// se ve cuando falla: una escritura que pisa a otra no da error, sólo hace
// desaparecer lo que alguien hizo.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { enS3, bandejaEnS3, PREFIJO_CONVERSACIONES } from './almacen-s3.js'
import { s3Falso } from './falsos.js'
import { apuntarEntrada, apuntarSalida, idWhatsApp } from './bandeja.js'
import { almacenDeClientes, Conflicto } from '../backend/src/clientes-s3.js'
import * as CRM from '../backend/src/clientes.js'

const BUCKET = 'cubeta-de-prueba'
const TEL = '5214771234567'
const callado = { warn() {} }

const mensaje = (extra = {}) => ({
  id: 'wamid.A1', de: TEL, nombre: 'Rosa', tipo: 'text', atendible: true,
  texto: '¿tienes para iphone 13?', anuncio: null, ...extra,
})

// ── La ficha: el bot y la tienda a la vez ───────────────────────────────────

test('el bot y la tienda modifican la misma ficha a la vez y no se pierde ninguno de los dos cambios', async () => {
  const s3 = s3Falso()
  const bandeja = bandejaEnS3({ s3, bucket: BUCKET })
  const panel = almacenDeClientes({ s3, bucket: BUCKET })
  const id = idWhatsApp(TEL)

  // El cliente escribe y el bot lo reparte a León: ya hay ficha.
  await apuntarEntrada(bandeja, mensaje(), { plaza: 'leon', registro: callado })

  // Ahora la carrera. El bot va a apuntar su respuesta; ya LEYÓ la ficha, y
  // justo antes de que escriba, alguien de la tienda la toma desde el panel.
  let seColo = 0
  s3.antesDeEscribir = async Key => {
    if (!Key.startsWith('crm/clientes/') || seColo++) return
    const r = await panel.modificarCliente(id, c => CRM.aplicarAccion(c, { accion: 'tomar' }, { quien: 'leon' }))
    assert.ok(r.cliente, 'la tienda tuvo que poder tomarla')
  }
  await apuntarSalida(bandeja, TEL, { texto: 'Sí hay, en negro y transparente.' }, { registro: callado })
  s3.antesDeEscribir = null

  assert.equal(seColo > 0, true, 'la escritura de la tienda no llegó a colarse: la prueba no probó nada')
  assert.ok(s3.rechazos >= 1, 'el bot tuvo que recibir un 412 y volver a leer')

  const ficha = (await panel.leerCliente(id)).cliente
  // Lo de la tienda:
  assert.equal(ficha.estado, 'atendiendo')
  assert.equal(ficha.atiende, 'leon')
  // Lo del bot:
  assert.deepEqual(ficha.mensajes.map(m => m.de), ['cliente', 'bot'])
  assert.equal(ficha.mensajes[1].texto, 'Sí hay, en negro y transparente.')
  // Y el índice, que es lo que lista el panel, dice lo mismo que la ficha.
  const renglon = s3.json('crm/indice.json').clientes[id]
  assert.equal(renglon.estado, 'atendiendo')
  assert.equal(renglon.ultimo.de, 'bot')
})

test('al revés: la tienda escribe mientras el bot ya escribió, y tampoco se pierde nada', async () => {
  const s3 = s3Falso()
  const bandeja = bandejaEnS3({ s3, bucket: BUCKET })
  const panel = almacenDeClientes({ s3, bucket: BUCKET })
  const id = idWhatsApp(TEL)
  await apuntarEntrada(bandeja, mensaje(), { plaza: 'leon', registro: callado })

  let seColo = 0
  s3.antesDeEscribir = async Key => {
    if (!Key.startsWith('crm/clientes/') || seColo++) return
    await apuntarSalida(bandeja, TEL, { texto: 'Te paso con la tienda.' }, { registro: callado })
  }
  const r = await panel.modificarCliente(id, c => CRM.editarFicha(c, { notas: 'Quiere factura' }, { quien: 'leon' }))
  s3.antesDeEscribir = null

  assert.ok(r.cliente)
  const ficha = (await panel.leerCliente(id)).cliente
  assert.equal(ficha.notas, 'Quiere factura')
  assert.equal(ficha.mensajes.at(-1).texto, 'Te paso con la tienda.')
})

test('dos mensajes de un número nuevo a la vez no crean dos fichas ni se pisan', async () => {
  const s3 = s3Falso()
  const a = bandejaEnS3({ s3, bucket: BUCKET })
  const b = bandejaEnS3({ s3, bucket: BUCKET })
  await Promise.all([
    apuntarEntrada(a, mensaje({ id: 'wamid.A1', texto: 'hola' }), { registro: callado }),
    apuntarEntrada(b, mensaje({ id: 'wamid.A2', texto: 'tienes para iphone 13?' }), { registro: callado }),
  ])
  const ficha = s3.json(`crm/clientes/${CRM.archivoDe(idWhatsApp(TEL))}`)
  assert.deepEqual(ficha.mensajes.map(m => m.id).sort(), ['wamid.A1', 'wamid.A2'])
  assert.equal(s3.llaves.filter(k => k.startsWith('crm/clientes/')).length, 1)
})

test('la bandeja del bot escribe en las MISMAS llaves que el panel, y todo bajo crm/', async () => {
  const s3 = s3Falso()
  await apuntarEntrada(bandejaEnS3({ s3, bucket: BUCKET }), mensaje(), { registro: callado })
  const id = idWhatsApp(TEL)
  assert.deepEqual(s3.llaves, [`crm/clientes/${CRM.archivoDe(id)}`, 'crm/indice.json'])
  // Lo que el panel lista sale de ahí sin más.
  const { clientes } = await almacenDeClientes({ s3, bucket: BUCKET }).listarClientes()
  assert.equal(clientes.length, 1)
  assert.equal(clientes[0].id, id)
})

test('si la ficha no deja de cambiar, modificar se rinde con Conflicto en vez de pisar', async () => {
  const s3 = s3Falso()
  const bandeja = bandejaEnS3({ s3, bucket: BUCKET, reintentos: 3 })
  const id = idWhatsApp(TEL)
  await apuntarEntrada(bandeja, mensaje(), { registro: callado })
  const antes = s3.json(`crm/clientes/${CRM.archivoDe(id)}`)

  // Un S3 que rechaza toda escritura condicionada de esa ficha.
  const rechazo = Object.assign(new Error('412'), { name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } })
  s3.fallar = c => (c.constructor.name === 'PutObjectCommand' && c.input.Key.startsWith('crm/clientes/') ? rechazo : null)
  await assert.rejects(
    bandeja.modificar(id, c => CRM.registrarMensaje(c, { de: 'bot', texto: 'x' })),
    Conflicto,
  )
  s3.fallar = null
  assert.deepEqual(s3.json(`crm/clientes/${CRM.archivoDe(id)}`), antes)
})

// ── Las conversaciones ──────────────────────────────────────────────────────

test('la conversación se guarda en un archivo por teléfono, bajo el prefijo privado', async () => {
  const s3 = s3Falso()
  const almacen = enS3({ s3, bucket: BUCKET })
  const c = await almacen.obtener(TEL)
  await almacen.guardar({ ...c, plaza: 'leon', historial: [{ role: 'user', content: 'hola' }] })

  assert.deepEqual(s3.llaves, [`${PREFIJO_CONVERSACIONES}${TEL}.json`])
  // Otro proceso —otra invocación de la Lambda— lee lo mismo.
  const otra = await enS3({ s3, bucket: BUCKET }).obtener(TEL)
  assert.equal(otra.plaza, 'leon')
  assert.equal(otra.historial.length, 1)
})

test('ninguna llave del CRM puede caer en inventarios/ ni config/, que son públicos', async () => {
  const s3 = s3Falso()
  // Ni queriendo: un teléfono con cosas raras se queda en sus dígitos.
  const almacen = enS3({ s3, bucket: BUCKET })
  await almacen.guardar({ telefono: '../../config/52 477-123', historial: [] })
  await apuntarEntrada(bandejaEnS3({ s3, bucket: BUCKET }), mensaje(), { registro: callado })
  for (const llave of s3.llaves) assert.match(llave, /^crm\//)
  assert.ok(s3.llaves.includes(`${PREFIJO_CONVERSACIONES}52477123.json`))
})

test('yaAtendido marca en S3: el mismo mensaje en otra invocación ya está visto', async () => {
  const s3 = s3Falso()
  assert.equal(await enS3({ s3, bucket: BUCKET }).yaAtendido(TEL, 'wamid.A1'), false)
  assert.equal(await enS3({ s3, bucket: BUCKET }).yaAtendido(TEL, 'wamid.A1'), true)
  // Y olvidarlo lo deja entrar otra vez, que es lo que permite el reintento.
  await enS3({ s3, bucket: BUCKET }).olvidarMensaje(TEL, 'wamid.A1')
  assert.equal(await enS3({ s3, bucket: BUCKET }).yaAtendido(TEL, 'wamid.A1'), false)
})

test('dos invocaciones que marcan el mismo mensaje a la vez: sólo una gana', async () => {
  const s3 = s3Falso()
  const uno = enS3({ s3, bucket: BUCKET }), otro = enS3({ s3, bucket: BUCKET })
  const r = await Promise.allSettled([uno.yaAtendido(TEL, 'wamid.A1'), otro.yaAtendido(TEL, 'wamid.A1')])
  const ganaron = r.filter(x => x.status === 'fulfilled' && x.value === false)
  const chocaron = r.filter(x => x.status === 'rejected' && x.reason instanceof Conflicto)
  // Sin la escritura condicional las dos dirían «no visto» y el cliente
  // recibiría dos respuestas.
  assert.equal(ganaron.length, 1)
  assert.equal(chocaron.length, 1)
})

test('una escritura con una lectura vieja se rechaza: no pisa lo que guardó otra invocación', async () => {
  const s3 = s3Falso()
  const lenta = enS3({ s3, bucket: BUCKET }), rapida = enS3({ s3, bucket: BUCKET })
  const vieja = await lenta.obtener(TEL)
  const c = await rapida.obtener(TEL)
  await rapida.guardar({ ...c, historial: [{ role: 'user', content: 'lo nuevo' }] })

  await assert.rejects(lenta.guardar({ ...vieja, historial: [] }), Conflicto)
  assert.equal(s3.json(`${PREFIJO_CONVERSACIONES}${TEL}.json`).historial[0].content, 'lo nuevo')
})

test('un S3 caído NO se lee como conversación nueva: el error sube y el turno se reintenta', async () => {
  const s3 = s3Falso()
  const almacen = enS3({ s3, bucket: BUCKET })
  s3.fallar = () => Object.assign(new Error('se cayó'), { name: 'ServiceUnavailable', $metadata: { httpStatusCode: 503 } })
  await assert.rejects(almacen.obtener(TEL), /se cayó/)
  await assert.rejects(almacen.yaAtendido(TEL, 'wamid.A1'), /se cayó/)
})
