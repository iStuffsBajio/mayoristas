// El trabajador: la segunda función Lambda, la que piensa.
//
// SQS le entrega los mensajes que encoló `/meta/webhook` y él llama a
// `trabajar()`. Todo lo que hay aquí además de esa llamada existe por una sola
// razón: **que un cliente no se quede sin respuesta sin que nadie se entere.**
//
// ── Qué significa «fallar» para la cola ─────────────────────────────────────
//
// `trabajar()` no lanza: si un turno revienta devuelve
// `{ atendido: false, motivo: 'error' }`, para que un mensaje malo no tumbe a
// los demás de la carga. Eso es lo correcto ahí y sería un desastre aquí: una
// Lambda que termina sin error le dice a SQS «hecho», SQS BORRA el mensaje, y
// el turno fallido desaparece. Por eso el resultado se traduce: un turno con
// error se devuelve en `batchItemFailures` y SQS lo vuelve a entregar.
//
// ── Los tres números, y por qué van juntos ──────────────────────────────────
//
//   MAX_ENTREGAS         3     veces que SQS entrega un mensaje antes de
//                              mandarlo a la cola de fallidos
//   TIEMPO_TRABAJADOR_S  90    tiempo límite de esta función
//   VISIBILIDAD_S        180   lo que SQS esconde un mensaje entregado
//
// La visibilidad tiene que ser MAYOR que el tiempo de la función: si fuera
// menor, SQS daría por perdido un turno que sigue pensando y entregaría el
// mismo mensaje a otra invocación —dos respuestas—. Y no conviene mucho mayor,
// porque un turno que falla no se reintenta hasta que la visibilidad vence, y
// mientras tanto ese teléfono está parado (es FIFO: su siguiente mensaje no
// pasa por delante).
//
// Los tres viven también en `infra/crm-colas.json`, que es lo que el dueño
// aplica a mano en AWS. Hay prueba que falla si se separan.
//
// El tiempo límite del cliente de Claude NO está aquí: es de `cerebro.js` y lo
// pone el dueño. Tiene que quedar por debajo de TIEMPO_TRABAJADOR_S menos el
// margen, o el que corta es este archivo y no el cliente.
//
// ── Cuando se agotan las entregas ───────────────────────────────────────────
//
// El mensaje se va a la cola de fallidos y ahí no lo mira nadie un martes a
// las once. Así que ANTES de rendirse, en la última entrega, el trabajador lo
// apunta en la ficha del cliente (`marcarSinRespuesta`): sube al principio de
// la bandeja con «Sin respuesta» en rojo y el panel avisa arriba. La cola de
// fallidos queda como evidencia; el aviso es la ficha.

import { S3Client } from '@aws-sdk/client-s3'
import { trabajar } from './handler.js'
import { enS3, bandejaEnS3 } from './almacen-s3.js'
import { idWhatsApp } from './bandeja.js'
import { mandarRespuesta } from './whatsapp-api.js'
import {
  nuevoCliente, registrarMensaje, marcarSinRespuesta, botContesta,
} from '../backend/src/clientes.js'

/** Entregas de SQS antes de la cola de fallidos (`maxReceiveCount`). */
export const MAX_ENTREGAS = 3

/** Tiempo límite de la función, en segundos. */
export const TIEMPO_TRABAJADOR_S = 90

/** Visibilidad de la cola, en segundos. Mayor que el tiempo de la función. */
export const VISIBILIDAD_S = 180

/**
 * Lo que se guarda del tiempo de la función para cerrar bien: desmarcar el
 * mensaje y contestarle a SQS. Si la función muere por tiempo límite SIN
 * haber hecho eso, el mensaje se queda marcado como visto y su reintento se
 * descarta por «repetido»: el cliente no recibe nada nunca.
 */
export const MARGEN_MS = 10_000

class SeAcaboElTiempo extends Error {}

/** `promesa`, o un error si pasan `ms`. Sin `ms`, sin límite. */
function conLimite(promesa, ms) {
  if (ms == null) return promesa
  let reloj
  const tope = new Promise((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new SeAcaboElTiempo()), Math.max(0, ms))
  })
  return Promise.race([promesa, tope]).finally(() => clearTimeout(reloj))
}

// En el registro nunca va el teléfono entero ni lo que escribió el cliente.
const corto = telefono => `…${String(telefono ?? '').slice(-4)}`

/**
 * Arma el trabajador.
 *
 * `almacenes()` devuelve `{ almacen, bandeja }` NUEVOS para cada mensaje. No
 * es un capricho: el almacén de S3 recuerda el ETag de lo último que leyó, y
 * compartirlo entre mensajes mezclaría lo que vio un turno con lo que escribe
 * otro.
 *
 * `enviar`, `leer` y `pensar` se inyectan en las pruebas; en producción son
 * los de verdad.
 */
export function creaTrabajador({
  almacenes,
  enviar = mandarRespuesta,
  leer,
  pensar,
  maxEntregas = MAX_ENTREGAS,
  margenMs = MARGEN_MS,
  registro = console,
} = {}) {
  if (typeof almacenes !== 'function') throw new Error('creaTrabajador: hace falta `almacenes`')

  /** Deja dicho en la ficha que a este cliente nadie le contestó. */
  async function avisarEnElPanel(bandeja, mensaje, motivo) {
    const id = idWhatsApp(mensaje.de)
    if (!id) return false
    try {
      await bandeja.modificar(id, actual => {
        // Puede no haber ficha: si el turno murió antes de apuntar la entrada,
        // este aviso es lo primero que se sabe de esa persona.
        let c = actual ?? nuevoCliente({
          id, canal: 'whatsapp', telefono: mensaje.de, nombre: mensaje.nombre, quien: 'bot',
        })
        if (!c) return null
        // Lo que escribió tiene que estar a la vista de quien le va a
        // contestar. Si ya estaba apuntado, `registrarMensaje` no lo repite.
        c = registrarMensaje(c, {
          de: 'cliente',
          texto: mensaje.texto || `[${mensaje.tipo ?? 'mensaje'}]`,
          tipo: mensaje.texto ? 'texto' : (mensaje.tipo ?? 'otro'),
          id: mensaje.id,
        })
        return marcarSinRespuesta(c, { motivo, mensaje: mensaje.id })
      })
      return true
    } catch (err) {
      // Lo peor que puede pasar aquí: ni contestó ni se pudo avisar. Queda la
      // cola de fallidos y este renglón, que es por lo que la alarma de
      // `infra/` vigila esa cola.
      registro.error?.('crm: NO se pudo marcar «sin respuesta»', corto(mensaje.de), String(err?.message ?? err))
      return false
    }
  }

  /**
   * ¿Alguien le contestó este mensaje?
   *
   * Sólo se pregunta cuando SQS REPITE una entrega y el mensaje sale como «ya
   * atendido». Casi siempre es verdad —el turno anterior contestó y lo que
   * falló fue borrar el mensaje de la cola—. Pero hay otra forma de llegar
   * ahí: que la función muriera a media respuesta (sin memoria, o S3 caído
   * justo al desmarcar) con el mensaje ya marcado. Entonces «repetido» quiere
   * decir «nadie lo atendió y nadie lo va a atender». La ficha lo distingue:
   * si después de ese mensaje no habló ni el bot ni la tienda, y no lo tiene
   * una persona, es silencio.
   */
  async function quedoSinRespuesta(bandeja, mensaje) {
    try {
      const c = await bandeja.leer(idWhatsApp(mensaje.de))
      if (!c) return true
      const i = c.mensajes.findIndex(m => m.id === mensaje.id)
      if (i < 0) return true
      if (c.mensajes.slice(i + 1).some(m => m.de !== 'cliente')) return false
      // La tiene una persona: el bot se calló a propósito.
      return botContesta(c)
    } catch {
      return false
    }
  }

  /** Atiende un registro de SQS. Devuelve true si SQS ya puede borrarlo. */
  async function uno(registroSqs, contexto) {
    const entrega = Number(registroSqs?.attributes?.ApproximateReceiveCount ?? 1)
    const ultima = entrega >= maxEntregas

    let mensaje
    try {
      mensaje = JSON.parse(registroSqs.body)
    } catch {
      // No se puede leer y reintentar no lo arregla, pero NO se da por hecho:
      // fallando acaba en la cola de fallidos, donde se puede mirar qué era.
      registro.error?.('crm: mensaje de cola ilegible', registroSqs?.messageId)
      return false
    }

    const { almacen, bandeja } = almacenes()

    // Si el tiempo se acaba, el turno queda corriendo «por detrás» —no hay
    // forma de cancelarlo— y la Lambda puede descongelarlo en la siguiente
    // invocación, justo cuando el reintento ya está contestando. Con esta
    // bandera, un turno abandonado ya no puede MANDAR: sin ella el cliente
    // recibiría dos respuestas.
    let abandonado = false
    const enviarSiSigue = (...args) => {
      if (abandonado) throw new Error('turno abandonado por tiempo: no se manda')
      return enviar(...args)
    }

    const restante = contexto?.getRemainingTimeInMillis?.()
    const limite = Number.isFinite(restante) ? restante - margenMs : null

    let r
    try {
      ;[r] = await conLimite(
        trabajar([mensaje], {
          almacen, bandeja, enviar: enviarSiSigue,
          ...(leer && { leer }), ...(pensar && { pensar }),
        }),
        limite,
      )
    } catch (err) {
      if (!(err instanceof SeAcaboElTiempo)) throw err
      abandonado = true
      r = { atendido: false, motivo: 'error', error: 'se acabó el tiempo del trabajador' }
      // El turno marcó el mensaje como visto al empezar. Hay que desmarcarlo
      // AQUÍ, porque quien lo haría —el `catch` de `atender`— está congelado.
      try { await almacen.olvidarMensaje(mensaje.de, mensaje.id) } catch { /* lo cubre `quedoSinRespuesta` */ }
    }

    if (r?.atendido) return true

    if (r?.motivo === 'repetido') {
      if (entrega > 1 && await quedoSinRespuesta(bandeja, mensaje)) {
        registro.error?.('crm: mensaje marcado como visto y sin respuesta', corto(mensaje.de), mensaje.id)
        await avisarEnElPanel(bandeja, mensaje, 'el bot se cayó a media respuesta')
      }
      return true
    }

    // Sin remitente no hay a quién contestar ni a quién reintentar.
    if (r?.motivo === 'sin-remitente') return true

    registro.error?.(`crm: falló el turno (entrega ${entrega} de ${maxEntregas})`, corto(mensaje.de), mensaje.id, r?.error)
    if (ultima) {
      await avisarEnElPanel(bandeja, mensaje, `el bot falló ${entrega} veces: ${r?.error ?? 'error'}`)
    }
    return false
  }

  /**
   * El handler de la Lambda. Devuelve los que fallaron para que SQS reintente
   * SÓLO ésos (hace falta `ReportBatchItemFailures` en el disparador).
   *
   * Tras el primer fallo no se atiende nada más del lote y todo lo que queda
   * se devuelve como fallido. Es lo que pide una cola FIFO: si el segundo
   * mensaje de un teléfono se atendiera con el primero pendiente de reintento,
   * el orden —que es por lo que la cola es FIFO— se rompería. El disparador va
   * con lotes de 1, así que esto es la red, no el camino normal.
   */
  return async function manejar(evento, contexto) {
    const fallidos = []
    let cortar = false
    for (const reg of evento?.Records ?? []) {
      let listo = false
      if (!cortar) {
        try {
          listo = await uno(reg, contexto)
        } catch (err) {
          registro.error?.('crm: el trabajador reventó', String(err?.message ?? err))
        }
      }
      if (!listo) { fallidos.push({ itemIdentifier: reg.messageId }); cortar = true }
    }
    return { batchItemFailures: fallidos }
  }
}

// ── La función de verdad ────────────────────────────────────────────────────

let deVerdad = null

/** `crm/trabajador.handler`: lo que se configura como handler de la Lambda. */
export async function handler(evento, contexto) {
  if (!deVerdad) {
    const bucket = process.env.S3_BUCKET
    // Sin bucket no se adivina uno: se falla, SQS reintenta y a la tercera
    // queda en la cola de fallidos, que es un fallo que se ve.
    if (!bucket) throw new Error('Trabajador mal configurado: falta S3_BUCKET')
    const s3 = new S3Client({ region: process.env.S3_REGION })
    deVerdad = creaTrabajador({
      almacenes: () => ({ almacen: enS3({ s3, bucket }), bandeja: bandejaEnS3({ s3, bucket }) }),
    })
  }
  return deVerdad(evento, contexto)
}
