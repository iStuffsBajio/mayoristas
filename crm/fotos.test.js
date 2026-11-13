// Leer la foto que manda un cliente.
//
// Mucha gente fotografía la parte de atrás de su teléfono o la pantalla de
// «Acerca del teléfono», que es justo el dato que hace falta para venderle.
// Meta no manda la imagen: manda un id, y hay que bajarla con el token.
//
// Lo que se fija aquí:
//
//   · la foto llega al modelo, con lo que el cliente escribió junto a ella;
//   · NO se guarda —ni en el historial ni en la ficha—;
//   · si no se puede leer, cae a la respuesta fija: nunca falla el turno.
//
// Ninguna prueba llama a Meta ni al modelo: `fetch` y `pensar` son de mentira.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { atender, RESPUESTAS_FIJAS } from './atender.js'
import { enMemoria } from './conversaciones.js'
import { bandejaEnMemoria } from './bandeja.js'
import {
  bajarFoto, tipoPorBytes, sinFotos, entradaConFoto, leerFotosActivo,
  TOPE_FOTO, MARCA_DE_FOTO, TEXTO_FOTO_SOLA,
} from './medios.js'
import { leerCarga } from '../backend/src/meta-webhook.js'
import { s3Falso, colaFifoFalsa } from './falsos.js'
import { enS3, bandejaEnS3 } from './almacen-s3.js'
import { creaTrabajador } from './trabajador.js'
import { entradasDeCola } from '../backend/src/meta.js'
import { LLAVE_SALUD } from '../backend/src/crm-salud.js'

const ROSA = '5214771234567'
const callado = { error() {}, warn() {} }
const JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4])
const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 9, 9])

/** Una carga de Meta con una foto, como dice su documentación. */
const cargaConFoto = ({ caption } = {}) => ({
  entry: [{ changes: [{ value: {
    metadata: { phone_number_id: '111' },
    contacts: [{ wa_id: ROSA, profile: { name: 'Rosa' } }],
    messages: [{
      from: ROSA, id: 'wamid.F1', timestamp: '1794000000', type: 'image',
      image: { id: '1234567890', mime_type: 'image/jpeg', sha256: 'abc', ...(caption && { caption }) },
    }],
  } }] }],
})
const mensajeConFoto = opciones => leerCarga(cargaConFoto(opciones)).mensajes[0]

/** Un Meta de mentira: contesta la consulta del id y luego los bytes. */
function metaFalso({ bytes = JPEG, mime = 'image/jpeg', tamano, estadoUrl = 200, estadoBytes = 200, errorUrl } = {}) {
  const pedidos = []
  const fetchImpl = async (url, opciones) => {
    pedidos.push({ url: String(url), auth: opciones?.headers?.Authorization })
    if (String(url).startsWith('https://graph.facebook.com/')) {
      if (estadoUrl !== 200) return { ok: false, status: estadoUrl, json: async () => ({ error: errorUrl ?? { message: 'no', code: 100 } }) }
      return { ok: true, status: 200, json: async () => ({ url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1', mime_type: mime, file_size: tamano ?? bytes.length, id: '1234567890' }) }
    }
    if (estadoBytes !== 200) return { ok: false, status: estadoBytes, json: async () => ({}) }
    return { ok: true, status: 200, headers: { get: () => String(bytes.length) }, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) }
  }
  return { fetchImpl, pedidos }
}
const opcionesDeMeta = meta => ({ fetchImpl: meta.fetchImpl, token: 'TOKEN-DE-PRUEBA', numero: '111' })

/** Monta `atender` con todo de mentira y apunta lo que recibió el modelo. */
function montar({ verFoto, pensar } = {}) {
  const almacen = enMemoria()
  const bandeja = bandejaEnMemoria()
  const pensado = [], enviados = []
  const opciones = {
    almacen, bandeja, verFoto, registro: callado,
    leer: async () => {},
    enviar: async (de, r) => { enviados.push(r.texto); return {} },
    pensar: pensar ?? (async args => {
      pensado.push(args)
      return { texto: 'Es un Galaxy A15. Sí tengo funda.', imagenes: [], historial: [...args.historial, { role: 'user', content: args.entrada }, { role: 'assistant', content: [{ type: 'text', text: 'Es un Galaxy A15. Sí tengo funda.' }] }] }
    }),
  }
  return { almacen, bandeja, pensado, enviados, opciones }
}
const fotoBuena = async () => ({ mime: 'image/jpeg', base64: JPEG.toString('base64'), bytes: JPEG.length })

// ── Lo que llega de Meta ────────────────────────────────────────────────────

test('`leerCarga` saca el id de la foto y lo que el cliente escribió con ella', () => {
  const m = mensajeConFoto({ caption: '¿tienen para éste?' })
  assert.deepEqual(m.medio, { id: '1234567890', mime: 'image/jpeg' })
  assert.equal(m.texto, '¿tienen para éste?')
  assert.equal(m.tipo, 'image')
  assert.equal(mensajeConFoto().texto, null)
  // Los demás mensajes no llevan `medio`.
  const { mensajes } = leerCarga({ entry: [{ changes: [{ value: { messages: [{ from: ROSA, id: 'w', type: 'text', text: { body: 'hola' } }] } }] }] })
  assert.equal('medio' in mensajes[0], false)
})

test('la foto cabe en la cola: el mensaje encolado lleva el id, no la imagen', () => {
  const [e] = entradasDeCola([mensajeConFoto({ caption: 'hola' })])
  assert.deepEqual(JSON.parse(e.cuerpo).medio, { id: '1234567890', mime: 'image/jpeg' })
  assert.ok(e.cuerpo.length < 1000)
})

// ── Bajarla ─────────────────────────────────────────────────────────────────

test('bajar son DOS peticiones, las dos con el token, y devuelve la imagen en base64', async () => {
  const meta = metaFalso()
  const foto = await bajarFoto({ id: '1234567890' }, opcionesDeMeta(meta))
  assert.deepEqual(foto, { mime: 'image/jpeg', base64: JPEG.toString('base64'), bytes: JPEG.length })
  assert.equal(meta.pedidos.length, 2)
  assert.match(meta.pedidos[0].url, /^https:\/\/graph\.facebook\.com\/v[\d.]+\/1234567890\?phone_number_id=111$/)
  assert.match(meta.pedidos[1].url, /^https:\/\/lookaside\.fbsbx\.com\//)
  for (const p of meta.pedidos) assert.equal(p.auth, 'Bearer TOKEN-DE-PRUEBA')
})

test('el tipo sale de los BYTES, no de lo que dice Meta', async () => {
  const meta = metaFalso({ bytes: PNG, mime: 'image/jpeg' })
  assert.equal((await bajarFoto({ id: '1' }, opcionesDeMeta(meta))).mime, 'image/png')
  assert.equal(tipoPorBytes(Buffer.from('<html>no soy una foto')), null)
})

test('lo que no es una foto legible se rechaza: muy grande, otro tipo, o bytes que no son imagen', async () => {
  const pesada = metaFalso({ tamano: TOPE_FOTO + 1 })
  await assert.rejects(bajarFoto({ id: '1' }, opcionesDeMeta(pesada)), /pesa demasiado/)
  assert.equal(pesada.pedidos.length, 1, 'si Meta ya dice que pesa demasiado, ni se baja')

  // Meta miente con el tamaño y manda de más: se corta igual al recibirla.
  const mentira = metaFalso({ bytes: Buffer.concat([JPEG, Buffer.alloc(TOPE_FOTO)]), tamano: 10 })
  await assert.rejects(bajarFoto({ id: '1' }, opcionesDeMeta(mentira)), /pesa demasiado/)

  await assert.rejects(bajarFoto({ id: '1' }, opcionesDeMeta(metaFalso({ mime: 'image/webp' }))), /no es una foto/)
  await assert.rejects(bajarFoto({ id: '1' }, opcionesDeMeta(metaFalso({ bytes: Buffer.from('<html>error</html>') }))), /no es una imagen/)
})

test('un id raro no llega a ser una URL, y sin token no se pide nada', async () => {
  const meta = metaFalso()
  for (const id of ['', '../me', '123?fields=access_token', 'a b', null]) {
    await assert.rejects(bajarFoto({ id }, opcionesDeMeta(meta)), /no trae un id/)
  }
  await assert.rejects(bajarFoto({ id: '1' }, { fetchImpl: meta.fetchImpl, token: '' }), /Falta WHATSAPP_TOKEN/)
  assert.equal(meta.pedidos.length, 0)
})

test('el token NO se manda a una dirección que no sea https', async () => {
  const pedidos = []
  const fetchImpl = async url => {
    pedidos.push(String(url))
    return { ok: true, status: 200, json: async () => ({ url: 'http://sitio-cualquiera.test/foto.jpg', mime_type: 'image/jpeg', file_size: 10 }) }
  }
  await assert.rejects(bajarFoto({ id: '1' }, { fetchImpl, token: 'T' }), /no devolvió una dirección/)
  assert.equal(pedidos.length, 1)
})

test('el error de Meta conserva su código: así se distingue el token vencido', async () => {
  const meta = metaFalso({ estadoUrl: 401, errorUrl: { message: 'Authentication Error', code: 190 } })
  await assert.rejects(bajarFoto({ id: '1' }, opcionesDeMeta(meta)), e => e.codigo === 190 && e.estado === 401)
  // La URL caducó (vale cinco minutos): 404 al bajar.
  await assert.rejects(bajarFoto({ id: '1' }, opcionesDeMeta(metaFalso({ estadoBytes: 404 }))), e => e.estado === 404)
})

// ── El turno ────────────────────────────────────────────────────────────────

test('una foto que se puede leer LLEGA al modelo, con lo que el cliente escribió', async () => {
  const t = montar({ verFoto: fotoBuena })
  const r = await atender(mensajeConFoto({ caption: '¿tienen para éste?' }), t.opciones)
  assert.equal(r.motivo, 'contestado')
  const [imagen, texto] = t.pensado[0].entrada
  assert.deepEqual(imagen, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: JPEG.toString('base64') } })
  assert.deepEqual(texto, { type: 'text', text: '¿tienen para éste?' })
  assert.deepEqual(t.enviados, ['Es un Galaxy A15. Sí tengo funda.'])
})

test('una foto sin texto también se lee: va con una marca, no con una instrucción', async () => {
  const t = montar({ verFoto: fotoBuena })
  await atender(mensajeConFoto(), t.opciones)
  assert.equal(t.pensado[0].entrada[1].text, TEXTO_FOTO_SOLA)
})

test('la imagen NO se guarda en el historial: queda una marca de texto', async () => {
  const t = montar({ verFoto: fotoBuena })
  await atender(mensajeConFoto({ caption: '¿tienen para éste?' }), t.opciones)
  const guardado = JSON.stringify(t.almacen._datos.get(ROSA))
  assert.doesNotMatch(guardado, new RegExp(JPEG.toString('base64')))
  assert.doesNotMatch(guardado, /"type":"image"/)
  const { historial } = t.almacen._datos.get(ROSA)
  assert.equal(historial[0].content, `${MARCA_DE_FOTO} ¿tienen para éste?`)
  // Lo que el modelo dijo al verla sí se queda: con eso sigue la plática.
  assert.match(JSON.stringify(historial[1]), /Galaxy A15/)
})

test('en la ficha de la tienda queda «[foto]» y lo que escribió, nunca la imagen', async () => {
  const t = montar({ verFoto: fotoBuena })
  await atender(mensajeConFoto({ caption: '¿tienen para éste?' }), t.opciones)
  const [c] = t.bandeja.clientes
  assert.equal(c.mensajes[0].texto, '[foto] ¿tienen para éste?')
  assert.equal(c.mensajes[0].tipo, 'image')
  assert.doesNotMatch(JSON.stringify(c), new RegExp(JPEG.toString('base64')))
})

test('si la foto NO se puede leer, va la respuesta fija: el turno no falla ni llama al modelo', async () => {
  for (const verFoto of [
    async () => { throw new Error('Meta no dio la dirección de la foto: 500') },
    async () => null,
    async () => ({ mime: 'image/jpeg' }),   // sin datos
    null,                                    // lectura apagada
  ]) {
    const t = montar({ verFoto })
    const r = await atender(mensajeConFoto({ caption: '¿tienen para éste?' }), t.opciones)
    assert.equal(r.atendido, true)
    assert.equal(r.motivo, 'respuesta-fija')
    assert.deepEqual(t.enviados, [RESPUESTAS_FIJAS.image])
    assert.equal(t.pensado.length, 0)
  }
})

test('si la conversación la tiene la tienda, la foto ni se baja', async () => {
  let bajadas = 0
  const t = montar({ verFoto: async () => { bajadas++; return fotoBuena() } })
  await atender({ id: 'w0', de: ROSA, tipo: 'text', atendible: true, texto: 'hola' }, t.opciones)
  const id = t.bandeja.clientes[0].id
  await t.bandeja.modificar(id, c => ({ ...c, plaza: 'leon', estado: 'atendiendo', atiende: 'leon' }))
  const r = await atender(mensajeConFoto(), t.opciones)
  assert.equal(r.motivo, 'lo-atiende-la-tienda')
  assert.equal(bajadas, 0)
})

test('un texto normal no intenta bajar nada', async () => {
  let bajadas = 0
  const t = montar({ verFoto: async () => { bajadas++ } })
  await atender({ id: 'w0', de: ROSA, tipo: 'text', atendible: true, texto: 'hola' }, t.opciones)
  assert.equal(bajadas, 0)
  assert.equal(t.pensado[0].entrada, 'hola')
})

// ── El historial ────────────────────────────────────────────────────────────

test('`sinFotos` quita sólo las imágenes: lo demás del historial queda idéntico', () => {
  const foto = { mime: 'image/png', base64: 'QUJD' }
  const resultados = { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }] }
  const historial = [
    { role: 'user', content: 'hola' },
    { role: 'assistant', content: [{ type: 'text', text: 'dime tu modelo' }] },
    { role: 'user', content: entradaConFoto(foto, '') },
    { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'buscar', input: {} }] },
    resultados,
  ]
  const limpio = sinFotos(historial)
  assert.equal(limpio[0], historial[0])
  assert.equal(limpio[1], historial[1])
  assert.equal(limpio[2].content, MARCA_DE_FOTO, 'la marca de «sin texto» no se arrastra')
  assert.equal(limpio[4], resultados, 'los resultados de herramientas no se tocan')
  assert.deepEqual(sinFotos(null), [])
})

test('`CRM_LEER_FOTOS=0` lo apaga; cualquier otra cosa, o nada, lo deja encendido', () => {
  assert.equal(leerFotosActivo('0'), false)
  assert.equal(leerFotosActivo(' 0 '), false)
  for (const v of [undefined, '', '1', 'si']) assert.equal(leerFotosActivo(v), true, String(v))
})

// ── Por dentro del trabajador ───────────────────────────────────────────────

test('en el trabajador: token vencido al bajar la foto → respuesta fija… y la alarma', async () => {
  const s3 = s3Falso()
  const renglones = [], enviados = []
  const trabajador = creaTrabajador({
    almacenes: () => ({ almacen: enS3({ s3, bucket: 'b' }), bandeja: bandejaEnS3({ s3, bucket: 'b' }) }),
    salud: { anotar: async (clase, d) => { renglones.push(`anotado:${clase}:${d.codigo}`) }, despejar: async () => {} },
    verFoto: async () => { throw Object.assign(new Error('Authentication Error'), { codigo: 190, estado: 401 }) },
    pensar: async () => { throw new Error('no debe llegar al modelo') },
    enviar: async (de, r) => { enviados.push(r.texto); return {} },
    leer: async () => {},
    registro: { error: (...a) => renglones.push(a.join(' ')), warn() {} },
  })
  const cola = colaFifoFalsa()
  await cola.enviar(entradasDeCola([mensajeConFoto()]))
  await cola.vaciar(trabajador)
  assert.deepEqual(enviados, [RESPUESTAS_FIJAS.image])
  assert.ok(renglones.includes('CRM_ALARMA clase=token codigo=190'))
  assert.ok(renglones.includes('anotado:token:190'))
  assert.equal(cola.fallidos.length, 0)
  assert.equal(s3.json(LLAVE_SALUD), null)
})
