// Las fotos de muestra, los stickers y el programa de mayoristas (2026-11-16).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { MUESTRAS, CLAVES_DE_MUESTRA, muestraDe } from './muestras.js'
import { PROGRAMA_MAYORISTA } from './mayoristas-info.js'
import { STICKERS, TIPOS } from './precio.js'
import { listaDePrecios } from './herramientas.js'
import { REGLAS } from './cerebro.js'

const PUBLICO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'crm')

test('cada foto de muestra existe en public/crm, es JPEG y pesa poco', () => {
  for (const [clave, m] of Object.entries(MUESTRAS)) {
    assert.ok(m.fotos.length >= 1 && m.fotos.length <= 2, `${clave}: una o dos fotos, no un álbum`)
    for (const f of m.fotos) {
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
  const usadas = new Set(Object.values(MUESTRAS).flatMap(m => m.fotos.map(f => f.archivo)))
  for (const a of fs.readdirSync(PUBLICO)) assert.ok(usadas.has(a), `${a} está publicada y ninguna muestra la usa`)
})

test('una muestra devuelve direcciones completas del sitio y su pie', () => {
  const m = muestraDe({ que: 'goma-flexible' })
  assert.equal(m.fotos.length, 2)
  for (const f of m.fotos) {
    assert.match(f.url, /^https:\/\/[^/]+\/crm\/[a-z0-9-]+\.jpg$/)
    assert.ok(f.pie.length > 10)
    assert.doesNotMatch(f.pie, /\$\s?\d/, 'el pie no lleva precio: cambia y vive en precio.js')
  }
})

test('de lo que no hay foto se dice, no se manda la de otra cosa', () => {
  for (const que of ['mica', 'sticker', 'sucursal-torreon', 'no-existe', undefined]) {
    const m = muestraDe({ que })
    assert.equal(m.error, 'sin-foto', String(que))
    assert.equal(m.fotos, undefined)
    assert.match(m.nota, /no describas/i)
  }
  // Y el modelo PUEDE pedirlas, para que no elija «la más parecida».
  for (const que of ['mica', 'sticker', 'sucursal-torreon']) assert.ok(CLAVES_DE_MUESTRA.includes(que))
})

test('la de color avisa que sólo es para ciertos iPhone', () => {
  assert.match(muestraDe({ que: 'goma-flexible-color' }).nota, /iPhone 11 a iPhone 12 Pro Max/)
})

test('los pies hablan como el bot: sin «case», «TPU» ni «3 en 1»', () => {
  for (const m of Object.values(MUESTRAS)) for (const f of m.fotos) {
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
