// Pruebas de la capa de ajustes.
//
// Lo que fijan es la regla que puso el dueño con estas palabras: «si no
// detecta que ya se corrigió, no lo cambia de color, sigue en ámbar». El
// estado NO lo decide nadie marcando una casilla: lo decide el respaldo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TIPOS, MOTIVOS, ESTADOS, DIAS_PARA_INSISTIR,
  nuevoAjuste, juntarAjustes, dondeSigue, estadoDe,
  codigosOcultos, sinOcultos, pendientesPorPlaza, resumirAjustes, codigosDeFicha,
  historialDeBajas, resumenDeBajas,
  esBaja, codigosDescontinuados, MOTIVO_DESCONTINUADO,
} from './ajustes.js'

const HOY = new Date('2026-11-05T12:00:00Z')
const inv = (...codigos) => ({ productos: codigos.map(c => ({ Codigo: c, Existencia: 1 })) })

const ajuste = (codigo, extra = {}) => nuevoAjuste({
  codigo, motivo: 'ya-no-existe', quien: 'admin',
  cuando: new Date('2026-11-01T12:00:00Z'), ...extra,
})

test('un ajuste sin código o sin motivo válido no se crea', () => {
  assert.throws(() => nuevoAjuste({ codigo: '', motivo: 'ya-no-existe', quien: 'admin' }))
  assert.throws(() => nuevoAjuste({ codigo: 'X', motivo: 'porque si', quien: 'admin' }))
})

test('el código se normaliza: la caja lo escribe como le toca', () => {
  const a = ajuste(' i11t-wihr ')
  assert.equal(a.codigo, 'I11T-WIHR')
  assert.equal(a.clave, 'ocultar|I11T-WIHR')
})

test('mientras el código siga en una plaza, el ajuste sigue PENDIENTE', () => {
  const inventarios = { leon: inv('I11T', 'X'), 'san-luis': inv('X') }
  const e = estadoDe(ajuste('I11T'), inventarios, HOY)
  assert.equal(e.estado, ESTADOS.PENDIENTE)
  assert.deepEqual(e.plazas, ['leon'], 'hay que ir a corregirlo donde sigue vivo')
  assert.equal(e.dias, 4)
})

test('cuando el respaldo ya no lo trae, el ajuste se resuelve SOLO', () => {
  // Nadie marcó nada: el código desapareció de Eleventa y con eso basta.
  const inventarios = { leon: inv('X'), 'san-luis': inv('X') }
  assert.equal(estadoDe(ajuste('I11T'), inventarios, HOY).estado, ESTADOS.RESUELTO)
})

test('un pendiente que nadie toca en tres semanas vuelve a ser alerta', () => {
  const inventarios = { leon: inv('I11T') }
  const viejo = ajuste('I11T', { cuando: new Date('2026-10-01T12:00:00Z') })
  const e = estadoDe(viejo, inventarios, HOY)
  assert.ok(e.dias >= DIAS_PARA_INSISTIR)
  assert.equal(e.insiste, true, 'ya no es del dato: es de que nadie lo corrige')

  // El recién hecho no insiste todavía.
  assert.equal(estadoDe(ajuste('I11T'), inventarios, HOY).insiste, false)
})

test('si dos personas ajustan el mismo código, gana el más reciente', () => {
  const juntos = juntarAjustes({
    admin: [ajuste('X', { nota: 'viejo', cuando: new Date('2026-11-01T00:00:00Z') })],
    leon:  [ajuste('X', { nota: 'nuevo', cuando: new Date('2026-11-03T00:00:00Z'), quien: 'leon' })],
  })
  assert.equal(Object.keys(juntos).length, 1)
  assert.equal(juntos['ocultar|X'].nota, 'nuevo')
  assert.equal(juntos['ocultar|X'].quien, 'leon')
})

test('lo ajustado deja de salir en las listas del panel', () => {
  const ocultos = codigosOcultos({ 'ocultar|X': ajuste('X') })
  const filas = [{ codigo: 'X' }, { codigo: 'Y' }, { codigo: 'x' }]
  // También el que viene en minúsculas: es el mismo código.
  assert.deepEqual(sinOcultos(filas, ocultos).map(f => f.codigo), ['Y'])
})

test('sin ajustes, la lista pasa entera y sin copiarse', () => {
  const filas = [{ codigo: 'X' }]
  assert.equal(sinOcultos(filas, new Set()), filas)
})

test('cada sucursal recibe sólo lo que le toca corregir', () => {
  const inventarios = { leon: inv('A', 'B'), 'san-luis': inv('B'), bodega: inv('C') }
  const ajustes = juntarAjustes({ admin: [ajuste('A'), ajuste('B'), ajuste('C')] })
  const por = pendientesPorPlaza(ajustes, inventarios, HOY)

  assert.deepEqual(por.leon.map(a => a.codigo).sort(), ['A', 'B'])
  assert.deepEqual(por['san-luis'].map(a => a.codigo), ['B'])
  assert.deepEqual(por.bodega.map(a => a.codigo), ['C'])
})

test('el resumen separa lo pendiente de lo que ya se resolvió', () => {
  const inventarios = { leon: inv('A') }
  const ajustes = juntarAjustes({ admin: [ajuste('A'), ajuste('YA-NO-ESTA')] })
  const r = resumirAjustes(ajustes, inventarios, HOY)
  assert.equal(r.pendientes, 1)
  assert.equal(r.resueltos, 1)
  assert.equal(r.total, 2)
})

test('los motivos son una lista cerrada, para poder contarlos', () => {
  assert.ok(Object.keys(MOTIVOS).includes('codigo-duplicado'))
  assert.equal(TIPOS.OCULTAR, 'ocultar')
})

test('los códigos de una ficha salen como texto, venga como venga', () => {
  // Una ficha suelta trae un texto; un lote, una lista de objetos. Tratarlos
  // igual daba «[object Object]» en pantalla y un filtro que no filtraba.
  assert.deepEqual(codigosDeFicha({ codigo: 'i13t' }), ['I13T'])
  assert.deepEqual(
    codigosDeFicha({ codigos: [{ codigo: 'a', piezas: 2 }, { codigo: 'b' }] }),
    ['A', 'B'])
  assert.deepEqual(codigosDeFicha({ codigos: ['x', { codigo: 'y' }, null] }), ['X', 'Y'])
  assert.deepEqual(codigosDeFicha({}), [])
  assert.deepEqual(codigosDeFicha(null), [])
})

test('EL ARCHIVO DE BAJAS no pierde lo ya resuelto', () => {
  // Es el agujero que lo pidio: la unica pantalla que enseñaba estas notas
  // filtra por PENDIENTE, asi que en cuanto el codigo desaparecia del
  // respaldo el renglon se caia de la vista. El registro seguia en el
  // archivo -nada lo borra- pero no habia donde mirarlo: el control se
  // perdia justo cuando el trabajo se habia hecho bien.
  const inventarios = { leon: { productos: [{ Codigo: 'SIGUE', Existencia: 2 }] } }
  const correcciones = {
    'ocultar|SIGUE': { clave: 'ocultar|SIGUE', codigo: 'SIGUE', producto: 'A',
                       motivo: 'dado-de-baja', cuando: '2026-11-01T10:00:00Z', quien: 'admin' },
    'ocultar|FUE':   { clave: 'ocultar|FUE', codigo: 'FUE', producto: 'B',
                       motivo: 'ya-no-existe', cuando: '2026-10-01T10:00:00Z', quien: 'leon' },
  }
  const hoy = new Date('2026-11-08T12:00:00Z')
  const filas = historialDeBajas(correcciones, inventarios, hoy)

  assert.equal(filas.length, 2, 'los dos, el resuelto tambien')
  assert.equal(filas[0].codigo, 'SIGUE', 'lo pendiente va arriba: es lo que pide hacer algo hoy')
  assert.equal(filas[0].resuelto, false)
  assert.deepEqual(filas[0].plazas, ['leon'], 'y dice donde sigue, para saber a quien reclamar')
  assert.equal(filas[1].codigo, 'FUE')
  assert.equal(filas[1].resuelto, true)
})

test('el resumen del archivo cuenta por autor y por motivo', () => {
  const filas = historialDeBajas({
    a: { codigo: 'A', motivo: 'dado-de-baja', cuando: '2026-11-01T10:00:00Z', quien: 'admin' },
    b: { codigo: 'B', motivo: 'dado-de-baja', cuando: '2026-11-02T10:00:00Z', quien: 'admin' },
    c: { codigo: 'C', motivo: 'mal-capturado', cuando: '2026-11-03T10:00:00Z', quien: 'leon' },
  }, {}, new Date('2026-11-08T12:00:00Z'))

  const r = resumenDeBajas(filas)
  assert.equal(r.total, 3)
  assert.equal(r.pendientes, 0, 'sin inventarios, nada sigue vivo')
  assert.equal(r.resueltas, 3)
  assert.deepEqual(r.porQuien[0], ['admin', 2], 'lo mas frecuente primero')
  assert.deepEqual(r.porMotivo[0], ['Se decidió darlo de baja', 2])
})

test('un pendiente de mas de tres semanas se marca, y el archivo lo cuenta', () => {
  // Un pendiente que nadie toca deja de ser un problema del dato y pasa a ser
  // un problema de que nadie lo corrige. Son cosas distintas y se dicen
  // distinto.
  const filas = historialDeBajas(
    { a: { codigo: 'VIEJO', motivo: 'otro', cuando: '2026-10-01T10:00:00Z', quien: 'admin' } },
    { leon: { productos: [{ Codigo: 'VIEJO', Existencia: 1 }] } },
    new Date('2026-11-08T12:00:00Z'))
  assert.equal(filas[0].insiste, true)
  assert.equal(resumenDeBajas(filas).insisten, 1)
})

// ── Lo que bodega descontinuó ──────────────────────────────────────────────
//
// Vive en el mismo archivo que las bajas y NO es una baja. Contarlo como
// pendiente mandaría a una tienda a «corregir en su caja» un código que lo
// único que hace es liquidarse.

const descontinuado = (codigo, extra = {}) => nuevoAjuste({
  tipo: TIPOS.DESCONTINUADO, codigo, motivo: MOTIVO_DESCONTINUADO, quien: 'bodega',
  cuando: new Date('2026-11-01T12:00:00Z'), ...extra,
})

test('«descontinuado» tiene su propio motivo, y no se mezclan', () => {
  assert.equal(descontinuado('lgq6t').codigo, 'LGQ6T')
  assert.equal(descontinuado('LGQ6T').clave, 'descontinuado|LGQ6T')
  assert.throws(() => nuevoAjuste({ tipo: TIPOS.DESCONTINUADO, codigo: 'X', motivo: 'dado-de-baja', quien: 'admin' }))
  assert.throws(() => nuevoAjuste({ tipo: TIPOS.OCULTAR, codigo: 'X', motivo: MOTIVO_DESCONTINUADO, quien: 'admin' }))
})

test('LO DESCONTINUADO NO ES UNA BAJA: no se cuenta como pendiente en ninguna caja', () => {
  const correcciones = juntarAjustes({
    admin: [ajuste('BAJA1')],
    bodega: [descontinuado('LIQ1')],
  })
  const inventarios = { leon: inv('BAJA1', 'LIQ1') }

  assert.equal(esBaja(correcciones['ocultar|BAJA1']), true)
  assert.equal(esBaja(correcciones['descontinuado|LIQ1']), false)
  assert.equal(esBaja({}), true, 'un ajuste viejo, sin tipo, es una baja')

  const pend = pendientesPorPlaza(correcciones, inventarios, HOY)
  assert.deepEqual(pend.leon.map(a => a.codigo), ['BAJA1'], 'a la tienda sólo le toca borrar la baja')
  assert.deepEqual(resumirAjustes(correcciones, inventarios, HOY), { pendientes: 1, resueltos: 0, insistiendo: 0, total: 1 })
  assert.deepEqual(historialDeBajas(correcciones, inventarios, HOY).map(f => f.codigo), ['BAJA1'])
  assert.equal(resumenDeBajas(historialDeBajas(correcciones, inventarios, HOY)).total, 1)
})

test('lo descontinuado NO se esconde: sigue contando, sólo se aparta de la cola', () => {
  const correcciones = juntarAjustes({ bodega: [descontinuado('LIQ1')], admin: [ajuste('BAJA1')] })
  assert.deepEqual([...codigosDescontinuados(correcciones)], ['LIQ1'])
  assert.deepEqual([...codigosOcultos(correcciones)], ['BAJA1'], 'sólo lo dado de baja se oculta')
  assert.equal(codigosDescontinuados(null).size, 0)
})

test('la baja definitiva tiene nombre en el archivo y en el Excel', () => {
  assert.match(MOTIVOS['baja-definitiva'], /Baja definitiva/)
  const a = nuevoAjuste({ codigo: 'X1', motivo: 'baja-definitiva', quien: 'admin' })
  assert.equal(a.motivo, 'baja-definitiva')
  assert.equal(a.tipo, 'ocultar', 'es una baja normal: sigue el mismo camino hasta la caja')
})
