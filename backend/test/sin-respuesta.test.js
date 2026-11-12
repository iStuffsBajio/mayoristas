// La marca de «sin respuesta»: lo que hace que un cliente al que el bot no
// pudo contestarle se VEA en el panel en vez de quedarse esperando.
//
// La pone el trabajador del bot (`crm/trabajador.js`) al agotar los
// reintentos. Aquí se fija la regla; que el trabajador la use y que el panel
// la pinte se comprueba en `crm/produccion.test.js` y en `npm run verificar`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as CRM from '../src/clientes.js'

const AHORA = Date.parse('2026-11-11T18:00:00Z')

function cliente(extra = {}) {
  let c = CRM.nuevoCliente({ id: CRM.idDe({ canal: 'whatsapp', telefono: '4771234567' }), canal: 'whatsapp', telefono: '4771234567', quien: 'bot', ...extra }, { ahora: AHORA })
  return CRM.registrarMensaje(c, { de: 'cliente', texto: '¿tienes para iphone 13?', id: 'wamid.1' }, { ahora: AHORA })
}

test('marcar deja desde cuándo espera, por qué, y un renglón en la bitácora', () => {
  const c = CRM.marcarSinRespuesta(cliente(), { motivo: 'el bot falló 3 veces', mensaje: 'wamid.1' }, { ahora: AHORA + 60000 })
  assert.deepEqual(c.sinRespuesta, { desde: '2026-11-11T18:01:00.000Z', motivo: 'el bot falló 3 veces', mensaje: 'wamid.1' })
  assert.equal(c.bitacora.at(-1).accion, 'sin respuesta')
  assert.equal(c.bitacora.at(-1).quien, 'sistema')
})

test('NO cambia el estado: el bot puede contestar el siguiente mensaje', () => {
  const c = CRM.marcarSinRespuesta(cliente())
  assert.equal(c.estado, 'bot')
  assert.equal(CRM.botContesta(c), true)
})

test('marcar dos veces conserva la primera hora: importa desde cuándo espera', () => {
  const uno = CRM.marcarSinRespuesta(cliente(), {}, { ahora: AHORA })
  const dos = CRM.marcarSinRespuesta(uno, { motivo: 'otra vez' }, { ahora: AHORA + 3600000 })
  assert.equal(dos, uno)
})

test('se quita cuando contesta el bot o la tienda, y NO cuando el cliente vuelve a escribir', () => {
  const marcado = CRM.marcarSinRespuesta(cliente())
  assert.ok(CRM.registrarMensaje(marcado, { de: 'cliente', texto: '¿hola?', id: 'wamid.2' }).sinRespuesta)
  assert.equal(CRM.registrarMensaje(marcado, { de: 'bot', texto: 'Sí hay' }).sinRespuesta, undefined)
  assert.equal(CRM.registrarMensaje(marcado, { de: 'tienda', texto: 'Sí hay', quien: 'leon' }).sinRespuesta, undefined)
})

test('cerrar la conversación también la quita: ya se resolvió por otro lado', () => {
  const r = CRM.aplicarAccion(CRM.marcarSinRespuesta(cliente()), { accion: 'cerrar' }, { quien: 'leon' })
  assert.equal(r.cliente.sinRespuesta, undefined)
  assert.equal(r.cliente.estado, 'cerrada')
})

test('tomarla NO la quita: tomar no es contestar', () => {
  const r = CRM.aplicarAccion(CRM.marcarSinRespuesta(cliente({ plaza: 'leon' })), { accion: 'tomar' }, { quien: 'leon' })
  assert.ok(r.cliente.sinRespuesta)
})

test('en la bandeja va ANTES que lo pendiente, y se cuenta', () => {
  const pendiente = CRM.resumen(CRM.aplicarAccion(cliente(), { accion: 'entregar', plaza: 'leon' }, { quien: 'bot' }).cliente)
  const otro = { ...cliente(), id: 'wa:524770000000' }
  const sinResp = CRM.resumen(CRM.marcarSinRespuesta(otro, {}, { ahora: AHORA }))
  const masViejo = CRM.resumen(CRM.marcarSinRespuesta({ ...otro, id: 'wa:524770000001' }, {}, { ahora: AHORA - 3600000 }))

  const orden = CRM.ordenarBandeja([pendiente, sinResp, masViejo]).map(r => r.id)
  // El que más lleva sin respuesta, primero; lo pendiente, después.
  assert.deepEqual(orden, ['wa:524770000001', 'wa:524770000000', pendiente.id])
  assert.equal(CRM.contar([pendiente, sinResp, masViejo]).sinRespuesta, 2)
  assert.equal(pendiente.sinRespuesta, null)
})
