// Sincroniza el inventario de cada sucursal a partir del respaldo (.fbk) más
// reciente de Eleventa, y lo publica como JSON en S3.
//
// Funciona en dos modos:
//   local    — lee la carpeta de Dropbox montada en disco (PC con Eleventa)
//   dropbox  — descarga los respaldos por la API (servidor, GitHub Actions)
// Se elige solo: si existe la carpeta local la usa, si no va por la API.
//
// Uso:
//   node scripts/sincronizar-inventarios.js
//   node scripts/sincronizar-inventarios.js --dry-run          no sube a S3
//   node scripts/sincronizar-inventarios.js --sucursal=leon    solo una
//   node scripts/sincronizar-inventarios.js --origen=dropbox   fuerza el modo
//   node scripts/sincronizar-inventarios.js --forzar           omite validaciones

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { listarArchivos, descargar, dropboxConfigurado } from './lib/dropbox-api.js'

const run = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

try { process.loadEnvFile(path.join(ROOT, '.env')) } catch { /* en CI las variables vienen del entorno */ }

// ── Configuración ──────────────────────────────────────────────────────────

const BACKUPS_DIR    = process.env.INVENTARIO_BACKUPS_DIR || 'A:\\Dropbox\\Espacio familiar\\RESPALDOS SUCURSALES'
const BACKUPS_DROPBOX = process.env.INVENTARIO_BACKUPS_DROPBOX || '/Espacio familiar/RESPALDOS SUCURSALES'
const ELEVENTA_DIR   = process.env.ELEVENTA_DIR || 'C:\\Program Files (x86)\\AbarrotesPDV'

// En Windows se usan los binarios que trae Eleventa. En Linux, los de Firebird
// del sistema, donde Debian renombra isql a isql-fb para no chocar con unixODBC.
const esWindows = process.platform === 'win32'
const GBAK = process.env.GBAK || (esWindows ? path.join(ELEVENTA_DIR, 'gbak.exe') : 'gbak')
const ISQL = process.env.ISQL || (esWindows ? path.join(ELEVENTA_DIR, 'isql.exe') : 'isql-fb')

const FB_USER = process.env.FIREBIRD_USER || 'SYSDBA'
const FB_PASS = process.env.FIREBIRD_PASS || 'masterkey'

// En Linux el cliente de Firebird no abre el archivo directamente: habla con
// un servidor. Segun como este compilado, una ruta suelta puede fallar y hay
// que nombrarla como "localhost:/ruta". En Windows no aplica y queda vacio.
const FB_PREFIJO = process.env.FB_PREFIJO || ''
const comoBase = ruta => `${FB_PREFIJO}${ruta}`

// Solo sucursales activas. Torreón y Morelia tienen carpeta pero sin respaldos recientes.
const SUCURSALES = [
  { slug: 'aguascalientes', nombre: 'Aguascalientes',  carpeta: 'ags'  },
  { slug: 'leon',           nombre: 'León',            carpeta: 'leon' },
  { slug: 'san-luis',       nombre: 'San Luis Potosí', carpeta: 'SLP'  },
]

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
const FORZAR  = args.includes('--forzar')
const SOLO    = args.find(a => a.startsWith('--sucursal='))?.split('=')[1]
const ORIGEN  = args.find(a => a.startsWith('--origen='))?.split('=')[1]
  || (fs.existsSync(BACKUPS_DIR) ? 'local' : 'dropbox')

// ── Protección de datos ────────────────────────────────────────────────────
const MIN_PRODUCTOS = 50   // menos de esto se considera respaldo incompleto
const MAX_CAIDA_PCT = 40   // caída máxima aceptable contra lo ya publicado

const BUCKET = process.env.VITE_S3_BUCKET || process.env.S3_BUCKET
const REGION = process.env.VITE_S3_REGION || process.env.S3_REGION || 'us-east-1'
const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId:     process.env.VITE_S3_ACCESS_KEY || process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.VITE_S3_SECRET_KEY || process.env.S3_SECRET_KEY || '',
  },
})

// ── Utilidades ─────────────────────────────────────────────────────────────

const log = (...m) => console.log(new Date().toLocaleTimeString('es-MX', { hour12: false }), ...m)

// "respaldo-10-09-26.fbk" → "2026-09-10"
function fechaDelNombre(archivo) {
  const m = /(\d{2})-(\d{2})-(\d{2})/.exec(path.basename(archivo))
  return m ? `20${m[3]}-${m[2]}-${m[1]}` : null
}

// Se usa statSync (no dirent) porque los archivos "solo en línea" de Dropbox
// son reparse points y dirent.isFile() los reporta como false.
function buscarFbkLocal(dir, acc = []) {
  for (const nombre of fs.readdirSync(dir)) {
    const p = path.join(dir, nombre)
    let st
    try { st = fs.statSync(p) } catch { continue }
    if (st.isDirectory()) buscarFbkLocal(p, acc)
    else if (st.isFile() && /\.fbk$/i.test(nombre)) {
      acc.push({
        nombre,
        origen: p,
        fecha:  fechaDelNombre(nombre) || st.mtime.toISOString().slice(0, 10),
        marca:  st.mtime.toISOString(),
      })
    }
  }
  return acc
}

async function buscarFbkDropbox(carpeta) {
  const entradas = await listarArchivos(`${BACKUPS_DROPBOX}/${carpeta}`)
  return entradas
    .filter(e => /\.fbk$/i.test(e.name))
    .map(e => ({
      nombre: e.name,
      origen: e.path_lower,
      fecha:  fechaDelNombre(e.name) || e.server_modified.slice(0, 10),
      marca:  e.server_modified,
      tamano: e.size,
    }))
}

/** Devuelve el respaldo más reciente de una sucursal, sea cual sea el origen. */
async function ultimoRespaldo(carpeta) {
  let todos
  if (ORIGEN === 'local') {
    const dir = path.join(BACKUPS_DIR, carpeta)
    if (!fs.existsSync(dir)) throw new Error(`No existe la carpeta ${dir}`)
    todos = buscarFbkLocal(dir)
  } else {
    todos = await buscarFbkDropbox(carpeta)
  }
  if (todos.length === 0) throw new Error(`Sin archivos .fbk en ${carpeta}`)
  // Más reciente por fecha del nombre (respaldo-DD-MM-YY); desempata por fecha real
  todos.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.marca.localeCompare(a.marca))
  return todos[0]
}

/** Deja el .fbk en disco listo para gbak, descargándolo si hace falta. */
async function obtenerArchivo(respaldo, workDir) {
  if (ORIGEN === 'local') return respaldo.origen
  const destino = path.join(workDir, respaldo.nombre)
  await descargar(respaldo.origen, destino)
  return destino
}

async function restaurar(fbk, destinoFdb) {
  fs.rmSync(destinoFdb, { force: true })
  // El .fbk lo lee gbak del lado del cliente; la base la crea el servidor,
  // asi que solo esa lleva el prefijo.
  await run(GBAK, ['-c', '-user', FB_USER, '-password', FB_PASS, fbk, comoBase(destinoFdb)], { windowsHide: true })
  if (!fs.existsSync(destinoFdb)) throw new Error('gbak no generó la base restaurada')
}

async function consultar(fdb, workDir) {
  const sqlFile = path.join(workDir, 'consulta.sql')
  const outFile = path.join(workDir, 'salida.txt')
  fs.writeFileSync(sqlFile, SQL)
  fs.rmSync(outFile, { force: true })
  await run(ISQL, ['-user', FB_USER, '-password', FB_PASS, '-i', sqlFile, '-o', outFile, comoBase(fdb)], { windowsHide: true })
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

// ── Publicación en S3 ──────────────────────────────────────────────────────

async function jsonPublicado(slug) {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `inventarios/${slug}/inventario.json` }))
    return JSON.parse(await res.Body.transformToString())
  } catch {
    return null
  }
}

/**
 * ¿Lo que ya está publicado es más reciente que lo que se va a publicar?
 *
 * Existe porque ahora la sincronización corre desde dos lados: GitHub cada
 * seis horas y esta computadora al encender. Si Dropbox aún no terminó de
 * bajar el respaldo del día, la corrida local leería uno viejo y lo publicaría
 * encima del bueno. Con esto el inventario solo avanza, nunca retrocede.
 */
function yaHayAlgoMasNuevo(anterior, json) {
  const publicada = anterior?.respaldo?.fecha
  const nueva     = json?.respaldo?.fecha
  if (!publicada || !nueva) return false
  if (publicada !== nueva) return publicada > nueva
  // Mismo día: gana el archivo modificado más tarde, si se sabe.
  const a = anterior?.respaldo?.modificado
  const b = json?.respaldo?.modificado
  return !!(a && b && a > b)
}

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
  const comun = { Bucket: BUCKET, ContentType: 'application/json; charset=utf-8' }
  if (anterior) {
    const sello = (anterior.generado || new Date().toISOString()).slice(0, 10)
    await s3.send(new PutObjectCommand({
      ...comun,
      Key:  `inventarios/${slug}/historico/${sello}.json`,
      Body: Buffer.from(JSON.stringify(anterior)),
    }))
  }
  await s3.send(new PutObjectCommand({
    ...comun,
    Key:          `inventarios/${slug}/inventario.json`,
    Body:         Buffer.from(JSON.stringify(json)),
    CacheControl: 'no-cache',
  }))
}

// ── Proceso por sucursal ───────────────────────────────────────────────────

async function procesar(suc, workDir) {
  const respaldo = await ultimoRespaldo(suc.carpeta)
  const mb = respaldo.tamano ? ` ${(respaldo.tamano / 1048576).toFixed(0)} MB` : ''
  log(`[${suc.slug}] respaldo ${respaldo.nombre} del ${respaldo.fecha}${mb}`)

  const fbk = await obtenerArchivo(respaldo, workDir)
  const fdb = path.join(workDir, `${suc.slug}.fdb`)
  await restaurar(fbk, fdb)

  const filas = await consultar(fdb, workDir)
  fs.rmSync(fdb, { force: true })
  if (ORIGEN !== 'local') fs.rmSync(fbk, { force: true })
  if (filas.length === 0) throw new Error('La consulta no devolvió productos')

  const productos = filas
    .filter(f => !DEPTOS_OCULTOS.has(f.depto.toLowerCase()))
    .map(f => ({ Producto: f.producto, Existencia: f.existencia }))

  const json = {
    sucursal:  suc.slug,
    nombre:    suc.nombre,
    origen:    'respaldo-eleventa',
    generado:  new Date().toISOString(),
    respaldo:  { archivo: respaldo.nombre, fecha: respaldo.fecha, modificado: respaldo.marca },
    totalProductos: productos.length,
    productos,
  }

  const anterior = DRY_RUN && !BUCKET ? null : await jsonPublicado(suc.slug)

  // El inventario solo avanza. Si lo publicado es más reciente que este
  // respaldo, no se toca: significa que otra corrida ya subió algo mejor.
  if (!FORZAR && yaHayAlgoMasNuevo(anterior, json)) {
    log(`[${suc.slug}] sin cambios: ya está publicado el respaldo del ${anterior.respaldo.fecha}, más reciente que el ${json.respaldo.fecha} de aquí`)
    return
  }

  if (FORZAR) log(`[${suc.slug}] --forzar activo: se omiten las validaciones`)
  else validar(suc.slug, productos, anterior)

  if (DRY_RUN) {
    const outDir = path.join(__dirname, 'out')
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, `${suc.slug}.json`), JSON.stringify(json, null, 2))
    log(`[${suc.slug}] ${filas.length} leídos, ${productos.length} publicables → scripts/out/${suc.slug}.json (dry-run)`)
  } else {
    await subirJson(suc.slug, json, anterior)
    const previos = anterior?.totalProductos
    log(`[${suc.slug}] ${filas.length} leídos, ${productos.length} publicables${previos ? ` (antes ${previos})` : ''} → publicado`)
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  log(`Origen de los respaldos: ${ORIGEN}`)

  if (ORIGEN === 'dropbox' && !dropboxConfigurado()) {
    console.error('Faltan las credenciales de Dropbox (DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY, DROPBOX_APP_SECRET)')
    process.exit(2)
  }
  if (!DRY_RUN && !(BUCKET && (process.env.VITE_S3_ACCESS_KEY || process.env.S3_ACCESS_KEY))) {
    console.error('Faltan las credenciales de S3 (S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY)')
    process.exit(2)
  }

  // Comprobación temprana de las herramientas de Firebird, con mensaje claro
  try {
    await run(GBAK, ['-z'], { windowsHide: true })
  } catch (err) {
    const salida = `${err.stdout || ''}${err.stderr || ''}`
    if (!salida.includes('gbak')) {
      console.error(`No se pudo ejecutar gbak en "${GBAK}". ${esWindows ? 'Revisa ELEVENTA_DIR.' : 'Instala firebird3.0-utils o define GBAK.'}`)
      process.exit(2)
    }
    log(`Firebird: ${salida.split('\n')[0].trim()}`)
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'istuffs-inv-'))
  // En Linux el motor de Firebird corre como el usuario `firebird`, distinto
  // del que lanza gbak. mkdtemp crea la carpeta en modo 700, así que el motor
  // no puede escribir ahí la base restaurada y falla con "Permission denied".
  if (!esWindows) {
    try { fs.chmodSync(workDir, 0o777) } catch { /* si falla, gbak lo dirá */ }
  }
  const lista = SOLO ? SUCURSALES.filter(s => s.slug === SOLO) : SUCURSALES
  if (lista.length === 0) { console.error(`Sucursal desconocida: ${SOLO}`); process.exit(2) }

  let errores = 0
  for (const suc of lista) {
    try {
      await procesar(suc, workDir)
    } catch (err) {
      errores++
      // Se imprime todo. Recortar el mensaje escondia la causa real cuando
      // gbak o isql fallaban por version del respaldo o por permisos.
      console.error(`[${suc.slug}] ERROR: ${err.message || 'sin mensaje'}`)
      const detalle = [err.stdout, err.stderr]
        .filter(Boolean).map(x => x.toString().trim()).filter(Boolean).join('\n')
      if (detalle) {
        console.error(detalle.split('\n').map(l => `[${suc.slug}]   ${l}`).join('\n'))
      }
    }
  }
  fs.rmSync(workDir, { recursive: true, force: true })

  log(errores ? `Terminado con ${errores} error(es)` : 'Terminado sin errores')
  process.exit(errores ? 1 : 0)
}

main()
