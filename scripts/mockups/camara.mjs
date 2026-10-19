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
    const q = [p], pix = []; let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0
    while (q.length) {
      const r = q.pop()
      if (visto[r] || fuera[r] || !vacio(r)) continue
      visto[r] = 1; n++; pix.push(r)
      const x = r % W, y = (r / W) | 0
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
      if (x > 0) q.push(r - 1); if (x < W - 1) q.push(r + 1)
      if (y > 0) q.push(r - W); if (y < H - 1) q.push(r + W)
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1
    const cuad = Math.min(w, h) / Math.max(w, h)
    if (n > 150 && cuad > 0.72 && w < W * 0.4) {
      out.push({ tipo: 'lente', cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: (w + h) / 4, n })
    } else if (n > 150 && cuad > 0.48 && w < W * 0.55 && y1 < H * 0.42) {
      // Un hueco grande y casi cuadrado en el tercio superior no es un lente:
      // es el MÓDULO entero, dibujado como un rectángulo redondeado vacío.
      // Ocho mockups de ochenta y tres venían así: en la página se veía el
      // fondo oscuro a través del hueco, o sea una losa negra, justo al lado
      // de los que sí traen cámara. Se marca aparte: los lentes se colocan
      // DENTRO del módulo, no se dibuja uno del tamaño del módulo.
      //
      // El umbral de cuadratura es 0.48 y no 0.6 porque hay módulos
      // claramente verticales —el del A55 mide 158×284— y con 0.6 se caían.
      // Los píxeles exactos del hueco: el módulo se recorta a ellos. Con la
      // pura caja, el dibujo se salía del cuerpo de la funda por la
      // izquierda, donde el hueco se mete bajo el contorno.
      out.push({ tipo: 'modulo', x0, y0, x1, y1, w, h, n, pix })
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
/**
 * Rellena un módulo vacío: el cristal oscuro del conjunto y, dentro, dos o
 * tres lentes repartidos a lo largo. Es la misma función `lente` de siempre;
 * lo nuevo es dónde se colocan y que el dibujo se recorta al hueco real.
 */
function modulo(ctx, m, W, H) {
  const { x0, y0, w, h } = m
  const largo = Math.max(w, h), corto = Math.min(w, h)
  const vertical = h >= w

  // El dibujo se hace aparte y luego se recorta al hueco.
  const lienzo = createCanvas(w, h)
  const g = lienzo.getContext('2d')

  // El cristal del módulo, un paso más oscuro que el cuerpo.
  g.beginPath()
  g.roundRect(0, 0, w, h, corto * 0.16)
  const cristal = g.createLinearGradient(0, 0, w, h)
  cristal.addColorStop(0, '#2b3038'); cristal.addColorStop(1, '#14171c')
  g.fillStyle = cristal; g.fill()

  // Cuántos lentes caben: dos si es casi cuadrado, tres si es alargado.
  const n = largo / corto > 1.35 ? 3 : 2

  // El paso sale del largo disponible y el radio del paso, no al revés. Con
  // el radio fijo en una fracción del lado, dos lentes en un módulo cuadrado
  // se encimaban: 60px de radio con los centros a 69 de distancia.
  const paso = largo / (n + 0.6)
  const rl = Math.min(paso * 0.42, corto * 0.3)

  for (let i = 0; i < n; i++) {
    const a = paso * (i + 0.5)           // sobre el lado largo
    const b = corto * (n === 2 ? 0.44 : 0.42)  // sobre el corto
    lente(g, vertical ? b : a, vertical ? a : b, rl)
  }

  // El flash, al final del módulo y bastante más chico que un lente.
  const fa = paso * (n - 0.5) + paso * 0.78
  const fb = corto * (n === 2 ? 0.44 : 0.78)
  g.beginPath()
  g.arc(vertical ? fb : Math.min(fa, w - rl * 0.5), vertical ? Math.min(fa, h - rl * 0.5) : fb, rl * 0.28, 0, Math.PI * 2)
  g.fillStyle = '#f4e8c9'; g.fill()

  // El recorte: sólo donde de verdad había hueco.
  const dibujo = g.getImageData(0, 0, w, h)
  const dentro = new Uint8Array(w * h)
  for (const r of m.pix) {
    const x = (r % W) - x0, y = ((r / W) | 0) - y0
    if (x >= 0 && x < w && y >= 0 && y < h) dentro[y * w + x] = 1
  }
  for (let i = 0; i < w * h; i++) if (!dentro[i]) dibujo.data[i * 4 + 3] = 0
  ctx.putImageData(dibujo, x0, y0)
}

export function simularCamara(canvas) {
  const ctx = canvas.getContext('2d')
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const hs = agujeros(d, canvas.width, canvas.height)
  if (!hs.length) return 0

  const lentes = hs.filter(h => h.tipo === 'lente')
  const modulos = hs.filter(h => h.tipo === 'modulo')

  // El flash es notablemente más chico que los lentes: va en blanco cálido,
  // no en negro, porque es un LED y no un cristal.
  const rMax = lentes.length ? Math.max(...lentes.map(h => h.r)) : 0
  for (const h of lentes) {
    if (h.r < rMax * 0.5) {
      ctx.beginPath(); ctx.arc(h.cx, h.cy, h.r, 0, Math.PI * 2)
      ctx.fillStyle = '#f4e8c9'; ctx.fill()
    } else {
      lente(ctx, h.cx, h.cy, h.r)
    }
  }

  // Un módulo sólo se rellena si no había lentes sueltos: cuando los hay, el
  // hueco grande es el propio módulo CON sus lentes ya puestos y taparlo los
  // borraría.
  if (!lentes.length) for (const m of modulos) modulo(ctx, m, canvas.width, canvas.height)

  return lentes.length + (lentes.length ? 0 : modulos.length)
}
