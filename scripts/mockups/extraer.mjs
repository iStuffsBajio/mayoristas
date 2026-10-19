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

const descartar = (l, psd, conFotos = false) => {
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
  //
  // Salvo cuando se pide lo contrario. En unos cuantos PSD la funda ESTÁ en
  // una capa con nombre de foto -«20240403_135357»- y descartarla dejaba
  // sólo el relleno blanco: una silueta sin contorno ni cámara. Diez de los
  // ochenta y tres salían así. El rescate se pide sólo cuando el camino
  // normal ya falló, para no estropear los que sí funcionan.
  if (!conFotos && FOTO.test(n) && !/PHOTOROOM/i.test(n)) return true
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
export function fundaDe(psd, { conFotos = false } = {}) {
  let capas = []
  const rec = ls => {
    for (const l of ls || []) {
      if (l.children) { rec(l.children); continue }
      if (descartar(l, psd, conFotos)) continue
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

/**
 * Separa el área imprimible del resto de la funda.
 *
 * Devuelve dos lienzos:
 *   hueco — la funda con el centro VACÍO, para poner encima del diseño
 *   area  — una silueta opaca de ese centro, para recortar el diseño
 *
 * Se parte del centro y se extiende por los pixeles casi blancos contiguos.
 * No vale borrar «todo lo blanco»: el flash de la cámara y los brillos del
 * marco también son claros, y se abrirían agujeros donde no van.
 */
export function separarAreaImprimible(canvas) {
  const W = canvas.width, H = canvas.height
  const ctx = canvas.getContext('2d')
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  const claro = i => d[i + 3] > 100 && d[i] > 215 && d[i + 1] > 215 && d[i + 2] > 215

  // Varias semillas por si la cámara o un reflejo tapan una.
  const semillas = [[0.5, 0.6], [0.5, 0.75], [0.45, 0.5], [0.6, 0.65], [0.5, 0.4]]
    .map(([fx, fy]) => [Math.floor(W * fx), Math.floor(H * fy)])
    .filter(([x, y]) => claro((y * W + x) * 4))
  if (!semillas.length) return null

  const dentro = new Uint8Array(W * H)
  const visto = new Uint8Array(W * H)
  const pila = semillas.map(([x, y]) => y * W + x)
  let n = 0
  while (pila.length) {
    const p = pila.pop()
    if (visto[p]) continue
    visto[p] = 1
    if (!claro(p * 4)) continue
    dentro[p] = 1; n++
    const x = p % W, y = (p / W) | 0
    if (x > 0) pila.push(p - 1)
    if (x < W - 1) pila.push(p + 1)
    if (y > 0) pila.push(p - W)
    if (y < H - 1) pila.push(p + W)
  }
  // Un área imprimible que no llega ni al 15% del lienzo no es el área: es un
  // reflejo. Mejor no entregar nada que entregar un recorte equivocado.
  if (n / (W * H) < 0.15) return null

  const hueco = createCanvas(W, H)
  const hImg = hueco.getContext('2d').createImageData(W, H)
  const area = createCanvas(W, H)
  const aImg = area.getContext('2d').createImageData(W, H)

  for (let p = 0; p < W * H; p++) {
    const i = p * 4
    if (dentro[p]) {
      aImg.data[i] = aImg.data[i + 1] = aImg.data[i + 2] = 255
      aImg.data[i + 3] = 255
    } else {
      hImg.data[i] = d[i]; hImg.data[i + 1] = d[i + 1]
      hImg.data[i + 2] = d[i + 2]; hImg.data[i + 3] = d[i + 3]
    }
  }
  hueco.getContext('2d').putImageData(hImg, 0, 0)
  area.getContext('2d').putImageData(aImg, 0, 0)
  return { hueco, area, proporcion: n / (W * H) }
}
