// Lo que el bot apunta en la bandeja del CRM.
//
// El bot ya guardaba su propia conversación (`conversaciones.js`), la que
// necesita el modelo, con las llamadas a herramientas dentro. Eso no le sirve a
// una persona de la tienda. Aquí se apunta lo que se dijo, en la ficha del
// cliente que ve el panel, con la MISMA regla que usa el backend
// (`backend/src/clientes.js`): una sola copia.
//
// ── Y la regla que cambia cómo contesta el bot ─────────────────────────────
//
// Con una persona de la tienda en medio, el bot se calla. Lo decide la ficha
// (`botContesta`), no el bot: cuando la tienda toma la conversación desde el
// panel, el siguiente mensaje del cliente se apunta y nadie más le contesta.
//
// ── Un fallo aquí NO deja al cliente sin respuesta ─────────────────────────
//
// Si la bandeja no se puede leer o escribir, el bot contesta igual y lo dice
// en el registro. Perder un renglón del panel es malo; dejar a alguien que
// escribió por un anuncio sin respuesta es peor, y además se paga.

import {
  idDe, nuevoCliente, registrarMensaje, aplicarAccion, botContesta,
} from '../backend/src/clientes.js'

/**
 * Un almacén de clientes en memoria, con la forma que espera `atender()`:
 * `modificar(id, fn)` lee, aplica y guarda. `fn` recibe el cliente o `null`.
 *
 * En la nube va contra las mismas llaves de S3 que el backend; para el
 * simulador y las pruebas basta esto.
 */
export function bandejaEnMemoria() {
  const datos = new Map()
  return {
    async leer(id) { return datos.get(id) ?? null },
    async leerEstricto(id) { return datos.get(id) ?? null },
    async modificar(id, fn) {
      const sig = fn(datos.get(id) ?? null)
      if (sig) datos.set(id, sig)
      return sig
    },
    get clientes() { return [...datos.values()] },
    _datos: datos,
  }
}

/** El origen que se guarda en la ficha a partir del anuncio de Meta. */
export function origenDelAnuncio(anuncio) {
  if (!anuncio) return null
  return {
    fuente: 'meta',
    anuncio: anuncio.titular || anuncio.anuncio || null,
    codigo: anuncio.ref || null,
    ctwaClid: anuncio.ctwaClid || null,
  }
}

/**
 * Cómo queda en la ficha lo que mandó el cliente: `{ texto, tipo }`.
 *
 * Lo que no es texto se apunta con su tipo entre corchetes, para que quien
 * abra la conversación sepa que ahí hubo una nota de voz o una foto. La foto
 * NO se guarda (ver `medios.js`); lo que escribió junto a ella, sí.
 */
export function comoSeApunta(mensaje) {
  if (mensaje?.tipo === 'image') return { texto: ['[foto]', mensaje.texto].filter(Boolean).join(' '), tipo: 'image' }
  return {
    texto: mensaje?.texto || `[${mensaje?.tipo ?? 'mensaje'}]`,
    tipo: mensaje?.texto ? 'texto' : (mensaje?.tipo ?? 'otro'),
  }
}

/** La llave del cliente que escribe por WhatsApp. */
export const idWhatsApp = telefono => idDe({ canal: 'whatsapp', telefono })

/**
 * Apunta el mensaje del cliente y dice si el bot debe contestar.
 *
 * Devuelve `{ contesta, cliente }`. Sin bandeja, o si la bandeja falla, el bot
 * contesta: ver la cabecera.
 */
export async function apuntarEntrada(bandeja, mensaje, { plaza, anuncio, registro = console } = {}) {
  if (!bandeja) return { contesta: true, cliente: null }
  const id = idWhatsApp(mensaje.de)
  if (!id) return { contesta: true, cliente: null }
  try {
    const cliente = await bandeja.modificar(id, actual => {
      let c = actual ?? nuevoCliente({
        id, canal: 'whatsapp', telefono: mensaje.de, nombre: mensaje.nombre,
        plaza, origen: origenDelAnuncio(anuncio), quien: 'bot',
      })
      if (!c) return null
      if (!c.nombre && mensaje.nombre) c = { ...c, nombre: mensaje.nombre }
      // El bot sabe la plaza —por la ciudad o por el anuncio— antes de que
      // nadie la haya repartido: se apunta, para que la tienda vea lo que el
      // bot está atendiendo en su plaza. Una plaza que ya puso una persona no
      // se pisa.
      if (!c.plaza && plaza) c = { ...c, plaza }
      return registrarMensaje(c, { de: 'cliente', ...comoSeApunta(mensaje), id: mensaje.id })
    })
    return { contesta: botContesta(cliente), cliente }
  } catch (err) {
    registro.warn?.('bandeja: no se pudo apuntar la entrada', String(err?.message ?? err))
    return { contesta: true, cliente: null }
  }
}

/** Apunta lo que contestó el bot y, si entregó, deja la conversación pendiente. */
export async function apuntarSalida(bandeja, telefono, { texto, imagenes = 0, entrega = null }, { registro = console } = {}) {
  if (!bandeja) return null
  const id = idWhatsApp(telefono)
  if (!id) return null
  try {
    return await bandeja.modificar(id, actual => {
      if (!actual) return null
      let c = registrarMensaje(actual, { de: 'bot', texto, imagenes })
      if (entrega?.plaza) {
        const r = aplicarAccion(c, { accion: 'entregar', plaza: entrega.plaza }, { quien: 'bot' })
        if (r.cliente) c = r.cliente
      }
      return c
    })
  } catch (err) {
    registro.warn?.('bandeja: no se pudo apuntar la salida', String(err?.message ?? err))
    return null
  }
}
