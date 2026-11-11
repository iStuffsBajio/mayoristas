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
 * La llave de un cliente.
 *
 * Por WhatsApp es el teléfono: es lo único que Meta garantiza y lo que la
 * persona reconoce. Instagram y Messenger no dan teléfono, dan un identificador
 * propio de la página, así que van con su canal delante. Un mayorista que sólo
 * existe en los tickets de Eleventa no tiene ninguno de los dos: va con su
 * plaza y su clave, hasta que alguien le capture el teléfono.
 */
export function idDe({ canal, telefono, idCanal, plaza, clave }) {
  if (canal === 'whatsapp' || (!canal && telefono)) {
    const t = telefonoMx(telefono)
    return t ? `wa:${t}` : ''
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
export const idValido = id => /^(wa|ig|fb|may|tda):[a-z0-9:_-]{3,90}$/i.test(String(id ?? ''))

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
export function nuevoCliente({ id, canal, telefono, nombre, plaza, tipo, origen, quien = 'sistema' }, { ahora } = {}) {
  if (!idValido(id)) return null
  const hora = ahoraIso(ahora)
  return {
    id,
    canal: CANALES.includes(canal) ? canal : 'whatsapp',
    telefono: telefonoMx(telefono) || null,
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
export function registrarMensaje(c, { de, texto: t, quien = null, id = null, tipo = 'texto', imagenes = 0, envio = null }, { ahora } = {}) {
  if (!c || !['cliente', 'bot', 'tienda'].includes(de)) return c
  const hora = ahoraIso(ahora)
  const contenido = String(t ?? '').slice(0, MAX_TEXTO)
  // Meta reintenta: el mismo mensaje dos veces no son dos mensajes.
  if (id && c.mensajes.some(m => m.id === id)) return c

  const m = { hora, de, texto: contenido, tipo, ...(id && { id }), ...(quien && { quien }), ...(imagenes && { imagenes }), ...(envio && { envio }) }
  let sig = { ...c, mensajes: [...c.mensajes, m].slice(-MAX_MENSAJES), ultimoMensaje: hora, actualizado: hora }

  if (de === 'cliente') {
    if (sig.estado === 'cerrada') sig = conBitacora({ ...sig, estado: 'bot', atiende: null }, 'sistema', 'reabierta', 'volvió a escribir', hora)
    // Lo que escribe el cliente mientras lo atiende una persona es lo que la
    // tienda tiene que leer: se cuenta. Con el bot no, porque el bot contesta.
    if (!botContesta(sig)) sig.noLeidos = (sig.noLeidos ?? 0) + 1
  }
  if (de === 'tienda') sig.noLeidos = 0
  return sig
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
      const sig = { ...c, estado: 'cerrada', atiende: null, noLeidos: 0, actualizado: hora }
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
    estado: c.estado, atiende: c.atiende, noLeidos: c.noLeidos ?? 0, etiquetas: c.etiquetas ?? [],
    fuente: c.origen?.fuente ?? null,
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
  return { ...n, total: lista.length, noLeidos: lista.reduce((s, r) => s + (r.noLeidos ?? 0), 0) }
}
