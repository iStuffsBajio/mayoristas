// La herramienta que guarda los secretos del CRM tiene que rechazar lo que no
// tenga su forma: el 2026-11-12 las cuatro llaves se guardaron como texto con
// espacios y nada lo avisó.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { problemaDe, SECRETOS } from '../scripts/poner-secreto.js'

const buenos = {
  ANTHROPIC_API_KEY: 'sk-ant-' + 'a1B2c3'.repeat(10),
  WHATSAPP_TOKEN: 'EAA' + 'xY9z'.repeat(20),
  META_APP_SECRET: '0123456789abcdef0123456789abcdef',
  META_VERIFY_TOKEN: 'una-frase-larga-de-prueba-123',
}

test('acepta un valor con la forma correcta de cada secreto', () => {
  for (const [nombre, valor] of Object.entries(buenos)) {
    assert.equal(problemaDe(nombre, valor), null, nombre)
  }
})

test('cubre exactamente los cuatro secretos del CRM', () => {
  assert.deepEqual(Object.keys(SECRETOS).sort(), Object.keys(buenos).sort())
})

test('rechaza texto con espacios, que es lo que se guardó mal', () => {
  for (const nombre of Object.keys(buenos)) {
    const malo = 'Poner istuffs-backend ' + nombre
    assert.match(problemaDe(nombre, malo), /espacios/, nombre)
  }
})

test('rechaza lo vacío y lo que no tiene la forma', () => {
  assert.match(problemaDe('ANTHROPIC_API_KEY', ''), /vacío/)
  assert.match(problemaDe('ANTHROPIC_API_KEY', 'EAAsoyotrotoken' + 'x'.repeat(60)), /forma/)
  assert.match(problemaDe('META_APP_SECRET', 'abc123'), /forma/)
  assert.match(problemaDe('META_APP_SECRET', 'z'.repeat(32)), /forma/)
  assert.match(problemaDe('WHATSAPP_TOKEN', 'sk-ant-' + 'a'.repeat(60)), /forma/)
})

test('un nombre que no conoce no pasa', () => {
  assert.match(problemaDe('OTRA_COSA', 'x'.repeat(40)), /no es un secreto/)
})

test('el mensaje de rechazo no repite el valor', () => {
  const valor = 'sk-ant-secreto-con espacio'
  assert.doesNotMatch(problemaDe('ANTHROPIC_API_KEY', valor), /secreto-con/)
})
