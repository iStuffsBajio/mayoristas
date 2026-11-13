// El trabajador apunta aquí cuando Meta deja el canal mudo, y lo borra cuando
// vuelve a salir un mensaje. La regla y el porqué están en
// `backend/src/crm-salud.js`; esto es sólo el S3.
//
// ── Cuánto cuesta ───────────────────────────────────────────────────────────
//
// Nada en marcha normal. El archivo se LEE una vez por contenedor —en el
// primer envío que sale bien, por si quedó un problema apuntado de antes— y
// no se vuelve a tocar hasta que algo falle. No hay una lectura por mensaje.
//
// ── Nunca tumba un turno ────────────────────────────────────────────────────
//
// Todo lo de aquí va en `try/catch`. Esto es un aviso: si no se puede
// escribir, el turno sigue igual y queda el renglón `CRM_ALARMA` del registro.

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { LLAVE_SALUD, anotarProblema, despejar } from '../backend/src/crm-salud.js'
import { clasificarEnvio } from './envio-errores.js'

/**
 * La marca del registro de la que cuelga la alarma de CloudWatch
 * (`infra/crm-alarmas.json`). Si se cambia aquí hay que cambiar el filtro
 * allá: hay prueba que lo comprueba.
 */
export const MARCA_ALARMA = 'CRM_ALARMA'

export function saludEnS3({ s3, bucket }) {
  async function leer() {
    try {
      const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: LLAVE_SALUD }))
      return JSON.parse(await r.Body.transformToString())
    } catch (err) {
      if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null
      throw err
    }
  }
  const escribir = archivo => s3.send(new PutObjectCommand({
    Bucket: bucket, Key: LLAVE_SALUD,
    Body: Buffer.from(JSON.stringify(archivo)),
    ContentType: 'application/json; charset=utf-8', CacheControl: 'no-store',
  }))
  return {
    leer,
    async anotar(clase, datos) { await escribir(anotarProblema(await leer(), clase, datos)) },
    async despejar() {
      const actual = await leer()
      const limpio = despejar(actual)
      if (limpio !== actual) await escribir(limpio)
    },
  }
}

/**
 * Envuelve los envíos del trabajador para vigilar la salud del canal.
 *
 * `vigilar(fn)` devuelve una función igual que `fn` que, además:
 *
 *   · si `fn` falla por algo que deja el canal mudo (`alarma` en
 *     `clasificarEnvio`), lo apunta y escribe la marca en el registro;
 *   · si `fn` sale bien, borra lo apuntado —un envío que sale es la prueba de
 *     que el token sirve—.
 *
 * El error se vuelve a lanzar tal cual: esto mira, no decide.
 */
export function vigilante({ salud, registro = console } = {}) {
  // `true` es «puede haber algo apuntado»: al arrancar no se sabe.
  let quizaHayProblema = true

  async function alFallar(err) {
    const e = clasificarEnvio(err)
    if (!e.alarma) return
    // El renglón va SIEMPRE, se pueda o no escribir el archivo: de él cuelga
    // la alarma. Sin teléfono ni texto: sólo qué clase de fallo y su código.
    registro.error?.(`${MARCA_ALARMA} clase=${e.clase} codigo=${e.codigo ?? 'sin-codigo'}`)
    quizaHayProblema = true
    try { await salud?.anotar(e.clase, { motivo: e.motivo, codigo: e.codigo }) } catch (fallo) {
      registro.error?.('crm: no se pudo apuntar el problema de salud', String(fallo?.message ?? fallo))
    }
  }

  async function alSalirBien() {
    if (!quizaHayProblema) return
    try { await salud?.despejar(); quizaHayProblema = false } catch { /* la siguiente lo intenta */ }
  }

  return {
    vigilar: fn => async (...args) => {
      let r
      try { r = await fn(...args) } catch (err) { await alFallar(err); throw err }
      await alSalirBien()
      return r
    },
  }
}
