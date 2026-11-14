// De un mensaje que llegó a una respuesta mandada.
//
// Esto es lo que une las piezas: descarta repetidos, carga la conversación,
// resuelve la plaza, decide si hace falta el modelo, manda y guarda.
//
// ── Por qué no todo pasa por el modelo ──────────────────────────────────────
//
// Porque desde el 1 de octubre de 2026 Meta cobra los mensajes de servicio
// —1,000 gratis al mes por número y después se pagan— y el modelo también se
// paga. Una nota de voz, un sticker o un «gracias» no necesitan que nadie
// piense: tienen una respuesta fija, correcta y gratis. Lo que sí necesita
// pensar es lo que trae una pregunta.
//
// ── El orden importa ────────────────────────────────────────────────────────
//
// 1. Descartar repetidos ANTES de cualquier otra cosa. Meta reintenta, y un
//    repetido que llega hasta el envío es una respuesta duplicada al cliente.
// 2. Marcar leído ANTES de pensar. Entre que llega el mensaje y que el cerebro
//    contesta pasan segundos; sin esto la persona ve su mensaje sin entregar y
//    cree que nadie lo leyó.
// 3. Guardar DESPUÉS de mandar. Si el envío falla, el turno no se da por
//    hablado y el siguiente intento vuelve a contestarlo.

import { mandarRespuesta, marcarLeido } from './whatsapp-api.js'
import { anuncioParaElCerebro } from './webhook.js'
import { conAnuncio } from './conversaciones.js'
import { plazaPara } from './plazas.js'
import { esPlazaPublica } from './inventario.js'
import { apuntarEntrada, apuntarSalida, conRemitente } from './bandeja.js'
import { TIPOS_SIN_RESPUESTA } from '../backend/src/meta-webhook.js'
import { entradaConFoto, sinFotos } from './medios.js'

/**
 * El cerebro se carga sólo cuando de verdad hace falta.
 *
 * No es una optimización: `cerebro.js` importa el SDK de Anthropic, y basta
 * con tenerlo en la cabecera para que estas pruebas no puedan correr sin él ni
 * sin sus dependencias opcionales. Quien inyecta `pensar` —las pruebas, y un
 * día un modelo distinto— no debería necesitar nada de eso instalado.
 */
let cerebro = null
async function pensarConElCerebro(args) {
  cerebro ??= await import('./cerebro.js')
  return cerebro.contestar(args)
}

/**
 * Respuestas fijas para lo que el bot no sabe leer.
 *
 * Cada una dice qué hacer en su lugar. «No puedo con eso» a secas deja a la
 * persona sin salida y se va.
 */
export const RESPUESTAS_FIJAS = {
  audio: 'Por aquí no alcanzo a escuchar las notas de voz. Escríbeme la marca y el modelo de tu teléfono y te digo luego luego qué tengo.',
  video: 'No puedo ver los videos por aquí. Dime la marca y el modelo de tu teléfono y te ayudo.',
  image: 'Todavía no alcanzo a ver las fotos por aquí. Si me escribes la marca y el modelo —viene atrás del teléfono o en Ajustes, en "Acerca del teléfono"— te digo qué funda le queda.',
  document: 'No puedo abrir archivos por aquí. Escríbeme qué modelo buscas y te digo qué hay.',
  sticker: 'Dime la marca y el modelo de tu teléfono y te digo qué fundas tengo.',
  location: 'Gracias. Para ver existencias dime mejor de qué ciudad eres, y te digo en cuál de las tres tiendas te queda más cerca.',
  contacts: 'Escríbeme la marca y el modelo de tu teléfono y te digo qué tengo.',
  unknown: 'No alcancé a leer eso. Escríbeme la marca y el modelo de tu teléfono y te digo qué fundas hay.',
}

/**
 * La plaza que viene en el `ref` del anuncio.
 *
 * El `ref` lo ponemos NOSOTROS al armar el anuncio, así que es la vía más
 * barata y exacta de direccionar: un anuncio por plaza con `ref=plaza=leon` y
 * el lead llega ya clasificado, sin preguntarle nada a nadie.
 *
 * Se acepta `plaza=leon`, `leon` a secas o el slug en cualquier parte de la
 * cadena, porque quien teclee eso en el panel de Meta va a escribirlo como le
 * salga y no hay forma de validarlo desde aquí.
 */
export function plazaDelRef(ref) {
  const t = String(ref ?? '').toLowerCase()
  if (!t) return null
  for (const slug of ['aguascalientes', 'san-luis', 'leon']) {
    // El slug con guion y también con espacio o guion bajo.
    const variantes = [slug, slug.replace('-', ' '), slug.replace('-', '_')]
    if (variantes.some(v => t.includes(v))) return slug
  }
  return null
}

/**
 * La plaza de esta conversación, por orden de confianza.
 *
 * 1. La que ya se sabía: no se le vuelve a preguntar a nadie.
 * 2. La del `ref` del anuncio: gratis y exacta.
 * 3. Null, y entonces el cerebro pregunta. **No se adivina.**
 */
export function resolverPlaza(conversacion, anuncio) {
  if (esPlazaPublica(conversacion?.plaza)) return conversacion.plaza
  const delRef = plazaDelRef(anuncio?.ref)
  if (delRef && esPlazaPublica(delRef)) return delRef
  return null
}

/**
 * Atiende un mensaje ya leído por `leerCarga()`.
 *
 * `almacen` es cualquiera de las implementaciones de `conversaciones.js`.
 * `bandeja`, si viene, es la del CRM (`bandeja.js`): ahí se apunta lo que se
 * dijo y ahí se decide si el bot contesta o se calla porque atiende la tienda.
 * `enviar` y `leer` se inyectan para poder probar sin mandar nada.
 *
 * `verFoto(medio)`, si viene, baja la foto que mandó el cliente para que el
 * modelo la vea (`medios.js`). Sin él —o si falla— una foto se contesta con
 * la respuesta fija, como antes.
 *
 * Devuelve qué pasó, para el registro: `{ atendido, motivo, respuesta, lead }`.
 */
export async function atender(mensaje, {
  almacen,
  bandeja = null,
  enviar = mandarRespuesta,
  leer = marcarLeido,
  pensar = pensarConElCerebro,
  verFoto = null,
  registro = console,
} = {}) {
  // Un pulgar arriba o un aviso de Meta no esperan respuesta.
  if (TIPOS_SIN_RESPUESTA.has(mensaje?.tipo)) return { atendido: true, motivo: 'no-se-contesta' }
  // Quien escribe sin teléfono se atiende por su identificador de WhatsApp.
  mensaje = await conRemitente(mensaje, bandeja)
  if (!mensaje?.de) return { atendido: false, motivo: 'sin-remitente' }

  // 1. Repetidos primero. Meta reintenta y un repetido que llega al envío es
  //    una respuesta duplicada para el cliente.
  if (await almacen.yaAtendido(mensaje.de, mensaje.id)) {
    return { atendido: false, motivo: 'repetido' }
  }

  // Desde aquí el mensaje ya está marcado como visto, así que cualquier fallo
  // tiene que desmarcarlo o el reintento de Meta se descarta y la persona no
  // recibe nada nunca.
  try {
    return await procesar(mensaje, { almacen, bandeja, enviar, leer, pensar, verFoto, registro })
  } catch (err) {
    await almacen.olvidarMensaje(mensaje.de, mensaje.id)
    throw err
  }
}

/**
 * La foto del mensaje, lista para el modelo, o null.
 *
 * Null es «contesta lo fijo»: no venía foto, no hay con qué bajarla, o no se
 * pudo. NUNCA lanza: una foto ilegible no puede dejar a nadie sin respuesta.
 */
async function fotoDelMensaje(mensaje, verFoto, registro) {
  if (mensaje.tipo !== 'image' || !mensaje.medio?.id || !verFoto) return null
  try {
    const foto = await verFoto(mensaje.medio)
    return foto?.base64 && foto?.mime ? foto : null
  } catch (err) {
    registro?.warn?.('crm: no se pudo leer la foto; va la respuesta fija', String(err?.message ?? err))
    return null
  }
}

async function procesar(mensaje, { almacen, bandeja, enviar, leer, pensar, verFoto, registro }) {
  // A dónde se le contesta. Casi siempre es `de`; cambia sólo para quien ya
  // tenía ficha con teléfono y ahora escribe sin él (ver `conRemitente`).
  const destino = mensaje.responderA ?? mensaje.de

  // 2. Las palomitas antes de pensar. Pensar tarda segundos.
  if (mensaje.id) {
    try { await leer(mensaje.id) } catch { /* cosmético: no se cae por esto */ }
  }

  let conversacion = await almacen.obtener(mensaje.de)
  conversacion = conAnuncio(conversacion, mensaje.anuncio)
  if (mensaje.nombre && !conversacion.nombre) conversacion.nombre = mensaje.nombre

  const plaza = resolverPlaza(conversacion, conversacion.anuncio)
  if (plaza) conversacion.plaza = plaza

  // Lo que escribió se apunta en la bandeja ANTES de decidir nada. Y si una
  // persona de la tienda tiene la conversación, el bot no contesta: dos voces
  // a la vez —el bot repitiendo el precio mientras la tienda acuerda el envío—
  // es peor que cualquiera de las dos sola.
  const entrada = await apuntarEntrada(bandeja, mensaje, { plaza: conversacion.plaza, anuncio: conversacion.anuncio })
  if (!entrada.contesta) {
    await almacen.guardar(conversacion)
    return { atendido: true, motivo: 'lo-atiende-la-tienda' }
  }

  // Una foto se intenta leer DESPUÉS de saber que contesta el bot: si la
  // conversación la tiene la tienda, no se baja nada.
  const foto = await fotoDelMensaje(mensaje, verFoto, registro)

  // 3. Lo que no se sabe leer se contesta fijo. No gasta modelo ni inventa.
  if (!foto && (!mensaje.atendible || !mensaje.texto)) {
    const texto = RESPUESTAS_FIJAS[mensaje.tipo] ?? RESPUESTAS_FIJAS.unknown
    const envio = await enviar(destino, { texto, imagenes: [] })
    await almacen.guardar(conversacion)
    await apuntarSalida(bandeja, mensaje.de, { texto })
    return { atendido: true, motivo: 'respuesta-fija', respuesta: { texto }, envio }
  }

  // 4. Pensar.
  const r = await pensar({
    historial: conversacion.historial,
    entrada: foto ? entradaConFoto(foto, mensaje.texto) : mensaje.texto,
    contexto: {
      plaza: conversacion.plaza,
      nombre: conversacion.nombre,
      deAnuncio: anuncioParaElCerebro(conversacion.anuncio),
    },
  })

  // Un turno sin texto —rechazo, o se agotaron las vueltas— no se manda en
  // blanco: se contesta algo que deja a la persona con una salida, y el
  // historial de ese turno NO se guarda, para que el siguiente mensaje no
  // arrastre un turno roto.
  if (!r.texto) {
    const texto = 'Déjame pasarte con la tienda para que te atiendan bien. ¿De qué ciudad eres?'
    const envio = await enviar(destino, { texto, imagenes: [] })
    await almacen.guardar(conversacion)
    await apuntarSalida(bandeja, mensaje.de, { texto })
    return {
      atendido: true,
      motivo: r.rechazado ? 'rechazado' : r.seAtoro ? 'se-atoro' : 'sin-texto',
      respuesta: { texto },
      envio,
      uso: r.uso,
    }
  }

  // 5. Mandar, y sólo si salió bien dar el turno por hablado.
  const envio = await enviar(destino, r)

  // La imagen no se guarda: ni por privacidad ni por lo que costaría
  // reenviarla al modelo en cada turno siguiente. Ver `sinFotos`.
  conversacion.historial = foto ? sinFotos(r.historial) : r.historial
  if (r.entrega) {
    conversacion.ultimoLead = {
      plaza: r.entrega.plaza,
      cuando: new Date().toISOString(),
      enlace: r.entrega.enlace,
    }
  }
  await almacen.guardar(conversacion)
  await apuntarSalida(bandeja, mensaje.de, { texto: r.texto, imagenes: r.imagenes?.length ?? 0, entrega: r.entrega })

  return {
    atendido: true,
    motivo: 'contestado',
    respuesta: { texto: r.texto, imagenes: r.imagenes },
    lead: r.entrega ?? null,
    envio,
    uso: r.uso,
  }
}

/**
 * Atiende todos los mensajes de una carga de Meta.
 *
 * Uno por uno y no en paralelo: dos mensajes del MISMO teléfono que se
 * atienden a la vez leen la conversación antes de que el otro la guarde, y el
 * segundo pisa el historial del primero. Pasa de verdad, porque la gente manda
 * «hola» y «tienes para iphone 13?» en dos mensajes seguidos y Meta los
 * entrega en la misma llamada.
 */
export async function atenderCarga(mensajes, opciones) {
  const resultados = []
  for (const m of mensajes ?? []) {
    try {
      resultados.push({ id: m.id, ...(await atender(m, opciones)) })
    } catch (err) {
      // Un mensaje que revienta no debe tumbar los demás de la misma carga.
      resultados.push({ id: m.id, atendido: false, motivo: 'error', error: String(err.message ?? err) })
    }
  }
  return resultados
}
