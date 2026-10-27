import test from 'node:test'
import assert from 'node:assert/strict'
import { MOTIVO } from './anomalias.js'
import { fichaDeCodigo, fichaDeMuertos, fichaDePatron, fichaDeNombre } from './fichas.js'

const huerfano = (motivo, extra = {}) => ({
  codigo: 'R165GT', producto: 'REALME 16 5G TPU CASE',
  plazas: { 'san-luis': 3, aguascalientes: 3, ferias: 5 },
  piezas: 11, ultimo: '2026-08-19', diasSinMover: 68, motivo,
  cubiertoPor: { codigo: 'R16T', producto: 'REALME 16 5G TPU CASE' },
  ...extra,
})

const patron = {
  id: 'pat|GALAXY>SAMSUNG', a: 'GALAXY', b: 'SAMSUNG', gana: 'SAMSUNG', pierde: 'GALAXY',
  falta: false, alcance: 'catalogo', codigos: ['A', 'B', 'C'], corrigen: ['bodega'], renglones: 192,
  filas: [
    { slug: 'bodega', a: 192, b: 0, total: 192, sin: 0 },
    { slug: 'leon', a: 15, b: 173, total: 188, sin: 0 },
  ],
}

const TODAS = () => [
  fichaDeCodigo(huerfano(MOTIVO.DUPLICADO)),
  fichaDeCodigo(huerfano(MOTIVO.SIN_ALTA, { cubiertoPor: null })),
  fichaDeCodigo(huerfano(MOTIVO.DESCONTINUADO, { cubiertoPor: null })),
  fichaDeCodigo(huerfano(MOTIVO.DESCONTINUADO, { cubiertoPor: null, piezas: 0, plazas: {} })),
  fichaDeMuertos([
    { codigo: 'A', producto: 'UNO', plazas: { leon: 0 } },
    { codigo: 'B', producto: 'DOS', plazas: { leon: 0 } },
    { codigo: 'C', producto: 'TRES', plazas: { ferias: 0 } },
  ]),
  fichaDePatron(patron),
  fichaDePatron({ ...patron, falta: true, a: null, b: 'CASE', gana: 'CASE', pierde: null, alcance: 'codigos' }),
  fichaDeNombre({
    codigo: 'GP10PXLT', fuente: 'conflicto', referencia: null,
    fuera: [{ slug: 'bodega', nombre: 'GOOGLE PIXEL 10 PRO XL TPU' },
            { slug: 'leon', nombre: 'GOOGLE PIXEL 10 PRO XL TPU CASE' }],
  }),
  fichaDeNombre({
    codigo: 'HN13T', fuente: 'bodega+leon', referencia: 'HUAWEI NOVA 13 PRO TPU CASE',
    severidad: 'media', fuera: [{ slug: 'ferias', nombre: 'HUAWEI NOVA 13 TPU CASE' }],
  }),
]

test('ninguna ficha puede existir sin su pregunta', () => {
  // Una ficha nueva sin pregunta pintaria la seccion vacia y no fallaria nada.
  for (const f of TODAS()) {
    for (const campo of ['id', 'bloque', 'titulo', 'pregunta', 'siHacer', 'noHacer', 'noPide']) {
      assert.ok(String(f[campo] ?? '').trim(), `${f.id}: falta ${campo}`)
    }
    assert.ok(Array.isArray(f.contexto) && f.contexto.length >= 2, `${f.id}: sin contexto`)
    assert.ok(Array.isArray(f.plazas), `${f.id}: sin plazas`)
  }
})

test('la pregunta se contesta con si o no, no con «depende»', () => {
  for (const f of TODAS()) {
    assert.match(f.pregunta, /^¿/, `${f.id}: no es una pregunta`)
    assert.match(f.pregunta, /\?$/, `${f.id}: no es una pregunta`)
    // Una pregunta abierta no se puede contestar con un boton.
    assert.ok(!/^¿(qué|cuál|cómo|por qué|cuándo|quién)/i.test(f.pregunta),
      `${f.id}: es abierta -> ${f.pregunta}`)
  }
})

test('el SI es siempre aplicar la propuesta, no deshacerla', () => {
  // Si el «si» dijera «no hacer nada», la respuesta no se podria convertir en
  // una instruccion y el reporte no serviria de lista de tareas.
  for (const f of TODAS()) {
    assert.match(f.siHacer, /^(Cambiar|Borrar|Dar de alta|Corregir|Añadir|Vender|Dejar)/,
      `${f.id}: el si no manda hacer nada -> ${f.siHacer}`)
  }
})

test('el caso del codigo repetido nombra los dos codigos', () => {
  const f = fichaDeCodigo(huerfano(MOTIVO.DUPLICADO))
  assert.match(f.pregunta, /R165GT/)
  assert.match(f.pregunta, /R16T/)
  assert.match(f.siHacer, /Cambiar R165GT por R16T/)
  // Y el «no» pide justo lo que hace falta para no volver a proponerlo.
  assert.match(f.noPide, /diferencian/)
})

test('el descontinuado pregunta distinto si quedan piezas', () => {
  const con = fichaDeCodigo(huerfano(MOTIVO.DESCONTINUADO, { cubiertoPor: null }))
  const sin = fichaDeCodigo(huerfano(MOTIVO.DESCONTINUADO, { cubiertoPor: null, piezas: 0, plazas: {} }))
  assert.match(con.pregunta, /se agoten/)
  assert.match(sin.pregunta, /elimina/)
})

test('el patron cuenta los productos de quien tiene que corregir', () => {
  const f = fichaDePatron(patron)
  assert.match(f.siHacer, /192 productos/)   // los de bodega, no los de todas
  assert.match(f.siHacer, /Bodega 192/)      // y dice en cual estan
  assert.equal(f.plazas[0], 'bodega')
})
