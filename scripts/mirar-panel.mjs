// Abre el panel SERVIDO DE VERDAD, lo fotografia y lee su consola.
//
//   npm run dev                       (en otra terminal)
//   node scripts/mirar-panel.mjs ./capturas
//
// ── Por que hace falta, teniendo `verificar` ─────────────────────────────
//
// `verificar` corre en jsdom, que NO MAQUETA. Comprueba que las cosas se
// dibujen y que las reglas se cumplan, y eso es mucho, pero no ve si algo se
// encima, si una lista es ilegible o si la consola esta llena de avisos.
//
// La primera vez que se uso, en una sola pasada, encontro tres cosas que
// `verificar` daba por buenas:
//
//   · El desglose por clase decia «99 agotados · A 0 · B 2 · C 32». Treinta y
//     cuatro de noventa y nueve: faltaban los 65 sin clase, y un desglose que
//     no suma se lee como un error de la pagina.
//   · La bandeja de incidencias enseñaba diecisiete renglones con la MISMA
//     frase, sin codigo ni plaza. Se dibujaba perfecta y no se podia usar.
//   · Cada cabecera numerica soltaba un aviso de React en consola.
//
// Ninguna de las tres rompe nada. Por eso ninguna prueba las veia.
//
// ── Dos cosas que hay que saber ──────────────────────────────────────────
//
// `--window-size` de Chrome NO fija el viewport: pidiendo 390 el documento
// sale de 512 y lo que se mide esta mal. Se fija por el protocolo con
// `Emulation.setDeviceMetricsOverride`.
//
// Y solo se interceptan las llamadas al BACKEND. Con un token inventado la
// primera devuelve 401 y la pagina bloquea el panel entero con «tu sesion
// expiro» -correcto en produccion, inutil para mirar-. Lo de S3 pasa de
// verdad: son los inventarios reales, que es el punto.
//
// jsdom NO sustituye esto: no maqueta, no aplica CSP y no enseña si algo se
// sale, se encima o se lee mal. Y `--window-size` de Chrome NO fija el
// viewport -pidiendo 390 el documento sale de 512- asi que se fija por el
// protocolo con Emulation.setDeviceMetricsOverride.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.env.BASE || 'http://localhost:5173'
const SALIDA = process.argv[2] || '.'
const ANCHO = Number(process.env.ANCHO || 1280)
const ALTO = Number(process.env.ALTO || 900)

const perfil = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'chrome-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=9222', '--no-first-run',
  '--no-default-browser-check', '--disable-gpu', `--user-data-dir=${perfil}`,
  'about:blank',
], { stdio: 'ignore' })

const dormir = ms => new Promise(r => setTimeout(r, ms))

async function conectar() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9222/json/version')
      if (r.ok) return (await r.json()).webSocketDebuggerUrl
    } catch { /* todavia no */ }
    await dormir(250)
  }
  throw new Error('Chrome no abrio el puerto de depuracion')
}

const wsUrl = await conectar()
const { WebSocket } = await import('ws').catch(() => ({ WebSocket: globalThis.WebSocket }))
const ws = new WebSocket(wsUrl)
await new Promise(r => ws.addEventListener('open', r))

let id = 0
const esperando = new Map()
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data)
  if (m.id && esperando.has(m.id)) { esperando.get(m.id)(m); esperando.delete(m.id) }
})
const cdp = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const n = ++id
  esperando.set(n, m => (m.error ? rej(new Error(m.error.message)) : res(m.result)))
  ws.send(JSON.stringify({ id: n, method, params, sessionId }))
})

const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true })
const en = (m, p) => cdp(m, p, sessionId)

await en('Page.enable')
await en('Runtime.enable')
// El viewport, por el protocolo. Es la unica forma de que sea el que se pide.
await en('Emulation.setDeviceMetricsOverride', {
  width: ANCHO, height: ALTO, deviceScaleFactor: 1, mobile: ANCHO < 500,
})

// La sesion se inyecta ANTES de cargar: el panel la lee al montarse.
await en('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    try { sessionStorage.setItem('istuffs_session', ${JSON.stringify(
      JSON.stringify({ isAdmin: true, branch: null, token: 'mirar' }))}) } catch (e) {}

    // Solo se interceptan las llamadas al BACKEND. Sin esto, la primera
    // devuelve 401 con un token inventado y la pagina bloquea el panel
    // entero con «tu sesion expiro», que es lo correcto en produccion pero
    // impide mirar nada.
    //
    // Lo de S3 se deja pasar: son los inventarios y las estadisticas de
    // VERDAD, que es el punto de mirar.
    const real = window.fetch
    window.fetch = (u, o) => {
      const url = String(u && u.url ? u.url : u)
      if (url.includes('lambda-url')) {
        return Promise.resolve(new Response('{}', {
          status: 200, headers: { 'Content-Type': 'application/json' },
        }))
      }
      return real(u, o)
    }
  `,
})

const errores = []
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data)
  if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
    errores.push((m.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' '))
  }
})

async function foto(nombre, pasos = 0) {
  await dormir(2500 + pasos * 800)
  const { data } = await en('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  const ruta = path.join(SALIDA, `${nombre}.png`)
  fs.writeFileSync(ruta, Buffer.from(data, 'base64'))
  const { result } = await en('Runtime.evaluate', {
    expression: 'document.body.innerText.replace(/\\s+/g," ").slice(0,600)', returnByValue: true,
  })
  console.log(`\n=== ${nombre} ===`)
  console.log(result.value)
  return ruta
}

async function pulsar(texto) {
  const { result } = await en('Runtime.evaluate', {
    expression: `(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => (x.textContent||'').includes(${JSON.stringify(texto)}))
      if (b) { b.click(); return 'ok' }
      return 'no encontrado: ' + ${JSON.stringify(texto)}
    })()`,
    returnByValue: true,
  })
  return result.value
}

await en('Page.navigate', { url: `${BASE}/` })
await dormir(3500)

// Entrar al panel: la sesion ya esta puesta, hace falta ir a la pestaña.
console.log('pulsar Panel:', await pulsar('Panel'))
await dormir(1500)

for (const [etiqueta, nombre] of [
  ['Inventarios', 'inventarios'],
  ['Revisar', 'revisar'],
  ['Surtido', 'surtido'],
]) {
  const r = await pulsar(etiqueta)
  console.log(`pulsar ${etiqueta}:`, r)
  await foto(nombre, 2)
}

console.log('\n=== errores de consola ===')
console.log(errores.length ? errores.slice(0, 8).join('\n') : 'ninguno')

ws.close()
chrome.kill()
