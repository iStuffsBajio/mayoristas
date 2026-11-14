// Los clientes y la bandeja del CRM.
//
// Lo pidió el dueño el 2026-11-11: «un CRM que me distribuya las conversaciones
// en base a los clientes que estén escribiendo» y que lleve «el control de
// todos mis clientes, así como mayoristas». Eligió construirlo sobre lo que ya
// existe en vez de comprar una plataforma.
//
// Aquí vive SÓLO la regla: qué es un cliente, por qué estados pasa su
// conversación y quién ve qué. No toca S3 ni la red, así que se prueba sin
// nada y la usan los dos lados: el backend, que guarda, y el bot (`crm/`), que
// escribe cada mensaje que entra. Una sola copia, por la misma razón que el bot
// no reimplementa la búsqueda: dos copias acaban diciendo cosas distintas.
//
// ── La ficha y la conversación van JUNTAS ──────────────────────────────────
//
// Un archivo por cliente con su ficha, su conversación visible y su bitácora.
// Separarlos obligaría a escribir dos archivos por mensaje, y el día que uno se
// guardara y el otro no, la bandeja diría «pendiente» de alguien que ya se
// atendió.
//
// ── Lo que ve la tienda NO es el historial del bot ─────────────────────────
//
// El bot guarda aparte (`crm/conversaciones.js`) el historial con las llamadas
// a herramientas, que es lo que necesita el modelo. Aquí va lo que se dijo, en
// el orden en que se dijo: es lo que una persona lee para retomar la plática.

/** Las plazas que atienden clientes. Bodega y Ferias no. */
export const PLAZAS_CLIENTES = ['leon', 'san-luis', 'aguascalientes', 'torreon']

/**
 * Por dónde va la conversación.
 *
 * | estado     | quién contesta | qué significa                                  |
 * |------------|----------------|------------------------------------------------|
 * | bot        | el bot         | nadie de la tienda la ha tomado                |
 * | pendiente  | NADIE todavía  | el bot la entregó a una tienda y espera        |
 * | atendiendo | la tienda      | alguien la tomó; el bot ya no contesta         |
 * | cerrada    | el bot         | se resolvió; si vuelve a escribir, empieza otra |
 *
 * La regla que más importa: **con una persona de la tienda en medio, el bot se
 * calla.** Dos voces contestando a la vez —el bot repitiendo el precio mientras
 * la tienda negocia el envío— es peor que cualquiera de las dos sola.
 */
export const ESTADOS = ['pendiente', 'atendiendo', 'bot', 'cerrada']

export const TIPOS = ['publico', 'mayorista']
export const CANALES = ['whatsapp', 'instagram', 'messenger', 'tienda', 'tickets']

/** Mensajes que se guardan por cliente. Lo viejo se tira por la cabeza. */
export const MAX_MENSAJES = 200
/** Renglones de bitácora que se guardan por cliente. */
export const MAX_BITACORA = 100
/** Largo máximo de lo que alguien teclea en un campo de texto. */
export const MAX_TEXTO = 2000

const ahoraIso = ahora => new Date(ahora ?? Date.now()).toISOString()
const texto = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * Un teléfono mexicano en la forma de WhatsApp: 52 + 10 dígitos, o ''.
 *
 * Es la misma regla que `telefonoWhatsApp()` en `src/lib/sucursales.js`; el
 * backend no puede importar de `src/`, y `crm/reglas.test.js` las pone frente a
 * frente para que no se separen.
 */
export function telefonoMx(valor) {
  if (!valor) return ''
  let d = String(valor).replace(/\D/g, '')
  if (d.length === 13 && (d.startsWith('521') || d.startsWith('044') || d.startsWith('045'))) d = d.slice(3)
  else if (d.length === 12 && d.startsWith('52')) d = d.slice(2)
  if (d.length !== 10) return ''
  return `52${d}`
}

/**
 * ¿Es un identificador de usuario de WhatsApp (BSUID) y no un teléfono?
 *
 * Desde abril de 2026 Meta manda, junto al teléfono, un identificador propio
 * de cada persona PARA ESTE NEGOCIO: el código del país, un punto y hasta 128
 * letras y números —`MX.13491208655302741918`—. Y a quien active su nombre de
 * usuario en WhatsApp, Meta puede dejar de mandarle el teléfono: entonces el
 * identificador es lo ÚNICO que llega, y por él se le contesta.
 *
 * Un teléfono son sólo dígitos, así que no se confunden.
 */
export const esBsuid = v => /^[A-Z]{2}\.(?:ENT\.)?[A-Za-z0-9]{1,128}$/.test(String(v ?? ''))

/**
 * La llave de un cliente.
 *
 * Por WhatsApp es el teléfono: es lo que la persona reconoce. Si WhatsApp no
 * lo da (ver `esBsuid`), la llave sale de su identificador: `wa:u-MX-1349…`.
 *
 * ⚠️ Un teléfono que no es mexicano de 10 dígitos NO da llave, ni ahora ni
 * antes: ese cliente recibe respuesta del bot pero no tiene ficha. Instagram y Messenger no dan teléfono, dan un identificador
 * propio de la página, así que van con su canal delante. Un mayorista que sólo
 * existe en los tickets de Eleventa no tiene ninguno de los dos: va con su
 * plaza y su clave, hasta que alguien le capture el teléfono.
 */
export function idDe({ canal, telefono, usuario, idCanal, plaza, clave }) {
  if (canal === 'whatsapp' || (!canal && telefono)) {
    const t = telefonoMx(telefono)
    if (t) return `wa:${t}`
    // Las mayúsculas se conservan: en una llave de S3 distinguen.
    return esBsuid(usuario) ? `wa:u-${String(usuario).replace(/\./g, '-')}` : ''
  }
  if (canal === 'instagram' || canal === 'messenger') {
    const i = String(idCanal ?? '').replace(/[^0-9a-zA-Z_-]/g, '')
    return i ? `${canal === 'instagram' ? 'ig' : 'fb'}:${i}` : ''
  }
  if (canal === 'tickets' || canal === 'tienda') {
    const c = String(clave ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
    return PLAZAS_CLIENTES.includes(plaza) && c ? `${canal === 'tickets' ? 'may' : 'tda'}:${plaza}:${c}` : ''
  }
  return ''
}

/** Una llave que se puede usar como nombre de archivo sin sorpresas. */
export const idValido = id => /^(wa|ig|fb|may|tda):[a-z0-9:_-]{3,160}$/i.test(String(id ?? ''))

/** Nombre de archivo de un cliente. Los dos puntos no van en una llave de S3. */
export const archivoDe = id => `${String(id).replace(/:/g, '_')}.json`

/** De dónde llegó: se guarda una vez, en el primer contacto, y no se pisa. */
function origenLimpio(o) {
  if (!o || typeof o !== 'object') return null
  const limpio = {
    fuente:   texto(o.fuente, 40) || null,      // meta, google, web, tienda, tickets
    campana:  texto(o.campana, 120) || null,
    anuncio:  texto(o.anuncio, 120) || null,
    codigo:   texto(o.codigo, 60) || null,
    ctwaClid: texto(o.ctwaClid, 200) || null,   // lo que Meta pide para atribuir la venta
    gclid:    texto(o.gclid, 200) || null,      // lo mismo para Google
  }
  return Object.values(limpio).some(Boolean) ? limpio : null
}

/** Un cliente nuevo. `id` sale de `idDe()`; si viene vacío, no hay cliente. */
export function nuevoCliente({ id, canal, telefono, usuario, nombre, plaza, tipo, origen, quien = 'sistema' }, { ahora } = {}) {
  if (!idValido(id)) return null
  const hora = ahoraIso(ahora)
  return {
    id,
    canal: CANALES.includes(canal) ? canal : 'whatsapp',
    telefono: telefonoMx(telefono) || null,
    // El identificador de WhatsApp de esta persona, si Meta lo mandó. Con él
    // se la reconoce el día que escriba SIN teléfono, y por él se le contesta.
    ...(esBsuid(usuario) && { usuario: String(usuario) }),
    nombre: texto(nombre, 120) || null,
    plaza: PLAZAS_CLIENTES.includes(plaza) ? plaza : null,
    tipo: TIPOS.includes(tipo) ? tipo : 'publico',
    ciudad: null,
    modelo: null,          // el teléfono que tiene: lo que hace falta para venderle
    etiquetas: [],
    notas: '',
    // Para los avisos recurrentes (fase 5). `null` es «no se sabe», que NO es
    // «sí»: Meta exige que la persona haya aceptado, y mandarle promociones a
    // quien no aceptó hace que bloquee el número y que Meta lo castigue.
    avisos: null,
    origen: origenLimpio(origen),
    estado: 'bot',
    atiende: null,
    noLeidos: 0,
    mensajes: [],
    bitacora: [{ hora, quien, accion: 'alta', detalle: canal === 'tickets' ? 'de los tickets de Eleventa' : null }],
    creado: hora,
    ultimoMensaje: null,
    actualizado: hora,
    version: 0,
  }
}

/**
 * ¿Contesta el bot a este cliente?
 *
 * Sólo cuando no hay una persona en medio. Ver `ESTADOS`.
 */
export const botContesta = c => !c || c.estado === 'bot' || c.estado === 'cerrada'

const conBitacora = (c, quien, accion, detalle, hora) => ({
  ...c,
  bitacora: [...(c.bitacora ?? []), { hora, quien, accion, detalle: detalle ?? null }].slice(-MAX_BITACORA),
})

/**
 * Añade un mensaje a la conversación.
 *
 * `de` es quién lo dijo: `cliente`, `bot` o `tienda`. Un mensaje del cliente a
 * una conversación cerrada la reabre con el bot: viene por otra cosa.
 */
export function registrarMensaje(c, { de, texto: t, quien = null, id = null, tipo = 'texto', imagenes = 0, envio = null, motivo = null }, { ahora } = {}) {
  if (!c || !['cliente', 'bot', 'tienda'].includes(de)) return c
  const hora = ahoraIso(ahora)
  const contenido = String(t ?? '').slice(0, MAX_TEXTO)
  // Meta reintenta: el mismo mensaje dos veces no son dos mensajes.
  if (id && c.mensajes.some(m => m.id === id)) return c

  const m = { hora, de, texto: contenido, tipo, ...(id && { id }), ...(quien && { quien }), ...(imagenes && { imagenes }), ...(envio && { envio }), ...(envio && motivo && { motivo: texto(motivo, 200) }) }
  let sig = { ...c, mensajes: [...c.mensajes, m].slice(-MAX_MENSAJES), ultimoMensaje: hora, actualizado: hora }

  if (de === 'cliente') {
    // De aquí cuelga la ventana de 24 horas (`salidaDe`). Va en la ficha y no
    // se saca de la lista de mensajes porque la lista se recorta.
    sig.ultimoDelCliente = hora
    if (sig.estado === 'cerrada') sig = conBitacora({ ...sig, estado: 'bot', atiende: null }, 'sistema', 'reabierta', 'volvió a escribir', hora)
    // Lo que escribe el cliente mientras lo atiende una persona es lo que la
    // tienda tiene que leer: se cuenta. Con el bot no, porque el bot contesta.
    if (!botContesta(sig)) sig.noLeidos = (sig.noLeidos ?? 0) + 1
  }
  if (de === 'tienda') sig.noLeidos = 0
  // Alguien le contestó —el bot en el siguiente mensaje, o la tienda—: ya no
  // está sin respuesta. Ver `marcarSinRespuesta`.
  if (de !== 'cliente' && sig.sinRespuesta) sig = sinMarca(sig)
  return sig
}

const sinMarca = c => { const { sinRespuesta, ...resto } = c; return resto }

/**
 * Marca que a este cliente NADIE le contestó.
 *
 * Pasa cuando el bot falla las veces que la cola le da (`MAX_ENTREGAS`, en
 * `crm/trabajador.js`): Anthropic caído, WhatsApp rechazando el envío, un
 * fallo nuestro. El mensaje se va a la cola de fallidos, y sin esto el cliente
 * se quedaría esperando sin que nadie lo supiera: en la bandeja la
 * conversación se vería «con el bot», como cualquier otra.
 *
 * **Se marca, no se cambia el estado.** El bot sigue pudiendo contestar el
 * siguiente mensaje —si la caída fue de diez minutos, pasarlas todas a
 * «pendiente» dejaría al bot callado con cada cliente que escribió en ese
 * rato, hasta que alguien las devolviera una por una—. La marca sube la
 * conversación al principio de la bandeja y se cuenta arriba; se quita sola
 * cuando alguien contesta o la tienda la cierra.
 *
 * Si ya estaba marcada no se toca: lo que importa es DESDE cuándo espera.
 */
export function marcarSinRespuesta(c, { motivo = null, mensaje = null } = {}, { ahora } = {}) {
  if (!c || c.sinRespuesta) return c
  const hora = ahoraIso(ahora)
  const nota = texto(motivo, 200) || null
  const sig = { ...c, sinRespuesta: { desde: hora, motivo: nota, ...(mensaje && { mensaje }) }, actualizado: hora }
  return conBitacora(sig, 'sistema', 'sin respuesta', nota, hora)
}

// ── Lo que la tienda escribe desde el panel, y si le llegó al cliente ──────

/**
 * Horas que WhatsApp deja contestarle a alguien después de su último mensaje.
 *
 * No es nuestro: es la «ventana de servicio» de Meta. Dentro, se le escribe lo
 * que sea. Fuera, sólo una PLANTILLA aprobada (y de pago), y la API rechaza
 * cualquier otra cosa con el error 131047.
 */
export const VENTANA_HORAS = 24

/**
 * Por dónde va cada mensaje que la tienda escribe en el panel (`m.envio`).
 *
 * | envío     | qué significa                                               |
 * |-----------|-------------------------------------------------------------|
 * | pendiente | está en la cola; el trabajador todavía no lo manda          |
 * | enviado   | Meta lo ACEPTÓ (no es «entregado»: eso llega después, o no) |
 * | fallido   | no salió, y `m.motivo` dice por qué                         |
 * | sin-canal | se guardó como nota: no había por dónde mandarlo            |
 */
export const ENVIOS = ['pendiente', 'enviado', 'fallido', 'sin-canal']

/**
 * ¿Se le puede escribir a este cliente desde el panel, ahora?
 *
 * Devuelve `{ puede, codigo, motivo, hasta }`. `motivo` es lo que la pantalla
 * enseña TAL CUAL, así que dice qué hacer y no sólo que no se puede.
 *
 * La hora que se compara es la de cuando NOSOTROS apuntamos su mensaje, que
 * va unos segundos por detrás de la de Meta. Por eso esto es un filtro y no la
 * última palabra: si Meta ya cerró la ventana, el envío falla con 131047 y el
 * mensaje queda como `fallido` con ese motivo.
 */
export function salidaDe(c, { ahora } = {}) {
  if (!c) return { puede: false, codigo: 'sin-cliente', motivo: 'No existe ese cliente.', hasta: null }
  const esDeWhatsApp = String(c.id ?? '').startsWith('wa:') && (c.telefono || c.usuario)
  if (!esDeWhatsApp) {
    return {
      puede: false, codigo: 'sin-canal', hasta: null,
      motivo: 'Este cliente no tiene WhatsApp registrado: lo que escribas se guarda como nota y no le llega.',
    }
  }
  const ultimo = c.ultimoDelCliente ?? c.mensajes?.findLast?.(m => m.de === 'cliente')?.hora ?? null
  if (!ultimo) {
    return {
      puede: false, codigo: 'sin-ventana', hasta: null,
      motivo: 'Este cliente todavía no ha escrito por WhatsApp. Meta sólo deja iniciarle la conversación con una plantilla aprobada, y aquí todavía no hay plantillas.',
    }
  }
  const hasta = new Date(Date.parse(ultimo) + VENTANA_HORAS * 3600_000).toISOString()
  if (Date.parse(hasta) <= new Date(ahora ?? Date.now()).getTime()) {
    return {
      puede: false, codigo: 'ventana', hasta,
      motivo: `Pasaron más de ${VENTANA_HORAS} horas desde su último mensaje. WhatsApp ya sólo deja escribirle con una plantilla aprobada, y aquí todavía no hay plantillas. Si vuelve a escribir, se abre otra vez.`,
    }
  }
  return { puede: true, codigo: null, motivo: null, hasta }
}

/**
 * Apunta qué pasó con un mensaje de la tienda: salió o no salió.
 *
 * `idMensaje` es el `id` con el que se guardó (lo pone el servidor al
 * encolarlo). Un mensaje que ya salió NO vuelve a `pendiente` ni a `fallido`
 * por esta vía: que Meta lo aceptó es un hecho, y lo único que puede venir
 * después es que no lo entregue (`envioFallidoPorWamid`).
 *
 * Devuelve el MISMO objeto si no hay nada que cambiar, para que quien guarda
 * sepa que no hace falta escribir.
 */
export function marcarEnvio(c, idMensaje, { envio, motivo = null, wamid = null } = {}, { ahora } = {}) {
  if (!c || !idMensaje || !['enviado', 'fallido'].includes(envio)) return c
  const i = c.mensajes?.findIndex(m => m.id === idMensaje && m.de === 'tienda') ?? -1
  if (i < 0) return c
  const m = c.mensajes[i]
  if (m.envio === envio || m.envio === 'enviado') return c
  const hora = ahoraIso(ahora)
  const { motivo: _viejo, ...resto } = m
  const nuevo = {
    ...resto, envio,
    ...(envio === 'fallido' && { motivo: texto(motivo, 200) || 'no se pudo mandar' }),
    ...(wamid && { wamid }),
  }
  const sig = { ...c, mensajes: c.mensajes.map((x, n) => (n === i ? nuevo : x)), actualizado: hora }
  return envio === 'fallido'
    ? conBitacora(sig, 'sistema', 'no salió por WhatsApp', nuevo.motivo, hora)
    : sig
}

/**
 * Meta aceptó un mensaje y después avisó que NO lo entregó (estado `failed`
 * del webhook). Llega con el id que Meta le puso (`wamid`), no con el nuestro.
 *
 * Devuelve `{ cliente, encontrado }`: si el `wamid` no es de ningún mensaje de
 * la tienda, era una respuesta del bot, y eso lo resuelve quien llama.
 */
export function envioFallidoPorWamid(c, wamid, motivo, { ahora } = {}) {
  const i = c?.mensajes?.findIndex(m => m.wamid && m.wamid === wamid && m.de === 'tienda') ?? -1
  if (i < 0) return { cliente: c, encontrado: false }
  const m = c.mensajes[i]
  if (m.envio === 'fallido') return { cliente: c, encontrado: true }
  const hora = ahoraIso(ahora)
  const nota = texto(motivo, 200) || 'WhatsApp no lo entregó'
  const sig = { ...c, mensajes: c.mensajes.map((x, n) => (n === i ? { ...x, envio: 'fallido', motivo: nota } : x)), actualizado: hora }
  return { cliente: conBitacora(sig, 'sistema', 'no salió por WhatsApp', nota, hora), encontrado: true }
}

/** Errores que la bandeja le enseña a quien pulsa, tal cual. */
const fallo = error => ({ error })

/**
 * Lo que una persona hace con una conversación.
 *
 * Devuelve `{ cliente }` o `{ error }`. Quién y cuándo los pone el servidor con
 * la sesión en la mano, nunca el navegador: un registro que se puede escribir a
 * gusto no prueba nada (la misma regla que la bandeja de revisión).
 *
 * | acción     | qué hace                                                 |
 * |------------|----------------------------------------------------------|
 * | entregar   | el bot se la pasa a una plaza: queda pendiente           |
 * | tomar      | alguien de la tienda la toma: el bot se calla            |
 * | transferir | se la pasa a otra plaza, otra vez pendiente              |
 * | cerrar     | resuelta                                                 |
 * | devolver   | vuelve al bot                                            |
 * | leido      | la tienda la leyó sin contestar                          |
 */
export function aplicarAccion(c, { accion, plaza, motivo } = {}, { quien, ahora } = {}) {
  if (!c) return fallo('No existe ese cliente.')
  const hora = ahoraIso(ahora)
  const nota = texto(motivo, 300) || null

  switch (accion) {
    case 'entregar':
    case 'transferir': {
      if (!PLAZAS_CLIENTES.includes(plaza)) return fallo('Esa plaza no atiende clientes.')
      if (accion === 'transferir' && plaza === c.plaza && c.estado === 'pendiente') return fallo('Ya está pendiente en esa plaza.')
      const sig = { ...c, plaza, estado: 'pendiente', atiende: null, actualizado: hora }
      return { cliente: conBitacora(sig, quien, accion, [plaza, nota].filter(Boolean).join(' · '), hora) }
    }
    case 'tomar': {
      if (!c.plaza) return fallo('Primero hay que decir a qué plaza le toca.')
      if (c.estado === 'atendiendo' && c.atiende === quien) return { cliente: c }
      const sig = { ...c, estado: 'atendiendo', atiende: quien, noLeidos: 0, actualizado: hora }
      return { cliente: conBitacora(sig, quien, 'tomar', c.atiende && c.atiende !== quien ? `antes la atendía ${c.atiende}` : null, hora) }
    }
    case 'cerrar': {
      if (c.estado === 'cerrada') return { cliente: c }
      // Cerrarla es darla por resuelta —le llamaron, pasó a la tienda—: la marca
      // de «sin respuesta» se va con ella.
      const sig = { ...sinMarca(c), estado: 'cerrada', atiende: null, noLeidos: 0, actualizado: hora }
      return { cliente: conBitacora(sig, quien, 'cerrar', nota, hora) }
    }
    case 'devolver': {
      if (c.estado === 'bot') return { cliente: c }
      const sig = { ...c, estado: 'bot', atiende: null, noLeidos: 0, actualizado: hora }
      return { cliente: conBitacora(sig, quien, 'devolver al bot', nota, hora) }
    }
    case 'leido':
      return { cliente: { ...c, noLeidos: 0 } }
    default:
      return fallo('Esa acción no existe.')
  }
}

/**
 * Lo que una persona puede editar de la ficha. Lista cerrada: la plaza cambia
 * con `transferir`, el estado con las acciones, y el origen no se toca nunca
 * —es la única prueba de qué anuncio trajo a este cliente—.
 */
export function editarFicha(c, campos = {}, { quien, ahora } = {}) {
  if (!c) return fallo('No existe ese cliente.')
  const hora = ahoraIso(ahora)
  const sig = { ...c }
  const cambios = []

  const poner = (campo, valor) => {
    if (JSON.stringify(sig[campo]) === JSON.stringify(valor)) return
    sig[campo] = valor
    cambios.push(campo)
  }

  if ('nombre' in campos) poner('nombre', texto(campos.nombre, 120) || null)
  if ('ciudad' in campos) poner('ciudad', texto(campos.ciudad, 80) || null)
  if ('modelo' in campos) poner('modelo', texto(campos.modelo, 80) || null)
  if ('notas' in campos)  poner('notas', String(campos.notas ?? '').slice(0, MAX_TEXTO))
  if ('tipo' in campos) {
    if (!TIPOS.includes(campos.tipo)) return fallo('El tipo es público o mayorista.')
    poner('tipo', campos.tipo)
  }
  if ('telefono' in campos) {
    const t = campos.telefono ? telefonoMx(campos.telefono) : ''
    if (campos.telefono && !t) return fallo('Ese no es un teléfono mexicano de 10 dígitos.')
    // El teléfono de un cliente de WhatsApp ES su llave: cambiarlo sería
    // escribirle a otra persona.
    if (String(c.id).startsWith('wa:') && t !== c.telefono) return fallo('El teléfono de un cliente de WhatsApp no se cambia: es por donde escribe.')
    poner('telefono', t || null)
  }
  if ('etiquetas' in campos) {
    const lista = Array.isArray(campos.etiquetas) ? campos.etiquetas : []
    poner('etiquetas', [...new Set(lista.map(e => texto(e, 30).toLowerCase()).filter(Boolean))].slice(0, 12))
  }
  if ('avisos' in campos) {
    // Sólo se apunta lo que dijo la persona, con la fecha y por dónde.
    const a = campos.avisos
    if (a === null) poner('avisos', null)
    else if (typeof a?.acepta === 'boolean') poner('avisos', { acepta: a.acepta, fecha: hora.slice(0, 10), via: texto(a.via, 40) || 'tienda' })
    else return fallo('Los avisos se marcan como aceptados o rechazados.')
  }

  if (!cambios.length) return { cliente: c, cambios }
  sig.actualizado = hora
  return { cliente: conBitacora(sig, quien, 'ficha', cambios.join(', '), hora), cambios }
}

// ── Quién ve qué ───────────────────────────────────────────────────────────

/**
 * ¿Puede esta sesión ver y trabajar a este cliente?
 *
 * El administrador, a todos. Una tienda, SÓLO los de su plaza: la lista de
 * clientes es el negocio, y cada tienda ve lo suyo igual que en el corte y la
 * nómina. Bodega, a nadie: no atiende clientes. Un cliente que el bot todavía
 * no ha repartido sólo lo ve el administrador.
 */
export function puedeVer(sesion, c) {
  if (!sesion || !c) return false
  if (sesion.admin === true) return true
  return PLAZAS_CLIENTES.includes(sesion.sucursal) && c.plaza === sesion.sucursal
}

/** Lo que va en la lista de la bandeja: sin la conversación entera. */
export function resumen(c) {
  const ultimo = c.mensajes?.at(-1) ?? null
  return {
    id: c.id, canal: c.canal, nombre: c.nombre, telefono: c.telefono, plaza: c.plaza, tipo: c.tipo,
    // Va en la lista porque por él se busca la ficha de quien escribe sin
    // teléfono (`porUsuario`, en la bandeja del bot).
    ...(c.usuario && { usuario: c.usuario }),
    estado: c.estado, atiende: c.atiende, noLeidos: c.noLeidos ?? 0, etiquetas: c.etiquetas ?? [],
    fuente: c.origen?.fuente ?? null,
    // Desde cuándo espera sin que nadie le conteste, o null.
    sinRespuesta: c.sinRespuesta?.desde ?? null,
    // Lo último que escribió la tienda NO le llegó. Sin esto en la lista, quien
    // contestó cree que ya está y el cliente sigue esperando.
    noSalio: c.mensajes?.findLast?.(m => m.de === 'tienda')?.envio === 'fallido',
    ultimoMensaje: c.ultimoMensaje, actualizado: c.actualizado, creado: c.creado,
    ultimo: ultimo ? { de: ultimo.de, texto: String(ultimo.texto ?? '').slice(0, 140), hora: ultimo.hora } : null,
  }
}

const PESO_ESTADO = { pendiente: 0, atendiendo: 1, bot: 2, cerrada: 3 }

/**
 * El orden de la bandeja.
 *
 * Primero lo PENDIENTE, y de ahí el que más lleva esperando: es alguien a quien
 * el bot ya le dijo «te paso con la tienda». Luego lo que se atiende, con lo no
 * leído arriba. Lo que lleva el bot y lo cerrado, al fondo y lo más reciente
 * primero, que es sólo para mirar.
 */
export function ordenarBandeja(lista) {
  const t = r => Date.parse(r.ultimoMensaje ?? r.actualizado ?? r.creado ?? 0) || 0
  return [...lista].sort((a, b) => {
    // Antes que nada, a quien nadie le contestó: escribió y está esperando. El
    // que más lleva, primero.
    if (!!a.sinRespuesta !== !!b.sinRespuesta) return a.sinRespuesta ? -1 : 1
    if (a.sinRespuesta && b.sinRespuesta) return Date.parse(a.sinRespuesta) - Date.parse(b.sinRespuesta)
    const pa = PESO_ESTADO[a.estado] ?? 9, pb = PESO_ESTADO[b.estado] ?? 9
    if (pa !== pb) return pa - pb
    if (a.estado === 'pendiente') return t(a) - t(b)
    if (a.estado === 'atendiendo' && (a.noLeidos > 0) !== (b.noLeidos > 0)) return a.noLeidos > 0 ? -1 : 1
    return t(b) - t(a)
  })
}

/**
 * Pasa un cliente que no tenía teléfono —un mayorista de los tickets, o uno
 * dado de alta en tienda— a su llave de WhatsApp, en cuanto se le captura.
 *
 * Hace falta porque el bot busca por teléfono: sin esto, el día que ese
 * mayorista escribiera, el bot le abriría una ficha nueva y la suya, con sus
 * notas y su tipo, se quedaría huérfana. El viejo NO se borra: queda marcado
 * con `fusionadoEn` y la lista lo salta, para que no se pierda nada si alguien
 * se equivocó de número.
 */
export function aWhatsApp(c, { quien, ahora } = {}) {
  const id = idDe({ canal: 'whatsapp', telefono: c?.telefono })
  if (!c || !id || c.id === id) return null
  const hora = ahoraIso(ahora)
  const nuevo = conBitacora({ ...c, id, actualizado: hora, version: 0 }, quien, 'vinculado', `antes ${c.id}`, hora)
  const viejo = conBitacora({ ...c, fusionadoEn: id, actualizado: hora }, quien, 'vinculado', `ahora ${id}`, hora)
  return { nuevo, viejo }
}

/** Cuántos hay en cada estado, para las pastillas de arriba. */
export function contar(lista) {
  const n = Object.fromEntries(ESTADOS.map(e => [e, 0]))
  for (const r of lista) if (r.estado in n) n[r.estado]++
  return {
    ...n, total: lista.length,
    noLeidos: lista.reduce((s, r) => s + (r.noLeidos ?? 0), 0),
    sinRespuesta: lista.filter(r => r.sinRespuesta).length,
    noSalio: lista.filter(r => r.noSalio).length,
  }
}
