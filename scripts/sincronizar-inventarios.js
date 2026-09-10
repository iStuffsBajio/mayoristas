// Sincroniza el inventario de cada sucursal a partir del respaldo (.fbk) más
// reciente que Eleventa deja en Dropbox, y lo publica como JSON en S3.
//
// Uso:
//   node scripts/sincronizar-inventarios.js               → procesa todas las sucursales y sube a S3
//   node scripts/sincronizar-inventarios.js --dry-run     → no sube; deja el JSON en scripts/out/
//   node scripts/sincronizar-inventarios.js --sucursal=leon → solo una sucursal
//
// Requiere: Eleventa instalado (usa su gbak.exe / isql.exe embebidos) y las
// variables VITE_S3_* en el archivo .env del proyecto.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'

const run = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// ── Configuración ──────────────────────────────────────────────────────────

try { process.loadEnvFile(path.join(ROOT, '.env')) } catch { /* sin .env: se usan variables del sistema */ }

const BACKUPS_DIR  = process.env.INVENTARIO_BACKUPS_DIR || 'A:\\Dropbox\\Espacio familiar\\RESPALDOS SUCURSALES'
const ELEVENTA_DIR = process.env.ELEVENTA_DIR           || 'C:\\Program Files (x86)\\AbarrotesPDV'
const GBAK = path.join(ELEVENTA_DIR, 'gbak.exe')
const ISQL = path.join(ELEVENTA_DIR, 'isql.exe')
const FB_USER = process.env.FIREBIRD_USER || 'SYSDBA'
const FB_PASS = process.env.FIREBIRD_PASS || 'masterkey'

// Solo sucursales activas. Torreón y Morelia tienen carpeta pero sin respaldos recientes.
const SUCURSALES = [
  { slug: 'aguascalientes', nombre: 'Aguascalientes',  carpeta: 'ags'  },
  { slug: 'leon',           nombre: 'León',            carpeta: 'leon' },
  { slug: 'san-luis',       nombre: 'San Luis Potosí', carpeta: 'SLP'  },
]

// Departamentos que no se muestran a mayoristas (mismo criterio que la página)
const DEPTOS_OCULTOS = new Set(['mayoristas', '- sin departamento -'])

const SEP = '~|~'
const SQL = `
SET HEADING OFF;
SELECT p.DESCRIPCION || '${SEP}' || COALESCE(b.CANTIDAD_ACTUAL, 0) || '${SEP}' || COALESCE(d.NOMBRE, '')
FROM PRODUCTOS p
LEFT JOIN INVENTARIO_BALANCES b ON b.PRODUCTO_ID = p.ID
LEFT JOIN DEPARTAMENTOS d ON d.ID = p.DEPT
WHERE p.ELIMINADO_EN IS NULL
ORDER BY p.DESCRIPCION;
`

const args    = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const FORZAR  = args.includes('--forzar')   // ignora las validaciones de seguridad
const SOLO    = args.find(a => a.startsWith('--sucursal='))?.split('=')[1]

// ── Protección de datos ────────────────────────────────────────────────────
// Un respaldo truncado o a medio sincronizar produciría un inventario casi
// vacío que reemplazaría al bueno. Estas reglas lo impiden.

const MIN_PRODUCTOS = 50   // menos de esto se considera respaldo incompleto
const MAX_CAIDA_PCT = 40   // caída máxima aceptable contra lo ya publicado

const BUCKET = process.env.VITE_S3_BUCKET
const REGION = process.env.VITE_S3_REGION || 'us-east-1'
const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId:     process.env.VITE_S3_ACCESS_KEY || '',
    secretAccessKey: process.env.VITE_S3_SECRET_KEY || '',
  },
})

// ── Utilidades ─────────────────────────────────────────────────────────────

const log = (...m) => console.log(new Date().toLocaleTimeString('es-MX', { hour12: false }), ...m)

// Se usa statSync (no dirent) porque los archivos "solo en línea" de Dropbox
// son reparse points y dirent.isFile() los reporta como false.
function buscarFbk(dir, acc = []) {
  for (const nombre of fs.readdirSync(dir)) {
    const p = path.join(dir, nombre)
    let st
    try { st = fs.statSync(p) } catch { continue }
    if (st.isDirectory()) buscarFbk(p, acc)
    else if (st.isFile() && /\.fbk$/i.test(nombre)) {
      acc.push({ path: p, mtime: st.mtime, fecha: fechaDelNombre(p) || st.mtime.toISOString().slice(0, 10) })
    }
  }
  return acc
}

function ultimoRespaldo(carpeta) {
  const dir = path.join(BACKUPS_DIR, carpeta)
  if (!fs.existsSync(dir)) throw new Error(`No existe la carpeta ${dir}`)
  const todos = buscarFbk(dir)
  if (todos.length === 0) throw new Error(`Sin archivos .fbk en ${dir}`)
  // Más reciente por fecha del nombre (respaldo-DD-MM-YY), desempata por fecha de modificación
  todos.sort((a, b) => (b.fecha.localeCompare(a.fecha)) || (b.mtime - a.mtime))
  return todos[0]
}

// "respaldo-10-09-26.fbk" → "2026-09-10"
function fechaDelNombre(archivo) {
  const m = /(\d{2})-(\d{2})-(\d{2})/.exec(path.basename(archivo))
  return m ? `20${m[3]}-${m[2]}-${m[1]}` : null
}

async function restaurar(fbk, destinoFdb) {
  fs.rmSync(destinoFdb, { force: true })
  await run(GBAK, ['-c', '-user', FB_USER, '-password', FB_PASS, fbk, destinoFdb], { windowsHide: true })
  if (!fs.existsSync(destinoFdb)) throw new Error('gbak no generó la base restaurada')
}

async function consultar(fdb, workDir) {
  const sqlFile = path.join(workDir, 'consulta.sql')
  const outFile = path.join(workDir, 'salida.txt')
  fs.writeFileSync(sqlFile, SQL)
  fs.rmSync(outFile, { force: true })
  await run(ISQL, ['-user', FB_USER, '-password', FB_PASS, '-i', sqlFile, '-o', outFile, fdb], { windowsHide: true })
  // La base usa charset NONE: los bytes llegan tal cual, se decodifican como latin1
  const texto = fs.readFileSync(outFile, 'latin1')
  const filas = []
  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.includes(SEP)) continue
    const [producto, existencia, depto] = linea.split(SEP).map(s => s.trim())
    if (!producto) continue
    filas.push({ producto, existencia: parseFloat(existencia) || 0, depto })
  }
  return filas
}

// Lee el inventario.json publicado actualmente. Devuelve null si aún no existe.
async function jsonPublicado(slug) {
  try {
    const res = await s3.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key:    `inventarios/${slug}/inventario.json`,
    }))
    return JSON.parse(await res.Body.transformToString())
  } catch {
    return null
  }
}

// Rechaza inventarios sospechosos para no reemplazar datos buenos por basura.
function validar(slug, productos, anterior) {
  if (productos.length < MIN_PRODUCTOS) {
    throw new Error(`solo ${productos.length} productos (mínimo ${MIN_PRODUCTOS}). Respaldo probablemente incompleto. Usa --forzar si es correcto.`)
  }
  const previos = anterior?.totalProductos ?? 0
  if (previos > 0) {
    const caida = Math.round((1 - productos.length / previos) * 100)
    if (caida > MAX_CAIDA_PCT) {
      throw new Error(`el inventario cae ${caida}% (${previos} → ${productos.length}). Revisa el respaldo o usa --forzar.`)
    }
  }
}

async function subirJson(slug, json, anterior) {
  const cuerpo = Buffer.from(JSON.stringify(json))
  const comun  = { Bucket: BUCKET, ContentType: 'application/json; charset=utf-8' }

  // 1) Copia fechada del inventario que está por reemplazarse, para poder volver atrás
  if (anterior) {
    const sello = (anterior.generado || new Date().toISOString()).slice(0, 10)
    await s3.send(new PutObjectCommand({
      ...comun,
      Key:  `inventarios/${slug}/historico/${sello}.json`,
      Body: Buffer.from(JSON.stringify(anterior)),
    }))
  }

  // 2) Publicación del inventario nuevo
  await s3.send(new PutObjectCommand({
    ...comun,
    Key:          `inventarios/${slug}/inventario.json`,
    Body:         cuerpo,
    CacheControl: 'no-cache',
  }))
}

// ── Proceso por sucursal ───────────────────────────────────────────────────

async function procesar(suc, workDir) {
  const respaldo = ultimoRespaldo(suc.carpeta)
  log(`[${suc.slug}] respaldo: ${path.relative(BACKUPS_DIR, respaldo.path)} (${respaldo.mtime.toISOString().slice(0, 16)})`)

  const fdb = path.join(workDir, `${suc.slug}.fdb`)
  await restaurar(respaldo.path, fdb)

  const filas = await consultar(fdb, workDir)
  fs.rmSync(fdb, { force: true })
  if (filas.length === 0) throw new Error('La consulta no devolvió productos')

  const productos = filas
    .filter(f => !DEPTOS_OCULTOS.has(f.depto.toLowerCase()))
    .map(f => ({ Producto: f.producto, Existencia: f.existencia }))

  const json = {
    sucursal:  suc.slug,
    nombre:    suc.nombre,
    origen:    'respaldo-eleventa',
    generado:  new Date().toISOString(),
    respaldo: {
      archivo:      path.basename(respaldo.path),
      fecha:        fechaDelNombre(respaldo.path) || respaldo.mtime.toISOString().slice(0, 10),
      modificado:   respaldo.mtime.toISOString(),
    },
    totalProductos: productos.length,
    productos,
  }

  // Validación contra lo ya publicado antes de reemplazar nada
  const anterior = DRY_RUN && !BUCKET ? null : await jsonPublicado(suc.slug)
  if (FORZAR) {
    log(`[${suc.slug}] --forzar activo: se omiten las validaciones`)
  } else {
    validar(suc.slug, productos, anterior)
  }

  if (DRY_RUN) {
    const outDir = path.join(__dirname, 'out')
    fs.mkdirSync(outDir, { recursive: true })
    const f = path.join(outDir, `${suc.slug}.json`)
    fs.writeFileSync(f, JSON.stringify(json, null, 2))
    log(`[${suc.slug}] ${filas.length} leídos, ${productos.length} publicables → ${f} (dry-run)`)
  } else {
    await subirJson(suc.slug, json, anterior)
    const previos = anterior?.totalProductos
    const cambio  = previos ? ` (antes ${previos})` : ''
    log(`[${suc.slug}] ${filas.length} leídos, ${productos.length} publicables${cambio} → publicado`)
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  for (const [nombre, ruta] of [['gbak', GBAK], ['isql', ISQL]]) {
    if (!fs.existsSync(ruta)) { console.error(`No se encontró ${nombre} en ${ruta}`); process.exit(2) }
  }
  if (!DRY_RUN && !(BUCKET && process.env.VITE_S3_ACCESS_KEY && process.env.VITE_S3_SECRET_KEY)) {
    console.error('Faltan VITE_S3_BUCKET / VITE_S3_ACCESS_KEY / VITE_S3_SECRET_KEY en .env')
    process.exit(2)
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'istuffs-inv-'))
  const lista = SOLO ? SUCURSALES.filter(s => s.slug === SOLO) : SUCURSALES
  if (lista.length === 0) { console.error(`Sucursal desconocida: ${SOLO}`); process.exit(2) }

  let errores = 0
  for (const suc of lista) {
    try {
      await procesar(suc, workDir)
    } catch (err) {
      errores++
      console.error(`[${suc.slug}] ERROR: ${err.stderr?.toString().trim() || err.message}`)
    }
  }
  fs.rmSync(workDir, { recursive: true, force: true })

  log(errores ? `Terminado con ${errores} error(es)` : 'Terminado sin errores')
  process.exit(errores ? 1 : 0)
}

main()
