// La ruta `/meta/webhook`: lo que Meta llama cuando alguien escribe por
// WhatsApp, y la cola a la que se manda.
//
// ── Por qué esta ruta NO pasa por el camino de las demás ────────────────────
//
// `index.js` hace tres cosas con toda petición antes de enrutarla, y las tres
// rompen este webhook:
//
//   · **Parsea el cuerpo como JSON.** La firma de Meta se calcula sobre los
//     BYTES que mandó. Con el cuerpo ya parseado no hay con qué validarla, y
//     volver a serializarlo cambia los espacios y el orden: nada valida y nada
//     avisa.
//   · **Comprueba el origen.** Meta no es un navegador: no manda `Origin`, y
//     su permiso es la firma, no el CORS.
//   · **Contesta JSON.** El enganche (GET) espera el `hub.challenge` en texto
//     plano, tal cual.
//
// Por eso se registra ANTES de todo eso, y `index.js` sólo pregunta
// `esRutaDeMeta()` y delega.
//
// ── Por qué una cola y no contestar aquí ────────────────────────────────────
//
// Meta corta a los 5 segundos y reintenta; el cerebro tarda más (ver
// `meta-webhook.js`). Aquí sólo se valida y se encola, en milisegundos.
//
// ── Por qué FIFO, y qué es el grupo ─────────────────────────────────────────
//
// La gente manda «hola» y «tienes para iphone 13?» en dos mensajes seguidos.
// Atendidos a la vez, los dos leen la conversación antes de que el otro la
// guarde y el segundo pisa al primero. Una cola FIFO con el TELÉFONO como
// grupo lo impide sin código: SQS no entrega el segundo mensaje de un grupo
// hasta que el primero se borró. Teléfonos distintos sí van a la vez.
//
// El id de deduplicación es el id del mensaje de Meta: si Meta repite el envío
// dentro de los cinco minutos que SQS recuerda, la cola ni lo acepta. Pasado
// ese rato lo para `yaAtendido`, que es la red de verdad.

import crypto from 'node:crypto'
import { recibir } from './meta-webhook.js'

export const RUTA_META = '/meta/webhook'

export const esRutaDeMeta = ruta => ruta === RUTA_META

const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex')

/**
 * De los mensajes que leyó `leerCarga()`, lo que se manda a la cola.
 *
 * UN mensaje de cola por mensaje de WhatsApp, no la carga entera: así cada uno
 * se reintenta y se rinde por separado, y el orden lo lleva el grupo.
 *
 * El id de deduplicación va con hash: SQS lo limita a 128 caracteres y a un
 * juego concreto, y un `wamid` es base64 de largo variable. Un mensaje sin id
 * —no debería pasar— se deduplica por su contenido.
 *
 * Un mensaje sin remitente no se encola: no hay a quién contestarle y sin
 * grupo SQS rechazaría el lote ENTERO, con los mensajes buenos dentro.
 */
export function entradasDeCola(mensajes) {
  return (mensajes ?? [])
    .filter(m => String(m?.de ?? '').replace(/\D/g, ''))
    .map(m => {
      const cuerpo = JSON.stringify(m)
      return {
        grupo: String(m.de).replace(/\D/g, ''),
        dedup: sha(m.id || cuerpo),
        cuerpo,
      }
    })
}

/**
 * `encolar(mensajes)` contra SQS.
 *
 * El cliente y los comandos llegan de fuera para poder probar sin AWS. Si SQS
 * acepta el lote pero rechaza algún mensaje (`Failed`), se LANZA: `recibir`
 * contesta 500, Meta reintenta la carga, y los que sí entraron no se duplican
 * porque llevan su id de deduplicación.
 */
export function encolarEnSqs({ sqs, url, SendMessageBatchCommand }) {
  return async function encolar(mensajes) {
    const entradas = entradasDeCola(mensajes)
    // SQS acepta diez por lote.
    for (let i = 0; i < entradas.length; i += 10) {
      const lote = entradas.slice(i, i + 10)
      const r = await sqs.send(new SendMessageBatchCommand({
        QueueUrl: url,
        Entries: lote.map((e, n) => ({
          Id: String(i + n),
          MessageBody: e.cuerpo,
          MessageGroupId: e.grupo,
          MessageDeduplicationId: e.dedup,
        })),
      }))
      if (r?.Failed?.length) {
        throw new Error(`SQS rechazó ${r.Failed.length} de ${lote.length}: ${r.Failed[0]?.Code ?? '?'}`)
      }
    }
  }
}

// El cliente de SQS se crea la primera vez que llega un mensaje y no al
// cargar el módulo: el backend del panel arranca en cada petición fría, y no
// tiene por qué pagar ese import para servir un inventario.
let encolarDeVerdad = null
async function encolarConfigurado(mensajes) {
  const url = process.env.CRM_COLA_URL
  // Sin cola NO se contesta 200: Meta daría el mensaje por entregado y se
  // perdería sin que nada fallara. Con el error, `recibir` devuelve 500 y Meta
  // lo guarda y reintenta.
  if (!url) throw new Error('falta CRM_COLA_URL')
  if (!encolarDeVerdad) {
    const { SQSClient, SendMessageBatchCommand } = await import('@aws-sdk/client-sqs')
    encolarDeVerdad = encolarEnSqs({
      sqs: new SQSClient({ region: process.env.S3_REGION }),
      url, SendMessageBatchCommand,
    })
  }
  return encolarDeVerdad(mensajes)
}

/**
 * `GET /meta/webhook` (el enganche) y `POST /meta/webhook` (los mensajes).
 *
 * Recibe el evento de la Lambda TAL CUAL llegó. `encolar` se inyecta en las
 * pruebas; en producción es SQS.
 */
export const rutaMetaWebhook = (evento, { encolar = encolarConfigurado } = {}) =>
  recibir(evento, { encolar })
