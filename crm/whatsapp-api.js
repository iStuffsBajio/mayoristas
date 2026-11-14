// Mandar mensajes por la Cloud API de WhatsApp.
//
// Lo único que hace este módulo es hablar con Meta. No sabe nada de fundas, de
// precios ni de sucursales: recibe texto o una URL de imagen y los manda. Así
// se puede probar el cerebro sin mandar nada, y probar el envío sin pensar.
//
// ── Lo que Meta corta en silencio ───────────────────────────────────────────
//
// Un texto de más de 4096 caracteres y un pie de foto de más de 1024 se
// rechazan con un 400 que no dice cuál de los dos campos fue. Se recortan
// aquí, con un aviso, en vez de descubrirlo en producción con un mensaje que
// nunca llegó.
//
// ── Las fotos van por URL, no por bytes ─────────────────────────────────────
//
// Meta descarga la imagen él mismo del enlace que se le pasa, así que tiene
// que ser pública y servir el `Content-Type` correcto. Por eso las fotos del
// catálogo se sirven del sitio y no del bucket privado.

const VERSION = process.env.WHATSAPP_VERSION || 'v23.0'
const TOKEN   = () => process.env.WHATSAPP_TOKEN
const NUMERO  = () => process.env.WHATSAPP_PHONE_NUMBER_ID

/** Topes de Meta. Pasarse de aquí es un 400 sin explicación. */
export const TOPE_TEXTO = 4096
export const TOPE_PIE   = 1024

export const configurada = () => !!(TOKEN() && NUMERO())

/** Recorta y avisa. Cortar un mensaje es malo; perderlo entero es peor. */
export function recortar(texto, tope) {
  const t = String(texto ?? '')
  if (t.length <= tope) return t
  return t.slice(0, tope - 1) + '…'
}

/**
 * Los números de México llegan en el webhook como `521` + 10 dígitos —con un
 * «1» que ya no existe—, pero Meta guarda y acepta `52` + 10 dígitos. Mandando
 * al `521...` tal cual, la API contesta (#131030) «Recipient phone number not
 * in allowed list» para un número que SÍ está en la lista. Pasó en la primera
 * prueba real, el 2026-11-12. Sólo se toca lo que tiene exactamente esa forma;
 * cualquier otro número sale como llegó.
 */
export function paraEnvio(numero) {
  const n = String(numero ?? '')
  return /^521\d{10}$/.test(n) ? '52' + n.slice(3) : n
}

/**
 * A quien WhatsApp no le comparte el teléfono se le manda por su identificador
 * (BSUID), y eso NO va en `to`: va en `recipient`, sin `to`. Mandando los dos,
 * Meta usa `to` e ignora el otro. Documentado por Meta para la Cloud API desde
 * julio de 2026; ⚠️ no se ha probado en esta cuenta.
 */
const ES_BSUID = /^[A-Z]{2}\.(?:ENT\.)?[A-Za-z0-9]{1,128}$/

async function mandar(cuerpo, { fetchImpl = fetch } = {}) {
  if (cuerpo?.to && ES_BSUID.test(String(cuerpo.to))) {
    const { to, ...resto } = cuerpo
    cuerpo = { ...resto, recipient: to }
  }
  if (cuerpo?.to) cuerpo = { ...cuerpo, to: paraEnvio(cuerpo.to) }
  if (!configurada()) {
    throw new Error('Falta WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID')
  }

  const res = await fetchImpl(`https://graph.facebook.com/${VERSION}/${NUMERO()}/messages`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${TOKEN()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...cuerpo }),
  })

  const datos = await res.json().catch(() => ({}))
  if (!res.ok) {
    // El detalle de Meta se conserva: `code` y `details` son lo que distingue
    // «el número no tiene WhatsApp» de «se cerró la ventana de 24 horas», y
    // sin eso no se puede decidir si reintentar.
    const err = new Error(datos?.error?.message || `WhatsApp ${res.status}`)
    err.estado  = res.status
    err.codigo  = datos?.error?.code
    err.detalle = datos?.error?.error_data?.details
    throw err
  }
  return { id: datos?.messages?.[0]?.id ?? null, datos }
}

/** Un mensaje de texto. */
export const mandarTexto = (a, texto, opts) =>
  mandar({ to: a, type: 'text', text: { body: recortar(texto, TOPE_TEXTO), preview_url: false } }, opts)

/** Una imagen con su pie. El pie es donde va «Foto de referencia: …». */
export const mandarImagen = (a, url, pie = '', opts) =>
  mandar({ to: a, type: 'image', image: { link: url, ...(pie && { caption: recortar(pie, TOPE_PIE) }) } }, opts)

/**
 * Marca el mensaje como leído (las dos palomitas azules).
 *
 * Vale la pena aunque parezca cosmético: entre que llega el mensaje y que el
 * cerebro contesta pasan unos segundos, y sin esto la persona ve su mensaje
 * sin entregar y cree que nadie lo leyó.
 */
export const marcarLeido = (idMensaje, opts) =>
  mandar({ status: 'read', message_id: idMensaje }, opts)

/**
 * Manda la respuesta completa de `contestar()`: el texto y sus imágenes.
 *
 * Las imágenes van DESPUÉS del texto a propósito. Al revés, la foto llega
 * sola y sin contexto, y en el teléfono se ve como un mensaje de alguien que
 * se equivocó de chat.
 *
 * Una imagen que falla no tumba el resto: su error se devuelve en `fallos` y
 * el texto ya llegó, que es lo que más importa.
 */
export async function mandarRespuesta(a, respuesta, opts) {
  const enviados = [], fallos = []

  if (respuesta?.texto) {
    enviados.push(await mandarTexto(a, respuesta.texto, opts))
  }

  for (const img of respuesta?.imagenes ?? []) {
    try {
      enviados.push(await mandarImagen(a, img.url, img.pie, opts))
    } catch (err) {
      fallos.push({ url: img.url, error: err.message })
    }
  }

  return { enviados, fallos }
}
