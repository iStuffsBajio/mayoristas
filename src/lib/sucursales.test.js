import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SUCURSALES_CONSULTA, SUCURSALES_TIENDA, SUCURSALES_ACTIVAS } from './sucursales.js'

const slugs = lista => lista.map(s => s.slug)

test('la consulta pública enseña Torreón; el panel sigue sin contarla', () => {
  assert.deepEqual(slugs(SUCURSALES_CONSULTA), ['leon', 'san-luis', 'aguascalientes', 'torreon'])
  // Surtido, Inventarios, Revisar y el Dashboard suman con estas: Torreón
  // entra en la portada del mayorista, no en las cuentas de las tiendas.
  assert.ok(!slugs(SUCURSALES_TIENDA).includes('torreon'))
  assert.ok(!slugs(SUCURSALES_ACTIVAS).includes('torreon'))
})

test('la consulta pública nunca enseña bodega ni ferias', () => {
  for (const interna of ['bodega', 'ferias']) assert.ok(!slugs(SUCURSALES_CONSULTA).includes(interna), interna)
})
