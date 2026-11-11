// Pruebas del ciclo de vida de una incidencia.
//
// Lo que fijan es lo que el dueño pidio: que un caso contestado no vuelva a
// salir como nuevo, que se cierre SOLO cuando el respaldo deje de producirlo,
// y que un lote con otro contenido no herede la respuesta del anterior.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESTADOS, GRAVEDADES, GRAVEDAD_POR_PASO,
  huellaDe, estadoDe, gravedadDe, vencida, conciliar, ordenar, resumir,
} from './incidencias.js'

const HOY = new Date('2026-11-07T12:00:00Z')
const ayer = n => new Date(HOY.getTime() - n * 86400000).toISOString()

const hallazgo = (id, extra = {}) => ({ id, paso: 'decidir', ...extra })
const lote = (clase, codigos) => ({ id: `lote|${clase}`, paso: 'borrar', codigos })

test('LA HUELLA DEL LOTE incluye sus codigos, y esto arregla un fallo real', () => {
  // Un lote se identificaba solo por su clase. Si pasaba de 30 codigos a
  // otros 12 distintos, HEREDABA la respuesta vieja y entraba a la cola ya
  // marcado como hecho: desaparecia sin que nadie lo mirara. Eso no es un
  // duplicado, es lo contrario, y no se nota.
  const a = huellaDe(lote('sin-existencia', ['A', 'B', 'C']))
  const b = huellaDe(lote('sin-existencia', ['X', 'Y']))
  assert.notEqual(a, b)
  // El mismo contenido en otro orden es el MISMO lote.
  assert.equal(a, huellaDe(lote('sin-existencia', ['C', 'a', 'B'])))
})

test('las otras tres huellas ya eran estables y no se tocan', () => {
  assert.equal(huellaDe(hallazgo('cod|I13T')), 'cod|I13T')
  assert.equal(huellaDe(hallazgo('nom|I13T')), 'nom|I13T')
  assert.equal(huellaDe(hallazgo('pat|GALAXY>SAMSUNG')), 'pat|GALAXY>SAMSUNG')
})

test('sin registro y detectada hoy: es NUEVA', () => {
  assert.equal(estadoDe({ registro: null, sigueVivo: true, hoy: HOY }).estado, ESTADOS.NUEVA)
})

test('sin registro y ya no se detecta: no es nada, no se inventa una cerrada', () => {
  // Se arreglo solo o nunca importo. Fabricar una incidencia cerrada llenaria
  // el historial de casos que nadie abrio.
  assert.equal(estadoDe({ registro: null, sigueVivo: false, hoy: HOY }), null)
})

test('EL RESPALDO MANDA: si deja de detectarse, se cierra sola', () => {
  // Es la verificacion automatica, y no la hace una persona. Da igual en que
  // estado estuviera.
  for (const e of [ESTADOS.NUEVA, ESTADOS.REVISANDO, ESTADOS.EN_ORIGEN]) {
    const r = estadoDe({ registro: { estado: e, fecha: ayer(3) }, sigueVivo: false, hoy: HOY })
    assert.equal(r.estado, ESTADOS.CERRADA, `desde ${e}`)
    assert.equal(r.verificada, true)
  }
})

test('contestada y el respaldo la sigue produciendo: PENDIENTE EN SUCURSAL', () => {
  // Esta es la queja original: el caso volvia a salir como si fuera nuevo.
  const r = estadoDe({ registro: { estado: ESTADOS.EN_ORIGEN, fecha: ayer(4) }, sigueVivo: true, hoy: HOY })
  assert.equal(r.estado, ESTADOS.EN_ORIGEN)
  assert.equal(r.dias, 4)
})

test('dada por cerrada y vuelve a aparecer: CONFLICTO', () => {
  const r = estadoDe({ registro: { estado: ESTADOS.CERRADA, fecha: ayer(10) }, sigueVivo: true, hoy: HOY })
  assert.equal(r.estado, ESTADOS.CONFLICTO)
})

test('la gravedad elegida manda sobre la del paso', () => {
  assert.equal(gravedadDe({ paso: 'vivo' }, null), 'critica', 'por defecto, la del paso')
  assert.equal(gravedadDe({ paso: 'nombre' }, null), 'baja')
  assert.equal(gravedadDe({ paso: 'vivo' }, { gravedad: 'baja' }), 'baja', 'lo elegido manda')
  assert.equal(gravedadDe({ paso: 'vivo' }, { gravedad: 'inventada' }), 'critica', 'una gravedad que no existe no cuenta')
  assert.equal(gravedadDe({ paso: 'no-existe' }, null), 'media')
})

test('el plazo solo corre para lo que sigue abierto', () => {
  const base = { gravedad: 'critica', registro: { fecha: ayer(5) } }
  assert.equal(vencida({ ...base, estado: ESTADOS.NUEVA }, HOY), true)
  assert.equal(vencida({ ...base, estado: ESTADOS.CERRADA }, HOY), false,
    'una cerrada fuera de plazo ya no se puede atender: marcarla seria ruido')
  assert.equal(vencida({ ...base, estado: ESTADOS.DESCARTADA }, HOY), false)
  assert.equal(vencida({ gravedad: 'baja', estado: ESTADOS.NUEVA, registro: { fecha: ayer(90) } }, HOY), false,
    'la baja no tiene plazo')
})

test('conciliar: lo guardado que ya no se detecta sale como cerrado', () => {
  const inc = conciliar({
    hallazgos: [hallazgo('cod|A')],
    registros: {
      'cod|A': { estado: ESTADOS.EN_ORIGEN, fecha: ayer(2) },
      'cod|B': { estado: ESTADOS.EN_ORIGEN, fecha: ayer(9) },
    },
    hoy: HOY,
  })
  const por = Object.fromEntries(inc.map(i => [i.huella, i.estado]))
  assert.equal(por['cod|A'], ESTADOS.EN_ORIGEN, 'sigue viva')
  assert.equal(por['cod|B'], ESTADOS.CERRADA, 'ya no se detecta: verificada sola')
  assert.equal(inc.find(i => i.huella === 'cod|B').hallazgo, null)
})

test('el orden pone delante lo vencido, luego lo que nadie ha mirado', () => {
  const inc = conciliar({
    hallazgos: [
      hallazgo('cod|TRANQUILA', { paso: 'nombre' }),
      hallazgo('cod|URGENTE', { paso: 'vivo' }),
      hallazgo('cod|VIEJA', { paso: 'vivo' }),
    ],
    registros: { 'cod|VIEJA': { estado: ESTADOS.REVISANDO, fecha: ayer(6) } },
    hoy: HOY,
  })
  const orden = ordenar(inc).map(i => i.huella)
  assert.equal(orden[0], 'cod|VIEJA', 'critica, en revision y pasada de plazo')
  assert.equal(orden[1], 'cod|URGENTE', 'nueva y critica')
  assert.equal(orden[2], 'cod|TRANQUILA')
})

test('el resumen separa lo abierto de lo cerrado y mide la antiguedad', () => {
  const r = resumir(conciliar({
    hallazgos: [hallazgo('cod|A'), hallazgo('cod|B'), hallazgo('cod|C')],
    registros: {
      'cod|B': { estado: ESTADOS.EN_ORIGEN, fecha: ayer(9) },
      'cod|C': { estado: ESTADOS.DESCARTADA, fecha: ayer(1) },
      'cod|YA': { estado: ESTADOS.EN_ORIGEN, fecha: ayer(1) },
    },
    hoy: HOY,
  }), HOY)
  assert.equal(r.nuevas, 1)
  assert.equal(r.enOrigen, 1)
  assert.equal(r.descartadas, 1)
  assert.equal(r.cerradas, 1)
  assert.equal(r.abiertas, 2, 'descartada y cerrada no estan abiertas')
  assert.equal(r.viejas, 1, 'la de 9 dias')
  assert.equal(r.cerradasEstaSemana, 1)
})

test('las gravedades tienen plazo salvo la baja', () => {
  assert.equal(GRAVEDADES.critica.horas, 24)
  assert.equal(GRAVEDADES.alta.horas, 48)
  assert.equal(GRAVEDADES.baja.horas, null)
  assert.equal(GRAVEDAD_POR_PASO.vivo, 'critica')
})
