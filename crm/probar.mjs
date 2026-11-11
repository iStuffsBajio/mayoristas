// Banco de pruebas del bot. Conversa con él desde la consola, contra el
// inventario de verdad, sin que Meta tenga que haber aprobado nada.
//
//   npm run crm                          conversación suelta
//   npm run crm -- --plaza leon          como si ya se supiera la sucursal
//   npm run crm -- --guion               corre los diálogos de prueba y sale
//
// Existe para que F0 se pueda dar por terminada antes de pedirle a Meta un
// solo permiso. Lo que se mide aquí es lo único que no se puede comprobar con
// `reglas.test.js`: si el modelo OBEDECE las reglas, no si las herramientas
// las cumplen.

import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { contestar } from './cerebro.js'
import { MODELO, costoUsd } from './modelo.js'

const args = process.argv.slice(2)
const valorDe = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }

const contexto = {
  plaza:     valorDe('--plaza'),
  nombre:    valorDe('--nombre'),
  deAnuncio: valorDe('--anuncio'),
}

const GRIS = '\x1b[90m', VERDE = '\x1b[32m', AMBAR = '\x1b[33m', FIN = '\x1b[0m'

/** Diálogos que tocan cada regla. Si uno sale mal, la regla no se está obedeciendo. */
const GUION = [
  ['Sin plaza no da números',        'hola, tienes fundas para s23 ultra?'],
  ['Ciudad suelta',                  'soy de Celaya'],
  ['Modelo con piezas',              'y del a06 que tienes?'],
  ['Precio con captura sin IVA',     'a cuanto me sale el mayoreo del a06?'],
  ['Agotado en su plaza',            'necesito iphone 13'],
  ['No sustituir generación',        'y si no hay a06, me sirve el a07?'],
  ['Cierre y entrega',               'ok mandame 12 del a06, con quien veo?'],
]

async function turno(historial, texto, etiqueta) {
  if (etiqueta) console.log(`\n${GRIS}── ${etiqueta} ──${FIN}`)
  console.log(`${GRIS}tú:${FIN} ${texto}`)

  const t0 = Date.now()
  const r = await contestar({ historial, entrada: texto, contexto })
  const ms = Date.now() - t0

  if (r.rechazado) console.log(`${AMBAR}[el modelo rechazó el turno]${FIN}`)
  else if (r.seAtoro) console.log(`${AMBAR}[se agotaron las vueltas sin respuesta]${FIN}`)
  else console.log(`${VERDE}bot:${FIN} ${r.texto}`)

  for (const img of r.imagenes) {
    console.log(`${GRIS}  [imagen] ${img.pie}${FIN}`)
    console.log(`${GRIS}           ${img.url}${FIN}`)
    if (!img.exacta) console.log(`${AMBAR}           ^ prestada, y el pie lo dice${FIN}`)
  }
  if (r.entrega) {
    console.log(`${GRIS}  [lead -> ${r.entrega.nombrePlaza}] ${r.entrega.numero}${FIN}`)
    console.log(`${GRIS}  ${r.entrega.mensaje.replace(/\n/g, '\n  ')}${FIN}`)
  }
  if (r.truncado) console.log(`${AMBAR}[respuesta cortada por max_tokens]${FIN}`)

  console.log(`${GRIS}  ${ms} ms · entrada ${r.uso.entrada} (caché ${r.uso.cacheLeido}) · salida ${r.uso.salida}${FIN}`)
  return r
}

if (args.includes('--guion')) {
  let historial = []
  const uso = { entrada: 0, salida: 0, cacheLeido: 0 }
  for (const [etiqueta, texto] of GUION) {
    const r = await turno(historial, texto, etiqueta)
    historial = r.historial
    for (const k of Object.keys(uso)) uso[k] += r.uso[k]
  }
  // Es el costo de UNA conversación completa, con el modelo que esté puesto.
  const usd = costoUsd(uso)
  console.log(`\n${GRIS}── total del guión ──${FIN}`)
  console.log(`entrada ${uso.entrada} · caché ${uso.cacheLeido} · salida ${uso.salida}`)
  console.log(`costo de la conversación: ${usd.toFixed(4)} USD (${MODELO})`)
} else {
  const rl = readline.createInterface({ input: stdin, output: stdout })
  console.log(`${GRIS}Escribe como un mayorista. Ctrl+C para salir.${FIN}`)
  if (contexto.plaza) console.log(`${GRIS}Plaza ya conocida: ${contexto.plaza}${FIN}`)
  let historial = []
  while (true) {
    const texto = (await rl.question('\n> ')).trim()
    if (!texto) continue
    const r = await turno(historial, texto)
    historial = r.historial
  }
}
