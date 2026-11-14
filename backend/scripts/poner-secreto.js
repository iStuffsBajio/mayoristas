// Pone UN secreto del CRM en la Lambda que le toca, sin que pase por el chat,
// sin que se vea en pantalla y SIN GUARDAR NADA QUE NO TENGA LA FORMA CORRECTA.
//
//   node backend/scripts/poner-secreto.js ANTHROPIC_API_KEY
//   node backend/scripts/poner-secreto.js WHATSAPP_TOKEN
//   node backend/scripts/poner-secreto.js META_APP_SECRET
//   node backend/scripts/poner-secreto.js META_VERIFY_TOKEN
//
// Por qué existe, pudiendo usar `anadir-variable-lambda.js` a pelo:
//
//   El 2026-11-12 las cuatro llaves del CRM se guardaron MAL. Se pegó un
//   bloque de varias líneas en la terminal y `Read-Host` se tragó otras líneas
//   del bloque como si fueran la respuesta: en la Lambda quedaron textos con
//   espacios en vez de llaves. Nada lo avisó. El único síntoma fue que Meta
//   llamaba y el backend rechazaba la firma, sin dejar rastro en el registro.
//
//   Un secreto guardado con la forma equivocada falla en silencio y cuesta una
//   tarde. Aquí cada nombre lleva el patrón que SU valor tiene que cumplir, y
//   lo que no lo cumple NO se envía.
//
// NUNCA imprime un valor. Ni al fallar: dice qué regla no se cumplió, no qué
// llegó.

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))

// Qué función lleva cada secreto, y la forma que tiene que tener.
export const SECRETOS = {
  ANTHROPIC_API_KEY: {
    funcion: 'istuffs-crm-trabajador',
    patron: /^sk-ant-[A-Za-z0-9_-]{30,}$/,
    forma: 'empieza por «sk-ant-», sin espacios',
  },
  WHATSAPP_TOKEN: {
    funcion: 'istuffs-crm-trabajador',
    patron: /^EAA[A-Za-z0-9]{50,}$/,
    forma: 'empieza por «EAA», una sola cadena sin espacios',
  },
  META_APP_SECRET: {
    funcion: 'istuffs-backend',
    patron: /^[0-9a-f]{32}$/i,
    forma: '32 letras y números (hexadecimal), sin espacios',
  },
  META_VERIFY_TOKEN: {
    funcion: 'istuffs-backend',
    patron: /^[A-Za-z0-9_-]{16,}$/,
    forma: 'al menos 16 caracteres entre letras, números y guiones, sin espacios',
  },
}

/** Devuelve null si el valor sirve, o el motivo (sin repetir el valor). */
export function problemaDe(nombre, valor) {
  const regla = SECRETOS[nombre]
  if (!regla) return `«${nombre}» no es un secreto que esta herramienta conozca`
  if (!valor) return 'llegó vacío'
  if (/\s/.test(valor)) {
    return 'tiene espacios o saltos de línea: lo más probable es que se haya pegado otra cosa'
  }
  if (!regla.patron.test(valor)) return `no tiene la forma de ${nombre}: ${regla.forma}`
  return null
}

/** Lee una línea sin mostrarla. Con una tubería (no hay terminal), la lee tal cual. */
function leerOculto(pregunta) {
  return new Promise(resolve => {
    process.stderr.write(pregunta)
    const entrada = process.stdin
    let texto = ''
    const eraRaw = entrada.isTTY
    if (eraRaw) entrada.setRawMode(true)
    entrada.resume()
    entrada.setEncoding('utf8')
    const alDato = trozo => {
      for (const c of trozo) {
        if (c === '\r' || c === '\n') {
          // Se corta en la PRIMERA línea: lo que venga detrás, de un pegado de
          // varias líneas, se descarta en vez de quedarse esperando.
          entrada.removeListener('data', alDato)
          if (eraRaw) entrada.setRawMode(false)
          entrada.pause()
          process.stderr.write('\n')
          return resolve(texto)
        }
        if (c === '\u0003') process.exit(130) // Ctrl+C
        if (c === '\u007f' || c === '\b') texto = texto.slice(0, -1)
        else texto += c
      }
    }
    entrada.on('data', alDato)
    entrada.on('end', () => resolve(texto))
  })
}

async function principal() {
  const nombre = (process.argv[2] || '').trim()
  if (!SECRETOS[nombre]) {
    console.error(`Uso: node backend/scripts/poner-secreto.js <${Object.keys(SECRETOS).join('|')}>`)
    process.exit(1)
  }
  const { funcion } = SECRETOS[nombre]

  console.error(`\n${nombre} irá a la función ${funcion}.`)
  const valor = (await leerOculto('Pega el valor y pulsa Enter (no se verá nada): ')).trim()

  const problema = problemaDe(nombre, valor)
  if (problema) {
    console.error(`\n✗ No se guardó nada. El valor ${problema}.`)
    console.error('  Copia el valor de nuevo desde su origen y repite este mismo comando.')
    process.exit(2)
  }

  const out = execFileSync(
    process.execPath,
    [path.join(AQUI, 'anadir-variable-lambda.js'), `${nombre}=${valor}`, '--aplicar'],
    { env: { ...process.env, LAMBDA_FUNCION: funcion }, encoding: 'utf8' },
  )
  const resumen = out.split('\n').filter(l => /^(Función|Variables|Acción)/.test(l)).join('\n')
  console.error(`\n✓ ${nombre} guardado (largo ${valor.length}).\n${resumen}\n`)
}

// Sólo corre como guion; importarlo para probar `problemaDe` no pregunta nada.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch(e => {
    console.error('✗ Falló:', String(e.message || e).split('\n')[0])
    process.exit(1)
  })
}
