// La ruta `/meta/webhook`, simulando lo que manda la Lambda con URL de función.
//
// No toca SQS: la cola se inyecta. Lo que se fija aquí es lo que hace que un
// webhook de Meta falle sin dar pistas —la firma sobre el cuerpo crudo, el
// challenge en texto plano— y que un mensaje nunca se dé por recibido si no
// llegó a la cola.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const SECRETO_META = 'secreto-de-la-app-de-meta-de-prueba'
const TOKEN_META = 'token-de-verificacion-de-prueba'

process.env.S3_BUCKET           = 'bucket-de-pruebas'
process.env.S3_REGION           = 'us-east-1'
process.env.SESION_SECRETO      = 'secreto-de-pruebas-suficientemente-largo'
process.env.ORIGENES_PERMITIDOS = 'https://ejemplo.test'
process.env.META_APP_SECRET     = SECRETO_META
process.env.META_VERIFY_TOKEN   = TOKEN_META
delete process.env.CRM_COLA_URL

const { handler } = await import('../src/index.js')
const { rutaMetaWebhook, entradasDeCola, encolarEnSqs, RUTA_META } = await import('../src/meta.js')

const firmar = crudo => 'sha256=' + crypto.createHmac('sha256', SECRETO_META).update(crudo).digest('hex')

/** Una carga como las de Meta, con los mensajes que se pidan. */
const carga = mensajes => JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ value: {
    metadata: { phone_number_id: '111' },
    contacts: [...new Set(mensajes.map(m => m.de))].map(de => ({ wa_id: de, profile: { name: 'Rosa' } })),
    messages: mensajes.map(m => ({ from: m.de, id: m.id, timestamp: '1794000000', type: 'text', text: { body: m.texto } })),
  } }] }],
})

const post = (crudo, { firma = firmar(crudo), base64 = false, cabeceras = {} } = {}) => ({
  rawPath: RUTA_META,
  requestContext: { http: { method: 'POST', sourceIp: '31.13.0.1' } },
  // Sin `origin`: Meta no es un navegador.
  headers: { 'x-hub-signature-256': firma, 'content-type': 'application/json', ...cabeceras },
  body: base64 ? Buffer.from(crudo).toString('base64') : crudo,
  isBase64Encoded: base64,
})

const UNO = [{ de: '5214771234567', id: 'wamid.A1', texto: 'hola' }]

// ── El enganche ─────────────────────────────────────────────────────────────

test('GET con el token bueno devuelve el challenge TAL CUAL, en texto plano', async () => {
  const r = await handler({
    rawPath: RUTA_META,
    requestContext: { http: { method: 'GET' } },
    headers: {},
    queryStringParameters: { 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN_META, 'hub.challenge': '1158201444' },
  })
  assert.equal(r.statusCode, 200)
  assert.equal(r.body, '1158201444')
  assert.match(r.headers['Content-Type'], /^text\/plain/)
})

test('GET con otro token no entrega el challenge', async () => {
  const r = await handler({
    rawPath: RUTA_META,
    requestContext: { http: { method: 'GET' } },
    headers: {},
    queryStringParameters: { 'hub.mode': 'subscribe', 'hub.verify_token': 'otro', 'hub.challenge': '1158201444' },
  })
  assert.equal(r.statusCode, 403)
  assert.doesNotMatch(r.body, /1158201444/)
})

// ── La firma ────────────────────────────────────────────────────────────────

test('POST sin firma válida da 401 y no encola nada', async () => {
  const encolados = []
  const encolar = async m => { encolados.push(...m) }
  const crudo = carga(UNO)
  for (const firma of [null, 'sha256=' + '0'.repeat(64), firmar(crudo + ' ')]) {
    const r = await rutaMetaWebhook(post(crudo, { firma }), { encolar })
    assert.equal(r.statusCode, 401)
  }
  assert.equal(encolados.length, 0)
})

test('la firma se valida sobre el cuerpo CRUDO: un JSON con espacios raros sigue valiendo', async () => {
  // Los mismos datos, serializados como le dio la gana a quien los mandó. Si
  // la ruta parseara y volviera a serializar antes de validar, esto daría 401.
  const crudo = JSON.stringify(JSON.parse(carga(UNO)), null, 3).replace(/"object"/, '  "object"')
  const encolados = []
  const r = await rutaMetaWebhook(post(crudo), { encolar: async m => { encolados.push(...m) } })
  assert.equal(r.statusCode, 200)
  assert.equal(encolados.length, 1)
})

test('el cuerpo en base64 —así llega a veces a la Lambda— se valida y se lee igual', async () => {
  const encolados = []
  const r = await rutaMetaWebhook(post(carga(UNO), { base64: true }), { encolar: async m => { encolados.push(...m) } })
  assert.equal(r.statusCode, 200)
  assert.equal(encolados[0].texto, 'hola')
})

// ── Por dentro del handler de verdad ────────────────────────────────────────

test('la ruta no pasa por el control de origen ni por el parseo JSON del backend', async () => {
  // Con una firma buena y SIN `CRM_COLA_URL`, lo que tiene que salir es el
  // fallo de la cola (500). Un 403 sería el control de origen metiéndose, y un
  // 400 el parseo: cualquiera de los dos dejaría el webhook muerto.
  const r = await handler(post(carga(UNO), { cabeceras: { origin: 'https://graph.facebook.com' } }))
  assert.equal(r.statusCode, 500)
  assert.deepEqual(JSON.parse(r.body), { error: 'cola' })
})

test('sin cola configurada NO se contesta 200: Meta tiene que reintentar', async () => {
  const errores = console.error
  console.error = () => {}
  try {
    const r = await handler(post(carga(UNO)))
    assert.equal(r.statusCode, 500)
  } finally { console.error = errores }
})

test('una carga firmada pero ilegible se acusa con 200 para que Meta no la repita siempre', async () => {
  const r = await handler(post('esto no es json'))
  assert.equal(r.statusCode, 200)
})

test('las demás rutas siguen igual: el control de origen no se abrió para nadie más', async () => {
  const r = await handler({
    rawPath: '/login',
    requestContext: { http: { method: 'POST', sourceIp: '1.2.3.4' } },
    headers: { origin: 'https://sitio-malicioso.test' },
    body: '{}',
  })
  assert.equal(r.statusCode, 403)
})

test('sólo esa ruta exacta: /meta/webhook/otra-cosa no es el webhook', async () => {
  const r = await handler({
    rawPath: '/meta/webhook/x',
    requestContext: { http: { method: 'GET' } },
    headers: {},
    queryStringParameters: { 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN_META, 'hub.challenge': '9' },
  })
  assert.notEqual(r.body, '9')
})

// ── Lo que se manda a la cola ───────────────────────────────────────────────

test('cada mensaje va a la cola por separado, con su teléfono como grupo', async () => {
  const mensajes = [
    { de: '5214771234567', id: 'wamid.A1', texto: 'hola' },
    { de: '5214771234567', id: 'wamid.A2', texto: 'tienes para iphone 13?' },
    { de: '5214499999999', id: 'wamid.B1', texto: 'buenas' },
  ]
  let leidos
  await rutaMetaWebhook(post(carga(mensajes)), { encolar: async m => { leidos = m } })
  const entradas = entradasDeCola(leidos)

  assert.deepEqual(entradas.map(e => e.grupo), ['5214771234567', '5214771234567', '5214499999999'])
  // El orden de llegada se conserva: es el que SQS respeta dentro del grupo.
  assert.deepEqual(entradas.map(e => JSON.parse(e.cuerpo).id), ['wamid.A1', 'wamid.A2', 'wamid.B1'])
  // Tres mensajes, tres ids de deduplicación distintos, y con la forma que
  // SQS acepta (128 caracteres como mucho, sin símbolos raros).
  assert.equal(new Set(entradas.map(e => e.dedup)).size, 3)
  for (const e of entradas) assert.match(e.dedup, /^[a-f0-9]{64}$/)
})

test('el mismo mensaje repetido por Meta lleva el MISMO id de deduplicación', () => {
  const a = entradasDeCola([{ de: '5214771234567', id: 'wamid.A1', texto: 'hola', cuando: 'x' }])
  const b = entradasDeCola([{ de: '5214771234567', id: 'wamid.A1', texto: 'hola', cuando: 'y' }])
  assert.equal(a[0].dedup, b[0].dedup)
})

test('un mensaje sin remitente no se encola: sin grupo SQS rechazaría el lote entero', () => {
  const e = entradasDeCola([{ de: null, id: 'wamid.X' }, { de: '5214771234567', id: 'wamid.A1' }])
  assert.equal(e.length, 1)
  assert.equal(e[0].grupo, '5214771234567')
})

test('encolarEnSqs manda lotes de diez con grupo y deduplicación', async () => {
  class SendMessageBatchCommand { constructor(input) { this.input = input } }
  const enviados = []
  const sqs = { send: async c => { enviados.push(c.input); return { Successful: c.input.Entries } } }
  const encolar = encolarEnSqs({ sqs, url: 'https://sqs.test/cola.fifo', SendMessageBatchCommand })

  await encolar(Array.from({ length: 12 }, (_, i) => ({ de: '5214771234567', id: `wamid.${i}`, texto: 'x' })))

  assert.deepEqual(enviados.map(l => l.Entries.length), [10, 2])
  assert.equal(enviados[0].QueueUrl, 'https://sqs.test/cola.fifo')
  const todas = enviados.flatMap(l => l.Entries)
  assert.ok(todas.every(e => e.MessageGroupId === '5214771234567' && e.MessageDeduplicationId))
  // Dentro de un lote los Id no se repiten, o SQS rechaza el lote.
  for (const l of enviados) assert.equal(new Set(l.Entries.map(e => e.Id)).size, l.Entries.length)
})

test('si SQS acepta el lote pero rechaza un mensaje, se lanza: el webhook contesta 500', async () => {
  class SendMessageBatchCommand { constructor(input) { this.input = input } }
  const sqs = { send: async () => ({ Successful: [], Failed: [{ Id: '0', Code: 'InternalError' }] }) }
  const encolar = encolarEnSqs({ sqs, url: 'u', SendMessageBatchCommand })

  const errores = console.error
  console.error = () => {}
  try {
    const r = await rutaMetaWebhook(post(carga(UNO)), { encolar })
    assert.equal(r.statusCode, 500)
  } finally { console.error = errores }
})

test('los avisos de entregado y leído no se encolan: no hay nada que contestar', async () => {
  const crudo = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.A1', status: 'read', recipient_id: '521' }] } }] }] })
  let llamadas = 0
  const r = await rutaMetaWebhook(post(crudo), { encolar: async () => { llamadas++ } })
  assert.equal(r.statusCode, 200)
  assert.equal(llamadas, 0)
})
