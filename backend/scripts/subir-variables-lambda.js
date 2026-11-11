// Sube a la Lambda las variables que genero `generar-credenciales.js`.
//
//   node backend/scripts/subir-variables-lambda.js            (sólo revisa)
//   node backend/scripts/subir-variables-lambda.js --aplicar  (las escribe)
//
// Existe para no pegar catorce variables a mano en la consola. Pegarlas a
// mano no es sólo lento: es donde se cuelan los errores que no avisan —una
// línea que se queda fuera, un valor cortado por la mitad, un espacio al
// final de un hash—, y el backend no se queja de ninguno de los tres. Se
// queja el día que alguien no puede entrar.
//
// ── Lo que NUNCA hace ──────────────────────────────────────────────────────
//
// Imprimir un valor. Ni al revisar, ni al aplicar, ni al fallar. Lo que sale
// por pantalla son nombres, longitudes y comprobaciones; nada mas. Por eso se
// puede correr delante de quien sea y dejar el registro a la vista.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARCHIVO = path.join(__dirname, '..', 'out', 'variables-lambda.txt')
const FUNCION = process.env.LAMBDA_FUNCION || 'istuffs-backend'
const APLICAR = process.argv.includes('--aplicar')

// Las que tienen que estar sí o sí. Si falta una, alguien se queda fuera y el
// login contesta lo mismo para «no existe» que para «contraseña mala», así
// que el motivo no se ve en ninguna pantalla.
const OBLIGATORIAS = [
  'HASH_ADMIN', 'HASH_LEON', 'HASH_SAN_LUIS', 'HASH_AGUASCALIENTES',
  'HASH_TORREON', 'HASH_BODEGA',
  'SESION_SECRETO', 'S3_BUCKET', 'S3_REGION', 'ORIGENES_PERMITIDOS',
]

// El dominio de verdad. `ORIGENES_PERMITIDOS` se sobrescribe entera al subir,
// y una vez tuvo sólo el de Amplify: eso deja istuffsbajio.com sin backend
// -login, subidas, configuración- sin que nada avise hasta que lo intenta un
// cliente.
const DOMINIO = 'https://istuffsbajio.com'

if (!fs.existsSync(ARCHIVO)) {
  console.error(`No existe ${path.relative(process.cwd(), ARCHIVO)}.`)
  console.error('Corre antes:  node backend/scripts/generar-credenciales.js')
  process.exit(1)
}

const vars = {}
for (const linea of fs.readFileSync(ARCHIVO, 'utf8').split(/\r?\n/)) {
  const i = linea.indexOf('=')
  if (i <= 0 || linea.trimStart().startsWith('#')) continue
  vars[linea.slice(0, i).trim()] = linea.slice(i + 1)
}

const fallos = []

for (const n of OBLIGATORIAS) {
  if (!(n in vars)) fallos.push(`falta ${n}`)
  else if (!String(vars[n]).trim()) fallos.push(`${n} está vacía`)
}

// Un espacio al final de un hash lo convierte en otro hash. No se recorta por
// si acaso: se avisa, porque recortar a escondidas esconde el error de origen.
for (const [n, v] of Object.entries(vars)) {
  if (v !== v.trim()) fallos.push(`${n} tiene espacios al principio o al final`)
}

if (vars.ORIGENES_PERMITIDOS && !vars.ORIGENES_PERMITIDOS.includes(DOMINIO)) {
  fallos.push(`ORIGENES_PERMITIDOS no incluye ${DOMINIO}: el dominio real se quedaría sin backend`)
}

console.log(`Función: ${FUNCION}`)
console.log(`Archivo: ${path.relative(process.cwd(), ARCHIVO)}`)
console.log(`\n${Object.keys(vars).length} variables:\n`)
for (const n of Object.keys(vars).sort()) {
  // Longitud, no valor. Sirve para ver de un vistazo que ninguna llegó
  // cortada, sin enseñar nada.
  console.log(`  ${n.padEnd(22)} ${String(vars[n]).length} caracteres`)
}

if (fallos.length) {
  console.error('\nNO se sube nada:')
  for (const f of fallos) console.error('  · ' + f)
  process.exit(1)
}

console.log('\nComprobado: están las obligatorias, ninguna vacía, sin espacios de más,')
console.log(`y ORIGENES_PERMITIDOS incluye ${DOMINIO}.`)

if (!APLICAR) {
  console.log('\nEsto fue sólo la revisión. Para escribirlas de verdad:')
  console.log('  node backend/scripts/subir-variables-lambda.js --aplicar')
  console.log('\nOJO: el SESION_SECRETO nuevo tira TODAS las sesiones abiertas.')
  process.exit(0)
}

// El JSON va por archivo y no por la línea de comandos: un argumento con los
// hashes dentro se queda en el historial del shell y en la lista de procesos.
const tmp = path.join(__dirname, '..', 'out', 'env-lambda.json')
fs.writeFileSync(tmp, JSON.stringify({ Variables: vars }))
try {
  execFileSync('aws', [
    'lambda', 'update-function-configuration',
    '--function-name', FUNCION,
    '--environment', `file://${tmp}`,
    '--output', 'json',
  ], { stdio: ['ignore', 'ignore', 'inherit'] })
  console.log('\nAplicadas.')
} finally {
  // No se deja tirado un archivo con los hashes dentro.
  try { fs.rmSync(tmp, { force: true }) } catch { /* da igual */ }
}

execFileSync('aws', ['lambda', 'wait', 'function-updated', '--function-name', FUNCION],
  { stdio: 'inherit' })
console.log('La función terminó de actualizarse.')
