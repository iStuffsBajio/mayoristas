// El orquestador y el almacén, probados sin Meta y sin el modelo.
//
// `pensar` y `enviar` se inyectan, así que aquí se fija la mecánica —qué llega
// al modelo, qué no, qué se guarda y en qué orden— sin gastar un peso ni
// mandarle un mensaje a nadie.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  atender, atenderCarga, plazaDelRef, resolverPlaza, RESPUESTAS_FIJAS,
} from './atender.js'
import {
  enMemoria, caducada, recortarHistorial, conAnuncio, DIAS_DE_VIDA, MAX_TURNOS,
} from './conversaciones.js'

// ── Ayudas ──────────────────────────────────────────────────────────────────

const mensaje = (extra = {}) => ({
  id: 'wamid.' + Math.random().toString(36).slice(2),
  de: '524771234567',
  nombre: 'Marisol',
  tipo: 'text',
  atendible: true,
  texto: 'tienes para iphone 13?',
  anuncio: null,
  ...extra,
})

/** Un `pensar` de mentira que apunta con qué lo llamaron. */
function pensarFalso(respuesta = {}) {
  const llamadas = []
  const pensar = async args => {
    llamadas.push(args)
    return {
      texto: 'sí, tengo 3 piezas',
      imagenes: [],
      entrega: null,
      historial: [...(args.historial ?? []), { role: 'user', content: args.entrada }, { role: 'assistant', content: 'ok' }],
      uso: { entrada: 100, salida: 20, cacheLeido: 0 },
      ...respuesta,
    }
  }
  return { pensar, llamadas }
}

function enviarFalso() {
  const enviados = []
  return { enviar: async (a, r) => { enviados.push({ a, r }); return { enviados: [], fallos: [] } }, enviados }
}

const leerFalso = () => { const ids = []; return { leer: async id => { ids.push(id) }, ids } }

// ── La plaza del anuncio ────────────────────────────────────────────────────

test('la plaza se saca del ref del anuncio, que es gratis y exacto', () => {
  assert.equal(plazaDelRef('plaza=leon'), 'leon')
  assert.equal(plazaDelRef('leon'), 'leon')
  assert.equal(plazaDelRef('camp-oct-san-luis-tpu'), 'san-luis')
  assert.equal(plazaDelRef('PLAZA=AGUASCALIENTES'), 'aguascalientes')
  // Quien lo teclee en el panel de Meta lo va a escribir como le salga.
  assert.equal(plazaDelRef('plaza=san luis'), 'san-luis')
  assert.equal(plazaDelRef('plaza=san_luis'), 'san-luis')
})

test('un ref que no dice plaza no inventa una', () => {
  for (const r of ['', null, undefined, 'campaña-octubre', 'torreon', 'bodega']) {
    assert.equal(plazaDelRef(r), null, `"${r}" no debe resolver plaza`)
  }
})

test('la plaza ya sabida gana sobre la del anuncio', () => {
  // Si la persona ya dijo que es de Aguascalientes, no se le reasigna porque
  // volvió a entrar por un anuncio de León.
  const c = { plaza: 'aguascalientes' }
  assert.equal(resolverPlaza(c, { ref: 'plaza=leon' }), 'aguascalientes')
})

test('sin plaza sabida ni ref, no se resuelve y el cerebro pregunta', () => {
  assert.equal(resolverPlaza({ plaza: null }, null), null)
  assert.equal(resolverPlaza({ plaza: null }, { ref: 'campaña' }), null)
  // Una plaza guardada que ya no atiende tampoco vale.
  assert.equal(resolverPlaza({ plaza: 'ferias' }, null), null)
})

// ── El almacén ──────────────────────────────────────────────────────────────

test('una conversación nueva viene vacía y sin plaza', async () => {
  const a = enMemoria()
  const c = await a.obtener('52477')
  assert.deepEqual(c.historial, [])
  assert.equal(c.plaza, null)
  assert.equal(c.anuncio, null)
})

test('lo guardado se recupera', async () => {
  const a = enMemoria()
  await a.guardar({ telefono: '52477', plaza: 'leon', nombre: 'Ana', historial: [{ role: 'user', content: 'hola' }] })
  const c = await a.obtener('52477')
  assert.equal(c.plaza, 'leon')
  assert.equal(c.nombre, 'Ana')
  assert.equal(c.historial.length, 1)
})

test('una conversación vieja caduca y se arranca de cero', async () => {
  const hace10dias = new Date(Date.now() - 10 * 86400000).toISOString()
  assert.equal(caducada({ vista: hace10dias }), true)
  assert.equal(caducada({ vista: new Date().toISOString() }), false)
  assert.equal(caducada({}), true)

  const a = enMemoria()
  await a.guardar({ telefono: '52477', plaza: 'leon', historial: [{ role: 'user', content: 'x' }] })
  a._datos.get('52477').vista = hace10dias
  const c = await a.obtener('52477')
  assert.equal(c.plaza, null, 'quien vuelve tras ' + DIAS_DE_VIDA + ' días viene por otra cosa')
  assert.deepEqual(c.historial, [])
})

test('el anuncio se guarda una vez y el primero manda', () => {
  const primero = { anuncio: 'AD1', ref: 'plaza=leon' }
  const c = conAnuncio({ anuncio: null }, primero)
  assert.deepEqual(c.anuncio, primero)
  // Volver a entrar por otro anuncio no le quita la venta al que la trajo.
  const igual = conAnuncio(c, { anuncio: 'AD2' })
  assert.equal(igual.anuncio.anuncio, 'AD1')
  // Y un mensaje sin anuncio no borra el que ya había.
  assert.equal(conAnuncio(c, null).anuncio.anuncio, 'AD1')
})

// ── El recorte del historial ────────────────────────────────────────────────

test('el historial se recorta por delante', () => {
  const h = Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }))
  const r = recortarHistorial(h, 10)
  assert.ok(r.length <= 10)
  assert.equal(r[0].role, 'user', 'tiene que empezar en un turno de usuario')
})

test('el recorte nunca parte un tool_use de sus tool_result', () => {
  // Si el corte cae entre los dos, la API rechaza la petición entera con un
  // 400 y el cliente no recibe nada.
  const h = [
    { role: 'user', content: 'viejo' },
    { role: 'assistant', content: 'r' },
    { role: 'user', content: 'busca a06' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'buscar', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }] },
    { role: 'assistant', content: 'hay 8' },
  ]
  const r = recortarHistorial(h, 3)
  assert.equal(r[0].role, 'user')
  const primeroEsResultado = Array.isArray(r[0].content) && r[0].content.some(b => b.type === 'tool_result')
  assert.equal(primeroEsResultado, false, 'no puede empezar con tool_result huérfano')
  // Conserva 4 de los 6 aunque se pidieran 3: quedarse válido con un turno de
  // más vale más que tirar la conversación entera.
  assert.equal(r.length, 4)
  assert.equal(r[0].content, 'busca a06')
})

test('el recorte no conserva el doble de lo pedido para quedarse válido', () => {
  // Si el único corte limpio está muy atrás, se corta por delante y se
  // conserva menos, en vez de arrastrar toda la conversación.
  const h = [
    { role: 'user', content: 'el unico corte limpio, muy atras' },
    ...Array.from({ length: 20 }, (_, i) => ([
      { role: 'assistant', content: [{ type: 'tool_use', id: 't' + i, name: 'b', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't' + i, content: '{}' }] },
    ])).flat(),
    { role: 'user', content: 'reciente' },
    { role: 'assistant', content: 'ok' },
  ]
  const r = recortarHistorial(h, 4)
  assert.ok(r.length <= 8, `conservó ${r.length}, debería quedarse cerca de 4`)
  assert.equal(r[0].content, 'reciente', 'se va al corte limpio de adelante')
})

test('sin corte limpio se empieza de cero antes que mandar algo que la API rechaza', () => {
  const h = [
    { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'b', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }] },
    { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'b', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: '{}' }] },
  ]
  assert.deepEqual(recortarHistorial(h, 2), [])
})

test('un historial corto no se toca', () => {
  const h = [{ role: 'user', content: 'hola' }]
  assert.equal(recortarHistorial(h, MAX_TURNOS), h)
  assert.deepEqual(recortarHistorial(null), [])
})

// ── Repetidos ───────────────────────────────────────────────────────────────

test('un mensaje repetido no se contesta dos veces', async () => {
  const almacen = enMemoria()
  const p = pensarFalso(), e = enviarFalso(), l = leerFalso()
  const m = mensaje()

  const uno = await atender(m, { almacen, ...p, ...e, ...l, pensar: p.pensar, enviar: e.enviar, leer: l.leer })
  assert.equal(uno.motivo, 'contestado')

  const dos = await atender(m, { almacen, pensar: p.pensar, enviar: e.enviar, leer: l.leer })
  assert.equal(dos.atendido, false)
  assert.equal(dos.motivo, 'repetido')
  assert.equal(e.enviados.length, 1, 'al cliente le llegó una sola vez')
  assert.equal(p.llamadas.length, 1, 'y el modelo corrió una sola vez')
})

test('el descarte de repetidos sobrevive al reinicio del proceso', async () => {
  // Va guardado con la conversación, no en una lista en memoria: dos
  // invocaciones de la Lambda no comparten proceso.
  const almacen = enMemoria()
  const m = mensaje()
  assert.equal(await almacen.yaAtendido(m.de, m.id), false)
  assert.equal(await almacen.yaAtendido(m.de, m.id), true)
})

// ── Lo que no gasta modelo ──────────────────────────────────────────────────

test('una nota de voz se contesta fijo, sin gastar modelo', async () => {
  const almacen = enMemoria()
  const p = pensarFalso(), e = enviarFalso(), l = leerFalso()

  const r = await atender(mensaje({ tipo: 'audio', atendible: false, texto: null }),
    { almacen, pensar: p.pensar, enviar: e.enviar, leer: l.leer })

  assert.equal(r.motivo, 'respuesta-fija')
  assert.equal(p.llamadas.length, 0, 'un audio no necesita que nadie piense')
  assert.equal(e.enviados[0].r.texto, RESPUESTAS_FIJAS.audio)
  assert.match(e.enviados[0].r.texto, /modelo/, 'tiene que decir qué hacer en su lugar')
})

test('cada tipo que no se lee tiene su propia salida', async () => {
  for (const tipo of ['audio', 'video', 'image', 'document', 'sticker', 'location', 'contacts']) {
    const almacen = enMemoria(), e = enviarFalso(), p = pensarFalso()
    await atender(mensaje({ tipo, atendible: false, texto: null }),
      { almacen, pensar: p.pensar, enviar: e.enviar, leer: async () => {} })
    assert.equal(e.enviados[0].r.texto, RESPUESTAS_FIJAS[tipo], tipo)
    assert.equal(p.llamadas.length, 0, tipo + ' no debe gastar modelo')
  }
})

test('un tipo que Meta estrene mañana cae en la salida genérica, no en blanco', async () => {
  const almacen = enMemoria(), e = enviarFalso()
  await atender(mensaje({ tipo: 'reaction', atendible: false, texto: null }),
    { almacen, pensar: pensarFalso().pensar, enviar: e.enviar, leer: async () => {} })
  assert.equal(e.enviados[0].r.texto, RESPUESTAS_FIJAS.unknown)
})

// ── Las palomitas ───────────────────────────────────────────────────────────

test('se marca leído antes de pensar', async () => {
  const almacen = enMemoria(), e = enviarFalso()
  const orden = []
  await atender(mensaje({ id: 'wamid.ORDEN' }), {
    almacen,
    leer:   async id => { orden.push('leido:' + id) },
    pensar: async a => { orden.push('pensado'); return { texto: 'ok', imagenes: [], historial: [], uso: {} } },
    enviar: async (...a) => { orden.push('mandado'); return e.enviar(...a) },
  })
  assert.deepEqual(orden, ['leido:wamid.ORDEN', 'pensado', 'mandado'])
})

test('si falla marcar leído, el mensaje se contesta igual', async () => {
  const almacen = enMemoria(), e = enviarFalso(), p = pensarFalso()
  const r = await atender(mensaje(), {
    almacen, pensar: p.pensar, enviar: e.enviar,
    leer: async () => { throw new Error('token vencido') },
  })
  assert.equal(r.motivo, 'contestado', 'las palomitas son cosméticas')
  assert.equal(e.enviados.length, 1)
})

// ── El contexto que recibe el modelo ────────────────────────────────────────

test('al modelo se le pasa la plaza ya sabida para que no la repregunte', async () => {
  const almacen = enMemoria()
  await almacen.guardar({ telefono: '524771234567', plaza: 'leon', nombre: 'Ana', historial: [] })
  const p = pensarFalso(), e = enviarFalso()

  await atender(mensaje(), { almacen, pensar: p.pensar, enviar: e.enviar, leer: async () => {} })

  assert.equal(p.llamadas[0].contexto.plaza, 'leon')
  assert.equal(p.llamadas[0].contexto.nombre, 'Ana')
})

test('la plaza del anuncio se resuelve sin preguntar nada', async () => {
  const almacen = enMemoria()
  const p = pensarFalso(), e = enviarFalso()

  await atender(mensaje({ anuncio: { anuncio: 'AD1', ref: 'plaza=san-luis', titular: 'Fundas', cuerpo: 'Desde $250' } }),
    { almacen, pensar: p.pensar, enviar: e.enviar, leer: async () => {} })

  assert.equal(p.llamadas[0].contexto.plaza, 'san-luis')
  assert.equal(p.llamadas[0].contexto.deAnuncio, 'Fundas — Desde $250')
  assert.equal((await almacen.obtener('524771234567')).plaza, 'san-luis', 'y queda guardada')
})

test('al modelo no se le pasa el identificador de conversión', async () => {
  const almacen = enMemoria(), p = pensarFalso(), e = enviarFalso()
  await atender(mensaje({ anuncio: { anuncio: 'AD1', titular: 'Fundas', ctwaClid: 'ClId999' } }),
    { almacen, pensar: p.pensar, enviar: e.enviar, leer: async () => {} })
  assert.doesNotMatch(String(p.llamadas[0].contexto.deAnuncio), /ClId999/)
  // Pero sí se guarda: es lo que Meta pide de vuelta para atribuir la venta.
  assert.equal((await almacen.obtener('524771234567')).anuncio.ctwaClid, 'ClId999')
})

// ── Guardar ─────────────────────────────────────────────────────────────────

test('el historial se guarda con las llamadas a herramientas dentro', async () => {
  const almacen = enMemoria(), e = enviarFalso()
  const historial = [
    { role: 'user', content: 'tienes a06?' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'buscar_existencias', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"hayPiezas":[]}' }] },
    { role: 'assistant', content: 'hay 8' },
  ]
  const p = pensarFalso({ historial })

  await atender(mensaje(), { almacen, pensar: p.pensar, enviar: e.enviar, leer: async () => {} })

  const c = await almacen.obtener('524771234567')
  assert.equal(c.historial.length, 4)
  const hayHerramienta = c.historial.some(m =>
    Array.isArray(m.content) && m.content.some(b => b.type === 'tool_use'))
  assert.equal(hayHerramienta, true, 'sin ellas el modelo vuelve a consultar o se inventa el número')
})

test('un lead entregado queda apuntado en la conversación', async () => {
  const almacen = enMemoria(), e = enviarFalso()
  const p = pensarFalso({
    entrega: { plaza: 'leon', nombrePlaza: 'León', numero: '524776639890', enlace: 'https://wa.me/524776639890?text=x' },
  })

  const r = await atender(mensaje(), { almacen, pensar: p.pensar, enviar: e.enviar, leer: async () => {} })

  assert.equal(r.lead.plaza, 'leon')
  const c = await almacen.obtener('524771234567')
  assert.equal(c.ultimoLead.plaza, 'leon')
  assert.ok(c.ultimoLead.cuando)
})

test('si el envío falla, el turno no se da por hablado', async () => {
  const almacen = enMemoria()
  const p = pensarFalso({ historial: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }] })

  await assert.rejects(() => atender(mensaje(), {
    almacen, pensar: p.pensar, leer: async () => {},
    enviar: async () => { throw new Error('ventana de 24h cerrada') },
  }), /ventana de 24h/)

  const c = await almacen.obtener('524771234567')
  assert.deepEqual(c.historial, [], 'el turno no se guardó porque no llegó')
})

test('un turno que falla se puede reintentar: no queda marcado como repetido', async () => {
  // Salió en el simulador. El descarte de repetidos va ANTES de contestar
  // —si no, Meta reintenta y llegan dos respuestas—, y eso dejaba los fallos
  // marcados como atendidos: el reintento se descartaba y la persona no
  // recibía nada nunca.
  const almacen = enMemoria()
  const m = mensaje()
  let intentos = 0
  const pensar = async args => {
    if (intentos++ === 0) throw new Error('inventario caído')
    return { texto: 'ya quedó', imagenes: [], historial: [], uso: {} }
  }
  const e = enviarFalso()

  await assert.rejects(
    () => atender(m, { almacen, pensar, enviar: e.enviar, leer: async () => {} }),
    /inventario caído/)

  // El reintento de Meta trae el MISMO id y ahora sí tiene que pasar.
  const r = await atender(m, { almacen, pensar, enviar: e.enviar, leer: async () => {} })
  assert.equal(r.motivo, 'contestado', 'el reintento no debe salir «repetido»')
  assert.equal(e.enviados.length, 1, 'y al cliente le llega una sola vez')
})

test('un turno que salió bien sí queda marcado', async () => {
  const almacen = enMemoria(), e = enviarFalso(), p = pensarFalso()
  const m = mensaje()
  await atender(m, { almacen, pensar: p.pensar, enviar: e.enviar, leer: async () => {} })
  const otra = await atender(m, { almacen, pensar: p.pensar, enviar: e.enviar, leer: async () => {} })
  assert.equal(otra.motivo, 'repetido')
})

// ── Turnos que salen mal ────────────────────────────────────────────────────

test('un turno sin texto deja una salida, no un silencio', async () => {
  for (const [caso, extra] of [
    ['rechazado', { texto: null, rechazado: true }],
    ['se-atoro',  { texto: null, seAtoro: true }],
  ]) {
    const almacen = enMemoria(), e = enviarFalso()
    const p = pensarFalso(extra)
    const r = await atender(mensaje(), { almacen, pensar: p.pensar, enviar: e.enviar, leer: async () => {} })
    assert.equal(r.motivo, caso)
    assert.ok(e.enviados[0].r.texto.length > 0, 'no se manda nada en blanco')
    assert.match(e.enviados[0].r.texto, /tienda/)
    // Y el turno roto no se arrastra al siguiente mensaje.
    assert.deepEqual((await almacen.obtener('524771234567')).historial, [])
  }
})

// ── Una carga con varios mensajes ───────────────────────────────────────────

test('dos mensajes del mismo teléfono se atienden en orden, no a la vez', async () => {
  // La gente manda «hola» y «tienes para iphone 13?» seguidos, y Meta los
  // entrega en la misma llamada. En paralelo, el segundo pisaría el historial
  // del primero.
  const almacen = enMemoria(), e = enviarFalso()
  const vistos = []
  const pensar = async args => {
    vistos.push({ entrada: args.entrada, largoHistorial: args.historial.length })
    return {
      texto: 'ok', imagenes: [], entrega: null,
      historial: [...args.historial, { role: 'user', content: args.entrada }, { role: 'assistant', content: 'ok' }],
      uso: {},
    }
  }

  await atenderCarga([
    mensaje({ id: 'w1', texto: 'hola' }),
    mensaje({ id: 'w2', texto: 'tienes para iphone 13?' }),
  ], { almacen, pensar, enviar: e.enviar, leer: async () => {} })

  assert.deepEqual(vistos.map(v => v.entrada), ['hola', 'tienes para iphone 13?'])
  assert.equal(vistos[0].largoHistorial, 0)
  assert.equal(vistos[1].largoHistorial, 2, 'el segundo ve lo que contestó el primero')
})

test('un mensaje que revienta no tumba los demás de la carga', async () => {
  const almacen = enMemoria(), e = enviarFalso()
  let n = 0
  const pensar = async args => {
    if (n++ === 0) throw new Error('inventario caído')
    return { texto: 'ok', imagenes: [], historial: [], uso: {} }
  }

  const r = await atenderCarga([
    mensaje({ id: 'w1', de: '521' }),
    mensaje({ id: 'w2', de: '522' }),
  ], { almacen, pensar, enviar: e.enviar, leer: async () => {} })

  assert.equal(r[0].motivo, 'error')
  assert.match(r[0].error, /inventario caído/)
  assert.equal(r[1].motivo, 'contestado', 'el segundo se atendió igual')
})

test('un mensaje sin remitente se descarta sin tocar nada', async () => {
  const almacen = enMemoria(), e = enviarFalso()
  const r = await atender({ id: 'x', de: null }, { almacen, enviar: e.enviar })
  assert.equal(r.atendido, false)
  assert.equal(r.motivo, 'sin-remitente')
  assert.equal(e.enviados.length, 0)
})

// ── La bandeja del CRM ──────────────────────────────────────────────────────

import { bandejaEnMemoria } from './bandeja.js'
import { aplicarAccion } from '../backend/src/clientes.js'

test('cada mensaje queda en la ficha del cliente, con lo que contestó el bot', async () => {
  const bandeja = bandejaEnMemoria()
  const { pensar } = pensarFalso()
  await atender(mensaje({ texto: 'hola' }), { almacen: enMemoria(), bandeja, pensar, enviar: enviarFalso().enviar, leer: leerFalso().leer })
  const c = await bandeja.leer('wa:524771234567')
  assert.equal(c.nombre, 'Marisol')
  assert.deepEqual(c.mensajes.map(m => [m.de, m.texto]), [['cliente', 'hola'], ['bot', 'sí, tengo 3 piezas']])
  assert.equal(c.estado, 'bot')
})

test('cuando el bot entrega el lead, la conversación queda pendiente en esa plaza', async () => {
  const bandeja = bandejaEnMemoria()
  const { pensar } = pensarFalso({ entrega: { plaza: 'san-luis', enlace: 'https://wa.me/x' } })
  await atender(mensaje(), { almacen: enMemoria(), bandeja, pensar, enviar: enviarFalso().enviar, leer: leerFalso().leer })
  const c = await bandeja.leer('wa:524771234567')
  assert.equal(c.estado, 'pendiente')
  assert.equal(c.plaza, 'san-luis')
  assert.equal(c.bitacora.at(-1).quien, 'bot')
})

test('con la tienda atendiendo, el bot apunta el mensaje y NO contesta ni piensa', async () => {
  const bandeja = bandejaEnMemoria()
  const almacen = enMemoria()
  const p = pensarFalso({ entrega: { plaza: 'leon', enlace: 'x' } })
  await atender(mensaje({ texto: 'quiero la del A06' }), { almacen, bandeja, pensar: p.pensar, enviar: enviarFalso().enviar, leer: leerFalso().leer })
  // La tienda la toma desde el panel.
  await bandeja.modificar('wa:524771234567', c => aplicarAccion(c, { accion: 'tomar' }, { quien: 'leon' }).cliente)

  const e = enviarFalso()
  const r = await atender(mensaje({ texto: '¿me la apartan?' }), { almacen, bandeja, pensar: p.pensar, enviar: e.enviar, leer: leerFalso().leer })
  assert.equal(r.motivo, 'lo-atiende-la-tienda')
  assert.equal(e.enviados.length, 0, 'el bot se calla')
  assert.equal(p.llamadas.length, 1, 'y no gasta modelo')
  const c = await bandeja.leer('wa:524771234567')
  assert.equal(c.mensajes.at(-1).texto, '¿me la apartan?')
  assert.equal(c.noLeidos, 1, 'la tienda tiene algo que leer')
})

test('el anuncio que trajo al cliente queda en su ficha, con lo que Meta pide para atribuir la venta', async () => {
  const bandeja = bandejaEnMemoria()
  const anuncio = { anuncio: '120', titular: 'Fundas A06', ref: 'plaza=leon', ctwaClid: 'clid-123' }
  await atender(mensaje({ anuncio }), { almacen: enMemoria(), bandeja, pensar: pensarFalso().pensar, enviar: enviarFalso().enviar, leer: leerFalso().leer })
  const c = await bandeja.leer('wa:524771234567')
  assert.equal(c.origen.fuente, 'meta')
  assert.equal(c.origen.ctwaClid, 'clid-123')
  assert.equal(c.plaza, 'leon', 'la plaza del anuncio llega a la ficha')
})

test('si la bandeja falla, el cliente recibe su respuesta igual', async () => {
  const rota = { modificar: async () => { throw new Error('S3 caído') } }
  const e = enviarFalso()
  const r = await atender(mensaje(), {
    almacen: enMemoria(), bandeja: rota, pensar: pensarFalso().pensar, enviar: e.enviar, leer: leerFalso().leer,
  })
  assert.equal(r.motivo, 'contestado')
  assert.equal(e.enviados.length, 1)
})

test('una nota de voz también queda en la ficha, como lo que fue', async () => {
  const bandeja = bandejaEnMemoria()
  await atender(mensaje({ tipo: 'audio', atendible: false, texto: null }), { almacen: enMemoria(), bandeja, enviar: enviarFalso().enviar, leer: leerFalso().leer })
  const c = await bandeja.leer('wa:524771234567')
  assert.equal(c.mensajes[0].texto, '[audio]')
  assert.equal(c.mensajes[1].de, 'bot')
})
