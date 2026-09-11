// Arma el archivo con los valores que hay que cargar como secretos del
// repositorio en GitHub, tomandolos del .env y del refresh token recien
// generado. No imprime ningun valor en pantalla.
//
// Uso:  node scripts/preparar-secretos.js
//
// El resultado queda en scripts/out/secretos-github.txt, que esta ignorado por
// git. Borralo cuando termines de cargarlos.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
process.loadEnvFile(path.join(ROOT, '.env'))

const tokenFile = path.join(__dirname, 'out', 'refresh-token.txt')
const refresh = fs.existsSync(tokenFile)
  ? fs.readFileSync(tokenFile, 'utf8').trim()
  : process.env.VITE_DROPBOX_REFRESH_TOKEN

const secretos = {
  DROPBOX_REFRESH_TOKEN: refresh,
  DROPBOX_APP_KEY:       process.env.VITE_DROPBOX_APP_KEY,
  DROPBOX_APP_SECRET:    process.env.VITE_DROPBOX_APP_SECRET,
  S3_BUCKET:             process.env.VITE_S3_BUCKET,
  S3_REGION:             process.env.VITE_S3_REGION || 'us-east-1',
  S3_ACCESS_KEY:         process.env.VITE_S3_ACCESS_KEY,
  S3_SECRET_KEY:         process.env.VITE_S3_SECRET_KEY,
}

const faltantes = Object.entries(secretos).filter(([, v]) => !v).map(([k]) => k)
if (faltantes.length) {
  console.error('Faltan valores en .env para: ' + faltantes.join(', '))
  process.exit(1)
}

const destino = path.join(__dirname, 'out', 'secretos-github.txt')
fs.mkdirSync(path.dirname(destino), { recursive: true })
fs.writeFileSync(
  destino,
  Object.entries(secretos).map(([k, v]) => `${k}\n${v}\n`).join('\n')
)

console.log('Listo. Los 7 secretos quedaron en:')
console.log('  ' + path.relative(ROOT, destino))
console.log('')
for (const [k, v] of Object.entries(secretos)) {
  console.log(`  ${k.padEnd(24)} ${v.length} caracteres`)
}
console.log('')
console.log('Ningun valor se imprime aqui. Abre el archivo para copiarlos.')
console.log('Borralo cuando termines: contiene credenciales.')
