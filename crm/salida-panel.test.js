// Lo que la tienda escribe en el panel, de punta a punta:
//
//   panel ──▶ POST /crm/responder ──▶ ficha «pendiente» ──▶ cola ──▶
//   trabajador ──▶ WhatsApp ──▶ ficha «enviado» o «fallido: por qué»
//
// Con S3 y cola de mentira (`falsos.js`) y un WhatsApp que apunta lo que se le
// manda. Lo que se fija aquí son las formas en que esto MIENTE sin fallar: un
// mensaje que la pantalla da por dicho y no salió, uno que sale dos veces, y
// uno que se queda «enviando» para siempre.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import { s3Falso, colaFifoFalsa } from './falsos.js'
import { enS3, bandejaEnS3 } from './almacen-s3.js'
import { creaTrabajador, MAX_ENTREGAS } from './trabajador.js'
import { clasificarEnvio, motivoDeEstado, CLASES_DE_ALARMA } from './envio-errores.js'
import { recibir } from './handler.js'
import { entradasDeCola, encolarSalida } from '../backend/src/meta.js'
import { leerCarga } from '../backend/src/meta-webhook.js'
import { almacenDeClientes } from '../backend/src/clientes-s3.js'
import { responderDesdeElPanel } from '../backend/src/crm-salida.js'
import * as CRM from '../backend/src/clientes.js'

const SECRETO = 'secreto-de-meta-de-prueba'
process.env.META_APP_SECRET = SECRETO

const BUCKET = 'cubeta-de-prueba'
const ID = 'wa:524771234567'
// El trabajador mira la ventana con el reloj de verdad, así que «ahora» es ahora.
const T0 = Date.now()
const horas = n => T0 + n * 3600_000
const callado = { error() {}, warn() {} }
const LEON = { sucursal: 'leon', admin: false }

/** Un error como los que lanza `whatsapp-api.js`. */
const errorDeMeta = (codigo, estado = 400) => Object.assign(new Error(`(#${codigo}) algo de Meta`), { codigo, estado })

/**
 * Todo montado. `whatsapp(a, texto)` es el envío de mentira: por omisión
 * acepta y da un id, como Meta.
 */
function montar({ whatsapp, cola = colaFifoFalsa({ maxEntregas: MAX_ENTREGAS }), s3 = s3Falso() } = {}) {
  const mandados = []
  const { modificarCliente, escribirCliente } = almacenDeClientes({ s3, bucket: BUCKET })
  const trabajador = creaTrabajador({
    almacenes: () => ({ almacen: enS3({ s3, bucket: BUCKET }), bandeja: bandejaEnS3({ s3, bucket: BUCKET }) }),
    enviarTexto: async (a, texto) => {
      const r = whatsapp ? await whatsapp(a, texto, mandados.length) : { id: `wamid.S${mandados.length + 1}` }
      mandados.push({ a, texto })
      return r
    },
    pensar: async () => { throw new Error('la salida de la tienda no pasa por el modelo') },
    enviar: async () => { throw new Error('la salida de la tienda no usa el envío del bot') },
    leer: async () => {},
    registro: callado,
  })
  const encolar = trabajo => encolarSalida(trabajo, { encolar: m => cola.enviar(entradasDeCola(m)) })
  const ficha = (id = ID) => s3.json(`crm/clientes/${CRM.archivoDe(id)}`)

  /** Siembra un cliente de León que escribió hace `hace` horas. */
  async function cliente({ hace = 1, id = ID, extra = {} } = {}) {
    let c = CRM.nuevoCliente({ id, canal: 'whatsapp', telefono: '4771234567', plaza: 'leon', quien: 'bot', ...extra }, { ahora: horas(-hace) })
    c = CRM.registrarMensaje(c, { de: 'cliente', texto: '¿tienes para iphone 13?', id: 'wamid.C1' }, { ahora: horas(-hace) })
    await escribirCliente(c, null)
    return c
  }
  const responde = (texto, extra = {}) => responderDesdeElPanel({
    sesion: LEON, quien: 'leon', id: ID, texto, modificarCliente, encolar, ahora: T0, registro: callado, ...extra,
  })
  return { s3, cola, trabajador, mandados, ficha, cliente, responde, modificarCliente, encolar }
}

// ── El camino bueno ─────────────────────────────────────────────────────────

test('lo que escribe la tienda SALE por WhatsApp y la ficha lo apunta como enviado', async () => {
  const t = montar()
  await t.cliente({ hace: 1 })

  const r = await t.responde('Sí lo tenemos, a $230')
  assert.equal(r.codigo, 200)
  assert.equal(r.cuerpo.encolado, true)
  // Mientras está en la cola, la pantalla NO puede decir que salió.
  assert.equal(r.cuerpo.enviado, false)
  assert.equal(r.cuerpo.cliente.mensajes.at(-1).envio, 'pendiente')
  assert.equal(r.cuerpo.cliente.estado, 'atendiendo', 'contestar sigue siendo tomar')
  assert.equal(t.mandados.length, 0, 'el servidor no manda: manda el trabajador')

  await t.cola.vaciar(t.trabajador)

  assert.deepEqual(t.mandados, [{ a: '524771234567', texto: 'Sí lo tenemos, a $230' }])
  const m = t.ficha().mensajes.at(-1)
  assert.equal(m.envio, 'enviado')
  assert.equal(m.wamid, 'wamid.S1')
  assert.equal(t.cola.fallidos.length, 0)
})

test('se guarda ANTES de encolar: el trabajador encuentra el mensaje aunque corra al instante', async () => {
  const t = montar()
  await t.cliente({ hace: 1 })
  // Una cola que entrega en el mismo momento en que recibe.
  let enFicha = null
  const encolar = async trabajo => { enFicha = t.ficha().mensajes.find(m => m.id === trabajo.idEnvio)?.envio ?? null }
  await t.responde('hola', { encolar })
  assert.equal(enFicha, 'pendiente')
})

// ── La ventana de 24 horas ──────────────────────────────────────────────────

test('pasadas 24 horas NO se guarda ni se encola: hace falta una plantilla, y se dice', async () => {
  const t = montar()
  await t.cliente({ hace: 25 })
  const antes = t.ficha()

  const r = await t.responde('¿Sigues interesado?')
  assert.equal(r.codigo, 409)
  assert.match(r.cuerpo.error, /plantilla/)
  assert.equal(r.cuerpo.salida.codigo, 'ventana')
  // Un mensaje guardado en la conversación se lee como dicho. No se dijo.
  assert.deepEqual(t.ficha(), antes)
  assert.equal(t.cola.pendientes, 0)
})

test('la ventana se mide desde el ÚLTIMO mensaje del cliente, no desde el de la tienda ni el del bot', () => {
  let c = CRM.nuevoCliente({ id: ID, canal: 'whatsapp', telefono: '4771234567' }, { ahora: horas(-30) })
  c = CRM.registrarMensaje(c, { de: 'cliente', texto: 'hola' }, { ahora: horas(-30) })
  c = CRM.registrarMensaje(c, { de: 'bot', texto: 'hola, dime tu modelo' }, { ahora: horas(-1) })
  assert.equal(CRM.salidaDe(c, { ahora: T0 }).puede, false, 'que el bot hablara hace una hora no abre nada')

  c = CRM.registrarMensaje(c, { de: 'cliente', texto: 'iphone 13' }, { ahora: horas(-23.9) })
  const s = CRM.salidaDe(c, { ahora: T0 })
  assert.equal(s.puede, true)
  assert.equal(s.hasta, new Date(horas(0.1)).toISOString())
  assert.equal(CRM.salidaDe(c, { ahora: horas(0.1) }).puede, false, 'a las 24 horas exactas ya está cerrada')
})

test('la ventana no depende de que el mensaje del cliente siga en la lista, que se recorta', () => {
  let c = CRM.nuevoCliente({ id: ID, canal: 'whatsapp', telefono: '4771234567' }, { ahora: horas(-2) })
  c = CRM.registrarMensaje(c, { de: 'cliente', texto: 'hola' }, { ahora: horas(-2) })
  for (let i = 0; i < CRM.MAX_MENSAJES + 5; i++) c = CRM.registrarMensaje(c, { de: 'bot', texto: `r${i}` }, { ahora: horas(-1) })
  assert.equal(c.mensajes.some(m => m.de === 'cliente'), false, 'el del cliente ya se recortó')
  assert.equal(CRM.salidaDe(c, { ahora: T0 }).puede, true)
})

test('a quien nunca ha escrito no se le puede iniciar la conversación sin plantilla', async () => {
  const t = montar()
  const { escribirCliente } = almacenDeClientes({ s3: t.s3, bucket: BUCKET })
  await escribirCliente(CRM.nuevoCliente({ id: ID, canal: 'tienda', telefono: '4771234567', plaza: 'leon' }), null)
  const r = await t.responde('Hola, ya llegó tu modelo')
  assert.equal(r.codigo, 409)
  assert.equal(r.cuerpo.salida.codigo, 'sin-ventana')
  assert.equal(t.ficha().mensajes.length, 0)
})

test('si la ventana se cierra MIENTRAS el mensaje espera en la cola, queda fallido y no se manda', async () => {
  const t = montar()
  // El servidor lo aceptó cuando iban 23 horas; el trabajador lo recoge dos
  // horas después, con 25.
  await t.cliente({ hace: 25 })
  const r = await t.responde('Sí hay', { ahora: horas(-2) })
  assert.equal(r.cuerpo.encolado, true)
  await t.cola.vaciar(t.trabajador)
  assert.equal(t.mandados.length, 0)
  const m = t.ficha().mensajes.at(-1)
  assert.equal(m.envio, 'fallido')
  assert.match(m.motivo, /plantilla/)
})

// ── Cuando no sale ──────────────────────────────────────────────────────────

test('Meta rechaza por la ventana (131047): fallido con el motivo, SIN reintentar', async () => {
  const t = montar({ whatsapp: async () => { throw errorDeMeta(131047) } })
  await t.cliente({ hace: 1 })
  await t.responde('Sí hay')
  await t.cola.vaciar(t.trabajador)
  assert.equal(t.cola.entregas.length, 1, 'repetirlo daría lo mismo')
  const m = t.ficha().mensajes.at(-1)
  assert.equal(m.envio, 'fallido')
  assert.match(m.motivo, /24 horas/)
  assert.equal(t.cola.fallidos.length, 0, 'la tienda ya lo ve en la ficha: no hace falta la cola de fallidos')
  assert.equal(t.ficha().bitacora.at(-1).accion, 'no salió por WhatsApp')
})

test('un fallo pasajero se reintenta, y al segundo intento sale UNA vez', async () => {
  const t = montar({ whatsapp: async (a, texto, n) => { if (t.cola.entregas.length < 2) throw errorDeMeta(131000, 500); return { id: 'wamid.OK' } } })
  await t.cliente({ hace: 1 })
  await t.responde('Sí hay')
  await t.cola.vaciar(t.trabajador)
  assert.equal(t.cola.entregas.length, 2)
  assert.equal(t.mandados.length, 1)
  assert.equal(t.ficha().mensajes.at(-1).envio, 'enviado')
})

test('si falla todas las veces, queda FALLIDO con el motivo: nunca «enviando» para siempre', async () => {
  const t = montar({ whatsapp: async () => { throw Object.assign(new Error('fetch failed'), {}) } })
  await t.cliente({ hace: 1 })
  await t.responde('Sí hay')
  await t.cola.vaciar(t.trabajador)
  assert.equal(t.cola.entregas.length, MAX_ENTREGAS)
  const m = t.ficha().mensajes.at(-1)
  assert.equal(m.envio, 'fallido')
  assert.match(m.motivo, /se intentó 3 veces/)
})

test('si la cola no acepta el mensaje, queda fallido EN EL MOMENTO y la respuesta lo dice', async () => {
  const t = montar()
  await t.cliente({ hace: 1 })
  const r = await t.responde('Sí hay', { encolar: async () => { throw new Error('SQS caído') } })
  assert.equal(r.codigo, 200)
  assert.match(r.cuerpo.aviso, /NO salió por WhatsApp/)
  assert.equal(r.cuerpo.cliente.mensajes.at(-1).envio, 'fallido')
  assert.equal(t.ficha().mensajes.at(-1).envio, 'fallido')
})

test('sin cola configurada se guarda como nota y se dice; nunca «pendiente»', async () => {
  const t = montar()
  await t.cliente({ hace: 1 })
  const r = await t.responde('Sí hay', { encolar: null })
  assert.equal(r.cuerpo.cliente.mensajes.at(-1).envio, 'sin-canal')
  assert.match(r.cuerpo.aviso, /CRM_COLA_URL/)
  assert.equal(r.cuerpo.salida.cola, false)
})

test('un cliente sin WhatsApp (de tickets) se guarda como nota: no se encola nada', async () => {
  const t = montar()
  const id = 'may:leon:fundas-perez'
  const { escribirCliente } = almacenDeClientes({ s3: t.s3, bucket: BUCKET })
  await escribirCliente(CRM.nuevoCliente({ id, canal: 'tickets', plaza: 'leon', nombre: 'Fundas Pérez' }), null)
  const r = await t.responde('Le llamé, pasa el jueves', { id })
  assert.equal(r.codigo, 200)
  assert.equal(r.cuerpo.cliente.mensajes.at(-1).envio, 'sin-canal')
  assert.equal(t.cola.pendientes, 0)
})

// ── Que no salga dos veces ──────────────────────────────────────────────────

test('SQS entrega dos veces el mismo trabajo: el cliente recibe UN mensaje', async () => {
  const t = montar()
  await t.cliente({ hace: 1 })
  let trabajo
  await t.responde('Sí hay', { encolar: async x => { trabajo = x } })
  const registro = n => ({ Records: [{ messageId: `m${n}`, body: JSON.stringify({ clase: 'salida', ...trabajo }), attributes: { ApproximateReceiveCount: String(n) } }] })
  assert.deepEqual(await t.trabajador(registro(1)), { batchItemFailures: [] })
  assert.deepEqual(await t.trabajador(registro(2)), { batchItemFailures: [] })
  assert.equal(t.mandados.length, 1)
})

test('salió pero no se pudo apuntar: NO se reintenta (reintentar lo mandaría otra vez)', async () => {
  const s3 = s3Falso()
  const t = montar({ s3, whatsapp: async () => {
    // A partir de aquí S3 rechaza las escrituras: el envío ya salió.
    s3.fallar = c => (c.constructor.name === 'PutObjectCommand' ? Object.assign(new Error('S3 caído'), { $metadata: { httpStatusCode: 503 } }) : null)
    return { id: 'wamid.OK' }
  } })
  await t.cliente({ hace: 1 })
  await t.responde('Sí hay')
  await t.cola.vaciar(t.trabajador)
  assert.equal(t.cola.entregas.length, 1)
  assert.equal(t.mandados.length, 1)
})

test('S3 caído al LEER la ficha no tira el mensaje: se reintenta y sale', async () => {
  const s3 = s3Falso()
  const t = montar({ s3 })
  await t.cliente({ hace: 1 })
  await t.responde('Sí hay')
  let caidas = 1
  s3.fallar = c => (c.constructor.name === 'GetObjectCommand' && c.input.Key.startsWith('crm/clientes/') && caidas-- > 0
    ? Object.assign(new Error('S3 caído'), { $metadata: { httpStatusCode: 503 } }) : null)
  await t.cola.vaciar(t.trabajador)
  assert.equal(t.cola.entregas.length, 2)
  assert.equal(t.mandados.length, 1)
  assert.equal(t.ficha().mensajes.at(-1).envio, 'enviado')
})

test('si la ficha ya no existe (se borró la conversación), no se manda nada', async () => {
  const t = montar()
  await t.cola.enviar(entradasDeCola([{ clase: 'salida', para: '524771234567', cuerpo: 'hola', cliente: ID, idEnvio: 'p:x' }]))
  await t.cola.vaciar(t.trabajador)
  assert.equal(t.mandados.length, 0)
  assert.equal(t.cola.fallidos.length, 0)
})

// ── Privacidad ──────────────────────────────────────────────────────────────

test('una tienda no puede contestarle al cliente de otra plaza: 404, como si no existiera', async () => {
  const t = montar()
  await t.cliente({ hace: 1 })
  const r = await t.responde('hola', { sesion: { sucursal: 'san-luis', admin: false }, quien: 'san-luis' })
  assert.equal(r.codigo, 404)
  assert.equal(t.cola.pendientes, 0)
  assert.equal(t.ficha().mensajes.length, 1)
})

// ── La cola ─────────────────────────────────────────────────────────────────

test('la salida va en su PROPIO grupo: no espera detrás de un turno del bot que está fallando', () => {
  const [cliente, salida, estado] = entradasDeCola([
    { de: '5214771234567', id: 'wamid.C1', texto: 'hola' },
    { clase: 'salida', para: '524771234567', cuerpo: 'Sí hay', cliente: ID, idEnvio: 'p:1' },
    { clase: 'estado', id: 'wamid.S1', estado: 'failed', destino: '5214771234567', codigo: 131047 },
  ])
  assert.equal(cliente.grupo, '5214771234567')
  assert.equal(salida.grupo, 'salida-524771234567')
  assert.equal(estado.grupo, 'estado-5214771234567')
  assert.equal(new Set([cliente.dedup, salida.dedup, estado.dedup]).size, 3)
})

test('ni la salida ni el estado llevan `de`: un trabajador viejo los descarta en vez de dárselos al bot', () => {
  for (const e of entradasDeCola([
    { clase: 'salida', para: '524771234567', cuerpo: 'Sí hay', cliente: ID, idEnvio: 'p:1' },
    { clase: 'estado', id: 'wamid.S1', estado: 'failed', destino: '5214771234567' },
  ])) assert.equal('de' in JSON.parse(e.cuerpo), false)
})

test('dos respuestas seguidas al mismo cliente salen en el orden en que se escribieron', async () => {
  const t = montar()
  await t.cliente({ hace: 1 })
  await t.responde('Sí lo tenemos')
  await t.responde('Cuesta $230')
  await t.cola.vaciar(t.trabajador)
  assert.deepEqual(t.mandados.map(m => m.texto), ['Sí lo tenemos', 'Cuesta $230'])
})

// ── Lo que Meta avisa DESPUÉS: el estado `failed` ───────────────────────────

/** Una carga firmada con un estado, como las manda Meta. */
function estadoDeMeta(estado) {
  const crudo = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '111' }, statuses: [estado] } }] }] })
  return {
    requestContext: { http: { method: 'POST' } },
    headers: { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', SECRETO).update(crudo).digest('hex') },
    body: crudo,
  }
}

test('`leerCarga` conserva el código del error de un estado fallido', () => {
  const { estados } = leerCarga({ entry: [{ changes: [{ value: { statuses: [
    { id: 'wamid.S1', status: 'failed', recipient_id: '5214771234567', errors: [{ code: 131047, title: 'Re-engagement message' }] },
    { id: 'wamid.S2', status: 'delivered', recipient_id: '5214771234567' },
  ] } }] }] })
  assert.deepEqual(estados[0].error, { codigo: 131047, titulo: 'Re-engagement message' })
  assert.equal('error' in estados[1], false)
})

test('Meta aceptó el mensaje de la tienda y luego NO lo entregó: la ficha pasa de enviado a fallido', async () => {
  const t = montar()
  await t.cliente({ hace: 1 })
  await t.responde('Sí hay')
  await t.cola.vaciar(t.trabajador)
  assert.equal(t.ficha().mensajes.at(-1).envio, 'enviado')

  const r = await recibir(
    estadoDeMeta({ id: 'wamid.S1', status: 'failed', recipient_id: '5214771234567', errors: [{ code: 131026, title: 'Message undeliverable' }] }),
    { encolar: m => t.cola.enviar(entradasDeCola(m)) },
  )
  assert.equal(r.statusCode, 200)
  await t.cola.vaciar(t.trabajador)

  const m = t.ficha().mensajes.at(-1)
  assert.equal(m.envio, 'fallido')
  assert.match(m.motivo, /no tiene WhatsApp/)
  assert.equal(CRM.resumen(t.ficha()).noSalio, true, 'la lista de la bandeja también lo dice')
})

test('si lo que Meta no entregó era del BOT, el cliente queda marcado «sin respuesta»', async () => {
  const t = montar()
  await t.cliente({ hace: 1 })
  await recibir(
    estadoDeMeta({ id: 'wamid.DEL-BOT', status: 'failed', recipient_id: '5214771234567', errors: [{ code: 131026 }] }),
    { encolar: m => t.cola.enviar(entradasDeCola(m)) },
  )
  await t.cola.vaciar(t.trabajador)
  assert.match(t.ficha().sinRespuesta.motivo, /no le llegó la respuesta del bot/)
})

test('«entregado» y «leído» siguen sin encolarse: sólo `failed` cambia algo', async () => {
  const t = montar()
  for (const status of ['sent', 'delivered', 'read']) {
    await recibir(estadoDeMeta({ id: 'wamid.S1', status, recipient_id: '5214771234567' }), { encolar: m => t.cola.enviar(entradasDeCola(m)) })
  }
  assert.equal(t.cola.pendientes, 0)
})

// ── La regla de cada mensaje ────────────────────────────────────────────────

test('un mensaje que ya salió no vuelve a «fallido» por un reintento atrasado', () => {
  let c = CRM.nuevoCliente({ id: ID, canal: 'whatsapp', telefono: '4771234567' })
  c = CRM.registrarMensaje(c, { de: 'tienda', texto: 'Sí hay', quien: 'leon', id: 'p:1', envio: 'pendiente' })
  const enviado = CRM.marcarEnvio(c, 'p:1', { envio: 'enviado', wamid: 'wamid.S1' })
  assert.equal(CRM.marcarEnvio(enviado, 'p:1', { envio: 'fallido', motivo: 'tarde' }), enviado)
  assert.equal(CRM.marcarEnvio(enviado, 'p:otro', { envio: 'fallido' }), enviado, 'un id que no existe no toca nada')
})

// ── Los errores de Meta ─────────────────────────────────────────────────────

test('cada error de Meta se clasifica: qué se reintenta, qué no, y cuál dispara la alarma', () => {
  const de = (codigo, estado) => clasificarEnvio(errorDeMeta(codigo, estado))
  assert.deepEqual([de(190, 401).clase, de(190, 401).permanente, de(190, 401).alarma], ['token', true, true])
  assert.equal(clasificarEnvio({ estado: 401 }).clase, 'token', 'un 401 sin código también es el token')
  assert.deepEqual([de(131047).clase, de(131047).permanente, de(131047).alarma], ['ventana', true, false])
  assert.equal(de(131030).alarma, false, 'un número fuera de la lista de prueba es de UN cliente')
  assert.equal(de(131000, 500).permanente, false)
  assert.equal(de(130429, 429).permanente, false)
  assert.equal(de(200, 403).clase, 'permiso')
  assert.equal(de(99999, 400).permanente, true, 'un 4xx desconocido no se arregla repitiéndolo')
  assert.equal(de(99999, 503).permanente, false)
  assert.equal(clasificarEnvio(new Error('fetch failed')).permanente, false)
  const sinCredenciales = clasificarEnvio(new Error('Falta WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID'))
  assert.deepEqual([sinCredenciales.clase, sinCredenciales.alarma], ['configuracion', true])
  assert.ok(CLASES_DE_ALARMA.includes('token'))
})

test('el motivo que ve la tienda no lleva el texto crudo de Meta', () => {
  const e = clasificarEnvio(Object.assign(new Error('(#131030) Recipient phone number 524771234567 not in allowed list'), { codigo: 131030, estado: 400 }))
  assert.doesNotMatch(e.motivo, /\d{10}/)
  assert.match(motivoDeEstado({ codigo: 555, titulo: 'Algo nuevo' }), /error 555.*Algo nuevo/)
})
