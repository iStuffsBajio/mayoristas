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
const par = process.argv.slice(2).find(a => a.includes('=') && !a.startsWith('--'))

if (!par) {
  console.error('Uso: node backend/scripts/anadir-variable-lambda.js NOMBRE=valor [--aplicar]')
  process.exit(1)
}

const i = par.indexOf('=')
const nombre = par.slice(0, i).trim()
const valor  = par.slice(i + 1)

if (!/^[A-Z][A-Z0-9_]*$/.test(nombre)) {
  console.error(`«${nombre}» no parece un nombre de variable (MAYUSCULAS_CON_GUION_BAJO).`)
  process.exit(1)
}
if (!valor.trim()) {
  console.error(`${nombre} llegaría vacía. Para quitarla, usa --borrar.`)
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

console.log(`Función   : ${FUNCION}`)
console.log(`Variables : ${nombres.length} ahora → ${yaEstaba ? nombres.length : nombres.length + 1} después`)
console.log(`Acción    : ${yaEstaba ? (cambia ? `cambiar ${nombre}` : `${nombre} ya tiene ese valor`) : `añadir ${nombre}`}`)
console.log(`Se conservan: ${nombres.filter(n => n !== nombre).sort().join(', ')}`)

if (yaEstaba && !cambia) {
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
const tmp = path.join(os.tmpdir(), `lambda-env-${Date.now()}.json`)
fs.writeFileSync(tmp, JSON.stringify({ Variables: { ...actuales, [nombre]: valor } }), { mode: 0o600 })
try {
  aws('lambda', 'update-function-configuration',
      '--function-name', FUNCION,
      '--environment', `file://${tmp}`)
  const despues = JSON.parse(aws(
    'lambda', 'get-function-configuration',
    '--function-name', FUNCION,
    '--query', 'Environment.Variables', '--output', 'json')) || {}
  const faltan = nombres.filter(n => !(n in despues))
  if (faltan.length) {
    console.error(`\n⚠ SE PERDIERON variables: ${faltan.join(', ')}. Hay que reponerlas YA.`)
    process.exit(1)
  }
  console.log(`\n✓ Hecho. ${Object.keys(despues).length} variables, ninguna perdida.`)
} finally {
  fs.rmSync(tmp, { force: true })
}
