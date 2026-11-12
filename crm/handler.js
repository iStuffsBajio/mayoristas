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

import { atenderCarga } from './atender.js'

// `recibir()` se mudó a `backend/src/meta-webhook.js` el 2026-11-11: la ruta
// `/meta/webhook` vive en la Lambda del backend, que no puede importar de
// `crm/`. Se reexporta para que quien ya lo importaba de aquí —el servidor
// local, el simulador, las pruebas— no note la mudanza.
export { recibir } from '../backend/src/meta-webhook.js'

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
