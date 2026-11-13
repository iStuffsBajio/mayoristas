// Las reglas del doctor del CRM (`npm run crm:doctor`).
//
// El doctor pregunta a AWS y a Meta; lo que se prueba aquí es lo que DECIDE
// con las respuestas, que es donde puede mentir: dar por buena una variable
// con la forma equivocada, o —peor— enseñar su valor al explicar por qué no
// sirve. Ninguna prueba llama a AWS ni a Meta.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  BIEN, AVISO, MAL, FUNCION_TRABAJADOR, FUNCION_BACKEND, VARIABLES,
  revisarVariables, revisarFuncion, revisarCola, revisarDisparador,
  revisarEnganche, revisarToken, revisarAlarmas, revisarSalud, informe,
} from '../scripts/lib/crm-doctor.js'
import { SECRETOS } from '../backend/scripts/poner-secreto.js'

const colas = JSON.parse(readFileSync(new URL('../infra/crm-colas.json', import.meta.url), 'utf8'))
const alarmas = JSON.parse(readFileSync(new URL('../infra/crm-alarmas.json', import.meta.url), 'utf8'))

// Valores con la FORMA correcta e inventados: ninguno es un secreto de verdad.
const TRABAJADOR_BIEN = {
  ANTHROPIC_API_KEY: 'sk-ant-' + 'a'.repeat(40),
  WHATSAPP_TOKEN: 'EAA' + 'B'.repeat(60),
  WHATSAPP_PHONE_NUMBER_ID: '123456789012345',
  S3_BUCKET: 'istuffs-inventarios',
}
const BACKEND_BIEN = {
  META_APP_SECRET: 'a1'.repeat(16),
  META_VERIFY_TOKEN: 'un-token-de-verificacion',
  CRM_COLA_URL: 'https://sqs.us-east-1.amazonaws.com/123456789012/istuffs-crm-mensajes.fifo',
  S3_BUCKET: 'istuffs-inventarios',
}
const estados = rs => rs.map(x => x.estado)
const el = (rs, que) => rs.find(x => x.que.includes(que))

// ── Variables ───────────────────────────────────────────────────────────────

test('con todo en su sitio y con forma, no hay nada mal', () => {
  assert.ok(estados(revisarVariables(FUNCION_TRABAJADOR, TRABAJADOR_BIEN)).every(e => e === BIEN))
  assert.ok(estados(revisarVariables(FUNCION_BACKEND, BACKEND_BIEN)).every(e => e === BIEN))
})

test('una variable que falta se dice por su nombre', () => {
  const { WHATSAPP_TOKEN, ...sin } = TRABAJADOR_BIEN
  const x = el(revisarVariables(FUNCION_TRABAJADOR, sin), 'WHATSAPP_TOKEN')
  assert.equal(x.estado, MAL)
  assert.equal(x.detalle, 'FALTA')
})

test('el fallo del 2026-11-12: un secreto con espacios se caza, y NO se enseña', () => {
  const pegado = 'node backend/scripts algo que no es una llave'
  const rs = revisarVariables(FUNCION_BACKEND, { ...BACKEND_BIEN, META_APP_SECRET: pegado })
  const x = el(rs, 'META_APP_SECRET')
  assert.equal(x.estado, MAL)
  assert.ok(!JSON.stringify(rs).includes('algo que no es'), 'el valor no puede salir en el informe')
})

test('NINGÚN valor sale en el informe, ni bueno ni malo', () => {
  const malos = { ...TRABAJADOR_BIEN, WHATSAPP_TOKEN: 'EAAcorto', WHATSAPP_PHONE_NUMBER_ID: '+52 477 123 4567', CRM_MODELO: 'gpt-secreto-123' }
  for (const [funcion, vars] of [[FUNCION_TRABAJADOR, TRABAJADOR_BIEN], [FUNCION_TRABAJADOR, malos], [FUNCION_BACKEND, BACKEND_BIEN]]) {
    const { texto } = informe([{ titulo: 't', resultados: revisarVariables(funcion, vars) }])
    for (const [nombre, v] of Object.entries(vars)) {
      // El nombre del bucket no es un secreto y coincide con textos del
      // repositorio; todo lo demás no puede aparecer.
      if (nombre === 'S3_BUCKET') continue
      assert.ok(!texto.includes(v), `${nombre} salió en el informe`)
    }
  }
})

test('el id del número con forma de teléfono se rechaza', () => {
  const x = el(revisarVariables(FUNCION_TRABAJADOR, { ...TRABAJADOR_BIEN, WHATSAPP_PHONE_NUMBER_ID: '+15551677128' }), 'WHATSAPP_PHONE_NUMBER_ID')
  assert.equal(x.estado, MAL)
})

test('una opcional mal puesta se dice; sin poner, no se menciona', () => {
  const rs = revisarVariables(FUNCION_TRABAJADOR, { ...TRABAJADOR_BIEN, CRM_LEER_FOTOS: 'no', CRM_SITIO: 'https://istuffsbajio.com' })
  assert.equal(el(rs, 'CRM_LEER_FOTOS').estado, MAL)
  assert.equal(el(rs, 'CRM_SITIO').estado, BIEN)
  assert.equal(el(rs, 'CRM_MODELO'), undefined)
})

test('un secreto guardado en la función que no es, se avisa', () => {
  const rs = revisarVariables(FUNCION_BACKEND, { ...BACKEND_BIEN, WHATSAPP_TOKEN: TRABAJADOR_BIEN.WHATSAPP_TOKEN })
  const x = el(rs, 'WHATSAPP_TOKEN')
  assert.equal(x.estado, AVISO)
  assert.match(x.detalle, /istuffs-crm-trabajador/)
})

test('sin poder leer las variables no se da nada por bueno', () => {
  assert.deepEqual(estados(revisarVariables(FUNCION_TRABAJADOR, undefined)), [MAL])
})

test('cada secreto que se guarda con poner-secreto lo revisa el doctor en SU función', () => {
  for (const [nombre, { funcion }] of Object.entries(SECRETOS)) {
    assert.ok(VARIABLES[funcion]?.obligatorias[nombre], `${nombre} no se revisa en ${funcion}`)
  }
})

// ── Función, colas y disparador ─────────────────────────────────────────────

const COLA_REAL = { ...colas.cola.Attributes, ApproximateNumberOfMessages: '0', ApproximateNumberOfMessagesNotVisible: '1' }
const DISPARADOR_REAL = {
  EventSourceArn: 'arn:aws:sqs:us-east-1:123456789012:istuffs-crm-mensajes.fifo', State: 'Enabled',
  BatchSize: 1, ScalingConfig: { MaximumConcurrency: 2 }, FunctionResponseTypes: ['ReportBatchItemFailures'],
}

test('lo que dice infra/crm-colas.json, desplegado tal cual, sale limpio', () => {
  const rs = [
    ...revisarFuncion({ ...colas.funcion, State: 'Active' }, colas.funcion),
    ...revisarCola('mensajes', COLA_REAL, colas.cola.Attributes),
    ...revisarCola('fallidos', { ...colas.fallidos.Attributes, ApproximateNumberOfMessages: '0' }, colas.fallidos.Attributes, { fallidos: true }),
    ...revisarDisparador([DISPARADOR_REAL], colas.disparador),
  ]
  assert.deepEqual(rs.filter(x => x.estado !== BIEN), [])
})

test('una función con otro tiempo límite se avisa, con los dos números', () => {
  const x = el(revisarFuncion({ ...colas.funcion, Timeout: 3 }, colas.funcion), 'Timeout')
  assert.equal(x.estado, AVISO)
  assert.match(x.detalle, /3.*90/)
})

test('mensajes en la cola de fallidos: se avisa cuántos, y no se manda borrarlos', () => {
  const [x] = revisarCola('fallidos', { ApproximateNumberOfMessages: '8' }, {}, { fallidos: true })
  assert.equal(x.estado, AVISO)
  assert.match(x.detalle, /^8 /)
  assert.match(x.detalle, /antes de borrarlos/)
})

test('la cola principal acumulando es que nadie la atiende', () => {
  const x = revisarCola('mensajes', { ...COLA_REAL, ApproximateNumberOfMessages: '40' }, {}).at(-1)
  assert.equal(x.estado, MAL)
})

test('una cola sin cola de fallidos está mal', () => {
  const { RedrivePolicy, ...sin } = COLA_REAL
  assert.equal(el(revisarCola('mensajes', sin, colas.cola.Attributes), 'fallidos').estado, MAL)
})

test('sin disparador, apagado, sin tope o sin fallos por mensaje: mal', () => {
  assert.equal(revisarDisparador([], colas.disparador)[0].estado, MAL)
  assert.equal(revisarDisparador([{ ...DISPARADOR_REAL, State: 'Disabled' }], colas.disparador)[0].estado, MAL)
  const { ScalingConfig, ...sinTope } = DISPARADOR_REAL
  assert.equal(el(revisarDisparador([sinTope], colas.disparador), 'concurrencia').estado, MAL)
  assert.equal(el(revisarDisparador([{ ...DISPARADOR_REAL, FunctionResponseTypes: [] }], colas.disparador), 'fallos por mensaje').estado, MAL)
})

test('una concurrencia distinta de la del repositorio se avisa (la cuenta tiene 10)', () => {
  const x = el(revisarDisparador([{ ...DISPARADOR_REAL, ScalingConfig: { MaximumConcurrency: 8 } }], colas.disparador), 'concurrencia')
  assert.equal(x.estado, AVISO)
})

// ── Enganche ────────────────────────────────────────────────────────────────

test('el enganche sano rechaza las dos llamadas de prueba', () => {
  const rs = revisarEnganche({
    get: { estado: 403, cuerpo: { error: 'verificacion', motivo: 'token' } },
    post: { estado: 401, cuerpo: { error: 'firma' } },
  })
  assert.deepEqual(estados(rs), [BIEN, BIEN])
})

test('las respuestas que da el backend de verdad son las que el doctor espera', async () => {
  // Si alguien cambia los códigos del enganche, el doctor diría «mal» de un
  // enganche sano. Se pregunta al código, no se copia.
  const { recibir } = await import('../backend/src/meta-webhook.js')
  const cuerpo = x => { try { return JSON.parse(x.body) } catch { return null } }
  const g = await recibir({ requestContext: { http: { method: 'GET' } }, queryStringParameters: { 'hub.mode': 'subscribe', 'hub.verify_token': 'doctor-token-inventado', 'hub.challenge': '1' } })
  const p = await recibir({ requestContext: { http: { method: 'POST' } }, headers: {}, body: '{"object":"doctor"}' })
  const antes = process.env.META_VERIFY_TOKEN
  process.env.META_VERIFY_TOKEN = 'un-token-de-verificacion'
  try {
    const g2 = await recibir({ requestContext: { http: { method: 'GET' } }, queryStringParameters: { 'hub.mode': 'subscribe', 'hub.verify_token': 'doctor-token-inventado', 'hub.challenge': '1' } })
    const rs = revisarEnganche({ get: { estado: g2.statusCode, cuerpo: cuerpo(g2) }, post: { estado: p.statusCode, cuerpo: cuerpo(p) } })
    assert.deepEqual(estados(rs), [BIEN, BIEN])
  } finally {
    if (antes === undefined) delete process.env.META_VERIFY_TOKEN; else process.env.META_VERIFY_TOKEN = antes
  }
  if (antes === undefined) {
    // Sin token configurado el backend también contesta 403: eso NO es estar sano.
    const [x] = revisarEnganche({ get: { estado: g.statusCode, cuerpo: cuerpo(g) }, post: { estado: 401, cuerpo: { error: 'firma' } } })
    assert.equal(x.estado, MAL)
  }
})

test('un enganche que acepta lo que no debe, o que no está, sale mal', () => {
  assert.equal(revisarEnganche({ get: { estado: 200, cuerpo: null }, post: { estado: 401, cuerpo: { error: 'firma' } } })[0].estado, MAL)
  assert.equal(revisarEnganche({ get: { estado: 403, cuerpo: { error: 'verificacion', motivo: 'token' } }, post: { estado: 200, cuerpo: {} } })[1].estado, MAL)
  assert.deepEqual(estados(revisarEnganche({ get: { estado: 404, cuerpo: null }, post: null })), [MAL, MAL])
})

// ── Token, alarmas, salud ───────────────────────────────────────────────────

test('el token vencido (190) se dice con todas las letras', () => {
  const [x] = revisarToken({ estado: 401, error: { code: 190, message: 'Error validating access token' } })
  assert.equal(x.estado, MAL)
  assert.match(x.detalle, /VENCIDO/)
  assert.ok(!x.detalle.includes('Error validating'), 'el texto de Meta no se repite: puede llevar datos de la sesión')
  assert.equal(revisarToken({ estado: 200 })[0].estado, BIEN)
  assert.equal(revisarToken(null)[0].estado, AVISO, 'sin red no se afirma nada')
})

test('una alarma que falta, que no avisa a nadie o que está disparada', () => {
  const nombres = Object.values(alarmas).filter(a => a?.AlarmName).map(a => a.AlarmName)
  assert.ok(nombres.length >= 3)
  const rs = revisarAlarmas([
    { AlarmName: nombres[0], StateValue: 'OK', AlarmActions: ['arn:sns'] },
    { AlarmName: nombres[1], StateValue: 'OK', AlarmActions: [] },
    { AlarmName: nombres[2], StateValue: 'ALARM', AlarmActions: ['arn:sns'] },
  ], nombres.slice(0, 4))
  assert.deepEqual(estados(rs).slice(0, 3), [BIEN, AVISO, MAL])
  if (nombres[3]) assert.equal(rs[3].estado, AVISO)
})

test('lo que el trabajador apuntó en salud.json se enseña; sin archivo, está sano', async () => {
  const { anotarProblema } = await import('../backend/src/crm-salud.js')
  const archivo = anotarProblema(null, 'token', { codigo: 190 })
  const [x] = revisarSalud(archivo)
  assert.equal(x.estado, MAL)
  assert.match(x.detalle, /token.*190/)
  assert.equal(revisarSalud(null)[0].estado, BIEN)
  assert.equal(revisarSalud(undefined)[0].estado, AVISO)
})

test('el informe sale con código 1 sólo si algo está MAL', () => {
  const uno = e => informe([{ titulo: 't', resultados: [{ estado: e, que: 'x', detalle: '' }] }]).codigo
  assert.equal(uno(BIEN), 0)
  assert.equal(uno(AVISO), 0)
  assert.equal(uno(MAL), 1)
})
