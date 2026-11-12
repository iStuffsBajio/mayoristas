// Dónde se guarda lo que ya se habló con cada persona.
//
// ── Por qué hace falta guardarlo ────────────────────────────────────────────
//
// Cada mensaje que llega es una invocación nueva de la Lambda: no comparte
// proceso con la anterior y no recuerda nada. Sin almacén, el bot saluda de
// cero en cada mensaje y vuelve a preguntar la ciudad que acaban de darle.
//
// ── Y por qué se guarda el historial COMPLETO ───────────────────────────────
//
// Lo que `contestar()` devuelve en `historial` incluye las llamadas a
// herramientas y sus resultados, no sólo el texto. Eso parece de más y no lo
// es: sin ellas el modelo no sabe que ya consultó el inventario y lo vuelve a
// consultar, o peor, se inventa el número que «recuerda» del turno anterior.
//
// ── El anuncio se guarda en el PRIMER mensaje o se pierde ───────────────────
//
// Meta manda el objeto `referral` sólo cuando la conversación arranca desde un
// anuncio. Del segundo mensaje en adelante ya no viene. Si no se guarda ahí
// mismo, la atribución —de qué anuncio salió esta venta— desaparece y con ella
// la única forma de saber qué publicidad sirve.
//
// ── La forma del almacén ────────────────────────────────────────────────────
//
// Dos implementaciones con la misma interfaz: `enMemoria()` para las pruebas y
// para correr en una sola máquina, y `enArchivo()` para probar el bot en
// local sin perder las conversaciones al reiniciar. En la nube va una tercera,
// `enS3()` en `almacen-s3.js`, con la misma interfaz, y por eso vive detrás de
// ella: cambiar de almacén no debe tocar el orquestador.

import fs from 'node:fs'
import path from 'node:path'

/**
 * Cuánto se conserva una conversación antes de empezar de cero.
 *
 * Importa más de lo que parece. Quien vuelve a escribir tres semanas después
 * viene por otra cosa y con otro teléfono: arrastrarle el historial hace que
 * el bot le hable de la funda que preguntó en octubre. Y arrastrarlo también
 * cuesta: el historial entero se manda al modelo en cada turno.
 */
export const DIAS_DE_VIDA = 7

/** Turnos que se conservan. Lo viejo se tira por la cabeza, no por la cola. */
export const MAX_TURNOS = 40

const vacia = telefono => ({
  telefono,
  nombre: null,
  plaza: null,
  anuncio: null,
  historial: [],
  creada: new Date().toISOString(),
  vista: new Date().toISOString(),
  mensajesVistos: [],
})

/** True si la conversación ya caducó y hay que arrancar de nuevo. */
export function caducada(c, { ahora = Date.now() } = {}) {
  if (!c?.vista) return true
  return ahora - new Date(c.vista).getTime() > DIAS_DE_VIDA * 86400000
}

/**
 * Recorta el historial dejando los últimos turnos.
 *
 * Corta por delante y **nunca parte un par**: un mensaje del asistente con
 * `tool_use` tiene que ir seguido de sus `tool_result`, o la API rechaza la
 * petición entera con un 400. Por eso se busca el primer corte que caiga en un
 * turno de usuario que no sea de resultados.
 */
export function recortarHistorial(historial, max = MAX_TURNOS) {
  if (!Array.isArray(historial) || historial.length <= max) return historial ?? []

  // Un corte limpio es un mensaje de usuario que NO son resultados de
  // herramienta: ahí empieza un turno de verdad.
  const esCorteLimpio = m =>
    m?.role === 'user' &&
    !(Array.isArray(m.content) && m.content.some(b => b?.type === 'tool_result'))

  const objetivo = historial.length - max
  const cortes = historial.reduce((acc, m, i) => (esCorteLimpio(m) && acc.push(i), acc), [])

  // Se prefiere el corte justo antes del objetivo, aunque conserve algunos
  // turnos de más: `max` es un presupuesto, no una frontera. Quedarse corto y
  // válido vale más que tirar la conversación entera. Lo que no se acepta es
  // conservar el doble, y para eso está el límite de `max` hacia atrás.
  const antes = cortes.filter(i => i <= objetivo && objetivo - i <= max).at(-1)
  if (antes !== undefined) return historial.slice(antes)

  // Si no hay ninguno cerca por detrás, el primero que venga por delante,
  // aunque conserve menos de lo pedido.
  const despues = cortes.find(i => i > objetivo)
  if (despues !== undefined) return historial.slice(despues)

  // Y si no hay ningún corte limpio en todo el historial, es mejor empezar de
  // cero que mandar algo que la API va a rechazar con un 400.
  return []
}

/** Lo que se le añade a una conversación cuando llega un mensaje con anuncio. */
export function conAnuncio(c, anuncio) {
  // El primero manda: si alguien vuelve a entrar por otro anuncio dentro de la
  // misma conversación, la venta sigue siendo del que la trajo.
  if (!anuncio || c.anuncio) return c
  return { ...c, anuncio }
}

// ── Las implementaciones ────────────────────────────────────────────────────

/**
 * Los cuatro métodos del almacén, sobre un leer y un escribir crudos.
 *
 * Se exporta desde el 2026-11-11 para que el almacén de S3 (`almacen-s3.js`)
 * salga de aquí mismo en vez de copiar `yaAtendido` y `olvidarMensaje`: son
 * las dos funciones que ya costaron un «el cliente no recibe nada nunca», y
 * una segunda copia es una segunda oportunidad de romperlas.
 */

export function conMetodos(leerCrudo, escribirCrudo) {
  return {
    /** La conversación de un teléfono. Si caducó, devuelve una nueva. */
    async obtener(telefono, opts) {
      const guardada = await leerCrudo(telefono)
      if (!guardada || caducada(guardada, opts)) return vacia(telefono)
      return guardada
    },

    async guardar(c) {
      await escribirCrudo(c.telefono, {
        ...c,
        historial: recortarHistorial(c.historial),
        vista: new Date().toISOString(),
      })
    },

    /**
     * ¿Ya se atendió este mensaje? Marca y contesta en una sola operación.
     *
     * Va junto con la conversación y no en una lista aparte a propósito: así
     * el descarte de repetidos sobrevive a un reinicio igual que el historial.
     */
    async yaAtendido(telefono, idMensaje) {
      if (!idMensaje) return false
      const c = await leerCrudo(telefono)
      const vistos = c?.mensajesVistos ?? []
      if (vistos.includes(idMensaje)) return true
      await escribirCrudo(telefono, {
        ...(c ?? vacia(telefono)),
        // Sólo los últimos: Meta reintenta en minutos, no en días.
        mensajesVistos: [...vistos, idMensaje].slice(-20),
      })
      return false
    },

    /**
     * Desmarca un mensaje que se marcó y luego falló.
     *
     * Hace falta porque el descarte de repetidos se pone ANTES de contestar
     * —si no, Meta reintenta y el cliente recibe dos respuestas—, y eso tiene
     * un filo: si el cerebro o el envío truenan después de marcar, el
     * reintento de Meta se descarta y la persona **no recibe nada nunca**.
     * Salió en el simulador: el turno fallaba y el siguiente intento decía
     * «repetido».
     *
     * Desmarcando, el reintento vuelve a entrar. Si el fallo es permanente,
     * Meta reintenta unas cuantas veces y se rinde, que es mejor que el
     * silencio.
     */
    async olvidarMensaje(telefono, idMensaje) {
      if (!idMensaje) return
      const c = await leerCrudo(telefono)
      if (!c?.mensajesVistos?.length) return
      await escribirCrudo(telefono, {
        ...c,
        mensajesVistos: c.mensajesVistos.filter(x => x !== idMensaje),
      })
    },
  }
}

/** Para las pruebas y para una sola máquina. */
export function enMemoria() {
  const datos = new Map()
  const api = conMetodos(
    async t => datos.get(t) ?? null,
    async (t, c) => { datos.set(t, c) },
  )
  return { ...api, get tamano() { return datos.size }, _datos: datos }
}

/**
 * Para probar el bot en local sin perder lo hablado al reiniciar.
 *
 * Un archivo por teléfono, no uno compartido: dos mensajes que llegan a la vez
 * se pisarían el archivo entre ellos, que es el mismo error que ya se evitó en
 * `revisiones/<quien>.json`.
 */
export function enArchivo(carpeta) {
  fs.mkdirSync(carpeta, { recursive: true })
  const rutaDe = t => path.join(carpeta, `${String(t).replace(/\D/g, '')}.json`)

  return conMetodos(
    async t => {
      try { return JSON.parse(fs.readFileSync(rutaDe(t), 'utf8')) } catch { return null }
    },
    async (t, c) => {
      fs.writeFileSync(rutaDe(t), JSON.stringify(c, null, 2))
    },
  )
}
