// Saca el flujo de efectivo de cada plaza del respaldo de Eleventa.
//
//   node scripts/extraer-caja.mjs [--sucursal=leon] [--dry-run] [--desde=2025-01]
//
// ── De dónde sale, y por qué de ahí ────────────────────────────────────────
//
// `CORTE_OPERACIONES` guarda una fila por día y caja con las formas de pago YA
// separadas, y ya reparte los pagos mixtos. Comprobado contra los tickets de
// octubre de León, al peso:
//
//     efectivo  88,428.61 = 88,028.61 de tickets «e» + 400 del mixto
//     tarjeta    9,690.09 =  9,590.09 de tickets «t» + 100 del mismo mixto
//
// `PAGOS_MIXTOS` NO se lee, aunque el nombre invite: en León dice 352 líneas y
// $178,376 de tarjeta cuando los tickets y el corte coinciden en $132,551 de
// tarjeta EN TOTAL. Es basura heredada, igual que los precios de bodega.
//
// `ACUMULADO_ENTRADAS` y `ACUMULADO_SALIDAS` tampoco: no cuadran con
// `CORTE_MOVIMIENTOS`. El faltante de $1,960.02 del 2026-09-14 en
// Aguascalientes está en `CORTE_MOVIMIENTOS` y `ACUMULADO_SALIDAS` de ese día
// sale en cero. Se usa el detalle, que además trae el CONCEPTO, que es lo que
// hay que enseñar.
//
// ── Los faltantes van aparte de las salidas ────────────────────────────────
//
// Eleventa escribe sola una línea «Efectivo faltante al cerrar turno de
// ‹nombre› del ‹fecha›» cuando lo contado no cuadra. **No es un retiro.**
// Metiéndolos en la misma bolsa, el neto bajaría otro tanto y la caja
// cuadraría justo en el caso que esto existe para detectar.
//
// ── Dónde se guarda ───────────────────────────────────────────────────────
//
// En `caja/`, que NO es de lectura pública. Lleva nombres de empleados pegados
// a faltantes de dinero: eso no puede quedar accesible por URL. Lo sirve el
// backend, igual que `personal/` y `revisiones/`.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { ultimoRespaldo, obtenerArchivo, origenPorDefecto } from './lib/respaldos.js'

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

const run = (c, a, o = {}) => promisify(execFile)(c, a, { maxBuffer: 128 * 1024 * 1024, windowsHide: true, ...o })

// Las cinco plazas que manejan efectivo. Bodega no vende y queda fuera; su
// caja, si alguna vez la lleva, es otra cosa y se decidiría aparte.
const SUCURSALES = [
  { slug: 'leon',           nombre: 'León',            carpeta: 'leon' },
  { slug: 'san-luis',       nombre: 'San Luis Potosí', carpeta: 'SLP' },
  { slug: 'aguascalientes', nombre: 'Aguascalientes',  carpeta: 'ags' },
  { slug: 'torreon',        nombre: 'Torreón',         carpeta: 'TORREON' },
  { slug: 'ferias',         nombre: 'Ferias',          carpeta: 'ferias' },
]

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1]
const DRY_RUN = process.argv.includes('--dry-run')
const SOLO   = arg('sucursal')
const DESDE  = arg('desde') || '2019-01'
const ORIGEN = arg('origen') || origenPorDefecto()

const SEP = '~|~'

/**
 * El flujo diario. Una fila por día.
 *
 * `EXTRACT` de Firebird 2.0 rellena con espacios, así que el año y el mes
 * salen por separado y se juntan en JavaScript: concatenarlos aquí daba
 * «2024- 10» en los meses de dos cifras, lo que además rompía el orden.
 */
const SQL_DIAS = `
SET HEADING OFF;
SELECT EXTRACT(YEAR FROM co.DIA) || '${SEP}' || EXTRACT(MONTH FROM co.DIA) || '${SEP}' ||
       EXTRACT(DAY FROM co.DIA) || '${SEP}' ||
       CAST(COALESCE(co.VENTAS_EFECTIVO,0) AS NUMERIC(14,2)) || '${SEP}' ||
       CAST(COALESCE(co.VENTAS_TARJETA,0) AS NUMERIC(14,2)) || '${SEP}' ||
       CAST(COALESCE(co.VENTAS_TRANSFERENCIA,0) AS NUMERIC(14,2)) || '${SEP}' ||
       CAST(COALESCE(co.VENTAS_VALES,0) AS NUMERIC(14,2)) || '${SEP}' ||
       CAST(COALESCE(co.VENTAS_CREDITO,0) AS NUMERIC(14,2)) || '${SEP}' ||
       CAST(COALESCE(co.VENTAS_CHEQUE,0) AS NUMERIC(14,2)) || '${SEP}' ||
       CAST(COALESCE(co.DEVOLUCIONES_VENTAS_EFECTIVO,0) AS NUMERIC(14,2)) || '${SEP}' ||
       COALESCE(co.NUMERO_VENTAS,0)
FROM CORTE_OPERACIONES co
ORDER BY co.DIA;
`

/**
 * Las entradas y salidas de caja, con su concepto.
 *
 * `TIPO` es texto —`Entrada`, `Salida`, `Devolucion`—. Las devoluciones NO se
 * traen: ya vienen en `DEVOLUCIONES_VENTAS_EFECTIVO` del corte y sumar las dos
 * fuentes las restaría dos veces. Es el mismo suceso en dos tablas.
 */
const SQL_MOVS = `
SET HEADING OFF;
SELECT EXTRACT(YEAR FROM cm.CUANDO_FUE) || '${SEP}' || EXTRACT(MONTH FROM cm.CUANDO_FUE) || '${SEP}' ||
       EXTRACT(DAY FROM cm.CUANDO_FUE) || '${SEP}' || TRIM(cm.TIPO) || '${SEP}' ||
       CAST(cm.MONTO AS NUMERIC(14,2)) || '${SEP}' ||
       TRIM(COALESCE(SUBSTRING(cm.DESCRIPCION FROM 1 FOR 120), ''))
FROM CORTE_MOVIMIENTOS cm
WHERE cm.TIPO <> 'Devolucion' AND cm.BORRADO_EL IS NULL
ORDER BY cm.CUANDO_FUE;
`

/**
 * El arqueo: lo que se contó al cerrar cada turno.
 *
 * `EFECTIVO_AL_CIERRE` está lleno —2,057 de 2,195 turnos en Aguascalientes— y
 * cumple `cierre = ventas en efectivo − devoluciones en efectivo`, comprobado
 * en dos días. `DINERO_INICIAL` NO se trae: sale en cero en 2,195 de 2,195
 * turnos de Ags y 349 de 349 de León. El fondo fijo es un parámetro del dueño,
 * no un dato de aquí.
 *
 * Si un día tuvo dos turnos se suman: el arqueo del día es lo contado en él.
 */
const SQL_ARQUEOS = `
SET HEADING OFF;
SELECT EXTRACT(YEAR FROM t.INICIO_EN) || '${SEP}' || EXTRACT(MONTH FROM t.INICIO_EN) || '${SEP}' ||
       EXTRACT(DAY FROM t.INICIO_EN) || '${SEP}' ||
       CAST(COALESCE(t.EFECTIVO_AL_CIERRE,0) AS NUMERIC(14,2)) || '${SEP}' ||
       TRIM(COALESCE(u.NOMBRE_COMPLETO,''))
FROM TURNOS t
LEFT JOIN USUARIOS u ON u.ID = t.ID_CAJERO
WHERE t.TERMINO_EN IS NOT NULL
ORDER BY t.INICIO_EN;
`

/**
 * Reconoce un faltante o sobrante que escribió Eleventa sola.
 *
 * El patrón acepta las dos formas que vi en los respaldos —«Efectivo faltante
 * al cerrar turno de…» y «Efectivo sobrante al cerrar turno de…»— y es
 * tolerante con acentos y mayúsculas, igual que el patrón de las micas acepta
 * HIDRIOGEL y HODROGEL: exigir que alguien corrija lo que escribe el punto de
 * venta no es un plan.
 */
const RE_DESCUADRE = /efectivo\s+(faltante|sobrante)\s+al\s+cerrar\s+turno\s+de\s+(.+?)(?:\s+del\s+(\d{1,2}\/\d{1,2}).*)?$/i

/**
 * Una salida que una PERSONA registró porque de verdad faltó dinero.
 *
 * Es la única clase de faltante que la pantalla enseña desde el 2026-11-06.
 * Se separa de `otra-salida` por una razón de cálculo, no de presentación: un
 * faltante no resta del efectivo neto —ver `NO_RESTAN` en `caja.js`—, y
 * dejándolo caer en `otra-salida` restaría, el depósito cuadraría al peso y
 * el dinero que falta se volvería invisible.
 *
 * Sólo se mira en las salidas. Un `sobrante` apuntado como ENTRADA es dinero
 * que apareció, y ése sí entra a la caja como cualquier otra entrada.
 */
const RE_FALTANTE = /\bfaltante|\bsobrante|\bdescuadre/i

/** Lo que teclea una persona se queda como concepto; lo que escribe Eleventa, no. */
function clasificar(tipo, descripcion) {
  const d = String(descripcion || '').trim()
  const m = RE_DESCUADRE.exec(d)
  if (m) {
    return {
      clase: 'descuadre',
      sentido: m[1].toLowerCase() === 'faltante' ? 'faltante' : 'sobrante',
      persona: m[2].trim(),
    }
  }
  // Un movimiento tecleado por una persona. El concepto es lo que escribió.
  // El tipo fino —gasto, retiro, adelanto, proveedor— no lo distingue
  // Eleventa: sólo sabe Entrada o Salida. Entra como `otra-salida` y se
  // reclasifica en la página, que es donde alguien lo puede mirar.
  const esEntrada = String(tipo).toLowerCase() === 'entrada'
  return {
    clase: 'movimiento',
    tipo: esEntrada ? 'entrada' : RE_FALTANTE.test(d) ? 'faltante' : 'otra-salida',
    concepto: d,
  }
}

const fecha = (a, m, d) =>
  `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

async function isql(fdb, sql, dir, nombre) {
  const sqlFile = path.join(dir, `${nombre}.sql`)
  const outFile = path.join(dir, `${nombre}.txt`)
  fs.writeFileSync(sqlFile, sql)
  fs.rmSync(outFile, { force: true })
  await run(ISQL, ['-user', FB_USER, '-password', FB_PASS, '-i', sqlFile, '-o', outFile, `${FB_PREFIJO}${fdb}`])
  // Charset NONE: los bytes llegan tal cual y se decodifican como latin1.
  return fs.readFileSync(outFile, 'latin1').split(/\r?\n/).filter(l => l.includes(SEP))
}

const n = v => Number(v) || 0

/** Omite del JSON los campos en cero: en un flujo diario, ausente es cero. */
function sinCeros(obj) {
  const r = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === 0 || v === null || v === undefined || v === '') continue
    r[k] = v
  }
  return r
}

async function unaPlaza(suc, workDir) {
  console.log(`\n${suc.nombre}`)
  const respaldo = await ultimoRespaldo(suc.carpeta, ORIGEN)
  console.log(`  respaldo ${respaldo.nombre} del ${respaldo.fecha}`)

  const fbk = await obtenerArchivo(respaldo, workDir, ORIGEN)
  const fdb = path.join(workDir, `${suc.slug}.fdb`)
  await run(GBAK, ['-c', '-user', FB_USER, '-password', FB_PASS, fbk, `${FB_PREFIJO}${fdb}`])

  // ── Los días ──
  const dias = []
  for (const linea of await isql(fdb, SQL_DIAS, workDir, `d-${suc.slug}`)) {
    const [a, m, d, efectivo, tarjeta, transferencia, vales, credito, cheque, devEfectivo, nVentas] =
      linea.split(SEP).map(s => s.trim())
    const f = fecha(a, m, d)
    if (f.slice(0, 7) < DESDE) continue
    dias.push(sinCeros({
      f,
      efectivo: n(efectivo), tarjeta: n(tarjeta), transferencia: n(transferencia),
      vales: n(vales), credito: n(credito), cheque: n(cheque),
      devEfectivo: n(devEfectivo), nVentas: n(nVentas),
    }))
  }

  // ── Los movimientos y los descuadres ──
  const movimientos = []
  const faltantes = []
  for (const linea of await isql(fdb, SQL_MOVS, workDir, `m-${suc.slug}`)) {
    const [a, m, d, tipo, monto, descripcion] = linea.split(SEP).map(s => s.trim())
    const f = fecha(a, m, d)
    if (f.slice(0, 7) < DESDE) continue
    const c = clasificar(tipo, descripcion)
    if (c.clase === 'descuadre') {
      faltantes.push({
        f, monto: c.sentido === 'faltante' ? n(monto) : -n(monto),
        persona: c.persona, sentido: c.sentido,
      })
    } else {
      movimientos.push({ f, tipo: c.tipo, monto: n(monto), concepto: c.concepto, origen: 'eleventa' })
    }
  }

  // ── El arqueo ──
  const arqueoPorDia = new Map()
  const cajeroPorDia = new Map()
  for (const linea of await isql(fdb, SQL_ARQUEOS, workDir, `t-${suc.slug}`)) {
    const [a, m, d, cierre, cajero] = linea.split(SEP).map(s => s.trim())
    const f = fecha(a, m, d)
    if (f.slice(0, 7) < DESDE) continue
    arqueoPorDia.set(f, (arqueoPorDia.get(f) || 0) + n(cierre))
    if (cajero && !cajeroPorDia.has(f)) cajeroPorDia.set(f, cajero)
  }
  for (const dia of dias) {
    if (arqueoPorDia.has(dia.f)) dia.arqueo = Math.round(arqueoPorDia.get(dia.f) * 100) / 100
    if (cajeroPorDia.has(dia.f)) dia.cajero = cajeroPorDia.get(dia.f)
  }

  const efectivo = dias.reduce((s, d) => s + n(d.efectivo), 0)
  const faltanteTotal = faltantes.reduce((s, x) => s + x.monto, 0)
  console.log(`  ${dias.length} días · efectivo ${efectivo.toFixed(2)}`)
  console.log(`  ${movimientos.length} movimientos capturados por el personal`)
  console.log(`  ${faltantes.length} descuadres al cerrar turno · ${faltanteTotal.toFixed(2)}`)
  if (!movimientos.length) {
    console.log('  AVISO: ninguna entrada ni salida registrada. El esperado de estas')
    console.log('         semanas es un TECHO, no una cifra, y la página lo dice.')
  }

  return {
    sucursal: suc.slug,
    nombre:   suc.nombre,
    generado: new Date().toISOString(),
    respaldo: { archivo: respaldo.nombre, fecha: respaldo.fecha },
    dias, movimientos, faltantes,
  }
}

// ── Ejecución ───────────────────────────────────────────────────────────────

const plazas = SUCURSALES.filter(s => !SOLO || s.slug === SOLO)
if (!plazas.length) {
  console.error(`Sucursal desconocida: ${SOLO}`)
  console.error('Opciones: ' + SUCURSALES.map(s => s.slug).join(', '))
  process.exit(1)
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caja-'))
if (!esWindows) { try { fs.chmodSync(workDir, 0o777) } catch { /* lo dirá gbak */ } }

let fallos = 0
try {
  for (const suc of plazas) {
    let datos
    try {
      datos = await unaPlaza(suc, workDir)
    } catch (e) {
      // Una plaza que falla no tumba a las demás: es el mismo criterio que la
      // sincronización de inventarios, donde una tienda sin respaldo nuevo no
      // debe impedir publicar las otras.
      console.error(`  FALLÓ ${suc.nombre}: ${e.message}`)
      fallos++
      continue
    }

    if (DRY_RUN) {
      const salida = path.join(ROOT, 'scripts', 'out', `${suc.slug}-caja.json`)
      fs.writeFileSync(salida, JSON.stringify(datos, null, 2))
      console.log(`  dry-run: ${path.relative(ROOT, salida)}`)
      continue
    }

    await s3.send(new PutObjectCommand({
      Bucket:       BUCKET,
      Key:          `caja/${suc.slug}.json`,
      Body:         Buffer.from(JSON.stringify(datos)),
      ContentType:  'application/json; charset=utf-8',
      CacheControl: 'no-cache',
    }))
    console.log(`  guardado en caja/${suc.slug}.json`)
  }
} finally {
  fs.rmSync(workDir, { recursive: true, force: true })
}

if (fallos) {
  console.error(`\n${fallos} de ${plazas.length} plazas no se pudieron extraer.`)
  process.exit(1)
}
console.log('\nlisto.')
