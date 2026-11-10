// Las correcciones que se hacen en la página, sin tocar el dato.
//
// ── Por qué una capa y no una edición ───────────────────────────────────────
//
// `inventario.json` se regenera desde el respaldo de Eleventa cuatro veces al
// día. Cualquier corrección escrita encima se borra sola esa misma tarde, así
// que editar el dato no es una opción: Eleventa manda.
//
// Por eso la corrección se guarda AL LADO y la página la aplica al leer:
//
//     respaldo → inventario.json ─┐
//                                  ├→ lo que se ve en el panel
//     tus ajustes → ajustes/*.json ┘
//
// Tres cosas que esto permite y editar el dato no:
//
//   · El ajuste sobrevive a la sincronización.
//   · Es reversible: se quita y vuelve a verse el dato crudo.
//   · **Se cierra solo.** Cuando el respaldo nuevo ya viene bien, el ajuste
//     deja de hacer falta y se archiva sin que nadie marque nada.
//
// ── Lo que NO hace ──────────────────────────────────────────────────────────
//
// La página pública no se toca: un mayorista ve lo que publica el inventario,
// en crudo. Los ajustes viven sólo dentro del panel.
//
// Y un error ajustado no desaparece: se MUDA. Sale de «Atención» y entra en
// «pendiente de corregir en caja», con su antigüedad. Sin esa regla, esto
// sería una forma cómoda de esconder problemas.

/**
 * Lo que se puede ajustar.
 *
 *   · `ocultar`       dejar de contar un código en los recuadros. Es la ✕, y
 *                     la baja definitiva: se APUNTA, no se borra.
 *   · `descontinuado` marcar que bodega ya no surte un código y las tiendas
 *                     liquidan lo que queda. NO oculta nada: el código sigue
 *                     vendiéndose y contando. Sólo hace que la cola de
 *                     revisión deje de reclamarlo como si fuera un error.
 *                     Lo pidió el dueño el 2026-11-09 como el flag
 *                     `descontinuado_bodega`.
 */
export const TIPOS = {
  OCULTAR: 'ocultar',
  DESCONTINUADO: 'descontinuado',
}

/**
 * Por qué se oculta. Lista cerrada a propósito: un motivo escrito a mano no
 * se puede contar, y el reporte que va a cada sucursal se ordena por esto.
 */
export const MOTIVOS = {
  // «Decidí darlo de baja» no es lo mismo que «ya no existe»: el código sigue
  // vivo en la caja y la decisión es nueva. Se separa porque el reporte que
  // baja a cada sucursal dice qué hacer, y aquí lo que hay que hacer es
  // borrarlo, no comprobar si se borró.
  'dado-de-baja':      'Se decidió darlo de baja',
  'ya-no-existe':      'El código ya no existe',
  'codigo-duplicado':  'Está duplicado con otro',
  'mal-capturado':     'Está mal capturado',
  'no-se-maneja-aqui': 'Esta plaza no lo maneja',
  // La baja definitiva SÓLO se registra por `/ajustes/bajas`, que comprueba en
  // el servidor que no tenga piezas ni ventas. Está aquí para poder ponerle
  // nombre en el archivo de bajas y en el Excel de cada sucursal.
  'baja-definitiva':   'Baja definitiva: sin existencia ni venta',
  'otro':              'Otro',
}

/** El único motivo del tipo `descontinuado`. */
export const MOTIVO_DESCONTINUADO = 'bodega-descontinuo'
export const TEXTO_DESCONTINUADO = 'Bodega lo descontinuó: las tiendas liquidan lo que queda'

export const ESTADOS = {
  PENDIENTE: 'pendiente',   // ámbar: corregido aquí, no en la caja
  RESUELTO:  'resuelto',    // el respaldo ya viene bien
}

/** Cuántos días lleva un pendiente sin que nadie lo toque en la caja. */
export const DIAS_PARA_INSISTIR = 21

const limpio = c => String(c ?? '').trim().toUpperCase()

/** La llave de un ajuste: un tipo y un código, una sola vez. */
export const claveDe = (tipo, codigo) => `${tipo}|${limpio(codigo)}`

/**
 * Un ajuste nuevo, listo para guardar.
 *
 * `quien` sale de la sesión, no del formulario: quién corrigió qué es la
 * mitad del valor de la bitácora.
 */
export function nuevoAjuste({ tipo = TIPOS.OCULTAR, codigo, producto = '', motivo, nota = '', quien, cuando = new Date() }) {
  if (!codigo) throw new Error('Un ajuste sin código no se puede aplicar a nada.')
  // El motivo es del tipo: «descontinuado» sólo lleva el suyo, y el suyo no
  // vale para ocultar. El servidor lo exige igual.
  const valido = tipo === TIPOS.DESCONTINUADO ? motivo === MOTIVO_DESCONTINUADO : Boolean(MOTIVOS[motivo])
  if (!valido) throw new Error(`Motivo desconocido: ${motivo}`)
  return {
    clave: claveDe(tipo, codigo),
    tipo,
    codigo: limpio(codigo),
    producto,
    motivo,
    nota,
    quien,
    cuando: cuando.toISOString(),
  }
}

/**
 * Junta los ajustes de todos. Si dos personas ajustaron el mismo código gana
 * el más reciente, igual que en la cola de revisión: que bodega y León digan
 * cosas distintas del mismo código es un dato, no un empate que esconder.
 */
export function juntarAjustes(porQuien) {
  const out = {}
  for (const [quien, lista] of Object.entries(porQuien ?? {})) {
    for (const a of lista ?? []) {
      const previo = out[a.clave]
      if (!previo || a.cuando > previo.cuando) out[a.clave] = { ...a, quien: a.quien ?? quien }
    }
  }
  return out
}

/** Dónde sigue existiendo un código, que es dónde hay que ir a corregirlo. */
export function dondeSigue(codigo, inventarios) {
  const c = limpio(codigo)
  const plazas = []
  for (const [slug, inv] of Object.entries(inventarios ?? {})) {
    const hay = (inv?.productos ?? []).some(p => limpio(p.Codigo) === c)
    if (hay) plazas.push(slug)
  }
  return plazas
}

/**
 * El estado de un ajuste, leído del respaldo y NO de que alguien lo marque.
 *
 * Para «ocultar», resuelto significa que el código ya no aparece en ninguna
 * plaza: alguien lo borró de verdad en la caja. Mientras siga ahí, sigue en
 * ámbar, aunque la página ya no lo enseñe. Es exactamente la regla que pidió
 * el dueño: si no se detecta que se corrigió, no cambia de color.
 */
export function estadoDe(ajuste, inventarios, hoy = new Date()) {
  const plazas = dondeSigue(ajuste.codigo, inventarios)
  const dias = Math.floor((hoy - new Date(ajuste.cuando)) / 86400000)
  return {
    estado: plazas.length === 0 ? ESTADOS.RESUELTO : ESTADOS.PENDIENTE,
    plazas,
    dias,
    // Un pendiente que nadie toca en tres semanas vuelve a ser una alerta,
    // pero de otra cosa: ya no del dato, sino de que nadie lo corrige.
    insiste: plazas.length > 0 && dias >= DIAS_PARA_INSISTIR,
  }
}

/**
 * Los códigos de una ficha de la cola de revisión, como TEXTO.
 *
 * Hace falta porque una ficha los guarda de dos formas: una suelta trae
 * `codigo` -un texto- y un lote trae `codigos`, que es una lista de OBJETOS
 * con su producto y sus piezas. Tratarlos igual daba «[object Object]» en
 * pantalla y, peor, un filtro que no filtraba nada: comparaba esa cadena
 * contra los códigos ocultos y nunca coincidía, así que corregir parecía
 * funcionar y la cola seguía preguntando lo mismo.
 */
export function codigosDeFicha(item) {
  const crudos = item?.codigos ?? (item?.codigo ? [item.codigo] : [])
  return crudos
    .map(c => (typeof c === 'string' ? c : c?.codigo))
    .filter(Boolean)
    .map(limpio)
}

/**
 * ¿Es una baja —algo que hay que borrar en la caja—? Los ajustes viejos no
 * traen `tipo` y son de ocultar.
 *
 * Hace falta porque `descontinuado` vive en el mismo archivo y NO es una
 * baja: contarlo como pendiente mandaría a la tienda a «corregir» un código
 * que lo único que hace es liquidarse.
 */
export const esBaja = a => (a?.tipo ?? TIPOS.OCULTAR) === TIPOS.OCULTAR

/** Los códigos que bodega descontinuó, en mayúsculas. */
export function codigosDescontinuados(ajustes) {
  return new Set(
    Object.values(ajustes ?? {})
      .filter(a => a?.tipo === TIPOS.DESCONTINUADO)
      .map(a => limpio(a.codigo)))
}

/** Los códigos que el panel no debe volver a reclamar. */
export function codigosOcultos(ajustes) {
  return new Set(
    Object.values(ajustes ?? {})
      .filter(a => a.tipo === TIPOS.OCULTAR)
      .map(a => a.codigo))
}

/**
 * Quita de una lista lo que ya está ajustado.
 *
 * Vive aquí y no dentro de cada pantalla a propósito: si cada panel filtrara
 * por su cuenta, bastaría con que uno se olvidara para que el error siguiera
 * saliendo en ese sitio y la corrección pareciera rota.
 */
export function sinOcultos(filas, ocultos, codigoDe = f => f.codigo) {
  if (!ocultos?.size) return filas ?? []
  return (filas ?? []).filter(f => !ocultos.has(limpio(codigoDe(f))))
}

/**
 * Lo que cada sucursal tiene que corregir en su caja.
 *
 * Es el reporte que baja el dueño y el que ve la sucursal en su panel. Se
 * arma de los ajustes pendientes, repartidos por la plaza donde el código
 * sigue vivo: corregirlo donde no existe no significa nada.
 */
export function pendientesPorPlaza(ajustes, inventarios, hoy = new Date()) {
  const porPlaza = {}
  for (const a of Object.values(ajustes ?? {}).filter(esBaja)) {
    const { estado, plazas, dias, insiste } = estadoDe(a, inventarios, hoy)
    if (estado !== ESTADOS.PENDIENTE) continue
    for (const slug of plazas) {
      ;(porPlaza[slug] ??= []).push({ ...a, dias, insiste })
    }
  }
  // Lo más viejo primero: es lo que lleva más tiempo ensuciando el panel.
  for (const lista of Object.values(porPlaza)) lista.sort((a, b) => b.dias - a.dias)
  return porPlaza
}

/** Resumen para el contador del menú. */
export function resumirAjustes(ajustes, inventarios, hoy = new Date()) {
  let pendientes = 0, resueltos = 0, insistiendo = 0
  for (const a of Object.values(ajustes ?? {}).filter(esBaja)) {
    const e = estadoDe(a, inventarios, hoy)
    if (e.estado === ESTADOS.RESUELTO) resueltos++
    else { pendientes++; if (e.insiste) insistiendo++ }
  }
  return { pendientes, resueltos, insistiendo, total: pendientes + resueltos }
}

// ── El archivo de bajas ───────────────────────────────────────────────────
//
// Lo pidió el dueño el 2026-11-08: «quisiera saber si lo borro, a dónde se va
// o dónde queda ese registro… me gustaría tener un archivo o un lugar para
// consultar eso».
//
// La respuesta a la primera parte es que NO SE BORRA NADA. La ✕ de Inventarios
// no toca el inventario —`inventario.json` se regenera desde el respaldo de
// Eleventa cuatro veces al día, así que escribir encima sería borrarlo esa
// misma tarde— sino que deja una nota al lado, en `ajustes/<quien>.json`.
//
// Lo que faltaba es la segunda parte, y era un agujero de verdad: la única
// pantalla que enseñaba esas notas —«Corregidos aquí, pendientes en la caja»,
// en Revisar— filtra por PENDIENTE. En cuanto el código desaparece de verdad
// del respaldo, el ajuste pasa a resuelto y **se cae de la pantalla**. El
// registro seguía entero en el archivo, porque nada lo borra nunca, pero no
// había forma de consultarlo: justo lo contrario de llevar un control.

/**
 * Todo lo que se ha dado de baja, resuelto o no.
 *
 * Lo RESUELTO va primero en la cabeza de quien pregunta -«¿qué he quitado?»-
 * pero en la lista va detrás: lo que todavía sigue en la caja es lo que pide
 * hacer algo hoy.
 */
export function historialDeBajas(correcciones, inventarios, hoy = new Date()) {
  const filas = Object.values(correcciones ?? {}).filter(esBaja).map(a => {
    const e = estadoDe(a, inventarios ?? {}, hoy)
    return {
      ...a,
      ...e,
      // El día en que el respaldo llegó sin él no se sabe: lo que se guarda es
      // cuándo se DECIDIÓ. Inventar una fecha de desaparición sería peor que
      // no darla, así que se dice lo que se sabe y nada más.
      resuelto: e.estado === ESTADOS.RESUELTO,
    }
  })

  return filas.sort((a, b) =>
    // Lo pendiente arriba, y dentro de cada grupo lo más viejo primero: es lo
    // que lleva más tiempo esperando a que alguien lo borre de la caja.
    (a.resuelto ? 1 : 0) - (b.resuelto ? 1 : 0)
    || String(b.cuando ?? '').localeCompare(String(a.cuando ?? '')))
}

/** Las cuentas del archivo, para el encabezado. */
export function resumenDeBajas(filas) {
  const pendientes = filas.filter(f => !f.resuelto)
  return {
    total:      filas.length,
    pendientes: pendientes.length,
    resueltas:  filas.length - pendientes.length,
    insisten:   pendientes.filter(f => f.insiste).length,
    // Por quién, para saber de dónde salen las decisiones.
    porQuien: Object.entries(filas.reduce((m, f) => {
      const k = f.quien || 'sin autor'
      m[k] = (m[k] || 0) + 1
      return m
    }, {})).sort((a, b) => b[1] - a[1]),
    porMotivo: Object.entries(filas.reduce((m, f) => {
      const k = MOTIVOS[f.motivo] ?? f.motivo ?? 'sin motivo'
      m[k] = (m[k] || 0) + 1
      return m
    }, {})).sort((a, b) => b[1] - a[1]),
  }
}
