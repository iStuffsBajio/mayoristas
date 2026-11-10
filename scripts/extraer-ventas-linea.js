// Saca la venta LÍNEA POR LÍNEA de un respaldo de Eleventa.
//
//   node scripts/extraer-ventas-linea.js --sucursal=leon [--dry-run]
//
// Lo que ya teníamos era el agregado por mes de `INVENTARIO_HISTORIAL`:
// piezas por modelo. Esto saca lo que ese agregado no puede dar —el día y la
// hora, qué precio se cobró, la ganancia que calculó la caja, quién cobró y a
// qué mayorista se le apuntó— y publica sólo AGREGADOS: el detalle crudo son
// miles de renglones y lleva nombres de personas.
//
// Las reglas y las trampas viven en `src/lib/ventasTicket.js`, con pruebas.
// Aquí sólo está la consulta y la subida.
//
// ── Va a un prefijo PRIVADO ────────────────────────────────────────────────
//
// `ventas/` NO lo abre la política del bucket, igual que `personal/` y
// `revisiones/`: lleva los nombres de los mayoristas y de quién cobró cada
// ticket. Lo sirve el backend contra sesión, nunca el navegador directo.
//
// ── Firebird 2.0, que muerde ───────────────────────────────────────────────
//
//   · Los booleanos son `'t'`/`'f'`. Comparar contra 1 no da cero filas:
//     revienta la consulta con «conversion error from string "t"».
//   · Charset NONE: los bytes se decodifican como latin1.
//   · `EXTRACT` rellena con espacios, así que las fechas se piden enteras y
//     se parten en JavaScript.
//   · En Linux el prefijo `localhost:`; `gbak` necesita 64 MB de búfer.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { agregarVentas } from '../src/lib/ventasTicket.js'
import { reemplazosDeCancelados, resumirReemplazos } from '../src/lib/reemplazos.js'
import { diasEnCero, DIAS_AGOTADOS } from '../src/lib/agotados.js'
// La resolucion del respaldo se comparte con los otros extractores: del disco
// en tu maquina y de Dropbox en la nube, que no tiene la A: montada.
// Duplicarla era garantizar que el paso de la nube buscara donde no hay nada.
import { ultimoRespaldo, obtenerArchivo, origenPorDefecto } from './lib/respaldos.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
try { process.loadEnvFile(path.join(ROOT, '.env')) } catch { /* en CI viene del entorno */ }

const BUCKET = process.env.VITE_S3_BUCKET || process.env.S3_BUCKET
const REGION = process.env.VITE_S3_REGION || process.env.S3_REGION || 'us-east-1'
const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId:     process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
})

const esWindows = process.platform === 'win32'
const ELEVENTA = process.env.ELEVENTA_DIR || 'C:\\Program Files (x86)\\AbarrotesPDV'
const GBAK = process.env.GBAK || (esWindows ? path.join(ELEVENTA, 'gbak.exe') : 'gbak')
const ISQL = process.env.ISQL || (esWindows ? path.join(ELEVENTA, 'isql.exe') : 'isql-fb')
const FB_USER = process.env.FIREBIRD_USER || 'SYSDBA'
const FB_PASS = process.env.FIREBIRD_PASS || 'masterkey'
const FB_PREFIJO = process.env.FB_PREFIJO || ''

const run = (c, a, o = {}) =>
  promisify(execFile)(c, a, { maxBuffer: 64 * 1024 * 1024, windowsHide: true, ...o })

// Las carpetas son las mismas que usan los otros extractores, y se resuelven
// con `lib/respaldos.js`. Morelia no existe para esta pagina: se ignora.
const SUCURSALES = {
  'leon':           { nombre: 'León',            carpeta: 'leon' },
  'san-luis':       { nombre: 'San Luis Potosí', carpeta: 'SLP' },
  'aguascalientes': { nombre: 'Aguascalientes',  carpeta: 'ags' },
  'bodega':         { nombre: 'Bodega',          carpeta: 'BODEGA' },
  'ferias':         { nombre: 'Ferias',          carpeta: 'ferias' },
  // Vende y lleva caja desde junio de 2025; ver `sincronizar-inventarios.js`.
  'torreon':        { nombre: 'Torreón',         carpeta: 'TORREON' },
}

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1]
const DRY_RUN = process.argv.includes('--dry-run')
const SLUG = arg('sucursal')
// De donde salen los respaldos: del disco en tu maquina, de Dropbox en la
// corrida de GitHub, que no tiene la A: montada.
const ORIGEN = arg('origen') || origenPorDefecto()

/**
 * 🔒 Dias de la ventana reciente.
 *
 * El acumulado de todo el historial NO sirve para hablar de precios: el de
 * cada plaza arranca un año distinto -Aguascalientes 2019, San Luis 2020,
 * Leon 2025- y los precios han subido un 40% en cinco años. El 92% de las
 * piezas de San Luis son de antes de 2026, asi que su «precio medio» de todo
 * el historial es el de hace tres años.
 *
 * 365 dias: un año entero, para que la temporada no lo sesgue -una ventana de
 * tres meses tomada en octubre diria que el negocio vale un 30% menos de lo
 * que vale- y a la vez reciente, para que el precio sea el de ahora.
 */
const DIAS_VENTANA = Number(arg('dias')) || 365

const SEP = '~|~'

/**
 * Los tickets. Uno por venta.
 *
 * El cajero se resuelve a nombre aquí porque `CAJERO_ID` no dice nada en una
 * pantalla, y la tabla `USUARIOS` sólo está en el respaldo.
 */
const SQL_TICKETS = `
SET HEADING OFF;
SELECT t.ID || '${SEP}' || COALESCE(t.FOLIO, '') || '${SEP}' || t.VENDIDO_EN
       || '${SEP}' || t.ESTA_CANCELADO
       || '${SEP}' || COALESCE(u.NOMBRE_COMPLETO, u.USUARIO, '')
       || '${SEP}' || COALESCE(t.FORMA_PAGO, '')
       || '${SEP}' || COALESCE(t.TOTAL_CREDITO, 0)
FROM VENTATICKETS t
LEFT JOIN USUARIOS u ON u.ID = t.CAJERO_ID
WHERE t.VENDIDO_EN IS NOT NULL;
`

/**
 * Las líneas. Una por producto de cada ticket.
 *
 * El departamento viene del producto y no de `DEPARTAMENTO_ID` de la línea: es
 * lo que distingue una funda de un sticker y de un mayorista apuntado como
 * producto, y esa clasificación es la que decide si la pieza cuenta.
 */
const SQL_LINEAS = `
SET HEADING OFF;
SELECT a.TICKET_ID || '${SEP}' || COALESCE(a.PRODUCTO_CODIGO, '')
       || '${SEP}' || COALESCE(a.PRODUCTO_NOMBRE, '')
       || '${SEP}' || COALESCE(d.NOMBRE, '')
       || '${SEP}' || COALESCE(a.CANTIDAD, 0)
       || '${SEP}' || COALESCE(a.TOTAL_ARTICULO, 0)
       || '${SEP}' || COALESCE(a.GANANCIA, 0)
       || '${SEP}' || COALESCE(a.USA_MAYOREO, 'f')
       || '${SEP}' || COALESCE(a.PORCENTAJE_DESCUENTO, 0)
FROM VENTATICKETS_ARTICULOS a
LEFT JOIN PRODUCTOS p ON p.CODIGO = a.PRODUCTO_CODIGO
LEFT JOIN DEPARTAMENTOS d ON d.ID = p.DEPT;
`

/**
 * La existencia ANTES de cada movimiento, para saber cuándo estuvo en cero.
 *
 * Lo pidió el dueño el 2026-11-09: «quiero saber si eso se debe a que estaba
 * agotado o si realmente es un número confiable». Ver `agotados.js`.
 *
 * Columnas comprobadas con el explorador de esquema el mismo día: `CUANDO_FUE`
 * es TIMESTAMP y `CANTIDAD_ANTERIOR` es FLOAT. No hay «existencia después»,
 * y no hace falta: la existencia entre dos movimientos es la anterior del
 * siguiente.
 *
 * `CANTIDAD_ANTERIOR` se castea porque un FLOAT concatenado sale en notación
 * científica. Y los EXTRACT se juntan con separador porque rellenan con
 * espacios —los meses de octubre en adelante ya salieron una vez como
 * «2024- 10»—.
 */
const sqlKardex = desde => `
SET HEADING OFF;
SELECT TRIM(p.CODIGO) || '${SEP}' ||
       EXTRACT(YEAR FROM h.CUANDO_FUE) || '${SEP}' || EXTRACT(MONTH FROM h.CUANDO_FUE) || '${SEP}' ||
       EXTRACT(DAY FROM h.CUANDO_FUE) || '${SEP}' || EXTRACT(HOUR FROM h.CUANDO_FUE) || '${SEP}' ||
       EXTRACT(MINUTE FROM h.CUANDO_FUE) || '${SEP}' ||
       CAST(h.CANTIDAD_ANTERIOR AS NUMERIC(14,3))
FROM INVENTARIO_HISTORIAL h
JOIN PRODUCTOS p ON p.ID = h.PRODUCTO_ID
WHERE h.CUANDO_FUE >= CAST('${desde}' AS TIMESTAMP)
ORDER BY h.CUANDO_FUE;
`

const log = (...m) => console.log(new Date().toLocaleTimeString('es-MX', { hour12: false }), ...m)
const comoBase = f => `${FB_PREFIJO}${f}`

async function filasDe(fdb, workDir, sql, nombre) {
  const sqlFile = path.join(workDir, `${nombre}.sql`)
  const outFile = path.join(workDir, `${nombre}.txt`)
  fs.writeFileSync(sqlFile, sql)
  fs.rmSync(outFile, { force: true })
  await run(ISQL, ['-user', FB_USER, '-password', FB_PASS, '-i', sqlFile, '-o', outFile, comoBase(fdb)])
  // Charset NONE: los bytes llegan tal cual y se decodifican como latin1.
  const texto = fs.readFileSync(outFile, 'latin1')
  return texto.split(/\r?\n/)
    .filter(l => l.includes(SEP))
    .map(l => l.split(SEP).map(s => s.trim()))
}

async function procesar(slug) {
  const suc = SUCURSALES[slug]
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ventas-'))
  const fdb = path.join(workDir, `${slug}.fdb`)
  let respaldo
  try {
    respaldo = await ultimoRespaldo(suc.carpeta, ORIGEN)
    log(`[${slug}] respaldo del ${respaldo.fecha}`)
    const fbk = await obtenerArchivo(respaldo, workDir, ORIGEN)
    await run(GBAK, ['-c', '-user', FB_USER, '-password', FB_PASS, fbk, comoBase(fdb)])
    if (!fs.existsSync(fdb)) throw new Error('gbak no generó la base restaurada')

    const tickets = (await filasDe(fdb, workDir, SQL_TICKETS, 'tickets'))
      .map(([id, folio, cuando, cancelado, cajero, formaPago, credito]) =>
        ({ id, folio, cuando, cancelado, cajero, formaPago, credito: Number(credito) || 0 }))

    const lineas = (await filasDe(fdb, workDir, SQL_LINEAS, 'lineas'))
      .map(([ticket, codigo, producto, depto, cantidad, total, ganancia, mayoreo, descuento]) =>
        ({ ticket, codigo, producto, depto, cantidad, total, ganancia, mayoreo, descuento }))

    // ── Los días en cero, aparte y sin poder tumbar lo demás ──
    //
    // Si esto falla —una columna que no está, una plaza con el kárdex vacío—
    // la venta de esa plaza tiene que salir igual. Lo accesorio no puede tirar
    // lo principal: ya se decidió así con las devoluciones de la caja.
    let agotados = null
    try {
      const hasta = `${respaldo.fecha} 23:59`
      const d = new Date(`${respaldo.fecha}T00:00`)
      d.setDate(d.getDate() - DIAS_AGOTADOS)
      const desde = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

      const movimientos = (await filasDe(fdb, workDir, sqlKardex(desde), 'kardex'))
        .map(([codigo, a, m, dd, hh, mm, anterior]) => ({
          codigo,
          cuando: `${a}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')} `
            + `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
          anterior: Number(anterior) || 0,
        }))

      // La existencia de hoy y las altas, del inventario que acaba de publicar
      // la sincronización con este mismo respaldo: así las dos cuentas hablan
      // del mismo día.
      const resp = await fetch(
        `https://${BUCKET}.s3.${REGION}.amazonaws.com/inventarios/${slug}/inventario.json?t=${Date.now()}`)
      // Una plaza nueva —Torreón— todavía no tiene inventario publicado la
      // primera vez: sin este aviso, S3 contesta con un XML de error y lo que
      // salía en el registro era «Unexpected token '<'», que no dice nada.
      if (!resp.ok) throw new Error(`el inventario de ${slug} todavía no está publicado (HTTP ${resp.status})`)
      const inv = await resp.json()
      const existenciaHoy = {}, altas = {}
      for (const p of inv?.productos ?? []) {
        const c = String(p.Codigo ?? '').trim().toUpperCase()
        if (!c) continue
        existenciaHoy[c] = Number(p.Existencia) || 0
        if (p.Alta) altas[c] = String(p.Alta).slice(0, 10)
      }

      const porCodigo = diasEnCero({ movimientos, existenciaHoy, altas, desde, hasta })
      agotados = {
        plaza: slug,
        generado: new Date().toISOString(),
        respaldo: { fecha: respaldo.fecha },
        dias: DIAS_AGOTADOS, desde, hasta: respaldo.fecha,
        porCodigo,
      }
      const conCero = Object.values(porCodigo).filter(x => x.diasEnCero >= 1).length
      log(`[${slug}] kárdex: ${movimientos.length} movimientos · `
        + `${conCero} códigos estuvieron en cero algún día de los últimos ${DIAS_AGOTADOS}`)
    } catch (e) {
      log(`[${slug}] AVISO: no se pudieron medir los días en cero (${String(e.message).slice(0, 100)})`)
      log(`[${slug}]        la venta sale igual; lo que falta es saber si estuvo agotado`)
    }

    log(`[${slug}] ${tickets.length} tickets · ${lineas.length} lineas`)

    // Dos agregados a proposito, y cada uno sirve para una cosa:
    //
    //   · TODO el historial, para contar piezas y medir la temporada, donde
    //     lo viejo no estorba y hacen falta años para ver un diciembre.
    //   · La VENTANA, para cualquier cuenta de PRECIO. Mezclar las dos fue el
    //     error que dio una «diferencia» de 1.5 millones que era, casi toda,
    //     cinco años de subidas de precio.
    // El desglose por día y tipo de pieza, y lo que compra cada mayorista, para
    // el corte de cada sucursal. Sólo los últimos 120 días y sólo aquí: la
    // ventana de 365 días no lo lleva, o el archivo saldría duplicado.
    const agregado = agregarVentas({ tickets, lineas, detalleDias: 120 })
    const corte = new Date(Date.now() - DIAS_VENTANA * 86400000).toISOString().slice(0, 10)
    const reciente = agregarVentas({ tickets, lineas, desdeDia: corte })

    // ── Las cancelaciones y lo que se vendió justo después ──
    //
    // Lo propuso el dueño el 2026-11-08: «cancelo un iPhone 14 en 3 piezas y
    // después doy de alta un iPhone 14 en TPU… en realidad nadie dice que es
    // el reemplazo, pero si el modelo coincide sí es posible hacer una
    // especie de regla».
    //
    // Es una SOSPECHA y sale etiquetada como tal. No alimenta ninguna cifra:
    // las piezas y el dinero siguen saliendo de `agregarVentas`, que excluye
    // los cancelados. Si esto entrara en una cuenta, la cuenta pasaría a
    // apoyarse en una suposición sin que se notara.
    //
    // Sólo la ventana reciente: emparejar cancelaciones de hace cinco años no
    // le sirve a nadie y multiplicaría el tamaño del archivo.
    const lineasPorTicket = {}
    for (const l of lineas) {
      if (String(l.cantidad) === '0') continue
      ;(lineasPorTicket[l.ticket] ??= []).push({
        codigo: l.codigo, producto: l.producto,
        piezas: Number(l.cantidad) || 0, importe: Number(l.total) || 0,
      })
    }
    const recientes = tickets.filter(t => String(t.cuando ?? '').slice(0, 10) >= corte)
    const cancelaciones = reemplazosDeCancelados({
      tickets: recientes.map(t => ({
        id: t.id, folio: t.folio, cuando: t.cuando, cajero: t.cajero,
        // Eleventa guarda los booleanos como 't'/'f', nunca 1/0.
        cancelado: String(t.cancelado).trim().toLowerCase() === 't',
      })),
      lineasPorTicket,
    })
    const resumenCancel = resumirReemplazos(cancelaciones)
    log(`[${slug}] ${resumenCancel.cancelados} cancelaciones · `
      + `${resumenCancel.conReemplazoProbable} con reemplazo probable · `
      + `${resumenCancel.sinNadaDespues} sin nada después`)

    return {
      plaza: slug,
      nombre: suc.nombre,
      generado: new Date().toISOString(),
      respaldo: { fecha: respaldo.fecha },
      ...agregado,
      // Los días en cero van a su propio archivo PÚBLICO, no aquí: este es
      // privado y bodega no puede leerlo, y bodega es quien más lo necesita.
      agotados,
      // 🔒 Sospechas, nunca cifras. Ver `reemplazos.js`.
      cancelaciones: { dias: DIAS_VENTANA, resumen: resumenCancel, filas: cancelaciones.slice(0, 300) },
      // La ventana va aparte y completa: quien valore en pesos usa esta y
      // quien cuente piezas o mida temporada usa la de arriba.
      ventana: { dias: DIAS_VENTANA, ...reciente },
    }
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }) } catch { /* da igual */ }
  }
}

const slugs = SLUG ? [SLUG] : Object.keys(SUCURSALES)
for (const slug of slugs) {
  if (!SUCURSALES[slug]) { console.error(`Sucursal desconocida: ${slug}`); process.exit(1) }
}

for (const slug of slugs) {
  let datos
  try {
    datos = await procesar(slug)
  } catch (e) {
    log(`[${slug}] FALLO: ${e.message}`)
    continue
  }

  const r = datos.resumen
  const v = datos.ventana.resumen
  if (r.noSonPrecio) {
    log(`[${slug}] ${r.noSonPrecio} lineas cobradas con mas del 80% de descuento `
      + `(${r.piezasNoPrecio} pz): no son un precio y quedan fuera de los promedios`)
  }
  log(`[${slug}] ventana ${DIAS_VENTANA} d: ${v.piezas} pz · `
    + `$${Math.round(v.dinero).toLocaleString('es-MX')} · `
    + `precio medio $${v.piezas > 0 ? Math.round(v.dinero / v.piezas) : 0}`)
  log(`[${slug}] ${r.tickets} tickets vivos · ${r.cancelados} cancelados · ${r.piezas} pz · `
    + `$${Math.round(r.dinero).toLocaleString('es-MX')} · `
    + `mayoreo ${r.dinero > 0 ? Math.round(100 * r.dineroMayoreo / r.dinero) : 0}% del dinero · `
    + `${datos.mayoristas.length} mayoristas · ${datos.cajeros.length} cajeros`)

  // Los días en cero a `inventarios/`, que es PÚBLICO. No llevan ningún
  // nombre —sólo código y días— y bodega los necesita para no pedir de menos
  // un modelo que vendió poco porque no había. Se sacan del archivo de ventas
  // ANTES de nada: no tienen nada que hacer en un archivo privado.
  const { agotados } = datos
  delete datos.agotados

  if (DRY_RUN) {
    if (agotados) {
      const f = path.join(ROOT, 'scripts', 'out', `agotados-${slug}.json`)
      fs.mkdirSync(path.dirname(f), { recursive: true })
      fs.writeFileSync(f, JSON.stringify(agotados, null, 2))
      log(`[${slug}] --dry-run: escrito en ${f}`)
    }
    const fuera = path.join(ROOT, 'scripts', 'out', `ventas-${slug}.json`)
    fs.mkdirSync(path.dirname(fuera), { recursive: true })
    fs.writeFileSync(fuera, JSON.stringify(datos, null, 2))
    log(`[${slug}] --dry-run: escrito en ${fuera}`)
    continue
  }

  if (agotados) {
    try {
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: `inventarios/${slug}/agotados.json`,
        Body: Buffer.from(JSON.stringify(agotados)),
        ContentType: 'application/json; charset=utf-8',
        CacheControl: 'no-cache',
      }))
      log(`[${slug}] publicado en inventarios/${slug}/agotados.json`)
    } catch (e) {
      log(`[${slug}] AVISO: no se publicaron los días en cero (${String(e.message).slice(0, 100)})`)
    }
  }

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    // PRIVADO: lleva nombres de mayoristas y de quien cobro.
    Key: `ventas/${slug}.json`,
    Body: Buffer.from(JSON.stringify(datos)),
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-cache',
  }))
  log(`[${slug}] publicado en ventas/${slug}.json`)
}
