// Añade o cambia UNA variable de la Lambda, sin tocar las demás.
//
//   node backend/scripts/anadir-variable-lambda.js TOTP_ADMIN=XXXX          (revisa)
//   node backend/scripts/anadir-variable-lambda.js TOTP_ADMIN=XXXX --aplicar
//
// Por qué existe pudiendo llamar al CLI de AWS directamente:
//
//   `aws lambda update-function-configuration --environment Variables={...}`
//   **REEMPLAZA el conjunto entero**. No añade. Pasar una sola variable deja
//   la función con esa y nada más: sin los seis hashes nadie entra, sin
//   `SESION_SECRETO` ninguna sesión vale y sin `ORIGENES_PERMITIDOS` el
//   dominio real deja de poder llamar al backend. Y no avisa: la orden sale
//   bien y la página se cae en la siguiente petición.
//
//   Esto lee las que YA están, les suma la que se le pide, y escribe el
//   conjunto completo.
//
// NUNCA imprime un valor. Ni al revisar, ni al aplicar, ni al fallar: esta
// salida acaba pegada en un chat o en una captura más veces de lo que parece.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const FUNCION = process.env.LAMBDA_FUNCION || 'istuffs-backend'
const APLICAR = process.argv.includes('--aplicar')
const BORRAR  = process.argv.includes('--borrar')
const par = process.argv.slice(2).find(a => !a.startsWith('--'))

if (!par) {
  console.error(`Uso:
  node backend/scripts/anadir-variable-lambda.js NOMBRE=valor [--aplicar]
  node backend/scripts/anadir-variable-lambda.js NOMBRE --borrar [--aplicar]`)
  process.exit(1)
}

const i = par.indexOf('=')
const nombre = (i > 0 ? par.slice(0, i) : par).trim()
const valor  = i > 0 ? par.slice(i + 1) : ''

// ── La salida de emergencia ─────────────────────────────────────────────
//
// `--borrar` existe sobre todo por una razón concreta: si se pierde el móvil
// con el segundo factor y no se guardó la clave de respaldo, quitar
// `TOTP_ADMIN` es la ÚNICA forma de volver a entrar al panel. Un guion que
// promete esa salida y no la tiene es peor que no prometerla, porque se
// descubre el día que hace falta.
if (BORRAR && i > 0) {
  console.error('Con --borrar va sólo el NOMBRE, sin «=valor».')
  process.exit(1)
}

if (!/^[A-Z][A-Z0-9_]*$/.test(nombre)) {
  console.error(`«${nombre}» no parece un nombre de variable (MAYUSCULAS_CON_GUION_BAJO).`)
  process.exit(1)
}
if (!BORRAR && !valor.trim()) {
  console.error(`${nombre} llegaría vacía. Para quitarla: ${nombre} --borrar`)
  process.exit(1)
}
// `VITE_` es la regla de la casa: Vite incrusta en el JavaScript público toda
// variable que empiece así. Un secreto con ese prefijo queda a la vista de
// cualquiera que abra el paquete, y asi estuvieron meses la llave de AWS, el
// secreto de Dropbox y las cinco contraseñas.
if (nombre.startsWith('VITE_')) {
  console.error('Un secreto NUNCA lleva el prefijo VITE_: Vite lo publica en el JavaScript.')
  process.exit(1)
}

const aws = (...args) => execFileSync('aws', args, { encoding: 'utf8', maxBuffer: 8 << 20 })

let actuales
try {
  actuales = JSON.parse(aws(
    'lambda', 'get-function-configuration',
    '--function-name', FUNCION,
    '--query', 'Environment.Variables', '--output', 'json',
  )) || {}
} catch (e) {
  console.error(`No se pudo leer la configuración de ${FUNCION}.`)
  console.error('¿Está el CLI de AWS configurado?  aws sts get-caller-identity')
  process.exit(1)
}

const nombres = Object.keys(actuales)
const yaEstaba = nombre in actuales
const cambia = yaEstaba && actuales[nombre] !== valor

const despuesCuantas = BORRAR
  ? (yaEstaba ? nombres.length - 1 : nombres.length)
  : (yaEstaba ? nombres.length : nombres.length + 1)

console.log(`Función   : ${FUNCION}`)
console.log(`Variables : ${nombres.length} ahora → ${despuesCuantas} después`)
console.log(`Acción    : ${BORRAR
  ? (yaEstaba ? `QUITAR ${nombre}` : `${nombre} no está: nada que quitar`)
  : yaEstaba ? (cambia ? `cambiar ${nombre}` : `${nombre} ya tiene ese valor`) : `añadir ${nombre}`}`)
console.log(`Se conservan: ${nombres.filter(n => n !== nombre).sort().join(', ')}`)

// Las que, si faltan, dejan el backend inservible sin decir por qué: sin los
// hashes no entra nadie, sin `SESION_SECRETO` ninguna sesión vale, sin
// `ORIGENES_PERMITIDOS` el dominio real deja de poder llamar, y sin bucket ni
// región no se lee ni se escribe nada. Quitarlas tiene que costar más que un
// dedazo, porque la orden sale bien y la página se cae en la siguiente
// petición.
const IMPRESCINDIBLES = new Set([
  'HASH_ADMIN', 'HASH_LEON', 'HASH_SAN_LUIS', 'HASH_AGUASCALIENTES',
  'HASH_TORREON', 'HASH_BODEGA',
  'SESION_SECRETO', 'S3_BUCKET', 'S3_REGION', 'ORIGENES_PERMITIDOS',
])

if (BORRAR && IMPRESCINDIBLES.has(nombre) && !process.argv.includes('--si-se-lo-que-hago')) {
  console.error(`\n✗ ${nombre} es imprescindible: sin ella el backend deja de funcionar`)
  console.error('  y la página se cae en la siguiente petición, sin decir por qué.')
  console.error('  Si de verdad es lo que quieres, repite con --si-se-lo-que-hago')
  process.exit(1)
}

if (BORRAR && nombre === 'TOTP_ADMIN' && yaEstaba) {
  console.log('\n⚠ Quitar TOTP_ADMIN APAGA el segundo factor: el panel volverá a')
  console.log('  entrar sólo con la contraseña. Es la salida si perdiste el móvil.')
}

if ((BORRAR && !yaEstaba) || (!BORRAR && yaEstaba && !cambia)) {
  console.log('\nNada que hacer.')
  process.exit(0)
}

if (!APLICAR) {
  console.log('\nEsto fue una revisión. Para escribirlo de verdad, repite con --aplicar')
  process.exit(0)
}

// Por archivo temporal y no en la línea de órdenes: un valor en `argv` queda
// en el historial del intérprete y lo puede leer cualquier proceso de la
// máquina mientras corre.
const siguientes = { ...actuales }
if (BORRAR) delete siguientes[nombre]
else siguientes[nombre] = valor

const tmp = path.join(os.tmpdir(), `lambda-env-${Date.now()}.json`)
fs.writeFileSync(tmp, JSON.stringify({ Variables: siguientes }), { mode: 0o600 })
try {
  aws('lambda', 'update-function-configuration',
      '--function-name', FUNCION,
      '--environment', `file://${tmp}`)
  const despues = JSON.parse(aws(
    'lambda', 'get-function-configuration',
    '--function-name', FUNCION,
    '--query', 'Environment.Variables', '--output', 'json')) || {}
  const faltan = nombres.filter(n => !(n in despues) && n !== nombre)
  if (faltan.length) {
    console.error(`\n⚠ SE PERDIERON variables: ${faltan.join(', ')}. Hay que reponerlas YA.`)
    process.exit(1)
  }
  console.log(`\n✓ Hecho. ${Object.keys(despues).length} variables, ninguna perdida.`)
} finally {
  fs.rmSync(tmp, { force: true })
}
