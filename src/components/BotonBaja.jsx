import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  TIPOS_EDICION, PLAZAS_DE_PRECIO, estadoEdicion, ESTADOS_EDICION, textoTipo, textoValor,
  cambiosDelFormulario, notaDe,
} from '../lib/ediciones'
import { descargarCambios } from '../lib/exportarCambios'
import { nombreSucursal } from '../lib/sucursales'

const TINTA = '#0F1A1F'
const TINTA_SUAVE = '#4A5A63'
const TINTA_TENUE = '#8A9AA3'
const LINEA = '#E3EAED'
const AMBAR = '#B45309'
const AZUL = '#0A5B73'

/**
 * Las acciones sobre un modelo —el ✏️ y la ✕— junto a su código. Leen de
 * `ContextoBaja` (el valor de `useBajas`) qué hacer, para que una tabla con
 * muchos componentes intermedios no tenga que pasar funciones de mano en mano.
 * Sin contexto, o sin permiso, no pintan nada.
 */
export const ContextoBaja = createContext(null)

const limpio = c => String(c ?? '').trim().toUpperCase()

function BotonEditar({ fila }) {
  const b = useContext(ContextoBaja)
  if (!b?.puedeEditar || !fila?.codigo) return null
  const lista = b.edicionesPorCodigo?.get(limpio(fila.codigo)) ?? []
  const nota = notaDe(lista)
  const hay = lista.length > 0
  return (
    <button type="button"
            data-editar={fila.codigo}
            data-editado={hay ? '1' : undefined}
            onClick={() => b.abrirEditor(fila)}
            title={nota ? `Nota: ${nota}` : hay ? 'Tiene cambios registrados. Clic para verlos o editar.' : 'Editar: nota, nombre, código, costo o precio'}
            style={{
              marginInlineStart: 6, border: 'none', background: hay ? 'rgba(180,83,9,0.10)' : 'none',
              borderRadius: 6, cursor: 'pointer', fontSize: 11, padding: '0 3px',
              filter: hay ? 'none' : 'grayscale(1) opacity(0.55)',
            }}>
      {nota ? '📝' : '✏️'}
    </button>
  )
}

export function BotonBaja({ fila }) {
  const b = useContext(ContextoBaja)
  if (!fila?.codigo || !b) return null
  return (
    <>
      <BotonEditar fila={fila} />
      <Cruz fila={fila} />
    </>
  )
}

function Cruz({ fila }) {
  const b = useContext(ContextoBaja)
  if (!b?.puede) return null
  // Donde el renglón se QUEDA aunque esté dado de baja —Ventas: lo vendido es
  // un hecho y esconderlo haría mentir a lo facturado— se dice que lo está, y
  // se deja deshacer ahí mismo.
  if (b.ocultos?.has(limpio(fila.codigo))) {
    return (
      <span data-dado-de-baja={fila.codigo} style={{ marginInlineStart: 6, fontSize: 10, fontWeight: 700, color: AMBAR,
                     fontFamily: 'system-ui, sans-serif', whiteSpace: 'nowrap' }}>
        dado de baja ·{' '}
        <button type="button" data-quitar-baja={fila.codigo} onClick={() => b.deshacerBaja(fila.codigo)}
                style={{ border: 0, background: 'none', padding: 0, font: 'inherit', color: 'inherit',
                         textDecoration: 'underline', cursor: 'pointer' }}>
          deshacer
        </button>
      </span>
    )
  }
  const ocupado = b.bajando === fila.codigo
  return (
    <button type="button"
            data-baja={fila.codigo}
            disabled={ocupado}
            onClick={() => b.darDeBaja(fila)}
            title={`Dar de baja ${fila.codigo} en todas las plazas. Deja de contar en las listas y pasa a Revisar como pendiente de borrarlo en la caja.`}
            style={{
              marginInlineStart: 6, border: 'none', background: 'none',
              cursor: ocupado ? 'wait' : 'pointer',
              color: TINTA_TENUE, fontSize: 11, padding: '0 2px',
            }}>
      {ocupado ? '…' : '✕'}
    </button>
  )
}

/**
 * El aviso tras dar de baja o guardar, y la barra con el reporte de cambios.
 * Va arriba de las tablas de cada pantalla; el editor se abre desde aquí.
 */
export function AvisoBaja() {
  const b = useContext(ContextoBaja)
  if (!b) return null
  return (
    <>
      {b.aviso && (
        <p data-aviso-baja style={{ fontSize: 11.5, color: AZUL, background: 'rgba(2,136,173,0.07)',
                    border: '1px solid #BAE6FD', borderRadius: 12, padding: '8px 12px', margin: '0 0 10px',
                    display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200 }}>{b.aviso.texto}</span>
          {b.aviso.codigo && (
            <button type="button" data-deshacer-aviso-baja={b.aviso.codigo} onClick={() => b.deshacerBaja(b.aviso.codigo)}
                    style={{ border: 0, background: 'none', padding: 0, fontFamily: 'inherit', fontSize: 11.5,
                             fontWeight: 700, color: AZUL, textDecoration: 'underline', cursor: 'pointer' }}>
              Deshacer
            </button>
          )}
        </p>
      )}
      <BarraDeCambios />
      <EditorDeModelo />
    </>
  )
}

/** Cuántos cambios hay registrados, cuántos faltan en Eleventa, y el Excel. */
function BarraDeCambios() {
  const b = useContext(ContextoBaja)
  // Sin inventarios no se sabe qué ya quedó hecho: entonces no se cuenta.
  const pendientes = useMemo(() => (Object.keys(b?.inventarios ?? {}).length
    ? Object.values(b?.ediciones ?? {})
      .filter(e => e.tipo !== 'nota' && estadoEdicion(e, b.inventarios) === ESTADOS_EDICION.PENDIENTE).length
    : 0),
  [b?.ediciones, b?.inventarios])
  if (!b?.puedeEditar) return null
  const notas = Object.values(b.ediciones ?? {}).filter(e => e.tipo === 'nota').length
  return (
    <div data-barra-cambios style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 11.5,
                                     color: TINTA_SUAVE, margin: '0 0 10px' }}>
      <span>
        ✏️ Con el lápiz junto a cada código editas nota, nombre, código, costo o precio.
        {' '}<strong style={{ color: TINTA }}>{b.bitacora.length}</strong> {b.bitacora.length === 1 ? 'cambio registrado' : 'cambios registrados'}
        {pendientes > 0 && <> · <strong style={{ color: AMBAR }}>{pendientes}</strong> pendiente{pendientes === 1 ? '' : 's'} en Eleventa</>}
        {notas > 0 && <> · {notas} nota{notas === 1 ? '' : 's'}</>}
      </span>
      <button type="button" data-bajar-cambios
              onClick={() => descargarCambios({ ediciones: b.ediciones, bitacora: b.bitacora, inventarios: b.inventarios ?? {}, nombrePlaza: nombreSucursal })}
              style={{ border: '1px solid ' + LINEA, background: '#fff', borderRadius: 999, padding: '4px 12px',
                       fontSize: 11.5, fontWeight: 700, color: TINTA, cursor: 'pointer', fontFamily: 'inherit' }}>
        📋 Bajar todos los cambios
      </button>
    </div>
  )
}

const campo = {
  width: '100%', boxSizing: 'border-box', border: '1px solid ' + LINEA, borderRadius: 10, padding: '7px 10px',
  fontSize: 13, fontFamily: 'inherit', color: TINTA, background: '#fff',
}

const productoEn = (inv, codigo) => (inv?.productos ?? []).find(p => limpio(p.Codigo) === limpio(codigo))

/** La ficha de un modelo: lo que se puede editar, lo que dice Eleventa, y su historial. */
function EditorDeModelo() {
  const b = useContext(ContextoBaja)
  const fila = b?.editando
  const codigo = fila ? limpio(fila.codigo) : null
  const lista = useMemo(() => (codigo ? b.edicionesPorCodigo?.get(codigo) ?? [] : []), [b, codigo])

  // { 'nota' | 'nombre' | 'precio@leon' … → valor guardado }
  const actual = useMemo(() => {
    const m = {}
    for (const e of lista) m[e.plaza ? `${e.tipo}@${e.plaza}` : e.tipo] = e.valor ?? ''
    return m
  }, [lista])
  const [form, setForm] = useState({})
  const [porQue, setPorQue] = useState('')
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const primero = useRef(null)

  useEffect(() => {
    if (!fila) return
    setForm(Object.fromEntries(Object.entries(actual).map(([k, v]) => [k, String(v ?? '')])))
    setPorQue(''); setError(null)
    setTimeout(() => primero.current?.focus(), 0)
    const esc = e => { if (e.key === 'Escape') b.cerrarEditor() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fila])

  if (!fila || !b?.puedeEditar) return null

  const invs = b.inventarios ?? {}
  const enEleventa = {
    nombre: Object.values(invs).map(inv => productoEn(inv, codigo)?.Producto).find(Boolean) ?? fila.producto ?? '',
    costo: productoEn(invs.bodega, codigo)?.Costo,
  }
  const plazas = PLAZAS_DE_PRECIO.filter(p => !Object.keys(invs).length || invs[p] || actual[`precio@${p}`] || actual[`mayoreo@${p}`])
  const poner = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const valor = k => form[k] ?? ''
  const cambios = cambiosDelFormulario(actual, Object.fromEntries(
    Object.keys({ ...actual, ...form }).map(k => [k, form[k] ?? ''])))

  const guardar = async () => {
    if (!cambios.length) { setError('No cambiaste nada.'); return }
    setGuardando(true); setError(null)
    try {
      const n = await b.guardarEdicion(fila, cambios, porQue)
      b.setAviso({ texto: n
        ? `${codigo}: ${n} ${n === 1 ? 'cambio guardado' : 'cambios guardados'} y apuntados en la bitácora.`
        : `${codigo}: no había nada distinto que guardar.` })
      b.cerrarEditor()
    } catch (e) {
      setError(e?.mensaje || 'No se pudo guardar. Comprueba la sesión.')
    }
    setGuardando(false)
  }

  const historia = b.bitacora.filter(r => limpio(r.codigo) === codigo).slice(0, 12)
  const Etiqueta = ({ children, nota }) => (
    <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: TINTA_SUAVE, margin: '0 0 3px' }}>
      {children}{nota && <span style={{ fontWeight: 400, color: TINTA_TENUE }}> · {nota}</span>}
    </span>
  )
  const pendiente = tipo => lista.find(e => e.tipo === tipo && !e.plaza)

  return (
    <div role="dialog" aria-modal="true" aria-label={`Editar ${codigo}`} data-editor-modelo={codigo}
         onClick={e => { if (e.target === e.currentTarget) b.cerrarEditor() }}
         style={{ position: 'fixed', inset: 0, background: 'rgba(15,26,31,0.35)', zIndex: 1000,
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 12px', overflowY: 'auto' }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 600, padding: '18px 20px',
                    boxShadow: '0 20px 60px rgba(15,26,31,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: TINTA, flex: 1 }}>{fila.producto || codigo}</h3>
          <button type="button" onClick={b.cerrarEditor} aria-label="Cerrar"
                  style={{ border: 0, background: 'none', fontSize: 18, cursor: 'pointer', color: TINTA_TENUE }}>×</button>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 11.5, color: TINTA_TENUE }}>
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>{codigo}</span> · Nada de esto cambia Eleventa: queda
          registrado y, lo que haya que corregir en la caja, pendiente hasta que el respaldo lo traiga.
        </p>

        <label style={{ display: 'block', marginBottom: 10 }}>
          <Etiqueta nota="lo que hay que hacer, para no olvidarlo">Nota</Etiqueta>
          <textarea ref={primero} data-campo-edicion="nota" rows={2} value={valor('nota')} onChange={e => poner('nota', e.target.value)}
                    style={{ ...campo, resize: 'vertical' }} placeholder="Ej.: pedir en diciembre, revisar con la tienda…" />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 10 }}>
          {[
            ['nombre', 'Nombre correcto', enEleventa.nombre],
            ['codigo', 'Código correcto', codigo],
            ['costo', 'Costo (bodega)', enEleventa.costo != null ? textoValor('costo', enEleventa.costo) : 'sin costo'],
          ].map(([k, texto, hoy]) => {
            const e = pendiente(k)
            const st = e ? estadoEdicion(e, invs) : null
            return (
              <label key={k}>
                <Etiqueta nota={st === ESTADOS_EDICION.HECHO ? 'ya en Eleventa' : st === ESTADOS_EDICION.PENDIENTE ? 'pendiente en Eleventa' : null}>{texto}</Etiqueta>
                <input data-campo-edicion={k} value={valor(k)} onChange={ev => poner(k, ev.target.value)}
                       inputMode={k === 'costo' ? 'decimal' : undefined}
                       placeholder={`En Eleventa: ${hoy || '—'}`} style={campo} />
              </label>
            )
          })}
        </div>

        <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: TINTA_SUAVE, margin: '4px 0 4px' }}>Precios por tienda</span>
        <div style={{ border: '1px solid ' + LINEA, borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F7FAFB', color: TINTA_SUAVE }}>
                <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11 }}>Tienda</th>
                <th style={{ textAlign: 'left', padding: '6px 6px', fontSize: 11 }}>Público</th>
                <th style={{ textAlign: 'left', padding: '6px 10px 6px 6px', fontSize: 11 }}>Mayoreo</th>
              </tr>
            </thead>
            <tbody>
              {plazas.map(p => {
                const prod = productoEn(invs[p], codigo)
                return (
                  <tr key={p} style={{ borderTop: '1px solid ' + LINEA }}>
                    <td style={{ padding: '5px 10px', color: TINTA }}>{nombreSucursal(p)}</td>
                    {['precio', 'mayoreo'].map((t, i) => (
                      <td key={t} style={{ padding: i ? '5px 10px 5px 6px' : '5px 6px' }}>
                        <input data-campo-edicion={`${t}@${p}`} value={valor(`${t}@${p}`)} inputMode="decimal"
                               onChange={ev => poner(`${t}@${p}`, ev.target.value)}
                               placeholder={prod?.[t === 'precio' ? 'Precio' : 'Mayoreo'] ? `hoy ${textoValor(t, prod[t === 'precio' ? 'Precio' : 'Mayoreo'])}` : '—'}
                               style={{ ...campo, padding: '5px 8px', fontSize: 12 }} />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <Etiqueta nota="opcional, queda en la bitácora">Por qué</Etiqueta>
          <input data-campo-edicion="porque" value={porQue} onChange={e => setPorQue(e.target.value)} style={campo}
                 placeholder="Ej.: así viene en la factura del proveedor" />
        </label>

        {error && <p style={{ color: '#B91C1C', fontSize: 12, margin: '0 0 8px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, color: TINTA_TENUE, flex: 1 }}>
            {cambios.length ? `${cambios.length} ${cambios.length === 1 ? 'cambio' : 'cambios'} por guardar` : 'Sin cambios'}
          </span>
          <button type="button" onClick={b.cerrarEditor}
                  style={{ border: '1px solid ' + LINEA, background: '#fff', borderRadius: 999, padding: '7px 16px',
                           fontSize: 12.5, fontWeight: 700, color: TINTA_SUAVE, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancelar
          </button>
          <button type="button" data-guardar-edicion disabled={guardando || !cambios.length} onClick={guardar}
                  style={{ border: 0, background: cambios.length ? TINTA : '#C8D4D9', borderRadius: 999, padding: '7px 18px',
                           fontSize: 12.5, fontWeight: 800, color: '#fff', cursor: cambios.length ? 'pointer' : 'default', fontFamily: 'inherit' }}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>

        {historia.length > 0 && (
          <div style={{ marginTop: 14, borderTop: '1px solid ' + LINEA, paddingTop: 10 }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: TINTA_SUAVE, marginBottom: 6 }}>Lo que se ha cambiado de este modelo</span>
            <ul data-historia-modelo style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {historia.map(r => (
                <li key={r.id ?? r.cuando} style={{ fontSize: 11.5, color: TINTA_SUAVE }}>
                  <span style={{ color: TINTA_TENUE }}>{new Date(r.cuando).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })} · {r.quien}</span>
                  {' '}— {textoTipo(r.tipo, r.plaza, nombreSucursal)}:{' '}
                  <s style={{ color: TINTA_TENUE }}>{textoHistoria(r.tipo, r.antes)}</s> → <strong style={{ color: TINTA }}>{textoHistoria(r.tipo, r.despues)}</strong>
                  {r.nota && <em style={{ color: TINTA_TENUE }}> · {r.nota}</em>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function textoHistoria(tipo, v) {
  if (v === null || v === undefined || v === '') return '—'
  if (tipo === 'baja') return v === 'dado-de-baja' ? 'dado de baja' : String(v)
  if (tipo === 'descontinuado') return 'descontinuado'
  if (tipo === 'cantidad') return `${v} pz`
  return textoValor(tipo, v)
}

export { TIPOS_EDICION }
