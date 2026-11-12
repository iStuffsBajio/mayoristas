// Los dos extremos del webhook, con eventos de Lambda sintéticos.
//
// Lo que se fija aquí es lo que no se puede depurar en vivo: que el acuse sale
// rápido y sin pensar, que una firma mala no pasa, y que un cuerpo ilegible se
// acusa con 200 en vez de dejar a Meta reintentando para siempre.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import { recibir, trabajar, colaEnMemoria } from './handler.js'
import { enMemoria } from './conversaciones.js'

const SECRETO = 'secreto-de-la-app'
const TOKEN   = 'token-de-enganche'

const firmar = c => 'sha256=' + crypto.createHmac('sha256', SECRETO).update(c).digest('hex')

function conEntorno(t) {
  process.env.META_APP_SECRET   = SECRETO
  process.env.META_VERIFY_TOKEN = TOKEN
  t.after(() => {
    delete process.env.META_APP_SECRET
    delete process.env.META_VERIFY_TOKEN
  })
}

const eventoGet = query => ({
  requestContext: { http: { method: 'GET' } },
  queryStringParameters: query,
})

const eventoPost = (cuerpo, { firma, base64 = false } = {}) => ({
  requestContext: { http: { method: 'POST' } },
  headers: { 'x-hub-signature-256': firma ?? firmar(cuerpo) },
  body: base64 ? Buffer.from(cuerpo).toString('base64') : cuerpo,
  isBase64Encoded: base64,
})

const cargaTexto = (texto = 'hola', id = 'wamid.A') => JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA',
    changes: [{
      field: 'messages',
      value: {
        metadata: { phone_number_id: 'PNID' },
        contacts: [{ wa_id: '52477', profile: { name: 'Ana' } }],
        messages: [{ id, from: '52477', type: 'text', text: { body: texto } }],
      },
    }],
  }],
})

// ── El enganche ─────────────────────────────────────────────────────────────

test('el enganche devuelve el challenge en texto plano', async (t) => {
  conEntorno(t)
  const r = await recibir(eventoGet({
    'hub.mode': 'subscribe', 'hub.verify_token': TOKEN, 'hub.challenge': '98765',
  }))
  assert.equal(r.statusCode, 200)
  assert.equal(r.body, '98765', 'tal cual, sin JSON alrededor, o Meta no engancha')
  assert.match(r.headers['Content-Type'], /text\/plain/)
})

test('un enganche con token malo da 403', async (t) => {
  conEntorno(t)
  const r = await recibir(eventoGet({
    'hub.mode': 'subscribe', 'hub.verify_token': 'otro', 'hub.challenge': '1',
  }))
  assert.equal(r.statusCode, 403)
})

// ── La firma ────────────────────────────────────────────────────────────────

test('sin firma válida no se procesa nada', async (t) => {
  conEntorno(t)
  const cuerpo = cargaTexto()
  const encolados = []

  const mala = await recibir(eventoPost(cuerpo, { firma: 'sha256=00' }),
    { encolar: async m => encolados.push(...m) })
  assert.equal(mala.statusCode, 401)
  assert.equal(encolados.length, 0, 'quien conozca la URL no debe poder inyectar nada')
})

test('la firma se valida sobre el cuerpo crudo, también en base64', async (t) => {
  conEntorno(t)
  const cuerpo = cargaTexto()
  const encolados = []
  const r = await recibir(eventoPost(cuerpo, { base64: true }),
    { encolar: async m => encolados.push(...m) })
  assert.equal(r.statusCode, 200)
  assert.equal(encolados.length, 1, 'una Lambda puede entregar el cuerpo en base64')
})

// ── El acuse ────────────────────────────────────────────────────────────────

test('el acuse sale sin pensar: sólo encola', async (t) => {
  conEntorno(t)
  const cuerpo = cargaTexto('tienes para a06?')
  const encolados = []

  const r = await recibir(eventoPost(cuerpo), { encolar: async m => encolados.push(...m) })

  assert.equal(r.statusCode, 200)
  assert.deepEqual(JSON.parse(r.body), { ok: true, mensajes: 1, estados: 0 })
  assert.equal(encolados[0].texto, 'tienes para a06?')
  assert.equal(encolados[0].nombre, 'Ana')
})

test('un cuerpo ilegible se acusa con 200, no con error', async (t) => {
  conEntorno(t)
  // Con un error, Meta reintentaría para siempre algo que nunca va a poder
  // leerse.
  const r = await recibir(eventoPost('esto no es json{'))
  assert.equal(r.statusCode, 200)
  assert.equal(JSON.parse(r.body).ignorado, 'json')
})

test('si la cola falla SÍ se devuelve error, para que Meta reintente', async (t) => {
  conEntorno(t)
  const r = await recibir(eventoPost(cargaTexto()), {
    encolar: async () => { throw new Error('SQS caído') },
  })
  assert.equal(r.statusCode, 500, 'es el único caso donde reintentar es lo que queremos')
})

test('los acuses de entrega no encolan nada', async (t) => {
  conEntorno(t)
  const cuerpo = JSON.stringify({
    entry: [{ changes: [{ value: { metadata: {}, statuses: [{ id: 'w', status: 'read', recipient_id: '52477' }] } }] }],
  })
  const encolados = []
  const r = await recibir(eventoPost(cuerpo), { encolar: async m => encolados.push(...m) })
  assert.equal(r.statusCode, 200)
  assert.equal(JSON.parse(r.body).estados, 1)
  assert.equal(encolados.length, 0, 'un acuse no se contesta')
})

test('un método que no es GET ni POST se rechaza', async (t) => {
  conEntorno(t)
  const r = await recibir({ requestContext: { http: { method: 'DELETE' } } })
  assert.equal(r.statusCode, 405)
})

// ── Los dos extremos juntos ─────────────────────────────────────────────────

test('de la carga de Meta a la respuesta mandada, por el camino completo', async (t) => {
  conEntorno(t)

  const almacen = enMemoria()
  const mandados = []
  const cola = colaEnMemoria({
    almacen,
    leer:   async () => {},
    enviar: async (a, r) => { mandados.push({ a, texto: r.texto }); return { enviados: [], fallos: [] } },
    pensar: async args => ({
      texto: `vi "${args.entrada}"`,
      imagenes: [], entrega: null,
      historial: [{ role: 'user', content: args.entrada }],
      uso: { entrada: 1, salida: 1, cacheLeido: 0 },
    }),
  })

  const r = await recibir(eventoPost(cargaTexto('tienes para iphone 13?')), cola)
  assert.equal(r.statusCode, 200, 'el 200 sale antes de que el cerebro termine')

  await cola.terminar()

  assert.equal(mandados.length, 1)
  assert.equal(mandados[0].a, '52477')
  assert.equal(mandados[0].texto, 'vi "tienes para iphone 13?"')
  // Y quedó guardado para el siguiente mensaje.
  assert.equal((await almacen.obtener('52477')).historial.length, 1)
})

test('el 200 no espera a que el cerebro termine', async (t) => {
  conEntorno(t)
  const almacen = enMemoria()
  let cerebroTermino = false
  const cola = colaEnMemoria({
    almacen,
    leer:   async () => {},
    enviar: async () => ({ enviados: [], fallos: [] }),
    pensar: async args => {
      await new Promise(r => setTimeout(r, 60))
      cerebroTermino = true
      return { texto: 'ok', imagenes: [], historial: [], uso: {} }
    },
  })

  const r = await recibir(eventoPost(cargaTexto()), cola)
  assert.equal(r.statusCode, 200)
  assert.equal(cerebroTermino, false, 'Meta corta a los segundos: el acuse no puede esperar')

  await cola.terminar()
  assert.equal(cerebroTermino, true)
})

test('trabajar atiende lo que se encoló', async () => {
  const almacen = enMemoria()
  const mandados = []
  const r = await trabajar(
    [{ id: 'w1', de: '52477', tipo: 'text', atendible: true, texto: 'hola', anuncio: null }],
    {
      almacen,
      leer: async () => {},
      enviar: async (a, x) => { mandados.push(x.texto); return { enviados: [], fallos: [] } },
      pensar: async () => ({ texto: 'qué tal', imagenes: [], historial: [], uso: {} }),
    },
  )
  assert.equal(r[0].motivo, 'contestado')
  assert.deepEqual(mandados, ['qué tal'])
})
