// Los dos extremos del webhook, separados a propósito.
//
// ── Por qué son dos y no uno ────────────────────────────────────────────────
//
// Meta espera un 200 en unos segundos. Si no llega, da el envío por fallido y
// **reintenta**. El cerebro tarda más que eso: lee inventario y piensa.
//
// Contestando dentro del webhook pasa esto: Meta reintenta, el cerebro corre
// dos veces y la persona recibe la respuesta duplicada. Y en Lambda es peor,
// porque el proceso se congela al devolver la respuesta: lo que quedara
// corriendo «en segundo plano» se queda a medias y se reanuda —o no— en la
// siguiente invocación, con lo que el mensaje se pierde sin que nada falle.
//
// Así que:
//
//   recibir()  valida, lee la carga y devuelve 200 en milisegundos.
//              Lo único que hace con los mensajes es entregárselos a `encolar`.
//   trabajar() los atiende, ya sin prisa, en otra invocación.
//
// Entre los dos va una cola. Qué cola es cosa del despliegue y no de este
// archivo: SQS es la obvia en AWS, y para correr en una sola máquina vale
// `colaEnMemoria()`.

import { verificarEnganche, firmaValida, leerCarga } from './webhook.js'
import { atenderCarga } from './atender.js'

/** Lo que `recibir` devuelve, listo para una Lambda con URL o un API Gateway. */
const respuesta = (codigo, cuerpo, tipo = 'application/json') => ({
  statusCode: codigo,
  headers: { 'Content-Type': tipo, 'Cache-Control': 'no-store' },
  body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
})

/**
 * El extremo que habla con Meta. Tiene que ser rápido y nada más.
 *
 * `evento` es el de una Lambda con URL de función: `rawPath`, `rawQueryString`,
 * `headers`, `body` y `isBase64Encoded`.
 *
 * **El cuerpo se usa crudo.** Volver a serializar el JSON antes de validar la
 * firma la rompe, porque cambia los bytes sin cambiar los datos. Es el fallo
 * clásico de este endpoint y no da ninguna pista.
 */
export async function recibir(evento, { encolar } = {}) {
  const metodo = evento?.requestContext?.http?.method ?? evento?.httpMethod ?? 'GET'

  // El enganche: Meta llama una vez con GET y espera el challenge en texto
  // plano, sin JSON alrededor, o no acepta el endpoint.
  if (metodo === 'GET') {
    const q = evento?.queryStringParameters ?? {}
    const r = verificarEnganche(q)
    return r.ok
      ? respuesta(200, r.challenge, 'text/plain')
      : respuesta(403, { error: 'verificacion', motivo: r.motivo })
  }

  if (metodo !== 'POST') return respuesta(405, { error: 'metodo' })

  const crudo = evento?.isBase64Encoded
    ? Buffer.from(evento.body ?? '', 'base64')
    : (evento?.body ?? '')

  const firma = evento?.headers?.['x-hub-signature-256']
            ?? evento?.headers?.['X-Hub-Signature-256']

  // Sin firma válida no se procesa nada: quien conozca la URL podría inyectar
  // conversaciones y hacer que el bot le escriba a números ajenos.
  if (!firmaValida(crudo, firma)) return respuesta(401, { error: 'firma' })

  let carga
  try {
    carga = JSON.parse(crudo.toString('utf8'))
  } catch {
    // Un cuerpo ilegible se acusa con 200 igual: devolver un error hace que
    // Meta reintente para siempre algo que nunca va a poder leerse.
    return respuesta(200, { ok: true, ignorado: 'json' })
  }

  const { mensajes, estados } = leerCarga(carga)

  if (mensajes.length && encolar) {
    try {
      await encolar(mensajes)
    } catch (err) {
      // Si la cola falla, SÍ conviene el error: Meta reintenta y el mensaje no
      // se pierde. Es el único caso donde reintentar es lo que queremos.
      console.error('No se pudo encolar', err)
      return respuesta(500, { error: 'cola' })
    }
  }

  return respuesta(200, { ok: true, mensajes: mensajes.length, estados: estados.length })
}

/**
 * El extremo que piensa. Corre en otra invocación, sin prisa.
 *
 * `mensajes` son los que `recibir` encoló, ya leídos por `leerCarga`.
 */
export const trabajar = (mensajes, opciones) => atenderCarga(mensajes, opciones)

/**
 * Una cola de mentira para correr todo en un proceso.
 *
 * Sirve para el simulador y para un servidor de una sola máquina. En AWS esto
 * es SQS y `trabajar` vive en su propia Lambda; la diferencia no debería
 * tocar nada más que este archivo.
 */
export function colaEnMemoria(opciones) {
  const pendientes = []
  let corriendo = false

  async function vaciar() {
    if (corriendo) return
    corriendo = true
    try {
      while (pendientes.length) {
        // De uno en uno: dos mensajes del mismo teléfono atendidos a la vez
        // leen la conversación antes de que el otro la guarde.
        await trabajar([pendientes.shift()], opciones)
      }
    } finally {
      corriendo = false
    }
  }

  return {
    encolar: async mensajes => {
      pendientes.push(...mensajes)
      // Sin await: `recibir` tiene que devolver el 200 ya.
      vaciar().catch(err => console.error('Fallo al atender', err))
    },
    get pendientes() { return pendientes.length },
    /** Para las pruebas: espera a que la cola se vacíe. */
    async terminar() {
      while (corriendo || pendientes.length) await new Promise(r => setTimeout(r, 5))
    },
  }
}
