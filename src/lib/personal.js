// Puntualidad y reportes semanales del personal.
//
// El dato sale de la tabla TURNOS de Eleventa: cada vez que alguien abre caja
// queda registrado quién y a qué hora. No es un reloj checador —mide cuándo se
// ABRIÓ LA CAJA, no cuándo llegó la persona— y eso hay que tenerlo presente
// antes de usarlo para algo serio: quien llega puntual pero tarda en abrir
// sale como retardo.

/** A qué hora abre cada sucursal. La que no esté aquí usa la de por defecto. */
export const HORARIOS = {
  defecto: { abre: '10:30', cierra: '20:00' },
  torreon: { abre: '10:00', cierra: '19:00' },
  // Un puesto de feria no abre a una hora fija: depende del recinto y del día.
  // Con el horario de tienda salía con retardos de cinco horas, que no
  // significan nada. Aquí se registran las horas pero no se juzga la
  // puntualidad.
  ferias:  { abre: null, cierra: null },
}

/** Minutos de gracia antes de contar retardo. Abrir caja lleva unos minutos. */
export const TOLERANCIA_MIN = 10

export const horarioDe = slug => HORARIOS[slug] ?? HORARIOS.defecto

/** True si a esa sucursal se le puede medir la puntualidad. */
export const tieneHorario = slug => !!horarioDe(slug).abre

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

const aMinutos = hhmm => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

/** Minutos de retardo de una apertura. Negativo si se adelantó. */
export function minutosTarde(inicioISO, slug) {
  if (!inicioISO) return null
  if (!horarioDe(slug).abre) return null   // sin horario fijo, no hay retardo
  const d = new Date(inicioISO)
  if (Number.isNaN(d.getTime())) return null
  return (d.getHours() * 60 + d.getMinutes()) - aMinutos(horarioDe(slug).abre)
}

/** La semana del lunes al domingo que ya cerró, vista desde `hoy`. */
export function semanaPasada(hoy = new Date()) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  // getDay(): 0 es domingo. Se retrocede hasta el lunes de esta semana y de
  // ahí siete días más, para quedarse con la semana completa anterior.
  const haciaLunes = (d.getDay() + 6) % 7
  const lunes = new Date(d)
  lunes.setDate(d.getDate() - haciaLunes - 7)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  return { desde: iso(lunes), hasta: iso(domingo) }
}

/** La semana en curso, de su lunes a hoy. */
export function semanaEnCurso(hoy = new Date()) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const lunes = new Date(d)
  lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return { desde: iso(lunes), hasta: iso(d) }
}

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const nombreDia = fecha => {
  const [y, m, d] = String(fecha).split('-').map(Number)
  return DIAS[new Date(y, m - 1, d).getDay()]
}

export function formatoRango({ desde, hasta }) {
  const f = s => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
  }
  return `${f(desde)} al ${f(hasta)}`
}

/** La hora de un ISO en formato corto. */
export const soloHora = iso2 => {
  const d = new Date(iso2)
  return Number.isNaN(d.getTime()) ? '—'
    : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Resume los turnos de un rango, por persona.
 *
 * `turnos` viene del archivo que publica el script, con { slug, persona,
 * fecha, inicio, fin, ventas }.
 */
export function resumirSemana(turnos, { desde, hasta }) {
  const dentro = (turnos ?? []).filter(t => t.fecha >= desde && t.fecha <= hasta)

  const porPersona = new Map()
  for (const t of dentro) {
    const clave = `${t.slug}|${t.persona}`
    const e = porPersona.get(clave) ?? {
      slug: t.slug, sucursal: t.sucursal, persona: t.persona,
      dias: [], retardos: 0, minutosTotales: 0, ventas: 0,
    }
    const tarde = minutosTarde(t.inicio, t.slug)
    const esRetardo = tarde !== null && tarde > TOLERANCIA_MIN
    if (esRetardo) { e.retardos++; e.minutosTotales += tarde }
    e.ventas += t.ventas ?? 0
    e.dias.push({ ...t, tarde, esRetardo })
    porPersona.set(clave, e)
  }

  const filas = [...porPersona.values()].map(e => {
    const conHora = e.dias.filter(d => d.tarde !== null)
    const promedio = conHora.length
      ? conHora.reduce((a, d) => a + d.tarde, 0) / conHora.length
      : null
    return {
      ...e,
      diasTrabajados: e.dias.length,
      promedioMin: promedio,
      // El peor día de la semana, que es el que hay que comentar.
      peor: e.dias.filter(d => d.esRetardo).sort((a, b) => b.tarde - a.tarde)[0] ?? null,
      dias: e.dias.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    }
  })

  filas.sort((a, b) => b.retardos - a.retardos || (b.promedioMin ?? -999) - (a.promedioMin ?? -999))

  return {
    desde, hasta,
    filas,
    totalTurnos: dentro.length,
    totalRetardos: filas.reduce((a, f) => a + f.retardos, 0),
    personas: filas.length,
  }
}
