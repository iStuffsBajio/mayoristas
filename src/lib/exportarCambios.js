// El reporte de TODO lo que se ha cambiado desde el panel.
//
// Lo pidió el dueño el 2026-11-19: bajaba un Excel, y cuando volvía a él ya no
// se acordaba de qué tenía que hacer. Este libro es la otra mitad: lo que se
// decidió en pantalla, con quién, cuándo y qué había antes, y lo que todavía
// falta hacer en Eleventa.
//
// Tres hojas, porque son tres preguntas distintas:
//   · «Pendiente en Eleventa»: lo que hay que ir a corregir en la caja.
//   · «Notas»: lo que se apuntó para no olvidarlo.
//   · «Bitácora»: todo lo que pasó, en orden.

import XLSX from 'xlsx-js-style'
import { hojaDeTabla, C } from './excelEstilo.js'
import { estadoEdicion, ESTADOS_EDICION, textoTipo, textoValor } from './ediciones.js'

const fecha = iso => (iso ? new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '')
const hora = iso => (iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '')

const textoAntesDespues = (tipo, v) => {
  if (v === null || v === undefined || v === '') return '—'
  if (tipo === 'baja') return v === 'dado-de-baja' ? 'dado de baja' : v === 'baja-definitiva' ? 'baja definitiva' : String(v)
  if (tipo === 'descontinuado') return 'descontinuado'
  return textoValor(tipo, v)
}

/** Las filas de cada hoja. Aparte del Excel para poder probarlas. */
export function hojasDeCambios({ ediciones, bitacora, inventarios, nombrePlaza = p => p }) {
  const todas = Object.values(ediciones ?? {})
  const pendientes = todas
    .filter(e => e.tipo !== 'nota')
    .map(e => ({ ...e, estado: estadoEdicion(e, inventarios) }))
    .sort((a, b) => (a.estado === b.estado ? String(a.codigo).localeCompare(String(b.codigo)) : a.estado === ESTADOS_EDICION.PENDIENTE ? -1 : 1))
  const notas = todas.filter(e => e.tipo === 'nota').sort((a, b) => String(b.cuando).localeCompare(String(a.cuando)))
  const renglones = [...(bitacora ?? [])].sort((a, b) => String(b.cuando).localeCompare(String(a.cuando)))
  return { pendientes, notas, renglones, nombrePlaza }
}

export function descargarCambios({ ediciones, bitacora, inventarios, nombrePlaza = p => p }) {
  const h = hojasDeCambios({ ediciones, bitacora, inventarios, nombrePlaza })
  const libro = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(libro, hojaDeTabla([
    { titulo: 'Código', valor: e => e.codigo },
    { titulo: 'Modelo', valor: e => e.producto ?? '' },
    { titulo: 'Qué corregir', valor: e => textoTipo(e.tipo, e.plaza, nombrePlaza) },
    { titulo: 'Debe quedar', valor: e => textoValor(e.tipo, e.valor) },
    { titulo: 'Estado', valor: e => (e.estado === ESTADOS_EDICION.HECHO ? 'Ya está en Eleventa' : 'Pendiente en Eleventa'),
      color: e => (e.estado === ESTADOS_EDICION.HECHO ? C.verde : C.ambar), fuerte: true },
    { titulo: 'Quién', valor: e => e.quien ?? '' },
    { titulo: 'Fecha', valor: e => fecha(e.cuando) },
  ], h.pendientes), 'Pendiente en Eleventa')

  XLSX.utils.book_append_sheet(libro, hojaDeTabla([
    { titulo: 'Código', valor: e => e.codigo },
    { titulo: 'Modelo', valor: e => e.producto ?? '' },
    { titulo: 'Nota', valor: e => e.valor, ancho: 60 },
    { titulo: 'Quién', valor: e => e.quien ?? '' },
    { titulo: 'Fecha', valor: e => fecha(e.cuando) },
  ], h.notas), 'Notas')

  XLSX.utils.book_append_sheet(libro, hojaDeTabla([
    { titulo: 'Fecha', valor: r => fecha(r.cuando) },
    { titulo: 'Hora', valor: r => hora(r.cuando) },
    { titulo: 'Quién', valor: r => r.quien ?? '' },
    { titulo: 'Código', valor: r => r.codigo },
    { titulo: 'Modelo', valor: r => r.producto ?? '' },
    { titulo: 'Qué se cambió', valor: r => textoTipo(r.tipo, r.plaza, nombrePlaza) },
    { titulo: 'Antes', valor: r => textoAntesDespues(r.tipo, r.antes) },
    { titulo: 'Después', valor: r => textoAntesDespues(r.tipo, r.despues), fuerte: true },
    { titulo: 'Desde', valor: r => r.pantalla ?? '' },
    { titulo: 'Por qué', valor: r => r.nota ?? '', ancho: 40 },
  ], h.renglones), 'Bitácora')

  const hoy = new Date()
  const dia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  XLSX.writeFile(libro, `cambios-del-panel-${dia}.xlsx`)
}
