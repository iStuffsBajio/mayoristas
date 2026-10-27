// Backend de iStuffs. Una sola función Lambda con URL propia.
//
// Existe por una razón: ninguna credencial debe llegar al navegador. Antes el
// sitio llevaba dentro las llaves de S3, el secreto de Dropbox y las
// contraseñas, y cualquiera podía leerlas viendo el código fuente de la página.
// Ahora esas credenciales viven solo aquí, en variables de entorno de Lambda,
// y el navegador solo recibe respuestas ya procesadas.

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import {
  verificarContrasena, crearSesion, leerSesion,
  demasiadosIntentos, registrarIntentoFallido, limpiarIntentos,
} from './seguridad.js'

// ── Configuración ──────────────────────────────────────────────────────────

const BUCKET = process.env.S3_BUCKET
const REGION = process.env.S3_REGION || 'us-east-1'
const SECRETO_SESION = process.env.SESION_SECRETO

// Dominios que pueden llamar a este backend. Cualquier otro recibe un rechazo.
const ORIGENES = (process.env.ORIGENES_PERMITIDOS || '')
  .split(',').map(s => s.trim()).filter(Boolean)

const CARPETA_PEDIDOS = process.env.DROPBOX_CARPETA_PEDIDOS
  || '/Espacio familiar/IMPRESORA UV/7 PEDIDOS PAGINA WEB'

const SUCURSALES = {
  leon:             { nombre: 'León',            carpeta: 'Leon' },
  'san-luis':       { nombre: 'San Luis Potosí', carpeta: 'San Luis' },
  aguascalientes:   { nombre: 'Aguascalientes',  carpeta: 'Aguascalientes' },
  torreon:          { nombre: 'Torreón',         carpeta: 'Torreon' },
}

const MAX_IMAGEN_BYTES = 10 * 1024 * 1024
const TIPOS_IMAGEN = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const s3 = new S3Client({ region: REGION })

// ── Utilidades HTTP ────────────────────────────────────────────────────────

function cabeceras(origen) {
  const permitido = ORIGENES.includes(origen) ? origen : (ORIGENES[0] || '')
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':  permitido,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age':       '86400',
    'Vary':                         'Origin',
    'Cache-Control':                'no-store',
    'X-Content-Type-Options':       'nosniff',
  }
}

const responder = (origen, codigo, cuerpo) => ({
  statusCode: codigo,
  headers: cabeceras(origen),
  body: JSON.stringify(cuerpo),
})

/** Lee el token Authorization y devuelve la sesión, o null. */
function sesionDe(evento) {
  const cab = evento.headers?.authorization || evento.headers?.Authorization || ''
  const token = cab.startsWith('Bearer ') ? cab.slice(7) : null
  return leerSesion(token, SECRETO_SESION)
}

const puedeSucursal = (sesion, slug) =>
  !!sesion && (sesion.admin === true || sesion.sucursal === slug)

// ── Dropbox del lado del servidor ──────────────────────────────────────────

let tokenCache = { valor: null, expira: 0 }

async function dropboxToken() {
  if (tokenCache.valor && Date.now() < tokenCache.expira) return tokenCache.valor
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
      client_id:     process.env.DROPBOX_APP_KEY,
      client_secret: process.env.DROPBOX_APP_SECRET,
    }),
  })
  if (!res.ok) throw new Error(`Dropbox token ${res.status}`)
  const d = await res.json()
  tokenCache = { valor: d.access_token, expira: Date.now() + (d.expires_in - 60) * 1000 }
  return tokenCache.valor
}

async function dropboxApi(endpoint, cuerpo) {
  const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${await dropboxToken()}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(cuerpo),
  })
  if (!res.ok) throw new Error(`Dropbox /${endpoint} ${res.status}`)
  return res.json()
}

// ── Rutas ──────────────────────────────────────────────────────────────────

/** Inicia sesión. Las contraseñas se comparan contra hashes, nunca en claro. */
async function rutaLogin(evento, origen, cuerpo) {
  const ip = evento.requestContext?.http?.sourceIp || 'desconocida'
  if (demasiadosIntentos(ip)) {
    return responder(origen, 429, { error: 'Demasiados intentos. Espera 15 minutos.' })
  }

  const sucursal = String(cuerpo.sucursal || '').trim()
  const clave    = String(cuerpo.contrasena || '')

  // El hash del admin abre todas las sucursales
  if (verificarContrasena(clave, process.env.HASH_ADMIN)) {
    limpiarIntentos(ip)
    return responder(origen, 200, {
      token:   crearSesion({ sucursal: 'all', admin: true }, SECRETO_SESION),
      sucursal: 'all',
      admin:    true,
    })
  }

  const hash = process.env[`HASH_${sucursal.toUpperCase().replace(/-/g, '_')}`]
  if (hash && verificarContrasena(clave, hash)) {
    limpiarIntentos(ip)
    return responder(origen, 200, {
      token:    crearSesion({ sucursal, admin: false }, SECRETO_SESION),
      sucursal,
      admin:    false,
    })
  }

  registrarIntentoFallido(ip)
  // Mismo mensaje para usuario inexistente y contraseña mala, para no revelar
  // qué sucursales tienen acceso configurado.
  return responder(origen, 401, { error: 'Sucursal o contraseña incorrecta.' })
}

/** Lista las imágenes de una carpeta del catálogo, con enlaces temporales. */
async function rutaGaleria(evento, origen) {
  const carpeta = evento.queryStringParameters?.carpeta || ''
  // Solo se permiten carpetas dentro de las rutas declaradas en la config,
  // para que nadie pueda pedir el contenido de cualquier parte del Dropbox.
  const permitidas = (process.env.CARPETAS_CATALOGO || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!permitidas.includes(carpeta)) {
    return responder(origen, 403, { error: 'Carpeta no permitida.' })
  }

  const data = await dropboxApi('files/list_folder', { path: carpeta, limit: 200 })
  const imagenes = (data.entries || [])
    .filter(e => e['.tag'] === 'file' && /\.(jpe?g|png|webp|gif)$/i.test(e.name))
    .slice(0, 100)

  const conUrl = await Promise.allSettled(imagenes.map(async e => ({
    name:     e.name,
    filename: e.name,
    url:      (await dropboxApi('files/get_temporary_link', { path: e.path_lower })).link,
  })))

  return responder(origen, 200, {
    imagenes: conUrl.filter(r => r.status === 'fulfilled').map(r => r.value),
  })
}

/** Guarda la imagen de un pedido en la carpeta de su sucursal. */
async function rutaSubirDiseno(evento, origen, cuerpo) {
  const slug = String(cuerpo.sucursal || '')
  const suc  = SUCURSALES[slug]
  if (!suc) return responder(origen, 400, { error: 'Sucursal desconocida.' })

  const tipo = String(cuerpo.tipo || '')
  if (!TIPOS_IMAGEN.has(tipo)) return responder(origen, 400, { error: 'Tipo de imagen no permitido.' })

  let binario
  try {
    binario = Buffer.from(String(cuerpo.datos || ''), 'base64')
  } catch {
    return responder(origen, 400, { error: 'Imagen ilegible.' })
  }
  if (binario.length === 0)                 return responder(origen, 400, { error: 'Imagen vacía.' })
  if (binario.length > MAX_IMAGEN_BYTES)    return responder(origen, 413, { error: 'La imagen supera 10 MB.' })

  // Nombre y modelo vienen del cliente: se limpian para que no puedan salirse
  // de la carpeta ni inyectar rutas.
  const limpiar = (valor, largo) => String(valor || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, largo)

  const nombre = limpiar(cuerpo.nombre, 40) || 'cliente'
  // El modelo va en el nombre del archivo para que en la sucursal se sepa a qué
  // corresponde cada imagen sin tener que abrirlas una por una.
  const modelo = limpiar(cuerpo.modelo, 50)

  const ext   = tipo === 'image/png' ? 'png' : tipo === 'image/webp' ? 'webp' : tipo === 'image/gif' ? 'gif' : 'jpg'
  const fecha = new Date().toISOString().slice(0, 10)
  const ruta  = `${CARPETA_PEDIDOS}/${suc.carpeta}/${fecha}_${nombre}${modelo ? `_${modelo}` : ''}.${ext}`

  const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method:  'POST',
    headers: {
      Authorization:     `Bearer ${await dropboxToken()}`,
      'Dropbox-API-Arg': JSON.stringify({ path: ruta, mode: 'add', autorename: true }),
      'Content-Type':    'application/octet-stream',
    },
    body: binario,
  })
  if (!res.ok) return responder(origen, 502, { error: 'No se pudo guardar la imagen.' })

  const d = await res.json()
  // Solo se devuelve la carpeta, no la ruta completa del Dropbox.
  return responder(origen, 200, { carpeta: suc.carpeta, archivo: d.name })
}

/** Guarda la configuración del sitio. Solo administrador. */
async function rutaGuardarConfig(evento, origen, cuerpo) {
  const sesion = sesionDe(evento)
  if (!sesion?.admin) return responder(origen, 403, { error: 'Requiere administrador.' })

  if (!cuerpo || typeof cuerpo.config !== 'object') {
    return responder(origen, 400, { error: 'Configuración inválida.' })
  }
  const texto = JSON.stringify(cuerpo.config)
  if (texto.length > 256 * 1024) return responder(origen, 413, { error: 'Configuración demasiado grande.' })

  await s3.send(new PutObjectCommand({
    Bucket:       BUCKET,
    Key:          'config/site.json',
    Body:         Buffer.from(texto),
    ContentType:  'application/json; charset=utf-8',
    CacheControl: 'no-cache',
  }))
  return responder(origen, 200, { ok: true })
}

/** Sube el Excel de inventario de una sucursal. Requiere sesión de esa sucursal. */
async function rutaSubirInventario(evento, origen, cuerpo) {
  const sesion = sesionDe(evento)
  const slug = String(cuerpo.sucursal || '')
  if (!SUCURSALES[slug])            return responder(origen, 400, { error: 'Sucursal desconocida.' })
  if (!puedeSucursal(sesion, slug)) return responder(origen, 403, { error: 'Sin permiso para esta sucursal.' })

  if (!Array.isArray(cuerpo.productos) || cuerpo.productos.length === 0) {
    return responder(origen, 400, { error: 'Inventario vacío.' })
  }
  if (cuerpo.productos.length > 20000) {
    return responder(origen, 413, { error: 'Inventario demasiado grande.' })
  }

  // El código se conserva: es la clave con la que las estadísticas cruzan un
  // modelo entre días y entre sucursales. Sin él, un producto renombrado se
  // contaría como dos.
  const productos = cuerpo.productos.slice(0, 20000).map(p => ({
    Codigo:     String(p.Codigo ?? '').slice(0, 60),
    Producto:   String(p.Producto ?? '').slice(0, 200),
    Existencia: Number(p.Existencia) || 0,
  })).filter(p => p.Producto)

  const json = {
    sucursal:       slug,
    nombre:         SUCURSALES[slug].nombre,
    origen:         'excel-manual',
    generado:       new Date().toISOString(),
    subidoPor:      sesion.admin ? 'administrador' : slug,
    totalProductos: productos.length,
    productos,
  }

  await s3.send(new PutObjectCommand({
    Bucket:       BUCKET,
    Key:          `inventarios/${slug}/inventario.json`,
    Body:         Buffer.from(JSON.stringify(json)),
    ContentType:  'application/json; charset=utf-8',
    CacheControl: 'no-cache',
  }))
  return responder(origen, 200, { ok: true, totalProductos: productos.length })
}

// ── Revisiones del catálogo ────────────────────────────────────────────────
//
// Lo que cada quien contesta en la cola de revisión. Antes vivía en el
// navegador, y eso servía mientras lo mirara una sola persona: en cuanto León
// empieza a contestar casos, sus respuestas se quedaban en su máquina y aquí
// no llegaba ninguna.
//
// **Cada quien escribe SOLO su propio archivo.** Es lo que evita que dos
// personas contestando a la vez se pisen: con un único archivo compartido
// haría falta leer, modificar y volver a escribir, y la respuesta de quien
// guardara medio segundo después borraría la otra sin avisar. Al leer se
// juntan todos.
//
// Van bajo `revisiones/`, que la política del bucket NO abre al público: las
// notas llevan nombres de empleados. Por eso se sirven desde aquí.

// Se contesta si o no. «pendiente» e «ignorado» son como se llamaban antes:
// se siguen aceptando para no tirar lo que ya este guardado.
const ESTADOS = new Set(['si', 'no', 'pendiente', 'ignorado'])

const quienEs = sesion => (sesion.admin ? 'admin' : sesion.sucursal)

const claveRevisiones = quien => `revisiones/${quien}.json`

async function leerJson(clave) {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: clave }))
    const v = JSON.parse(await r.Body.transformToString())
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/**
 * Todas las respuestas, de todos. Requiere sesión de cualquier tipo.
 *
 * Si dos personas contestaron el mismo caso gana la más reciente, y se dice
 * quién fue: que León y bodega digan cosas distintas del mismo código es un
 * dato, no un empate que haya que esconder.
 */
async function rutaRevisiones(evento, origen) {
  const sesion = sesionDe(evento)
  if (!sesion) return responder(origen, 403, { error: 'Requiere sesión.' })

  const quienes = ['admin', ...Object.keys(SUCURSALES)]
  const archivos = await Promise.all(quienes.map(async q => [q, await leerJson(claveRevisiones(q))]))

  const marcas = {}
  for (const [quien, datos] of archivos) {
    for (const [id, m] of Object.entries(datos)) {
      if (!m || typeof m !== 'object') continue
      const previo = marcas[id]
      if (previo && String(previo.fecha ?? '') > String(m.fecha ?? '')) continue
      marcas[id] = { ...m, por: quien }
    }
  }
  return responder(origen, 200, { marcas })
}

/** Guarda una respuesta. Cada quien en su propio archivo. */
async function rutaGuardarRevision(evento, origen, cuerpo) {
  const sesion = sesionDe(evento)
  if (!sesion) return responder(origen, 403, { error: 'Requiere sesión.' })

  const id = String(cuerpo?.id ?? '').slice(0, 200)
  if (!id) return responder(origen, 400, { error: 'Falta el caso.' })

  const estado = cuerpo?.estado == null ? null : String(cuerpo.estado)
  if (estado !== null && !ESTADOS.has(estado)) {
    return responder(origen, 400, { error: 'Estado desconocido.' })
  }

  const quien = quienEs(sesion)
  if (!quien) return responder(origen, 403, { error: 'Sesión sin sucursal.' })

  const mias = await leerJson(claveRevisiones(quien))
  if (estado === null) delete mias[id]
  else mias[id] = { estado, nota: String(cuerpo.nota ?? '').slice(0, 500), fecha: new Date().toISOString() }

  // Un tope por si alguien deja el navegador marcando: el archivo lo escribe
  // una persona, no un proceso.
  if (Object.keys(mias).length > 5000) {
    return responder(origen, 413, { error: 'Demasiadas respuestas guardadas.' })
  }

  await s3.send(new PutObjectCommand({
    Bucket:       BUCKET,
    Key:          claveRevisiones(quien),
    Body:         Buffer.from(JSON.stringify(mias)),
    ContentType:  'application/json; charset=utf-8',
    CacheControl: 'no-cache',
  }))
  return responder(origen, 200, { ok: true, por: quien })
}

/**
 * Turnos del personal. Solo administrador.
 *
 * Vive en el prefijo `personal/`, que la politica del bucket NO abre al
 * publico: son nombres de empleados y la hora a la que llegaron cada dia. Por
 * eso se sirve desde aqui y no se lee del navegador, que tendria que llevar
 * credenciales para alcanzarlo.
 */
async function rutaTurnos(evento, origen) {
  const sesion = sesionDe(evento)
  if (!sesion?.admin) return responder(origen, 403, { error: 'Requiere administrador.' })

  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: 'personal/turnos.json' }))
    const texto = await r.Body.transformToString()
    return responder(origen, 200, JSON.parse(texto))
  } catch {
    return responder(origen, 404, { error: 'Todavia no hay turnos publicados.' })
  }
}

// ── Entrada ────────────────────────────────────────────────────────────────

export async function handler(evento) {
  const origen = evento.headers?.origin || evento.headers?.Origin || ''
  const metodo = evento.requestContext?.http?.method || 'GET'
  const ruta   = (evento.rawPath || '/').replace(/\/+$/, '') || '/'

  if (metodo === 'OPTIONS') return { statusCode: 204, headers: cabeceras(origen), body: '' }

  // Falla de entrada si falta configuración, en vez de comportarse raro
  for (const [k, v] of Object.entries({ S3_BUCKET: BUCKET, SESION_SECRETO: SECRETO_SESION })) {
    if (!v) return responder(origen, 500, { error: `Backend mal configurado: falta ${k}` })
  }
  if (ORIGENES.length && origen && !ORIGENES.includes(origen)) {
    return responder(origen, 403, { error: 'Origen no permitido.' })
  }

  let cuerpo = {}
  if (metodo === 'POST') {
    try {
      const crudo = evento.isBase64Encoded
        ? Buffer.from(evento.body || '', 'base64').toString('utf8')
        : (evento.body || '{}')
      cuerpo = JSON.parse(crudo)
    } catch {
      return responder(origen, 400, { error: 'Cuerpo inválido.' })
    }
  }

  try {
    if (metodo === 'POST' && ruta === '/login')      return await rutaLogin(evento, origen, cuerpo)
    if (metodo === 'GET'  && ruta === '/galeria')    return await rutaGaleria(evento, origen)
    if (metodo === 'GET'  && ruta === '/turnos')     return await rutaTurnos(evento, origen)
    if (metodo === 'GET'  && ruta === '/revisiones') return await rutaRevisiones(evento, origen)
    if (metodo === 'POST' && ruta === '/revisiones') return await rutaGuardarRevision(evento, origen, cuerpo)
    if (metodo === 'POST' && ruta === '/diseno')     return await rutaSubirDiseno(evento, origen, cuerpo)
    if (metodo === 'POST' && ruta === '/config')     return await rutaGuardarConfig(evento, origen, cuerpo)
    if (metodo === 'POST' && ruta === '/inventario') return await rutaSubirInventario(evento, origen, cuerpo)
    return responder(origen, 404, { error: 'Ruta no encontrada.' })
  } catch (err) {
    // Nunca se devuelve el detalle del error al navegador: puede filtrar rutas,
    // nombres de bucket o mensajes internos. El detalle queda en CloudWatch.
    console.error('Error en', ruta, err)
    return responder(origen, 500, { error: 'Error interno.' })
  }
}
