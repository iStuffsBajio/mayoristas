// Pruebas de las reglas de negocio que ya se rompieron una vez.
//
// No prueban que el código funcione: prueban que NADIE vuelva a cambiar estas
// decisiones sin darse cuenta. Cada una corresponde a un apartado de
// CLAUDE.md y a un error que costó una compra mal calculada.
//
// Si una falla, no es que el código esté roto: es que alguien cambió una
// regla de negocio. Hay que preguntar antes de tocar la prueba.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MESES_ALTA, COBERTURA, DIAS_PARA_DEPURAR, DIAS_EN_CATALOGO,
  DIAS_RECIEN_LLEGADO, MARGEN_FERIA,
  velocidadCombinada, mapaDeAltas, horizonteDe, candidatosADepurar,
} from './surtido.js'

import {
  MESES_COBERTURA, MESES_RECIENTES, MESES_CORTOS, DIAS_SIN_COMPRAR,
  mapaGeneraciones, mapaGeneracionAnterior,
} from './compras.js'

import { TOLERANCIA_MIN, MINUTOS_PARA_RELEVO, HORARIOS, resumirSemana } from './personal.js'

// ── Los números que decidieron las ventas, no el código ──────────────────────

test('los valores de negocio siguen siendo los acordados', () => {
  assert.deepEqual(MESES_ALTA, [11, 12],            'temporada alta: noviembre y diciembre')
  assert.deepEqual(COBERTURA, { baja: 30, alta: 60 })
  assert.deepEqual(MESES_COBERTURA, { normal: 2, alta: 3 })
  assert.equal(DIAS_PARA_DEPURAR, 90)
  assert.equal(DIAS_EN_CATALOGO, 365)
  assert.equal(DIAS_RECIEN_LLEGADO, 120)
  assert.equal(MESES_RECIENTES, 6)
  assert.equal(MESES_CORTOS, 3)
  assert.equal(DIAS_SIN_COMPRAR, 60)
  assert.equal(MARGEN_FERIA, 0.3)
  assert.equal(TOLERANCIA_MIN, 10)
  assert.equal(MINUTOS_PARA_RELEVO, 60)
  assert.equal(HORARIOS.defecto.abre, '10:30')
  assert.equal(HORARIOS.torreon.abre, '10:00')
  assert.equal(HORARIOS.ferias.abre, null, 'un puesto de feria no abre a hora fija')
})

// ── Una funda no sirve para otro teléfono ────────────────────────────────────

const FAMILIA_IPHONE = [
  { Codigo: 'I11T', Producto: 'IPHONE 11 TPU', Alta: '2021-01-01' },
  { Codigo: 'I12T', Producto: 'IPHONE 12 TPU', Alta: '2022-01-01' },
  { Codigo: 'I13T', Producto: 'IPHONE 13 TPU', Alta: '2023-01-01' },
  { Codigo: 'I16T', Producto: 'IPHONE 16 TPU', Alta: '2025-01-01' },
  { Codigo: 'I17T', Producto: 'IPHONE 17 TPU', Alta: '2026-01-01' },
]

test('el relevo de generación es de UNA sola, no de todas', () => {
  const { mapa } = mapaGeneraciones(FAMILIA_IPHONE)
  // Sólo la penúltima apunta a la última.
  assert.deepEqual(mapa, { I16T: 'I17T' })
  for (const viejo of ['I11T', 'I12T', 'I13T']) {
    assert.equal(mapa[viejo], undefined, `${viejo} debe seguir comprándose por sí mismo`)
  }
})

test('la generación anterior es la inmediatamente anterior', () => {
  const previa = mapaGeneracionAnterior(FAMILIA_IPHONE)
  assert.equal(previa.I17T, 'I16T')
  assert.equal(previa.I13T, 'I12T')
})

// ── El ritmo del conjunto suma ritmos, no piezas ─────────────────────────────

test('velocidadCombinada no castiga a la plaza que lleva menos medida', () => {
  const hist = (dias, piezas) => ({
    periodos: [{ p: '2026-01', dias: Array.from({ length: dias }, (_, i) => i), m: { X: piezas } }],
  })
  // Una plaza con 100 días y 100 piezas (1/día) y otra con 50 días y 50 (1/día).
  const v = velocidadCombinada([hist(100, 100), hist(50, 50)])
  // El conjunto va a 2 por día, no a 1.5 (que sería 150 piezas / 100 días).
  assert.equal(Math.round(v.tasa.X * 100) / 100, 2)
})

// ── `Alta` es una cota, no una fecha de entrada ──────────────────────────────

const CON_HORIZONTE = [
  ...Array.from({ length: 20 }, (_, i) => ({ Codigo: `V${i}`, Producto: `VIEJO ${i}`, Alta: '2025-12-20' })),
  { Codigo: 'NUEVO', Producto: 'MODELO NUEVO', Alta: '2026-09-01' },
]

test('el arranque del historial se reconoce y no cuenta como fecha de entrada', () => {
  assert.equal(horizonteDe(CON_HORIZONTE), '2025-12-20')

  const altas = mapaDeAltas({ leon: CON_HORIZONTE })
  assert.equal(altas.V0.piso, true,    'lo que ya estaba es una edad mínima')
  assert.equal(altas.NUEVO.piso, false, 'una fecha real no es un piso')
})

test('«recién llegado» exige fecha real, no una cota', () => {
  const hoy = new Date('2026-10-13')
  const porSucursal = {
    leon: [
      { codigo: 'V0',    producto: 'VIEJO 0',      existencia: 5, vendidas: 0 },
      { codigo: 'NUEVO', producto: 'MODELO NUEVO', existencia: 5, vendidas: 0 },
    ],
  }
  const r = candidatosADepurar(porSucursal, 300, mapaDeAltas({ leon: CON_HORIZONTE }), hoy)
  assert.deepEqual(r.nuevos.map(x => x.codigo), ['NUEVO'])
})

// ── Un cambio de turno no es un retardo ──────────────────────────────────────

test('sólo la primera apertura del día mide puntualidad', () => {
  const turnos = [
    // Abre y entrega la caja a los 22 minutos sin vender nada.
    { slug: 'san-luis', sucursal: 'San Luis', persona: 'andrea', fecha: '2026-10-10', inicio: '2026-10-10T10:35:00', fin: '2026-10-10T10:57:00', ventas: 0 },
    // Toma la caja dentro de la primera hora: ES una llegada, y es tarde.
    { slug: 'san-luis', sucursal: 'San Luis', persona: 'cesareo', fecha: '2026-10-10', inicio: '2026-10-10T10:58:00', fin: '2026-10-10T20:00:00', ventas: 11 },
    // Turno de tarde de verdad: no se juzga.
    { slug: 'san-luis', sucursal: 'San Luis', persona: 'tarde', fecha: '2026-10-11', inicio: '2026-10-11T10:30:00', fin: '2026-10-11T16:00:00', ventas: 5 },
    { slug: 'san-luis', sucursal: 'San Luis', persona: 'relevo', fecha: '2026-10-11', inicio: '2026-10-11T16:05:00', fin: '2026-10-11T20:00:00', ventas: 4 },
  ]
  const r = resumirSemana(turnos, { desde: '2026-10-05', hasta: '2026-10-11' })
  const de = n => r.filas.find(f => f.persona === n)

  assert.equal(de('cesareo').retardos, 1, 'tomar la caja a los 28 min sí es retardo')
  assert.equal(de('relevo').retardos, 0, 'entrar a las 16:05 es relevo, no retardo')
  assert.equal(de('relevo').relevos, 1)
})

test('el saldo suma los adelantos con su signo', () => {
  const turnos = [
    { slug: 'leon', sucursal: 'León', persona: 'x', fecha: '2026-10-05', inicio: '2026-10-05T10:20:00', ventas: 1 },
    { slug: 'leon', sucursal: 'León', persona: 'x', fecha: '2026-10-06', inicio: '2026-10-06T10:40:00', ventas: 1 },
  ]
  const r = resumirSemana(turnos, { desde: '2026-10-05', hasta: '2026-10-11' })
  assert.equal(r.filas[0].saldoMin, 0, '-10 y +10 se cancelan')
})

test('ferias registra la hora pero no la califica', () => {
  const turnos = [
    { slug: 'ferias', sucursal: 'Ferias', persona: 'cajero 1', fecha: '2026-10-05', inicio: '2026-10-05T15:00:00', ventas: 9 },
  ]
  const r = resumirSemana(turnos, { desde: '2026-10-05', hasta: '2026-10-11' })
  assert.equal(r.totalRetardos, 0)
  assert.equal(r.filas[0].saldoMin, 0)
})
