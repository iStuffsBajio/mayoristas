// Qué significa cada error que devuelve Meta al mandar, y qué se hace con él.
//
// `whatsapp-api.js` conserva el `code` de Meta en `err.codigo` justo para
// esto: sin él no se puede distinguir «el token venció» de «Meta está lento»,
// y las dos cosas piden lo contrario. Lo primero no se arregla reintentando
// —y hay que AVISAR, porque mientras dure no sale nada—; lo segundo sí.
//
// ── De dónde salen los códigos ──────────────────────────────────────────────
//
// De la tabla de errores de la Cloud API y de lo que ya pasó aquí: el 131030
// salió en la primera prueba real (2026-11-12) y el 190 es el del token
// temporal que venció sin que nada avisara. Lo que no está en la tabla se
// decide por el estado HTTP: un 4xx es culpa de lo que mandamos y repetirlo
// da lo mismo; un 5xx o un fallo de red, no.
//
// ⚠️ NO COMPROBADO contra Meta: los códigos de límite de envío (130429,
// 131048, 131056) se tratan como pasajeros de memoria de la documentación;
// ninguno se ha visto en esta cuenta.

/** Lo que se le enseña a la tienda, por código de Meta. */
const POR_CODIGO = {
  190:    { clase: 'token',   permanente: true,  motivo: 'el acceso a WhatsApp venció (token de Meta); avisa al administrador' },
  131047: { clase: 'ventana', permanente: true,  motivo: 'pasaron más de 24 horas desde su último mensaje: hace falta una plantilla aprobada' },
  131030: { clase: 'lista',   permanente: true,  motivo: 'el número no está en la lista de teléfonos de prueba de Meta' },
  131026: { clase: 'destino', permanente: true,  motivo: 'WhatsApp no pudo entregarlo: el número no tiene WhatsApp o no acepta mensajes' },
  131062: { clase: 'destino', permanente: true,  motivo: 'WhatsApp no deja mandar este tipo de mensaje a un cliente sin teléfono' },
  131021: { clase: 'destino', permanente: true,  motivo: 'el destinatario es el mismo número de la casa' },
  131031: { clase: 'cuenta',  permanente: true,  motivo: 'Meta bloqueó la cuenta de WhatsApp; avisa al administrador' },
  131042: { clase: 'cuenta',  permanente: true,  motivo: 'falta el método de pago en la cuenta de WhatsApp; avisa al administrador' },
  131045: { clase: 'cuenta',  permanente: true,  motivo: 'el número de la casa no está registrado en Meta; avisa al administrador' },
  10:     { clase: 'permiso', permanente: true,  motivo: 'a la app de Meta le falta un permiso; avisa al administrador' },
  100:    { clase: 'formato', permanente: true,  motivo: 'Meta rechazó el mensaje por su formato' },
  4:      { clase: 'limite',  permanente: false, motivo: 'Meta está limitando los envíos' },
  80007:  { clase: 'limite',  permanente: false, motivo: 'Meta está limitando los envíos' },
  130429: { clase: 'limite',  permanente: false, motivo: 'Meta está limitando los envíos' },
  131048: { clase: 'limite',  permanente: false, motivo: 'Meta está limitando los envíos por reportes de spam' },
  131056: { clase: 'limite',  permanente: false, motivo: 'se le están mandando demasiados mensajes seguidos a este número' },
  131000: { clase: 'meta',    permanente: false, motivo: 'falló el servicio de WhatsApp' },
  131016: { clase: 'meta',    permanente: false, motivo: 'el servicio de WhatsApp no está disponible' },
}

/**
 * Las clases que no se arreglan solas y dejan TODO el canal sin salida. Son
 * las que disparan la alarma y el aviso del panel (`salud.js`); un número mal
 * escrito o una ventana cerrada son de UN cliente y no avisan a nadie más.
 */
export const CLASES_DE_ALARMA = ['token', 'permiso', 'cuenta', 'configuracion']

/**
 * Clasifica un error de envío: `{ clase, permanente, motivo, codigo, alarma }`.
 *
 * `permanente` quiere decir «repetirlo va a dar lo mismo». `motivo` es texto
 * para una persona de la tienda: no lleva el mensaje de Meta tal cual, que
 * viene en inglés y a veces trae el número del cliente.
 */
export function clasificarEnvio(err) {
  const codigo = Number(err?.codigo) || null
  const estado = Number(err?.estado) || null
  let r = POR_CODIGO[codigo]
  // Los permisos van del 200 al 299, uno por permiso.
  if (!r && codigo >= 200 && codigo <= 299) r = POR_CODIGO[10]
  // Un 401 sin código de Meta también es el token.
  if (!r && estado === 401) r = POR_CODIGO[190]
  if (!r && /Falta WHATSAPP_/.test(String(err?.message ?? ''))) {
    r = { clase: 'configuracion', permanente: true, motivo: 'al bot le faltan las credenciales de WhatsApp; avisa al administrador' }
  }
  if (!r && estado >= 400 && estado < 500 && estado !== 408 && estado !== 429) {
    r = { clase: 'rechazo', permanente: true, motivo: `Meta rechazó el mensaje (error ${codigo ?? estado})` }
  }
  r ??= { clase: 'pasajero', permanente: false, motivo: 'no hubo conexión con WhatsApp' }
  return { ...r, codigo, alarma: CLASES_DE_ALARMA.includes(r.clase) }
}

/** Lo mismo, para un estado `failed` del webhook, que trae código y título. */
export const motivoDeEstado = ({ codigo, titulo } = {}) =>
  POR_CODIGO[Number(codigo)]?.motivo ?? `WhatsApp no lo entregó${codigo ? ` (error ${codigo})` : ''}${titulo ? `: ${String(titulo).slice(0, 80)}` : ''}`
