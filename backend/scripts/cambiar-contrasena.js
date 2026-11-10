// Cambia la contraseña de UNA plaza, tecleándola en una ventana.
//
//   node backend/scripts/cambiar-contrasena.js torreon
//
// La contraseña la escribe quien la va a usar y no pasa por ningún sitio más:
// no se imprime, no va en la línea de órdenes ni en el historial, y a la Lambda
// sólo llega su HASH, por `anadir-variable-lambda.js`, que conserva las demás
// variables (el CLI de AWS a pelo las borraría todas).
//
// Al final ofrece guardarla también en el `.env` del proyecto. Hace falta: es
// de donde `generar-credenciales.js` saca TODAS las contraseñas, y si alguien
// vuelve a generarlas sin que el `.env` la tenga, la plaza volvería a la vieja
// sin que nadie se enterara.
//
// Las sesiones abiertas siguen valiendo: van firmadas con `SESION_SECRETO`,
// que no cambia.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashearContrasena, verificarContrasena } from '../src/seguridad.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.join(__dirname, '..', '..')

// plaza → [variable de la Lambda, variable del .env]
const PLAZAS = {
  admin:          ['HASH_ADMIN',          'PASS_ADMIN'],
  leon:           ['HASH_LEON',           'PASS_LEON'],
  'san-luis':     ['HASH_SAN_LUIS',       'PASS_SLP'],
  aguascalientes: ['HASH_AGUASCALIENTES', 'PASS_AGS'],
  torreon:        ['HASH_TORREON',        'PASS_TORREON'],
  bodega:         ['HASH_BODEGA',         'PASS_BODEGA'],
}

const MINIMO = 10

const plaza = String(process.argv[2] ?? '').trim().toLowerCase()
if (!PLAZAS[plaza]) {
  console.error(`Uso: node backend/scripts/cambiar-contrasena.js <${Object.keys(PLAZAS).join('|')}>`)
  process.exit(1)
}
const [VARIABLE, EN_ENV] = PLAZAS[plaza]

/** Pide un texto sin enseñarlo: cada tecla sale como «•». */
function pedirOculto(pregunta) {
  return new Promise((resolver, rechazar) => {
    const entrada = process.stdin
    process.stdout.write(pregunta)
    if (!entrada.isTTY) { rechazar(new Error('Hace falta una ventana de consola de verdad.')); return }
    entrada.setRawMode(true)
    entrada.resume()
    entrada.setEncoding('utf8')
    let texto = ''
    const tecla = c => {
      for (const ch of c) {
        if (ch === '\r' || ch === '\n') {
          entrada.setRawMode(false); entrada.pause(); entrada.off('data', tecla)
          process.stdout.write('\n'); resolver(texto); return
        }
        if (ch === '\u0003') { process.stdout.write('\nCancelado.\n'); process.exit(1) }
        if (ch === '\u0008' || ch === '\u007f') {
          if (texto.length) { texto = texto.slice(0, -1); process.stdout.write('\b \b') }
          continue
        }
        if (ch < ' ') continue
        texto += ch
        process.stdout.write('•')
      }
    }
    entrada.on('data', tecla)
  })
}

function pedirVisible(pregunta) {
  return new Promise(resolver => {
    process.stdout.write(pregunta)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    process.stdin.once('data', d => { process.stdin.pause(); resolver(String(d).trim()) })
  })
}

console.log(`\n  Contraseña nueva para ${plaza.toUpperCase()}`)
console.log(`  ─────────────────────────────────────`)
console.log(`  Mínimo ${MINIMO} caracteres. Mejor tres o cuatro palabras que una sola`)
console.log('  con símbolos: es más fácil de recordar y más difícil de adivinar.\n')

let clave
for (;;) {
  const a = await pedirOculto('  Escríbela:        ')
  if (a.length < MINIMO) { console.log(`  ✗ Tiene ${a.length} caracteres; hacen falta ${MINIMO}.\n`); continue }
  if (a !== a.trim()) { console.log('  ✗ Empieza o termina con un espacio: casi siempre es un dedazo.\n'); continue }
  const b = await pedirOculto('  Repítela:         ')
  if (a !== b) { console.log('  ✗ No coinciden. Otra vez.\n'); continue }
  clave = a
  break
}

const hash = hashearContrasena(clave)
// Se comprueba ANTES de publicar: un hash que no valida la contraseña dejaría
// a la plaza fuera sin forma de saber por qué.
if (!verificarContrasena(clave, hash)) {
  console.error('  ✗ El hash no valida la contraseña. No se publicó nada.')
  process.exit(1)
}

console.log('\n  Publicando en la Lambda (sólo el hash)…\n')
try {
  execFileSync(process.execPath, [path.join(__dirname, 'anadir-variable-lambda.js'), `${VARIABLE}=${hash}`, '--aplicar'],
    { stdio: 'inherit' })
} catch {
  console.error('\n  ✗ No se pudo publicar. La contraseña de antes sigue valiendo.')
  process.exit(1)
}

const respuesta = (await pedirVisible(`\n  ¿Guardarla también en el .env del proyecto como ${EN_ENV}? (s/n) `)).toLowerCase()
if (respuesta.startsWith('s')) {
  const ruta = path.join(RAIZ, '.env')
  const antes = fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : ''
  const salto = antes.includes('\r\n') ? '\r\n' : '\n'
  const renglon = `${EN_ENV}=${clave}`
  const patron = new RegExp(`^${EN_ENV}=.*$`, 'm')
  const despues = patron.test(antes)
    ? antes.replace(patron, () => renglon)
    : antes + (antes && !antes.endsWith('\n') ? salto : '') + renglon + salto
  fs.writeFileSync(ruta, despues)
  console.log(`  ✓ Guardada en .env como ${EN_ENV}.`)
} else {
  console.log(`  Ojo: si alguien vuelve a generar todas las credenciales, ${plaza} volverá`)
  console.log(`  a la contraseña que tenga ${EN_ENV} en el .env.`)
}

console.log(`\n  ✓ Listo. ${plaza} ya entra con la contraseña nueva.`)
console.log('  Puedes cerrar esta ventana.\n')
process.exit(0)
