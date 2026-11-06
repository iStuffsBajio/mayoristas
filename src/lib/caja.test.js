// Pruebas del flujo de efectivo.
//
// Las dos que importan de verdad son la del techo —una semana sin control de
// salidas NO produce diferencia— y la de los faltantes —que no son retiros y
// no restan del neto—. Las dos son formas de que esta cuenta salga mal
// pareciendo correcta, y ninguna se ve en pantalla.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESTADOS, PARAMETROS_VACIOS,
  semanaDe, correrSemana, diasDeSemana, diaDeSemana, nombreDia, conControl,
  flujoDelDia, flujoSemana, estadoDeposito, fechaDeDeposito, efectivoEnCaja,
  semaforo, faltantesDe, gastosQueDuelen, periodoQueCubre, pesos,
  bloqueSemanal, bloquesSemanales, acumuladoPorDepositar, tieneDatos,
} from './caja.js'

// Parámetros de una plaza ya configurada, para no repetirlos en cada prueba.
const CONFIGURADA = {
  ...PARAMETROS_VACIOS,
  diaDeposito: 1,            // lunes
  fondoFijo: 1000,
  limiteEfectivo: 15000,
  tolerancia: 50,
  horaLimite: '14:00',
  desdeControlSalidas: '2026-01-01',
}

const dia = (f, campos = {}) => ({ f, efectivo: 1000, nVentas: 3, ...campos })

/** Una semana completa con el mismo día repetido, para sumar sin distraerse. */
const semanaPlana = (desde, campos = {}) =>
  diasDeSemana({ desde }).map(f => dia(f, campos))

// ── La semana operativa ─────────────────────────────────────────────────────

test('la semana va de lunes a domingo, y el domingo cierra', () => {
  // 2026-11-05 es jueves.
  assert.deepEqual(semanaDe('2026-11-05'), { desde: '2026-11-02', hasta: '2026-11-08' })
  // Un domingo pertenece a la semana que termina, no a la que empieza.
  assert.deepEqual(semanaDe('2026-11-08'), { desde: '2026-11-02', hasta: '2026-11-08' })
  // Y el lunes siguiente ya es otra.
  assert.deepEqual(semanaDe('2026-11-09'), { desde: '2026-11-09', hasta: '2026-11-15' })
})

test('los siete dias salen siempre, con venta o sin ella', () => {
  const d = diasDeSemana({ desde: '2026-11-02' })
  assert.equal(d.length, 7)
  assert.equal(d[0], '2026-11-02')
  assert.equal(d[6], '2026-11-08')
})

test('correr semanas cruza el cambio de mes y de año sin perderse', () => {
  assert.deepEqual(correrSemana({ desde: '2026-11-02' }, -1), { desde: '2026-10-26', hasta: '2026-11-01' })
  // 2026-01-05 es lunes; la anterior arranca en diciembre del año pasado.
  assert.deepEqual(correrSemana({ desde: '2026-01-05' }, -1), { desde: '2025-12-29', hasta: '2026-01-04' })
  assert.deepEqual(correrSemana({ desde: '2026-11-02' }, 1), { desde: '2026-11-09', hasta: '2026-11-15' })
})

test('correr una semana normaliza al lunes, aunque se le pase otro dia', () => {
  // Importa porque el `desde` puede venir de una fecha cualquiera: sin
  // normalizar, la semana saldría corrida y el día de depósito con ella.
  assert.deepEqual(correrSemana({ desde: '2026-11-05' }, 0), { desde: '2026-11-02', hasta: '2026-11-08' })
})

test('el dia de la semana se cuenta con el lunes como 1', () => {
  assert.equal(diaDeSemana('2026-11-02'), 1)
  assert.equal(nombreDia('2026-11-02'), 'lunes')
  assert.equal(diaDeSemana('2026-11-08'), 7)
  assert.equal(nombreDia('2026-11-08'), 'domingo')
})

// ── El flujo de un día ──────────────────────────────────────────────────────

test('el efectivo cobrado no incluye tarjeta, transferencia, vales ni credito', () => {
  const f = flujoDelDia({
    f: '2026-11-03', efectivo: 1000, tarjeta: 400, transferencia: 150,
    vales: 30, credito: 20, cheque: 10,
  })
  assert.equal(f.efectivoCobrado, 1000, 'el efectivo es sólo el efectivo')
  assert.equal(f.ventaTotal, 1610, 'la venta total sí las suma todas')
  assert.equal(f.otrasNoEfectivo, 60, 'vales, crédito y cheque van juntos')
  assert.equal(f.neto, 1000, 'sin salidas, el neto es el efectivo cobrado')
})

test('las devoluciones en efectivo se restan UNA vez, desde el corte', () => {
  // La trampa: `CORTE_MOVIMIENTOS` también guarda las devoluciones —473
  // líneas y $79,081.74 en Aguascalientes—. Si un movimiento con tipo
  // «devolucion» llegara aquí y se sumara, se restarían dos veces.
  const f = flujoDelDia(
    { f: '2026-11-03', efectivo: 1000, devEfectivo: 150 },
    [{ f: '2026-11-03', tipo: 'devolucion', monto: 150, concepto: 'la misma devolución' }],
  )
  assert.equal(f.devoluciones, 150)
  assert.equal(f.neto, 850, 'restada dos veces daría 700')
})

test('cada salida resta y las entradas suman', () => {
  const f = flujoDelDia({ f: '2026-11-03', efectivo: 5000 }, [
    { tipo: 'gasto',      monto: 120 },
    { tipo: 'retiro',     monto: 1000 },
    { tipo: 'adelanto',   monto: 500 },
    { tipo: 'proveedor',  monto: 300 },
    { tipo: 'otra-salida', monto: 80 },
    { tipo: 'entrada',    monto: 200 },
  ])
  assert.equal(f.gastos, 120)
  assert.equal(f.retiros, 1000)
  assert.equal(f.adelantos, 500)
  assert.equal(f.proveedores, 300)
  assert.equal(f.neto, 5000 - 120 - 1000 - 500 - 300 - 80 + 200)
})

test('un dia sin dato da ceros, no NaN', () => {
  const f = flujoDelDia({ f: '2026-11-03' })
  assert.equal(f.neto, 0)
  assert.equal(f.ventaTotal, 0)
  assert.equal(f.arqueo, null, 'sin arqueo es null, no cero: cero sería «contó y no había»')
})

test('un arqueo de cero se conserva como cero, no se confunde con no haber contado', () => {
  const f = flujoDelDia({ f: '2026-11-03', efectivo: 0, arqueo: 0 })
  assert.equal(f.arqueo, 0)
})

// ── Los ajustes ─────────────────────────────────────────────────────────────

test('un ajuste conserva el valor calculado y recalcula el neto', () => {
  const f = flujoDelDia(
    { f: '2026-11-03', efectivo: 1000 },
    [],
    { valores: { gastos: 250 }, motivo: 'gasto-no-registrado', quien: 'admin' },
  )
  assert.equal(f.gastos, 250, 'manda el ajustado')
  assert.equal(f.neto, 750, 'el neto se vuelve a calcular con el ajuste dentro')
  assert.equal(f.calculado.gastos, 0, 'lo calculado se guarda para poder volver a él')
  assert.equal(f.calculado.neto, 1000)
  assert.equal(f.ajustado.motivo, 'gasto-no-registrado')
})

test('sin ajuste, el dia no finge tenerlo', () => {
  const f = flujoDelDia({ f: '2026-11-03', efectivo: 100 })
  assert.equal(f.ajustado, null)
})

// ── La semana ───────────────────────────────────────────────────────────────

test('la semana suma los siete dias y dibuja los que no tienen dato', () => {
  const s = flujoSemana({ desde: '2026-11-02', hasta: '2026-11-08' }, {
    dias: [dia('2026-11-02'), dia('2026-11-03')],
    params: CONFIGURADA,
  })
  assert.equal(s.filas.length, 7, 'los siete días siempre: un hueco se lee como «no cargó»')
  assert.equal(s.total.efectivoCobrado, 2000)
  assert.equal(s.filas[0].hayDato, true)
  assert.equal(s.filas[2].hayDato, false, 'y se dice cuál no tiene dato')
  assert.equal(s.filas[2].neto, 0)
})

test('los movimientos caen en su dia, no en el total', () => {
  const s = flujoSemana({ desde: '2026-11-02', hasta: '2026-11-08' }, {
    dias: semanaPlana('2026-11-02'),
    movimientos: [{ f: '2026-11-04', tipo: 'gasto', monto: 300 }],
    params: CONFIGURADA,
  })
  assert.equal(s.filas[0].gastos, 0)
  assert.equal(s.filas[2].gastos, 300, 'el miércoles')
  assert.equal(s.total.gastos, 300)
  assert.equal(s.total.neto, 7000 - 300)
})

// ── El techo: la regla que más importa ──────────────────────────────────────

test('sin fecha de control configurada, ningun dia tiene control', () => {
  assert.equal(conControl('2026-11-05', PARAMETROS_VACIOS), false)
  assert.equal(conControl('2026-11-05', { desdeControlSalidas: null }), false)
})

test('el control empieza el dia exacto, no el siguiente', () => {
  const p = { desdeControlSalidas: '2026-11-05' }
  assert.equal(conControl('2026-11-04', p), false)
  assert.equal(conControl('2026-11-05', p), true, 'el día que arranca ya cuenta')
  assert.equal(conControl('2026-11-06', p), true)
})

test('una semana sin control de salidas NO produce diferencia', () => {
  // Es la regla que evita inventar un faltante. Antes del 2026-11-05 nadie
  // registraba las salidas: `ACUMULADO_SALIDAS` sale en cero en 2,128 de los
  // 2,136 días de Aguascalientes. El esperado de esas semanas dice que debería
  // haber más dinero del que hay.
  const semana = { desde: '2026-10-26', hasta: '2026-11-01' }
  const flujo = flujoSemana(semana, {
    dias: semanaPlana('2026-10-26'),
    params: { ...CONFIGURADA, desdeControlSalidas: '2026-11-05' },
  })
  assert.equal(flujo.conControl, false)
  assert.equal(flujo.diasSinControl, 7)

  const e = estadoDeposito({
    flujo, params: { ...CONFIGURADA, desdeControlSalidas: '2026-11-05' },
    deposito: { monto: 3000 },      // muy por debajo de los 7000 esperados
    hoy: '2026-11-05T10:00:00',
  })
  assert.equal(e.estado, ESTADOS.SIN_CONTROL)
  assert.equal(e.diferencia, null, 'un techo menos un depósito no es un faltante')
  assert.equal(e.techo, true)
  assert.match(e.porque, /máximo/, 'y se explica por qué, no se deja el hueco')
})

test('con un solo dia sin control, la semana entera ya es un techo', () => {
  // El lunes es de antes del control y los otros seis no. El total ya está
  // incompleto: basta una salida sin anotar ese lunes para desviarlo.
  const flujo = flujoSemana({ desde: '2026-11-02', hasta: '2026-11-08' }, {
    dias: semanaPlana('2026-11-02'),
    params: { ...CONFIGURADA, desdeControlSalidas: '2026-11-03' },
  })
  assert.equal(flujo.conControl, false)
  assert.equal(flujo.diasSinControl, 1)
})

test('una semana con control si compara, y la diferencia sale con signo', () => {
  const semana = { desde: '2026-11-02', hasta: '2026-11-08' }
  const flujo = flujoSemana(semana, { dias: semanaPlana('2026-11-02'), params: CONFIGURADA })
  assert.equal(flujo.conControl, true)
  assert.equal(flujo.total.neto, 7000)

  const falta = estadoDeposito({ flujo, params: CONFIGURADA, deposito: { monto: 6800 }, hoy: '2026-11-09T10:00' })
  assert.equal(falta.diferencia, -200, 'faltante en negativo')
  assert.equal(falta.dentroTolerancia, false, 'la tolerancia son $50')
  assert.equal(falta.estado, ESTADOS.CON_DIFERENCIA)

  const sobra = estadoDeposito({ flujo, params: CONFIGURADA, deposito: { monto: 7030 }, hoy: '2026-11-09T10:00' })
  assert.equal(sobra.diferencia, 30)
  assert.equal(sobra.dentroTolerancia, true)
})

test('depositar lo exacto queda completo', () => {
  const flujo = flujoSemana({ desde: '2026-11-02', hasta: '2026-11-08' }, {
    dias: semanaPlana('2026-11-02'), params: CONFIGURADA,
  })
  const e = estadoDeposito({ flujo, params: CONFIGURADA, deposito: { monto: 7000 }, hoy: '2026-11-09T10:00' })
  assert.equal(e.estado, ESTADOS.COMPLETO)
  assert.equal(e.diferencia, 0)
})

// ── Sin parámetros no se juzga ──────────────────────────────────────────────

test('sin dia de deposito o sin tolerancia no se decide nada', () => {
  const flujo = flujoSemana({ desde: '2026-11-02', hasta: '2026-11-08' }, {
    dias: semanaPlana('2026-11-02'), params: { ...CONFIGURADA, tolerancia: null },
  })
  const e = estadoDeposito({ flujo, params: { ...CONFIGURADA, tolerancia: null }, hoy: '2026-11-09T10:00' })
  assert.equal(e.estado, ESTADOS.SIN_CONFIG)
  assert.match(e.porque, /configurar/)
})

test('sin fondo fijo, el efectivo en caja es null y no cero', () => {
  // Cero es un número y se compararía contra el límite: una caja «con cero
  // pesos» pasaría el límite siempre y saldría verde sin saberse nada.
  assert.equal(efectivoEnCaja({ bloques: [], params: PARAMETROS_VACIOS }), null)
  assert.equal(efectivoEnCaja({
    bloques: [{ depositado: false, total: { neto: 5000 } }], params: CONFIGURADA,
  }), 6000)
})

// ── Bloques semanales ───────────────────────────────────────────────────────
//
// Lo pidió el dueño así: bloques semanales, no acumulados, cada uno con su
// marca de depositado, y lo que no se marcó se va sumando.

test('cada semana es su propio bloque, de la mas reciente a la mas vieja', () => {
  const b = bloquesSemanales({
    hasta: '2026-11-05', cuantas: 3, dias: [
      ...semanaPlana('2026-11-02'), ...semanaPlana('2026-10-26'), ...semanaPlana('2026-10-19'),
    ],
    params: CONFIGURADA, hoy: '2026-11-05T12:00',
  })
  assert.equal(b.length, 3)
  assert.equal(b[0].clave, '2026-11-02', 'la más reciente primero')
  assert.equal(b[2].clave, '2026-10-19')
  // Y cada bloque lleva SU cifra, no la de todos juntos.
  assert.equal(b[0].total.neto, 7000)
  assert.equal(b[1].total.neto, 7000)
})

test('un bloque sin marcar acumula; marcarlo lo saca de la cuenta', () => {
  const dias = [...semanaPlana('2026-11-02'), ...semanaPlana('2026-10-26')]
  const base = { hasta: '2026-11-05', cuantas: 2, dias, params: CONFIGURADA, hoy: '2026-11-05T12:00' }

  const sinMarcar = acumuladoPorDepositar(bloquesSemanales(base))
  assert.equal(sinMarcar.semanas, 2)
  assert.equal(sinMarcar.total, 14000, 'las dos semanas suman mientras no se marquen')
  assert.equal(sinMarcar.masVieja, '2026-10-26', 'la más vieja sin marcar es la que se persigue')

  const conUna = acumuladoPorDepositar(bloquesSemanales({
    ...base, depositos: { '2026-10-26': { monto: 7000, fecha: '2026-11-02' } },
  }))
  assert.equal(conUna.semanas, 1, 'marcar una no toca a la otra')
  assert.equal(conUna.total, 7000)
  assert.equal(conUna.masVieja, '2026-11-02')
})

test('el efectivo en caja baja al marcar un bloque como depositado', () => {
  const dias = [...semanaPlana('2026-11-02'), ...semanaPlana('2026-10-26')]
  const base = { hasta: '2026-11-05', cuantas: 2, dias, params: CONFIGURADA, hoy: '2026-11-05T12:00' }

  assert.equal(efectivoEnCaja({ bloques: bloquesSemanales(base), params: CONFIGURADA }),
    1000 + 14000, 'fondo fijo más las dos semanas sin depositar')

  assert.equal(efectivoEnCaja({
    bloques: bloquesSemanales({ ...base, depositos: { '2026-10-26': { monto: 7000 } } }),
    params: CONFIGURADA,
  }), 1000 + 7000, 'el dinero que se fue al banco ya no está en el cajón')
})

test('un bloque marcado dice que lo esta, y guarda con que se marco', () => {
  const b = bloquesSemanales({
    hasta: '2026-11-05', cuantas: 1, dias: semanaPlana('2026-11-02'),
    params: CONFIGURADA, hoy: '2026-11-09T12:00',
    depositos: { '2026-11-02': { monto: 7000, fecha: '2026-11-09', folio: 'A-881', quien: 'admin' } },
  })[0]
  assert.equal(b.depositado, true)
  assert.equal(b.deposito.folio, 'A-881')
  assert.equal(b.estado, ESTADOS.COMPLETO)
  assert.equal(b.diferencia, 0)
})

test('el acumulado avisa cuando mezcla semanas sin control: es un techo', () => {
  // Dos semanas pendientes, una de antes del control. El total ya no es una
  // cifra, y presentarlo como tal es el error que `conControl` evita.
  const a = acumuladoPorDepositar(bloquesSemanales({
    hasta: '2026-11-05', cuantas: 2,
    dias: [...semanaPlana('2026-11-02'), ...semanaPlana('2026-10-26')],
    params: { ...CONFIGURADA, desdeControlSalidas: '2026-11-02' },
    hoy: '2026-11-05T12:00',
  }))
  assert.equal(a.semanas, 2)
  assert.equal(a.techo, true, 'una semana sin medir dentro vuelve techo a todo el acumulado')
})

test('con todas las semanas medidas, el acumulado es una cifra y lo dice', () => {
  const a = acumuladoPorDepositar(bloquesSemanales({
    hasta: '2026-11-05', cuantas: 2,
    dias: [...semanaPlana('2026-11-02'), ...semanaPlana('2026-10-26')],
    params: { ...CONFIGURADA, desdeControlSalidas: '2026-01-01' },
    hoy: '2026-11-05T12:00',
  }))
  assert.equal(a.techo, false)
  assert.equal(a.total, 14000)
})

test('sin bloques pendientes no hay a quien perseguir', () => {
  const a = acumuladoPorDepositar([])
  assert.equal(a.semanas, 0)
  assert.equal(a.total, 0)
  assert.equal(a.masVieja, null, 'null, no la fecha de hoy: no hay nada pendiente')
})

test('una semana sin control se puede marcar como depositada igual', () => {
  // No se puede comprobar su diferencia, pero el dinero sí se llevó al banco y
  // tiene que dejar de acumularse. Lo contrario lo dejaría pendiente para
  // siempre.
  const b = bloquesSemanales({
    hasta: '2026-11-05', cuantas: 1, dias: semanaPlana('2026-11-02'),
    params: { ...CONFIGURADA, desdeControlSalidas: '2027-01-01' },
    hoy: '2026-11-09T12:00',
    depositos: { '2026-11-02': { monto: 6000 } },
  })[0]
  assert.equal(b.depositado, true)
  assert.equal(b.estado, ESTADOS.SIN_CONTROL)
  assert.equal(b.diferencia, null, 'no se inventa un faltante de 1000')
  assert.equal(acumuladoPorDepositar([b]).total, 0, 'y deja de acumular')
})

// ── El semáforo ─────────────────────────────────────────────────────────────

test('lo que no se puede juzgar sale gris, ni verde ni rojo', () => {
  assert.equal(semaforo({ estado: ESTADOS.SIN_CONTROL }), 'gris')
  assert.equal(semaforo({ estado: ESTADOS.SIN_CONFIG }), 'gris')
})

test('una diferencia dentro de tolerancia es amarilla, no verde', () => {
  assert.equal(semaforo({ estado: ESTADOS.CON_DIFERENCIA, dentroTolerancia: true, params: CONFIGURADA }), 'amarillo')
  assert.equal(semaforo({ estado: ESTADOS.CON_DIFERENCIA, dentroTolerancia: false, params: CONFIGURADA }), 'rojo')
  assert.equal(semaforo({ estado: ESTADOS.COMPLETO, diferencia: 0, params: CONFIGURADA }), 'verde')
})

test('pasarse del limite de efectivo pone rojo aunque el deposito cuadre', () => {
  // Es la regla de seguridad: mucho efectivo en el cajón es el riesgo, y que
  // el depósito de la semana pasada cuadre no lo quita.
  assert.equal(semaforo({
    estado: ESTADOS.COMPLETO, diferencia: 0, enCaja: 20000, params: CONFIGURADA,
  }), 'rojo')
  assert.equal(semaforo({
    estado: ESTADOS.COMPLETO, diferencia: 0, enCaja: 14999, params: CONFIGURADA,
  }), 'verde')
})

test('sin limite configurado, el efectivo en caja no pinta rojo', () => {
  assert.equal(semaforo({
    estado: ESTADOS.COMPLETO, diferencia: 0, enCaja: 999999,
    params: { ...CONFIGURADA, limiteEfectivo: null },
  }), 'verde')
})

test('atrasado y no depositado son rojos', () => {
  assert.equal(semaforo({ estado: ESTADOS.ATRASADO, params: CONFIGURADA }), 'rojo')
  assert.equal(semaforo({ estado: ESTADOS.NO_DEPOSITADO, params: CONFIGURADA }), 'rojo')
  assert.equal(semaforo({ estado: ESTADOS.PENDIENTE, params: CONFIGURADA }), 'amarillo')
})

// ── El día del depósito y la hora límite ────────────────────────────────────

test('el deposito de la semana anterior toca el dia configurado de la siguiente', () => {
  const flujo = { desde: '2026-10-26', hasta: '2026-11-01' }
  // Lunes de la semana siguiente al periodo que cubre.
  assert.equal(fechaDeDeposito(flujo, { ...CONFIGURADA, diaDeposito: 1 }), '2026-11-02')
  // San Luis deposita en martes.
  assert.equal(fechaDeDeposito(flujo, { ...CONFIGURADA, diaDeposito: 2 }), '2026-11-03')
})

test('el periodo que cubre el deposito es un parametro, no una constante', () => {
  const semana = { desde: '2026-11-02', hasta: '2026-11-08' }
  assert.deepEqual(periodoQueCubre(semana, { periodoCubre: 'semana-anterior' }),
    { desde: '2026-10-26', hasta: '2026-11-01' })
  assert.deepEqual(periodoQueCubre(semana, { periodoCubre: 'semana-en-curso' }), semana)
})

test('pasada la hora limite del dia de deposito sale atrasado; pasado el dia, no depositado', () => {
  const flujo = flujoSemana({ desde: '2026-10-26', hasta: '2026-11-01' }, {
    dias: semanaPlana('2026-10-26'), params: CONFIGURADA,
  })
  const el = hoy => estadoDeposito({ flujo, params: CONFIGURADA, hoy }).estado

  assert.equal(el('2026-11-02T09:00:00'), ESTADOS.PENDIENTE, 'por la mañana de su día todavía no')
  assert.equal(el('2026-11-02T15:00:00'), ESTADOS.ATRASADO, 'pasadas las 14:00 de su día')
  assert.equal(el('2026-11-03T09:00:00'), ESTADOS.NO_DEPOSITADO, 'al día siguiente ya no es tardanza')
})

// ── Los faltantes ───────────────────────────────────────────────────────────

const FALTANTES = [
  { f: '2026-07-27', monto: 3840.13, persona: 'Administrador de la Tienda' },
  { f: '2026-07-09', monto: 3161.15, persona: 'daniela coronilla' },
  { f: '2026-06-05', monto: 2230.04, persona: 'daniela coronilla' },
  { f: '2026-01-09', monto: 5700.00, persona: 'jenni gllardo' },
  { f: '2025-12-23', monto: 7712.00, persona: 'Administrador de la Tienda' },
]

test('los faltantes NO restan del neto: son dinero que falta, no que salio', () => {
  // Contarlos como salida los haría desaparecer: el neto bajaría otro tanto y
  // la caja cuadraría justo en el caso que esto existe para detectar.
  const f = flujoDelDia({ f: '2026-07-27', efectivo: 5000 }, [
    { tipo: 'faltante', monto: 3840.13 },
  ])
  assert.equal(f.neto, 5000, 'un faltante no es un retiro y no resta')
})

test('los faltantes se agrupan por persona y de mayor a menor', () => {
  const r = faltantesDe(FALTANTES)
  assert.equal(r.veces, 5)
  assert.equal(Math.round(r.total * 100) / 100, 22643.32)
  assert.equal(r.porPersona[0].persona, 'Administrador de la Tienda')
  assert.equal(Math.round(r.porPersona[0].monto * 100) / 100, 11552.13)
  assert.equal(r.porPersona[0].veces, 2, 'repetido del mismo: es la alerta que se pidió')
  // Y las líneas, de la más reciente a la más vieja.
  assert.equal(r.lineas[0].f, '2026-07-27')
})

test('los faltantes se pueden mirar por rango', () => {
  const r = faltantesDe(FALTANTES, { desde: '2026-01-01', hasta: '2026-12-31' })
  assert.equal(r.veces, 4, 'el de 2025 queda fuera')
  assert.equal(Math.round(r.total * 100) / 100, 14931.32, 'lo medido de León en 2026')
})

test('un faltante sin persona no se pierde: se agrupa como sin identificar', () => {
  const r = faltantesDe([{ f: '2026-05-01', monto: 100 }])
  assert.equal(r.porPersona[0].persona, 'sin identificar')
  assert.equal(r.total, 100)
})

// ── Los gastos que piden mirarse ────────────────────────────────────────────

test('un gasto sin comprobante salta sin necesidad de ningun numero', () => {
  const r = gastosQueDuelen([
    { f: '2026-11-03', tipo: 'gasto', monto: 80, concepto: 'garrafón', comprobante: false },
    { f: '2026-11-03', tipo: 'gasto', monto: 500, concepto: 'papelería', comprobante: true },
    { f: '2026-11-03', tipo: 'retiro', monto: 9000, comprobante: false },
  ], PARAMETROS_VACIOS)
  assert.equal(r.length, 1, 'sólo gastos, y sólo el que no trae comprobante')
  assert.equal(r[0].concepto, 'garrafón')
  assert.equal(r[0].sinComprobante, true)
  assert.equal(r[0].pasaMaximo, false, 'sin máximo configurado no se juzga el monto')
})

test('con maximo configurado, un gasto grande salta aunque traiga comprobante', () => {
  const r = gastosQueDuelen([
    { tipo: 'gasto', monto: 500, concepto: 'papelería', comprobante: true },
  ], { ...PARAMETROS_VACIOS, gastoMaxSinComprobante: 300 })
  assert.equal(r.length, 1)
  assert.equal(r[0].pasaMaximo, true)
})

// ── Formato ─────────────────────────────────────────────────────────────────

test('el dinero se escribe en pesos mexicanos', () => {
  assert.match(pesos(1234.5), /1,234\.50/)
  assert.match(pesos(0), /0\.00/)
})

test('LA TRAMPA: un objeto vacio no es una plaza sin ventas, es una plaza sin archivo', () => {
  // El backend devuelve {} cuando la clave no existe en S3 -`leerJson` traga
  // el error- y {} es VERDADERO. Comprobando solo `!flujo`, la pantalla daba
  // por buena la plaza y pintaba la semana en CEROS, que se lee como «no se
  // vendio nada» cuando lo que pasa es que no se pudo mirar.
  assert.equal(tieneDatos({}), false, 'esto es lo que devuelve el backend sin archivo')
  assert.equal(tieneDatos(null), false)
  assert.equal(tieneDatos(undefined), false)
  assert.equal(tieneDatos({ dias: [] }), false, 'un archivo sin dias tampoco dice nada')
  assert.equal(tieneDatos({ respaldo: { fecha: '2026-11-05' } }), false,
    'traer respaldo pero ningun dia sigue siendo no tener dato')
  assert.equal(tieneDatos({ dias: [{ f: '2026-11-05', efectivo: 100 }] }), true)
})

test('recortar lo que se VE no puede recortar lo que se DEBE', () => {
  // La pantalla enseña dos semanas -lo pidio el dueño- pero el acumulado se
  // calcula sobre ocho. Si alguien pasara las dos visibles a esta funcion, una
  // semana de hace un mes sin depositar desapareceria de la cuenta sin que
  // nadie se entere, y es justo el dinero que hay que perseguir.
  const bloque = (clave, depositado) => ({
    clave, depositado, conControl: true, total: { neto: 1000 },
  })
  const ocho = [
    bloque('2026-11-02', false),   // esta semana, sin depositar
    bloque('2026-10-26', true),    // la pasada, depositada
    bloque('2026-10-19', false),   // vieja y SIN depositar: esta es la clave
    bloque('2026-10-12', true),
  ]

  const completo = acumuladoPorDepositar(ocho)
  const soloVisibles = acumuladoPorDepositar(ocho.slice(0, 2))

  assert.equal(completo.semanas, 2, 'la de hace tres semanas sigue contando')
  assert.equal(completo.masVieja, '2026-10-19', 'y es la que hay que perseguir primero')
  assert.equal(soloVisibles.semanas, 1, 'recortando, desaparece')
  assert.ok(completo.total > soloVisibles.total,
    'y con ella desaparece su dinero: por eso el gancho guarda las ocho')
})
