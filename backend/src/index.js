// Backend de iStuffs. Una sola función Lambda con URL propia.
//
// Existe por una razón: ninguna credencial debe llegar al navegador. Antes el
// sitio llevaba dentro las llaves de S3, el secreto de Dropbox y las
// contraseñas, y cualquiera podía leerlas viendo el código fuente de la página.
// Ahora esas credenciales viven solo aquí, en variables de entorno de Lambda,
// y el navegador solo recibe respuestas ya procesadas.

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { verificarBajas, hoyMexico, PLAZAS_CON_STOCK, DIAS_MINIMOS_PARA_BAJA } from './bajas.js'
import {
  PLAZAS_CORTE, INICIO_DEL_CORTE, esLunes, lunesDe, validarConteo, diasParaTienda,
  movimientosParaTienda, ventasParaTienda, parametrosParaTienda, registroDeConteo,
} from './cortes.js'
import {
  verificarContrasena, crearSesion, leerSesion, verificarTotp, tipoDeImagen,
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

/**
 * Todos los que pueden ESCRIBIR algo con su nombre.
 *
 * Cada quien escribe solo su archivo -`revisiones/<quien>.json`,
 * `ajustes/<quien>.json`, `surtidos/<quien>.json`- y al leer se juntan. Esta
 * es la lista de a quienes hay que ir a buscar.
 *
 * Tiene que estar COMPLETA o el trabajo de quien falte desaparece sin que
 * nadie se entere: se guarda bien, y al leer no se pide. Paso con bodega, que
 * no estaba: su usuario podia contestar la cola de revision y corregir
 * codigos, y nada de eso volvia nunca.
 *
 * Por eso vive aqui una sola vez. Estaba escrita tres, y dos de las tres se
 * habian quedado atras.
 */
const QUIENES_ESCRIBEN = ['admin', 'bodega', ...Object.keys(SUCURSALES)]

/**
 * Quién puede iniciar sesión con contraseña propia.
 *
 * `admin` NO está, y es a propósito: el administrador entra por su propia
 * rama, no buscando `HASH_ADMIN` a partir de lo que teclee alguien.
 */
const PLAZAS_CON_ACCESO = new Set(['bodega', ...Object.keys(SUCURSALES)])

/**
 * Lo único que puede ir en `config/site.json`, que es PÚBLICO.
 *
 * Son las seis secciones que la página lee en `SiteConfigContext`. Nada de
 * esto es un secreto; el punto de la lista es que no se cuele algo que sí lo
 * sea.
 */
const CLAVES_CONFIG = new Set([
  'tabs', 'hero', 'colores', 'footer', 'dropboxCatalogos', 'whatsapp',
])

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

  const sucursal = String(cuerpo.sucursal || '').trim().toLowerCase()
  const clave    = String(cuerpo.contrasena || '')
  const codigo   = String(cuerpo.codigo || '')

  // El hash del admin abre todas las sucursales
  if (verificarContrasena(clave, process.env.HASH_ADMIN)) {
    // ── Segundo factor, sólo para el administrador ─────────────────────
    //
    // Es quien ve el efectivo de las cuatro plazas, los faltantes con el
    // nombre de quien cerró el turno y la lista de mayoristas. Una tienda ve
    // su inventario, que de todas formas se publica: pedirle un código del
    // móvil a quien está en el mostrador sería un estorbo diario a cambio de
    // proteger lo que ya es público, y un estorbo diario acaba en la
    // contraseña pegada en un papel junto a la caja.
    //
    // Si `TOTP_ADMIN` no está puesta, no se exige nada. Así se puede dar de
    // alta el secreto sin riesgo de quedarse fuera por un despiste: el día
    // que la variable exista, empieza a pedirse, y ni un minuto antes.
    const secreto = process.env.TOTP_ADMIN
    if (secreto) {
      if (!codigo) {
        // 401 con una señal, no un error: la página tiene que saber que la
        // contraseña estaba bien y que lo que falta es el código.
        return responder(origen, 401, { error: 'Falta el código de tu app.', pideCodigo: true })
      }
      if (!verificarTotp(codigo, secreto)) {
        // Un código malo cuenta como intento fallido. Si no, el segundo
        // factor se podría probar a fuerza bruta -son seis dígitos- con la
        // contraseña ya en la mano.
        registrarIntentoFallido(ip)
        return responder(origen, 401, { error: 'Código incorrecto.', pideCodigo: true })
      }
    }
    limpiarIntentos(ip)
    return responder(origen, 200, {
      token:   crearSesion({ sucursal: 'all', admin: true }, SECRETO_SESION),
      sucursal: 'all',
      admin:    true,
    })
  }

  // La plaza se valida contra la lista ANTES de construir el nombre de la
  // variable. Sin esto, lo que teclea el usuario elegía qué variable de
  // entorno se leía: entrando como `admin` se cogía `HASH_ADMIN` y salía una
  // sesión NO administradora con plaza «admin», que `puedeSurtir` aceptaba.
  // Hacía falta la contraseña buena para llegar ahí, pero una ruta que deja
  // elegir la variable de entorno al que llama no se deja abierta.
  const hash = PLAZAS_CON_ACCESO.has(sucursal)
    ? process.env[`HASH_${sucursal.toUpperCase().replace(/-/g, '_')}`]
    : null
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
  // Publica, y cada llamada dispara varias peticiones a la API de Dropbox:
  // sin freno, un bucle agota la cuota de la cuenta entera.
  const ip = evento.requestContext?.http?.sourceIp || 'desconocida'
  if (demasiadosIntentos(`galeria:${ip}`)) {
    return responder(origen, 429, { error: 'Demasiadas peticiones. Espera unos minutos.' })
  }
  registrarIntentoFallido(`galeria:${ip}`)

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
  // Esta ruta es PÚBLICA a propósito -es el pedido del cliente, que no tiene
  // usuario- y por eso es la única por la que un desconocido puede escribir
  // en el Dropbox del negocio. Sin freno, llenarlo cuesta un bucle.
  const ip = evento.requestContext?.http?.sourceIp || 'desconocida'
  if (demasiadosIntentos(`diseno:${ip}`)) {
    return responder(origen, 429, { error: 'Demasiados envíos. Espera unos minutos.' })
  }
  registrarIntentoFallido(`diseno:${ip}`)

  const slug = String(cuerpo.sucursal || '')
  const suc  = SUCURSALES[slug]
  if (!suc) return responder(origen, 400, { error: 'Sucursal desconocida.' })

  // El tipo que manda el cliente ya no decide nada: se mira abajo, en los
  // bytes. Aqui solo se corta pronto lo que ni siquiera dice ser una imagen,
  // para no decodificar diez megas de algo que se va a rechazar igual.
  const tipoDicho = String(cuerpo.tipo || '')
  if (tipoDicho && !TIPOS_IMAGEN.has(tipoDicho)) {
    return responder(origen, 400, { error: 'Tipo de imagen no permitido.' })
  }

  // El tamaño se mira ANTES de decodificar. `Buffer.from(x,'base64')` nunca
  // lanza -por eso el try/catch que había aquí era código muerto- así que lo
  // único que hacía el orden anterior era reservar la memoria primero y
  // quejarse después.
  const datos = String(cuerpo.datos || '')
  if (datos.length > Math.ceil(MAX_IMAGEN_BYTES / 3) * 4 + 16) {
    return responder(origen, 413, { error: 'La imagen supera 10 MB.' })
  }
  const binario = Buffer.from(datos, 'base64')
  if (binario.length === 0)              return responder(origen, 400, { error: 'Imagen vacía.' })
  if (binario.length > MAX_IMAGEN_BYTES) return responder(origen, 413, { error: 'La imagen supera 10 MB.' })

  // Y el tipo sale de los BYTES, no de lo que afirme el cliente. Así no se
  // puede colar un guion o un ejecutable con nombre de `.png`, y tampoco se
  // pierde el pedido de quien suba un PNG de verdad que el navegador no supo
  // etiquetar -`file.type` llega vacío con una extensión que no reconoce-.
  const tipo = tipoDeImagen(binario)
  if (!tipo || !TIPOS_IMAGEN.has(tipo)) {
    return responder(origen, 400, { error: 'El archivo no es una imagen.' })
  }

  // Nombre y modelo vienen del cliente: se limpian para que no puedan salirse
  // de la carpeta ni inyectar rutas.
  const limpiar = (valor, largo) => String(valor || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, largo)

  const nombre = limpiar(cuerpo.nombre, 40) || 'cliente'
  // El modelo va en el nombre del archivo para que en la sucursal se sepa a qué
  // corresponde cada imagen sin tener que abrirlas una por una.
  const modelo = limpiar(cuerpo.modelo, 50)

  // La extension sale del tipo DEDUCIDO: si se tomara del que dijo el
  // cliente, un PNG acabaria guardado como `.jpg` y en la tienda no abriria.
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

  if (!cuerpo || typeof cuerpo.config !== 'object' || Array.isArray(cuerpo.config)) {
    return responder(origen, 400, { error: 'Configuración inválida.' })
  }

  // `config/site.json` es el ÚNICO archivo que la política del bucket abre al
  // público además de los inventarios. Aquí se aceptaba cualquier objeto, así
  // que un descuido -pegar algo en el formulario equivocado- publicaba lo que
  // fuera en una URL que lee cualquiera, sin que nada avisara. Se queda sólo
  // lo que la página usa de verdad.
  const sobran = Object.keys(cuerpo.config).filter(k => !CLAVES_CONFIG.has(k))
  if (sobran.length) {
    return responder(origen, 400, {
      error: `Esa configuración lleva campos que no se publican: ${sobran.slice(0, 5).join(', ')}.`,
    })
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
// Los estados de una incidencia. Los cuatro primeros son los viejos -«si»,
// «no», «pendiente», «ignorado»- y se mantienen para no tirar lo ya
// contestado: un archivo de respuestas viejo tiene que seguir leyendose.
//
// Los nuevos son del ciclo de vida. Ojo con los que NO estan: `cerrada` y
// `nueva` no se pueden elegir, los decide el respaldo. Si alguien manda
// `cerrada` por su cuenta, la siguiente carga lo vera como CONFLICTO -se dio
// por cerrada y el respaldo la sigue produciendo- que es justo lo correcto.
const ESTADOS = new Set([
  'si', 'no', 'pendiente', 'ignorado',
  'revisando', 'en-origen', 'descartada', 'cerrada',
])

const GRAVEDADES = new Set(['critica', 'alta', 'media', 'baja'])

// Los motivos son una LISTA CERRADA, igual que los estados. Un motivo escrito
// a mano no se puede contar ni agrupar, y la pantalla de causas se queda sin
// de donde salir: «se corrigio», «ya se corrigio» y «corregido» serian tres
// motivos distintos.
const MOTIVOS = new Set([
  'corregido-aqui', 'se-dio-de-baja', 'se-renombro', 'se-unifico',
  'bodega-lo-dio-alta', 'no-aplica',
  'no-es-error', 'caso-especial', 'ya-no-se-maneja', 'otro',
])

// La configuracion -excepciones y catalogo de codigos- se guarda en el mismo
// archivo porque es el unico por persona que ya se junta al leer. Se
// distingue por el prefijo y no es una incidencia: no lleva estado.
const esConfig = id => String(id).startsWith('cfg|')

const ALCANCES = new Set(['caso', 'codigo', 'plaza', 'regla'])

/** Un tope al historial. Lo escribe una persona, pero no se deja crecer solo. */
const HISTORIAL_MAXIMO = 40

const texto = (v, n) => String(v ?? '').slice(0, n)

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

  const archivos = await Promise.all(
    QUIENES_ESCRIBEN.map(async q => [q, await leerJson(claveRevisiones(q))]))

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

  const quien = quienEs(sesion)
  if (!quien) return responder(origen, 403, { error: 'Sesión sin sucursal.' })

  const mias = await leerJson(claveRevisiones(quien))

  // Configuracion: excepciones y catalogo.
  //
  // Va por su propia rama porque NO lleva estado, y pasarla por la
  // validacion de estados la rechazaria entera. Revocar es BORRAR: una
  // excepcion revocada que se quedara en el archivo seguiria tapando la
  // alerta mientras la pantalla la enseña como retirada.
  if (esConfig(id)) {
    if (cuerpo?.borrar) delete mias[id]
    else {
      const alcance = cuerpo?.alcance == null ? null : String(cuerpo.alcance)
      if (alcance !== null && !ALCANCES.has(alcance)) {
        return responder(origen, 400, { error: 'Alcance desconocido.' })
      }
      const previo = mias[id] ?? {}
      mias[id] = {
        ...previo,
        fecha: new Date().toISOString(),
        por: quien,
        ...(alcance !== null ? { alcance } : {}),
        ...(cuerpo?.regla   != null ? { regla:   texto(cuerpo.regla, 40) } : {}),
        ...(cuerpo?.codigo  != null ? { codigo:  texto(cuerpo.codigo, 40).toUpperCase() } : {}),
        ...(cuerpo?.plaza   != null ? { plaza:   texto(cuerpo.plaza, 40) } : {}),
        ...(cuerpo?.huella  != null ? { huella:  texto(cuerpo.huella, 200) } : {}),
        // Sin fecha de vencimiento la excepcion no caduca. Se permite, pero
        // se guarda como null explicito para que la pantalla pueda decirlo.
        ...(cuerpo?.vence   !== undefined
          ? { vence: cuerpo.vence ? texto(cuerpo.vence, 10) : null } : {}),
        ...(cuerpo?.motivo  != null ? { motivo:  texto(cuerpo.motivo, 300) } : {}),
        ...(cuerpo?.significa != null ? { significa: texto(cuerpo.significa, 400) } : {}),
        ...(cuerpo?.causa     != null ? { causa:     texto(cuerpo.causa, 400) } : {}),
        ...(cuerpo?.hacer     != null ? { hacer:     texto(cuerpo.hacer, 400) } : {}),
      }
    }
    return await escribirRevisiones(origen, quien, mias, id)
  }

  const estado = cuerpo?.estado == null ? null : String(cuerpo.estado)
  if (estado !== null && !ESTADOS.has(estado)) {
    return responder(origen, 400, { error: 'Estado desconocido.' })
  }
  if (estado === null) delete mias[id]
  else {
    const gravedad = cuerpo?.gravedad == null ? null : String(cuerpo.gravedad)
    if (gravedad !== null && !GRAVEDADES.has(gravedad)) {
      return responder(origen, 400, { error: 'Gravedad desconocida.' })
    }
    // El registro anterior no se pisa entero: se escribe encima. Asi cambiar
    // solo la gravedad no borra la nota ni el responsable, que es lo que
    // pasaria reemplazando el objeto.
    const motivo = cuerpo?.motivo == null ? null : String(cuerpo.motivo)
    if (motivo !== null && motivo !== '' && !MOTIVOS.has(motivo)) {
      return responder(origen, 400, { error: 'Motivo desconocido.' })
    }

    const previo = mias[id] ?? {}
    const ahora = new Date().toISOString()
    const nota = String(cuerpo.nota ?? previo.nota ?? '').slice(0, 500)

    // El HISTORIAL, que es la razon de ser de esto.
    //
    // La queja que pidio el rediseño fue literal: «no se guardaban registros
    // de los movimientos». Antes solo quedaba el ULTIMO estado, asi que no
    // habia forma de saber quien movio un caso, cuando, ni cuantas veces
    // habia vuelto: la pantalla enseñaba una foto y no una pelicula.
    //
    // Se escribe AQUI y no en el navegador a proposito. El autor y la hora
    // los pone el servidor con la sesion en la mano; dejandolo al cliente,
    // cualquiera podria mandar un historial con el nombre de otro, y un
    // registro que se puede escribir a gusto no prueba nada.
    //
    // Solo se apunta cuando algo CAMBIA. Guardar dos veces seguidas lo mismo
    // -volver a pulsar Guardar sin tocar nada- llenaria el historial de
    // renglones iguales y lo volveria ilegible, que es la otra forma de no
    // tener registro.
    const cambio = previo.estado !== estado
      || (motivo != null && previo.motivo !== motivo)
      || previo.nota !== nota
      || (gravedad !== null && previo.gravedad !== gravedad)
      || (cuerpo?.responsable != null && previo.responsable !== cuerpo.responsable)
    const historial = [...(Array.isArray(previo.historial) ? previo.historial : [])]
    if (cambio) {
      historial.push({
        cuando: ahora, quien, estado,
        ...(motivo ? { motivo } : {}),
        ...(nota && nota !== previo.nota ? { nota: nota.slice(0, 200) } : {}),
      })
    }

    // Un comentario interno no cambia el estado: es lo que se dice entre
    // quienes trabajan el caso. Va aparte de la nota, que es la razon
    // oficial de la decision, porque mezclarlos borraria esa razon cada vez
    // que alguien quiere apuntar algo.
    const comentarios = [...(Array.isArray(previo.comentarios) ? previo.comentarios : [])]
    if (cuerpo?.comentario) {
      comentarios.push({ cuando: ahora, quien, texto: texto(cuerpo.comentario, 300) })
    }

    mias[id] = {
      ...previo,
      estado,
      nota,
      fecha:  ahora,
      historial:   historial.slice(-HISTORIAL_MAXIMO),
      comentarios: comentarios.slice(-HISTORIAL_MAXIMO),
      ...(gravedad !== null ? { gravedad } : {}),
      ...(motivo !== null ? { motivo } : {}),
      ...(cuerpo?.responsable != null
        ? { responsable: String(cuerpo.responsable).slice(0, 80) } : {}),
      ...(cuerpo?.compromiso != null
        ? { compromiso: String(cuerpo.compromiso).slice(0, 10) } : {}),
      // Quien lo dejo asi la ultima vez. El archivo ya dice de quien es, pero
      // al juntarlos se pierde si no va dentro.
      por: quien,
    }
  }

  return await escribirRevisiones(origen, quien, mias, id)
}

/** Escribe el archivo de una persona. Comun a las respuestas y a la config. */
async function escribirRevisiones(origen, quien, mias, id) {

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
  // Se devuelve el registro TAL COMO quedo, con su historial. El cliente no
  // puede armarlo por su cuenta -la hora y el autor los pone este lado- y sin
  // devolverlo la pantalla enseñaria el caso sin su ultimo movimiento hasta
  // la siguiente recarga.
  return responder(origen, 200, { ok: true, por: quien, registro: id ? (mias[id] ?? null) : null })
}

// ── Ajustes: las correcciones que se hacen en la pagina ───────────────────
//
// No tocan el dato. `inventario.json` se regenera desde el respaldo de
// Eleventa cuatro veces al dia, asi que una correccion escrita encima se
// borraria sola esa misma tarde. Esto se guarda AL LADO y la pagina lo
// aplica al leer; el estado -pendiente o resuelto- no lo marca nadie: lo
// decide el respaldo siguiente.
//
// Van bajo `ajustes/`, que la politica del bucket NO abre al publico: llevan
// quien corrigio que y por que. Igual que `revisiones/`, cada quien escribe
// SOLO su archivo y al leer se juntan: con uno compartido, dos personas
// corrigiendo a la vez se borrarian sin avisar.

const TIPOS_AJUSTE = new Set(['ocultar', 'descontinuado'])

/**
 * `descontinuado` no oculta nada: marca un código que bodega ya no surte y
 * que las tiendas están liquidando, para que la cola de revisión no lo siga
 * reclamando como si fuera un error. Lo marcan administración y bodega, que
 * es quien sabe qué dejó de comprar.
 */
const MOTIVO_DESCONTINUADO = 'bodega-descontinuo'
const PUEDE_DESCONTINUAR = new Set(['admin', 'bodega'])

/**
 * La baja definitiva NO está en la lista de abajo, a propósito. Sólo se
 * registra por `/ajustes/bajas`, que comprueba en el servidor que el código no
 * tenga piezas ni ventas. Si estuviera aquí, bastaría mandar el motivo por la
 * ruta genérica para saltarse el candado.
 */
const MOTIVO_BAJA_DEFINITIVA = 'baja-definitiva'
const MAX_BAJAS_POR_PETICION = 500

const MOTIVOS_AJUSTE = new Set([
  // `dado-de-baja` es la decision tomada desde el panel de Inventarios: el
  // codigo sigue vivo en la caja y se quiere fuera. No es lo mismo que
  // `ya-no-existe`, que es comprobar algo que ya paso.
  'dado-de-baja',
  'ya-no-existe', 'codigo-duplicado', 'mal-capturado', 'no-se-maneja-aqui', 'otro',
])

const claveAjustes = quien => `ajustes/${quien}.json`

/** Todos los ajustes, de todos. Requiere sesion de cualquier tipo. */
async function rutaAjustes(evento, origen) {
  const sesion = sesionDe(evento)
  if (!sesion) return responder(origen, 403, { error: 'Requiere sesion.' })

  const archivos = await Promise.all(
    QUIENES_ESCRIBEN.map(async q => [q, await leerJson(claveAjustes(q))]))

  const ajustes = []
  for (const [quien, datos] of archivos) {
    for (const a of Object.values(datos)) ajustes.push({ ...a, quien })
  }
  return responder(origen, 200, { ajustes })
}

/** Los ajustes que caben en una petición por lote. */
const MAX_AJUSTES_POR_PETICION = 500

/**
 * Guarda o retira un ajuste. Mandar `motivo: null` lo retira, que es como se
 * deshace una correccion: el dato vuelve a verse en crudo.
 *
 * Acepta uno (`codigo`) o varios (`items: [{ codigo, producto }]`) en la MISMA
 * petición. Lo segundo no es comodidad: cada petición lee el archivo, lo
 * modifica y lo reescribe entero, así que dos simultáneas de la misma persona
 * se pisan y la última gana. Marcar 146 modelos con 146 peticiones perdía
 * marcas sin avisar; en una sola se leen y se escriben una vez.
 */
async function rutaGuardarAjuste(evento, origen, cuerpo) {
  const sesion = sesionDe(evento)
  if (!sesion) return responder(origen, 403, { error: 'Requiere sesion.' })

  const quien = quienEs(sesion)
  if (!quien) return responder(origen, 403, { error: 'Sesion sin sucursal.' })

  const normal = c => String(c ?? '').trim().toUpperCase().slice(0, 60)
  const items = Array.isArray(cuerpo?.items) && cuerpo.items.length
    ? cuerpo.items.map(i => ({ codigo: normal(i?.codigo), producto: String(i?.producto ?? '').slice(0, 120) }))
    : [{ codigo: normal(cuerpo?.codigo), producto: String(cuerpo?.producto ?? '').slice(0, 120) }]
  if (items.length > MAX_AJUSTES_POR_PETICION) {
    return responder(origen, 400, { error: `Máximo ${MAX_AJUSTES_POR_PETICION} códigos por petición.` })
  }
  if (items.some(i => !i.codigo)) return responder(origen, 400, { error: 'Falta el codigo.' })

  const tipo = String(cuerpo?.tipo ?? 'ocultar')
  if (!TIPOS_AJUSTE.has(tipo)) return responder(origen, 400, { error: 'Tipo de ajuste desconocido.' })
  if (tipo === 'descontinuado' && !PUEDE_DESCONTINUAR.has(quien)) {
    return responder(origen, 403, { error: 'Sólo administración y bodega marcan lo que bodega descontinuó.' })
  }

  // Todo se valida ANTES de leer ni escribir nada: un lote con un motivo malo
  // no puede dejar la mitad guardada.
  let motivo = null
  if (cuerpo?.motivo != null) {
    motivo = String(cuerpo.motivo)
    // La baja definitiva tiene su propia ruta, con el candado.
    if (motivo === MOTIVO_BAJA_DEFINITIVA) {
      return responder(origen, 400, {
        error: 'La baja definitiva se registra en /ajustes/bajas, que comprueba existencia y ventas.',
      })
    }
    const validos = tipo === 'descontinuado' ? new Set([MOTIVO_DESCONTINUADO]) : MOTIVOS_AJUSTE
    if (!validos.has(motivo)) return responder(origen, 400, { error: 'Motivo desconocido.' })
  }

  const mios = await leerJson(claveAjustes(quien))
  const cuando = new Date().toISOString()

  // Sin motivo se retira. Toda correccion lleva motivo: es lo que hace que el
  // reporte que baja a cada sucursal se pueda ordenar y contar.
  for (const { codigo, producto } of items) {
    const clave = `${tipo}|${codigo}`
    if (motivo === null) {
      delete mios[clave]
    } else {
      mios[clave] = {
        clave, tipo, codigo, motivo, producto,
        nota:   String(cuerpo.nota ?? '').slice(0, 500),
        cuando,
      }
    }
  }

  if (Object.keys(mios).length > 5000) {
    return responder(origen, 413, { error: 'Demasiados ajustes guardados.' })
  }

  await s3.send(new PutObjectCommand({
    Bucket:       BUCKET,
    Key:          claveAjustes(quien),
    Body:         Buffer.from(JSON.stringify(mios)),
    ContentType:  'application/json; charset=utf-8',
    CacheControl: 'no-cache',
  }))
  return responder(origen, 200, { ok: true, por: quien, cantidad: items.length })
}

/** Lee un JSON de S3 y devuelve NULL si no está: aquí «no hay» es un dato. */
async function leerJsonONulo(clave) {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: clave }))
    const v = JSON.parse(await r.Body.transformToString())
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

/**
 * Baja definitiva de una lista de códigos. SÓLO el administrador.
 *
 * El dueño lo fijó el 2026-11-09: no se elimina un SKU con existencia global
 * ni con ventas en los últimos 365 días. «Estrictamente» no se cumple con un
 * botón apagado: cualquiera con sesión de administrador puede mandar esta
 * petición a mano. Por eso la comprobación es de aquí, y lee los inventarios
 * de S3 en el momento: nada de lo que mande el navegador cuenta como prueba.
 *
 * Todo o nada en lo que toca al inventario: si falta el de CUALQUIER plaza no
 * se registra ninguno —responde 409—, porque un stock global al que le falta
 * una plaza es una cifra falsa. Lo demás se decide código por código: los que
 * pasan se registran y los que no vuelven con sus motivos.
 *
 * Lo que se registra es una nota —`ocultar` con motivo `baja-definitiva`—, no
 * un borrado: el inventario se regenera del respaldo y la caja la borra cada
 * tienda. El estado se cierra solo cuando el código deja de salir ahí.
 */
async function rutaGuardarBajas(evento, origen, cuerpo) {
  const sesion = sesionDe(evento)
  if (!sesion) return responder(origen, 403, { error: 'Requiere sesion.' })
  if (sesion.admin !== true) {
    return responder(origen, 403, { error: 'Sólo el administrador da de baja definitiva.' })
  }

  const codigos = [...new Set((Array.isArray(cuerpo?.codigos) ? cuerpo.codigos : [])
    .map(c => String(c ?? '').trim().toUpperCase().slice(0, 60)).filter(Boolean))]
  if (!codigos.length) return responder(origen, 400, { error: 'Faltan los códigos.' })
  if (codigos.length > MAX_BAJAS_POR_PETICION) {
    return responder(origen, 400, { error: `Máximo ${MAX_BAJAS_POR_PETICION} códigos por petición.` })
  }

  // Los archivos se leen frescos, de S3, en cada petición.
  const [invs, hists] = await Promise.all([
    Promise.all(PLAZAS_CON_STOCK.map(async s => [s, await leerJsonONulo(`inventarios/${s}/inventario.json`)])),
    Promise.all(PLAZAS_CON_STOCK.map(async s => [s, await leerJsonONulo(`inventarios/${s}/historial.json`)])),
  ])

  const v = verificarBajas({
    codigos,
    inventarios: Object.fromEntries(invs),
    historiales: Object.fromEntries(hists),
    dias: Number(cuerpo?.dias) || DIAS_MINIMOS_PARA_BAJA,
    hoy: hoyMexico(),
  })

  if (v.plazasSinInventario.length) {
    return responder(origen, 409, {
      error: 'Falta el inventario de alguna plaza: el stock global no está completo y no se puede dar de baja nada.',
      plazasSinInventario: v.plazasSinInventario,
      rechazados: v.resultados.map(r => ({ codigo: r.codigo, motivos: r.motivos })),
    })
  }

  const aceptados = v.resultados.filter(r => r.ok)
  const rechazados = v.resultados.filter(r => !r.ok).map(r => ({ codigo: r.codigo, motivos: r.motivos }))

  const guardados = []
  if (aceptados.length) {
    const quien = quienEs(sesion)
    const mios = await leerJson(claveAjustes(quien))
    const ahora = new Date().toISOString()
    const nota = texto(cuerpo?.nota, 500)
      || `Sin existencia y sin venta en más de ${v.dias} días`
    for (const r of aceptados) {
      const clave = `ocultar|${r.codigo}`
      mios[clave] = {
        clave, tipo: 'ocultar', codigo: r.codigo, motivo: MOTIVO_BAJA_DEFINITIVA,
        producto: texto(r.producto, 120), nota, cuando: ahora,
      }
      guardados.push({ ...mios[clave], quien })
    }
    if (Object.keys(mios).length > 5000) {
      return responder(origen, 413, { error: 'Demasiados ajustes guardados.' })
    }
    await s3.send(new PutObjectCommand({
      Bucket:       BUCKET,
      Key:          claveAjustes(quien),
      Body:         Buffer.from(JSON.stringify(mios)),
      ContentType:  'application/json; charset=utf-8',
      CacheControl: 'no-cache',
    }))
  }

  return responder(origen, 200, { ok: true, dias: v.dias, aceptados: guardados, rechazados })
}

// ── Surtidos ───────────────────────────────────────────────────────────────
//
// El registro de lo que sale de bodega a cada tienda. Un folio guarda las
// lineas que salieron Y la existencia que habia en el destino en ese momento:
// ese «antes» es lo unico contra lo que se puede comparar despues, y solo
// existe mientras todavia es antes. Los respaldos por fecha se quitaron a
// proposito -44 MB al año- y solo queda un paso atras.
//
// Comprobar no le cuesta trabajo a nadie: el conteo es el ALTA que la tienda
// hace en su propio Eleventa y que aparece en el respaldo siguiente. Las
// cuentas las hace `src/lib/surtidos.js`; aqui solo se guarda y se lee.
//
// Van bajo `surtidos/`, que la politica del bucket NO abre al publico: dicen
// quien mando que a donde. Cada quien escribe SOLO su archivo, igual que las
// revisiones y los ajustes.

const claveSurtidos = quien => `surtidos/${quien}.json`

/**
 * Quien puede registrar una salida de bodega.
 *
 * Va por CAPACIDAD y no atado a `admin` a proposito: el usuario del encargado
 * de bodega esta pendiente, y cuando exista basta con que `quienEs` devuelva
 * `bodega` para que lo herede sin tocar ninguna ruta.
 */
const PUEDE_SURTIR = new Set(['admin', 'bodega'])
const puedeSurtir = sesion => PUEDE_SURTIR.has(quienEs(sesion))

/** Todos los folios. Cualquier sesion los lee: la tienda ve lo que le llega. */
async function rutaSurtidos(evento, origen) {
  const sesion = sesionDe(evento)
  if (!sesion) return responder(origen, 403, { error: 'Requiere sesion.' })

  const archivos = await Promise.all(
    QUIENES_ESCRIBEN.map(async q => [q, await leerJson(claveSurtidos(q))]))

  const surtidos = []
  for (const [quien, datos] of archivos) {
    for (const f of Object.values(datos)) {
      // Una tienda ve solo lo suyo; quien surte lo ve todo. Lo que una plaza
      // le mando a otra no es asunto suyo.
      if (!puedeSurtir(sesion) && f.destino !== sesion.sucursal) continue
      surtidos.push({ ...f, quien: f.quien ?? quien })
    }
  }
  return responder(origen, 200, { surtidos })
}

/**
 * Registra una salida, o cierra un folio ya registrado.
 *
 * Mandar `cerrado: true` sobre un folio existente lo da por visto; es la unica
 * parte que decide una persona, porque mirar una diferencia y resolver que se
 * hace con ella no lo puede hacer un respaldo.
 */
async function rutaGuardarSurtido(evento, origen, cuerpo) {
  const sesion = sesionDe(evento)
  if (!sesion) return responder(origen, 403, { error: 'Requiere sesion.' })
  if (!puedeSurtir(sesion)) return responder(origen, 403, { error: 'Solo bodega registra surtidos.' })

  const quien = quienEs(sesion)
  const folio = String(cuerpo?.folio ?? '').trim().slice(0, 80)
  if (!folio) return responder(origen, 400, { error: 'Falta el folio.' })

  const mios = await leerJson(claveSurtidos(quien))

  // Cerrar un folio NO reescribe sus lineas ni su «antes». Un folio editable
  // despues del alta no comprobaria nada: se podria ajustar hasta que cuadre.
  if (cuerpo?.cerrado) {
    if (!mios[folio]) return responder(origen, 404, { error: 'Ese folio no existe.' })
    mios[folio] = { ...mios[folio], cerrado: new Date().toISOString(), cerradoPor: quien }
  } else {
    const destino = String(cuerpo?.destino ?? '').trim()
    if (!SUCURSALES[destino]) return responder(origen, 400, { error: 'Destino desconocido.' })
    if (mios[folio]) return responder(origen, 409, { error: 'Ese folio ya esta registrado.' })

    const lineas = (Array.isArray(cuerpo?.lineas) ? cuerpo.lineas : [])
      .map(l => ({
        codigo:   String(l?.codigo ?? '').trim().toUpperCase().slice(0, 60),
        producto: String(l?.producto ?? '').slice(0, 120),
        piezas:   Math.max(0, Math.floor(Number(l?.piezas) || 0)),
      }))
      .filter(l => l.codigo && l.piezas > 0)
    if (!lineas.length) return responder(origen, 400, { error: 'Un surtido sin piezas no es un surtido.' })
    if (lineas.length > 2000) return responder(origen, 413, { error: 'Demasiadas lineas en un folio.' })

    // El «antes» llega calculado del cliente, que es quien tiene el inventario
    // del destino a la vista. Se guarda SOLO para los codigos que van en la
    // caja: un inventario entero por folio seria el error de los 44 MB otra
    // vez, y aqui no se puede borrar luego sin perder la comprobacion.
    const antes = {}
    for (const l of lineas) {
      antes[l.codigo] = Math.max(0, Math.floor(Number(cuerpo?.antes?.[l.codigo]) || 0))
    }

    mios[folio] = {
      folio, destino, lineas, antes,
      cuando:  new Date().toISOString(),
      cerrado: null,
    }
  }

  if (Object.keys(mios).length > 3000) {
    return responder(origen, 413, { error: 'Demasiados surtidos guardados.' })
  }

  await s3.send(new PutObjectCommand({
    Bucket:       BUCKET,
    Key:          claveSurtidos(quien),
    Body:         Buffer.from(JSON.stringify(mios)),
    ContentType:  'application/json; charset=utf-8',
    CacheControl: 'no-cache',
  }))
  return responder(origen, 200, { ok: true, folio, por: quien })
}

// ── Venta linea por linea ──────────────────────────────────────────────────
//
// Lo que saca `scripts/extraer-ventas-linea.js` de los tickets de Eleventa:
// el dia y la hora de cada venta, que precio se cobro -publico o mayoreo-, la
// ganancia que calculo la caja, quien cobro y a que mayorista se le apunto.
//
// Vive en `ventas/`, que la politica del bucket NO abre al publico, por la
// misma razon que `personal/`: lleva NOMBRES. Los de los mayoristas -dados de
// alta con su nombre y su local, al estilo «NOMBRE PLAZA (1234)»- y el de
// quien cobro cada ticket. Esa es la lista de clientes del negocio y no puede
// quedar en una URL publica.
//
// Por lo mismo, los nombres de verdad no se escriben en el repositorio: aqui
// y en las pruebas van ejemplos inventados, que ensenan la forma igual.

const claveVentas = plaza => `ventas/${plaza}.json`

/**
 * La venta de una plaza. Solo administrador.
 *
 * Una sucursal NO la lee, ni la suya: la lista de mayoristas con cuanto compra
 * cada uno es informacion del dueño, no del mostrador.
 */
async function rutaVentas(evento, origen) {
  const sesion = sesionDe(evento)
  if (!sesion?.admin) return responder(origen, 403, { error: 'Requiere administrador.' })

  const plaza = String(evento.queryStringParameters?.plaza ?? '').trim()
  // Bodega y ferias tambien tienen caja, asi que valen ademas de las tiendas.
  if (!SUCURSALES[plaza] && plaza !== 'bodega' && plaza !== 'ferias') {
    return responder(origen, 400, { error: 'Plaza desconocida.' })
  }

  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: claveVentas(plaza) }))
    return responder(origen, 200, JSON.parse(await r.Body.transformToString()))
  } catch {
    // Que una plaza no tenga archivo todavia no es un error del servidor: es
    // que no se ha extraido. Se dice, para que la pantalla no lo lea como un
    // cero -«no vendio nada»- que es lo contrario.
    return responder(origen, 404, { error: 'Esa plaza no tiene venta extraida todavia.' })
  }
}

// ── Flujo de efectivo ──────────────────────────────────────────────────────
//
// SOLO ADMINISTRADOR, todas las rutas. Lo decidió el dueño: «solo admin tiene
// acceso, ellos hacen todo directo en eleventa». Las plazas registran sus
// entradas y salidas en el punto de venta y de ahí las lee el extractor; nadie
// más entra aquí.
//
// Va bajo `caja/`, que la política del bucket NO abre al público, igual que
// `personal/` y `revisiones/`. Y por una razón más fuerte que las otras dos:
// los faltantes al cerrar turno llevan el nombre de quien cerró pegado a una
// cantidad de dinero que falta. Eso no puede quedar accesible por URL.
//
// Tres clases de archivo, y se distinguen a propósito:
//   caja/<slug>.json          lo que publica el extractor. NO se escribe aquí.
//   caja/depositos.json       los bloques semanales marcados como depositados
//   caja/ajustes.json         las correcciones, con su valor calculado al lado
//   caja/parametros.json      los parámetros por sucursal
//
// Los parámetros NO van en `config/`, aunque sean configuración: la política
// del bucket abre `config/*` a lectura pública, y aquí dentro hay el NÚMERO DE
// CUENTA BANCARIA destino y el nombre del responsable del depósito. Eso no
// puede quedar accesible por URL.
//
// Los tres últimos los escribe una sola persona —el administrador— así que no
// hacen falta archivos por autor como en `revisiones/`: ahí el problema era
// que León y bodega contestaban a la vez.

const PLAZAS_CAJA = new Set(['leon', 'san-luis', 'aguascalientes', 'torreon', 'ferias'])

const MOTIVOS_CAJA = new Set([
  'error-de-captura', 'gasto-no-registrado', 'devolucion', 'faltante', 'otro',
])

// `faltante` está aquí para poder CAPTURARLO, no para que reste: `caja.js`
// lo deja fuera del efectivo neto a propósito (ver `NO_RESTAN`).
const TIPOS_MOV = new Set(['gasto', 'retiro', 'adelanto', 'proveedor', 'otra-salida', 'entrada', 'faltante'])

/** Los campos de un día que se pueden corregir a mano. */
const CAMPOS_AJUSTABLES = new Set([
  'efectivoCobrado', 'tarjeta', 'transferencia', 'otrasNoEfectivo', 'devoluciones',
  'gastos', 'retiros', 'adelantos', 'proveedores', 'otrasSalidas', 'entradas', 'arqueo',
  'faltantes',
])

const monto = v => {
  // El texto vacío se rechaza ANTES de llegar a `Number`, que lo convierte en
  // cero: un campo que alguien dejó en blanco se habría guardado como un
  // depósito de $0.00, y en pantalla eso no se distingue de haber depositado
  // nada de verdad.
  if (v === null || v === undefined) return null
  if (typeof v === 'string' && v.trim() === '') return null

  // Un monto que no es número se rechaza en vez de guardarse como NaN: un NaN
  // en el JSON envenena todas las sumas de la pantalla y no se ve de dónde
  // vino. Y nada de negativos: una salida se expresa por su tipo, no por el
  // signo, o restar dos veces sería un descuido de una tecla.
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

/**
 * Todo lo que necesita la pestaña: el flujo de las cinco plazas, los depósitos
 * marcados, los ajustes y los parámetros, en una sola respuesta.
 *
 * En una sola a propósito: son nueve archivos y pedirlos de uno en uno desde
 * el navegador dejaba la pantalla pintándose a trozos, con los semáforos
 * cambiando de color a medida que llegaban. Un semáforo que pasa de verde a
 * rojo solo no se lee como «ya cargó»: se lee como un fallo.
 */
async function rutaCaja(evento, origen) {
  const sesion = sesionDe(evento)
  if (!sesion?.admin) return responder(origen, 403, { error: 'Requiere administrador.' })

  const plazas = [...PLAZAS_CAJA]
  const flujos = await Promise.all(plazas.map(async p => [p, await leerJson(`caja/${p}.json`)]))

  const [depositos, ajustes, parametros, movimientos] = await Promise.all([
    leerJson('caja/depositos.json'),
    leerJson('caja/ajustes.json'),
    leerJson('caja/parametros.json'),
    leerJson('caja/movimientos.json'),
  ])

  return responder(origen, 200, {
    flujos: Object.fromEntries(flujos),
    depositos, ajustes, parametros, movimientos,
  })
}

/**
 * Marca un bloque semanal como depositado, o le quita la marca.
 *
 * La clave es el LUNES de la semana que cubre, que es como se identifica un
 * bloque en toda la pantalla. Mandar `monto: null` quita la marca y el bloque
 * vuelve a acumular, que es como se deshace un depósito apuntado por error.
 */
async function rutaGuardarDeposito(evento, origen, cuerpo) {
  const sesion = sesionDe(evento)
  if (!sesion?.admin) return responder(origen, 403, { error: 'Requiere administrador.' })

  const plaza = String(cuerpo?.sucursal ?? '')
  if (!PLAZAS_CAJA.has(plaza)) return responder(origen, 400, { error: 'Sucursal desconocida.' })

  const semana = String(cuerpo?.semana ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semana)) {
    return responder(origen, 400, { error: 'La semana se identifica por su lunes, en formato YYYY-MM-DD.' })
  }

  const todos = await leerJson('caja/depositos.json')
  const dePlaza = { ...(todos[plaza] ?? {}) }

  if (cuerpo?.monto == null) {
    delete dePlaza[semana]
  } else {
    const m = monto(cuerpo.monto)
    if (m === null) return responder(origen, 400, { error: 'El monto no es un número válido.' })
    dePlaza[semana] = {
      semana, monto: m,
      fecha:       String(cuerpo.fecha ?? '').slice(0, 10),
      hora:        String(cuerpo.hora ?? '').slice(0, 5),
      folio:       String(cuerpo.folio ?? '').slice(0, 60),
      comprobante: !!cuerpo.comprobante,
      deposito:    String(cuerpo.deposito ?? '').slice(0, 80),   // quién depositó
      nota:        String(cuerpo.nota ?? '').slice(0, 500),
      marcadoPor:  'admin',
      marcadoEn:   new Date().toISOString(),
    }
  }

  const nuevo = { ...todos, [plaza]: dePlaza }
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: 'caja/depositos.json',
    Body: Buffer.from(JSON.stringify(nuevo)),
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-cache',
  }))
  return responder(origen, 200, { ok: true, semana, plaza })
}

/**
 * Guarda una corrección de un día, o la deshace.
 *
 * **El valor calculado NO se toca.** Se guarda qué campo se corrigió y a qué,
 * y la página aplica el ajuste al leer. Es la misma regla que `ajustes/` sigue
 * con el inventario, y por el mismo motivo: `caja/<slug>.json` se regenera del
 * respaldo varias veces al día, así que una corrección escrita encima se
 * borraría sola esa misma tarde.
 *
 * Y todo ajuste lleva motivo. Sin él no se guarda: una cifra corregida sin
 * explicación es indistinguible de un error de captura, que es justo una de
 * las cosas que esto sirve para corregir.
 */
async function rutaGuardarAjusteCaja(evento, origen, cuerpo) {
  const sesion = sesionDe(evento)
  if (!sesion?.admin) return responder(origen, 403, { error: 'Requiere administrador.' })

  const plaza = String(cuerpo?.sucursal ?? '')
  if (!PLAZAS_CAJA.has(plaza)) return responder(origen, 400, { error: 'Sucursal desconocida.' })

  const f = String(cuerpo?.fecha ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return responder(origen, 400, { error: 'Falta el día.' })

  const todos = await leerJson('caja/ajustes.json')
  const dePlaza = { ...(todos[plaza] ?? {}) }

  if (cuerpo?.motivo == null) {
    delete dePlaza[f]
  } else {
    const motivo = String(cuerpo.motivo)
    if (!MOTIVOS_CAJA.has(motivo)) return responder(origen, 400, { error: 'Motivo desconocido.' })

    const valores = {}
    for (const [k, v] of Object.entries(cuerpo?.valores ?? {})) {
      if (!CAMPOS_AJUSTABLES.has(k)) continue
      const m = monto(v)
      if (m === null) return responder(origen, 400, { error: `El valor de «${k}» no es un número válido.` })
      valores[k] = m
    }
    if (!Object.keys(valores).length) {
      return responder(origen, 400, { error: 'Un ajuste sin ningún valor no es un ajuste.' })
    }

    dePlaza[f] = {
      fecha: f, valores, motivo,
      nota:  String(cuerpo.nota ?? '').slice(0, 500),
      quien: 'admin',
      cuando: new Date().toISOString(),
    }
  }

  const nuevo = { ...todos, [plaza]: dePlaza }
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: 'caja/ajustes.json',
    Body: Buffer.from(JSON.stringify(nuevo)),
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-cache',
  }))
  return responder(origen, 200, { ok: true, fecha: f, plaza })
}

/**
 * Deja los parámetros de una sucursal en su forma guardable.
 *
 * Se exporta para poder probarla: la ruta escribe en S3 antes de responder, así
 * que desde fuera no hay forma de ver qué se guardó. Y lo que hace aquí es una
 * regla de negocio, no un detalle de la ruta: **un número vacío se guarda como
 * `null`, NO como cero.** Es la misma regla que los precios —un cero es «sin
 * capturar» y no «gratis»— y aquí tiene dientes: un fondo fijo de cero se
 * compararía contra el límite y daría un semáforo verde sin que nadie hubiera
 * configurado nada.
 */
export function limpiarParametros(p = {}) {
  const numeroOnulo = v => {
    if (v === null || v === undefined || v === '') return null
    if (typeof v === 'string' && v.trim() === '') return null
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
  }
  const dia = v => {
    const n = Number(v)
    return Number.isInteger(n) && n >= 1 && n <= 7 ? n : null
  }
  const hora = v => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v ?? '')) ? String(v) : '')
  const fechaOnula = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null)

  return {
    diaDeposito:    dia(p.diaDeposito),
    periodoCubre:   p.periodoCubre === 'semana-en-curso' ? 'semana-en-curso' : 'semana-anterior',
    fondoFijo:      numeroOnulo(p.fondoFijo),
    limiteEfectivo: numeroOnulo(p.limiteEfectivo),
    cuenta:         String(p.cuenta ?? '').slice(0, 60),
    responsable:    String(p.responsable ?? '').slice(0, 80),
    tolerancia:     numeroOnulo(p.tolerancia),
    horaLimite:     hora(p.horaLimite),
    gastoMaxSinComprobante: numeroOnulo(p.gastoMaxSinComprobante),
    desdeControlSalidas:    fechaOnula(p.desdeControlSalidas),
  }
}

/**
 * `POST /caja/fondo`: el fondo de caja de UNA plaza, y nada más.
 *
 * Lo pidió el dueño el 2026-11-09: «cada sucursal puede tener diferente; que
 * lo pueda asignar el administrador en su propio panel». Toca sólo el fondo:
 * la ruta de parámetros reescribe el bloque entero de la plaza, y mandarla
 * desde el corte —que no tiene la cuenta ni el responsable— los borraría.
 */
async function rutaGuardarFondo(evento, origen, cuerpo) {
  const sesion = sesionDe(evento)
  if (!sesion?.admin) return responder(origen, 403, { error: 'Sólo el administrador asigna el fondo de caja.' })

  const plaza = String(cuerpo?.sucursal ?? '')
  if (!PLAZAS_CAJA.has(plaza)) return responder(origen, 400, { error: 'Sucursal desconocida.' })

  // Vacío es «sin capturar» y se guarda null, nunca cero (`limpiarParametros`).
  const v = cuerpo?.fondoFijo
  const vacio = v === null || v === undefined || String(v).trim() === ''
  if (!vacio && !(Number.isFinite(Number(v)) && Number(v) >= 0)) {
    return responder(origen, 400, { error: 'El fondo tiene que ser un número de cero en adelante.' })
  }

  const todos = await leerJson('caja/parametros.json')
  const limpios = limpiarParametros({ ...(todos[plaza] ?? {}), fondoFijo: vacio ? null : v })
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: 'caja/parametros.json',
    Body: Buffer.from(JSON.stringify({ ...todos, [plaza]: limpios })),
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-cache',
  }))
  return responder(origen, 200, { ok: true, plaza, fondoFijo: limpios.fondoFijo })
}

/** Los parámetros por sucursal. Solo administrador. */
async function rutaGuardarParametros(evento, origen, cuerpo) {
  const sesion = sesionDe(evento)
  if (!sesion?.admin) return responder(origen, 403, { error: 'Requiere administrador.' })

  const plaza = String(cuerpo?.sucursal ?? '')
  if (!PLAZAS_CAJA.has(plaza)) return responder(origen, 400, { error: 'Sucursal desconocida.' })

  const p = cuerpo?.parametros
  if (!p || typeof p !== 'object') return responder(origen, 400, { error: 'Parámetros inválidos.' })

  const limpios = limpiarParametros(p)

  const todos = await leerJson('caja/parametros.json')
  const nuevo = { ...todos, [plaza]: limpios }

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: 'caja/parametros.json',
    Body: Buffer.from(JSON.stringify(nuevo)),
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-cache',
  }))
  return responder(origen, 200, { ok: true, plaza, parametros: limpios })
}

/**
 * Captura un movimiento de caja a mano, o lo borra.
 *
 * Es la vía de escape, no el camino normal: desde el 2026-11-05 las plazas
 * registran sus entradas y salidas en Eleventa y de ahí las trae el extractor.
 * Esto queda para lo que se olvidó anotar ahí, y por eso cada movimiento lleva
 * `origen: 'pagina'`: en la pantalla se distingue de lo que vino del punto de
 * venta, porque uno lo teclea quien cobra y el otro quien revisa.
 */
async function rutaGuardarMovimiento(evento, origen, cuerpo) {
  const sesion = sesionDe(evento)
  if (!sesion?.admin) return responder(origen, 403, { error: 'Requiere administrador.' })

  const plaza = String(cuerpo?.sucursal ?? '')
  if (!PLAZAS_CAJA.has(plaza)) return responder(origen, 400, { error: 'Sucursal desconocida.' })

  const id = String(cuerpo?.id ?? '').slice(0, 80)
  if (!id) return responder(origen, 400, { error: 'Falta el identificador del movimiento.' })

  const todos = await leerJson('caja/movimientos.json')
  const dePlaza = { ...(todos[plaza] ?? {}) }

  if (cuerpo?.borrar) {
    delete dePlaza[id]
  } else {
    const f = String(cuerpo?.fecha ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return responder(origen, 400, { error: 'Falta el día.' })

    const tipo = String(cuerpo?.tipo ?? '')
    if (!TIPOS_MOV.has(tipo)) return responder(origen, 400, { error: 'Tipo de movimiento desconocido.' })

    const m = monto(cuerpo?.monto)
    if (m === null || m === 0) return responder(origen, 400, { error: 'Un movimiento sin monto no es un movimiento.' })

    const concepto = String(cuerpo?.concepto ?? '').trim().slice(0, 160)
    if (!concepto) return responder(origen, 400, { error: 'Todo movimiento lleva concepto.' })

    dePlaza[id] = {
      id, f, tipo, monto: m, concepto,
      comprobante: !!cuerpo.comprobante,
      origen: 'pagina',
      quien: 'admin',
      cuando: new Date().toISOString(),
    }
  }

  if (Object.keys(dePlaza).length > 10000) {
    return responder(origen, 413, { error: 'Demasiados movimientos guardados.' })
  }

  const nuevo = { ...todos, [plaza]: dePlaza }
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: 'caja/movimientos.json',
    Body: Buffer.from(JSON.stringify(nuevo)),
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-cache',
  }))
  return responder(origen, 200, { ok: true, id, plaza })
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

// ── El corte semanal de cada sucursal ─────────────────────────────────────
//
// La tienda ve las ventas de su semana, tal como salen del punto de venta, y
// captura UNA cosa: el conteo de billetes y monedas. Todo lo demás —ventas,
// tarjeta, gastos, sueldo— sale del POS y no lo teclea nadie. Lo decidió el
// dueño el 2026-11-09.
//
// Qué puede ver cada quien lo decide `puedeSucursal`: una tienda, SÓLO su
// plaza; el administrador, cualquiera y «todas». Lo de `caja/` y `ventas/` es
// privado y se entrega recortado —sin los nombres de quien cerró turno ni de
// quien cobró, y sin lo de otras plazas—: ver `src/cortes.js`.
//
// Lo guardado va bajo `cortes/`, privado también, un archivo por plaza.

const claveCortes = plaza => `cortes/${plaza}.json`

/** Todo lo que el corte de una plaza necesita, ya recortado para una tienda. */
async function datosDeCorte(plaza, params, hoy, esAdmin = false) {
  const [caja, ventas, conteos] = await Promise.all([
    leerJson(`caja/${plaza}.json`),
    leerJson(claveVentas(plaza)),
    leerJson(claveCortes(plaza)),
  ])
  const nombre = SUCURSALES[plaza]?.nombre ?? plaza
  return {
    plaza, nombre,
    caja: {
      // `leerJson` devuelve `{}` cuando la clave no existe, y `{}` no es
      // «ninguna venta»: es «no se ha extraído». Se dice aparte para que la
      // pantalla no pinte una semana en ceros.
      hayDatos: Array.isArray(caja?.dias) && caja.dias.length > 0,
      respaldo: caja?.respaldo ?? null,
      dias: diasParaTienda(caja, hoy),
      movimientos: movimientosParaTienda(caja, hoy),
    },
    parametros: parametrosParaTienda(params?.[plaza]),
    ventas: ventasParaTienda(ventas, { conCajero: esAdmin }),
    conteos,
  }
}

/**
 * `GET /corte?plaza=<slug|todas>`. Una tienda recibe sólo la suya.
 *
 * Sin `plaza`, una tienda recibe la suya y el administrador recibe todas.
 */
async function rutaCorte(evento, origen) {
  const sesion = sesionDe(evento)
  if (!sesion) return responder(origen, 403, { error: 'Requiere sesión.' })

  const pedida = String(evento.queryStringParameters?.plaza ?? '').trim()
  const plaza = pedida || (sesion.admin ? 'todas' : String(sesion.sucursal ?? ''))

  let plazas
  if (plaza === 'todas') {
    // Ver todas las plazas es del administrador, y de nadie más.
    if (!sesion.admin) return responder(origen, 403, { error: 'Sólo el administrador ve todas las plazas.' })
    plazas = PLAZAS_CORTE
  } else {
    if (!PLAZAS_CORTE.includes(plaza)) return responder(origen, 400, { error: 'Esa plaza no lleva corte.' })
    if (!puedeSucursal(sesion, plaza)) return responder(origen, 403, { error: 'Sólo puedes ver tu plaza.' })
    plazas = [plaza]
  }

  const params = await leerJson('caja/parametros.json')
  const hoy = hoyMexico()
  const datos = await Promise.all(plazas.map(p => datosDeCorte(p, params, hoy, !!sesion.admin)))
  return responder(origen, 200, {
    hoy,
    plazas: Object.fromEntries(datos.map(d => [d.plaza, d])),
  })
}

/**
 * `POST /corte/conteo`: lo único que captura la tienda.
 *
 * Una tienda guarda SÓLO el de su plaza; el administrador, el de cualquiera. El
 * total lo calcula este lado, y el autor y la hora también: lo que mande el
 * navegador no cuenta. Cada cambio deja un renglón en el historial.
 */
async function rutaGuardarConteo(evento, origen, cuerpo) {
  const sesion = sesionDe(evento)
  if (!sesion) return responder(origen, 403, { error: 'Requiere sesión.' })

  const plaza = String(cuerpo?.plaza ?? '').trim()
  if (!PLAZAS_CORTE.includes(plaza)) return responder(origen, 400, { error: 'Esa plaza no lleva corte.' })
  if (!puedeSucursal(sesion, plaza)) return responder(origen, 403, { error: 'Sólo puedes guardar el corte de tu plaza.' })

  const semana = String(cuerpo?.semana ?? '')
  if (!esLunes(semana)) {
    return responder(origen, 400, { error: 'La semana se identifica por su lunes, en formato AAAA-MM-DD.' })
  }
  if (semana < lunesDe(INICIO_DEL_CORTE)) {
    return responder(origen, 400, { error: 'El corte arranca el 2 de noviembre de 2026: antes no hay nada que contar.' })
  }
  // Una semana que todavía no empieza no se puede haber contado.
  if (semana > lunesDe(hoyMexico())) {
    return responder(origen, 400, { error: 'Esa semana todavía no empieza.' })
  }

  const v = validarConteo(cuerpo?.cantidades)
  if (v.error) return responder(origen, 400, { error: v.error })

  const todos = await leerJson(claveCortes(plaza))
  const registro = registroDeConteo({
    previo: todos[semana] ?? null, semana,
    cantidades: v.cantidades, total: v.total,
    observaciones: cuerpo?.observaciones, quien: quienEs(sesion),
  })
  const nuevo = { ...todos, [semana]: registro }

  if (registro !== todos[semana]) {
    await s3.send(new PutObjectCommand({
      Bucket:       BUCKET,
      Key:          claveCortes(plaza),
      Body:         Buffer.from(JSON.stringify(nuevo)),
      ContentType:  'application/json; charset=utf-8',
      CacheControl: 'no-cache',
    }))
  }
  return responder(origen, 200, { ok: true, registro })
}

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
    if (metodo === 'GET'  && ruta === '/ventas')     return await rutaVentas(evento, origen)
    if (metodo === 'GET'  && ruta === '/revisiones') return await rutaRevisiones(evento, origen)
    if (metodo === 'POST' && ruta === '/revisiones') return await rutaGuardarRevision(evento, origen, cuerpo)
    if (metodo === 'GET'  && ruta === '/ajustes')    return await rutaAjustes(evento, origen)
    if (metodo === 'POST' && ruta === '/ajustes')    return await rutaGuardarAjuste(evento, origen, cuerpo)
    if (metodo === 'POST' && ruta === '/ajustes/bajas') return await rutaGuardarBajas(evento, origen, cuerpo)
    if (metodo === 'GET'  && ruta === '/surtidos')   return await rutaSurtidos(evento, origen)
    if (metodo === 'POST' && ruta === '/surtidos')   return await rutaGuardarSurtido(evento, origen, cuerpo)
    if (metodo === 'GET'  && ruta === '/corte')           return await rutaCorte(evento, origen)
    if (metodo === 'POST' && ruta === '/corte/conteo')    return await rutaGuardarConteo(evento, origen, cuerpo)
    if (metodo === 'GET'  && ruta === '/caja')            return await rutaCaja(evento, origen)
    if (metodo === 'POST' && ruta === '/caja/deposito')   return await rutaGuardarDeposito(evento, origen, cuerpo)
    if (metodo === 'POST' && ruta === '/caja/ajuste')     return await rutaGuardarAjusteCaja(evento, origen, cuerpo)
    if (metodo === 'POST' && ruta === '/caja/parametros') return await rutaGuardarParametros(evento, origen, cuerpo)
    if (metodo === 'POST' && ruta === '/caja/fondo')      return await rutaGuardarFondo(evento, origen, cuerpo)
    if (metodo === 'POST' && ruta === '/caja/movimiento') return await rutaGuardarMovimiento(evento, origen, cuerpo)
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
