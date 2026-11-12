// Evalúa un modelo contra las reglas del bot, con inventario sembrado.
//
//   CRM_MODELO=claude-haiku-5-5  npm run crm:evaluar -- --veces 3
//   CRM_MODELO=claude-sonnet-5-5 npm run crm:evaluar
//   npm run crm:evaluar -- --solo ciudad,cierre      (sólo esos escenarios)
//
// ── Para qué existe ────────────────────────────────────────────────────────
//
// `reglas.test.js` comprueba que las HERRAMIENTAS cumplen las reglas. Esto
// comprueba lo otro: que el MODELO las obedece, que no se puede medir con una
// prueba unitaria y es justo lo que cambia cuando se cambia de modelo. Se hizo
// cuando el dueño pidió el más barato «si pasa las pruebas»: sin esto, «pasa»
// querría decir «me pareció bien en tres conversaciones».
//
// ── Por qué el inventario es de mentira ────────────────────────────────────
//
// El de verdad cambia a diario: una prueba que dependa de que León tenga siete
// del A06 falla el día que se vende la última. Aquí cada plaza tiene lo que el
// escenario necesita —el A07 en cero en León y con piezas en San Luis, por
// ejemplo, que es lo único que hace probable «cero no es no lo manejamos»—.
//
// ── Lo que se comprueba y lo que NO ────────────────────────────────────────
//
// Se comprueba lo que se puede decidir con una regla: que no salgan cantidades,
// jerga de catálogo ni emojis, que ningún precio sea inventado, que el combo
// dé 370, que no re-pregunte la ciudad. NO se comprueba el tono ni si una
// respuesta es agradable: eso lo juzga una persona leyendo las respuestas, que
// el informe imprime enteras cuando algo falla.
//
// Cuesta dinero de verdad: cada corrida llama a la API.

import fs from 'node:fs'
import { sembrar } from './inventario.js'
import { contestar } from './cerebro.js'
import { MODELO, costoUsd } from './modelo.js'

const args = process.argv.slice(2)
const valorDe = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }

const VECES = Number(valorDe('--veces') || 1)
const SOLO = (valorDe('--solo') || '').split(',').filter(Boolean)
const SALIDA = valorDe('--salida')
const PARALELO = 5

const GRIS = '\x1b[90m', VERDE = '\x1b[32m', ROJO = '\x1b[31m', AMBAR = '\x1b[33m', FIN = '\x1b[0m'

// ── El inventario ──────────────────────────────────────────────────────────

const AYER = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
const p = (Codigo, Producto, Existencia) => ({ Codigo, Producto, Existencia })

function sembrarInventario() {
  const base = { corte: AYER, dias: 1, viejo: false }
  const comunes = piezas => ([
    p('MT',  'MICA HIDROGEL MATE', piezas),
    p('HDA', 'MICA HIDRIOGEL HD ALTA', piezas),
    p('PV',  'HIDROGEL PRIVACIDAD', piezas),
    p('HDR', 'HD USO RUDO', piezas),
  ])
  sembrar('leon', { nombre: 'León', ...base, productos: [
    p('SGA06T',  'SAMSUNG A06 TPU CASE', 7),
    p('SGA07T',  'GALAXY A07 TPU CASE', 0),            // en cero AQUÍ y con piezas en San Luis
    p('SGS24UT', 'SAMSUNG S24 ULTRA TPU CASE', 5),
    p('SGS24U3', 'SAMSUNG S24 ULTRA 3 IN 1', 4),
    p('I13T',    'IPHONE 13 TPU CASE', 4),
    p('I13',     'IPHONE 13 HARD CASE', 2),
    p('I133',    'IPHONE 13 3 IN 1', 3),
    p('I11TC',   'IPHONE 11 TPU CRISTAL', 5),          // modelo viejo en remate
    p('I11TR',   'IPHONE 11 TRANSPARENTE TPU CASE', 3),
    p('I11MO',   'IPHONE 11 MORADO TPU CASE', 2),      // con color: NO es transparente
    p('MTG54T',  'MOTO G54 TPU CASE', 5),
    p('HM10',    'HUAWEI MATE 10 HARD CASE', 3),
    ...comunes(30),
  ] })
  sembrar('san-luis', { nombre: 'San Luis Potosí', ...base, productos: [
    p('SGA06T', 'SAMSUNG A06 TPU CASE', 5),
    p('SGA07T', 'GALAXY A07 TPU CASE', 10),
    p('I13T',   'IPHONE 13 TPU CASE', 7),
    ...comunes(40),
  ] })
  sembrar('aguascalientes', { nombre: 'Aguascalientes', ...base, productos: [
    p('SGA06T', 'SAMSUNG A06 TPU CASE', 7),
    p('SGA07T', 'GALAXY A07 TPU CASE', 0),
    p('I13T',   'IPHONE 13 TPU CASE', 0),
    ...comunes(20),
  ] })
  sembrar('torreon', { nombre: 'Torreón', ...base, productos: [
    p('SGA06T', 'SAMSUNG A06 TPU CASE', 3),
    p('I13T',   'IPHONE 13 TPU CASE', 2),
    ...comunes(10),
  ] })
}

// ── Los escenarios ─────────────────────────────────────────────────────────
//
// `plaza` es lo que el bot YA SABE al empezar. Va en `null` salvo que el
// escenario sea el de un anuncio: así se prueba lo que pasa en producción,
// donde la plaza sólo se conoce de antemano si el anuncio la trae.
//
// Por turno: `debe` y `noDebe` son expresiones sobre lo que dice el bot; `con`
// y `sin` son herramientas que tiene o no tiene que haber llamado; `chequeo`
// es para lo que una expresión no alcanza.

const NO_PREGUNTA_CIUDAD = /(de qu[eé] ciudad|de d[oó]nde (eres|escribes|me escribes)|en qu[eé] (ciudad|tienda)|cu[aá]l es tu ciudad)/i

const ESCENARIOS = [
  { id: 'sin-plaza', plaza: null, turnos: [
    { di: 'hola, tienes fundas para iphone 13? cuantas hay?',
      sin: ['buscar_existencias', 'donde_hay'], debe: [/(ciudad|tienda|d[oó]nde)/i] },
  ] },
  { id: 'ciudad', plaza: null, turnos: [
    { di: 'hola tienes fundas para a06?', sin: ['buscar_existencias'] },
    { di: 'soy de celaya', con: ['buscar_existencias'], debe: [/250/, /flexible/i] },
  ] },
  { id: 'ciudad-persiste', plaza: null, turnos: [
    { di: 'soy de celaya y busco para el a06', con: ['buscar_existencias'], debe: [/250/] },
    { di: 'y para el s24 ultra?', con: ['buscar_existencias'], noDebe: [NO_PREGUNTA_CIUDAD], debe: [/250/, /300/] },
  ] },
  { id: 'un-tipo', plaza: 'leon', turnos: [
    { di: 'tienes para a06?', debe: [/250/, /flexible/i], noDebe: [/\b300\b/, /\b220\b/, /215|129|\b290\b/] },
  ] },
  { id: 'dos-tipos', plaza: 'leon', turnos: [
    { di: 'tienes para galaxy s24 ultra?', debe: [/250/, /300/, /flexible/i, /uso rudo/i] },
  ] },
  { id: 'tres-tipos', plaza: 'leon', turnos: [
    { di: 'y para iphone 13?', debe: [/250/, /220/, /300/] },
  ] },
  { id: 'cero-otra-tienda', plaza: 'leon', turnos: [
    { di: 'tienes para galaxy a07?',
      noDebe: [/no manejamos|no lo manejamos|no manejo|no trabajamos/i, /vete a|ve a (san luis|aguascalientes)/i],
      debe: [/(ahorita no|no lo tengo|no tengo|agotad|se acab|sin existencia|no hay)/i, /san luis/i] },
  ] },
  { id: 'no-existe', plaza: 'leon', turnos: [
    { di: 'tienes para un nokia 3310?',
      debe: [/(no manejamos|no manejo|no tengo|no trabajamos|no cuento|no contamos|no hay|no la manejamos)/i],
      noDebe: [/\$\s?\d/] },
  ] },
  { id: 'no-sustituir', plaza: 'leon', turnos: [
    { di: 'si no tienes para el a07, me sirve la del a06?',
      debe: [/(no (te |le )?(queda|sirve|encaja|funciona|va|entra)|no es compatible|son distint|cada (modelo|tel[eé]fono)|no (es )?la misma|no les? queda|no te quedar)/i] },
  ] },
  { id: 'mica-combo', plaza: 'leon', turnos: [
    { di: 'quiero funda para el a06', debe: [/250/] },
    { di: 'tienes mica?', noDebe: [/no manejamos mica|no (tengo|manejo|manejamos) micas?/i], debe: [/(150|180|200)/] },
    { di: 'me llevo la funda y la mica hd, cuanto sale todo?', debe: [/370/] },
  ] },
  { id: 'mayoreo', plaza: 'leon', turnos: [
    { di: 'soy revendedor, a cuanto el mayoreo de la funda de goma flexible?', debe: [/150/] },
    { di: 'y las micas al mayoreo?', debe: [/(tienda|sucursal)/i] },
  ] },
  { id: 'personalizar', plaza: 'leon', turnos: [
    { di: 'cuanto cuesta si la quiero personalizada con mi foto?',
      debe: [/(tienda|sucursal|cotiz)/i], noDebe: [/\$\s?\d|\b\d{2,3}\s*pesos/i] },
  ] },
  { id: 'transparente', plaza: 'leon', turnos: [
    { di: 'tienes para iphone 11 transparente?', debe: [/250/, /transparente/i] },
  ] },
  { id: 'foto', plaza: 'leon', turnos: [
    { di: 'mandame foto de la del a06',
      chequeo: async ({ r }) => {
        if (!(r.imagenes?.length >= 1)) return 'no mandó ninguna foto'
        if (r.imagenes.some(i => /\bcase\b/i.test(i.pie))) return `el pie de la foto lleva «case»: ${r.imagenes[0].pie}`
        // Que la foto SE PUEDA BAJAR, no sólo que haya una URL. Durante dos
        // semanas el sitio por omisión fue un dominio que no contesta y todo
        // pasaba en verde: el bot mandaba una URL bien formada a ninguna parte.
        // WhatsApp la descarga él mismo y, si falla, el cliente ve un hueco.
        for (const img of r.imagenes) {
          try {
            const res = await fetch(img.url, { method: 'HEAD', signal: AbortSignal.timeout(10_000) })
            const tipo = res.headers.get('content-type') ?? ''
            if (!res.ok) return `la foto no se puede bajar (${res.status}): ${img.url}`
            if (!tipo.startsWith('image/')) return `la foto no es una imagen (${tipo || 'sin tipo'}): ${img.url}`
          } catch (err) {
            return `la foto no responde: ${img.url} (${err?.name ?? err})`
          }
        }
        return null
      } },
  ] },
  { id: 'cierre', plaza: 'leon', turnos: [
    { di: 'quiero la funda para a06', debe: [/250/] },
    { di: 'ok va, con quien voy?', con: ['entregar_lead'],
      chequeo: ({ r }) => r.entrega?.plaza !== 'leon' ? 'no entregó el lead a León' : !/wa\.me\/52/.test(r.entrega.enlace) ? 'el enlace no es de wa.me' : null },
  ] },
  { id: 'torreon', plaza: null, turnos: [
    { di: 'soy de gomez palacio, tienes para a06?', con: ['buscar_existencias'],
      chequeo: ({ llamadas }) => llamadas.some(l => l.nombre === 'buscar_existencias' && l.entrada.plaza === 'torreon') ? null : 'no buscó en Torreón' },
  ] },
  { id: 'sin-cobertura', plaza: null, turnos: [
    { di: 'soy de monterrey, tienes para a06?', sin: ['buscar_existencias'], debe: [/\?/] },
  ] },
  { id: 'modelo-vago', plaza: 'leon', turnos: [
    { di: 'tienes para mi samsung?', debe: [/(qu[eé] modelo|cu[aá]l|modelo)/i] },
  ] },
  { id: 'gracias', plaza: 'leon', turnos: [
    { di: 'tienes para a06?', debe: [/250/] },
    { di: 'gracias, es todo', noDebe: [/\bTPU\b/], chequeo: ({ palabras }) => palabras > 30 ? `contestó ${palabras} palabras a un «gracias»` : null },
  ] },
  { id: 'envio', plaza: 'leon', turnos: [
    { di: 'hacen envios? cuanto tarda?', debe: [/(tienda|sucursal|confirm)/i], noDebe: [/\b\d+\s*(d[ií]as|horas|hrs)\b/i] },
  ] },
  // ── RESERVADOS ──────────────────────────────────────────────────────────
  //
  // Escenarios que el prompt NUNCA vio mientras se ajustaba. Los de arriba se
  // fueron corrigiendo mirando sus fallos, y un modelo que pasa lo que se
  // afinó a su medida no demuestra nada: pasar estos sí se parece a pasar lo
  // que va a pasar de verdad. Se separan en el resumen para poder compararlos.
  { id: 'r-mayorista-llega', reservado: true, plaza: 'leon', turnos: [
    { di: 'hola soy dueño de un local, quiero surtirme de fundas para varios modelos',
      debe: [/(tienda|sucursal|modelos?|cu[aá]les|qu[eé] modelos)/i], noDebe: [/\$\s?\d/] },
  ] },
  { id: 'r-color', reservado: true, plaza: 'leon', turnos: [
    { di: 'la tienes en color morado para iphone 11?',
      debe: [/morad/i], noDebe: [/no manejamos|no la manejamos|no tengo morad/i] },
  ] },
  { id: 'r-regateo', reservado: true, plaza: 'leon', turnos: [
    { di: 'tienes para a06?', debe: [/250/] },
    { di: 'me la dejas en 200 y me llevo dos?',
      noDebe: [/te (lo |la )?dejo en|te hago (un )?descuento|\b200\b.{0,25}(s[ií]|claro|va)/i], debe: [/(tienda|sucursal)/i] },
  ] },
  { id: 'r-enojo', reservado: true, plaza: 'leon', turnos: [
    { di: 'ya me tienen harto, nunca contestan y nunca hay nada',
      debe: [/(tienda|sucursal|disculp|lamento|perd[oó]n|siento)/i],
      chequeo: ({ palabras }) => palabras > 60 ? `contestó ${palabras} palabras a alguien enojado` : null },
  ] },
  { id: 'r-fuera-de-tema', reservado: true, plaza: 'leon', turnos: [
    { di: 'me ayudas con mi tarea de matematicas?',
      debe: [/(funda|mica|celular|tel[eé]fono|protector)/i], noDebe: [/\b(derivada|integral|ecuaci[oó]n)\b/i],
      chequeo: ({ palabras }) => palabras > 50 ? `contestó ${palabras} palabras a algo fuera de tema` : null },
  ] },
  { id: 'r-cuantas', reservado: true, plaza: 'leon', turnos: [
    { di: 'cuantas fundas del a06 tienes?', debe: [/(s[ií]|tengo|hay|manejo|disponible)/i] },
  ] },
  { id: 'r-uno-si-uno-no', reservado: true, plaza: 'leon', turnos: [
    { di: 'necesito para el a06 y para el a07',
      debe: [/250/, /(ahorita no|no lo tengo|no tengo|agotad|se acab|sin existencia)/i] },
  ] },
  { id: 'r-promesa', reservado: true, plaza: 'leon', turnos: [
    { di: 'me la puedes tener lista mañana a las 10?',
      debe: [/(tienda|sucursal|confirm)/i], noDebe: [/\bs[ií],? (claro|te la tengo|la tendr|sin problema)/i] },
  ] },
  { id: 'anuncio', plaza: 'san-luis', anuncio: 'Fundas para tu celular, desde $250', turnos: [
    { di: 'hola, vi su anuncio', sin: ['plaza_de_ciudad'], noDebe: [NO_PREGUNTA_CIUDAD] },
  ] },
]

// ── Las comprobaciones que valen para TODA respuesta ───────────────────────

const EMOJI = /\p{Extended_Pictographic}/u
const JERGA = /\b(case|tpu|3 ?(en|in) ?1|hard)\b/i
const CANTIDAD = [
  /\b\d+\s*(piezas?|pz|unidades)\b/i,
  /\b(hay|había|habia|habían|quedan|quedaban|tengo|tienen|tenemos|manejamos|manejo)\s+(solo |sólo |unas |unos |como )?\d+\b/i,
  // «Hay dos tipos en León» habla de TIPOS, que es justo lo que se tiene que
  // decir; lo que no se dice son las piezas. De ahí la excepción: sin ella el
  // evaluador acusaba al bot de cumplir la regla de nombrar los tipos.
  /\b(hay|había|habia|quedan|quedaban|tengo|tienen)\s+(solo |sólo |unas |unos )?(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b(?!\s*:|\s+(tipos?|opciones?|presentaciones?|versiones?|modelos?|clases?|variedades|estilos?|materiales?|colores?|de goma|de uso|que\b))/i,
  // El número no puede ser parte del nombre de un teléfono: «iPhone 13 en León»
  // es el modelo, no trece piezas.
  /(?<!\b(?:iphone|galaxy|samsung|mate|note|nova|pixel|poco|redmi|moto|mini|pro|plus|ultra|max|xr|xs|se|serie)\s)\b\d+\s+(en|de)\s+(le[oó]n|san luis|aguascalientes|torre[oó]n|cada)\b/i,
  /\b(pocas|poquitas)\b/i,
  /\b[uú]ltimas?\s+piezas?\b/i,
]

/** Lo que cada herramienta devolvió: de ahí salen los únicos precios que valen. */
function preciosPermitidos(historial) {
  const ok = new Set([30])
  for (const m of historial) {
    if (!Array.isArray(m.content)) continue
    for (const b of m.content) {
      if (b?.type !== 'tool_result') continue
      for (const n of String(b.content).match(/\b\d{2,3}\b/g) ?? []) {
        const v = Number(n)
        if (v >= 100) ok.add(v)
      }
    }
  }
  return ok
}

function revisarGlobal({ texto, di, historial, palabras }) {
  const fallos = []
  if (EMOJI.test(texto)) fallos.push('emoji')

  // La jerga sólo cuenta si NO la dijo el cliente: si él escribe «tpu», repetirlo
  // es contestarle, no recitar el catálogo.
  const jerga = texto.match(new RegExp(JERGA.source, 'gi')) ?? []
  const propia = jerga.filter(w => !new RegExp(`\\b${w.replace(/\s+/g, '\\s*')}\\b`, 'i').test(di))
  if (propia.length) fallos.push(`jerga de catálogo: «${propia.join('», «')}»`)

  for (const re of CANTIDAD) {
    const m = texto.match(re)
    if (m) { fallos.push(`cantidad de inventario: «${m[0]}»`); break }
  }

  const permitidos = preciosPermitidos(historial)
  for (const n of [...texto.matchAll(/\$\s?(\d[\d,]*)/g)].map(x => Number(x[1].replace(/,/g, '')))) {
    if (!permitidos.has(n) && !new RegExp(`\\b${n}\\b`).test(di)) fallos.push(`precio que no salió de ninguna herramienta: $${n}`)
  }

  // No tiene herramienta para apartar: ofrecerlo promete algo que no puede dar,
  // y si la persona dice que sí, no hay nada que hacer.
  //
  // Lo que se castiga es OFRECERLO, no decirlo: «no puedo apartar nada desde
  // aquí» es exactamente lo correcto, y la primera versión de esta comprobación
  // lo marcaba como fallo por ver la palabra. Se mira si hay un «no» justo antes.
  const aparta = [...texto.matchAll(/\b(te la aparto|te lo aparto|apart(ar|arte|arla|arlo|o|amos)|reserv(ar|arte|arla|arlo|o|amos))\b/gi)]
    .find(m => !/\bno\b[^.?!]{0,30}$/i.test(texto.slice(Math.max(0, m.index - 35), m.index)))
  if (aparta) fallos.push(`ofrece apartar o reservar: «${aparta[0]}»`)

  // El enlace de entrega no manda nada: sólo abre el chat. Decir que ya se avisó
  // deja a alguien esperando una respuesta que nadie sabe que pidió. Lo vio una
  // LECTURA de las respuestas, no ninguna expresión: salió en 1 de 195.
  const yaAviso = texto.match(/\bya (les|le|lo|la) (dej|avis|mand|pas|apunt|envi)\w*|\b(les|le) (avis|mand|dej|pas)[eé] (tu|el|lo)\b|\btu pedido (ya )?(qued|est)\w*/i)
  if (yaAviso) fallos.push(`dice que ya avisó a la tienda: «${yaAviso[0]}»`)

  if (palabras > 75) fallos.push(`demasiado largo: ${palabras} palabras`)
  if ((texto.match(/\?/g) ?? []).length >= 3) fallos.push('tres o más preguntas')
  if (!/\b(bodega|ferias?)\b/i.test(di) && /\b(bodega|ferias?)\b/i.test(texto)) fallos.push('nombra bodega o Ferias')
  return fallos
}

// ── Correr un escenario ────────────────────────────────────────────────────

function llamadasNuevas(historial, desde) {
  const out = []
  for (const m of historial.slice(desde)) {
    if (!Array.isArray(m.content)) continue
    for (const b of m.content) if (b?.type === 'tool_use') out.push({ nombre: b.name, entrada: b.input })
  }
  return out
}

async function correr(esc, vuelta) {
  sembrarInventario()
  let historial = []
  const turnos = []

  for (const t of esc.turnos) {
    const desde = historial.length + 1          // lo que haya DESPUÉS del mensaje del cliente
    const t0 = Date.now()
    let r
    try {
      r = await contestar({
        historial, entrada: t.di,
        contexto: { plaza: esc.plaza, nombre: 'Marisol', deAnuncio: esc.anuncio ?? null },
      })
    } catch (err) {
      turnos.push({ di: t.di, texto: null, fallos: [`error: ${String(err.message ?? err).slice(0, 120)}`], ms: Date.now() - t0 })
      break
    }
    historial = r.historial
    // Sin el enlace de wa.me: va codificado («%20pz» es un espacio y las letras
    // «pz», no una cantidad) y además inflaba el conteo de palabras.
    const texto = (r.texto ?? '').replace(/https?:\/\/\S+/g, ' ').replace(/[ \t]{2,}/g, ' ').trim()
    const palabras = texto.split(/\s+/).filter(Boolean).length
    const llamadas = llamadasNuevas(historial, desde)
    const nombres = new Set(llamadas.map(l => l.nombre))

    const fallos = []
    if (!r.texto) fallos.push(r.rechazado ? 'el modelo rechazó el turno' : r.seAtoro ? 'se agotaron las vueltas' : 'sin texto')
    else fallos.push(...revisarGlobal({ texto, di: t.di, historial, palabras }))

    for (const re of t.debe ?? [])   if (!re.test(texto)) fallos.push(`le faltó: ${re}`)
    for (const re of t.noDebe ?? []) if (re.test(texto))  fallos.push(`no debía decir: ${re}`)
    for (const n of t.con ?? [])     if (!nombres.has(n)) fallos.push(`no llamó a ${n}`)
    for (const n of t.sin ?? [])     if (nombres.has(n))  fallos.push(`no debía llamar a ${n}`)
    // `await`: algunos chequeos salen a la red (la foto tiene que bajarse de
    // verdad). Sin él, una promesa es «verdadera» y contaría como fallo siempre.
    const extra = await t.chequeo?.({ r, texto, palabras, llamadas })
    if (extra) fallos.push(extra)

    turnos.push({ di: t.di, texto, fallos, palabras, ms: Date.now() - t0, uso: r.uso, herramientas: [...nombres] })
  }
  return { id: esc.id, vuelta, turnos }
}

// ── Informe ────────────────────────────────────────────────────────────────

async function enParalelo(trabajos, n) {
  const salida = new Array(trabajos.length)
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < trabajos.length) { const k = i++; salida[k] = await trabajos[k]() }
  }))
  return salida
}

const escenarios = ESCENARIOS.filter(e => !SOLO.length || SOLO.includes(e.id))
console.log(`\n${GRIS}Modelo: ${MODELO} · ${escenarios.length} escenarios × ${VECES} · inventario sembrado${FIN}\n`)

const trabajos = []
for (const e of escenarios) for (let v = 1; v <= VECES; v++) trabajos.push(() => correr(e, v))
const t0 = Date.now()
const corridas = await enParalelo(trabajos, PARALELO)

let turnosTotal = 0, turnosBien = 0, palabras = 0, ms = 0, gasto = 0
const uso = { entrada: 0, salida: 0, cacheLeido: 0, cacheEscrito: 0 }
const porEsc = new Map()

for (const c of corridas) {
  const bien = c.turnos.every(t => t.fallos.length === 0)
  const f = porEsc.get(c.id) ?? { ok: 0, n: 0, malos: [] }
  f.n++; if (bien) f.ok++; else f.malos.push(c)
  porEsc.set(c.id, f)
  for (const t of c.turnos) {
    turnosTotal++; if (!t.fallos.length) turnosBien++
    palabras += t.palabras ?? 0; ms += t.ms ?? 0
    for (const k of Object.keys(uso)) uso[k] += t.uso?.[k] ?? 0
  }
}
gasto = costoUsd(uso)

for (const [id, f] of porEsc) {
  const marca = f.ok === f.n ? `${VERDE}✔${FIN}` : f.ok === 0 ? `${ROJO}✖${FIN}` : `${AMBAR}~${FIN}`
  console.log(`${marca} ${id.padEnd(18)} ${f.ok}/${f.n}`)
}

const malos = [...porEsc.values()].flatMap(f => f.malos)
if (malos.length) {
  console.log(`\n${ROJO}── Lo que falló, con lo que dijo el bot ──${FIN}`)
  for (const c of malos) {
    for (const t of c.turnos.filter(t => t.fallos.length)) {
      console.log(`\n${AMBAR}${c.id}${FIN} ${GRIS}(vuelta ${c.vuelta})${FIN}`)
      console.log(`${GRIS}cliente:${FIN} ${t.di}`)
      console.log(`${GRIS}bot:${FIN}     ${(t.texto ?? '(sin texto)').replace(/\n/g, '\n         ')}`)
      for (const x of t.fallos) console.log(`  ${ROJO}✖${FIN} ${x}`)
    }
  }
}

const reservados = new Set(ESCENARIOS.filter(e => e.reservado).map(e => e.id))
const parte = fn => [...porEsc].filter(([id]) => fn(id)).reduce((a, [, f]) => ({ ok: a.ok + f.ok, n: a.n + f.n }), { ok: 0, n: 0 })
const afinados = parte(id => !reservados.has(id)), reserv = parte(id => reservados.has(id))
const escOk = [...porEsc.values()].reduce((a, f) => a + f.ok, 0)
const escN  = [...porEsc.values()].reduce((a, f) => a + f.n, 0)
console.log(`\n${GRIS}── resumen · ${MODELO} ──${FIN}`)
console.log(`escenarios completos sin fallo: ${escOk}/${escN}  (${(100 * escOk / escN).toFixed(0)}%)`)
if (reserv.n) {
  console.log(`  · los que se afinaron:        ${afinados.ok}/${afinados.n}  (${(100 * afinados.ok / afinados.n).toFixed(0)}%)`)
  console.log(`  · los RESERVADOS (no vistos): ${reserv.ok}/${reserv.n}  (${(100 * reserv.ok / reserv.n).toFixed(0)}%)`)
}
console.log(`respuestas sin fallo:           ${turnosBien}/${turnosTotal}  (${(100 * turnosBien / turnosTotal).toFixed(0)}%)`)
console.log(`palabras por respuesta:         ${(palabras / turnosTotal).toFixed(0)}`)
console.log(`tiempo por respuesta:           ${(ms / turnosTotal / 1000).toFixed(1)} s`)
console.log(`costo de toda la evaluación:    $${gasto.toFixed(4)} USD  (${(gasto / turnosTotal * 1000).toFixed(3)} milésimas de dólar por respuesta)`)
console.log(`${GRIS}${((Date.now() - t0) / 1000).toFixed(0)} s en total${FIN}\n`)

if (SALIDA) {
  fs.writeFileSync(SALIDA, JSON.stringify({ modelo: MODELO, veces: VECES, escOk, escN, turnosBien, turnosTotal, gasto, corridas }, null, 2))
  console.log(`${GRIS}guardado en ${SALIDA}${FIN}`)
}
process.exit(escOk === escN ? 0 : 1)
