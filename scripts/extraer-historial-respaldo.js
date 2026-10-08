// Saca el historial mensual de ventas directamente de un respaldo de Eleventa.
//
//   node scripts/extraer-historial-respaldo.js --sucursal=ferias [--dry-run]
//
// INVENTARIO_HISTORIAL registra cada venta con su fecha, su producto y las
// piezas. Agrupado por mes da exactamente lo que necesita el historial, y es
// mejor dato que la estimación por diferencia de inventario: ahí una salida
// resurtida el mismo día no se ve, y la diferencia medida ronda el 19%.
//
// A diferencia del importador de Excel, esto no depende de que alguien exporte
// nada: sale del mismo respaldo que ya se sincroniza cada día.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { historialVacio, importarPeriodo, periodosDisponibles } from './lib/estadisticas.js'
import { deptoOculto } from './lib/departamentos.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
try { process.loadEnvFile(path.join(ROOT, '.env')) } catch { /* en CI viene del entorno */ }

const BUCKET = process.env.VITE_S3_BUCKET || process.env.S3_BUCKET
const REGION = process.env.VITE_S3_REGION || process.env.S3_REGION || 'us-east-1'
const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId:     process.env.VITE_S3_ACCESS_KEY || process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.VITE_S3_SECRET_KEY || process.env.S3_SECRET_KEY || '',
  },
})

const esWindows = process.platform === 'win32'
const ELEVENTA  = process.env.ELEVENTA_DIR || 'C:\\Program Files (x86)\\AbarrotesPDV'
const GBAK = process.env.GBAK || (esWindows ? path.join(ELEVENTA, 'gbak.exe') : 'gbak')
const ISQL = process.env.ISQL || (esWindows ? path.join(ELEVENTA, 'isql.exe') : 'isql-fb')
const FB_USER = process.env.FIREBIRD_USER || 'SYSDBA'
const FB_PASS = process.env.FIREBIRD_PASS || 'masterkey'
const FB_PREFIJO = process.env.FB_PREFIJO || ''
const BACKUPS_DIR = process.env.INVENTARIO_BACKUPS_DIR || 'A:\\Dropbox\\Espacio familiar\\RESPALDOS SUCURSALES'

const run = (c, a, o = {}) => promisify(execFile)(c, a, { maxBuffer: 64 * 1024 * 1024, windowsHide: true, ...o })

const SUCURSALES = {
  'leon':           { nombre: 'León',            carpeta: 'leon' },
  'san-luis':       { nombre: 'San Luis Potosí', carpeta: 'SLP' },
  'aguascalientes': { nombre: 'Aguascalientes',  carpeta: 'ags' },
  'bodega':         { nombre: 'Bodega',          carpeta: 'BODEGA' },
  'ferias':         { nombre: 'Ferias',          carpeta: 'ferias' },
}

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1]
const DRY_RUN = process.argv.includes('--dry-run')
const SLUG = arg('sucursal')
const DESDE = arg('desde') || '2000-01'

if (!SLUG || !SUCURSALES[SLUG]) {
  console.error(`Sucursal desconocida: ${SLUG || '(ninguna)'}`)
  console.error('Opciones: ' + Object.keys(SUCURSALES).join(', '))
  process.exit(1)
}

const SEP = '~|~'

/** Ventas por mes, producto y departamento. Una fila por combinación. */
const SQL = `
SET HEADING OFF;
-- Año y mes salen por separado y se juntan en JavaScript: concatenarlos aqui
-- mete un relleno de espacios en los numeros de dos cifras y los meses de
-- octubre en adelante salian como "2024- 10", lo que ademas rompia el orden.
SELECT EXTRACT(YEAR FROM h.CUANDO_FUE) || '${SEP}' ||
       EXTRACT(MONTH FROM h.CUANDO_FUE) || '${SEP}' ||
       p.CODIGO || '${SEP}' || p.DESCRIPCION || '${SEP}' ||
       CAST(SUM(h.CANTIDAD) AS INTEGER) || '${SEP}' || COALESCE(d.NOMBRE, '')
FROM INVENTARIO_HISTORIAL h
JOIN PRODUCTOS p ON p.ID = h.PRODUCTO_ID
LEFT JOIN DEPARTAMENTOS d ON d.ID = p.DEPT
WHERE h.VENTA_ID IS NOT NULL
GROUP BY EXTRACT(YEAR FROM h.CUANDO_FUE), EXTRACT(MONTH FROM h.CUANDO_FUE),
         p.CODIGO, p.DESCRIPCION, d.NOMBRE
ORDER BY 1;
`

function ultimoRespaldo(carpeta) {
  const dir = path.join(BACKUPS_DIR, carpeta)
  if (!fs.existsSync(dir)) throw new Error(`No existe la carpeta ${dir}`)
  const encontrados = []
  const buscar = d => {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n)
      let st; try { st = fs.statSync(p) } catch { continue }
      if (st.isDirectory()) buscar(p)
      else if (/\.fbk$/i.test(n)) encontrados.push({ p, n })
    }
  }
  buscar(dir)
  if (!encontrados.length) throw new Error(`Sin archivos .fbk en ${dir}`)
  const fecha = n => {
    const m = /(\d{2})-(\d{2})-(\d{2})/.exec(n)
    return m ? `20${m[3]}-${m[2]}-${m[1]}` : '0000-00-00'
  }
  encontrados.sort((a, b) => fecha(b.n).localeCompare(fecha(a.n)))
  return encontrados[0].p
}

const suc = SUCURSALES[SLUG]
console.log(`Extrayendo historial de ${suc.nombre}\n`)

const fbk = ultimoRespaldo(suc.carpeta)
console.log(`  respaldo: ${path.basename(fbk)}`)

const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), 'hist-'))
if (!esWindows) { try { fs.chmodSync(trabajo, 0o777) } catch { /* lo dirá gbak */ } }
const fdb = path.join(trabajo, 'base.fdb')

console.log('  restaurando...')
await run(GBAK, ['-c', '-user', FB_USER, '-password', FB_PASS, fbk, `${FB_PREFIJO}${fdb}`])

const sqlFile = path.join(trabajo, 'q.sql')
const outFile = path.join(trabajo, 'o.txt')
fs.writeFileSync(sqlFile, SQL)
await run(ISQL, ['-user', FB_USER, '-password', FB_PASS, '-i', sqlFile, '-o', outFile, `${FB_PREFIJO}${fdb}`])

const texto = fs.readFileSync(outFile, 'latin1')
const porMes = new Map()
const catalogo = {}
let leidas = 0, omitidas = 0

for (const linea of texto.split(/\r?\n/)) {
  if (!linea.includes(SEP)) continue
  const [anio, numMes, codigo, producto, piezas, depto] = linea.split(SEP).map(s => s.trim())
  const mes = `${anio}-${String(numMes).padStart(2, '0')}`
  leidas++
  if (!codigo || !/^\d{4}-\d{2}$/.test(mes) || mes < DESDE) continue
  if (deptoOculto(depto)) { omitidas++; continue }
  const n = Number(piezas) || 0
  if (n <= 0) continue

  if (!porMes.has(mes)) porMes.set(mes, {})
  const m = porMes.get(mes)
  m[codigo] = (m[codigo] || 0) + n
  if (producto && !catalogo[codigo]) catalogo[codigo] = producto
}

fs.rmSync(trabajo, { recursive: true, force: true })

const meses = [...porMes.keys()].sort()
console.log(`  ${leidas} renglones leídos, ${omitidas} omitidos por departamento`)
console.log(`  ${meses.length} meses con venta, de ${meses[0]} a ${meses[meses.length - 1]}\n`)

// El historial que ya hubiera se conserva: solo se reemplazan los meses que
// trae el respaldo. Así no se pierde lo que venga de otra fuente.
const clave = `inventarios/${SLUG}/historial.json`
let historial
try {
  const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: clave }))
  historial = JSON.parse(await r.Body.transformToString())
} catch {
  historial = historialVacio(SLUG, suc.nombre)
}

const diasDelMes = m => { const [a, mm] = m.split('-').map(Number); return new Date(a, mm, 0).getDate() }
const hoy = new Date().toISOString().slice(0, 10)
const mesActual = hoy.slice(0, 7)

for (const mes of meses) {
  const salidas = porMes.get(mes)
  const piezas = Object.values(salidas).reduce((a, b) => a + b, 0)
  // El mes en curso no está completo: se cuentan los días transcurridos, no
  // los del calendario, para que el ritmo diario no salga diluido.
  const dias = mes === mesActual ? Number(hoy.slice(8, 10)) : diasDelMes(mes)
  historial = importarPeriodo(historial, mes, salidas, catalogo, {
    desde: `${mes}-01`,
    hasta: mes === mesActual ? hoy : `${mes}-${String(dias).padStart(2, '0')}`,
    diasCubiertos: dias,
  })
  console.log(`  ${mes}  ${String(piezas).padStart(6)} pz  ${String(Object.keys(salidas).length).padStart(4)} modelos  ${String(dias).padStart(2)} d  ${(piezas / dias).toFixed(1).padStart(6)} pz/día`)
}

if (DRY_RUN) {
  console.log('\nDry-run: no se guardó nada.')
} else {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: clave,
    Body: Buffer.from(JSON.stringify(historial)),
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-cache',
  }))
  console.log(`\nGuardado en ${clave}`)
}

const disp = periodosDisponibles(historial)
console.log(`\nEl historial queda con ${disp.length} periodos, ${disp.reduce((a, p) => a + p.total, 0)} piezas.`)
