// Una ventana para probar el bot en el navegador.
//
//   npm run crm:web            y abre http://localhost:5174
//
// Por detrás corre el bot DE VERDAD: la misma carga que manda Meta, el mismo
// `leerCarga`, el mismo `atender`, el mismo cerebro y el inventario de verdad
// de S3. Lo único de mentira es el envío, que en vez de ir a WhatsApp se
// devuelve al navegador para pintarlo.
//
// Existe porque la terminal no sirve para esto. Lo que hay que juzgar aquí es
// cómo QUEDA una conversación —si el mensaje se lee bien en un teléfono, si la
// foto llega con su pie, si el tono es el correcto— y eso no se ve en un
// volcado de JSON.
//
// El panel de la derecha es lo que lo convierte en una herramienta y no en un
// chat: enseña qué herramientas pidió el modelo, qué plaza resolvió, cuánto
// costó el turno y si la respuesta salió de una regla fija sin gastar modelo.

import http from 'node:http'
import { leerCarga } from './webhook.js'
import { atender } from './atender.js'
import { enMemoria } from './conversaciones.js'
import { opcionesDePlaza } from './plazas.js'
import { costoUsd, MODELO } from './modelo.js'

const PUERTO = Number(process.env.CRM_PUERTO || 5174)
const TELEFONO = '524771234567'

const almacen = enMemoria()
let contador = 0
const total = { entrada: 0, salida: 0, cacheLeido: 0, cacheEscrito: 0 }

/** La carga tal como la manda Meta, para que el camino sea el de verdad. */
function cargaDeMeta(texto, { tipo = 'text', nombre = 'Marisol', anuncio = null } = {}) {
  const mensaje = {
    id: `wamid.WEB${++contador}`,
    from: TELEFONO,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: tipo,
    ...(tipo === 'text' ? { text: { body: texto } } : { [tipo]: { id: 'media' + contador } }),
    ...(anuncio && {
      referral: {
        source_url: 'https://fb.me/2abcdef',
        source_id: '120210987654321',
        source_type: 'ad',
        headline: 'Fundas para tu celular, desde $250',
        body: `Entrega el mismo dia en ${anuncio}`,
        media_type: 'image',
        ctwa_clid: 'ARCl1dXAMPLE',
        ref: `plaza=${anuncio}`,
      },
    }),
  }
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA_ID',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '523315381571', phone_number_id: 'PNID' },
          contacts: [{ wa_id: TELEFONO, profile: { name: nombre } }],
          messages: [mensaje],
        },
      }],
    }],
  }
}

/**
 * Un turno completo.
 *
 * `enviar` apunta lo que habría salido a WhatsApp en vez de mandarlo, y las
 * herramientas que pidió el modelo se apuntan envolviendo `pensar`, porque el
 * cerebro no las reporta: hay que verlas pasar.
 */
async function unTurno(texto, opciones) {
  const salida = []
  const herramientas = []

  const enviar = async (a, r) => {
    salida.push({ texto: r.texto ?? null, imagenes: r.imagenes ?? [] })
    return { enviados: [{ id: 'wamid.OUT' }], fallos: [] }
  }

  // Se envuelve el cerebro para espiar qué herramientas pidió. Es la única
  // forma de ver si consultó el inventario o contestó de memoria.
  const { contestar } = await import('./cerebro.js')
  const pensar = async args => {
    const r = await contestar(args)
    for (const m of r.historial ?? []) {
      if (!Array.isArray(m.content)) continue
      for (const b of m.content) {
        if (b?.type === 'tool_use' && !herramientas.some(h => h.id === b.id)) {
          herramientas.push({ id: b.id, nombre: b.name, entrada: b.input })
        }
      }
    }
    return r
  }

  const { mensajes } = leerCarga(cargaDeMeta(texto, opciones))
  const r = await atender(mensajes[0], { almacen, enviar, pensar, leer: async () => {} })

  for (const k of Object.keys(total)) total[k] += r.uso?.[k] ?? 0

  const c = await almacen.obtener(TELEFONO)
  return {
    entrada: mensajes[0].texto ?? `[${mensajes[0].tipo}]`,
    salida,
    motivo: r.motivo,
    lead: r.lead ?? null,
    herramientas,
    plaza: c.plaza,
    anuncio: c.anuncio,
    uso: r.uso ?? null,
    total: { ...total, usd: costo(total) },
  }
}

/** Con el precio del modelo que esté puesto: ver `modelo.js`. */
const costo = u => costoUsd(u)

// ── La página ───────────────────────────────────────────────────────────────

const PLAZAS = opcionesDePlaza()

const PAGINA = /* html */ `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Probar el bot</title>
<style>
  :root {
    --fondo: #0b141a; --panel: #111b21; --borde: #222e35;
    --mio: #005c4b; --suyo: #202c33; --texto: #e9edef; --suave: #8696a0;
    --marca: #D51A7A; --ok: #00a884; --aviso: #d9a441;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--fondo); color: var(--texto);
    font: 15px/1.5 -apple-system, "Segoe UI", Roboto, system-ui, sans-serif;
    height: 100vh; display: grid; grid-template-columns: 1fr 380px;
  }
  @media (max-width: 900px) { body { grid-template-columns: 1fr; grid-template-rows: 1fr auto; } }

  /* ── El chat ── */
  .chat { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  header {
    background: var(--panel); border-bottom: 1px solid var(--borde);
    padding: 12px 16px; display: flex; align-items: center; gap: 12px; flex-shrink: 0;
  }
  .avatar {
    width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
    background: linear-gradient(135deg, var(--marca), #FF6B1A);
    display: grid; place-items: center; font-weight: 700; font-size: 15px;
  }
  header b { font-size: 15px; } header small { color: var(--suave); font-size: 12px; }
  #mensajes { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
  .burbuja {
    max-width: min(78%, 520px); padding: 8px 11px; border-radius: 10px;
    white-space: pre-wrap; word-break: break-word; position: relative; font-size: 14.5px;
  }
  .yo  { align-self: flex-end;   background: var(--mio);  border-bottom-right-radius: 3px; }
  .bot { align-self: flex-start; background: var(--suyo); border-bottom-left-radius: 3px; }
  .burbuja img { display: block; max-width: 220px; border-radius: 7px; margin-bottom: 6px; background: #0007; }
  .pie { font-size: 12.5px; color: #cfd9de; }
  .pie.prestada { color: var(--aviso); }
  .nota {
    align-self: center; font-size: 12px; color: var(--suave); background: #182229;
    padding: 4px 12px; border-radius: 20px; max-width: 90%; text-align: center;
  }
  .nota.mal { color: #ffb4a9; background: #3b2220; }
  form { display: flex; gap: 8px; padding: 12px; background: var(--panel); border-top: 1px solid var(--borde); flex-shrink: 0; }
  input[type=text] {
    flex: 1; min-width: 0; background: #2a3942; border: 0; color: var(--texto);
    padding: 11px 14px; border-radius: 22px; font: inherit;
  }
  input[type=text]:focus { outline: 2px solid var(--ok); }
  button {
    background: var(--ok); color: #06251f; border: 0; border-radius: 22px;
    padding: 0 18px; font: inherit; font-weight: 600; cursor: pointer;
  }
  button:disabled { opacity: .45; cursor: default; }

  /* ── El panel ── */
  aside {
    background: var(--panel); border-left: 1px solid var(--borde);
    overflow-y: auto; padding: 16px; font-size: 13px;
  }
  @media (max-width: 900px) { aside { border-left: 0; border-top: 1px solid var(--borde); max-height: 42vh; } }
  aside h2 {
    font-size: 11px; text-transform: uppercase; letter-spacing: .09em;
    color: var(--suave); margin: 22px 0 8px; font-weight: 600;
  }
  aside h2:first-child { margin-top: 0; }
  .fila { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; }
  .fila span:last-child { color: var(--texto); font-variant-numeric: tabular-nums; }
  .fila span:first-child { color: var(--suave); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    background: #2a3942; border: 1px solid var(--borde); color: var(--texto);
    padding: 5px 10px; border-radius: 14px; font-size: 12px; cursor: pointer;
  }
  .chip:hover { border-color: var(--ok); }
  .chip.on { background: var(--ok); color: #06251f; border-color: var(--ok); }
  .herr {
    background: #182229; border-left: 2px solid var(--marca);
    padding: 7px 10px; margin-bottom: 6px; border-radius: 0 6px 6px 0;
  }
  .herr b { color: #ff7ab8; font-weight: 600; }
  .herr code { color: var(--suave); font-size: 11.5px; word-break: break-all; display: block; margin-top: 2px; }
  .lead { background: #0d2b22; border: 1px solid var(--ok); padding: 10px; border-radius: 7px; }
  .lead a { color: var(--ok); word-break: break-all; }
  .vacio { color: var(--suave); font-style: italic; }
  .aviso { background: #3b2f1a; border: 1px solid var(--aviso); padding: 11px; border-radius: 7px; color: #ffe0a3; line-height: 1.45; }
  .aviso code { background: #0004; padding: 1px 5px; border-radius: 3px; }
</style>
</head>
<body>
  <div class="chat">
    <header>
      <div class="avatar">iS</div>
      <div><b>iStuffs</b><br><small id="estado">Escribe como un cliente que vio el anuncio</small></div>
    </header>
    <div id="mensajes"></div>
    <form id="forma">
      <input type="text" id="texto" placeholder="Escribe un mensaje" autocomplete="off" autofocus>
      <button type="submit" id="enviar">Enviar</button>
    </form>
  </div>

  <aside>
    <h2>Cómo entra</h2>
    <div class="chips" id="plazas">
      <button class="chip on" data-anuncio="">Sin anuncio</button>
      ${PLAZAS.map(p => `<button class="chip" data-anuncio="${p.slug}">Anuncio · ${p.nombre}</button>`).join('')}
    </div>

    <h2>Lo que no se escribe</h2>
    <div class="chips" id="tipos">
      ${['audio', 'image', 'location', 'sticker'].map(t => `<button class="chip" data-tipo="${t}">${t}</button>`).join('')}
    </div>

    <h2>Estado</h2>
    <div class="fila"><span>Plaza resuelta</span><span id="iPlaza">—</span></div>
    <div class="fila"><span>Del anuncio</span><span id="iAnuncio">—</span></div>
    <div class="fila"><span>Último turno</span><span id="iMotivo">—</span></div>

    <h2>Herramientas del último turno</h2>
    <div id="iHerr"><p class="vacio">Nada todavía</p></div>

    <h2>Lead entregado</h2>
    <div id="iLead"><p class="vacio">Nada todavía</p></div>

    <h2>Costo acumulado</h2>
    <div class="fila"><span>Entrada</span><span id="iEnt">0</span></div>
    <div class="fila"><span>De caché</span><span id="iCache">0</span></div>
    <div class="fila"><span>Salida</span><span id="iSal">0</span></div>
    <div class="fila"><span><b>Total</b></span><span id="iUsd"><b>$0.0000</b></span></div>

    <h2>&nbsp;</h2>
    <div class="chips"><button class="chip" id="reiniciar">Borrar la conversación</button></div>
  </aside>

<script>
const $ = s => document.querySelector(s)
const msgs = $('#mensajes')
let anuncio = ''
let ocupado = false

function burbuja(clase, html) {
  const d = document.createElement('div')
  d.className = 'burbuja ' + clase
  d.innerHTML = html
  msgs.appendChild(d)
  msgs.scrollTop = msgs.scrollHeight
  return d
}
function nota(texto, mal) {
  const d = document.createElement('div')
  d.className = 'nota' + (mal ? ' mal' : '')
  d.textContent = texto
  msgs.appendChild(d)
  msgs.scrollTop = msgs.scrollHeight
}
const esc = t => String(t ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))

// Las negritas de WhatsApp van con *un asterisco*.
const negritas = t => esc(t).replace(/\\*([^*\\n]+)\\*/g, '<b>$1</b>')

async function mandar(texto, tipo) {
  if (ocupado) return
  ocupado = true
  $('#enviar').disabled = true
  $('#estado').textContent = 'escribiendo…'

  burbuja('yo', tipo ? '<i>[' + tipo + ']</i>' : negritas(texto))

  try {
    const res = await fetch('/mensaje', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto, tipo, anuncio }),
    })
    const d = await res.json()
    if (d.error) { nota(d.error, true); return }

    for (const s of d.salida) {
      if (s.texto) burbuja('bot', negritas(s.texto))
      for (const img of s.imagenes ?? []) {
        burbuja('bot',
          '<img src="' + esc(img.url) + '" alt="" loading="lazy">' +
          '<div class="pie' + (img.exacta ? '' : ' prestada') + '">' + esc(img.pie) + '</div>')
      }
    }
    if (d.motivo !== 'contestado') nota('[' + d.motivo + ']', d.motivo === 'error')
    pintarPanel(d)
  } catch (e) {
    nota('No se pudo hablar con el servidor: ' + e.message, true)
  } finally {
    ocupado = false
    $('#enviar').disabled = false
    $('#estado').textContent = 'Escribe como un cliente que vio el anuncio'
    $('#texto').focus()
  }
}

function pintarPanel(d) {
  $('#iPlaza').textContent   = d.plaza ?? '— sin resolver'
  $('#iAnuncio').textContent = d.anuncio ? (d.anuncio.ref || d.anuncio.anuncio) : '—'
  $('#iMotivo').textContent  = d.motivo

  $('#iHerr').innerHTML = d.herramientas.length
    ? d.herramientas.map(h =>
        '<div class="herr"><b>' + esc(h.nombre) + '</b><code>' +
        esc(JSON.stringify(h.entrada)) + '</code></div>').join('')
    : '<p class="vacio">Ninguna: contestó sin consultar</p>'

  $('#iLead').innerHTML = d.lead
    ? '<div class="lead"><b>' + esc(d.lead.nombrePlaza) + '</b> · ' + esc(d.lead.numero) +
      '<br><a href="' + esc(d.lead.enlace) + '" target="_blank" rel="noopener">abrir el chat de la tienda</a></div>'
    : '<p class="vacio">Nada todavía</p>'

  $('#iEnt').textContent   = d.total.entrada
  $('#iCache').textContent = d.total.cacheLeido
  $('#iSal').textContent   = d.total.salida
  $('#iUsd').innerHTML     = '<b>$' + d.total.usd.toFixed(4) + '</b>'
}

$('#forma').addEventListener('submit', e => {
  e.preventDefault()
  const t = $('#texto').value.trim()
  if (!t) return
  $('#texto').value = ''
  mandar(t)
})

$('#plazas').addEventListener('click', e => {
  const b = e.target.closest('[data-anuncio]')
  if (!b) return
  anuncio = b.dataset.anuncio
  for (const c of $('#plazas').children) c.classList.toggle('on', c === b)
  nota(anuncio
    ? 'El siguiente mensaje entra desde un anuncio de ' + anuncio
    : 'El siguiente mensaje entra sin anuncio')
})

$('#tipos').addEventListener('click', e => {
  const b = e.target.closest('[data-tipo]')
  if (b) mandar('', b.dataset.tipo)
})

$('#reiniciar').addEventListener('click', async () => {
  await fetch('/reiniciar', { method: 'POST' })
  msgs.innerHTML = ''
  nota('Conversación borrada')
  pintarPanel({ plaza: null, anuncio: null, motivo: '—', herramientas: [], lead: null,
                total: { entrada: 0, cacheLeido: 0, cacheEscrito: 0, salida: 0, usd: 0 } })
})

nota('El bot de verdad, con el inventario de verdad. Lo único simulado es el envío a WhatsApp.')
</script>
</body>
</html>`

// ── El servidor ─────────────────────────────────────────────────────────────

const leerCuerpo = req => new Promise((res, rej) => {
  let d = ''
  req.on('data', c => { d += c; if (d.length > 1e6) req.destroy() })
  req.on('end', () => res(d))
  req.on('error', rej)
})

const json = (res, codigo, cuerpo) => {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(cuerpo))
}

const servidor = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      return res.end(PAGINA)
    }

    if (req.method === 'POST' && req.url === '/reiniciar') {
      almacen._datos.clear()
      for (const k of Object.keys(total)) total[k] = 0
      return json(res, 200, { ok: true })
    }

    if (req.method === 'POST' && req.url === '/mensaje') {
      const { texto, tipo, anuncio } = JSON.parse(await leerCuerpo(req) || '{}')
      try {
        return json(res, 200, await unTurno(texto, {
          tipo: tipo || 'text',
          anuncio: anuncio || null,
        }))
      } catch (err) {
        // El error se devuelve legible en vez de un 500 mudo: el más común con
        // diferencia es que falte la llave de la API, y hay que decirlo así.
        const m = String(err?.message ?? err)
        return json(res, 200, {
          error: /authentication method|api.?key/i.test(m)
            ? 'Falta la llave de la API de Claude. Pon ANTHROPIC_API_KEY y vuelve a levantar el servidor. Los mensajes que no necesitan modelo (audio, foto, ubicación) sí funcionan sin ella.'
            : m,
          salida: [], herramientas: [], lead: null, motivo: 'error',
          plaza: null, anuncio: null, total: { ...total, usd: costo(total) },
        })
      }
    }

    json(res, 404, { error: 'no existe' })
  } catch (err) {
    json(res, 500, { error: String(err?.message ?? err) })
  }
})

servidor.listen(PUERTO, () => {
  const hayLlave = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
  console.log(`\n  Ventana del bot:  http://localhost:${PUERTO}`)
  // Es lo primero que se quiere saber cuando preocupa el costo, y el modelo se
  // puede cambiar con una variable de entorno sin que nada en pantalla avise.
  console.log(`  Modelo:           ${MODELO}\n`)
  console.log(hayLlave
    ? '  Llave de la API: puesta. Todo funciona.\n'
    : '  Llave de la API: NO puesta.\n' +
      '  Los mensajes de audio, foto y ubicacion funcionan igual (no gastan modelo).\n' +
      '  Para los de texto, pon esta linea en el archivo .env de la raiz:\n\n' +
      '      ANTHROPIC_API_KEY=sk-ant-...\n\n' +
      '  La llave se saca en console.anthropic.com. El .env ya esta en\n' +
      '  .gitignore, asi que no se sube. Luego Ctrl+C y npm run crm:web.\n')
  console.log('  Ctrl+C para cerrar.\n')
})
