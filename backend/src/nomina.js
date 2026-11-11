// La nómina, del lado del servidor: qué se guarda, quién lo ve y la bitácora.
//
// Las CUENTAS viven en `src/lib/nomina.js` (frontend), con pruebas. Aquí está
// lo que no se le puede dejar al navegador:
//
//   · Validar lo que se guarda: un sueldo negativo o un día que no existe se
//     rechazan, no se arreglan en silencio.
//   · Recortar lo que ve una tienda: SÓLO su plaza, sin fechas de ingreso, sin
//     vacaciones ni antigüedad. Lo dijo el dueño: «Mi pago no debe mostrar
//     vacaciones, antigüedad ni ninguna otra información de RH».
//   · Escribir la BITÁCORA con el autor y la hora que pone este lado: un
//     registro que el cliente puede escribir a gusto no prueba nada.
//   · Registrar las comisiones autorizadas como SALIDA DE EFECTIVO, con el
//     concepto «Comisiones de ‹nombre›» (el dueño, 2026-11-11). Va a
//     `caja/movimientos.json`, el mismo sitio que «Registrar movimiento» de
//     Efectivo, así el corte y los depósitos la restan sin otra regla.

export const PLAZAS_NOMINA = ['leon', 'san-luis', 'aguascalientes', 'torreon']

// ── Los registros de arranque ───────────────────────────────────────────────
//
// Aquí y no en el frontend: llevan SUELDOS, y lo del frontend va en el
// JavaScript público. Se entregan sólo con sesión —una tienda, sólo los suyos—
// mientras el administrador no guarde su propia configuración.
//
// Los nombres de usuario son los del punto de venta, tal cual salen en TURNOS.
// La fecha de ingreso va VACÍA a propósito: el dueño la captura persona por
// persona (2026-11-11).

const persona = (pid, nombre) => ({ id: pid, nombre, ingreso: null, diasVacaciones: null })

export const EMPLEADOS_INICIALES = [
  { id: 'brenda', nombre: 'Brenda Rangel', plaza: 'aguascalientes', usuarios: ['brenda rangel'],
    dias: [1, 2, 3, 4, 5], sueldo: 2000, bono: 300, activo: true, personas: [persona('brenda', 'Brenda Rangel')], quienPorDia: {} },
  // Abre sábado y domingo con el usuario de Brenda: el calendario dice que el
  // fin de semana es suyo. Si trabaja Brenda, lo marca el administrador.
  { id: 'sobrina-brenda', nombre: 'Sobrina de Brenda (fines de semana)', plaza: 'aguascalientes', usuarios: ['brenda rangel'],
    dias: [6, 7], sueldo: 600, bono: null, activo: true, personas: [persona('sobrina-brenda', 'Sobrina de Brenda')], quienPorDia: {} },
  { id: 'andrea', nombre: 'Andrea Serrano Palacios', plaza: 'san-luis', usuarios: ['andrea serrano palacios'],
    dias: [1, 2, 3, 4, 5], sueldo: 2000, bono: 300, activo: true, personas: [persona('andrea', 'Andrea Serrano Palacios')], quienPorDia: {} },
  { id: 'cesareo', nombre: 'Cesareo Nolasco Ramirez', plaza: 'san-luis', usuarios: ['cesareo nolasco ramirez'],
    dias: [6, 7], sueldo: 600, bono: 100, activo: true, personas: [persona('cesareo', 'Cesareo Nolasco Ramirez')], quienPorDia: {} },
  // 🔒 Daniela y Jenni cobran $2,000 y $500 de bono CADA UNA, con su recibo
  // (el dueño, 2026-11-11). Jenni también va, pero sólo una abre la caja y lo
  // hace con el usuario de Daniela: Jenni `noAbre`, cobra su sueldo FIJO —sus
  // días no se miden con aperturas— y su bono sigue el de Daniela (`grupo`).
  // Sus `dias` sólo dicen de quién es la caja ese día (el viernes, que
  // Daniela descansa): a quién van las comisiones. `antes` es el registro
  // conjunto con el que se guardó lo anterior (un pago, una justificación).
  { id: 'daniela', nombre: 'Daniela Coronilla', plaza: 'leon', usuarios: ['daniela coronilla'],
    dias: [1, 2, 3, 4, 6, 7], sueldo: 2000, bono: 500, activo: true, grupo: 'leon', antes: ['daniela-jenni'],
    personas: [persona('daniela', 'Daniela Coronilla')], quienPorDia: {} },
  { id: 'jenni', nombre: 'Jenni Gallardo', plaza: 'leon', usuarios: ['jenni gllardo', 'daniela coronilla'],
    dias: [5], sueldo: 2000, bono: 500, activo: true, grupo: 'leon', noAbre: true, antes: ['daniela-jenni'],
    personas: [persona('jenni', 'Jenni Gallardo')], quienPorDia: {} },
  // Torreón: sueldo y bono sin capturar. Los usuarios del punto de venta se
  // confirman cuando la sincronización traiga sus turnos.
  { id: 'angel', nombre: 'Ángel', plaza: 'torreon', usuarios: ['angel'],
    dias: [1, 2, 3, 4, 5], sueldo: null, bono: null, activo: true, personas: [persona('angel', 'Ángel')], quienPorDia: {} },
  { id: 'ximena', nombre: 'Ximena', plaza: 'torreon', usuarios: ['ximena'],
    dias: [6, 7], sueldo: null, bono: null, activo: true, personas: [persona('ximena', 'Ximena')], quienPorDia: {} },
]
const TIPOS_COMISION = ['funda', 'hidrogel', 'sticker']
const ESTADOS_COMISION = new Set(['pendiente', 'autorizada', 'rechazada'])

const esFecha = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''))
const esLunes = v => esFecha(v) && new Date(`${v}T00:00:00Z`).getUTCDay() === 1
const texto = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n)
const id = v => (/^[a-z0-9][a-z0-9-]{0,39}$/.test(String(v ?? '')) ? String(v) : null)

/** Un monto de dinero válido, o `null` si viene vacío. Nunca un cero inventado. */
function dinero(v, { min = 0, max = 100000 } = {}) {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) return undefined
  return Math.round(n * 100) / 100
}

/**
 * La configuración en su forma guardable, o `{ error }`.
 *
 * Estricta: un registro mal formado no se descarta, se rechaza el guardado
 * entero. Guardar media configuración dejaría a alguien sin pago sin que nadie
 * se enterara.
 */
export function limpiarConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return { error: 'Configuración inválida.' }
  const lista = Array.isArray(cfg.empleados) ? cfg.empleados : null
  if (!lista) return { error: 'Faltan los empleados.' }
  if (lista.length > 60) return { error: 'Demasiados registros de pago.' }

  const vistos = new Set()
  const empleados = []
  for (const e of lista) {
    const eid = id(e?.id)
    if (!eid) return { error: `Un registro tiene un identificador inválido («${texto(e?.id, 40)}»).` }
    if (vistos.has(eid)) return { error: `El identificador «${eid}» está repetido.` }
    vistos.add(eid)
    const nombre = texto(e.nombre, 80)
    if (!nombre) return { error: 'Todo registro lleva nombre.' }
    if (!PLAZAS_NOMINA.includes(e.plaza)) return { error: `${nombre}: sucursal desconocida.` }
    const dias = [...new Set((Array.isArray(e.dias) ? e.dias : []).map(Number))]
    if (dias.some(d => !Number.isInteger(d) || d < 1 || d > 7)) return { error: `${nombre}: día inválido.` }
    const sueldo = dinero(e.sueldo), bono = dinero(e.bono)
    if (sueldo === undefined) return { error: `${nombre}: el sueldo no es un monto válido.` }
    if (bono === undefined) return { error: `${nombre}: el bono no es un monto válido.` }
    const usuarios = (Array.isArray(e.usuarios) ? e.usuarios : []).map(u => texto(u, 80)).filter(Boolean).slice(0, 6)
    const personasIn = Array.isArray(e.personas) && e.personas.length ? e.personas : [{ id: eid, nombre }]
    if (personasIn.length > 4) return { error: `${nombre}: como mucho cuatro personas por registro.` }
    const personas = []
    for (const p of personasIn) {
      const pid = id(p?.id)
      if (!pid) return { error: `${nombre}: una persona tiene un identificador inválido.` }
      const ingreso = p.ingreso === null || p.ingreso === undefined || p.ingreso === '' ? null : String(p.ingreso)
      if (ingreso !== null && !esFecha(ingreso)) return { error: `${nombre}: la fecha de ingreso no es una fecha.` }
      const dv = p.diasVacaciones === null || p.diasVacaciones === undefined || p.diasVacaciones === '' ? null : Number(p.diasVacaciones)
      if (dv !== null && (!Number.isInteger(dv) || dv < 0 || dv > 60)) return { error: `${nombre}: los días de vacaciones no son válidos.` }
      personas.push({ id: pid, nombre: texto(p.nombre, 80) || nombre, ingreso, diasVacaciones: dv })
    }
    const quienPorDia = {}
    for (const [d, pid] of Object.entries(e.quienPorDia ?? {})) {
      if (/^[1-7]$/.test(d) && personas.some(p => p.id === pid)) quienPorDia[d] = pid
    }
    const grupo = e.grupo === null || e.grupo === undefined || e.grupo === '' ? null : id(e.grupo)
    if (e.grupo && !grupo) return { error: `${nombre}: el grupo de puntualidad no es válido.` }
    const antes = (Array.isArray(e.antes) ? e.antes : []).map(id).filter(Boolean).slice(0, 5)
    const noAbre = e.noAbre === true
    if (noAbre && !grupo) return { error: `${nombre}: quien no abre caja tiene que compartir la puntualidad con alguien, o su bono no tendría con qué medirse.` }
    empleados.push({ id: eid, nombre, plaza: e.plaza, usuarios, dias: dias.sort(), sueldo, bono, activo: e.activo !== false, grupo, noAbre, antes, personas, quienPorDia })
  }

  const p = cfg.parametros ?? {}
  const pct = Number(p.pctComision)
  if (!Number.isFinite(pct) || pct < 0 || pct > 0.5) return { error: 'El porcentaje de comisión tiene que estar entre 0% y 50%.' }
  const minimos = {}, maximos = {}, categorias = {}
  for (const t of TIPOS_COMISION) {
    const mi = dinero(p.minimos?.[t]); const ma = dinero(p.maximos?.[t])
    if (mi === undefined || ma === undefined) return { error: `El precio de ${t} no es válido.` }
    minimos[t] = mi ?? 0
    maximos[t] = ma
    categorias[t] = p.categorias?.[t] !== false
  }
  const tolerancia = {}, horarios = {}
  for (const pl of PLAZAS_NOMINA) {
    const tol = Number(p.tolerancia?.[pl] ?? 10)
    if (!Number.isInteger(tol) || tol < 0 || tol > 120) return { error: 'La tolerancia va de 0 a 120 minutos.' }
    tolerancia[pl] = tol
    horarios[pl] = {}
    for (let d = 1; d <= 7; d++) {
      const h = p.horarios?.[pl]?.[d]
      if (h === null || h === undefined || h === '') { horarios[pl][d] = null; continue }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(h))) return { error: `Hora de apertura inválida: ${h}.` }
      horarios[pl][d] = String(h)
    }
  }
  const bm = p.bonoMinutos ?? {}
  const completo = Number(bm.completo ?? 20), mitad = Number(bm.mitad ?? 30)
  if (![completo, mitad].every(n => Number.isInteger(n) && n >= 0 && n <= 600)) return { error: 'Los minutos del bono van de 0 a 600.' }
  if (mitad < completo) return { error: 'El límite del bono a la mitad no puede ser menor que el del bono completo.' }
  const bonoMinutos = { completo, mitad }
  const excluidos = (Array.isArray(p.excluidos) ? p.excluidos : []).map(c => texto(c, 30).toUpperCase()).filter(Boolean).slice(0, 300)
  return { config: { empleados, parametros: { pctComision: pct, categorias, minimos, maximos, excluidos, tolerancia, horarios, bonoMinutos } } }
}

/** Qué cambió entre dos configuraciones, en palabras, para la bitácora. */
export function cambiosDeConfig(antes, despues) {
  const out = []
  const viejos = new Map((antes?.empleados ?? []).map(e => [e.id, e]))
  for (const e of despues.empleados) {
    const v = viejos.get(e.id)
    if (!v) { out.push(`alta de ${e.nombre} (${e.plaza})`); continue }
    for (const k of ['nombre', 'plaza', 'sueldo', 'bono', 'activo']) {
      if (JSON.stringify(v[k]) !== JSON.stringify(e[k])) out.push(`${e.nombre}: ${k} ${JSON.stringify(v[k] ?? null)} → ${JSON.stringify(e[k] ?? null)}`)
    }
    if (JSON.stringify(v.dias) !== JSON.stringify(e.dias)) out.push(`${e.nombre}: días ${(v.dias ?? []).join(',')} → ${e.dias.join(',')}`)
    if (JSON.stringify(v.usuarios) !== JSON.stringify(e.usuarios)) out.push(`${e.nombre}: usuarios del punto de venta`)
    if (JSON.stringify(v.personas) !== JSON.stringify(e.personas)) out.push(`${e.nombre}: personas, ingreso o vacaciones`)
    viejos.delete(e.id)
  }
  for (const v of viejos.values()) out.push(`se quitó ${v.nombre}`)
  if (JSON.stringify(antes?.parametros ?? null) !== JSON.stringify(despues.parametros)) out.push('parámetros (comisión, horarios, tolerancia o bono)')
  return out
}

const enRango = (f, d, h) => f >= d && f <= h
const masDia = (f, n) => { const d = new Date(`${f}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

/**
 * Lo que ve una TIENDA: sólo su plaza y sin nada de RH.
 *
 * Las vacaciones se convierten en justificaciones sin motivo: la cuenta del
 * bono sale igual —un día de vacaciones no es falta— pero la tienda no sabe
 * que fueron vacaciones.
 */
export function recorteTienda(config, estado, plaza) {
  const empleados = (config?.empleados ?? []).filter(e => e.plaza === plaza)
    .map(e => ({ ...e, personas: (e.personas ?? []).map(p => ({ id: p.id, nombre: p.nombre })) }))
  const regs = new Set(empleados.map(e => e.id))
  const personaDe = new Map(empleados.flatMap(e => e.personas.map(p => [p.id, e])))
  const s = estado ?? {}
  const justificaciones = Object.fromEntries(Object.entries(s.justificaciones ?? {})
    .filter(([k]) => regs.has(k.split('|')[0])))
  for (const v of s.vacaciones ?? []) {
    const e = personaDe.get(v.persona)
    if (!e || (e.personas?.length ?? 0) !== 1) continue
    for (let f = v.desde; f <= v.hasta && f <= masDia(v.desde, 400); f = masDia(f, 1)) {
      justificaciones[`${e.id}|${f}`] = { motivo: 'Justificado', bono: true, sueldo: true, sinDescuento: true }
    }
  }
  const dePlaza = k => k.startsWith(`${plaza}|`)
  return {
    config: config ? { ...config, empleados } : null,
    estado: {
      justificaciones,
      coberturas: Object.fromEntries(Object.entries(s.coberturas ?? {}).filter(([k]) => dePlaza(k))),
      comisiones: Object.fromEntries(Object.entries(s.comisiones ?? {}).filter(([k]) => dePlaza(k))
        .map(([k, v]) => [k, { estado: v.estado, monto: v.monto ?? null, motivo: v.motivo ?? null }])),
      manuales: (s.manuales ?? []).filter(m => regs.has(m.registro)).map(({ foto, ...m }) => m),
      ajustes: (s.ajustes ?? []).filter(a => regs.has(a.registro)),
      pagos: Object.fromEntries(Object.entries(s.pagos ?? {}).filter(([k]) => regs.has(k.split('|')[0]))),
    },
  }
}

const nuevoId = ahora => `${Date.parse(ahora).toString(36)}${Math.random().toString(36).slice(2, 6)}`

/**
 * Aplica una acción del administrador sobre el estado. Devuelve
 * `{ estado, bitacora, salidas }` o `{ error }`. `salidas` son los
 * `(registro, lunes)` cuyas comisiones cambiaron: hay que rehacer su salida de
 * efectivo.
 */
export function aplicarAccion(estadoIn, config, a, { quien, ahora = new Date().toISOString() } = {}) {
  const estado = structuredClone(estadoIn ?? {})
  const regs = new Map((config?.empleados ?? []).map(e => [e.id, e]))
  const personas = new Map([...regs.values()].flatMap(e => (e.personas ?? []).map(p => [p.id, e])))
  const motivo = texto(a?.motivo, 300)
  const bit = (accion, detalle) => ({ cuando: ahora, quien, accion, detalle, motivo: motivo || null })
  const salidas = []

  switch (a?.accion) {
    case 'justificar': {
      if (!regs.has(a.registro) || !esFecha(a.fecha)) return { error: 'Falta el registro o el día.' }
      if (!motivo) return { error: 'Toda justificación lleva motivo.' }
      estado.justificaciones = { ...(estado.justificaciones ?? {}) }
      estado.justificaciones[`${a.registro}|${a.fecha}`] = { motivo, bono: a.bono !== false, sueldo: a.sueldo !== false, quien, cuando: ahora }
      return { estado, bitacora: bit('justificar', `${regs.get(a.registro).nombre} · ${a.fecha} · ${a.bono !== false ? 'perdona bono' : 'pierde bono'} · ${a.sueldo !== false ? 'perdona sueldo' : 'descuenta el día'}`), salidas }
    }
    case 'quitar-justificacion': {
      const k = `${a.registro}|${a.fecha}`
      if (!estado.justificaciones?.[k]) return { error: 'Esa justificación no existe.' }
      delete estado.justificaciones[k]
      return { estado, bitacora: bit('quitar-justificacion', `${regs.get(a.registro)?.nombre ?? a.registro} · ${a.fecha}`), salidas }
    }
    case 'cobertura': {
      if (!PLAZAS_NOMINA.includes(a.plaza) || !esFecha(a.fecha)) return { error: 'Falta la plaza o el día.' }
      const k = `${a.plaza}|${a.fecha}`
      estado.coberturas = { ...(estado.coberturas ?? {}) }
      if (!a.quien) { delete estado.coberturas[k]; return { estado, bitacora: bit('cobertura', `${a.plaza} · ${a.fecha} · vuelve a lo automático`), salidas } }
      if (a.quien !== 'nadie' && regs.get(a.quien)?.plaza !== a.plaza) return { error: 'Quien cubre tiene que ser de esa sucursal.' }
      estado.coberturas[k] = { quien: a.quien, sinDescuento: !!a.sinDescuento, por: quien, cuando: ahora }
      return { estado, bitacora: bit('cobertura', `${a.plaza} · ${a.fecha} · abrió ${a.quien === 'nadie' ? 'nadie' : regs.get(a.quien).nombre}${a.sinDescuento ? ' · sin descuento al titular' : ''}`), salidas }
    }
    case 'comision': {
      const items = Array.isArray(a.items) ? a.items : []
      if (!items.length || items.length > 500) return { error: 'Entre 1 y 500 comisiones por petición.' }
      if (!ESTADOS_COMISION.has(a.estado)) return { error: 'Estado de comisión desconocido.' }
      if (a.estado === 'rechazada' && !motivo) return { error: 'Rechazar una comisión lleva motivo.' }
      estado.comisiones = { ...(estado.comisiones ?? {}) }
      for (const it of items) {
        const [plaza] = String(it?.clave ?? '').split('|')
        const reg = regs.get(it?.registro)
        if (!PLAZAS_NOMINA.includes(plaza) || !reg || reg.plaza !== plaza || !esLunes(it?.lunes)) return { error: 'Comisión mal identificada.' }
        const m = dinero(it.monto, { min: 0, max: 10000 })
        if (m === null || m === undefined) return { error: 'Comisión sin monto válido.' }
        const previa = estado.comisiones[it.clave] ?? {}
        estado.comisiones[it.clave] = {
          ...previa, estado: a.estado, monto: m, registro: reg.id, lunes: it.lunes,
          motivo: a.estado === 'rechazada' ? motivo : null, quien, cuando: ahora,
        }
        salidas.push(`${reg.id}|${it.lunes}`)
      }
      return { estado, bitacora: bit(`comision-${a.estado}`, `${items.length} ${items.length === 1 ? 'comisión' : 'comisiones'}: ${items.slice(0, 8).map(i => i.clave).join(', ')}${items.length > 8 ? '…' : ''}`), salidas }
    }
    case 'foto-comision': {
      if (!String(a.clave ?? '').includes('|') || !/^[a-z0-9]{6,40}\.(jpg|png|webp)$/.test(String(a.foto ?? ''))) return { error: 'Foto inválida.' }
      estado.comisiones = { ...(estado.comisiones ?? {}) }
      estado.comisiones[a.clave] = { ...(estado.comisiones[a.clave] ?? { estado: 'pendiente' }), foto: a.foto }
      return { estado, bitacora: bit('foto-comision', a.clave), salidas }
    }
    case 'comision-manual': {
      const reg = regs.get(a.registro)
      if (!reg || !esFecha(a.fecha)) return { error: 'Falta el empleado o el día.' }
      const m = dinero(a.monto, { min: 0.01, max: 10000 })
      if (!m) return { error: 'La comisión lleva un monto.' }
      const concepto = texto(a.concepto, 160)
      if (!concepto) return { error: 'La comisión manual lleva concepto.' }
      const nueva = { id: nuevoId(ahora), registro: reg.id, fecha: a.fecha, monto: m, concepto, foto: a.foto ?? null, quien, cuando: ahora }
      estado.manuales = [...(estado.manuales ?? []), nueva]
      salidas.push(`${reg.id}|${lunesDeUTC(a.fecha)}`)
      return { estado, bitacora: bit('comision-manual', `${reg.nombre} · ${a.fecha} · $${m} · ${concepto}`), salidas }
    }
    case 'quitar-comision-manual': {
      const m = (estado.manuales ?? []).find(x => x.id === a.id)
      if (!m) return { error: 'Esa comisión no existe.' }
      estado.manuales = estado.manuales.filter(x => x.id !== a.id)
      salidas.push(`${m.registro}|${lunesDeUTC(m.fecha)}`)
      return { estado, bitacora: bit('quitar-comision-manual', `${regs.get(m.registro)?.nombre ?? m.registro} · ${m.fecha} · $${m.monto}`), salidas }
    }
    case 'ajuste': {
      const reg = regs.get(a.registro)
      if (!reg || !esLunes(a.semana)) return { error: 'Falta el empleado o la semana.' }
      const m = dinero(a.monto, { min: -50000, max: 50000 })
      if (!m) return { error: 'El ajuste lleva un monto distinto de cero.' }
      if (!motivo) return { error: 'Todo ajuste lleva motivo.' }
      estado.ajustes = [...(estado.ajustes ?? []), { id: nuevoId(ahora), registro: reg.id, semana: a.semana, monto: m, motivo, quien, cuando: ahora }]
      return { estado, bitacora: bit('ajuste', `${reg.nombre} · semana ${a.semana} · ${m > 0 ? '+' : ''}$${m}`), salidas }
    }
    case 'quitar-ajuste': {
      const x = (estado.ajustes ?? []).find(j => j.id === a.id)
      if (!x) return { error: 'Ese ajuste no existe.' }
      estado.ajustes = estado.ajustes.filter(j => j.id !== a.id)
      return { estado, bitacora: bit('quitar-ajuste', `${regs.get(x.registro)?.nombre ?? x.registro} · $${x.monto}`), salidas }
    }
    case 'pagar': {
      const reg = regs.get(a.registro)
      if (!reg || !esLunes(a.semana)) return { error: 'Falta el empleado o la semana.' }
      const total = dinero(a.total, { min: -50000, max: 100000 })
      if (total === null || total === undefined) return { error: 'Falta el total pagado.' }
      estado.pagos = { ...(estado.pagos ?? {}), [`${reg.id}|${a.semana}`]: { total, quien, cuando: ahora } }
      return { estado, bitacora: bit('pagar', `${reg.nombre} · semana ${a.semana} · $${total}`), salidas }
    }
    case 'despagar': {
      const k = `${a.registro}|${a.semana}`
      if (!estado.pagos?.[k]) return { error: 'Esa semana no está marcada como pagada.' }
      if (!motivo) return { error: 'Quitar un pago lleva motivo.' }
      delete estado.pagos[k]
      return { estado, bitacora: bit('despagar', `${regs.get(a.registro)?.nombre ?? a.registro} · semana ${a.semana}`), salidas }
    }
    case 'vacacion': {
      const reg = personas.get(a.persona)
      if (!reg || !esFecha(a.desde) || !esFecha(a.hasta) || a.hasta < a.desde) return { error: 'Faltan la persona o las fechas.' }
      if (masDia(a.desde, 60) < a.hasta) return { error: 'Un periodo de vacaciones no puede pasar de 60 días.' }
      const v = { id: nuevoId(ahora), persona: a.persona, desde: a.desde, hasta: a.hasta, cubre: texto(a.cubre, 80) || null, notas: texto(a.notas, 300) || null, quien, cuando: ahora }
      estado.vacaciones = [...(estado.vacaciones ?? []), v]
      return { estado, bitacora: bit('vacacion', `${reg.personas.find(p => p.id === a.persona)?.nombre} · ${a.desde} a ${a.hasta}`), salidas }
    }
    case 'quitar-vacacion': {
      const v = (estado.vacaciones ?? []).find(x => x.id === a.id)
      if (!v) return { error: 'Esas vacaciones no existen.' }
      estado.vacaciones = estado.vacaciones.filter(x => x.id !== a.id)
      return { estado, bitacora: bit('quitar-vacacion', `${v.persona} · ${v.desde} a ${v.hasta}`), salidas }
    }
    default:
      return { error: 'Acción desconocida.' }
  }
}

function lunesDeUTC(f) {
  const d = new Date(`${f}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/**
 * La salida de efectivo de las comisiones de un registro en una semana.
 *
 * UNA por persona y semana —no una por ticket— con el concepto «Comisiones de
 * ‹nombre›», que es como el corte la reconoce (`esComision`) y de donde saca
 * el nombre (`trabajadorDe`). Se rehace entera cada vez que cambia una
 * autorización: si se rechaza la última, la salida desaparece.
 */
export function salidaDeComisiones(estado, reg, lunes, hoy) {
  const hasta = masDia(lunes, 6)
  const total = Object.values(estado.comisiones ?? {})
    .filter(c => c.estado === 'autorizada' && c.registro === reg.id && c.lunes === lunes)
    .reduce((a, c) => a + Number(c.monto || 0), 0)
    + (estado.manuales ?? []).filter(m => m.registro === reg.id && enRango(m.fecha, lunes, hasta))
      .reduce((a, m) => a + Number(m.monto || 0), 0)
  const idMov = `nomina-com-${reg.id}-${lunes}`
  if (total <= 0) return { id: idMov, borrar: true }
  return {
    id: idMov,
    mov: {
      id: idMov, f: hoy, tipo: 'otra-salida', monto: Math.round(total * 100) / 100,
      concepto: `Comisiones de ${reg.nombre}`,
      comprobante: false, origen: 'pagina', quien: 'admin', nomina: { registro: reg.id, lunes }, cuando: new Date().toISOString(),
    },
  }
}

/** Una entrada de la bitácora nunca se reescribe: se añade, y se guardan las últimas 3,000. */
export const conBitacora = (bit, entrada) => ({ entradas: [...(bit?.entradas ?? []), entrada].slice(-3000) })
