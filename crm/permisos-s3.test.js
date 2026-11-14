// El fallo de producción del 2026-11-12, para que no vuelva en verde.
//
// Al rol del trabajador le faltaba `s3:ListBucket`. Sin ese permiso, S3 NO
// contesta 404 a una llave que no existe: contesta 403 (AccessDenied), porque
// no le dice a quien no puede listar si la llave está o no. El almacén de
// conversaciones lee «no existe» como «conversación nueva» y cualquier otra
// cosa como un fallo —y hace bien—, así que el PRIMER mensaje de cada cliente
// nuevo reventaba. Los que ya tenían conversación funcionaban, que es por lo
// que no se vio en las pruebas a mano.
//
// El S3 de mentira contestaba siempre NoSuchKey. Ahora imita el permiso
// (`puedeListar`), y aquí se fija qué pasa con él y sin él.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

import { s3Falso, colaFifoFalsa } from './falsos.js'
import { enS3, bandejaEnS3 } from './almacen-s3.js'
import { creaTrabajador, MAX_ENTREGAS } from './trabajador.js'
import { entradasDeCola } from '../backend/src/meta.js'
import * as CRM from '../backend/src/clientes.js'

const BUCKET = 'cubeta-de-prueba'
const ROSA = '5214771234567'
const callado = { error() {}, warn() {} }

function montar(s3) {
  const enviados = []
  const trabajador = creaTrabajador({
    almacenes: () => ({ almacen: enS3({ s3, bucket: BUCKET }), bandeja: bandejaEnS3({ s3, bucket: BUCKET }) }),
    pensar: async ({ historial, entrada }) => ({ texto: `re: ${entrada}`, imagenes: [], historial: [...historial, { role: 'user', content: entrada }] }),
    enviar: async (de, r) => { enviados.push(r.texto); return {} },
    leer: async () => {},
    registro: callado,
  })
  return { trabajador, enviados }
}

test('el falso distingue «no existe» de «no tienes permiso para saberlo»', async () => {
  const s3 = s3Falso()
  const pedir = () => s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: 'crm/conversaciones/1.json' }))
  await assert.rejects(pedir, e => e.name === 'NoSuchKey' && e.$metadata.httpStatusCode === 404)
  s3.puedeListar = false
  await assert.rejects(pedir, e => e.name === 'AccessDenied' && e.$metadata.httpStatusCode === 403)
})

test('con `s3:ListBucket`, el primer mensaje de un cliente nuevo se contesta', async () => {
  const s3 = s3Falso()
  const { trabajador, enviados } = montar(s3)
  const cola = colaFifoFalsa({ maxEntregas: MAX_ENTREGAS })
  await cola.enviar(entradasDeCola([{ id: 'wamid.1', de: ROSA, tipo: 'text', atendible: true, texto: 'hola' }]))
  await cola.vaciar(trabajador)
  assert.deepEqual(enviados, ['re: hola'])
  assert.equal(cola.fallidos.length, 0)
})

test('SIN `s3:ListBucket`, el cliente nuevo no se contesta… y NO pasa en silencio', async () => {
  const s3 = s3Falso()
  s3.puedeListar = false
  const { trabajador, enviados } = montar(s3)
  const cola = colaFifoFalsa({ maxEntregas: MAX_ENTREGAS })
  await cola.enviar(entradasDeCola([{ id: 'wamid.1', de: ROSA, tipo: 'text', atendible: true, texto: 'hola' }]))
  await cola.vaciar(trabajador)

  // Un 403 no se lee como «conversación nueva»: si se leyera así, un permiso
  // roto a media plática haría que el bot saludara de cero a todo el mundo.
  assert.deepEqual(enviados, [])
  // Lo que sí tiene que pasar: se agota, va a la cola de fallidos —que tiene
  // alarma— y el cliente sale en el panel como «sin respuesta».
  assert.equal(cola.fallidos.length, 1)
  const ficha = s3.json(`crm/clientes/${CRM.archivoDe('wa:524771234567')}`)
  assert.ok(ficha?.sinRespuesta, 'la ficha avisa de que nadie le contestó')
  assert.match(ficha.sinRespuesta.motivo, /Access Denied/)
})

test('el rol del trabajador que está en `infra/` SÍ lleva `s3:ListBucket`, limitado a crm/', () => {
  const rol = JSON.parse(fs.readFileSync(new URL('../infra/crm-trabajador-rol.json', import.meta.url), 'utf8'))
  const listar = rol.Statement.find(s => [].concat(s.Action).includes('s3:ListBucket'))
  assert.ok(listar, 'sin este permiso vuelve el fallo de arriba')
  assert.equal(listar.Resource, 'arn:aws:s3:::istuffs-inventarios')
  assert.deepEqual([].concat(listar.Condition.StringLike['s3:prefix']).sort(), ['crm/', 'crm/*'])
})

test('el falso también imita el permiso de borrar', async () => {
  const s3 = s3Falso()
  s3.objetos.set('crm/x.json', { cuerpo: '{}', etag: '"e"' })
  s3.puedeBorrar = false
  await assert.rejects(() => s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: 'crm/x.json' })), e => e.name === 'AccessDenied')
  s3.puedeBorrar = true
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: 'crm/x.json' }))
  assert.equal(s3.json('crm/x.json'), null)
})
