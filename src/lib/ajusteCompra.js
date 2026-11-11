// Cambiar a mano lo que se va a pedir.
//
// ── Por qué ───────────────────────────────────────────────────────────────
//
// La cuenta propone una cantidad y casi siempre acierta, pero no sabe lo que
// sabe quien compra: que ese proveedor trae de a doce, que viene una feria,
// que ese modelo se va a descontinuar, que el dinero de este mes no da.
//
// Hasta ahora la sugerencia era de sólo lectura y el ajuste se hacía después,
// a mano, sobre el Excel ya bajado. Eso tiene dos problemas: el ajuste se
// pierde en cuanto se vuelve a bajar el archivo, y el total de la pantalla
// deja de cuadrar con el de la hoja.
//
// Aquí el ajuste se queda pegado al código y el Excel sale ya con él.
//
// ── Lo que NO se borra ────────────────────────────────────────────────────
//
// La sugerencia original. Se guarda al lado como `sugeridoOriginal` y se
// enseña, porque un número cambiado sin referencia no se puede revisar: a la
// semana nadie recuerda si 24 era lo que dijo la cuenta o lo que alguien
// escribió. Y la diferencia entre los dos es justo lo que conviene mirar.

const limpio = v => String(v ?? '').trim().toUpperCase()

/** Dónde vive. Por navegador: es una decisión de quien compra, no un dato. */
export const CLAVE_GUARDADO = 'istuffs_ajuste_compra'

/**
 * 🔒 Tope por línea.
 *
 * Diez mil piezas de un modelo no es una compra, es un dedo que se quedó
 * pulsado. El tope no es una regla de negocio: es lo que separa un error de
 * tecleo de una decisión, y sin él un cero de más se lleva el presupuesto.
 */
export const MAXIMO = 10000

/**
 * La llave de un ajuste.
 *
 * Lleva el ámbito delante porque el mismo código significa dos cosas según
 * dónde se ajuste: «comprar 50 al proveedor» y «mandar 50 a León» no son la
 * misma decisión y no pueden pisarse.
 */
export const claveDe = (ambito, codigo) => `${ambito}|${limpio(codigo)}`

/**
 * Interpreta lo que se escribió en la celda.
 *
 * Devuelve `{ ok, valor }` o `{ ok: false, porque }`. El texto vacío NO es
 * cero: es «quítame el ajuste», que es lo que uno espera al borrar la celda y
 * salir. Un cero escrito a propósito sí es cero —«de éste no pidas ninguno»—
 * y eso es una decisión que hay que poder tomar.
 */
export function interpretar(texto) {
  const t = String(texto ?? '').trim()
  if (t === '') return { ok: true, valor: null, quitar: true }

  // Se acepta «1,200» y «1 200»: es como se teclea una cantidad.
  const limpiado = t.replace(/[\s,]/g, '')
  if (!/^\d+$/.test(limpiado)) return { ok: false, porque: 'Sólo números enteros.' }

  const n = Number(limpiado)
  if (!Number.isFinite(n)) return { ok: false, porque: 'No es un número.' }
  if (n > MAXIMO) return { ok: false, porque: `Más de ${MAXIMO.toLocaleString('es-MX')} piezas: revisa si sobra un cero.` }
  return { ok: true, valor: n, quitar: false }
}

/** Pone o quita un ajuste. Devuelve un mapa nuevo, nunca muta el de entrada. */
export function conAjuste(ajustes, ambito, codigo, valor) {
  const k = claveDe(ambito, codigo)
  const out = { ...(ajustes ?? {}) }
  if (valor === null || valor === undefined) delete out[k]
  else out[k] = valor
  return out
}

/**
 * Aplica los ajustes a las filas calculadas.
 *
 * Cada fila ajustada sale con `sugerido` cambiado, `sugeridoOriginal` con lo
 * que decía la cuenta y `ajustado: true`. Las demás salen tal cual, sin
 * copiarse: así una tabla sin ajustes no vuelve a dibujarse entera.
 */
export function aplicarAjustes(filas, ajustes, ambito) {
  if (!ajustes || !Object.keys(ajustes).length) return filas ?? []
  return (filas ?? []).map(f => {
    const v = ajustes[claveDe(ambito, f.codigo)]
    if (v === undefined) return f
    return { ...f, sugerido: v, sugeridoOriginal: f.sugerido, ajustado: true }
  })
}

/** Cuántos ajustes hay en este ámbito, y cuánto suman de más o de menos. */
export function resumirAjustes(filas) {
  const tocadas = (filas ?? []).filter(f => f.ajustado)
  const diferencia = tocadas.reduce((a, f) => a + (f.sugerido - f.sugeridoOriginal), 0)
  return {
    cuantos: tocadas.length,
    diferencia,
    subidas: tocadas.filter(f => f.sugerido > f.sugeridoOriginal).length,
    bajadas: tocadas.filter(f => f.sugerido < f.sugeridoOriginal).length,
  }
}

/** Quita todos los ajustes de un ámbito, dejando los de los demás. */
export function limpiarAmbito(ajustes, ambito) {
  const out = {}
  for (const [k, v] of Object.entries(ajustes ?? {})) {
    if (!k.startsWith(`${ambito}|`)) out[k] = v
  }
  return out
}

/** Lee lo guardado. Nunca revienta: un guardado corrupto se descarta. */
export function leerGuardado(storage) {
  try {
    const crudo = storage?.getItem(CLAVE_GUARDADO)
    if (!crudo) return {}
    const v = JSON.parse(crudo)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    // Se filtra al leer, no sólo al escribir: lo guardado pudo quedar de una
    // versión anterior con otra forma, y un valor raro aquí se convierte en
    // una cantidad a comprar.
    const out = {}
    for (const [k, n] of Object.entries(v)) {
      if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAXIMO) out[k] = n
    }
    return out
  } catch {
    return {}
  }
}

/** Guarda. Si el navegador no deja -modo privado-, no se rompe nada. */
export function guardar(storage, ajustes) {
  try { storage?.setItem(CLAVE_GUARDADO, JSON.stringify(ajustes ?? {})) } catch { /* da igual */ }
}
