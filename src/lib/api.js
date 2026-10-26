// Cliente del backend.
//
// Todo lo que necesita una credencial pasa por aquí. El navegador ya no guarda
// llaves de S3 ni tokens de Dropbox: manda la petición al backend, que tiene
// los secretos del lado del servidor y devuelve el resultado ya procesado.
//
// Las LECTURAS no pasan por aquí. El inventario, las estadísticas y la
// configuración son archivos públicos en S3 y se leen directo, sin credencial
// ninguna, que es justo por lo que pueden ser públicos.

const BASE = String(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

/** Si no hay backend configurado, las funciones de escritura se desactivan
 *  solas en vez de caer a un camino con credenciales en el navegador. */
export const apiConfigurada = !!BASE

class ErrorApi extends Error {
  constructor(mensaje, codigo) {
    super(mensaje)
    this.codigo = codigo
  }
}

async function pedir(ruta, { metodo = 'GET', cuerpo, token } = {}) {
  if (!BASE) throw new ErrorApi('El servidor no está configurado todavía.', 0)

  let res
  try {
    res = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers: {
        ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
        ...(token  ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    })
  } catch {
    throw new ErrorApi('No se pudo conectar con el servidor.', 0)
  }

  let datos = {}
  try { datos = await res.json() } catch { /* respuesta sin cuerpo */ }

  if (!res.ok) {
    // Una sesión caducada se avisa UNA vez y desde aquí, no en cada pantalla.
    //
    // El navegador da por buena la sesión guardada mientras tenga token, sin
    // comprobar que siga valiendo: la pantalla seguía diciendo «administrador»
    // y el backend rechazaba todo. El resultado era un «no se pudieron leer
    // los turnos» que parecía un fallo de los turnos, cuando lo que pasaba es
    // que había que volver a entrar.
    //
    // Pasa cada ocho horas, que es lo que dura un token, y pasó de golpe el
    // día que se regeneró el secreto de sesión al cambiar las contraseñas.
    if ((res.status === 401 || res.status === 403) && token) {
      avisarSesionVencida()
      throw new ErrorApi('Tu sesión expiró. Vuelve a iniciar sesión.', res.status)
    }
    throw new ErrorApi(datos.error || `Error ${res.status}.`, res.status)
  }
  return datos
}

// Quien escuche se entera de que hay que volver a entrar. Es un aviso suelto y
// no un import directo de la sesión, para que esta capa siga sin saber nada de
// React ni del contexto.
const OYENTES = new Set()
let avisado = false

export function alVencerSesion(fn) {
  OYENTES.add(fn)
  return () => OYENTES.delete(fn)
}

function avisarSesionVencida() {
  // Una sola vez por sesión: el panel hace varias llamadas a la vez y si no,
  // el aviso salta cuatro o cinco veces seguidas.
  if (avisado) return
  avisado = true
  for (const fn of OYENTES) { try { fn() } catch { /* un oyente roto no para a los demás */ } }
}

/** Se llama al entrar de nuevo, para que el aviso pueda volver a saltar. */
export function reiniciarAvisoSesion() { avisado = false }

// ── Sesión ───────────────────────────────────────────────────────────────────

/** Devuelve { token, sucursal, admin }. La contraseña nunca se guarda. */
export const login = (sucursal, contrasena) =>
  pedir('/login', { metodo: 'POST', cuerpo: { sucursal, contrasena } })

// ── Escrituras ───────────────────────────────────────────────────────────────

export const guardarConfig = (config, token) =>
  pedir('/config', { metodo: 'POST', cuerpo: { config }, token })

export const subirInventario = (sucursal, productos, token) =>
  pedir('/inventario', { metodo: 'POST', cuerpo: { sucursal, productos }, token })

/**
 * Convierte el archivo a base64 por trozos.
 *
 * Hacerlo de una sola pasada con el operador de propagación revienta la pila
 * con imágenes de varios MB, que es justo el tamaño de una foto de celular.
 */
async function aBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binario = ''
  const TROZO = 0x8000
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO))
  }
  return btoa(binario)
}

/** Sube la imagen de un pedido. Devuelve { carpeta, archivo }. */
export async function subirDiseno(sucursal, file, nombre, modelo = '') {
  return pedir('/diseno', {
    metodo: 'POST',
    cuerpo: {
      sucursal,
      tipo:   file.type || 'image/jpeg',
      datos:  await aBase64(file),
      nombre,
      modelo,
    },
  })
}

/**
 * Turnos del personal. Requiere sesión de administrador.
 *
 * No se lee de S3 desde aquí a propósito: el prefijo `personal/` es privado y
 * alcanzarlo desde el navegador obligaría a llevar credenciales, que es justo
 * lo que se quitó. Lo sirve el backend, que ya las tiene de su lado.
 */
export const turnos = token => pedir('/turnos', { token })

// ── Galería del catálogo ─────────────────────────────────────────────────────

/** Imágenes de una carpeta del catálogo, con enlaces temporales. */
export async function galeria(carpeta) {
  if (!BASE || !carpeta) return []
  try {
    const { imagenes } = await pedir(`/galeria?carpeta=${encodeURIComponent(carpeta)}`)
    return imagenes ?? []
  } catch {
    return []
  }
}
