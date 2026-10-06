// Importa de golpe los libros de estadística mensual que están en la carpeta
// de bodega: un libro por sucursal, con una pestaña por mes.
//
//   node scripts/importar-estadistica-mensual.js [--dry-run] [--incluir-parciales]
//
// Cada pestaña trae el reporte de ventas tal cual lo exporta Eleventa
// (Código, Descripción, Cantidad, Departamento). Las pestañas de resumen
// —TOP VENDIDOS, REVISIONES, MERMAS— se reconocen y se saltan solas.
//
// Un mes que el propio nombre declara incompleto ("11 dias DICIEMBRE 25") se
// omite salvo que se pida lo contrario: el dato es bueno, pero un mes a
// medias se lee como un mes flojo al comparar con los demás.

import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { historialVacio, importarPeriodo, periodosDisponibles } from './lib/estadisticas.js'
import { mesDePestana, diasDelMes } from './lib/pestanas-mes.js'

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

const DRY_RUN   = process.argv.includes('--dry-run')
const PARCIALES = process.argv.includes('--incluir-parciales')

const BASE = process.env.ESTADISTICA_DIR
  || 'A:\\Dropbox\\Espacio familiar\\RESPALDOS SUCURSALES\\BODEGA\\estadistica'

const LIBROS = [
  { slug: 'leon',           nombre: 'León',            archivo: 'LEON MESES/LEON X MESES.xlsx' },
  { slug: 'san-luis',       nombre: 'San Luis Potosí', archivo: 'SLP MESES/slp meses.xlsx' },
  { slug: 'aguascalientes', nombre: 'Aguascalientes',  archivo: 'AGS MESES/ABR 2026 AGS.xlsx' },
]

// Los mismos que esconde la sincronización, para que las dos fuentes midan lo
// mismo y los meses sean comparables entre sí.
const DEPTOS_OCULTOS = new Set(['mayoristas', '- sin departamento -'])

const limpio = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

/** Suma las cantidades por código de una pestaña. */
function leerPestana(hoja) {
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' })
  if (filas.length === 0) return null

  const cols = Object.keys(filas[0])
  const cCodigo = cols.find(c => limpio(c) === 'codigo')
  const cNombre = cols.find(c => ['descripcion', 'producto'].includes(limpio(c)))
  const cCant   = cols.find(c => ['cantidad', 'piezas'].includes(limpio(c)))
  const cDepto  = cols.find(c => limpio(c).startsWith('depart'))

  if (!cCodigo || !cCant) return { error: `faltan columnas (hay: ${cols.join(', ')})` }

  const salidas = {}, catalogo = {}
  let piezas = 0, omitidas = 0

  for (const f of filas) {
    const codigo = String(f[cCodigo] ?? '').trim()
    if (!codigo) continue
    if (cDepto && DEPTOS_OCULTOS.has(limpio(f[cDepto]))) { omitidas++; continue }

    // Una devolución viene en negativo y debe restar.
    const n = Number(String(f[cCant]).replace(/[^\d.-]/g, '')) || 0
    if (n === 0) continue

    salidas[codigo] = (salidas[codigo] || 0) + n
    piezas += n
    const nombre = String(f[cNombre] ?? '').trim()
    if (nombre && !catalogo[codigo]) catalogo[codigo] = nombre
  }

  for (const [k, v] of Object.entries(salidas)) if (v <= 0) delete salidas[k]

  return { salidas, catalogo, piezas, omitidas, filas: filas.length }
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

console.log(DRY_RUN ? 'Importación de estadística mensual (dry-run)\n' : 'Importación de estadística mensual\n')

let totalMeses = 0, totalPiezas = 0
const omitidosParciales = []

for (const libro of LIBROS) {
  const ruta = path.join(BASE, libro.archivo)
  if (!fs.existsSync(ruta)) {
    console.error(`  ${libro.slug}: no existe ${ruta}`)
    continue
  }

  const wb = XLSX.readFile(ruta)
  let historial = await historialActual(libro.slug, libro.nombre)
  let meses = 0, piezas = 0

  console.log(`${libro.nombre}`)

  for (const pestana of wb.SheetNames) {
    const m = mesDePestana(pestana)
    if (!m) continue

    if (m.parcial && !PARCIALES) {
      omitidosParciales.push({ slug: libro.slug, periodo: m.periodo, pestana, dias: m.dias })
      console.log(`  ${m.periodo}  omitido: el nombre dice que son ${m.dias} días, no el mes`)
      continue
    }

    const r = leerPestana(wb.Sheets[pestana])
    if (!r)        { console.log(`  ${m.periodo}  pestaña vacía`); continue }
    if (r.error)   { console.log(`  ${m.periodo}  ${r.error}`); continue }

    const modelos = Object.keys(r.salidas).length
    if (modelos === 0) { console.log(`  ${m.periodo}  sin movimientos aprovechables`); continue }

    const dias = m.parcial ? m.dias : diasDelMes(m.periodo)

    historial = importarPeriodo(historial, m.periodo, r.salidas, r.catalogo, {
      desde: m.parcial ? null : `${m.periodo}-01`,
      hasta: m.parcial ? null : `${m.periodo}-${String(dias).padStart(2, '0')}`,
      diasCubiertos: dias,
    })

    meses++; piezas += r.piezas
    console.log(`  ${m.periodo}  ${String(r.piezas).padStart(5)} pz  ${String(modelos).padStart(4)} modelos  ${String(dias).padStart(2)} d  ${(r.piezas / dias).toFixed(1).padStart(5)} pz/día${r.omitidas ? `  (${r.omitidas} de mayoristas fuera)` : ''}`)
  }

  if (!DRY_RUN && meses > 0) {
    await s3.send(new PutObjectCommand({
      Bucket:       BUCKET,
      Key:          claveHistorial(libro.slug),
      Body:         Buffer.from(JSON.stringify(historial)),
      ContentType:  'application/json; charset=utf-8',
      CacheControl: 'no-cache',
    }))
  }

  const disponibles = periodosDisponibles(historial)
  console.log(`  → ${meses} meses importados, ${piezas} piezas`)
  console.log(`  → el historial queda con ${disponibles.length} periodos: ${disponibles.map(p => p.periodo).reverse().join(', ')}\n`)

  totalMeses += meses; totalPiezas += piezas
}

console.log(`${totalMeses} meses, ${totalPiezas} piezas` + (DRY_RUN ? ' (no se guardó nada)' : ' guardados'))

if (omitidosParciales.length) {
  console.log('\nMeses incompletos que quedaron fuera:')
  for (const o of omitidosParciales) {
    console.log(`  ${o.slug.padEnd(16)} ${o.periodo}  "${o.pestana}"  (${o.dias} días)`)
  }
  console.log('  Para incluirlos: --incluir-parciales')
  console.log('  El cálculo los maneja bien, porque el ritmo diario se saca con los días reales.')
}
