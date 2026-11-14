// Un cliente que escribe SIN enseñar su teléfono.
//
// Meta estrenó los nombres de usuario de WhatsApp: el webhook trae ahora un
// identificador de usuario (`user_id` en el contacto, `from_user_id` en el
// mensaje) junto al teléfono, y quien adopta un nombre de usuario puede llegar
// SIN `from` ni `wa_id`. Todo el CRM daba por hecho que el remitente es un
// teléfono: la cola se agrupa por él, la ficha se llama por él y la
// conversación se guarda por él.
//
// Lo que se fija aquí:
//
//   · sin teléfono, el mensaje NO se pierde: entra a la cola, se contesta y
//     deja ficha y conversación;
//   · se le contesta a su identificador (`recipient`), no a un `to` vacío;
//   · quien ya tenía ficha con teléfono NO estrena una segunda;
//   · lo que ya funcionaba con teléfonos —el 521 → 52 de México— sigue igual.
//
// SUPUESTO, no comprobado en vivo: la forma del webhook y del envío es la de la
// documentación de Meta leída el 2026-11-13. El número de prueba no tiene
// nombre de usuario, así que ningún mensaje real ha pasado por aquí.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import { s3Falso, colaFifoFalsa } from './falsos.js'
import { enS3, bandejaEnS3 } from './almacen-s3.js'
import { creaTrabajador, MAX_ENTREGAS } from './trabajador.js'
import { atender } from './atender.js'
import { enMemoria, llaveDeRemitente } from './conversaciones.js'
import { bandejaEnMemoria, idWhatsApp, conRemitente } from './bandeja.js'
import { mandarTexto, paraEnvio } from './whatsapp-api.js'
import { entradasDeCola } from '../backend/src/meta.js'
import { leerCarga, TIPOS_SIN_RESPUESTA } from '../backend/src/meta-webhook.js'
import { almacenDeClientes } from '../backend/src/clientes-s3.js'
import * as CRM from '../backend/src/clientes.js'

const BUCKET = 'cubeta-de-prueba'
const BSUID = 'MX.13491208655302741918'
const ROSA = '5214771234567'
const callado = { error() {}, warn() {}, log() {} }

/** Una carga de Meta. Sin `telefono`, es la de quien escribe sin enseñarlo. */
const carga = ({ telefono = null, usuario = BSUID, texto = '¿Tienen funda para A15?', id = 'wamid.U1', tipo = 'text', extra = {} } = {}) => ({
  entry: [{ changes: [{ value: {
    metadata: { phone_number_id: '111' },
    contacts: [{ ...(telefono && { wa_id: telefono }), ...(usuario && { user_id: usuario }), profile: { name: 'Rosa' } }],
    messages: [{
      ...(telefono && { from: telefono }), ...(usuario && { from_user_id: usuario }),
      id, timestamp: String(Math.floor(Date.now() / 1000)), type: tipo,
      ...(tipo === 'text' && { text: { body: texto } }), ...extra,
    }],
  } }] }],
})
const mensajeDe = opciones => leerCarga(carga(opciones)).mensajes[0]

/** El trabajador con S3 y cola de mentira, y un modelo que contesta fijo. */
function montar() {
  const s3 = s3Falso(), cola = colaFifoFalsa({ maxEntregas: MAX_ENTREGAS })
  const enviados = [], pensado = []
  const trabajador = creaTrabajador({
    almacenes: () => ({ almacen: enS3({ s3, bucket: BUCKET }), bandeja: bandejaEnS3({ s3, bucket: BUCKET }) }),
    pensar: async args => {
      pensado.push(args)
      return { texto: 'Sí tengo.', imagenes: [], historial: [...args.historial, { role: 'user', content: args.entrada }, { role: 'assistant', content: [{ type: 'text', text: 'Sí tengo.' }] }] }
    },
    enviar: async (a, r) => { enviados.push({ a, texto: r.texto }); return { id: `wamid.R${enviados.length}` } },
    enviarTexto: async (a, texto) => { enviados.push({ a, texto }); return { id: `wamid.R${enviados.length}` } },
    leer: async () => {},
    registro: callado,
  })
  const llega = async opciones => {
    await cola.enviar(entradasDeCola(leerCarga(carga(opciones)).mensajes))
    await cola.vaciar(trabajador)
  }
  const ficha = id => s3.json(`crm/clientes/${CRM.archivoDe(id)}`)
  return { s3, cola, trabajador, enviados, pensado, llega, ficha }
}

// ── El webhook ──────────────────────────────────────────────────────────────

test('con teléfono Y usuario, el remitente sigue siendo el teléfono y el usuario se apunta', () => {
  const m = mensajeDe({ telefono: ROSA })
  assert.equal(m.de, ROSA)
  assert.equal(m.usuario, BSUID)
  assert.equal(m.nombre, 'Rosa')
})

test('sin teléfono, el mensaje se lee igual: trae el usuario y el nombre', () => {
  const m = mensajeDe()
  assert.ok(!m.de, 'no hay teléfono que inventar')
  assert.equal(m.usuario, BSUID)
  assert.equal(m.nombre, 'Rosa')
  assert.equal(m.texto, '¿Tienen funda para A15?')
})

test('un webhook de antes, sin ningún usuario, se lee como siempre', () => {
  const m = mensajeDe({ telefono: ROSA, usuario: null })
  assert.equal(m.de, ROSA)
  assert.ok(!('usuario' in m))
})

test('un fallo de entrega a alguien sin teléfono trae a quién iba', () => {
  const { estados } = leerCarga({ entry: [{ changes: [{ value: {
    statuses: [{ id: 'wamid.S1', status: 'failed', recipient_user_id: BSUID, errors: [{ code: 131026, title: 'Undeliverable' }] }],
  } }] }] })
  assert.equal(estados[0].usuario, BSUID)
})

// ── La cola ─────────────────────────────────────────────────────────────────

test('sin teléfono el mensaje entra a la cola, con su propio grupo', () => {
  const [e] = entradasDeCola([mensajeDe()])
  assert.ok(e, 'antes se descartaba como «sin remitente»')
  assert.match(e.grupo, /^u-[0-9a-f]+$/)
  const [otro] = entradasDeCola([mensajeDe({ usuario: 'MX.999', id: 'wamid.U2' })])
  assert.notEqual(otro.grupo, e.grupo, 'dos personas no comparten fila')
  const [mismo] = entradasDeCola([mensajeDe({ id: 'wamid.U3' })])
  assert.equal(mismo.grupo, e.grupo, 'la misma persona va en orden')
})

test('con teléfono el grupo de la cola no cambió', () => {
  const [e] = entradasDeCola([mensajeDe({ telefono: ROSA })])
  const [viejo] = entradasDeCola([mensajeDe({ telefono: ROSA, usuario: null })])
  assert.equal(e.grupo, viejo.grupo)
})

// ── Las llaves ──────────────────────────────────────────────────────────────

test('la ficha y la conversación de un usuario tienen llave propia y válida', () => {
  const id = idWhatsApp(BSUID)
  assert.equal(id, 'wa:u-MX-13491208655302741918')
  assert.ok(CRM.idValido(id))
  assert.equal(llaveDeRemitente(BSUID), 'u-MX-13491208655302741918')
  assert.equal(llaveDeRemitente('MX.ENT.ab12'), 'u-MX-ENT-ab12')
  assert.equal(llaveDeRemitente(ROSA), ROSA, 'la de un teléfono no cambió')
  assert.equal(idWhatsApp(ROSA), CRM.idDe({ canal: 'whatsapp', telefono: ROSA }))
})

test('algo que no es un usuario de WhatsApp no pasa por uno', () => {
  for (const malo of ['', null, 'mx.123', 'MX.', '../../etc', 'MX.12/34', ROSA]) {
    assert.equal(CRM.esBsuid(malo), false, String(malo))
  }
  assert.equal(CRM.idDe({ canal: 'whatsapp', usuario: '../../x' }), '')
})

// ── De punta a punta ────────────────────────────────────────────────────────

test('alguien sin teléfono escribe: se le contesta a su usuario y queda ficha y conversación', async () => {
  const t = montar()
  await t.llega()
  assert.equal(t.cola.fallidos.length, 0)
  assert.deepEqual(t.enviados, [{ a: BSUID, texto: 'Sí tengo.' }])

  const c = t.ficha(idWhatsApp(BSUID))
  assert.ok(c, 'tiene ficha')
  assert.equal(c.usuario, BSUID)
  assert.ok(!c.telefono, 'no se inventa un teléfono')
  assert.equal(c.nombre, 'Rosa')
  assert.deepEqual(c.mensajes.map(m => m.de), ['cliente', 'bot'])
  assert.ok(t.s3.json(`crm/conversaciones/${llaveDeRemitente(BSUID)}.json`), 'y conversación con su llave')

  // Y sale en la lista del panel, con el dato que la pantalla usa para decir
  // «sin número».
  const { listarClientes } = almacenDeClientes({ s3: t.s3, bucket: BUCKET })
  const [r] = (await listarClientes()).clientes
  assert.equal(r.usuario, BSUID)
  assert.ok(!r.telefono)
})

test('su segundo mensaje sigue la MISMA conversación', async () => {
  const t = montar()
  await t.llega()
  await t.llega({ id: 'wamid.U2', texto: '¿Y en rosa?' })
  assert.equal(t.pensado[1].historial.length, 2, 'el modelo ve lo que ya se habló')
  assert.equal(t.ficha(idWhatsApp(BSUID)).mensajes.length, 4)
})

test('quien ya tenía ficha con teléfono NO estrena otra al llegar sin él', async () => {
  const t = montar()
  await t.llega({ telefono: ROSA })                       // Meta manda las dos cosas
  const conTelefono = idWhatsApp(ROSA)
  assert.equal(t.ficha(conTelefono).usuario, BSUID, 'el usuario se apuntó en su ficha')
  assert.equal(t.ficha(conTelefono).waId, ROSA, 'y el número como lo manda Meta, que es la llave de su conversación')

  await t.llega({ id: 'wamid.U2', texto: '¿Y en rosa?' })  // ahora sin teléfono
  assert.equal(t.ficha(idWhatsApp(BSUID)), null, 'una segunda ficha partiría su historia en dos')
  assert.equal(t.ficha(conTelefono).mensajes.length, 4)
  assert.equal(t.pensado[1].historial.length, 2, 'y sigue su conversación de siempre')
  assert.equal(t.enviados[1].a, BSUID, 'se le contesta por donde escribió')
})

test('una ficha vieja, sin usuario, lo aprende la siguiente vez que escribe', async () => {
  const t = montar()
  await t.llega({ telefono: ROSA, usuario: null })
  assert.ok(!t.ficha(idWhatsApp(ROSA)).usuario)
  await t.llega({ telefono: ROSA, id: 'wamid.U2' })
  assert.equal(t.ficha(idWhatsApp(ROSA)).usuario, BSUID)
})

test('conRemitente: no toca un mensaje con teléfono ni inventa uno sin usuario', async () => {
  const bandeja = bandejaEnMemoria()
  const con = mensajeDe({ telefono: ROSA })
  assert.equal(await conRemitente(con, bandeja), con)
  const nada = { id: 'x', tipo: 'text' }
  assert.equal(await conRemitente(nada, bandeja), nada)
  const sin = await conRemitente(mensajeDe(), bandeja)
  assert.equal(sin.de, BSUID)
  assert.ok(!sin.responderA)
})

// ── El envío ────────────────────────────────────────────────────────────────

/** Un Meta de mentira que apunta el cuerpo que se le manda. */
function graphFalso() {
  const cuerpos = []
  const fetchImpl = async (url, o) => {
    cuerpos.push(JSON.parse(o.body))
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.OK' }] }) }
  }
  return { cuerpos, fetchImpl }
}
const conCredenciales = async fn => {
  const antes = { t: process.env.WHATSAPP_TOKEN, n: process.env.WHATSAPP_PHONE_NUMBER_ID }
  process.env.WHATSAPP_TOKEN = 'TOKEN-DE-PRUEBA'; process.env.WHATSAPP_PHONE_NUMBER_ID = '111'
  try { return await fn() } finally {
    for (const [k, v] of [['WHATSAPP_TOKEN', antes.t], ['WHATSAPP_PHONE_NUMBER_ID', antes.n]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v
    }
  }
}

test('a un usuario se le manda con `recipient`, sin `to`', async () => {
  const g = graphFalso()
  await conCredenciales(() => mandarTexto(BSUID, 'hola', { fetchImpl: g.fetchImpl }))
  assert.equal(g.cuerpos[0].recipient, BSUID)
  assert.ok(!('to' in g.cuerpos[0]), 'un `to` con algo que no es teléfono lo rechaza Meta')
})

test('a un teléfono mexicano se le sigue quitando el 1: 521… → 52…', async () => {
  const g = graphFalso()
  await conCredenciales(() => mandarTexto(ROSA, 'hola', { fetchImpl: g.fetchImpl }))
  assert.equal(g.cuerpos[0].to, '524771234567')
  assert.ok(!('recipient' in g.cuerpos[0]))
  assert.equal(paraEnvio(ROSA), '524771234567')
  assert.equal(paraEnvio('524771234567'), '524771234567')
})

// ── Lo que no se contesta ───────────────────────────────────────────────────

test('una reacción o un aviso del sistema no se contestan ni gastan modelo', async () => {
  for (const tipo of TIPOS_SIN_RESPUESTA) {
    const enviados = []
    const r = await atender({ id: 'wamid.X', de: ROSA, tipo, atendible: false, texto: null }, {
      almacen: enMemoria(), bandeja: bandejaEnMemoria(), registro: callado, leer: async () => {},
      enviar: async (a, x) => { enviados.push(x) }, pensar: async () => { throw new Error('no debe pensar') },
    })
    assert.equal(r.motivo, 'no-se-contesta', tipo)
    assert.equal(enviados.length, 0, tipo)
  }
})

test('y ni siquiera llegan a la cola; lo demás del mismo aviso sí', async () => {
  const SECRETO = 'secreto-de-meta-de-prueba'
  const antes = process.env.META_APP_SECRET
  process.env.META_APP_SECRET = SECRETO
  try {
    const { recibir } = await import('./handler.js')
    const c = carga({ telefono: ROSA })
    c.entry[0].changes[0].value.messages.push(
      { from: ROSA, id: 'wamid.RX', timestamp: '1794000000', type: 'reaction', reaction: { message_id: 'wamid.A', emoji: '👍' } })
    const crudo = JSON.stringify(c)
    const encolados = []
    const r = await recibir({
      requestContext: { http: { method: 'POST' } },
      headers: { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', SECRETO).update(crudo).digest('hex') },
      body: crudo,
    }, { encolar: async m => { encolados.push(...m) } })
    assert.equal(r.statusCode, 200)
    assert.deepEqual(encolados.map(m => m.tipo), ['text'])
  } finally {
    if (antes === undefined) delete process.env.META_APP_SECRET; else process.env.META_APP_SECRET = antes
  }
})
