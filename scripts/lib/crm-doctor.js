// Lo que el doctor del CRM COMPRUEBA, separado de cómo lo consulta.
//
// `scripts/crm-doctor.mjs` pregunta a AWS y a Meta; aquí sólo se decide si lo
// que contestaron está bien. Así las reglas se prueban sin AWS
// (`crm/doctor.test.js`) y el guion queda en pedir y pintar.
//
// Por qué existe: los cuatro fallos de producción del CRM tuvieron la misma
// firma. Nada reventaba; el bot dejaba de contestar y no había dónde mirar.
// Un secreto guardado con otra forma, un permiso que falta, un token vencido.
// Cada revisión de aquí sale de uno de esos.
//
// REGLA: nada de aquí devuelve ni escribe el VALOR de una variable. Se dice el
// nombre y qué regla no cumple.

import { SECRETOS, problemaDe } from '../../backend/scripts/poner-secreto.js'

export const BIEN = 'bien', AVISO = 'aviso', MAL = 'mal'
const r = (estado, que, detalle = '') => ({ estado, que, detalle })

export const FUNCION_TRABAJADOR = 'istuffs-crm-trabajador'
export const FUNCION_BACKEND = 'istuffs-backend'

/**
 * Las variables que cada función necesita para el CRM. `forma` devuelve el
 * motivo por el que el valor no sirve, o null. Los secretos usan las mismas
 * reglas con las que se guardan (`poner-secreto.js`): una sola lista.
 */
const secreto = nombre => v => problemaDe(nombre, v)
const con = (patron, forma) => v => (patron.test(v) ? null : `no tiene la forma esperada: ${forma}`)

export const VARIABLES = {
  [FUNCION_TRABAJADOR]: {
    obligatorias: {
      ANTHROPIC_API_KEY: secreto('ANTHROPIC_API_KEY'),
      WHATSAPP_TOKEN: secreto('WHATSAPP_TOKEN'),
      WHATSAPP_PHONE_NUMBER_ID: con(/^\d{8,20}$/, 'sólo dígitos (es el id del número, no el teléfono con +)'),
      S3_BUCKET: con(/^[a-z0-9.-]{3,63}$/, 'un nombre de bucket'),
    },
    opcionales: {
      S3_REGION: con(/^[a-z]{2}-[a-z]+-\d$/, 'una región, como us-east-1'),
      CRM_MODELO: con(/^claude-[a-z0-9.-]+$/, 'un id de modelo que empieza por «claude-»'),
      CRM_SITIO: con(/^https:\/\/[^\s/]+$/, 'https://dominio, sin barra final'),
      CRM_LEER_FOTOS: con(/^[01]$/, '0 o 1'),
      WHATSAPP_VERSION: con(/^v\d+\.\d+$/, 'como v21.0'),
    },
  },
  [FUNCION_BACKEND]: {
    obligatorias: {
      META_APP_SECRET: secreto('META_APP_SECRET'),
      META_VERIFY_TOKEN: secreto('META_VERIFY_TOKEN'),
      CRM_COLA_URL: con(/^https:\/\/sqs\.[a-z0-9-]+\.amazonaws\.com\/\d{12}\/istuffs-crm-mensajes\.fifo$/,
        'la URL de la cola istuffs-crm-mensajes.fifo'),
      S3_BUCKET: con(/^[a-z0-9.-]{3,63}$/, 'un nombre de bucket'),
    },
    opcionales: {},
  },
}

/** Los nombres de secreto que se guardaron en la función que no es. */
const FUERA_DE_SITIO = Object.fromEntries(Object.entries(SECRETOS).map(([n, s]) => [n, s.funcion]))

/** Revisa la FORMA de las variables de una función. Nunca devuelve un valor. */
export function revisarVariables(funcion, variables) {
  const reglas = VARIABLES[funcion]
  if (!reglas) return [r(MAL, funcion, 'el doctor no conoce esta función')]
  if (!variables || typeof variables !== 'object') {
    return [r(MAL, `${funcion}: variables`, 'no se pudieron leer')]
  }
  const salida = []
  for (const [nombre, forma] of Object.entries(reglas.obligatorias)) {
    const v = variables[nombre]
    if (v === undefined || v === '') { salida.push(r(MAL, `${funcion}: ${nombre}`, 'FALTA')); continue }
    const problema = forma(String(v))
    salida.push(problema ? r(MAL, `${funcion}: ${nombre}`, problema) : r(BIEN, `${funcion}: ${nombre}`, 'está y tiene la forma correcta'))
  }
  for (const [nombre, forma] of Object.entries(reglas.opcionales)) {
    const v = variables[nombre]
    if (v === undefined || v === '') continue
    const problema = forma(String(v))
    salida.push(problema ? r(MAL, `${funcion}: ${nombre}`, problema) : r(BIEN, `${funcion}: ${nombre}`, 'opcional, puesta y con la forma correcta'))
  }
  // Un secreto en la función equivocada no rompe nada… y no sirve de nada:
  // la que lo necesita sigue sin él. Ya pasó al guardarlos a mano.
  for (const [nombre, suya] of Object.entries(FUERA_DE_SITIO)) {
    if (suya !== funcion && variables[nombre] !== undefined) {
      salida.push(r(AVISO, `${funcion}: ${nombre}`, `está aquí y es de ${suya}: sobra en esta función`))
    }
  }
  return salida
}

/**
 * La configuración de la función contra `infra/crm-colas.json`.
 */
export function revisarFuncion(config, esperado) {
  if (!config) return [r(MAL, 'función del trabajador', 'no existe o no se pudo leer')]
  const salida = []
  for (const k of ['Runtime', 'Handler', 'Timeout', 'MemorySize']) {
    if (esperado?.[k] === undefined) continue
    salida.push(config[k] === esperado[k]
      ? r(BIEN, `trabajador: ${k}`, String(config[k]))
      : r(AVISO, `trabajador: ${k}`, `es ${config[k]} y el repositorio dice ${esperado[k]}`))
  }
  if (config.State && config.State !== 'Active') salida.push(r(MAL, 'trabajador: estado', config.State))
  if (config.LastUpdateStatus === 'Failed') salida.push(r(MAL, 'trabajador: último despliegue', 'falló'))
  return salida
}

/**
 * Los atributos de una cola. `esperado` son los de `infra/crm-colas.json`.
 * `tope` es cuántos mensajes a la vista se toleran: 0 en la de fallidos.
 */
export function revisarCola(nombre, atributos, esperado = {}, { fallidos = false } = {}) {
  if (!atributos) return [r(MAL, `cola ${nombre}`, 'no existe o no se pudo leer')]
  const salida = []
  for (const [k, v] of Object.entries(esperado)) {
    if (k === 'RedrivePolicy') {
      let real = null, quiere = null
      try { real = JSON.parse(atributos.RedrivePolicy ?? 'null'); quiere = JSON.parse(v) } catch { /* abajo */ }
      if (!real) { salida.push(r(MAL, `cola ${nombre}: fallidos`, 'no tiene cola de fallidos: un mensaje que falla se reintenta para siempre')); continue }
      salida.push(Number(real.maxReceiveCount) === Number(quiere?.maxReceiveCount)
        ? r(BIEN, `cola ${nombre}: intentos`, String(real.maxReceiveCount))
        : r(AVISO, `cola ${nombre}: intentos`, `son ${real.maxReceiveCount} y el repositorio dice ${quiere?.maxReceiveCount}`))
      if (!/istuffs-crm-fallidos\.fifo$/.test(String(real.deadLetterTargetArn ?? ''))) {
        salida.push(r(MAL, `cola ${nombre}: fallidos`, 'los fallidos no van a istuffs-crm-fallidos.fifo'))
      }
      continue
    }
    salida.push(String(atributos[k]) === String(v)
      ? r(BIEN, `cola ${nombre}: ${k}`, String(v))
      : r(k === 'FifoQueue' ? MAL : AVISO, `cola ${nombre}: ${k}`, `es ${atributos[k]} y el repositorio dice ${v}`))
  }
  const visibles = Number(atributos.ApproximateNumberOfMessages ?? 0)
  const enVuelo = Number(atributos.ApproximateNumberOfMessagesNotVisible ?? 0)
  if (fallidos) {
    salida.push(visibles > 0
      ? r(AVISO, `cola ${nombre}`, `${visibles} mensaje(s) que no se pudieron atender. Mirarlos antes de borrarlos: cada uno es un cliente sin respuesta`)
      : r(BIEN, `cola ${nombre}`, 'vacía'))
  } else {
    salida.push(visibles > 5
      ? r(MAL, `cola ${nombre}`, `${visibles} esperando: el trabajador no los está tomando`)
      : r(BIEN, `cola ${nombre}`, `${visibles} esperando, ${enVuelo} atendiéndose`))
  }
  return salida
}

/** El disparador que une la cola con el trabajador. */
export function revisarDisparador(mapeos, esperado = {}) {
  const m = (mapeos ?? []).find(x => /istuffs-crm-mensajes\.fifo$/.test(String(x?.EventSourceArn ?? '')))
  if (!m) return [r(MAL, 'disparador', 'la cola no está conectada al trabajador: los mensajes se encolan y nadie los atiende')]
  const salida = []
  salida.push(m.State === 'Enabled' ? r(BIEN, 'disparador', 'encendido') : r(MAL, 'disparador', `está ${m.State}: nadie atiende la cola`))
  if (esperado.BatchSize !== undefined) {
    salida.push(m.BatchSize === esperado.BatchSize
      ? r(BIEN, 'disparador: lote', String(m.BatchSize))
      : r(AVISO, 'disparador: lote', `es ${m.BatchSize} y el repositorio dice ${esperado.BatchSize}`))
  }
  const maxima = m.ScalingConfig?.MaximumConcurrency
  const quiere = esperado.ScalingConfig?.MaximumConcurrency
  if (quiere !== undefined) {
    salida.push(maxima === quiere
      ? r(BIEN, 'disparador: concurrencia máxima', String(maxima))
      // La cuenta tiene 10 en total: sin tope, el bot puede dejar sin sitio al
      // inicio de sesión del panel.
      : r(maxima === undefined ? MAL : AVISO, 'disparador: concurrencia máxima',
        maxima === undefined ? `sin tope, y la cuenta sólo tiene 10: debe ser ${quiere}` : `es ${maxima} y el repositorio dice ${quiere}`))
  }
  if (!(m.FunctionResponseTypes ?? []).includes('ReportBatchItemFailures')) {
    salida.push(r(MAL, 'disparador: fallos por mensaje', 'falta ReportBatchItemFailures: un turno que falla se da por atendido'))
  }
  return salida
}

/**
 * El enganche, visto desde fuera. Se le hacen dos llamadas que TIENEN que
 * rechazarse; las dos respuestas dicen si la ruta existe y si la firma se
 * comprueba, sin conocer ningún secreto.
 *
 *   GET con un token de verificación inventado → 403 { error: 'verificacion' }
 *   POST sin firma                             → 401 { error: 'firma' }
 */
export function revisarEnganche({ get, post }) {
  const salida = []
  if (!get) salida.push(r(MAL, 'enganche: GET', 'no contestó'))
  else if (get.estado === 403 && get.cuerpo?.error === 'verificacion') {
    // `motivo` distingue «token distinto» de «no hay token configurado».
    salida.push(/configur|falta/i.test(String(get.cuerpo?.motivo ?? ''))
      ? r(MAL, 'enganche: verificación', `rechaza, pero por configuración: ${get.cuerpo.motivo}`)
      : r(BIEN, 'enganche: verificación', 'la ruta existe y rechaza un token inventado'))
  } else if (get.estado === 200) {
    salida.push(r(MAL, 'enganche: verificación', 'ACEPTÓ un token inventado: cualquiera puede darse de alta como Meta'))
  } else salida.push(r(MAL, 'enganche: verificación', `contestó ${get.estado}: la ruta /meta/webhook no está donde se esperaba`))

  if (!post) salida.push(r(MAL, 'enganche: POST', 'no contestó'))
  else if (post.estado === 401 && post.cuerpo?.error === 'firma') salida.push(r(BIEN, 'enganche: firma', 'rechaza un aviso sin firma'))
  else if (post.estado >= 200 && post.estado < 300) {
    salida.push(r(MAL, 'enganche: firma', 'ACEPTÓ un aviso sin firma: cualquiera puede inyectar conversaciones'))
  } else salida.push(r(MAL, 'enganche: firma', `contestó ${post.estado} en vez de 401`))
  return salida
}

/**
 * El token, preguntándole a Meta por el propio número. `respuesta` es
 * `{ estado, error: { code, message } }` de Graph.
 */
export function revisarToken(respuesta) {
  if (!respuesta) return [r(AVISO, 'token de WhatsApp', 'no se pudo preguntar a Meta (¿sin red?)')]
  if (respuesta.estado === 200) return [r(BIEN, 'token de WhatsApp', 'Meta lo acepta para este número')]
  const codigo = respuesta.error?.code
  if (codigo === 190 || respuesta.estado === 401) {
    return [r(MAL, 'token de WhatsApp', `VENCIDO o revocado (código ${codigo ?? respuesta.estado}): el bot no puede contestar. Ver «Cuando el token vence» en crm/LEEME.md`)]
  }
  if (codigo === 100) return [r(MAL, 'token de WhatsApp', 'el token vale, pero no para este WHATSAPP_PHONE_NUMBER_ID')]
  return [r(MAL, 'token de WhatsApp', `Meta contestó ${respuesta.estado}, código ${codigo ?? '?'}`)]
}

/** Las alarmas que el repositorio dice que hay, contra las que existen. */
export function revisarAlarmas(existentes, esperadas) {
  if (!existentes) return [r(AVISO, 'alarmas', 'no se pudieron leer')]
  return esperadas.map(nombre => {
    const a = existentes.find(x => x.AlarmName === nombre)
    if (!a) return r(AVISO, `alarma ${nombre}`, 'no existe: ese fallo no avisaría a nadie')
    if (a.StateValue === 'ALARM') return r(MAL, `alarma ${nombre}`, 'DISPARADA ahora mismo')
    if (!(a.AlarmActions ?? []).length) return r(AVISO, `alarma ${nombre}`, 'existe pero no avisa a nadie (sin acción)')
    return r(BIEN, `alarma ${nombre}`, a.StateValue === 'INSUFFICIENT_DATA' ? 'puesta, aún sin datos' : 'puesta y en calma')
  })
}

/** Lo que el trabajador dejó apuntado en `crm/salud.json`. */
export function revisarSalud(salud) {
  if (salud === undefined) return [r(AVISO, 'salud del canal', 'no se pudo leer crm/salud.json')]
  const problemas = Object.entries(salud?.problemas ?? {})
  if (!problemas.length) return [r(BIEN, 'salud del canal', 'sin problema apuntado')]
  return problemas.map(([clase, p]) =>
    r(MAL, 'salud del canal', `el trabajador apuntó «${clase}»${p?.codigo ? ` (código ${p.codigo})` : ''} desde ${p?.desde ?? '?'}`))
}

const SIGNO = { [BIEN]: '✓', [AVISO]: '!', [MAL]: '✗' }

/** Pinta el informe y dice con qué código salir: 0 bien, 1 algo mal. */
export function informe(secciones) {
  const lineas = []
  let mal = 0, avisos = 0
  for (const { titulo, resultados } of secciones) {
    lineas.push('', titulo)
    for (const x of resultados) {
      if (x.estado === MAL) mal++
      if (x.estado === AVISO) avisos++
      lineas.push(`  ${SIGNO[x.estado]} ${x.que}${x.detalle ? ` — ${x.detalle}` : ''}`)
    }
  }
  lineas.push('', mal ? `✗ ${mal} cosa(s) mal${avisos ? ` y ${avisos} aviso(s)` : ''}.`
    : avisos ? `✓ Nada roto. ${avisos} aviso(s) que conviene mirar.` : '✓ Todo en orden.')
  return { texto: lineas.join('\n'), codigo: mal ? 1 : 0, mal, avisos }
}
