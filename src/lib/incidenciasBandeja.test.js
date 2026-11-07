// Lo que el rediseño añadió: excepciones, ocurrencias, el mensaje para la
// plaza, la salud por plaza y el catálogo. Y la regla 🔒 del orden.
//
// El ciclo de vida básico se fija en `incidencias.test.js`. Aquí va lo que
// puede romperse sin que ninguna pantalla falle, que es lo que no se nota.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ESTADOS, ORDEN_PASO, PREFIJO_CONFIG,
  conciliar, ordenar, tapadaPor, ocurrenciasDe, impactoDe,
  excepcionesDe, catalogoDe, agruparPorPlaza, mensajeParaSucursal,
  saludPorPlaza, porRegla, horasHastaCerrar, tiempoMedio, esConfig,
} from './incidencias.js'
import { PASO } from './fichas.js'

const HOY = new Date('2026-11-07T12:00:00Z')
const ayer = n => new Date(HOY.getTime() - n * 86400000).toISOString()

test('LA ESCALERA DEL ORDEN dice lo mismo que PASO en fichas.js', () => {
  // 🔒 El orden de la cola lo decidió el dueño y vive en `PASO`. Está copiado
  // en `ORDEN_PASO` porque un hallazgo puede llegar sin `orden`, y dos listas
  // que tienen que decir lo mismo se separan solas en cuanto alguien añade un
  // paso. Si esto falla, la bandeja ordena por una escalera que ya no es la
  // suya, y eso no se nota: sigue habiendo las mismas incidencias.
  for (const p of Object.values(PASO)) {
    assert.equal(ORDEN_PASO[p.clave], p.n, `el paso «${p.clave}» no coincide`)
  }
  assert.equal(Object.keys(ORDEN_PASO).length, Object.keys(PASO).length,
    'sobra o falta un paso en ORDEN_PASO')
})

test('DENTRO DE UN MISMO ESTADO manda el paso, no la gravedad', () => {
  // Ordenando por gravedad, el lote de los que no tienen ni una pieza -el
  // unico que se ejecuta sin pensar, paso 0- caia detras de los duplicados,
  // que es al reves de lo que contesto el dueño.
  const inc = conciliar({
    hallazgos: [
      { id: 'cod|DUP', paso: 'duplicado', orden: 2 },   // gravedad alta
      { id: 'lote|sin-existencia', paso: 'borrar', orden: 0, codigos: ['A', 'B'] },
      { id: 'nom|X', paso: 'nombre', orden: 6 },
    ],
    hoy: HOY,
  })
  const orden = ordenar(inc).map(i => i.hallazgo.paso)
  assert.deepEqual(orden, ['borrar', 'duplicado', 'nombre'])
})

test('lo vencido y lo que nadie ha mirado van POR ENCIMA de la escalera', () => {
  // Un plazo pasado es un hecho del trabajo, no un reordenamiento de la
  // prioridad del negocio: la escalera manda dentro del estado, no sobre el.
  const inc = conciliar({
    hallazgos: [
      { id: 'cod|BORRAR', paso: 'borrar', orden: 0 },
      { id: 'cod|TARDE', paso: 'nombre', orden: 6 },
    ],
    // `nombre` es gravedad baja y no vence nunca, asi que se le pone una
    // gravedad critica a mano: es editable a proposito.
    registros: { 'cod|TARDE': { estado: ESTADOS.REVISANDO, gravedad: 'critica', fecha: ayer(5) } },
    hoy: HOY,
  })
  assert.equal(ordenar(inc)[0].huella, 'cod|TARDE', 'lo vencido va primero')
})

// ── Excepciones ─────────────────────────────────────────────────────────

test('UNA EXCEPCION POR CODIGO tapa ese codigo en cualquier plaza', () => {
  const h = { id: 'cod|I13T', plazas: ['leon'], codigos: [{ codigo: 'I13T', piezas: 4 }] }
  const exc = { e1: { alcance: 'codigo', codigo: 'i13t', motivo: 'se liquida' } }
  assert.ok(tapadaPor(h, 'cod|I13T', exc, HOY), 'no mira las mayusculas')
  assert.equal(tapadaPor({ ...h, codigos: [{ codigo: 'OTRO' }] }, 'cod|OTRO', exc, HOY), null)
})

test('una excepcion CADUCADA deja de tapar', () => {
  // Una excepcion para siempre es una alerta apagada que nadie recuerda haber
  // apagado. Si la caducidad no se respetara, poner fecha seria decorativo.
  const h = { id: 'cod|A', plazas: ['leon'], codigos: [{ codigo: 'A' }] }
  const viva = { e: { alcance: 'caso', huella: 'cod|A', vence: '2026-12-31', motivo: 'x' } }
  const muerta = { e: { alcance: 'caso', huella: 'cod|A', vence: '2026-10-01', motivo: 'x' } }
  assert.ok(tapadaPor(h, 'cod|A', viva, HOY))
  assert.equal(tapadaPor(h, 'cod|A', muerta, HOY), null)
})

test('una excepcion por PLAZA sólo tapa esa plaza, y por REGLA todas', () => {
  const enLeon = { id: 'nom|A', plazas: ['leon'], codigos: [] }
  const enSLP  = { id: 'nom|B', plazas: ['san-luis'], codigos: [] }
  const porPlaza = { e: { alcance: 'plaza', regla: 'nombre', plaza: 'leon', motivo: 'x' } }
  assert.ok(tapadaPor(enLeon, 'nom|A', porPlaza, HOY))
  assert.equal(tapadaPor(enSLP, 'nom|B', porPlaza, HOY), null)

  const porRegla_ = { e: { alcance: 'regla', regla: 'nombre', motivo: 'x' } }
  assert.ok(tapadaPor(enSLP, 'nom|B', porRegla_, HOY))
})

test('LA CONFIGURACION NO ES UNA INCIDENCIA, y esto arregla un fallo real', () => {
  // `conciliar` convierte todo registro sin hallazgo en una CERRADA -es la
  // verificacion automatica- asi que cada excepcion y cada entrada del
  // catalogo salia en la bandeja como una cerrada fantasma, y contaba en el
  // encabezado. Una excepcion no es un caso resuelto.
  const registros = {
    'cod|VIVA': { estado: ESTADOS.REVISANDO, fecha: ayer(1) },
    [`${PREFIJO_CONFIG}exc|1`]: { alcance: 'caso', huella: 'cod|OTRA', motivo: 'x' },
    [`${PREFIJO_CONFIG}cat|nombre`]: { significa: 'mi texto' },
  }
  const inc = conciliar({ hallazgos: [{ id: 'cod|VIVA', paso: 'vivo' }], registros, hoy: HOY })
  assert.equal(inc.length, 1, 'la config no puede aparecer como incidencia')
  assert.ok(esConfig(`${PREFIJO_CONFIG}exc|1`))

  assert.deepEqual(Object.keys(excepcionesDe(registros)), [`${PREFIJO_CONFIG}exc|1`])
  assert.equal(catalogoDe(registros).nombre.significa, 'mi texto')
  assert.equal(catalogoDe(registros).nombre.editado, true)
  // Y lo que nadie ha editado trae el texto medido, no un hueco.
  assert.ok(catalogoDe({}).nombre.significa.length > 10)
  assert.equal(catalogoDe({}).nombre.editado, false)
})

// ── Ocurrencias e impacto ───────────────────────────────────────────────

test('LAS OCURRENCIAS salen del historial, no de un contador', () => {
  // Un contador hay que acordarse de subirlo; el historial ya está. Cada vez
  // que un caso se dio por cerrado y el respaldo lo volvio a producir queda
  // un renglon de CONFLICTO, y eso es exactamente «ha vuelto».
  assert.equal(ocurrenciasDe(null), 1)
  assert.equal(ocurrenciasDe({ historial: [] }), 1)
  assert.equal(ocurrenciasDe({ historial: [
    { estado: ESTADOS.REVISANDO }, { estado: ESTADOS.CONFLICTO },
    { estado: ESTADOS.REVISANDO }, { estado: ESTADOS.CONFLICTO },
  ] }), 3)
})

test('el impacto suma las piezas de los codigos, no el numero de casos', () => {
  assert.equal(impactoDe({ codigos: [{ codigo: 'A', piezas: 4 }, { codigo: 'B', piezas: 7 }] }).piezas, 11)
  // Un lote cuyos codigos vienen como texto no tiene piezas por codigo: se
  // cae al peso de la ficha en vez de dar cero.
  assert.equal(impactoDe({ codigos: ['A', 'B'], peso: 30 }).piezas, 30)
  assert.equal(impactoDe({ codigos: ['A', 'B'] }).codigos, 2)
})

test('el tiempo de resolucion se mide del PRIMER movimiento al cierre', () => {
  const r = {
    historial: [{ cuando: '2026-11-01T12:00:00Z', estado: ESTADOS.REVISANDO }],
    fecha: '2026-11-03T12:00:00Z',
  }
  assert.equal(horasHastaCerrar(r), 48)
  assert.equal(horasHastaCerrar({}), null, 'sin historial no se inventa un tiempo')
  assert.equal(tiempoMedio([
    { estado: ESTADOS.CERRADA, registro: r },
    { estado: ESTADOS.REVISANDO, registro: r },   // no cuenta: no esta cerrada
  ]), 48)
  assert.equal(tiempoMedio([{ estado: ESTADOS.REVISANDO, registro: r }]), null)
})

// ── Por plaza ───────────────────────────────────────────────────────────

const tresCasos = () => conciliar({
  hallazgos: [
    { id: 'cod|A', paso: 'vivo', orden: 1, plazas: ['leon'], codigos: [{ codigo: 'A', piezas: 5 }] },
    { id: 'cod|B', paso: 'vivo', orden: 1, plazas: ['leon', 'san-luis'], codigos: [{ codigo: 'B', piezas: 2 }] },
    // El id lleva el prefijo de SU regla: `reglaDe` lo lee de ahi, asi que un
    // caso de nombre con id `cod|…` se contaria como codigo huerfano.
    { id: 'nom|C', paso: 'nombre', orden: 6, plazas: ['san-luis'], codigos: [{ codigo: 'C', piezas: 0 }] },
  ],
  registros: { 'nom|C': { estado: ESTADOS.DESCARTADA, motivo: 'no-es-error', fecha: ayer(1) } },
  hoy: HOY,
})

test('el avance por plaza cuenta lo hecho sobre SU total, no sobre el global', () => {
  const g = agruparPorPlaza(tresCasos())
  const leon = g.find(x => x.plaza === 'leon')
  const slp = g.find(x => x.plaza === 'san-luis')
  assert.equal(leon.total, 2)
  assert.equal(leon.suyas.length, 2, 'las dos siguen abiertas')
  assert.equal(leon.piezas, 7)
  assert.equal(slp.total, 2)
  assert.equal(slp.suyas.length, 1, 'la descartada ya no es trabajo suyo')
  assert.equal(slp.avance, 0.5)
})

test('LA SALUD SE MIDE SOBRE EL CATALOGO de cada plaza', () => {
  // Veinte casos en una plaza de 800 codigos y veinte en una de 100 no son lo
  // mismo, y contandolos a secas se ven iguales.
  const inventarios = {
    leon: { productos: Array.from({ length: 100 }, (_, i) => ({ Codigo: 'L' + i })) },
    'san-luis': { productos: Array.from({ length: 10 }, (_, i) => ({ Codigo: 'S' + i })) },
  }
  const s = saludPorPlaza(tresCasos(), inventarios)
  assert.equal(s.leon.total, 100)
  assert.equal(s.leon.conIncidencia, 2)
  assert.equal(s.leon.color, 'verde', '98 de 100 limpio')
  assert.equal(s['san-luis'].conIncidencia, 1, 'la descartada no cuenta')
  assert.equal(s['san-luis'].color, 'ambar', '9 de 10 limpio')
})

test('el analisis por regla separa lo abierto de lo cerrado', () => {
  const r = porRegla(tresCasos())
  const cod = r.find(x => x.regla === 'codigo-huerfano')
  assert.equal(cod.total, 2)
  assert.equal(cod.abiertas, 2)
  const nom = r.find(x => x.regla === 'nombre')
  assert.equal(nom.abiertas, 0, 'la descartada no es trabajo abierto')
  assert.equal(r[0].regla, 'codigo-huerfano', 'lo que mas trabajo da va primero')
})

// ── El mensaje para la plaza ─────────────────────────────────────────────

test('EL MENSAJE dice QUE HACER, no el nombre de la regla', () => {
  const g = agruparPorPlaza(tresCasos(), s => (s === 'leon' ? 'León' : s))
  const leon = g.find(x => x.plaza === 'leon')
  const m = mensajeParaSucursal({ plaza: 'leon', nombre: 'León', incidencias: leon.suyas })
  assert.match(m, /León/)
  assert.match(m, /2 cosas por corregir/)
  assert.match(m, /^• A$/m, 'un codigo suelto va por su codigo')
  // Lo que la tienda tiene que hacer. Sin esto el mensaje es «tienes
  // pendientes», que no es un encargo.
  assert.ok(!/codigo-huerfano/.test(m), 'no se le manda el nombre interno de la regla')
  // No se promete un plazo que nadie fijo.
  assert.ok(!/para el undefined/.test(m))
})

test('sin nada abierto el mensaje sale VACIO, no un saludo', () => {
  // Un mensaje con cero casos mandado a una tienda la manda a mirar una
  // pantalla donde no hay nada suyo, y la siguiente ya no la mira.
  const m = mensajeParaSucursal({
    plaza: 'leon', nombre: 'León',
    incidencias: [{ estado: ESTADOS.CERRADA, hallazgo: {}, huella: 'cod|A' }],
  })
  assert.equal(m, '')
})

test('el mensaje usa el texto del catalogo cuando la ficha no trae que hacer', () => {
  const m = mensajeParaSucursal({
    plaza: 'leon', nombre: 'León',
    incidencias: [{
      estado: ESTADOS.NUEVA, huella: 'nom|A',
      hallazgo: { codigos: [{ codigo: 'A' }] },
    }],
    catalogo: catalogoDe({}),
  })
  assert.match(m, /nombre de bodega/, 'cae al catalogo en vez de dejar el hueco')
})

test('el mensaje se corta y lo DICE', () => {
  const muchas = Array.from({ length: 20 }, (_, i) => ({
    estado: ESTADOS.NUEVA, huella: `cod|${i}`,
    hallazgo: { codigos: [{ codigo: 'C' + i }], siHacer: 'borrarlo' },
  }))
  const m = mensajeParaSucursal({ plaza: 'leon', nombre: 'León', incidencias: muchas, limite: 5 })
  assert.match(m, /Y 15 más en la página/)
})
