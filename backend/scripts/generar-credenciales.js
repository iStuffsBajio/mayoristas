// Genera las variables de entorno del backend a partir de las contraseñas
// actuales: los hashes de cada sucursal y el secreto para firmar sesiones.
//
// Uso:  node backend/scripts/generar-credenciales.js
//
// Lee las contraseñas del .env del proyecto y escribe el resultado en
// backend/out/variables-lambda.txt, que esta ignorado por git.
// No imprime ningun valor en pantalla.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashearContrasena } from '../src/seguridad.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.join(__dirname, '..', '..')

process.loadEnvFile(path.join(RAIZ, '.env'))

// Los nombres van SIN el prefijo VITE_, que es lo que Vite incrusta en el
// JavaScript público. Se acepta el nombre viejo como respaldo para no romper
// una máquina que aún no haya actualizado su .env.
const CLAVES = [
  ['HASH_ADMIN',          ['PASS_ADMIN',   'VITE_PASS_ADMIN']],
  ['HASH_LEON',           ['PASS_LEON',    'VITE_PASS_LEON']],
  ['HASH_SAN_LUIS',       ['PASS_SLP',     'VITE_PASS_SLP']],
  ['HASH_AGUASCALIENTES', ['PASS_AGS',     'VITE_PASS_AGS']],
  ['HASH_TORREON',        ['PASS_TORREON', 'VITE_PASS_TORREON']],
]

const leer = nombres => nombres.map(n => process.env[n]).find(Boolean)

const faltantes = CLAVES.filter(([, ns]) => !leer(ns)).map(([, ns]) => ns[0])
if (faltantes.length) {
  console.error('Faltan contraseñas en .env: ' + faltantes.join(', '))
  process.exit(1)
}

const vars = {}
for (const [destino, nombres] of CLAVES) {
  vars[destino] = hashearContrasena(leer(nombres))
}

// Secreto para firmar las sesiones. Si cambia, todas las sesiones abiertas
// dejan de ser válidas, que es justo lo que se quiere si se sospecha una fuga.
vars.SESION_SECRETO = crypto.randomBytes(48).toString('base64url')

vars.S3_BUCKET             = process.env.S3_BUCKET || process.env.VITE_S3_BUCKET || ''
vars.S3_REGION             = process.env.S3_REGION || process.env.VITE_S3_REGION || 'us-east-1'
vars.DROPBOX_REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN || ''
vars.DROPBOX_APP_KEY       = process.env.DROPBOX_APP_KEY || process.env.VITE_DROPBOX_APP_KEY || ''
vars.DROPBOX_APP_SECRET    = process.env.DROPBOX_APP_SECRET || process.env.VITE_DROPBOX_APP_SECRET || ''
vars.CARPETAS_CATALOGO     = [
  '/Espacio familiar/IMPRESORA UV/CATALOGOS/Fundas',
  '/Espacio familiar/IMPRESORA UV/CATALOGOS/Personalizados',
].join(',')
// El dominio de verdad va PRIMERO y no se puede olvidar. Esta lista
// sobrescribe la de la Lambda al subir el archivo, y durante un tiempo tuvo
// sólo el dominio de Amplify y localhost: correr el script y subir el
// resultado habría dejado a istuffsbajio.com sin backend —login, subidas y
// configuración— sin que nada avisara hasta que un cliente lo intentara.
vars.ORIGENES_PERMITIDOS   = [
  'https://istuffsbajio.com',
  'https://www.istuffsbajio.com',
  'https://main.d25h6vktoh9i8v.amplifyapp.com',
  'http://localhost:5173',
].join(',')

const destino = path.join(__dirname, '..', 'out', 'variables-lambda.txt')
fs.mkdirSync(path.dirname(destino), { recursive: true })
fs.writeFileSync(destino, Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n')

console.log('Variables del backend generadas en:')
console.log('  ' + path.relative(RAIZ, destino))
console.log('')
for (const [k, v] of Object.entries(vars)) {
  const pista = k.startsWith('HASH_') ? 'hash, no reversible'
    : k === 'SESION_SECRETO' ? 'secreto nuevo, aleatorio'
    : /TOKEN|SECRET/.test(k) ? 'credencial'
    : v
  console.log(`  ${k.padEnd(22)} ${pista}`)
}
console.log('')
console.log('Cargalas como variables de entorno de la Lambda.')
console.log('Borra el archivo cuando termines: contiene credenciales.')
