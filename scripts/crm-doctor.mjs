// El doctor del CRM: mira si el bot de WhatsApp PUEDE contestar, sin mandar
// ningún mensaje y sin cambiar nada.
//
//   npm run crm:doctor
//   npm run crm:doctor -- --sin-meta       (no le pregunta a Meta por el token)
//   npm run crm:doctor -- --api=https://…  (si VITE_API_URL no está en .env)
//
// Qué revisa, y de qué fallo real sale cada cosa:
//
//   · el enganche contesta y rechaza lo que debe      (secretos mal guardados)
//   · las variables de las dos funciones tienen forma (ídem; NUNCA imprime el valor)
//   · el token sigue vivo                             (el token temporal vencido)
//   · las colas y el disparador son los del repositorio
//   · la cola de fallidos                             (clientes sin respuesta)
//   · las alarmas existen y avisan a alguien
//   · lo que el trabajador dejó en crm/salud.json
//
// SÓLO LEE. Usa el `aws` de la terminal, con el usuario que esté puesto: tiene
// que poder leer Lambda, SQS, CloudWatch y el objeto crm/salud.json.
//
// El token de WhatsApp se usa para UNA consulta a Meta —el propio número— y no
// sale de la memoria: ni a pantalla, ni a un archivo.
//
// Las reglas viven en `scripts/lib/crm-doctor.js`, con pruebas
// (`crm/doctor.test.js`). Este archivo sólo pregunta y pinta.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  FUNCION_TRABAJADOR, FUNCION_BACKEND, AVISO,
  revisarVariables, revisarFuncion, revisarCola, revisarDisparador,
  revisarEnganche, revisarToken, revisarAlarmas, revisarSalud, informe,
} from './lib/crm-doctor.js'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const leerJson = f => JSON.parse(readFileSync(path.join(RAIZ, f), 'utf8'))
const opcion = n => process.argv.slice(2).find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=')
const bandera = n => process.argv.slice(2).includes(`--${n}`)

const REGION = opcion('region') || process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1'

/** Llama a `aws` y devuelve el JSON, o null si falló. El motivo va a `fallos`. */
const fallos = []
function aws(...args) {
  try {
    // En Windows `aws` es aws.exe y execFileSync lo encuentra sin shell.
    const out = execFileSync('aws', [...args, '--region', REGION, '--output', 'json'],
      { encoding: 'utf8', maxBuffer: 8 << 20, stdio: ['ignore', 'pipe', 'pipe'] })
    return out.trim() ? JSON.parse(out) : {}
  } catch (err) {
    // Sólo la primera línea del error de AWS: nunca lleva valores de variables.
    fallos.push(`aws ${args.slice(0, 2).join(' ')}: ${String(err?.stderr || err?.message || err).trim().split('\n')[0]}`)
    return null
  }
}

async function pedir(url, opciones) {
  try {
    const res = await fetch(url, { ...opciones, signal: AbortSignal.timeout(15_000) })
    let cuerpo = null
    try { cuerpo = await res.json() } catch { /* texto plano o vacío */ }
    return { estado: res.status, cuerpo }
  } catch { return null }
}

async function principal() {
  const colas = leerJson('infra/crm-colas.json')
  const alarmas = leerJson('infra/crm-alarmas.json')
  const secciones = []

  // ── 1. El enganche ────────────────────────────────────────────────────────
  const api = (opcion('api') || process.env.VITE_API_URL || '').replace(/\/+$/, '')
  if (!api) {
    secciones.push({ titulo: 'Enganche de Meta', resultados: [{ estado: AVISO, que: 'enganche', detalle: 'no se revisó: falta VITE_API_URL en .env o --api=https://…' }] })
  } else {
    const get = await pedir(`${api}/meta/webhook?hub.mode=subscribe&hub.verify_token=doctor-token-inventado&hub.challenge=1`)
    const post = await pedir(`${api}/meta/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"object":"doctor"}' })
    secciones.push({ titulo: 'Enganche de Meta', resultados: revisarEnganche({ get, post }) })
  }

  // ── 2. Las variables ──────────────────────────────────────────────────────
  const configTrabajador = aws('lambda', 'get-function-configuration', '--function-name', FUNCION_TRABAJADOR)
  const configBackend = aws('lambda', 'get-function-configuration', '--function-name', FUNCION_BACKEND)
  const varsTrabajador = configTrabajador?.Environment?.Variables
  secciones.push({
    titulo: 'Variables (sólo su forma)',
    resultados: [
      ...revisarVariables(FUNCION_TRABAJADOR, varsTrabajador),
      ...revisarVariables(FUNCION_BACKEND, configBackend?.Environment?.Variables),
    ],
  })

  // ── 3. El token, preguntándole a Meta ─────────────────────────────────────
  if (!bandera('sin-meta') && varsTrabajador?.WHATSAPP_TOKEN && /^\d+$/.test(varsTrabajador?.WHATSAPP_PHONE_NUMBER_ID ?? '')) {
    // La misma versión por omisión que `crm/whatsapp-api.js`.
    const version = varsTrabajador.WHATSAPP_VERSION || 'v23.0'
    const res = await pedir(`https://graph.facebook.com/${version}/${varsTrabajador.WHATSAPP_PHONE_NUMBER_ID}?fields=id`,
      { headers: { Authorization: `Bearer ${varsTrabajador.WHATSAPP_TOKEN}` } })
    secciones.push({ titulo: 'Token de WhatsApp', resultados: revisarToken(res && { estado: res.estado, error: res.cuerpo?.error }) })
  }

  // ── 4. La función, las colas y el disparador ──────────────────────────────
  const atributos = nombre => {
    const url = aws('sqs', 'get-queue-url', '--queue-name', nombre)?.QueueUrl
    return url ? aws('sqs', 'get-queue-attributes', '--queue-url', url, '--attribute-names', 'All')?.Attributes : null
  }
  const mapeos = aws('lambda', 'list-event-source-mappings', '--function-name', FUNCION_TRABAJADOR)?.EventSourceMappings
  secciones.push({
    titulo: 'Función, colas y disparador',
    resultados: [
      ...revisarFuncion(configTrabajador, colas.funcion),
      ...revisarCola(colas.cola.QueueName, atributos(colas.cola.QueueName), colas.cola.Attributes),
      ...revisarCola(colas.fallidos.QueueName, atributos(colas.fallidos.QueueName), colas.fallidos.Attributes, { fallidos: true }),
      ...revisarDisparador(mapeos, colas.disparador),
    ],
  })

  // ── 5. Las alarmas ────────────────────────────────────────────────────────
  const esperadas = Object.values(alarmas).filter(a => a && typeof a === 'object' && a.AlarmName).map(a => a.AlarmName)
  const existentes = aws('cloudwatch', 'describe-alarms', '--alarm-name-prefix', 'istuffs-crm')?.MetricAlarms
  secciones.push({ titulo: 'Alarmas', resultados: revisarAlarmas(existentes, [...new Set(esperadas)]) })

  // ── 6. Lo que el trabajador dejó apuntado ─────────────────────────────────
  const bucket = varsTrabajador?.S3_BUCKET
  let salud
  if (bucket) {
    try {
      const out = execFileSync('aws', ['s3', 'cp', `s3://${bucket}/crm/salud.json`, '-', '--region', REGION],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      salud = JSON.parse(out)
    } catch (err) {
      // Que no exista es lo normal: nunca ha habido un problema que apuntar.
      salud = /404|NoSuchKey|does not exist/i.test(String(err?.stderr ?? err)) ? null : undefined
    }
  }
  secciones.push({ titulo: 'Salud del canal', resultados: revisarSalud(salud) })

  const { texto, codigo } = informe(secciones)
  console.log(`Doctor del CRM · región ${REGION}`)
  console.log(texto)
  if (fallos.length) {
    console.log('\nLo que no se pudo consultar:')
    for (const f of [...new Set(fallos)]) console.log(`  · ${f}`)
  }
  process.exit(codigo)
}

principal().catch(err => {
  console.error('✗ El doctor falló:', String(err?.message ?? err).split('\n')[0])
  process.exit(2)
})
