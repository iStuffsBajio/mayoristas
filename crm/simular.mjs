// Mete cargas de Meta por el camino completo, sin Meta.
//
//   npm run crm:simular                  el guión de siempre, por el camino real
//   npm run crm:simular -- --anuncio     entrando por un anuncio de San Luis
//   npm run crm:simular -- --raros       audios, fotos, ubicación y repetidos
//   npm run crm:simular -- --libre       conversación suelta por teclado
//
// La diferencia con `probar.mjs` es el camino. `probar.mjs` llama al cerebro
// directo, que sirve para afinar las respuestas. Esto arma la carga como la
// manda Meta, la pasa por `leerCarga`, `atender` y el almacén, y enseña lo que
// WhatsApp habría recibido. Es lo único que comprueba la fontanería: el
// descarte de repetidos, la plaza que sale del anuncio, el historial que se
// guarda y las respuestas fijas que no gastan modelo.
//
// Lo único de mentira es el envío. El inventario y el cerebro son los de
// verdad.

import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import path from 'node:path'
import os from 'node:os'
import { leerCarga } from './webhook.js'
import { atenderCarga } from './atender.js'
import { enArchivo } from './conversaciones.js'
import { costoUsd } from './modelo.js'

const args = process.argv.slice(2)
const GRIS = '\x1b[90m', VERDE = '\x1b[32m', AMBAR = '\x1b[33m', AZUL = '\x1b[36m', FIN = '\x1b[0m'

const TELEFONO = '524771234567'
const NOMBRE = 'Marisol'

const almacen = enArchivo(path.join(os.tmpdir(), 'istuffs-crm-simulado'))

// ── Lo que haría Meta ───────────────────────────────────────────────────────

let n = 0

/** Una carga de webhook como la que manda Meta. */
function carga(mensaje, { conNombre = true } = {}) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA_ID',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '523315381571', phone_number_id: 'PNID' },
          ...(conNombre && { contacts: [{ wa_id: TELEFONO, profile: { name: NOMBRE } }] }),
          messages: [mensaje],
        },
      }],
    }],
  }
}

const texto = (cuerpo, extra = {}) => carga({
  id: `wamid.SIM${++n}`,
  from: TELEFONO,
  timestamp: String(Math.floor(Date.now() / 1000)),
  type: 'text',
  text: { body: cuerpo },
  ...extra,
})

/** El `referral` que Meta pega al PRIMER mensaje de un anuncio. */
const deAnuncio = (plaza, cuerpo) => texto(cuerpo, {
  referral: {
    source_url: 'https://fb.me/2abcdef',
    source_id: '120210987654321',
    source_type: 'ad',
    headline: 'Fundas para tu celular, desde $250',
    body: `Entrega el mismo dia en ${plaza}`,
    media_type: 'image',
    ctwa_clid: 'ARCl1dXAMPLE',
    ref: `plaza=${plaza}`,
  },
})

const sinTexto = (tipo, cuerpo = {}) => carga({
  id: `wamid.SIM${++n}`, from: TELEFONO, type: tipo, ...cuerpo,
})

// ── El envío de mentira ─────────────────────────────────────────────────────

const enviar = async (a, r) => {
  if (r.texto) {
    console.log(`${VERDE}bot →${FIN} ${r.texto.replace(/\n/g, '\n      ')}`)
  }
  for (const img of r.imagenes ?? []) {
    console.log(`${AZUL}  [imagen]${FIN} ${img.pie}`)
    console.log(`${GRIS}           ${img.url}${FIN}`)
    if (!img.exacta) console.log(`${AMBAR}           ^ prestada, y el pie lo dice${FIN}`)
  }
  return { enviados: [{ id: 'wamid.OUT' }], fallos: [] }
}

const leer = async () => {}

// ── Un paso ─────────────────────────────────────────────────────────────────

const total = { entrada: 0, salida: 0, cacheLeido: 0, cacheEscrito: 0 }

async function paso(etiqueta, cargaDeMeta, quien = 'tú') {
  if (etiqueta) console.log(`\n${GRIS}── ${etiqueta} ──${FIN}`)

  const { mensajes } = leerCarga(cargaDeMeta)
  for (const m of mensajes) {
    const qué = m.texto ?? `[${m.tipo}]`
    console.log(`${GRIS}${quien}:${FIN} ${qué}`)
    if (m.anuncio) {
      console.log(`${GRIS}      ↳ del anuncio ${m.anuncio.anuncio} · ref="${m.anuncio.ref}"${FIN}`)
    }
  }

  const t0 = Date.now()
  const r = await atenderCarga(mensajes, { almacen, enviar, leer })
  const ms = Date.now() - t0

  for (const x of r) {
    if (x.motivo !== 'contestado') {
      console.log(`${AMBAR}      [${x.motivo}${x.error ? ': ' + x.error : ''}]${FIN}`)
    }
    if (x.lead) {
      console.log(`${AZUL}  [lead → ${x.lead.nombrePlaza}]${FIN} ${x.lead.numero}`)
      console.log(`${GRIS}  ${x.lead.mensaje.replace(/\n/g, '\n  ')}${FIN}`)
    }
    for (const k of Object.keys(total)) total[k] += x.uso?.[k] ?? 0
  }
  const u = r.map(x => x.uso).find(Boolean)
  console.log(`${GRIS}      ${ms} ms${u ? ` · entrada ${u.entrada} (caché ${u.cacheLeido}) · salida ${u.salida}` : ' · sin modelo'}${FIN}`)
  return r
}

function resumen() {
  const usd = costoUsd(total)
  console.log(`\n${GRIS}── total ──${FIN}`)
  console.log(`entrada ${total.entrada} · caché ${total.cacheLeido} · salida ${total.salida}`)
  console.log(`costo de la conversación: ${usd.toFixed(4)} USD`)
  console.log(`${GRIS}(sin contar la mensajería de Meta: los leads de anuncio son gratis 7 días)${FIN}`)
}

// ── Los guiones ─────────────────────────────────────────────────────────────

if (args.includes('--raros')) {
  console.log(`${GRIS}Lo que NO gasta modelo, y los repetidos.${FIN}`)
  await paso('Nota de voz',        sinTexto('audio',    { audio: { id: 'm1', mime_type: 'audio/ogg' } }))
  await paso('Foto del teléfono', sinTexto('image',    { image: { id: 'm2', mime_type: 'image/jpeg' } }))
  await paso('Ubicación',          sinTexto('location', { location: { latitude: 21.12, longitude: -101.68 } }))
  await paso('Sticker',            sinTexto('sticker',  { sticker: { id: 'm3' } }))
  await paso('Tipo que Meta estrene mañana', sinTexto('reaction', { reaction: { emoji: '👍' } }))

  // El repetido se demuestra con un audio a propósito: así este guión corre
  // completo sin credencial de la API, y lo que se comprueba —que la segunda
  // vez se descarta— no depende del modelo.
  const repetido = sinTexto('audio', { audio: { id: 'mRep' } })
  await paso('Un mensaje cualquiera', repetido)
  await paso('El MISMO otra vez (Meta reintentando)', repetido)

  await paso('Y uno que sí necesita el modelo', texto('tienes para a06?'))
  resumen()

} else if (args.includes('--libre')) {
  const rl = readline.createInterface({ input: stdin, output: stdout })
  console.log(`${GRIS}Escribe como un cliente. Ctrl+C para salir.${FIN}`)
  while (true) {
    const t = (await rl.question('\n> ')).trim()
    if (t) await paso(null, texto(t))
  }

} else if (args.includes('--anuncio')) {
  console.log(`${GRIS}Entrando por un anuncio de San Luis: la plaza no se pregunta.${FIN}`)
  await paso('Primer mensaje, con referral', deAnuncio('san-luis', 'hola, vi su anuncio'))
  await paso('Segundo mensaje, ya sin referral', texto('tienes para iphone 13?'))
  await paso('Precio', texto('a cuanto?'))
  await paso('Combo', texto('y con mica cuanto me sale?'))
  await paso('Cierre', texto('ok la quiero, con quien voy?'))
  resumen()

} else {
  console.log(`${GRIS}Sin anuncio: hay que preguntar la ciudad antes de dar existencias.${FIN}`)
  await paso('Sin plaza no da números',   texto('hola, tienen fundas para s23 ultra?'))
  await paso('Ciudad suelta',             texto('soy de Celaya'))
  await paso('Modelo con piezas',         texto('y del a06 que tienes?'))
  await paso('Precio',                    texto('a cuanto sale?'))
  await paso('Agotado en su plaza',       texto('tambien queria uno para iphone 13'))
  await paso('No sustituir generación',   texto('si no hay a06, me sirve el a07?'))
  await paso('Modelo viejo en remate',    texto('y tienes iphone 11 tpu cristal?'))
  await paso('Cierre y entrega',          texto('ok dame la del a06, con quien voy?'))
  resumen()
}
