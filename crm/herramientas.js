// Lo que el bot puede CONSULTAR. Todo lo que contesta sale de aquí.
//
// ── La regla de ingeniería de este archivo ──────────────────────────────────
//
// Este módulo no reimplementa nada. Importa `filtrarYBuscar`, `fotoPara`,
// `esProtector` y `SUCURSALES` de `src/lib/`, que ya están probados y llevan
// sus propias cicatrices. Si el bot tuviera su propia copia de la búsqueda, en
// tres meses el chat y la página dirían cosas distintas del mismo código, y la
// del chat es la que ve el cliente.
//
// Lo que sí vive aquí son las reglas que solo aplican al chat:
//
//   - La plaza es obligatoria. Sin plaza no se devuelve ningún número, tampoco
//     un cero: un cero diría «no hay» cuando lo que pasa es que no se sabe
//     dónde mirar. Es la misma razón por la que la portada no enseña «Todas».
//   - Nunca se suma entre plazas. Se desglosa. Sumar las tres manda a alguien
//     a su tienda por once piezas que están repartidas.
//   - Existencia 0 no es «no encontrado». Son dos respuestas distintas y la
//     diferencia le importa al cliente: una dice «no lo manejo», la otra dice
//     «lo manejo y se acabó».

import { filtrarYBuscar, normalizar } from '../src/lib/buscar.js'
import { indexarMockups, fotoPara, familiaDe } from '../src/lib/mockups.js'
import { esProtector } from '../src/lib/familias.js'
import { nombreSucursal, telefonoWhatsApp } from '../src/lib/sucursales.js'
import { armarMensaje, enlaceWhatsApp } from '../src/lib/whatsapp.js'
import { cargar, PLAZAS_PUBLICAS, esPlazaPublica } from './inventario.js'
import { precioDe, precioCombo, tipoDe, TIPOS, DESCUENTO_COMBO, esMica } from './precio.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))

/**
 * De dónde se sirven las fotos. Tienen que ser URLs públicas: WhatsApp las
 * descarga él mismo, no se le pueden mandar bytes de un disco.
 *
 * El valor por omisión fue durante dos semanas un dominio de Amplify que NO
 * responde. Nadie lo notó porque nada fallaba: el bot mandaba la foto con su
 * pie, y en la ventana de prueba la burbuja salía con el pie y sin imagen,
 * que se lee como «la imagen tarda». En WhatsApp habría sido un enlace muerto
 * en cada foto. Comprobado el 2026-11-12: `istuffsbajio.com/mockups/` sirve el
 * índice y las imágenes con su tipo; el de Amplify no contesta.
 *
 * En producción se fija con `CRM_SITIO` (ver la lista de variables del
 * LEEME), y `npm run crm:evaluar` comprueba que la foto que manda el bot se
 * pueda bajar de verdad.
 */
export const SITIO = (process.env.CRM_SITIO || 'https://istuffsbajio.com')
  .replace(/\/+$/, '')

/** Cuántos renglones se le devuelven al modelo como máximo. */
const TOPE = 8

// ── Índice de fotos ─────────────────────────────────────────────────────────

let indice = null

/** El índice de mockups. Se lee del disco en local y del sitio en la nube. */
export async function indiceFotos() {
  if (indice) return indice
  const local = path.join(AQUI, '..', 'public', 'mockups', 'indice.json')
  let datos
  if (fs.existsSync(local)) {
    datos = JSON.parse(fs.readFileSync(local, 'utf8'))
  } else {
    const res = await fetch(`${SITIO}/mockups/indice.json`)
    if (!res.ok) throw new Error(`No se pudo leer el índice de fotos (${res.status})`)
    datos = await res.json()
  }
  indice = indexarMockups(datos.mockups ?? datos)
  return indice
}

/** La foto de un producto, con la advertencia pegada cuando es prestada. */
export async function fotoDe(producto) {
  const idx = await indiceFotos()
  const f = fotoPara({ codigo: producto.codigo ?? producto.Codigo, nombre: producto.nombre ?? producto.Producto }, idx)
  if (!f) return null
  // El pie va con el nombre de CLIENTE, no con el del catálogo. El de
  // catálogo dice «SAMSUNG S25 ULTRA TPU CASE», y eso aparecía debajo de la
  // foto que le llega a alguien que vio un anuncio.
  const codigo = producto.codigo ?? producto.Codigo
  const bruto  = producto.nombre ?? producto.Producto
  return {
    url: `${SITIO}/mockups/${f.archivo}`,
    // `exacta: false` significa que la foto es de otro teléfono de la misma
    // gama. Se dice SIEMPRE. Enseñarla callando es enseñar con toda seguridad
    // una funda que no es, y por WhatsApp el cliente la reenvía.
    exacta: f.exacta,
    pie: f.exacta
      ? nombreParaCliente(codigo, bruto)
      // En la advertencia el modelo prestado va tal cual: lo que importa es
      // que se reconozca de qué teléfono es la foto, no que suene bonito.
      : `Foto de referencia: es del ${f.modelo}`,
  }
}

// ── Búsqueda ────────────────────────────────────────────────────────────────

/**
 * Un renglón para el modelo, con el precio ya puesto.
 *
 * El precio va aquí y no en una herramienta aparte porque el caso normal es
 * «¿tienes para mi A06 y a cuánto?»: una sola consulta en vez de dos, y de
 * paso el modelo no puede citar una existencia sin tener el precio delante.
 *
 * `precio` es null cuando el tipo no tiene lista confirmada. Null no es cero
 * ni es gratis: el bot dice `porQuePrecioNo` y pasa el cliente con la tienda.
 */
const unRenglon = (p, cliente) => {
  const pr = precioDe({ codigo: p.Codigo, nombre: p.Producto, cliente })
  return {
    codigo: p.Codigo,
    nombre: p.Producto,
    piezas: Number(p.Existencia) || 0,
    // `nombre` es el del catálogo y sirve para las herramientas; `comoSeDice`
    // es el que puede salir en el chat. El de catálogo lleva «CASE» y «3 IN
    // 1», que a quien vio un anuncio no le dicen nada.
    comoSeDice: nombreParaCliente(p.Codigo, p.Producto),
    familia: esProtector(p.Codigo, p.Producto) ? 'mica/hidrogel' : 'funda',
    tipo: pr.nombreTipo ?? null,
    precio: pr.decir ? pr.monto : null,
    porQuePrecioNo: pr.decir ? null : pr.porQueNo,
    // Modelo viejo que se está rematando. `antes` es el precio de lista de
    // verdad, así que decirlo no es inventarse una rebaja.
    ...(pr.remate && { remate: true, antes: pr.antes }),
  }
}

/** Las plazas que se le ofrecen al cliente cuando hay que preguntarle. */
const opciones = () =>
  [...PLAZAS_PUBLICAS].map(s => ({ slug: s, nombre: nombreSucursal(s) }))

/**
 * Cómo se le llama a cada tipo DELANTE DE UN CLIENTE.
 *
 * El catálogo está escrito para quien surte, no para quien compra: «SAMSUNG
 * S25 ULTRA TPU CASE» y «SAMSUNG S25 ULTRA 3 IN 1». A un mayorista eso le
 * dice todo; a alguien que vio un anuncio no le dice nada, y encima está
 * eligiendo entre $250 y $300 sin saber qué diferencia paga.
 *
 * 🔒 Las dos primeras son palabras del dueño: TPU es «goma flexible» y la
 * otra es «uso rudo», sin el «3 en 1». Las demás son neutras a propósito
 * —describir mal una funda se ve perfecto en pantalla y nadie lo revisa, que
 * es la misma razón por la que una foto prestada se declara—.
 */
const COMO_SE_LE_DICE = {
  'tpu':               'Funda de goma flexible',
  'uso-rudo':          'Funda de uso rudo',
  'hard':              'Funda rígida',
  'tpu-cristal':       'Funda transparente',
  'duo':               'Funda Duo',
  'mica-hd':           'Mica de hidrogel',
  'mica-mate':         'Mica mate',
  'mica-privacidad':   'Mica de privacidad',
  'mica-uso-rudo':     'Mica de uso rudo',
  'mica-tablet-hd':    'Mica de hidrogel para tablet',
  'mica-tablet-mate':  'Mica mate para tablet',
}

/** Lo que del nombre describe la FUNDA y no el teléfono. Se quita. */
const COLOR = /\b(NEGRO|BLANCO|AZUL|ROJO|ROSA|VERDE|MORADO|SALMON|AMARILLO|GRIS|LILA|MENTA|BEIGE|CAFE|NARANJA|DORADO|PLATA)\b/i

const PALABRAS_DE_CATALOGO =
  /\b(TPU|HARD|DUO|SMART|CASE2|CASE|3 ?EN ?1|3 ?IN ?1|CRISTAL|GLASS|MILITAR|TRANSPARENTE|FUNDA|PROTECTOR|USO RUDO|ARMOR|CLEAR|MICA|H[IO]DR[IO]{1,2}GEL)\b/gi

/**
 * El nombre del producto como se le dice a un cliente.
 *
 * «SAMSUNG S25 ULTRA TPU CASE» → «Funda de goma flexible para Samsung S25
 * Ultra». Si no se reconoce el tipo se devuelve el nombre tal cual, que es
 * feo pero nunca falso.
 */
export function nombreParaCliente(codigo, producto) {
  const tipo = tipoDe(codigo, producto)
  const como = COMO_SE_LE_DICE[tipo]
  if (!como) return producto

  // Una mica no lleva teléfono: son genéricas y se cortan a la medida. Lo que
  // queda de su nombre tras quitar las palabras de catálogo es basura —«HD
  // Alta», «Privacidad»— y pegarlo detrás de «para» inventa un modelo.
  if (esMica(tipo)) return como

  // El color es lo ÚNICO que distingue dos códigos del mismo teléfono y mismo
  // tipo, y quien compra pregunta por él. Antes se quedaba pegado al teléfono
  // —«para iPhone 11 Azul»— o, en las transparentes, se tiraba con la jerga.
  // «Funda» es femenino: morado → morada. Los que no cambian (azul, rosa, verde,
  // gris, lila, menta, beige, café, naranja, plata, salmón) se dejan como están.
  const FEMENINO = { NEGRO: 'negra', BLANCO: 'blanca', ROJO: 'roja', MORADO: 'morada', AMARILLO: 'amarilla', DORADO: 'dorada' }
  const crudo = String(producto ?? '').toUpperCase().match(COLOR)?.[1]
  const color = crudo ? (FEMENINO[crudo] ?? crudo.toLowerCase()) : null
  const transparente = /\bTRANSPARENTE\b/i.test(producto)
  const adjetivo = tipo === 'tpu-cristal' ? '' : (color ?? (transparente ? 'transparente' : ''))

  const telefono = String(producto ?? '')
    .replace(COLOR, ' ')
    .replace(/\bTRANSPARENTE\b/gi, ' ')
    .replace(PALABRAS_DE_CATALOGO, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    // Mayúsculas de catálogo a algo que se lee: SAMSUNG S25 ULTRA → Samsung
    // S25 Ultra. Lo que ya es número o sigla corta se deja en paz.
    .split(' ')
    .map(w => (w.length > 2 && /^[A-ZÁÉÍÓÚÑ]+$/.test(w) ? w[0] + w.slice(1).toLowerCase() : w))
    .join(' ')
    // La marca se escribe como la escribe la marca.
    .replace(/\bIphone\b/g, 'iPhone')

  const conAdjetivo = adjetivo ? `${como} ${adjetivo}` : como
  return telefono ? `${conAdjetivo} para ${telefono}` : conAdjetivo
}

/**
 * Texto extra por el que un producto también se puede encontrar.
 *
 * ── El fallo que arregla ──────────────────────────────────────────────────
 *
 * El catálogo escribe «hidrogel» de tres formas: HIDROGEL, **HIDRIOGEL** y
 * **HODROGEL**. Quien escribe «hidrogel» en el chat encontraba 4 de las 7
 * micas: se quedaban fuera la HDA —78 piezas entre las tres tiendas, la
 * segunda que más sale— y la HDT. Y la HDR, «MICA HD USO RUDO», no dice
 * hidrogel en ninguna parte.
 *
 * `familias.js` ya tolera las erratas para CLASIFICAR, pero `buscar.js` no
 * las tolera para BUSCAR, y ahí el cliente se queda sin respuesta.
 *
 * Se añade texto al pajar en vez de corregir el nombre: así «hidriogel» tal
 * como está escrito en el catálogo también sigue encontrando, y nadie tiene
 * que corregir Eleventa para que el chat funcione.
 */
/**
 * Marcas que el catálogo escribe de más de una forma.
 *
 * ── El fallo que arregla ──────────────────────────────────────────────────
 *
 * En León hay **189 productos Samsung: 171 escritos «SAMSUNG» y 18
 * «GALAXY»**. Quien escribía «galaxy a06» recibía «no manejamos para ese
 * modelo» teniendo siete piezas en el mostrador, y quien escribía «samsung
 * a07» lo mismo al revés. El bot le decía a un cliente con el dinero en la
 * mano que no vendemos lo que sí vendemos.
 *
 * Y Motorola es peor: **97 de 98 se escriben «MOTO»**, así que «motorola g54»
 * no encontraba nada. «apple 13» tampoco: los 157 son «IPHONE».
 *
 * Lo cazó una conversación de prueba con el modelo de verdad. Ninguna prueba
 * unitaria lo veía, porque todas buscaban con la palabra que el catálogo usa.
 *
 * La tabla no se inventa aquí: sale de la que `mockups.js` ya usa para
 * emparejar fotos (`familiaDe`), que es la misma pregunta —qué marca es esto—
 * resuelta una sola vez.
 */
const SINONIMOS_MARCA = {
  APPLE:    'APPLE IPHONE',
  SAMSUNG:  'SAMSUNG GALAXY',
  XIAOMI:   'XIAOMI REDMI POCO',
  MOTOROLA: 'MOTOROLA MOTO',
  HUAWEI:   'HUAWEI NOVA MATE PURA',
  GOOGLE:   'GOOGLE PIXEL',
  REALME:   'REALME OPPO',
  HONOR:    'HONOR',
  OPPO:     'OPPO',
  VIVO:     'VIVO',
  ZTE:      'ZTE',
}

function aliasDe(p) {
  const extra = []
  const n = String(p.Producto ?? '')
  const protector = esProtector(p.Codigo, n)

  // Las tres escrituras conviven; se normalizan a la buena.
  if (/h[io]dr[io]{1,2}gel/i.test(n)) extra.push('HIDROGEL')

  // La marca, en todas sus formas. **Sólo para fundas**: `familiaDe` da
  // HUAWEI para «MICA HIDROGEL MATE» —porque «MATE» es uno de sus modelos— y
  // sin esta guarda, buscar «huawei» devolvería micas.
  if (!protector) {
    const sinonimos = SINONIMOS_MARCA[familiaDe(n)]
    if (sinonimos) extra.push(sinonimos)
  }

  // Toda mica se encuentra por «mica» y por «protector de pantalla», aunque
  // su nombre no lleve ninguna de las dos palabras.
  if (protector) extra.push('MICA PROTECTOR PANTALLA HIDROGEL')

  // El tipo por el que la gente pregunta: «uso rudo», «3 en 1», «transparente».
  // MILITAR no va con uso rudo: los «MILITAR TPU CASE» son TPU y valen 250.
  const tipo = tipoDe(p.Codigo, n)
  if (tipo === 'uso-rudo') extra.push('USO RUDO 3 EN 1')
  // «Transparente» se busca por lo que el catálogo ya dice: de 544 TPU sólo 10 se
  // llaman TRANSPARENTE y 36 llevan color. Ponerle el alias a todas —lo que se
  // hizo primero— hacía que quien pedía una transparente recibiera una morada.
  // El tipo «cristal» sí es claro por definición.
  if (tipo === 'tpu-cristal') extra.push('TRANSPARENTE CLARA')

  return extra.join(' ')
}

/**
 * Busca un modelo en UNA plaza.
 *
 * `plaza` es obligatoria. Devuelve el corte pegado al resultado para que quien
 * escriba la respuesta no pueda olvidarse de decirlo.
 */
export async function buscarEnPlaza({ plaza, texto, cliente = 'publico' }) {
  if (!esPlazaPublica(plaza)) {
    return {
      error: 'falta-plaza',
      mensaje: 'Hay que saber de qué sucursal antes de dar existencias. Pregúntale al cliente de dónde es o en qué plaza compra.',
      opciones: opciones(),
    }
  }

  const inv = await cargar(plaza)

  // `filtrarYBuscar` sin filtro: buscar es ir por un modelo concreto y si
  // existe tiene que aparecer, esté en el tramo de piezas que esté. Esta regla
  // se rompió tres veces en la página; aquí se usa la misma función para que
  // no haya una segunda versión que romper.
  const hallados = filtrarYBuscar({
    filas: inv.productos,
    busqueda: texto,
    campos: p => [p.Producto, p.Codigo, aliasDe(p)],
  })

  const conPiezas = hallados.filter(p => (Number(p.Existencia) || 0) > 0)
  const enCero    = hallados.filter(p => (Number(p.Existencia) || 0) <= 0)

  return {
    plaza,
    nombrePlaza: inv.nombre,
    corte: inv.corte,
    corteViejo: inv.viejo,
    diasDeCorte: inv.dias,
    cliente,
    // Los tres casos se devuelven separados a propósito. «No lo manejo»,
    // «lo manejo y se acabó» y «hay piezas» son tres respuestas distintas.
    hayPiezas: conPiezas.slice(0, TOPE).map(p => unRenglon(p, cliente)),
    sinExistencia: enCero.slice(0, TOPE).map(p => unRenglon(p, cliente)),
    enCatalogo: hallados.length > 0,
    totalHallados: hallados.length,
  }
}

/**
 * El mismo código, plaza por plaza. NUNCA sumado.
 *
 * Sirve para cuando la plaza del cliente está en cero: su sucursal puede
 * pedirlo a otra. Se devuelve desglosado, nunca un total, y la respuesta se
 * redacta como «tu sucursal lo puede pedir», no como «vete a Aguascalientes».
 */
export async function dondeHay({ codigo }) {
  const c = normalizar(codigo)
  if (!c) return { error: 'falta-codigo' }

  const porPlaza = []
  for (const slug of PLAZAS_PUBLICAS) {
    const inv = await cargar(slug)
    const p = inv.productos.find(x => normalizar(x.Codigo) === c)
    if (!p) continue
    porPlaza.push({
      plaza: slug,
      nombrePlaza: inv.nombre,
      corte: inv.corte,
      piezas: Number(p.Existencia) || 0,
    })
  }
  return { codigo, porPlaza }
}

/**
 * El precio de un producto. NO lleva plaza: la lista del dueño es la misma en
 * las tres tiendas, y los precios que cada caja tiene capturados no sirven
 * —ver la cabecera de `precio.js`—.
 *
 * `cliente` es 'publico' por omisión. La publicidad va casi toda a público.
 */
export function precioProducto({ codigo, nombre, cliente = 'publico', combo = false }) {
  const r = precioDe({ codigo, nombre, cliente, combo })
  return {
    codigo,
    nombre,
    tipo: r.nombreTipo ?? null,
    cliente,
    // Con `monto` en null NO hay número que decir. El bot explica con
    // `porQueNo` en vez de inventarse uno o aplicarle un impuesto por su
    // cuenta: los precios de la lista YA llevan IVA incluido.
    monto: r.decir ? r.monto : null,
    porQueNo: r.porQueNo,
    conIva: true,
    comboDisponible: r.esMica === true,
    descuentoCombo: DESCUENTO_COMBO,
    ...(r.remate && { remate: true, antes: r.antes }),
  }
}

/** Lo que cuesta llevar funda y mica juntas, con el descuento ya aplicado. */
export function precioDeCombo({ funda, mica, cliente = 'publico' }) {
  const r = precioCombo({ funda, mica, cliente })
  if (!r.decir) return { monto: null, porQueNo: r.porQueNo }
  return {
    monto: r.monto,
    desglose: {
      funda: { nombre: funda.nombre, tipo: r.funda.nombreTipo, monto: r.funda.monto },
      mica:  { nombre: mica.nombre,  tipo: r.mica.nombreTipo,  monto: r.mica.monto, yaConDescuento: true },
    },
    ahorro: r.ahorro,
    conIva: true,
  }
}

/** La lista completa, para cuando preguntan «¿qué precios tienen?». */
export function listaDePrecios({ cliente = 'publico' } = {}) {
  const out = []
  for (const [clave, t] of Object.entries(TIPOS)) {
    const monto = cliente === 'mayoreo' ? t.mayoreo : t.publico
    out.push({
      tipo: t.nombre,
      monto,
      esMica: esMica(clave),
      ...(monto == null && { sinConfirmar: true }),
      ...(t.remate && cliente === 'publico' && { remate: true, antes: t.antes }),
    })
  }
  return { cliente, conIva: true, descuentoComboMica: DESCUENTO_COMBO, precios: out }
}

// ── Entrega del lead ────────────────────────────────────────────────────────

/**
 * El enlace con el que el cliente pasa a su sucursal, con el contexto ya
 * escrito para que en la tienda no lo vuelvan a interrogar.
 *
 * Reusa `armarMensaje` y `enlaceWhatsApp`, que ya quitan los emojis: varios se
 * rompen al pasar por la URL y salen como cuadros en WhatsApp de Android.
 */
export function entregarASucursal({ plaza, telefonos, cliente = {}, interes = [], nota }) {
  if (!esPlazaPublica(plaza)) return { error: 'falta-plaza', opciones: opciones() }

  const numero = telefonoWhatsApp(telefonos?.[plaza] || telefonos?.general)
  if (!numero) return { error: 'sin-numero', plaza }

  const mensaje = armarMensaje([
    '*Pedido desde la publicidad*',
    cliente.nombre ? `Cliente: ${cliente.nombre}` : null,
    cliente.ciudad ? `Ciudad: ${cliente.ciudad}` : null,
    '',
    interes.length ? '*Le interesa:*' : null,
    ...interes.map(i => `- ${i.codigo} ${i.nombre}${i.piezas ? ` (${i.piezas} pz)` : ''}`),
    nota ? '' : null,
    nota ? `Nota: ${nota}` : null,
  ])

  return {
    plaza,
    nombrePlaza: nombreSucursal(plaza),
    numero,
    mensaje,
    enlace: enlaceWhatsApp(numero, mensaje),
  }
}
