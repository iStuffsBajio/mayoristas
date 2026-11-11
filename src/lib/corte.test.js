import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DENOMINACIONES, PLAZAS_CORTE, totalContado, limpiarConteo, esSueldo, clasificarMovimientos,
  cuadreSemanal, cicloDe, bloquesDeCorte, resumenGlobal, alPeso, SEMAFORO_DE_CORTE, PALABRAS_SUELDO,
  esComision, trabajadorDe,
} from './corte.js'
import { flujoSemana, semanaDe } from './caja.js'

const SEMANA = semanaDe('2026-11-09')           // lunes 9 al domingo 15 de noviembre de 2026
const PARAMS = { fondoFijo: 500, desdeControlSalidas: '2026-11-02' }

const caja = (dias, movimientos = []) => ({ dias, movimientos })
const dia = (f, extra = {}) => ({ f, efectivo: 0, tarjeta: 0, ...extra })

/** Una semana tipo: $1,000 en efectivo y $600 con tarjeta el lunes. */
const SEMANA_TIPO = caja(
  [dia('2026-11-09', { efectivo: 1000, tarjeta: 600, nVentas: 10 })],
  [
    { f: '2026-11-10', tipo: 'otra-salida', monto: 100, concepto: 'garrafón de agua' },
    { f: '2026-11-11', tipo: 'otra-salida', monto: 200, concepto: 'Sueldo de Ana' },
  ])

// ── El conteo ──────────────────────────────────────────────────────────────

test('las denominaciones son las del Excel del dueño', () => {
  assert.deepEqual(DENOMINACIONES, [500, 200, 100, 50, 20, 10, 5, 2, 1])
})

test('el total contado es denominación × cantidad', () => {
  assert.equal(totalContado({ 500: 2, 200: 1, 100: 3, 50: 0, 20: 4, 1: 7 }), 1000 + 200 + 300 + 80 + 7)
  assert.equal(totalContado({}), 0)
  assert.equal(totalContado(null), 0)
  assert.equal(totalContado({ '500': '2' }), 1000, 'llegan como texto de un formulario')
})

test('lo que no es un conteo se descarta, no se suma', () => {
  // Una denominación inventada, una cantidad negativa, una con decimales, texto.
  assert.equal(totalContado({ 1000: 5, 500: -1, 200: 1.5, 100: 'muchos', 50: 2 }), 100)
  assert.deepEqual(limpiarConteo({ 500: 2, 200: 0, 100: '3', 7: 9, 50: -2, 20: 1.5 }), { 500: 2, 100: 3 })
})

// ── El sueldo ──────────────────────────────────────────────────────────────

test('EL SUELDO se reconoce por el concepto, o por ser un adelanto', () => {
  for (const c of ['Sueldo de Ana', 'sueldos semana', 'NÓMINA', 'nomina', 'pago de personal', 'salario', 'quincena', 'raya']) {
    assert.equal(esSueldo({ tipo: 'otra-salida', concepto: c }), true, c)
  }
  assert.equal(esSueldo({ tipo: 'adelanto', concepto: 'x' }), true)
  assert.equal(esSueldo({ tipo: 'otra-salida', concepto: 'garrafón' }), false)
  assert.equal(esSueldo({ tipo: 'otra-salida', concepto: 'sueldoso' }), false, 'una palabra, no un pedazo')
  // Una entrada o un faltante nunca es sueldo.
  assert.equal(esSueldo({ tipo: 'entrada', concepto: 'sueldo' }), false)
  assert.equal(esSueldo({ tipo: 'faltante', concepto: 'sueldo' }), false)
  assert.ok(PALABRAS_SUELDO instanceof RegExp)
})

test('los movimientos se separan en entradas, sueldo y gastos, y el faltante NO entra', () => {
  const r = clasificarMovimientos([
    { tipo: 'entrada', monto: 50, concepto: 'cambio' },
    { tipo: 'otra-salida', monto: 200, concepto: 'sueldo' },
    { tipo: 'otra-salida', monto: 80, concepto: 'luz' },
    { tipo: 'proveedor', monto: 20, concepto: 'x' },
    { tipo: 'faltante', monto: 999, persona: 'alguien', concepto: 'faltante' },
  ])
  assert.equal(r.totalEntradas, 50)
  assert.equal(r.totalSueldos, 200)
  assert.equal(r.totalGastos, 100)
  assert.equal(r.gastos.length + r.sueldos.length + r.entradas.length, 4, 'el faltante queda fuera')
})

// ── La semana ──────────────────────────────────────────────────────────────

test('EL ESPERADO sale del efectivo, menos devoluciones, sueldo y gastos', () => {
  // 1000 en efectivo, 100 de gasto y 200 de sueldo: 700. La tarjeta no es
  // efectivo y no pesa.
  const r = cuadreSemanal({ semana: SEMANA, caja: SEMANA_TIPO, params: PARAMS })
  assert.equal(r.efectivoCobrado, 1000)
  assert.equal(r.tarjeta, 600)
  assert.equal(r.ventaTotal, 1600)
  assert.equal(r.gastos, 100)
  assert.equal(r.sueldo, 200)
  assert.equal(r.esperado, 700)
  assert.equal(r.esperadoEnCaja, 1200, 'el cajón lleva el fondo de 500')
  assert.equal(r.ingresosElectronicos, 600)
})

test('el esperado coincide con el neto de caja.js: una sola cuenta de dinero', () => {
  // Si estas dos se separan, la pantalla de Efectivo y la del corte dicen
  // cifras distintas del mismo efectivo.
  const r = cuadreSemanal({ semana: SEMANA, caja: SEMANA_TIPO, params: PARAMS })
  const f = flujoSemana(SEMANA, { dias: SEMANA_TIPO.dias, movimientos: SEMANA_TIPO.movimientos, params: PARAMS })
  assert.equal(r.esperado, f.total.neto)
})

test('LAS TRANSFERENCIAS NO SON EFECTIVO aunque no sean tarjeta', () => {
  // La fórmula del Excel (ventas − tarjeta) las trataría como efectivo y
  // esperaría un dinero que nunca entró al cajón.
  const r = cuadreSemanal({
    semana: SEMANA, params: PARAMS,
    caja: caja([dia('2026-11-09', { efectivo: 1000, tarjeta: 600, transferencia: 400 })]),
  })
  assert.equal(r.esperado, 1000)
  assert.equal(r.ventaTotal, 2000)
  assert.equal(r.ingresosElectronicos, 1000)
})

test('SIN NINGUNA TOLERANCIA: un peso de diferencia ya es faltante o sobrante', () => {
  const con = n => cuadreSemanal({ semana: SEMANA, caja: SEMANA_TIPO, params: PARAMS, conteo: { cantidades: { 1: n } } })
  assert.equal(con(1200).estado, 'cuadra')
  assert.equal(con(1200).diferencia, 0)
  assert.equal(con(1199).estado, 'faltante')
  assert.equal(con(1199).diferencia, -1)
  assert.equal(con(1201).estado, 'sobrante')
  assert.equal(con(1201).diferencia, 1)
})

test('los centavos del POS se comparan al peso: ninguna caja podría cuadrar si no', () => {
  // El POS dice 530.02; el conteo no puede tener centavos.
  const c = caja([dia('2026-11-09', { efectivo: 530.02 })])
  const r = cuadreSemanal({ semana: SEMANA, caja: c, params: { fondoFijo: 0, desdeControlSalidas: '2026-11-02' }, conteo: { cantidades: { 500: 1, 20: 1, 10: 1 } } })
  assert.equal(r.esperadoEnCaja, 530)
  assert.equal(r.diferencia, 0)
  assert.equal(r.estado, 'cuadra')
  assert.equal(alPeso(530.5), 531)
  assert.equal(alPeso(0.4), 0)
})

test('SIN FONDO DE CAJA NO SE JUZGA: no se inventa un cero', () => {
  const r = cuadreSemanal({ semana: SEMANA, caja: SEMANA_TIPO, params: { desdeControlSalidas: '2026-11-02' }, conteo: { cantidades: { 1: 700 } } })
  assert.equal(r.estado, 'sin-fondo')
  assert.equal(r.diferencia, null)
  assert.equal(r.esperadoEnCaja, null)
  assert.equal(r.contado, 700, 'el conteo se guarda y se enseña, sólo no se compara')
})

test('SIN CONTROL DE SALIDAS el esperado es un techo y no se acusa a nadie', () => {
  // Antes de la fecha de control nadie registraba las salidas: el esperado
  // sale por encima de lo que hay y cualquier diferencia sería inventada.
  const r = cuadreSemanal({ semana: SEMANA, caja: SEMANA_TIPO, params: { fondoFijo: 500 }, conteo: { cantidades: { 1: 100 } } })
  assert.equal(r.estado, 'sin-control')
  assert.equal(r.conControl, false)
  const sin = cuadreSemanal({ semana: SEMANA, caja: SEMANA_TIPO, params: { fondoFijo: 500, desdeControlSalidas: '2026-11-12' } })
  assert.equal(sin.estado, 'sin-control', 'una semana con un solo día sin control ya es un techo')
})

test('sin conteo la semana dice que falta capturar, no que cuadra', () => {
  const r = cuadreSemanal({ semana: SEMANA, caja: SEMANA_TIPO, params: PARAMS })
  assert.equal(r.estado, 'sin-conteo')
  assert.equal(r.contado, null)
  assert.equal(r.diferencia, null)
})

test('los colores son los del dueño: verde, rojo y azul', () => {
  assert.equal(SEMAFORO_DE_CORTE.cuadra.color, 'verde')
  assert.equal(SEMAFORO_DE_CORTE.faltante.color, 'rojo')
  assert.equal(SEMAFORO_DE_CORTE.sobrante.color, 'azul')
  for (const e of ['sin-conteo', 'sin-fondo', 'sin-control']) assert.equal(SEMAFORO_DE_CORTE[e].color, 'gris')
})

test('lo entregable es lo contado menos el fondo, que se queda en la caja', () => {
  const r = cuadreSemanal({ semana: SEMANA, caja: SEMANA_TIPO, params: PARAMS, conteo: { cantidades: { 1: 1200 } } })
  assert.equal(r.entregable, 700)
})

test('EL EJEMPLO DEL DUEÑO: 3 fundas, 4 hidrogel y 10 stickers son 17 piezas', () => {
  const r = cuadreSemanal({
    semana: SEMANA, caja: SEMANA_TIPO, params: PARAMS,
    ventas: { porDiaTipo: [{ f: '2026-11-09', fundas: 3, hidrogel: 4, stickers: 10, otros: 6 }] },
  })
  assert.deepEqual(r.piezas, { fundas: 3, hidrogel: 4, stickers: 10, total: 17, otros: 6 })
  assert.equal(r.dias[0].piezas.total, 17, 'y por día')
  assert.equal(r.dias[1].piezas, null, 'un día sin desglose no es un día con cero')
})

test('sin desglose de piezas no se inventa uno: es null', () => {
  assert.equal(cuadreSemanal({ semana: SEMANA, caja: SEMANA_TIPO, params: PARAMS }).piezas, null)
})

test('los siete días salen siempre, hayan vendido o no', () => {
  const r = cuadreSemanal({ semana: SEMANA, caja: SEMANA_TIPO, params: PARAMS })
  assert.equal(r.dias.length, 7)
  assert.deepEqual(r.dias.map(d => d.dia), ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'])
  assert.equal(r.dias[0].hayDato, true)
  assert.equal(r.dias[1].hayDato, false)
})

// ── Los bloques ────────────────────────────────────────────────────────────

test('una tienda enseña la semana y la anterior, sin pasar del inicio del historial', () => {
  const normal = PLAZAS_CORTE.find(p => p.slug === 'leon')
  const dos = bloquesDeCorte({ plaza: normal, fecha: '2026-11-10', caja: caja([]), params: PARAMS })
  assert.deepEqual(dos.bloques.map(b => b.clave), ['2026-11-09', '2026-11-02'])
  assert.equal(dos.ciclo, null)
  assert.equal(dos.global, null)

  // La semana del 2 de noviembre es la primera: no hay una anterior que enseñar.
  const una = bloquesDeCorte({ plaza: normal, fecha: '2026-11-04', caja: caja([]), params: PARAMS })
  assert.deepEqual(una.bloques.map(b => b.clave), ['2026-11-02'])
})

test('el conteo guardado se pega a su semana, por el lunes', () => {
  const normal = PLAZAS_CORTE.find(p => p.slug === 'leon')
  const r = bloquesDeCorte({
    plaza: normal, fecha: '2026-11-10', caja: SEMANA_TIPO, params: PARAMS,
    conteos: { '2026-11-09': { cantidades: { 1: 1200 } } },
  })
  assert.equal(r.bloques[0].estado, 'cuadra')
  assert.equal(r.bloques[1].estado, 'sin-conteo')
})

// ── Torreón ────────────────────────────────────────────────────────────────

const TORREON = PLAZAS_CORTE.find(p => p.slug === 'torreon')

test('TORREÓN lleva un ciclo de cuatro semanas desde el lunes 9 de noviembre', () => {
  assert.equal(TORREON.ciclo.desde, '2026-11-09')
  assert.equal(TORREON.ciclo.semanas, 4)
  assert.equal(semanaDe(TORREON.ciclo.desde).desde, TORREON.ciclo.desde, 'es un lunes')

  const c = cicloDe(TORREON, '2026-11-20')
  assert.deepEqual(c.semanas.map(s => s.desde), ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
  assert.equal(c.desde, '2026-11-09')
  assert.equal(c.hasta, '2026-12-06')
  assert.equal(c.n, 0)

  // Pasadas las cuatro semanas empieza el siguiente ciclo.
  assert.equal(cicloDe(TORREON, '2026-12-07').desde, '2026-12-07')
  assert.equal(cicloDe(TORREON, '2026-12-07').n, 1)
  assert.equal(cicloDe(TORREON, '2026-12-06').n, 0, 'el domingo todavía es del primero')
  // Antes del arranque cae en el primero.
  assert.equal(cicloDe(TORREON, '2026-11-02').n, 0)
  assert.equal(cicloDe({ slug: 'leon' }, '2026-11-20'), null)
})

test('EN TORREÓN CADA SEMANA SE COMPARA CONTRA LO ACUMULADO: el dinero se va juntando', () => {
  const c = caja([
    dia('2026-11-09', { efectivo: 1000 }), dia('2026-11-16', { efectivo: 2000 }), dia('2026-11-23', { efectivo: 500 }),
  ])
  const r = bloquesDeCorte({
    plaza: TORREON, fecha: '2026-11-20', caja: c, params: PARAMS,
    conteos: {
      '2026-11-09': { cantidades: { 1: 1500 } },            // 500 fondo + 1000
      '2026-11-16': { cantidades: { 1: 3500 } },            // 500 + 1000 + 2000
    },
  })
  assert.equal(r.bloques.length, 4)
  assert.deepEqual(r.bloques.map(b => b.esperadoEnCaja), [1500, 3500, 4000, 4000])
  assert.deepEqual(r.bloques.map(b => b.estado), ['cuadra', 'cuadra', 'sin-conteo', 'sin-conteo'])
  // Y NO se compara la semana 2 contra sólo lo de la semana 2: eso daría un
  // sobrante enorme que es el dinero de la semana 1.
  assert.equal(r.bloques[1].diferencia, 0)
})

test('EL BLOQUE GLOBAL del ciclo suma las cuatro semanas y compara lo último que se contó', () => {
  const c = caja([
    dia('2026-11-09', { efectivo: 1000, tarjeta: 100 }), dia('2026-11-16', { efectivo: 2000 }),
  ])
  const r = bloquesDeCorte({
    plaza: TORREON, fecha: '2026-11-20', caja: c, params: PARAMS,
    ventas: { porDiaTipo: [{ f: '2026-11-09', fundas: 3, hidrogel: 4, stickers: 10 }, { f: '2026-11-16', fundas: 1 }] },
    conteos: { '2026-11-16': { cantidades: { 1: 3400 } } },
  })
  const g = r.global
  assert.equal(g.efectivoCobrado, 3000)
  assert.equal(g.ventaTotal, 3100)
  assert.equal(g.esperadoEnCaja, 3500)
  assert.equal(g.contado, 3400)
  assert.equal(g.contadoEn, '2026-11-16')
  assert.equal(g.diferencia, -100)
  assert.equal(g.estado, 'faltante')
  assert.equal(g.semanasConConteo, 1)
  assert.equal(g.semanas, 4)
  assert.equal(g.piezas.total, 18)
})

test('el global sin ningún conteo dice que falta, no que cuadra', () => {
  const r = bloquesDeCorte({ plaza: TORREON, fecha: '2026-11-20', caja: caja([dia('2026-11-09', { efectivo: 1 })]), params: PARAMS })
  assert.equal(r.global.estado, 'sin-conteo')
  assert.equal(r.global.contado, null)
  assert.equal(bloquesDeCorte({ plaza: TORREON, fecha: '2026-11-20', caja: caja([]), params: { desdeControlSalidas: '2026-11-02' } }).global.estado, 'sin-fondo')
})

// ── La vista global del administrador ──────────────────────────────────────

test('EN LA VISTA GLOBAL UN FALTANTE Y UN SOBRANTE NO SE COMPENSAN', () => {
  // Verde porque se cancelan sería tapar justo lo que la pantalla existe para
  // enseñar. Cada plaza conserva su estado y se avisa de cada una.
  const leon = PLAZAS_CORTE[0], slp = PLAZAS_CORTE[1], ags = PLAZAS_CORTE[2]
  const hacer = (plaza, cantidad) => bloquesDeCorte({
    plaza, fecha: '2026-11-10', params: PARAMS,
    caja: caja([dia('2026-11-09', { efectivo: 1000 })]),
    ventas: { porDiaTipo: [{ f: '2026-11-09', fundas: 2, hidrogel: 1, stickers: 3 }] },
    conteos: cantidad === null ? {} : { '2026-11-09': { cantidades: { 1: cantidad } } },
  })
  const g = resumenGlobal({ leon: hacer(leon, 1400), 'san-luis': hacer(slp, 1600), aguascalientes: hacer(ags, 1500) })
  assert.deepEqual(g.filas.map(f => f.estado), ['faltante', 'sobrante', 'cuadra'])
  assert.deepEqual(g.alertas.map(f => f.slug), ['leon', 'san-luis'])
  assert.deepEqual(g.faltantes.map(f => f.slug), ['leon'])
  assert.equal(g.ventaTotal, 3000)
  assert.equal(g.piezas.total, 18)
  assert.ok(!('diferencia' in g), 'no hay una diferencia global que sume lo que no se puede sumar')
})

// ── Sueldo y comisiones: con el nombre del trabajador ───────────────────────

test('una comisión NO es sueldo, y va antes aunque diga nómina', () => {
  assert.equal(esComision({ tipo: 'otra-salida', concepto: 'Comisión Ana' }), true)
  assert.equal(esComision({ tipo: 'otra-salida', concepto: 'comisiones de la semana Luis' }), true)
  assert.equal(esComision({ tipo: 'otra-salida', concepto: 'comision nomina Ana' }), true)
  assert.equal(esSueldo({ tipo: 'otra-salida', concepto: 'comision nomina Ana' }), false)
  assert.equal(esComision({ tipo: 'entrada', concepto: 'comision' }), false)
  assert.equal(esComision({ tipo: 'otra-salida', concepto: 'garrafón' }), false)
})

test('el nombre del trabajador sale del concepto, y sin nombre es null', () => {
  assert.equal(trabajadorDe('Sueldo Juan Pérez'), 'Juan Pérez')
  assert.equal(trabajadorDe('Sueldo Ana María'), 'Ana María', 'la «a» final de María no es relleno')
  assert.equal(trabajadorDe('pago de sueldo de la semana a Daniela'), 'Daniela')
  assert.equal(trabajadorDe('COMISION ANA 2/11 al 8/11'), 'ANA')
  assert.equal(trabajadorDe('Sueldo'), null)
  assert.equal(trabajadorDe('sueldo semana 45'), null)
  assert.equal(trabajadorDe('comisiones'), null)
  assert.equal(trabajadorDe(''), null)
})

test('las comisiones restan del esperado y se cuentan aparte; sin nombre se señala', () => {
  const r = clasificarMovimientos([
    { tipo: 'otra-salida', monto: 800, concepto: 'Sueldo Juan' },
    { tipo: 'otra-salida', monto: 150, concepto: 'Comisión Juan' },
    { tipo: 'otra-salida', monto: 300, concepto: 'sueldo' },
    { tipo: 'otra-salida', monto: 50, concepto: 'garrafón' },
  ])
  assert.equal(r.totalSueldos, 1100)
  assert.equal(r.totalComisiones, 150)
  assert.equal(r.totalGastos, 50)
  assert.equal(r.sinNombre, 1, 'el «sueldo» suelto no dice a quién')
  assert.equal(r.sueldos[0].trabajador, 'Juan')
  assert.equal(r.sueldos[1].sinNombre, true)
  assert.equal(r.comisiones[0].trabajador, 'Juan')
})

// ── Reglas de mayoreo y cobros electrónicos, por semana ─────────────────────

test('las incidencias de mayoreo y los cobros se reparten por semana; sin extraer es null', () => {
  const semana = { desde: '2026-11-09', hasta: '2026-11-15' }
  const ventas = {
    reglasMayoreo: { incidencias: [{ f: '2026-11-10', folio: '1' }, { f: '2026-11-03', folio: '2' }] },
    cobrosElectronicos: { filas: [{ f: '2026-11-15', folio: '3' }, { f: '2026-11-16', folio: '4' }] },
  }
  const r = cuadreSemanal({ semana, ventas })
  assert.deepEqual(r.mayoreo.map(x => x.folio), ['1'])
  assert.deepEqual(r.cobros.map(x => x.folio), ['3'])
  // «No se ha extraído» no es «ninguno»: null, no una lista vacía.
  const v = cuadreSemanal({ semana, ventas: {} })
  assert.equal(v.mayoreo, null)
  assert.equal(v.cobros, null)
  assert.deepEqual(cuadreSemanal({ semana, ventas: { reglasMayoreo: { incidencias: [] } } }).mayoreo, [])
})
