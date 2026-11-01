// El webhook, probado con cargas sintéticas.
//
// No hace falta que Meta exista para fijar esto, y es justo lo que no se puede
// depurar en vivo: una firma que no cuadra se ve igual que un endpoint caído, y
// un mensaje duplicado sólo aparece cuando Meta reintenta, que es cuando ya le
// llegó dos veces a un cliente.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import {
  verificarEnganche, firmaValida, leerCarga, anuncioDe,
  anuncioParaElCerebro, creaDescartador,
} from './webhook.js'
import { recortar, TOPE_TEXTO, TOPE_PIE, mandarTexto, mandarImagen, mandarRespuesta } from './whatsapp-api.js'

const SECRETO = 'secreto-de-la-app'
const firmar = cuerpo =>
  'sha256=' + crypto.createHmac('sha256', SECRETO).update(cuerpo).digest('hex')

// ── Verificación del enganche ───────────────────────────────────────────────

test('el enganche se acepta sólo con el token bueno', () => {
  const opts = { token: 'mi-token' }
  const ok = verificarEnganche(
    { 'hub.mode': 'subscribe', 'hub.verify_token': 'mi-token', 'hub.challenge': '12345' }, opts)
  assert.equal(ok.ok, true)
  assert.equal(ok.challenge, '12345', 'se devuelve tal cual o Meta no engancha')

  const mal = verificarEnganche(
    { 'hub.mode': 'subscribe', 'hub.verify_token': 'otro', 'hub.challenge': '12345' }, opts)
  assert.equal(mal.ok, false)
  assert.equal(mal.motivo, 'token')
})

test('sin token configurado el enganche se rechaza, no se abre', () => {
  const r = verificarEnganche(
    { 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': '1' }, { token: undefined })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, 'sin-token-configurado')
})

test('un modo distinto de subscribe no engancha', () => {
  const r = verificarEnganche({ 'hub.mode': 'otro', 'hub.verify_token': 'mi-token' }, { token: 'mi-token' })
  assert.equal(r.ok, false)
})

// ── Firma ───────────────────────────────────────────────────────────────────

test('la firma valida el cuerpo crudo', () => {
  const cuerpo = '{"entry":[{"id":"1"}]}'
  assert.equal(firmaValida(cuerpo, firmar(cuerpo), { secreto: SECRETO }), true)
})

test('reserializar el JSON rompe la firma, que es el fallo clásico', () => {
  // El cuerpo tal como llegó, con el espaciado que traía.
  const cuerpo = '{ "a": 1, "b": [2, 3] }'
  const firma  = firmar(cuerpo)

  // Lo mismo después de pasar por JSON.parse y volver a serializar, que es lo
  // que hace cualquier middleware que parsea antes de validar. Mismos datos,
  // bytes distintos: la firma deja de cuadrar y nada da una pista de por qué.
  const reserializado = JSON.stringify(JSON.parse(cuerpo))
  assert.notEqual(reserializado, cuerpo)
  assert.equal(firmaValida(reserializado, firma, { secreto: SECRETO }), false)
  assert.equal(firmaValida(cuerpo, firma, { secreto: SECRETO }), true)
})

test('sin firma, con firma mala o sin secreto no se procesa nada', () => {
  const cuerpo = '{"a":1}'
  assert.equal(firmaValida(cuerpo, undefined,          { secreto: SECRETO }), false)
  assert.equal(firmaValida(cuerpo, 'sha256=00',        { secreto: SECRETO }), false)
  assert.equal(firmaValida(cuerpo, firmar(cuerpo),     { secreto: '' }),      false)
  // Sin el prefijo sha256= tampoco: la cabecera de Meta siempre lo trae.
  assert.equal(firmaValida(cuerpo, firmar(cuerpo).slice(7), { secreto: SECRETO }), false)
})

test('la firma acepta un Buffer, que es lo que da una Lambda', () => {
  const cuerpo = Buffer.from('{"a":1}', 'utf8')
  assert.equal(firmaValida(cuerpo, firmar(cuerpo), { secreto: SECRETO }), true)
})

// ── Lectura de la carga ─────────────────────────────────────────────────────

const cargaCon = (mensajes, { contacts = [], statuses = [] } = {}) => ({
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '523315381571', phone_number_id: 'PNID' },
        contacts, messages: mensajes, statuses,
      },
    }],
  }],
})

test('un mensaje de texto se lee con su nombre de perfil', () => {
  const { mensajes } = leerCarga(cargaCon(
    [{ id: 'wamid.AAA', from: '524771234567', timestamp: '1762000000', type: 'text', text: { body: 'tienes para iphone 13?' } }],
    { contacts: [{ wa_id: '524771234567', profile: { name: 'Marisol' } }] },
  ))
  assert.equal(mensajes.length, 1)
  const m = mensajes[0]
  assert.equal(m.id, 'wamid.AAA')
  assert.equal(m.de, '524771234567')
  assert.equal(m.nombre, 'Marisol', 'el nombre viene en contacts, no en el mensaje')
  assert.equal(m.texto, 'tienes para iphone 13?')
  assert.equal(m.atendible, true)
  assert.equal(m.numeroNuestro, 'PNID')
})

test('elegir en una lista llega como texto, no como mensaje vacío', () => {
  // Sin esto, tocar «León» en la lista llega sin texto y el bot vuelve a
  // preguntar lo que la persona acaba de contestar.
  const { mensajes } = leerCarga(cargaCon([
    { id: 'wamid.L', from: '52477', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'leon', title: 'León' } } },
    { id: 'wamid.B', from: '52477', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'si', title: 'Sí, lo quiero' } } },
    { id: 'wamid.C', from: '52477', type: 'button', button: { text: 'Ver precios' } },
  ]))
  assert.deepEqual(mensajes.map(m => m.texto), ['León', 'Sí, lo quiero', 'Ver precios'])
  assert.ok(mensajes.every(m => m.atendible))
})

test('lo que el bot no sabe atender se marca, no se traga', () => {
  const { mensajes } = leerCarga(cargaCon([
    { id: 'wamid.AUD', from: '52477', type: 'audio',    audio: { id: 'x' } },
    { id: 'wamid.IMG', from: '52477', type: 'image',    image: { id: 'y' } },
    { id: 'wamid.LOC', from: '52477', type: 'location', location: { latitude: 21, longitude: -101 } },
  ]))
  assert.equal(mensajes.length, 3, 'siguen llegando para poder contestar algo')
  assert.ok(mensajes.every(m => m.atendible === false))
  assert.ok(mensajes.every(m => m.texto === null))
})

test('varios mensajes de varias personas en una sola llamada', () => {
  const { mensajes } = leerCarga({
    entry: [
      { changes: [{ value: { metadata: {}, messages: [{ id: 'a', from: '1', type: 'text', text: { body: 'uno' } }] } }] },
      { changes: [{ value: { metadata: {}, messages: [{ id: 'b', from: '2', type: 'text', text: { body: 'dos' } }] } }] },
    ],
  })
  assert.equal(mensajes.length, 2)
  assert.deepEqual(mensajes.map(m => m.de), ['1', '2'])
})

test('los acuses no son mensajes y van aparte', () => {
  const { mensajes, estados } = leerCarga(cargaCon(undefined, {
    statuses: [{ id: 'wamid.X', status: 'delivered', recipient_id: '52477', timestamp: '1762000000' }],
  }))
  assert.equal(mensajes.length, 0, 'un acuse no se contesta')
  assert.equal(estados.length, 1)
  assert.equal(estados[0].estado, 'delivered')
})

test('una carga vacía o rara no revienta', () => {
  for (const c of [null, undefined, {}, { entry: null }, { entry: [{}] }, { entry: [{ changes: [{}] }] }]) {
    const r = leerCarga(c)
    assert.deepEqual(r.mensajes, [])
    assert.deepEqual(r.estados, [])
  }
})

// ── La atribución del anuncio ───────────────────────────────────────────────

test('el anuncio se lee del referral del primer mensaje', () => {
  const m = {
    id: 'wamid.AD', from: '52477', type: 'text', text: { body: 'hola' },
    referral: {
      source_url: 'https://fb.me/abc', source_id: '120210000000', source_type: 'ad',
      headline: 'Fundas para tu celular', body: 'Desde $250 en Leon',
      media_type: 'image', ctwa_clid: 'ClId123', ref: 'plaza=leon',
    },
  }
  const a = anuncioDe(m)
  assert.equal(a.anuncio, '120210000000')
  assert.equal(a.ref, 'plaza=leon', 'el ref es donde conviene meter la plaza')
  assert.equal(a.ctwaClid, 'ClId123')
  assert.equal(a.titular, 'Fundas para tu celular')
})

test('un mensaje sin referral no trae anuncio, y eso es normal', () => {
  // Meta sólo manda el referral en el PRIMER mensaje de la conversación: del
  // segundo en adelante hay que acordarse del que se guardó.
  assert.equal(anuncioDe({ id: 'x', type: 'text', text: { body: 'y cuanto?' } }), null)
})

test('al cerebro se le da el titular, no el identificador de conversión', () => {
  const resumen = anuncioParaElCerebro({
    anuncio: '1202', titular: 'Fundas para tu celular', cuerpo: 'Desde $250', ctwaClid: 'ClId123',
  })
  assert.equal(resumen, 'Fundas para tu celular — Desde $250')
  assert.doesNotMatch(resumen, /ClId123/, 'el clid no le sirve para contestar y gasta contexto')
  assert.equal(anuncioParaElCerebro(null), null)
})

// ── Repetidos ───────────────────────────────────────────────────────────────

test('un mensaje repetido se descarta la segunda vez', () => {
  // Meta reintenta aunque se le conteste a tiempo. Sin esto, la respuesta
  // duplicada es cuestión de tiempo.
  const d = creaDescartador()
  assert.equal(d.yaVisto('wamid.AAA'), false)
  assert.equal(d.yaVisto('wamid.AAA'), true)
  assert.equal(d.yaVisto('wamid.BBB'), false)
})

test('un id vacío nunca se da por visto', () => {
  const d = creaDescartador()
  assert.equal(d.yaVisto(null), false)
  assert.equal(d.yaVisto(undefined), false)
})

test('la memoria de repetidos no crece sin tope', () => {
  const d = creaDescartador({ tope: 3 })
  for (const id of ['a', 'b', 'c', 'd']) d.yaVisto(id)
  assert.equal(d.tamano, 3)
  assert.equal(d.yaVisto('a'), false, 'el más viejo se olvida')
  assert.equal(d.yaVisto('d'), true,  'el más nuevo sigue')
})

// ── Topes de Meta ───────────────────────────────────────────────────────────

test('el texto y el pie se recortan antes de que Meta los rechace', () => {
  assert.equal(recortar('hola', TOPE_TEXTO), 'hola')
  const largo = 'x'.repeat(5000)
  assert.equal(recortar(largo, TOPE_TEXTO).length, TOPE_TEXTO)
  assert.ok(recortar(largo, TOPE_TEXTO).endsWith('…'), 'se nota que se cortó')
  assert.equal(recortar('y'.repeat(2000), TOPE_PIE).length, TOPE_PIE)
})

// ── El envío, con un fetch de mentira ───────────────────────────────────────

function fetchFalso(respuestas = []) {
  const llamadas = []
  let n = 0
  const impl = async (url, opciones) => {
    llamadas.push({ url, cuerpo: JSON.parse(opciones.body), cabeceras: opciones.headers })
    const r = respuestas[n++] ?? { ok: true, datos: { messages: [{ id: 'wamid.OUT' }] } }
    return { ok: r.ok, status: r.estado ?? (r.ok ? 200 : 400), json: async () => r.datos }
  }
  return { impl, llamadas }
}

test('el texto se manda con la forma que espera la Cloud API', async (t) => {
  process.env.WHATSAPP_TOKEN = 'TOK'
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'PNID'
  t.after(() => { delete process.env.WHATSAPP_TOKEN; delete process.env.WHATSAPP_PHONE_NUMBER_ID })

  const f = fetchFalso()
  await mandarTexto('524771234567', 'hay 3 piezas', { fetchImpl: f.impl })

  const l = f.llamadas[0]
  assert.match(l.url, /\/PNID\/messages$/)
  assert.equal(l.cabeceras.Authorization, 'Bearer TOK')
  assert.equal(l.cuerpo.messaging_product, 'whatsapp')
  assert.equal(l.cuerpo.to, '524771234567')
  assert.equal(l.cuerpo.text.body, 'hay 3 piezas')
})

test('la imagen va por enlace, porque Meta la descarga él', async (t) => {
  process.env.WHATSAPP_TOKEN = 'TOK'
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'PNID'
  t.after(() => { delete process.env.WHATSAPP_TOKEN; delete process.env.WHATSAPP_PHONE_NUMBER_ID })

  const f = fetchFalso()
  await mandarImagen('52477', 'https://sitio/mockups/I13T.png', 'Foto de referencia: es del GALAXY S26', { fetchImpl: f.impl })

  const c = f.llamadas[0].cuerpo
  assert.equal(c.type, 'image')
  assert.equal(c.image.link, 'https://sitio/mockups/I13T.png')
  assert.match(c.image.caption, /^Foto de referencia/, 'la advertencia viaja en el pie')
})

test('el texto va antes que las fotos, y una foto caída no tumba el texto', async (t) => {
  process.env.WHATSAPP_TOKEN = 'TOK'
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'PNID'
  t.after(() => { delete process.env.WHATSAPP_TOKEN; delete process.env.WHATSAPP_PHONE_NUMBER_ID })

  const f = fetchFalso([
    { ok: true,  datos: { messages: [{ id: 'wamid.TXT' }] } },
    { ok: false, datos: { error: { message: 'Media download failed', code: 131053 } } },
    { ok: true,  datos: { messages: [{ id: 'wamid.IMG2' }] } },
  ])

  const r = await mandarRespuesta('52477', {
    texto: 'tengo estas dos',
    imagenes: [
      { url: 'https://sitio/roto.png', pie: 'una' },
      { url: 'https://sitio/bien.png', pie: 'otra' },
    ],
  }, { fetchImpl: f.impl })

  assert.equal(f.llamadas[0].cuerpo.type, 'text', 'el texto primero: una foto sola no tiene contexto')
  assert.equal(r.enviados.length, 2, 'el texto y la foto que sí salió')
  assert.equal(r.fallos.length, 1)
  assert.match(r.fallos[0].error, /Media download failed/)
})

test('sin credenciales no se manda nada y se dice por qué', async () => {
  delete process.env.WHATSAPP_TOKEN
  delete process.env.WHATSAPP_PHONE_NUMBER_ID
  await assert.rejects(
    () => mandarTexto('52477', 'hola', { fetchImpl: fetchFalso().impl }),
    /WHATSAPP_TOKEN/,
  )
})
