// Sube el registro de una ejecucion a S3, para poder revisarlo sin necesitar
// credenciales de GitHub. Los registros de Actions requieren autenticacion
// aunque el repositorio sea publico.
//
// Uso:  node scripts/subir-diagnostico.js <archivo>

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
try { process.loadEnvFile(path.join(__dirname, '..', '.env')) } catch { /* en CI viene del entorno */ }

const archivo = process.argv[2]
if (!archivo || !fs.existsSync(archivo)) {
  console.error('Falta el archivo de registro.')
  process.exit(0)   // no se hace fallar el flujo por no poder guardar el registro
}

const BUCKET = process.env.S3_BUCKET || process.env.VITE_S3_BUCKET
const REGION = process.env.S3_REGION || process.env.VITE_S3_REGION || 'us-east-1'
if (!BUCKET) {
  console.error('Sin bucket configurado, no se sube el registro.')
  process.exit(0)
}

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId:     process.env.S3_ACCESS_KEY || process.env.VITE_S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || process.env.VITE_S3_SECRET_KEY || '',
  },
})

// El registro puede contener rutas y nombres de archivo, pero nunca
// credenciales: el script jamas las imprime. Aun asi se recorta por si acaso.
let texto = fs.readFileSync(archivo, 'utf8')
if (texto.length > 512 * 1024) texto = texto.slice(-512 * 1024)

const sello = new Date().toISOString().replace(/[:.]/g, '-')

try {
  for (const key of ['diagnostico/ultimo.txt', `diagnostico/${sello}.txt`]) {
    await s3.send(new PutObjectCommand({
      Bucket:       BUCKET,
      Key:          key,
      Body:         Buffer.from(texto),
      ContentType:  'text/plain; charset=utf-8',
      CacheControl: 'no-cache',
    }))
  }
  console.log('Registro guardado en S3.')
} catch (err) {
  console.error('No se pudo guardar el registro: ' + err.message)
}
