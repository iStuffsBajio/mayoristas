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
                      siHacer: 'Borrar HX7CT en Leon y Ferias.',
                      codigos: [{ codigo: 'HX7CT', producto: 'HONOR X7 TPU CASE', piezas: 4,
                                  plazas: { leon: 3, ferias: 1 }, ultimaVenta: '2025-04-02' }] }),
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
    ['Resumen', 'Por plaza', 'Por tipo', 'Casos', 'Códigos'])
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

test('la hoja de codigos reparte el lote en un renglon por codigo', () => {
  // La pregunta se contesta una vez; el trabajo se hace codigo a codigo.
  const lote = caso('lote|varias-plazas', {
    bloque: 'codigo', titulo: '3 modelos que bodega descontinuo', peso: 9,
    plazas: ['leon', 'ferias'], siHacer: 'Vender lo que quede de los 3 codigos y darlos de baja.',
    codigos: [
      { codigo: 'A1', producto: 'UNO TPU CASE', piezas: 5, plazas: { leon: 5 }, ultimaVenta: '2024-03-04' },
      { codigo: 'A2', producto: 'DOS TPU CASE', piezas: 3, plazas: { ferias: 3 }, ultimaVenta: null },
      { codigo: 'A3', producto: 'TRES TPU CASE', piezas: 1, plazas: { leon: 1 }, ultimaVenta: '2023-01-01' },
    ],
  })
  const marca = { 'lote|varias-plazas': { estado: 'si', fecha: '2026-10-26T10:00:00Z', por: 'admin' } }
  const filas = tabla(libroDeRevisiones([lote], marca), 'Códigos')

  assert.deepEqual(filas.map(f => f['Código']), ['A1', 'A2', 'A3'])
  // Los tres heredan la respuesta y la instruccion del lote entero.
  for (const f of filas) {
    assert.equal(f.Respuesta, 'Sí')
    assert.match(f['Qué hacer'], /darlos de baja/)
    assert.equal(f.Caso, 'lote|varias-plazas')
  }
  assert.equal(filas[0]['Última venta'], '2024-03-04')
  assert.equal(filas[1]['Última venta'], '')   // sin venta conocida, no un cero
  assert.equal(filas[0].Plazas, 'León')
})

test('en «Casos» el lote sigue siendo UN renglon', () => {
  // Las dos hojas cuentan cosas distintas a proposito: una las preguntas,
  // otra el trabajo. Si el lote se duplicara en «Casos», el avance mentiria.
  const lote = caso('lote|tono', {
    bloque: 'codigo', plazas: ['leon'],
    codigos: [{ codigo: 'A1', producto: 'UNO', piezas: 1, plazas: { leon: 1 } },
              { codigo: 'A2', producto: 'DOS', piezas: 1, plazas: { leon: 1 } }],
  })
  const libro = libroDeRevisiones([lote], {})
  assert.equal(tabla(libro, 'Casos').length, 1)
  assert.equal(tabla(libro, 'Códigos').length, 2)
})

test('el libro sale en el orden de la cola, no en el de la deteccion', () => {
  // La hoja se reparte como lista de tareas: lo que se ejecuta sin pensar va
  // arriba. Ordenada por peso, la lista de borrar -que no tiene piezas- caia
  // al final de todo.
  const orden = [
    caso('lote|tono', { bloque: 'codigo', orden: 5, peso: 53, etiqueta: 'Se ignora' }),
    caso('lote|sin-existencia', { bloque: 'codigo', orden: 0, peso: 0, etiqueta: 'Se borra y se acabó' }),
    caso('cod|R165GT', { bloque: 'codigo', orden: 1, peso: 11, etiqueta: 'Se vende y bodega no lo tiene' }),
  ]
  const filas = tabla(libroDeRevisiones(orden, {}), 'Casos')
  assert.deepEqual(filas.map(f => f.Caso),
    ['lote|sin-existencia', 'cod|R165GT', 'lote|tono'])
  assert.equal(filas[0]['Qué toca'], 'Se borra y se acabó')
})

test('un codigo sin existencia dice igual en que plaza borrarlo', () => {
  // Es la lista que abre la hoja: treinta codigos que no tienen ni una pieza.
  // Con las plazas de existencia la columna salia vacia justo ahi, y entonces
  // la hoja no contestaba lo unico que se le pregunta: en donde lo borro.
  const lote = caso('lote|sin-existencia', {
    bloque: 'codigo', orden: 0, peso: 0, etiqueta: 'Se borra y se acabó',
    siHacer: 'Borrar los 2 códigos en cada plaza donde sigan dados de alta.',
    codigos: [
      { codigo: 'I7D', producto: 'IPHONE 7 DUO CASE', piezas: 0, plazas: {},
        altaEn: ['leon', 'ferias'] },
      { codigo: 'LG7', producto: 'LG G7 HARD CASE', piezas: 0, plazas: {}, altaEn: ['san-luis'] },
    ],
  })
  const filas = tabla(libroDeRevisiones([lote], {}), 'Códigos')
  assert.equal(filas[0].Plazas, 'León, Ferias')
  assert.equal(filas[1].Plazas, 'San Luis Potosí')
})

test('un patron no tiene codigo y no ensucia la hoja de codigos', () => {
  // Cambia una palabra en cientos de nombres: no es una tarea por codigo.
  const filas = tabla(libroDeRevisiones(cola, marcas), 'Códigos')
  assert.ok(!filas.some(f => f.Caso === 'pat|GALAXY>SAMSUNG'))
})
