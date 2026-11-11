import test from 'node:test'
import assert from 'node:assert/strict'
import {
  estrenos, comparaEdiciones, medianaRitmo, ventasDesdeElMes, lotesDeEntrada,
  variantesDeModelosViejos,
  DIAS_EDICION, DIAS_PARA_OPINAR, DIAS_MISMA_EDICION, MINIMO_EDICION,
  DIAS_MAXIMO_EDICION,
} from './estrenos.js'
import { DIAS_RECIEN_LLEGADO } from './surtido.js'

const HOY = new Date('2026-11-07T12:00:00Z')
const hace = n => {
  const d = new Date(HOY)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const inv = productos => ({ leon: { productos } })

// `valorDe` espera { codigo: { promedio } }, no un numero suelto: con un
// numero devuelve NaN en silencio y todo el dinero de la pantalla sale vacio.
const precio = n => ({ promedio: n })

/** Un lote de `n` modelos entrados el mismo dia, como entran de verdad. */
const lote = (prefijo, dias, n = MINIMO_EDICION) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) =>
    [`${prefijo}${i}`, { alta: hace(dias), piso: false }]))

test('una edicion dura lo mismo que «recien llegado» en el resto del panel', () => {
  // Si se separan, «nuevo» significa una cosa en Surtido y otra en Ventas, y
  // las dos pantallas se contradicen sin que nada falle.
  assert.equal(DIAS_EDICION, DIAS_RECIEN_LLEGADO)
  assert.equal(DIAS_EDICION, 120)
})

test('LA VENTA SALE DEL ACUMULADO MENSUAL, que es el unico que llega atras', () => {
  // El detalle diario de `estadisticas.json` guarda solo 60 dias. Un modelo
  // que entro hace 100 y se vendio entero en los dos primeros meses saldria
  // con CERO midiendo con el diario, y la conclusion seria matar justo el
  // modelo que mejor entro.
  const altas = lote('BUENO', 100)
  const historial = {
    periodos: [
      // Los dos meses en que de verdad se vendio: fuera de los ultimos 60 dias.
      { p: '2026-08', m: { BUENO0: 40 } },
      { p: '2026-09', m: { BUENO0: 35 } },
      { p: '2026-10', m: {} },
      { p: '2026-11', m: {} },
    ],
  }
  const r = estrenos({
    altas, historial, inventarios: inv([{ Codigo: 'BUENO', Existencia: 2 }]),
    precios: { BUENO0: { promedio: 200 } }, hoy: HOY,
  })
  const m = r.cohortes[0].modelos.find(x => x.codigo === 'BUENO0')
  assert.equal(m.piezas, 75, 'tiene que contar los dos meses viejos')
  assert.equal(m.dinero, 15000)
  assert.equal(r.cohortes[0].resumen.venden, 1, 'el que vendio')
  assert.equal(r.cohortes[0].resumen.mudos, 2, 'los otros dos del lote no vendieron')
})

test('UNA EDICION RECIEN LLEGADA no cuenta como fracaso', () => {
  // Un modelo con dos semanas y cero ventas no es un fracaso, es un modelo
  // sin medir. Contados como mudos, toda edicion recien entrada pareceria un
  // desastre y se dejaria de comprar lo que todavia no se ha probado.
  const r = estrenos({
    altas: lote('X', 20, 3), historial: { periodos: [] },
    inventarios: inv([]), hoy: HOY,
  })
  const c = r.cohortes[0]
  assert.equal(c.resumen.modelos, 3)
  assert.equal(c.resumen.sinMedir, 3, 'con veinte dias no se opina de ninguno')
  assert.equal(c.resumen.medidos, 0)
  assert.equal(c.resumen.mudos, 0, 'y ninguno cuenta como que no vende')
  assert.equal(c.resumen.parte, null, 'sin nada medible no se inventa un porcentaje')
  assert.ok(c.modelos.every(m => m.ritmo === null))

  // Con un mes cumplido ya se opina, y entonces si son mudos.
  const con30 = estrenos({
    altas: lote('Y', 45, 3), historial: { periodos: [] },
    inventarios: inv([]), hoy: HOY,
  }).cohortes[0]
  assert.equal(con30.resumen.medidos, 3)
  assert.equal(con30.resumen.mudos, 3)
  assert.equal(con30.resumen.parte, 0)
})

test('UN PISO NO ES UNA LLEGADA', () => {
  // `Alta` es el primer movimiento del historial, no la fecha de entrada: en
  // Leon 579 de 647 productos comparten el dia en que arranco Eleventa.
  // Incluirlos lleno esta lista de fundas de iPhone 6 una vez.
  const altas = { ...lote('DEVERDAD', 30), FALSO: { alta: hace(30), piso: true } }
  const r = estrenos({ altas, historial: { periodos: [] }, inventarios: inv([]), hoy: HOY })
  assert.ok(!r.cohortes[0].modelos.some(m => m.codigo === 'FALSO'))
  assert.equal(r.cohortes[0].modelos.length, 3)
})

test('UNA EDICION ES UN LOTE, y se parte donde hay hueco', () => {
  // Medido en el catalogo real: 2026-08-10 trae 13 modelos y 2026-05-16/18
  // otros 10. Son lotes, no tramos de calendario.
  const altas = { ...lote('A', 30, 4), ...lote('B', 200, 5), ...lote('C', 400, 3) }
  const r = estrenos({ altas, historial: { periodos: [] }, inventarios: inv([]), hoy: HOY })
  assert.equal(r.cohortes.length, 2, 'solo se piden las dos ultimas')
  assert.equal(r.cohortes[0].modelos.length, 4)
  assert.equal(r.cohortes[1].modelos.length, 5)
  assert.ok(!JSON.stringify(r.cohortes).includes('"C0"'), 'la tercera no se pide')
})

test('UNA EDICION REPARTIDA EN DOS DIAS sigue siendo una', () => {
  // Mayo entro el 16 y el 18; enero el 28 y el 31. Agrupando por dia exacto,
  // una edicion saldria partida en dos y la comparacion mediria una mitad
  // contra la otra: el numero sale, y es falso.
  const altas = { ...lote('A', 173, 6), ...lote('B', 175, 4) }
  const { ediciones } = lotesDeEntrada(altas)
  assert.equal(ediciones.length, 1, 'dos dias pegados son el mismo lote')
  assert.equal(ediciones[0].codigos.length, 10)
})

test('UN LOTE QUE NO ENTRA EN LA VENTANA sigue saliendo', () => {
  // La edicion de enero esta a 280 dias: con tramos de 120 no salia nunca,
  // por muchas ediciones que se pidieran.
  const altas = { ...lote('A', 89, 13), ...lote('B', 280, 23) }
  const r = estrenos({ altas, historial: { periodos: [] }, inventarios: inv([]), hoy: HOY })
  assert.equal(r.cohortes.length, 2)
  assert.equal(r.cohortes[1].modelos.length, 23, 'la de hace nueve meses tambien se puede mirar')
})

test('el GOTEO no es una edicion', () => {
  // Diez de los modelos recientes entraron de uno en uno en ocho dias
  // sueltos. Llamar «la ultima edicion» a un modelo solo haria que la
  // comparacion midiera un modelo contra trece.
  const altas = {
    ...lote('A', 40, 5),
    SUELTO1: { alta: hace(10), piso: false },
    // Lejos del lote a proposito: a menos de 21 dias se le pegaria, que es
    // justo lo que tiene que pasar con una entrada de la misma tanda.
    SUELTO2: { alta: hace(100), piso: false },
  }
  const { ediciones, sueltos } = lotesDeEntrada(altas)
  assert.equal(ediciones.length, 1)
  assert.equal(ediciones[0].codigos.length, 5)
  assert.equal(sueltos, 2)
})

test('sin lotes NO se deja la pantalla vacia: se junta el goteo y se dice', () => {
  // Una plaza que recibe de goteo tiene el mismo derecho a saber si lo nuevo
  // vende. Se contesta con lo que haya y se marca como lo que es.
  const altas = {
    S1: { alta: hace(10), piso: false },
    S2: { alta: hace(70), piso: false },
    VIEJO: { alta: hace(300), piso: false },
  }
  const r = estrenos({ altas, historial: { periodos: [] }, inventarios: inv([]), hoy: HOY })
  assert.equal(r.hayLotes, false)
  assert.equal(r.cohortes.length, 1)
  assert.equal(r.cohortes[0].goteo, true)
  assert.equal(r.cohortes[0].etiqueta, 'Entradas sueltas')
  assert.equal(r.cohortes[0].modelos.length, 2, 'solo los de los ultimos 120 dias')
})

test('SE COMPARA A IGUALDAD DE TIEMPO: manda el ritmo, no el total', () => {
  // Un modelo que lleva 115 dias y 20 piezas vende MENOS que uno de 35 dias
  // con 15. Ordenando por piezas, el primero saldria arriba y la lista diria
  // lo contrario de lo que pasa.
  const altas = { ...lote('L', 115, 3), ...lote('R', 35, 3) }
  const historial = { periodos: [{ p: '2026-07', m: { L0: 20 } }, { p: '2026-10', m: { R0: 15 } }] }
  const r = estrenos({ altas, historial, inventarios: inv([]), hoy: HOY, ediciones: 2 })
  // Son dos lotes distintos: se compara cada uno con su propio ritmo.
  const primero = r.cohortes.find(c => c.modelos.some(m => m.codigo === 'R0'))
    .modelos.find(m => m.codigo === 'R0')
  const segundo = r.cohortes.find(c => c.modelos.some(m => m.codigo === 'L0'))
    .modelos.find(m => m.codigo === 'L0')
  assert.ok(primero.piezas < segundo.piezas, 'y eso que tiene MENOS piezas')
  assert.ok(primero.ritmo > segundo.ritmo)
})

test('sin costo capturado NO se inventa una utilidad', () => {
  const altas = { ...lote('Z', 60, 1), A: { alta: hace(60), piso: false }, B: { alta: hace(60), piso: false } }
  const historial = { periodos: [{ p: '2026-10', m: { A: 10, B: 10 } }] }
  const r = estrenos({
    altas, historial, inventarios: inv([]),
    precios: { A: { promedio: 200 }, B: { promedio: 200 } }, costos: { A: 60 }, hoy: HOY,
  })
  const a = r.cohortes[0].modelos.find(m => m.codigo === 'A')
  const b = r.cohortes[0].modelos.find(m => m.codigo === 'B')
  assert.equal(a.utilidad, 1400)
  assert.equal(b.utilidad, null, 'sin costo se queda sin utilidad y se dice')
})

test('el dinero PARADO es el de los que no venden, valorado a su existencia', () => {
  // Es la cifra que decide si la siguiente edicion se compra igual.
  const altas = { ...lote('Z', 60, 1), VENDE: { alta: hace(60), piso: false }, MUDO: { alta: hace(60), piso: false } }
  const historial = { periodos: [{ p: '2026-10', m: { VENDE: 10, Z0: 4 } }] }
  const r = estrenos({
    altas, historial,
    inventarios: inv([{ Codigo: 'VENDE', Existencia: 3 }, { Codigo: 'MUDO', Existencia: 25 }]),
    precios: { VENDE: { promedio: 200 }, MUDO: { promedio: 200 } }, hoy: HOY,
  })
  const s = r.cohortes[0].resumen
  assert.equal(s.existenciaMuda, 25, 'solo cuenta lo del que no vende')
  assert.equal(s.dineroMudo, 5000)
  assert.equal(s.parte, 2 / 3, 'dos de los tres del lote venden')
})

test('LA COMPARACION va en PUNTOS y necesita dos ediciones medibles', () => {
  // Decir «un 25% mejor» de dos porcentajes es la forma mas facil de que un
  // numero suene al doble de lo que es.
  const altas = { ...lote('N', 30, 4), ...lote('V', 200, 4) }
  const historial = {
    periodos: [{ p: '2026-04', m: { V0: 5 } },
               { p: '2026-10', m: { N0: 5, N1: 5 } }],
  }
  const r = estrenos({ altas, historial, inventarios: inv([]), hoy: HOY })
  const c = comparaEdiciones(r.cohortes)
  assert.equal(c.parteAhora, 0.5, '2 de 4 venden')
  assert.equal(c.parteAntes, 0.25, '1 de 4 vende')
  assert.equal(Math.round(c.puntos), 25)

  // Con una sola edicion medible no hay comparacion: «+0%» contra la nada se
  // lee como que no cambio.
  assert.equal(comparaEdiciones([r.cohortes[0]]), null)
  assert.equal(comparaEdiciones([r.cohortes[0], { resumen: { medidos: 0 }, modelos: [] }]), null)
})

test('el ritmo de una edicion se resume con la MEDIANA', () => {
  // Un solo modelo que se vende como churros levanta el promedio de toda una
  // edicion y la hace parecer buena con el resto parado.
  const modelos = [
    { ritmo: 0, sinMedir: false }, { ritmo: 0, sinMedir: false },
    { ritmo: 1, sinMedir: false }, { ritmo: 200, sinMedir: false },
  ]
  assert.equal(medianaRitmo(modelos), 0.5)
  assert.equal(medianaRitmo([]), null)
  assert.equal(medianaRitmo([{ ritmo: null, sinMedir: true }]), null,
    'lo que no se puede medir no entra en la mediana')
})

test('ventasDesdeElMes no mira los meses anteriores al corte', () => {
  const h = { periodos: [{ p: '2026-05', m: { A: 9 } }, { p: '2026-10', m: { A: 3 } }] }
  assert.deepEqual(ventasDesdeElMes(h, '2026-10'), { A: 3 })
  assert.deepEqual(ventasDesdeElMes(h, null), { A: 12 })
  assert.deepEqual(ventasDesdeElMes(null, '2026-10'), {}, 'sin historial no revienta')
})

test('un modelo sin fecha de entrada se cuenta aparte, no se adivina', () => {
  const r = estrenos({
    altas: { ...lote('A', 30, 3), B: { alta: null } },
    historial: { periodos: [] }, inventarios: inv([]), hoy: HOY,
  })
  assert.equal(r.sinFecha, 1)
  assert.equal(r.cohortes[0].modelos.length, 3)
})

test('el hueco que separa dos ediciones es de tres semanas', () => {
  // 21 dias separa de sobra los lotes reales -el mas apretado son dos dias-
  // sin partir ninguno.
  assert.equal(DIAS_MISMA_EDICION, 21)
  assert.equal(MINIMO_EDICION, 3)
  const justoDentro = lotesDeEntrada({ ...lote('A', 100, 3), ...lote('B', 120, 3) })
  assert.equal(justoDentro.ediciones.length, 1, '20 dias de hueco: el mismo lote')
  const justoFuera = lotesDeEntrada({ ...lote('A', 100, 3), ...lote('B', 130, 3) })
  assert.equal(justoFuera.ediciones.length, 2, '30 dias de hueco: dos lotes')
})

test('el minimo para opinar es un mes de mostrador', () => {
  assert.equal(DIAS_PARA_OPINAR, 30)
})

test('UNA EDICION NO PUEDE CRECER SIN FRENO', () => {
  // El agrupado encadena. Con mercancia entrando cada veinte dias, la cadena
  // no se romperia nunca y todo el año seria «la ultima edicion»: un solo
  // monton, sin nada con que compararlo, que es justo lo que se pidio mirar.
  const goteoLargo = {}
  for (let d = 10; d <= 200; d += 20) Object.assign(goteoLargo, lote(`G${d}_`, d, 3))
  const { ediciones } = lotesDeEntrada(goteoLargo)
  assert.ok(ediciones.length > 1, 'la cadena tiene que romperse en algun sitio')
  for (const e of ediciones) {
    const dura = (new Date(`${e.desde}T00:00:00`) - new Date(`${e.hasta}T00:00:00`)) / 86400000
    assert.ok(dura <= DIAS_MAXIMO_EDICION, `una edicion de ${dura} dias es demasiado larga`)
  }
})

test('una tanda real de 24 dias sigue siendo UNA edicion', () => {
  // Es la de mayo del catalogo de verdad: 2026-05-02 a 2026-05-26. El tope
  // esta puesto para no partirla.
  const mayo = { ...lote('A', 189, 3), ...lote('B', 175, 3), ...lote('C', 165, 4) }
  assert.equal(lotesDeEntrada(mayo).ediciones.length, 1)
})

// ── Un código nuevo no es un modelo nuevo ──────────────────────────────────
//
// Los casos son los reales del 2026-11-09, con los códigos y las fechas del
// catálogo: el Galaxy S10e que veía el dueño, el «3 en 1» de un teléfono que ya
// tenía su TPU, y dos códigos del mismo teléfono dados de alta con un día de
// diferencia en la misma tanda.

const ALTAS_REALES = {
  // El S10e: Aguascalientes lo vende desde 2023 (un piso: cota inferior)…
  SGS10LTC: { alta: '2023-03-23', piso: true },
  // …y León dio de alta OTRO código para el mismo teléfono en mayo de 2026.
  SGS10ETC: { alta: '2026-05-02', piso: false },

  // Un teléfono de enero con su TPU, y el «3 en 1» que llega en agosto.
  SGA57T:   { alta: '2026-01-28', piso: false },
  SGA573:   { alta: '2026-08-10', piso: false },

  // Un teléfono de verdad nuevo, sin nada anterior.
  GP7PT:    { alta: '2026-11-07', piso: false },

  // El mismo teléfono, dos códigos, un día de diferencia: MISMA tanda.
  XPM8PT:     { alta: '2026-05-18', piso: false },
  XRN15PPT:   { alta: '2026-05-19', piso: false },

  // Un código que cubre dos teléfonos: el G67 ya existía, el G77 no.
  MTG67T:   { alta: '2026-01-31', piso: false },
  MTG77T:   { alta: '2026-08-10', piso: false },

  // «3 en 1» de tres teléfonos que YA tenían su TPU: variante de los tres.
  SGA56T:   { alta: '2024-12-23', piso: false },
  SGA36T:   { alta: '2024-12-23', piso: false },
  SGA37T:   { alta: '2026-01-28', piso: false },
  SGA563:   { alta: '2026-08-10', piso: false },
}

const NOMBRES_REALES = {
  SGS10LTC: 'SAMSUNG S10E  TPU CRISTAL',
  SGS10ETC: 'GALAXY S10E TPU CRISTAL',
  SGA57T:   'GALAXY A57 TPU CASE',
  SGA573:   'GALAXY A57 3 IN 1',
  GP7PT:    'GOOGLE PIXEL 7 PRO TPU CASE',
  XPM8PT:   'XIAOMI POCCO M8 PRO TPU CASE',
  XRN15PPT: 'XIAOMI REDMI NOTE 15 PRO PLUS/POCCO M8 PRO TPU CASE',
  MTG67T:   'MOTO G67 TPU CASE',
  MTG77T:   'MOTO G77/G67 TPU CASE',
  SGA56T:   'GALAXY A56 TPU CASE',
  SGA36T:   'GALAXY A36 TPU CASE',
  SGA37T:   'GALAXY A37 TPU CASE',
  SGA563:   'GALAXY A56/A36/A37 3 IN 1',
}

test('EL GALAXY S10e: un código nuevo para un teléfono que ya existía es variante', () => {
  // El reabasto no mueve `Alta`. Lo que pasó fue que León dio de alta SGS10ETC
  // el 2 de mayo para un teléfono que otras plazas vendían desde 2023, y la
  // lista agrupaba por código y no por teléfono.
  const v = variantesDeModelosViejos({ altas: ALTAS_REALES, nombres: NOMBRES_REALES })
  assert.ok(v.has('SGS10ETC'), 'el S10e NO es un modelo nuevo')
  assert.equal(v.get('SGS10ETC').deCodigo, 'SGS10LTC', 'y dice de cuál viene')
  assert.equal(v.get('SGS10ETC').deAlta, '2023-03-23')
  assert.ok(!v.has('SGS10LTC'), 'el viejo no es variante de nadie')
})

test('un «3 en 1» de un teléfono que ya tenía su TPU es variante', () => {
  const v = variantesDeModelosViejos({ altas: ALTAS_REALES, nombres: NOMBRES_REALES })
  assert.ok(v.has('SGA573'))
  assert.equal(v.get('SGA573').deCodigo, 'SGA57T')
})

test('UN TELÉFONO DE VERDAD NUEVO no es variante de nada', () => {
  const v = variantesDeModelosViejos({ altas: ALTAS_REALES, nombres: NOMBRES_REALES })
  assert.ok(!v.has('GP7PT'))
})

test('DOS CÓDIGOS DE LA MISMA TANDA no se anulan entre sí', () => {
  // Con un día de diferencia son de la misma edición: ninguno es «el viejo».
  // Quitar uno sacaría de la lista un modelo que de verdad entró.
  const v = variantesDeModelosViejos({ altas: ALTAS_REALES, nombres: NOMBRES_REALES })
  assert.ok(!v.has('XPM8PT'))
  assert.ok(!v.has('XRN15PPT'))
})

test('UN CÓDIGO QUE CUBRE DOS TELÉFONOS: basta uno nuevo para que sea estreno', () => {
  // El G67 ya existía; el G77 no. El código trae un teléfono nuevo.
  const v = variantesDeModelosViejos({ altas: ALTAS_REALES, nombres: NOMBRES_REALES })
  assert.ok(!v.has('MTG77T'), 'trae el G77, que es nuevo')
  // Y el que cubre tres teléfonos que YA existían sí es variante.
  assert.ok(v.has('SGA563'), 'el A56, el A36 y el A37 ya tenían su TPU')
})

test('la holgura es la misma que agrupa una edición', () => {
  assert.equal(DIAS_MISMA_EDICION, 21)
  const altas = {
    A1: { alta: '2026-01-01', piso: false },
    A2: { alta: '2026-01-22', piso: false },   // 21 días después: variante
    A3: { alta: '2026-01-21', piso: false },   // 20 días después: misma tanda
  }
  const nombres = { A1: 'IPHONE 99 TPU CASE', A2: 'IPHONE 99 HARD CASE', A3: 'IPHONE 99 DUO' }
  const v = variantesDeModelosViejos({ altas, nombres })
  assert.ok(v.has('A2'))
  assert.ok(!v.has('A3'))
})

test('micas, hidrogel y stickers NO son teléfonos y no se emparejan', () => {
  // `claveModelo` no los deja en blanco: dos micas con el mismo nombre darían
  // la misma «clave de teléfono». Un emparejado falso es peor que ninguno.
  const altas = {
    M1: { alta: '2024-01-01', piso: false }, M2: { alta: '2026-10-01', piso: false },
    S1: { alta: '2024-01-01', piso: false }, S2: { alta: '2026-10-01', piso: false },
  }
  const nombres = {
    M1: 'MICA HIDROGEL MATE', M2: 'MICA HIDROGEL MATE',
    S1: 'STIKER DISEÑO', S2: 'STIKER DISEÑO',
  }
  assert.equal(variantesDeModelosViejos({ altas, nombres }).size, 0)
})

test('sin nombre no se opina', () => {
  const altas = { X1: { alta: '2024-01-01', piso: false }, X2: { alta: '2026-10-01', piso: false } }
  assert.equal(variantesDeModelosViejos({ altas, nombres: {} }).size, 0)
  assert.equal(variantesDeModelosViejos().size, 0)
})

test('estrenos() aparta las variantes ANTES de formar lotes y las enseña aparte', () => {
  // Tres modelos nuevos de verdad y un cuarto código que es variante de uno
  // viejo, todos de la misma fecha. Sin el filtro, el lote tendría cuatro.
  const altas = {
    ...lote('NUEVO', 40, 3),
    S10ETC: { alta: hace(40), piso: false },
    S10LTC: { alta: '2023-03-23', piso: true },
  }
  const nombres = {
    NUEVO0: 'XIAOMI AAA1 TPU CASE', NUEVO1: 'XIAOMI AAA2 TPU CASE', NUEVO2: 'XIAOMI AAA3 TPU CASE',
    S10ETC: 'GALAXY S10E TPU CRISTAL', S10LTC: 'SAMSUNG S10E TPU CRISTAL',
  }
  const variantes = variantesDeModelosViejos({ altas, nombres })
  const r = estrenos({ altas, historial: { periodos: [] }, inventarios: inv([]), nombres, variantes, hoy: HOY })

  const codigos = r.cohortes.flatMap(c => c.modelos.map(m => m.codigo))
  assert.ok(!codigos.includes('S10ETC'), 'no sale como modelo nuevo')
  assert.equal(r.cohortes[0].resumen.modelos, 3, 'el lote son los tres de verdad')

  assert.equal(r.variantes.length, 1, 'pero no se esconde en silencio')
  assert.equal(r.variantes[0].codigo, 'S10ETC')
  assert.equal(r.variantes[0].deCodigo, 'S10LTC')
})

test('quitar una variante PUEDE dejar a una edición sin lote, y no se inventa uno', () => {
  // Dos modelos nuevos y una variante, el mismo día: con la variante serían
  // tres —una edición—; sin ella son dos, que es goteo. Filtrar antes de
  // agrupar es lo que hace que el resultado sea el correcto.
  const altas = {
    N1: { alta: hace(40), piso: false }, N2: { alta: hace(40), piso: false },
    VAR: { alta: hace(40), piso: false }, VIEJO: { alta: '2022-05-05', piso: false },
  }
  const nombres = { N1: 'OPPO ZZ1 TPU CASE', N2: 'OPPO ZZ2 TPU CASE', VAR: 'OPPO ZZ9 3 IN 1', VIEJO: 'OPPO ZZ9 TPU CASE' }
  const sin = estrenos({ altas, historial: { periodos: [] }, inventarios: inv([]), nombres, hoy: HOY })
  assert.equal(sin.hayLotes, true, 'sin el filtro, tres juntos forman edición')

  const variantes = variantesDeModelosViejos({ altas, nombres })
  const con = estrenos({ altas, historial: { periodos: [] }, inventarios: inv([]), nombres, variantes, hoy: HOY })
  assert.equal(con.hayLotes, false, 'sin la variante son dos: es goteo')
})

test('estrenos() sin variantes se comporta exactamente como antes', () => {
  const altas = lote('X', 40, 3)
  const a = estrenos({ altas, historial: { periodos: [] }, inventarios: inv([]), hoy: HOY })
  const b = estrenos({ altas, historial: { periodos: [] }, inventarios: inv([]), variantes: null, hoy: HOY })
  assert.deepEqual(a, b)
  assert.deepEqual(a.variantes, [])
})
