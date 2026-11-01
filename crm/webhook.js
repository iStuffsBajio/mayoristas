// El webhook de Meta: verificar, validar la firma y leer lo que llega.
//
// Este módulo NO contesta. Sólo entiende la carga de Meta y la convierte en
// algo con sentido. Quien contesta es el cerebro, y corre después, porque:
//
// ── Meta corta a los 5 segundos ─────────────────────────────────────────────
//
// Si el webhook no responde 200 en unos segundos, Meta lo da por fallido y
// **reintenta**. El cerebro tarda más que eso: consulta inventario y piensa.
// Contestando dentro del webhook, Meta reintenta, el cerebro corre dos veces y
// la persona recibe la respuesta duplicada. Por eso el webhook sólo acusa
// recibo y encola; el cerebro corre aparte.
//
// ── Y reintenta de todas formas ─────────────────────────────────────────────
//
// Aunque se conteste a tiempo, Meta puede repetir un mensaje. Cada mensaje
// trae un `id` único (`wamid.…`) y hay que descartarlo si ya se vio. Sin eso,
// una respuesta duplicada es cuestión de tiempo, no de suerte.

import crypto from 'node:crypto'

// ── Verificación del enganche (GET) ─────────────────────────────────────────

/**
 * Meta llama una vez con GET para comprobar que el endpoint es nuestro.
 *
 * Devuelve `{ ok, challenge }`. El challenge se devuelve TAL CUAL en el
 * cuerpo, como texto plano y sin JSON alrededor, o Meta no acepta el enganche.
 */
export function verificarEnganche(query, { token = process.env.META_VERIFY_TOKEN } = {}) {
  const modo    = query?.['hub.mode']
  const recibido = query?.['hub.verify_token']
  const retar   = query?.['hub.challenge']

  if (modo !== 'subscribe') return { ok: false, motivo: 'modo' }
  if (!token) return { ok: false, motivo: 'sin-token-configurado' }
  if (!igualEnTiempoFijo(recibido, token)) return { ok: false, motivo: 'token' }
  return { ok: true, challenge: String(retar ?? '') }
}

/** Comparación que no se delata por el tiempo que tarda. */
function igualEnTiempoFijo(a, b) {
  const x = Buffer.from(String(a ?? ''))
  const y = Buffer.from(String(b ?? ''))
  if (x.length !== y.length) return false
  return crypto.timingSafeEqual(x, y)
}

// ── Firma (POST) ────────────────────────────────────────────────────────────

/**
 * Valida `X-Hub-Signature-256`.
 *
 * **Tiene que recibir el cuerpo CRUDO**, los bytes tal como llegaron. Volver a
 * serializar el JSON cambia el orden de las llaves y los espacios, y la firma
 * deja de cuadrar aunque los datos sean idénticos. Es el fallo clásico de este
 * endpoint y no da ninguna pista: todo se ve bien y nada valida.
 *
 * Sin firma válida no se procesa nada: cualquiera que conozca la URL podría
 * inyectar conversaciones y hacer que el bot escriba a números ajenos.
 */
export function firmaValida(cuerpoCrudo, cabecera, { secreto = process.env.META_APP_SECRET } = {}) {
  if (!secreto) return false
  const recibida = String(cabecera ?? '')
  if (!recibida.startsWith('sha256=')) return false

  const esperada = 'sha256=' + crypto
    .createHmac('sha256', secreto)
    .update(Buffer.isBuffer(cuerpoCrudo) ? cuerpoCrudo : Buffer.from(String(cuerpoCrudo), 'utf8'))
    .digest('hex')

  return igualEnTiempoFijo(recibida, esperada)
}

// ── Lectura de lo que llega ─────────────────────────────────────────────────

/** Los tipos que el bot sabe atender hoy. */
const TIPOS_ATENDIBLES = new Set(['text', 'interactive', 'button'])

/**
 * Saca los mensajes de una carga de Meta.
 *
 * La carga viene anidada en `entry[].changes[].value.messages[]` y puede traer
 * varios mensajes de varias personas en una sola llamada. También trae
 * `statuses[]` —entregado, leído, fallido—, que no son mensajes y se devuelven
 * aparte.
 */
export function leerCarga(carga) {
  const mensajes = [], estados = []

  for (const entrada of carga?.entry ?? []) {
    for (const cambio of entrada?.changes ?? []) {
      const v = cambio?.value
      if (!v) continue

      // El nombre del perfil viene en `contacts`, no en el mensaje. Se indexa
      // por teléfono para pegárselo a cada uno.
      const nombres = {}
      for (const c of v.contacts ?? []) {
        if (c?.wa_id) nombres[c.wa_id] = c?.profile?.name ?? null
      }

      for (const m of v.messages ?? []) {
        mensajes.push(leerMensaje(m, nombres, v?.metadata))
      }
      for (const e of v.statuses ?? []) {
        estados.push({ id: e?.id, estado: e?.status, de: e?.recipient_id, cuando: e?.timestamp })
      }
    }
  }
  return { mensajes, estados }
}

function leerMensaje(m, nombres, metadata) {
  const de = m?.from ?? null

  return {
    id: m?.id ?? null,
    de,
    nombre: nombres[de] ?? null,
    cuando: m?.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null,
    tipo: m?.type ?? null,
    atendible: TIPOS_ATENDIBLES.has(m?.type),
    texto: textoDe(m),
    // Lo que convierte esto en un CRM: de qué anuncio salió la conversación.
    anuncio: anuncioDe(m),
    // El número de la casa por el que entró. Si algún día hay uno por plaza,
    // esto dice cuál.
    numeroNuestro: metadata?.phone_number_id ?? null,
  }
}

/**
 * El texto, venga de donde venga.
 *
 * Un botón o una lista no traen `text`: traen el título de lo que se eligió, y
 * hay que tratarlo como si lo hubiera escrito la persona. Si no, elegir
 * «León» en una lista llega como un mensaje vacío y el bot vuelve a preguntar
 * lo mismo que acaba de contestar.
 */
function textoDe(m) {
  if (m?.type === 'text')   return m?.text?.body ?? null
  if (m?.type === 'button') return m?.button?.text ?? null
  if (m?.type === 'interactive') {
    const i = m.interactive
    return i?.list_reply?.title ?? i?.button_reply?.title ?? null
  }
  return null
}

/**
 * De qué anuncio viene, si viene de uno.
 *
 * Meta manda el objeto `referral` **sólo en el primer mensaje** de la
 * conversación, así que hay que guardarlo entonces: en el segundo mensaje ya
 * no está y la atribución se pierde para siempre.
 *
 * `source_id` es el anuncio, y `ref` es lo que nosotros pongamos en el enlace
 * del anuncio —ahí es donde conviene meter la plaza, para direccionar sin
 * preguntar—. `ctwa_clid` es lo que Meta pide de vuelta para atribuir la
 * conversión; no se usa para contestar, se guarda.
 */
export function anuncioDe(m) {
  const r = m?.referral
  if (!r) return null
  return {
    anuncio:   r.source_id   ?? null,
    tipo:      r.source_type ?? null,
    url:       r.source_url  ?? null,
    titular:   r.headline    ?? null,
    cuerpo:    r.body        ?? null,
    ref:       r.ref         ?? null,
    ctwaClid:  r.ctwa_clid   ?? null,
  }
}

/**
 * Cómo se le resume el anuncio al cerebro.
 *
 * Se le da el titular y el cuerpo del anuncio para que no explique el negocio
 * desde cero a quien acaba de leer de qué va. El `ctwa_clid` NO se le pasa: no
 * le sirve para contestar y sólo gasta contexto.
 */
export const anuncioParaElCerebro = a =>
  !a ? null : [a.titular, a.cuerpo].filter(Boolean).join(' — ') || a.anuncio || null

// ── Descarte de repetidos ───────────────────────────────────────────────────

/**
 * Memoria de los ids ya vistos.
 *
 * En la Lambda esto vive en la base, no en memoria: dos invocaciones no
 * comparten proceso. Esta versión en memoria sirve para las pruebas y para
 * correr el bot en una sola máquina.
 */
export function creaDescartador({ tope = 1000 } = {}) {
  const vistos = new Set()
  return {
    yaVisto(id) {
      if (!id) return false
      if (vistos.has(id)) return true
      vistos.add(id)
      // Se olvida lo más viejo para no crecer sin tope. Un Set de JS conserva
      // el orden de inserción, así que el primero es el más antiguo.
      if (vistos.size > tope) vistos.delete(vistos.values().next().value)
      return false
    },
    get tamano() { return vistos.size },
  }
}
