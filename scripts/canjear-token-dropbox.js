// Canjea el código de autorización de Dropbox por un refresh token permanente
// y lo guarda en el archivo .env del proyecto.
//
// Uso:  node scripts/canjear-token-dropbox.js <codigo>
//
// El código se obtiene abriendo esta dirección, sustituyendo la app key:
//   https://www.dropbox.com/oauth2/authorize?client_id=<APP_KEY>&response_type=code&token_access_type=offline
//
// Es de un solo uso y caduca en pocos minutos.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV = path.join(__dirname, '..', '.env')

process.loadEnvFile(ENV)

const codigo = process.argv[2]
if (!codigo) {
  console.error('Falta el código. Uso: node scripts/canjear-token-dropbox.js <codigo>')
  process.exit(2)
}

const key    = process.env.VITE_DROPBOX_APP_KEY
const secret = process.env.VITE_DROPBOX_APP_SECRET
if (!key || !secret) {
  console.error('Faltan VITE_DROPBOX_APP_KEY o VITE_DROPBOX_APP_SECRET en .env')
  process.exit(2)
}

const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
  method:  'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body:    new URLSearchParams({
    code:          codigo,
    grant_type:    'authorization_code',
    client_id:     key,
    client_secret: secret,
  }),
})

const texto = await res.text()
if (!res.ok) {
  console.error(`Canje fallido (${res.status}): ${texto.slice(0, 300)}`)
  if (texto.includes('invalid_grant')) {
    console.error('\nEl código ya se usó o caducó. Genera uno nuevo y vuelve a intentar.')
  }
  process.exit(1)
}

const datos = JSON.parse(texto)
if (!datos.refresh_token) {
  console.error('Dropbox no devolvió refresh_token. Falta token_access_type=offline en la autorización.')
  process.exit(1)
}

// Reemplaza el valor en .env conservando el resto del archivo
let env = fs.readFileSync(ENV, 'utf8')
const linea = `VITE_DROPBOX_REFRESH_TOKEN=${datos.refresh_token}`
env = /^VITE_DROPBOX_REFRESH_TOKEN=.*$/m.test(env)
  ? env.replace(/^VITE_DROPBOX_REFRESH_TOKEN=.*$/m, linea)
  : env.trimEnd() + '\n' + linea + '\n'
fs.writeFileSync(ENV, env)

// El token completo se deja en un archivo aparte para copiarlo al secreto de
// GitHub sin tener que abrir el .env entero.
const copia = path.join(__dirname, 'out', 'refresh-token.txt')
fs.mkdirSync(path.dirname(copia), { recursive: true })
fs.writeFileSync(copia, datos.refresh_token)

console.log('Canje correcto.')
console.log(`  permisos otorgados: ${datos.scope || '(no informado)'}`)
console.log(`  refresh token: ${datos.refresh_token.slice(0, 10)}... (${datos.refresh_token.length} caracteres)`)
console.log(`  guardado en .env y en ${path.relative(process.cwd(), copia)}`)
console.log(`  incluye files.content.read: ${String(datos.scope || '').includes('files.content.read')}`)
