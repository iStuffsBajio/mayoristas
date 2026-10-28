// Trae a la web los mockups de verdad: las fotografías de las fundas propias.
//
//   node scripts/mockups/importar-mascaras.mjs
//   node scripts/mockups/importar-mascaras.mjs --probar     no escribe nada
//   node scripts/mockups/importar-mascaras.mjs --origen="A:/otra/ruta"
//
// ── Por qué existe, habiendo ya `generar-web.mjs` ───────────────────────────
//
// Aquél compone la funda a partir de los PSD de corte, que son planos de
// producción: de ahí salían siluetas de línea a las que había que dibujarles
// la cámara encima, dos salían en blanco y siete modelos no tenían archivo.
//
// Esta carpeta es otra cosa: fotografías del producto terminado, con su marco
// negro, su textura y la cámara real del teléfono. Donde hay una, gana. Los
// PSD se quedan SÓLO para lo que aquí no está.
//
// ── Tres cosas que se aprendieron haciéndolo ────────────────────────────────
//
// **La marca manda sobre el parecido.** El primer intento emparejaba por el
// nombre sin la marca para que «REDMI NOTE 13 PRO» casara con «XIAOMI REDMI
// NOTE 13 PRO», y con eso el IPHONE 13 se llevó la foto del **Redmi 13**, el
// IPHONE 11 la del **Xiaomi 11** y el IPHONE 12 la del **Realme 12+**. Un
// emparejado falso es peor que ninguno: la página enseña con total seguridad
// la funda que no es. Ahora, si los dos lados dicen de qué marca son y no
// coinciden, no hay emparejado, caiga quien caiga.
//
// **Una imagen por FOTOGRAFÍA, no por código.** Los colores y acabados del
// mismo teléfono son códigos distintos -hasta nueve- y comparten foto.
// Escribiendo un archivo por código, `public/` pasaba de 12 MB a cerca de
// 500. El índice dice qué archivo le toca a cada código, que no pesa nada.
//
// **WebP, no PNG.** La misma foto a 900px: 159 KB en PNG, 21 KB en WebP con
// calidad 80, y con transparencia igual. Son 336 fotos: la diferencia entre
// 7 MB y 53 MB en el repositorio y en cada despliegue.
//
// Las imágenes NO se sirven desde Dropbox: es carpeta compartida y ahí
// cualquiera renombra o mueve sin avisar. Se copian a `public/mockups/`, se
// publican con el sitio y quedan en el historial de git.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { clave } from './emparejar.mjs'

const args = process.argv.slice(2)
const ORIGEN = args.find(a => a.startsWith('--origen='))?.split('=')[1]
  || 'A:/Dropbox/MASCARAS 2026/MASCARAS 2027/MOKUPS'
const SALIDA = args.find(a => a.startsWith('--salida='))?.split('=')[1]
  || fileURLToPath(new URL('../../public/mockups/', import.meta.url))
const ANCHO   = Number(args.find(a => a.startsWith('--ancho='))?.split('=')[1] || 900)
const CALIDAD = Number(args.find(a => a.startsWith('--calidad='))?.split('=')[1] || 80)
const PROBAR  = args.includes('--probar')

// ── De qué marca es cada cosa ───────────────────────────────────────────────

/**
 * La familia a la que pertenece un nombre, de los dos lados.
 *
 * El orden importa: REALME antes que OPPO porque sus fotos viven en la
 * carpeta «Mockups OPPO/OPPO REALME», y HONOR antes que HUAWEI porque fue su
 * marca hermana y los nombres todavía se parecen.
 */
const FAMILIAS = [
  [/\b(IPHONE|APPLE)\b/,               'APPLE'],
  [/\b(GALAXY|SAMSUNG)\b/,             'SAMSUNG'],
  [/\b(REDMI|POCO|POCCO|XIAOMI)\b/,    'XIAOMI'],
  [/\b(MOTO|MOTOROLA)\b/,              'MOTOROLA'],
  [/\bREALME\b/,                       'REALME'],
  [/\bOPPO\b/,                         'OPPO'],
  [/\bHONOR\b/,                        'HONOR'],
  [/\b(HUAWEI|NOVA|MATE|PURA)\b/,      'HUAWEI'],
  [/\bVIVO\b/,                         'VIVO'],
  [/\bZTE\b/,                          'ZTE'],
  [/\b(PIXEL|GOOGLE)\b/,               'GOOGLE'],
  [/\bLG\b/,                           'LG'],
]

function familiaDe(texto) {
  const t = String(texto || '').toUpperCase()
  for (const [re, nombre] of FAMILIAS) if (re.test(t)) return nombre
  return null
}

/** 4G y 5G del mismo nombre son teléfonos distintos, con otra cámara. */
const redDe = texto => String(texto || '').toUpperCase().match(/([45]G)/)?.[1] ?? null

/**
 * Dos nombres pueden ser el mismo teléfono si nadie se contradice: ni la
 * marca ni la red.
 *
 * Lo de la red hace falta porque `clave()` -la de los PSD- borra «4G» y «5G»
 * como si fueran ruido, y con eso el REDMI NOTE 13 PRO 5G se llevaba la foto
 * del 13 PRO 4G, que es otro aparato y lleva otra funda.
 */
const compatibles = (a, b) => !(a.familia && b.familia && a.familia !== b.familia)
  && !(a.red && b.red && a.red !== b.red)

// ── Las fotografías ─────────────────────────────────────────────────────────

const slug = s => String(s).toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Recorre la carpeta y agrupa por modelo.
 *
 * Cada marca guarda dos versiones del mismo teléfono —«Fondo blanco» en jpg y
 * «Fondo transparente» en png— salvo apple, que lo dice en el nombre:
 * `iPhone 14 Pro_transparente.png`. Se admiten las dos formas porque así está
 * la carpeta de verdad, y pedir que alguien la reordene no es un plan.
 *
 * Gana SIEMPRE la transparente: la foto va sobre el degradado de la marca, y
 * un rectángulo blanco alrededor de la funda rompe la página entera.
 */
function listarMascaras(raiz) {
  const porModelo = new Map()

  const recorrer = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const ruta = path.join(dir, e.name)
      if (e.isDirectory()) { recorrer(ruta); continue }
      if (!['.png', '.jpg', '.jpeg'].includes(path.extname(e.name).toLowerCase())) continue

      let modelo = path.basename(e.name, path.extname(e.name))
      const loDiceElNombre = /_transparente$/i.test(modelo)
      modelo = modelo.replace(/_(transparente|blanco)$/i, '').trim()

      const k = modelo.toUpperCase()
      const yaHay = porModelo.get(k) ?? {
        modelo,
        red: redDe(modelo),
        // La carpeta sirve de red cuando el nombre no dice la marca: «A16.png»
        // dentro de «Mockups Samsung» es un Samsung.
        familia: familiaDe(modelo) ?? familiaDe(path.relative(raiz, dir)),
      }
      if (loDiceElNombre || /fondo transparente/i.test(dir)) yaHay.transparente ??= ruta
      else yaHay.blanco ??= ruta
      porModelo.set(k, yaHay)
    }
  }
  recorrer(raiz)
  return [...porModelo.values()]
}

// ── El catálogo ─────────────────────────────────────────────────────────────

/**
 * Qué códigos hay y cuánto vendió cada uno. El nombre sale del inventario de
 * las plazas —bodega y León mandan, que son quienes lo escriben bien— y las
 * piezas del historial por mes, que es lo único que dice qué importa.
 */
async function catalogo() {
  const base = 'https://istuffs-inventarios.s3.us-east-1.amazonaws.com/inventarios'
  const plazas = ['bodega', 'leon', 'san-luis', 'aguascalientes', 'ferias']
  const nombres = {}, vendidas = {}

  for (const p of plazas) {
    try {
      const inv = await (await fetch(`${base}/${p}/inventario.json`)).json()
      for (const x of inv.productos ?? []) {
        const c = String(x.Codigo ?? '').trim()
        if (c && !nombres[c]) nombres[c] = String(x.Producto ?? '').trim()
      }
    } catch { /* una plaza sin publicar no detiene a las demás */ }
    try {
      const h = await (await fetch(`${base}/${p}/historial.json`)).json()
      for (const [c, n] of Object.entries(h.catalogo ?? {})) nombres[c] ??= n
      for (const per of h.periodos ?? []) {
        for (const [c, n] of Object.entries(per.m ?? {})) vendidas[c] = (vendidas[c] || 0) + n
      }
    } catch { /* idem */ }
  }

  // Lo que no es funda no lleva mockup de funda. Las erratas del catálogo van
  // dentro a propósito: HIDRIOGEL y HODROGEL existen y no se van a corregir.
  const SIN_FUNDA = /MICA|HIDROGEL|HIDRIOGEL|HODROGEL|STIKER|STICKER|PAQUETE|CINTA|HOJA|POPSOCKET|LLAVERO|CARGADOR|CABLE|AUDIFONO/i
  return Object.entries(nombres)
    .filter(([, n]) => n && !SIN_FUNDA.test(n))
    .map(([codigo, nombre]) => ({ codigo, nombre, piezas: vendidas[codigo] || 0 }))
    .sort((a, b) => b.piezas - a.piezas)
}

// ── El emparejado ───────────────────────────────────────────────────────────

/**
 * Un nombre puede traer varios modelos juntos: «MOTO G54/G55», «IPHONE
 * 14/13/15». De cada uno salen varias claves —el conjunto y cada trozo con su
 * marca— y se prueban todas. Es lo mismo que hace `emparejar.mjs` con los
 * PSD; aquí se repite porque el otro lado son fotografías, no PSD, y
 * mezclarlos obligaría a tener Dropbox montado para generar los de siempre.
 */
const MARCA_AL_INICIO = /^(SAMSUNG|GALAXY|XIAOMI|REDMI|POCCO|POCO|HUAWEI|MOTOROLA|MOTO|OPPO|REALME|HONOR|VIVO|ZTE|IPHONE|APPLE|LG|GOOGLE|PIXEL)\s+/i

function variantes(nombre) {
  const n = String(nombre || '').toUpperCase()
  const m = MARCA_AL_INICIO.exec(n)
  const marca = m ? m[1] : ''
  const resto = m ? n.slice(m[0].length) : n
  const trozos = resto.split(/[-/,]+/).map(t => t.trim()).filter(Boolean)
  const out = new Set([n])
  for (const t of trozos) out.add(marca ? `${marca} ${t}` : t)
  return [...out]
}

function emparejar(productos, mascaras) {
  // Las claves guardan LISTAS, no una sola foto: dos marcas distintas pueden
  // dar la misma clave sin marca -«13» es Redmi 13 y es Xiaomi 13- y hay que
  // poder descartar la que no es de la familia que toca.
  const porK = new Map(), porKs = new Map()
  const apuntar = (mapa, k, m) => { if (k) mapa.set(k, [...(mapa.get(k) ?? []), m]) }

  for (const m of mascaras) {
    for (const v of variantes(m.modelo)) {
      apuntar(porK, clave(v), m)
      apuntar(porKs, clave(v, false), m)
    }
  }
  return productos.map(p => {
    const yo = { familia: familiaDe(p.nombre), red: redDe(p.nombre) }
    const valen = ms => (ms ?? []).find(m => compatibles(yo, m))

    let foto = null, como = null
    for (const v of variantes(p.nombre)) {
      foto = valen(porK.get(clave(v)))
      if (foto) { como = 'exacto'; break }
    }
    if (!foto) {
      for (const v of variantes(p.nombre)) {
        foto = valen(porKs.get(clave(v, false)))
        if (foto) { como = 'sin marca'; break }
      }
    }

    // Aquí había un tercer intento, por contención: que una clave estuviera
    // dentro de la otra. Daba 40 emparejados y casi todos eran mentira —el
    // IPHONE 6 PLUS se llevaba la foto del **iPhone 16 Plus**, porque «6PLUS»
    // está dentro de «16PLUS»; el NOVA 9 la del nova 9 SE; el MOTO EDGE 30 la
    // del Edge 30 Neo—. Una foto equivocada es peor que ninguna: enseña con
    // toda seguridad la funda que no es y nadie la revisa, porque la página se
    // ve perfecta. Para lo que falte ya está el mockup del PSD.
    return { ...p, ...yo, foto, como }
  })
}

// ── La imagen ───────────────────────────────────────────────────────────────

/**
 * Recorta a lo que se ve y reduce al ancho de la web.
 *
 * El umbral de alfa es 25 y no 1 a propósito: la foto trae una sombra muy
 * tenue alrededor de la funda, y recortando por cualquier píxel con algo de
 * opacidad cada modelo salía con un marco de aire distinto.
 */
async function prepararImagen(ruta, ancho, calidad) {
  const img = await loadImage(ruta)
  const lienzo = createCanvas(img.width, img.height)
  lienzo.getContext('2d').drawImage(img, 0, 0)

  const d = lienzo.getContext('2d').getImageData(0, 0, img.width, img.height).data
  let x0 = img.width, y0 = img.height, x1 = 0, y1 = 0
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (d[(y * img.width + x) * 4 + 3] <= 25) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  // Un jpg de fondo blanco es opaco entero: ahí no hay nada que recortar.
  const hayRecorte = x1 > x0 && y1 > y0
  const margen = 6
  const cx = hayRecorte ? Math.max(0, x0 - margen) : 0
  const cy = hayRecorte ? Math.max(0, y0 - margen) : 0
  const cw = (hayRecorte ? Math.min(img.width - 1, x1 + margen) : img.width - 1) - cx + 1
  const ch = (hayRecorte ? Math.min(img.height - 1, y1 + margen) : img.height - 1) - cy + 1

  const escala = Math.min(1, ancho / cw)
  const W = Math.round(cw * escala), H = Math.round(ch * escala)
  const fuera = createCanvas(W, H)
  fuera.getContext('2d').drawImage(lienzo, cx, cy, cw, ch, 0, 0, W, H)
  return { webp: fuera.toBuffer('image/webp', calidad), W, H }
}

// ── La corrida ──────────────────────────────────────────────────────────────

const mascaras = listarMascaras(ORIGEN)
const productos = await catalogo()
const pares = emparejar(productos, mascaras)
const conFoto = pares.filter(p => p.foto)

const porComo = {}
for (const p of conFoto) porComo[p.como] = (porComo[p.como] || 0) + 1
console.log(`${mascaras.length} modelos fotografiados · ${productos.length} códigos de funda · ${conFoto.length} emparejados`)
console.log(`   ${Object.entries(porComo).map(([k, v]) => `${k}: ${v}`).join(' · ')}`)

if (PROBAR) {
  console.log('\n--probar: no se escribe nada.\n\nLos 30 que más venden:')
  for (const p of pares.slice(0, 30)) {
    console.log(`   ${p.codigo.padEnd(10)}${p.nombre.slice(0, 38).padEnd(40)}${p.foto ? `→ ${p.foto.modelo} (${p.como})` : '—'}`)
  }
  // Los dos modos flojos, que son donde se cuela un emparejado falso. Se
  // miran a ojo antes de escribir: una foto equivocada es peor que ninguna.
  for (const modo of ['sin marca']) {
    const ms = conFoto.filter(p => p.como === modo).sort((x, y) => y.piezas - x.piezas)
    console.log(`
«${modo}» (${ms.length}), los 22 de más venta:`)
    for (const m of ms.slice(0, 22)) {
      console.log(`   ${m.codigo.padEnd(10)}${m.nombre.slice(0, 38).padEnd(40)}→ ${m.foto.modelo}`)
    }
  }

  const sin = pares.filter(p => !p.foto && p.piezas > 0)
  console.log(`\nsin foto y con venta (${sin.length}), los 20 que más venden:`)
  for (const s of sin.slice(0, 20)) console.log(`   ${s.codigo.padEnd(10)}${s.nombre.slice(0, 40).padEnd(42)}${s.piezas} pz`)
  process.exit(0)
}

fs.mkdirSync(SALIDA, { recursive: true })

// Una imagen por fotografía. El índice reparte: nueve colores del mismo
// teléfono son nueve códigos y un solo archivo.
const archivos = new Map()
const fallos = []
let bytes = 0

for (const p of conFoto) {
  const fuente = p.foto.transparente ?? p.foto.blanco
  if (archivos.has(fuente)) continue
  try {
    const img = await prepararImagen(fuente, ANCHO, CALIDAD)
    const archivo = `${slug(p.foto.modelo)}.webp`
    fs.writeFileSync(path.join(SALIDA, archivo), img.webp)
    archivos.set(fuente, archivo)
    bytes += img.webp.length
    if (archivos.size % 40 === 0) console.log(`  ${archivos.size} fotos...`)
  } catch (e) {
    fallos.push({ codigo: p.codigo, archivo: fuente, error: e.message })
  }
}

// El índice anterior: lo que no cubra una foto se queda como estaba, que es
// mejor que un hueco. Para eso siguen sirviendo los PSD.
const rutaIndice = path.join(SALIDA, 'indice.json')
const anterior = fs.existsSync(rutaIndice)
  ? JSON.parse(fs.readFileSync(rutaIndice, 'utf8')).mockups ?? []
  : []

const porCodigo = new Map()
for (const m of anterior) porCodigo.set(m.codigo, { ...m, fuente: m.fuente ?? 'psd' })

for (const p of conFoto) {
  const archivo = archivos.get(p.foto.transparente ?? p.foto.blanco)
  if (!archivo) continue
  // Al entrar la fotografía se le cae el `vacio`: eso marcaba una silueta en
  // blanco salida de un PSD, y aquí ya no hay silueta que valga.
  porCodigo.set(p.codigo, {
    codigo: p.codigo,
    nombre: p.nombre,
    archivo,
    origen: p.foto.modelo,
    fuente: p.foto.transparente ? 'mascaras' : 'mascaras-blanco',
    piezas: p.piezas,
  })
}

const indice = [...porCodigo.values()].sort((a, b) => b.piezas - a.piezas)
fs.writeFileSync(rutaIndice, JSON.stringify({
  generado: new Date().toISOString(),
  total: indice.length,
  mockups: indice,
}, null, 2))

// Los PNG por código que acaba de sustituir una fotografía ya no los pide
// nadie: se borran para que `public/` no cargue con dos versiones de todo.
let borrados = 0
for (const m of anterior) {
  const ahora = porCodigo.get(m.codigo)
  if (!ahora || ahora.fuente === 'psd' || !m.archivo?.endsWith('.png')) continue
  if (indice.some(x => x.archivo === m.archivo)) continue
  const ruta = path.join(SALIDA, m.archivo)
  if (fs.existsSync(ruta)) { fs.unlinkSync(ruta); borrados++ }
}

const dePsd = indice.filter(m => m.fuente === 'psd')
console.log(`\n${archivos.size} fotografías escritas · ${(bytes / 1048576).toFixed(1)} MB`)
console.log(`índice: ${indice.length} códigos · ${indice.length - dePsd.length} con fotografía · ${dePsd.length} heredados de los PSD`)
if (borrados) console.log(`   ${borrados} PNG viejos borrados, ya los sustituye una foto`)
if (dePsd.some(m => m.vacio)) {
  console.log(`   siguen en blanco: ${dePsd.filter(m => m.vacio).map(m => m.codigo).join(' ')}`)
}
if (fallos.length) {
  console.log(`\nfallaron ${fallos.length}:`)
  for (const f of fallos) console.log(`   ${f.codigo.padEnd(10)}${f.error.slice(0, 60)}`)
}
