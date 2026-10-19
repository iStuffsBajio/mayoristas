// Saca de cada PSD la funda sola, sobre fondo transparente.
//
//   node scripts/mockups/extraer.mjs [--marca=IPHONE] [--limite=5] [--salida=ruta]
//
// Los PSD traen cuatro cosas encima: un fondo decorativo, el nombre del
// modelo en vertical, un sello de "ISTUFFS AUTLÁN" y un aviso de "doble clic
// para editar". Para la tienda sólo sirve la funda.
//
// No se puede elegir la capa por su nombre: cada marca la llamó distinto
// —"Iphone 11", "Objeto inteligente vectorial", "transparent-Photoroom (9)"—.
// Lo que sí es constante es la GEOMETRÍA: la funda mide alrededor de 420x880
// en un lienzo de 1000, o sea alta, estrecha y centrada. Así que se descarta
// lo que no encaje y se compone lo que queda.

import fs from 'node:fs'
import path from 'node:path'
import { readPsd, initializeCanvas } from 'ag-psd'
import { createCanvas } from '@napi-rs/canvas'

initializeCanvas(createCanvas)

export const RAIZ = process.env.MOCKUPS_DIR || 'A:/Dropbox/MOCKUPS'

/**
 * Capas que nunca son la funda.
 *
 * Los PSD son archivos de trabajo, no plantillas limpias: dentro quedaron
 * fotos de clientes («WhatsApp Image 2026-09-05»), descargas sueltas y
 * recortes con nombre de hash. Varias tienen forma parecida a una funda, así
 * que la geometría sola no basta y hay que mirar también el nombre.
 */
const FOTO = /WHATSAPP|IMG[-_ ]?\d|IMAGE|DESCARGA|SCREENSHOT|CAPTURA|REMOVEBG|PHOTOROOM|^\d{6,}|^[0-9A-F]{16,}/i

const descartar = (l, psd) => {
  const n = (l.name || '').toUpperCase()
  const w = l.right - l.left, h = l.bottom - l.top
  if (!l.canvas || w < 20 || h < 20) return true
  // El fondo decorativo y el sello: tan anchos como el lienzo o más.
  if (w > psd.width * 0.9) return true
  // El aviso de edición y la marca de agua.
  if (/DOBLE CLIC|ISTUFFS|AUTL/.test(n)) return true
  // El nombre del modelo, escrito en vertical al costado.
  if (h / w > 3) return true
  // Fotos y recortes que se quedaron dentro del archivo.
  if (FOTO.test(n) && !/PHOTOROOM/i.test(n)) return true
  return false
}

/**
 * Compone la funda de un PSD: todas las capas que no son decoración,
 * apiladas como están.
 *
 * Elegir UNA capa no funciona. En unos PSD la funda es una sola y en otros
 * son tres -el relleno del color, la carcasa y la cámara- y quedarse con la
 * mayor devolvía un rectángulo blanco liso, porque la capa «Editar color
 * case» mide lo mismo que la funda y está más llena que ella. Apilarlas todas
 * reproduce lo que enseña Photoshop, menos los adornos.
 */
export function fundaDe(psd) {
  let capas = []
  const rec = ls => {
    for (const l of ls || []) {
      if (l.children) { rec(l.children); continue }
      if (descartar(l, psd)) continue
      capas.push(l)
    }
  }
  rec(psd.children)
  if (!capas.length) return null

  // La funda son una a tres capas del MISMO tamaño: el relleno, la carcasa y
  // la cámara, apiladas. Cualquier cosa que se salga de ese tamaño es otra
  // cosa que quedó en el archivo. Se toma como referencia la capa más grande
  // con forma de funda y se descarta lo que no se le parezca.
  const conForma = capas.filter(l => {
    const r = (l.bottom - l.top) / (l.right - l.left)
    return r > 1.75 && r < 2.35
  })
  if (conForma.length) {
    const ref = conForma.reduce((a, b) =>
      (a.right - a.left) * (a.bottom - a.top) > (b.right - b.left) * (b.bottom - b.top) ? a : b)
    const rw = ref.right - ref.left
    capas = capas.filter(l => {
      const w = l.right - l.left
      return w >= rw * 0.75 && w <= rw * 1.12
    })
  }

  const c = createCanvas(psd.width, psd.height)
  const ctx = c.getContext('2d')
  // ag-psd entrega las capas de abajo hacia arriba, que es el orden en que
  // hay que dibujarlas.
  for (const l of capas) {
    if (l.hidden) continue
    ctx.globalAlpha = l.opacity ?? 1
    ctx.drawImage(l.canvas, l.left, l.top)
  }
  ctx.globalAlpha = 1
  return { canvas: c, capas: capas.length, nombres: capas.map(l => l.name) }
}

/**
 * ¿Lo extraído parece una funda de verdad?
 *
 * Entre los PSD hay archivos de producción —siluetas de corte con el nombre
 * del modelo en letras blancas sobre negro— que tienen forma de funda y pasan
 * cualquier prueba geométrica. Lo que los delata es que NO tienen área
 * blanca: una funda para imprimir es casi toda blanca por dentro, que es
 * donde va el diseño. Una silueta de corte es negra.
 */
export function pareceFunda(canvas) {
  const ctx = canvas.getContext('2d')
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  let opacos = 0, claros = 0
  for (let i = 0; i < d.length; i += 4 * 3) {
    if (d[i + 3] < 60) continue
    opacos++
    if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) claros++
  }
  const prop = canvas.height / canvas.width
  const blanco = opacos ? claros / opacos : 0
  return { ok: blanco > 0.25 && prop > 1.7 && prop < 2.4, blanco, prop }
}

/** Recorta lo transparente de alrededor. */
export function recortar(canvas, margen = 8) {
  const ctx = canvas.getContext('2d')
  const { width: W, height: H } = canvas
  const d = ctx.getImageData(0, 0, W, H).data
  let x0 = W, y0 = H, x1 = 0, y1 = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] > 12) {
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  if (x1 <= x0 || y1 <= y0) return canvas
  x0 = Math.max(0, x0 - margen); y0 = Math.max(0, y0 - margen)
  x1 = Math.min(W - 1, x1 + margen); y1 = Math.min(H - 1, y1 + margen)
  const out = createCanvas(x1 - x0 + 1, y1 - y0 + 1)
  out.getContext('2d').drawImage(canvas, -x0, -y0)
  return out
}

/** Todos los .psd de la carpeta de mockups, por marca. */
export function listarPsd(marca = null) {
  const out = []
  for (const m of fs.readdirSync(RAIZ)) {
    if (marca && m.toUpperCase() !== marca.toUpperCase()) continue
    const dir = path.join(RAIZ, m)
    let st; try { st = fs.statSync(dir) } catch { continue }
    if (!st.isDirectory()) continue
    const buscar = d => {
      for (const n of fs.readdirSync(d)) {
        const p = path.join(d, n)
        let s; try { s = fs.statSync(p) } catch { continue }
        if (s.isDirectory()) buscar(p)
        else if (/\.psd$/i.test(n)) out.push({ marca: m, nombre: n.replace(/\.psd$/i, ''), ruta: p })
      }
    }
    buscar(dir)
  }
  return out
}
