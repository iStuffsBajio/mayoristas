// Nómina y RH: «Mi pago» de cada sucursal y la pestaña del administrador.
//
// La pidió el dueño el 2026-11-11. Las cuentas están en `lib/nomina.js`, con
// pruebas; quién ve qué lo decide el servidor (`backend/src/nomina.js`). Aquí
// sólo se pinta, con el diseño de la casa (`Diseno.jsx`).
//
// Dos cosas que esta pantalla dice a propósito:
//
//   · El bono y los descuentos salen SOLOS de las aperturas del punto de
//     venta. Lo que el administrador decide —justificar, quién cubrió, no
//     descontar— queda en la bitácora con su motivo.
//   · Un sueldo sin capturar no es un sueldo de cero: el total se dice
//     incompleto, como en todo el panel.

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNomina } from '../lib/useNomina'
import { fotoNomina } from '../lib/api'
import {
  NOMBRE_PLAZA, NOMBRE_DIA, INICIAL_DIA, DIAS, ESTADOS_DIA, PLAZAS_NOMINA, semanasHacia, sumarDias,
  saldoVacaciones, valorDia, normalizar,
} from '../lib/nomina'
import { pesos } from '../lib/caja'
import { COLORES } from '../lib/coloresCaja'
import { Seccion, Cifra, Cifras, CajaDeTabla, TEMAS, FONDO_CABECERA } from './Diseno'
import PersonalPanel from './PersonalPanel'

const TINTA = '#101619', TINTA_SUAVE = '#4A5A61', TINTA_TENUE = '#8598A1', LINEA = '#D6E0E4'
const VERDE = '#3F6F14', ROJO = '#BE185D', AMBAR = '#B45309', AZUL = '#0277A0'
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fecha = f => { const [y, m, d] = String(f).split('-').map(Number); return new Date(y, m - 1, d) }
const corto = f => `${fecha(f).getDate()} ${MESES[fecha(f).getMonth()]}`
const rango = l => `${corto(l)} – ${corto(sumarDias(l, 6))}`
const fechaLarga = f => fecha(f).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

const COLOR_DIA = {
  puntual: VERDE, retardo: ROJO, falta: ROJO, cubierto: AZUL, vacaciones: '#6D28D9',
  justificado: AMBAR, 'sin-dato': AMBAR, 'por-venir': TINTA_TENUE,
}
const BONO = {
  vigente: { texto: 'Vigente', color: VERDE, punto: '🟢' },
  riesgo: { texto: 'En riesgo', color: AMBAR, punto: '🟡' },
  perdido: { texto: 'Perdido', color: ROJO, punto: '🔴' },
}
const ESTADO_COM = {
  pendiente: { texto: 'Pendiente', color: AMBAR },
  autorizada: { texto: 'Autorizada', color: VERDE },
  rechazada: { texto: 'Rechazada', color: ROJO },
}

// ── Piezas ────────────────────────────────────────────────────────────────

function Boton({ tipo = 'secundario', style, disabled, children, ...resto }) {
  const c = {
    primario: { background: 'var(--accent)', color: 'var(--accent-ink)' },
    secundario: { background: 'var(--surface)', color: 'var(--ink)' },
    fantasma: { background: 'transparent', color: 'var(--muted)' },
    peligro: { background: 'rgba(190,24,93,0.1)', color: ROJO },
  }[tipo]
  return (
    <button type="button" disabled={disabled} {...resto} style={{
      border: 0, borderRadius: 999, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
      whiteSpace: 'nowrap', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, ...c, ...style,
    }}>{children}</button>
  )
}

const Pildora = ({ activa, onClick, children, ...r }) => (
  <button type="button" onClick={onClick} aria-pressed={activa} className={'chip-plaza' + (activa ? ' activa' : '')} {...r}>
    <span className="chip-plaza-texto">{children}</span>
  </button>
)

const Chip = ({ color, children, ...r }) => (
  <span {...r} style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 800, color, background: color + '18', whiteSpace: 'nowrap' }}>{children}</span>
)

const Th = ({ children, num }) => (
  <th style={{ textAlign: num ? 'right' : 'left', padding: '9px 10px', fontSize: 11, fontWeight: 700, color: TINTA_SUAVE, borderBottom: '1px solid ' + LINEA, whiteSpace: 'nowrap' }}>{children}</th>
)
const Td = ({ children, num, fuerte, color, style, ...r }) => (
  <td {...r} style={{ padding: '7px 10px', fontSize: 12.5, textAlign: num ? 'right' : 'left', fontVariantNumeric: num ? 'tabular-nums' : 'normal', fontWeight: fuerte ? 800 : 400, color: color || TINTA, ...style }}>{children}</td>
)
const fila = i => ({ background: i % 2 ? '#FBFDFD' : '#fff', borderBottom: '1px solid rgba(16,22,25,0.04)' })
const campo = { padding: '7px 10px', fontSize: 13, borderRadius: 10, border: '1px solid ' + LINEA, outline: 'none', fontFamily: 'inherit', color: TINTA, background: '#fff' }

const Aviso = ({ children, tono = 'alerta', ...r }) => (
  <div {...r} style={{ padding: '10px 14px', borderRadius: 14, fontSize: 12, lineHeight: 1.55, color: TINTA_SUAVE,
    background: TEMAS[tono].suave, border: '1px solid ' + TEMAS[tono].borde, borderLeft: '5px solid ' + TEMAS[tono].fuerte }}>{children}</div>
)

/** Las semanas para elegir: la en curso y las anteriores. */
function SelectorSemana({ hoy, lunes, onCambiar, n = 8 }) {
  const semanas = useMemo(() => semanasHacia(hoy, n), [hoy, n])
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {semanas.map((l, i) => (
        <Pildora key={l} activa={l === lunes} onClick={() => onCambiar(l)} data-semana-nomina={l}>
          {i === 0 ? `Esta semana · ${rango(l)}` : rango(l)}
        </Pildora>
      ))}
    </div>
  )
}

// ── El recibo de un registro ──────────────────────────────────────────────

const parTexto = c => c.manual ? c.concepto : c.par.map(x => `${x.producto} ${pesos(x.precio)}`).join(' + ')

/** Los siete días de la semana, con su estado y la hora de apertura. */
function DiasDeLaSemana({ r }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 6 }} data-dias-nomina>
      {r.dias.map(d => (
        <div key={d.fecha} data-dia-nomina={d.estado} title={d.justificacion?.motivo ?? ''}
             style={{ padding: '6px 8px', borderRadius: 12, background: (COLOR_DIA[d.estado] ?? TINTA) + '12', borderLeft: '4px solid ' + (COLOR_DIA[d.estado] ?? TINTA) }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: TINTA }}>{NOMBRE_DIA[d.dia]} {fecha(d.fecha).getDate()}</div>
          <div style={{ fontSize: 11, color: COLOR_DIA[d.estado], fontWeight: 700 }}>
            {ESTADOS_DIA[d.estado]}{d.hora ? ` · ${d.hora}` : ''}
          </div>
          {d.cubiertoPor && <div style={{ fontSize: 10, color: TINTA_TENUE }}>abrió {d.cubiertoPor}</div>}
          {d.estado === 'retardo' && d.minutos !== null && <div style={{ fontSize: 10, color: ROJO }}>+{d.minutos} min</div>}
        </div>
      ))}
    </div>
  )
}

/** El desglose del pago: cada renglón con el color de su concepto. */
function Desglose({ r }) {
  const t = r.totales
  const renglones = [
    ['Sueldo base', r.incompleto ? null : t.sueldo, COLORES.sueldo, '+'],
    ...r.coberturas.map(c => [`Apertura ${NOMBRE_DIA[(fecha(c.fecha).getDay() || 7)]} ${fecha(c.fecha).getDate()} (cubrió a ${c.titular})`, c.monto, COLORES.entradas, '+']),
    ...r.descuentos.map(d => [d.falta ? `Falta del ${NOMBRE_DIA[(fecha(d.fecha).getDay() || 7)]} ${fecha(d.fecha).getDate()}` : `Día cubierto por ${d.cubrio} (${NOMBRE_DIA[(fecha(d.fecha).getDay() || 7)]} ${fecha(d.fecha).getDate()})`, d.monto, COLORES.gastos, '−']),
    [`Bono de puntualidad · ${BONO[r.bono.estado].texto}`, r.bono.monto === null ? null : t.bono, COLORES.entradas, '+'],
    [`Comisiones autorizadas (${r.comisiones.filter(c => c.estado === 'autorizada').length})`, t.comisiones, COLORES.comisiones, '+'],
    ...r.ajustes.map(a => [`Ajuste: ${a.motivo}`, Math.abs(a.monto), COLORES.caja, a.monto < 0 ? '−' : '+']),
  ]
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {renglones.map(([et, v, c, s], i) => (
          <tr key={i} style={{ borderBottom: '1px solid rgba(16,22,25,0.05)' }}>
            <td style={{ width: 5, padding: 0, background: c.fuerte }} />
            <Td>{et}</Td>
            <Td num color={TINTA_TENUE} style={{ width: 16 }}>{s}</Td>
            <Td num fuerte color={v === null ? AMBAR : c.fuerte}>{v === null ? 'sin capturar' : pesos(v)}</Td>
          </tr>
        ))}
        <tr style={{ background: COLORES.caja.suave }}>
          <td style={{ width: 5, padding: 0, background: TINTA }} />
          <Td fuerte>Total {r.incompleto ? '(incompleto: falta el sueldo)' : 'a pagar'}</Td><Td num>=</Td>
          <Td num fuerte style={{ fontSize: 15 }}>{pesos(t.total)}</Td>
        </tr>
      </tbody>
    </table>
  )
}

function TablaComisiones({ r }) {
  if (!r.comisiones.length) return <p style={{ fontSize: 12, color: TINTA_TENUE, margin: 0 }}>Ninguna venta con cruce de productos esta semana.</p>
  return (
    <CajaDeTabla>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ background: FONDO_CABECERA }}><tr><Th>Ticket</Th><Th>Día</Th><Th>Productos</Th><Th num>Base</Th><Th num>Comisión</Th><Th>Estado</Th></tr></thead>
        <tbody>
          {r.comisiones.map((c, i) => (
            <tr key={c.clave} style={fila(i)} data-comision-mipago={c.estado}>
              <Td fuerte>{c.manual ? 'manual' : c.ticket.folio}</Td>
              <Td color={TINTA_SUAVE}>{corto(c.manual ? c.fecha : c.ticket.f)}{c.ticket?.hora ? ` ${c.ticket.hora}` : ''}</Td>
              <Td style={{ minWidth: 220 }}>{parTexto(c)}</Td>
              <Td num>{c.base === null ? '—' : pesos(c.base)}</Td>
              <Td num fuerte color={COLORES.comisiones.fuerte}>{pesos(c.monto)}</Td>
              <Td><Chip color={ESTADO_COM[c.estado].color}>{ESTADO_COM[c.estado].texto}</Chip>{c.motivo ? <span style={{ display: 'block', fontSize: 10.5, color: TINTA_TENUE }}>{c.motivo}</span> : null}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </CajaDeTabla>
  )
}

/**
 * El recibo para imprimir y firmar. En pantalla no se ve: lo enseña la hoja de
 * estilos de impresión (`.recibo-impresion`) mientras se imprime.
 */
function ReciboImpreso({ r, lunes }) {
  const t = r.totales
  return (
    <div className="recibo-impresion" data-recibo-impresion>
      <h1 style={{ fontSize: 20, margin: 0 }}>iStuffs · Recibo de pago semanal</h1>
      <p style={{ margin: '4px 0 14px', fontSize: 13 }}>{NOMBRE_PLAZA[r.plaza]} · semana del {rango(lunes)} de {fecha(lunes).getFullYear()}</p>
      <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>{r.registro.nombre}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {[['Sueldo base', r.incompleto ? 'sin capturar' : pesos(t.sueldo)],
            ...r.coberturas.map(c => [`Apertura del ${fechaLarga(c.fecha)} (cubrió a ${c.titular})`, `+ ${pesos(c.monto)}`]),
            ...r.descuentos.map(d => [d.falta ? `Falta del ${fechaLarga(d.fecha)}` : `Día cubierto por ${d.cubrio} (${fechaLarga(d.fecha)})`, `− ${pesos(d.monto)}`]),
            [`Bono de puntualidad (${BONO[r.bono.estado].texto.toLowerCase()})`, pesos(t.bono)],
            [`Comisiones autorizadas`, pesos(t.comisiones)],
            ...r.ajustes.map(a => [`Ajuste: ${a.motivo}`, pesos(a.monto)]),
          ].map(([a, b], i) => (
            <tr key={i}><td style={{ padding: '5px 0', borderBottom: '1px solid #ccc' }}>{a}</td><td style={{ padding: '5px 0', borderBottom: '1px solid #ccc', textAlign: 'right' }}>{b}</td></tr>
          ))}
          <tr><td style={{ padding: '8px 0', fontWeight: 800 }}>TOTAL A PAGAR</td><td style={{ padding: '8px 0', fontWeight: 800, textAlign: 'right', fontSize: 16 }}>{pesos(t.total)}</td></tr>
        </tbody>
      </table>
      <p style={{ fontSize: 12, margin: '12px 0 4px', fontWeight: 700 }}>Aperturas de la semana</p>
      <p style={{ fontSize: 12, margin: 0 }}>{r.dias.map(d => `${NOMBRE_DIA[d.dia]} ${fecha(d.fecha).getDate()}: ${ESTADOS_DIA[d.estado]}${d.hora ? ` ${d.hora}` : ''}`).join(' · ')}</p>
      {r.comisiones.filter(c => c.estado === 'autorizada').length > 0 && (
        <>
          <p style={{ fontSize: 12, margin: '12px 0 4px', fontWeight: 700 }}>Comisiones autorizadas</p>
          {r.comisiones.filter(c => c.estado === 'autorizada').map(c => (
            <p key={c.clave} style={{ fontSize: 11.5, margin: '2px 0' }}>{c.manual ? 'Manual' : `Ticket ${c.ticket.folio}`} · {parTexto(c)} · {pesos(c.monto)}</p>
          ))}
        </>
      )}
      <div style={{ display: 'flex', gap: 40, marginTop: 60 }}>
        <div style={{ flex: 1, borderTop: '1px solid #000', paddingTop: 6, fontSize: 12, textAlign: 'center' }}>Firma de {r.registro.nombre}</div>
        <div style={{ flex: 1, borderTop: '1px solid #000', paddingTop: 6, fontSize: 12, textAlign: 'center' }}>Firma de quien paga</div>
      </div>
      <p style={{ fontSize: 10, marginTop: 18, color: '#555' }}>Calculado con las aperturas y los tickets del punto de venta. Impreso el {new Date().toLocaleString('es-MX')}.</p>
    </div>
  )
}

/** Imprime un recibo: marca el cuerpo para que la hoja de impresión sólo enseñe ése. */
function useImprimir() {
  const [cual, setCual] = useState(null)
  useEffect(() => {
    if (!cual) return
    document.body.classList.add('imprimiendo-recibo')
    const fin = () => { document.body.classList.remove('imprimiendo-recibo'); setCual(null) }
    const t = setTimeout(() => {
      try { if (typeof window.print === 'function') window.print() } catch { /* sin impresora */ }
      fin()
    }, 60)
    return () => { clearTimeout(t); document.body.classList.remove('imprimiendo-recibo') }
  }, [cual])
  return [cual, setCual]
}

/** Lo que ve cada quien de un registro en una semana. */
function Recibo({ r, lunes, onImprimir, extra }) {
  const t = r.totales
  const b = BONO[r.bono.estado]
  return (
    <Seccion tema="dinero" titulo={r.registro.nombre} data-recibo={r.registro.id}
             sub={`${NOMBRE_PLAZA[r.plaza]} · ${r.registro.dias.map(d => INICIAL_DIA[d]).join(' ')}`}
             extra={<span>{pesos(t.total)}{r.pago ? <span data-pagado style={{ marginLeft: 8, fontSize: 11, color: VERDE }}>✓ pagado</span> : null}</span>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Cifras>
          <Cifra tema={TEMAS.dinero} titulo="Total estimado" valor={pesos(t.total)} sub={r.incompleto ? 'falta capturar el sueldo' : r.pago ? 'pagado' : 'del periodo'} />
          <Cifra tema={COLORES.sueldo} titulo="Sueldo base" valor={r.incompleto ? 'sin capturar' : pesos(t.sueldo - t.descuentos + t.coberturas)}
                 sub={[t.coberturas && `+${pesos(t.coberturas)} por aperturas`, t.descuentos && `−${pesos(t.descuentos)} por días`].filter(Boolean).join(' · ') || undefined} />
          <Cifra tema={{ ...TEMAS.dinero, fuerte: b.color, suave: b.color + '14' }} titulo="Bono de puntualidad"
                 valor={r.bono.monto === null ? 'sin capturar' : pesos(r.bono.monto)}
                 sub={`${b.punto} ${b.texto}${r.bono.incumplimiento ? ` · ${ESTADOS_DIA[r.bono.incumplimiento.estado].toLowerCase()} el ${corto(r.bono.incumplimiento.fecha)}${r.bono.incumplimiento.hora ? ` a las ${r.bono.incumplimiento.hora}` : ''}` : ''}`}
                 data-bono={r.bono.estado} />
          <Cifra tema={COLORES.comisiones} titulo="Comisiones autorizadas" valor={pesos(t.comisiones)}
                 sub={t.comisionesPendientes ? `${pesos(t.comisionesPendientes)} pendientes de autorizar` : undefined} />
        </Cifras>
        <Desglose r={r} />
        <div>
          <strong style={{ fontSize: 12.5, color: TINTA }}>Aperturas de la semana</strong>
          <div style={{ marginTop: 6 }}><DiasDeLaSemana r={r} /></div>
        </div>
        <div>
          <strong style={{ fontSize: 12.5, color: COLORES.comisiones.fuerte }}>Comisiones</strong>
          <div style={{ marginTop: 6 }}><TablaComisiones r={r} /></div>
        </div>
        {extra}
        <div><Boton data-imprimir-recibo onClick={() => onImprimir(r)}>🖨 Imprimir para firma</Boton></div>
      </div>
    </Seccion>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  «Mi pago» — la sucursal, sólo lectura
// ═══════════════════════════════════════════════════════════════════════════

export function MiPagoPanel() {
  const { token } = useAuth()
  const n = useNomina(token)
  const [lunes, setLunes] = useState(null)
  const [imprimir, setImprimir] = useImprimir()
  const l = lunes ?? semanasHacia(n.hoy, 1)[0]
  const filas = useMemo(() => (n.datos ? n.semana(l) : []), [n, l])
  const historial = useMemo(() => (n.datos ? semanasHacia(n.hoy, 8).slice(1).map(s => [s, n.semana(s)]) : []), [n])

  if (n.cargando && !n.datos) return <p className="tablero-cargando">Leyendo la nómina…</p>
  if (n.error) return <Aviso>No se pudo leer la nómina: {n.error}</Aviso>

  return (
    <div data-mi-pago style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Aviso tono="dinero">
        <strong>Mi pago</strong> se calcula solo con las aperturas y los tickets del punto de venta. El bono se pierde con un
        retardo o una falta; las comisiones cuentan cuando el administrador las autoriza. Es de consulta: si algo no cuadra,
        avisa a administración.
      </Aviso>
      <SelectorSemana hoy={n.hoy} lunes={l} onCambiar={setLunes} />
      {filas.length === 0 && <p style={{ fontSize: 12.5, color: TINTA_TENUE }}>Esta sucursal todavía no tiene personal en la nómina.</p>}
      {filas.map(r => <Recibo key={r.registro.id} r={r} lunes={l} onImprimir={setImprimir} />)}
      {historial.length > 0 && (
        <Seccion tema="neutro" titulo="Semanas anteriores" sinRelleno data-historial-pago>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: FONDO_CABECERA }}><tr><Th>Semana</Th>{filas.map(r => <Th key={r.registro.id} num>{r.registro.nombre}</Th>)}</tr></thead>
              <tbody>
                {historial.map(([s, fs], i) => (
                  <tr key={s} style={fila(i)}>
                    <Td>{rango(s)}</Td>
                    {filas.map(r => {
                      const x = fs.find(y => y.registro.id === r.registro.id)
                      return <Td key={r.registro.id} num>{x ? pesos(x.totales.total) : '—'}{x?.pago ? <span style={{ color: VERDE, fontSize: 10.5 }}> ✓</span> : null}</Td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}
      {imprimir && <ReciboImpreso r={imprimir} lunes={l} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  «Nómina y RH» — el administrador
// ═══════════════════════════════════════════════════════════════════════════

const VISTAS = [
  ['resumen', 'Resumen de pago'], ['puntualidad', 'Puntualidad'], ['comisiones', 'Comisiones'],
  ['vacaciones', 'Vacaciones y antigüedad'], ['parametros', 'Parámetros'], ['bitacora', 'Bitácora'],
]

function Segmentos({ vista, setVista, opciones, attr }) {
  return (
    <nav style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: '#EEF3F5', overflowX: 'auto', alignSelf: 'flex-start', maxWidth: '100%' }}>
      {opciones.map(([id, t]) => (
        <button key={id} type="button" onClick={() => setVista(id)} {...{ [attr]: id }} aria-current={vista === id ? 'page' : undefined}
                style={{ border: 0, borderRadius: 999, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap', cursor: 'pointer',
                         background: vista === id ? TINTA : 'transparent', color: vista === id ? '#fff' : TINTA_SUAVE }}>{t}</button>
      ))}
    </nav>
  )
}

/** Personal, con la pestaña de nómina dentro: así lo pidió el dueño. */
export default function PersonalConNomina() {
  const [vista, setVista] = useState('puntualidad')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Segmentos vista={vista} setVista={setVista} attr="data-vista-personal"
                 opciones={[['puntualidad', 'Puntualidad del personal'], ['nomina', 'Nómina y RH']]} />
      {vista === 'puntualidad' ? <PersonalPanel /> : <NominaPanel />}
    </div>
  )
}

export function NominaPanel() {
  const { token } = useAuth()
  const n = useNomina(token)
  const [vista, setVista] = useState('resumen')
  const [lunes, setLunes] = useState(null)
  const l = lunes ?? semanasHacia(n.hoy, 1)[0]
  const filas = useMemo(() => (n.datos ? n.semana(l) : []), [n, l])

  if (n.cargando && !n.datos) return <p className="tablero-cargando">Leyendo la nómina…</p>
  if (n.error) return <Aviso>No se pudo leer la nómina: {n.error}</Aviso>

  return (
    <div data-nomina style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Segmentos vista={vista} setVista={setVista} opciones={VISTAS} attr="data-vista-nomina" />
      {!n.datos?.config && (
        <Aviso>La nómina usa los parámetros de arranque. Revísalos en <strong>Parámetros</strong> y guárdalos para que queden como tuyos.</Aviso>
      )}
      {['resumen', 'puntualidad'].includes(vista) && <SelectorSemana hoy={n.hoy} lunes={l} onCambiar={setLunes} />}
      {vista === 'resumen' && <Resumen n={n} filas={filas} lunes={l} />}
      {vista === 'puntualidad' && <Puntualidad n={n} filas={filas} lunes={l} />}
      {vista === 'comisiones' && <Comisiones n={n} />}
      {vista === 'vacaciones' && <Vacaciones n={n} />}
      {vista === 'parametros' && <Parametros n={n} />}
      {vista === 'bitacora' && <Bitacora n={n} />}
    </div>
  )
}

const useAccion = n => {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  const hacer = async a => {
    setOcupado(true); setError(null)
    try { await n.accion(a); return true } catch (e) { setError(e.message || 'No se pudo guardar.'); return false } finally { setOcupado(false) }
  }
  return { ocupado, error, hacer }
}

// ── 1. Resumen de pago ────────────────────────────────────────────────────

function Resumen({ n, filas, lunes }) {
  const [abierto, setAbierto] = useState(null)
  const [imprimir, setImprimir] = useImprimir()
  const acc = useAccion(n)
  const porPlaza = PLAZAS_NOMINA.map(p => [p, filas.filter(r => r.plaza === p)]).filter(([, fs]) => fs.length)
  const total = filas.reduce((a, r) => a + r.totales.total, 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Cifras>
        <Cifra tema="dinero" titulo={`Nómina de la semana ${rango(lunes)}`} valor={pesos(total)} sub={`${filas.length} registros de pago`} />
        <Cifra tema={COLORES.sueldo} titulo="Sueldos" valor={pesos(filas.reduce((a, r) => a + r.totales.sueldo - r.totales.descuentos + r.totales.coberturas, 0))} />
        <Cifra tema={TEMAS.dinero} titulo="Bonos" valor={pesos(filas.reduce((a, r) => a + r.totales.bono, 0))} sub={`${filas.filter(r => r.bono.estado === 'perdido').length} perdidos`} />
        <Cifra tema={COLORES.comisiones} titulo="Comisiones autorizadas" valor={pesos(filas.reduce((a, r) => a + r.totales.comisiones, 0))}
               sub={`${filas.reduce((a, r) => a + r.comisiones.filter(c => c.estado === 'pendiente').length, 0)} pendientes`} />
      </Cifras>
      {acc.error && <Aviso>{acc.error}</Aviso>}
      {porPlaza.map(([plaza, fs]) => (
        <Seccion key={plaza} tema="neutro" titulo={NOMBRE_PLAZA[plaza]} extra={pesos(fs.reduce((a, r) => a + r.totales.total, 0))} sinRelleno data-resumen-plaza={plaza}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: FONDO_CABECERA }}>
                <tr><Th>Empleado</Th><Th num>Sueldo</Th><Th num>Aperturas</Th><Th num>Descuentos</Th><Th num>Bono</Th><Th num>Comisiones</Th><Th num>Ajustes</Th><Th num>Total</Th><Th>Pago</Th></tr>
              </thead>
              <tbody>
                {fs.map((r, i) => (
                  <tr key={r.registro.id} style={fila(i)} data-fila-nomina={r.registro.id}>
                    <Td fuerte><button type="button" onClick={() => setAbierto(a => (a === r.registro.id ? null : r.registro.id))}
                                       style={{ border: 0, background: 'none', padding: 0, font: 'inherit', fontWeight: 800, color: TINTA, cursor: 'pointer', textAlign: 'start' }}>
                      {r.registro.nombre} <span style={{ color: TINTA_TENUE, fontSize: 10 }}>{abierto === r.registro.id ? '▲' : '▼'}</span></button></Td>
                    <Td num color={r.incompleto ? AMBAR : TINTA}>{r.incompleto ? 'sin capturar' : pesos(r.totales.sueldo)}</Td>
                    <Td num color={VERDE}>{r.totales.coberturas ? `+${pesos(r.totales.coberturas)}` : '—'}</Td>
                    <Td num color={AMBAR}>{r.totales.descuentos ? `−${pesos(r.totales.descuentos)}` : '—'}</Td>
                    <Td num>{r.bono.monto === null
                      ? <span style={{ color: TINTA_TENUE }}>sin bono</span>
                      : <><span style={{ color: BONO[r.bono.estado].color }}>{BONO[r.bono.estado].punto}</span> {pesos(r.totales.bono)}</>}</Td>
                    <Td num color={COLORES.comisiones.fuerte}>{pesos(r.totales.comisiones)}{r.totales.comisionesPendientes ? <span style={{ display: 'block', fontSize: 10, color: AMBAR }}>{pesos(r.totales.comisionesPendientes)} pend.</span> : null}</Td>
                    <Td num>{r.totales.ajustes ? pesos(r.totales.ajustes) : '—'}</Td>
                    <Td num fuerte>{pesos(r.totales.total)}</Td>
                    <Td>
                      {r.pago
                        ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Chip color={VERDE}>✓ Pagado {pesos(r.pago.total)}</Chip>
                            <Boton tipo="fantasma" disabled={acc.ocupado} onClick={() => { const m = window.prompt('¿Por qué se quita la marca de pagado?'); if (m) acc.hacer({ accion: 'despagar', registro: r.registro.id, semana: lunes, motivo: m }) }}>quitar</Boton></span>
                        : <Boton tipo="primario" data-marcar-pagado={r.registro.id} disabled={acc.ocupado || r.incompleto}
                                 onClick={() => acc.hacer({ accion: 'pagar', registro: r.registro.id, semana: lunes, total: r.totales.total })}>Marcar pagado</Boton>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      ))}
      {filas.filter(r => r.registro.id === abierto).map(r => (
        <Recibo key={r.registro.id} r={r} lunes={lunes} onImprimir={setImprimir} extra={<FormaAjuste n={n} r={r} lunes={lunes} />} />
      ))}
      {imprimir && <ReciboImpreso r={imprimir} lunes={lunes} />}
    </div>
  )
}

function FormaAjuste({ n, r, lunes }) {
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const acc = useAccion(n)
  return (
    <div data-forma-ajuste style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px', borderRadius: 14, background: COLORES.caja.suave }}>
      <strong style={{ fontSize: 12.5 }}>Ajuste a mano</strong>
      <input aria-label="Monto del ajuste" placeholder="+500 o −200" value={monto} onChange={e => setMonto(e.target.value.replace(/[^\d.-]/g, ''))} style={{ ...campo, width: 120 }} />
      <input aria-label="Motivo del ajuste" placeholder="Motivo (obligatorio)" value={motivo} onChange={e => setMotivo(e.target.value)} style={{ ...campo, flex: 1, minWidth: 180 }} />
      <Boton tipo="primario" disabled={acc.ocupado || !Number(monto) || !motivo.trim()}
             onClick={async () => { if (await acc.hacer({ accion: 'ajuste', registro: r.registro.id, semana: lunes, monto: Number(monto), motivo })) { setMonto(''); setMotivo('') } }}>Guardar ajuste</Boton>
      {r.ajustes.map(a => (
        <span key={a.id} style={{ fontSize: 11.5 }}>{pesos(a.monto)} · {a.motivo} <Boton tipo="fantasma" onClick={() => acc.hacer({ accion: 'quitar-ajuste', id: a.id })}>quitar</Boton></span>
      ))}
      {acc.error && <span style={{ color: ROJO, fontSize: 11.5 }}>{acc.error}</span>}
    </div>
  )
}

// ── 2. Puntualidad ────────────────────────────────────────────────────────

function FilaDia({ n, r, d, regsPlaza }) {
  const acc = useAccion(n)
  const [justificando, setJustificando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [bono, setBono] = useState(true)
  const [sueldo, setSueldo] = useState(true)
  const cob = n.estado.coberturas?.[`${r.plaza}|${d.fecha}`] ?? null
  return (
    <tr data-puntualidad={`${r.registro.id}|${d.fecha}`} style={{ borderBottom: '1px solid rgba(16,22,25,0.05)' }}>
      <Td fuerte>{NOMBRE_DIA[d.dia]} {fecha(d.fecha).getDate()}</Td>
      <Td>{r.registro.nombre}</Td>
      <Td color={TINTA_SUAVE}>{d.hora ? `${d.hora} · ${d.usuario}` : '—'}{d.sinRegistro ? <span style={{ display: 'block', fontSize: 10.5, color: AMBAR }}>⚠ usuario sin registro: dime quién fue</span> : null}</Td>
      <Td><Chip color={COLOR_DIA[d.estado]}>{ESTADOS_DIA[d.estado]}{d.estado === 'retardo' && d.minutos !== null ? ` +${d.minutos}′` : ''}</Chip>
        {d.justificacion && <span style={{ display: 'block', fontSize: 10.5, color: TINTA_TENUE }}>{d.justificacion.motivo}{d.justificacion.bono === false ? ' · pierde bono' : ''}{d.justificacion.sueldo === false ? ' · descuenta día' : ''}</span>}
      </Td>
      <Td>
        <select aria-label="Quién abrió" value={cob?.quien ?? ''} disabled={acc.ocupado} style={{ ...campo, padding: '5px 8px', fontSize: 12 }}
                onChange={e => acc.hacer({ accion: 'cobertura', plaza: r.plaza, fecha: d.fecha, quien: e.target.value || null, sinDescuento: !!cob?.sinDescuento })}>
          <option value="">Automático (punto de venta)</option>
          {regsPlaza.map(x => <option key={x.id} value={x.id}>Abrió {x.nombre}</option>)}
          <option value="nadie">No abrió nadie</option>
        </select>
        {d.estado === 'cubierto' && (
          <label style={{ display: 'block', fontSize: 11, marginTop: 4 }}>
            <input type="checkbox" checked={!!cob?.sinDescuento} disabled={acc.ocupado}
                   onChange={e => acc.hacer({ accion: 'cobertura', plaza: r.plaza, fecha: d.fecha, quien: cob?.quien ?? null, sinDescuento: e.target.checked })} /> no descontar al titular
          </label>
        )}
      </Td>
      <Td>
        {d.justificacion
          ? <Boton tipo="fantasma" disabled={acc.ocupado} onClick={() => acc.hacer({ accion: 'quitar-justificacion', registro: r.registro.id, fecha: d.fecha })}>Quitar justificación</Boton>
          : ['retardo', 'falta'].includes(d.estado) && (justificando
            ? <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input aria-label="Motivo de la justificación" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo" style={{ ...campo, width: 160 }} />
                <label style={{ fontSize: 11 }}><input type="checkbox" checked={bono} onChange={e => setBono(e.target.checked)} /> perdonar bono</label>
                {d.estado === 'falta' && <label style={{ fontSize: 11 }}><input type="checkbox" checked={sueldo} onChange={e => setSueldo(e.target.checked)} /> perdonar el día</label>}
                <Boton tipo="primario" data-guardar-justificacion disabled={!motivo.trim() || acc.ocupado}
                       onClick={async () => { if (await acc.hacer({ accion: 'justificar', registro: r.registro.id, fecha: d.fecha, motivo, bono, sueldo: d.estado === 'falta' ? sueldo : true })) setJustificando(false) }}>Guardar</Boton>
              </span>
            : <Boton data-justificar={`${r.registro.id}|${d.fecha}`} onClick={() => setJustificando(true)}>Justificar</Boton>)}
        {acc.error && <span style={{ display: 'block', color: ROJO, fontSize: 11 }}>{acc.error}</span>}
      </Td>
    </tr>
  )
}

function Puntualidad({ n, filas }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Aviso tono="neutro">
        El bono se calcula solo: un retardo de más de la tolerancia o una falta lo pierden, y una falta descuenta además el día.
        Aquí puedes justificar —perdonando el bono, el día o los dos— y decir quién abrió cuando el punto de venta no lo sabe
        (por ejemplo, la sobrina de Brenda con su usuario). Todo queda en la bitácora.
      </Aviso>
      {PLAZAS_NOMINA.map(plaza => {
        const fs = filas.filter(r => r.plaza === plaza && r.dias.length)
        if (!fs.length) return null
        const regsPlaza = n.config.empleados.filter(e => e.plaza === plaza && e.activo !== false)
        const dias = fs.flatMap(r => r.dias.map(d => ({ r, d }))).sort((a, b) => a.d.fecha.localeCompare(b.d.fecha))
        return (
          <Seccion key={plaza} tema="alerta" titulo={NOMBRE_PLAZA[plaza]} sinRelleno data-puntualidad-plaza={plaza}
                   sub={`Abre ${[...new Set(DIAS.map(d => n.config.parametros.horarios[plaza][d]).filter(Boolean))].join(' / ')} · tolerancia ${n.config.parametros.tolerancia[plaza]} min`}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: FONDO_CABECERA }}><tr><Th>Día</Th><Th>Titular</Th><Th>Apertura</Th><Th>Estado</Th><Th>Quién abrió</Th><Th>Justificar</Th></tr></thead>
                <tbody>{dias.map(({ r, d }) => <FilaDia key={r.registro.id + d.fecha} n={n} r={r} d={d} regsPlaza={regsPlaza} />)}</tbody>
              </table>
            </div>
          </Seccion>
        )
      })}
    </div>
  )
}

// ── 3. Comisiones ─────────────────────────────────────────────────────────

function VerFoto({ n, foto }) {
  const [src, setSrc] = useState(null)
  const { token } = useAuth()
  const ver = async () => {
    try {
      const r = await fotoNomina(foto, token)
      setSrc(`data:${r.tipo};base64,${r.datos}`)
    } catch { setSrc('error') }
  }
  if (src && src !== 'error') return <a href={src} target="_blank" rel="noreferrer"><img src={src} alt="Respaldo de la venta" style={{ maxWidth: 160, maxHeight: 120, borderRadius: 8, display: 'block' }} /></a>
  return <Boton tipo="fantasma" onClick={ver}>{src === 'error' ? 'no se pudo abrir' : '📷 ver foto'}</Boton>
}

function SubirFoto({ n, onFoto }) {
  const [ocupado, setOcupado] = useState(false)
  return (
    <label style={{ fontSize: 11.5, color: AZUL, cursor: 'pointer', fontWeight: 700 }}>
      {ocupado ? 'subiendo…' : '📎 adjuntar foto'}
      <input type="file" accept="image/*" style={{ display: 'none' }} disabled={ocupado}
             onChange={async e => { const f = e.target.files?.[0]; if (!f) return; setOcupado(true); try { await onFoto(await n.subirFoto(f)) } finally { setOcupado(false) } }} />
    </label>
  )
}

function Comisiones({ n }) {
  const [filtro, setFiltro] = useState('pendiente')
  const [marcadas, setMarcadas] = useState(new Set())
  const [motivo, setMotivo] = useState('')
  const acc = useAccion(n)
  const todas = useMemo(() => semanasHacia(n.hoy, 8).flatMap(l => n.semana(l).flatMap(r => r.comisiones.filter(c => !c.manual).map(c => ({ ...c, r, lunes: l })))), [n])
  const lista = todas.filter(c => filtro === 'todas' || c.estado === filtro)
  const sel = lista.filter(c => marcadas.has(c.clave))
  const mandar = async (estado, cs) => {
    const ok = await acc.hacer({ accion: 'comision', estado, motivo, items: cs.map(c => ({ clave: c.clave, registro: c.r.registro.id, lunes: c.lunes, monto: c.monto })) })
    if (ok) { setMarcadas(new Set()); setMotivo('') }
  }
  const sinComisionables = PLAZAS_NOMINA.every(p => n.comisionables?.[p] === null || n.comisionables?.[p] === undefined)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-bandeja-comisiones>
      <Aviso tono="neutro">
        Comisión = (precio del producto A + producto B) × {Math.round(n.config.parametros.pctComision * 100)}%, por el cruce de dos
        productos distintos en el mismo ticket: funda desde {pesos(n.config.parametros.minimos.funda)}, mica desde {pesos(n.config.parametros.minimos.hidrogel)},
        sticker desde {pesos(n.config.parametros.minimos.sticker)}. Una por ticket, el par más caro. <strong>Al autorizarla se registra sola como salida de
        efectivo «Comisiones de ‹nombre›»</strong> en la caja de su sucursal: no hace falta capturarla en el punto de venta.
      </Aviso>
      {sinComisionables && <Aviso>Los tickets con cruce de productos se llenan con la próxima sincronización.</Aviso>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[['pendiente', 'Pendientes'], ['autorizada', 'Autorizadas'], ['rechazada', 'Rechazadas'], ['todas', 'Todas']].map(([k, t]) => (
          <Pildora key={k} activa={filtro === k} onClick={() => { setFiltro(k); setMarcadas(new Set()) }} data-filtro-comision={k}>
            {t} ({k === 'todas' ? todas.length : todas.filter(c => c.estado === k).length})
          </Pildora>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Boton tipo="primario" data-autorizar-lote disabled={!sel.length || acc.ocupado} onClick={() => mandar('autorizada', sel)}>Autorizar {sel.length || ''}</Boton>
        <input aria-label="Motivo del rechazo" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo para rechazar" style={{ ...campo, minWidth: 200 }} />
        <Boton tipo="peligro" data-rechazar-lote disabled={!sel.length || !motivo.trim() || acc.ocupado} onClick={() => mandar('rechazada', sel)}>Rechazar {sel.length || ''}</Boton>
        {acc.error && <span style={{ color: ROJO, fontSize: 12 }}>{acc.error}</span>}
      </div>
      <CajaDeTabla alto={520}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, background: FONDO_CABECERA, zIndex: 1 }}>
            <tr>
              <Th><input type="checkbox" aria-label="Elegir todas" checked={lista.length > 0 && sel.length === lista.length}
                         onChange={e => setMarcadas(e.target.checked ? new Set(lista.map(c => c.clave)) : new Set())} /></Th>
              <Th>Empleado</Th><Th>Ticket</Th><Th>Día</Th><Th>Productos</Th><Th num>Base</Th><Th num>Comisión</Th><Th>Foto</Th><Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c, i) => (
              <tr key={c.clave} style={fila(i)} data-comision={c.clave}>
                <Td><input type="checkbox" aria-label={`Elegir ticket ${c.ticket.folio}`} checked={marcadas.has(c.clave)}
                           onChange={e => setMarcadas(m => { const x = new Set(m); if (e.target.checked) x.add(c.clave); else x.delete(c.clave); return x })} /></Td>
                <Td fuerte>{c.r.registro.nombre}<span style={{ display: 'block', fontSize: 10.5, color: TINTA_TENUE, fontWeight: 400 }}>{NOMBRE_PLAZA[c.r.plaza]}</span></Td>
                <Td>{c.ticket.folio}</Td>
                <Td color={TINTA_SUAVE}>{corto(c.ticket.f)} {c.ticket.hora}</Td>
                <Td style={{ minWidth: 220 }}>{parTexto(c)}</Td>
                <Td num>{pesos(c.base)}</Td>
                <Td num fuerte color={COLORES.comisiones.fuerte}>{pesos(c.monto)}</Td>
                <Td>{c.foto ? <VerFoto n={n} foto={c.foto} /> : <SubirFoto n={n} onFoto={f => acc.hacer({ accion: 'foto-comision', clave: c.clave, foto: f })} />}</Td>
                <Td><Chip color={ESTADO_COM[c.estado].color}>{ESTADO_COM[c.estado].texto}</Chip>{c.motivo ? <span style={{ display: 'block', fontSize: 10.5, color: TINTA_TENUE }}>{c.motivo}</span> : null}</Td>
              </tr>
            ))}
            {!lista.length && <tr><Td colSpan={9} color={TINTA_TENUE}>Nada en esta bandeja.</Td></tr>}
          </tbody>
        </table>
      </CajaDeTabla>
      <ComisionManual n={n} />
    </div>
  )
}

function ComisionManual({ n }) {
  const [reg, setReg] = useState('')
  const [f, setF] = useState(n.hoy)
  const [monto, setMonto] = useState('')
  const [concepto, setConcepto] = useState('')
  const [foto, setFoto] = useState(null)
  const acc = useAccion(n)
  const manuales = (n.estado.manuales ?? []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 20)
  return (
    <Seccion tema={COLORES.comisiones} titulo="Comisión manual" sub="Para una venta que el sistema no ve: queda autorizada y sale de la caja como las demás." data-comision-manual>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select aria-label="Empleado" value={reg} onChange={e => setReg(e.target.value)} style={campo}>
          <option value="">Empleado…</option>
          {n.config.empleados.filter(e => e.activo !== false).map(e => <option key={e.id} value={e.id}>{e.nombre} · {NOMBRE_PLAZA[e.plaza]}</option>)}
        </select>
        <input type="date" aria-label="Día" value={f} onChange={e => setF(e.target.value)} style={campo} />
        <input aria-label="Monto" placeholder="Monto" value={monto} onChange={e => setMonto(e.target.value.replace(/[^\d.]/g, ''))} style={{ ...campo, width: 100 }} />
        <input aria-label="Concepto" placeholder="Concepto" value={concepto} onChange={e => setConcepto(e.target.value)} style={{ ...campo, flex: 1, minWidth: 180 }} />
        {foto ? <span style={{ fontSize: 11.5, color: VERDE }}>✓ foto</span> : <SubirFoto n={n} onFoto={setFoto} />}
        <Boton tipo="primario" disabled={!reg || !Number(monto) || !concepto.trim() || acc.ocupado}
               onClick={async () => { if (await acc.hacer({ accion: 'comision-manual', registro: reg, fecha: f, monto: Number(monto), concepto, foto })) { setMonto(''); setConcepto(''); setFoto(null) } }}>Registrar</Boton>
      </div>
      {acc.error && <p style={{ color: ROJO, fontSize: 12 }}>{acc.error}</p>}
      {manuales.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', fontSize: 12 }}>
          {manuales.map(m => (
            <li key={m.id} style={{ padding: '4px 0', borderBottom: '1px solid ' + LINEA }}>
              {corto(m.fecha)} · {n.config.empleados.find(e => e.id === m.registro)?.nombre ?? m.registro} · {pesos(m.monto)} · {m.concepto}
              {m.foto && <VerFoto n={n} foto={m.foto} />}
              <Boton tipo="fantasma" onClick={() => acc.hacer({ accion: 'quitar-comision-manual', id: m.id })}>quitar</Boton>
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  )
}

// ── 4. Vacaciones y antigüedad ────────────────────────────────────────────

function Vacaciones({ n }) {
  const [persona, setPersona] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [cubre, setCubre] = useState('')
  const [notas, setNotas] = useState('')
  const acc = useAccion(n)
  const vac = n.estado.vacaciones ?? []
  const personas = n.config.empleados.filter(e => e.activo !== false).flatMap(e => (e.personas ?? []).map(p => ({ p, e })))
  const plazaDe = pid => personas.find(x => x.p.id === pid)?.e.plaza
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-vacaciones>
      <Aviso tono="neutro">
        Sólo lo ve el administrador. Los días que corresponden salen de la Ley Federal del Trabajo según los años cumplidos
        (12, 14, 16, 18, 20, y luego +2 cada cinco años), salvo que fijes otros para una persona en Parámetros. Se cuentan
        sólo los días laborables de su horario, y vencen a los seis meses del aniversario.
      </Aviso>
      <CajaDeTabla>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: FONDO_CABECERA }}><tr><Th>Persona</Th><Th>Sucursal</Th><Th>Ingreso</Th><Th>Antigüedad</Th><Th num>Corresponden</Th><Th num>Tomados</Th><Th num>Disponibles</Th><Th>Vencen</Th></tr></thead>
          <tbody>
            {personas.map(({ p, e }, i) => {
              const s = saldoVacaciones({ persona: p, registro: e, vacaciones: vac, hoy: n.hoy })
              return (
                <tr key={p.id} style={fila(i)} data-saldo-vacaciones={p.id}>
                  <Td fuerte>{p.nombre}</Td>
                  <Td color={TINTA_SUAVE}>{NOMBRE_PLAZA[e.plaza]}</Td>
                  <Td color={p.ingreso ? TINTA : AMBAR}>{p.ingreso ? corto(p.ingreso) + ' ' + p.ingreso.slice(0, 4) : 'captúrala en Parámetros'}</Td>
                  <Td>{s ? `${s.antiguedad.anios} años, ${s.antiguedad.meses} meses` : '—'}</Td>
                  <Td num>{s ? s.corresponden : '—'}</Td>
                  <Td num>{s ? s.tomados : '—'}</Td>
                  <Td num fuerte color={s?.porVencer ? AMBAR : VERDE}>{s ? s.disponibles : '—'}</Td>
                  <Td color={s?.porVencer ? AMBAR : TINTA_SUAVE}>{s?.vence ? `${corto(s.vence)}${s.porVencer ? ` · ⚠ en ${s.diasParaVencer} días` : ''}` : s ? `primer año el ${corto(s.proximoAniversario)}` : '—'}</Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CajaDeTabla>
      <Seccion tema={COLORES.sueldo} titulo="Registrar vacaciones">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select aria-label="Persona" value={persona} onChange={e => setPersona(e.target.value)} style={campo}>
            <option value="">Persona…</option>
            {personas.map(({ p, e }) => <option key={p.id} value={p.id}>{p.nombre} · {NOMBRE_PLAZA[e.plaza]}</option>)}
          </select>
          <input type="date" aria-label="Desde" value={desde} onChange={e => setDesde(e.target.value)} style={campo} />
          <input type="date" aria-label="Hasta" value={hasta} onChange={e => setHasta(e.target.value)} style={campo} />
          <input aria-label="Quién cubre" placeholder="Quién cubre" value={cubre} onChange={e => setCubre(e.target.value)} style={campo} />
          <input aria-label="Notas" placeholder="Notas" value={notas} onChange={e => setNotas(e.target.value)} style={{ ...campo, flex: 1, minWidth: 160 }} />
          <Boton tipo="primario" disabled={!persona || !desde || !hasta || acc.ocupado}
                 onClick={async () => { if (await acc.hacer({ accion: 'vacacion', persona, desde, hasta, cubre, notas })) { setDesde(''); setHasta(''); setCubre(''); setNotas('') } }}>Registrar</Boton>
        </div>
        {acc.error && <p style={{ color: ROJO, fontSize: 12 }}>{acc.error}</p>}
      </Seccion>
      <Seccion tema="neutro" titulo="Calendario de vacaciones" sinRelleno>
        {vac.length === 0 ? <p style={{ fontSize: 12, color: TINTA_TENUE, padding: '10px 14px', margin: 0 }}>Ninguna registrada.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: FONDO_CABECERA }}><tr><Th>Sucursal</Th><Th>Persona</Th><Th>Desde</Th><Th>Hasta</Th><Th>Cubre</Th><Th>Notas</Th><Th /></tr></thead>
            <tbody>
              {vac.slice().sort((a, b) => b.desde.localeCompare(a.desde)).map((v, i) => (
                <tr key={v.id} style={fila(i)}>
                  <Td>{NOMBRE_PLAZA[plazaDe(v.persona)] ?? '—'}</Td>
                  <Td fuerte>{personas.find(x => x.p.id === v.persona)?.p.nombre ?? v.persona}</Td>
                  <Td>{corto(v.desde)}</Td><Td>{corto(v.hasta)}</Td><Td>{v.cubre ?? '—'}</Td><Td color={TINTA_SUAVE}>{v.notas ?? ''}</Td>
                  <Td><Boton tipo="fantasma" onClick={() => acc.hacer({ accion: 'quitar-vacacion', id: v.id })}>quitar</Boton></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>
    </div>
  )
}

// ── 5. Parámetros ─────────────────────────────────────────────────────────

const slug = s => normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'empleado'

function Parametros({ n }) {
  const [cfg, setCfg] = useState(() => JSON.parse(JSON.stringify(n.config)))
  const [motivo, setMotivo] = useState('')
  const [estado, setEstado] = useState(null)
  useEffect(() => { setCfg(JSON.parse(JSON.stringify(n.config))) }, [n.config])
  const cambiaEmp = (i, k, v) => setCfg(c => ({ ...c, empleados: c.empleados.map((e, j) => (j === i ? { ...e, [k]: v } : e)) }))
  const cambiaPersona = (i, pi, k, v) => setCfg(c => ({ ...c, empleados: c.empleados.map((e, j) => (j === i ? { ...e, personas: e.personas.map((p, q) => (q === pi ? { ...p, [k]: v } : p)) } : e)) }))
  const cambiaParam = (ruta, v) => setCfg(c => {
    const p = JSON.parse(JSON.stringify(c.parametros)); let o = p
    for (const k of ruta.slice(0, -1)) o = o[k]
    o[ruta.at(-1)] = v
    return { ...c, parametros: p }
  })
  const agregar = () => setCfg(c => {
    let id = 'nuevo', i = 1
    while (c.empleados.some(e => e.id === id)) id = `nuevo-${++i}`
    return { ...c, empleados: [...c.empleados, { id, nombre: '', plaza: 'leon', usuarios: [], dias: [1, 2, 3, 4, 5], sueldo: null, bono: null, activo: true, personas: [{ id, nombre: '', ingreso: null, diasVacaciones: null }], quienPorDia: {} }] }
  })
  const guardar = async () => {
    setEstado({ guardando: true })
    // Un registro nuevo toma su identificador del nombre, una sola vez.
    const empleados = cfg.empleados.map(e => {
      if (!e.id.startsWith('nuevo')) return e
      let id = slug(e.nombre); let k = 1
      while (cfg.empleados.some(x => x !== e && x.id === id)) id = `${slug(e.nombre)}-${++k}`
      return { ...e, id, personas: e.personas.map((p, q) => (q === 0 ? { ...p, id, nombre: p.nombre || e.nombre } : p)) }
    })
    try {
      const r = await n.guardarConfig({ ...cfg, empleados }, motivo)
      setEstado({ ok: r.cambios?.length ? `Guardado: ${r.cambios.length} ${r.cambios.length === 1 ? 'cambio' : 'cambios'}` : 'No había cambios' })
      setMotivo('')
    } catch (e) { setEstado({ error: e.message || 'No se pudo guardar.' }) }
  }
  const p = cfg.parametros
  const num = v => (v === '' || v === null || v === undefined ? null : Number(v))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-parametros-nomina>
      <Seccion tema={COLORES.sueldo} titulo="Empleados y registros de pago"
               sub="Un registro es quien cobra. Si dos personas comparten registro (Daniela y Jenni), se agregan como personas. El usuario del punto de venta es el nombre con el que inicia sesión en la caja."
               extra={<Boton data-agregar-empleado onClick={agregar}>+ Agregar empleado</Boton>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cfg.empleados.map((e, i) => (
            <div key={e.id + i} data-editar-empleado={e.id} style={{ border: '1px solid ' + LINEA, borderLeft: '5px solid ' + (e.activo === false ? TINTA_TENUE : COLORES.sueldo.fuerte), borderRadius: 14, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, opacity: e.activo === false ? 0.6 : 1 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input aria-label="Nombre del registro" placeholder="Nombre" value={e.nombre} onChange={ev => cambiaEmp(i, 'nombre', ev.target.value)} style={{ ...campo, flex: 1, minWidth: 200, fontWeight: 700 }} />
                <select aria-label="Sucursal" value={e.plaza} onChange={ev => cambiaEmp(i, 'plaza', ev.target.value)} style={campo}>
                  {PLAZAS_NOMINA.map(pl => <option key={pl} value={pl}>{NOMBRE_PLAZA[pl]}</option>)}
                </select>
                <label style={{ fontSize: 12 }}>Sueldo semanal $<input aria-label="Sueldo semanal" value={e.sueldo ?? ''} onChange={ev => cambiaEmp(i, 'sueldo', num(ev.target.value.replace(/[^\d.]/g, '')))} style={{ ...campo, width: 90 }} /></label>
                <label style={{ fontSize: 12 }}>Bono $<input aria-label="Bono de puntualidad" value={e.bono ?? ''} onChange={ev => cambiaEmp(i, 'bono', num(ev.target.value.replace(/[^\d.]/g, '')))} style={{ ...campo, width: 80 }} /></label>
                <label style={{ fontSize: 12 }}><input type="checkbox" checked={e.activo !== false} onChange={ev => cambiaEmp(i, 'activo', ev.target.checked)} /> activo</label>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: TINTA_SUAVE }}>Días que abre:</span>
                {DIAS.map(d => (
                  <label key={d}><input type="checkbox" checked={(e.dias ?? []).includes(d)}
                                        onChange={ev => cambiaEmp(i, 'dias', ev.target.checked ? [...(e.dias ?? []), d].sort() : (e.dias ?? []).filter(x => x !== d))} /> {INICIAL_DIA[d]}</label>
                ))}
                <span style={{ color: TINTA_TENUE }}>· valor del día {pesos(valorDia(e))}</span>
              </div>
              <label style={{ fontSize: 12 }}>Usuarios del punto de venta (separados por coma):{' '}
                <input aria-label="Usuarios del punto de venta" value={(e.usuarios ?? []).join(', ')}
                       onChange={ev => cambiaEmp(i, 'usuarios', ev.target.value.split(',').map(x => x.trim()).filter(Boolean))} style={{ ...campo, width: '100%', maxWidth: 420 }} /></label>
              {(e.personas ?? []).map((pe, pi) => (
                <div key={pe.id + pi} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, paddingLeft: 10, borderLeft: '2px solid ' + LINEA }}>
                  <input aria-label="Nombre de la persona" placeholder="Persona" value={pe.nombre} onChange={ev => cambiaPersona(i, pi, 'nombre', ev.target.value)} style={{ ...campo, minWidth: 160 }} />
                  <label>Ingreso <input type="date" aria-label={`Fecha de ingreso de ${pe.nombre || 'la persona'}`} data-ingreso={pe.id} value={pe.ingreso ?? ''} onChange={ev => cambiaPersona(i, pi, 'ingreso', ev.target.value || null)} style={campo} /></label>
                  <label>Días de vacaciones <input aria-label="Días de vacaciones" placeholder="según la ley" value={pe.diasVacaciones ?? ''} onChange={ev => cambiaPersona(i, pi, 'diasVacaciones', num(ev.target.value.replace(/\D/g, '')))} style={{ ...campo, width: 100 }} /></label>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Seccion>
      <Seccion tema={COLORES.comisiones} titulo="Comisiones">
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5 }}>
          <label>Porcentaje <input aria-label="Porcentaje de comisión" value={Math.round(p.pctComision * 1000) / 10} onChange={ev => cambiaParam(['pctComision'], Number(ev.target.value.replace(/[^\d.]/g, '')) / 100)} style={{ ...campo, width: 60 }} /> %</label>
          {[['funda', 'Funda'], ['hidrogel', 'Mica de hidrogel'], ['sticker', 'Sticker grande']].map(([t, et]) => (
            <span key={t} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" aria-label={`${et} participa`} checked={p.categorias[t] !== false} onChange={ev => cambiaParam(['categorias', t], ev.target.checked)} />
              {et} desde $<input aria-label={`Precio mínimo de ${et}`} value={p.minimos[t] ?? ''} onChange={ev => cambiaParam(['minimos', t], num(ev.target.value.replace(/[^\d.]/g, '')) ?? 0)} style={{ ...campo, width: 70 }} />
            </span>
          ))}
        </div>
      </Seccion>
      <Seccion tema="alerta" titulo="Horarios de apertura y tolerancia" sub="La puntualidad se mide con la primera apertura de caja del día contra esta hora.">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead><tr><Th>Sucursal</Th>{DIAS.map(d => <Th key={d}>{NOMBRE_DIA[d]}</Th>)}<Th>Tolerancia</Th></tr></thead>
            <tbody>
              {PLAZAS_NOMINA.map(pl => (
                <tr key={pl}>
                  <Td fuerte>{NOMBRE_PLAZA[pl]}</Td>
                  {DIAS.map(d => <td key={d} style={{ padding: 4 }}><input type="time" aria-label={`Apertura de ${NOMBRE_PLAZA[pl]} el ${NOMBRE_DIA[d]}`} value={p.horarios[pl]?.[d] ?? ''} onChange={ev => cambiaParam(['horarios', pl, d], ev.target.value || null)} style={{ ...campo, padding: '5px 6px' }} /></td>)}
                  <td style={{ padding: 4 }}><input aria-label={`Tolerancia de ${NOMBRE_PLAZA[pl]}`} value={p.tolerancia[pl] ?? ''} onChange={ev => cambiaParam(['tolerancia', pl], Number(ev.target.value.replace(/\D/g, '')))} style={{ ...campo, width: 56 }} /> min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input aria-label="Motivo del cambio" placeholder="Motivo del cambio (queda en la bitácora)" value={motivo} onChange={e => setMotivo(e.target.value)} style={{ ...campo, flex: 1, minWidth: 240 }} />
        <Boton tipo="primario" data-guardar-parametros disabled={estado?.guardando} onClick={guardar}>{estado?.guardando ? 'Guardando…' : 'Guardar parámetros'}</Boton>
        {estado?.ok && <span data-parametros-guardados style={{ color: VERDE, fontSize: 12 }}>✓ {estado.ok}</span>}
        {estado?.error && <span role="alert" style={{ color: ROJO, fontSize: 12 }}>{estado.error}</span>}
      </div>
    </div>
  )
}

// ── 6. Bitácora ───────────────────────────────────────────────────────────

function Bitacora({ n }) {
  return (
    <CajaDeTabla alto={560}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }} data-bitacora>
        <thead style={{ position: 'sticky', top: 0, background: FONDO_CABECERA }}><tr><Th>Cuándo</Th><Th>Quién</Th><Th>Qué</Th><Th>Detalle</Th><Th>Motivo</Th></tr></thead>
        <tbody>
          {n.bitacora.map((b, i) => (
            <tr key={i} style={fila(i)}>
              <Td color={TINTA_SUAVE} style={{ whiteSpace: 'nowrap' }}>{new Date(b.cuando).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Td>
              <Td>{b.quien}</Td><Td fuerte>{b.accion}</Td><Td style={{ minWidth: 240 }}>{b.detalle}</Td><Td color={TINTA_SUAVE}>{b.motivo ?? ''}</Td>
            </tr>
          ))}
          {!n.bitacora.length && <tr><Td colSpan={5} color={TINTA_TENUE}>Todavía no hay movimientos.</Td></tr>}
        </tbody>
      </table>
    </CajaDeTabla>
  )
}
