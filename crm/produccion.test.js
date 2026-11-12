// La estructura de producción de punta a punta, con S3 y cola de mentira:
//
//   Meta ──▶ /meta/webhook ──▶ cola FIFO ──▶ trabajador ──▶ trabajar()
//
// Cada prueba es una de las formas en que esto falla SIN dar error: dos
// respuestas al mismo mensaje, un turno perdido, un cliente esperando sin que
// nadie lo sepa. Los falsos (`falsos.js`) imitan lo que hace falta para que
// esas cosas puedan pasar; si no pudieran pasar, estas pruebas no probarían
// nada.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'

import { recibir } from './handler.js'
import { enS3, bandejaEnS3 } from './almacen-s3.js'
import { s3Falso, colaFifoFalsa } from './falsos.js'
import { idWhatsApp } from './bandeja.js'
import {
  creaTrabajador, MAX_ENTREGAS, TIEMPO_TRABAJADOR_S, VISIBILIDAD_S, MARGEN_MS,
} from './trabajador.js'
import { entradasDeCola } from '../backend/src/meta.js'
import { almacenDeClientes } from '../backend/src/clientes-s3.js'
import * as CRM from '../backend/src/clientes.js'

const SECRETO = 'secreto-de-meta-de-prueba'
process.env.META_APP_SECRET = SECRETO

const BUCKET = 'cubeta-de-prueba'
const ROSA = '5214771234567'
const LUIS = '5214499999999'
const callado = { error() {}, warn() {} }
const espera = ms => new Promise(r => setTimeout(r, ms))

/** Una carga firmada, como las manda Meta. */
function deMeta(mensajes) {
  const crudo = JSON.stringify({
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: '111' },
      contacts: [...new Set(mensajes.map(m => m.de))].map(de => ({ wa_id: de, profile: { name: de === ROSA ? 'Rosa' : 'Luis' } })),
      messages: mensajes.map(m => ({ from: m.de, id: m.id, timestamp: '1794000000', type: 'text', text: { body: m.texto } })),
    } }] }],
  })
  return {
    requestContext: { http: { method: 'POST' } },
    headers: { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', SECRETO).update(crudo).digest('hex') },
    body: crudo,
  }
}

/**
 * Todo montado: el webhook encola en una cola FIFO falsa y el trabajador lee y
 * escribe en un S3 falso. `pensar` y `enviar` son de mentira y apuntan lo que
 * pasó, en el orden en que pasó.
 */
function montar({ pensar, enviar, cola = colaFifoFalsa({ maxEntregas: MAX_ENTREGAS }), s3 = s3Falso() } = {}) {
  const sucesos = []     // en orden: quién pensó y a quién se le mandó qué
  const enviados = []

  const pensarFalso = pensar ?? (async ({ historial, entrada }) => {
    const texto = `re: ${entrada}`
    return { texto, imagenes: [], historial: [...historial, { role: 'user', content: entrada }, { role: 'assistant', content: texto }] }
  })
  const trabajador = creaTrabajador({
    almacenes: () => ({ almacen: enS3({ s3, bucket: BUCKET }), bandeja: bandejaEnS3({ s3, bucket: BUCKET }) }),
    pensar: async args => { sucesos.push(`piensa:${args.entrada}`); return pensarFalso(args, sucesos) },
    enviar: async (de, r) => {
      if (enviar) await enviar(de, r)
      enviados.push({ de, texto: r.texto })
      sucesos.push(`manda:${r.texto}`)
      return { ok: true }
    },
    leer: async () => {},
    registro: callado,
  })

  const llega = evento => recibir(evento, { encolar: m => cola.enviar(entradasDeCola(m)) })
  const ficha = tel => s3.json(`crm/clientes/${CRM.archivoDe(idWhatsApp(tel))}`)
  const conversacion = tel => s3.json(`crm/conversaciones/${tel}.json`)
  return { cola, s3, trabajador, llega, sucesos, enviados, ficha, conversacion }
}

// ── 1. El orden por teléfono ────────────────────────────────────────────────

test('dos mensajes del mismo teléfono se atienden EN ORDEN, y el segundo ya ve al primero', async () => {
  let historialDelSegundo = null
  const m = montar({
    pensar: async ({ historial, entrada }) => {
      // El primero de Rosa tarda. Si la cola no guardara el orden, el segundo
      // —que es instantáneo— contestaría antes y sin saber del primero.
      if (entrada === 'hola') await espera(40)
      if (entrada === 'tienes para iphone 13?') historialDelSegundo = historial
      const texto = `re: ${entrada}`
      return { texto, imagenes: [], historial: [...historial, { role: 'user', content: entrada }, { role: 'assistant', content: texto }] }
    },
  })

  const r = await m.llega(deMeta([
    { de: ROSA, id: 'wamid.R1', texto: 'hola' },
    { de: ROSA, id: 'wamid.R2', texto: 'tienes para iphone 13?' },
    { de: LUIS, id: 'wamid.L1', texto: 'buenas' },
  ]))
  assert.equal(r.statusCode, 200)
  assert.equal(m.cola.pendientes, 3)
  await m.cola.vaciar(m.trabajador)

  // Rosa, en orden:
  assert.deepEqual(m.enviados.filter(e => e.de === ROSA).map(e => e.texto), ['re: hola', 're: tienes para iphone 13?'])
  // El segundo turno recibió el historial que dejó el primero.
  assert.deepEqual(historialDelSegundo.map(h => h.content), ['hola', 're: hola'])
  assert.equal(m.conversacion(ROSA).historial.length, 4)

  // Y teléfonos distintos NO se esperan entre sí: a Luis se le contestó
  // mientras el primero de Rosa seguía pensando. Si todo fuera en fila, esta
  // prueba pasaría aunque nadie garantizara el orden por teléfono.
  assert.ok(m.sucesos.indexOf('manda:re: buenas') < m.sucesos.indexOf('manda:re: hola'), m.sucesos.join(' | '))
  // El segundo de Rosa ni empezó a pensarse hasta que el primero se mandó.
  assert.ok(m.sucesos.indexOf('manda:re: hola') < m.sucesos.indexOf('piensa:tienes para iphone 13?'))

  // La ficha del panel tiene las cuatro líneas, en orden.
  assert.deepEqual(m.ficha(ROSA).mensajes.map(x => x.de), ['cliente', 'bot', 'cliente', 'bot'])
})

// ── 2. Un mensaje repetido por Meta ─────────────────────────────────────────

test('un mensaje que Meta repite enseguida no se contesta dos veces: la cola ni lo acepta', async () => {
  const m = montar()
  const carga = [{ de: ROSA, id: 'wamid.R1', texto: 'hola' }]
  await m.llega(deMeta(carga))
  await m.llega(deMeta(carga))          // el reintento de Meta
  assert.equal(m.cola.pendientes, 1)
  await m.cola.vaciar(m.trabajador)
  assert.equal(m.enviados.length, 1)
})

test('y si lo repite cuando la cola ya lo olvidó, lo para el almacén: sigue siendo UNA respuesta', async () => {
  const s3 = s3Falso()
  const carga = [{ de: ROSA, id: 'wamid.R1', texto: 'hola' }]

  // SQS recuerda el id de deduplicación cinco minutos. Una cola nueva es lo
  // mismo que haber dejado pasar ese rato.
  const antes = montar({ s3 })
  await antes.llega(deMeta(carga))
  await antes.cola.vaciar(antes.trabajador)

  const despues = montar({ s3 })
  await despues.llega(deMeta(carga))
  assert.equal(despues.cola.pendientes, 1, 'esta vez la cola sí lo aceptó')
  await despues.cola.vaciar(despues.trabajador)

  assert.equal(antes.enviados.length, 1)
  assert.equal(despues.enviados.length, 0)
  assert.equal(despues.cola.fallidos.length, 0, 'un repetido no es un fallo: se borra de la cola')
  assert.equal(antes.ficha(ROSA).mensajes.filter(x => x.de === 'bot').length, 1)
})

// ── 3. Un turno que falla ───────────────────────────────────────────────────

test('un turno que falla se reintenta, y al cliente le llega UNA respuesta', async () => {
  let intentos = 0
  const m = montar({
    enviar: async () => { if (++intentos === 1) throw new Error('WhatsApp 500') },
  })
  await m.llega(deMeta([
    { de: ROSA, id: 'wamid.R1', texto: 'hola' },
    { de: ROSA, id: 'wamid.R2', texto: 'sigues ahí?' },
  ]))
  await m.cola.vaciar(m.trabajador)

  // El primero se entregó dos veces; el segundo esperó detrás, no se coló.
  assert.deepEqual(m.cola.entregas.map(e => `${e.id}#${e.entrega}`), ['m1#1', 'm1#2', 'm2#1'])
  assert.deepEqual(m.enviados.map(e => e.texto), ['re: hola', 're: sigues ahí?'])
  assert.equal(m.cola.fallidos.length, 0)
  // Y no quedó marca de «sin respuesta»: se le contestó.
  assert.equal(m.ficha(ROSA).sinRespuesta, undefined)
})

test('el fallo le llega a la cola aunque trabajar() no lance: si no, SQS borraría el mensaje', async () => {
  const m = montar({ pensar: async () => { throw new Error('Anthropic 529') } })
  const r = await m.trabajador({
    Records: [{ messageId: 'x1', body: JSON.stringify({ id: 'wamid.R1', de: ROSA, tipo: 'text', atendible: true, texto: 'hola' }), attributes: { ApproximateReceiveCount: '1' } }],
  })
  assert.deepEqual(r, { batchItemFailures: [{ itemIdentifier: 'x1' }] })
  // Y el mensaje NO quedó marcado como visto, o el reintento se descartaría.
  assert.deepEqual(m.conversacion(ROSA).mensajesVistos, [])
})

test('en un lote, tras el primer fallo no se atiende lo demás: se devuelve todo para conservar el orden', async () => {
  const m = montar({ pensar: async ({ entrada }) => {
    if (entrada === 'uno') throw new Error('falla')
    return { texto: `re: ${entrada}`, imagenes: [], historial: [] }
  } })
  const reg = (id, texto) => ({ messageId: id, body: JSON.stringify({ id: `wamid.${id}`, de: ROSA, tipo: 'text', atendible: true, texto }), attributes: { ApproximateReceiveCount: '1' } })
  const r = await m.trabajador({ Records: [reg('a', 'uno'), reg('b', 'dos')] })
  assert.deepEqual(r.batchItemFailures.map(f => f.itemIdentifier), ['a', 'b'])
  assert.equal(m.enviados.length, 0, 'el segundo no puede contestarse con el primero pendiente')
})

// ── 4. Cuando se agotan los reintentos ──────────────────────────────────────

test('agotados los reintentos, el cliente queda «sin respuesta» en la ficha y en la lista del panel', async () => {
  const m = montar({ pensar: async () => { throw new Error('Anthropic 529') } })
  await m.llega(deMeta([{ de: ROSA, id: 'wamid.R1', texto: '¿tienes para Moto G84?' }]))
  await m.cola.vaciar(m.trabajador)

  assert.equal(m.cola.entregas.length, MAX_ENTREGAS)
  assert.equal(m.cola.fallidos.length, 1, 'el mensaje acaba en la cola de fallidos')
  assert.equal(m.enviados.length, 0)

  // La ficha lo dice, con lo que escribió a la vista de quien va a contestar.
  const ficha = m.ficha(ROSA)
  assert.ok(ficha.sinRespuesta?.desde)
  assert.match(ficha.sinRespuesta.motivo, /falló 3 veces/)
  assert.equal(ficha.mensajes.at(-1).texto, '¿tienes para Moto G84?')
  assert.equal(ficha.bitacora.at(-1).accion, 'sin respuesta')

  // Y la lista de la bandeja —que sale del índice, no de la ficha—: va el
  // primero y se cuenta.
  const { clientes } = await almacenDeClientes({ s3: m.s3, bucket: BUCKET }).listarClientes()
  assert.ok(clientes[0].sinRespuesta)
  assert.equal(CRM.contar(clientes).sinRespuesta, 1)
})

test('la marca NO se pone antes de la última entrega: un fallo que se recupera no asusta a nadie', async () => {
  const s3 = s3Falso()
  let veces = 0
  const m = montar({ s3, pensar: async ({ entrada }) => {
    if (++veces < MAX_ENTREGAS) throw new Error('Anthropic 529')
    return { texto: `re: ${entrada}`, imagenes: [], historial: [] }
  } })
  // Se mira la ficha después de cada entrega.
  const marcas = []
  const espia = async (evento, contexto) => {
    const r = await m.trabajador(evento, contexto)
    marcas.push(!!m.ficha(ROSA)?.sinRespuesta)
    return r
  }
  await m.llega(deMeta([{ de: ROSA, id: 'wamid.R1', texto: 'hola' }]))
  await m.cola.vaciar(espia)
  assert.deepEqual(marcas, [false, false, false])
  assert.equal(m.enviados.length, 1)
})

test('el aviso se quita solo cuando al cliente por fin se le contesta', async () => {
  const s3 = s3Falso()
  const caido = montar({ s3, pensar: async () => { throw new Error('Anthropic 529') } })
  await caido.llega(deMeta([{ de: ROSA, id: 'wamid.R1', texto: 'hola' }]))
  await caido.cola.vaciar(caido.trabajador)
  assert.ok(caido.ficha(ROSA).sinRespuesta)

  // Vuelve a escribir y ahora el bot sí puede: no se quedó «callado para
  // siempre» por haber fallado antes.
  const bien = montar({ s3 })
  await bien.llega(deMeta([{ de: ROSA, id: 'wamid.R2', texto: '¿hola?' }]))
  await bien.cola.vaciar(bien.trabajador)
  assert.equal(bien.enviados.length, 1)
  assert.equal(bien.ficha(ROSA).sinRespuesta, undefined)
  assert.equal(s3.json('crm/indice.json').clientes[idWhatsApp(ROSA)].sinRespuesta, null)
})

test('si la función murió con el mensaje ya marcado, el reintento no lo da por contestado', async () => {
  const s3 = s3Falso()
  const m = montar({ s3 })
  // La función se cayó justo después de marcar el mensaje: quedó «visto» y
  // nadie contestó. Es lo que deja un corte de memoria o de luz.
  await enS3({ s3, bucket: BUCKET }).yaAtendido(ROSA, 'wamid.R1')

  const r = await m.trabajador({
    Records: [{ messageId: 'x1', body: JSON.stringify({ id: 'wamid.R1', de: ROSA, nombre: 'Rosa', tipo: 'text', atendible: true, texto: 'hola' }), attributes: { ApproximateReceiveCount: '2' } }],
  })
  // No se contesta a ciegas —pudo haberse mandado ya—, pero tampoco se calla:
  assert.equal(m.enviados.length, 0)
  assert.deepEqual(r.batchItemFailures, [])
  assert.ok(m.ficha(ROSA).sinRespuesta, 'tiene que salir en el panel')
  assert.equal(m.ficha(ROSA).mensajes[0].texto, 'hola')
})

test('pero un repetido de verdad —ya contestado— no se marca', async () => {
  const s3 = s3Falso()
  const m = montar({ s3 })
  await m.llega(deMeta([{ de: ROSA, id: 'wamid.R1', texto: 'hola' }]))
  await m.cola.vaciar(m.trabajador)

  // SQS lo entrega otra vez (se contestó, pero no se alcanzó a borrar).
  await m.trabajador({
    Records: [{ messageId: 'x1', body: JSON.stringify({ id: 'wamid.R1', de: ROSA, tipo: 'text', atendible: true, texto: 'hola' }), attributes: { ApproximateReceiveCount: '2' } }],
  })
  assert.equal(m.enviados.length, 1)
  assert.equal(m.ficha(ROSA).sinRespuesta, undefined)
})

test('ni uno que tiene la tienda: ahí el bot se calla a propósito', async () => {
  const s3 = s3Falso()
  const m = montar({ s3 })
  const panel = almacenDeClientes({ s3, bucket: BUCKET })
  await m.llega(deMeta([{ de: ROSA, id: 'wamid.R1', texto: 'hola' }]))
  await m.cola.vaciar(m.trabajador)
  // La tienda la toma, y el cliente escribe otra vez.
  await bandejaEnS3({ s3, bucket: BUCKET }).modificar(idWhatsApp(ROSA), c => ({ ...c, plaza: 'leon' }))
  await panel.modificarCliente(idWhatsApp(ROSA), c => CRM.aplicarAccion(c, { accion: 'tomar' }, { quien: 'leon' }))
  const reg = { messageId: 'x2', body: JSON.stringify({ id: 'wamid.R2', de: ROSA, tipo: 'text', atendible: true, texto: 'sigo aquí' }), attributes: { ApproximateReceiveCount: '1' } }
  await m.trabajador({ Records: [reg] })
  await m.trabajador({ Records: [{ ...reg, attributes: { ApproximateReceiveCount: '2' } }] })

  assert.equal(m.enviados.length, 1, 'el bot no le contestó el segundo: lo tiene la tienda')
  assert.equal(m.ficha(ROSA).sinRespuesta, undefined)
  assert.equal(m.ficha(ROSA).noLeidos, 1)
})

// ── 5. El tiempo ────────────────────────────────────────────────────────────

test('si el turno no acaba a tiempo, el trabajador cierra ANTES del límite: falla, desmarca y no manda tarde', async () => {
  const m = montar()   // sólo por su S3 y sus apuntes: el trabajador de esta prueba lleva su propio margen
  const trabajador = creaTrabajador({
    almacenes: () => ({ almacen: enS3({ s3: m.s3, bucket: BUCKET }), bandeja: bandejaEnS3({ s3: m.s3, bucket: BUCKET }) }),
    // Un modelo que tarda en contestar.
    pensar: async args => { await espera(80); return { texto: `re: ${args.entrada}`, imagenes: [], historial: [] } },
    enviar: async (de, r) => { m.enviados.push({ de, texto: r.texto }); return { ok: true } },
    leer: async () => {},
    margenMs: 100,
    registro: callado,
  })
  const reg = { messageId: 'x1', body: JSON.stringify({ id: 'wamid.R1', de: ROSA, tipo: 'text', atendible: true, texto: 'hola' }), attributes: { ApproximateReceiveCount: '1' } }

  const empezo = Date.now()
  // A la función le quedan 120 ms y se guardan 100 de margen: el turno tiene 20.
  const r = await trabajador({ Records: [reg] }, { getRemainingTimeInMillis: () => 120 })
  assert.ok(Date.now() - empezo < 80, 'tiene que volver antes de que el turno acabe')
  assert.deepEqual(r.batchItemFailures, [{ itemIdentifier: 'x1' }])
  // Desmarcado: el reintento entra.
  assert.deepEqual(m.conversacion(ROSA).mensajesVistos, [])

  // El turno abandonado termina de pensar «por detrás»… y NO manda. Sin eso,
  // su respuesta llegaría junto con la del reintento.
  await espera(120)
  assert.equal(m.enviados.length, 0)

  // El reintento, con tiempo, contesta. Una sola vez.
  await trabajador({ Records: [{ ...reg, attributes: { ApproximateReceiveCount: '2' } }] }, { getRemainingTimeInMillis: () => 60_000 })
  assert.deepEqual(m.enviados.map(e => e.texto), ['re: hola'])
})

test('los tiempos cuadran entre sí: visibilidad mayor que la función, y margen menor que ella', () => {
  assert.ok(VISIBILIDAD_S > TIEMPO_TRABAJADOR_S)
  assert.ok(MARGEN_MS < TIEMPO_TRABAJADOR_S * 1000 / 2)
  assert.ok(MAX_ENTREGAS >= 2, 'con una sola entrega no hay reintento')
})

test('lo que se aplica a mano en AWS dice lo MISMO que el código', () => {
  // `infra/crm-colas.json` es lo que el dueño copia a la consola. Si alguien
  // cambia un número aquí y no allá, la cola deja de coincidir con lo que el
  // trabajador supone —p. ej. marca «sin respuesta» en la tercera entrega
  // cuando SQS todavía va a dar cinco— y nada lo avisa.
  const infra = JSON.parse(fs.readFileSync(new URL('../infra/crm-colas.json', import.meta.url), 'utf8'))
  assert.equal(infra.cola.Attributes.VisibilityTimeout, String(VISIBILIDAD_S))
  assert.equal(infra.cola.Attributes.FifoQueue, 'true')
  assert.equal(JSON.parse(infra.cola.Attributes.RedrivePolicy).maxReceiveCount, MAX_ENTREGAS)
  assert.equal(infra.funcion.Timeout, TIEMPO_TRABAJADOR_S)
  assert.equal(infra.disparador.BatchSize, 1)
  assert.deepEqual(infra.disparador.FunctionResponseTypes, ['ReportBatchItemFailures'])
  // El límite de concurrencia de la cuenta es 10 y lo comparte el backend del
  // panel: el trabajador se queda en el mínimo que SQS permite.
  assert.equal(infra.disparador.ScalingConfig.MaximumConcurrency, 2)
})

// ── 6. Dónde cae todo ───────────────────────────────────────────────────────

test('todo lo que escribe el trabajador cae bajo crm/, nunca en inventarios/ ni config/', async () => {
  const m = montar()
  await m.llega(deMeta([{ de: ROSA, id: 'wamid.R1', texto: 'hola' }, { de: LUIS, id: 'wamid.L1', texto: 'buenas' }]))
  await m.cola.vaciar(m.trabajador)
  assert.deepEqual(m.s3.llaves, [
    `crm/clientes/${CRM.archivoDe(idWhatsApp(LUIS))}`,
    `crm/clientes/${CRM.archivoDe(idWhatsApp(ROSA))}`,
    `crm/conversaciones/${LUIS}.json`,
    `crm/conversaciones/${ROSA}.json`,
    'crm/indice.json',
  ])
})
