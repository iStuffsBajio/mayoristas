import test from 'node:test'
import assert from 'node:assert/strict'
import {
  juntarEdiciones, porCodigo, estadoEdicion, ESTADOS_EDICION, cambiosDelFormulario,
  resumenDeCodigo, marcasDe, columnasDeMarcas, notaDe, textoValor,
} from './ediciones.js'
import { hojasDeCambios } from './exportarCambios.js'

const inv = productos => ({ productos })
const INVS = {
  leon:   inv([{ Codigo: 'I13T', Producto: 'IPHONE 13 TPU CASE', Precio: 250, Mayoreo: 150 }]),
  bodega: inv([{ Codigo: 'I13T', Producto: 'IPHONE 13 TPU CASE', Costo: 55 }]),
}
const ed = (tipo, valor, extra = {}) => ({ clave: `${tipo}|I13T${extra.plaza ? `|${extra.plaza}` : ''}`, tipo, codigo: 'I13T', valor, cuando: '2026-11-19T10:00:00Z', ...extra })

test('lo editado queda PENDIENTE hasta que el respaldo trae el valor, y se cierra solo', () => {
  assert.equal(estadoEdicion(ed('costo', 55), INVS), ESTADOS_EDICION.HECHO)
  assert.equal(estadoEdicion(ed('costo', 58), INVS), ESTADOS_EDICION.PENDIENTE)
  assert.equal(estadoEdicion(ed('precio', 250, { plaza: 'leon' }), INVS), ESTADOS_EDICION.HECHO)
  assert.equal(estadoEdicion(ed('mayoreo', 140, { plaza: 'leon' }), INVS), ESTADOS_EDICION.PENDIENTE)
  assert.equal(estadoEdicion(ed('nombre', 'IPHONE 13 TPU CASE'), INVS), ESTADOS_EDICION.HECHO)
  assert.equal(estadoEdicion(ed('nombre', 'IPHONE 13 TPU NEGRA'), INVS), ESTADOS_EDICION.PENDIENTE)
  // El código: hecho cuando el nuevo existe y el viejo ya no.
  assert.equal(estadoEdicion(ed('codigo', 'I13TN'), INVS), ESTADOS_EDICION.PENDIENTE)
  const renombrado = { leon: inv([{ Codigo: 'I13TN' }]) }
  assert.equal(estadoEdicion(ed('codigo', 'I13TN'), renombrado), ESTADOS_EDICION.HECHO)
  // La nota no está pendiente de nada.
  assert.equal(estadoEdicion(ed('nota', 'pedir en diciembre'), INVS), ESTADOS_EDICION.NOTA)
})

test('al juntar las de todos, gana la más reciente', () => {
  const j = juntarEdiciones([
    { ...ed('costo', 50), quien: 'bodega', cuando: '2026-11-18T00:00:00Z' },
    { ...ed('costo', 55), quien: 'admin', cuando: '2026-11-19T00:00:00Z' },
  ])
  assert.equal(j['costo|I13T'].valor, 55)
  assert.equal(porCodigo(j).get('I13T').length, 1)
})

test('el formulario manda sólo lo que cambió; vaciar es quitar', () => {
  const actual = { nota: 'vieja', costo: 55 }
  assert.deepEqual(cambiosDelFormulario(actual, { nota: 'vieja', costo: '55.00', nombre: '' }), [])
  assert.deepEqual(cambiosDelFormulario(actual, { nota: '', costo: '$58', 'precio@leon': '240' }), [
    { tipo: 'nota', valor: null },
    { tipo: 'costo', valor: '$58' },
    { tipo: 'precio', plaza: 'leon', valor: '240' },
  ])
})

test('cada Excel trae la nota y lo que falta en Eleventa, al lado del modelo', () => {
  const j = juntarEdiciones([ed('nota', 'pedir en diciembre'), ed('costo', 58), ed('precio', 250, { plaza: 'leon' })])
  const marcas = marcasDe(porCodigo(j), INVS, p => (p === 'leon' ? 'León' : p))
  const m = marcas('i13t')
  assert.equal(m.nota, 'pedir en diciembre')
  assert.match(m.cambios, /Costo \(bodega\): \$58\.00 \(pendiente en Eleventa\)/)
  assert.match(m.cambios, /Precio al público \(León\): \$250\.00 \(ya en Eleventa\)/)
  assert.deepEqual(marcas('OTRO'), { nota: '', cambios: '' })
  assert.deepEqual(columnasDeMarcas(null), [])
  assert.deepEqual(columnasDeMarcas(marcas).map(c => c.titulo), ['Nota', 'Cambios registrados'])
  assert.equal(columnasDeMarcas(marcas)[0].valor({ codigo: 'I13T' }), 'pedir en diciembre')
})

test('el reporte general: lo pendiente primero, las notas aparte y la bitácora de lo más nuevo a lo más viejo', () => {
  const j = juntarEdiciones([ed('costo', 55), { ...ed('nombre', 'OTRO NOMBRE') }, ed('nota', 'x')])
  const h = hojasDeCambios({
    ediciones: j, inventarios: INVS,
    bitacora: [{ cuando: '2026-11-18T00:00:00Z', tipo: 'costo' }, { cuando: '2026-11-19T00:00:00Z', tipo: 'nota' }],
  })
  assert.deepEqual(h.pendientes.map(e => [e.tipo, e.estado]), [['nombre', 'pendiente'], ['costo', 'hecho']])
  assert.equal(h.notas.length, 1)
  assert.deepEqual(h.renglones.map(r => r.tipo), ['nota', 'costo'])
})

test('un monto se lee en pesos y un vacío como guion', () => {
  assert.equal(textoValor('costo', 55), '$55.00')
  assert.equal(textoValor('nombre', ''), '—')
  assert.equal(notaDe([]), '')
})
