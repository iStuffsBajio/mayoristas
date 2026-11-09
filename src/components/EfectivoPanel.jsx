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
  movimientosDeSemana, cortesQueFaltan, devolucionesDelDia, movimientosDelDia,
  periodoQueCubre, fechaDeDeposito, nombreDia, semanaDe, INICIO_HISTORIAL,
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

/** Un día suelto, corto: «2 de nov». */
function diaCorto(f) {
  const [y, m, d] = String(f).split('-').map(Number)
  const fecha = new Date(y, m - 1, d)
  return `${fecha.getDate()} de ${fecha.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`
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
  const { bloques, acumulado, params, enCaja, sinDatos, nombre, estacional, historico } = plaza
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
          {nombre}
          {estacional && <span style={{ fontSize: 10, fontWeight: 600, color: TINTA_TENUE }}> · por temporada</span>}
          {/* No está operando: lo que se ve es su histórico. Sin decirlo, sus
              semanas sin depositar se leen como dinero que alguien debe. */}
          {historico && <span style={{ fontSize: 10, fontWeight: 600, color: TINTA_TENUE }}> · sólo historial</span>}
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
  ['faltantes',       '· Faltantes registrados',          'nota',  'Salidas que alguien registró porque faltó dinero. Van aparte y NO restan del efectivo neto: si restaran, el depósito cuadraría al peso justo cuando falta dinero, y el único caso que esta pantalla existe para detectar sería el único invisible'],
]

/**
 * Qué renglones se pueden abrir para ver el detalle, y de dónde sale.
 *
 * Lo pidió el dueño el 2026-11-08: «en la sucursal de San Luis estuvo la
 * salida de efectivo de 750 del domingo, pero sólo veo la salida, no puedo
 * ver el concepto que pusieron».
 *
 * Las dos fuentes son distintas y conviene saberlo:
 *
 *   · Las SALIDAS y entradas ya traían su concepto en `movs`. Sólo faltaba
 *     enseñarlo: la tabla sumaba por tipo y tiraba el detalle.
 *   · Las DEVOLUCIONES no. El extractor las descartaba a propósito —ya vienen
 *     sumadas en el corte y traerlas otra vez las restaría dos veces— y con
 *     ellas se iba el concepto. Ahora se extraen aparte, sólo para enseñar.
 */
const CON_DETALLE = {
  devoluciones: 'devoluciones',
  gastos:       ['gasto'],
  retiros:      ['retiro'],
  adelantos:    ['adelanto'],
  proveedores:  ['proveedor'],
  otrasSalidas: ['otra-salida'],
  entradas:     ['entrada'],
}

/**
 * El detalle de un renglón, día a día.
 *
 * Se enseña la SEMANA entera y no sólo un día: el dueño mira la fila, ve una
 * cifra rara en una columna, y lo que quiere es el concepto. Obligarle a
 * acertar la celda exacta para verlo es pedirle puntería a cambio de nada.
 */
function DetalleDeLinea({ plaza, bloque, clave }) {
  const que = CON_DETALLE[clave]
  const filas = []

  for (const f of bloque.filas ?? []) {
    const items = que === 'devoluciones'
      ? devolucionesDelDia(plaza.devoluciones, f.f).map(d => ({
          hora: d.hora, concepto: d.concepto, monto: d.monto, origen: 'eleventa',
        }))
      : movimientosDelDia(bloque.filas, f.f, que).map(m => ({
          hora: null, concepto: m.concepto, monto: m.monto, origen: m.origen,
          comprobante: m.comprobante,
        }))
    for (const it of items) filas.push({ ...it, f: f.f, dia: f.dia })
  }

  if (!filas.length) {
    return (
      <tr data-detalle-vacio={clave}>
        <td colSpan={(bloque.filas?.length ?? 7) + 2}
            style={{ padding: '8px 14px', fontSize: 11.5, color: TINTA_TENUE,
                     background: 'rgba(16,22,25,0.015)' }}>
          {que === 'devoluciones'
            ? `Esta semana no hay ninguna devolución con detalle en ${plaza.nombre}. Si la
               cifra de arriba no es cero, es que el respaldo todavía no trae los conceptos:
               se extraen desde el 2026-11-08 y aparecen en la siguiente sincronización.`
            : 'Ningún movimiento de este tipo esta semana.'}
        </td>
      </tr>
    )
  }

  return (
    <tr data-detalle={clave}>
      <td colSpan={(bloque.filas?.length ?? 7) + 2}
          style={{ padding: '4px 14px 10px', background: 'rgba(16,22,25,0.015)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {filas.map((x, i) => (
              <tr key={`${x.f}-${i}`} data-detalle-fila={x.f}>
                <td style={{ padding: '4px 10px 4px 0', color: TINTA_TENUE, whiteSpace: 'nowrap' }}>
                  {x.dia} {String(x.f).slice(8, 10)}{x.hora ? ` · ${x.hora}` : ''}
                </td>
                {/* El concepto es lo único por lo que se abre esto. Cuando
                    viene vacío se DICE: un hueco se lee como que no cargó, y
                    lo que pasa es que en la caja nadie lo escribió. */}
                <td style={{ padding: '4px 10px 4px 0', color: TINTA }}>
                  {x.concepto || <span style={{ color: ROSA }}>sin concepto en la caja</span>}
                </td>
                <td style={{ padding: '4px 0', textAlign: 'right', whiteSpace: 'nowrap',
                             fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                  {pesos(x.monto)}
                </td>
                <td style={{ padding: '4px 0 4px 10px', textAlign: 'right', whiteSpace: 'nowrap',
                             fontSize: 10.5, color: TINTA_TENUE }}>
                  {x.origen === 'pagina' ? 'capturado aquí' : 'de Eleventa'}
                  {x.comprobante === false && ' · sin ticket'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {que === 'devoluciones' && (
          <p style={{ margin: '8px 0 0', fontSize: 10.5, color: TINTA_TENUE, lineHeight: 1.5 }}>
            La hora está para poder mirar el ticket de al lado. <strong>Eleventa no enlaza una
            devolución con la venta que la sustituyó</strong> —ese dato no existe en ninguna
            tabla— así que la página no puede decirlo sin inventárselo.
          </p>
        )}
      </td>
    </tr>
  )
}

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

/**
 * Los días sin corte, y los que simplemente no han llegado.
 *
 * Lo pidió el dueño el 2026-11-08: «el día 8 no está siendo considerado… que
 * si no detecta un día me arroje alguna alerta que falta el corte de un día».
 *
 * La pantalla pintaba los dos casos igual, con un guion, y son muy distintos:
 *
 *   · **Todavía no ha llegado.** Las tiendas suben su respaldo a partir de
 *     las 20:30, así que durante toda la jornada el día más fresco que puede
 *     existir es el de AYER. Un hueco hoy es lo normal.
 *   · **Faltó el corte.** El respaldo llegó, cubre ese día, y viene vacío. O
 *     nadie cerró turno, o se subió a medias: lo que se vendió ese día no
 *     está contado en ningún sitio.
 *
 * La frontera es **la fecha del respaldo**, no «hoy». Con «hoy» saltaría la
 * alerta cada tarde en las cinco plazas, y una alerta que sale siempre deja
 * de leerse.
 */
function CortesQueFaltan({ plaza, bloque }) {
  const r = cortesQueFaltan(bloque.filas ?? [], plaza.respaldo?.fecha ?? null)

  if (r.sinRespaldo) {
    return (
      <p data-sin-respaldo style={{ margin: '0 0 10px', fontSize: 11.5, color: AMBAR, lineHeight: 1.5 }}>
        ⚠ No se sabe de cuándo es el último respaldo de {plaza.nombre}, así que no se puede
        decir qué días deberían estar y cuáles no. Los huecos de abajo no significan nada
        todavía.
      </p>
    )
  }

  if (!r.faltan.length && !r.porLlegar.length) return null

  return (
    <div data-cortes style={{ margin: '0 0 10px', fontSize: 11.5, lineHeight: 1.55 }}>
      {r.faltan.length > 0 && (
        <p data-faltan-cortes style={{ margin: 0, color: ROSA, fontWeight: 700 }}>
          ⚠ Falta el corte de {r.faltan.length === 1 ? 'un día' : `${r.faltan.length} días`}:{' '}
          {r.faltan.map(x => `${x.dia} ${String(x.f).slice(8, 10)}`).join(', ')}.
          {' '}<span style={{ fontWeight: 400 }}>
            El respaldo del {plaza.respaldo.fecha} ya cubre {r.faltan.length === 1 ? 'ese día' : 'esos días'} y
            viene sin nada: o no se cerró turno, o el respaldo se subió a medias. Lo que se
            vendió no está contado en esta cuenta.
          </span>
        </p>
      )}
      {r.porLlegar.length > 0 && (
        <p data-por-llegar style={{ margin: r.faltan.length ? '4px 0 0' : 0, color: TINTA_TENUE }}>
          {r.porLlegar.map(x => `${x.dia} ${String(x.f).slice(8, 10)}`).join(', ')}{' '}
          {r.porLlegar.length === 1 ? 'todavía no llega' : 'todavía no llegan'}: el último respaldo es
          del {plaza.respaldo.fecha} y las tiendas lo suben a partir de las 20:30. No es un
          problema, es que el día aún no ha cerrado.
        </p>
      )}
    </div>
  )
}

/** La tabla diaria: las trece líneas del cálculo, por día y sumadas. */
function TablaDias({ plaza, bloque, cubre, onAjustar }) {
  const [ajustando, setAjustando] = useState(null)
  // Qué renglón está desplegado. Uno a la vez: con varios abiertos la tabla
  // deja de leerse de arriba abajo, que es para lo que existe.
  const [detalle, setDetalle] = useState(null)

  return (
    <div style={{ borderTop: '1px solid ' + LINEA, padding: '14px 18px', overflowX: 'auto' }}>
      {/* Este renglón hablaba del DEPÓSITO —qué semana cubre— pero estaba
          justo encima de la tabla diaria, así que se leía como si la tabla
          fuera de esas fechas. El dueño lo leyó así: «dice que cubre del 26
          de octubre al 1 de noviembre pero la tabla es del 2 al 8». Ahora se
          dice de quién habla. */}
      <p style={{ margin: '0 0 10px', fontSize: 11, color: TINTA_TENUE }}>
        El <strong>depósito</strong> de esta semana cubre la venta del {rangoCorto(cubre)}.
        {plaza.respaldo && ` La tabla de abajo son los días de esta semana, con el respaldo del ${plaza.respaldo.fecha}.`}
      </p>

      <CortesQueFaltan plaza={plaza} bloque={bloque} />

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
            // La línea de faltantes va por fuera del cálculo y tiene que
            // VERSE por fuera: puesta con el mismo color que las restas,
            // cualquiera la lee como una más y la suma con la vista.
            const esNota = clase === 'nota'
            return (
              <tr key={clave} data-linea={clave}
                style={{ background: esTotal ? 'rgba(16,22,25,0.025)' : undefined }}>
                {/* El NOMBRE abre el detalle; las celdas siguen abriendo el
                    ajuste, que es lo que hacían. Dos cosas distintas en el
                    mismo renglón, y cada una donde se espera. */}
                <td style={{ padding: '6px 8px', color: esTotal ? TINTA : esNota ? AMBAR : TINTA_SUAVE,
                  fontWeight: esTotal ? 800 : 500, whiteSpace: 'nowrap',
                  position: 'sticky', left: 0, background: esTotal ? '#F7F8F9' : '#fff' }}>
                  {CON_DETALLE[clave] ? (
                    <button type="button" data-ver-detalle={clave}
                            onClick={() => setDetalle(d => (d === clave ? null : clave))}
                            title="Ver el concepto de cada movimiento"
                            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit',
                                     color: 'inherit', cursor: 'pointer', textAlign: 'start' }}>
                      {titulo}
                      <span style={{ marginInlineStart: 5, fontSize: 9.5, color: TINTA_TENUE }}>
                        {detalle === clave ? '▲' : '▼'}
                      </span>
                    </button>
                  ) : titulo}
                  <DeDonde texto={deDonde} />
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
                        color: ajustado ? ROSA : !f.hayDato ? '#C9D5DA' : esTotal ? TINTA : esNota ? AMBAR : TINTA_SUAVE }}>
                      {ajustado && '✏️ '}
                      {f.hayDato || f[clave] ? pesos(f[clave]) : '—'}
                    </td>
                  )
                })}
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800,
                  color: esTotal ? TINTA : esNota ? AMBAR : TINTA_SUAVE, whiteSpace: 'nowrap' }}>
                  {pesos(bloque.total[clave])}
                </td>
              </tr>
            )
          }).flatMap((tr, i) => {
            const clave = LINEAS[i][0]
            return detalle === clave
              ? [tr, <DetalleDeLinea key={`${clave}-detalle`} plaza={plaza} bloque={bloque} clave={clave} />]
              : [tr]
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

      {/* Las salidas con su CONCEPTO, aquí dentro y no sólo en el tablero.
          El dueño las buscó en esta vista -«no sé dónde puedo ver las salidas
          de efectivo»- y es lo lógico: aquí es donde están los renglones de
          gastos, retiros y adelantos, pero sumados. Esto dice en qué se
          fueron. Va abierto por defecto: si hay salidas en la semana de una
          plaza concreta, es lo que se vino a ver. */}
      <SalidasDeLaSemana abiertoPorDefecto
        grupos={[{ slug: plaza.slug, nombre: plaza.nombre,
                   movs: movimientosDeSemana(bloque.filas ?? []) }]} />

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

// ── Los faltantes registrados ───────────────────────────────────────────────

/**
 * 🔒 Sólo lo que alguien registró a propósito.
 *
 * Hasta el 2026-11-06 esta sección enseñaba los descuadres que Eleventa
 * escribe sola al cerrar turno. El dueño los quitó porque no son precisos
 * —«ellos a la hora de cerrar no consideran que siempre tiene que coincidir
 * el monto»— y los números le dan la razón: $67,152 en diez meses, el 2.84%
 * de todo el efectivo cobrado y un 4.81% en San Luis. Eso no es dinero que
 * desaparece, es un cierre que nadie cuadra, y enseñarlo como faltante acusa
 * de un robo a quien sólo cerró deprisa.
 */
function Faltantes({ plazas }) {
  const anio = new Date().getFullYear()
  const porPlaza = plazas.map(p => ({
    ...p, r: faltantesDe(p.movimientos, { desde: `${anio}-01-01`, hasta: `${anio}-12-31` }),
  })).filter(p => p.r.veces > 0).sort((a, b) => b.r.total - a.r.total)

  const total = porPlaza.reduce((a, p) => a + p.r.total, 0)
  const efectivo = plazas.reduce((a, p) =>
    a + p.bloques.reduce((s, b) => s + b.total.efectivoCobrado, 0), 0)

  if (!porPlaza.length) return null

  return (
    <div data-faltantes style={{ ...caja, borderLeft: `4px solid ${ROSA}` }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 14.5, fontWeight: 800, color: TINTA }}>
        💸 Faltantes registrados · {anio}
      </h3>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: TINTA_SUAVE, lineHeight: 1.65 }}>
        Salidas de efectivo que alguien registró <strong>porque de verdad
        faltó dinero</strong>, en Eleventa o aquí. No entran los descuadres que
        el punto de venta escribe solo al cerrar turno: ésos no son precisos y
        se quitaron. <strong>No restan del efectivo neto</strong> —si restaran,
        el depósito cuadraría al peso justo cuando falta dinero—, así que
        aparecen aquí y, a la vez, como la diferencia del bloque de esa semana.
        Son <strong>{pesos(total)}</strong> en{' '}
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
              {p.r.lineas.slice(0, 20).map((x, i) => (
                <div key={x.id ?? `${x.f}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
                  <span style={{ color: TINTA_SUAVE }}>
                    {x.f} · {x.concepto || 'sin concepto'}
                    {(x.persona || x.quien) && <span style={{ color: TINTA_TENUE }}> · {x.persona || x.quien}</span>}
                  </span>
                  <span style={{ color: TINTA, fontWeight: 700, whiteSpace: 'nowrap' }}>{pesos(x.monto)}</span>
                </div>
              ))}
            </div>
            {/* Repetido por la misma persona es la alerta que pidió el dueño,
                y sólo se ve agrupando. Con uno solo no dice nada, así que no
                se dibuja. */}
            {p.r.porPersona.some(x => x.veces > 1) && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid ' + LINEA, display: 'grid', gap: 4 }}>
                {p.r.porPersona.filter(x => x.veces > 1).map(x => (
                  <div key={x.persona} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
                    <span style={{ color: TINTA_SUAVE }}>
                      {x.persona}<span style={{ color: ROSA, fontWeight: 700 }}> · {x.veces} veces</span>
                    </span>
                    <span style={{ color: TINTA, fontWeight: 700 }}>{pesos(x.monto)}</span>
                  </div>
                ))}
              </div>
            )}
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
  // Las plazas que sólo son histórico no entran aquí. Esto es la lista de lo
  // que hay que ir a depositar, y una tienda que no está operando no debe
  // nada: dejarla dentro manda a perseguir un depósito que no existe.
  const vivas = plazas.filter(p => !p.historico)

  const total = vivas.reduce((a, p) => a + p.acumulado.total, 0)
  const semanas = vivas.reduce((a, p) => a + p.acumulado.semanas, 0)
  const techo = vivas.some(p => p.acumulado.techo)
  const conPendiente = vivas.filter(p => p.acumulado.semanas > 0)

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
      {/* Sin decir desde cuándo cuenta, una cifra pequeña se lee como que las
          plazas casi no venden, y una grande como una deuda vieja. Decirlo
          cuesta un renglón. */}
      <p style={{ margin: '6px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
        Cuenta desde el {diaCorto(INICIO_HISTORIAL)}: lo de antes ya se
        depositó en su momento y no es un pendiente, aunque siga entero en el
        archivo de la plaza.
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
              {/* Sólo la semana pasada y ésta, que es lo que pidió el dueño.
                  Las demás se siguen calculando y siguen contando en «lo que
                  falta por depositar»: lo que cambia es que no se dibujan. */}
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
          {plazas.every(p => faltantesDe(p.movimientos).veces === 0) && (
            <div style={caja}>
              <p style={{ margin: 0, fontSize: 13, color: TINTA_SUAVE, lineHeight: 1.7 }}>
                Ninguna plaza ha registrado una salida de efectivo por faltante.
                Los descuadres que el punto de venta escribe solo al cerrar turno
                ya no cuentan aquí: no son precisos, y acusaban de un faltante a
                quien sólo cerró deprisa.
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

/**
 * La semana en curso: el efectivo neto día a día, y al lado la venta entera.
 *
 * Las cuatro columnas de la derecha las pidió el dueño el 2026-11-06: «me
 * gustaría visualizar las ventas totales en general, el desglose de cada
 * sucursal… a un costadito pagos con tarjeta, transferencia o todo lo demás, y
 * a un ladito total ventas de la sucursal».
 *
 * Las dos cifras gordas de cada renglón miden cosas distintas y por eso no
 * suman entre sí: **efectivo neto** es lo que debe quedar en el cajón —lo
 * cobrado en efectivo menos devoluciones y salidas— y **venta total** es todo
 * lo que se vendió, se cobrara como se cobrara. Van separadas por una línea
 * para que nadie intente cuadrar la una con la otra.
 */
const NOMBRE_SALIDA = {
  gasto:         'Gasto',
  retiro:        'Retiro',
  adelanto:      'Adelanto',
  proveedor:     'Proveedor',
  'otra-salida': 'Otra salida',
  entrada:       'Entrada',
}

/**
 * Las salidas de una semana, con su concepto.
 *
 * Lo pidió el dueño el 2026-11-08: «si hubo salidas, que me aparezcan en un
 * menú desplegable o algo parecido… no sé exactamente dónde pueda ver la
 * descripción de salidas que se han registrado».
 *
 * La tabla de arriba contesta CUÁNTO salió. Ésta contesta EN QUÉ se fue, que
 * es la pregunta que de verdad se hace quien mira el cajón: un total de
 * salidas sin conceptos no se puede revisar ni discutir con nadie.
 *
 * Va plegada porque la mayoría de las semanas no tiene ninguna, y un bloque
 * vacío desplegado todos los días enseña a no mirarlo.
 *
 * Los FALTANTES no salen aquí: no restan del neto y llevan el nombre de
 * quien cerró el turno pegado a una cantidad de dinero que falta. Tienen su
 * propia sección y su propia regla.
 */
function SalidasDeLaSemana({ grupos, abiertoPorDefecto = false }) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto)

  const porPlaza = (grupos ?? []).filter(x => x.movs.length)

  const cuantas = porPlaza.reduce((a, x) => a + x.movs.length, 0)
  const total = porPlaza.reduce((a, x) => a + x.movs
    .reduce((b, m) => b + (m.tipo === 'entrada' ? 0 : Number(m.monto) || 0), 0), 0)

  if (!cuantas) {
    return (
      <p data-sin-salidas style={{ margin: '12px 0 0', fontSize: 11.5, color: TINTA_TENUE }}>
        Esta semana no hay ninguna salida de caja registrada en ninguna plaza.
      </p>
    )
  }

  return (
    <div data-salidas-semana style={{ marginTop: 14, borderTop: '1px solid ' + LINEA, paddingTop: 12 }}>
      <button type="button" onClick={() => setAbierto(v => !v)} data-abrir-salidas
              style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap',
                       width: '100%', background: 'none', border: 'none', padding: 0,
                       cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: TINTA }}>
          Salidas de caja de esta semana
        </span>
        <span style={{ fontSize: 12, color: TINTA_SUAVE }}>
          {cuantas} {cuantas === 1 ? 'movimiento' : 'movimientos'} · {pesos(total)} en{' '}
          {porPlaza.length === 1 ? '1 plaza' : `${porPlaza.length} plazas`}
        </span>
        <span style={{ marginInlineStart: 'auto', fontSize: 11, color: TINTA_TENUE }}>
          {abierto ? 'Ocultar ▲' : 'Ver el detalle ▼'}
        </span>
      </button>

      {abierto && porPlaza.map(({ slug, nombre, movs }) => (
        <div key={slug} data-salidas-de={slug} style={{ marginTop: 12 }}>
          {/* Con una sola plaza el título sobra: ya se sabe de quién es. */}
          {porPlaza.length > 1 && (
            <p style={{ margin: '0 0 5px', fontSize: 11.5, fontWeight: 800, color: TINTA }}>
              {nombre}
            </p>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {movs.map(m => (
                <tr key={m.id ?? `${m.f}-${m.concepto}-${m.monto}`}
                    data-salida={m.id ?? m.f}
                    style={{ borderTop: '1px solid ' + LINEA }}>
                  <td style={{ padding: '5px 8px 5px 0', color: TINTA_TENUE, whiteSpace: 'nowrap' }}>
                    {m.dia} {String(m.f).slice(8, 10)}
                  </td>
                  <td style={{ padding: '5px 8px 5px 0', color: TINTA_SUAVE, whiteSpace: 'nowrap' }}>
                    {NOMBRE_SALIDA[m.tipo] ?? m.tipo}
                  </td>
                  {/* El concepto es lo que teclea quien cobra, y es la única
                      columna por la que esta tabla existe. Cuando viene
                      vacío se DICE: un renglón en blanco se lee como que no
                      se cargó, y es que nadie lo escribió. */}
                  <td style={{ padding: '5px 8px 5px 0', color: TINTA }}>
                    {m.concepto || <span style={{ color: ROSA }}>sin concepto</span>}
                  </td>
                  <td style={{ padding: '5px 0', textAlign: 'right', whiteSpace: 'nowrap',
                               fontVariantNumeric: 'tabular-nums', fontWeight: 700,
                               color: m.tipo === 'entrada' ? VERDE : TINTA }}>
                    {m.tipo === 'entrada' ? '+' : '−'}{pesos(Math.abs(Number(m.monto) || 0))}
                  </td>
                  <td style={{ padding: '5px 0 5px 10px', textAlign: 'right', whiteSpace: 'nowrap',
                               fontSize: 10.5, color: TINTA_TENUE }}>
                    {m.comprobante ? 'con ticket' : 'sin ticket'}
                    {m.origen === 'pagina' && ' · capturado aquí'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function Calendario({ plazas }) {
  const conDatos = plazas.filter(p => !p.sinDatos)

  // Qué semana se está mirando: 0 es la en curso, 1 la anterior…
  //
  // Lo pidió el dueño: «quiero que me aparezcan botones de la semana para
  // elegir». Antes esta tabla enseñaba `bloques[0]` y punto, así que el
  // domingo por la tarde —con la semana recién cerrada— no había forma de
  // volver a mirarla desde aquí.
  const [indice, setIndice] = useState(0)

  if (!conDatos.length) return null

  // Para MIRAR ATRAS se usan `todos` -las ocho que se calculan- y no
  // `bloques` -las dos que se trabajan-, y la diferencia no es un descuido.
  //
  // El dueño bajo la lista de trabajo de ocho a dos el 2026-11-06, con esta
  // razon: «ocho semanas a la vista eran dos meses de renglones para revisar
  // un corte de ayer». Eso sigue valiendo: la lista con los botones de
  // «marcar como depositado» es para HACER, y larga estorba.
  //
  // Pero el 2026-11-08 pidio poder elegir la semana en el calendario, que es
  // otra cosa: ahi no se hace nada, se MIRA. Subir la lista de trabajo para
  // poder consultar habria vuelto a romper justo lo que el arreglo.
  const semanas = conDatos[0].todos ?? conDatos[0].bloques ?? []
  const semana = semanas[indice] ?? semanas[0]
  if (!semana) return null

  // Las cuatro de la derecha, en orden. `ventaTotal` cierra porque es la suma
  // de las otras tres más el efectivo cobrado, y eso se lee de izquierda a
  // derecha sin explicarlo.
  const PAGOS = [
    ['tarjeta',         'Tarjeta'],
    ['transferencia',   'Transfer.'],
    ['otrasNoEfectivo', 'Otros'],
    ['ventaTotal',      'Venta total'],
  ]

  const suma = k => conDatos.reduce((a, p) => a + (p.bloques[indice]?.total?.[k] ?? 0), 0)
  const sumaDia = i => conDatos.reduce((a, p) => {
    const f = p.bloques[indice]?.filas?.[i]
    return a + (f?.hayDato ? f.neto : 0)
  }, 0)
  const hayDia = i => conDatos.some(p => p.bloques[indice]?.filas?.[i]?.hayDato)

  const th = extra => ({
    textAlign: 'right', padding: '6px 8px', fontSize: 10, fontWeight: 700, color: TINTA_TENUE,
    textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid ' + LINEA,
    whiteSpace: 'nowrap', ...extra,
  })
  // El borde a la izquierda separa el efectivo de la venta: son dos cuentas
  // distintas y pegadas se leen como una sola fila de números que suma.
  const corte = { borderLeft: '1px solid ' + LINEA }

  return (
    <div data-calendario style={{ ...caja, overflowX: 'auto' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 14.5, fontWeight: 800, color: TINTA }}>
        📅 {indice === 0 ? 'La semana en curso' : 'Una semana anterior'}, plaza por plaza
      </h3>

      {semanas.length > 1 && (
        <div data-semanas style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 10px' }}>
          {semanas.map((b, i) => (
            <button key={b.clave} type="button" onClick={() => setIndice(i)}
                    data-semana={b.clave}
                    className={i === indice ? 'chip-plaza activa' : 'chip-plaza'}
                    style={{ fontSize: 11, padding: '4px 11px' }}>
              {i === 0 ? 'En curso' : rangoCorto(b)}
              {/* Una semana ya depositada se marca: es la diferencia entre
                  «falta por revisar» y «esto ya se cerró». */}
              {b.depositado && <span style={{ marginInlineStart: 5, color: VERDE }}>✓</span>}
            </button>
          ))}
        </div>
      )}
      <p style={{ margin: '0 0 14px', fontSize: 11.5, color: TINTA_TENUE, lineHeight: 1.6 }}>
        {rangoCorto(semana)} · el día de depósito de cada plaza va marcado con ▲.
        Los siete días y «efectivo neto» son lo que debe quedar en el cajón;
        de la línea a la derecha, lo que se vendió cobrara como se cobrara.
      </p>
      <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={th({ textAlign: 'left', position: 'sticky', left: 0, background: '#fff' })}>Plaza</th>
            {DIAS.map(d => <th key={d} style={th()}>{d.slice(0, 3)}</th>)}
            <th style={th({ fontWeight: 800, color: TINTA })}>Efectivo neto</th>
            {PAGOS.map(([k, t], i) => (
              <th key={k} style={th({ ...(i === 0 ? corte : null), ...(k === 'ventaTotal' ? { fontWeight: 800, color: TINTA } : null) })}>{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {conDatos.map(p => {
            const b = p.bloques[0]
            return (
              <tr key={p.slug} data-plaza-calendario={p.slug}>
                <td style={{ padding: '7px 8px', color: TINTA, fontWeight: 600, whiteSpace: 'nowrap',
                  position: 'sticky', left: 0, background: '#fff' }}>{p.nombre}</td>
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
                {PAGOS.map(([k], i) => (
                  <td key={k} style={{ padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap',
                    ...(i === 0 ? corte : null),
                    fontWeight: k === 'ventaTotal' ? 800 : 500,
                    color: k === 'ventaTotal' ? TINTA : b.total[k] ? TINTA_SUAVE : '#C9D5DA' }}>
                    {pesosCortos(b.total[k])}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
        {/* Las ventas totales en general, que es lo que se pidió ver además
            del desglose. Con una sola plaza la fila repetiría el renglón de
            arriba, así que no se dibuja. */}
        {conDatos.length > 1 && (
          <tfoot>
            <tr data-calendario-total style={{ background: 'rgba(16,22,25,0.025)' }}>
              <td style={{ padding: '9px 8px', color: TINTA, fontWeight: 800, whiteSpace: 'nowrap',
                borderTop: '2px solid ' + LINEA, position: 'sticky', left: 0, background: '#F7F8F9' }}>
                Las {conDatos.length} plazas
              </td>
              {DIAS.map((d, i) => (
                <td key={d} style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap',
                  borderTop: '2px solid ' + LINEA, color: hayDia(i) ? TINTA_SUAVE : '#C9D5DA' }}>
                  {hayDia(i) ? pesosCortos(sumaDia(i)) : '—'}
                </td>
              ))}
              <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 800, color: TINTA,
                whiteSpace: 'nowrap', borderTop: '2px solid ' + LINEA }}>
                {pesosCortos(suma('neto'))}
              </td>
              {PAGOS.map(([k], i) => (
                <td key={k} style={{ padding: '9px 8px', textAlign: 'right', whiteSpace: 'nowrap',
                  borderTop: '2px solid ' + LINEA, ...(i === 0 ? corte : null),
                  fontWeight: 800, color: TINTA }}>
                  {pesosCortos(suma(k))}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>

      {/* El detalle de las salidas va DEBAJO de la tabla y plegado: la tabla
          dice cuánto salió, esto dice en qué se fue. Son dos preguntas y la
          segunda sólo se hace cuando la primera sorprende. */}
      <SalidasDeLaSemana grupos={conDatos.map(p => ({
        slug: p.slug, nombre: p.nombre,
        movs: movimientosDeSemana(p.bloques?.[indice]?.filas ?? []),
      }))} />
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
