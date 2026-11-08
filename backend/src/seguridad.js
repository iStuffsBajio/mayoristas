// Autenticación y firma de sesiones.
//
// No usa librerías externas a propósito: todo sale del módulo `crypto` que
// trae Node. Menos dependencias significa menos superficie de ataque y nada
// que actualizar por vulnerabilidades de terceros.

import crypto from 'node:crypto'

const ITERACIONES = 210_000   // recomendación OWASP 2023 para PBKDF2-SHA512
const LARGO_CLAVE = 64
const DIGEST      = 'sha512'

// ── Contraseñas ────────────────────────────────────────────────────────────

/** Genera el hash que se guarda en la configuración. Nunca la contraseña. */
export function hashearContrasena(contrasena) {
  const sal = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(contrasena, sal, ITERACIONES, LARGO_CLAVE, DIGEST).toString('hex')
  return `pbkdf2$${ITERACIONES}$${sal}$${hash}`
}

/**
 * Compara una contraseña contra su hash en tiempo constante, para que el
 * tiempo de respuesta no revele cuántos caracteres coinciden.
 */
export function verificarContrasena(contrasena, guardado) {
  if (!contrasena || !guardado) return false
  const partes = String(guardado).split('$')
  if (partes.length !== 4 || partes[0] !== 'pbkdf2') return false

  const iteraciones = Number(partes[1])
  const [, , sal, hashEsperado] = partes
  if (!Number.isFinite(iteraciones) || iteraciones < 1000) return false

  const calculado = crypto.pbkdf2Sync(contrasena, sal, iteraciones, LARGO_CLAVE, DIGEST)
  const esperado  = Buffer.from(hashEsperado, 'hex')
  if (calculado.length !== esperado.length) return false
  return crypto.timingSafeEqual(calculado, esperado)
}

// ── Tokens de sesión ───────────────────────────────────────────────────────
// Formato propio y mínimo, equivalente a un JWT con HMAC-SHA256 pero sin
// depender de una librería. El contenido va firmado, no cifrado: nunca se
// debe meter ahí nada que el usuario no pueda ver.

const b64u = buf => Buffer.from(buf).toString('base64url')

function firmar(datos, secreto) {
  return crypto.createHmac('sha256', secreto).update(datos).digest('base64url')
}

/** Crea un token de sesión válido por las horas indicadas. */
export function crearSesion(datos, secreto, horas = 8) {
  const cuerpo = b64u(JSON.stringify({
    ...datos,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + horas * 3600,
  }))
  return `${cuerpo}.${firmar(cuerpo, secreto)}`
}

/** Devuelve el contenido del token si la firma y la vigencia son válidas. */
export function leerSesion(token, secreto) {
  if (!token || typeof token !== 'string') return null
  const [cuerpo, firma] = token.split('.')
  if (!cuerpo || !firma) return null

  const esperada = firmar(cuerpo, secreto)
  const a = Buffer.from(firma)
  const b = Buffer.from(esperada)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString())
    if (!datos.exp || datos.exp < Math.floor(Date.now() / 1000)) return null
    return datos
  } catch {
    return null
  }
}

// ── Límite de intentos ─────────────────────────────────────────────────────
//
// Freno contra fuerza bruta. Vive en memoria, así que sólo cubre las
// peticiones que caen en la misma instancia de Lambda; la defensa de verdad
// son las contraseñas hasheadas, la concurrencia reservada de la función y el
// segundo factor del administrador. Esto es la molestia de encima.
//
// ── El fallo que tenía, y por qué importaba ───────────────────────────────
//
// Al llegar a 5.000 entradas hacía `intentos.clear()`. Eso no era un detalle
// de memoria: era un INTERRUPTOR para apagar el freno. Bastaba con lanzar
// cinco mil intentos desde direcciones inventadas para vaciar el mapa entero
// —el contador del propio atacante incluido— y volver a tener ocho intentos
// limpios, tantas veces como hiciera falta.
//
// Cambiarlo por desalojar «lo más viejo» tampoco bastaba, y la prueba lo
// enseñó: quien lleva más rato atacando es precisamente el más antiguo del
// mapa, así que era el PRIMERO en salir. El inundado seguía funcionando.
//
// La regla que sí aguanta: **lo que ya está bloqueado no se desaloja nunca
// por falta de sitio**, sólo cuando se le cumple el plazo. Para echar a un
// bloqueado del mapa habría que bloquear antes a veinte mil direcciones
// distintas, y para eso hay que fallar ocho veces con cada una, que es
// exactamente lo que esto existe para castigar.

const intentos = new Map()
const VENTANA_MS   = 15 * 60 * 1000
const MAX_INTENTOS = 8
// Cuántas direcciones se vigilan a la vez. Las que no están bloqueadas se
// desalojan por aquí; las bloqueadas, no.
const MAXIMO_VIGILADOS = 5000
// El tope duro, por si alguien se empeña: 20.000 entradas son unos pocos MB
// en una Lambda de 512.
const TOPE_DURO = 20_000

const estaBloqueado = (registro, ahora) =>
  !!registro && registro.n >= MAX_INTENTOS && ahora - registro.desde <= VENTANA_MS

export function demasiadosIntentos(clave) {
  return estaBloqueado(intentos.get(clave), Date.now())
}

export function registrarIntentoFallido(clave) {
  const ahora = Date.now()
  const registro = intentos.get(clave)
  const nuevo = (!registro || ahora - registro.desde > VENTANA_MS)
    ? { n: 1, desde: ahora }
    : { n: registro.n + 1, desde: registro.desde }

  // Se borra y se vuelve a poner a propósito: un Map recorre en orden de
  // inserción, así que esto manda al final al que acaba de fallar.
  intentos.delete(clave)
  intentos.set(clave, nuevo)
  podar(ahora)
}

function podar(ahora) {
  if (intentos.size <= MAXIMO_VIGILADOS) return

  // 1. Lo caducado, que ya no dice nada.
  for (const [k, v] of intentos) {
    if (ahora - v.desde > VENTANA_MS) intentos.delete(k)
  }
  // 2. Lo que NO está bloqueado, de más antiguo a más reciente.
  for (const [k, v] of intentos) {
    if (intentos.size <= MAXIMO_VIGILADOS) break
    if (!estaBloqueado(v, ahora)) intentos.delete(k)
  }
  // 3. Y sólo si aun así se pasa del tope duro, los bloqueados más antiguos.
  //    Llegar aquí significa veinte mil direcciones bloqueadas a la vez, que
  //    es un ataque en toda regla y no un día normal.
  for (const k of intentos.keys()) {
    if (intentos.size <= TOPE_DURO) break
    intentos.delete(k)
  }
}

export function limpiarIntentos(clave) {
  intentos.delete(clave)
}

/** Para las pruebas: deja el freno como recién arrancado. */
export function olvidarIntentos() {
  intentos.clear()
}

// ── Segundo factor (TOTP) ──────────────────────────────────────────────────
//
// RFC 6238, con el `crypto` de Node y sin dependencias. Es el mismo codigo de
// seis digitos que dan Google Authenticator, Authy o 1Password.
//
// Se exige SOLO al administrador, y es una decision medida: el administrador
// ve el efectivo de las cuatro plazas, los faltantes con el nombre de quien
// cerro el turno y la lista de mayoristas del negocio. Una tienda ve su
// inventario, que de todas formas se publica. Pedirle un codigo del movil a
// quien esta en el mostrador seria un estorbo diario a cambio de proteger lo
// que ya es publico, y un estorbo diario acaba en la contraseña pegada en un
// papel junto a la caja.

const ALFABETO32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Pasa un secreto en base32 -como el que lee una app de autenticacion- a bytes. */
export function desdeBase32(texto) {
  let bits = 0, valor = 0
  const out = []
  for (const c of String(texto ?? '').toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    valor = (valor << 5) | ALFABETO32.indexOf(c)
    bits += 5
    if (bits >= 8) {
      out.push((valor >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** Un secreto nuevo, en base32, para darlo de alta en la app. */
export function nuevoSecretoTotp(bytes = 20) {
  const b = crypto.randomBytes(bytes)
  let bits = 0, valor = 0, out = ''
  for (const byte of b) {
    valor = (valor << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALFABETO32[(valor >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALFABETO32[(valor << (5 - bits)) & 31]
  return out
}

/** El codigo de seis digitos de un instante dado. */
export function codigoTotp(secreto, contador) {
  const clave = desdeBase32(secreto)
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(contador / 2 ** 32), 0)
  buf.writeUInt32BE(contador >>> 0, 4)
  const h = crypto.createHmac('sha1', clave).update(buf).digest()
  const i = h[h.length - 1] & 0x0f
  const n = ((h[i] & 0x7f) << 24) | (h[i + 1] << 16) | (h[i + 2] << 8) | h[i + 3]
  return String(n % 1_000_000).padStart(6, '0')
}

/**
 * Comprueba un codigo.
 *
 * Acepta la ventana anterior y la siguiente -90 segundos en total- porque el
 * reloj del movil y el del servidor nunca van exactos, y un segundo factor
 * que falla por diez segundos de desfase se acaba desactivando.
 *
 * La comparacion va en tiempo constante por lo mismo que la de la contraseña:
 * son solo seis digitos, y el tiempo de respuesta no tiene por que decir
 * cuantos acertaste.
 */
export function verificarTotp(codigo, secreto, { ahora = Date.now(), ventana = 1, paso = 30 } = {}) {
  const limpio = String(codigo ?? '').replace(/\D/g, '')
  if (limpio.length !== 6 || !secreto) return false
  const contador = Math.floor(ahora / 1000 / paso)
  const dado = Buffer.from(limpio)
  for (let d = -ventana; d <= ventana; d++) {
    const esperado = Buffer.from(codigoTotp(secreto, contador + d))
    if (dado.length === esperado.length && crypto.timingSafeEqual(dado, esperado)) return true
  }
  return false
}

/** La URL que se convierte en código QR para dar de alta el secreto. */
export const urlTotp = (secreto, cuenta = 'admin', emisor = 'iStuffs Bajio') =>
  `otpauth://totp/${encodeURIComponent(emisor)}:${encodeURIComponent(cuenta)}`
  + `?secret=${secreto}&issuer=${encodeURIComponent(emisor)}&algorithm=SHA1&digits=6&period=30`

// ── Firma de los bytes de una imagen ───────────────────────────────────────

/**
 * QUE IMAGEN ES, segun sus primeros bytes. `null` si no es ninguna.
 *
 * Se DEDUCE, no se comprueba contra lo que diga el cliente, y la diferencia
 * importa en las dos direcciones:
 *
 *   - Por seguridad: el tipo lo manda el navegador y no prueba nada. Se podia
 *     subir cualquier cosa -un guion, un ejecutable- diciendo que era un PNG.
 *   - Por no perder pedidos: `file.type` viene VACIO cuando el archivo no
 *     trae una extension que el navegador reconozca, y entonces la pagina
 *     mandaba «image/jpeg» por defecto. Comparando contra esa etiqueta, un
 *     PNG de verdad con el nombre raro se habria rechazado, y eso es un
 *     pedido de un cliente que se pierde sin que nadie se entere.
 *
 * Deduciendolo, lo que no es una imagen no pasa, y lo que si lo es pasa
 * aunque venga mal etiquetado.
 */
export function tipoDeImagen(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null
  const empieza = (...b) => b.every((v, i) => buf[i] === v)
  if (empieza(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (empieza(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (/^GIF8[79]a$/.test(buf.subarray(0, 6).toString('latin1'))) return 'image/gif'
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF'
    && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  return null
}

/** Si los bytes son los de ese tipo en concreto. */
export const pareceImagen = (buf, tipo) => tipoDeImagen(buf) === tipo
