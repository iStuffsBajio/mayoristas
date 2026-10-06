// Siembra el historial con reportes de ventas de Eleventa.
//
// Las estadísticas automáticas arrancaron en septiembre de 2026, así que no
// hay con qué comparar temporadas. Un reporte de ventas exportado de Eleventa
// cubre meses anteriores y trae el dato bueno: la venta real, no la estimación
// por diferencia de inventario.
//
// Uso:
//   node scripts/importar-ventas-historicas.js \
//     --archivo="ruta/Ventas marzo.xlsx" --sucursal=leon --periodo=2026-03 \
//     [--desde=2026-03-01] [--hasta=2026-03-31] [--dry-run]
//
// El reporte debe traer las columnas Código, Descripción y Cantidad, que es lo
// que exporta Eleventa en "Reporte de ventas por producto". Si el archivo no
// trae Código no sirve: sin él no se puede cruzar con el inventario.
//
// Importar un mes REEMPLAZA lo que hubiera de ese mes. Se puede repetir sin
// miedo a duplicar.

import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx-js-style'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { historialVacio, importarPeriodo, periodosDisponibles } from './lib/estadisticas.js'

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

// Los mismos que esconde la sincronización, para que las dos fuentes cuenten
// lo mismo y los números sean comparables.
const DEPTOS_OCULTOS = new Set(['mayoristas', '- sin departamento -'])

const SUCURSALES = {
  'leon':           'León',
  'san-luis':       'San Luis Potosí',
  'aguascalientes': 'Aguascalientes',
  'bodega':         'Bodega',
}

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=')
const DRY_RUN = process.argv.includes('--dry-run')

const ARCHIVO  = arg('archivo')
const SUCURSAL = arg('sucursal')
const PERIODO  = arg('periodo')
const DESDE    = arg('desde') || null
const HASTA    = arg('hasta') || null

function salir(mensaje) {
  console.error(mensaje)
  console.error('\nUso: node scripts/importar-ventas-historicas.js --archivo=<xlsx> --sucursal=<slug> --periodo=YYYY-MM')
  console.error('Sucursales: ' + Object.keys(SUCURSALES).join(', '))
  process.exit(1)
}

if (!ARCHIVO)  salir('Falta --archivo')
if (!SUCURSAL || !SUCURSALES[SUCURSAL]) salir(`Sucursal desconocida: ${SUCURSAL || '(ninguna)'}`)
if (!/^\d{4}-\d{2}$/.test(PERIODO || '')) salir('Falta --periodo, con formato YYYY-MM')
if (!fs.existsSync(ARCHIVO)) salir(`No existe el archivo: ${ARCHIVO}`)

/** Normaliza un encabezado para reconocerlo con o sin acentos y mayúsculas. */
const clave = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** Lee el reporte y suma las cantidades por código. */
function leerReporte(ruta) {
  const wb = XLSX.readFile(ruta)
  const hoja = wb.Sheets[wb.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' })
  if (filas.length === 0) throw new Error('El archivo no tiene filas.')

  // Se buscan las columnas por nombre y no por posición: Eleventa cambia el
  // orden según las opciones que se marquen al exportar.
  const encabezados = Object.keys(filas[0])
  const buscar = (...nombres) => encabezados.find(h => nombres.includes(clave(h)))

  const colCodigo = buscar('codigo')
  const colNombre = buscar('descripcion', 'producto')
  const colCant   = buscar('cantidad', 'piezas')
  const colDepto  = buscar('departamento', 'depto')

  if (!colCodigo) {
    throw new Error(
      'El reporte no trae columna "Código". Sin ella no se puede cruzar con el inventario.\n' +
      '  Al exportar desde Eleventa hay que marcar la casilla del código.\n' +
      `  Columnas encontradas: ${encabezados.join(', ')}`)
  }
  if (!colCant) throw new Error(`No encuentro la columna "Cantidad". Hay: ${encabezados.join(', ')}`)

  const salidas = {}
  const catalogo = {}
  let leidas = 0, omitidasDepto = 0, omitidasSinCodigo = 0, piezas = 0

  for (const f of filas) {
    leidas++
    const codigo = String(f[colCodigo] ?? '').trim()
    if (!codigo) { omitidasSinCodigo++; continue }

    if (colDepto && DEPTOS_OCULTOS.has(clave(f[colDepto]))) { omitidasDepto++; continue }

    // La cantidad puede venir como texto. Una devolución llega en negativo y
    // debe restar, que para eso el reporte la trae así.
    const n = Number(String(f[colCant]).replace(/[^\d.-]/g, '')) || 0
    if (n === 0) continue

    salidas[codigo] = (salidas[codigo] || 0) + n
    piezas += n
    const nombre = String(f[colNombre] ?? '').trim()
    if (nombre && !catalogo[codigo]) catalogo[codigo] = nombre
  }

  // Un código que acabó en cero o negativo tras sumar devoluciones no aporta.
  for (const [k, v] of Object.entries(salidas)) if (v <= 0) delete salidas[k]

  return { salidas, catalogo, leidas, omitidasDepto, omitidasSinCodigo, piezas }
}

/** Días que cubre el reporte, para poder sacar una venta diaria honesta. */
function diasCubiertos(desde, hasta, periodo) {
  if (desde && hasta) {
    const d = new Date(desde), h = new Date(hasta)
    const n = Math.round((h - d) / 86400000) + 1
    if (n > 0 && n < 400) return n
  }
  // Sin fechas se asume el mes completo, que es lo normal al exportar por mes.
  const [a, m] = periodo.split('-').map(Number)
  return new Date(a, m, 0).getDate()
}

const claveHistorial = slug => `inventarios/${slug}/historial.json`

async function historialActual(slug, nombre) {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: claveHistorial(slug) }))
    return JSON.parse(await r.Body.transformToString())
  } catch {
    return historialVacio(slug, nombre)
  }
}

// ── Ejecución ───────────────────────────────────────────────────────────────

const nombre = SUCURSALES[SUCURSAL]
console.log(`Importando ventas de ${nombre}, periodo ${PERIODO}`)
console.log(`  archivo: ${path.basename(ARCHIVO)}\n`)

let reporte
try {
  reporte = leerReporte(ARCHIVO)
} catch (e) {
  console.error('No se pudo leer el reporte:\n  ' + e.message)
  process.exit(1)
}

const modelos = Object.keys(reporte.salidas).length
const dias = diasCubiertos(DESDE, HASTA, PERIODO)

console.log(`  ${reporte.leidas} renglones leídos`)
if (reporte.omitidasDepto)     console.log(`  ${reporte.omitidasDepto} omitidos por departamento (mayoristas o sin departamento)`)
if (reporte.omitidasSinCodigo) console.log(`  ${reporte.omitidasSinCodigo} omitidos por no traer código`)
console.log(`  → ${reporte.piezas} piezas en ${modelos} modelos`)
console.log(`  → ${dias} días cubiertos${DESDE && HASTA ? ` (${DESDE} a ${HASTA})` : ' (mes completo, no se pasaron fechas)'}`)
console.log(`  → ${(reporte.piezas / dias).toFixed(1)} piezas al día\n`)

if (modelos === 0) {
  console.error('No quedó nada que importar.')
  process.exit(1)
}

const top = Object.entries(reporte.salidas).sort((a, b) => b[1] - a[1]).slice(0, 8)
console.log('  Los que más salieron:')
for (const [c, n] of top) {
  console.log(`    ${String(n).padStart(4)} pz  ${c.padEnd(10)} ${(reporte.catalogo[c] || '').slice(0, 38)}`)
}

const previo = await historialActual(SUCURSAL, nombre)
const yaEstaba = (previo.periodos ?? []).find(p => p.p === PERIODO)
if (yaEstaba) {
  const antes = Object.values(yaEstaba.m ?? {}).reduce((a, b) => a + b, 0)
  console.log(`\n  AVISO: ${PERIODO} ya tenía ${antes} pz (origen: ${yaEstaba.origen ?? 'inventario'}). Se reemplaza.`)
}

const nuevo = importarPeriodo(previo, PERIODO, reporte.salidas, reporte.catalogo, {
  desde: DESDE, hasta: HASTA, diasCubiertos: dias,
})

if (DRY_RUN) {
  console.log('\nDry-run: no se guardó nada.')
} else {
  await s3.send(new PutObjectCommand({
    Bucket:       BUCKET,
    Key:          claveHistorial(SUCURSAL),
    Body:         Buffer.from(JSON.stringify(nuevo)),
    ContentType:  'application/json; charset=utf-8',
    CacheControl: 'no-cache',
  }))
  console.log(`\nGuardado en ${claveHistorial(SUCURSAL)}`)
}

console.log('\nHistorial de ' + nombre + ' tras la importación:')
for (const p of periodosDisponibles(nuevo)) {
  const det = (nuevo.periodos.find(x => x.p === p.periodo) ?? {})
  const origen = det.origen === 'eleventa' ? 'Eleventa' : 'inventarios'
  console.log(`  ${p.periodo}  ${String(p.total).padStart(5)} pz  ${String(p.modelos).padStart(4)} modelos  (${origen})`)
}
