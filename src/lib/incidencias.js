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
/**
 * La configuración —excepciones y catálogo de códigos— se guarda en el mismo
 * sitio que las respuestas, porque es el único archivo por persona que ya se
 * junta al leer. Se distingue por el prefijo y nunca es una incidencia.
 */
export const PREFIJO_CONFIG = 'cfg|'
export const esConfig = huella => String(huella ?? '').startsWith(PREFIJO_CONFIG)

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
    // La configuración vive en el mismo archivo y NO es una incidencia.
    // Sin este filtro, cada excepción y cada entrada del catálogo salía en
    // la bandeja como una cerrada fantasma: un registro sin hallazgo se lee
    // como «se arregló solo», y una excepción no es un caso resuelto.
    if (esConfig(huella)) continue
    const e = estadoDe({ registro, sigueVivo: false, hoy })
    if (!e) continue
    out.push({ ...e, huella, hallazgo: null, gravedad: registro.gravedad ?? 'media', vencida: false })
  }

  for (const inc of out) inc.vencida = vencida(inc, hoy)
  return out
}

/**
 * 🔒 La escalera que decidió el dueño, copiada de `PASO` en `fichas.js`.
 *
 * Se repite aquí porque un hallazgo puede llegar sin `orden` —los de prueba y
 * los que vienen de un registro viejo sin ficha— y entonces no habría con qué
 * ordenarlo. Las dos listas tienen que decir lo mismo; hay prueba.
 */
export const ORDEN_PASO = {
  borrar: 0, vivo: 1, duplicado: 2, decidir: 3, anotar: 4, ignorar: 5, nombre: 6,
}

const sitioDe = i => i.hallazgo?.orden ?? ORDEN_PASO[i.hallazgo?.paso] ?? 9

/**
 * El orden de la bandeja.
 *
 * 🔒 Dentro de un mismo estado manda `PASO`, la escalera del dueño: lo que hay
 * que HACER con cada ficha, no cuánto pesa ni lo grave que parezca. Ordenando
 * por gravedad salía al revés de lo que él contestó —el lote de los 30 códigos
 * sin existencia es el único que se ejecuta sin pensar y caía detrás de los
 * duplicados— y eso es una decisión de negocio, no una preferencia de
 * pantalla. No se cambia sin preguntar.
 *
 * Lo vencido y el estado van POR ENCIMA de la escalera a propósito: un plazo
 * pasado y un caso que nadie ha mirado son hechos del trabajo, no un
 * reordenamiento de la prioridad del negocio.
 *
 * No se ordena por impacto en piezas, por lo mismo que la cola nunca lo hizo:
 * ese lote tiene 0 piezas y caería al último puesto siendo el más fácil.
 */
export function ordenar(incidencias) {
  const peso = e => ({
    [ESTADOS.CONFLICTO]: 0, [ESTADOS.NUEVA]: 1, [ESTADOS.REVISANDO]: 2,
    [ESTADOS.EN_ORIGEN]: 3, [ESTADOS.DESCARTADA]: 4, [ESTADOS.CERRADA]: 5,
  }[e] ?? 9)
  return [...(incidencias ?? [])].sort((a, b) =>
    (b.vencida ? 1 : 0) - (a.vencida ? 1 : 0)
    || peso(a.estado) - peso(b.estado)
    || sitioDe(a) - sitioDe(b)
    || GRAVEDADES[a.gravedad].orden - GRAVEDADES[b.gravedad].orden
    || (Number(b.hallazgo?.peso) || 0) - (Number(a.hallazgo?.peso) || 0)
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

// ── Lo que faltaba del ciclo de vida completo ─────────────────────────────

/** 🔒 Motivos de resolución. Lista cerrada: un motivo a mano no se cuenta. */
export const MOTIVOS_CIERRE = {
  'corregido-aqui':    'Lo corregí aquí y falta en la caja',
  'se-dio-de-baja':    'Se decidió dar de baja el código',
  'se-renombro':       'Se corrigió el nombre',
  'se-unifico':        'Se unificaron los códigos duplicados',
  'bodega-lo-dio-alta': 'Bodega lo dio de alta',
  'no-aplica':         'No aplica a esta plaza',
}

/** 🔒 Motivos para DESCARTAR. Separados: descartar apaga la alerta. */
export const MOTIVOS_DESCARTE = {
  'no-es-error':     'No es un error: el dato está bien',
  'caso-especial':   'Es un caso especial conocido',
  'ya-no-se-maneja': 'Ese producto ya no se maneja',
  'otro':            'Otro',
}

/** Alcance de una excepción: hasta dónde llega el «no me vuelvas a avisar». */
export const ALCANCES = {
  caso:     'Sólo este caso',
  codigo:   'Ese código, en cualquier plaza',
  plaza:    'Esa regla, en esa plaza',
  regla:    'Esa regla, en todas partes',
}

/** El tipo de regla que produjo el hallazgo, leído de su huella. */
export function reglaDe(huella) {
  const p = String(huella ?? '').split('|')[0]
  return ({ cod: 'codigo-huerfano', nom: 'nombre', pat: 'escritura', lote: 'lote' })[p] ?? p
}

export const TEXTO_REGLA = {
  'codigo-huerfano': 'Código que bodega no tiene',
  nombre:            'Nombre que no cuadra',
  escritura:         'Se escribe de dos formas',
  lote:              'Grupo de códigos',
}

/**
 * Si una excepción tapa este hallazgo.
 *
 * Las excepciones existen porque descartar un caso suelto no sirve cuando el
 * mismo motivo va a producir veinte iguales. Pero una excepción sin
 * vencimiento es una alerta apagada para siempre que nadie recuerda haber
 * apagado, así que se pueden listar y revocar, y pueden caducar.
 */
export function tapadaPor(hallazgo, huella, excepciones, hoy = new Date()) {
  const regla = reglaDe(huella)
  const codigos = new Set((hallazgo?.codigos ?? [])
    .map(c => (typeof c === 'string' ? c : c?.codigo))
    .filter(Boolean).map(limpio))
  if (hallazgo?.codigo) codigos.add(limpio(hallazgo.codigo))
  const plazas = new Set(hallazgo?.plazas ?? [])

  for (const e of Object.values(excepciones ?? {})) {
    if (e.vence && new Date(e.vence) < hoy) continue
    if (e.alcance === 'caso'   && e.huella === huella) return e
    if (e.alcance === 'codigo' && codigos.has(limpio(e.codigo))) return e
    if (e.alcance === 'plaza'  && e.regla === regla && plazas.has(e.plaza)) return e
    if (e.alcance === 'regla'  && e.regla === regla) return e
  }
  return null
}

/** Cuántas veces ha vuelto este caso. Sale del historial, no de un contador. */
export const ocurrenciasDe = registro =>
  1 + (registro?.historial ?? []).filter(h => h.estado === ESTADOS.CONFLICTO).length

/**
 * El impacto: piezas y plazas tocadas. Es lo que ordena cuando la gravedad
 * empata, y lo que convierte «un caso» en «cuánto duele».
 */
export function impactoDe(hallazgo) {
  const cs = hallazgo?.codigos ?? []
  const piezas = cs.reduce((a, c) => a + (typeof c === 'object' ? Number(c?.piezas) || 0 : 0), 0)
  return {
    piezas: piezas || Number(hallazgo?.peso) || 0,
    codigos: cs.length || (hallazgo?.codigo ? 1 : 0),
    plazas: (hallazgo?.plazas ?? []).length,
  }
}

/** Horas que tardó en cerrarse, de la primera vez al cierre. */
export function horasHastaCerrar(registro) {
  const h = registro?.historial ?? []
  if (!h.length) return null
  const primera = new Date(h[0].cuando)
  const fin = registro.fecha ? new Date(registro.fecha) : null
  if (!fin || Number.isNaN(primera.getTime())) return null
  return Math.max(0, Math.round((fin - primera) / 3600000))
}

/** El promedio de resolución, de lo que ya se cerró. */
export function tiempoMedio(incidencias) {
  const horas = incidencias
    .filter(i => i.estado === ESTADOS.CERRADA)
    .map(i => horasHastaCerrar(i.registro))
    .filter(h => h !== null)
  if (!horas.length) return null
  return Math.round(horas.reduce((a, b) => a + b, 0) / horas.length)
}

/**
 * Salud de datos por plaza: qué parte de sus códigos NO tiene incidencia
 * abierta.
 *
 * Se mide sobre el catálogo de cada plaza y no sobre el total de incidencias:
 * veinte casos en una plaza de 800 códigos y veinte en una de 100 no son lo
 * mismo, y contándolos a secas se ven iguales.
 */
export function saludPorPlaza(incidencias, inventarios) {
  const out = {}
  for (const [slug, inv] of Object.entries(inventarios ?? {})) {
    const total = (inv?.productos ?? []).length
    if (!total) continue
    const tocados = new Set()
    for (const i of incidencias) {
      if ([ESTADOS.CERRADA, ESTADOS.DESCARTADA].includes(i.estado)) continue
      if (!(i.hallazgo?.plazas ?? []).includes(slug)) continue
      for (const c of i.hallazgo?.codigos ?? []) {
        const k = limpio(typeof c === 'string' ? c : c?.codigo)
        if (k) tocados.add(k)
      }
      if (i.hallazgo?.codigo) tocados.add(limpio(i.hallazgo.codigo))
    }
    const sanos = Math.max(0, total - tocados.size)
    out[slug] = {
      total, conIncidencia: tocados.size, sanos,
      parte: sanos / total,
      // Semáforo: por debajo del 90% de catálogo limpio hay trabajo de verdad.
      color: sanos / total >= 0.97 ? 'verde' : sanos / total >= 0.9 ? 'ambar' : 'rojo',
    }
  }
  return out
}

/** Las reglas que más incidencias producen. Para no repetir el mismo error. */
export function porRegla(incidencias) {
  const m = {}
  for (const i of incidencias) {
    const r = reglaDe(i.huella)
    const e = (m[r] ??= { regla: r, texto: TEXTO_REGLA[r] ?? r, total: 0, abiertas: 0, piezas: 0 })
    e.total++
    if (![ESTADOS.CERRADA, ESTADOS.DESCARTADA].includes(i.estado)) e.abiertas++
    e.piezas += impactoDe(i.hallazgo).piezas
  }
  return Object.values(m).sort((a, b) => b.abiertas - a.abiertas || b.total - a.total)
}

/** Lo mismo, por plaza: dónde se captura peor. */
export function porPlazaCuenta(incidencias) {
  const m = {}
  for (const i of incidencias) {
    if ([ESTADOS.CERRADA, ESTADOS.DESCARTADA].includes(i.estado)) continue
    for (const slug of i.hallazgo?.plazas ?? []) {
      const e = (m[slug] ??= { plaza: slug, total: 0, piezas: 0 })
      e.total++
      e.piezas += impactoDe(i.hallazgo).piezas
    }
  }
  return Object.values(m).sort((a, b) => b.total - a.total)
}

/** Las excepciones guardadas, por su id. */
export function excepcionesDe(registros = {}) {
  const out = {}
  for (const [k, v] of Object.entries(registros)) {
    if (!k.startsWith(PREFIJO_CONFIG + 'exc|')) continue
    if (v?.revocada) continue
    out[k] = { ...v, id: k }
  }
  return out
}

/**
 * El catálogo de códigos de error: qué significa cada regla, su causa
 * probable y qué hacer.
 *
 * Trae un valor de partida medido —el de las cuatro reglas que existen— y lo
 * guardado lo sobreescribe. Arrancar en blanco dejaría la columna vacía y
 * nadie la rellena si no ve para qué sirve.
 */
export const CATALOGO_BASE = {
  'codigo-huerfano': {
    significa: 'La tienda tiene dado de alta un código que bodega no tiene.',
    causa: 'Se dio de alta en el mostrador con un código inventado, o bodega lo descontinuó y la tienda no lo bajó.',
    hacer: 'Si se vende, bodega lo da de alta con ESE código. Si no, se agota y se borra.',
  },
  nombre: {
    significa: 'El mismo código se llama distinto en dos plazas.',
    causa: 'Captura a mano en cada caja, sin copiar de bodega.',
    hacer: 'Dejar el nombre de bodega y corregir el de la plaza que difiere.',
  },
  escritura: {
    significa: 'Una misma palabra se escribe de varias formas en el catálogo.',
    causa: 'No hay una forma acordada y cada quien teclea la suya.',
    hacer: 'Elegir una forma y corregirla en bloque; una respuesta ordena muchos renglones.',
  },
  lote: {
    significa: 'Un grupo de códigos que se contesta con una sola decisión.',
    causa: 'Varios códigos comparten exactamente la misma causa.',
    hacer: 'Contestar el lote entero; preguntar uno por uno es la misma pregunta repetida.',
  },
}

export function catalogoDe(registros = {}) {
  const out = {}
  for (const [regla, base] of Object.entries(CATALOGO_BASE)) {
    const g = registros[`${PREFIJO_CONFIG}cat|${regla}`]
    out[regla] = {
      regla,
      texto: TEXTO_REGLA[regla] ?? regla,
      significa: g?.significa ?? base.significa,
      causa: g?.causa ?? base.causa,
      hacer: g?.hacer ?? base.hacer,
      editado: Boolean(g),
    }
  }
  return out
}

/**
 * Lo que le toca a cada plaza, con su avance.
 *
 * Una plaza sólo ve su trabajo cuando se le agrupa: en la lista general sus
 * cinco casos van sueltos entre ochenta, y mandarle «mira la pestaña» no es
 * un encargo. El avance va en el mismo sitio porque «te faltan 3 de 11» se
 * contesta y «tienes pendientes» no.
 */
export function agruparPorPlaza(incidencias, nombreDe = s => s) {
  const m = {}
  for (const i of incidencias) {
    for (const slug of i.hallazgo?.plazas ?? []) {
      const e = (m[slug] ??= {
        plaza: slug, nombre: nombreDe(slug),
        total: 0, hechas: 0, suyas: [], vencidas: 0, piezas: 0,
      })
      e.total++
      if ([ESTADOS.CERRADA, ESTADOS.DESCARTADA].includes(i.estado)) e.hechas++
      else {
        e.suyas.push(i)
        if (i.vencida) e.vencidas++
        e.piezas += impactoDe(i.hallazgo).piezas
      }
    }
  }
  return Object.values(m)
    .map(e => ({ ...e, avance: e.total ? e.hechas / e.total : 1 }))
    .sort((a, b) => b.suyas.length - a.suyas.length)
}

/**
 * El mensaje listo para mandarle a una plaza.
 *
 * Se genera en vez de escribirse porque escribirlo a mano es lo que no se
 * hace: catorce códigos con su nombre y lo que hay que hacer con cada uno es
 * media hora de teclear, y media hora de teclear no ocurre. Sale con lo que
 * hay que HACER —`siHacer`—, no con el nombre de la regla, que a la tienda
 * no le dice nada.
 *
 * Sin números inventados: lo que no se sabe no se escribe.
 */
export function mensajeParaSucursal({ plaza, nombre, incidencias, catalogo = {}, limite = 14 }) {
  const abiertas = (incidencias ?? []).filter(i =>
    ![ESTADOS.CERRADA, ESTADOS.DESCARTADA].includes(i.estado))
  if (!abiertas.length) return ''

  const lineas = [`*${nombre ?? plaza}* — ${abiertas.length} ${
    abiertas.length === 1 ? 'cosa por corregir' : 'cosas por corregir'} en el catálogo`, '']

  for (const i of abiertas.slice(0, limite)) {
    const h = i.hallazgo ?? {}
    const cs = (h.codigos ?? []).map(c => (typeof c === 'string' ? c : c?.codigo)).filter(Boolean)
    const quien = cs.length > 1 ? `${cs.length} códigos` : (cs[0] ?? h.codigo ?? '')
    const hacer = i.registro?.estado === ESTADOS.EN_ORIGEN && i.registro?.nota
      ? i.registro.nota
      : (h.siHacer || catalogo[reglaDe(i.huella)]?.hacer || h.pregunta || '')
    lineas.push(`• ${quien}${h.producto ? ` (${h.producto})` : ''}`)
    if (hacer) lineas.push(`  ${hacer}`)
    if (i.registro?.compromiso) lineas.push(`  para el ${i.registro.compromiso}`)
  }

  if (abiertas.length > limite) {
    lineas.push('', `Y ${abiertas.length - limite} más en la página.`)
  }
  // Nunca se promete un plazo que nadie fijó, ni se firma con un nombre que
  // no se sabe: un mensaje que inventa cualquiera de las dos cosas lo
  // desmiente la propia tienda a la primera.
  lineas.push('', 'Cuando lo corrijan en su caja se cierra solo con el respaldo siguiente.')
  return lineas.join('\n')
}
