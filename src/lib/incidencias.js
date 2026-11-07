// El ciclo de vida de cada incidencia de la cola de revisión.
//
// ── Qué problema resuelve ─────────────────────────────────────────────────
//
// La pestaña sólo generaba reportes. Los mismos casos salían una y otra vez
// aunque ya se hubieran mirado, y no había forma de saber qué estaba
// corregido en la página y qué faltaba que corrigiera la sucursal.
//
// ── Lo que NO se hace, y por qué ──────────────────────────────────────────
//
// No hay una tabla de incidencias guardadas. Los hallazgos se siguen
// **recalculando del respaldo en cada carga**, y encima se pone esta capa de
// estado. Lo decidió el dueño entre las dos opciones, y la razón es la que ya
// costó dos veces en este proyecto: **un dato guardado aparte del respaldo
// acaba mintiendo**. Con una tabla propia aparecería una clase de error nueva
// —incidencias que ya no corresponden a ningún dato real— y nadie la vería.
//
// Aquí el respaldo siempre manda: si el hallazgo deja de detectarse, la
// incidencia se cierra sola. No hay zombis posibles.
//
// ── La huella, y el fallo que tenía ───────────────────────────────────────
//
// Cada incidencia se reconoce por una huella estable. Tres de las cuatro
// reglas ya la tenían bien —`cod|CÓDIGO`, `nom|CÓDIGO`, `pat|palabraA>palabraB`—
// pero **el lote se identificaba sólo por su clase**: `lote|sin-existencia`.
//
// Eso no causaba duplicados: causaba lo contrario, y es peor. Si el lote
// pasaba de 30 códigos a otros 12 distintos, **heredaba la respuesta vieja y
// llegaba a la cola ya marcado como hecho**. Desaparecía sin que nadie lo
// mirara. Por eso la huella de un lote incluye ahora sus códigos.

const limpio = v => String(v ?? '').trim().toUpperCase()

/** Los estados por los que pasa una incidencia. */
export const ESTADOS = {
  NUEVA:      'nueva',       // la detectó el sistema y nadie la ha tocado
  REVISANDO:  'revisando',   // alguien la está atendiendo
  EN_ORIGEN:  'en-origen',   // resuelta en la página, pendiente en la caja
  CERRADA:    'cerrada',     // el respaldo ya no la detecta: verificada sola
  DESCARTADA: 'descartada',  // no era un error
  CONFLICTO:  'conflicto',   // se dio por cerrada y volvió a aparecer
}

/** Lo que el usuario puede ELEGIR. Los otros dos los decide el respaldo. */
export const ESTADOS_QUE_SE_ELIGEN = [
  ESTADOS.REVISANDO, ESTADOS.EN_ORIGEN, ESTADOS.DESCARTADA,
]

export const TEXTO_ESTADO = {
  [ESTADOS.NUEVA]:      'Nueva',
  [ESTADOS.REVISANDO]:  'En revisión',
  [ESTADOS.EN_ORIGEN]:  'Pendiente en sucursal',
  [ESTADOS.CERRADA]:    'Cerrada y verificada',
  [ESTADOS.DESCARTADA]: 'Descartada',
  [ESTADOS.CONFLICTO]:  'Reabierta',
}

/** 🔒 Gravedad y plazo de atención. Editable desde la página. */
export const GRAVEDADES = {
  critica: { orden: 0, texto: 'Crítica', horas: 24,  nota: 'toca efectivo, inventario de clase A o la compra' },
  alta:    { orden: 1, texto: 'Alta',    horas: 48,  nota: 'afecta indicadores o el surtido' },
  media:   { orden: 2, texto: 'Media',   horas: 120, nota: '' },
  baja:    { orden: 3, texto: 'Baja',    horas: null, nota: 'cosmética o informativa' },
}

/**
 * 🔒 Gravedad por defecto de cada paso de la cola.
 *
 * Sale del mismo orden que ya decidió el dueño en `PASO` —lo que hay que
 * HACER con cada ficha, no cuántas piezas tiene— así que no es una escala
 * nueva: es la que ya estaba, puesta en palabras de gravedad.
 *
 * Se puede cambiar por incidencia desde la página; lo elegido manda sobre
 * esto.
 */
export const GRAVEDAD_POR_PASO = {
  borrar:    'media',
  vivo:      'critica',   // se vende y bodega no lo tiene: cuesta ventas cada semana
  duplicado: 'alta',      // parte en dos todo lo que se cuente de ese teléfono
  decidir:   'media',
  anotar:    'baja',
  ignorar:   'baja',
  nombre:    'baja',
}

/** Una huella corta y estable a partir de una lista de códigos. */
function huellaDeCodigos(codigos) {
  const ord = [...new Set((codigos ?? []).map(limpio).filter(Boolean))].sort()
  if (!ord.length) return 'vacio'
  // Suma de comprobación sencilla: no hace falta criptografía, hace falta que
  // cambie cuando cambie el contenido y que quepa en una clave.
  let h = 0
  for (const c of ord.join(',')) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0
  return `${ord.length}x${(h >>> 0).toString(36)}`
}

/**
 * La huella de un hallazgo. Es lo que une la detección de hoy con lo que se
 * contestó ayer.
 *
 * Para un LOTE incluye sus códigos: sin eso, un lote con otro contenido
 * heredaba la respuesta vieja y entraba a la cola ya contestado.
 */
export function huellaDe(hallazgo) {
  const id = String(hallazgo?.id ?? '')
  if (!id.startsWith('lote|')) return id
  return `${id}|${huellaDeCodigos((hallazgo.codigos ?? []).map(c => (typeof c === 'string' ? c : c?.codigo)))}`
}

/**
 * El estado de una incidencia, cruzando lo detectado hoy con lo guardado.
 *
 * `registro` es lo que se guardó la última vez: `{ estado, nota, fecha,
 * gravedad, responsable, compromiso }`. `sigueVivo` dice si el respaldo de
 * hoy todavía produce ese hallazgo.
 */
export function estadoDe({ registro, sigueVivo, hoy = new Date() }) {
  if (!registro) {
    // Un hallazgo que ya no se detecta y nunca se contestó no es nada: se
    // arregló solo o nunca importó. No se inventa una incidencia cerrada.
    return sigueVivo ? { estado: ESTADOS.NUEVA, dias: 0 } : null
  }

  const desde = new Date(registro.fecha ?? 0)
  const dias = Math.max(0, Math.round(
    (new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
      - new Date(desde.getFullYear(), desde.getMonth(), desde.getDate())) / 86400000))

  // El respaldo manda: si ya no se detecta, está cerrada, lo diga quien lo
  // diga. Es la verificación automática y no la hace una persona.
  if (!sigueVivo) {
    return { estado: ESTADOS.CERRADA, dias, verificada: true, registro }
  }

  // Se dio por cerrada o descartada y el respaldo la sigue produciendo.
  if (registro.estado === ESTADOS.CERRADA) {
    return { estado: ESTADOS.CONFLICTO, dias, registro }
  }

  if (registro.estado === ESTADOS.DESCARTADA) {
    return { estado: ESTADOS.DESCARTADA, dias, registro }
  }
  if (registro.estado === ESTADOS.EN_ORIGEN) {
    return { estado: ESTADOS.EN_ORIGEN, dias, registro }
  }
  if (registro.estado === ESTADOS.REVISANDO) {
    return { estado: ESTADOS.REVISANDO, dias, registro }
  }
  return { estado: ESTADOS.NUEVA, dias, registro }
}

/** La gravedad de una incidencia: la elegida manda sobre la del paso. */
export const gravedadDe = (hallazgo, registro) =>
  registro?.gravedad && GRAVEDADES[registro.gravedad]
    ? registro.gravedad
    : (GRAVEDAD_POR_PASO[hallazgo?.paso] ?? 'media')

/**
 * Si se pasó el plazo. Sólo cuenta para lo que sigue abierto: una cerrada
 * fuera de plazo ya no se puede atender, y marcarla en rojo sería ruido.
 */
export function vencida(inc, hoy = new Date()) {
  const g = GRAVEDADES[inc?.gravedad]
  if (!g?.horas) return false
  if ([ESTADOS.CERRADA, ESTADOS.DESCARTADA].includes(inc?.estado)) return false
  const desde = inc?.registro?.fecha ? new Date(inc.registro.fecha) : null
  if (!desde) return false
  return (hoy - desde) / 3600000 > g.horas
}

/**
 * Junta los hallazgos de hoy con lo guardado, y devuelve las incidencias.
 *
 * Incluye también las que YA NO se detectan pero tienen registro: son las
 * cerradas por verificación, y hay que poder verlas o la verificación
 * automática no se nota.
 */
export function conciliar({ hallazgos, registros = {}, hoy = new Date() }) {
  const vistas = new Set()
  const out = []

  for (const h of hallazgos ?? []) {
    const huella = huellaDe(h)
    vistas.add(huella)
    const registro = registros[huella] ?? null
    const e = estadoDe({ registro, sigueVivo: true, hoy })
    if (!e) continue
    const gravedad = gravedadDe(h, registro)
    out.push({ ...e, huella, hallazgo: h, gravedad, vencida: false })
  }

  // Lo guardado que el respaldo ya NO produce: cerrado y verificado solo.
  for (const [huella, registro] of Object.entries(registros)) {
    if (vistas.has(huella)) continue
    const e = estadoDe({ registro, sigueVivo: false, hoy })
    if (!e) continue
    out.push({ ...e, huella, hallazgo: null, gravedad: registro.gravedad ?? 'media', vencida: false })
  }

  for (const inc of out) inc.vencida = vencida(inc, hoy)
  return out
}

/**
 * El orden de la bandeja: lo vencido primero, luego gravedad, luego
 * antigüedad.
 *
 * No se ordena por impacto en piezas a propósito, por lo mismo que la cola
 * nunca lo hizo: el lote de los 30 códigos sin existencia tiene 0 piezas y
 * caería al último puesto siendo el más fácil de resolver.
 */
export function ordenar(incidencias) {
  const peso = e => ({
    [ESTADOS.CONFLICTO]: 0, [ESTADOS.NUEVA]: 1, [ESTADOS.REVISANDO]: 2,
    [ESTADOS.EN_ORIGEN]: 3, [ESTADOS.DESCARTADA]: 4, [ESTADOS.CERRADA]: 5,
  }[e] ?? 9)
  return [...(incidencias ?? [])].sort((a, b) =>
    (b.vencida ? 1 : 0) - (a.vencida ? 1 : 0)
    || peso(a.estado) - peso(b.estado)
    || GRAVEDADES[a.gravedad].orden - GRAVEDADES[b.gravedad].orden
    || b.dias - a.dias)
}

/** Las cuentas del encabezado. */
export function resumir(incidencias, hoy = new Date()) {
  const de = e => incidencias.filter(i => i.estado === e)
  const abiertas = incidencias.filter(i =>
    ![ESTADOS.CERRADA, ESTADOS.DESCARTADA].includes(i.estado))

  const haceUnaSemana = new Date(hoy)
  haceUnaSemana.setDate(haceUnaSemana.getDate() - 7)

  return {
    nuevas:     de(ESTADOS.NUEVA).length,
    revisando:  de(ESTADOS.REVISANDO).length,
    enOrigen:   de(ESTADOS.EN_ORIGEN).length,
    conflictos: de(ESTADOS.CONFLICTO).length,
    descartadas: de(ESTADOS.DESCARTADA).length,
    cerradas:   de(ESTADOS.CERRADA).length,
    vencidas:   abiertas.filter(i => i.vencida).length,
    // Antigüedad de lo abierto, que es lo que dice si la cola se atiende.
    frescas:    abiertas.filter(i => i.dias <= 2).length,
    medias:     abiertas.filter(i => i.dias > 2 && i.dias <= 7).length,
    viejas:     abiertas.filter(i => i.dias > 7).length,
    cerradasEstaSemana: de(ESTADOS.CERRADA)
      .filter(i => i.registro?.fecha && new Date(i.registro.fecha) >= haceUnaSemana).length,
    abiertas:   abiertas.length,
    total:      incidencias.length,
  }
}
