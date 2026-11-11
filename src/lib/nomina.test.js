import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularComision, semanaNomina, registroDeUsuario, coincideUsuario, diasLFT, antiguedad,
  saldoVacaciones, valorDia, PARAMETROS_INICIALES, diaIso, configCompleta, CONFIG_INICIAL as SIN_EMPLEADOS, limitesBono,
} from './nomina.js'
import { EMPLEADOS_INICIALES } from '../../backend/src/nomina.js'

// Los registros de arranque viven en el BACKEND: llevan sueldos y lo del
// frontend va en el JavaScript público. Las pruebas los toman de ahí.
const CONFIG_INICIAL = { empleados: EMPLEADOS_INICIALES, parametros: PARAMETROS_INICIALES }

test('el frontend no trae ningún sueldo: la configuración de arranque va vacía', () => {
  assert.deepEqual(SIN_EMPLEADOS.empleados, [])
  assert.deepEqual(configCompleta(null).empleados, [])
})

const LUNES = '2026-11-09'   // lunes
const T = (slug, persona, fecha, hora) => ({ slug, persona, fecha, inicio: `${fecha}T${hora}:00` })
const linea = (tipo, precio, extra = {}) => ({ codigo: tipo.toUpperCase(), producto: tipo, tipo, cantidad: 1, precio, mayoreo: false, ...extra })

// ── Comisiones ─────────────────────────────────────────────────────────────

test('el ejemplo del dueño: funda $250 + mica $120 + sticker $100 → sólo el par más caro', () => {
  const c = calcularComision({ lineas: [linea('funda', 250), linea('hidrogel', 120), linea('sticker', 100)] }, PARAMETROS_INICIALES)
  assert.equal(c.base, 370)
  assert.equal(c.monto, 25.9)
  assert.deepEqual(c.par.map(x => x.tipo), ['funda', 'hidrogel'])
})

test('funda $350 + mica $150 = $35, como en la especificación', () => {
  assert.equal(calcularComision({ lineas: [linea('funda', 350), linea('hidrogel', 150)] }, PARAMETROS_INICIALES).monto, 35)
})

test('por debajo del mínimo de su tipo no entra: funda < $220, mica < $120, sticker < $100', () => {
  assert.equal(calcularComision({ lineas: [linea('funda', 219), linea('hidrogel', 150)] }, PARAMETROS_INICIALES), null)
  assert.equal(calcularComision({ lineas: [linea('funda', 250), linea('hidrogel', 119.99)] }, PARAMETROS_INICIALES), null)
  assert.equal(calcularComision({ lineas: [linea('hidrogel', 150), linea('sticker', 70)] }, PARAMETROS_INICIALES), null)
  // Con el mínimo exacto, sí.
  assert.equal(calcularComision({ lineas: [linea('hidrogel', 120), linea('sticker', 100)] }, PARAMETROS_INICIALES).monto, 15.4)
})

test('dos del MISMO tipo no son par, y el mayoreo no comisiona', () => {
  assert.equal(calcularComision({ lineas: [linea('funda', 300), linea('funda', 250)] }, PARAMETROS_INICIALES), null)
  assert.equal(calcularComision({ lineas: [linea('funda', 300), linea('hidrogel', 150, { mayoreo: true })] }, PARAMETROS_INICIALES), null)
})

test('UNA comisión por ticket: dos fundas y dos micas pagan sólo el par más caro', () => {
  const c = calcularComision({ lineas: [linea('funda', 300), linea('funda', 250), linea('hidrogel', 200), linea('hidrogel', 150)] }, PARAMETROS_INICIALES)
  assert.equal(c.base, 500)
  assert.equal(c.monto, 35)
})

test('el porcentaje, las categorías, los máximos y los excluidos son parámetros', () => {
  const p = { ...PARAMETROS_INICIALES, pctComision: 0.1, maximos: { ...PARAMETROS_INICIALES.maximos, hidrogel: 200 } }
  assert.equal(calcularComision({ lineas: [linea('funda', 250), linea('hidrogel', 150)] }, p).monto, 40)
  assert.equal(calcularComision({ lineas: [linea('funda', 250), linea('hidrogel', 258)] }, p), null, 'mica por encima del máximo')
  const sinSticker = { ...PARAMETROS_INICIALES, categorias: { ...PARAMETROS_INICIALES.categorias, sticker: false } }
  assert.equal(calcularComision({ lineas: [linea('funda', 250), linea('sticker', 100)] }, sinSticker), null)
  const excl = { ...PARAMETROS_INICIALES, excluidos: ['FUNDA'] }
  assert.equal(calcularComision({ lineas: [linea('funda', 250), linea('hidrogel', 150)] }, excl), null)
})

// ── Quién es quién ─────────────────────────────────────────────────────────

test('el usuario del punto de venta casa por palabras, sin acentos ni mayúsculas', () => {
  assert.equal(coincideUsuario('angel', 'ÁNGEL MARTÍNEZ'), true)
  assert.equal(coincideUsuario('cesareo nolasco ramirez', 'Cesareo Nolasco Ramirez'), true)
  assert.equal(coincideUsuario('andrea serrano palacios', 'cesareo nolasco ramirez'), false)
  assert.equal(coincideUsuario('', 'cualquiera'), false)
})

test('el usuario de Brenda: entre semana es Brenda, el fin de semana es su sobrina', () => {
  assert.equal(registroDeUsuario(CONFIG_INICIAL, 'aguascalientes', '2026-11-10', 'brenda rangel').id, 'brenda')
  assert.equal(registroDeUsuario(CONFIG_INICIAL, 'aguascalientes', '2026-11-14', 'brenda rangel').id, 'sobrina-brenda')
  assert.equal(diaIso('2026-11-15'), 7)
})

test('el valor de un día es el sueldo entre los días programados', () => {
  assert.equal(valorDia(CONFIG_INICIAL.empleados.find(e => e.id === 'cesareo')), 300)
  assert.equal(valorDia(CONFIG_INICIAL.empleados.find(e => e.id === 'andrea')), 400)
  assert.equal(valorDia({ sueldo: null, dias: [1] }), 0)
})

test('siete faltas descuentan el sueldo entero, sin centavos sueltos', () => {
  const r = semanaNomina({ config: CONFIG_INICIAL, turnos: [], lunes: LUNES, hoy: '2026-11-16', ultimoDato: { leon: '2026-11-15' }, plazas: ['leon'] })
  const dan = r.find(x => x.registro.id === 'daniela'), jen = r.find(x => x.registro.id === 'jenni')
  assert.equal(dan.descuentos.length, 6, 'Daniela: seis días de $333.33')
  assert.equal(dan.totales.total, 0)
  assert.equal(jen.descuentos.length, 0, 'Jenni no abre caja: su sueldo no depende de las aperturas')
  assert.equal(jen.totales.total, 2000, 'pero las faltas de Daniela le quitan el bono')
})

// ── La semana ──────────────────────────────────────────────────────────────

const semanaSL = (turnos, estado = {}, extra = {}) => semanaNomina({
  config: CONFIG_INICIAL, estado, turnos, lunes: LUNES, hoy: '2026-11-16',
  ultimoDato: { 'san-luis': '2026-11-15' }, plazas: ['san-luis'], ...extra,
})
const deSL = (r, id) => r.find(x => x.registro.id === id)
const semanaCompleta = (ajuste = {}) => [
  ...['09', '10', '11', '12', '13'].map(d => T('san-luis', 'andrea serrano palacios', `2026-11-${d}`, '10:25')),
  T('san-luis', 'Cesareo Nolasco Ramirez', '2026-11-14', '10:20'),
  T('san-luis', 'Cesareo Nolasco Ramirez', '2026-11-15', '10:30'),
].map(t => ajuste[t.fecha] ? { ...t, ...ajuste[t.fecha] } : t)

test('una semana limpia: sueldo + bono, sin descuentos', () => {
  const r = semanaSL(semanaCompleta())
  const a = deSL(r, 'andrea'), c = deSL(r, 'cesareo')
  assert.equal(a.bono.estado, 'vigente')
  assert.equal(a.totales.total, 2300)
  assert.equal(c.totales.total, 700, 'Cesareo: $600 + bono fijo de $100')
  assert.equal(a.dias.length, 5, 'Andrea sólo se evalúa de lunes a viernes')
  assert.equal(c.dias.length, 2, 'Cesareo sólo sábado y domingo')
})

// 🔒 El bono por minutos (el dueño, 2026-11-11): 10 de tolerancia al día; lo
// que pasa de ahí se suma en la semana. Hasta 20 entero, hasta 30 la mitad,
// más nada. Andrea abre a las 10:30 y su bono es de $300.
const tarde = horas => semanaCompleta(Object.fromEntries(Object.entries(horas).map(([f, h]) => [f, { inicio: `${f}T${h}:00` }])))

test('dentro de la tolerancia no suma nada; fuera, sólo lo que pasa de los 10', () => {
  const a = deSL(semanaSL(tarde({ '2026-11-10': '10:40', '2026-11-11': '10:45' })), 'andrea')
  assert.equal(a.bono.minutos, 5, '10:40 suma 0 y 10:45 suma 5, no 15')
  assert.equal(a.bono.estado, 'vigente')
  assert.equal(a.totales.bono, 300)
})

test('hasta 20 minutos acumulados el bono va entero', () => {
  const a = deSL(semanaSL(tarde({ '2026-11-09': '10:50', '2026-11-12': '10:40' })), 'andrea')
  assert.equal(a.bono.minutos, 10 + 0)
  const b = deSL(semanaSL(tarde({ '2026-11-09': '10:50', '2026-11-12': '10:50' })), 'andrea')
  assert.equal(b.bono.minutos, 20, 'justo 20: entero')
  assert.equal(b.bono.estado, 'vigente')
  assert.equal(b.totales.bono, 300)
})

test('de 21 a 30 minutos, la mitad del bono, con el día que lo cruzó', () => {
  const a = deSL(semanaSL(tarde({ '2026-11-09': '10:50', '2026-11-12': '10:51' })), 'andrea')
  assert.equal(a.bono.minutos, 21)
  assert.equal(a.bono.estado, 'mitad')
  assert.equal(a.totales.bono, 150)
  assert.equal(a.bono.incumplimiento.fecha, '2026-11-12')
  assert.equal(a.bono.incumplimiento.hora, '10:51')
  assert.equal(a.totales.total, 2150)
  const b = deSL(semanaSL(tarde({ '2026-11-09': '11:00', '2026-11-12': '10:50' })), 'andrea')
  assert.equal(b.bono.minutos, 30, 'justo 30: todavía la mitad')
  assert.equal(b.totales.bono, 150)
})

test('más de 30 minutos acumulados pierde el bono', () => {
  const a = deSL(semanaSL(tarde({ '2026-11-09': '11:00', '2026-11-12': '10:51' })), 'andrea')
  assert.equal(a.bono.minutos, 31)
  assert.equal(a.bono.estado, 'perdido')
  assert.equal(a.totales.bono, 0)
  assert.equal(a.bono.incumplimiento.fecha, '2026-11-12')
})

test('quien trabaja menos días tiene la parte proporcional; con seis, los de cinco', () => {
  const cfg = CONFIG_INICIAL
  assert.deepEqual(limitesBono(cfg.empleados.find(e => e.id === 'cesareo')), { completo: 8, mitad: 12 })
  assert.deepEqual(limitesBono(cfg.empleados.find(e => e.id === 'andrea')), { completo: 20, mitad: 30 })
  assert.deepEqual(limitesBono(cfg.empleados.find(e => e.id === 'daniela')), { completo: 20, mitad: 30 }, 'seis días no dan más minutos')
  // Cesareo abre a las 10:30: el sábado 10:49 suma 9 → ya pasa de 8, la mitad.
  const c = deSL(semanaSL(tarde({ '2026-11-14': '10:49' })), 'cesareo')
  assert.equal(c.bono.minutos, 9)
  assert.equal(c.bono.estado, 'mitad')
  assert.equal(c.totales.bono, 50)
  const c2 = deSL(semanaSL(tarde({ '2026-11-14': '10:49', '2026-11-15': '10:44' })), 'cesareo')
  assert.equal(c2.bono.minutos, 13, '9 + 4 pasa de 12: sin bono')
  assert.equal(c2.bono.estado, 'perdido')
})

test('un retardo justificado no suma minutos', () => {
  const horas = { '2026-11-09': '11:00', '2026-11-12': '10:51' }
  const just = { justificaciones: { 'andrea|2026-11-09': { motivo: 'tráfico', bono: true } } }
  const a = deSL(semanaSL(tarde(horas), just), 'andrea')
  assert.equal(a.bono.minutos, 11)
  assert.equal(a.bono.estado, 'vigente')
})

test('los límites del bono son parámetros', () => {
  const config = { ...CONFIG_INICIAL, parametros: { bonoMinutos: { completo: 5, mitad: 10 } } }
  const a = deSL(semanaSL(tarde({ '2026-11-11': '10:46' }), {}, { config }), 'andrea')
  assert.equal(a.bono.minutos, 6)
  assert.equal(a.bono.estado, 'mitad')
})

test('una justificación devuelve el bono', () => {
  const turnos = semanaCompleta({ '2026-11-11': { inicio: '2026-11-11T10:55:00' } })
  const r = semanaSL(turnos, { justificaciones: { 'andrea|2026-11-11': { motivo: 'Tráfico por accidente' } } })
  assert.equal(deSL(r, 'andrea').bono.estado, 'vigente')
})

test('un día sin apertura con el respaldo ya leído es FALTA: descuenta el día Y el bono', () => {
  const sinMiercoles = semanaCompleta().filter(t => t.fecha !== '2026-11-11')
  const a = deSL(semanaSL(sinMiercoles), 'andrea')
  assert.equal(a.bono.estado, 'perdido')
  assert.deepEqual(a.descuentos.map(x => [x.fecha, x.monto, x.falta]), [['2026-11-11', 400, true]])
  assert.equal(a.totales.total, 1600, '$2,000 − $400 del día, sin bono')
})

test('sin respaldo todavía no es falta: el día que ya pasó deja el bono en riesgo', () => {
  const soloLunesMartes = semanaCompleta().filter(t => t.fecha <= '2026-11-10')
  const a = deSL(semanaSL(soloLunesMartes, {}, { ultimoDato: { 'san-luis': '2026-11-10' }, hoy: '2026-11-12' }), 'andrea')
  assert.equal(a.bono.estado, 'riesgo', 'el miércoles ya pasó y todavía no hay dato')
  assert.equal(a.dias.find(d => d.fecha === '2026-11-11').estado, 'sin-dato')
  assert.equal(a.dias.find(d => d.fecha === '2026-11-13').estado, 'por-venir')
  assert.equal(a.totales.descuentos, 0)
})

test('una falta justificada: el administrador perdona el bono, el sueldo, o los dos', () => {
  const sinMiercoles = semanaCompleta().filter(t => t.fecha !== '2026-11-11')
  const con = j => deSL(semanaSL(sinMiercoles, { justificaciones: { 'andrea|2026-11-11': { motivo: 'Cita médica', ...j } } }), 'andrea')
  assert.equal(con({}).totales.total, 2300, 'lo de arranque: perdona los dos')
  assert.equal(con({ sueldo: false }).totales.total, 1900, 'perdona el bono, descuenta el día')
  assert.equal(con({ bono: false }).totales.total, 2000, 'paga el día, pierde el bono')
  assert.equal(con({ bono: false, sueldo: false }).totales.total, 1600)
})

test('una comisión autorizada guarda su monto aunque luego cambie el porcentaje', () => {
  const tk = { id: '777', f: '2026-11-10', cajero: 'andrea serrano palacios', lineas: [linea('funda', 250), linea('hidrogel', 150)] }
  const r = semanaSL(semanaCompleta(), { comisiones: { 'san-luis|777': { estado: 'autorizada', monto: 28 } } },
    { comisionables: { 'san-luis': [tk] }, config: { ...CONFIG_INICIAL, parametros: { ...PARAMETROS_INICIALES, pctComision: 0.1 } } })
  assert.equal(deSL(r, 'andrea').totales.comisiones, 28)
})

test('Andrea cubre el sábado de Cesareo: a ella +$300, a él −$300, y no es falta suya', () => {
  const turnos = semanaCompleta({ '2026-11-14': { persona: 'andrea serrano palacios' } })
  const r = semanaSL(turnos)
  const a = deSL(r, 'andrea'), c = deSL(r, 'cesareo')
  assert.deepEqual(a.coberturas.map(x => [x.fecha, x.monto]), [['2026-11-14', 300]])
  assert.equal(a.totales.total, 2600)
  assert.equal(c.dias.find(d => d.fecha === '2026-11-14').estado, 'cubierto')
  assert.equal(c.bono.estado, 'vigente', 'el día cubierto no le cuesta el bono')
  assert.equal(c.totales.total, 400, '$600 − $300 + $100')
  assert.equal(a.bono.estado, 'vigente', 'cubrir el sábado no toca el bono de Andrea')
})

test('el administrador puede quitar el descuento de un día cubierto', () => {
  const turnos = semanaCompleta({ '2026-11-14': { persona: 'andrea serrano palacios' } })
  const r = semanaSL(turnos, { coberturas: { 'san-luis|2026-11-14': { quien: 'andrea', sinDescuento: true } } })
  assert.equal(deSL(r, 'cesareo').totales.total, 700)
  assert.equal(deSL(r, 'andrea').totales.coberturas, 300)
})

test('Brenda trabaja un sábado: lo marca el administrador y se le paga a ella', () => {
  const turnos = [T('aguascalientes', 'brenda rangel', '2026-11-14', '10:20')]
  const base = { config: CONFIG_INICIAL, turnos, lunes: LUNES, hoy: '2026-11-16', ultimoDato: { aguascalientes: '2026-11-15' }, plazas: ['aguascalientes'] }
  const sinMarca = semanaNomina({ ...base, estado: {} })
  assert.equal(sinMarca.find(x => x.registro.id === 'sobrina-brenda').dias.find(d => d.fecha === '2026-11-14').estado, 'puntual',
    'el usuario de Brenda en sábado es de la sobrina')
  const marcado = semanaNomina({ ...base, estado: { coberturas: { 'aguascalientes|2026-11-14': { quien: 'brenda' } } } })
  assert.deepEqual(marcado.find(x => x.registro.id === 'brenda').coberturas.map(x => x.monto), [300])
})

test('un usuario del punto de venta sin registro no descuenta al titular', () => {
  const turnos = semanaCompleta({ '2026-11-14': { persona: 'david antonio olivares' } })
  const c = deSL(semanaSL(turnos), 'cesareo')
  const d = c.dias.find(x => x.fecha === '2026-11-14')
  assert.equal(d.sinRegistro, true)
  assert.equal(c.totales.descuentos, 0)
})

test('vacaciones: el día no es falta y, si alguien cubre, no se descuenta al titular', () => {
  const turnos = semanaCompleta({ '2026-11-14': { persona: 'andrea serrano palacios' } }).filter(t => t.fecha !== '2026-11-15')
  const estado = { vacaciones: [{ id: 'v1', persona: 'cesareo', desde: '2026-11-14', hasta: '2026-11-15' }] }
  const c = deSL(semanaSL(turnos, estado), 'cesareo')
  assert.deepEqual(c.dias.map(d => d.estado), ['vacaciones', 'vacaciones'])
  assert.equal(c.totales.descuentos, 0)
  assert.equal(c.bono.estado, 'vigente')
})

// 🔒 Daniela y Jenni (el dueño, 2026-11-11): $2,000 y $500 de bono CADA UNA,
// cada una con su recibo, y la puntualidad de León es de las dos.
const semanaLeon = (turnos, estado = {}) => semanaNomina({ config: CONFIG_INICIAL, estado, turnos, lunes: LUNES, hoy: '2026-11-16', ultimoDato: { leon: '2026-11-15' }, plazas: ['leon'] })
const deLeon = (r, id) => r.find(x => x.registro.id === id)
const leonATiempo = (ajuste = {}) => [1, 2, 3, 4, 5, 6, 7].map(i => {
  const f = `2026-11-${String(8 + i).padStart(2, '0')}`
  return T('leon', i === 5 ? 'jenni gllardo' : 'daniela coronilla', f, ajuste[f] ?? '10:30')
})

test('Daniela y Jenni: dos recibos, $2,000 y $500 de bono cada una', () => {
  const r = semanaLeon(leonATiempo())
  assert.equal(r.length, 2)
  assert.equal(deLeon(r, 'daniela').totales.total, 2500)
  assert.equal(deLeon(r, 'jenni').totales.total, 2500)
  assert.deepEqual(deLeon(r, 'daniela').bono.compartidoCon, ['Jenni Gallardo'])
})

test('Jenni no abre caja: sin aperturas cobra su sueldo entero y no tiene días que evaluar', () => {
  const r = semanaLeon(leonATiempo().filter(t => t.fecha !== '2026-11-13'))
  const j = deLeon(r, 'jenni')
  assert.equal(j.dias.length, 0)
  assert.equal(j.totales.descuentos, 0)
  assert.equal(j.totales.total, 2500)
  assert.deepEqual(j.bono.limites, { completo: 20, mitad: 30 }, 'los límites son los de Daniela, seis días')
})

test('abrir en el día de la otra no es cobertura: no descuenta ni paga de más', () => {
  // Jenni abre el lunes con su usuario y Daniela el viernes con el suyo.
  const turnos = leonATiempo().map(t => (t.fecha === '2026-11-09' ? { ...t, persona: 'jenni gllardo' } : t.fecha === '2026-11-13' ? { ...t, persona: 'daniela coronilla' } : t))
  const r = semanaLeon(turnos)
  for (const id of ['daniela', 'jenni']) {
    assert.equal(deLeon(r, id).totales.descuentos, 0, id)
    assert.equal(deLeon(r, id).totales.coberturas, 0, id)
    assert.equal(deLeon(r, id).totales.total, 2500, id)
  }
})

test('el bono de Jenni sigue la puntualidad de Daniela', () => {
  // Daniela suma 15 el lunes y 10 el martes: 25, al 50%, para las dos.
  const r = semanaLeon(leonATiempo({ '2026-11-09': '10:55', '2026-11-10': '10:50' }))
  for (const id of ['daniela', 'jenni']) {
    assert.equal(deLeon(r, id).bono.minutos, 25, id)
    assert.equal(deLeon(r, id).bono.estado, 'mitad', id)
    assert.equal(deLeon(r, id).totales.bono, 250, id)
  }
  // El viernes Daniela descansa: esa apertura no cuenta para nadie.
  const v = semanaLeon(leonATiempo({ '2026-11-13': '11:30' }))
  assert.equal(deLeon(v, 'daniela').bono.estado, 'vigente')
  assert.equal(deLeon(v, 'jenni').bono.estado, 'vigente')
})

test('lo guardado con el registro conjunto de antes se sigue leyendo', () => {
  const estado = {
    pagos: { 'daniela-jenni|2026-11-09': { quien: 'admin' } },
    justificaciones: { 'daniela-jenni|2026-11-10': { motivo: 'cita médica', bono: true, sueldo: true } },
  }
  const r = semanaLeon(leonATiempo({ '2026-11-10': '11:30' }), estado)
  assert.ok(deLeon(r, 'daniela').pago && deLeon(r, 'jenni').pago, 'el pago marcado sigue marcado')
  assert.equal(deLeon(r, 'daniela').dias.find(d => d.fecha === '2026-11-10').estado, 'justificado')
  assert.equal(deLeon(r, 'daniela').bono.estado, 'vigente')
})

test('las comisiones: pendientes no suman, autorizadas sí, y van a quien cobró', () => {
  const tk = { id: '501', f: '2026-11-10', hora: '12:00', folio: '501', cajero: 'andrea serrano palacios',
    lineas: [linea('funda', 250), linea('hidrogel', 150)] }
  const base = semanaSL(semanaCompleta(), {}, { comisionables: { 'san-luis': [tk] } })
  const a = deSL(base, 'andrea')
  assert.equal(a.comisiones.length, 1)
  assert.equal(a.totales.comisiones, 0)
  assert.equal(a.totales.comisionesPendientes, 28)
  const aut = deSL(semanaSL(semanaCompleta(), { comisiones: { 'san-luis|501': { estado: 'autorizada' } } }, { comisionables: { 'san-luis': [tk] } }), 'andrea')
  assert.equal(aut.totales.total, 2328)
})

test('una comisión manual del administrador suma ya autorizada', () => {
  const r = semanaSL(semanaCompleta(), { manuales: [{ id: 'm1', registro: 'cesareo', fecha: '2026-11-15', monto: 40, concepto: 'Venta por WhatsApp' }] })
  assert.equal(deSL(r, 'cesareo').totales.comisiones, 40)
})

test('un sueldo sin capturar deja el total marcado como incompleto', () => {
  const r = semanaNomina({ config: CONFIG_INICIAL, turnos: [], lunes: LUNES, hoy: '2026-11-16', plazas: ['torreon'] })
  assert.ok(r.every(x => x.incompleto))
})

test('la configuración guardada a medias se completa con la de arranque', () => {
  const c = configCompleta({ parametros: { pctComision: 0.05, minimos: { funda: 230 } } })
  assert.equal(c.parametros.pctComision, 0.05)
  assert.equal(c.parametros.minimos.funda, 230)
  assert.equal(c.parametros.minimos.hidrogel, 120)
  assert.equal(c.parametros.horarios.torreon[1], '10:00')
  assert.deepEqual(c.empleados, [])
})

// ── Vacaciones ─────────────────────────────────────────────────────────────

test('la tabla de la ley: 12, 14, 16, 18, 20 y luego +2 cada cinco años', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 10, 11, 15, 16].map(diasLFT), [0, 12, 14, 16, 18, 20, 22, 22, 24, 24, 26])
})

test('la antigüedad cuenta años, meses y días de calendario', () => {
  assert.deepEqual(antiguedad('2024-03-15', '2026-11-11'), { anios: 2, meses: 7, dias: 27 })
  assert.equal(antiguedad(null, '2026-11-11'), null)
})

test('el saldo de vacaciones descuenta sólo los días laborables tomados en el año de servicio', () => {
  const persona = { id: 'andrea', ingreso: '2025-09-01', diasVacaciones: null }
  const registro = { dias: [1, 2, 3, 4, 5] }
  // Del lunes 10 al domingo 16 de noviembre: 5 días laborables.
  const s = saldoVacaciones({ persona, registro, hoy: '2026-11-11', vacaciones: [{ persona: 'andrea', desde: '2025-11-10', hasta: '2025-11-16' }, { persona: 'andrea', desde: '2026-11-09', hasta: '2026-11-15' }] })
  assert.equal(s.corresponden, 12)
  assert.equal(s.tomados, 5, 'las de 2025 son del año anterior a su aniversario')
  assert.equal(s.disponibles, 7)
  assert.equal(s.vence, '2027-03-01')
  // Con días fijados a mano manda lo del administrador.
  assert.equal(saldoVacaciones({ persona: { ...persona, diasVacaciones: 15 }, registro, hoy: '2026-11-11' }).corresponden, 15)
  // Antes del primer año todavía no corresponde ninguno.
  assert.equal(saldoVacaciones({ persona: { ...persona, ingreso: '2026-06-01' }, registro, hoy: '2026-11-11' }).corresponden, 0)
})
