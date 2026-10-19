// Saca de los PSD las imágenes de funda listas para la web.
//
//   node scripts/mockups/generar-web.mjs            los más vendidos
//   node scripts/mockups/generar-web.mjs --todos    los 504
//   node scripts/mockups/generar-web.mjs --salida=D:/otra/ruta
//
// Guarda un PNG por CÓDIGO del inventario, no por archivo: un mismo PSD
// —«MOTO G54-G55»— sirve a varios códigos, y la página busca por código.
// Junto a los PNG deja un índice JSON para enlazarlos desde el sitio.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPsd } from 'ag-psd'
import { fundaDe, recortar, pareceFunda } from './extraer.mjs'
import { emparejar } from './emparejar.mjs'

const args = process.argv.slice(2)
const TODOS = args.includes('--todos')
// Salen DENTRO del proyecto, en public/, no en Dropbox. Dropbox es carpeta
// compartida: cualquiera puede mover o renombrar ahí sin avisar, y la página
// dejaría de encontrar sus imágenes. Aquí viven con el código, se publican
// solas con el sitio y quedan en el historial de git.
const SALIDA = args.find(a => a.startsWith('--salida='))?.split('=')[1]
  || fileURLToPath(new URL('../../public/mockups/', import.meta.url))
const ANCHO = Number(args.find(a => a.startsWith('--ancho='))?.split('=')[1] || 900)

/** Lee el inventario y el historial publicados para saber qué códigos hay. */
async function codigos() {
  const base = 'https://istuffs-inventarios.s3.us-east-1.amazonaws.com/inventarios'
  const plazas = ['leon', 'san-luis', 'aguascalientes', 'bodega', 'ferias']
  const nombres = {}, vendidas = {}

  for (const p of plazas) {
    try {
      const inv = await (await fetch(`${base}/${p}/inventario.json`)).json()
      for (const x of inv.productos ?? []) {
        const c = String(x.Codigo ?? '').trim()
        if (c && !nombres[c]) nombres[c] = String(x.Producto ?? '').trim()
      }
    } catch { /* la plaza puede no tener inventario publicado */ }
    try {
      const h = await (await fetch(`${base}/${p}/historial.json`)).json()
      Object.assign(nombres, Object.fromEntries(
        Object.entries(h.catalogo ?? {}).filter(([c]) => !nombres[c])))
      for (const per of h.periodos ?? []) {
        for (const [c, n] of Object.entries(per.m ?? {})) vendidas[c] = (vendidas[c] || 0) + n
      }
    } catch { /* idem */ }
  }

  // Lo que no es funda no lleva mockup.
  const SIN_FUNDA = /MICA|HIDROGEL|STIKER|STICKER|PAQUETE|CINTA|HOJA|POPSOCKET|LLAVERO/i
  let lista = Object.entries(nombres)
    .filter(([, n]) => n && !SIN_FUNDA.test(n))
    .map(([codigo, nombre]) => ({ codigo, nombre, piezas: vendidas[codigo] || 0 }))
    .sort((a, b) => b.piezas - a.piezas)

  if (!TODOS) {
    // Los que hacen la mitad de la venta: es donde se nota el esfuerzo.
    const total = lista.reduce((a, x) => a + x.piezas, 0)
    let acc = 0
    lista = lista.filter(x => { if (acc / total >= 0.5) return false; acc += x.piezas; return true })
  }
  return lista
}

const limpio = s => String(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')

const lista = await codigos()
const pares = emparejar(lista)
const conPsd = pares.filter(p => p.psd)

fs.mkdirSync(SALIDA, { recursive: true })
console.log(`${lista.length} códigos · ${conPsd.length} con mockup · salida: ${SALIDA}\n`)

// Un mismo PSD sirve a varios códigos: se lee una vez y se guarda recortado.
const cache = new Map()
const indice = []
let hechos = 0, fallos = []

for (const p of conPsd) {
  try {
    let png = cache.get(p.psd.ruta)
    if (!png) {
      const psd = readPsd(fs.readFileSync(p.psd.ruta), { skipCompositeImageData: true, skipThumbnail: true })
      const r = fundaDe(psd)
      if (!r) throw new Error('no se encontró la funda dentro del PSD')
      let c = recortar(r.canvas)
      // Hay PSD de producción -siluetas de corte con el nombre en letras
      // blancas- que tienen forma de funda y pasan cualquier prueba
      // geométrica. Se reconocen porque no tienen área blanca donde imprimir.
      const juicio = pareceFunda(c)
      if (!juicio.ok) {
        throw new Error(`no parece mockup: ${(juicio.blanco * 100).toFixed(0)}% blanco, proporción ${juicio.prop.toFixed(2)}`)
      }
      if (c.width > ANCHO) {
        const { createCanvas } = await import('@napi-rs/canvas')
        const alto = Math.round(c.height * (ANCHO / c.width))
        const chico = createCanvas(ANCHO, alto)
        chico.getContext('2d').drawImage(c, 0, 0, ANCHO, alto)
        c = chico
      }
      png = c.toBuffer('image/png')
      cache.set(p.psd.ruta, png)
    }
    const archivo = `${limpio(p.codigo)}.png`
    fs.writeFileSync(path.join(SALIDA, archivo), png)
    indice.push({ codigo: p.codigo, nombre: p.nombre, archivo, origen: p.psd.nombre, piezas: p.piezas })
    hechos++
    if (hechos % 10 === 0) console.log(`  ${hechos}/${conPsd.length}...`)
  } catch (e) {
    fallos.push({ codigo: p.codigo, nombre: p.nombre, psd: p.psd.nombre, error: e.message })
  }
}

fs.writeFileSync(path.join(SALIDA, 'indice.json'), JSON.stringify({
  generado: new Date().toISOString(),
  total: indice.length,
  mockups: indice.sort((a, b) => b.piezas - a.piezas),
}, null, 2))

console.log(`\nlistos: ${hechos}`)
if (fallos.length) {
  console.log(`fallaron: ${fallos.length}`)
  for (const f of fallos) console.log(`   ${f.codigo.padEnd(10)}${f.nombre.slice(0, 32).padEnd(34)}${f.error.slice(0, 44)}`)
}
const sin = pares.filter(p => !p.psd)
if (sin.length) {
  console.log(`\nsin PSD (${sin.length}):`)
  for (const s of sin) console.log(`   ${s.codigo.padEnd(10)}${s.nombre}`)
}
