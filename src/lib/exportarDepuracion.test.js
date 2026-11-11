import { test } from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx-js-style'
import { libroDeDepuracion } from './exportarDepuracion.js'
import {
  reunirCatalogo, modelosDeSalida, sinRotacion, obsoletosEnCeros, porCategoria, PLAZAS_CON_STOCK,
} from './depuracion.js'

const HOY = new Date(2026, 10, 9, 12, 0, 0)
const hace = n => {
  const d = new Date(HOY); d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const plaza = productos => ({ productos: [{ Codigo: 'RELLENO', Producto: 'IPHONE 99 TPU CASE', Existencia: 1, Alta: hace(900), UltimaVenta: hace(1) }, ...productos] })
const red = (porPlaza = {}) => Object.fromEntries(PLAZAS_CON_STOCK.map(s => [s, s in porPlaza ? porPlaza[s] : plaza([])]))

function datos() {
  const inventarios = red({
    leon: plaza([
      { Codigo: 'D1', Producto: 'LG K10 HARD CASE', Departamento: 'LG', Existencia: 6, Alta: hace(900), UltimaVenta: hace(600) },
      { Codigo: 'O1', Producto: 'LG X1 TPU CASE', Departamento: 'LG', Existencia: 0, Alta: hace(2000), UltimaVenta: hace(1500) },
      { Codigo: 'O2', Producto: 'LG X2 TPU CASE', Departamento: 'LG', Existencia: 0, Alta: hace(200) },
    ]),
  })
  const cat = reunirCatalogo({ inventarios, hoy: HOY, descontinuados: new Set(['D1']) })
  const extra = { plazasSinInventario: cat.plazasSinInventario, plazasSinVenta: cat.plazasSinVenta }
  return {
    salida: modelosDeSalida(cat.filas),
    rotacion: sinRotacion(cat.filas).filter(f => f.probado),
    obsoletos: obsoletosEnCeros(cat.filas, extra),
    categorias: porCategoria(cat.filas, { ...extra, hoy: HOY }),
    ...extra, hoy: HOY,
  }
}

test('cuatro hojas, una por lista, con sus nombres', () => {
  const { libro, archivo } = libroDeDepuracion(datos())
  assert.deepEqual(libro.SheetNames, ['Modelos de salida', 'Sin rotación', 'Obsoletos en ceros', 'Por marca o departamento'])
  assert.equal(archivo, 'depuracion-2026-11-09.xlsx', 'el día sale de la fecha local, no de UTC')
})

test('cada hoja explica qué es y qué NO es', () => {
  const { libro } = libroDeDepuracion(datos())
  const texto = n => Object.values(libro.Sheets[n]).map(c => c?.v).filter(v => typeof v === 'string').join(' ')
  assert.match(texto('Modelos de salida'), /faltante normal que bodega resurte/)
  assert.match(texto('Modelos de salida'), /no lo oculta ni lo borra/)
  assert.match(texto('Sin rotación'), /un recuento de inventario no la rejuvenece/)
  assert.match(texto('Obsoletos en ceros'), /La página no borra nada de Eleventa/)
  assert.match(texto('Obsoletos en ceros'), /365 días/)
  assert.match(texto('Por marca o departamento'), /ENTERO/)
})

test('lo que el candado no deja pasar sale CON SU MOTIVO, no escondido', () => {
  const { libro } = libroDeDepuracion(datos())
  const hoja = libro.Sheets['Obsoletos en ceros']
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1 })
  const encabezado = filas[0]
  const iPuede = encabezado.indexOf('¿Se puede dar de baja?')
  const iFalta = encabezado.indexOf('Qué falta')
  const o2 = filas.find(f => f[1] === 'O2')
  assert.equal(o2[iPuede], 'No todavía')
  assert.match(o2[iFalta], /lleva 200 días en el catálogo/)
})

test('si falta el inventario de una plaza, las hojas de bajas lo dicen', () => {
  const d = datos()
  const { libro } = libroDeDepuracion({ ...d, plazasSinInventario: ['torreon'] })
  const t = Object.values(libro.Sheets['Obsoletos en ceros']).map(c => c?.v).filter(v => typeof v === 'string').join(' ')
  assert.match(t, /falta el inventario de Torreón/)
})

test('la marca sale del departamento: LG', () => {
  const { libro } = libroDeDepuracion(datos())
  const filas = XLSX.utils.sheet_to_json(libro.Sheets['Por marca o departamento'], { header: 1 })
  const lg = filas.find(f => f[1] === 'LG')
  assert.ok(lg)
  assert.equal(lg[0], 'No', 'tiene piezas: no está entera')
})

test('ninguna celda trae NaN, undefined ni null escritos', () => {
  const { libro } = libroDeDepuracion(datos())
  for (const nombre of libro.SheetNames) {
    for (const [ref, c] of Object.entries(libro.Sheets[nombre])) {
      if (ref.startsWith('!')) continue
      assert.ok(!/NaN|undefined|null/.test(String(c?.v)), `${nombre}!${ref} = ${c?.v}`)
    }
    // Y el rango sano: si trae NaN, Excel pide reparar el archivo.
    assert.ok(!/NaN/.test(libro.Sheets[nombre]['!ref']), `${nombre} rango ${libro.Sheets[nombre]['!ref']}`)
  }
})

test('sin nada en ninguna lista NO se genera un libro vacío', () => {
  assert.equal(libroDeDepuracion({}), null)
  assert.equal(libroDeDepuracion({ salida: [], rotacion: [], obsoletos: [], categorias: [] }), null)
})

test('una lista vacía no genera su hoja', () => {
  const d = datos()
  const { libro } = libroDeDepuracion({ ...d, rotacion: [] })
  assert.ok(!libro.SheetNames.includes('Sin rotación'))
})
