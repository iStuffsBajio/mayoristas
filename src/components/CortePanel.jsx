// El corte semanal de cada sucursal.
//
// Lo pidió el dueño el 2026-11-09, enseñando el Excel que hoy llena cada tienda
// a mano. La idea es la misma tabla, reconocible, pero con una diferencia que
// es toda la razón de existir: **todo se llena solo desde el punto de venta y
// lo único que teclea la tienda es el conteo de billetes y monedas.** Las
// cuentas están en `lib/corte.js`, con pruebas; aquí sólo se pintan.
//
// Una tienda ve SÓLO su plaza. El administrador ve cada una por separado o
// todas juntas, con avisos de faltantes. Quien lo decide es el servidor.
//
// ── Cada concepto tiene su color, y es el mismo en toda la pantalla ────────
//
// Lo pidió el dueño el 2026-11-09: «se ve demasiado plana, no se distingue una
// sección de la otra… otras entradas en verde, ventas en azul, que hagan
// relación al concepto». Así que un concepto se reconoce por su color en la
// tabla de la semana, en su lista y en la cascada del estado de resultados:
//
//   ventas azul · otras entradas verde · tarjeta y transferencia verde azulado
//   gastos ámbar · sueldo morado · comisiones rosa · la caja en tinta
//
// ── Tres cosas que esta pantalla dice a propósito ──────────────────────────
//
//  · Las ventas se actualizan con el respaldo de cada noche, desde las 20:30:
//    lo de hoy se ve mañana. No es «tiempo real» y decirlo sería mentir.
//  · Sin fondo de caja, o en una semana sin control de salidas, NO se pinta
//    color: se dice por qué. Un verde o un rojo calculado sobre un número que
//    nadie puso es peor que un hueco.
//  · No hay tolerancia. Un peso de más o de menos ya es sobrante o faltante.

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCorte } from '../lib/useCorte'
import {
  DENOMINACIONES, SEMAFORO_DE_CORTE, totalContado, limpiarConteo, cantidadValida, resumenGlobal,
} from '../lib/corte'
import { rankingDeMayoristas, RANGOS_DE_MAYORISTAS } from '../lib/mayoristas'
import { MOTIVOS_DE_MAYOREO, FORMAS_ELECTRONICAS } from '../lib/reglasMayoreo'
import { pesos } from '../lib/caja'

const TINTA       = '#101619'
const TINTA_SUAVE = '#4A5A61'
const TINTA_TENUE = '#8598A1'
const LINEA       = '#D6E0E4'
const FONDO_CAB   = '#F7FAFB'
const VERDE       = '#4B7A1B'
const ROJO        = '#C4156F'
const AZUL        = '#0288AD'
const GRIS        = '#8598A1'
const AMBAR       = '#B45309'

/** El color de cada concepto: fuerte para el texto, suave para el fondo. */
const C = {
  ventas:      { fuerte: '#0277A0', suave: 'rgba(2,136,173,0.08)',   borde: 'rgba(2,136,173,0.30)',   barra: 'rgba(2,136,173,0.22)' },
  entradas:    { fuerte: '#3F6F14', suave: 'rgba(75,122,27,0.09)',   borde: 'rgba(75,122,27,0.32)',   barra: 'rgba(75,122,27,0.25)' },
  electronico: { fuerte: '#0F766E', suave: 'rgba(15,118,110,0.08)',  borde: 'rgba(15,118,110,0.30)',  barra: 'rgba(15,118,110,0.22)' },
  gastos:      { fuerte: '#B45309', suave: 'rgba(180,83,9,0.08)',    borde: 'rgba(180,83,9,0.30)',    barra: 'rgba(180,83,9,0.22)' },
  sueldo:      { fuerte: '#6D28D9', suave: 'rgba(109,40,217,0.07)',  borde: 'rgba(109,40,217,0.28)',  barra: 'rgba(109,40,217,0.20)' },
  comisiones:  { fuerte: '#BE185D', suave: 'rgba(190,24,93,0.07)',   borde: 'rgba(190,24,93,0.28)',   barra: 'rgba(190,24,93,0.20)' },
  piezas:      { fuerte: '#4B7A1B', suave: 'rgba(75,122,27,0.06)',   borde: 'rgba(75,122,27,0.25)',   barra: 'rgba(75,122,27,0.20)' },
  caja:        { fuerte: TINTA,     suave: 'rgba(16,22,25,0.04)',    borde: LINEA,                    barra: 'rgba(16,22,25,0.14)' },
  alerta:      { fuerte: AMBAR,     suave: 'rgba(180,83,9,0.06)',    borde: 'rgba(180,83,9,0.30)',    barra: 'rgba(180,83,9,0.20)' },
}

const COLOR = { verde: VERDE, rojo: ROJO, azul: AZUL, gris: GRIS }
const PUNTO = { verde: '🟢', rojo: '🔴', azul: '🔵', gris: '⚪' }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fecha = iso => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d) }
const diaCorto = iso => `${fecha(iso).getDate()}/${String(fecha(iso).getMonth() + 1).padStart(2, '0')}`
const diaMes = iso => `${fecha(iso).getDate()}/${String(fecha(iso).getMonth() + 1).padStart(2, '0')}/${fecha(iso).getFullYear()}`
const tituloSemana = ({ desde, hasta }) => {
  const a = fecha(desde), b = fecha(hasta)
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} al ${b.getDate()} de ${MESES[b.getMonth()]} de ${b.getFullYear()}`
    : `${a.getDate()} de ${MESES[a.getMonth()]} al ${b.getDate()} de ${MESES[b.getMonth()]} de ${b.getFullYear()}`
}
const cuando = iso => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)
const porciento = v => `${(v * 100).toFixed(v >= 0.1 ? 0 : 1)}%`

// ── Piezas pequeñas ───────────────────────────────────────────────────────

function Boton({ tipo = 'secundario', style, disabled, children, ...resto }) {
  const colores = {
    primario:   { background: 'var(--accent)',  color: 'var(--accent-ink)' },
    secundario: { background: 'var(--surface)', color: 'var(--ink)' },
    fantasma:   { background: 'transparent',    color: 'var(--muted)' },
  }[tipo]
  return (
    <button type="button" disabled={disabled} {...resto}
            style={{
              border: 0, borderRadius: 999, padding: '9px 16px', fontSize: 12.5, fontWeight: 700,
              fontFamily: 'inherit', whiteSpace: 'nowrap', lineHeight: 1.2,
              cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
              ...colores, ...style,
            }}>
      {children}
    </button>
  )
}

function Pildora({ activa, onClick, children, ...resto }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa}
            className={'chip-plaza' + (activa ? ' activa' : '')} {...resto}>
      <span className="chip-plaza-texto">{children}</span>
    </button>
  )
}

function Caja({ tono = 'neutro', titulo, children, ...resto }) {
  const ambar = tono === 'ambar'
  return (
    <div {...resto} style={{
      padding: '11px 14px', borderRadius: 16, lineHeight: 1.55, fontSize: 12,
      background: ambar ? C.alerta.suave : 'rgba(16,22,25,0.03)',
      border: '1px solid ' + (ambar ? C.alerta.borde : LINEA), color: TINTA_SUAVE,
    }}>
      {titulo && <strong style={{ display: 'block', color: ambar ? AMBAR : TINTA, fontSize: 12.5, marginBottom: 2 }}>{titulo}</strong>}
      {children}
    </div>
  )
}

const Tarjeta = ({ children, ...resto }) => (
  <section {...resto} style={{ border: '1px solid ' + LINEA, borderRadius: 24, padding: '18px 20px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 16 }}>
    {children}
  </section>
)

/**
 * Una sección con el color de su concepto: cabecera teñida con el título y el
 * total, y el contenido debajo. Es lo que separa una cosa de la otra.
 */
function Seccion({ c = C.caja, titulo, total, sub, children, sinRelleno = false, ...resto }) {
  return (
    <section {...resto} style={{ border: '1px solid ' + c.borde, borderRadius: 18, overflow: 'hidden', background: '#fff', minWidth: 0 }}>
      <header style={{
        background: c.suave, borderBottom: '1px solid ' + c.borde, padding: '9px 14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
      }}>
        <span>
          <strong style={{ color: c.fuerte, fontSize: 12.5, fontWeight: 800 }}>{titulo}</strong>
          {sub && <span style={{ display: 'block', fontSize: 10.5, color: TINTA_TENUE, marginTop: 1 }}>{sub}</span>}
        </span>
        {total !== undefined && total !== null && (
          <span style={{ color: c.fuerte, fontWeight: 800, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{total}</span>
        )}
      </header>
      <div style={sinRelleno ? undefined : { padding: '10px 14px' }}>{children}</div>
    </section>
  )
}

/** Una cifra grande con el color de su concepto. */
function Cifra({ c = C.caja, titulo, valor, sub, ...resto }) {
  return (
    <div {...resto} style={{
      flex: '1 1 150px', minWidth: 140, padding: '10px 14px', borderRadius: 16,
      background: c.suave, borderLeft: '4px solid ' + c.fuerte,
    }}>
      <div style={{ fontSize: 10.5, color: TINTA_SUAVE, fontWeight: 600 }}>{titulo}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c.fuerte, fontVariantNumeric: 'tabular-nums', lineHeight: 1.25 }}>{valor}</div>
      {sub && <div style={{ fontSize: 10.5, color: TINTA_TENUE, marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

/** Una barra horizontal proporcional, detrás de una cifra. */
const Barra = ({ parte, c }) => (
  <span aria-hidden="true" style={{
    position: 'absolute', insetBlock: 4, insetInlineEnd: 0, borderRadius: 6, background: c.barra,
    width: `${Math.max(0, Math.min(1, parte)) * 100}%`,
  }} />
)
const ConBarra = ({ parte, c, children, fuerte }) => (
  <td style={{ position: 'relative', padding: '7px 10px', textAlign: 'right', minWidth: 110, fontVariantNumeric: 'tabular-nums', fontWeight: fuerte ? 800 : 600, color: TINTA }}>
    <Barra parte={parte} c={c} />
    <span style={{ position: 'relative' }}>{children}</span>
  </td>
)

/** El estado de una semana, con su color y lo que significa. */
function Semaforo({ estado, diferencia, compacto = false }) {
  const s = SEMAFORO_DE_CORTE[estado] ?? SEMAFORO_DE_CORTE['sin-conteo']
  const color = COLOR[s.color]
  const monto = diferencia === null || diferencia === undefined ? '' : ` · ${pesos(Math.abs(diferencia))}`
  const texto = estado === 'faltante' ? `Faltante de ${pesos(Math.abs(diferencia))}`
    : estado === 'sobrante' ? `Sobrante de ${pesos(Math.abs(diferencia))}`
    : estado === 'cuadra' ? 'Caja cuadrada · $0.00' : s.texto
  return (
    <span data-semaforo={s.color} data-estado={estado}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: compacto ? 11.5 : 12.5, fontWeight: 800, color }}>
      <span aria-hidden="true">{PUNTO[s.color]}</span>
      <span>{compacto ? s.texto + (estado === 'faltante' || estado === 'sobrante' ? monto : '') : texto}</span>
    </span>
  )
}

/** El contenedor de tabla de la casa: el mismo de Inventarios. */
const Tabla = ({ children, alto, ...resto }) => (
  <div {...resto} style={{ border: '1px solid ' + LINEA, borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
    <div style={{ overflowX: 'auto', ...(alto ? { maxHeight: alto, overflowY: 'auto' } : {}) }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>{children}</table>
    </div>
  </div>
)
const Cabecera = ({ children, fondo = FONDO_CAB }) => (
  <thead style={{ position: 'sticky', top: 0, background: fondo, zIndex: 1 }}>{children}</thead>
)
const Th = ({ children, num, color, style }) => (
  <th style={{ textAlign: num ? 'right' : 'left', padding: '9px 10px', fontSize: 11, fontWeight: 700, color: color ?? TINTA_SUAVE, borderBottom: '1px solid ' + LINEA, whiteSpace: 'nowrap', ...style }}>{children}</th>
)
const Td = ({ children, num, fuerte, color, title, style }) => (
  <td title={title} style={{ padding: '7px 10px', fontSize: 12.5, textAlign: num ? 'right' : 'left', fontVariantNumeric: num ? 'tabular-nums' : 'normal', fontWeight: fuerte ? 800 : 400, color: color || TINTA, whiteSpace: 'nowrap', ...style }}>{children}</td>
)
const fila = i => ({ background: i % 2 ? '#FBFDFD' : '#fff', borderBottom: '1px solid rgba(16,22,25,0.04)' })

/**
 * Cabecera que ordena al hacer clic, como las de Inventarios. La clave del
 * orden es TEXTO: una función guardada en `useState` se ejecuta, no se guarda.
 */
function ThOrd({ children, campo, orden, setOrden, num }) {
  const activa = orden.campo === campo
  return (
    <th aria-sort={activa ? (orden.dir === -1 ? 'descending' : 'ascending') : 'none'}
        onClick={() => setOrden(o => ({ campo, dir: o.campo === campo ? -o.dir : -1 }))}
        title="Clic para ordenar"
        style={{
          textAlign: num ? 'right' : 'left', padding: '9px 10px', fontWeight: 700, fontSize: 11,
          color: activa ? TINTA : TINTA_SUAVE, borderBottom: '1px solid ' + LINEA, whiteSpace: 'nowrap',
          cursor: 'pointer', userSelect: 'none',
        }}>
      {children}
      <span style={{ marginLeft: 4, fontSize: 9, color: activa ? ROJO : 'rgba(133,152,161,0.5)' }}>
        {activa ? (orden.dir === -1 ? '▼' : '▲') : '⇅'}
      </span>
    </th>
  )
}
const ordenar = (xs, { campo, dir }) => [...xs].sort((a, b) => {
  const x = a[campo], y = b[campo]
  if (typeof x === 'number' || typeof y === 'number') return dir * (num(x) - num(y))
  return dir * String(x ?? '').localeCompare(String(y ?? ''))
})

// ═══════════════════════════════════════════════════════════════════════════
//  Una semana
// ═══════════════════════════════════════════════════════════════════════════

/** Las ventas de la semana, día por día, tal como salen del punto de venta. */
function VentasDeLaSemana({ b }) {
  const hayDesglose = !!b.piezas
  const maxVenta = Math.max(1, ...b.dias.map(d => num(d.ventaTotal)))
  const electronico = d => num(d.tarjeta) + num(d.transferencia)
  return (
    <Seccion c={C.ventas} titulo="Ventas de la semana" total={pesos(b.ventaTotal)}
             sub="Del punto de venta, día por día. Llegan con el respaldo de cada noche, desde las 20:30: lo de hoy se ve mañana."
             sinRelleno>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }} data-tabla-ventas>
          <thead style={{ background: FONDO_CAB }}>
            <tr>
              <Th>Día</Th><Th>Fecha</Th>
              <Th num color={C.ventas.fuerte}>Ventas ($)</Th>
              <Th num color={C.ventas.fuerte}>Efectivo</Th>
              <Th num color={C.electronico.fuerte}>Tarjeta + transf.</Th>
              <Th num color={C.piezas.fuerte} style={{ borderLeft: '1px solid ' + LINEA }}>Fundas</Th>
              <Th num color={C.piezas.fuerte}>Hidrogel</Th>
              <Th num color={C.piezas.fuerte}>Stickers</Th>
              <Th num color={C.piezas.fuerte}>Piezas</Th>
            </tr>
          </thead>
          <tbody>
            {b.dias.map((d, i) => (
              <tr key={d.f} style={fila(i)} data-dia-corte={d.f}>
                <Td fuerte>{d.dia[0].toUpperCase() + d.dia.slice(1)}</Td>
                <Td color={TINTA_SUAVE}>{diaMes(d.f)}</Td>
                {/* Un día sin dato NO es un día con cero: se dice. */}
                {d.hayDato
                  ? <ConBarra parte={num(d.ventaTotal) / maxVenta} c={C.ventas}>{pesos(d.ventaTotal)}</ConBarra>
                  : <Td num color={TINTA_TENUE}>—</Td>}
                <Td num color={TINTA_SUAVE}>{d.hayDato ? pesos(d.efectivo) : '—'}</Td>
                <Td num color={C.electronico.fuerte}>{d.hayDato ? pesos(electronico(d)) : '—'}</Td>
                <Td num style={{ borderLeft: '1px solid ' + LINEA }}>{d.piezas ? d.piezas.fundas : '—'}</Td>
                <Td num>{d.piezas ? d.piezas.hidrogel : '—'}</Td>
                <Td num>{d.piezas ? d.piezas.stickers : '—'}</Td>
                <Td num fuerte color={C.piezas.fuerte}>{d.piezas ? d.piezas.total : '—'}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: C.ventas.suave, borderTop: '2px solid ' + C.ventas.borde }}>
              <Td fuerte color={C.ventas.fuerte}>Total semanal</Td><Td />
              <Td num fuerte color={C.ventas.fuerte}>{pesos(b.ventaTotal)}</Td>
              <Td num fuerte color={C.ventas.fuerte}>{pesos(b.efectivoCobrado)}</Td>
              <Td num fuerte color={C.electronico.fuerte}>{pesos(b.ingresosElectronicos)}</Td>
              <Td num fuerte style={{ borderLeft: '1px solid ' + LINEA }}>{hayDesglose ? b.piezas.fundas : '—'}</Td>
              <Td num fuerte>{hayDesglose ? b.piezas.hidrogel : '—'}</Td>
              <Td num fuerte>{hayDesglose ? b.piezas.stickers : '—'}</Td>
              <Td num fuerte color={C.piezas.fuerte}>{hayDesglose ? b.piezas.total : '—'}</Td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p style={{ fontSize: 10.5, color: TINTA_TENUE, margin: 0, padding: '8px 14px', lineHeight: 1.5 }}>
        {hayDesglose
          ? <>Sólo cuentan fundas, hidrogel y stickers
              {b.piezas.otros > 0 && ` (se vendieron además ${b.piezas.otros} de otros productos, que no suman)`}
              ; lo cobrado a $0.01 es de un mayorista y no es una pieza.</>
          : 'El desglose de piezas se llena con la próxima sincronización.'}
      </p>
    </Seccion>
  )
}

/** Una lista de movimientos de caja con el color de su concepto. */
function Lista({ c, titulo, lista, total, vacio, conTrabajador = false }) {
  return (
    <Seccion c={c} titulo={titulo} total={pesos(total)} sinRelleno data-lista-corte={titulo}>
      {lista.length === 0
        ? <p style={{ fontSize: 11.5, color: TINTA_TENUE, margin: 0, padding: '10px 14px' }}>{vacio}</p>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {lista.map((m, i) => (
                  <tr key={i} style={fila(i)}>
                    <Td color={TINTA_TENUE}>{diaCorto(m.f)}</Td>
                    <td style={{ padding: '7px 10px', fontSize: 12, color: TINTA }}>
                      {conTrabajador && m.trabajador
                        ? <><strong>{m.trabajador}</strong><span style={{ display: 'block', fontSize: 10.5, color: TINTA_TENUE }}>{m.concepto}</span></>
                        : (m.concepto || <em style={{ color: TINTA_TENUE }}>sin concepto en la caja</em>)}
                      {/* La regla del dueño: sueldo o comisión Y el nombre del trabajador. */}
                      {m.sinNombre && (
                        <span data-sin-nombre style={{ display: 'block', fontSize: 10.5, color: AMBAR, fontWeight: 700 }}>
                          ⚠ falta el nombre del trabajador
                        </span>
                      )}
                    </td>
                    <Td num fuerte color={c.fuerte}>{pesos(m.monto)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Seccion>
  )
}

/**
 * El estado de resultados como CASCADA: de las ventas a lo que tiene que haber
 * en la caja, renglón por renglón y cada uno con el color de su concepto. La
 * barra de cada renglón es su tamaño frente a la venta de la semana.
 */
function EstadoDeResultados({ b, ciclo, esAdmin }) {
  const base = Math.max(1, num(b.ventaTotal) + num(b.entradas))
  const R = ({ c = C.caja, signo, etiqueta, valor, nota, fuerte, total, colorValor }) => (
    <tr style={{ background: total ? c.suave : '#fff', borderBottom: '1px solid rgba(16,22,25,0.05)' }}>
      <td style={{ width: 8, padding: 0, background: total ? c.fuerte : 'transparent' }} />
      <td style={{ padding: '7px 10px', fontSize: 12.5 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          {!total && <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 99, background: c.fuerte, flex: 'none' }} />}
          <span style={{ color: fuerte || total ? TINTA : TINTA_SUAVE, fontWeight: fuerte || total ? 800 : 500 }}>{etiqueta}</span>
        </span>
        {nota && <span style={{ display: 'block', fontSize: 10.5, color: TINTA_TENUE, marginLeft: total ? 0 : 16 }}>{nota}</span>}
      </td>
      <td style={{ padding: '7px 4px', width: 18, textAlign: 'center', color: TINTA_TENUE, fontWeight: 800 }}>{signo}</td>
      {typeof valor === 'number'
        ? <ConBarra parte={Math.abs(valor) / base} c={c} fuerte={fuerte || total}>
            <span style={{ color: colorValor ?? (total ? c.fuerte : TINTA) }}>{pesos(Math.abs(valor))}</span>
          </ConBarra>
        : <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12.5, fontWeight: 800, color: colorValor ?? TINTA, whiteSpace: 'nowrap' }}>{valor}</td>}
    </tr>
  )
  const colorDif = b.diferencia === null ? TINTA : b.diferencia === 0 ? VERDE : b.diferencia < 0 ? ROJO : AZUL
  return (
    <Seccion c={C.caja} titulo="Estado de resultados" sub="De lo vendido a lo que tiene que haber en la caja" sinRelleno data-estado-resultados>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <R c={C.ventas} signo="" etiqueta="Ventas (punto de venta)" valor={num(b.ventaTotal)} fuerte />
          <R c={C.electronico} signo="−" etiqueta="Pagos con tarjeta" valor={num(b.tarjeta)} />
          <R c={C.electronico} signo="−" etiqueta="Transferencias" valor={num(b.transferencia)} />
          {num(b.otrasNoEfectivo) > 0 && <R c={C.electronico} signo="−" etiqueta="Otras formas de pago" nota="vales, crédito" valor={num(b.otrasNoEfectivo)} />}
          <R c={C.ventas} signo="=" etiqueta="Efectivo cobrado" valor={num(b.efectivoCobrado)} total />
          {num(b.devoluciones) > 0 && <R c={C.caja} signo="−" etiqueta="Devoluciones en efectivo" valor={num(b.devoluciones)} />}
          <R c={C.entradas} signo="+" etiqueta="Otras entradas" valor={num(b.entradas)} />
          <R c={C.gastos} signo="−" etiqueta="Gastos" valor={num(b.gastos)} />
          <R c={C.sueldo} signo="−" etiqueta="Sueldo" valor={num(b.sueldo)} />
          <R c={C.comisiones} signo="−" etiqueta="Comisiones" valor={num(b.comisiones)} />
          <R c={C.caja} signo="=" etiqueta="Esperado en caja (efectivo teórico)" valor={num(b.esperado)} total />
          <R c={C.caja} signo="+" etiqueta="Fondo de caja" valor={b.fondo === null ? 'sin asignar' : num(b.fondo)} colorValor={b.fondo === null ? AMBAR : undefined} />
          <R c={C.caja} signo="=" etiqueta={ciclo ? 'Debe haber en caja (acumulado del ciclo)' : 'Debe haber en caja'}
             nota={ciclo ? 'incluye lo esperado de las semanas anteriores: el efectivo se va juntando' : 'fondo + esperado'}
             valor={b.esperadoEnCaja === null ? '—' : num(b.esperadoEnCaja)} total />
          <R c={C.caja} signo="" etiqueta="Total físico contado" valor={b.contado === null ? 'falta el corte' : num(b.contado)} colorValor={b.contado === null ? TINTA_TENUE : undefined} />
          <R c={C.caja} signo="" etiqueta="Diferencia (cuadre)" fuerte
             valor={b.diferencia === null ? '—' : (b.diferencia < 0 ? '− ' : b.diferencia > 0 ? '+ ' : '') + pesos(Math.abs(b.diferencia))}
             colorValor={colorDif} />
          <R c={C.caja} signo="" etiqueta="Efectivo neto entregable" nota="lo contado menos el fondo, que se queda"
             valor={b.entregable === null ? '—' : pesos(b.entregable)} />
        </tbody>
      </table>
      {b.estado === 'sin-fondo' && (
        <p style={{ fontSize: 11, color: AMBAR, margin: 0, padding: '8px 14px', lineHeight: 1.5 }}>
          No se puede comparar: falta el fondo de caja de esta plaza. {esAdmin
            ? 'Asígnalo arriba, en «Fondo de caja».'
            : 'Pídele al administrador que lo asigne.'}
        </p>
      )}
      {b.estado === 'sin-control' && (
        <p style={{ fontSize: 11, color: AMBAR, margin: 0, padding: '8px 14px', lineHeight: 1.5 }}>
          {b.diasSinControl === 7 ? 'Toda' : `${b.diasSinControl} días de`} esta semana es de antes de que la plaza registrara sus
          salidas en el punto de venta: lo esperado es un máximo, no una cifra, y no se compara.
        </p>
      )}
    </Seccion>
  )
}

const aTexto = c => Object.fromEntries(DENOMINACIONES.map(d => [d, c?.[d] ? String(c[d]) : '']))

/**
 * El conteo de billetes y monedas: lo único que captura la tienda.
 *
 * La diferencia se calcula MIENTRAS se escribe, con lo que llevas, para que
 * quien cuenta vea si cuadra antes de guardar. Lo que se guarda lo vuelve a
 * sumar el servidor.
 */
function ConteoDeEfectivo({ b, plaza, editable, onGuardar }) {
  const guardado = b.conteo?.cantidades ?? {}
  const [borrador, setBorrador] = useState(() => aTexto(guardado))
  const [obs, setObs] = useState(b.conteo?.observaciones ?? '')
  const [estado, setEstado] = useState(null)

  // Si lo guardado cambia desde fuera —otra recarga, otro empleado— se parte de
  // ello, no de un borrador viejo.
  useEffect(() => {
    setBorrador(aTexto(b.conteo?.cantidades))
    setObs(b.conteo?.observaciones ?? '')
    setEstado(null)
  }, [b.clave, b.conteo?.cuando])

  const invalidas = DENOMINACIONES.filter(d => borrador[d] !== '' && !cantidadValida(borrador[d]))
  const limpio = limpiarConteo(borrador)
  const total = totalContado(limpio)
  const sucio = JSON.stringify(limpio) !== JSON.stringify(limpiarConteo(guardado)) || obs !== (b.conteo?.observaciones ?? '')
  const hayAlgo = DENOMINACIONES.some(d => borrador[d] !== '')

  // Lo que dice la caja con lo que llevas escrito.
  const puedeJuzgar = b.conControl && b.esperadoEnCaja !== null && hayAlgo
  const dif = puedeJuzgar ? total - b.esperadoEnCaja : null
  const previa = dif === null ? null : dif === 0 ? 'cuadra' : dif < 0 ? 'faltante' : 'sobrante'

  const guardar = async () => {
    setEstado({ guardando: true })
    try {
      await onGuardar({ plaza, semana: b.clave, cantidades: limpio, observaciones: obs })
      setEstado({ guardado: true })
    } catch (e) {
      setEstado({ error: e.message || 'No se pudo guardar el corte.' })
    }
  }

  return (
    <Seccion c={C.caja} titulo="Corte de efectivo" total={pesos(total)}
             sub={editable ? 'Cuenta los billetes y monedas y escribe cuántos hay de cada uno' : 'Lo cuenta cada tienda en su pantalla; aquí se ve, no se captura'}
             sinRelleno data-conteo={b.clave}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ background: FONDO_CAB }}><tr><Th>Billete o moneda</Th><Th num>Cantidad</Th><Th num>Total</Th></tr></thead>
        <tbody>
          {DENOMINACIONES.map((d, i) => {
            const q = borrador[d]
            const malo = invalidas.includes(d)
            const conValor = q !== '' && cantidadValida(q) && Number(q) > 0
            return (
              <tr key={d} style={{ ...fila(i), ...(conValor ? { background: 'rgba(75,122,27,0.05)' } : {}) }}>
                <Td fuerte>
                  ${d}
                  <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: TINTA_TENUE, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {d >= 20 ? 'billete' : 'moneda'}
                  </span>
                </Td>
                <td style={{ padding: '4px 10px', textAlign: 'right' }}>
                  <input type="text" inputMode="numeric" disabled={!editable}
                         aria-label={`Cantidad de billetes o monedas de $${d}`} data-denominacion={d}
                         value={q} placeholder="0"
                         onChange={e => { setBorrador(x => ({ ...x, [d]: e.target.value.replace(/\D/g, '').slice(0, 6) })); setEstado(null) }}
                         style={{ width: 84, textAlign: 'right', padding: '6px 9px', fontSize: 13, borderRadius: 10,
                                  border: '1px solid ' + (malo ? ROJO : LINEA), fontVariantNumeric: 'tabular-nums', outline: 'none', color: TINTA,
                                  background: editable ? '#fff' : FONDO_CAB }} />
                </td>
                <Td num color={conValor ? TINTA : TINTA_TENUE}>{conValor ? pesos(d * Number(q)) : '—'}</Td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: C.caja.suave, borderTop: '2px solid ' + LINEA }}>
            <Td fuerte>Total físico en caja</Td><Td />
            <Td num fuerte color={TINTA}><span data-total-contado>{pesos(total)}</span></Td>
          </tr>
        </tfoot>
      </table>

      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {previa && (
          <p data-diferencia-en-vivo={previa} style={{ margin: 0, fontSize: 12.5 }}>
            Con lo que llevas: <Semaforo estado={previa} diferencia={dif} />
          </p>
        )}

        {editable && (
          <>
            <textarea value={obs} onChange={e => { setObs(e.target.value.slice(0, 300)); setEstado(null) }}
                      placeholder="Observaciones del corte (opcional)" aria-label="Observaciones del corte" rows={2}
                      style={{ width: '100%', padding: '8px 10px', fontSize: 12.5, borderRadius: 12, border: '1px solid ' + LINEA, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Boton tipo="primario" data-guardar-conteo disabled={!sucio || invalidas.length > 0 || estado?.guardando} onClick={guardar}>
                {estado?.guardando ? 'Guardando…' : b.conteo ? 'Guardar cambios del corte' : 'Guardar el corte'}
              </Boton>
              {invalidas.length > 0 && <span style={{ fontSize: 11, color: ROJO }}>Sólo números enteros.</span>}
              {estado?.error && <span role="alert" style={{ fontSize: 11.5, color: ROJO }}>{estado.error}</span>}
              {(estado?.guardado || (!sucio && b.conteo)) && !estado?.error && (
                <span data-conteo-guardado style={{ fontSize: 11, color: VERDE }}>
                  ✓ Guardado{b.conteo?.quien ? ` por ${b.conteo.quien === 'admin' ? 'administración' : 'la tienda'}` : ''}{b.conteo?.cuando ? ` · ${cuando(b.conteo.cuando)}` : ''}
                </span>
              )}
            </div>
            {b.conteo?.historial?.length > 1 && (
              <p style={{ fontSize: 10.5, color: TINTA_TENUE, margin: 0 }}>
                Se ha cambiado {b.conteo.historial.length - 1} {b.conteo.historial.length === 2 ? 'vez' : 'veces'}: cada cambio queda registrado.
              </p>
            )}
          </>
        )}
        {!editable && b.conteo?.observaciones && (
          <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: 0 }}>Observaciones: {b.conteo.observaciones}</p>
        )}
        {!editable && b.conteo?.cuando && (
          <p style={{ fontSize: 10.5, color: TINTA_TENUE, margin: 0 }}>
            Contado por {b.conteo.quien === 'admin' ? 'administración' : 'la tienda'} · {cuando(b.conteo.cuando)}
          </p>
        )}
      </div>
    </Seccion>
  )
}

const queCompro = t => [
  t.fundas && `${t.fundas} ${t.fundas === 1 ? 'funda' : 'fundas'}`,
  t.hidrogel && `${t.hidrogel} hidrogel`,
  t.stickers && `${t.stickers} ${t.stickers === 1 ? 'sticker' : 'stickers'}`,
  t.otros && `${t.otros} ${t.otros === 1 ? 'otro' : 'otros'}`,
].filter(Boolean).join(' · ') || 'nada más'

/**
 * 🔒 Los tickets de la semana que rompen las reglas de mayoreo del dueño
 * (2026-11-09): mayoreo sin funda ni mica, y el mayorista que no viene tantas
 * veces como productos. Señala, no corrige ninguna cifra.
 */
function ReglasDeMayoreo({ lista, esAdmin }) {
  if (lista === null || lista === undefined) {
    return (
      <p data-reglas-mayoreo="sin-datos" style={{ fontSize: 11.5, color: TINTA_TENUE, margin: 0 }}>
        Reglas de mayoreo: se revisan con la próxima sincronización.
      </p>
    )
  }
  if (!lista.length) {
    return (
      <p data-reglas-mayoreo="0" style={{ fontSize: 12, color: VERDE, margin: 0, fontWeight: 700 }}>
        ✓ Ningún ticket de esta semana rompió las reglas de mayoreo.
      </p>
    )
  }
  return (
    <Seccion c={C.alerta} data-reglas-mayoreo={lista.length} sinRelleno
             titulo={`⚠ ${lista.length} ${lista.length === 1 ? 'ticket rompe' : 'tickets rompen'} las reglas de mayoreo`}
             sub="A precio de mayoreo siempre va una funda o una mica de hidrogel, y el mayorista se agrega tantas veces como productos: dos fundas y un sticker, el mayorista tres veces.">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: FONDO_CAB }}>
            <tr><Th>Folio</Th><Th>Día</Th><Th>Mayorista</Th><Th>Qué se llevó</Th><Th num>Mayorista</Th>
              {esAdmin && <Th>Cobró</Th>}<Th>Qué pasa</Th></tr>
          </thead>
          <tbody>
            {lista.map((x, i) => (
              <tr key={x.folio + x.f} data-incidencia-mayoreo={x.folio} style={fila(i)}>
                <Td fuerte>{x.folio}</Td>
                <Td color={TINTA_SUAVE}>{diaCorto(x.f)} {x.hora}</Td>
                <Td>{x.mayorista ?? <em style={{ color: TINTA_TENUE }}>sin mayorista</em>}</Td>
                <Td>{queCompro(x.tipos ?? {})} = <strong>{x.piezas}</strong></Td>
                <Td num fuerte color={x.etiquetas !== x.piezas ? ROJO : TINTA}>{x.etiquetas} {x.etiquetas === 1 ? 'vez' : 'veces'}</Td>
                {esAdmin && <Td color={TINTA_SUAVE}>{x.cajero ?? '—'}</Td>}
                <td style={{ padding: '7px 10px', fontSize: 11.5, color: AMBAR, fontWeight: 600, minWidth: 220 }}>
                  {(x.motivos ?? []).map(m => MOTIVOS_DE_MAYOREO[m] ?? m).join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Seccion>
  )
}

/**
 * Los cobros con tarjeta o transferencia de la semana, con la referencia que se
 * tecleó en la caja: es lo que permite encontrarlos en el estado de cuenta.
 */
function CobrosElectronicos({ lista }) {
  if (lista === null || lista === undefined) {
    return (
      <p data-cobros="sin-datos" style={{ fontSize: 11.5, color: TINTA_TENUE, margin: 0 }}>
        Cobros con tarjeta y transferencia, con su referencia: se llenan con la próxima sincronización.
      </p>
    )
  }
  const sinRef = lista.filter(c => !c.referencia).length
  const total = lista.reduce((a, c) => a + num(c.total), 0)
  return (
    <details data-cobros={lista.length} style={{ border: '1px solid ' + C.electronico.borde, borderRadius: 18, overflow: 'hidden', background: '#fff' }}>
      <summary style={{ fontSize: 12.5, fontWeight: 800, color: C.electronico.fuerte, cursor: 'pointer', padding: '10px 14px', background: C.electronico.suave }}>
        Cobros con tarjeta y transferencia: {lista.length} · {pesos(total)}
        {sinRef > 0 && <span data-sin-referencia={sinRef} style={{ color: AMBAR, fontWeight: 800 }}> · ⚠ {sinRef} sin referencia</span>}
      </summary>
      {lista.length === 0
        ? <p style={{ fontSize: 11.5, color: TINTA_TENUE, margin: 0, padding: '10px 14px' }}>Ningún cobro con tarjeta ni transferencia esta semana.</p>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: FONDO_CAB }}><tr><Th>Folio</Th><Th>Día</Th><Th>Forma</Th><Th num>Importe del ticket</Th><Th>Referencia</Th></tr></thead>
              <tbody>
                {lista.map((c, i) => (
                  <tr key={c.folio + c.f} style={fila(i)}>
                    <Td fuerte>{c.folio}</Td>
                    <Td color={TINTA_SUAVE}>{diaCorto(c.f)} {c.hora}</Td>
                    <Td color={C.electronico.fuerte}>{FORMAS_ELECTRONICAS[c.forma] ?? c.forma}</Td>
                    <Td num>{pesos(c.total)}</Td>
                    <Td color={c.referencia ? TINTA : AMBAR} fuerte={!c.referencia}>{c.referencia || '⚠ sin referencia'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <p style={{ fontSize: 10.5, color: TINTA_TENUE, margin: 0, padding: '8px 14px', lineHeight: 1.5 }}>
        La referencia es lo que se escribe en la caja al cobrar: banco y número de autorización, o banco y clave de rastreo.
        En un pago mixto el importe es el del ticket entero: una parte fue en efectivo.
      </p>
    </details>
  )
}

/** El fondo de caja de la plaza: lo asigna el administrador, y cada plaza tiene el suyo. */
function FondoDeCaja({ plaza, nombre, fondo, onGuardar }) {
  const [valor, setValor] = useState(fondo === null || fondo === undefined ? '' : String(fondo))
  const [estado, setEstado] = useState(null)
  // El valor sigue al guardado; el «✓ Guardado» sólo se borra al cambiar de
  // plaza; si se borrara al cambiar el fondo, desaparecería justo al guardar.
  useEffect(() => { setValor(fondo === null || fondo === undefined ? '' : String(fondo)) }, [plaza, fondo])
  useEffect(() => { setEstado(null) }, [plaza])
  const limpio = valor.trim()
  const valido = limpio === '' || (/^\d+(\.\d{1,2})?$/.test(limpio))
  const cambia = limpio !== (fondo === null || fondo === undefined ? '' : String(fondo))
  const guardar = async () => {
    setEstado({ guardando: true })
    try { await onGuardar(plaza, limpio === '' ? null : Number(limpio)); setEstado({ ok: true }) }
    catch (e) { setEstado({ error: e.message || 'No se pudo guardar el fondo.' }) }
  }
  return (
    <div data-fondo-caja={plaza} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      border: '1px solid ' + LINEA, borderLeft: '4px solid ' + TINTA, borderRadius: 18, padding: '10px 16px', background: '#fff' }}>
      <strong style={{ fontSize: 12.5, color: TINTA }}>Fondo de caja de {nombre}</strong>
      <span style={{ fontSize: 13, color: TINTA_SUAVE }}>$</span>
      <input type="text" inputMode="decimal" aria-label={`Fondo de caja de ${nombre}`} value={valor} placeholder="sin asignar"
             onChange={e => { setValor(e.target.value.replace(/[^\d.]/g, '').slice(0, 9)); setEstado(null) }}
             style={{ width: 110, padding: '6px 10px', fontSize: 13, borderRadius: 10, border: '1px solid ' + (valido ? LINEA : ROJO), outline: 'none' }} />
      <Boton tipo="primario" data-guardar-fondo disabled={!cambia || !valido || estado?.guardando} onClick={guardar}>
        {estado?.guardando ? 'Guardando…' : 'Guardar fondo'}
      </Boton>
      {estado?.ok && <span data-fondo-guardado style={{ fontSize: 11, color: VERDE }}>✓ Guardado</span>}
      {estado?.error && <span role="alert" style={{ fontSize: 11.5, color: ROJO }}>{estado.error}</span>}
      <span style={{ fontSize: 10.5, color: TINTA_TENUE, flexBasis: '100%' }}>
        Es lo que se queda siempre en la caja. Cada plaza tiene el suyo; vacío es «sin asignar» y la plaza sale en gris.
      </span>
    </div>
  )
}

/** Las cuatro cifras de la semana, arriba de todo. */
function CifrasDeLaSemana({ b }) {
  const colorDif = b.diferencia === null ? C.caja : b.diferencia === 0 ? C.entradas : b.diferencia < 0 ? C.comisiones : C.ventas
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <Cifra c={C.ventas} titulo="Ventas" valor={pesos(b.ventaTotal)} sub={b.piezas ? `${b.piezas.total} piezas` : undefined} />
      <Cifra c={C.electronico} titulo="Tarjeta y transferencia" valor={pesos(b.ingresosElectronicos)} />
      <Cifra c={C.caja} titulo="Debe haber en caja" valor={b.esperadoEnCaja === null ? '—' : pesos(b.esperadoEnCaja)} sub={b.fondo === null ? 'falta el fondo' : undefined} />
      <Cifra c={colorDif} titulo="Contado · diferencia"
             valor={b.contado === null ? 'falta el corte' : pesos(b.contado)}
             sub={b.diferencia === null ? undefined : b.diferencia === 0 ? 'cuadra al peso' : `${b.diferencia < 0 ? 'faltan' : 'sobran'} ${pesos(Math.abs(b.diferencia))}`} />
    </div>
  )
}

function BloqueDeSemana({ b, plaza, ciclo, editable, esAdmin, onGuardar }) {
  return (
    <Tarjeta data-bloque-corte={b.clave} data-estado-corte={b.estado}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 15.5, fontWeight: 800, color: TINTA, margin: 0 }}>
          Semana del {tituloSemana(b.semana)}
        </h3>
        <Semaforo estado={b.estado} diferencia={b.diferencia} />
      </div>
      <CifrasDeLaSemana b={b} />
      <VentasDeLaSemana b={b} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <Lista c={C.entradas} titulo="Otras entradas" lista={b.listas.entradas} total={b.entradas} vacio="Ninguna entrada registrada en el punto de venta." />
        <Lista c={C.gastos} titulo="Gastos de la semana" lista={b.listas.gastos} total={b.gastos} vacio="Ningún gasto registrado en el punto de venta." />
        <Lista c={C.sueldo} titulo="Sueldo" lista={b.listas.sueldos} total={b.sueldo} vacio="Ningún sueldo registrado como salida." conTrabajador />
        <Lista c={C.comisiones} titulo="Comisiones" lista={b.listas.comisiones ?? []} total={b.comisiones ?? 0} vacio="Ninguna comisión registrada como salida." conTrabajador />
      </div>
      <p style={{ fontSize: 10.5, color: TINTA_TENUE, margin: '-6px 0 0', lineHeight: 1.5 }}>
        Todo esto sale de las entradas y salidas de efectivo del punto de venta. <strong>El sueldo y las comisiones se
        registran ahí como salida, con la palabra «sueldo» o «comisión» y el nombre del trabajador</strong>; si no se
        registran, lo esperado queda por encima de lo que hay y se lee como faltante.
      </p>
      <ReglasDeMayoreo lista={b.mayoreo} esAdmin={esAdmin} />
      <CobrosElectronicos lista={b.cobros} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, alignItems: 'start' }}>
        <EstadoDeResultados b={b} ciclo={ciclo} esAdmin={esAdmin} />
        <ConteoDeEfectivo b={b} plaza={plaza} editable={editable} onGuardar={onGuardar} />
      </div>
    </Tarjeta>
  )
}

/** El bloque global del ciclo de cuatro semanas de Torreón. */
function BloqueGlobal({ g, ciclo }) {
  return (
    <Tarjeta data-bloque-global style={{ borderColor: C.ventas.borde }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 15.5, fontWeight: 800, color: TINTA, margin: 0 }}>
          Bloque global · {tituloSemana({ desde: ciclo.desde, hasta: ciclo.hasta })}
        </h3>
        <Semaforo estado={g.estado} diferencia={g.diferencia} />
      </div>
      <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: 0, lineHeight: 1.55 }}>
        Torreón entrega a las cuatro semanas, no cada una: el efectivo se va juntando. Esto suma el ciclo entero y compara lo
        último que se contó contra lo acumulado hasta esa semana
        {g.contadoEn ? <> (el corte del {diaMes(g.contadoEn)})</> : ''}. Hay {g.semanasConConteo} de {g.semanas} cortes capturados.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Cifra c={C.ventas} titulo="Ventas del ciclo" valor={pesos(g.ventaTotal)} sub={g.piezas ? `${g.piezas.total} piezas` : undefined} />
        <Cifra c={C.electronico} titulo="Tarjeta y transferencia" valor={pesos(num(g.tarjeta) + num(g.transferencia))} />
        <Cifra c={C.caja} titulo="Debe haber (con el fondo)" valor={g.esperadoEnCaja === null ? '—' : pesos(g.esperadoEnCaja)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, alignItems: 'start' }}>
        <EstadoDeResultados b={{ ...g, otrasNoEfectivo: 0, entregable: g.contado !== null && g.fondo !== null ? g.contado - g.fondo : null }} ciclo />
        <Seccion c={C.piezas} titulo="Piezas del ciclo" total={g.piezas ? `${g.piezas.total} pz` : null} sinRelleno>
          {g.piezas ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[['Fundas', g.piezas.fundas], ['Hidrogel', g.piezas.hidrogel], ['Stickers', g.piezas.stickers]].map(([t, v], i) => (
                  <tr key={t} style={fila(i)}>
                    <Td>{t}</Td>
                    <ConBarra parte={g.piezas.total ? v / g.piezas.total : 0} c={C.piezas}>{v}</ConBarra>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p style={{ fontSize: 11.5, color: TINTA_TENUE, margin: 0, padding: '10px 14px' }}>El desglose se llena con la próxima sincronización.</p>}
        </Seccion>
      </div>
    </Tarjeta>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  Mayoristas: como la venta de productos
// ═══════════════════════════════════════════════════════════════════════════

function Mayoristas({ ventas, plaza, nombre, hoy }) {
  const [dias, setDias] = useState(7)
  const [orden, setOrden] = useState({ campo: 'dinero', dir: -1 })
  const [ordenSin, setOrdenSin] = useState({ campo: 'ultima', dir: -1 })
  const r = useMemo(() => rankingDeMayoristas({
    porDia: ventas?.mayoristasPorDia, conocidos: ventas?.mayoristas, dias, hoy,
  }), [ventas, dias, hoy])
  const maxDinero = Math.max(1, ...r.lista.map(f => f.dinero))

  return (
    <Tarjeta data-mayoristas={plaza}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 15.5, fontWeight: 800, color: TINTA, margin: 0 }}>Mayoristas{nombre ? ` · ${nombre}` : ''}</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {RANGOS_DE_MAYORISTAS.map(d => (
            <Pildora key={d} activa={dias === d} onClick={() => setDias(d)} data-rango-mayoristas={d}>{d} días</Pildora>
          ))}
        </div>
      </div>

      {!r.hayDetalle ? (
        <>
          <Caja tono="ambar" titulo="Todavía no hay compras por día de cada mayorista">
            Se llenan con la próxima sincronización; entonces saldrá el ranking de {r.dias} días. Mientras tanto, abajo va
            la última compra de cada cliente según todo su historial.
          </Caja>
          {r.historico.length > 0 && (
            <Seccion c={C.ventas} titulo="Última compra de cada mayorista" sub="De todo el historial de la plaza" total={`${r.historico.length} clientes`} sinRelleno>
              <Tabla alto={420}>
                <Cabecera>
                  <tr>
                    <ThOrd campo="quien" orden={ordenSin} setOrden={setOrdenSin}>Mayorista</ThOrd>
                    <ThOrd campo="ultima" orden={ordenSin} setOrden={setOrdenSin}>Última compra</ThOrd>
                    <ThOrd campo="diasSin" orden={ordenSin} setOrden={setOrdenSin} num>Días sin comprar</ThOrd>
                    <ThOrd campo="tickets" orden={ordenSin} setOrden={setOrdenSin} num>Visitas (historial)</ThOrd>
                  </tr>
                </Cabecera>
                <tbody>
                  {ordenar(r.historico, ordenSin).map((c, i) => (
                    <tr key={c.quien} style={fila(i)}>
                      <Td fuerte>{c.quien}</Td>
                      <Td color={TINTA_SUAVE}>{c.ultima ? diaMes(c.ultima) : '—'}</Td>
                      <Td num color={c.diasSin > 30 ? AMBAR : TINTA}>{c.diasSin ?? '—'}</Td>
                      <Td num>{c.tickets}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            </Seccion>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Cifra c={C.ventas} titulo={`Compraron en ${r.dias} días`} valor={pesos(r.total.dinero)} sub={`${r.total.clientes} mayoristas · ${r.total.tickets} visitas`} />
            <Cifra c={C.piezas} titulo="Piezas" valor={r.total.piezas} sub="fundas, hidrogel y stickers" />
            {r.masActivo && (
              <Cifra c={C.entradas} titulo="El más activo" valor={r.masActivo.quien} sub={`${pesos(r.masActivo.dinero)} · ${r.masActivo.tickets} ${r.masActivo.tickets === 1 ? 'visita' : 'visitas'}`} data-mas-activo />
            )}
            {r.menosActivo && (
              <Cifra c={C.gastos} titulo="El menos activo (de los que compraron)" valor={r.menosActivo.quien} sub={`${pesos(r.menosActivo.dinero)} · ${r.menosActivo.tickets} ${r.menosActivo.tickets === 1 ? 'visita' : 'visitas'}`} data-menos-activo />
            )}
          </div>

          {r.lista.length === 0 ? (
            <p style={{ fontSize: 12, color: TINTA_TENUE, margin: 0 }}>Ningún mayorista compró en estos {r.dias} días.</p>
          ) : (
            <Tabla alto={460}>
              <Cabecera>
                <tr>
                  <ThOrd campo="puesto" orden={orden} setOrden={setOrden} num>#</ThOrd>
                  <ThOrd campo="quien" orden={orden} setOrden={setOrden}>Mayorista</ThOrd>
                  <ThOrd campo="dinero" orden={orden} setOrden={setOrden} num>Compras</ThOrd>
                  <ThOrd campo="parte" orden={orden} setOrden={setOrden} num>% del total</ThOrd>
                  <ThOrd campo="piezas" orden={orden} setOrden={setOrden} num>Piezas</ThOrd>
                  <ThOrd campo="tickets" orden={orden} setOrden={setOrden} num>Visitas</ThOrd>
                  <ThOrd campo="ticketMedio" orden={orden} setOrden={setOrden} num>Ticket medio</ThOrd>
                  <ThOrd campo="ultima" orden={orden} setOrden={setOrden}>Última</ThOrd>
                </tr>
              </Cabecera>
              <tbody>
                {ordenar(r.lista, orden).map((f, i) => (
                  <tr key={f.quien} data-mayorista={f.quien} style={fila(i)}>
                    <Td num color={TINTA_TENUE}>{f.puesto}</Td>
                    <Td fuerte>{f.quien}</Td>
                    <ConBarra parte={f.dinero / maxDinero} c={C.ventas} fuerte>{pesos(f.dinero)}</ConBarra>
                    <Td num color={C.ventas.fuerte}>{porciento(f.parte)}</Td>
                    <Td num>{f.piezas}</Td>
                    <Td num>{f.tickets}</Td>
                    <Td num color={TINTA_SUAVE}>{pesos(f.ticketMedio)}</Td>
                    <Td color={TINTA_SUAVE}>{diaMes(f.ultima)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: C.ventas.suave, borderTop: '2px solid ' + C.ventas.borde }}>
                  <Td /><Td fuerte color={C.ventas.fuerte}>Total ({r.total.clientes})</Td>
                  <Td num fuerte color={C.ventas.fuerte}>{pesos(r.total.dinero)}</Td><Td num color={C.ventas.fuerte}>100%</Td>
                  <Td num fuerte>{r.total.piezas}</Td><Td num fuerte>{r.total.tickets}</Td>
                  <Td num color={TINTA_SUAVE}>{r.total.tickets ? pesos(r.total.dinero / r.total.tickets) : '—'}</Td><Td />
                </tr>
              </tfoot>
            </Tabla>
          )}

          {r.sinCompras.length > 0 && (
            <details data-sin-compras={r.sinCompras.length} style={{ border: '1px solid ' + C.alerta.borde, borderRadius: 18, overflow: 'hidden' }}>
              <summary style={{ fontSize: 12.5, fontWeight: 800, color: AMBAR, cursor: 'pointer', padding: '10px 14px', background: C.alerta.suave }}>
                {r.sinCompras.length} {r.sinCompras.length === 1 ? 'mayorista no compró' : 'mayoristas no compraron'} en estos {r.dias} días
              </summary>
              <div style={{ padding: 10 }}>
                <Tabla alto={360}>
                  <Cabecera>
                    <tr>
                      <ThOrd campo="quien" orden={ordenSin} setOrden={setOrdenSin}>Mayorista</ThOrd>
                      <ThOrd campo="ultima" orden={ordenSin} setOrden={setOrdenSin}>Última compra</ThOrd>
                      <ThOrd campo="diasSin" orden={ordenSin} setOrden={setOrdenSin} num>Días sin comprar</ThOrd>
                      <ThOrd campo="tickets" orden={ordenSin} setOrden={setOrdenSin} num>Visitas (historial)</ThOrd>
                    </tr>
                  </Cabecera>
                  <tbody>
                    {ordenar(r.sinCompras, ordenSin).map((c, i) => (
                      <tr key={c.quien} style={fila(i)}>
                        <Td fuerte>{c.quien}</Td>
                        <Td color={TINTA_SUAVE}>{c.ultima ? diaMes(c.ultima) : '—'}</Td>
                        <Td num color={c.diasSin > 30 ? AMBAR : TINTA}>{c.diasSin ?? '—'}</Td>
                        <Td num>{c.tickets}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              </div>
            </details>
          )}
        </>
      )}
      <p style={{ fontSize: 10.5, color: TINTA_TENUE, margin: 0 }}>
        Se mide por dinero, ticket entero; las piezas son sólo fundas, hidrogel y stickers. Informativo: no toca el inventario ni el corte.
      </p>
    </Tarjeta>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  La vista del administrador: todas las plazas
// ═══════════════════════════════════════════════════════════════════════════

function ResumenDeTodas({ plazas }) {
  const g = useMemo(() => resumenGlobal(Object.fromEntries(plazas.map(p => [p.slug, p]))), [plazas])
  const maxVenta = Math.max(1, ...g.filas.map(f => num(f.ventaTotal)))
  return (
    <div data-resumen-global style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {g.alertas.length > 0 && (
        <Caja tono="ambar" data-alertas-corte titulo={`${g.alertas.length} ${g.alertas.length === 1 ? 'plaza con diferencia' : 'plazas con diferencia'} en el corte`}>
          {g.alertas.map(f => (
            <div key={f.slug}>
              <strong>{plazas.find(p => p.slug === f.slug)?.nombre}</strong>: <Semaforo estado={f.estado} diferencia={f.diferencia} compacto />
            </div>
          ))}
          <span style={{ display: 'block', marginTop: 4 }}>
            Cada plaza conserva su estado: un faltante en una y un sobrante en otra no se compensan.
          </span>
        </Caja>
      )}

      {g.mayoreo > 0 && (
        <Caja tono="ambar" data-alertas-mayoreo={g.mayoreo}
              titulo={`${g.mayoreo} ${g.mayoreo === 1 ? 'ticket rompe' : 'tickets rompen'} las reglas de mayoreo esta semana`}>
          Mayoreo sin funda ni mica, o el mayorista que no viene tantas veces como productos. Abre la plaza para ver cuáles.
        </Caja>
      )}

      <Tarjeta>
        <h3 style={{ fontSize: 15.5, fontWeight: 800, color: TINTA, margin: 0 }}>Las plazas, juntas</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Cifra c={C.ventas} titulo="Ventas" valor={pesos(g.ventaTotal)} />
          <Cifra c={C.ventas} titulo="Efectivo cobrado" valor={pesos(g.efectivoCobrado)} />
          <Cifra c={C.electronico} titulo="Tarjeta y transferencia" valor={pesos(num(g.tarjeta) + num(g.transferencia))} />
          <Cifra c={C.gastos} titulo="Gastos" valor={pesos(g.gastos)} />
          <Cifra c={C.sueldo} titulo="Sueldo" valor={pesos(g.sueldo)} />
          <Cifra c={C.comisiones} titulo="Comisiones" valor={pesos(g.comisiones ?? 0)} />
        </div>
        {g.piezas && (
          <p data-piezas-globales style={{ fontSize: 12.5, color: TINTA_SUAVE, margin: 0 }}>
            Piezas: <strong>Fundas {g.piezas.fundas}</strong> · <strong>Hidrogel {g.piezas.hidrogel}</strong> · <strong>Stickers {g.piezas.stickers}</strong>
            {' '}= <strong style={{ color: VERDE }}>{g.piezas.total} piezas</strong>
          </p>
        )}
        <Tabla>
          <Cabecera>
            <tr><Th>Plaza</Th><Th num>Fondo</Th><Th num color={C.ventas.fuerte}>Ventas</Th><Th num>Debe haber en caja</Th><Th num>Contado</Th><Th num>Reglas de mayoreo</Th><Th>Estado</Th></tr>
          </Cabecera>
          <tbody>
            {g.filas.map((f, i) => (
              <tr key={f.slug} data-plaza-resumen={f.slug} style={fila(i)}>
                <Td fuerte>{plazas.find(p => p.slug === f.slug)?.nombre}{f.ciclo ? ' · ciclo de 4 semanas' : ''}</Td>
                <Td num color={f.fondo === null || f.fondo === undefined ? AMBAR : TINTA}>{f.fondo === null || f.fondo === undefined ? 'sin asignar' : pesos(f.fondo)}</Td>
                <ConBarra parte={num(f.ventaTotal) / maxVenta} c={C.ventas}>{pesos(f.ventaTotal)}</ConBarra>
                <Td num>{f.esperadoEnCaja === null ? '—' : pesos(f.esperadoEnCaja)}</Td>
                <Td num>{f.contado === null || f.contado === undefined ? '—' : pesos(f.contado)}</Td>
                <Td num color={f.mayoreo?.length ? AMBAR : TINTA_TENUE} fuerte={!!f.mayoreo?.length}>
                  {f.mayoreo === null || f.mayoreo === undefined ? '—' : f.mayoreo.length ? `⚠ ${f.mayoreo.length}` : '✓ 0'}
                </Td>
                <Td><Semaforo estado={f.estado} diferencia={f.diferencia} compacto /></Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
        <p style={{ fontSize: 10.5, color: TINTA_TENUE, margin: 0 }}>
          Es la semana en curso de cada plaza; Torreón, su ciclo de cuatro semanas. Elige una plaza arriba para ver su detalle.
        </p>
      </Tarjeta>

      {plazas.map(p => <Mayoristas key={p.slug} ventas={p.ventas} plaza={p.slug} nombre={p.nombre} hoy={p.hoyCorte} />)}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  El panel
// ═══════════════════════════════════════════════════════════════════════════

export default function CortePanel({ plazaFija = null }) {
  const { token, isAdmin } = useAuth()
  // Una tienda pide la suya; el administrador elige. `null` = todas.
  const [elegida, setElegida] = useState(null)
  const pedir = plazaFija ?? elegida
  const c = useCorte(token, isAdmin ? (elegida ?? 'todas') : pedir)
  const { plazas, cargando, error, hoy, mover, esActual, hayAnterior, guardar, guardarFondo } = c

  if (cargando && !plazas.length) return <p className="tablero-cargando">Leyendo el corte…</p>

  const unaSola = plazas.length === 1
  const todas = isAdmin && !elegida
  const p = unaSola ? plazas[0] : null

  return (
    <div data-corte style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 12.5, color: TINTA_SUAVE, margin: 0, lineHeight: 1.6 }}>
        {isAdmin
          ? 'El corte semanal de cada plaza, calculado con lo que sale del punto de venta. Lo único que captura la tienda es el conteo de billetes y monedas.'
          : 'Tus ventas de la semana salen solas del punto de venta. Lo único que tienes que hacer es contar el efectivo y guardarlo aquí.'}
        {' '}<strong>No hay tolerancia:</strong> un peso de más o de menos ya es sobrante o faltante.
      </p>

      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pildora activa={!elegida} onClick={() => setElegida(null)} data-corte-plaza="todas">Todas las sucursales</Pildora>
          {['leon', 'san-luis', 'aguascalientes', 'torreon'].map(s => (
            <Pildora key={s} activa={elegida === s} onClick={() => setElegida(s)} data-corte-plaza={s}>
              {{ leon: 'León', 'san-luis': 'San Luis Potosí', aguascalientes: 'Aguascalientes', torreon: 'Torreón' }[s]}
            </Pildora>
          ))}
        </div>
      )}

      {error && <Caja tono="ambar" titulo="No se pudo leer el corte" role="alert">{error}</Caja>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Boton data-semana-anterior disabled={!hayAnterior} onClick={() => mover(-1)}>← Semana anterior</Boton>
        <Boton data-semana-siguiente disabled={esActual} onClick={() => mover(1)}>Semana siguiente →</Boton>
        {!esActual && <Boton tipo="fantasma" onClick={() => mover(99)}>Ir a la semana en curso</Boton>}
      </div>

      {p?.sinDatos && (
        <Caja tono="ambar" data-sin-datos titulo="Todavía no hay ventas de esta plaza">
          El respaldo del punto de venta de {p.nombre} no se ha leído. Cuando llegue —las tiendas lo suben a partir de las 20:30—
          aparecerán aquí las ventas. Mientras tanto no es que no se haya vendido: es que no se ha podido mirar.
        </Caja>
      )}

      {todas && plazas.length > 0 && <ResumenDeTodas plazas={plazas.map(x => ({ ...x, hoyCorte: hoy }))} />}

      {p && (
        <>
          {isAdmin && <FondoDeCaja plaza={p.slug} nombre={p.nombre} fondo={p.parametros?.fondoFijo ?? null} onGuardar={guardarFondo} />}
          {p.ciclo && (
            <Caja titulo={`Ciclo de ${p.ciclo.semanas.length} semanas: del ${diaMes(p.ciclo.desde)} al ${diaMes(p.ciclo.hasta)}`}>
              Torreón hace su depósito o transferencia cada cuatro semanas. Aquí van las cuatro semanas del ciclo y un bloque global.
            </Caja>
          )}
          {p.bloques.map(b => b.clave > hoy
            // Una semana del ciclo que todavía no empieza no tiene nada que
            // contar —el servidor rechaza su conteo—: un renglón, no un bloque
            // entero de ceros que obliga a bajar por delante.
            ? (
              <div key={b.clave} data-bloque-corte={b.clave} data-estado-corte="futura"
                   style={{ border: '1px dashed ' + LINEA, borderRadius: 18, padding: '10px 16px', fontSize: 12.5, color: TINTA_TENUE }}>
                <strong style={{ color: TINTA_SUAVE }}>Semana del {tituloSemana(b.semana)}</strong> · todavía no empieza
              </div>
            )
            : (
              <BloqueDeSemana key={b.clave} b={b} plaza={p.slug} ciclo={!!p.ciclo} esAdmin={isAdmin}
                              editable={!todas} onGuardar={guardar} />
            ))}
          {p.global && <BloqueGlobal g={p.global} ciclo={p.ciclo} />}
          <Mayoristas ventas={p.ventas} plaza={p.slug} hoy={hoy} />
        </>
      )}

      {!cargando && !error && plazas.length === 0 && (
        <p style={{ fontSize: 12.5, color: TINTA_TENUE }}>Esta sesión no tiene un corte que enseñar.</p>
      )}
    </div>
  )
}
