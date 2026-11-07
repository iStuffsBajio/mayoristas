import { test } from 'node:test'
import assert from 'node:assert/strict'
import { libroDeBajas } from './exportarBajas.js'
import { nuevoAjuste, juntarAjustes } from './ajustes.js'

const HOY = new Date('2026-11-07T12:00:00Z')
const inv = (...codigos) => ({ productos: codigos.map(c => ({ Codigo: c, Existencia: 1 })) })
const ajuste = (codigo, extra = {}) => nuevoAjuste({
  codigo, motivo: 'dado-de-baja', quien: 'admin', producto: 'FUNDA ' + codigo,
  cuando: new Date('2026-11-01T12:00:00Z'), ...extra,
})

test('una hoja por plaza, con lo que le toca borrar a cada una', () => {
  // El trabajo es de cada tienda: borrar un codigo en Leon no borra nada en
  // San Luis. Una lista general obliga a buscarse entre los renglones ajenos.
  const inventarios = { leon: inv('A', 'B'), 'san-luis': inv('B') }
  const ajustes = juntarAjustes({ admin: [ajuste('A'), ajuste('B')] })
  const { libro } = libroDeBajas(ajustes, inventarios, { hoy: HOY })
  assert.deepEqual(libro.SheetNames.sort(), ['León', 'San Luis Potosí'])
})

test('lo que YA se borro no sale: se resolvio solo', () => {
  // El estado no lo marca nadie, lo decide el respaldo. Si el codigo ya no
  // esta en ninguna plaza, no hay nada que llevar a la caja.
  const ajustes = juntarAjustes({ admin: [ajuste('YA-NO-ESTA')] })
  assert.equal(libroDeBajas(ajustes, { leon: inv('OTRO') }, { hoy: HOY }), null)
})

test('sin nada pendiente NO se genera un libro vacio', () => {
  // Un libro vacio se lee como «no se pudo», no como «esta todo hecho».
  assert.equal(libroDeBajas({}, { leon: inv('X') }, { hoy: HOY }), null)
  assert.equal(libroDeBajas(null, null, { hoy: HOY }), null)
})

test('la hoja explica que la pagina NO puede borrarlo', () => {
  // Sin eso, quien reciba el Excel puede pensar que es un informe de algo ya
  // hecho, y nadie va a la caja.
  const ajustes = juntarAjustes({ admin: [ajuste('A')] })
  const { libro } = libroDeBajas(ajustes, { leon: inv('A') }, { hoy: HOY })
  const hoja = libro.Sheets['León']
  const texto = Object.values(hoja).map(c => c?.v).filter(v => typeof v === 'string').join(' ')
  assert.match(texto, /hay que borrarlos en la caja/)
  assert.match(texto, /desaparece de esta lista sin que nadie marque nada/)
})

test('lo mas viejo primero, que es lo que lleva mas tiempo sin hacerse', () => {
  const ajustes = juntarAjustes({ admin: [
    ajuste('NUEVO', { cuando: new Date('2026-11-06T12:00:00Z') }),
    ajuste('VIEJO', { cuando: new Date('2026-10-01T12:00:00Z') }),
  ] })
  const { libro } = libroDeBajas(ajustes, { leon: inv('NUEVO', 'VIEJO') }, { hoy: HOY })
  const hoja = libro.Sheets['León']
  assert.equal(hoja.A2.v, 'VIEJO')
  assert.equal(hoja.A3.v, 'NUEVO')
})

test('el rango de la hoja sale sano con la nota puesta', () => {
  // `celda()` tiene que extender el rango; si no, Excel pide reparar.
  const ajustes = juntarAjustes({ admin: [ajuste('A')] })
  const { libro, archivo } = libroDeBajas(ajustes, { leon: inv('A') }, { hoy: HOY })
  const ref = libro.Sheets['León']['!ref']
  assert.ok(/^[A-Z]+\d+:[A-Z]+\d+$/.test(ref), `rango raro: ${ref}`)
  assert.equal(archivo, 'bajas-pendientes-2026-11-07.xlsx')
})
