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
import { pesos } from '../lib/caja'

const TINTA       = '#101619'
const TINTA_SUAVE = '#4A5A61'
const TINTA_TENUE = '#8598A1'
const LINEA       = '#D6E0E4'
const VERDE       = '#4B7A1B'
const ROJO        = '#C4156F'
const AZUL        = '#0288AD'
const GRIS        = '#8598A1'

const COLOR = { verde: VERDE, rojo: ROJO, azul: AZUL, gris: GRIS }
const PUNTO = { verde: '🟢', rojo: '🔴', azul: '🔵', gris: '⚪' }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fecha = iso => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d) }
const dia = iso => String(fecha(iso).getDate())
const diaCorto = iso => `${fecha(iso).getDate()}/${String(fecha(iso).getMonth() + 1).padStart(2, '0')}`
const diaMes = iso =>`${fecha(iso).getDate()}/${String(fecha(iso).getMonth() + 1).padStart(2, '0')}/${fecha(iso).getFullYear()}`
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
      background: ambar ? 'rgba(180,83,9,0.07)' : 'rgba(16,22,25,0.03)',
      border: '1px solid ' + (ambar ? 'rgba(180,83,9,0.28)' : LINEA), color: TINTA_SUAVE,
    }}>
      {titulo && <strong style={{ display: 'block', color: ambar ? '#B45309' : TINTA, fontSize: 12.5, marginBottom: 2 }}>{titulo}</strong>}
      {children}
    </div>
  )
}

const Tarjeta = ({ children, ...resto }) => (
  <section {...resto} style={{ border: '1px solid ' + LINEA, borderRadius: 24, padding: '18px 20px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 14 }}>
    {children}
  </section>
)

const Titulo = ({ children }) => (
  <h4 style={{ fontSize: 12.5, fontWeight: 800, color: TINTA, margin: '0 0 6px' }}>{children}</h4>
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

const Renglon = ({ etiqueta, valor, fuerte, color, nota }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderBottom: '1px solid rgba(16,22,25,0.05)', fontSize: 12.5 }}>
    <span style={{ color: fuerte ? TINTA : TINTA_SUAVE, fontWeight: fuerte ? 800 : 400 }}>
      {etiqueta}{nota && <span style={{ display: 'block', fontSize: 10.5, color: TINTA_TENUE, fontWeight: 400 }}>{nota}</span>}
    </span>
    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: fuerte ? 800 : 600, color: color || TINTA, whiteSpace: 'nowrap' }}>{valor}</span>
  </div>
)

const Th = ({ children, num }) => (
  <th style={{ textAlign: num ? 'right' : 'left', padding: '7px 8px', fontSize: 11, fontWeight: 700, color: TINTA_SUAVE, borderBottom: '1px solid ' + LINEA, whiteSpace: 'nowrap' }}>{children}</th>
)
const Td = ({ children, num, fuerte, color, title }) => (
  <td title={title} style={{ padding: '6px 8px', fontSize: 12, textAlign: num ? 'right' : 'left', fontVariantNumeric: num ? 'tabular-nums' : 'normal', fontWeight: fuerte ? 800 : 400, color: color || TINTA, whiteSpace: 'nowrap' }}>{children}</td>
)

// ═══════════════════════════════════════════════════════════════════════════
//  Una semana
// ═══════════════════════════════════════════════════════════════════════════

/** Las ventas de la semana, día por día, tal como salen del punto de venta. */
function VentasDeLaSemana({ b }) {
  const hayDesglose = !!b.piezas
  return (
    <div>
      <Titulo>Ventas de la semana</Titulo>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }} data-tabla-ventas>
          <thead>
            <tr>
              <Th>Día</Th><Th>Fecha</Th><Th num>Ventas ($)</Th>
              <Th num>Fundas</Th><Th num>Hidrogel</Th><Th num>Stickers</Th><Th num>Piezas</Th>
            </tr>
          </thead>
          <tbody>
            {b.dias.map((d, i) => (
              <tr key={d.f} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }} data-dia-corte={d.f}>
                <Td fuerte>{d.dia[0].toUpperCase() + d.dia.slice(1)}</Td>
                <Td color={TINTA_SUAVE}>{diaMes(d.f)}</Td>
                {/* Un día sin dato NO es un día con cero: se dice. */}
                <Td num>{d.hayDato ? pesos(d.ventaTotal) : <span style={{ color: TINTA_TENUE }}>—</span>}</Td>
                <Td num>{d.piezas ? d.piezas.fundas : '—'}</Td>
                <Td num>{d.piezas ? d.piezas.hidrogel : '—'}</Td>
                <Td num>{d.piezas ? d.piezas.stickers : '—'}</Td>
                <Td num fuerte>{d.piezas ? d.piezas.total : '—'}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid ' + LINEA }}>
              <Td fuerte>Total semanal</Td><Td />
              <Td num fuerte>{pesos(b.ventaTotal)}</Td>
              <Td num fuerte>{hayDesglose ? b.piezas.fundas : '—'}</Td>
              <Td num fuerte>{hayDesglose ? b.piezas.hidrogel : '—'}</Td>
              <Td num fuerte>{hayDesglose ? b.piezas.stickers : '—'}</Td>
              <Td num fuerte color={VERDE}>{hayDesglose ? b.piezas.total : '—'}</Td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p style={{ fontSize: 10.5, color: TINTA_TENUE, margin: '6px 0 0', lineHeight: 1.5 }}>
        {hayDesglose
          ? <>Sólo cuentan fundas, hidrogel y stickers
              {b.piezas.otros > 0 && ` (se vendieron además ${b.piezas.otros} de otros productos, que no suman)`}
              ; lo cobrado a $0.01 es de un mayorista y no es una pieza.</>
          : 'El desglose de piezas se llena con la próxima sincronización.'}
        {' '}Las ventas llegan con el respaldo de cada noche, desde las 20:30: lo de hoy se ve mañana.
      </p>
    </div>
  )
}

const Lista = ({ titulo, lista, total, vacio }) => (
  <div style={{ flex: 1, minWidth: 220 }} data-lista-corte={titulo}>
    <Titulo>{titulo}</Titulo>
    {lista.length === 0
      ? <p style={{ fontSize: 11.5, color: TINTA_TENUE, margin: 0 }}>{vacio}</p>
      : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {lista.map((m, i) => (
            <li key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '3px 0', color: TINTA_SUAVE }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ color: TINTA_TENUE }}>{diaCorto(m.f)} · </span>
                {m.concepto || <em style={{ color: TINTA_TENUE }}>sin concepto en la caja</em>}
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: TINTA, whiteSpace: 'nowrap' }}>{pesos(m.monto)}</span>
            </li>
          ))}
        </ul>
      )}
    <div style={{ borderTop: '1px solid ' + LINEA, marginTop: 4, paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800 }}>
      <span>Total</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{pesos(total)}</span>
    </div>
  </div>
)

/** El estado de resultados de la semana: la cuenta entera, en el orden del Excel. */
function EstadoDeResultados({ b, ciclo, esAdmin }) {
  const colorDif = b.diferencia === null ? TINTA : b.diferencia === 0 ? VERDE : b.diferencia < 0 ? ROJO : AZUL
  return (
    <div data-estado-resultados>
      <Titulo>Estado de resultados de la semana</Titulo>
      <Renglon etiqueta="Ventas (punto de venta)" valor={pesos(b.ventaTotal)} />
      <Renglon etiqueta="Otras entradas" valor={pesos(b.entradas)} />
      <Renglon etiqueta="Total de ventas brutas" valor={pesos(b.ventasBrutas)} fuerte />
      <Renglon etiqueta="Pagos con tarjeta" valor={pesos(b.tarjeta)} nota="del punto de venta" />
      <Renglon etiqueta="Transferencias" valor={pesos(b.transferencia)} nota="del punto de venta" />
      <Renglon etiqueta="Ingresos electrónicos" valor={pesos(b.ingresosElectronicos)} fuerte />
      <Renglon etiqueta="Efectivo cobrado" valor={pesos(b.efectivoCobrado)} />
      {b.devoluciones > 0 && <Renglon etiqueta="Devoluciones en efectivo" valor={`− ${pesos(b.devoluciones)}`} />}
      <Renglon etiqueta="Gastos" valor={`− ${pesos(b.gastos)}`} />
      <Renglon etiqueta="Sueldo" valor={`− ${pesos(b.sueldo)}`} nota="salidas de efectivo que el empleado registró en el punto de venta" />
      <Renglon etiqueta="Esperado en caja (efectivo teórico)" valor={pesos(b.esperado)} fuerte />
      <Renglon etiqueta="Fondo de caja" valor={b.fondo === null ? <span style={{ color: TINTA_TENUE }}>sin capturar</span> : pesos(b.fondo)} />
      <Renglon
        etiqueta={ciclo ? 'Debe haber en caja (acumulado del ciclo)' : 'Debe haber en caja'}
        valor={b.esperadoEnCaja === null ? '—' : pesos(b.esperadoEnCaja)} fuerte
        nota={ciclo ? 'incluye lo esperado de las semanas anteriores: el efectivo se va juntando' : 'fondo + esperado'} />
      <Renglon etiqueta="Total físico contado" valor={b.contado === null ? <span style={{ color: TINTA_TENUE }}>falta el corte</span> : pesos(b.contado)} />
      <Renglon etiqueta="Diferencia (cuadre)" valor={b.diferencia === null ? '—' : pesos(b.diferencia)} fuerte color={colorDif} />
      <Renglon etiqueta="Efectivo neto entregable" valor={b.entregable === null ? '—' : pesos(b.entregable)} nota="lo contado menos el fondo, que se queda" />
      {b.estado === 'sin-fondo' && (
        <p style={{ fontSize: 11, color: '#B45309', margin: '8px 0 0', lineHeight: 1.5 }}>
          No se puede comparar: falta el fondo de caja de esta plaza. {esAdmin
            ? 'Captúralo en Efectivo, en los parámetros de la plaza.'
            : 'Pídele al administrador que lo capture.'}
        </p>
      )}
      {b.estado === 'sin-control' && (
        <p style={{ fontSize: 11, color: '#B45309', margin: '8px 0 0', lineHeight: 1.5 }}>
          {b.diasSinControl === 7 ? 'Toda' : `${b.diasSinControl} días de`} esta semana es de antes de que la plaza registrara sus
          salidas en el punto de venta: lo esperado es un máximo, no una cifra, y no se compara.
        </p>
      )}
    </div>
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
    <div data-conteo={b.clave}>
      <Titulo>Corte de efectivo</Titulo>
      {!editable && (
        <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '0 0 6px' }}>
          Lo cuenta cada tienda en su pantalla. Aquí se ve, no se captura.
        </p>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><Th>Billete o moneda</Th><Th num>Cantidad</Th><Th num>Total</Th></tr></thead>
        <tbody>
          {DENOMINACIONES.map(d => {
            const q = borrador[d]
            const malo = invalidas.includes(d)
            return (
              <tr key={d}>
                <Td fuerte>${d}</Td>
                <td style={{ padding: '3px 8px', textAlign: 'right' }}>
                  <input type="text" inputMode="numeric" disabled={!editable}
                         aria-label={`Cantidad de billetes o monedas de $${d}`} data-denominacion={d}
                         value={q} placeholder="0"
                         onChange={e => { setBorrador(x => ({ ...x, [d]: e.target.value.replace(/\D/g, '').slice(0, 6) })); setEstado(null) }}
                         style={{ width: 84, textAlign: 'right', padding: '5px 8px', fontSize: 13, borderRadius: 10,
                                  border: '1px solid ' + (malo ? ROJO : LINEA), fontVariantNumeric: 'tabular-nums', outline: 'none', color: TINTA }} />
                </td>
                <Td num color={TINTA_SUAVE}>{q !== '' && cantidadValida(q) ? pesos(d * Number(q)) : '—'}</Td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid ' + LINEA }}>
            <Td fuerte>Total físico en caja</Td><Td />
            <Td num fuerte color={TINTA}><span data-total-contado>{pesos(total)}</span></Td>
          </tr>
        </tfoot>
      </table>

      {previa && (
        <p data-diferencia-en-vivo={previa} style={{ margin: '8px 0 0', fontSize: 12.5 }}>
          Con lo que llevas: <Semaforo estado={previa} diferencia={dif} />
        </p>
      )}

      {editable && (
        <>
          <textarea value={obs} onChange={e => { setObs(e.target.value.slice(0, 300)); setEstado(null) }}
                    placeholder="Observaciones del corte (opcional)" aria-label="Observaciones del corte" rows={2}
                    style={{ width: '100%', marginTop: 8, padding: '8px 10px', fontSize: 12.5, borderRadius: 12, border: '1px solid ' + LINEA, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
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
            <p style={{ fontSize: 10.5, color: TINTA_TENUE, margin: '6px 0 0' }}>
              Se ha cambiado {b.conteo.historial.length - 1} {b.conteo.historial.length === 2 ? 'vez' : 'veces'}: cada cambio queda registrado.
            </p>
          )}
        </>
      )}
      {!editable && b.conteo?.observaciones && (
        <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: '8px 0 0' }}>Observaciones: {b.conteo.observaciones}</p>
      )}
      {!editable && b.conteo?.cuando && (
        <p style={{ fontSize: 10.5, color: TINTA_TENUE, margin: '4px 0 0' }}>
          Contado por {b.conteo.quien === 'admin' ? 'administración' : 'la tienda'} · {cuando(b.conteo.cuando)}
        </p>
      )}
    </div>
  )
}

function BloqueDeSemana({ b, plaza, ciclo, editable, esAdmin, onGuardar }) {
  return (
    <Tarjeta data-bloque-corte={b.clave} data-estado-corte={b.estado}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 14.5, fontWeight: 800, color: TINTA, margin: 0 }}>
          Semana del {tituloSemana(b.semana)}
        </h3>
        <Semaforo estado={b.estado} diferencia={b.diferencia} />
      </div>
      <VentasDeLaSemana b={b} />
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <Lista titulo="Otras entradas" lista={b.listas.entradas} total={b.entradas} vacio="Ninguna entrada registrada en el punto de venta." />
        <Lista titulo="Gastos de la semana" lista={b.listas.gastos} total={b.gastos} vacio="Ningún gasto registrado en el punto de venta." />
        <Lista titulo="Sueldo" lista={b.listas.sueldos} total={b.sueldo} vacio="Ningún sueldo registrado como salida." />
      </div>
      <p style={{ fontSize: 10.5, color: TINTA_TENUE, margin: '-6px 0 0', lineHeight: 1.5 }}>
        Todo esto sale de las entradas y salidas de efectivo del punto de venta. <strong>El sueldo tiene que
        registrarse ahí como una salida</strong>; si no, lo esperado queda por encima de lo que hay y se lee como faltante.
      </p>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 320px', minWidth: 260 }}><EstadoDeResultados b={b} ciclo={ciclo} esAdmin={esAdmin} /></div>
        <div style={{ flex: '1 1 300px', minWidth: 260 }}><ConteoDeEfectivo b={b} plaza={plaza} editable={editable} onGuardar={onGuardar} /></div>
      </div>
    </Tarjeta>
  )
}

/** El bloque global del ciclo de cuatro semanas de Torreón. */
function BloqueGlobal({ g, ciclo }) {
  return (
    <Tarjeta data-bloque-global style={{ borderColor: 'rgba(2,136,173,0.35)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 14.5, fontWeight: 800, color: TINTA, margin: 0 }}>
          Bloque global · {tituloSemana({ desde: ciclo.desde, hasta: ciclo.hasta })}
        </h3>
        <Semaforo estado={g.estado} diferencia={g.diferencia} />
      </div>
      <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: 0, lineHeight: 1.55 }}>
        Torreón entrega a las cuatro semanas, no cada una: el efectivo se va juntando. Esto suma el ciclo entero y compara lo
        último que se contó contra lo acumulado hasta esa semana
        {g.contadoEn ? <> (el corte del {diaMes(g.contadoEn)})</> : ''}. Hay {g.semanasConConteo} de {g.semanas} cortes capturados.
      </p>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <Renglon etiqueta="Ventas del ciclo" valor={pesos(g.ventaTotal)} fuerte />
          <Renglon etiqueta="Pagos con tarjeta" valor={pesos(g.tarjeta)} />
          <Renglon etiqueta="Transferencias" valor={pesos(g.transferencia)} />
          <Renglon etiqueta="Efectivo cobrado" valor={pesos(g.efectivoCobrado)} />
          <Renglon etiqueta="Gastos" valor={`− ${pesos(g.gastos)}`} />
          <Renglon etiqueta="Sueldo" valor={`− ${pesos(g.sueldo)}`} />
          <Renglon etiqueta="Esperado en caja del ciclo" valor={pesos(g.esperado)} fuerte />
          <Renglon etiqueta="Debe haber (con el fondo)" valor={g.esperadoEnCaja === null ? '—' : pesos(g.esperadoEnCaja)} fuerte />
        </div>
        <div style={{ flex: '1 1 260px' }}>
          <Titulo>Piezas del ciclo</Titulo>
          {g.piezas ? (
            <>
              <Renglon etiqueta="Fundas" valor={g.piezas.fundas} />
              <Renglon etiqueta="Hidrogel" valor={g.piezas.hidrogel} />
              <Renglon etiqueta="Stickers" valor={g.piezas.stickers} />
              <Renglon etiqueta="Total de piezas" valor={g.piezas.total} fuerte color={VERDE} />
            </>
          ) : <p style={{ fontSize: 11.5, color: TINTA_TENUE, margin: 0 }}>El desglose se llena con la próxima sincronización.</p>}
        </div>
      </div>
    </Tarjeta>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  Mayoristas
// ═══════════════════════════════════════════════════════════════════════════

function Mayoristas({ ventas, plaza, nombre, hoy }) {
  const [dias, setDias] = useState(7)
  const r = useMemo(() => rankingDeMayoristas({
    porDia: ventas?.mayoristasPorDia, conocidos: ventas?.mayoristas, dias, hoy,
  }), [ventas, dias, hoy])

  const sinDetalle = !(ventas?.mayoristasPorDia?.length) && !(ventas?.detalleDias > 0)

  return (
    <Tarjeta data-mayoristas={plaza}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 14.5, fontWeight: 800, color: TINTA, margin: 0 }}>Mayoristas{nombre ? ` · ${nombre}` : ''}</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {RANGOS_DE_MAYORISTAS.map(d => (
            <Pildora key={d} activa={dias === d} onClick={() => setDias(d)} data-rango-mayoristas={d}>{d} días</Pildora>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: 0, lineHeight: 1.55 }}>
        Lo que compró cada mayorista en los últimos {r.dias} días, de más a menos. Se mide por dinero; las piezas son sólo
        fundas, hidrogel y stickers. Informativo: no toca el inventario ni el corte.
      </p>

      {sinDetalle ? (
        <p style={{ fontSize: 12, color: TINTA_TENUE, margin: 0 }}>
          Todavía no hay detalle de compras por mayorista: se llena con la próxima sincronización.
        </p>
      ) : r.lista.length === 0 ? (
        <p style={{ fontSize: 12, color: TINTA_TENUE, margin: 0 }}>Ningún mayorista compró en estos {r.dias} días.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div data-mas-activo style={{ flex: 1, minWidth: 180, padding: '10px 14px', border: '1px solid ' + LINEA, borderRadius: 16 }}>
              <div style={{ fontSize: 10.5, color: TINTA_TENUE }}>El más activo</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: TINTA }}>{r.masActivo.quien}</div>
              <div style={{ fontSize: 11.5, color: TINTA_SUAVE }}>{pesos(r.masActivo.dinero)} · {r.masActivo.piezas} pz · {r.masActivo.tickets} {r.masActivo.tickets === 1 ? 'visita' : 'visitas'}</div>
            </div>
            {r.menosActivo && (
              <div data-menos-activo style={{ flex: 1, minWidth: 180, padding: '10px 14px', border: '1px solid ' + LINEA, borderRadius: 16 }}>
                <div style={{ fontSize: 10.5, color: TINTA_TENUE }}>El menos activo (de los que compraron)</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: TINTA }}>{r.menosActivo.quien}</div>
                <div style={{ fontSize: 11.5, color: TINTA_SUAVE }}>{pesos(r.menosActivo.dinero)} · {r.menosActivo.piezas} pz · {r.menosActivo.tickets} {r.menosActivo.tickets === 1 ? 'visita' : 'visitas'}</div>
              </div>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><Th num>#</Th><Th>Mayorista</Th><Th num>Compras</Th><Th num>Piezas</Th><Th num>Visitas</Th><Th>Última</Th></tr></thead>
              <tbody>
                {r.lista.map((f, i) => (
                  <tr key={f.quien} data-mayorista={f.quien} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                    <Td num color={TINTA_TENUE}>{f.puesto}</Td>
                    <Td fuerte>{f.quien}</Td>
                    <Td num fuerte>{pesos(f.dinero)}</Td>
                    <Td num>{f.piezas}</Td>
                    <Td num>{f.tickets}</Td>
                    <Td color={TINTA_SUAVE}>{diaMes(f.ultima)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid ' + LINEA }}>
                  <Td /><Td fuerte>Total ({r.total.clientes})</Td>
                  <Td num fuerte>{pesos(r.total.dinero)}</Td><Td num fuerte>{r.total.piezas}</Td><Td num fuerte>{r.total.tickets}</Td><Td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {r.sinCompras.length > 0 && (
        <details data-sin-compras={r.sinCompras.length}>
          <summary style={{ fontSize: 12, color: TINTA_SUAVE, cursor: 'pointer' }}>
            {r.sinCompras.length} {r.sinCompras.length === 1 ? 'mayorista no compró' : 'mayoristas no compraron'} en estos {r.dias} días
          </summary>
          <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: '6px 0 0', lineHeight: 1.6 }}>
            {r.sinCompras.slice(0, 40).map(c => `${c.quien} (${c.ultima ? 'última ' + diaMes(c.ultima) : 'sin fecha'})`).join(' · ')}
            {r.sinCompras.length > 40 && ` · y ${r.sinCompras.length - 40} más`}
          </p>
        </details>
      )}
    </Tarjeta>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  La vista del administrador: todas las plazas
// ═══════════════════════════════════════════════════════════════════════════

function ResumenDeTodas({ plazas }) {
  const g = useMemo(() => resumenGlobal(Object.fromEntries(plazas.map(p => [p.slug, p]))), [plazas])
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

      <Tarjeta>
        <h3 style={{ fontSize: 14.5, fontWeight: 800, color: TINTA, margin: 0 }}>Las plazas, juntas</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[['Ventas', pesos(g.ventaTotal)], ['Efectivo cobrado', pesos(g.efectivoCobrado)], ['Tarjeta', pesos(g.tarjeta)],
            ['Transferencias', pesos(g.transferencia)], ['Gastos', pesos(g.gastos)], ['Sueldo', pesos(g.sueldo)]].map(([t, v]) => (
            <div key={t} style={{ flex: 1, minWidth: 130, padding: '10px 14px', border: '1px solid ' + LINEA, borderRadius: 16 }}>
              <div style={{ fontSize: 10.5, color: TINTA_TENUE }}>{t}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: TINTA, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            </div>
          ))}
        </div>
        {g.piezas && (
          <p data-piezas-globales style={{ fontSize: 12.5, color: TINTA_SUAVE, margin: 0 }}>
            Piezas: <strong>Fundas {g.piezas.fundas}</strong> · <strong>Hidrogel {g.piezas.hidrogel}</strong> · <strong>Stickers {g.piezas.stickers}</strong>
            {' '}= <strong style={{ color: VERDE }}>{g.piezas.total} piezas</strong>
          </p>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th>Plaza</Th><Th num>Ventas</Th><Th num>Esperado en caja</Th><Th num>Contado</Th><Th>Estado</Th></tr></thead>
            <tbody>
              {g.filas.map((f, i) => (
                <tr key={f.slug} data-plaza-resumen={f.slug} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                  <Td fuerte>{plazas.find(p => p.slug === f.slug)?.nombre}{f.ciclo ? ' · ciclo de 4 semanas' : ''}</Td>
                  <Td num>{pesos(f.ventaTotal)}</Td>
                  <Td num>{f.esperadoEnCaja === null ? '—' : pesos(f.esperadoEnCaja)}</Td>
                  <Td num>{f.contado === null || f.contado === undefined ? '—' : pesos(f.contado)}</Td>
                  <Td><Semaforo estado={f.estado} diferencia={f.diferencia} compacto /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  const { plazas, cargando, error, hoy, referencia, mover, esActual, hayAnterior, guardar } = c

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
