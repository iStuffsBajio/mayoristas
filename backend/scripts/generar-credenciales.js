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

const CLAVES = [
  ['HASH_ADMIN',          'VITE_PASS_ADMIN'],
  ['HASH_LEON',           'VITE_PASS_LEON'],
  ['HASH_SAN_LUIS',       'VITE_PASS_SLP'],
  ['HASH_AGUASCALIENTES', 'VITE_PASS_AGS'],
  ['HASH_TORREON',        'VITE_PASS_TORREON'],
]

const faltantes = CLAVES.filter(([, origen]) => !process.env[origen]).map(([, o]) => o)
if (faltantes.length) {
  console.error('Faltan contraseñas en .env: ' + faltantes.join(', '))
  process.exit(1)
}

const vars = {}
for (const [destino, origen] of CLAVES) {
  vars[destino] = hashearContrasena(process.env[origen])
}

// Secreto para firmar las sesiones. Si cambia, todas las sesiones abiertas
// dejan de ser válidas, que es justo lo que se quiere si se sospecha una fuga.
vars.SESION_SECRETO = crypto.randomBytes(48).toString('base64url')

vars.S3_BUCKET             = process.env.VITE_S3_BUCKET || ''
vars.S3_REGION             = process.env.VITE_S3_REGION || 'us-east-1'
vars.DROPBOX_REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN || ''
vars.DROPBOX_APP_KEY       = process.env.VITE_DROPBOX_APP_KEY || ''
vars.DROPBOX_APP_SECRET    = process.env.VITE_DROPBOX_APP_SECRET || ''
vars.CARPETAS_CATALOGO     = [
  '/Espacio familiar/IMPRESORA UV/CATALOGOS/Fundas',
  '/Espacio familiar/IMPRESORA UV/CATALOGOS/Personalizados',
].join(',')
vars.ORIGENES_PERMITIDOS   = [
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
