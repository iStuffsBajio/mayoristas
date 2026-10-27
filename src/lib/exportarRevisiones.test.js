import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx-js-style'
import { libroDeRevisiones } from './exportarRevisiones.js'

const caso = (id, extra = {}) => ({
  id, bloque: 'nombre', peso: 240, plazas: ['bodega'],
  titulo: 'El mismo producto se escribe de dos formas',
  contexto: ['Leon escribe SAMSUNG', 'Bodega escribe GALAXY en 192 productos'],
  pregunta: '¿El nombre bueno es «SAMSUNG»?',
  siHacer: 'Cambiar «GALAXY» por «SAMSUNG» en Bodega: 192 productos.',
  noHacer: 'Entonces el nombre bueno es otro.',
  tabla: { cabeceras: ['Plaza', 'a', 'b'], filas: [['Bodega', '192', '0']] },
  ...extra,
})

const cola = [
  caso('pat|GALAXY>SAMSUNG'),
  caso('cod|HX7CT', { bloque: 'codigo', titulo: 'Descontinuado', peso: 100, plazas: ['leon', 'ferias'],
                      siHacer: 'Borrar HX7CT en Leon y Ferias.' }),
  caso('nom|X1', { plazas: ['san-luis'] }),
]

const marcas = {
  'pat|GALAXY>SAMSUNG': { estado: 'si', nota: 'lo ve Brenda', fecha: '2026-10-26T10:00:00Z', por: 'leon' },
  'cod|HX7CT':          { estado: 'no', nota: 'lo sigue pidiendo un cliente', fecha: '2026-10-25T10:00:00Z', por: 'admin' },
}

/** Las columnas se buscan por su titulo: cambiar el orden no debe romper esto. */
const tabla = (libro, hoja) => {
  const filas = XLSX.utils.sheet_to_json(libro.Sheets[hoja], { header: 1 })
  const cab = filas[0]
  return filas.slice(1).map(f => Object.fromEntries(cab.map((c, i) => [c, f[i]])))
}

test('el libro lleva las cuatro hojas', () => {
  assert.deepEqual(libroDeRevisiones(cola, marcas).SheetNames,
    ['Resumen', 'Por plaza', 'Por tipo', 'Casos'])
})

test('los casos SIN contestar tambien salen', () => {
  // Un analisis que solo mire lo contestado mide las ganas de quien contesta,
  // no el catalogo.
  const filas = tabla(libroDeRevisiones(cola, marcas), 'Casos')
  assert.equal(filas.length, cola.length)
  assert.deepEqual(filas.map(f => f.Respuesta).sort(), ['No', 'Sin contestar', 'Sí'])
})

test('la columna «Que hacer» es la lista de tareas', () => {
  // En el «si» es la propuesta aceptada; en el «no», la explicacion que quien
  // contesto tuvo que escribir para poder guardarlo.
  const filas = tabla(libroDeRevisiones(cola, marcas), 'Casos')
  const porCaso = Object.fromEntries(filas.map(f => [f.Caso, f['Qué hacer']]))
  assert.match(porCaso['pat|GALAXY>SAMSUNG'], /Cambiar «GALAXY»/)
  assert.equal(porCaso['cod|HX7CT'], 'lo sigue pidiendo un cliente')
  assert.equal(porCaso['nom|X1'], '')
})

test('lleva la pregunta que se contesto, no solo la respuesta', () => {
  // Un «si» suelto no se puede analizar seis meses despues.
  const filas = tabla(libroDeRevisiones(cola, marcas), 'Casos')
  for (const f of filas) assert.ok(f.Pregunta?.length > 10, `sin pregunta: ${f.Caso}`)
})

test('dice quien contesto cada caso', () => {
  const filas = tabla(libroDeRevisiones(cola, marcas), 'Casos')
  const quien = Object.fromEntries(filas.map(f => [f.Caso, f['Quién']]))
  assert.equal(quien['pat|GALAXY>SAMSUNG'], 'León')
  assert.equal(quien['cod|HX7CT'], 'Administración')
})

test('la hoja por plaza reparte un caso entre todas las suyas', () => {
  // El HX7CT toca a Leon y a Ferias: cuenta en las dos, porque la pregunta es
  // en cual se concentran.
  const filas = tabla(libroDeRevisiones(cola, marcas), 'Por plaza')
  const casos = Object.fromEntries(filas.map(f => [f.Plaza, f.Casos]))
  assert.equal(casos['León'], 1)
  assert.equal(casos['Ferias'], 1)
  assert.equal(casos['San Luis Potosí'], 1)
})

test('el resumen por plaza separa el si del no', () => {
  const filas = tabla(libroDeRevisiones(cola, marcas), 'Por plaza')
  const bodega = filas.find(f => f.Plaza === 'Bodega')
  assert.equal(bodega['Sí'], 1)
  assert.equal(bodega.No, 0)
  const leon = filas.find(f => f.Plaza === 'León')
  assert.equal(leon.No, 1)
})

test('las marcas viejas se leen como si y no', () => {
  // La primera version las llamaba «pendiente» e «ignorado».
  const filas = tabla(libroDeRevisiones(cola, {
    'pat|GALAXY>SAMSUNG': { estado: 'pendiente', fecha: '2026-10-26T10:00:00Z' },
    'cod|HX7CT':          { estado: 'ignorado',  nota: 'no es error', fecha: '2026-10-26T10:00:00Z' },
  }), 'Casos')
  const r = Object.fromEntries(filas.map(f => [f.Caso, f.Respuesta]))
  assert.equal(r['pat|GALAXY>SAMSUNG'], 'Sí')
  assert.equal(r['cod|HX7CT'], 'No')
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
    for (const [ref, c] of Object.entries(l.Sheets[n])) {
      if (ref.startsWith('!')) continue
      const donde = `${n}!${ref}`
      assert.ok(c.v !== undefined && c.v !== null, `${donde} vacia`)
      assert.ok(!(typeof c.v === 'number' && Number.isNaN(c.v)), `${donde} es NaN`)
      assert.ok(!/^(NaN|undefined)$/.test(String(c.v)), `${donde} dice ${c.v}`)
    }
  }
  const buf = XLSX.write(l, { type: 'buffer', bookType: 'xlsx' })
  assert.equal(buf.slice(0, 2).toString(), 'PK')
  assert.ok(buf.length > 2000)
})

test('cada hoja declara un rango valido', () => {
  const l = libroDeRevisiones(cola, marcas)
  for (const n of l.SheetNames) {
    assert.match(l.Sheets[n]['!ref'] ?? '', /^[A-Z]+\d+:[A-Z]+\d+$/, `hoja ${n} sin rango`)
  }
})
