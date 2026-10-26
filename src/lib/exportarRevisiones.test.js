import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx-js-style'
import { libroDeRevisiones } from './exportarRevisiones.js'

const caso = (id, extra = {}) => ({
  id, bloque: 'nombre', titulo: 'Bodega escribe GALAXY', veredicto: 'Es una costumbre de plaza.',
  accion: 'Unificar en SAMSUNG', peso: 240, plazas: ['bodega'],
  tabla: { cabeceras: ['Plaza', 'a', 'b'], filas: [['Bodega', '192', '0']] },
  ...extra,
})

const cola = [
  caso('pat|GALAXY>SAMSUNG'),
  caso('cod|HX7CT', { bloque: 'codigo', titulo: 'Descontinuado', peso: 100, plazas: ['leon', 'ferias'] }),
  caso('nom|X1', { plazas: ['san-luis'] }),
]

const marcas = {
  'pat|GALAXY>SAMSUNG': { estado: 'pendiente', nota: 'lo ve Brenda', fecha: '2026-10-26T10:00:00Z', por: 'leon' },
  'cod|HX7CT':          { estado: 'ignorado',  nota: '', fecha: '2026-10-25T10:00:00Z', por: 'admin' },
}

const hojas = libro => Object.fromEntries(
  libro.SheetNames.map(n => [n, XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1 })]))

test('el libro lleva las cuatro hojas', () => {
  const l = libroDeRevisiones(cola, marcas)
  assert.deepEqual(l.SheetNames, ['Resumen', 'Por plaza', 'Por tipo', 'Casos'])
})

test('los casos SIN contestar tambien salen', () => {
  // Un analisis que solo mire lo contestado mide las ganas de quien contesta,
  // no el catalogo.
  const filas = hojas(libroDeRevisiones(cola, marcas)).Casos
  assert.equal(filas.length, 1 + cola.length)
  const estados = filas.slice(1).map(f => f[7])
  assert.deepEqual(estados.sort(), ['En corrección', 'No es error', 'Sin contestar'])
})

test('dice quien contesto cada caso', () => {
  const filas = hojas(libroDeRevisiones(cola, marcas)).Casos.slice(1)
  const quien = Object.fromEntries(filas.map(f => [f[0], f[8]]))
  assert.equal(quien['pat|GALAXY>SAMSUNG'], 'León')
  assert.equal(quien['cod|HX7CT'], 'Administración')
})

test('la hoja por plaza reparte un caso entre todas las suyas', () => {
  // El codigo del HX7CT toca a Leon y a Ferias: tiene que contar en las dos,
  // porque la pregunta es en cual se concentran.
  const filas = hojas(libroDeRevisiones(cola, marcas))['Por plaza'].slice(1)
  const porPlaza = Object.fromEntries(filas.map(f => [f[0], f[1]]))
  assert.equal(porPlaza['León'], 1)
  assert.equal(porPlaza['Ferias'], 1)
  assert.equal(porPlaza['San Luis Potosí'], 1)
})

test('sin casos no hay libro', () => {
  assert.equal(libroDeRevisiones([], {}), null)
  assert.equal(libroDeRevisiones(null, null), null)
})

test('ninguna celda sale NaN ni undefined', () => {
  // Un libro corrupto se abre sin quejarse con la misma libreria que lo
  // escribio, asi que no vale con que no reviente: hay que mirar las celdas.
  const l = libroDeRevisiones(cola, marcas)
  for (const n of l.SheetNames) {
    const hoja = l.Sheets[n]
    for (const [ref, c] of Object.entries(hoja)) {
      if (ref.startsWith('!')) continue
      const donde = `${n}!${ref}`
      assert.ok(c.v !== undefined && c.v !== null, `${donde} vacia`)
      assert.ok(!(typeof c.v === 'number' && Number.isNaN(c.v)), `${donde} es NaN`)
      assert.ok(!/^(NaN|undefined)$/.test(String(c.v)), `${donde} dice ${c.v}`)
    }
  }
  // Y que el .xlsx se escriba de verdad, no solo que se arme en memoria.
  const buf = XLSX.write(l, { type: 'buffer', bookType: 'xlsx' })
  assert.ok(buf.length > 2000)
  assert.equal(buf.slice(0, 2).toString(), 'PK')
})

test('cada hoja declara un rango valido', () => {
  const l = libroDeRevisiones(cola, marcas)
  for (const n of l.SheetNames) {
    assert.match(l.Sheets[n]['!ref'] ?? '', /^[A-Z]+\d+:[A-Z]+\d+$/, `hoja ${n} sin rango`)
  }
})
