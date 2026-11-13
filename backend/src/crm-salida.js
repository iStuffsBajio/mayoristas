// Contestarle a un cliente desde el panel: guardar, y que salga por WhatsApp.
//
// Vive aparte de `index.js` para poder probarlo entero —con un S3 y una cola
// de mentira— sin levantar la Lambda. `index.js` sólo comprueba la sesión y
// delega.
//
// ── Cómo sale por WhatsApp ──────────────────────────────────────────────────
//
// Este servidor NO manda: guarda el mensaje como `pendiente` y lo encola. Lo
// manda el trabajador (`crm/trabajador.js`), que es quien tiene el token de
// Meta, y él apunta en la ficha si salió (`enviado`) o no (`fallido`, con el
// motivo). Un secreto en dos funciones son dos sitios donde rotarlo.
//
// El orden es guardar y DESPUÉS encolar, no al revés: el trabajador busca el
// mensaje en la ficha para mandarlo, y si llegara antes de que exista lo
// daría por borrado. Si encolar falla, el mensaje ya guardado se marca
// `fallido` en el momento: nunca queda un «pendiente» que nadie va a mandar.
//
// ── La ventana de 24 horas ──────────────────────────────────────────────────
//
// Pasadas 24 horas del último mensaje del cliente, Meta sólo acepta
// plantillas. Entonces NO se guarda nada y se contesta 409 con el motivo: un
// mensaje guardado en la conversación se lee como dicho, y no se dijo.
//
// ── Contestar es tomar ──────────────────────────────────────────────────────
//
// Si la conversación estaba pendiente o con el bot, queda a nombre de quien
// contestó y el bot se calla. Eso no cambió.

import crypto from 'node:crypto'
import * as CRM from './clientes.js'

/**
 * La ficha, con lo que la pantalla necesita para la caja de respuesta: si se
 * le puede escribir ahora y, si no, por qué. Lo calcula el servidor con SU
 * reloj: la ventana de 24 horas no puede depender de la hora del navegador.
 * `cola` dice si este servidor tiene por dónde mandar.
 */
export const conSalida = (cliente, { cola, ahora } = {}) => ({
  cliente,
  salida: { ...CRM.salidaDe(cliente, { ahora }), cola: !!cola },
})

/** A dónde se le manda: su teléfono o, si WhatsApp no lo da, su identificador. */
export const destinoDe = c => c?.telefono || c?.usuario || null

/**
 * Lo que hace `POST /crm/responder`, sin la sesión.
 *
 * `modificarCliente` es el de `clientes-s3.js`. `encolar(trabajo)` pone el
 * trabajo en la cola y LANZA si no pudo; sin él (`null`) no hay por dónde
 * mandar y el mensaje se guarda como nota, diciéndolo.
 *
 * Devuelve `{ codigo, cuerpo }`.
 */
export async function responderDesdeElPanel({
  sesion, quien, id, texto, modificarCliente, encolar = null,
  ahora, idEnvio = `p:${crypto.randomUUID()}`, registro = console,
}) {
  const t = String(texto ?? '').trim()
  if (!t) return { codigo: 400, cuerpo: { error: 'Escribe algo antes de mandar.' } }
  if (t.length > CRM.MAX_TEXTO) return { codigo: 400, cuerpo: { error: 'El mensaje es demasiado largo.' } }
  const cola = typeof encolar === 'function'
  const con = c => conSalida(c, { cola, ahora })

  let envio = null, destino = null
  const r = await modificarCliente(String(id ?? ''), c => {
    if (!CRM.puedeVer(sesion, c)) return { error: 'No existe ese cliente.', codigo: 404 }
    const salida = CRM.salidaDe(c, { ahora })
    // Sin ventana no se guarda: ver la cabecera.
    if (!salida.puede && salida.codigo !== 'sin-canal') return { error: salida.motivo, codigo: 409, salida }
    let sig = c
    if (c.estado !== 'atendiendo' || c.atiende !== quien) {
      const tomada = CRM.aplicarAccion(c, { accion: 'tomar' }, { quien, ahora })
      if (tomada.error) return tomada
      sig = tomada.cliente
    }
    envio = salida.puede && cola ? 'pendiente' : 'sin-canal'
    destino = destinoDe(c)
    const motivo = envio === 'pendiente' ? null
      : salida.puede ? 'el servidor no tiene configurada la cola de envío' : 'el cliente no tiene WhatsApp registrado'
    return { cliente: CRM.registrarMensaje(sig, { de: 'tienda', texto: t, quien, id: idEnvio, envio, motivo }, { ahora }) }
  })
  if (r.error) return { codigo: r.codigo, cuerpo: { error: r.error, ...(r.salida && { salida: r.salida }) } }

  if (envio !== 'pendiente') {
    return {
      codigo: 200,
      cuerpo: {
        ok: true, ...con(r.cliente), enviado: false,
        aviso: CRM.salidaDe(r.cliente, { ahora }).puede
          ? 'Quedó guardado, pero NO salió por WhatsApp: a este servidor le falta la cola de envío (CRM_COLA_URL). Avisa al administrador.'
          : 'Quedó guardado como nota. No salió por WhatsApp: este cliente no tiene WhatsApp registrado.',
      },
    }
  }

  try {
    await encolar({ para: destino, cuerpo: t, cliente: r.cliente.id, idEnvio })
  } catch (err) {
    registro.error?.('crm: no se pudo encolar la respuesta de la tienda', String(err?.message ?? err))
    const f = await modificarCliente(r.cliente.id, c => ({
      cliente: CRM.marcarEnvio(c, idEnvio, { envio: 'fallido', motivo: 'no se pudo poner en la cola de envío; vuelve a mandarlo' }, { ahora }),
    }))
    return {
      codigo: 200,
      cuerpo: {
        ok: true, ...con(f.cliente ?? r.cliente), enviado: false,
        aviso: 'NO salió por WhatsApp: no se pudo poner en la cola de envío. Vuelve a mandarlo.',
      },
    }
  }
  // `enviado: false` todavía: está en la cola. La pantalla lo enseña como
  // «enviando» y vuelve a preguntar hasta que el trabajador diga qué pasó.
  return { codigo: 200, cuerpo: { ok: true, ...con(r.cliente), enviado: false, encolado: true } }
}
