// Los dos almacenes del bot en producción, sobre S3.
//
// ── Por qué S3 y no una base de datos ───────────────────────────────────────
//
// El LEEME decía Neon. Se descartó el 2026-11-11: es un servicio, una
// credencial y una factura más para guardar UN JSON por teléfono. El bucket ya
// existe, ya es privado fuera de `inventarios/` y `config/`, ya tiene
// versionado —una escritura mala se puede deshacer— y el rol ya sabe leerlo y
// escribirlo. Lo único que S3 no da es transacciones, y para eso están las
// escrituras condicionales de abajo.
//
// ── Todo bajo `crm/`, y eso no es un detalle ────────────────────────────────
//
//   crm/conversaciones/<teléfono>.json   lo que necesita el modelo
//   crm/clientes/<id>.json               la ficha que ve la tienda
//   crm/indice.json                      el resumen de todas, para la bandeja
//
// El nombre del archivo ES un teléfono. La política del bucket sólo abre
// `inventarios/*` y `config/*`: nada de esto puede vivir ahí, ni «un momento».
//
// ── La escritura condicional ────────────────────────────────────────────────
//
// S3 acepta `If-Match: <etag>` («escribe sólo si sigue siendo lo que leí») y
// `If-None-Match: *` («escribe sólo si no existe»). Con eso, dos escrituras a
// la vez no se pisan: la segunda recibe un 412, y quien la hizo vuelve a leer
// y aplica su cambio sobre lo que quedó. Sin eso gana la última y la otra
// desaparece sin que nada falle —que es exactamente lo que pasaría cuando el
// bot apunta un mensaje mientras alguien de la tienda está contestando—.

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { conMetodos } from './conversaciones.js'
import { almacenDeClientes, Conflicto } from '../backend/src/clientes-s3.js'

export const PREFIJO_CONVERSACIONES = 'crm/conversaciones/'

/** Cuántas veces se reintenta una ficha que alguien más estaba escribiendo. */
export const REINTENTOS_FICHA = 5

const esPrecondicion = err => {
  const codigo = err?.$metadata?.httpStatusCode
  return codigo === 412 || codigo === 409 || err?.name === 'PreconditionFailed'
}

const noExiste = err =>
  err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404

/**
 * El almacén de conversaciones, un archivo por teléfono.
 *
 * Misma interfaz que `enMemoria()` y `enArchivo()`: sale de `conMetodos`, así
 * que `yaAtendido` y `olvidarMensaje` son literalmente el mismo código.
 *
 * **Cada escritura va condicionada a lo último que ESTE almacén leyó o
 * escribió de ese teléfono.** La cola ya garantiza que no haya dos
 * trabajadores con el mismo teléfono a la vez, así que en marcha normal la
 * condición se cumple siempre. Está para el día que no: un mensaje que SQS
 * entregue dos veces, o una visibilidad mal puesta. Entonces `yaAtendido` —que
 * lee y luego marca— deja de ser una carrera: de dos que marquen a la vez sólo
 * uno escribe, el otro recibe el conflicto, su turno falla y al reintentarse
 * encuentra el mensaje ya marcado. Una respuesta, no dos.
 *
 * **Leer NO se traga los errores.** Sólo «no existe» devuelve null. Si un
 * fallo de red se leyera como «conversación nueva», el bot saludaría de cero a
 * media plática; con el error subiendo, el turno falla y se reintenta.
 */
export function enS3({ s3, bucket, prefijo = PREFIJO_CONVERSACIONES } = {}) {
  if (!s3 || !bucket) throw new Error('enS3: hacen falta el cliente de S3 y el bucket')

  // Sólo dígitos: el teléfono llega de Meta, pero una llave de S3 armada con
  // lo que mande otro no se deja al azar.
  const claveDe = t => `${prefijo}${String(t).replace(/\D/g, '')}.json`

  // Lo último que se vio de cada teléfono: su etag, o `null` si no existía.
  // `undefined` es «todavía no lo he mirado».
  const visto = new Map()

  async function leerCrudo(telefono) {
    const Key = claveDe(telefono)
    try {
      const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key }))
      visto.set(Key, r.ETag ?? undefined)
      return JSON.parse(await r.Body.transformToString())
    } catch (err) {
      if (!noExiste(err)) throw err
      visto.set(Key, null)
      return null
    }
  }

  async function escribirCrudo(telefono, conversacion) {
    const Key = claveDe(telefono)
    // Nunca se escribe a ciegas: sin haber mirado, primero se mira.
    if (visto.get(Key) === undefined) await leerCrudo(telefono)
    const etag = visto.get(Key)
    try {
      const r = await s3.send(new PutObjectCommand({
        Bucket: bucket, Key,
        Body: Buffer.from(JSON.stringify(conversacion)),
        ContentType: 'application/json; charset=utf-8',
        CacheControl: 'no-store',
        ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }),
      }))
      // Con el etag nuevo en la mano, la siguiente escritura no relee. Si S3
      // no lo devolviera, se olvida y la siguiente mira antes.
      visto.set(Key, r?.ETag ?? undefined)
    } catch (err) {
      visto.delete(Key)
      if (esPrecondicion(err)) {
        throw new Conflicto(`la conversación de ${String(telefono).slice(-4)} cambió mientras se atendía`)
      }
      throw err
    }
  }

  return conMetodos(leerCrudo, escribirCrudo)
}

/**
 * La bandeja del CRM sobre S3: `{ leer, modificar(id, fn) }`, como
 * `bandejaEnMemoria()`.
 *
 * No guarda nada por su cuenta: usa el almacén del backend
 * (`backend/src/clientes-s3.js`), que es el que usa el panel. Mismas llaves,
 * mismo índice. Lo que añade es lo que el bot necesita y el panel no:
 *
 *   · `fn` recibe `null` cuando el cliente no existe, y entonces lo que
 *     devuelva se CREA —con `If-None-Match`, así que dos mensajes que lleguen
 *     a la vez de un número nuevo no crean dos fichas ni se pisan—.
 *   · Si alguien escribió en medio, se vuelve a leer y `fn` se aplica otra vez
 *     sobre lo nuevo. Por eso `fn` tiene que ser pura: puede correr varias
 *     veces.
 *
 * Si se agotan los reintentos, LANZA. `apuntarEntrada` y `apuntarSalida` ya
 * atrapan eso y el bot contesta igual: perder un renglón del panel es malo,
 * dejar a un cliente sin respuesta es peor.
 */
export function bandejaEnS3({ s3, bucket, reintentos = REINTENTOS_FICHA } = {}) {
  if (!s3 || !bucket) throw new Error('bandejaEnS3: hacen falta el cliente de S3 y el bucket')
  const { leerCliente, escribirCliente } = almacenDeClientes({ s3, bucket })

  return {
    async leer(id) {
      return (await leerCliente(id))?.cliente ?? null
    },

    /** Como `leer`, pero un fallo de S3 LANZA en vez de parecer «no existe». */
    async leerEstricto(id) {
      return (await leerCliente(id, { estricto: true }))?.cliente ?? null
    },

    async modificar(id, fn) {
      for (let intento = 0; intento < reintentos; intento++) {
        const leido = await leerCliente(id)
        const actual = leido?.cliente ?? null
        const sig = fn(actual)
        // Nada que guardar: `fn` devolvió null, o lo mismo que recibió.
        if (!sig || sig === actual) return sig ?? null
        const conVersion = { ...sig, version: (actual?.version ?? 0) + 1 }
        try {
          await escribirCliente(conVersion, leido?.etag ?? null)
          return conVersion
        } catch (err) {
          if (!(err instanceof Conflicto)) throw err
          // Otro escribió primero —el bot, o alguien desde el panel—. Vuelta.
        }
      }
      throw new Conflicto(`la ficha ${id} no se pudo guardar tras ${reintentos} intentos: alguien más la estaba escribiendo`)
    },
  }
}
