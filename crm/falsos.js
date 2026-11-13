// Un S3 y una cola de mentira, para probar la estructura de producción sin
// tocar AWS.
//
// No son un adorno de las pruebas: son la única forma de comprobar lo que de
// verdad puede romperse aquí —dos escrituras a la vez, un mensaje entregado
// dos veces, un turno que falla a medias— y ninguna de esas cosas se puede
// provocar a propósito contra el S3 real.
//
// ── Lo que tienen que imitar, y nada más ────────────────────────────────────
//
// De S3: que cada objeto tiene un ETag que cambia al escribirse, que
// `If-Match` rechaza con 412 si ya no es ése, y que `If-None-Match: *` rechaza
// si el objeto existe. Un falso que aceptara cualquier escritura dejaría las
// pruebas de concurrencia en verde sin comprobar nada: la escritura
// condicional es justo lo que se está probando.
//
// De SQS FIFO: que dentro de un grupo (un teléfono) no se entrega el segundo
// mensaje hasta que el primero se borró o se rindió, que un mensaje que falla
// vuelve a entregarse, y que tras `maxEntregas` se va a la cola de fallidos.

/** El error que da S3 cuando la condición de la escritura no se cumple. */
function precondicion() {
  const e = new Error('At least one of the pre-conditions you specified did not hold')
  e.name = 'PreconditionFailed'
  e.$metadata = { httpStatusCode: 412 }
  return e
}

function noExiste(Key) {
  const e = new Error(`The specified key does not exist: ${Key}`)
  e.name = 'NoSuchKey'
  e.$metadata = { httpStatusCode: 404 }
  return e
}

/**
 * Lo que S3 contesta al pedir una llave que NO existe cuando al rol le falta
 * `s3:ListBucket`: un 403, no un 404. S3 no le dice a quien no puede listar
 * si la llave existe o no.
 */
function sinPermiso() {
  const e = new Error('Access Denied')
  e.name = 'AccessDenied'
  e.$metadata = { httpStatusCode: 403 }
  return e
}

/**
 * Un S3 de memoria con la forma del cliente del SDK: `send(comando)`.
 *
 * `puedeListar` imita el permiso `s3:ListBucket` del rol. Con él en `false`,
 * una llave que no existe da **AccessDenied** en vez de NoSuchKey, que es lo
 * que hace S3 de verdad y lo que tumbó el primer mensaje de cada cliente
 * nuevo en producción (2026-11-12): el almacén de conversaciones lee «no
 * existe» como conversación nueva, y un 403 no es «no existe». Un falso que
 * siempre contesta NoSuchKey deja ese fallo en verde.
 *
 * `puedeBorrar` imita `s3:DeleteObject`.
 *
 * `antesDeEscribir(Key, comando)` corre justo antes de aplicar un Put —después
 * de que quien escribe ya leyó—. Es el gancho para colar OTRA escritura en
 * medio, que es como se provoca la carrera.
 *
 * `fallar(comando)`, si devuelve un error, lo lanza en vez de atender: para
 * imitar un S3 caído.
 */
export function s3Falso() {
  const objetos = new Map()   // Key → { cuerpo, etag }
  let serie = 0
  const api = {
    objetos,
    antesDeEscribir: null,
    fallar: null,
    puedeListar: true,
    puedeBorrar: true,
    escrituras: 0,
    rechazos: 0,

    async send(comando) {
      const tipo = comando?.constructor?.name
      const { Key } = comando.input
      const err = api.fallar?.(comando)
      if (err) throw err

      if (tipo === 'GetObjectCommand') {
        const o = objetos.get(Key)
        if (!o) throw (api.puedeListar ? noExiste(Key) : sinPermiso())
        return { ETag: o.etag, Body: { transformToString: async () => o.cuerpo } }
      }

      if (tipo === 'PutObjectCommand') {
        if (api.antesDeEscribir) {
          // Se quita mientras corre: lo que el gancho escriba no debe volver
          // a dispararlo.
          const gancho = api.antesDeEscribir
          api.antesDeEscribir = null
          try { await gancho(Key, comando) } finally { api.antesDeEscribir ??= gancho }
        }
        const actual = objetos.get(Key)
        const { IfMatch, IfNoneMatch } = comando.input
        if ((IfNoneMatch === '*' && actual) || (IfMatch && actual?.etag !== IfMatch)) {
          api.rechazos++
          throw precondicion()
        }
        const etag = `"e${++serie}"`
        objetos.set(Key, { cuerpo: Buffer.from(comando.input.Body).toString('utf8'), etag })
        api.escrituras++
        return { ETag: etag }
      }

      if (tipo === 'DeleteObjectCommand') {
        if (!api.puedeBorrar) throw sinPermiso()
        // Borrar lo que no existe no es un error en S3.
        objetos.delete(Key)
        return {}
      }

      throw new Error(`s3Falso: no sé atender ${tipo}`)
    },

    /** Lo guardado en una llave, ya leído. */
    json(Key) {
      const o = objetos.get(Key)
      return o ? JSON.parse(o.cuerpo) : null
    },
    get llaves() { return [...objetos.keys()].sort() },
  }
  return api
}

/**
 * Una cola FIFO de mentira, con la forma de la de SQS.
 *
 * `enviar(entradas)` recibe lo mismo que arma `entradasDeCola()` del backend:
 * `{ grupo, dedup, cuerpo }`. `vaciar(trabajador)` entrega hasta que no queda
 * nada, llamando al trabajador con un evento como el que Lambda recibe de SQS
 * y leyendo su `batchItemFailures`.
 *
 * Los grupos se atienden A LA VEZ entre sí —como en SQS— y en orden dentro de
 * cada uno. Si las pruebas atendieran todo en fila, «en orden por teléfono»
 * saldría bien aunque el orden no lo garantizara nadie.
 */
export function colaFifoFalsa({ maxEntregas = 3 } = {}) {
  const grupos = new Map()      // grupo → [{ id, cuerpo, entregas }]
  const vistos = new Set()      // ids de deduplicación ya aceptados
  const fallidos = []
  let serie = 0

  return {
    fallidos,
    /** Cuántas veces se llamó al trabajador, con qué. */
    entregas: [],

    async enviar(entradas) {
      for (const { grupo, dedup, cuerpo } of entradas) {
        if (!grupo) throw new Error('colaFifoFalsa: un mensaje FIFO sin grupo se rechaza')
        // SQS descarta en silencio lo que repite el id de deduplicación.
        if (dedup && vistos.has(dedup)) continue
        if (dedup) vistos.add(dedup)
        if (!grupos.has(grupo)) grupos.set(grupo, [])
        grupos.get(grupo).push({ id: `m${++serie}`, cuerpo, entregas: 0 })
      }
    },

    get pendientes() { return [...grupos.values()].reduce((s, g) => s + g.length, 0) },

    async vaciar(trabajador, { contexto } = {}) {
      const atenderGrupo = async (grupo, fila) => {
        while (fila.length) {
          const m = fila[0]
          m.entregas++
          const evento = {
            Records: [{
              messageId: m.id,
              body: m.cuerpo,
              attributes: { ApproximateReceiveCount: String(m.entregas), MessageGroupId: grupo },
            }],
          }
          this.entregas.push({ grupo, id: m.id, entrega: m.entregas })
          let fallo
          try {
            const r = await trabajador(evento, contexto)
            fallo = (r?.batchItemFailures ?? []).some(f => f.itemIdentifier === m.id)
          } catch {
            // Una función que revienta entera: SQS lo cuenta como fallo de todo
            // el lote.
            fallo = true
          }
          if (!fallo) { fila.shift(); continue }
          if (m.entregas >= maxEntregas) { fallidos.push({ grupo, ...fila.shift() }); continue }
          // Si falló y le quedan entregas, se queda a la CABEZA: el siguiente
          // del mismo teléfono no pasa por delante.
        }
        grupos.delete(grupo)
      }
      while (grupos.size) {
        await Promise.all([...grupos.entries()].map(([g, fila]) => atenderGrupo(g, fila)))
      }
    },
  }
}
