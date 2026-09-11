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
// Freno simple contra fuerza bruta. Vive en memoria, así que solo cubre las
// peticiones que caen en la misma instancia de Lambda. Es una molestia para el
// atacante, no una defensa completa: la defensa real es que las contraseñas
// estén hasheadas y sean largas.

const intentos = new Map()
const VENTANA_MS  = 15 * 60 * 1000
const MAX_INTENTOS = 8

export function demasiadosIntentos(clave) {
  const ahora = Date.now()
  const registro = intentos.get(clave)
  if (!registro || ahora - registro.desde > VENTANA_MS) return false
  return registro.n >= MAX_INTENTOS
}

export function registrarIntentoFallido(clave) {
  const ahora = Date.now()
  const registro = intentos.get(clave)
  if (!registro || ahora - registro.desde > VENTANA_MS) intentos.set(clave, { n: 1, desde: ahora })
  else registro.n++
  // Evita que el mapa crezca sin control si alguien rota direcciones
  if (intentos.size > 5000) intentos.clear()
}

export function limpiarIntentos(clave) {
  intentos.delete(clave)
}
