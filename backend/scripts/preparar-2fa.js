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

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  SEGUNDO FACTOR DEL ADMINISTRADOR · iStuffs Bajío                ║
╚══════════════════════════════════════════════════════════════════╝

PASO 1 · Darlo de alta en Microsoft Authenticator
─────────────────────────────────────────────────
  Abre la app  →  +  →  "Otra cuenta (Google, Facebook, etc.)"
                   →  "Introducir clave manualmente"

  Nombre de la cuenta :  iStuffs Bajío (${CUENTA})
  Clave secreta       :  ${legible}

  Si prefieres pegar el enlace completo en vez de teclear la clave:

  ${urlTotp(secreto, CUENTA)}

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
rl.close()

if (!confirmado) {
  console.log(`
  ✗ No se pudo confirmar. NO se ha cambiado nada: puedes entrar al panel
    igual que siempre. Vuelve a lanzar el guion cuando quieras; generará
    un secreto nuevo y el de antes no sirve para nada.
`)
  process.exit(1)
}

console.log(`
  ✓ Confirmado. La app y el servidor dicen lo mismo.

PASO 3 · Publicarlo en la Lambda
────────────────────────────────
  Este es el único paso que cambia algo. Copia y pega:

  node backend/scripts/anadir-variable-lambda.js TOTP_ADMIN=${secreto} --aplicar

  (Sin --aplicar sólo te enseña qué va a hacer, sin tocar nada.)

  ⚠ NO lo hagas con el CLI de AWS a pelo: «--environment» REEMPLAZA todas
    las variables en vez de añadir una, y la Lambda se quedaría sin sus
    catorce —sin los hashes no entra nadie—. El guion de arriba lee las que
    ya hay, les suma ésta, y comprueba después que no se perdió ninguna.

DESPUÉS
───────
  · Entrar al panel pedirá la contraseña y luego el código. Las sucursales
    siguen entrando igual que siempre, sin código.
  · Guarda esta clave en tu gestor de contraseñas COMO RESPALDO:

        ${legible}

    Si pierdes el móvil, es lo único que te deja volver a dar de alta la app.
    Sin ella, la salida es borrar TOTP_ADMIN de la Lambda.
  · Cierra esta terminal cuando acabes. La clave está en pantalla.
`)
