// Dónde se guardan las fichas de los clientes del CRM, y cómo.
//
// Salió de `index.js` el 2026-11-11 SIN cambiar una línea de comportamiento:
// era el mismo código, y vive aparte por dos razones.
//
//   · `index.js` ya es enorme, y esto es un almacén, no una ruta.
//   · El bot (`crm/`) tiene que escribir la MISMA ficha, en las MISMAS llaves y
//     con el MISMO índice que el panel. Copiando esto en `crm/`, las dos copias
//     se separan, y la primera en fallar es la peor: el bot guarda la ficha, no
//     actualiza `crm/indice.json`, y el cliente existe pero el panel no lo
//     lista. Nada falla; simplemente nadie lo ve.
//
// Por eso el cliente de S3 y el bucket llegan de fuera: el backend pasa los
// suyos y el trabajador del bot los suyos. Lo que no cambia son las llaves.
//
// Todo bajo `crm/`, PRIVADO: la lista de clientes es el negocio.

import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import * as CRM from './clientes.js'

/** Alguien escribió entre que se leyó y se quiso escribir. Se reintenta. */
export class Conflicto extends Error {}

export function almacenDeClientes({ s3, bucket }) {
  const PREFIJO_CLIENTES = 'crm/clientes/'
  const claveCliente = id => `${PREFIJO_CLIENTES}${CRM.archivoDe(id)}`

  /**
   * Lee una ficha. Por omisión, CUALQUIER fallo se lee como «no existe»: es lo
   * que hacía y el panel cuenta con ello.
   *
   * Con `estricto`, sólo «no existe» devuelve null y lo demás LANZA. Lo pide
   * quien no puede confundir las dos cosas: el trabajador, antes de mandar lo
   * que la tienda escribió. Si un S3 caído se leyera como «esa ficha ya no
   * existe», el mensaje se tiraría en vez de reintentarse.
   */
  async function leerCliente(id, { estricto = false } = {}) {
    if (!CRM.idValido(id)) return null
    try {
      const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: claveCliente(id) }))
      const v = JSON.parse(await r.Body.transformToString())
      return v && typeof v === 'object' ? { cliente: v, etag: r.ETag ?? null } : null
    } catch (err) {
      if (estricto && !(err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404)) throw err
      return null
    }
  }

  async function escribirCliente(c, etag) {
    try {
      await s3.send(new PutObjectCommand({
        Bucket: bucket, Key: claveCliente(c.id),
        Body: Buffer.from(JSON.stringify(c)),
        ContentType: 'application/json; charset=utf-8',
        CacheControl: 'no-cache',
        // Uno nuevo sólo se crea si no existe; uno leído sólo se reescribe si
        // nadie lo tocó desde que se leyó.
        ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }),
      }))
    } catch (err) {
      const codigo = err?.$metadata?.httpStatusCode
      if (codigo === 412 || codigo === 409 || err?.name === 'PreconditionFailed') throw new Conflicto()
      throw err
    }
    await actualizarIndice([c])
  }

  /**
   * Lee, aplica `fn` y escribe, reintentando si alguien escribió en medio.
   * `fn(cliente)` devuelve `{ cliente }` o `{ error }`.
   */
  async function modificarCliente(id, fn) {
    for (let intento = 0; intento < 4; intento++) {
      const leido = await leerCliente(id)
      if (!leido || leido.cliente.fusionadoEn) return { error: 'No existe ese cliente.', codigo: 404 }
      const r = fn(leido.cliente)
      if (r.error) return { ...r, codigo: r.codigo ?? 400 }
      if (r.cliente === leido.cliente) return r
      try {
        await escribirCliente({ ...r.cliente, version: (leido.cliente.version ?? 0) + 1 }, leido.etag)
        return r
      } catch (err) {
        if (!(err instanceof Conflicto)) throw err
      }
    }
    return { error: 'Alguien más estaba escribiendo en este cliente. Vuelve a intentarlo.', codigo: 409 }
  }

  /**
   * El índice de la bandeja: el resumen de cada cliente en UN archivo.
   *
   * No se lista la carpeta, y no por velocidad: listar pide `s3:ListBucket`, y el
   * rol de la Lambda sólo tiene `GetObject` y `PutObject` (ver «Despliegue» en
   * CLAUDE.md). Funcionaría en las pruebas y fallaría en producción. Con el
   * índice, la bandeja es una sola lectura, y se escribe con la misma condición
   * de versión que cada cliente: dos escrituras a la vez se reintentan, no se
   * borran entre ellas.
   */
  const CLAVE_INDICE_CLIENTES = 'crm/indice.json'

  async function leerIndiceClientes() {
    try {
      const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: CLAVE_INDICE_CLIENTES }))
      const v = JSON.parse(await r.Body.transformToString())
      return { indice: v && typeof v.clientes === 'object' ? v : { clientes: {} }, etag: r.ETag ?? null, existe: true }
    } catch {
      return { indice: { clientes: {} }, etag: null, existe: false }
    }
  }

  async function actualizarIndice(cambios) {
    for (let intento = 0; intento < 6; intento++) {
      const { indice, etag, existe } = await leerIndiceClientes()
      const clientes = { ...indice.clientes }
      for (const c of cambios) {
        if (c.fusionadoEn) delete clientes[c.id]
        else clientes[c.id] = CRM.resumen(c)
      }
      try {
        await s3.send(new PutObjectCommand({
          Bucket: bucket, Key: CLAVE_INDICE_CLIENTES,
          Body: Buffer.from(JSON.stringify({ clientes, actualizado: new Date().toISOString() })),
          ContentType: 'application/json; charset=utf-8', CacheControl: 'no-cache',
          ...(existe && etag ? { IfMatch: etag } : { IfNoneMatch: '*' }),
        }))
        return true
      } catch (err) {
        const codigo = err?.$metadata?.httpStatusCode
        if (!(codigo === 412 || codigo === 409 || err?.name === 'PreconditionFailed')) throw err
      }
    }
    // El cliente YA se guardó; lo que no entró es su renglón en la lista. Se
    // dice en el registro en vez de tirar la petición: la siguiente escritura
    // de ese cliente lo vuelve a poner.
    console.warn('crm: no se pudo actualizar el índice tras 6 intentos', cambios.map(c => c.id))
    return false
  }

  /**
   * Quita renglones de la lista. Sólo lo usa el borrado de una conversación
   * (`crm-borrar.js`): una ficha que ya no existe y sigue en la lista se abre
   * en blanco.
   */
  async function quitarDelIndice(ids) {
    for (let intento = 0; intento < 6; intento++) {
      const { indice, etag, existe } = await leerIndiceClientes()
      if (!existe || !ids.some(id => id in indice.clientes)) return true
      const clientes = { ...indice.clientes }
      for (const id of ids) delete clientes[id]
      try {
        await s3.send(new PutObjectCommand({
          Bucket: bucket, Key: CLAVE_INDICE_CLIENTES,
          Body: Buffer.from(JSON.stringify({ clientes, actualizado: new Date().toISOString() })),
          ContentType: 'application/json; charset=utf-8', CacheControl: 'no-cache',
          IfMatch: etag,
        }))
        return true
      } catch (err) {
        const codigo = err?.$metadata?.httpStatusCode
        if (!(codigo === 412 || codigo === 409 || err?.name === 'PreconditionFailed')) throw err
      }
    }
    console.warn('crm: no se pudo quitar del índice tras 6 intentos')
    return false
  }

  async function listarClientes() {
    const { indice } = await leerIndiceClientes()
    return { clientes: Object.values(indice.clientes ?? {}) }
  }

  /**
   * La ficha —con teléfono— de quien tiene este identificador de WhatsApp, o
   * null. Se busca en el índice: sólo hace falta cuando alguien escribe SIN
   * teléfono, que es raro, así que no merece un archivo de punteros.
   */
  async function clientePorUsuario(usuario) {
    if (!CRM.esBsuid(usuario)) return null
    const { clientes } = await listarClientes()
    const r = clientes.find(c => c.usuario === usuario && c.telefono && !c.fusionadoEn)
    if (!r) return null
    // `waId` es el número tal como lo manda Meta, que es la llave de su
    // conversación; no va en el índice, así que se lee de la ficha.
    const ficha = (await leerCliente(r.id, { estricto: true }))?.cliente
    return { id: r.id, de: ficha?.waId ?? r.telefono }
  }

  return { leerCliente, escribirCliente, modificarCliente, leerIndiceClientes, actualizarIndice, quitarDelIndice, listarClientes, clientePorUsuario, claveCliente }
}
