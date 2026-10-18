// Saca de los respaldos quién abrió caja y a qué hora, para medir puntualidad.
//
//   node scripts/extraer-turnos.js [--dry-run] [--desde=2026-01-01]
//
// La tabla TURNOS de Eleventa guarda una fila por apertura de caja con el
// cajero, la hora de inicio y la de cierre. Es lo más parecido a un registro
// de entrada que hay, aunque no sea un reloj checador: mide cuándo se abrió la
// caja, no cuándo llegó la persona.
//
// DÓNDE SE GUARDA. En `personal/`, que NO es de lectura pública, y no en
// `inventarios/`, que sí lo es. Son nombres de empleados y la hora a la que
// llegaron cada día: eso no puede quedar accesible por URL.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { ultimoRespaldo, obtenerArchivo, origenPorDefecto } from './lib/respaldos.js'
import { dropboxConfigurado } from './lib/dropbox-api.js'

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
// De donde salen los respaldos. Igual que el de inventarios: del disco en tu
// maquina, de la API de Dropbox en GitHub Actions, donde no hay unidad A:.
const ORIGEN = process.argv.find(a => a.startsWith('--origen='))?.split('=')[1] || origenPorDefecto()

const run = (c, a, o = {}) => promisify(execFile)(c, a, { maxBuffer: 64 * 1024 * 1024, windowsHide: true, ...o })

const SUCURSALES = [
  { slug: 'leon',           nombre: 'León',            carpeta: 'leon' },
  { slug: 'san-luis',       nombre: 'San Luis Potosí', carpeta: 'SLP' },
  { slug: 'aguascalientes', nombre: 'Aguascalientes',  carpeta: 'ags' },
  { slug: 'ferias',         nombre: 'Ferias',          carpeta: 'ferias' },
]

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1]
const DRY_RUN = process.argv.includes('--dry-run')
const DESDE = arg('desde') || '2025-01-01'

const SEP = '~|~'

// El usuario administrador no es personal de mostrador: sus aperturas son
// mantenimiento y meterlas falsearía los promedios de puntualidad.
const FUERA = new Set(['administrador de la tienda'])

const SQL = `
SET HEADING OFF;
SELECT t.INICIO_EN || '${SEP}' || COALESCE(CAST(t.TERMINO_EN AS VARCHAR(30)), '') || '${SEP}' ||
       COALESCE(u.NOMBRE_COMPLETO, '(sin usuario)') || '${SEP}' || COALESCE(t.NUMERO_VENTAS, 0)
FROM TURNOS t
LEFT JOIN USUARIOS u ON u.ID = t.ID_CAJERO
WHERE t.INICIO_EN >= '${DESDE}'
ORDER BY t.INICIO_EN;
`

console.log(DRY_RUN ? 'Extracción de turnos (dry-run)\n' : 'Extracción de turnos\n')

if (ORIGEN === 'dropbox' && !dropboxConfigurado()) {
  console.error('Falta la configuración de Dropbox para bajar los respaldos.')
  process.exit(1)
}
console.log(`  origen de los respaldos: ${ORIGEN}
`)

const todos = []
for (const suc of SUCURSALES) {
  const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), 'turnos-'))
  if (!esWindows) { try { fs.chmodSync(trabajo, 0o777) } catch { /* lo dirá gbak */ } }
  const fdb = path.join(trabajo, 'b.fdb')

  try {
    let respaldo
    try { respaldo = await ultimoRespaldo(suc.carpeta, ORIGEN) }
    catch { console.log(`  ${suc.slug.padEnd(16)} sin respaldos, se omite`); continue }
    const fbk = await obtenerArchivo(respaldo, trabajo, ORIGEN)

    await run(GBAK, ['-c', '-user', FB_USER, '-password', FB_PASS, fbk, `${FB_PREFIJO}${fdb}`])
    const sqlFile = path.join(trabajo, 'q.sql')
    const outFile = path.join(trabajo, 'o.txt')
    fs.writeFileSync(sqlFile, SQL)
    await run(ISQL, ['-user', FB_USER, '-password', FB_PASS, '-i', sqlFile, '-o', outFile, `${FB_PREFIJO}${fdb}`])

    let n = 0, omitidos = 0
    for (const linea of fs.readFileSync(outFile, 'latin1').split(/\r?\n/)) {
      if (!linea.includes(SEP)) continue
      const [inicio, fin, persona, ventas] = linea.split(SEP).map(x => x.trim())
      if (FUERA.has(persona.toLowerCase())) { omitidos++; continue }
      const fecha = inicio.slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue
      todos.push({
        slug: suc.slug, sucursal: suc.nombre, persona,
        fecha,
        inicio: inicio.replace(' ', 'T').slice(0, 19),
        fin: fin ? fin.replace(' ', 'T').slice(0, 19) : null,
        ventas: Number(ventas) || 0,
      })
      n++
    }
    const personas = new Set(todos.filter(t => t.slug === suc.slug).map(t => t.persona))
    console.log(`  ${suc.slug.padEnd(16)} ${String(n).padStart(5)} turnos, ${personas.size} personas${omitidos ? `  (${omitidos} del administrador fuera)` : ''}`)
  } catch (e) {
    console.error(`  ${suc.slug.padEnd(16)} ERROR: ${String(e.message).split('\n')[0]}`)
  } finally {
    fs.rmSync(trabajo, { recursive: true, force: true })
  }
}

todos.sort((a, b) => b.inicio.localeCompare(a.inicio))

const salida = {
  generado: new Date().toISOString(),
  desde: DESDE,
  totalTurnos: todos.length,
  turnos: todos,
}

// En `personal/`, que no es público. Son datos de empleados.
const clave = 'personal/turnos.json'

if (DRY_RUN) {
  fs.mkdirSync(path.join(ROOT, 'scripts', 'out'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'scripts', 'out', 'turnos.json'), JSON.stringify(salida, null, 2))
  console.log(`\nDry-run: ${todos.length} turnos en scripts/out/turnos.json`)
} else {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: clave,
    Body: Buffer.from(JSON.stringify(salida)),
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-cache',
  }))
  console.log(`\n${todos.length} turnos guardados en ${clave}`)
}

// ── Reporte semanal en Excel ────────────────────────────────────────────────
//
// Con --reporte se saca ademas un libro de la semana que ya cerro. Sirve para
// tener el dato hoy, sin esperar a que el backend este en pie: la pantalla de
// Personal no puede leer este archivo desde el navegador porque vive en un
// prefijo privado, y eso es a proposito.

if (process.argv.includes('--reporte')) {
  const XLSX = (await import('xlsx-js-style')).default
  const { resumirSemana, semanaPasada, formatoRango, soloHora, nombreDia, tieneHorario, horarioDe, TOLERANCIA_MIN } =
    await import('../src/lib/personal.js')

  const sem = semanaPasada()
  const r = resumirSemana(todos, sem)

  const libro = XLSX.utils.book_new()

  const resumen = [
    ['Semana', formatoRango(sem)],
    ['Del', sem.desde], ['Al', sem.hasta],
    ['Personas', r.personas], ['Turnos', r.totalTurnos], ['Retardos', r.totalRetardos],
    ['Entrada', horarioDe('leon').abre], ['Tolerancia (min)', TOLERANCIA_MIN],
    ['Nota', 'Mide la hora de apertura de caja, no la llegada de la persona'],
  ]
  const h1 = XLSX.utils.aoa_to_sheet([['Dato', 'Valor'], ...resumen])
  h1['!cols'] = [{ wch: 20 }, { wch: 56 }]
  XLSX.utils.book_append_sheet(libro, h1, 'Resumen')

  const porPersona = r.filas.map(f => [
    f.persona, f.sucursal, f.diasTrabajados,
    tieneHorario(f.slug) ? f.retardos : '',
    tieneHorario(f.slug) && f.promedioMin !== null ? Number(f.promedioMin.toFixed(1)) : '',
    f.ventas,
    tieneHorario(f.slug) ? '' : 'sin horario fijo',
  ])
  const h2 = XLSX.utils.aoa_to_sheet([
    ['Persona', 'Sucursal', 'Días', 'Retardos', 'Promedio (min)', 'Ventas', 'Nota'], ...porPersona,
  ])
  h2['!cols'] = [{ wch: 34 }, { wch: 18 }, { wch: 7 }, { wch: 10 }, { wch: 15 }, { wch: 9 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(libro, h2, 'Por persona')

  const detalle = []
  for (const f of r.filas) {
    for (const d of f.dias) {
      detalle.push([
        d.fecha, nombreDia(d.fecha), f.persona, f.sucursal,
        soloHora(d.inicio), d.fin ? soloHora(d.fin) : '',
        tieneHorario(f.slug) && d.tarde !== null ? d.tarde : '',
        tieneHorario(f.slug) ? (d.esRetardo ? 'RETARDO' : 'a tiempo') : 'sin horario',
        d.ventas,
      ])
    }
  }
  detalle.sort((a, b) => a[0].localeCompare(b[0]) || a[2].localeCompare(b[2]))
  const h3 = XLSX.utils.aoa_to_sheet([
    ['Fecha', 'Día', 'Persona', 'Sucursal', 'Abrió', 'Cerró', 'Minutos tarde', 'Estado', 'Ventas'], ...detalle,
  ])
  h3['!cols'] = [{ wch: 12 }, { wch: 11 }, { wch: 34 }, { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 11 }, { wch: 8 }]
  h3['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: detalle.length, c: 8 } }) }
  XLSX.utils.book_append_sheet(libro, h3, 'Día por día')

  const destino = path.join(ROOT, 'scripts', 'out', `personal-${sem.desde}-al-${sem.hasta}.xlsx`)
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  XLSX.writeFile(libro, destino)
  console.log(`\nReporte de la semana ${formatoRango(sem)}:`)
  console.log(`  ${path.relative(ROOT, destino)}`)
  console.log(`  ${r.personas} personas, ${r.totalTurnos} turnos, ${r.totalRetardos} retardos`)
}
