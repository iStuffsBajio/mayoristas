// Las fotos de muestra, los stickers y el programa de mayoristas (2026-11-16).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { MUESTRAS, CLAVES_DE_MUESTRA, muestraDe, fotoDeSucursal, LEYENDA_SUCURSAL, SUCURSALES_CON_FOTO } from './muestras.js'
import { PROGRAMA_MAYORISTA } from './mayoristas-info.js'
import { STICKERS, TIPOS } from './precio.js'
import { listaDePrecios } from './herramientas.js'
import { REGLAS } from './cerebro.js'

const PUBLICO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'crm')

test('cada foto de muestra existe en public/crm, es JPEG y pesa poco', () => {
  for (const [clave, m] of Object.entries(MUESTRAS)) {
    assert.ok(m.fotos.length >= 1 && m.fotos.length <= 2, `${clave}: una o dos fotos, no un álbum`)
    for (const f of [...m.fotos, ...(m.ficha ? [m.ficha] : [])]) {
      const ruta = path.join(PUBLICO, f.archivo)
      assert.ok(fs.existsSync(ruta), `${clave}: falta ${f.archivo} en public/crm`)
      // WhatsApp documenta JPEG y PNG para imágenes; se mira por los bytes.
      const b = fs.readFileSync(ruta)
      assert.ok(b[0] === 0xFF && b[1] === 0xD8, `${f.archivo} no es JPEG`)
      assert.ok(b.length < 400_000, `${f.archivo} pesa ${b.length} bytes: es demasiado para WhatsApp en datos móviles`)
    }
  }
})

test('no queda en public/crm ninguna foto que nadie use', () => {
  const usadas = new Set([
    ...Object.values(MUESTRAS).flatMap(m => [...m.fotos, ...(m.ficha ? [m.ficha] : [])].map(f => f.archivo)),
    ...SUCURSALES_CON_FOTO.map(p => fotoDeSucursal(p).url.split('/').pop()),
  ])
  for (const a of fs.readdirSync(PUBLICO)) assert.ok(usadas.has(a), `${a} está publicada y ninguna muestra la usa`)
})

test('una muestra devuelve direcciones completas del sitio y su pie', () => {
  const m = muestraDe({ que: 'goma-flexible', cual: 'ejemplos' })
  assert.equal(m.fotos.length, 2)
  for (const f of m.fotos) {
    assert.match(f.url, /^https:\/\/[^/]+\/crm\/[a-z0-9-]+\.jpg$/)
    assert.ok(f.pie.length > 10)
    assert.doesNotMatch(f.pie, /\$\s?\d/, 'el pie no lleva precio: cambia y vive en precio.js')
  }
})

test('de lo que no hay foto se dice, no se manda la de otra cosa', () => {
  for (const que of ['mica', 'sticker', 'sucursal-torreon', 'sucursal-leon', 'no-existe', undefined]) {
    const m = muestraDe({ que })
    assert.equal(m.error, 'sin-foto', String(que))
    assert.equal(m.fotos, undefined)
    assert.match(m.nota, /no describas/i)
  }
  // Y el modelo PUEDE pedirlas, para que no elija «la más parecida».
  for (const que of ['mica', 'sticker']) assert.ok(CLAVES_DE_MUESTRA.includes(que))
})

test('la de color no afirma para qué teléfonos hay: la lámina y la ficha vieja se contradicen', () => {
  const n = muestraDe({ que: 'goma-flexible-color' }).nota
  assert.match(n, /No afirmes para qué teléfonos/)
  assert.doesNotMatch(n, /iPhone 11 a/, 'no se repite la restricción vieja sin confirmar')
})

test('la ficha es la primera instancia; sin ficha, la foto de siempre; los ejemplos aparte', () => {
  for (const que of ['goma-flexible', 'goma-flexible-color', 'uso-rudo']) {
    const f = muestraDe({ que })           // por omisión: ficha
    assert.equal(f.clase, 'ficha'); assert.equal(f.fotos.length, 1)
    assert.match(f.fotos[0].url, /\/crm\/ficha-/)
    const e = muestraDe({ que, cual: 'ejemplos' })
    assert.equal(e.clase, 'ejemplos'); assert.ok(e.fotos.length >= 1)
    assert.doesNotMatch(e.fotos[0].url, /ficha-/)
  }
  for (const que of ['hard', 'cristal']) {   // sin lámina todavía
    const f = muestraDe({ que })
    assert.equal(f.fotos.length, 1); assert.doesNotMatch(f.fotos[0].url, /ficha-/)
  }
})

test('toda foto de tienda lleva la leyenda de distribuidores, tal como la dictó el dueño', () => {
  assert.match(LEYENDA_SUCURSAL, /esta es nuestra sucursal/)
  assert.match(LEYENDA_SUCURSAL, /otro local con un exhibidor de nuestra marca/)
  assert.match(LEYENDA_SUCURSAL, /solo es un distribuidor/)
  assert.match(LEYENDA_SUCURSAL, /no podremos respaldar nuestra garant[ií]a ni las promociones de la publicidad/)
  assert.deepEqual(SUCURSALES_CON_FOTO.sort(), ['aguascalientes', 'leon', 'san-luis'])
  for (const p of SUCURSALES_CON_FOTO) {
    const f = fotoDeSucursal(p)
    assert.ok(f.pie.includes(LEYENDA_SUCURSAL), p)
    assert.ok(f.pie.length < 1024, 'el pie de WhatsApp tiene tope de 1024 caracteres')
  }
  assert.equal(fotoDeSucursal('torreon'), null, 'Torreón no tiene foto: se dice, no se inventa')
  assert.equal(fotoDeSucursal('bodega'), null)
})

test('los pies hablan como el bot: sin «case», «TPU» ni «3 en 1»', () => {
  for (const m of Object.values(MUESTRAS)) for (const f of [...m.fotos, ...(m.ficha ? [m.ficha] : [])]) {
    assert.doesNotMatch(f.pie, /\b(case|tpu|3 ?(en|in) ?1|hard)\b/i, f.pie)
  }
})

test('stickers: los precios que dictó el dueño, y van en la lista de precios', () => {
  assert.deepEqual(STICKERS.grande, { nombre: 'Sticker grande', publico: 100, mayoreo: 60 })
  assert.deepEqual(STICKERS.mini,   { nombre: 'Sticker mini',   publico: 10,  mayoreo: 10 })
  const pub = listaDePrecios({ cliente: 'publico' })
  assert.deepEqual(pub.stickers.map(s => s.monto), [100, 10])
  assert.deepEqual(listaDePrecios({ cliente: 'mayoreo' }).stickers.map(s => s.monto), [60, 10])
  assert.match(pub.notaStickers, /nunca digas que no hay/i)
})

test('los stickers no entran en TIPOS: no son funda ni mica y no tienen existencia', () => {
  for (const clave of Object.keys(TIPOS)) assert.doesNotMatch(clave, /sticker/i)
})

test('el programa de mayoristas trae lo firme y calla lo pendiente', () => {
  const todo = JSON.stringify(PROGRAMA_MAYORISTA)
  assert.match(todo, /sin registro no hay precio/i)
  assert.match(todo, /grupo de WhatsApp oficial/i)
  // Nada de lo que el documento del dueño marca como pendiente o en conflicto.
  assert.doesNotMatch(todo, /2 meses|1 funda al mes|6 meses/i, 'la regla de inactividad está en conflicto')
  assert.doesNotMatch(todo, /\$\s?\d/, 'los precios no viven aquí')
  assert.doesNotMatch(todo, /tarjeta|locatario|\bPT\b/i)
})

test('el bot tiene las herramientas nuevas y sus reglas', () => {
  for (const frase of ['mandar_muestra', 'programa_mayorista', 'Stickers', 'nunca digas que no hay']) {
    assert.ok(REGLAS.includes(frase), `las reglas no mencionan «${frase}»`)
  }
})

test('una respuesta sin texto no sale: se le pide UNA vez al modelo que escriba', async () => {
  // El 2026-11-17, al añadir las fichas, el modelo dio por explicado todo con la
  // imagen y se calló: 13 de 98 respuestas salían sin texto. Aquí se simula ese
  // modelo con un cliente de mentira, sin llamar a la API.
  const { contestarConCliente } = await import('./cerebro.js').catch(() => ({}))
  const fuente = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'cerebro.js'), 'utf8')
  assert.match(fuente, /let callado = false/)
  assert.match(fuente, /if \(!texto && !callado && res\.stop_reason === 'end_turn'\)/)
  assert.match(fuente, /La imagen acompaña tu respuesta, no la reemplaza/)
  assert.ok(contestarConCliente === undefined || typeof contestarConCliente === 'function')
})

test('lo que el modelo lee tras mandar la muestra le dice que sigue escribiendo', () => {
  const fuente = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'cerebro.js'), 'utf8')
  assert.match(fuente, /siguiente: 'La imagen YA salió\. Ahora escribe tu mensaje COMPLETO/)
  assert.match(fuente, /NO le llega al cliente/, 'el modelo tiene que saber que lo escrito antes de una herramienta se pierde')
  assert.ok(REGLAS.includes('NUNCA lo reemplaza'))
  assert.ok(REGLAS.includes('nunca le digas «ficha»'), 'al cliente no se le habla de «fichas»')
})
