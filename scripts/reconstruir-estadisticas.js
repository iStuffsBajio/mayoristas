// Reconstruye las estadísticas a partir de las copias históricas que ya están
// en S3, para no empezar el panel en blanco.
//
// Uso:  node scripts/reconstruir-estadisticas.js [--dry-run]
//
// Las copias viejas no traen el código de producto, porque se agregó después.
// Para esas se empareja por nombre, y al final los nombres se traducen al
// código usando el inventario actual. Un producto renombrado en esos días se
// pierde, pero es preferible a arrancar sin historial.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { salidasEntre, agregarDia, estadisticaVacia, acumularEnPeriodo, historialVacio, periodosDisponibles } from './lib/estadisticas.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
try { process.loadEnvFile(path.join(__dirname, '..', '.env')) } catch { /* en CI viene del entorno */ }

const BUCKET = process.env.VITE_S3_BUCKET || process.env.S3_BUCKET
const REGION = process.env.VITE_S3_REGION || process.env.S3_REGION || 'us-east-1'
const DRY_RUN = process.argv.includes('--dry-run')

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId:     process.env.VITE_S3_ACCESS_KEY || process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.VITE_S3_SECRET_KEY || process.env.S3_SECRET_KEY || '',
  },
})

const SUCURSALES = [
  { slug: 'leon',           nombre: 'León' },
  { slug: 'aguascalientes', nombre: 'Aguascalientes' },
  { slug: 'san-luis',       nombre: 'San Luis Potosí' },
]

async function leer(key) {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
    return JSON.parse(await r.Body.transformToString())
  } catch {
    return null
  }
}

/** Busca las copias históricas de los últimos 60 días. */
async function copiasDe(slug) {
  const copias = []
  const hoy = new Date()
  for (let i = 60; i >= 0; i--) {
    const d = new Date(hoy)
    d.setDate(d.getDate() - i)
    const iso = d.toISOString().slice(0, 10)
    const j = await leer(`inventarios/${slug}/historico/${iso}.json`)
    if (j?.productos?.length) copias.push(j)
  }
  const actual = await leer(`inventarios/${slug}/inventario.json`)
  if (actual?.productos?.length) copias.push(actual)
  return copias
}

async function reconstruir(suc) {
  const copias = await copiasDe(suc.slug)
  if (copias.length < 2) {
    console.log(`  ${suc.slug.padEnd(16)} solo ${copias.length} copia(s), no hay con qué comparar`)
    return
  }

  // Una sola foto por fecha de respaldo: si dos copias son del mismo respaldo,
  // no hubo movimiento entre ellas y compararlas metería ceros.
  const porFecha = new Map()
  for (const c of copias) {
    const f = c?.respaldo?.fecha
    if (f) porFecha.set(f, c)
  }
  const fechas = [...porFecha.keys()].sort()

  let estad = estadisticaVacia(suc.slug, suc.nombre)
  let hist  = historialVacio(suc.slug, suc.nombre)
  let dias = 0, piezas = 0

  for (let i = 1; i < fechas.length; i++) {
    const antes = porFecha.get(fechas[i - 1])
    const ahora = porFecha.get(fechas[i])
    const { salidas, catalogo } = salidasEntre(antes, ahora)
    if (Object.keys(salidas).length === 0) continue
    estad = agregarDia(estad, fechas[i], salidas, catalogo)
    hist  = acumularEnPeriodo(hist, fechas[i], salidas, catalogo)
    dias++
    piezas += Object.values(salidas).reduce((s, n) => s + n, 0)
  }

  // Los días viejos quedaron indexados por nombre. Se traducen al código con
  // el inventario actual para que el panel muestre el código real.
  const actual = copias[copias.length - 1]
  const nombreACodigo = new Map()
  for (const p of actual.productos ?? []) {
    const cod = String(p.Codigo ?? '').trim()
    if (cod) nombreACodigo.set(`nombre:${String(p.Producto).trim().toUpperCase()}`, cod)
  }

  let traducidos = 0
  estad.dias = estad.dias.map(d => {
    const m = {}
    for (const [k, n] of Object.entries(d.m)) {
      const real = nombreACodigo.get(k)
      if (real) { m[real] = (m[real] || 0) + n; traducidos++ } else { m[k] = (m[k] || 0) + n }
    }
    return { ...d, m }
  })
  const cat = {}
  for (const [k, v] of Object.entries(estad.catalogo)) cat[nombreACodigo.get(k) || k] = v
  estad.catalogo = cat

  // La misma traducción para el historial permanente.
  hist.periodos = hist.periodos.map(p => {
    const m = {}
    for (const [k, n] of Object.entries(p.m)) {
      const real = nombreACodigo.get(k)
      if (real) m[real] = (m[real] || 0) + n
      else m[k] = (m[k] || 0) + n
    }
    return { ...p, m }
  })
  const catH = {}
  for (const [k, v] of Object.entries(hist.catalogo)) catH[nombreACodigo.get(k) || k] = v
  hist.catalogo = catH

  const meses = periodosDisponibles(hist).map(p => `${p.periodo} (${p.total} pz)`).join(', ')
  console.log(`  ${suc.slug.padEnd(16)} ${dias} días con movimiento, ${piezas} piezas, ${traducidos} claves a código`)
  console.log(`  ${''.padEnd(16)} periodos permanentes: ${meses || 'ninguno'}`)

  if (!DRY_RUN) {
    const guardar = (key, obj) => s3.send(new PutObjectCommand({
      Bucket:       BUCKET,
      Key:          key,
      Body:         Buffer.from(JSON.stringify(obj)),
      ContentType:  'application/json; charset=utf-8',
      CacheControl: 'no-cache',
    }))
    await guardar(`inventarios/${suc.slug}/estadisticas.json`, estad)
    await guardar(`inventarios/${suc.slug}/historial.json`, hist)
  }
}

console.log(DRY_RUN ? 'Reconstrucción (dry-run, no se guarda)\n' : 'Reconstrucción de estadísticas\n')
for (const s of SUCURSALES) await reconstruir(s)
console.log(DRY_RUN ? '\nNada se guardó.' : '\nGuardado en inventarios/<sucursal>/estadisticas.json')
