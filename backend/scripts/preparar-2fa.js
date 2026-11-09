// Deja listo el segundo factor del administrador.
//
//   node backend/scripts/preparar-2fa.js
//
// Genera un secreto, lo enseña para darlo de alta en la app, y NO TERMINA
// hasta que un código de esa app lo confirma. Ese orden es todo el punto:
//
//   Si el secreto se pusiera en la Lambda antes de comprobar que la app lo
//   lee bien, un dedazo al teclearlo dejaría al administrador fuera de su
//   propio panel, sin forma de entrar desde la página. La comprobación va
//   primero y el comando para publicarlo sale después, ya ganado.
//
// El secreto NO se escribe en ningún archivo. Vive en esta pantalla y en el
// móvil, y de aquí pasa a la variable de la Lambda. Un archivo con el
// segundo factor dentro, al lado del repositorio, sería el primer sitio donde
// buscaría quien entrara a esta máquina —y anularía el segundo factor entero,
// porque quien tiene el secreto genera los códigos—.

import readline from 'node:readline/promises'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { stdin, stdout } from 'node:process'
import { nuevoSecretoTotp, verificarTotp, urlTotp } from '../src/seguridad.js'

const CUENTA = process.argv[2] || 'administrador'

// Se comprueba ANTES de generar nada.
//
// Sin una terminal de verdad no hay forma de teclear el código, así que el
// guion se quedaba colgado esperando una respuesta que no iba a llegar. Y lo
// peor no era el cuelgue: para entonces ya había impreso la clave secreta, y
// en una tubería eso acaba en un archivo de registro o en el historial de
// otra herramienta. Una clave que nadie llegó a usar sigue siendo una clave
// impresa donde no debía.
if (!stdin.isTTY) {
  console.error(`
  Esto hay que correrlo en una TERMINAL, no por una tubería ni dentro de otra
  herramienta: hace falta que puedas teclear el código que te enseñe la app.

  Abre una terminal en la carpeta del proyecto y lanza:

      node backend/scripts/preparar-2fa.js

  No se ha generado ninguna clave, así que no hay nada que tirar.
`)
  process.exit(1)
}

const secreto = nuevoSecretoTotp()
// En grupos de cuatro: se teclea a mano en el móvil y de corrido se falla.
const legible = secreto.match(/.{1,4}/g).join(' ')
const enlace = urlTotp(secreto, CUENTA)

/**
 * El QR, como IMAGEN y abierto en el visor.
 *
 * El primer intento lo dibujaba en la propia terminal con medios bloques de
 * texto. Se ve bien en pantalla y **la cámara no lo agarra**: la fuente de la
 * consola no es cuadrada, así que los módulos salen rectangulares, y entre
 * eso y el brillo del texto el teléfono no reconoce la figura. Probado.
 *
 * Una imagen de verdad se escanea a la primera.
 *
 * `qrcode` es una dependencia de DESARROLLO: el despliegue hace
 * `npm install --omit=dev`, así que no llega a la Lambda. Y si no está
 * instalada esto no se cae: queda la clave para teclearla, que es lo que
 * había antes. Un guion de seguridad que falla por una librería que sólo
 * sirve para dibujar es un guion que no se usa.
 */
const archivoQr = path.join(os.tmpdir(), `qr-2fa-${process.pid}.png`)
let hayQr = false
try {
  const QR = (await import('qrcode')).default
  await QR.toFile(archivoQr, enlace, {
    errorCorrectionLevel: 'M', margin: 3, width: 420,
    color: { dark: '#000000', light: '#FFFFFF' },
  })
  hayQr = true
  // Se abre solo: pedirle a alguien que busque un archivo en la carpeta
  // temporal es pedirle que no lo haga.
  spawnSync(process.platform === 'win32' ? 'explorer' : 'xdg-open', [archivoQr],
    { stdio: 'ignore' })
} catch { hayQr = false }

/**
 * El QR lleva la clave dentro, así que el archivo se borra en cuanto deja de
 * hacer falta —y pase lo que pase, también si se corta a medias—. Un PNG con
 * el segundo factor olvidado en la carpeta temporal anula el segundo factor
 * entero para quien entre a esta máquina.
 */
const borrarQr = () => { try { fs.rmSync(archivoQr, { force: true }) } catch { /* ya no está */ } }
process.on('exit', borrarQr)
process.on('SIGINT', () => { borrarQr(); process.exit(130) })

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  SEGUNDO FACTOR DEL ADMINISTRADOR · iStuffs Bajío                ║
╚══════════════════════════════════════════════════════════════════╝

PASO 1 · Darlo de alta en Microsoft Authenticator
─────────────────────────────────────────────────
  En el móvil:   +   →   "Otra cuenta (Google, Facebook, etc.)"

  Eso NO te pide entrar en Google ni en Facebook: es sólo la etiqueta que
  Microsoft le pone a "cualquier cosa que no sea una cuenta Microsoft", y lo
  que abre es la cámara.
${hayQr ? `
  ►  SE ACABA DE ABRIR UNA IMAGEN CON EL CÓDIGO QR EN TU PANTALLA.
     Apunta ahí la cámara del móvil. Si no la ves, búscala en la barra de
     tareas: es una ventana del visor de fotos.
` : `
  (No se pudo generar el código QR. Usa la clave de abajo.)
`}
  Si la cámara no lo agarra, en esa misma pantalla del móvil hay un enlace
  pequeño que dice "O ESCRIBIR EL CÓDIGO MANUALMENTE". Ahí van estos dos
  campos:

      Nombre de la cuenta :  iStuffs Bajío
      Clave secreta       :  ${legible}

PASO 2 · Comprobarlo AQUÍ, antes de publicarlo
──────────────────────────────────────────────
  Escribe abajo los seis dígitos que te enseñe la app.
  Hasta que coincidan, no hay nada que configurar en ningún sitio:
  así un dedazo no te deja fuera de tu propio panel.
`)

const rl = readline.createInterface({ input: stdin, output: stdout })
let confirmado = false
let cortado = false
// Si cierran la entrada —Ctrl+D, o la terminal se va— se sale en vez de
// esperar para siempre.
rl.on('close', () => { cortado = true })

for (let intento = 1; intento <= 5 && !confirmado && !cortado; intento++) {
  let codigo = ''
  try {
    codigo = (await rl.question(`  Código (intento ${intento} de 5): `)).trim()
  } catch { cortado = true; break }
  if (!codigo) { cortado = true; break }
  if (verificarTotp(codigo, secreto)) {
    confirmado = true
  } else if (intento < 5) {
    console.log('  ✗ No coincide. Comprueba que copiaste la clave entera y vuelve a intentarlo.\n')
  }
}

if (!confirmado) {
  rl.close()
  console.log(`
  ✗ No se pudo confirmar. NO se ha cambiado nada: puedes entrar al panel
    igual que siempre. Vuelve a lanzar el guion cuando quieras; generará
    un secreto nuevo y el de antes no sirve para nada.
`)
  process.exit(1)
}

console.log(`
  ✓ Confirmado. La app y el servidor dicen lo mismo.

PASO 3 · Guarda la clave de respaldo ANTES de seguir
────────────────────────────────────────────────────
  Cópiala en tu gestor de contraseñas:

        ${legible}

  Es lo único que te deja volver a dar de alta la app si pierdes el móvil.
  En cuanto cierres esta ventana ya no hay forma de recuperarla.
`)

// ── Publicar desde aquí, y no copiando un comando a otra parte ───────────
//
// Antes esto imprimía la orden para que la pegara en otro sitio. Se perdió
// justo ahí: la ventana se había cerrado y el comando llevaba dentro una
// clave que ya no existía en ningún lado. Un paso que obliga a mover un
// secreto de una ventana a otra es un paso que se hace mal.
//
// Se sigue preguntando en vez de publicar solo: es el único momento en que
// algo cambia de verdad, y conviene que se diga que sí a propósito.
const r2 = readline.createInterface({ input: stdin, output: stdout })
let respuesta = ''

// Se vuelve a preguntar hasta que conteste algo que se entienda.
//
// Antes, cualquier cosa que no fuera «s» —incluido quedarse en blanco— se
// tomaba como un no y el guion se cerraba. Le pasó al dueño: escribió dos
// eses sin querer, las borró, y al dar enter la respuesta salió vacía. El
// guion dio por hecho que no quería activarlo, se cerró, y con él se fue la
// única copia de la clave. Una pregunta de sí o no que interpreta el
// silencio como «no» y además cierra la puerta es una trampa.
for (let i = 0; i < 5; i++) {
  let dicho = ''
  try {
    dicho = (await r2.question('  ¿Lo activo ya en el servidor? (s/n): ')).trim().toLowerCase()
  } catch { break }
  if (['s', 'si', 'sí', 'y', 'yes'].includes(dicho)) { respuesta = 's'; break }
  if (['n', 'no'].includes(dicho)) { respuesta = 'n'; break }
  console.log('  Escribe «s» para activarlo o «n» para dejarlo como está.')
}
r2.close()

if (respuesta !== 's') {
  console.log(`
  No se ha activado nada: el panel entra igual que siempre.
  LA CLAVE DE ARRIBA SIGUE SIENDO VALIDA: guardala antes de cerrar.
  Cuando quieras hacerlo, con la clave de arriba:

      node backend/scripts/anadir-variable-lambda.js TOTP_ADMIN=LACLAVE --aplicar
`)
  process.exit(0)
}

console.log('\n  Publicando…\n')
const guion = path.join(path.dirname(fileURLToPath(import.meta.url)), 'anadir-variable-lambda.js')
const res = spawnSync(process.execPath, [guion, `TOTP_ADMIN=${secreto}`, '--aplicar'],
  { stdio: 'inherit' })

if (res.status !== 0) {
  console.log(`
  ✗ No se pudo publicar. NO ha cambiado nada: el panel entra igual que
    siempre. Lo más habitual es que el CLI de AWS no esté configurado;
    compruébalo con:  aws sts get-caller-identity
`)
  process.exit(1)
}

console.log(`
YA ESTÁ
───────
  · Entrar al panel pedirá la contraseña y luego el código. Las sucursales
    siguen entrando igual que siempre, sin código.
  · Si alguna vez pierdes el móvil y no tienes la clave de respaldo, ésta es
    la salida:

      node backend/scripts/anadir-variable-lambda.js TOTP_ADMIN --borrar --aplicar

  · Cierra esta ventana cuando acabes. La clave está en pantalla.
`)
