// Borrar una conversación de prueba, de punta a punta.
//
// La conversación se CREA con el código de verdad del trabajador —un mensaje
// que entra por la cola— y se borra con el del backend. Lo que se comprueba no
// es que «se llamó a borrar»: es que después no queda en S3 NADA de esa
// persona, y que quien vuelva a escribir empieza de cero.
//
// Es la única forma de cazar el fallo que esto tiene a mano: la ficha guarda
// el teléfono como 52 + 10 dígitos y la conversación se llama con el 521 que
// manda Meta. Borrando por el teléfono de la ficha, la ficha desaparece y el
// bot sigue recordándolo todo.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { s3Falso, colaFifoFalsa } from './falsos.js'
import { enS3, bandejaEnS3, PREFIJO_CONVERSACIONES } from './almacen-s3.js'
import { llaveDeRemitente } from './conversaciones.js'
import { creaTrabajador, MAX_ENTREGAS } from './trabajador.js'
import { entradasDeCola } from '../backend/src/meta.js'
import { leerCarga } from '../backend/src/meta-webhook.js'
import { almacenDeClientes } from '../backend/src/clientes-s3.js'
import {
  borrarConversacion, llavesDeConversacion, confirmacionDe,
  PREFIJO_CONVERSACIONES as PREFIJO_DEL_BACKEND, CLAVE_BORRADOS,
} from '../backend/src/crm-borrar.js'
import * as CRM from '../backend/src/clientes.js'

const BUCKET = 'cubeta-de-prueba'
const ROSA = '5214771234567'          // como lo manda Meta
const ID = 'wa:524771234567'          // como queda en la ficha
const BSUID = 'MX.13491208655302741918'
const ADMIN = { admin: true }, LEON = { admin: false, sucursal: 'leon' }
const callado = { error() {}, warn() {}, log() {} }

function montar() {
  const s3 = s3Falso(), cola = colaFifoFalsa({ maxEntregas: MAX_ENTREGAS })
  const pensado = []
  const trabajador = creaTrabajador({
    almacenes: () => ({ almacen: enS3({ s3, bucket: BUCKET }), bandeja: bandejaEnS3({ s3, bucket: BUCKET }) }),
    pensar: async args => {
      pensado.push(args)
      return { texto: 'Sí tengo.', imagenes: [], historial: [...args.historial, { role: 'user', content: args.entrada }, { role: 'assistant', content: [{ type: 'text', text: 'Sí tengo.' }] }] }
    },
    enviar: async () => ({ id: 'wamid.R' }), enviarTexto: async () => ({ id: 'wamid.R' }),
    leer: async () => {}, registro: callado,
  })
  let serie = 0
  const escribe = async ({ telefono = ROSA, usuario = null, texto = 'Hola' } = {}) => {
    const carga = { entry: [{ changes: [{ value: {
      metadata: { phone_number_id: '111' },
      contacts: [{ ...(telefono && { wa_id: telefono }), ...(usuario && { user_id: usuario }), profile: { name: 'Rosa' } }],
      messages: [{ ...(telefono && { from: telefono }), ...(usuario && { from_user_id: usuario }), id: `wamid.B${++serie}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: texto } }],
    } }] }] }
    await cola.enviar(entradasDeCola(leerCarga(carga).mensajes))
    await cola.vaciar(trabajador)
  }
  const almacen = almacenDeClientes({ s3, bucket: BUCKET })
  const borra = (extra = {}) => borrarConversacion({
    sesion: ADMIN, quien: 'admin', id: ID, confirmar: '4567', s3, bucket: BUCKET, almacen, registro: callado, ...extra,
  })
  /** Todo lo guardado que menciona a esta persona, mirando el contenido. */
  const rastro = (aguja = '4771234567') => s3.llaves.filter(k => k !== CLAVE_BORRADOS && (k.includes(aguja) || JSON.stringify(s3.json(k)).includes(aguja)))
  return { s3, cola, pensado, escribe, almacen, borra, rastro }
}

test('las llaves del backend son las del trabajador', () => {
  assert.equal(PREFIJO_DEL_BACKEND, PREFIJO_CONVERSACIONES)
  const llaves = llavesDeConversacion({ telefono: '524771234567', usuario: BSUID })
  assert.ok(llaves.includes(`${PREFIJO_CONVERSACIONES}${llaveDeRemitente(ROSA)}.json`), 'la del número como lo manda Meta (521…)')
  assert.ok(llaves.includes(`${PREFIJO_CONVERSACIONES}${llaveDeRemitente(BSUID)}.json`), 'la de su usuario de WhatsApp')
})

test('borrada, no queda NADA de esa persona y el bot empieza de cero', async () => {
  const t = montar()
  await t.escribe({ texto: '¿Tienen funda para A15?' })
  await t.escribe({ texto: 'Soy de León' })
  assert.ok(t.rastro().length >= 3, 'había ficha, conversación y renglón en la lista')

  const r = await t.borra()
  assert.equal(r.codigo, 200)
  assert.deepEqual(t.rastro(), [])
  assert.deepEqual((await t.almacen.listarClientes()).clientes, [])

  await t.escribe({ texto: 'Hola otra vez' })
  assert.equal(t.pensado.at(-1).historial.length, 0, 'el bot no recuerda la conversación borrada')
  assert.equal(t.s3.json(`crm/clientes/${CRM.archivoDe(ID)}`).mensajes.length, 2, 'y la ficha es nueva')
})

test('quien escribió sin teléfono también se borra entero', async () => {
  const t = montar()
  await t.escribe({ telefono: null, usuario: BSUID })
  const id = CRM.idDe({ canal: 'whatsapp', usuario: BSUID })
  const c = t.s3.json(`crm/clientes/${CRM.archivoDe(id)}`)
  const r = await t.borra({ id, confirmar: confirmacionDe(c) })
  assert.equal(r.codigo, 200)
  assert.deepEqual(t.rastro('13491208655302741918'), [])
})

test('queda apuntado quién y cuándo, sin el número ni lo que se dijo', async () => {
  const t = montar()
  await t.escribe({ texto: 'un secreto del cliente' })
  await t.borra({ ahora: Date.parse('2026-11-13T18:00:00Z') })
  const { borrados } = t.s3.json(CLAVE_BORRADOS)
  assert.equal(borrados.length, 1)
  assert.equal(borrados[0].quien, 'admin')
  assert.equal(borrados[0].hora, '2026-11-13T18:00:00.000Z')
  assert.equal(borrados[0].termina, '4567')
  const crudo = JSON.stringify(borrados)
  assert.ok(!crudo.includes('4771234567') && !crudo.includes('secreto') && !crudo.includes('Rosa'))
})

test('una tienda no puede borrar, ni la de su plaza', async () => {
  const t = montar()
  await t.escribe()
  const r = await t.borra({ sesion: LEON, quien: 'leon' })
  assert.equal(r.codigo, 403)
  assert.ok(t.rastro().length >= 3, 'no se tocó nada')
})

test('sin la confirmación correcta no se borra nada', async () => {
  const t = montar()
  await t.escribe()
  for (const confirmar of [undefined, '', '0000', '45670', 'wa:524771234567']) {
    const r = await t.borra({ confirmar })
    assert.equal(r.codigo, 400, String(confirmar))
  }
  assert.ok(t.rastro().length >= 3)
  assert.equal(t.s3.json(CLAVE_BORRADOS), null, 'y un intento fallido no se apunta como borrado')
})

test('sólo conversaciones de WhatsApp: un mayorista de los tickets no se borra por aquí', async () => {
  const t = montar()
  const id = CRM.idDe({ canal: 'tickets', plaza: 'leon', clave: 'Fundas Pérez' })
  await t.almacen.escribirCliente(CRM.nuevoCliente({ id, canal: 'tickets', plaza: 'leon', nombre: 'Fundas Pérez' }), null)
  const r = await t.borra({ id, confirmar: '' })
  assert.equal(r.codigo, 400)
  assert.ok(t.s3.json(`crm/clientes/${CRM.archivoDe(id)}`))
  for (const malo of ['', null, '../../caja/parametros', 'wa:../x']) {
    assert.notEqual((await t.borra({ id: malo })).codigo, 200, String(malo))
  }
})

test('un cliente que no existe: 404, y no se apunta nada', async () => {
  const t = montar()
  assert.equal((await t.borra()).codigo, 404)
  assert.equal(t.s3.json(CLAVE_BORRADOS), null)
})

test('sin el permiso de borrar en AWS: lo dice, y NO deja la ficha a medias', async () => {
  const t = montar()
  await t.escribe()
  const antes = t.rastro()
  t.s3.puedeBorrar = false
  const r = await t.borra()
  assert.equal(r.codigo, 409)
  assert.match(r.cuerpo.error, /s3:DeleteObject/)
  assert.match(r.cuerpo.error, /infra\/crm-backend-borrar\.json/)
  assert.deepEqual(t.rastro(), antes, 'ni ficha, ni conversación, ni lista cambiaron')
})

test('borrar dos veces no rompe nada: la segunda dice que ya no existe', async () => {
  const t = montar()
  await t.escribe()
  assert.equal((await t.borra()).codigo, 200)
  assert.equal((await t.borra()).codigo, 404)
  assert.equal(t.s3.json(CLAVE_BORRADOS).borrados.length, 1)
})

test('borrar a uno no toca al de al lado', async () => {
  const t = montar()
  await t.escribe()
  await t.escribe({ telefono: '5214779998877', texto: 'Yo soy otro' })
  await t.borra()
  const { clientes } = await t.almacen.listarClientes()
  assert.deepEqual(clientes.map(c => c.id), ['wa:524779998877'])
  assert.ok(t.s3.json(`${PREFIJO_CONVERSACIONES}5214779998877.json`))
})
