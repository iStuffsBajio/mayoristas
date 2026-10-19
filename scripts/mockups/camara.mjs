// Simula los lentes en los mockups que vienen como dibujo de línea.
//
// Un tercio de los PSD no trae la cámara dibujada: el módulo es un contorno
// negro y los lentes son agujeros transparentes. En la página se veían planos,
// como un plano de corte, y desentonaban junto a los que sí traen cámara real.
//
// Aquí se detectan esos agujeros y se dibuja un lente dentro. Los mockups que
// YA tienen cámara realista no tienen agujeros, así que esto no los toca.

import { createCanvas } from '@napi-rs/canvas'

/**
 * Los huecos de lente ya vienen transparentes en el mockup: el módulo está
 * dibujado como un contorno negro y los lentes son agujeros. Se distinguen
 * del fondo de alrededor porque ESTÁN ENCERRADOS: se marca primero todo lo
 * transparente que toca el borde de la imagen —eso es el exterior— y lo
 * transparente que sobra son los agujeros.
 */
function agujeros(d, W, H) {
  const vacio = p => d[p * 4 + 3] < 100
  const fuera = new Uint8Array(W * H)
  const pila = []
  for (let x = 0; x < W; x++) { pila.push(x, (H - 1) * W + x) }
  for (let y = 0; y < H; y++) { pila.push(y * W, y * W + W - 1) }
  while (pila.length) {
    const p = pila.pop()
    if (fuera[p] || !vacio(p)) continue
    fuera[p] = 1
    const x = p % W, y = (p / W) | 0
    if (x > 0) pila.push(p - 1); if (x < W - 1) pila.push(p + 1)
    if (y > 0) pila.push(p - W); if (y < H - 1) pila.push(p + W)
  }

  const visto = new Uint8Array(W * H)
  const out = []
  for (let p = 0; p < W * H; p++) {
    if (visto[p] || fuera[p] || !vacio(p)) continue
    const q = [p]; let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0
    while (q.length) {
      const r = q.pop()
      if (visto[r] || fuera[r] || !vacio(r)) continue
      visto[r] = 1; n++
      const x = r % W, y = (r / W) | 0
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
      if (x > 0) q.push(r - 1); if (x < W - 1) q.push(r + 1)
      if (y > 0) q.push(r - W); if (y < H - 1) q.push(r + W)
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1
    const cuad = Math.min(w, h) / Math.max(w, h)
    if (n > 150 && cuad > 0.72 && w < W * 0.4) {
      out.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: (w + h) / 4, n })
    }
  }
  return out
}

/**
 * Un lente de celular, no un ojo de caricatura.
 *
 * La primera versión ponía un reflejo blanco enorme y se veía dibujado. Un
 * lente real es CASI NEGRO: lo que se ve es el aro metálico, un brillo muy
 * tenue del recubrimiento y un reflejo pequeño y desplazado. El resto es
 * oscuridad.
 */
function lente(ctx, cx, cy, r) {
  // Aro metálico exterior
  const aro = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
  aro.addColorStop(0, '#5a6069'); aro.addColorStop(0.5, '#23262b'); aro.addColorStop(1, '#6e757f')
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = aro; ctx.fill()

  // Borde interior oscuro, para que el aro se lea delgado
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2); ctx.fillStyle = '#121418'; ctx.fill()

  // El cristal: casi negro, con un sutil tinte azulado arriba a la izquierda
  const vidrio = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.34, r * 0.05, cx, cy, r * 0.82)
  vidrio.addColorStop(0, 'rgba(46,72,108,0.55)')
  vidrio.addColorStop(0.4, 'rgba(14,20,32,0.9)')
  vidrio.addColorStop(1, '#05060a')
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2); ctx.fillStyle = vidrio; ctx.fill()

  // Reflejo: pequeño, suave y arriba. Es lo que más delata una simulación
  // mala cuando se exagera.
  const brillo = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.38, 0, cx - r * 0.3, cy - r * 0.38, r * 0.3)
  brillo.addColorStop(0, 'rgba(255,255,255,0.42)')
  brillo.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2); ctx.fillStyle = brillo; ctx.fill()

  // Un punto de luz mínimo
  ctx.beginPath(); ctx.arc(cx - r * 0.33, cy - r * 0.4, r * 0.08, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill()
}

/**
 * Dibuja lentes en los agujeros de un mockup. Devuelve cuántos puso; cero
 * significa que ese mockup ya traía su cámara y no hubo nada que hacer.
 */
export function simularCamara(canvas) {
  const ctx = canvas.getContext('2d')
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const hs = agujeros(d, canvas.width, canvas.height)
  if (!hs.length) return 0

  // El flash es notablemente más chico que los lentes: va en blanco cálido,
  // no en negro, porque es un LED y no un cristal.
  const rMax = Math.max(...hs.map(h => h.r))
  for (const h of hs) {
    if (h.r < rMax * 0.5) {
      ctx.beginPath(); ctx.arc(h.cx, h.cy, h.r, 0, Math.PI * 2)
      ctx.fillStyle = '#f4e8c9'; ctx.fill()
    } else {
      lente(ctx, h.cx, h.cy, h.r)
    }
  }
  return hs.length
}
