// Bajar la foto que mandó un cliente, para que el modelo la vea.
//
// ── Por qué hace falta bajarla ──────────────────────────────────────────────
//
// El webhook de Meta NO trae la imagen ni su dirección: trae un `id`. Con ese
// id y el token se le pide a Meta una URL, y esa URL —que también pide el
// token, y vale cinco minutos— es la que devuelve los bytes. Son dos
// peticiones por foto.
//
//   GET graph.facebook.com/<versión>/<id>   →  { url, mime_type, file_size }
//   GET <url>   (con el mismo Bearer)       →  los bytes
//
// ── Lo que NO se hace con la foto ───────────────────────────────────────────
//
// No se guarda. Ni en S3, ni en la ficha, ni en el historial del bot: se baja,
// se le pasa al modelo en ese turno y se suelta. Una foto de un cliente puede
// traer cualquier cosa —su cara, su casa, un documento— y guardar eso es una
// obligación que el aviso de privacidad publicado no cubre. En el historial
// queda una marca de texto («el cliente mandó una foto»), no la imagen.
//
// ── Si algo falla ───────────────────────────────────────────────────────────
//
// Esto LANZA y quien llama (`atender.js`) cae a la respuesta fija. Una foto
// que no se pudo leer nunca tumba el turno ni deja al cliente sin respuesta.
//
// ⚠️ NO COMPROBADO contra Meta (no hay token ni número en este repositorio):
// la forma exacta del objeto `image` del webhook y que la URL acepte el mismo
// token. Sale de la documentación de la Cloud API leída el 2026-11-13.

const VERSION = process.env.WHATSAPP_VERSION || 'v23.0'

/**
 * Lo más que se baja. WhatsApp comprime las fotos del chat a unos cientos de
 * KB, así que esto sólo corta lo raro. Va por debajo de los 5 MB que acepta
 * la API de Claude por imagen porque en base64 crece un tercio.
 */
export const TOPE_FOTO = 3_500_000

/** Lo que se espera a Meta en cada una de las dos peticiones. */
export const LIMITE_MEDIO_MS = 8_000

/** Las fotos del chat llegan en JPEG; PNG por si acaso. WebP es de stickers. */
export const TIPOS_DE_FOTO = ['image/jpeg', 'image/png']

/** El tipo según los primeros bytes. El que DICE Meta no se da por bueno. */
export function tipoPorBytes(bytes) {
  if (bytes?.[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg'
  if (bytes?.[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png'
  return null
}

function fallo(mensaje, extra = {}) {
  return Object.assign(new Error(mensaje), extra)
}

/** El error de Meta, con su código: es lo que distingue el token vencido. */
async function errorDeMeta(res, que) {
  const datos = await res.json().catch(() => ({}))
  return fallo(datos?.error?.message || `${que}: ${res.status}`, { estado: res.status, codigo: datos?.error?.code })
}

/**
 * Baja la foto de un mensaje. `medio` es `{ id, mime }`, como lo deja
 * `leerCarga`. Devuelve `{ mime, base64, bytes }`.
 */
export async function bajarFoto(medio, {
  fetchImpl = fetch,
  token = process.env.WHATSAPP_TOKEN,
  numero = process.env.WHATSAPP_PHONE_NUMBER_ID,
  tope = TOPE_FOTO,
  limiteMs = LIMITE_MEDIO_MS,
} = {}) {
  const id = String(medio?.id ?? '')
  // El id llega del webhook y va a parar a una URL: sólo lo que Meta usa.
  if (!/^[A-Za-z0-9_.-]{1,200}$/.test(id)) throw fallo('la foto no trae un id que se pueda pedir')
  if (!token) throw fallo('Falta WHATSAPP_TOKEN')
  const cabeceras = { Authorization: `Bearer ${token}` }
  const pedir = url => fetchImpl(url, { headers: cabeceras, signal: AbortSignal.timeout(limiteMs) })

  // 1. Del id a la URL. Con el número de la casa, Meta sólo contesta si la
  //    foto se mandó a ESE número.
  const consulta = numero ? `?phone_number_id=${encodeURIComponent(numero)}` : ''
  const r1 = await pedir(`https://graph.facebook.com/${VERSION}/${id}${consulta}`)
  if (!r1.ok) throw await errorDeMeta(r1, 'Meta no dio la dirección de la foto')
  const ficha = await r1.json().catch(() => ({}))
  if (Number(ficha?.file_size) > tope) throw fallo(`la foto pesa demasiado (${ficha.file_size} bytes)`)
  if (ficha?.mime_type && !TIPOS_DE_FOTO.includes(String(ficha.mime_type).split(';')[0].trim())) {
    throw fallo(`no es una foto que se pueda leer (${ficha.mime_type})`)
  }
  // El token va en la cabecera de esta petición: nunca a algo que no sea https.
  if (!/^https:\/\//.test(String(ficha?.url ?? ''))) throw fallo('Meta no devolvió una dirección para la foto')

  // 2. Los bytes.
  const r2 = await pedir(ficha.url)
  if (!r2.ok) throw await errorDeMeta(r2, 'no se pudo bajar la foto')
  if (Number(r2.headers?.get?.('content-length')) > tope) throw fallo('la foto pesa demasiado')
  const bytes = Buffer.from(await r2.arrayBuffer())
  if (bytes.length > tope) throw fallo(`la foto pesa demasiado (${bytes.length} bytes)`)
  const mime = tipoPorBytes(bytes)
  if (!mime) throw fallo('lo que se bajó no es una imagen JPEG ni PNG')

  return { mime, base64: bytes.toString('base64'), bytes: bytes.length }
}

// ── Cómo va la foto en la conversación del modelo ───────────────────────────

/** Lo que acompaña a una foto que llegó sin texto. Es un dato, no una orden. */
export const TEXTO_FOTO_SOLA = '(El cliente mandó esta foto, sin texto.)'

/** Lo que queda en el historial en lugar de la imagen. */
export const MARCA_DE_FOTO = '[El cliente mandó una foto]'

/** La entrada del turno: la foto y lo que escribió con ella. */
export const entradaConFoto = (foto, texto) => [
  { type: 'image', source: { type: 'base64', media_type: foto.mime, data: foto.base64 } },
  { type: 'text', text: texto || TEXTO_FOTO_SOLA },
]

/**
 * El historial sin las imágenes, para guardarlo.
 *
 * Dos razones, y cualquiera bastaría. La de privacidad está en la cabecera. La
 * otra es de dinero y de espacio: el historial ENTERO se manda al modelo en
 * cada turno, así que una foto guardada se volvería a pagar en todos los
 * mensajes siguientes de esa conversación, y el archivo de S3 pasaría de unos
 * KB a unos MB.
 *
 * Lo que el modelo dijo al verla se queda: con eso le basta para seguir.
 */
export function sinFotos(historial) {
  return (historial ?? []).map(m => {
    if (m?.role !== 'user' || !Array.isArray(m.content) || !m.content.some(b => b?.type === 'image')) return m
    const texto = m.content.filter(b => b?.type === 'text').map(b => b.text).filter(t => t && t !== TEXTO_FOTO_SOLA).join('\n')
    const resto = m.content.filter(b => b?.type !== 'image' && b?.type !== 'text')
    const marca = [MARCA_DE_FOTO, texto].filter(Boolean).join(' ')
    // Sólo había foto y texto: queda como un mensaje de texto normal.
    return resto.length ? { ...m, content: [{ type: 'text', text: marca }, ...resto] } : { ...m, content: marca }
  })
}

/** ¿Se leen las fotos? Sí, salvo que `CRM_LEER_FOTOS` valga `0`. */
export const leerFotosActivo = (valor = process.env.CRM_LEER_FOTOS) => String(valor ?? '').trim() !== '0'
