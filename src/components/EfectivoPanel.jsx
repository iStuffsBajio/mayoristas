// Flujo de efectivo por sucursal.
//
// ── Bloques semanales, no un acumulado ─────────────────────────────────────
//
// Lo decidió el dueño así. Cada semana es su propio bloque con su cifra y su
// botón de marcarla como depositada; lo que no se marcó se va acumulando. Con
// un saldo corrido no se podía saber QUÉ semana quedó sin depositar: sumaba
// bien y no servía de nada, porque la pregunta es «¿de qué semana es este
// dinero?» y un saldo de $38,000 no la contesta.
//
// ── Lo que esta pantalla NO puede hacer, y lo dice ────────────────────────
//
// Antes del 2026-11-05 nadie registraba las salidas de caja en Eleventa:
// `ACUMULADO_SALIDAS` sale en cero en 2,128 de los 2,136 días de
// Aguascalientes. Para esas semanas el esperado es un TECHO, no una cifra, y
// restarle el depósito daría un faltante inventado que en pantalla no se
// distingue de uno real.
//
// Por eso esos bloques salen en gris con su aviso y sin diferencia. Un verde
// o un rojo calculado sobre un techo sería peor que no enseñar nada.

import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiConfigurada } from '../lib/api'
import { useCaja } from '../lib/useCaja'
import {
  ESTADOS, DIAS, pesos, pesosCortos, semaforo, faltantesDe, gastosQueDuelen,
  periodoQueCubre, fechaDeDeposito, nombreDia, semanaDe,
} from '../lib/caja'

const TINTA       = '#101619'
const TINTA_SUAVE = '#4A5A61'
const TINTA_TENUE = '#8598A1'
const LINEA       = '#D6E0E4'
const ROSA        = '#C4156F'
const VERDE       = '#5E9422'
const AMBAR       = '#B45309'
const GRIS        = '#8598A1'

const COLOR = { verde: VERDE, amarillo: AMBAR, rojo: ROSA, gris: GRIS }
const PUNTO = { verde: '🟢', amarillo: '🟡', rojo: '🔴', gris: '⚪' }

const DICE_ESTADO = {
  [ESTADOS.SIN_CONTROL]:    'Sin control de salidas',
  [ESTADOS.SIN_CONFIG]:     'Sin configurar',
  [ESTADOS.PENDIENTE]:      'Pendiente',
  [ESTADOS.COMPLETO]:       'Depositado completo',
  [ESTADOS.CON_DIFERENCIA]: 'Depositado con diferencia',
  [ESTADOS.ATRASADO]:       'Atrasado',
  [ESTADOS.NO_DEPOSITADO]:  'No depositado',
}

const caja = {
  backgroundColor: '#fff', borderRadius: 30, border: '1px solid ' + LINEA,
  padding: '22px 20px', boxShadow: '0 2px 12px rgba(16,22,25,0.04)',
}

const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 14, border: '1.5px solid rgba(16,22,25,0.09)',
  backgroundColor: '#F4F7F8', fontSize: 14, color: TINTA, outline: 'none',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

const Etiqueta = ({ children }) => (
  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: TINTA_TENUE,
    textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>{children}</label>
)

const Boton = ({ onClick, children, tenue, disabled, title }) => (
  <button type="button" onClick={onClick} disabled={disabled} title={title}
    style={{
      padding: '8px 16px', borderRadius: 999, fontSize: 12.5, fontWeight: 700,
      fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
      border: tenue ? '1.5px solid ' + LINEA : 'none',
      background: tenue ? '#fff' : disabled ? '#C9D5DA' : 'linear-gradient(135deg,#D51A7A,#FF6B1A)',
      color: tenue ? TINTA_SUAVE : '#fff',
      boxShadow: tenue || disabled ? 'none' : '0 4px 14px rgba(213,26,122,0.22)',
    }}>{children}</button>
)

/** El rango de una semana, dicho corto: «3 al 9 de nov». */
function rangoCorto({ desde, hasta }) {
  const f = s => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const a = f(desde), b = f(hasta)
  const mes = d => d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} al ${b.getDate()} de ${mes(b)}`
    : `${a.getDate()} de ${mes(a)} al ${b.getDate()} de ${mes(b)}`
}

/**
 * El ícono de «¿de dónde sale?».
 *
 * Lo pidió el dueño en cada total. No abre un panel: el desglose va en el
 * `title`, que es lo que ya lee el resto del panel y funciona en el teléfono
 * al mantener pulsado.
 */
const DeDonde = ({ texto }) => (
  <span title={texto} aria-label={texto}
    style={{ cursor: 'help', color: TINTA_TENUE, fontSize: 11, marginLeft: 5, userSelect: 'none' }}>ⓘ</span>
)

// ── La tarjeta de una plaza ─────────────────────────────────────────────────

function TarjetaPlaza({ plaza, onVer }) {
  const { bloques, acumulado, params, enCaja, sinDatos, nombre, estacional } = plaza
  // El bloque de arriba es el de la semana más reciente, que es el que se está
  // viviendo. El semáforo de la tarjeta es el suyo, más el límite de efectivo,
  // que no depende de ninguna semana en concreto.
  const ultimo = bloques[0]
  const color = sinDatos ? 'gris' : semaforo({ ...ultimo, enCaja, params })
  const pasaLimite = params.limiteEfectivo !== null && enCaja !== null && enCaja > params.limiteEfectivo

  return (
    <div data-plaza-caja={plaza.slug} data-semaforo={color}
      style={{ ...caja, padding: '18px 18px', borderLeft: `4px solid ${COLOR[color]}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h4 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: TINTA }}>
          {nombre}{estacional && <span style={{ fontSize: 10, fontWeight: 600, color: TINTA_TENUE }}> · por temporada</span>}
        </h4>
        <span style={{ fontSize: 13 }}>{PUNTO[color]}</span>
      </div>

      {sinDatos ? (
        <p style={{ fontSize: 12, color: AMBAR, margin: '12px 0 0', lineHeight: 1.6 }}>
          Sin archivo publicado. No es que no haya movimiento: es que el extractor
          todavía no ha corrido para esta plaza.
        </p>
      ) : (
        <>
          <div style={{ margin: '14px 0 0' }}>
            <Etiqueta>Efectivo en caja hoy</Etiqueta>
            {enCaja === null ? (
              <p style={{ margin: 0, fontSize: 12.5, color: AMBAR, lineHeight: 1.5 }}>
                Falta el fondo fijo. Sin él no se puede decir cuánto debería haber.
              </p>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: pasaLimite ? ROSA : TINTA, letterSpacing: '-0.02em' }}>
                  {pesosCortos(enCaja)}
                  <DeDonde texto={`Fondo fijo ${pesos(params.fondoFijo)} + las ${acumulado.semanas} semanas sin depositar (${pesos(acumulado.total)})`} />
                </p>
                {params.limiteEfectivo !== null && (
                  <p style={{ margin: '3px 0 0', fontSize: 11, color: pasaLimite ? ROSA : TINTA_TENUE, fontWeight: pasaLimite ? 700 : 500 }}>
                    {pasaLimite ? `⚠ pasa el límite de ${pesosCortos(params.limiteEfectivo)}` : `límite ${pesosCortos(params.limiteEfectivo)}`}
                  </p>
                )}
              </>
            )}
          </div>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid ' + LINEA, display: 'grid', gap: 5 }}>
            <Renglon k="Sin depositar" v={pesos(acumulado.total)} fuerte
              nota={acumulado.techo ? 'es un máximo: hay semanas sin control de salidas' : null} />
            <Renglon k="Semanas" v={String(acumulado.semanas)} />
            {acumulado.masVieja && (
              <Renglon k="La más vieja" v={rangoCorto(semanaDe(acumulado.masVieja))} />
            )}
            <Renglon k="Última semana" v={DICE_ESTADO[ultimo?.estado] ?? '—'} />
          </div>

          <div style={{ marginTop: 14 }}>
            <Boton onClick={() => onVer(plaza.slug)} tenue>Ver los bloques</Boton>
          </div>
        </>
      )}
    </div>
  )
}

const Renglon = ({ k, v, fuerte, nota }) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
      <span style={{ color: TINTA_TENUE }}>{k}</span>
      <span style={{ color: TINTA, fontWeight: fuerte ? 800 : 600, textAlign: 'right' }}>{v}</span>
    </div>
    {nota && <p style={{ margin: '2px 0 0', fontSize: 10.5, color: AMBAR, lineHeight: 1.45 }}>{nota}</p>}
  </div>
)

// ── Un bloque semanal ───────────────────────────────────────────────────────

/** Las líneas del cálculo, en el orden que puso el dueño. */
const LINEAS = [
  ['ventaTotal',      'Venta total',                      'suma', 'La venta del día en todas las formas de pago'],
  ['tarjeta',         '− Tarjeta',                        'resta', 'VENTAS_TARJETA del corte de Eleventa, con la parte de los pagos mixtos ya repartida'],
  ['transferencia',   '− Transferencia',                  'resta', 'VENTAS_TRANSFERENCIA del corte'],
  ['otrasNoEfectivo', '− Vales, crédito y cheque',        'resta', 'VENTAS_VALES + VENTAS_CREDITO + VENTAS_CHEQUE'],
  ['efectivoCobrado', '= Efectivo cobrado',               'total', 'VENTAS_EFECTIVO del corte de Eleventa'],
  ['devoluciones',    '− Devoluciones en efectivo',       'resta', 'DEVOLUCIONES_VENTAS_EFECTIVO del corte. No se suman las de CORTE_MOVIMIENTOS: es el mismo suceso en dos tablas y se restaría dos veces'],
  ['gastos',          '− Gastos pagados de caja',         'resta', 'Salidas registradas en Eleventa con tipo gasto, más lo capturado aquí'],
  ['retiros',         '− Retiros autorizados',            'resta', 'Salidas de caja registradas como retiro'],
  ['adelantos',       '− Adelantos al personal',          'resta', 'Salidas de caja registradas como adelanto'],
  ['proveedores',     '− Pagos a proveedores',            'resta', 'Salidas de caja registradas como pago a proveedor'],
  ['otrasSalidas',    '− Otras salidas',                  'resta', 'Lo que Eleventa registró como Salida sin clasificar: sólo sabe Entrada o Salida'],
  ['entradas',        '+ Entradas de caja',               'suma',  'Lo que Eleventa registró como Entrada'],
  ['neto',            '= EFECTIVO NETO',                  'total', 'Efectivo cobrado menos devoluciones y salidas, más entradas'],
]

function Bloque({ plaza, bloque, onMarcar, onDesmarcar, onAjustar }) {
  const [abierto, setAbierto]   = useState(false)
  const [marcando, setMarcando] = useState(false)
  const { params } = plaza

  const color = semaforo({ ...bloque, enCaja: null, params })
  const cubre = periodoQueCubre({ desde: bloque.clave, hasta: bloque.hasta }, params)
  const vence = params.diaDeposito ? fechaDeDeposito(bloque, params) : null

  return (
    <div data-bloque={bloque.clave} data-estado={bloque.estado} data-depositado={bloque.depositado ? '1' : '0'}
      style={{ ...caja, padding: 0, overflow: 'hidden', borderLeft: `4px solid ${COLOR[color]}` }}>

      {/* La cabecera del bloque: su semana, su cifra y su estado. */}
      <div style={{ padding: '16px 18px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
        <div style={{ minWidth: 150, flex: '1 1 150px' }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: TINTA }}>
            {rangoCorto(bloque)} {PUNTO[color]}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: TINTA_TENUE }}>
            {DICE_ESTADO[bloque.estado]}
            {vence && !bloque.depositado && ` · toca el ${nombreDia(vence)} ${vence.slice(8)}`}
          </p>
        </div>

        <div style={{ textAlign: 'right' }}>
          <Etiqueta>{bloque.depositado ? 'Esperado' : 'Por depositar'}</Etiqueta>
          <p style={{ margin: 0, fontSize: 19, fontWeight: 800, color: TINTA, letterSpacing: '-0.02em' }}>
            {pesos(bloque.esperado)}
            {bloque.techo && <span style={{ fontSize: 11, fontWeight: 600, color: AMBAR }}> máx.</span>}
          </p>
        </div>

        {bloque.depositado && (
          <div style={{ textAlign: 'right' }}>
            <Etiqueta>Depositado</Etiqueta>
            <p style={{ margin: 0, fontSize: 19, fontWeight: 800, color: TINTA, letterSpacing: '-0.02em' }}>
              {pesos(bloque.real)}
            </p>
            {bloque.diferencia !== null && bloque.diferencia !== 0 && (
              <p style={{ margin: '2px 0 0', fontSize: 11.5, fontWeight: 700, color: bloque.dentroTolerancia ? AMBAR : ROSA }}>
                {bloque.diferencia > 0 ? 'sobra ' : 'falta '}{pesos(Math.abs(bloque.diferencia))}
                {bloque.dentroTolerancia && ' · dentro de tolerancia'}
              </p>
            )}
            {bloque.diferencia === null && (
              <p style={{ margin: '2px 0 0', fontSize: 11, color: AMBAR }}>no se puede comparar</p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <Boton tenue onClick={() => setAbierto(a => !a)}>
            {abierto ? 'Ocultar días' : 'Ver días'}
          </Boton>
          {bloque.depositado
            ? <Boton tenue onClick={() => onDesmarcar(plaza.slug, bloque.clave)}
                title="Quita la marca y el bloque vuelve a acumular">Quitar marca</Boton>
            : <Boton onClick={() => setMarcando(m => !m)}>Marcar depositado</Boton>}
        </div>
      </div>

      {/* El aviso del techo. Va arriba de todo porque cambia cómo se lee cada
          cifra de abajo, no sólo la diferencia. */}
      {bloque.techo && (
        <div style={{ padding: '10px 18px', background: 'rgba(180,83,9,0.06)', borderTop: '1px solid ' + LINEA }}>
          <p style={{ margin: 0, fontSize: 11.5, color: AMBAR, lineHeight: 1.6 }}>
            ⚠ {bloque.porque} No se compara contra el depósito: una diferencia
            calculada sobre un máximo no se distingue en pantalla de una real.
          </p>
        </div>
      )}
      {bloque.estado === ESTADOS.SIN_CONFIG && (
        <div style={{ padding: '10px 18px', background: 'rgba(180,83,9,0.06)', borderTop: '1px solid ' + LINEA }}>
          <p style={{ margin: 0, fontSize: 11.5, color: AMBAR, lineHeight: 1.6 }}>⚠ {bloque.porque}</p>
        </div>
      )}

      {marcando && !bloque.depositado && (
        <FormaDeposito plaza={plaza} bloque={bloque}
          onCancelar={() => setMarcando(false)}
          onGuardar={async d => { await onMarcar(d); setMarcando(false) }} />
      )}

      {abierto && <TablaDias plaza={plaza} bloque={bloque} cubre={cubre} onAjustar={onAjustar} />}
    </div>
  )
}

/** La sección para marcar el bloque como depositado. */
function FormaDeposito({ plaza, bloque, onGuardar, onCancelar }) {
  const [monto, setMonto] = useState(String(bloque.esperado.toFixed(2)))
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [hora, setHora]   = useState(new Date().toTimeString().slice(0, 5))
  const [folio, setFolio] = useState('')
  const [quien, setQuien] = useState(plaza.params.responsable || '')
  const [comprobante, setComprobante] = useState(false)
  const [nota, setNota]   = useState('')
  const [guardando, setGuardando] = useState(false)

  const n = Number(monto)
  const valido = Number.isFinite(n) && n >= 0 && monto.trim() !== ''
  const dif = valido ? n - bloque.esperado : null

  return (
    <div style={{ padding: '16px 18px', borderTop: '1px solid ' + LINEA, background: '#F9FBFC' }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        <div>
          <Etiqueta>Monto depositado</Etiqueta>
          <input value={monto} onChange={e => setMonto(e.target.value)} inputMode="decimal" style={inp} />
        </div>
        <div><Etiqueta>Fecha</Etiqueta><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp} /></div>
        <div><Etiqueta>Hora</Etiqueta><input type="time" value={hora} onChange={e => setHora(e.target.value)} style={inp} /></div>
        <div><Etiqueta>Folio o referencia</Etiqueta><input value={folio} onChange={e => setFolio(e.target.value)} placeholder="ficha" style={inp} /></div>
        <div><Etiqueta>Quién depositó</Etiqueta><input value={quien} onChange={e => setQuien(e.target.value)} style={inp} /></div>
      </div>

      <div style={{ marginTop: 12 }}>
        <Etiqueta>Nota</Etiqueta>
        <input value={nota} onChange={e => setNota(e.target.value)} style={inp}
          placeholder="opcional: lo que haga falta explicar" />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12.5, color: TINTA_SUAVE, cursor: 'pointer' }}>
        <input type="checkbox" checked={comprobante} onChange={e => setComprobante(e.target.checked)}
          style={{ accentColor: '#D51A7A', width: 16, height: 16 }} />
        Tengo el comprobante
      </label>

      {/* La diferencia se enseña ANTES de guardar. Guardar y luego descubrirla
          obliga a volver a abrir el bloque para entender qué pasó. */}
      {valido && dif !== null && !bloque.techo && (
        <p style={{ margin: '12px 0 0', fontSize: 12.5, fontWeight: 700,
          color: dif === 0 ? VERDE : Math.abs(dif) <= (plaza.params.tolerancia ?? 0) ? AMBAR : ROSA }}>
          {dif === 0 ? '✓ cuadra con lo esperado'
            : `${dif > 0 ? 'Sobran' : 'Faltan'} ${pesos(Math.abs(dif))} contra los ${pesos(bloque.esperado)} esperados`}
        </p>
      )}
      {valido && bloque.techo && (
        <p style={{ margin: '12px 0 0', fontSize: 12.5, color: AMBAR }}>
          Esta semana no tiene control de salidas: se guarda el depósito, pero no
          se calcula diferencia.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <Boton disabled={!valido || guardando}
          onClick={async () => {
            setGuardando(true)
            try {
              await onGuardar({
                sucursal: plaza.slug, semana: bloque.clave,
                monto: n, fecha, hora, folio, comprobante, deposito: quien, nota,
              })
            } finally { setGuardando(false) }
          }}>
          {guardando ? 'Guardando…' : 'Guardar depósito'}
        </Boton>
        <Boton tenue onClick={onCancelar}>Cancelar</Boton>
      </div>
    </div>
  )
}

/** La tabla diaria: las trece líneas del cálculo, por día y sumadas. */
function TablaDias({ plaza, bloque, cubre, onAjustar }) {
  const [ajustando, setAjustando] = useState(null)

  return (
    <div style={{ borderTop: '1px solid ' + LINEA, padding: '14px 18px', overflowX: 'auto' }}>
      <p style={{ margin: '0 0 10px', fontSize: 11, color: TINTA_TENUE }}>
        Cubre la venta del {rangoCorto(cubre)}
        {plaza.respaldo && ` · respaldo del ${plaza.respaldo.fecha}`}
      </p>

      <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, fontWeight: 700,
              color: TINTA_TENUE, textTransform: 'uppercase', letterSpacing: '0.06em',
              borderBottom: '1px solid ' + LINEA, position: 'sticky', left: 0, background: '#fff' }}>Línea</th>
            {bloque.filas.map(f => (
              <th key={f.f} style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, fontWeight: 700,
                color: f.conControl ? TINTA_TENUE : AMBAR, textTransform: 'uppercase',
                letterSpacing: '0.04em', borderBottom: '1px solid ' + LINEA, whiteSpace: 'nowrap' }}
                title={f.conControl ? f.f : `${f.f} · sin control de salidas`}>
                {nombreDia(f.f).slice(0, 3)}
                <br />{f.f.slice(8)}
              </th>
            ))}
            <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, fontWeight: 800,
              color: TINTA, textTransform: 'uppercase', letterSpacing: '0.06em',
              borderBottom: '1px solid ' + LINEA }}>Semana</th>
          </tr>
        </thead>
        <tbody>
          {LINEAS.map(([clave, titulo, clase, deDonde]) => {
            const esTotal = clase === 'total'
            return (
              <tr key={clave} data-linea={clave}
                style={{ background: esTotal ? 'rgba(16,22,25,0.025)' : undefined }}>
                <td style={{ padding: '6px 8px', color: esTotal ? TINTA : TINTA_SUAVE,
                  fontWeight: esTotal ? 800 : 500, whiteSpace: 'nowrap',
                  position: 'sticky', left: 0, background: esTotal ? '#F7F8F9' : '#fff' }}>
                  {titulo}<DeDonde texto={deDonde} />
                </td>
                {bloque.filas.map(f => {
                  const ajustado = f.ajustado && Object.prototype.hasOwnProperty.call(f.ajustado.valores ?? {}, clave)
                  return (
                    <td key={f.f}
                      onClick={() => setAjustando({ fecha: f.f, clave, fila: f })}
                      title={ajustado
                        ? `Ajustado. Calculado: ${pesos(f.calculado?.[clave])} · motivo: ${f.ajustado.motivo} · ${f.ajustado.quien} el ${String(f.ajustado.cuando).slice(0, 10)}`
                        : 'Clic para ajustar'}
                      style={{ padding: '6px 8px', textAlign: 'right', cursor: 'pointer',
                        fontWeight: esTotal ? 800 : 500, whiteSpace: 'nowrap',
                        color: ajustado ? ROSA : !f.hayDato ? '#C9D5DA' : esTotal ? TINTA : TINTA_SUAVE }}>
                      {ajustado && '✏️ '}
                      {f.hayDato || f[clave] ? pesos(f[clave]) : '—'}
                    </td>
                  )
                })}
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800,
                  color: esTotal ? TINTA : TINTA_SUAVE, whiteSpace: 'nowrap' }}>
                  {pesos(bloque.total[clave])}
                </td>
              </tr>
            )
          })}

          {/* El arqueo va separado: no es una línea del cálculo, es la
              comprobación contra él. */}
          <tr data-linea="arqueo">
            <td style={{ padding: '10px 8px 6px', color: TINTA_SUAVE, fontWeight: 700,
              borderTop: '1px solid ' + LINEA, whiteSpace: 'nowrap',
              position: 'sticky', left: 0, background: '#fff' }}>
              Arqueo al cierre<DeDonde texto="EFECTIVO_AL_CIERRE de la tabla TURNOS: lo que se contó al cerrar el turno" />
            </td>
            {bloque.filas.map(f => {
              const dif = f.arqueo === null ? null : f.arqueo - (f.efectivoCobrado - f.devoluciones)
              return (
                <td key={f.f} title={f.cajero ? `cerró ${f.cajero}` : undefined}
                  style={{ padding: '10px 8px 6px', textAlign: 'right', borderTop: '1px solid ' + LINEA,
                    whiteSpace: 'nowrap', color: f.arqueo === null ? '#C9D5DA' : dif && Math.abs(dif) > 0.05 ? ROSA : TINTA_SUAVE }}>
                  {f.arqueo === null ? '—' : pesos(f.arqueo)}
                </td>
              )
            })}
            <td style={{ padding: '10px 8px 6px', textAlign: 'right', fontWeight: 700,
              borderTop: '1px solid ' + LINEA, color: TINTA_SUAVE, whiteSpace: 'nowrap' }}>
              {pesos(bloque.filas.reduce((a, f) => a + (f.arqueo ?? 0), 0))}
            </td>
          </tr>
        </tbody>
      </table>

      {ajustando && (
        <FormaAjuste plaza={plaza} {...ajustando}
          onCerrar={() => setAjustando(null)}
          onGuardar={async a => { await onAjustar(a); setAjustando(null) }} />
      )}
    </div>
  )
}

const MOTIVOS = [
  ['error-de-captura',    'Error de captura'],
  ['gasto-no-registrado', 'Gasto no registrado'],
  ['devolucion',          'Devolución'],
  ['faltante',            'Faltante'],
  ['otro',                'Otro'],
]

/** Corregir una cifra. Todo ajuste lleva motivo, y lo calculado se conserva. */
function FormaAjuste({ plaza, fecha, clave, fila, onGuardar, onCerrar }) {
  const titulo = LINEAS.find(([k]) => k === clave)?.[1] ?? clave
  const calculado = fila.calculado?.[clave] ?? fila[clave]
  const [valor, setValor]   = useState(String(Number(fila[clave] ?? 0).toFixed(2)))
  const [motivo, setMotivo] = useState('')
  const [nota, setNota]     = useState('')
  const [guardando, setGuardando] = useState(false)

  const n = Number(valor)
  // Sin motivo no se guarda. Una cifra corregida sin explicación no se
  // distingue de un error de captura, que es una de las cosas que esto sirve
  // para corregir.
  const valido = Number.isFinite(n) && n >= 0 && valor.trim() !== '' && !!motivo
  const esTotal = clave === 'neto' || clave === 'ventaTotal'

  return (
    <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 20, background: '#F9FBFC', border: '1.5px solid ' + LINEA }}>
      <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: TINTA }}>
        Ajustar «{titulo}» del {fecha}
      </p>

      {esTotal ? (
        <p style={{ margin: 0, fontSize: 12.5, color: AMBAR, lineHeight: 1.6 }}>
          Esta línea es un total: sale de las otras. Ajústala corrigiendo la
          línea que esté mal, o el total diría una cosa y sus partes otra.
        </p>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div>
              <Etiqueta>Valor calculado</Etiqueta>
              <p style={{ margin: 0, padding: '9px 0', fontSize: 14, fontWeight: 700, color: TINTA_TENUE }}>
                {pesos(calculado)}
              </p>
            </div>
            <div>
              <Etiqueta>Valor ajustado</Etiqueta>
              <input value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" style={inp} />
            </div>
            <div>
              <Etiqueta>Motivo</Etiqueta>
              <select value={motivo} onChange={e => setMotivo(e.target.value)} style={inp}>
                <option value="">elige uno…</option>
                {MOTIVOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Etiqueta>Comentario</Etiqueta>
            <input value={nota} onChange={e => setNota(e.target.value)} style={inp}
              placeholder="qué pasó, para que se entienda en un mes" />
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {!esTotal && (
          <Boton disabled={!valido || guardando}
            onClick={async () => {
              setGuardando(true)
              try {
                await onGuardar({
                  sucursal: plaza.slug, fecha,
                  valores: { ...(fila.ajustado?.valores ?? {}), [clave]: n },
                  motivo, nota,
                })
              } finally { setGuardando(false) }
            }}>
            {guardando ? 'Guardando…' : 'Guardar ajuste'}
          </Boton>
        )}
        {fila.ajustado && (
          <Boton tenue onClick={async () => { await onGuardar({ sucursal: plaza.slug, fecha, motivo: null }); }}
            title="El día vuelve a su valor calculado">Regresar al calculado</Boton>
        )}
        <Boton tenue onClick={onCerrar}>Cerrar</Boton>
      </div>
    </div>
  )
}

// ── Los faltantes que ya trae Eleventa ──────────────────────────────────────

function Faltantes({ plazas }) {
  const anio = new Date().getFullYear()
  const porPlaza = plazas.map(p => ({
    ...p, r: faltantesDe(p.faltantes, { desde: `${anio}-01-01`, hasta: `${anio}-12-31` }),
  })).filter(p => p.r.veces > 0).sort((a, b) => b.r.total - a.r.total)

  const total = porPlaza.reduce((a, p) => a + p.r.total, 0)
  const efectivo = plazas.reduce((a, p) =>
    a + p.bloques.reduce((s, b) => s + b.total.efectivoCobrado, 0), 0)

  if (!porPlaza.length) return null

  return (
    <div data-faltantes style={{ ...caja, borderLeft: `4px solid ${ROSA}` }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 14.5, fontWeight: 800, color: TINTA }}>
        💸 Efectivo que faltó al cerrar turno · {anio}
      </h3>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: TINTA_SUAVE, lineHeight: 1.65 }}>
        Esto no lo captura nadie: lo escribe Eleventa sola cuando lo contado al
        cerrar no cuadra, con el nombre de quien cerró. <strong>No es un retiro
        y no resta del efectivo neto</strong> —contarlo como salida lo haría
        desaparecer justo en el caso que importa—. Son <strong>{pesos(total)}</strong> en{' '}
        {porPlaza.reduce((a, p) => a + p.r.veces, 0)} veces.
      </p>

      <div style={{ display: 'grid', gap: 14 }}>
        {porPlaza.map(p => (
          <div key={p.slug} style={{ padding: '12px 14px', borderRadius: 18, background: '#F9FBFC', border: '1px solid ' + LINEA }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 13, color: TINTA }}>{p.nombre}</strong>
              <span style={{ fontSize: 13, fontWeight: 800, color: ROSA }}>
                {pesos(p.r.total)} <span style={{ fontSize: 11, fontWeight: 600, color: TINTA_TENUE }}>en {p.r.veces}</span>
              </span>
            </div>
            <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
              {p.r.porPersona.map(x => (
                <div key={x.persona} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
                  <span style={{ color: TINTA_SUAVE }}>
                    {x.persona}
                    {x.veces > 1 && <span style={{ color: ROSA, fontWeight: 700 }}> · {x.veces} veces</span>}
                  </span>
                  <span style={{ color: TINTA, fontWeight: 700 }}>{pesos(x.monto)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {efectivo > 0 && (
        <p style={{ margin: '14px 0 0', fontSize: 11.5, color: TINTA_TENUE, lineHeight: 1.6 }}>
          Contra {pesos(efectivo)} de efectivo cobrado en las semanas a la vista,
          es el {(total / efectivo * 100).toFixed(2)}%.
        </p>
      )}
    </div>
  )
}

// ── Los parámetros ─────────────────────────────────────────────────────────

const CAMPOS = [
  ['fondoFijo',      'Fondo fijo de caja',          'numero', 'El cambio que se queda en la sucursal'],
  ['limiteEfectivo', 'Límite de efectivo en caja',  'numero', 'Por seguridad: pasarlo pone la tarjeta en rojo'],
  ['tolerancia',     'Tolerancia de diferencia',    'numero', 'En pesos. Dentro de ella, la diferencia es amarilla'],
  ['gastoMaxSinComprobante', 'Gasto máximo sin comprobante', 'numero', 'Por encima, el gasto salta como alerta'],
  ['horaLimite',     'Hora límite del depósito',    'hora',   'Pasada, el bloque sale atrasado'],
  ['cuenta',         'Cuenta bancaria destino',     'texto',  ''],
  ['responsable',    'Responsable del depósito',    'texto',  ''],
  ['desdeControlSalidas', 'Registra salidas en Eleventa desde', 'fecha',
    'ANTES de esta fecha el esperado es un máximo y no se compara contra el depósito'],
]

function Parametros({ plazas, onGuardar }) {
  const [editando, setEditando] = useState(null)
  const [borrador, setBorrador] = useState({})
  const [guardando, setGuardando] = useState(false)

  const abrir = p => { setEditando(p.slug); setBorrador({ ...p.params }) }
  const set = (k, v) => setBorrador(b => ({ ...b, [k]: v }))

  /**
   * Los cuatro que hacen falta para poder juzgar una plaza, por su nombre.
   *
   * No son todos los campos, y la diferencia importa. Contando sólo los
   * numéricos, el DÍA DE DEPÓSITO se quedaba fuera: una plaza decía «✓
   * configurada» y seguía saliendo en gris, porque `estadoDeposito` devuelve
   * «sin configurar» sin ese día. Eso manda a buscar un fallo que no existe.
   *
   * El límite de efectivo y el gasto máximo NO entran: sin ellos la pantalla
   * funciona igual, sólo que no vigila esas dos cosas. La cuenta y el
   * responsable son para el reporte, no para el cálculo.
   */
  const BLOQUEAN = [
    ['diaDeposito',         'el día de depósito'],
    ['tolerancia',          'la tolerancia'],
    ['fondoFijo',           'el fondo fijo'],
    ['desdeControlSalidas', 'desde cuándo registra salidas'],
  ]
  const faltan = p => BLOQUEAN.filter(([k]) =>
    p.params[k] === null || p.params[k] === undefined || p.params[k] === '')

  return (
    <div style={caja}>
      <h3 style={{ margin: '0 0 6px', fontSize: 14.5, fontWeight: 800, color: TINTA }}>
        ⚙️ Parámetros por sucursal
      </h3>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: TINTA_SUAVE, lineHeight: 1.65 }}>
        Ninguno trae valor por defecto a propósito. El fondo fijo, el límite y la
        tolerancia son decisiones tuyas: un número inventado aquí se leería en
        pantalla igual que uno tuyo, y se decidiría sobre él. Mientras falten, la
        plaza sale en gris y no se juzga.
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: TINTA_SUAVE, lineHeight: 1.65 }}>
        Sólo <strong>cuatro</strong> hacen falta para que una plaza se pueda
        juzgar: el día de depósito, la tolerancia, el fondo fijo y desde cuándo
        registra sus salidas en Eleventa. El límite de efectivo y el gasto
        máximo son opcionales —sin ellos la pantalla funciona igual, nada más
        que no vigila esas dos cosas—, y la cuenta y el responsable son para el
        reporte.
      </p>

      <div style={{ display: 'grid', gap: 12 }}>
        {plazas.map(p => (
          <div key={p.slug} style={{ padding: '14px 16px', borderRadius: 20, background: '#F9FBFC', border: '1px solid ' + LINEA }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: 13, color: TINTA }}>{p.nombre}</strong>
                {/* Se dice QUÉ falta, no cuántos faltan. Un «faltan 3 de 5» no
                    dice qué teclear, y obliga a abrir y comparar campo por
                    campo para averiguarlo. */}
                <p style={{ margin: '2px 0 0', fontSize: 11, color: faltan(p).length ? AMBAR : VERDE, lineHeight: 1.5 }}>
                  {faltan(p).length
                    ? `falta ${faltan(p).map(([, t]) => t).join(', ')}`
                    : '✓ lista para juzgarse'}
                  {p.params.diaDeposito && ` · deposita en ${DIAS[p.params.diaDeposito - 1]}`}
                </p>
              </div>
              <Boton tenue onClick={() => (editando === p.slug ? setEditando(null) : abrir(p))}>
                {editando === p.slug ? 'Cerrar' : 'Editar'}
              </Boton>
            </div>

            {editando === p.slug && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                  <div>
                    <Etiqueta>Día de depósito</Etiqueta>
                    <select value={borrador.diaDeposito ?? ''} onChange={e => set('diaDeposito', e.target.value === '' ? null : Number(e.target.value))} style={inp}>
                      <option value="">sin configurar</option>
                      {DIAS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <Etiqueta>Periodo que cubre</Etiqueta>
                    <select value={borrador.periodoCubre ?? 'semana-anterior'} onChange={e => set('periodoCubre', e.target.value)} style={inp}>
                      <option value="semana-anterior">la semana anterior</option>
                      <option value="semana-en-curso">la semana en curso</option>
                    </select>
                  </div>
                  {CAMPOS.map(([k, titulo, tipo, pista]) => (
                    <div key={k}>
                      <Etiqueta>{titulo}</Etiqueta>
                      <input
                        type={tipo === 'fecha' ? 'date' : tipo === 'hora' ? 'time' : 'text'}
                        inputMode={tipo === 'numero' ? 'decimal' : undefined}
                        value={borrador[k] ?? ''}
                        placeholder={tipo === 'numero' ? 'sin configurar' : ''}
                        onChange={e => set(k, e.target.value)} style={inp} />
                      {pista && <p style={{ margin: '4px 0 0', fontSize: 10.5, color: TINTA_TENUE, lineHeight: 1.45 }}>{pista}</p>}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <Boton disabled={guardando}
                    onClick={async () => {
                      setGuardando(true)
                      try { await onGuardar(p.slug, borrador); setEditando(null) }
                      finally { setGuardando(false) }
                    }}>
                    {guardando ? 'Guardando…' : 'Guardar parámetros'}
                  </Boton>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── El concentrado ─────────────────────────────────────────────────────────

function Concentrado({ plazas }) {
  const total = plazas.reduce((a, p) => a + p.acumulado.total, 0)
  const semanas = plazas.reduce((a, p) => a + p.acumulado.semanas, 0)
  const techo = plazas.some(p => p.acumulado.techo)
  const conPendiente = plazas.filter(p => p.acumulado.semanas > 0)

  return (
    <div data-concentrado style={{ ...caja, background: 'linear-gradient(135deg,#101619,#1d2b31)' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)',
        textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Lo que debe entrar al banco
      </h3>
      <p style={{ margin: 0, fontSize: 34, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
        {pesosCortos(total)}
        {techo && <span style={{ fontSize: 13, fontWeight: 600, color: '#FBBF24' }}> máx.</span>}
      </p>
      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,0.65)' }}>
        {semanas === 0 ? 'todo depositado' : `${semanas} ${semanas === 1 ? 'semana' : 'semanas'} sin marcar, en ${conPendiente.length} ${conPendiente.length === 1 ? 'plaza' : 'plazas'}`}
      </p>
      {techo && (
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#FBBF24', lineHeight: 1.6 }}>
          Es un máximo: hay semanas de antes de que las plazas registraran sus
          salidas de caja, y en ellas el esperado dice más dinero del que hay.
        </p>
      )}
      {conPendiente.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.12)', display: 'grid', gap: 6 }}>
          {conPendiente.sort((a, b) => b.acumulado.total - a.acumulado.total).map(p => (
            <div key={p.slug} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                {p.nombre}
                <span style={{ color: 'rgba(255,255,255,0.4)' }}> · {p.acumulado.semanas} sem</span>
              </span>
              <span style={{ color: '#fff', fontWeight: 700 }}>{pesos(p.acumulado.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── La pantalla ────────────────────────────────────────────────────────────

const VISTAS = [
  ['tablero',    'Tablero'],
  ['bloques',    'Bloques por sucursal'],
  ['faltantes',  'Faltantes'],
  ['parametros', 'Parámetros'],
]

export default function EfectivoPanel() {
  const { token, isAdmin } = useAuth()
  const [vista, setVista]  = useState('tablero')
  const [plazaAbierta, setPlazaAbierta] = useState('leon')

  const {
    plazas, cargando, error,
    marcar, desmarcar, ajustar, guardarParametros,
  } = useCaja(token)

  const abierta = useMemo(() => plazas.find(p => p.slug === plazaAbierta) ?? plazas[0], [plazas, plazaAbierta])

  const irA = slug => { setPlazaAbierta(slug); setVista('bloques') }

  // Esta pantalla es sólo del administrador. Los faltantes llevan el nombre de
  // quien cerró pegado a una cantidad de dinero que falta, así que ni la plaza
  // ve la suya. El backend lo rechaza igual; esto es para no enseñar una
  // pantalla que no va a cargar.
  if (!isAdmin) {
    return (
      <div style={caja}>
        <p style={{ margin: 0, fontSize: 13, color: TINTA_SUAVE, lineHeight: 1.7 }}>
          El flujo de efectivo es sólo del administrador.
        </p>
      </div>
    )
  }

  if (!apiConfigurada) {
    return (
      <div style={caja}>
        <p style={{ margin: 0, fontSize: 13, color: AMBAR, lineHeight: 1.7 }}>
          No hay servidor configurado, así que no se puede leer el flujo de
          efectivo: vive en un prefijo privado y lo sirve el backend.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      <nav className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {VISTAS.map(([id, t]) => (
          <button key={id} type="button" onClick={() => setVista(id)}
            className={'chip-plaza' + (vista === id ? ' activa' : '')}
            aria-current={vista === id ? 'page' : undefined}>
            <span className="chip-plaza-texto">{t}</span>
          </button>
        ))}
      </nav>

      {cargando && (
        <div style={caja}>
          <p style={{ margin: 0, fontSize: 13, color: TINTA_TENUE }}>Leyendo el flujo de las cinco plazas…</p>
        </div>
      )}

      {/* Un fallo se DICE. Un flujo vacío se lee como «no hay nada que
          depositar», que es lo contrario de «no pude mirar». */}
      {error && (
        <div style={{ ...caja, borderLeft: `4px solid ${ROSA}` }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: ROSA }}>No se pudo leer el flujo de efectivo</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: TINTA_SUAVE, lineHeight: 1.6 }}>
            {error} · Lo que se ve abajo, si se ve algo, está incompleto.
          </p>
        </div>
      )}

      {!cargando && vista === 'tablero' && (
        <>
          <Concentrado plazas={plazas} />
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
            {plazas.map(p => <TarjetaPlaza key={p.slug} plaza={p} onVer={irA} />)}
          </div>
          <Calendario plazas={plazas} />
        </>
      )}

      {!cargando && vista === 'bloques' && abierta && (
        <>
          <nav className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {plazas.map(p => (
              <button key={p.slug} type="button" onClick={() => setPlazaAbierta(p.slug)}
                className={'chip-plaza' + (p.slug === plazaAbierta ? ' activa' : '')}>
                <span className="chip-plaza-texto">{p.nombre}</span>
              </button>
            ))}
          </nav>
          {abierta.sinDatos ? (
            <div style={{ ...caja, borderLeft: `4px solid ${AMBAR}` }}>
              <p style={{ margin: 0, fontSize: 13, color: AMBAR, lineHeight: 1.7 }}>
                {abierta.nombre} no tiene archivo de flujo publicado. No es que no
                haya movimiento: es que el extractor todavía no ha corrido para esta
                plaza. Se arregla con <code>node scripts/extraer-caja.mjs --sucursal={abierta.slug}</code>.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {abierta.bloques.map(b => (
                <Bloque key={b.clave} plaza={abierta} bloque={b}
                  onMarcar={marcar} onDesmarcar={desmarcar} onAjustar={ajustar} />
              ))}
            </div>
          )}
          <GastosAlerta plaza={abierta} />
        </>
      )}

      {!cargando && vista === 'faltantes' && (
        <>
          <Faltantes plazas={plazas} />
          {plazas.every(p => faltantesDe(p.faltantes).veces === 0) && (
            <div style={caja}>
              <p style={{ margin: 0, fontSize: 13, color: TINTA_SUAVE, lineHeight: 1.7 }}>
                Ninguna plaza tiene descuadres al cerrar turno en lo que hay publicado.
              </p>
            </div>
          )}
        </>
      )}

      {!cargando && vista === 'parametros' && (
        <Parametros plazas={plazas} onGuardar={guardarParametros} />
      )}
    </div>
  )
}

/** El calendario de la semana en curso: efectivo neto por día y plaza. */
function Calendario({ plazas }) {
  const conDatos = plazas.filter(p => !p.sinDatos)
  if (!conDatos.length) return null
  const semana = conDatos[0].bloques[0]

  return (
    <div style={{ ...caja, overflowX: 'auto' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 14.5, fontWeight: 800, color: TINTA }}>
        📅 Efectivo neto de la semana en curso
      </h3>
      <p style={{ margin: '0 0 14px', fontSize: 11.5, color: TINTA_TENUE }}>
        {rangoCorto(semana)} · el día de depósito de cada plaza va marcado con ▲
      </p>
      <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, fontWeight: 700, color: TINTA_TENUE,
              textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid ' + LINEA }}>Plaza</th>
            {DIAS.map(d => (
              <th key={d} style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, fontWeight: 700, color: TINTA_TENUE,
                textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid ' + LINEA }}>{d.slice(0, 3)}</th>
            ))}
            <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, fontWeight: 800, color: TINTA,
              textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid ' + LINEA }}>Semana</th>
          </tr>
        </thead>
        <tbody>
          {conDatos.map(p => {
            const b = p.bloques[0]
            return (
              <tr key={p.slug}>
                <td style={{ padding: '7px 8px', color: TINTA, fontWeight: 600, whiteSpace: 'nowrap' }}>{p.nombre}</td>
                {b.filas.map((f, i) => (
                  <td key={f.f} style={{ padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap',
                    color: !f.hayDato ? '#C9D5DA' : f.neto < 0 ? ROSA : TINTA_SUAVE }}>
                    {p.params.diaDeposito === i + 1 && <span style={{ color: ROSA }}>▲ </span>}
                    {f.hayDato ? pesosCortos(f.neto) : '—'}
                  </td>
                ))}
                <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 800, color: TINTA, whiteSpace: 'nowrap' }}>
                  {pesosCortos(b.total.neto)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Gastos sin comprobante o por encima del máximo de esa plaza. */
function GastosAlerta({ plaza }) {
  const r = gastosQueDuelen(plaza.movimientos, plaza.params)
  if (!r.length) return null
  return (
    <div data-gastos-alerta style={{ ...caja, borderLeft: `4px solid ${AMBAR}` }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, color: TINTA }}>
        ⚠ Gastos que piden mirarse en {plaza.nombre}
      </h3>
      <div style={{ display: 'grid', gap: 6 }}>
        {r.slice(0, 20).map((m, i) => (
          <div key={m.id ?? `${m.f}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
            <span style={{ color: TINTA_SUAVE }}>
              {m.f} · {m.concepto || 'sin concepto'}
              {m.sinComprobante && <span style={{ color: AMBAR, fontWeight: 700 }}> · sin comprobante</span>}
              {m.pasaMaximo && <span style={{ color: ROSA, fontWeight: 700 }}> · pasa el máximo</span>}
            </span>
            <span style={{ color: TINTA, fontWeight: 700, whiteSpace: 'nowrap' }}>{pesos(m.monto)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
