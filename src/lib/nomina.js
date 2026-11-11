// La nómina semanal: sueldo, coberturas, bono de puntualidad y comisiones.
//
// La pidió el dueño el 2026-11-11. Todo lo que hay aquí son CUENTAS: lo que se
// decide —parámetros, justificaciones, quién cubrió, qué comisión se autoriza—
// lo guarda el servidor en `nomina/` y llega aquí como dato. Así la misma cuenta
// sale igual en «Mi pago» de la tienda y en el resumen del administrador.
//
// ── Lo que el punto de venta NO sabe, y cómo se resuelve ───────────────────
//
// El dato de quién abrió sale de la tabla TURNOS de Eleventa: el USUARIO que
// inició sesión. Dos personas pueden usar el mismo usuario, y pasa en dos
// plazas (medido el 2026-11-11 con las aperturas desde el 1 de septiembre):
//
//   · León: Daniela y Jenny usan el usuario de Daniela. Es UN registro de pago,
//     y la puntualidad es de las dos juntas.
//   · Aguascalientes: la sobrina de Brenda abre sábado y domingo con el usuario
//     de Brenda. Son DOS registros de pago; el calendario decide de quién es
//     cada apertura (`registroDeUsuario`), y el administrador puede corregirlo
//     día por día.
//
// ── Un día cubierto se paga a quien lo cubrió y se descuenta al titular ────
//
// Decidido por el dueño el 2026-11-11: si Andrea abre un sábado de Cesareo, a
// Andrea se le paga ese día y a Cesareo se le descuenta, para no pagar dos
// veces el mismo día. El valor del día es el sueldo del titular entre sus días
// programados (Cesareo: $600 ÷ 2 = $300). El día NO le cuenta como falta, y el
// administrador puede quitar el descuento.

import { semanaDe } from './caja.js'
import { HORARIOS, TOLERANCIA_MIN } from './personal.js'

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)
export const redondear = v => (Math.round(num(v) * 100) / 100) || 0   // nunca «-0»

/** Las plazas que llevan nómina. Ferias no es una sucursal: queda fuera. */
export const PLAZAS_NOMINA = ['leon', 'san-luis', 'aguascalientes', 'torreon']
export const NOMBRE_PLAZA = { leon: 'León', 'san-luis': 'San Luis Potosí', aguascalientes: 'Aguascalientes', torreon: 'Torreón' }

/** Días ISO: 1 lunes … 7 domingo. */
export const DIAS = [1, 2, 3, 4, 5, 6, 7]
export const NOMBRE_DIA = { 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado', 7: 'domingo' }
export const INICIAL_DIA = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S', 7: 'D' }

const comoFecha = f => { const [y, m, d] = String(f).split('-').map(Number); return new Date(y, m - 1, d) }
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const diaIso = fecha => { const d = comoFecha(fecha).getDay(); return d === 0 ? 7 : d }
export const sumarDias = (fecha, n) => { const d = comoFecha(fecha); d.setDate(d.getDate() + n); return iso(d) }
export const diasDeSemana = lunes => DIAS.map(i => sumarDias(lunes, i - 1))
export const lunesDe = fecha => semanaDe(fecha).desde

// ── Lo de arranque: lo que puso el dueño, editable desde el panel ──────────

const horarioPlaza = slug => Object.fromEntries(DIAS.map(d => [d, (HORARIOS[slug] ?? HORARIOS.defecto).abre]))

export const PARAMETROS_INICIALES = {
  // 🔒 El 7% y los precios mínimos los puso el dueño el 2026-11-11: «cualquier
  // precio inferior por categoría no entraría como comisión».
  pctComision: 0.07,
  categorias: { funda: true, hidrogel: true, sticker: true },
  minimos: { funda: 220, hidrogel: 120, sticker: 100 },
  maximos: { funda: null, hidrogel: null, sticker: null },
  excluidos: [],
  tolerancia: Object.fromEntries(PLAZAS_NOMINA.map(p => [p, TOLERANCIA_MIN])),
  horarios: Object.fromEntries(PLAZAS_NOMINA.map(p => [p, horarioPlaza(p)])),
}

// Los registros de arranque —con sus sueldos— NO viven aquí: este archivo va
// en el JavaScript público, y un sueldo escrito aquí lo leería cualquiera que
// abra la página. Los entrega el servidor (`backend/src/nomina.js`), y sólo con
// sesión.
export const CONFIG_INICIAL = { empleados: [], parametros: PARAMETROS_INICIALES }

/** La configuración con los huecos rellenos de lo de arranque: nunca a medias. */
export function configCompleta(config) {
  const c = config && typeof config === 'object' ? config : {}
  const p = c.parametros ?? {}
  return {
    empleados: Array.isArray(c.empleados) ? c.empleados : [],
    parametros: {
      ...PARAMETROS_INICIALES, ...p,
      categorias: { ...PARAMETROS_INICIALES.categorias, ...(p.categorias ?? {}) },
      minimos: { ...PARAMETROS_INICIALES.minimos, ...(p.minimos ?? {}) },
      maximos: { ...PARAMETROS_INICIALES.maximos, ...(p.maximos ?? {}) },
      tolerancia: { ...PARAMETROS_INICIALES.tolerancia, ...(p.tolerancia ?? {}) },
      horarios: Object.fromEntries(PLAZAS_NOMINA.map(pl => [pl, { ...PARAMETROS_INICIALES.horarios[pl], ...(p.horarios?.[pl] ?? {}) }])),
      excluidos: Array.isArray(p.excluidos) ? p.excluidos : [],
    },
  }
}

// ── Quién es quién ─────────────────────────────────────────────────────────

export const normalizar = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * ¿Este usuario del punto de venta es el del registro? Todas las palabras del
 * registro tienen que estar en el nombre del punto de venta: «angel» casa con
 * «ANGEL MARTINEZ», y «cesareo nolasco ramirez» no casa con «andrea».
 */
export function coincideUsuario(delRegistro, delPuntoDeVenta) {
  const a = normalizar(delRegistro).split(' ').filter(Boolean)
  const b = new Set(normalizar(delPuntoDeVenta).split(' '))
  return a.length > 0 && a.every(p => b.has(p))
}

export const activosDe = (config, plaza) => (config.empleados ?? []).filter(e => e.activo !== false && e.plaza === plaza)

/** Quién tiene programado ese día en esa plaza: el titular. */
export const titularDelDia = (config, plaza, fecha) =>
  activosDe(config, plaza).find(e => (e.dias ?? []).includes(diaIso(fecha))) ?? null

/**
 * A qué registro de pago le toca lo que hizo un usuario del punto de venta un
 * día. Si el usuario lo comparten dos registros, el del calendario de ese día.
 */
export function registroDeUsuario(config, plaza, fecha, usuario) {
  const suyos = activosDe(config, plaza).filter(e => (e.usuarios ?? []).some(u => coincideUsuario(u, usuario)))
  if (suyos.length <= 1) return suyos[0] ?? null
  return suyos.find(e => (e.dias ?? []).includes(diaIso(fecha))) ?? suyos[0]
}

/** El valor de un día de trabajo del titular: su sueldo entre sus días. */
// Sin redondear: se redondea sólo el TOTAL. Redondeando cada día, siete faltas
// de un sueldo de $2,000 (7 × $285.71) dejaban $0.03 que nadie ganó.
export const valorDia = reg => (reg?.sueldo && reg?.dias?.length ? reg.sueldo / reg.dias.length : 0)

const aMin = hhmm => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? '')); return m ? +m[1] * 60 + +m[2] : null }
const minutosDe = inicio => { const m = /[T ](\d{2}):(\d{2})/.exec(String(inicio ?? '')); return m ? +m[1] * 60 + +m[2] : null }
export const horaDe = inicio => { const m = /[T ](\d{2}:\d{2})/.exec(String(inicio ?? '')); return m ? m[1] : null }

/** Las primeras aperturas de cada día de una plaza: `fecha → turno`. */
export function primerasAperturas(turnos, plaza) {
  const m = new Map()
  for (const t of turnos ?? []) {
    if (t.slug !== plaza) continue
    const a = m.get(t.fecha)
    if (!a || String(t.inicio) < String(a.inicio)) m.set(t.fecha, t)
  }
  return m
}

// ── Vacaciones (Ley Federal del Trabajo, reforma de 2023) ──────────────────

/** Días de vacaciones por años cumplidos: 12, 14, 16, 18, 20 y luego +2 cada cinco años. */
export function diasLFT(anios) {
  const a = Math.floor(num(anios))
  if (a < 1) return 0
  if (a <= 5) return 10 + 2 * a
  return 20 + 2 * Math.ceil((a - 5) / 5)
}

/** Años, meses y días cumplidos entre dos fechas `AAAA-MM-DD`. */
export function antiguedad(ingreso, hoy) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ingreso ?? '')) || !hoy) return null
  const a = comoFecha(ingreso), b = comoFecha(hoy)
  if (b < a) return { anios: 0, meses: 0, dias: 0 }
  let anios = b.getFullYear() - a.getFullYear()
  let meses = b.getMonth() - a.getMonth()
  let dias = b.getDate() - a.getDate()
  if (dias < 0) { meses--; dias += new Date(b.getFullYear(), b.getMonth(), 0).getDate() }
  if (meses < 0) { anios--; meses += 12 }
  return { anios, meses, dias }
}

const cumpleanios = (ingreso, n) => { const d = comoFecha(ingreso); d.setFullYear(d.getFullYear() + n); return iso(d) }
const masMeses = (fecha, n) => { const d = comoFecha(fecha); d.setMonth(d.getMonth() + n); return iso(d) }

/** Los días laborables de un rango para un registro: lo que de verdad se descuenta. */
export function diasLaborables(desde, hasta, dias) {
  const out = []
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) if ((dias ?? []).includes(diaIso(f))) out.push(f)
  return out
}

/**
 * El saldo de vacaciones de una persona en su año de servicio actual.
 *
 * Corresponden los días de la ley según los años cumplidos —o los que el
 * administrador fije a mano para esa persona—, se descuentan los tomados en
 * ese mismo año de servicio, y vencen a los seis meses del aniversario
 * (artículo 81: se disfrutan dentro de los seis meses siguientes).
 */
export function saldoVacaciones({ persona: p, registro, vacaciones = [], hoy }) {
  const ant = antiguedad(p?.ingreso, hoy)
  if (!ant) return null
  const desde = ant.anios >= 1 ? cumpleanios(p.ingreso, ant.anios) : null
  const hasta = desde ? sumarDias(cumpleanios(p.ingreso, ant.anios + 1), -1) : null
  const corresponden = p.diasVacaciones !== null && p.diasVacaciones !== undefined && p.diasVacaciones !== ''
    ? num(p.diasVacaciones) : diasLFT(ant.anios)
  const tomados = desde ? (vacaciones ?? [])
    .filter(v => v.persona === p.id)
    .reduce((a, v) => a + diasLaborables(v.desde > desde ? v.desde : desde, v.hasta < hasta ? v.hasta : hasta, registro?.dias).length, 0) : 0
  const vence = desde ? masMeses(desde, 6) : null
  const disponibles = Math.max(0, corresponden - tomados)
  const diasParaVencer = vence ? Math.round((comoFecha(vence) - comoFecha(hoy)) / 864e5) : null
  return {
    antiguedad: ant, corresponden, tomados, disponibles,
    periodo: desde ? { desde, hasta } : null,
    proximoAniversario: cumpleanios(p.ingreso, ant.anios + 1),
    vence, diasParaVencer,
    porVencer: disponibles > 0 && diasParaVencer !== null && diasParaVencer >= 0 && diasParaVencer <= 60,
  }
}

/** ¿Está de vacaciones la persona de un registro de una sola persona ese día? */
const deVacaciones = (registro, vacaciones, fecha) =>
  (registro?.personas?.length ?? 0) === 1
  && (vacaciones ?? []).some(v => v.persona === registro.personas[0].id && v.desde <= fecha && fecha <= v.hasta)

// ── Comisiones ─────────────────────────────────────────────────────────────

/**
 * 🔒 La comisión de un ticket, o `null` si no la genera. Reglas del dueño
 * (2026-11-11):
 *
 *   · Dos productos de DISTINTO tipo —funda, mica de hidrogel, sticker— en el
 *     MISMO ticket. Nunca se juntan tickets.
 *   · Sólo a precio público: ninguna línea a mayoreo, y el ticket no lleva
 *     mayorista (eso ya lo filtra la extracción).
 *   · Un precio mínimo por tipo; por debajo no entra. La funda cuenta desde
 *     $220: no hay código de funda personalizada y así lo decidió.
 *   · Con tres productos, sólo el par más caro: funda $250 + mica $120 +
 *     sticker $100 → ($250 + $120) × 7% = $25.90. UNA comisión por ticket.
 *
 * El precio es el que se COBRÓ en el ticket, por pieza, no el de la lista.
 */
export function calcularComision(ticket, params) {
  const p = params ?? PARAMETROS_INICIALES
  const excluidos = new Set((p.excluidos ?? []).map(c => String(c).toUpperCase()))
  const mejor = {}
  for (const l of ticket?.lineas ?? []) {
    if (l.mayoreo) continue
    const tipo = l.tipo
    if (!p.categorias?.[tipo]) continue
    if (excluidos.has(String(l.codigo ?? '').toUpperCase())) continue
    const precio = num(l.precio)
    if (precio < num(p.minimos?.[tipo])) continue
    const max = p.maximos?.[tipo]
    if (max !== null && max !== undefined && max !== '' && precio > num(max)) continue
    if (!mejor[tipo] || precio > mejor[tipo].precio) mejor[tipo] = { ...l, precio }
  }
  const par = Object.values(mejor).sort((a, b) => b.precio - a.precio).slice(0, 2)
  if (par.length < 2) return null
  const base = redondear(par[0].precio + par[1].precio)
  return { par, base, monto: redondear(base * num(p.pctComision)) }
}

export const claveComision = (plaza, ticketId) => `${plaza}|${ticketId}`

// ── La semana de cada registro ─────────────────────────────────────────────

export const ESTADOS_DIA = {
  puntual: 'A tiempo', retardo: 'Retardo', falta: 'Falta', cubierto: 'Cubierto',
  vacaciones: 'Vacaciones', justificado: 'Justificado', 'sin-dato': 'Sin dato todavía', 'por-venir': 'Por venir',
}

/**
 * Todo lo de una semana, por registro de pago.
 *
 * `estado` es lo que decidió el administrador: `justificaciones`,
 * `coberturas`, `comisiones`, `manuales`, `ajustes`, `pagos` y `vacaciones`.
 * `ultimoDato` es, por plaza, el último día con aperturas en el archivo: lo
 * que pasa después de ese día todavía no se sabe y NO es una falta.
 */
export function semanaNomina({ config: cfg, estado = {}, turnos = [], comisionables = {}, lunes, hoy, ultimoDato = {}, plazas = PLAZAS_NOMINA }) {
  const config = configCompleta(cfg)
  const p = config.parametros
  const fechas = diasDeSemana(lunes)
  const hasta = fechas[6]
  const out = new Map()
  const fila = reg => {
    if (!out.has(reg.id)) {
      out.set(reg.id, {
        registro: reg, plaza: reg.plaza, dias: [], sueldo: reg.sueldo ?? null,
        descuentos: [], coberturas: [], comisiones: [], ajustes: [],
        bono: { monto: reg.bono ?? null, estado: 'vigente', incumplimiento: null },
      })
    }
    return out.get(reg.id)
  }

  for (const plaza of plazas) {
    const regs = activosDe(config, plaza)
    regs.forEach(fila)
    if (!regs.length) continue
    const aperturas = primerasAperturas(turnos, plaza)
    const ultimo = ultimoDato[plaza] ?? null

    for (const fecha of fechas) {
      const titular = titularDelDia(config, plaza, fecha)
      const ap = aperturas.get(fecha) ?? null
      const forzada = estado.coberturas?.[`${plaza}|${fecha}`] ?? null
      const abrio = forzada?.quien
        ? (forzada.quien === 'nadie' ? null : regs.find(r => r.id === forzada.quien) ?? null)
        : (ap ? registroDeUsuario(config, plaza, fecha, ap.persona) : null)
      const minutos = ap ? minutosDe(ap.inicio) : null
      const abre = aMin(p.horarios?.[plaza]?.[diaIso(fecha)])
      if (!titular) continue

      const t = fila(titular)
      const just = estado.justificaciones?.[`${titular.id}|${fecha}`] ?? null
      const vac = deVacaciones(titular, estado.vacaciones, fecha) || !!just?.sinDescuento
      const d = { fecha, dia: diaIso(fecha), hora: ap ? horaDe(ap.inicio) : null, usuario: ap?.persona ?? null, justificacion: just, forzada: !!forzada?.quien }

      const otro = (abrio && abrio.id !== titular.id) || (ap && !abrio && !forzada?.quien)
      if (otro) {
        // Lo abrió otro. Al titular no le cuenta como falta; se le descuenta el
        // día, salvo vacaciones o que el administrador lo quite, y se le paga
        // a quien lo cubrió.
        d.estado = vac && deVacaciones(titular, estado.vacaciones, fecha) ? 'vacaciones' : 'cubierto'
        d.cubiertoPor = abrio ? abrio.nombre : (ap?.persona ?? 'otra persona')
        // Un usuario del punto de venta que no casa con ningún registro puede
        // ser el mismo titular con otro nombre de usuario: no se le descuenta
        // nada hasta que el administrador diga quién fue.
        d.sinRegistro = !abrio
        const monto = valorDia(titular)
        const sinDescuento = !!forzada?.sinDescuento || vac || !abrio
        if (monto && !sinDescuento) t.descuentos.push({ fecha, monto, cubrio: d.cubiertoPor })
        if (abrio && monto) fila(abrio).coberturas.push({ fecha, monto, titular: titular.nombre })
      } else if (abrio) {
        const tarde = minutos !== null && abre !== null ? minutos - abre : null
        d.minutos = tarde
        d.estado = tarde !== null && tarde > num(p.tolerancia?.[plaza] ?? TOLERANCIA_MIN) ? 'retardo' : 'puntual'
        // Un retardo justificado no cuesta el bono, salvo que el administrador
        // haya decidido que sí.
        if (d.estado === 'retardo' && just && just.bono !== false) d.estado = 'justificado'
      } else if (deVacaciones(titular, estado.vacaciones, fecha)) {
        d.estado = 'vacaciones'
      } else if (forzada?.quien === 'nadie' || (ultimo && fecha <= ultimo)) {
        // 🔒 Una falta descuenta el día de sueldo Y el bono (el dueño, el
        // 2026-11-11). Justificada, el administrador decide qué se perdona: el
        // bono, el sueldo, o los dos —lo de arranque es perdonar los dos—.
        d.estado = just && just.bono !== false && just.sueldo !== false ? 'justificado' : 'falta'
        if (just && just.bono !== false) d.bonoPerdonado = true
        const monto = valorDia(titular)
        if (monto && !(just && just.sueldo !== false)) t.descuentos.push({ fecha, monto, falta: true })
      } else if (just) {
        d.estado = 'justificado'
      } else {
        d.estado = hoy && fecha < hoy ? 'sin-dato' : 'por-venir'
      }
      t.dias.push(d)
    }
  }

  // Comisiones de la semana.
  for (const plaza of plazas) {
    for (const tk of comisionables?.[plaza] ?? []) {
      if (tk.f < lunes || tk.f > hasta) continue
      const calc = calcularComision(tk, p)
      if (!calc) continue
      const reg = registroDeUsuario(config, plaza, tk.f, tk.cajero)
      if (!reg) continue
      const clave = claveComision(plaza, tk.id)
      const dec = estado.comisiones?.[clave] ?? {}
      // Autorizada, manda el monto que se autorizó: cambiar luego el 7% no
      // puede mover una comisión que ya salió de la caja.
      const monto = dec.estado === 'autorizada' && dec.monto !== undefined && dec.monto !== null ? num(dec.monto) : calc.monto
      fila(reg).comisiones.push({ clave, ticket: tk, ...calc, monto, estado: dec.estado ?? 'pendiente', motivo: dec.motivo ?? null, foto: dec.foto ?? null, manual: false })
    }
  }
  for (const m of estado.manuales ?? []) {
    if (m.fecha < lunes || m.fecha > hasta) continue
    const reg = config.empleados.find(e => e.id === m.registro)
    if (!reg || !plazas.includes(reg.plaza)) continue
    fila(reg).comisiones.push({ clave: `manual|${m.id}`, ticket: null, par: [], base: null, monto: redondear(m.monto), estado: 'autorizada', concepto: m.concepto, foto: m.foto ?? null, manual: true, id: m.id, fecha: m.fecha })
  }
  for (const a of estado.ajustes ?? []) {
    if (a.semana !== lunes) continue
    const reg = config.empleados.find(e => e.id === a.registro)
    if (reg && out.has(reg.id)) out.get(reg.id).ajustes.push(a)
  }

  return [...out.values()].map(r => {
    const programados = r.dias
    const malo = programados.find(d => (d.estado === 'retardo' || d.estado === 'falta') && !d.bonoPerdonado)
    const sinDato = programados.some(d => d.estado === 'sin-dato')
    r.bono.estado = malo ? 'perdido' : sinDato ? 'riesgo' : 'vigente'
    r.bono.incumplimiento = malo ? { fecha: malo.fecha, hora: malo.hora, estado: malo.estado, minutos: malo.minutos ?? null } : null
    const bono = r.bono.estado === 'perdido' ? 0 : num(r.bono.monto)
    const descuentos = r.descuentos.reduce((a, x) => a + x.monto, 0)
    const coberturas = r.coberturas.reduce((a, x) => a + x.monto, 0)
    const autorizadas = r.comisiones.filter(c => c.estado === 'autorizada').reduce((a, c) => a + num(c.monto), 0)
    const pendientes = r.comisiones.filter(c => c.estado === 'pendiente').reduce((a, c) => a + num(c.monto), 0)
    const ajustes = r.ajustes.reduce((a, x) => a + num(x.monto), 0)
    const total = redondear(num(r.sueldo) - descuentos + coberturas + bono + autorizadas + ajustes)
    const pago = estado.pagos?.[`${r.registro.id}|${lunes}`] ?? null
    return {
      ...r,
      totales: {
        sueldo: num(r.sueldo), descuentos: redondear(descuentos), coberturas: redondear(coberturas), bono,
        comisiones: redondear(autorizadas), comisionesPendientes: redondear(pendientes), ajustes: redondear(ajustes), total,
      },
      // Un sueldo sin capturar no es un sueldo de cero: el total se dice incompleto.
      incompleto: r.sueldo === null || r.sueldo === undefined,
      pago,
    }
  })
}

/** Las semanas de la nómina desde una fecha hacia atrás, más reciente primero. */
export function semanasHacia(hoy, n) {
  const out = []
  let l = lunesDe(hoy)
  for (let i = 0; i < n; i++) { out.push(l); l = sumarDias(l, -7) }
  return out
}

/** El último día con aperturas de cada plaza en el archivo de turnos. */
export function ultimoDatoPorPlaza(turnos) {
  const out = {}
  for (const t of turnos ?? []) if (!out[t.slug] || t.fecha > out[t.slug]) out[t.slug] = t.fecha
  return out
}
