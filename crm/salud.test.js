// El token vencido no puede ser silencioso.
//
// El 2026-11-12 el token temporal de Meta venció y el bot dejó de contestar
// sin que nada avisara. Lo que se fija aquí: cuando Meta rechaza un envío por
// algo que deja TODO el canal mudo, queda (1) un renglón `CRM_ALARMA` en el
// registro —de él cuelga la alarma—, (2) el problema apuntado en
// `crm/salud.json` —de él cuelga el aviso del panel—, y (3) se borra solo en
// cuanto un mensaje vuelve a salir.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { s3Falso, colaFifoFalsa } from './falsos.js'
import { enS3, bandejaEnS3 } from './almacen-s3.js'
import { creaTrabajador, MAX_ENTREGAS } from './trabajador.js'
import { saludEnS3, vigilante, MARCA_ALARMA } from './salud.js'
import { entradasDeCola } from '../backend/src/meta.js'
import {
  LLAVE_SALUD, CLASES_DE_SALUD, anotarProblema, despejar, saludParaElPanel,
} from '../backend/src/crm-salud.js'
import { CLASES_DE_ALARMA } from './envio-errores.js'
import * as CRM from '../backend/src/clientes.js'

const BUCKET = 'cubeta-de-prueba'
const ROSA = '5214771234567'
const tokenVencido = () => Object.assign(new Error('Authentication Error'), { codigo: 190, estado: 401 })

function montar({ enviar }) {
  const s3 = s3Falso()
  const renglones = []
  const registro = { error: (...a) => renglones.push(a.join(' ')), warn() {} }
  const trabajador = creaTrabajador({
    almacenes: () => ({ almacen: enS3({ s3, bucket: BUCKET }), bandeja: bandejaEnS3({ s3, bucket: BUCKET }) }),
    salud: saludEnS3({ s3, bucket: BUCKET }),
    pensar: async ({ historial, entrada }) => ({ texto: `re: ${entrada}`, imagenes: [], historial: [...historial, { role: 'user', content: entrada }] }),
    enviar, enviarTexto: enviar,
    leer: async () => {},
    registro,
  })
  const cola = colaFifoFalsa({ maxEntregas: MAX_ENTREGAS })
  const llega = (id, texto = 'hola') => cola.enviar(entradasDeCola([{ id, de: ROSA, tipo: 'text', atendible: true, texto }]))
  return { s3, cola, trabajador, renglones, llega, salud: () => saludParaElPanel(s3.json(LLAVE_SALUD)) }
}

test('token vencido (190): renglón de alarma, problema apuntado y cliente «sin respuesta»', async () => {
  const t = montar({ enviar: async () => { throw tokenVencido() } })
  await t.llega('wamid.1')
  await t.cola.vaciar(t.trabajador)

  const alarmas = t.renglones.filter(r => r.includes(MARCA_ALARMA))
  assert.equal(alarmas.length, MAX_ENTREGAS, 'una por intento')
  assert.match(alarmas[0], /^CRM_ALARMA clase=token codigo=190$/)

  const [p] = t.salud()
  assert.equal(p.clase, 'token')
  assert.equal(p.codigo, 190)
  assert.match(p.titulo, /venció/)
  assert.equal(s3Veces(t), MAX_ENTREGAS)

  // Y lo de siempre: el cliente no se pierde.
  assert.ok(t.s3.json(`crm/clientes/${CRM.archivoDe('wa:524771234567')}`).sinRespuesta)
})
const s3Veces = t => t.s3.json(LLAVE_SALUD).problemas.token.veces

test('el renglón de alarma no lleva el teléfono ni lo que escribió el cliente', async () => {
  const t = montar({ enviar: async () => { throw tokenVencido() } })
  await t.llega('wamid.1', 'mi direccion es calle falsa 123')
  await t.cola.vaciar(t.trabajador)
  for (const r of t.renglones.filter(x => x.includes(MARCA_ALARMA))) {
    assert.doesNotMatch(r, /4771234567|calle falsa/)
  }
  assert.doesNotMatch(JSON.stringify(t.s3.json(LLAVE_SALUD)), /4771234567|calle falsa/)
})

test('cuando vuelve a salir un mensaje, el aviso se quita SOLO', async () => {
  let roto = true
  const t = montar({ enviar: async () => { if (roto) throw tokenVencido(); return {} } })
  await t.llega('wamid.1')
  await t.cola.vaciar(t.trabajador)
  assert.equal(t.salud().length, 1)

  roto = false   // el dueño puso el token nuevo
  await t.llega('wamid.2')
  await t.cola.vaciar(t.trabajador)
  assert.deepEqual(t.salud(), [])
})

test('lo que guarda `desde` es cuándo EMPEZÓ, no la última vez que se vio', () => {
  const t0 = Date.parse('2026-11-12T15:00:00Z')
  const uno = anotarProblema(null, 'token', { motivo: 'venció', codigo: 190 }, { ahora: t0 })
  const dos = anotarProblema(uno, 'token', { motivo: 'venció', codigo: 190 }, { ahora: t0 + 3600_000 })
  assert.equal(dos.problemas.token.desde, '2026-11-12T15:00:00.000Z')
  assert.equal(dos.problemas.token.visto, '2026-11-12T16:00:00.000Z')
  assert.equal(dos.problemas.token.veces, 2)
})

test('un fallo de UN cliente —ventana cerrada, número fuera de la lista— NO es alarma', async () => {
  for (const codigo of [131047, 131030, 131026]) {
    const t = montar({ enviar: async () => { throw Object.assign(new Error('x'), { codigo, estado: 400 }) } })
    await t.llega('wamid.1')
    await t.cola.vaciar(t.trabajador)
    assert.equal(t.renglones.filter(r => r.includes(MARCA_ALARMA)).length, 0, String(codigo))
    assert.equal(t.s3.json(LLAVE_SALUD), null, String(codigo))
  }
})

test('en marcha normal el archivo de salud se lee UNA vez por contenedor, no una por mensaje', async () => {
  const t = montar({ enviar: async () => ({}) })
  let lecturas = 0
  const original = t.s3.send
  t.s3.send = async c => { if (c.input.Key === LLAVE_SALUD) lecturas++; return original.call(t.s3, c) }
  for (const id of ['wamid.1', 'wamid.2', 'wamid.3']) await t.llega(id)
  await t.cola.vaciar(t.trabajador)
  assert.equal(lecturas, 1)
})

test('si el archivo de salud no se puede escribir, el turno sigue igual y la alarma queda en el registro', async () => {
  const renglones = []
  const { vigilar } = vigilante({
    salud: { anotar: async () => { throw new Error('S3 caído') }, despejar: async () => { throw new Error('S3 caído') } },
    registro: { error: (...a) => renglones.push(a.join(' ')) },
  })
  await assert.rejects(vigilar(async () => { throw tokenVencido() })(), /Authentication Error/)
  assert.ok(renglones.some(r => r.startsWith(MARCA_ALARMA)))
  assert.equal(await vigilar(async () => 'ok')(), 'ok', 'un envío bueno no revienta por no poder borrar el aviso')
})

test('el panel tolera cualquier cosa en el archivo: un aviso roto no tumba la bandeja', () => {
  for (const basura of [null, undefined, {}, { problemas: null }, { problemas: 'x' }, { problemas: { otra: { desde: 'hoy' } } }, []]) {
    assert.deepEqual(saludParaElPanel(basura), [])
  }
  assert.equal(despejar(null), null)
  const vacio = { problemas: {} }
  assert.equal(despejar(vacio), vacio, 'sin problemas no hay nada que escribir')
})

test('las clases que se guardan son las mismas que disparan la alarma', () => {
  assert.deepEqual([...CLASES_DE_SALUD].sort(), [...CLASES_DE_ALARMA].sort())
})

test('el filtro de `infra/crm-alarmas.json` busca la MISMA marca que escribe el trabajador', () => {
  const infra = JSON.parse(fs.readFileSync(new URL('../infra/crm-alarmas.json', import.meta.url), 'utf8'))
  assert.equal(infra.filtroCanalMudo.filterPattern, `"${MARCA_ALARMA}"`)
  assert.equal(infra.filtroCanalMudo.logGroupName, '/aws/lambda/istuffs-crm-trabajador')
  // La alarma mira la métrica que el filtro publica.
  const m = infra.filtroCanalMudo.metricTransformations[0]
  assert.equal(infra.alarmaCanalMudo.MetricName, m.metricName)
  assert.equal(infra.alarmaCanalMudo.Namespace, m.metricNamespace)
  // Y ninguna lleva un número de cuenta de verdad: sólo los marcadores.
  assert.doesNotMatch(JSON.stringify(infra), /\d{12}/)
  for (const a of ['alarmaCanalMudo', 'alarmaErroresDelTrabajador', 'alarmaFallidos', 'alarmaColaAtorada']) {
    assert.match(infra[a].AlarmActions[0], /^arn:aws:sns:REGION:CUENTA:/, a)
  }
})

test('la alarma de fallidos de aquí es la misma que la de `crm-colas.json`', () => {
  const alarmas = JSON.parse(fs.readFileSync(new URL('../infra/crm-alarmas.json', import.meta.url), 'utf8'))
  const colas = JSON.parse(fs.readFileSync(new URL('../infra/crm-colas.json', import.meta.url), 'utf8'))
  for (const k of Object.keys(colas.alarma)) assert.deepEqual(alarmas.alarmaFallidos[k], colas.alarma[k], k)
})
