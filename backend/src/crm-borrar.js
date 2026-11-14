// Borrar una conversación de WhatsApp: la ficha, lo que el bot recuerda de
// ella y su renglón en la lista.
//
// Existe para las PRUEBAS. Mientras se afina el bot, el dueño le escribe desde
// su teléfono, y cada prueba deja una ficha con estado, plaza y memoria que la
// siguiente prueba hereda: el bot «ya sabe» la ciudad, o está callado porque
// alguien tomó la conversación. Hasta ahora la única salida era borrar objetos
// de S3 a mano.
//
// Sirve también si un cliente pide que se borren sus datos, que es un derecho
// que el aviso de privacidad publicado le reconoce.
//
// ES DESTRUCTIVO, así que:
//
//   · sólo el administrador;
//   · sólo fichas de WhatsApp (`wa:`). Las de mayoristas salen de los tickets
//     de Eleventa y no son conversaciones;
//   · hay que escribir los últimos 4 caracteres de su número: un clic de más
//     no borra a nadie;
//   · queda apuntado QUIÉN borró y CUÁNDO, sin el número ni lo que se dijo
//     (`crm/borrados.json`): borrar a escondidas no puede ser una función.
//
// EL ORDEN IMPORTA. Primero la memoria del bot, luego la ficha, luego el
// índice. Si el permiso de borrar falta, falla en el PRIMER paso y no se tocó
// nada. Si se cae a medias, lo que queda es una ficha sin memoria —se vuelve a
// pulsar— y nunca al revés: una memoria sin ficha no se ve en el panel y no
// habría desde dónde borrarla.
//
// LO QUE NO HACE:
//
//   · No borra nada en WhatsApp: el cliente conserva la conversación en su
//     teléfono, y Meta sus registros.
//   · El bucket tiene versionado: S3 guarda la versión anterior de lo borrado
//     hasta que se purgue a mano. Para una prueba da igual; para un borrado
//     por privacidad, hay que purgar las versiones (ver crm/LEEME.md).
//   · Si el cliente escribe mientras se borra, el trabajador puede volver a
//     crear la ficha. Es una ficha nueva, sin historia.

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import * as CRM from './clientes.js'

/**
 * Las mismas llaves que usa el trabajador (`crm/almacen-s3.js` y
 * `llaveDeRemitente` en `crm/conversaciones.js`). Escritas dos veces a la
 * fuerza: el backend no puede importar de `crm/`, que se empaqueta aparte.
 * `crm/borrar.test.js` crea la conversación con el código del trabajador y
 * comprueba que esto la encuentra: si se separan, falla.
 */
export const PREFIJO_CONVERSACIONES = 'crm/conversaciones/'
export const CLAVE_BORRADOS = 'crm/borrados.json'
export const MAX_BORRADOS = 200

const llaveDeUsuario = u => `u-${String(u).replace(/[^A-Za-z0-9]/g, '-')}`

/**
 * Todas las llaves donde puede estar su conversación.
 *
 * Más de una, y no por exceso de celo: la ficha guarda el teléfono arreglado
 * (52 + 10 dígitos) y Meta manda el de México con un 1 en medio (521 + 10),
 * que es con el que el trabajador nombra el archivo. Borrando sólo la primera
 * forma, el bot seguiría recordándolo todo.
 */
export function llavesDeConversacion(c) {
  const llaves = new Set()
  const tel = String(c?.telefono ?? '').replace(/\D/g, '')
  if (tel) {
    llaves.add(tel)
    if (/^52\d{10}$/.test(tel)) llaves.add(`521${tel.slice(2)}`)
    if (/^521\d{10}$/.test(tel)) llaves.add(`52${tel.slice(3)}`)
  }
  const waId = String(c?.waId ?? '').replace(/\D/g, '')
  if (waId) llaves.add(waId)
  if (CRM.esBsuid(c?.usuario)) llaves.add(llaveDeUsuario(c.usuario))
  return [...llaves].map(l => `${PREFIJO_CONVERSACIONES}${l}.json`)
}

/** Lo que hay que escribir para confirmar: los últimos 4 de su número. */
export function confirmacionDe(c) {
  const base = String(c?.telefono ?? '').replace(/\D/g, '') || String(c?.usuario ?? '').replace(/[^A-Za-z0-9]/g, '')
  return base.slice(-4)
}

const sinPermiso = err => err?.name === 'AccessDenied' || err?.$metadata?.httpStatusCode === 403

/**
 * Borra. Devuelve `{ codigo, cuerpo }` para la ruta.
 *
 * `almacen` es el de `clientes-s3.js`.
 */
export async function borrarConversacion({ sesion, quien, id, confirmar, s3, bucket, almacen, ahora, registro = console }) {
  if (!sesion?.admin) return { codigo: 403, cuerpo: { error: 'Sólo el administrador puede borrar una conversación.' } }
  id = String(id ?? '')
  if (!CRM.idValido(id) || !id.startsWith('wa:')) {
    return { codigo: 400, cuerpo: { error: 'Sólo se borran conversaciones de WhatsApp.' } }
  }

  let leido
  try { leido = await almacen.leerCliente(id, { estricto: true }) } catch (err) {
    registro.error?.('crm: no se pudo leer la ficha a borrar', String(err?.message ?? err))
    return { codigo: 502, cuerpo: { error: 'No se pudo leer la ficha. No se borró nada; intenta de nuevo.' } }
  }
  const c = leido?.cliente
  if (!c) return { codigo: 404, cuerpo: { error: 'No existe ese cliente.' } }

  const clave = confirmacionDe(c)
  if (!clave || String(confirmar ?? '').trim() !== clave) {
    return { codigo: 400, cuerpo: { error: 'Para borrar, escribe los últimos 4 caracteres de su número. No se borró nada.' } }
  }

  const borrar = Key => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key }))
  try {
    for (const Key of llavesDeConversacion(c)) await borrar(Key)
    await borrar(almacen.claveCliente(id))
  } catch (err) {
    if (sinPermiso(err)) {
      return { codigo: 409, cuerpo: { error: 'El servidor no tiene permiso para borrar (s3:DeleteObject sobre crm/). Falta aplicar infra/crm-backend-borrar.json. No se borró la ficha.' } }
    }
    registro.error?.('crm: falló el borrado de una conversación', String(err?.message ?? err))
    return { codigo: 502, cuerpo: { error: 'El borrado falló a medias. Vuelve a intentarlo: repetirlo no hace daño.' } }
  }

  const fueraDeLaLista = await almacen.quitarDelIndice([id])

  // El apunte: quién y cuándo. Sin número y sin mensajes, que es justo lo que
  // se pidió borrar. Si falla no se deshace nada: el borrado ya ocurrió.
  const hora = new Date(ahora ?? Date.now()).toISOString()
  try {
    let lista = []
    try {
      const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: CLAVE_BORRADOS }))
      const v = JSON.parse(await r.Body.transformToString())
      if (Array.isArray(v?.borrados)) lista = v.borrados
    } catch { /* todavía no existe */ }
    lista.push({ hora, quien, termina: clave, mensajes: c.mensajes?.length ?? 0, plaza: c.plaza ?? null })
    await s3.send(new PutObjectCommand({
      Bucket: bucket, Key: CLAVE_BORRADOS,
      Body: Buffer.from(JSON.stringify({ borrados: lista.slice(-MAX_BORRADOS), actualizado: hora })),
      ContentType: 'application/json; charset=utf-8', CacheControl: 'no-cache',
    }))
  } catch (err) {
    registro.warn?.('crm: se borró la conversación pero no se pudo apuntar', String(err?.message ?? err))
  }
  registro.log?.(`crm: conversación borrada por ${quien} (termina en ${clave})`)

  return {
    codigo: 200,
    cuerpo: {
      ok: true, borrado: id,
      ...(!fueraDeLaLista && { aviso: 'Se borró, pero su renglón puede seguir en la lista unos minutos.' }),
    },
  }
}
