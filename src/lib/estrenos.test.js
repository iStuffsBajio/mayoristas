import test from 'node:test'
import assert from 'node:assert/strict'
import {
  estrenos, comparaEdiciones, medianaRitmo, ventasDesdeElMes, lotesDeEntrada,
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
