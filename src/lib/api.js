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

// ── Revisiones del catálogo ──────────────────────────────────────────────────
//
// Las respuestas de la cola de revisión las contesta quien tenga sesión —el
// administrador y cualquier sucursal—, así que no pueden quedarse en el
// navegador de cada uno: las de León tienen que llegar aquí. Van bajo
// `revisiones/`, que es privado, y por eso las sirve el backend.

/** Todas las respuestas, de todos, con quién contestó cada caso. */
export const revisiones = token => pedir('/revisiones', { token })

/** Guarda una respuesta. `estado` en null quita la marca. */
export const guardarRevision = (id, estado, nota, token) =>
  pedir('/revisiones', { metodo: 'POST', cuerpo: { id, estado, nota }, token })

// ── Ajustes: correcciones que no tocan el dato ───────────────────────────────
//
// Viven al lado del inventario porque el respaldo de Eleventa lo regenera
// cuatro veces al día: escribir encima sería borrarlo esa misma tarde.

export const ajustes = token => pedir('/ajustes', { token })

/** Guarda una corrección. `motivo` en null la deshace. */
export const guardarAjuste = ({ codigo, tipo = 'ocultar', motivo, producto = '', nota = '' }, token) =>
  pedir('/ajustes', { metodo: 'POST', cuerpo: { codigo, tipo, motivo, producto, nota }, token })

// ── Surtidos: lo que sale de bodega a cada tienda ────────────────────────────
//
// Un folio lleva las líneas que salieron y la existencia que había en el
// destino en ese momento. Ese «antes» se manda desde aquí porque es el panel
// el que tiene el inventario del destino a la vista, y sólo existe mientras
// todavía es antes: los respaldos por fecha se quitaron a propósito y nada más
// va a poder reconstruirlo después.

export const surtidos = token => pedir('/surtidos', { token })

/** Registra una salida. El folio y el «antes» los arma `lib/surtidos.js`. */
export const guardarSurtido = ({ folio, destino, lineas, antes }, token) =>
  pedir('/surtidos', { metodo: 'POST', cuerpo: { folio, destino, lineas, antes }, token })

/**
 * Da un folio por visto.
 *
 * No reescribe sus líneas ni su «antes»: un folio editable después del alta no
 * comprobaría nada, porque se podría ajustar hasta que cuadre.
 */
export const cerrarSurtido = (folio, token) =>
  pedir('/surtidos', { metodo: 'POST', cuerpo: { folio, cerrado: true }, token })

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

// ── Flujo de efectivo ────────────────────────────────────────────────────────
//
// SOLO ADMINISTRADOR. Lo decidio el dueño: las plazas hacen todo directo en
// Eleventa y nadie mas entra aqui. Y hay un motivo mas fuerte que el permiso:
// los faltantes al cerrar turno llevan el NOMBRE de quien cerro pegado a una
// cantidad de dinero que falta, asi que `caja/` es privado y lo sirve el
// backend, igual que `personal/`.

/**
 * Todo lo que necesita la pestaña en una sola llamada: el flujo de las cinco
 * plazas, los depositos marcados, los ajustes, los movimientos y los
 * parametros.
 *
 * En una sola a proposito. Son nueve archivos, y pidiendolos de uno en uno la
 * pantalla se pintaba a trozos con los semaforos cambiando de color a medida
 * que llegaban. Un semaforo que pasa de verde a rojo solo no se lee como «ya
 * cargo»: se lee como un fallo.
 */
export const caja = token => pedir('/caja', { token })

/**
 * Marca un bloque semanal como depositado, o le quita la marca.
 *
 * `semana` es el LUNES de la semana que cubre. Mandar `monto: null` quita la
 * marca y el bloque vuelve a acumular, que es como se deshace un deposito
 * apuntado por error.
 */
export const marcarDeposito = ({ sucursal, semana, monto, fecha, hora, folio, comprobante, deposito, nota }, token) =>
  pedir('/caja/deposito', {
    metodo: 'POST', token,
    cuerpo: { sucursal, semana, monto, fecha, hora, folio, comprobante, deposito, nota },
  })

/** Corrige un dia sin tocar lo calculado. `motivo` en null deshace. */
export const ajustarCaja = ({ sucursal, fecha, valores, motivo, nota }, token) =>
  pedir('/caja/ajuste', { metodo: 'POST', token, cuerpo: { sucursal, fecha, valores, motivo, nota } })

/** Los parametros de una sucursal. Un campo vacio se guarda nulo, no cero. */
export const guardarParametrosCaja = (sucursal, parametros, token) =>
  pedir('/caja/parametros', { metodo: 'POST', token, cuerpo: { sucursal, parametros } })

/**
 * Captura un movimiento de caja a mano, o lo borra con `borrar: true`.
 *
 * Es la via de escape, no el camino normal: desde el 2026-11-05 las plazas los
 * registran en Eleventa y de ahi los trae el extractor.
 */
export const guardarMovimientoCaja = (mov, token) =>
  pedir('/caja/movimiento', { metodo: 'POST', token, cuerpo: mov })
