import test from 'node:test'
import assert from 'node:assert/strict'
import { agruparHuerfanos, ultimaVentaPorCodigo, diasDeRecuento, CLASE, MOVIMIENTOS_MASIVOS } from './lotes.js'

const HOY = new Date('2026-10-26')

const prod = (Codigo, Producto, Existencia, UltimoMov) => ({ Codigo, Producto, Existencia, UltimoMov })

/** Relleno para que un dia NO parezca recuento: cada producto con fecha suya. */
const relleno = (n, slug) => Array.from({ length: n }, (_, i) =>
  prod(`REL${slug}${i}`, `RELLENO ${i}`, 1, `2026-0${1 + (i % 9)}-0${1 + (i % 9)}`))

const huerfano = (codigo, producto, plazas, piezas, extra = {}) => ({
  codigo, producto, plazas, piezas, motivo: 'descontinuado', cubiertoPor: null, ...extra,
})

test('un dia que toca 20 productos en una plaza es recuento, no venta', () => {
  // El dia mediano mueve 1 o 2 productos; los dias de 100 o 200 son ajustes de
  // inventario. Contarlos como venta rejuvenece lo que lleva anios parado.
  const masivos = Array.from({ length: MOVIMIENTOS_MASIVOS }, (_, i) =>
    prod(`M${i}`, `MASIVO ${i}`, 1, '2026-10-01'))
  const inv = { leon: { productos: [...masivos, prod('X1', 'UNO', 1, '2026-09-15')] } }

  assert.ok(diasDeRecuento(inv).leon.has('2026-10-01'))
  assert.ok(!diasDeRecuento(inv).leon.has('2026-09-15'))

  const ventas = ultimaVentaPorCodigo(inv)
  assert.equal(ventas.M0.ultima, null, 'el recuento no cuenta como venta')
  assert.equal(ventas.X1.ultima, '2026-09-15')
})

test('un dia masivo en una plaza no contamina a las demas', () => {
  // El recuento lo hace cada plaza por su cuenta: si la misma fecha es venta
  // normal en otra tienda, ahi sigue valiendo.
  const inv = {
    leon: { productos: Array.from({ length: 25 }, (_, i) => prod(`L${i}`, `L ${i}`, 1, '2026-05-05')) },
    ferias: { productos: [...relleno(5, 'F'), prod('L0', 'L 0', 1, '2026-05-05')] },
  }
  assert.equal(ultimaVentaPorCodigo(inv).L0.ultima, '2026-05-05')
})

test('varias plazas lo tienen, nadie lo vende: es una baja de bodega', () => {
  const huerfanos = [
    huerfano('A1', 'UNO TPU CASE', { leon: 2, ferias: 1 }, 3),
    huerfano('A2', 'DOS TPU CASE', { leon: 1, 'san-luis': 2 }, 3),
    huerfano('A3', 'TRES TPU CASE', { ferias: 1, 'san-luis': 1 }, 2),
  ]
  const viejo = '2024-01-01'
  const inventarios = {
    leon:        { productos: [...relleno(5, 'L'), prod('A1', 'UNO TPU CASE', 2, viejo), prod('A2', 'DOS TPU CASE', 1, viejo)] },
    ferias:      { productos: [...relleno(5, 'F'), prod('A1', 'UNO TPU CASE', 1, viejo), prod('A3', 'TRES TPU CASE', 1, viejo)] },
    'san-luis':  { productos: [...relleno(5, 'S'), prod('A2', 'DOS TPU CASE', 2, viejo), prod('A3', 'TRES TPU CASE', 1, viejo)] },
  }
  const { lotes, sueltos } = agruparHuerfanos({ huerfanos, inventarios, hoy: HOY })
  assert.equal(sueltos.length, 0)
  assert.equal(lotes.length, 1)
  assert.equal(lotes[0].clase, CLASE.VARIAS)
  assert.equal(lotes[0].codigos.length, 3)
  assert.equal(lotes[0].piezas, 8)
})

test('lo que todavia se vende NO se agrupa', () => {
  // Es el caso que cuesta dinero: un modelo vivo que bodega no tiene de alta.
  // Meterlo con los muertos lo esconde justo donde hay que mirarlo.
  const huerfanos = [
    huerfano('V1', 'VIVO TPU CASE', { leon: 3, ferias: 2 }, 5),
    huerfano('M1', 'MUERTO UNO TPU CASE', { leon: 1, ferias: 1 }, 2),
    huerfano('M2', 'MUERTO DOS TPU CASE', { leon: 1, ferias: 1 }, 2),
    huerfano('M3', 'MUERTO TRES TPU CASE', { leon: 1, ferias: 1 }, 2),
  ]
  const inventarios = {
    leon: { productos: [...relleno(5, 'L'),
      prod('V1', 'VIVO TPU CASE', 3, '2026-10-20'),
      prod('M1', 'MUERTO UNO TPU CASE', 1, '2023-01-01'),
      prod('M2', 'MUERTO DOS TPU CASE', 1, '2023-01-02'),
      prod('M3', 'MUERTO TRES TPU CASE', 1, '2023-01-03')] },
    ferias: { productos: [...relleno(5, 'F'),
      prod('V1', 'VIVO TPU CASE', 2, '2026-10-18'),
      prod('M1', 'MUERTO UNO TPU CASE', 1, '2023-01-01'),
      prod('M2', 'MUERTO DOS TPU CASE', 1, '2023-01-02'),
      prod('M3', 'MUERTO TRES TPU CASE', 1, '2023-01-03')] },
  }
  const { lotes, sueltos } = agruparHuerfanos({ huerfanos, inventarios, hoy: HOY })
  assert.deepEqual(sueltos.map(h => h.codigo), ['V1'])
  assert.equal(lotes[0].codigos.length, 3)
})

test('el mismo producto en otro color es su propio lote', () => {
  // La prueba la da el NOMBRE, no el tiempo: bodega se quedo con un color.
  // Por eso va antes que la regla de llevar tiempo parado, y por eso entra
  // aunque se haya vendido esta semana.
  const color = (c, p, b) => huerfano(c, p, { leon: 1, ferias: 1 }, 2,
    { motivo: 'duplicado', cubiertoPor: { codigo: b, producto: 'IPHONE 11 TPU CASE' } })
  const huerfanos = [
    color('I11MT', 'IPHONE 11 MORADO TPU CASE', 'I11T'),
    color('I11ST', 'IPHONE 11 SALMON TPU CASE', 'I11T'),
    color('I11VT', 'IPHONE 11 VERDE TPU CASE', 'I11T'),
  ]
  const hoyMismo = '2026-10-25'
  const inventarios = {
    leon:   { productos: [...relleno(5, 'L'), ...huerfanos.map(h => prod(h.codigo, h.producto, 1, hoyMismo))] },
    ferias: { productos: [...relleno(5, 'F'), ...huerfanos.map(h => prod(h.codigo, h.producto, 1, hoyMismo))] },
  }
  const { lotes } = agruparHuerfanos({ huerfanos, inventarios, hoy: HOY })
  assert.equal(lotes.length, 1)
  assert.equal(lotes[0].clase, CLASE.TONO)
})

test('otro telefono no es otro color', () => {
  // «IPHONE 11 MORADO» contra «IPHONE 11 PRO AZUL» cambia el aparato ademas
  // del color: proponer darlo de baja por color seria falso.
  const huerfanos = [huerfano('I11MT', 'IPHONE 11 MORADO TPU CASE', { leon: 1 }, 1,
    { motivo: 'duplicado', cubiertoPor: { codigo: 'I11PAT', producto: 'IPHONE 11 PRO AZUL TPU CASE' } })]
  const inventarios = { leon: { productos: [...relleno(5, 'L'), prod('I11MT', 'IPHONE 11 MORADO TPU CASE', 1, '2026-10-20')] } }
  const { lotes, sueltos } = agruparHuerfanos({ huerfanos, inventarios, hoy: HOY })
  assert.equal(lotes.length, 0)
  assert.deepEqual(sueltos.map(h => h.codigo), ['I11MT'])
})

test('un lote de menos de tres se deshace', () => {
  // Una tabla para contestar lo que cabia en dos preguntas directas estorba.
  const huerfanos = [
    huerfano('A1', 'UNO TPU CASE', { leon: 1, ferias: 1 }, 2),
    huerfano('A2', 'DOS TPU CASE', { leon: 1, ferias: 1 }, 2),
  ]
  const viejo = '2023-01-01'
  const inventarios = {
    leon:   { productos: [...relleno(5, 'L'), prod('A1', 'UNO TPU CASE', 1, viejo), prod('A2', 'DOS TPU CASE', 1, viejo)] },
    ferias: { productos: [...relleno(5, 'F'), prod('A1', 'UNO TPU CASE', 1, viejo), prod('A2', 'DOS TPU CASE', 1, viejo)] },
  }
  const { lotes, sueltos } = agruparHuerfanos({ huerfanos, inventarios, hoy: HOY })
  assert.equal(lotes.length, 0)
  assert.equal(sueltos.length, 2)
})

test('una plaza y varias plazas no se mezclan', () => {
  // La prueba no pesa igual: en una sola caja puede ser un alta que hizo esa
  // tienda, y en tres no.
  const mk = (c, plazas, piezas) => huerfano(c, `${c} TPU CASE`, plazas, piezas)
  const huerfanos = [
    mk('U1', { leon: 1 }, 1), mk('U2', { leon: 1 }, 1), mk('U3', { leon: 1 }, 1),
    mk('V1', { leon: 1, ferias: 1 }, 2), mk('V2', { leon: 1, ferias: 1 }, 2), mk('V3', { leon: 1, ferias: 1 }, 2),
  ]
  const viejo = '2023-01-01'
  const todos = huerfanos.map(h => prod(h.codigo, h.producto, 1, viejo))
  const inventarios = {
    leon:   { productos: [...relleno(5, 'L'), ...todos] },
    ferias: { productos: [...relleno(5, 'F'), ...todos.filter(p => p.Codigo.startsWith('V'))] },
  }
  const { lotes } = agruparHuerfanos({ huerfanos, inventarios, hoy: HOY })
  const clases = Object.fromEntries(lotes.map(l => [l.clase, l.codigos.length]))
  assert.equal(clases[CLASE.VARIAS], 3)
  assert.equal(clases[CLASE.UNA], 3)
})

test('sin existencia va a su lote aunque se vendiera ayer', () => {
  const huerfanos = [
    huerfano('Z1', 'UNO TPU CASE', {}, 0),
    huerfano('Z2', 'DOS TPU CASE', {}, 0),
    huerfano('Z3', 'TRES TPU CASE', {}, 0),
  ]
  const inventarios = {
    leon: { productos: [...relleno(5, 'L'), ...huerfanos.map(h => prod(h.codigo, h.producto, 0, '2026-10-25'))] },
  }
  const { lotes } = agruparHuerfanos({ huerfanos, inventarios, hoy: HOY })
  assert.equal(lotes[0].clase, CLASE.SIN_EXISTENCIA)
  assert.equal(lotes[0].piezas, 0)
})

test('cada codigo del lote se lleva su ultima venta', () => {
  // Sin eso el lote es un cheque en blanco: no se puede auditar un «si» que
  // da de baja veinte codigos.
  const huerfanos = [
    huerfano('A1', 'UNO TPU CASE', { leon: 1, ferias: 1 }, 2),
    huerfano('A2', 'DOS TPU CASE', { leon: 1, ferias: 1 }, 2),
    huerfano('A3', 'TRES TPU CASE', { leon: 1, ferias: 1 }, 2),
  ]
  const inventarios = {
    leon: { productos: [...relleno(5, 'L'),
      prod('A1', 'UNO TPU CASE', 1, '2024-03-04'), prod('A2', 'DOS TPU CASE', 1, '2023-07-08'), prod('A3', 'TRES TPU CASE', 1, null)] },
    ferias: { productos: [...relleno(5, 'F'),
      prod('A1', 'UNO TPU CASE', 1, '2024-01-01'), prod('A2', 'DOS TPU CASE', 1, '2023-01-01'), prod('A3', 'TRES TPU CASE', 1, null)] },
  }
  const { lotes } = agruparHuerfanos({ huerfanos, inventarios, hoy: HOY })
  const porCodigo = Object.fromEntries(lotes[0].codigos.map(h => [h.codigo, h.ultimaVenta]))
  assert.equal(porCodigo.A1, '2024-03-04')   // la mas reciente de las dos plazas
  assert.equal(porCodigo.A2, '2023-07-08')
  assert.equal(porCodigo.A3, null)           // sin venta conocida, que no es «sin datos»
})

test('el lote cuenta las plazas donde esta DADO DE ALTA, no donde hay piezas', () => {
  // Sin esto, el lote de los que no tienen existencia salia sin tabla y
  // «borrarlos donde sigan dados de alta» no decia en cuales.
  const huerfanos = [
    huerfano('Z1', 'UNO TPU CASE', {}, 0),
    huerfano('Z2', 'DOS TPU CASE', {}, 0),
    huerfano('Z3', 'TRES TPU CASE', {}, 0),
  ]
  const inventarios = {
    leon:   { productos: [...relleno(5, 'L'), ...huerfanos.map(h => prod(h.codigo, h.producto, 0, '2023-01-01'))] },
    ferias: { productos: [...relleno(5, 'F'), prod('Z1', 'UNO TPU CASE', 0, '2023-01-01')] },
  }
  const { lotes } = agruparHuerfanos({ huerfanos, inventarios, hoy: HOY })
  assert.deepEqual(lotes[0].porPlaza, { leon: 3, ferias: 1 })
  assert.deepEqual(lotes[0].codigos.find(h => h.codigo === 'Z1').altaEn, ['leon', 'ferias'])
})
