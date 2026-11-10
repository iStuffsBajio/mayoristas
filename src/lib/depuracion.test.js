import test from 'node:test'
import assert from 'node:assert/strict'
import {
  reunirCatalogo, razonesDeBloqueo, modelosDeSalida, sinRotacion, obsoletosEnCeros,
  porCategoria, resumirDepuracion, marcaDe, categoriaDe, normalizarMarca,
  PLAZAS_CON_STOCK, DIAS_MINIMOS_PARA_BAJA, DIAS_SIN_ROTACION, DIAS_CATEGORIA_SIN_MOVIMIENTO, sinVentaEn,
} from './depuracion.js'
import { SUCURSALES } from './sucursales.js'
import { DIAS_DESCONTINUADO } from './anomalias.js'

// «Hoy» fijo y a mediodía: lo que se prueba son días de calendario.
const HOY = new Date(2026, 10, 9, 12, 0, 0)   // 9 de noviembre de 2026
const hace = n => {
  const d = new Date(HOY); d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Un inventario de plaza: siempre trae un producto de relleno, que es como son de verdad. */
const plaza = (productos, { publicaVenta = true } = {}) => ({
  productos: [
    { Codigo: 'RELLENO', Producto: 'IPHONE 99 TPU CASE', Existencia: 1, Alta: hace(900), ...(publicaVenta ? { UltimaVenta: hace(1) } : {}) },
    ...productos,
  ],
})

/** Las seis plazas con lo que se indique; el resto, sólo el relleno. */
// `s in porPlaza` y no `??`: pasar `torreon: null` es justo pedir una plaza SIN
// inventario, y con `??` el null se rellenaba y la prueba no probaba nada.
const red = (porPlaza = {}) => Object.fromEntries(
  PLAZAS_CON_STOCK.map(s => [s, s in porPlaza ? porPlaza[s] : plaza([])]))

const filaDe = (inventarios, codigo, extra = {}) =>
  reunirCatalogo({ inventarios, hoy: HOY, ...extra }).filas.find(f => f.codigo === codigo)

test('la red son las seis plazas, Torreón incluida aunque no la vea un mayorista', () => {
  // `activa: false` quiere decir que un mayorista no la ve. No quiere decir
  // que no tenga piezas, y un stock global que se salta una plaza es el que
  // propone borrar lo que tiene mercancía.
  assert.deepEqual([...PLAZAS_CON_STOCK].sort(), SUCURSALES.map(s => s.slug).sort())
  assert.ok(PLAZAS_CON_STOCK.includes('torreon'))
  assert.ok(PLAZAS_CON_STOCK.includes('bodega') && PLAZAS_CON_STOCK.includes('ferias'))
})

test('stock global, de bodega y de tiendas', () => {
  const f = filaDe(red({
    bodega: plaza([{ Codigo: 'X1', Producto: 'OPPO A1 TPU CASE', Existencia: 4, Alta: hace(500) }]),
    leon:   plaza([{ Codigo: 'X1', Producto: 'OPPO A1 TPU CASE', Existencia: 3, Alta: hace(400) }]),
    torreon: plaza([{ Codigo: 'X1', Producto: 'OPPO A1 TPU CASE', Existencia: 2, Alta: hace(300) }]),
  }), 'X1')
  assert.equal(f.stockGlobal, 9)
  assert.equal(f.stockBodega, 4)
  assert.equal(f.stockTiendas, 5, 'Torreón cuenta: vende, aunque su página no esté abierta')
  assert.equal(f.alta, hace(500), 'la alta es la más temprana de la red')
  assert.equal(f.diasEnCatalogo, 500)
})

test('LA ÚLTIMA VENTA publicada es exacta; el historial por mes sólo puede BLOQUEAR', () => {
  // Una plaza que publica UltimaVenta da la fecha exacta. Una que no, cae al
  // último mes con salidas, tomando el fin de mes: el día más tardío posible.
  const exacta = filaDe(red({
    leon: plaza([{ Codigo: 'V1', Producto: 'OPPO A2 TPU CASE', Existencia: 0, Alta: hace(900), UltimaVenta: hace(800) }]),
  }), 'V1')
  assert.equal(exacta.ultimaVenta, hace(800))
  assert.equal(exacta.diasSinVender, 800)
  assert.equal(exacta.ventaExacta, true)

  const aprox = reunirCatalogo({
    inventarios: red({ leon: plaza([{ Codigo: 'V2', Producto: 'OPPO A3 TPU CASE', Existencia: 0, Alta: hace(900) }], { publicaVenta: false }) }),
    historiales: { leon: { periodos: [{ p: '2025-12', m: { V2: 5 } }] } },
    hoy: HOY,
  }).filas.find(f => f.codigo === 'V2')
  assert.equal(aprox.ultimaVenta, '2025-12-31', 'fin de mes: el día más tardío posible')
  assert.equal(aprox.ventaExacta, false, 'y no se puede dar por exacta')
})

test('UNA VENTA EN UNA PLAZA DONDE EL CÓDIGO YA SE BORRÓ SIGUE BLOQUEANDO', () => {
  // Aguascalientes lo tiene en cero y sin venta desde 2023; León lo vendió en
  // febrero y luego lo borró de su caja. El inventario de León ya no lo trae,
  // pero su historial sí: sin mirarlo, se propondría dar de baja un código que
  // se vendió hace nueve meses.
  const r = reunirCatalogo({
    inventarios: red({
      aguascalientes: plaza([{ Codigo: 'B1', Producto: 'OPPO A4 TPU CASE', Existencia: 0, Alta: hace(1000), UltimaVenta: hace(900) }]),
    }),
    historiales: { leon: { periodos: [{ p: '2026-02', m: { B1: 3 } }] } },
    hoy: HOY,
  })
  const f = r.filas.find(x => x.codigo === 'B1')
  assert.equal(f.ultimaVenta, '2026-02-28')
  assert.ok(f.diasSinVender < DIAS_MINIMOS_PARA_BAJA)
  assert.ok(razonesDeBloqueo(f, {}).some(x => /se vendió hace/.test(x)))
})

test('SIN EL INVENTARIO DE UNA PLAZA NO SE PUEDE DAR DE BAJA NADA', () => {
  // Es lo que pasa hoy con Torreón: vende, tiene mercancía y no publica su
  // inventario. Sin él, una pieza suya no se ve en el stock global.
  const inventarios = red({ torreon: null })
  const r = reunirCatalogo({ inventarios, hoy: HOY })
  assert.deepEqual(r.plazasSinInventario, ['torreon'])
  assert.equal(r.inventarioCompleto, false)

  const f = filaDe(red({
    torreon: null,
    aguascalientes: plaza([{ Codigo: 'M1', Producto: 'LG Q6 TPU CASE', Existencia: 0, Alta: hace(2000), UltimaVenta: hace(1500) }]),
  }), 'M1')
  const razones = razonesDeBloqueo(f, { plazasSinInventario: ['torreon'] })
  assert.ok(razones.some(x => /falta el inventario de Torreón/.test(x)), razones.join(' | '))
})

test('un inventario VACÍO cuenta como faltante: no es una plaza sin piezas', () => {
  const r = reunirCatalogo({ inventarios: { ...red(), leon: { productos: [] } }, hoy: HOY })
  assert.deepEqual(r.plazasSinInventario, ['leon'])
})

test('LOS CANDADOS: cada motivo dice con palabras por qué no', () => {
  const base = { codigo: 'C', existeEnCaja: true, stockGlobal: 0, diasSinVender: 800, diasEnCatalogo: 900, ventaExacta: true, plazas: ['leon'] }
  assert.deepEqual(razonesDeBloqueo(base, {}), [], 'sin motivos: se puede')

  assert.ok(razonesDeBloqueo({ ...base, stockGlobal: 1 }, {})[0].includes('tiene 1 pieza'))
  assert.ok(razonesDeBloqueo({ ...base, stockGlobal: 7 }, {})[0].includes('tiene 7 piezas'))
  assert.ok(razonesDeBloqueo({ ...base, diasSinVender: 100 }, {})[0].includes('se vendió hace 100 días'))
  assert.ok(razonesDeBloqueo({ ...base, diasSinVender: 1 }, {})[0].includes('hace 1 día '))
  assert.ok(razonesDeBloqueo({ ...base, existeEnCaja: false }, {}).some(x => /ya no existe en ninguna caja/.test(x)))
  assert.ok(razonesDeBloqueo({ ...base, diasEnCatalogo: 90 }, {}).some(x => /lleva 90 días en el catálogo/.test(x)))
  assert.ok(razonesDeBloqueo({ ...base, diasEnCatalogo: null }, {}).some(x => /no se sabe desde cuándo existe/.test(x)))
  assert.ok(razonesDeBloqueo({ ...base, ventaExacta: false }, {}).some(x => /última venta/.test(x)))
})

test('EL PISO ES 365: pedir menos no lo baja', () => {
  // El dueño dijo «365–730». 365 es el piso y no existe un valor menor.
  assert.equal(DIAS_MINIMOS_PARA_BAJA, 365)
  const f = { existeEnCaja: true, stockGlobal: 0, diasSinVender: 200, diasEnCatalogo: 900, ventaExacta: true, plazas: [] }
  assert.ok(razonesDeBloqueo(f, { dias: 30 }).some(x => /se vendió hace 200 días y se piden más de 365/.test(x)))
  assert.ok(razonesDeBloqueo(f, { dias: 0 }).some(x => /365/.test(x)))
  // Y pedir más sí endurece.
  assert.ok(razonesDeBloqueo({ ...f, diasSinVender: 500 }, { dias: 730 }).some(x => /más de 730/.test(x)))
  assert.deepEqual(razonesDeBloqueo({ ...f, diasSinVender: 500 }, { dias: 365 }), [])
})

test('exactamente 365 días sin venta TODAVÍA bloquea: hacen falta MÁS de 365', () => {
  const f = { existeEnCaja: true, stockGlobal: 0, diasEnCatalogo: 900, ventaExacta: true, plazas: [] }
  assert.ok(razonesDeBloqueo({ ...f, diasSinVender: 365 }, {}).length > 0)
  assert.deepEqual(razonesDeBloqueo({ ...f, diasSinVender: 366 }, {}), [])
  assert.deepEqual(razonesDeBloqueo({ ...f, diasSinVender: null }, {}), [], 'nunca se vendió y lleva años')
  assert.equal(sinVentaEn({ diasSinVender: null }, 365), true)
  assert.equal(sinVentaEn({ diasSinVender: 365 }, 365), false)
})

test('MODELOS DE SALIDA: bodega no lo tiene y las tiendas todavía venden', () => {
  const filas = reunirCatalogo({
    inventarios: red({
      // Descontinuado: bodega ni lo tiene dado de alta.
      leon: plaza([
        { Codigo: 'D1', Producto: 'LG K10 HARD CASE', Existencia: 6, Alta: hace(900) },
        { Codigo: 'D2', Producto: 'OPPO R1 TPU CASE', Existencia: 2, Alta: hace(900) },
        { Codigo: 'D3', Producto: 'OPPO R2 TPU CASE', Existencia: 2, Alta: hace(900) },
        { Codigo: 'N1', Producto: 'OPPO R3 TPU CASE', Existencia: 0, Alta: hace(900) },
      ]),
      bodega: plaza([
        // En cero desde hace mucho: casi seguro nadie lo resurte.
        { Codigo: 'D2', Producto: 'OPPO R1 TPU CASE', Existencia: 0, Alta: hace(900), UltimoMov: hace(DIAS_DESCONTINUADO + 5) },
        // En cero desde hace poco: un faltante normal. Hay que COMPRAR.
        { Codigo: 'D3', Producto: 'OPPO R2 TPU CASE', Existencia: 0, Alta: hace(900), UltimoMov: hace(10) },
      ]),
    }),
    hoy: HOY,
  }).filas
  const s = Object.fromEntries(modelosDeSalida(filas).map(f => [f.codigo, f.razon]))
  assert.deepEqual(s, { D1: 'sin-alta', D2: 'agotado-largo', D3: 'agotado-reciente' })
  assert.equal(s.N1, undefined, 'sin piezas en las tiendas no hay nada que liquidar')
  assert.equal(s.RELLENO, undefined, 'y lo que bodega sí tiene no es de salida')
})

test('SIN ROTACIÓN: piezas paradas, y sólo se AFIRMA si hubo tiempo de venderse', () => {
  const filas = reunirCatalogo({
    inventarios: red({
      leon: plaza([
        { Codigo: 'P1', Producto: 'OPPO P1 TPU CASE', Existencia: 5, Alta: hace(800), UltimaVenta: hace(600) },
        { Codigo: 'P2', Producto: 'OPPO P2 TPU CASE', Existencia: 5, Alta: hace(100) },          // nuevo, sin ventas
        { Codigo: 'P3', Producto: 'OPPO P3 TPU CASE', Existencia: 5, Alta: hace(800), UltimaVenta: hace(20) },
      ]),
    }),
    hoy: HOY,
  }).filas
  const r = Object.fromEntries(sinRotacion(filas, DIAS_SIN_ROTACION).map(f => [f.codigo, f.probado]))
  assert.equal(r.P1, true, 'parado y con tiempo de sobra')
  assert.equal(r.P2, false, 'sin ventas pero con 100 días: no ha tenido tiempo, y se dice')
  assert.equal(r.P3, undefined, 'vendió hace 20 días: rota')
})

test('OBSOLETOS EN CEROS: sólo lo que existe en alguna caja, con por qué sí y por qué no', () => {
  const r = reunirCatalogo({
    inventarios: red({
      aguascalientes: plaza([
        { Codigo: 'O1', Producto: 'LG X1 TPU CASE', Existencia: 0, Alta: hace(2000), UltimaVenta: hace(1500) },
        { Codigo: 'O2', Producto: 'LG X2 TPU CASE', Existencia: 0, Alta: hace(2000), UltimaVenta: hace(400) },
        { Codigo: 'O3', Producto: 'LG X3 TPU CASE', Existencia: 0, Alta: hace(200) },         // 200 días: poco
        { Codigo: 'O4', Producto: 'LG X4 TPU CASE', Existencia: 3, Alta: hace(2000), UltimaVenta: hace(1500) },
      ]),
    }),
    historiales: { leon: { periodos: [{ p: '2022-03', m: { FANTASMA: 40 } }] } },
    hoy: HOY,
  })
  const lista = obsoletosEnCeros(r.filas, { dias: 365 })
  const por = Object.fromEntries(lista.map(f => [f.codigo, f]))

  assert.equal(por.O1.puede, true)
  assert.equal(por.O2.puede, true, '400 días sin venta: más de 365')
  assert.equal(por.O3.puede, false)
  assert.ok(por.O3.bloqueos.some(x => /lleva 200 días/.test(x)))
  assert.equal(por.O4, undefined, 'tiene 3 piezas: no es un obsoleto en ceros')
  assert.equal(por.FANTASMA, undefined, 'sólo está en el historial: ya no existe en ninguna caja')
  assert.equal(r.soloEnHistorial, 1, 'pero se cuenta, para ver de dónde salía el número inflado')

  // Con 730, el de 400 días deja de entrar.
  const dos = Object.fromEntries(obsoletosEnCeros(r.filas, { dias: 730 }).map(f => [f.codigo, f]))
  assert.ok(dos.O1 && !dos.O2)

  // Los que se pueden, primero.
  assert.equal(lista[0].puede, true)
})

test('EL INVENTARIO INCOMPLETO bloquea TODO, aunque el código cumpla', () => {
  const r = reunirCatalogo({
    inventarios: red({
      torreon: null,
      aguascalientes: plaza([{ Codigo: 'O1', Producto: 'LG X1 TPU CASE', Existencia: 0, Alta: hace(2000), UltimaVenta: hace(1500) }]),
    }),
    hoy: HOY,
  })
  const lista = obsoletosEnCeros(r.filas, { plazasSinInventario: r.plazasSinInventario })
  assert.ok(lista.length > 0)
  assert.ok(lista.every(f => !f.puede), 'ninguno se puede: falta Torreón')
  assert.equal(resumirDepuracion({ filas: r.filas, plazasSinInventario: r.plazasSinInventario }).obsoletosListos, 0)
})

test('UNA PLAZA QUE NO PUBLICA LA ÚLTIMA VENTA no puede dar fe de que algo no se vendió', () => {
  // Un inventario de antes de que existiera `UltimaVenta`: no trae el campo
  // en ningún producto. De esa plaza no se puede probar una ausencia.
  const r = reunirCatalogo({
    inventarios: red({
      leon: plaza([{ Codigo: 'L1', Producto: 'LG X1 TPU CASE', Existencia: 0, Alta: hace(2000) }], { publicaVenta: false }),
    }),
    hoy: HOY,
  })
  assert.deepEqual(r.plazasSinVenta, ['leon'])
  const f = r.filas.find(x => x.codigo === 'L1')
  assert.equal(f.ventaExacta, false)
  assert.ok(razonesDeBloqueo(f, { plazasSinVenta: r.plazasSinVenta }).some(x => /León todavía no publica su última venta/.test(x)))
})

test('POR CATEGORÍA: entera sólo si cada código pasa el candado', () => {
  const lg = (cod, e) => ({ Codigo: cod, Producto: `LG ${cod} TPU CASE`, Departamento: 'LG', Existencia: 0, Alta: hace(2500), UltimaVenta: hace(1400), ...e })
  const r = reunirCatalogo({
    inventarios: red({
      leon: plaza([
        lg('LGA'), lg('LGB'), lg('LGC'),
        // Una categoría con UNA pieza no se puede dar de baja completa.
        { Codigo: 'HUA', Producto: 'HUAWEI A TPU CASE', Departamento: 'HUAWEI', Existencia: 2, Alta: hace(2500), UltimaVenta: hace(1400) },
        { Codigo: 'HUB', Producto: 'HUAWEI B TPU CASE', Departamento: 'HUAWEI', Existencia: 0, Alta: hace(2500), UltimaVenta: hace(1400) },
        // Y una con una venta reciente tampoco.
        { Codigo: 'ZTA', Producto: 'ZTE A TPU CASE', Departamento: 'ZTE', Existencia: 0, Alta: hace(2500), UltimaVenta: hace(60) },
      ]),
    }),
    hoy: HOY,
  })
  const cats = Object.fromEntries(porCategoria(r.filas, { hoy: HOY }).map(c => [c.categoria, c]))
  assert.equal(cats.LG.completa, true)
  assert.equal(cats.LG.codigos, 3)
  assert.equal(cats.HUAWEI.completa, false)
  assert.equal(cats.HUAWEI.conStock, 1)
  assert.equal(cats.HUAWEI.libres, 1, 'uno sí se podría, pero la categoría no está entera')
  assert.equal(cats.ZTE.completa, false)
  assert.ok(cats.ZTE.bloqueados[0].bloqueos.some(x => /se vendió hace 60 días/.test(x)))
  assert.equal(DIAS_CATEGORIA_SIN_MOVIMIENTO, 730)

  // Las completas, primero.
  assert.equal(porCategoria(r.filas, { hoy: HOY })[0].categoria, 'LG')
})

test('«GALAXY» y «SAMSUNG» son la misma categoría, y el departamento manda sobre el nombre', () => {
  assert.equal(normalizarMarca('galaxy'), 'SAMSUNG')
  assert.equal(normalizarMarca(' Samsung '), 'SAMSUNG')
  assert.equal(normalizarMarca('ONE PLUS'), 'ONE PLUS')
  assert.equal(normalizarMarca('Llaveros'), 'LLAVEROS')
  assert.equal(marcaDe('GALAXY S10E TPU CRISTAL'), 'SAMSUNG')
  assert.equal(marcaDe('IPHONE 13 TPU CASE'), 'APPLE')
  assert.equal(marcaDe('POCCO M8 PRO'), 'XIAOMI')
  assert.equal(marcaDe('MOTO G24 TPU CASE'), 'MOTOROLA')
  assert.equal(marcaDe('ONE PLUS 9 TPU CASE'), 'ONE PLUS')
  assert.equal(marcaDe('LG Q6 TPU CASE'), 'LG')
  assert.equal(marcaDe(''), '')
  assert.equal(categoriaDe({ departamento: 'GALAXY', producto: 'LG K10' }), 'SAMSUNG', 'el departamento manda')
  assert.equal(categoriaDe({ departamento: null, producto: 'LG K10 TPU' }), 'LG', 'sin él, el nombre')
  assert.equal(categoriaDe({ departamento: '', producto: '' }), 'SIN CATEGORÍA')
})

test('lo marcado como descontinuado se lleva al renglón', () => {
  const f = filaDe(red({
    leon: plaza([{ Codigo: 'DESC1', Producto: 'LG K10 HARD CASE', Existencia: 3, Alta: hace(900) }]),
  }), 'DESC1', { descontinuados: new Set(['DESC1']) })
  assert.equal(f.descontinuado, true)
  assert.equal(filaDe(red(), 'RELLENO').descontinuado, false)
})

test('LOS STICKERS NO SE DEPURAN: bodega los imprime, no los almacena', () => {
  // Con piezas en una tienda y fuera del catálogo de bodega saldrían como
  // «modelo de salida»; en cero y sin venta, como «obsoleto». Ni lo uno ni lo
  // otro: un sticker en cero no es un agotado ni un muerto.
  const r = reunirCatalogo({
    inventarios: red({
      leon: plaza([
        { Codigo: 'SP', Producto: 'STIKER PEQUEÑO', Existencia: 40, Alta: hace(900), UltimaVenta: hace(2) },
        { Codigo: 'STX', Producto: 'STIKER DISEÑO', Existencia: 0, Alta: hace(2000), UltimaVenta: hace(1500) },
        { Codigo: 'OK1', Producto: 'OPPO Z1 TPU CASE', Existencia: 3, Alta: hace(900), UltimaVenta: hace(2) },
      ]),
    }),
    hoy: HOY,
  })
  assert.equal(r.filas.find(f => f.codigo === 'SP').produce, true)
  assert.equal(r.filas.find(f => f.codigo === 'OK1').produce, false)

  const codigos = lista => lista.map(f => f.codigo)
  assert.ok(!codigos(modelosDeSalida(r.filas)).includes('SP'))
  assert.ok(codigos(modelosDeSalida(r.filas)).includes('OK1'), 'una funda sí')
  assert.ok(!codigos(obsoletosEnCeros(r.filas)).includes('STX'))
  assert.ok(!codigos(sinRotacion(r.filas)).includes('SP'))
  assert.ok(porCategoria(r.filas, { hoy: HOY }).every(c => !c.codigosLista.some(f => f.produce)))
})
