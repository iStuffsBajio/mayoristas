import test from 'node:test'
import assert from 'node:assert/strict'
import { MOTIVO } from './anomalias.js'
import { fichaDeCodigo, fichaDeLote, fichaDePatron, fichaDeNombre, PASO } from './fichas.js'
import { CLASE } from './lotes.js'

const huerfano = (motivo, extra = {}) => ({
  codigo: 'R165GT', producto: 'REALME 16 5G TPU CASE',
  plazas: { 'san-luis': 3, aguascalientes: 3, ferias: 5 },
  piezas: 11, ultimo: '2026-08-19', diasSinMover: 68, motivo,
  cubiertoPor: { codigo: 'R16T', producto: 'REALME 16 5G TPU CASE' },
  ...extra,
})

const patron = {
  id: 'pat|GALAXY>SAMSUNG', a: 'GALAXY', b: 'SAMSUNG', gana: 'SAMSUNG', pierde: 'GALAXY',
  falta: false, alcance: 'catalogo', codigos: ['A', 'B', 'C'], corrigen: ['bodega'], renglones: 192,
  filas: [
    { slug: 'bodega', a: 192, b: 0, total: 192, sin: 0 },
    { slug: 'leon', a: 15, b: 173, total: 188, sin: 0 },
  ],
}

/** Un lote de cada clase: las cuatro redacciones tienen que cumplir lo mismo. */
const lote = clase => ({
  id: `lote|${clase}`, clase, piezas: 9,
  porPlaza: { leon: 3, ferias: 2 },
  plazas: ['leon', 'ferias'],
  codigos: [
    { codigo: 'A', producto: 'IPHONE 11 MORADO TPU CASE', piezas: 5, plazas: { leon: 5 }, altaEn: ['leon'],
      ultimaVenta: '2024-03-04', diasSinVender: 966,
      cubiertoPor: { codigo: 'I11T', producto: 'IPHONE 11 TPU CASE' } },
    { codigo: 'B', producto: 'IPHONE 11 SALMON TPU CASE', piezas: 4, plazas: { ferias: 4 }, altaEn: ['ferias'],
      ultimaVenta: null, diasSinVender: null,
      cubiertoPor: { codigo: 'I11T', producto: 'IPHONE 11 TPU CASE' } },
    { codigo: 'C', producto: 'IPHONE 11 VERDE TPU CASE', piezas: 0, plazas: {}, altaEn: ['ferias'],
      ultimaVenta: '2023-01-01', diasSinVender: 1394, cubiertoPor: null },
  ],
})

const TODAS = () => [
  fichaDeCodigo(huerfano(MOTIVO.DUPLICADO)),
  fichaDeCodigo(huerfano(MOTIVO.SIN_ALTA, { cubiertoPor: null })),
  fichaDeCodigo(huerfano(MOTIVO.DESCONTINUADO, { cubiertoPor: null })),
  fichaDeCodigo(huerfano(MOTIVO.DESCONTINUADO, { cubiertoPor: null, piezas: 0, plazas: {} })),
  ...Object.values(CLASE).map(clase => fichaDeLote(lote(clase))),
  fichaDePatron(patron),
  fichaDePatron({ ...patron, falta: true, a: null, b: 'CASE', gana: 'CASE', pierde: null, alcance: 'codigos' }),
  fichaDeNombre({
    codigo: 'GP10PXLT', fuente: 'conflicto', referencia: null,
    fuera: [{ slug: 'bodega', nombre: 'GOOGLE PIXEL 10 PRO XL TPU' },
            { slug: 'leon', nombre: 'GOOGLE PIXEL 10 PRO XL TPU CASE' }],
  }),
  fichaDeNombre({
    codigo: 'HN13T', fuente: 'bodega+leon', referencia: 'HUAWEI NOVA 13 PRO TPU CASE',
    severidad: 'media', fuera: [{ slug: 'ferias', nombre: 'HUAWEI NOVA 13 TPU CASE' }],
  }),
]

test('ninguna ficha puede existir sin su pregunta', () => {
  // Una ficha nueva sin pregunta pintaria la seccion vacia y no fallaria nada.
  for (const f of TODAS()) {
    for (const campo of ['id', 'bloque', 'titulo', 'pregunta', 'siHacer', 'noHacer', 'noPide']) {
      assert.ok(String(f[campo] ?? '').trim(), `${f.id}: falta ${campo}`)
    }
    assert.ok(Array.isArray(f.contexto) && f.contexto.length >= 2, `${f.id}: sin contexto`)
    assert.ok(Array.isArray(f.plazas), `${f.id}: sin plazas`)
  }
})

test('la pregunta se contesta con si o no, no con «depende»', () => {
  for (const f of TODAS()) {
    assert.match(f.pregunta, /^¿/, `${f.id}: no es una pregunta`)
    assert.match(f.pregunta, /\?$/, `${f.id}: no es una pregunta`)
    // Una pregunta abierta no se puede contestar con un boton.
    assert.ok(!/^¿(qué|cuál|cómo|por qué|cuándo|quién)/i.test(f.pregunta),
      `${f.id}: es abierta -> ${f.pregunta}`)
  }
})

test('el SI es siempre aplicar la propuesta, no deshacerla', () => {
  // Si el «si» dijera «no hacer nada», la respuesta no se podria convertir en
  // una instruccion y el reporte no serviria de lista de tareas.
  for (const f of TODAS()) {
    assert.match(f.siHacer, /^(Cambiar|Borrar|Dar de alta|Corregir|Añadir|Vender|Dejar)/,
      `${f.id}: el si no manda hacer nada -> ${f.siHacer}`)
  }
})

test('el caso del codigo repetido nombra los dos codigos', () => {
  const f = fichaDeCodigo(huerfano(MOTIVO.DUPLICADO))
  assert.match(f.pregunta, /R165GT/)
  assert.match(f.pregunta, /R16T/)
  assert.match(f.siHacer, /Cambiar R165GT por R16T/)
  // Y el «no» pide justo lo que hace falta para no volver a proponerlo.
  assert.match(f.noPide, /diferencian/)
})

test('el descontinuado pregunta distinto si quedan piezas', () => {
  const con = fichaDeCodigo(huerfano(MOTIVO.DESCONTINUADO, { cubiertoPor: null }))
  const sin = fichaDeCodigo(huerfano(MOTIVO.DESCONTINUADO, { cubiertoPor: null, piezas: 0, plazas: {} }))
  assert.match(con.pregunta, /se agoten/)
  assert.match(sin.pregunta, /elimina/)
})

test('el patron cuenta los productos de quien tiene que corregir', () => {
  const f = fichaDePatron(patron)
  assert.match(f.siHacer, /192 productos/)   // los de bodega, no los de todas
  assert.match(f.siHacer, /Bodega 192/)      // y dice en cual estan
  assert.equal(f.plazas[0], 'bodega')
})

test('el lote ensena TODOS sus codigos, uno por uno', () => {
  // Un «si» que da de baja veinte codigos sin decir cuales no es una
  // respuesta, es un cheque en blanco.
  for (const clase of Object.values(CLASE)) {
    const f = fichaDeLote(lote(clase))
    assert.equal(f.detalle.length, 3, clase)
    for (const c of ['A', 'B', 'C']) {
      assert.ok(f.detalle.some(d => d.startsWith(`${c} `)), `${clase}: falta ${c}`)
    }
    assert.equal(f.codigos.length, 3, `${clase}: el reporte no podria repartirlo`)
  }
})

test('el detalle del lote dice cuando se vendio cada uno', () => {
  // Es la prueba de que esta descontinuado: sin fecha, el lote pide fe.
  const f = fichaDeLote(lote(CLASE.VARIAS))
  assert.match(f.detalle[0], /marzo de 2024/)
  assert.match(f.detalle[1], /sin venta conocida/)
})

test('el lote de color nombra el codigo que bodega si surte', () => {
  const f = fichaDeLote(lote(CLASE.TONO))
  assert.match(f.detalle[0], /bodega surte I11T/)
})

test('ninguna ficha puede existir sin su sitio en la cola', () => {
  // Sin `orden`, la resta de la cola da NaN y el navegador deja el orden tal
  // y como venia: la ficha nueva aparece donde caiga y nada falla.
  const sitios = Object.values(PASO).map(p => p.n)
  for (const f of TODAS()) {
    assert.ok(sitios.includes(f.orden), `${f.id}: orden ${f.orden} no es un PASO`)
    assert.ok(String(f.etiqueta ?? '').trim(), `${f.id}: sin etiqueta de paso`)
    assert.ok(String(f.paso ?? '').trim(), `${f.id}: sin clave de paso`)
  }
})

/** El mismo orden que usa la cola del panel, para poder comprobarlo aqui. */
const enOrden = fichas => [...fichas].sort((a, b) => a.orden - b.orden || b.peso - a.peso)

test('la cola va por lo que hay que hacer, no por las piezas', () => {
  // Es la decision del dueno del 2026-10-27, y el peso la contradice: el lote
  // que se borra y se acabo tiene CERO piezas, y el que mando ignorar, 53.
  const lotes = enOrden(Object.values(CLASE).map(clase => fichaDeLote({
    ...lote(clase),
    piezas: clase === CLASE.SIN_EXISTENCIA ? 0 : clase === CLASE.TONO ? 53 : 9,
  })))

  assert.deepEqual(lotes.map(f => f.id), [
    'lote|sin-existencia',   // se borra y se acabo: una respuesta, cero riesgo
    'lote|una-plaza',        // hay que decidirlo plaza por plaza
    'lote|varias-plazas',    // solo anotar: seran los proximos descontinuados
    'lote|tono',             // se ignora
  ])
})

test('lo que se vende y bodega no tiene va delante de lo que solo se anota', () => {
  // Es el caso que cuesta dinero cada semana que nadie lo contesta, y es justo
  // el que NO se agrupa: por eso no puede quedar detras de los lotes grandes.
  const vivo = fichaDeCodigo(huerfano(MOTIVO.SIN_ALTA, { cubiertoPor: null }))
  const anotar = fichaDeLote(lote(CLASE.VARIAS))
  const ignorar = fichaDeLote(lote(CLASE.TONO))
  assert.deepEqual(enOrden([anotar, ignorar, vivo]).map(f => f.paso),
    ['vivo', 'anotar', 'ignorar'])
})

test('un suelto sin existencia se borra, no se decide', () => {
  const sin = fichaDeCodigo(huerfano(MOTIVO.DESCONTINUADO, { cubiertoPor: null, piezas: 0, plazas: {} }))
  const con = fichaDeCodigo(huerfano(MOTIVO.DESCONTINUADO, { cubiertoPor: null }))
  assert.equal(sin.paso, 'borrar')
  assert.equal(con.paso, 'decidir')
  // Y el duplicado va delante de los dos: mientras existan los dos codigos,
  // todo lo que se cuente de ese telefono sale repartido en dos.
  assert.ok(fichaDeCodigo(huerfano(MOTIVO.DUPLICADO)).orden < con.orden)
})

test('los nombres van detras de todo lo que mueve piezas', () => {
  for (const f of TODAS()) {
    if (f.bloque === 'nombre') assert.equal(f.orden, PASO.NOMBRE.n, f.id)
    else assert.ok(f.orden < PASO.NOMBRE.n, `${f.id}: un codigo no puede ir detras de un nombre`)
  }
})

